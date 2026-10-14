import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Product, Category } from '../types/domain';

export function useCatalogManagement(merchantId?: string) {
  const queryClient = useQueryClient();

  // 1. Cargar Categorías
  const categoriesQuery = useQuery({
    queryKey: ['categories', merchantId],
    queryFn: async (): Promise<Category[]> => {
      if (!merchantId) return [];
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('name', { ascending: true });

      if (error) {
        console.error('[useCatalogManagement] Error loading categories:', error);
        return [];
      }
      return (data as Category[]) || [];
    },
    enabled: !!merchantId,
  });

  // 2. Cargar Productos con su categoría
  const productsQuery = useQuery({
    queryKey: ['products', merchantId],
    queryFn: async (): Promise<Product[]> => {
      if (!merchantId) return [];
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(*)')
        .eq('merchant_id', merchantId)
        .order('name', { ascending: true });

      if (error) {
        console.error('[useCatalogManagement] Error loading products:', error);
        throw error;
      }
      return (data as Product[]) || [];
    },
    enabled: !!merchantId,
  });

  // 3. Toggle disponibilidad (Agotado vs Disponible)
  const toggleAvailabilityMutation = useMutation({
    mutationFn: async ({ productId, isAvailable }: { productId: string; isAvailable: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ is_available: isAvailable })
        .eq('id', productId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', merchantId] });
    },
  });

  // 4. Guardar o Crear Producto (Upsert)
  const saveProductMutation = useMutation({
    mutationFn: async (productData: Partial<Product>) => {
      if (!merchantId) throw new Error('No merchant ID');

      const payload = {
        ...productData,
        merchant_id: merchantId,
      };

      const { data, error } = await supabase
        .from('products')
        .upsert(payload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', merchantId] });
    },
  });

  // 5. Eliminar Producto
  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', merchantId] });
    },
  });

  // 6. Crear Categoría
  const saveCategoryMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      if (!merchantId) throw new Error('No merchant ID');
      const { data, error } = await supabase
        .from('categories')
        .insert({
          name: name.trim(),
          merchant_id: merchantId,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', merchantId] });
    },
  });

  return {
    products: productsQuery.data || [],
    categories: categoriesQuery.data || [],
    isLoading: productsQuery.isLoading || categoriesQuery.isLoading,
    toggleAvailability: toggleAvailabilityMutation.mutateAsync,
    saveProduct: saveProductMutation.mutateAsync,
    isSavingProduct: saveProductMutation.isPending,
    deleteProduct: deleteProductMutation.mutateAsync,
    isDeletingProduct: deleteProductMutation.isPending,
    saveCategory: saveCategoryMutation.mutateAsync,
  };
}
