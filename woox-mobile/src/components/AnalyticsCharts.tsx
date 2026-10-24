import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { Order } from '../types/domain';
import { formatPrice } from '../lib/formatPrice';

interface AnalyticsChartsProps {
  orders: Order[];
}

type Period = 'days' | 'months';

interface ChartPoint {
  label: string;
  subLabel?: string;
  ordersCount: number;
  salesTotal: number;
  isTodayOrCurrent?: boolean;
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ orders }) => {
  const [period, setPeriod] = useState<Period>('days');
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  // Procesamiento de datos: 30 Días o 12 Meses
  const chartData: ChartPoint[] = useMemo(() => {
    const validOrders = orders.filter((o) => o.status !== 'cancelled');

    if (period === 'days') {
      const daysList: ChartPoint[] = [];
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);

        const endOfDay = new Date(d);
        endOfDay.setHours(23, 59, 59, 999);

        const dayOrders = validOrders.filter((o) => {
          const orderDate = new Date(o.created_at);
          return orderDate >= d && orderDate <= endOfDay;
        });

        const daySales = dayOrders.reduce(
          (acc, o) => acc + Number((o as any).total ?? o.total_amount ?? 0),
          0
        );

        daysList.push({
          label: i === 0 ? 'Hoy' : dayNames[d.getDay()],
          subLabel: `${d.getDate()}/${d.getMonth() + 1}`,
          ordersCount: dayOrders.length,
          salesTotal: daySales,
          isTodayOrCurrent: i === 0,
        });
      }
      return daysList;
    } else {
      const monthsList: ChartPoint[] = [];
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        d.setHours(0, 0, 0, 0);

        const year = d.getFullYear();
        const month = d.getMonth();

        const monthOrders = validOrders.filter((o) => {
          const orderDate = new Date(o.created_at);
          return orderDate.getFullYear() === year && orderDate.getMonth() === month;
        });

        const monthSales = monthOrders.reduce(
          (acc, o) => acc + Number((o as any).total ?? o.total_amount ?? 0),
          0
        );

        monthsList.push({
          label: monthNames[month],
          subLabel: `'${year.toString().slice(-2)}`,
          ordersCount: monthOrders.length,
          salesTotal: monthSales,
          isTodayOrCurrent: i === 0,
        });
      }
      return monthsList;
    }
  }, [orders, period]);

  // Dimensiones de cada columna
  const colWidth = period === 'days' ? 44 : 54;
  const chartHeight = 175;
  const plotHeight = 110; // Espacio vertical para las barras y la línea de pedidos
  const topPadding = 25; // Espacio para etiquetas superiores
  const totalWidth = chartData.length * colWidth + 16;

  // Escalas máximas
  const maxSales = Math.max(...chartData.map((d) => d.salesTotal), 50);
  const maxOrders = Math.max(...chartData.map((d) => d.ordersCount), 5);

  const totalPeriodSales = chartData.reduce((acc, d) => acc + d.salesTotal, 0);
  const totalPeriodOrders = chartData.reduce((acc, d) => acc + d.ordersCount, 0);

  // Calcular puntos (X, Y) para la línea SVG de pedidos
  const points = useMemo(() => {
    return chartData.map((item, idx) => {
      const x = 8 + idx * colWidth + colWidth / 2;
      const orderRatio = maxOrders > 0 ? item.ordersCount / maxOrders : 0;
      // Invertido: 0 pedidos en la base (topPadding + plotHeight), maxOrders arriba (topPadding)
      const y = topPadding + plotHeight - orderRatio * (plotHeight - 15);
      return { x, y, ordersCount: item.ordersCount, salesTotal: item.salesTotal };
    });
  }, [chartData, colWidth, maxOrders, plotHeight, topPadding]);

  // Generar path continuo SVG
  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, '');
  }, [points]);

  // Generar área sombreada bajo la línea de pedidos
  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const baseY = topPadding + plotHeight;
    return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [linePath, points, topPadding, plotHeight]);

  // Auto-scroll al final para ver los datos más recientes
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [period]);

  const selectedData = selectedBarIndex !== null ? chartData[selectedBarIndex] : null;

  return (
    <View style={styles.card}>
      {/* Header con Título y Toggle de Período */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="stats-chart" size={18} color="#4F46E5" />
          </View>
          <View>
            <Text style={styles.cardTitle}>Ventas & Pedidos Combinados</Text>
            <Text style={styles.cardSubtitle}>
              {period === 'days' ? 'Últimos 30 días (Barras + Línea)' : 'Últimos 12 meses (Barras + Línea)'}
            </Text>
          </View>
        </View>

        {/* Toggle Días / Meses */}
        <View style={styles.periodToggle}>
          <TouchableOpacity
            style={[styles.periodButton, period === 'days' && styles.periodButtonActive]}
            onPress={() => {
              setPeriod('days');
              setSelectedBarIndex(null);
            }}
          >
            <Text style={[styles.periodButtonText, period === 'days' && styles.periodButtonTextActive]}>
              30 Días
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodButton, period === 'months' && styles.periodButtonActive]}
            onPress={() => {
              setPeriod('months');
              setSelectedBarIndex(null);
            }}
          >
            <Text style={[styles.periodButtonText, period === 'months' && styles.periodButtonTextActive]}>
              12 Meses
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tarjetas de Resumen & Leyenda */}
      <View style={styles.legendRow}>
        <View style={[styles.legendBox, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
          <View style={styles.legendIndicatorRow}>
            <View style={[styles.legendSquare, { backgroundColor: '#10B981' }]} />
            <Text style={styles.legendLabelText}>Barras de Ventas</Text>
          </View>
          <Text style={[styles.legendValueText, { color: '#047857' }]}>
            {formatPrice(totalPeriodSales)}
          </Text>
        </View>

        <View style={[styles.legendBox, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}>
          <View style={styles.legendIndicatorRow}>
            <View style={[styles.legendLineDot, { backgroundColor: '#4F46E5' }]} />
            <View style={[styles.legendLineBar, { backgroundColor: '#4F46E5' }]} />
            <Text style={styles.legendLabelText}>Línea de Pedidos</Text>
          </View>
          <Text style={[styles.legendValueText, { color: '#3730A3' }]}>
            {totalPeriodOrders} {totalPeriodOrders === 1 ? 'pedido' : 'pedidos'}
          </Text>
        </View>
      </View>

      {/* Tooltip Interactivo o Tip de Navegación */}
      {selectedData ? (
        <View style={styles.interactiveTooltip}>
          <Text style={styles.tooltipTitle}>
            {selectedData.label} ({selectedData.subLabel})
          </Text>
          <View style={styles.tooltipDetailsRow}>
            <Text style={styles.tooltipStat}>
              <Text style={{ fontWeight: '800', color: '#059669' }}>
                {formatPrice(selectedData.salesTotal)}
              </Text>{' '}
              en ventas
            </Text>
            <Text style={styles.tooltipBullet}>•</Text>
            <Text style={styles.tooltipStat}>
              <Text style={{ fontWeight: '800', color: '#4F46E5' }}>
                {selectedData.ordersCount}
              </Text>{' '}
              {selectedData.ordersCount === 1 ? 'pedido' : 'pedidos'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.scrollHintRow}>
          <Ionicons name="swap-horizontal" size={14} color={Colors.textMuted} />
          <Text style={styles.chartTip}>
            Desliza horizontalmente y toca cualquier columna para inspeccionar
          </Text>
        </View>
      )}

      {/* Gráfico Combinado: Barras (Ventas) + Svg Línea (Pedidos) */}
      <View style={[styles.chartContainer, { height: chartHeight }]}>
        {/* Líneas guía de fondo */}
        <View style={styles.gridLinesContainer}>
          <View style={styles.gridLine} />
          <View style={styles.gridLine} />
          <View style={styles.gridLine} />
        </View>

        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContentContainer, { width: totalWidth }]}
          decelerationRate="normal"
        >
          {/* Capa 1: Barras de Ventas con Interacción */}
          <View style={styles.barsLayer}>
            {chartData.map((item, idx) => {
              const salesRatio = maxSales > 0 ? item.salesTotal / maxSales : 0;
              const barHeight = Math.max(salesRatio * plotHeight, 4);
              const isSelected = selectedBarIndex === idx;

              const barBgColor = isSelected
                ? '#059669'
                : item.isTodayOrCurrent
                ? '#10B981'
                : '#A7F3D0';

              return (
                <TouchableOpacity
                  key={`col-${item.label}-${idx}`}
                  style={[styles.barColumn, { width: colWidth }]}
                  activeOpacity={0.7}
                  onPress={() => setSelectedBarIndex(isSelected ? null : idx)}
                >
                  {/* Etiqueta de valor de venta si tiene ventas */}
                  <View style={styles.barTopLabelContainer}>
                    {item.salesTotal > 0 && (
                      <Text
                        style={[
                          styles.barSalesValueText,
                          isSelected && { fontWeight: '900', color: Colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {formatPrice(item.salesTotal)}
                      </Text>
                    )}
                  </View>

                  {/* Barra de Ventas */}
                  <View style={[styles.barTrack, { height: plotHeight }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: barHeight,
                          backgroundColor: barBgColor,
                          borderTopLeftRadius: 6,
                          borderTopRightRadius: 6,
                        },
                        isSelected && styles.barFillSelected,
                      ]}
                    />
                  </View>

                  {/* Etiquetas del eje X */}
                  <Text
                    style={[
                      styles.barLabel,
                      item.isTodayOrCurrent && styles.barLabelHighlight,
                      isSelected && { fontWeight: '800', color: Colors.primaryDark },
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {item.subLabel ? (
                    <Text style={styles.barSubLabel} numberOfLines={1}>
                      {item.subLabel}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Capa 2: SVG Superpuesto con Línea y Puntos de Pedidos */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={totalWidth} height={chartHeight}>
              <Defs>
                <LinearGradient id="orderGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#4F46E5" stopOpacity="0.25" />
                  <Stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0" />
                </LinearGradient>
              </Defs>

              {/* Área degradada bajo la curva de pedidos */}
              {areaPath ? <Path d={areaPath} fill="url(#orderGrad)" /> : null}

              {/* Trazo continuo de pedidos */}
              {linePath ? (
                <Path
                  d={linePath}
                  fill="none"
                  stroke="#4F46E5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {/* Puntos y nodos en cada pedido */}
              {points.map((pt, idx) => {
                const isSelected = selectedBarIndex === idx;
                const hasOrders = pt.ordersCount > 0;

                return (
                  <React.Fragment key={`pt-${idx}`}>
                    {/* Anillo exterior si está seleccionado */}
                    {isSelected && (
                      <Circle
                        cx={pt.x}
                        cy={pt.y}
                        r={7}
                        fill="#EEF2FF"
                        stroke="#4F46E5"
                        strokeWidth="2"
                      />
                    )}
                    {/* Punto principal */}
                    <Circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hasOrders ? 4 : 2.5}
                      fill={hasOrders ? '#4F46E5' : '#A5B4FC'}
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    />
                  </React.Fragment>
                );
              })}
            </Svg>
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 20,
    padding: 16,
    marginVertical: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.bgPrimary,
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  periodButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: Colors.bgSecondary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  periodButtonTextActive: {
    color: Colors.textPrimary,
    fontWeight: '800',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  legendBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  legendIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendLineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLineBar: {
    width: 10,
    height: 2.5,
    borderRadius: 1,
    marginLeft: -2,
  },
  legendLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  legendValueText: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  interactiveTooltip: {
    backgroundColor: Colors.bgPrimary,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  tooltipTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  tooltipDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  tooltipStat: {
    fontSize: 12,
    color: Colors.textPrimary,
  },
  tooltipBullet: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  scrollHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 8,
  },
  chartTip: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  chartContainer: {
    position: 'relative',
    marginTop: 6,
  },
  gridLinesContainer: {
    position: 'absolute',
    top: 25,
    bottom: 40,
    left: 0,
    right: 0,
    justifyContent: 'space-between',
    zIndex: 0,
  },
  gridLine: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    opacity: 0.7,
  },
  scrollContentContainer: {
    height: '100%',
    position: 'relative',
  },
  barsLayer: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
  },
  barColumn: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 2,
  },
  barTopLabelContainer: {
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barSalesValueText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  barTrack: {
    width: '100%',
    maxWidth: 22,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: '100%',
    minHeight: 4,
  },
  barFillSelected: {
    borderWidth: 1.5,
    borderColor: Colors.textPrimary,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 6,
  },
  barLabelHighlight: {
    color: Colors.primaryDark,
    fontWeight: '800',
  },
  barSubLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 1,
  },
});
