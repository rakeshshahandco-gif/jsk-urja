import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { generateSalesOrderHTML, generateSalesInvoiceHTML } from '../utils/PDFGenerator';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../theme/colors';

export const SalesDetailScreen = ({ route, navigation }) => {
  const { invoice: rawInvoice, order } = route.params || {};
  const invoice = rawInvoice || order;

  if (!invoice) return null;

  const type = order ? 'Order' : 'Invoice';
  const customerName = invoice.customerName || invoice.customer?.companyName || invoice.customer?.name || 'Customer';
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  
  const handlePrint = async () => {
    try {
      const html = type === 'Order' 
        ? generateSalesOrderHTML(invoice, { companyName: 'SHREEJAL' }) 
        : generateSalesInvoiceHTML(invoice, { companyName: 'SHREEJAL' });
      await Print.printAsync({ html });
    } catch (e) {
      console.warn(e);
    }
  };

  const handleShare = async () => {
    try {
      const html = type === 'Order' 
        ? generateSalesOrderHTML(invoice, { companyName: 'SHREEJAL' }) 
        : generateSalesInvoiceHTML(invoice, { companyName: 'SHREEJAL' });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri);
    } catch (e) {
      console.warn(e);
    }
  };
  
  const ItemRow = ({ item }) => (
    <View style={styles.itemRow}>
        <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.itemName || item.name || 'Unknown Item'}</Text>
            <Text style={styles.itemSubText}>{item.qty || item.quantity || 0} {item.uom || item.unit || 'PCS'} @ ₹{(item.rate || item.price || 0).toLocaleString()}</Text>
        </View>
        <Text style={styles.itemTotal}>₹{((item.qty || item.quantity || 0) * (item.rate || item.price || 0)).toLocaleString()}</Text>
    </View>
  );

  const SummaryRow = ({ label, value, bold, color }) => (
    <View style={styles.summaryLine}>
      <Text style={[styles.summaryLabel, bold && { fontWeight: 'bold' }]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && { fontWeight: 'bold' }, color && { color }]}>
        ₹{(value || 0).toLocaleString()}
      </Text>
    </View>
  );

  const docNo = invoice.displayInvoiceNumber || invoice.invoiceNumber || invoice.soNumber || invoice.invoiceNo || '---';
  const date = invoice.invoiceDate || invoice.soDate || invoice.date;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>❮ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{type} #{docNo}</Text>
        <View style={{ flexDirection: 'row', gap: 15 }}>
          <TouchableOpacity onPress={handlePrint}>
             <Text style={{ fontSize: 18 }}>📄</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare}>
             <Text style={{ fontSize: 18 }}>📤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Info Card */}
        <View style={styles.topCard}>
          <Text style={styles.customerLabel}>BILL TO</Text>
          <Text style={styles.customerName}>{customerName}</Text>
          <Text style={styles.customerDetail}>GSTIN: {invoice.customerGstin || invoice.customer?.gstNumber || 'N/A'}</Text>
          
          <View style={styles.statusRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>DATE</Text>
                <Text style={styles.metaValue}>{date ? new Date(date).toLocaleDateString() : '---'}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>STATUS</Text>
                <Text style={[styles.metaValue, { color: COLORS.primary }]}>{invoice.status || 'Draft'}</Text>
              </View>
          </View>
        </View>

        {/* Items Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{type} Items ({items.length})</Text>
          <View style={styles.itemsCard}>
            {items.map((item, index) => (
                <ItemRow key={index} item={item} />
            ))}
            {items.length === 0 && <Text style={styles.emptyItems}>No items found</Text>}
          </View>
        </View>

        {/* Totals Section */}
        <View style={styles.summaryCard}>
            <SummaryRow label="Taxable Value" value={invoice.totalTaxableAmount || invoice.subTotal} />
            <SummaryRow label="Total GST" value={invoice.totalGst || invoice.taxAmount} />
            {(invoice.totalDiscount > 0 || invoice.discountAmount > 0) && (
              <SummaryRow label="Discount" value={-(invoice.totalDiscount || invoice.discountAmount)} color="#C62828" />
            )}
            <View style={styles.divider} />
            <SummaryRow label="Grand Total" value={invoice.roundedTotal || invoice.totalAmount} bold color={COLORS.primary} />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.base, backgroundColor: COLORS.white, ...SHADOW.md,
  },
  backBtn: { paddingVertical: 8 },
  backText: { color: COLORS.primary, fontSize: FONT.sm, fontWeight: FONT.bold },
  headerTitle: { fontSize: FONT.md, fontWeight: FONT.bold, color: COLORS.gray900 },
  scroll: { padding: SPACING.base },
  topCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md, 
    padding: SPACING.lg, marginBottom: SPACING.base, ...SHADOW.card,
    borderTopWidth: 4, borderTopColor: COLORS.primary
  },
  customerLabel: { fontSize: 10, color: COLORS.gray500, fontWeight: FONT.bold, marginBottom: 4 },
  customerName: { fontSize: 18, fontWeight: FONT.bold, color: COLORS.gray900, marginBottom: 4 },
  customerDetail: { fontSize: 12, color: COLORS.gray600, marginBottom: 16 },
  statusRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.gray50, paddingTop: 16 },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 10, color: COLORS.gray500, fontWeight: FONT.bold, marginBottom: 2 },
  metaValue: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.gray800 },
  section: { marginBottom: SPACING.base },
  sectionTitle: { fontSize: 12, fontWeight: FONT.bold, color: COLORS.gray500, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
  itemsCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, ...SHADOW.card },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.gray50 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.gray900, marginBottom: 2 },
  itemSubText: { fontSize: 12, color: COLORS.gray500 },
  itemTotal: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.gray900 },
  emptyItems: { padding: 20, textAlign: 'center', color: COLORS.gray400 },
  summaryCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: SPACING.lg, ...SHADOW.card },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryLabel: { fontSize: 14, color: COLORS.gray600 },
  summaryValue: { fontSize: 14, color: COLORS.gray900, fontWeight: FONT.semibold },
  divider: { height: 1, backgroundColor: COLORS.gray100, marginVertical: 10 },
});
