import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { Order } from '../types/domain';

interface AnalyticsChartsProps {
  orders: Order[];
}

type Period = 'days' | 'months';
type Metric = 'sales' | 'orders';

interface ChartPoint {
  label: string;
  subLabel?: string;
  ordersCount: number;
  salesTotal: number;
  isTodayOrCurrent?: boolean;
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ orders }) => {
  const [period, setPeriod] = useState<Period>('days');
  const [metric, setMetric] = useState<Metric>('sales');
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);

  // Procesamiento de datos agrupados por Días (últimos 7 días) o Meses (últimos 6 meses)
  const chartData: ChartPoint[] = useMemo(() => {
    const validOrders = orders.filter((o) => o.status !== 'cancelled');

    if (period === 'days') {
      // Últimos 7 días (del día actual hacia atrás)
      const daysList: ChartPoint[] = [];
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

      for (let i = 6; i >= 0; i--) {
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
      // Últimos 6 meses
      const monthsList: ChartPoint[] = [];
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      for (let i = 5; i >= 0; i--) {
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
          subLabel: `${year}`,
          ordersCount: monthOrders.length,
          salesTotal: monthSales,
          isTodayOrCurrent: i === 0,
        });
      }
      return monthsList;
    }
  }, [orders, period]);

  // Totales y picos
  const values = chartData.map((d) => (metric === 'sales' ? d.salesTotal : d.ordersCount));
  const maxVal = Math.max(...values, metric === 'sales' ? 50 : 5);
  const totalPeriodSales = chartData.reduce((acc, d) => acc + d.salesTotal, 0);
  const totalPeriodOrders = chartData.reduce((acc, d) => acc + d.ordersCount, 0);

  const selectedData = selectedBarIndex !== null ? chartData[selectedBarIndex] : null;

  return (
    <View style={styles.card}>
      {/* Header con Título y Selectores */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.iconCircle, { backgroundColor: metric === 'sales' ? '#DCFCE7' : '#DBEAFE' }]}>
            <Ionicons
              name={metric === 'sales' ? 'cash-outline' : 'bar-chart-outline'}
              size={18}
              color={metric === 'sales' ? '#059669' : '#2563EB'}
            />
          </View>
          <View>
            <Text style={styles.cardTitle}>
              {metric === 'sales' ? 'Gráfica de Ventas' : 'Gráfica de Pedidos'}
            </Text>
            <Text style={styles.cardSubtitle}>
              {period === 'days' ? 'Desempeño últimos 7 días' : 'Desempeño últimos 6 meses'}
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
              Días
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
              Meses
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Selector de Métrica: Ventas ($) vs Pedidos (#) */}
      <View style={styles.metricSwitchRow}>
        <TouchableOpacity
          style={[
            styles.metricTab,
            metric === 'sales' && styles.metricTabActiveSales,
          ]}
          onPress={() => setMetric('sales')}
        >
          <Text style={[styles.metricLabel, metric === 'sales' && styles.metricLabelActiveSales]}>
            Ventas Totales
          </Text>
          <Text style={[styles.metricValue, metric === 'sales' && styles.metricValueActiveSales]}>
            ${totalPeriodSales.toFixed(2)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.metricTab,
            metric === 'orders' && styles.metricTabActiveOrders,
          ]}
          onPress={() => setMetric('orders')}
        >
          <Text style={[styles.metricLabel, metric === 'orders' && styles.metricLabelActiveOrders]}>
            Total Pedidos
          </Text>
          <Text style={[styles.metricValue, metric === 'orders' && styles.metricValueActiveOrders]}>
            {totalPeriodOrders} {totalPeriodOrders === 1 ? 'pedido' : 'pedidos'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tooltip Interactivo de Barra Seleccionada */}
      {selectedData ? (
        <View style={styles.interactiveTooltip}>
          <Text style={styles.tooltipTitle}>
            {selectedData.label} ({selectedData.subLabel})
          </Text>
          <View style={styles.tooltipDetailsRow}>
            <Text style={styles.tooltipStat}>
              <Text style={{ fontWeight: '700', color: '#059669' }}>
                ${selectedData.salesTotal.toFixed(2)}
              </Text>{' '}
              en ventas
            </Text>
            <Text style={styles.tooltipBullet}>•</Text>
            <Text style={styles.tooltipStat}>
              <Text style={{ fontWeight: '700', color: '#2563EB' }}>
                {selectedData.ordersCount}
              </Text>{' '}
              {selectedData.ordersCount === 1 ? 'pedido' : 'pedidos'}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.chartTip}>
          Toca cualquier barra para inspeccionar el valor exacto
        </Text>
      )}

      {/* Lienzo del Gráfico de Barras */}
      <View style={styles.chartContainer}>
        {/* Líneas guía de fondo */}
        <View style={styles.gridLinesContainer}>
          <View style={styles.gridLine} />
          <View style={styles.gridLine} />
          <View style={styles.gridLine} />
        </View>

        {/* Barras de datos */}
        <View style={styles.barsContainer}>
          {chartData.map((item, idx) => {
            const rawVal = metric === 'sales' ? item.salesTotal : item.ordersCount;
            const heightPercent = maxVal > 0 ? Math.max((rawVal / maxVal) * 100, 4) : 4;
            const isSelected = selectedBarIndex === idx;

            // Paleta según métrica
            const barBgColor =
              metric === 'sales'
                ? isSelected
                  ? '#059669'
                  : item.isTodayOrCurrent
                  ? '#10B981'
                  : '#A7F3D0'
                : isSelected
                ? '#2563EB'
                : item.isTodayOrCurrent
                ? '#3B82F6'
                : '#BFDBFE';

            return (
              <TouchableOpacity
                key={`${item.label}-${idx}`}
                style={styles.barColumn}
                activeOpacity={0.7}
                onPress={() => setSelectedBarIndex(isSelected ? null : idx)}
              >
                {/* Etiqueta superior sobre la barra si está activa */}
                <View style={styles.barTopLabelContainer}>
                  {rawVal > 0 && (
                    <Text
                      style={[
                        styles.barValueText,
                        isSelected && { fontWeight: '900', color: Colors.textPrimary },
                      ]}
                      numberOfLines={1}
                    >
                      {metric === 'sales' ? `$${Math.round(rawVal)}` : rawVal}
                    </Text>
                  )}
                </View>

                {/* Columna de la Barra */}
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${heightPercent}%`,
                        backgroundColor: barBgColor,
                        borderTopLeftRadius: 6,
                        borderTopRightRadius: 6,
                      },
                      isSelected && styles.barFillSelected,
                    ]}
                  />
                </View>

                {/* Etiquetas inferiores X */}
                <Text
                  style={[
                    styles.barLabel,
                    item.isTodayOrCurrent && styles.barLabelHighlight,
                    isSelected && { fontWeight: '800', color: Colors.primaryDark },
                  ]}
                >
                  {item.label}
                </Text>
                {item.subLabel ? (
                  <Text style={styles.barSubLabel}>{item.subLabel}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
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
  metricSwitchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  metricTab: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: Colors.bgPrimary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  metricTabActiveSales: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  metricTabActiveOrders: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  metricLabelActiveSales: {
    color: '#059669',
    fontWeight: '700',
  },
  metricLabelActiveOrders: {
    color: '#2563EB',
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  metricValueActiveSales: {
    color: '#047857',
  },
  metricValueActiveOrders: {
    color: '#1D4ED8',
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
  chartTip: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  chartContainer: {
    height: 160,
    position: 'relative',
    marginTop: 6,
  },
  gridLinesContainer: {
    position: 'absolute',
    top: 20,
    bottom: 35,
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
  barsContainer: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 1,
    paddingHorizontal: 4,
  },
  barColumn: {
    flex: 1,
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
  barValueText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  barTrack: {
    flex: 1,
    width: '100%',
    maxWidth: 24,
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
    fontSize: 11,
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
