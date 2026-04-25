import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { salesApi } from '../api/sales.api';
import { ItemSearchModal } from '../components/ItemSearchModal';
import { CustomerSearchModal } from '../components/CustomerSearchModal';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../theme/colors';

export const SalesOrderCreateScreen = ({ route, navigation }) => {
  const customerParam = route.params?.customer;
  const [loadingMode, setLoadingMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [series, setSeries] = useState([]);
  const [previewNo, setPreviewNo] = useState('');
  const [customerModal, setCustomerModal] = useState(false);
  const [itemModal, setItemModal] = useState({ visible: false, index: null });

  const [form, setForm] = useState({
    orderDate: new Date().toISOString().split('T')[0],
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
    orderCategory: 'Regular',
    deliveryDate: new Date().toISOString().split('T')[0],
    customerPO: '',
    customerPODate: '',
    warrantyDetails: '',
    items: [],
    freightAmount: '0',
    remarks: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await salesApi.getSeries();
        const list = res?.filter(s => s.seriesName.includes('SO') || s.prefix.includes('SO')) || [];
        setSeries(list);
        if (list.length > 0) {
          handleSeriesChange(list[0]._id);
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
      const res = await salesApi.previewNextNo(val, 'SalesOrder');
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
    setForm(p => ({
      ...p,
      customerName: c.company || c.customerName || '',
      customerId: c._id,
      customerGstin: c.gstNumber || '',
      billingState: c.state || 'Maharashtra',
      customerState: c.state || 'Maharashtra',
      customerStateCode: c.gstNumber?.substring(0, 2) || '27',
      customerPhone: c.contactPersons?.[0]?.mobile || '',
      customerEmail: c.contactPersons?.[0]?.email || '',
      billingAddress: c.address || '',
      shippingAddress: c.shippingAddress || c.address || '',
    }));
  };

  const updateItemField = (idx, field, val) => {
    const newItems = [...form.items];
    newItems[idx][field] = val;
    setForm(p => ({ ...p, items: newItems }));
  };

  const calculateTotals = () => {
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
    return { processed, taxableTotal, gstTotal, grandTotal };
  };

  const { processed, taxableTotal, gstTotal, grandTotal } = calculateTotals();

  const handleSave = async () => {
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
        })),
        grandTotal,
      };

      await salesApi.createSalesOrder(payload);
      Alert.alert('Success', 'Sales Order created!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingMode) return <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Sales Order</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" /> : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>SO Details</Text>
            <View style={styles.row}>
               <View style={{ flex: 1, marginRight: 8 }}>
                 <Text style={styles.label}>Order Date</Text>
                 <TextInput style={styles.input} value={form.orderDate} editable={false} />
               </View>
               <View style={{ flex: 1 }}>
                  <Text style={styles.label}>SO Prefix</Text>
                  <TouchableOpacity style={styles.select} onPress={() => {}}>
                    <Text style={{fontWeight: 'bold', color: COLORS.secondary}}>
                      {series.find(s => s._id === form.seriesId)?.prefix || 'SO'}
                    </Text>
                  </TouchableOpacity>
               </View>
            </View>
             <View style={{ marginTop: 12 }}>
               <Text style={styles.label}>Customer Name</Text>
               <TouchableOpacity style={styles.select} onPress={() => setCustomerModal(true)}>
                 <Text style={{ fontWeight: 'bold', color: form.customerName ? COLORS.gray900 : COLORS.gray400 }}>
                   {form.customerName || 'Select Customer...'}
                 </Text>
               </TouchableOpacity>
             </View>
             
             {form.customerName ? (
               <View style={{ marginTop: 8 }}>
                 <Text style={{ fontSize: 11, color: COLORS.gray600 }}>GSTIN: {form.customerGstin || 'N/A'}</Text>
                 <Text style={{ fontSize: 11, color: COLORS.gray600 }}>State: {form.billingState}</Text>
               </View>
             ) : null}

             <View style={[styles.row, { marginTop: 12 }]}>
               <View style={{ flex: 1, marginRight: 8 }}>
                 <Text style={styles.label}>Order Category</Text>
                 <TextInput style={styles.input} value={form.orderCategory} onChangeText={(t) => setForm({...form, orderCategory: t})} />
               </View>
               <View style={{ flex: 1 }}>
                 <Text style={styles.label}>Delivery Date</Text>
                 <TextInput style={styles.input} value={form.deliveryDate} onChangeText={(t) => setForm({...form, deliveryDate: t})} />
               </View>
             </View>

             <View style={[styles.row, { marginTop: 12 }]}>
               <View style={{ flex: 1, marginRight: 8 }}>
                 <Text style={styles.label}>Customer PO</Text>
                 <TextInput style={styles.input} value={form.customerPO} onChangeText={(t) => setForm({...form, customerPO: t})} />
               </View>
               <View style={{ flex: 1 }}>
                 <Text style={styles.label}>PO Date</Text>
                 <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={form.customerPODate} onChangeText={(t) => setForm({...form, customerPODate: t})} />
               </View>
             </View>
          </View>

          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Items</Text>
              <TouchableOpacity onPress={() => setItemModal({ visible: true, index: null })}>
                <Text style={styles.addBtnText}>+ Add Product</Text>
              </TouchableOpacity>
            </View>

            {form.items.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <View style={styles.itemHeader}>
                   <Text style={styles.itemTitle}>{item.itemCode}</Text>
                   <TouchableOpacity onPress={() => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}>
                     <Text style={{color: COLORS.overdue, fontWeight: 'bold'}}>✕</Text>
                   </TouchableOpacity>
                </View>
                <Text style={styles.itemNameText}>{item.itemName}</Text>
                <View style={[styles.row, {marginTop: 6}]}>
                   <View style={{flex: 1, marginRight: 8}}>
                     <Text style={styles.label}>Qty</Text>
                     <TextInput style={styles.input} keyboardType="numeric" value={item.qty} onChangeText={(v) => updateItemField(idx, 'qty', v)} />
                   </View>
                   <View style={{flex: 2}}>
                     <Text style={styles.label}>Proposed Rate</Text>
                     <TextInput style={styles.input} keyboardType="numeric" value={item.rate} onChangeText={(v) => updateItemField(idx, 'rate', v)} />
                   </View>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Remarks</Text>
            <TextInput 
              style={[styles.input, { height: 60, textAlignVertical: 'top' }]} 
              multiline 
              placeholder="Internal notes..." 
              value={form.remarks}
              onChangeText={(t) => setForm({...form, remarks: t})}
            />
          </View>

          <View style={[styles.card, {backgroundColor: COLORS.primary}]}>
             <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, {color: COLORS.white}]}>Order Total</Text>
                <Text style={[styles.summaryValue, {color: COLORS.white, fontSize: 18}]}>₹{grandTotal.toLocaleString('en-IN')}</Text>
             </View>
          </View>

          <TouchableOpacity style={styles.mainBtn} onPress={handleSave} disabled={saving}>
             {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.mainBtnText}>Create Sales Order</Text>}
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
  saveText: { color: COLORS.primary, fontWeight: FONT.bold },
  scroll: { padding: SPACING.base },
  row: { flexDirection: 'row' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.base, ...SHADOW.card },
  sectionTitle: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.gray500, textTransform: 'uppercase', marginBottom: SPACING.md },
  label: { fontSize: 11, fontWeight: FONT.semibold, color: COLORS.gray600, marginBottom: 4 },
  input: { height: 44, backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, fontSize: 14, color: COLORS.gray900, borderWidth: 1, borderColor: COLORS.gray200 },
  addBtnText: { color: COLORS.secondary, fontWeight: 'bold', fontSize: 13 },
  itemRow: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.gray50 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemTitle: { fontSize: 13, fontWeight: 'bold', color: COLORS.secondary },
  itemNameText: { fontSize: 13, color: COLORS.gray700 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: COLORS.gray600, fontWeight: FONT.medium },
  summaryValue: { fontSize: 14, color: COLORS.gray900, fontWeight: 'bold' },
  mainBtn: { backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.base, ...SHADOW.md },
  mainBtnText: { color: COLORS.white, fontSize: 15, fontWeight: FONT.bold },
  select: { height: 44, backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.gray200, justifyContent: 'center' }
});
