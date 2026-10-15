/** Número de pedido legible: usa order_number y cae al prefijo del UUID si no existe. */
export function formatOrderNumber(order: { id: string; order_number?: number | null }, len = 6): string {
  return order.order_number != null ? String(order.order_number) : order.id.slice(0, len).toUpperCase();
}
