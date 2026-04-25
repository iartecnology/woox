import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogService, Category, Product } from '../catalog.service';
import { SupabaseService } from '../supabase.service';
import { NotificationService } from '../notification.service';
import { MobileService } from '../mobile.service';
import * as XLSX from 'xlsx';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';


@Component({
    selector: 'app-product-management',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, DragDropModule],
    templateUrl: './product-management.component.html',
    styleUrl: './product-management.component.css'
})
export class ProductManagementComponent implements OnInit {
    private catalogService = inject(CatalogService);
    public mobileService = inject(MobileService);
    private supabaseService = inject(SupabaseService);
    private route = inject(ActivatedRoute);
    private notificationService = inject(NotificationService);
    private cdr = inject(ChangeDetectorRef);

    merchantId: string = '';
    selectedCategoryId: string = '';
    showProductModal: boolean = false;
    showCategoryModal: boolean = false;
    showDeleteConfirm: boolean = false;
    showDeleteCategoryConfirm: boolean = false;
    productToDeleteId: string | null = null;
    categoryToDelete: Category | null = null;
    isLoading: boolean = true;
    searchTerm: string = '';

    filteredCategories: Category[] = [];
    products: Product[] = [];
    selectedProductIds: Set<string> = new Set<string>();
    isDraggingCategory: boolean = false;
    draggedCategoryId: string | null = null;
    activeDropTargetId: string | null = null;
    isDraggingProducts: boolean = false;
 
    // Sidebar Resizing
    sidebarWidth: number = 320;
    isResizing: boolean = false;
    private startX: number = 0;
    private startWidth: number = 0;

    newProduct: Partial<Product> = {
        name: '',
        description: '',
        price: 0,
        category_id: '',
        is_available: true,
        image_url: ''
    };

    newCategoryName: string = '';
    newCategoryParentId: string = '';
    editingCategory: Category | null = null;
    isSyncing: boolean = false;

    async ngOnInit() {
        this.mobileService.setHeader('Catálogo', false);
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
            // Cargar categorías y productos de forma independiente
            // para que un fallo en categorías no bloquee los productos
            const [catResult, prodResult] = await Promise.allSettled([
                this.catalogService.getCategoriesFromServer(this.merchantId),
                this.catalogService.getProductsFromServer(this.merchantId)
            ]);

            if (catResult.status === 'fulfilled') {
                this.filteredCategories = catResult.value;
            } else {
                console.error('[ProductMgmt] Error cargando categorías:', catResult.reason);
            }

            if (prodResult.status === 'fulfilled') {
                this.products = prodResult.value;
            } else {
                console.error('[ProductMgmt] Error cargando productos:', prodResult.reason);
            }

            console.log(`[ProductMgmt] Success: ${this.filteredCategories.length} categories and ${this.products.length} products loaded.`);

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

    get selectedCategoryName() {
        if (!this.selectedCategoryId) return 'Todos los Productos';
        const cat = this.filteredCategories.find(c => c.id === this.selectedCategoryId);
        return cat ? cat.name : 'Todos los Productos';
    }

    // La lista PLANA ordenada para el drag & drop
    // Los padres siempre van primero, luego sus hijos inmediatamente después.
    get displayCategories() {
        // Respetamos sort_order de la BD, fallback a nombre
        const sorted = [...this.filteredCategories].sort((a, b) => {
            const orderA = a.sort_order ?? 9999;
            const orderB = b.sort_order ?? 9999;
            return orderA !== orderB ? orderA - orderB : a.name.localeCompare(b.name);
        });

        const parents = sorted.filter(c => !c.parent_id);
        const children = sorted.filter(c => c.parent_id);

        const result: Category[] = [];
        for (const p of parents) {
            result.push(p);
            result.push(...children.filter(c => c.parent_id === p.id));
        }
        // Hijos sin padre visible
        const missingParents = children.filter(c => !parents.some(p => p.id === c.parent_id));
        result.push(...missingParents);
        return result;
    }

    async onCategoryDrop(event: CdkDragDrop<Category[]>) {
        const list = [...this.displayCategories];
        const draggedItem = list[event.previousIndex];
        
        // 1. Determinar si se soltó SOBRE una categoría específica
        let newParentId = draggedItem.parent_id;
        let parentChanged = false;

        // activeDropTargetId se actualiza mediante (mouseenter) en el HTML
        if (this.activeDropTargetId !== null && this.activeDropTargetId !== draggedItem.id) {
            // Si es '', significa que se soltó sobre "Todas las Categorías" (raíz)
            newParentId = this.activeDropTargetId === '' ? null : this.activeDropTargetId;
            parentChanged = draggedItem.parent_id !== newParentId;
            
            // Si cambió el padre, no necesitamos reordenar el array local ya que loadData lo hará
        } else {
            // 2. Si no hay objetivo, es un reordenamiento normal en la misma lista
            if (event.previousIndex === event.currentIndex) return;
            moveItemInArray(list, event.previousIndex, event.currentIndex);
        }

        // 3. Persistir en la base de datos
        try {
            if (parentChanged) {
                await this.supabaseService.updateCategory(draggedItem.id, { parent_id: newParentId });
                this.notificationService.show('Categoría organizada correctamente', 'success');
            }

            // Actualizar sort_order basado en el orden actual de la lista
            const updates = list.map((cat, index) => ({ id: cat.id, sort_order: index }));
            await this.supabaseService.updateCategoriesOrder(updates);
            
            await this.loadData();
        } catch (err: any) {
            console.error('Error organizando categorías:', err);
            this.notificationService.show('Error al organizar categorías', 'error');
        } finally {
            this.activeDropTargetId = null;
            this.cdr.detectChanges();
        }
    }

    get filteredProducts() {
        let list = this.products;
        if (this.selectedCategoryId) {
            list = list.filter(p => p.category_id === this.selectedCategoryId);
        }
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            list = list.filter(p => 
                p.name.toLowerCase().includes(term) || 
                p.description?.toLowerCase().includes(term)
            );
        }
        return list;
    }

    selectCategory(id: string) {
        this.selectedCategoryId = id;
        this.newProduct.category_id = id;
        this.clearSelection();
    }

    getProductImageStyle(product: Product): string {
        const cat = this.filteredCategories.find(c => c.id === product.category_id);
        const catColors: Record<string, string> = {
            'bebida': '0ea5e9', 'cerveza': 'f59e0b', 'coctel': 'a855f7',
            'hamburgues': 'ef4444', 'pizza': 'f97316', 'pasta': 'eab308',
            'postre': 'ec4899', 'cafe': '92400e', 'sandwich': '84cc16',
            'ensalada': '22c55e', 'sopa': 'f59e0b', 'pollo': 'f97316',
            'carne': 'ef4444', 'marisco': '06b6d4', 'entrada': '8b5cf6',
        };
        const catKey = (cat?.name || '').toLowerCase();
        const bgColor = Object.entries(catColors).find(([k]) => catKey.includes(k))?.[1] || '6366f1';
        const displayName = encodeURIComponent((product.name || '').substring(0, 30));

        const hasImage = product.image_url && product.image_url.trim() !== '';
        const url = hasImage
            ? product.image_url
            : `https://placehold.co/500x500/${bgColor}/ffffff?text=${displayName}&font=inter`;

        return `background-image: url('${url}'); background-size: cover; background-position: center;`;
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

    async uploadProductImage(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.merchantId) {
            this.notificationService.show('Error: No se encontró ID de comercio.', 'error');
            return;
        }

        this.isLoading = true;
        try {
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const fullPath = `${this.merchantId}/productos/${fileName}`;
            const { data, error } = await this.supabaseService.uploadFile('merchant-data', fullPath, file);
            
            if (error) throw error;

            if (data) {
                this.newProduct.image_url = data.publicUrl;
                this.notificationService.show('Imagen de producto subida.', 'success');
                this.cdr.detectChanges();
            }
        } catch (err: any) {
            console.error('Error uploading product image:', err);
            this.notificationService.show('Error al subir imagen: ' + err.message, 'error');
        } finally {
            this.isLoading = false;
        }
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

    async toggleAvailability(product: Product) {
        try {
            const newStatus = !product.is_available;
            const { error } = await this.supabaseService.updateProduct(product.id, { is_available: newStatus });
            if (error) throw error;
            product.is_available = newStatus;
            this.notificationService.show(`Producto ${newStatus ? 'disponible' : 'agotado'}`, 'success');
        } catch (error: any) {
            console.error('Error toggling availability:', error);
            this.notificationService.show('Error al actualizar disponibilidad', 'error');
        }
    }

    async syncWooCommerce() {
        if (!this.merchantId) return;
        this.isSyncing = true;
        this.notificationService.show('Sincronizando con WooCommerce...', 'info');

        try {
            const { data, error } = await this.supabaseService.rpc('invoke_edge_function', {
                function_name: 'sync-woocommerce',
                payload: { merchant_id: this.merchantId }
            });

            // Si el RPC no está disponible, usamos el invoke directo si existe en supabase-js
            // Pero como estamos en el front, usualmente usamos el cliente de supabase inyectado
            const { data: res, error: resErr } = await (this.supabaseService as any).supabase.functions.invoke('sync-woocommerce', {
                body: { merchant_id: this.merchantId }
            });

            if (resErr) throw resErr;

            this.notificationService.show(res?.message || 'Sincronización exitosa', 'success');
            await this.loadData();
        } catch (error: any) {
            console.error('Error syncing WooCommerce:', error);
            this.notificationService.show('Error en la sincronización: ' + (error.message || 'Error técnico'), 'error');
        } finally {
            this.isSyncing = false;
        }
    }

    cancelDeleteProduct() {
        this.showDeleteConfirm = false;
        this.productToDeleteId = null;
    }

    openCategoryModal(cat?: Category) {
        if (cat) {
            this.editingCategory = { ...cat };
            this.newCategoryName = cat.name;
            this.newCategoryParentId = cat.parent_id || '';
        } else {
            this.editingCategory = null;
            this.newCategoryName = '';
            this.newCategoryParentId = '';
        }
        this.showCategoryModal = true;
    }

    async saveCategory() {
        if (!this.newCategoryName.trim()) {
            this.notificationService.show('El nombre de la categoría es obligatorio', 'error');
            return;
        }

        try {
            const categoryData = {
                merchant_id: this.merchantId,
                name: this.newCategoryName.trim(),
                parent_id: this.newCategoryParentId || null
            };

            let error;
            if (this.editingCategory) {
                const result = await this.supabaseService.updateCategory(this.editingCategory.id, categoryData);
                error = result.error;
            } else {
                const result = await this.supabaseService.saveCategory(categoryData);
                error = result.error;
            }

            if (error) throw error;

            this.notificationService.show(
                this.editingCategory ? 'Categoría actualizada' : 'Categoría creada correctamente', 
                'success'
            );
            this.showCategoryModal = false;
            this.editingCategory = null;
            await this.loadData();
        } catch (error: any) {
            console.error('Error saving category:', error);
            this.notificationService.show('Error al guardar categoría', 'error');
        }
    }

    requestDeleteCategory(cat: Category, event: Event) {
        event.stopPropagation();
        this.categoryToDelete = cat;
        this.showDeleteCategoryConfirm = true;
    }

    cancelDeleteCategory() {
        this.showDeleteCategoryConfirm = false;
        this.categoryToDelete = null;
    }

    async confirmDeleteCategory() {
        if (!this.categoryToDelete) return;
        
        try {
            const { error } = await this.supabaseService.deleteCategory(this.categoryToDelete.id);
            if (error) throw error;

            this.notificationService.show('Categoría eliminada', 'warning');
            if (this.selectedCategoryId === this.categoryToDelete.id) {
                this.selectedCategoryId = '';
            }
            await this.loadData();
        } catch (error: any) {
            console.error('Error deleting category:', error);
            this.notificationService.show('Error al eliminar categoría. Asegúrate de que no tenga productos asociados.', 'error');
        } finally {
            this.showDeleteCategoryConfirm = false;
            this.categoryToDelete = null;
        }
    }

    async onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e: any) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) {
                    this.notificationService.show('El archivo está vacío o tiene un formato incorrecto', 'error');
                    return;
                }

                this.isLoading = true;
                this.cdr.detectChanges();

                let importedCount = 0;
                for (const row of jsonData as any[]) {
                    // Mapeo flexible de columnas
                    const name = row.Nombre || row.nombre || row.Name || row.name;
                    const price = row.Precio || row.precio || row.Price || row.price;
                    const desc = row.Descripcion || row.descripcion || row.Description || row.description || '';
                    const categoria = row.Categoria || row.categoria || row.Category || row.category || '';
                    const categoriaPadre = row['Categoria Padre'] || row['categoria padre'] || row['Parent Category'] || '';

                    const imageUrlRaw = row.Imagen || row.imagen || row.Image || row.image || row.image_url || '';
                    let imageUrl = String(imageUrlRaw).trim();

                    if (!imageUrl && name) {
                        // Construir búsqueda combinando: nombre + categoría + palabras de descripción
                        const catName = String(categoria || categoriaPadre || '').trim();
                        const descWords = String(desc || '').trim().split(' ').slice(0, 3).join(' ');
                        const namePart = String(name).trim();

                        // Combinar palabras clave únicas, filtrar palabras cortas (artículos, preposiciones)
                        const rawKeywords = `${namePart} ${catName} ${descWords}`;
                        const keywords = [...new Set(
                            rawKeywords.toLowerCase()
                                .replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9 ]/g, ' ')
                                .split(' ')
                                .filter(w => w.length > 2)
                        )].slice(0, 4).join(',');

                        // Usar placehold.co — siempre funciona, muestra el nombre del producto
                        // y un color basado en la categoría para distinguirlos visualmente.
                        const catColors: Record<string, string> = {
                            'bebida': '0ea5e9', 'cerveza': 'f59e0b', 'coctel': 'a855f7',
                            'hamburgues': 'ef4444', 'pizza': 'f97316', 'pasta': 'eab308',
                            'postre': 'ec4899', 'cafe': '92400e', 'sandwich': '84cc16',
                            'ensalada': '22c55e', 'sopa': 'f59e0b', 'pollo': 'f97316',
                            'carne': 'ef4444', 'marisco': '06b6d4', 'entrada': '8b5cf6',
                        };
                        const catKey = (categoria || categoriaPadre || '').toLowerCase();
                        const bgColor = Object.entries(catColors).find(([k]) => catKey.includes(k))?.[1] || '6366f1';
                        const displayName = encodeURIComponent(String(name).trim().substring(0, 30));
                        imageUrl = `https://placehold.co/500x500/${bgColor}/ffffff?text=${displayName}&font=inter`;
                    }

                    if (!name || isNaN(parseFloat(price))) {
                        console.warn('Fila saltada por falta de nombre o precio válido:', row);
                        continue;
                    }

                    // Manejo de categorías dinámico
                    let parentCategoryId: string | null = null;
                    if (categoriaPadre) {
                        let pCat = this.filteredCategories.find(c => c.name.toLowerCase() === String(categoriaPadre).trim().toLowerCase() && !c.parent_id);
                        if (!pCat) {
                            const res = await this.supabaseService.saveCategory({
                                merchant_id: this.merchantId,
                                name: String(categoriaPadre).trim(),
                                parent_id: null
                            });
                            if (!res.error && res.data) {
                                pCat = res.data;
                                this.filteredCategories.push(pCat as Category);
                                parentCategoryId = pCat?.id || null;
                            }
                        } else {
                            parentCategoryId = pCat.id;
                        }
                    }

                    let derivedCategoryId: string | null = null;
                    
                    if (categoria) {
                        let cCat = this.filteredCategories.find(c => c.name.toLowerCase() === String(categoria).trim().toLowerCase() && c.parent_id === parentCategoryId);
                        if (!cCat) {
                            const res = await this.supabaseService.saveCategory({
                                merchant_id: this.merchantId,
                                name: String(categoria).trim(),
                                parent_id: parentCategoryId
                            });
                            if (!res.error && res.data) {
                                cCat = res.data;
                                this.filteredCategories.push(cCat as Category);
                                derivedCategoryId = cCat?.id || null;
                            }
                        } else {
                            derivedCategoryId = cCat.id;
                        }
                    } else if (parentCategoryId) {
                        // If no specific category is set but a parent category is, use the parent category
                        derivedCategoryId = parentCategoryId;
                    } else {
                        // Fallback to selected category from UI or the first available category
                        derivedCategoryId = this.selectedCategoryId || (this.filteredCategories.length > 0 ? this.filteredCategories[0].id : null);
                    }

                    const productData = {
                        name: String(name).trim(),
                        description: String(desc).trim(),
                        price: parseFloat(price),
                        image_url: String(imageUrl).trim(),
                        merchant_id: this.merchantId,
                        category_id: derivedCategoryId,
                        is_available: true
                    };

                    const { error } = await this.supabaseService.saveProduct(productData);
                    if (!error) importedCount++;
                }

                this.notificationService.show(`${importedCount} productos procesados correctamente`, 'success');
                await this.loadData();
            } catch (error: any) {
                console.error('Error al procesar Excel:', error);
                this.notificationService.show('Error al procesar el archivo Excel', 'error');
            } finally {
                this.isLoading = false;
                this.cdr.detectChanges();
            }
        };
        reader.readAsArrayBuffer(file);
        event.target.value = ''; // Reset para permitir cargar el mismo archivo
    }

    downloadTemplate() {
        const template = [
            { 
                Nombre: 'Hamburguesa Especial', 
                Descripcion: 'Carne premium, queso, tocineta y vegetales frescos', 
                Precio: 25000, 
                Imagen: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500',
                Categoria: 'Hamburguesas',
                'Categoria Padre': 'Comidas Rápidas'
            },
            { 
                Nombre: 'Papas Fritas', 
                Descripcion: 'Papas rústicas con sal de mar', 
                Precio: 8000, 
                Imagen: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500',
                Categoria: 'Acompañamientos',
                'Categoria Padre': 'Comidas Rápidas'
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(template);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
        
        XLSX.writeFile(workbook, 'plantilla_productos_woox.xlsx');
    }

    toggleProductSelection(id: string, event: Event) {
        event.stopPropagation();
        if (this.selectedProductIds.has(id)) {
            this.selectedProductIds.delete(id);
        } else {
            this.selectedProductIds.add(id);
        }
    }

    isProductSelected(id: string): boolean {
        return this.selectedProductIds.has(id);
    }

    clearSelection() {
        this.selectedProductIds.clear();
    }

    async moveProductsToCategory(productIds: string[], targetCategoryId: string) {
        if (!productIds.length) return;

        this.isLoading = true;
        this.cdr.detectChanges();

        try {
            const promises = productIds.map(id => 
                this.supabaseService.updateProduct(id, { category_id: targetCategoryId })
            );
            
            await Promise.all(promises);
            this.notificationService.show(
                `${productIds.length} producto(s) movido(s) correctamente`, 
                'success'
            );
            this.selectedProductIds.clear();
            await this.loadData();
        } catch (error: any) {
            console.error('Error moving products:', error);
            this.notificationService.show('Error al mover productos', 'error');
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    onCategoryDragStarted(categoryId: string) {
        this.isDraggingCategory = true;
        this.draggedCategoryId = categoryId;
        this.cdr.detectChanges();
    }

    onCategoryDragEnded() {
        this.isDraggingCategory = false;
        this.draggedCategoryId = null;
        this.activeDropTargetId = null;
        this.cdr.detectChanges();
    }

    onItemMouseEnter(id: string) {
        if (this.isDraggingCategory || this.isDraggingProducts) {
            this.activeDropTargetId = id;
        }
    }

    onItemMouseLeave() {
        this.activeDropTargetId = null;
    }

    onProductDragStarted(productId: string) {
        this.isDraggingProducts = true;
        // Si el producto arrastrado no está en la selección, lo agregamos (o limpiamos otros)
        if (!this.selectedProductIds.has(productId)) {
            this.selectedProductIds.clear();
            this.selectedProductIds.add(productId);
        }
        this.cdr.detectChanges();
    }

    onProductDragEnded() {
        this.isDraggingProducts = false;
        this.cdr.detectChanges();
    }

    async onDropToCategory(categoryId: string) {
        if (this.isDraggingProducts && this.selectedProductIds.size > 0) {
            const ids = Array.from(this.selectedProductIds);
            await this.moveProductsToCategory(ids, categoryId);
        } else if (this.isDraggingCategory && this.draggedCategoryId) {
            // Evitar que una categoría sea padre de sí misma
            if (this.draggedCategoryId === categoryId) return;

            try {
                const { error } = await this.supabaseService.updateCategory(this.draggedCategoryId, { 
                    parent_id: categoryId 
                });
                if (error) throw error;

                this.notificationService.show('Categoría movida correctamente', 'success');
                await this.loadData();
            } catch (err: any) {
                console.error('Error moving category:', err);
                this.notificationService.show('Error al mover la categoría', 'error');
            }
        }
    }

    // --- Sidebar Resizing Methods ---
    startResizing(event: MouseEvent) {
        this.isResizing = true;
        this.startX = event.clientX;
        this.startWidth = this.sidebarWidth;
        
        // Añadir clases al body para evitar selección de texto y cambiar cursor
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        // Escuchar eventos globales
        const onMouseMove = (e: MouseEvent) => this.onMouseMove(e);
        const onMouseUp = () => {
            this.isResizing = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    private onMouseMove(event: MouseEvent) {
        if (!this.isResizing) return;
        
        const deltaX = event.clientX - this.startX;
        const newWidth = this.startWidth + deltaX;
        
        // Límites: Min 200px, Max 600px
        if (newWidth >= 200 && newWidth <= 600) {
            this.sidebarWidth = newWidth;
            this.cdr.detectChanges();
        }
    }
}
