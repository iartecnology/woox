import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogService, Category, Product } from '../catalog.service';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';

@Component({
    selector: 'app-product-management',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './product-management.component.html',
    styleUrl: './product-management.component.css'
})
export class ProductManagementComponent implements OnInit {
    private catalogService = inject(CatalogService);
    private supabaseService = inject(SupabaseService);
    private route = inject(ActivatedRoute);
    private notificationService = inject(NotificationService);
    private cdr = inject(ChangeDetectorRef);

    merchantId: string = '';
    selectedCategoryId: string = '';
    showProductModal: boolean = false;
    showCategoryModal: boolean = false;
    showDeleteConfirm: boolean = false;
    productToDeleteId: string | null = null;
    isLoading: boolean = true;

    filteredCategories: Category[] = [];
    products: Product[] = [];

    newProduct: Partial<Product> = {
        name: '',
        description: '',
        price: 0,
        category_id: '',
        is_available: true,
        image_url: ''
    };

    newCategoryName: string = '';

    async ngOnInit() {
        this.route.queryParams.subscribe(async params => {
            const rawId = params['merchantId'] || localStorage.getItem('active_merchant_id') || '';

            // Validar que el ID sea un UUID real para evitar errores de Postgres
            if (this.supabaseService.isValidUUID(rawId)) {
                this.merchantId = rawId;
            } else {
                console.warn('[ProductMgmt] ID de comercio detectado no es UUID válido:', rawId);
                this.merchantId = '';
                // Opcional: Limpiar el localStorage si estaba corrupto
                if (rawId) localStorage.removeItem('active_merchant_id');
            }

            await this.loadData();
        });
    }

    async loadData() {
        if (!this.merchantId) {
            console.warn('[ProductMgmt] No merchantId found');
            this.isLoading = false;
            return;
        }

        this.isLoading = true;
        console.log('[ProductMgmt] Loading data for merchant:', this.merchantId);

        try {
            // Cargar datos en paralelo
            const [categories, products] = await Promise.all([
                this.catalogService.getCategoriesFromServer(this.merchantId),
                this.catalogService.getProductsFromServer(this.merchantId)
            ]);

            this.filteredCategories = categories;
            this.products = products;

            console.log(`[ProductMgmt] Success: ${categories.length} categories and ${products.length} products loaded.`);

            // Validar o resetar la categoría seleccionada
            const categoryExists = this.filteredCategories.some(c => c.id === this.selectedCategoryId);
            if (this.selectedCategoryId && !categoryExists) {
                console.log('[ProductMgmt] Category no longer exists, resetting filter.');
                this.selectedCategoryId = '';
            }

            this.newProduct.category_id = this.selectedCategoryId || (this.filteredCategories.length > 0 ? this.filteredCategories[0].id : '');
            this.newProduct.merchant_id = this.merchantId;

        } catch (error: any) {
            console.error('[ProductMgmt] ERROR FATAL al cargar catálogo:', error);
            this.notificationService.show(
                `Error al cargar el catálogo: ${error.message || 'Error técnico'}.`,
                'error'
            );
        } finally {
            console.log(`[ProductMgmt] Finalizando carga. Categorías: ${this.filteredCategories.length}, Productos: ${this.products.length}`);
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    get filteredProducts() {
        if (!this.selectedCategoryId) return this.products;
        return this.products.filter(p => p.category_id === this.selectedCategoryId);
    }

    selectCategory(id: string) {
        this.selectedCategoryId = id;
        this.newProduct.category_id = id;
    }

    openProductModal(product?: Product) {
        if (product) {
            this.newProduct = { ...product };
        } else {
            this.newProduct = {
                name: '',
                description: '',
                price: 0,
                merchant_id: this.merchantId,
                category_id: this.selectedCategoryId,
                is_available: true,
                image_url: ''
            };
        }
        this.showProductModal = true;
    }

    async saveProduct() {
        if (!this.newProduct.name || !this.newProduct.price) {
            this.notificationService.show('Nombre y precio son obligatorios', 'error');
            return;
        }

        try {
            // Clonar y limpiar datos para evitar enviar columnas relacionales (como 'categories')
            const { categories, ...cleanProduct } = this.newProduct as any;

            const productData = {
                ...cleanProduct,
                merchant_id: this.merchantId,
                category_id: this.selectedCategoryId // Asegurar que tenga la categoría actual
            };

            console.log('Guardando producto:', productData);
            const { error } = await this.supabaseService.saveProduct(productData);

            if (error) throw error;

            this.notificationService.show('Producto guardado correctamente', 'success');
            this.showProductModal = false;
            await this.loadData();
        } catch (error: any) {
            console.error('Error saving product:', error);
            this.notificationService.show('Error al guardar: ' + (error.message || 'Error desconocido'), 'error');
        }
    }

    requestDeleteProduct(id: string) {
        this.productToDeleteId = id;
        this.showDeleteConfirm = true;
    }

    async confirmDeleteProduct() {
        if (!this.productToDeleteId) return;
        await this.supabaseService.deleteProduct(this.productToDeleteId);
        this.notificationService.show('Producto eliminado', 'warning');
        this.showDeleteConfirm = false;
        this.productToDeleteId = null;
        await this.loadData();
    }

    cancelDeleteProduct() {
        this.showDeleteConfirm = false;
        this.productToDeleteId = null;
    }

    openCategoryModal() {
        this.newCategoryName = '';
        this.showCategoryModal = true;
    }

    async saveCategory() {
        if (!this.newCategoryName.trim()) {
            this.notificationService.show('El nombre de la categoría es obligatorio', 'error');
            return;
        }

        try {
            const { error } = await this.supabaseService.saveCategory({
                merchant_id: this.merchantId,
                name: this.newCategoryName.trim()
            });

            if (error) throw error;

            this.notificationService.show('Categoría creada correctamente', 'success');
            this.showCategoryModal = false;
            await this.loadData();
        } catch (error: any) {
            console.error('Error saving category:', error);
            this.notificationService.show('Error al crear categoría', 'error');
        }
    }
}
