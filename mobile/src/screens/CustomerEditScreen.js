import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, 
  TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { customersApi } from '../api/customers.api';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../theme/colors';
import { DEMAND_PRODUCTS, CUSTOMER_TYPES, GST_REGISTRATION_TYPES } from '../utils/constants';

export const CustomerEditScreen = ({ route, navigation }) => {
  const { customer } = route.params;
  const [loading, setLoading] = useState(false);
  const [stickersList, setStickersList] = useState([]);
  const [isCustomType, setIsCustomType] = useState(false);
  
  const [form, setForm] = useState({
    company: customer.company || customer.companyName || '',
    customerName: customer.customerName || customer.name || '',
    companyBrand: customer.companyBrand || '',
    customerCode: customer.customerCode || '',
    status: customer.status || customer.customerStatus || 'lead',
    customerType: customer.customerType || '',
    category: customer.category || 'B2B',
    gstRegistrationType: customer.gstRegistrationType || 'Regular',
    gstNumber: customer.gstNumber || '',
    address: customer.address || '',
    city: customer.city || '',
    state: customer.state || 'Maharashtra',
    pincode: customer.pincode || '',
    country: customer.country || 'India',
    creditPeriod: String(customer.creditPeriod || '0'),
    paymentType: customer.paymentType || 'Credit',
    priceList: customer.priceList || '',
    contactPersons: customer.contactPersons?.length > 0 
      ? customer.contactPersons 
      : [{ name: '', mobile: '', email: '', designation: 'Owner', isPrimary: true }],
    stickers: customer.stickers?.map(s => s._id || s) || [],
    interestedProducts: customer.interestedProducts || [],
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const stickersRes = await customersApi.getCustomerStickers();
        setStickersList(stickersRes || []);
        
        // Check if current customer type is in standard list
        if (customer.customerType && !CUSTOMER_TYPES.includes(customer.customerType)) {
          setIsCustomType(true);
        }
      } catch (e) {
        console.warn('Metadata fetch error');
      }
    };
    fetchData();
  }, []);

  const handleUpdate = async () => {
    if (!form.company || !form.contactPersons[0].mobile) {
      Alert.alert('Required Fields', 'Company Name and Primary Mobile are mandatory.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        creditPeriod: parseInt(form.creditPeriod) || 0,
      };

      await customersApi.updateCustomer(customer._id, payload);
      Alert.alert('Success ✅', 'Profile updated successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      Alert.alert('Update Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const addContact = () => {
    setForm({
      ...form,
      contactPersons: [...form.contactPersons, { name: '', mobile: '', email: '', designation: '', isPrimary: false }]
    });
  };

  const updateContact = (index, field, value) => {
    const updated = [...form.contactPersons];
    updated[index][field] = value;
    setForm({ ...form, contactPersons: updated });
  };

  const toggleSticker = (stickerId) => {
    const current = [...form.stickers];
    const index = current.indexOf(stickerId);
    if (index > -1) current.splice(index, 1);
    else current.push(stickerId);
    setForm({ ...form, stickers: current });
  };

  const toggleProduct = (prod) => {
    const current = [...form.interestedProducts];
    const index = current.indexOf(prod);
    if (index > -1) current.splice(index, 1);
    else current.push(prod);
    setForm({ ...form, interestedProducts: current });
  };

  const InputField = ({ label, value, onChangeText, placeholder, keyboardType = 'default', required = false, multiline = false }) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label} {required && <Text style={{color: COLORS.overdue}}>*</Text>}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.gray400}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile (Cloud Sync)</Text>
        <TouchableOpacity onPress={handleUpdate} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Text style={styles.saveText}>Update</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          
          {/* Section: Identity */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Company Identity</Text>
            </View>
            <InputField 
              label="Company Name" 
              required
              value={form.company} 
              onChangeText={(t) => setForm({...form, company: t})}
            />
            <InputField 
              label="Company Brand" 
              value={form.companyBrand} 
              onChangeText={(t) => setForm({...form, companyBrand: t})}
            />
             <InputField 
              label="Individual Name" 
              value={form.customerName} 
              onChangeText={(t) => setForm({...form, customerName: t})}
            />
          </View>

          {/* Section: Business Details */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Business Details</Text>
            </View>
            
            <View style={styles.inputGroup}>
                <Text style={styles.label}>Customer Type</Text>
                {!isCustomType ? (
                  <View style={styles.typeCloud}>
                    {CUSTOMER_TYPES.map(t => (
                      <TouchableOpacity 
                        key={t}
                        onPress={() => setForm({...form, customerType: t})}
                        style={[styles.miniBtn, form.customerType === t && styles.miniBtnActive]}
                      >
                        <Text style={[styles.miniBtnText, form.customerType === t && styles.miniBtnTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity onPress={() => { setIsCustomType(true); setForm({...form, customerType: ''}); }} style={styles.miniBtn}>
                       <Text style={styles.miniBtnText}>+ CUSTOM</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.row}>
                    <TextInput 
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Enter custom type"
                      value={form.customerType}
                      onChangeText={(t) => setForm({...form, customerType: t.toUpperCase()})}
                    />
                    <TouchableOpacity onPress={() => setIsCustomType(false)} style={styles.listBtn}>
                       <Text style={styles.listBtnText}>LIST</Text>
                    </TouchableOpacity>
                  </View>
                )}
            </View>

            <View style={styles.row}>
               <View style={{ flex: 1 }}>
                 <InputField label="Credit Days" keyboardType="numeric" value={form.creditPeriod} onChangeText={(t) => setForm({...form, creditPeriod: t})} />
               </View>
               <View style={{ width: 10 }} />
               <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Payment Type</Text>
                  <View style={styles.row}>
                     {['Cash', 'Credit'].map(p => (
                       <TouchableOpacity 
                         key={p}
                         onPress={() => setForm({...form, paymentType: p})}
                         style={[styles.payBtn, form.paymentType === p && styles.payBtnActive]}
                       >
                         <Text style={[styles.payBtnText, form.paymentType === p && styles.payBtnTextActive]}>{p}</Text>
                       </TouchableOpacity>
                     ))}
                  </View>
               </View>
            </View>

            <Text style={styles.label}>Interested Products</Text>
            <View style={styles.typeCloud}>
               {DEMAND_PRODUCTS.map(p => (
                 <TouchableOpacity 
                   key={p}
                   onPress={() => toggleProduct(p)}
                   style={[styles.prodBtn, form.interestedProducts.includes(p) && styles.prodBtnActive]}
                 >
                   <Text style={[styles.prodBtnText, form.interestedProducts.includes(p) && styles.prodBtnTextActive]}>{p}</Text>
                 </TouchableOpacity>
               ))}
            </View>
          </View>

          {/* Section: Contact Registry */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Contact Registry</Text>
            </View>
            {form.contactPersons.map((contact, idx) => (
              <View key={idx} style={[styles.contactItem, idx > 0 && styles.contactBorder]}>
                <Text style={styles.contactIndex}>Person #{idx + 1} {contact.isPrimary && '(Primary)'}</Text>
                <InputField label="Name" required={idx === 0} value={contact.name} onChangeText={(v) => updateContact(idx, 'name', v)} />
                <InputField label="Mobile" keyboardType="phone-pad" value={contact.mobile} onChangeText={(v) => updateContact(idx, 'mobile', v)} />
              </View>
            ))}
            <TouchableOpacity style={styles.addBtn} onPress={addContact}>
              <Text style={styles.addBtnText}>+ Add More Contact</Text>
            </TouchableOpacity>
          </View>

          {/* Section: Tax & Financials */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tax & Financials</Text>
            </View>
            <InputField label="GSTIN" value={form.gstNumber} onChangeText={(t) => setForm({...form, gstNumber: t.toUpperCase()})} />
            
            <View style={styles.inputGroup}>
                <Text style={styles.label}>CRM Status</Text>
                <View style={styles.typeRow}>
                    {['lead', 'running_high', 'running_low', 'inactive'].map(s => (
                        <TouchableOpacity 
                            key={s}
                            onPress={() => setForm({...form, status: s})}
                            style={[styles.statusBtn, form.status === s && { backgroundColor: COLORS.primary }]}
                        >
                            <Text style={[styles.statusBtnText, form.status === s && { color: COLORS.white }]}>{s.split('_')[0].toUpperCase()}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <Text style={styles.label}>Stickers (Tags)</Text>
            <View style={styles.stickerCloud}>
              {stickersList.map(s => (
                <TouchableOpacity 
                  key={s._id}
                  onPress={() => toggleSticker(s._id)}
                  style={[
                    styles.stickerItem, 
                    form.stickers.includes(s._id) && { backgroundColor: (s.color || '#64748b') + '30', borderColor: s.color }
                  ]}
                >
                   <Text style={[styles.stickerText, { color: s.color || COLORS.gray700 }]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.mainBtn, loading && { opacity: 0.7 }]} 
            onPress={handleUpdate}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.mainBtnText}>Update Live Profile</Text>}
          </TouchableOpacity>
          
          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.base, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100
  },
  cancelText: { color: COLORS.gray500, fontSize: 14, fontWeight: FONT.semibold },
  headerTitle: { fontSize: 15, fontWeight: FONT.bold, color: COLORS.primary },
  saveText: { color: COLORS.accent, fontSize: 15, fontWeight: FONT.bold },
  scroll: { padding: SPACING.md },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOW.card },
  sectionHeader: { marginBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.gray50, paddingBottom: 6 },
  sectionTitle: { fontSize: 11, fontWeight: FONT.bold, color: COLORS.gray500, textTransform: 'uppercase' },
  inputGroup: { marginBottom: SPACING.md },
  label: { fontSize: 11, fontWeight: FONT.bold, color: COLORS.gray400, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    height: 44, backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, 
    paddingHorizontal: SPACING.md, fontSize: 14, color: COLORS.gray900,
    borderWidth: 1, borderColor: COLORS.gray200
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  contactItem: { marginVertical: 8 },
  contactBorder: { paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.gray50 },
  contactIndex: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.primary, marginBottom: 5 },
  addBtn: { padding: 8, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md },
  addBtnText: { color: COLORS.primary, fontSize: 11, fontWeight: FONT.bold },
  typeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: COLORS.gray100 },
  statusBtnText: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.gray700 },
  mainBtn: {
    backgroundColor: COLORS.accent, height: 54, borderRadius: RADIUS.lg,
    alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm,
    ...SHADOW.strong
  },
  mainBtnText: { color: COLORS.white, fontSize: 16, fontWeight: FONT.bold },
  typeCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.md, backgroundColor: COLORS.gray100, alignItems: 'center', marginBottom: 4 },
  miniBtnActive: { backgroundColor: COLORS.secondary },
  miniBtnText: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.gray600 },
  miniBtnTextActive: { color: COLORS.white },
  listBtn: { marginLeft: 10, padding: 10, backgroundColor: COLORS.gray200, borderRadius: RADIUS.md },
  listBtnText: { fontSize: 10, fontWeight: FONT.bold },
  payBtn: { flex: 1, height: 40, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md },
  payBtnActive: { backgroundColor: COLORS.primary },
  payBtnText: { fontSize: 12, fontWeight: FONT.bold, color: COLORS.gray700 },
  payBtnTextActive: { color: COLORS.white },
  prodBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 15, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.gray200, marginBottom: 4 },
  prodBtnActive: { backgroundColor: COLORS.primary + '20', borderColor: COLORS.primary },
  prodBtnText: { fontSize: 10, color: COLORS.gray700 },
  prodBtnTextActive: { color: COLORS.primary, fontWeight: FONT.bold },
  stickerCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  stickerItem: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15, borderWidth: 1, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  stickerText: { fontSize: 11, fontWeight: FONT.bold },
});

