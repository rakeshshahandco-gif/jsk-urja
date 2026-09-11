import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { salesApi } from '../api/sales.api';
import { ItemSearchModal } from '../components/ItemSearchModal';
import { CustomerSearchModal } from '../components/CustomerSearchModal';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../theme/colors';

export const SalesInvoiceCreateScreen = ({ route, navigation }) => {
  const customerParam = route.params?.customer;
  const [loadingMode, setLoadingMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [series, setSeries] = useState([]);
  const [previewNo, setPreviewNo] = useState('');
  const [customerModal, setCustomerModal] = useState(false);
  const [itemModal, setItemModal] = useState({ visible: false, index: null });

  const [form, setForm] = useState({
    invoiceDate: new Date().toISOString().split('T')[0],
    seriesId: '',
    customerName: customerParam?.companyName || customerParam?.name || '',
    customerId: customerParam?._id || '',
    customerGstin: customerParam?.gstNumber || '',
    billingState: customerParam?.state || 'Maharashtra',
    customerState: customerParam?.state || 'Maharashtra',
    customerStateCode: customerParam?.gstNumber?.substring(0,2) || '27',
    customerPhone: customerParam?.contactPersons?.[0]?.mobile || '',
    customerEmail: customerParam?.contactPersons?.[0]?.email || '',
    billingAddress: customerParam?.address || '',
    shippingAddress: customerParam?.address || '',
    customerPO: '',
    customerPODate: '',
    deliveryNote: '',
    supplierRef: '',
    otherReferences: '',
    despatchDocumentNo: '',
    despatchedThrough: '',
    destination: '',
    vehicleNo: '',
    gstType: 'CGST / SGST',
    items: [],
    freightAmount: '0',
    remarks: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const list = await salesApi.getSeries();
        const safeList = Array.isArray(list) ? list : [];
        setSeries(safeList);
        if (list.length > 0) {
          const def = list.find(s => s.isDefault) || list[0];
          handleSeriesChange(def._id);
        }
      } catch (e) {
        console.warn('Series load error:', e);
      } finally {
        setLoadingMode(false);
      }
    };
    load();
  }, []);

  const handleSeriesChange = async (val) => {
    setForm(p => ({ ...p, seriesId: val }));
    try {
      const res = await salesApi.previewNextNo(val, 'SalesInvoice');
      setPreviewNo(res.nextInvoiceNo || '');
    } catch (e) {
      setPreviewNo('');
    }
  };

  const addItem = (item) => {
    const newItem = {
      itemId: item._id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      qty: '1',
      rate: String(item.standardRate || item.rate || 0),
      gstRate: item.taxRate || 18,
      hsnCode: item.hsnCode || '',
      uom: item.uom || 'NOS',
      discountAmount: '0',
      additionalNotes: '',
    };
    setForm(p => ({ ...p, items: [...p.items, newItem] }));
  };

  const selectCustomer = (c) => {
    const state = c.state || 'Maharashtra';
    setForm(p => ({
      ...p,
      customerName: c.company || c.customerName || '',
      customerId: c._id,
      customerGstin: c.gstNumber || '',
      billingState: state,
      customerState: state,
      customerStateCode: c.gstNumber?.substring(0, 2) || '27',
      customerPhone: c.contactPersons?.[0]?.mobile || '',
      customerEmail: c.contactPersons?.[0]?.email || '',
      billingAddress: c.address || '',
      shippingAddress: c.shippingAddress || c.address || '',
      gstType: state.toLowerCase() === 'maharashtra' ? 'CGST / SGST' : 'IGST',
    }));
  };

  const updateItemField = (idx, field, val) => {
    const newItems = [...form.items];
    newItems[idx][field] = val;
    setForm(p => ({ ...p, items: newItems }));
  };

  const removeItem = (idx) => {
    setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  };

  // Calculation Logic (Replicated from CRM Web)
  const calculateTotals = () => {
    const isIGST = form.billingState.toLowerCase() !== 'maharashtra';
    let taxableTotal = 0;
    let gstTotal = 0;

    const processed = form.items.map(item => {
      const qty = Number(item.qty) || 0;
      const rate = Number(item.rate) || 0;
      const discount = Number(item.discountAmount) || 0;
      const lineTaxable = (qty * rate) - discount;
      const gstRate = Number(item.gstRate) || 0;
      const lineGst = (lineTaxable * gstRate) / 100;
      
      taxableTotal += lineTaxable;
      gstTotal += lineGst;
      
      return { ...item, lineTaxable, lineGst, total: lineTaxable + lineGst };
    });

    const freight = Number(form.freightAmount) || 0;
    const grandTotal = taxableTotal + gstTotal + freight;
    const rounded = Math.round(grandTotal);

    return { processed, taxableTotal, gstTotal, freight, grandTotal, rounded, isIGST };
  };

  const { processed, taxableTotal, gstTotal, freight, rounded, isIGST } = calculateTotals();

  const handleSave = async () => {
    if (!form.seriesId) return Alert.alert('Required', 'Please select Invoice Series');
    if (!form.customerName) return Alert.alert('Required', 'Customer Name is required');
    if (form.items.length === 0) return Alert.alert('Required', 'Add at least one item');

    setSaving(true);
    try {
      const payload = {
        ...form,
        items: processed.map(i => ({
          ...i,
          qty: Number(i.qty),
          rate: Number(i.rate),
          discountAmount: Number(i.discountAmount) || 0,
          taxableAmount: i.lineTaxable,
          totalAmount: i.total,
          cgstRate: isIGST ? 0 : i.gstRate / 2,
          sgstRate: isIGST ? 0 : i.gstRate / 2,
          igstRate: isIGST ? i.gstRate : 0,
        })),
        subTotal: taxableTotal,
        totalGst: gstTotal,
        grandTotal: taxableTotal + gstTotal + freight,
        roundedTotal: rounded,
      };

      await salesApi.createInvoice({
        ...payload,
        creationSource: 'MOBILE_NEW_INVOICE',
        creationRoute: 'mobile/SalesInvoiceCreateScreen',
        idempotencyKey: `mobile-si-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      Alert.alert('Success', 'Invoice generated successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingMode) return <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Tax Invoice</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" /> : <Text style={styles.saveText}>Generate</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Basic Info</Text>
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Series</Text>
                <TouchableOpacity style={styles.select} onPress={() => {}}>
                   <Text style={{fontWeight: '900', color: COLORS.secondary}}>
                     {series.find(s => s._id === form.seriesId)?.prefix || 'Select Series'}
                   </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                 <Text style={styles.label}>Invoice Date</Text>
                 <TextInput style={styles.input} value={form.invoiceDate} editable={false} />
              </View>
            </View>
            {previewNo && (
               <View style={styles.previewBox}>
                 <Text style={styles.previewText}>Next No: {previewNo}</Text>
               </View>
            )}
            
            <View style={{ marginTop: 12 }}>
               <Text style={styles.label}>Customer Name</Text>
               <TouchableOpacity style={styles.select} onPress={() => setCustomerModal(true)}>
                 <Text style={{ fontWeight: 'bold', color: form.customerName ? COLORS.gray900 : COLORS.gray400 }}>
                   {form.customerName || 'Select Customer...'}
                 </Text>
               </TouchableOpacity>
               <Text style={styles.subText}>State: {form.billingState} ({isIGST ? 'IGST' : 'CGST/SGST'})</Text>
            </View>

            <View style={[styles.row, { marginTop: 12 }]}>
               <View style={{ flex: 1, marginRight: 8 }}>
                 <Text style={styles.label}>Vehicle No.</Text>
                 <TextInput style={styles.input} value={form.vehicleNo} onChangeText={(t) => setForm({...form, vehicleNo: t})} />
               </View>
               <View style={{ flex: 1 }}>
                 <Text style={styles.label}>Customer PO</Text>
                 <TextInput style={styles.input} value={form.customerPO} onChangeText={(t) => setForm({...form, customerPO: t})} />
               </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Products & Items</Text>
              <TouchableOpacity onPress={() => setItemModal({ visible: true, index: null })}>
                <Text style={styles.addBtnText}>+ Add Item</Text>
              </TouchableOpacity>
            </View>

            {form.items.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <View style={styles.itemHeader}>
                   <Text style={styles.itemTitle}>{item.itemCode}</Text>
                   <TouchableOpacity onPress={() => removeItem(idx)}>
                     <Text style={{color: COLORS.overdue, fontWeight: 'bold'}}>✕</Text>
                   </TouchableOpacity>
                </View>
                <Text style={styles.itemNameText} numberOfLines={1}>{item.itemName}</Text>
                <View style={[styles.row, {marginTop: 8}]}>
                   <View style={{flex: 1, marginRight: 8}}>
                     <Text style={styles.label}>Qty</Text>
                     <TextInput 
                       style={styles.input} 
                       keyboardType="numeric" 
                       value={item.qty}
                       onChangeText={(v) => updateItemField(idx, 'qty', v)}
                     />
                   </View>
                   <View style={{flex: 2}}>
                     <Text style={styles.label}>Rate (₹)</Text>
                     <TextInput 
                       style={styles.input} 
                       keyboardType="numeric" 
                       value={item.rate}
                       onChangeText={(v) => updateItemField(idx, 'rate', v)}
                     />
                   </View>
                </View>
              </View>
            ))}

            {form.items.length === 0 && (
              <Text style={styles.emptyItems}>No items added yet</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Invoice Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Sub Total</Text>
              <Text style={styles.summaryValue}>₹{taxableTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{isIGST ? 'IGST' : 'CGST + SGST'}</Text>
              <Text style={styles.summaryValue}>₹{gstTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Freight</Text>
              <TextInput 
                style={[styles.input, { width: 100, height: 35, textAlign: 'right' }]} 
                keyboardType="numeric"
                value={form.freightAmount}
                onChangeText={(v) => setForm({...form, freightAmount: v})}
              />
            </View>
            <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: COLORS.gray100, paddingTop: 8, marginTop: 4 }]}>
               <Text style={[styles.summaryLabel, { color: COLORS.secondary, fontSize: 16 }]}>Grand Total</Text>
               <Text style={[styles.summaryValue, { color: COLORS.secondary, fontSize: 18, fontWeight: '900' }]}>₹{rounded.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.mainBtn, (saving || form.items.length === 0) && { opacity: 0.7 }]} 
            onPress={handleSave}
            disabled={saving || form.items.length === 0}
          >
            {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.mainBtnText}>Create GST Invoice</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <ItemSearchModal 
        visible={itemModal.visible} 
        onClose={() => setItemModal({ visible: false, index: null })}
        onSelect={(item) => addItem(item)}
      />
      <CustomerSearchModal
        visible={customerModal}
        onClose={() => setCustomerModal(false)}
        onSelect={selectCustomer}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.base, backgroundColor: COLORS.white, ...SHADOW.md },
  cancelText: { color: COLORS.gray500, fontWeight: FONT.medium },
  headerTitle: { fontSize: 16, fontWeight: FONT.bold, color: COLORS.gray900 },
  saveText: { color: COLORS.secondary, fontWeight: FONT.bold },
  scroll: { padding: SPACING.base },
  row: { flexDirection: 'row' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.base, ...SHADOW.card },
  sectionTitle: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.gray500, textTransform: 'uppercase', marginBottom: SPACING.md },
  label: { fontSize: 11, fontWeight: FONT.semibold, color: COLORS.gray600, marginBottom: 4 },
  input: { height: 44, backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, fontSize: 14, color: COLORS.gray900, borderWidth: 1, borderColor: COLORS.gray200 },
  subText: { fontSize: 11, color: COLORS.primary, marginTop: 4, fontWeight: FONT.semibold },
  previewBox: { backgroundColor: '#f0fdf4', padding: 8, borderRadius: RADIUS.md, marginTop: 8, borderWidth: 1, borderColor: '#bbf7d0', alignItems: 'center' },
  previewText: { color: '#166534', fontWeight: 'bold', fontSize: 13 },
  addBtnText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 13 },
  itemRow: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.gray50 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemTitle: { fontSize: 13, fontWeight: 'bold', color: COLORS.secondary },
  itemNameText: { fontSize: 14, color: COLORS.gray700 },
  emptyItems: { textAlign: 'center', padding: 20, color: COLORS.gray400, fontSize: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryLabel: { fontSize: 14, color: COLORS.gray600, fontWeight: FONT.medium },
  summaryValue: { fontSize: 14, color: COLORS.gray900, fontWeight: 'bold' },
  mainBtn: { backgroundColor: COLORS.secondary, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.base, ...SHADOW.md },
  mainBtnText: { color: COLORS.white, fontSize: 15, fontWeight: FONT.bold },
  select: { height: 44, backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.gray200, justifyContent: 'center' }
});
