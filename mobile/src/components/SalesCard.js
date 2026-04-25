import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../theme/colors';

export const SalesCard = ({ invoice, type = 'invoice', onPress }) => {
  const item = invoice; // Using invoice prop as the generic data object
  // Mirror backend fields: customerName, invoiceNumber, soNumber, grandTotal, invoiceDate, soDate
  const customerName = item.customerName || item.customer?.companyName || item.customer?.name || 'Unknown Customer';
  const docNo = item.displayInvoiceNumber || item.invoiceNumber || item.soNumber || item.invoiceNo || item.orderNo || '---';
  const total = item.roundedTotal || item.grandTotal || item.totalAmount || 0;
  const status = item.status || 'Draft';
  const date = item.invoiceDate || item.soDate || item.date;
  const displayDate = date ? new Date(date).toLocaleDateString() : '---';

  const getStatusColor = (s) => {
    switch (s.toLowerCase()) {
      case 'confirmed': return '#E8F5E9';
      case 'cancelled': return '#FFEBEE';
      case 'draft': return '#F5F5F5';
      default: return '#FFF3E0';
    }
  };

  const getStatusTextColor = (s) => {
    switch (s.toLowerCase()) {
      case 'confirmed': return '#2E7D32';
      case 'cancelled': return '#C62828';
      case 'draft': return '#757575';
      default: return '#EF6C00';
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(invoice)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.invoiceNo}>{docNo}</Text>
          <Text style={styles.date}>{displayDate}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
          <Text style={[styles.statusText, { color: getStatusTextColor(status) }]}>
            {status}
          </Text>
        </View>
      </View>
      
      <Text style={styles.customerName} numberOfLines={1}>{customerName}</Text>
      
      <View style={styles.footer}>
        <View style={styles.amountContainer}>
          <Text style={styles.totalLabel}>Total Amount</Text>
          <Text style={styles.totalValue}>₹{total.toLocaleString()}</Text>
        </View>
        <Text style={styles.chevron}>View ›</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.base,
    marginVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    ...SHADOW.card,
    padding: SPACING.base,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  invoiceNo: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.primary,
  },
  date: {
    fontSize: 11,
    color: COLORS.gray500,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  statusText: {
    fontSize: 10,
    fontWeight: FONT.bold,
    textTransform: 'uppercase',
  },
  customerName: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.gray900,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: COLORS.gray50,
    paddingTop: 8,
  },
  amountContainer: {},
  totalLabel: {
    fontSize: 10,
    color: COLORS.gray500,
    textTransform: 'uppercase',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.gray900,
  },
  chevron: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: FONT.bold,
  },
});
