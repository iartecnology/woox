import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useCatalogManagement } from '../../../src/hooks/useCatalogManagement';
import { Product, Category } from '../../../src/types/domain';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../src/constants/theme';

export default function CatalogScreen() {
  const { merchant } = useAuthStore();
  const {
    products,
    categories,
    isLoading,
    toggleAvailability,
    saveProduct,
    isSavingProduct,
    deleteProduct,
    saveCategory,
  } = useCatalogManagement(merchant?.id);

  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  // Modales
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  // Formulario Producto
  const [prodName, setProdName] = useState('');
  const [prodDescription, setProdDescription] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCategoryId, setProdCategoryId] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodIsAvailable, setProdIsAvailable] = useState(true);

  // Formulario Categoría
  const [newCatName, setNewCatName] = useState('');

  // Filtrado
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory =
      selectedCategoryId === 'all' || p.category_id === selectedCategoryId;

    return matchesSearch && matchesCategory;
  });

  // Métricas de stock
  const totalItems = products.length;
  const availableItems = products.filter((p) => p.is_available).length;
  const outOfStockItems = totalItems - availableItems;

  const openNewProductModal = () => {
    setEditingProduct(null);
    setProdName('');
    setProdDescription('');
    setProdPrice('');
    setProdCategoryId(categories[0]?.id || '');
    setProdImageUrl('');
    setProdIsAvailable(true);
    setShowProductModal(true);
  };

  const openEditProductModal = (product: Product) => {
    setEditingProduct(product);
    setProdName(product.name);
    setProdDescription(product.description || '');
    setProdPrice(String(product.price));
    setProdCategoryId(product.category_id || categories[0]?.id || '');
    setProdImageUrl(product.image_url || '');
    setProdIsAvailable(product.is_available);
    setShowProductModal(true);
  };

  const handleSaveProduct = async () => {
    if (!prodName.trim()) {
      Alert.alert('Campo Requerido', 'El nombre del producto es obligatorio.');
      return;
    }
    const priceNum = parseFloat(prodPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      Alert.alert('Precio Inválido', 'Ingresa un valor numérico válido para el precio.');
      return;
    }

    try {
      await saveProduct({
        id: editingProduct?.id,
        name: prodName.trim(),
        description: prodDescription.trim(),
        price: priceNum,
        category_id: prodCategoryId || null as any,
        image_url: prodImageUrl.trim() || undefined,
        is_available: prodIsAvailable,
      });
      setShowProductModal(false);
    } catch (err: any) {
      Alert.alert('Error al guardar', err.message || 'No se pudo guardar el producto.');
    }
  };

  const handleDeleteProduct = (productId: string, productName: string) => {
    Alert.alert(
      'Eliminar Producto',
      `¿Estás seguro de que deseas eliminar "${productName}" del catálogo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(productId);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'No se pudo eliminar el producto.');
            }
          },
        },
      ]
    );
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) {
      Alert.alert('Campo Requerido', 'Ingresa un nombre para la categoría.');
      return;
    }

    try {
      await saveCategory({ name: newCatName.trim() });
      setNewCatName('');
      setShowCategoryModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo crear la categoría.');
    }
  };

  const renderProductItem = ({ item }: { item: Product }) => {
    const categoryName = categories.find((c) => c.id === item.category_id)?.name || 'Sin categoría';

    return (
      <View style={[styles.card, !item.is_available && styles.cardOutOfStock]}>
        {/* Imagen del Producto */}
        <View style={styles.imageContainer}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="fast-food-outline" size={28} color={Colors.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.productInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.productName}>{item.name}</Text>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{categoryName}</Text>
            </View>
          </View>

          <Text style={styles.productPrice}>${Number(item.price).toFixed(2)}</Text>

          {item.description ? (
            <Text style={styles.productDesc} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionsColumn}>
          {/* Switch de disponibilidad instantáneo */}
          <View style={styles.switchContainer}>
            <Text
              style={[
                styles.switchLabel,
                { color: item.is_available ? '#059669' : '#DC2626' },
              ]}
            >
              {item.is_available ? 'Disponible' : 'Agotado'}
            </Text>
            <Switch
              value={item.is_available}
              onValueChange={(val) =>
                toggleAvailability({ productId: item.id, isAvailable: val })
              }
              trackColor={{ false: '#FEE2E2', true: '#D1FAE5' }}
              thumbColor={item.is_available ? '#059669' : '#DC2626'}
            />
          </View>

          {/* Botones de Editar y Eliminar */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => openEditProductModal(item)}
            >
              <Ionicons name="pencil" size={16} color={Colors.primaryDark} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, styles.deleteBtn]}
              onPress={() => handleDeleteProduct(item.id, item.name)}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 1. Dashboard de Métricas de Catálogo */}
      <View style={styles.metricsBar}>
        <View style={styles.metricItem}>
          <Text style={styles.metricNumber}>{totalItems}</Text>
          <Text style={styles.metricLabel}>Total Productos</Text>
        </View>
        <View style={[styles.metricItem, { borderLeftWidth: 1, borderColor: Colors.borderSubtle }]}>
          <Text style={[styles.metricNumber, { color: '#059669' }]}>{availableItems}</Text>
          <Text style={styles.metricLabel}>En Stock</Text>
        </View>
        <View style={[styles.metricItem, { borderLeftWidth: 1, borderColor: Colors.borderSubtle }]}>
          <Text style={[styles.metricNumber, { color: '#DC2626' }]}>{outOfStockItems}</Text>
          <Text style={styles.metricLabel}>Agotados</Text>
        </View>
      </View>

      {/* 2. Barra de Búsqueda y Botones de Acción */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar producto, plato o ingrediente..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={openNewProductModal}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {/* 3. Selector Horizontal de Categorías */}
      <View style={styles.categoriesContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
          <TouchableOpacity
            style={[styles.catPill, selectedCategoryId === 'all' && styles.catPillActive]}
            onPress={() => setSelectedCategoryId('all')}
          >
            <Text style={[styles.catPillText, selectedCategoryId === 'all' && styles.catPillTextActive]}>
              Todas ({totalItems})
            </Text>
          </TouchableOpacity>

          {categories.map((cat) => {
            const count = products.filter((p) => p.category_id === cat.id).length;
            const isSelected = selectedCategoryId === cat.id;

            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.catPill, isSelected && styles.catPillActive]}
                onPress={() => setSelectedCategoryId(cat.id)}
              >
                <Text style={[styles.catPillText, isSelected && styles.catPillTextActive]}>
                  {cat.name} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity style={styles.addCatPill} onPress={() => setShowCategoryModal(true)}>
            <Ionicons name="add-circle-outline" size={16} color={Colors.primaryDark} />
            <Text style={styles.addCatPillText}>Nueva Cat.</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 4. Lista de Productos */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primaryDark} />
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="cube-outline" size={56} color={Colors.borderColor} />
          <Text style={styles.emptyTitle}>No se encontraron productos</Text>
          <Text style={styles.emptySubtitle}>
            Prueba ajustando los filtros o agrega un nuevo producto al catálogo.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* 5. MODAL CREAR / EDITAR PRODUCTO */}
      <Modal visible={showProductModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
              </Text>
              <TouchableOpacity onPress={() => setShowProductModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.inputLabel}>Nombre del Producto *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ej. Pizza Cuatro Quesos"
                placeholderTextColor={Colors.textMuted}
                value={prodName}
                onChangeText={setProdName}
              />

              <Text style={styles.inputLabel}>Precio ($) *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="15.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                value={prodPrice}
                onChangeText={setProdPrice}
              />

              <Text style={styles.inputLabel}>Categoría</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modalCatRow}>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.modalCatChoice,
                      prodCategoryId === c.id && styles.modalCatChoiceActive,
                    ]}
                    onPress={() => setProdCategoryId(c.id)}
                  >
                    <Text
                      style={[
                        styles.modalCatChoiceText,
                        prodCategoryId === c.id && styles.modalCatChoiceTextActive,
                      ]}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>URL de Imagen (Opcional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="https://ejemplo.com/foto-producto.jpg"
                placeholderTextColor={Colors.textMuted}
                value={prodImageUrl}
                onChangeText={setProdImageUrl}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Descripción o Ingredientes</Text>
              <TextInput
                style={[styles.modalInput, styles.textArea]}
                placeholder="Ingredientes, porciones, detalles para la IA..."
                placeholderTextColor={Colors.textMuted}
                value={prodDescription}
                onChangeText={setProdDescription}
                multiline
                numberOfLines={3}
              />

              <View style={styles.modalSwitchRow}>
                <View>
                  <Text style={styles.switchTitle}>Disponibilidad Inmediata</Text>
                  <Text style={styles.switchSub}>
                    Si está activo, la IA y los clientes podrán pedirlo.
                  </Text>
                </View>
                <Switch
                  value={prodIsAvailable}
                  onValueChange={setProdIsAvailable}
                  trackColor={{ false: '#FEE2E2', true: '#D1FAE5' }}
                  thumbColor={prodIsAvailable ? '#059669' : '#DC2626'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setShowProductModal(false)}
              >
                <Text style={styles.cancelModalBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveModalBtn, isSavingProduct && styles.disabledBtn]}
                onPress={handleSaveProduct}
                disabled={isSavingProduct}
              >
                {isSavingProduct ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveModalBtnText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 6. MODAL CREAR CATEGORÍA */}
      <Modal visible={showCategoryModal} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.smallModalContent}>
            <Text style={styles.modalTitle}>Nueva Categoría</Text>
            <Text style={styles.modalSubtitle}>
              Organiza tus productos para el menú web y la IA conversacional.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Ej. Postres, Entradas, Pastas..."
              placeholderTextColor={Colors.textMuted}
              value={newCatName}
              onChangeText={setNewCatName}
              autoFocus
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setShowCategoryModal(false)}
              >
                <Text style={styles.cancelModalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={handleCreateCategory}
              >
                <Text style={styles.saveModalBtnText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  metricsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgSecondary,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 2,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSecondary,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    paddingVertical: 10,
    fontSize: 14,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryDark,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  categoriesContainer: {
    marginTop: 10,
    paddingBottom: 6,
  },
  catScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  catPillActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryDark,
  },
  catPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  catPillTextActive: {
    color: '#FFFFFF',
  },
  addCatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.primarySubtle,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  addCatPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardOutOfStock: {
    opacity: 0.85,
    borderColor: '#FCA5A5',
  },
  imageContainer: {
    marginRight: 12,
  },
  productImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.bgPrimary,
  },
  imagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  productInfo: {
    flex: 1,
    paddingRight: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  categoryBadge: {
    backgroundColor: Colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primaryDark,
    marginTop: 4,
  },
  productDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  actionsColumn: {
    alignItems: 'flex-end',
    gap: 10,
  },
  switchContainer: {
    alignItems: 'center',
    gap: 2,
  },
  switchLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  deleteBtn: {
    backgroundColor: Colors.dangerSubtle,
    borderColor: '#FCA5A5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: 16,
  },
  modalBody: {
    gap: 12,
    paddingBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 4,
  },
  modalInput: {
    backgroundColor: Colors.bgPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderColor,
    color: Colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalCatRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  modalCatChoice: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.bgPrimary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginRight: 8,
  },
  modalCatChoiceActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryDark,
  },
  modalCatChoiceText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  modalCatChoiceTextActive: {
    color: '#FFFFFF',
  },
  modalSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgPrimary,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginTop: 6,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  switchSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    maxWidth: 220,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingTop: 16,
    marginTop: 8,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.bgPrimary,
    borderWidth: 1,
    borderColor: Colors.borderColor,
  },
  cancelModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  saveModalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.primaryDark,
  },
  saveModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  smallModalContent: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
});
