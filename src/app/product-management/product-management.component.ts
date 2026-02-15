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
            this.merchantId = params['merchantId'] || localStorage.getItem('active_merchant_id') || '';
            await this.loadData();
        });
    }

    async loadData() {
        if (!this.merchantId) {
            console.log('No merchantId found');
            return;
        }

        console.log('Loading data for merchant:', this.merchantId);
        this.filteredCategories = await this.catalogService.getCategoriesFromServer(this.merchantId);
        this.products = await this.catalogService.getProductsFromServer(this.merchantId);

        console.log('Categories loaded:', this.filteredCategories);
        console.log('Products loaded:', this.products);

        if (this.filteredCategories.length > 0 && !this.selectedCategoryId) {
            this.selectedCategoryId = this.filteredCategories[0].id;
        }
        this.newProduct.category_id = this.selectedCategoryId;
        this.newProduct.merchant_id = this.merchantId;

        this.isLoading = false;
        this.cdr.detectChanges(); // Forzar actualización de la vista
    }

    get filteredProducts() {
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

    async deleteProduct(id: string) {
        if (confirm('¿Estás seguro de eliminar este producto?')) {
            await this.supabaseService.deleteProduct(id);
            await this.loadData();
        }
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
