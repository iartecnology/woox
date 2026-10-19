/**
 * Formatea un valor numérico como precio/moneda:
 * - Separador de miles con punto (ej: $15.000, $1.500.000)
 * - Sin decimales (redondeado al entero más cercano)
 */
export function formatPrice(amount?: number | string | null): string {
  if (amount === undefined || amount === null || amount === '') return '$0';
  const num = Number(amount);
  if (isNaN(num)) return '$0';
  const rounded = Math.round(num);
  return `$${rounded.toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}
