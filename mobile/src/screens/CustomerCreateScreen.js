import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, 
  TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { customersApi } from '../api/customers.api';
import { conversationApi, followupApi } from '../api/interaction.api';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../theme/colors';
import { DEMAND_PRODUCTS, CUSTOMER_TYPES, GST_REGISTRATION_TYPES } from '../utils/constants';

export const CustomerCreateScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [stickersList, setStickersList] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState({ show: false, field: 'followUpDate' });
  const [isCustomType, setIsCustomType] = useState(false);
  
  const [form, setForm] = useState({
    company: '',
    customerName: '',
    companyBrand: '',
    customerCode: '',
    status: 'lead',
    customerType: '',
    category: 'B2B',
    gstRegistrationType: 'Regular',
    gstNumber: '',
    address: '',
    city: '',
    state: 'Maharashtra',
    pincode: '',
    country: 'India',
    creditPeriod: '0',
    paymentType: 'Credit',
    assignedSalesperson: '',
    contactPersons: [{ name: '', mobile: '', email: '', designation: 'Owner', isPrimary: true }],
    stickers: [],
    interestedProducts: [],
    // Initial Follow-up fields
    followUpDate: new Date(),
    nextActionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days later
    initialConversation: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const stickersRes = await customersApi.getCustomerStickers();
        setStickersList(stickersRes || []);
      } catch (e) {
        console.warn('Metadata fetch error');
      }
    };
    fetchData();
  }, []);

  const handleSave = async () => {
    if (!form.company || !form.contactPersons[0].mobile) {
      Alert.alert('Required Fields', 'Company Name and Primary Mobile are mandatory.');
      return;
    }

    setLoading(true);
    try {
      // 1. Create Customer
      const payload = {
        ...form,
        creditPeriod: parseInt(form.creditPeriod) || 0,
      };

      const customerRes = await customersApi.createCustomer(payload);
      const customerId = customerRes._id || customerRes.data?._id;

      // 2. Log Initial Conversation if provided
      if (form.initialConversation && customerId) {
          await conversationApi.createConversation({
            customerId: customerId,
            mode: 'call',
            discussionDetails: form.initialConversation,
            outcome: 'Initial contact during creation',
          });

          // Create/Update Follow-up
          await followupApi.createFollowup({
            customerId: customerId,
            nextCallDate: form.nextActionDate,
            nextCallTime: '10:00',
            whatToTalkNext: 'Follow up from creation',
            priority: 'medium',
          });
      }

      Alert.alert('Success ✅', 'Customer added to CRM successfully!', [
        { text: 'View List', onPress: () => navigation.navigate('CustomerList') },
        { text: 'Add Another', onPress: () => navigation.replace('CustomerCreate') }
      ]);
    } catch (e) {
      Alert.alert('Save Failed', e.message);
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

  const handleDateChange = (event, selectedDate) => {
    const field = showDatePicker.field;
    setShowDatePicker({ ...showDatePicker, show: false });
    if (selectedDate) {
      setForm({ ...form, [field]: selectedDate });
    }
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
        <Text style={styles.headerTitle}>New Customer (Sync Mode)</Text>
        <TouchableOpacity onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Text style={styles.saveText}>Save</Text>}
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
              <Text style={styles.sectionIcon}>🏢</Text>
              <Text style={styles.sectionTitle}>Company Identity</Text>
            </View>
            <InputField 
              label="Company Name" 
              required
              value={form.company} 
              onChangeText={(t) => setForm({...form, company: t})}
              placeholder="e.g. Acme Corporation"
            />
            <InputField 
              label="Company Brand (Optional)" 
              value={form.companyBrand} 
              onChangeText={(t) => setForm({...form, companyBrand: t})}
              placeholder="e.g. Acme Tech"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <InputField 
                  label="Customer Code" 
                  value={form.customerCode} 
                  onChangeText={(t) => setForm({...form, customerCode: t})}
                  placeholder="CODE01"
                />
              </View>
              <View style={{ width: SPACING.base }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Category</Text>
                <View style={styles.pickerContainer}>
                   <Text style={styles.pickerValue}>{form.category}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Section: Business Details */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>💼</Text>
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

          {/* Section: Contacts (Array) */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>👤</Text>
              <Text style={styles.sectionTitle}>Contact Persons</Text>
            </View>
            {form.contactPersons.map((contact, idx) => (
              <View key={idx} style={[styles.contactItem, idx > 0 && styles.contactBorder]}>
                <Text style={styles.contactIndex}>Contact #{idx + 1} {contact.isPrimary && '(Primary)'}</Text>
                <InputField 
                  label="Full Name"
                  required={idx === 0}
                  value={contact.name}
                  onChangeText={(v) => updateContact(idx, 'name', v)}
                />
                <InputField 
                  label="Mobile Number"
                  required={idx === 0}
                  keyboardType="phone-pad"
                  value={contact.mobile}
                  onChangeText={(v) => updateContact(idx, 'mobile', v)}
                />
                <InputField 
                  label="Email"
                  keyboardType="email-address"
                  value={contact.email}
                  onChangeText={(v) => updateContact(idx, 'email', v)}
                />
              </View>
            ))}
            <TouchableOpacity style={styles.addBtn} onPress={addContact}>
              <Text style={styles.addBtnText}>+ Add Contact Person</Text>
            </TouchableOpacity>
          </View>

          {/* Section: GST & Financials */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>⚖️</Text>
              <Text style={styles.sectionTitle}>GST & Legal</Text>
            </View>
            <InputField 
              label="GSTIN" 
              value={form.gstNumber} 
              onChangeText={(t) => setForm({...form, gstNumber: t.toUpperCase()})}
              placeholder="15-char code"
              autoCapitalize="characters"
            />
            <View style={styles.inputGroup}>
                <Text style={styles.label}>Registration Type</Text>
                <View style={styles.typeCloud}>
                    {GST_REGISTRATION_TYPES.slice(0, 4).map(t => (
                        <TouchableOpacity 
                            key={t}
                            onPress={() => setForm({...form, gstRegistrationType: t})}
                            style={[styles.miniBtn, form.gstRegistrationType === t && styles.miniBtnActive]}
                        >
                            <Text style={[styles.miniBtnText, form.gstRegistrationType === t && styles.miniBtnTextActive]}>{t}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
          </View>

          {/* Section: Initial Follow-up */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>📅</Text>
              <Text style={styles.sectionTitle}>Initial Follow-up</Text>
            </View>
            <View style={styles.row}>
               <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowDatePicker({ show: true, field: 'followUpDate' })}>
                  <Text style={styles.label}>Creation Date</Text>
                  <View style={styles.dateDisplay}>
                     <Text style={styles.dateText}>{form.followUpDate.toLocaleDateString()}</Text>
                  </View>
               </TouchableOpacity>
               <View style={{ width: 10 }} />
               <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowDatePicker({ show: true, field: 'nextActionDate' })}>
                  <Text style={styles.label}>Next Call Date</Text>
                  <View style={styles.dateDisplay}>
                     <Text style={styles.dateText}>{form.nextActionDate.toLocaleDateString()}</Text>
                  </View>
               </TouchableOpacity>
            </View>
            <InputField 
              label="Initial Conversation Details" 
              multiline 
              value={form.initialConversation}
              onChangeText={(t) => setForm({...form, initialConversation: t})}
              placeholder="Enter brief discussion highlights..."
            />
          </View>

          {/* Section: Status & Stickers */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>🏷️</Text>
              <Text style={styles.sectionTitle}>Status & Stickers</Text>
            </View>
            <View style={styles.inputGroup}>
                <Text style={styles.label}>CRM Status</Text>
                <View style={[styles.typeRow, { flexWrap: 'wrap' }]}>
                    {['lead', 'running_high', 'running_low', 'inactive'].map(s => (
                        <TouchableOpacity 
                            key={s}
                            onPress={() => setForm({...form, status: s})}
                            style={[styles.statusBtn, form.status === s && { backgroundColor: COLORS.primary }]}
                        >
                            <Text style={[styles.statusBtnText, form.status === s && { color: COLORS.white }]}>
                              {s.split('_').join(' ').toUpperCase()}
                            </Text>
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
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.mainBtnText}>Sync to Cloud CRM</Text>}
          </TouchableOpacity>
          
          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {showDatePicker.show && (
        <DateTimePicker
          value={form[showDatePicker.field]}
          mode="date"
          onChange={handleDateChange}
        />
      )}
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray100, paddingBottom: 8 },
  sectionIcon: { fontSize: 18, marginRight: 8 },
  sectionTitle: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.gray800, textTransform: 'uppercase' },
  inputGroup: { marginBottom: SPACING.md },
  label: { fontSize: 11, fontWeight: FONT.bold, color: COLORS.gray500, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    height: 44, backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, 
    paddingHorizontal: SPACING.md, fontSize: 14, color: COLORS.gray900,
    borderWidth: 1, borderColor: COLORS.gray200
  },
  textArea: { height: 80, textAlignVertical: 'top', paddingTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  pickerContainer: { height: 44, backgroundColor: COLORS.gray100, borderRadius: RADIUS.md, justifyContent: 'center', paddingHorizontal: 12 },
  pickerValue: { fontSize: 14, color: COLORS.gray600, fontWeight: FONT.bold },
  contactItem: { marginVertical: 8 },
  contactBorder: { paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.gray50 },
  contactIndex: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.primary, marginBottom: 5 },
  addBtn: { padding: 10, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, marginTop: 10 },
  addBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: FONT.bold },
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
  dateDisplay: { height: 44, backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.gray200, justifyContent: 'center', paddingHorizontal: 12, marginBottom: 10 },
  dateText: { fontSize: 14, color: COLORS.gray900 },
  statusBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.gray100, marginBottom: 5 },
  statusBtnText: { fontSize: 9, fontWeight: FONT.extraBold, color: COLORS.gray700 },
  stickerCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  stickerItem: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15, borderWidth: 1, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  stickerText: { fontSize: 11, fontWeight: FONT.bold },
  mainBtn: {
    backgroundColor: COLORS.primary, height: 54, borderRadius: RADIUS.lg,
    alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm,
    ...SHADOW.strong
  },
  mainBtnText: { color: COLORS.white, fontSize: 16, fontWeight: FONT.bold },
});

