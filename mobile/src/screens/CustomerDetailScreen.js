import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Share, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { conversationApi } from '../api/interaction.api';
import { customersApi } from '../api/customers.api';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../theme/colors';
import { useFocusEffect } from '@react-navigation/native';
import { navigateParent } from '../navigation/rootNavigation';

export const CustomerDetailScreen = ({ route, navigation }) => {
  const { customer: initialCustomer, customerId } = route.params || {};
  const resolvedId = customerId || initialCustomer?._id;
  const [customer, setCustomer] = useState(initialCustomer || null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(!initialCustomer);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchFullData = useCallback(async () => {
    if (!resolvedId) {
      setError('Customer not found');
      setLoading(false);
      return;
    }
    setError('');
    try {
      const [freshData, timelineData] = await Promise.all([
        customersApi.getCustomer(resolvedId),
        conversationApi.getConversationHistory(resolvedId).catch(() => []),
      ]);
      const c = freshData?.data || freshData;
      if (!c?._id) {
        setError('Customer not found');
        setCustomer(null);
      } else {
        setCustomer(c);
      }
      const hist = timelineData?.results || timelineData?.data?.results || timelineData?.data;
      setHistory(Array.isArray(hist) ? hist : Array.isArray(timelineData) ? timelineData : []);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Failed to load customer';
      setError(msg);
      console.error('Data sync error:', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resolvedId]);

  useFocusEffect(
    useCallback(() => {
      fetchFullData();
    }, [fetchFullData])
  );

  const onRefresh = () => { setRefreshing(true); fetchFullData(); };

  const handleCall = (phone) => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone) => {
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const waUrl = `whatsapp://send?phone=${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}`;
      Linking.openURL(waUrl).catch(() => alert('WhatsApp not found'));
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return '—';
    if (typeof addr === 'string') return addr;
    if (typeof addr === 'object') {
      return [addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') || '—';
    }
    return String(addr);
  };

  const handleShare = async () => {
    if (!customer) return;
    try {
      const primaryContact = customer.contactPersons?.find(c => c.isPrimary) || customer.contactPersons?.[0];
      await Share.share({
        message: `Customer Profile: ${customer.company || customer.name}\n` +
                 `Code: ${customer.customerCode || 'N/A'}\n` +
                 `Mobile: ${primaryContact?.mobile || 'N/A'}\n` +
                 `GST: ${customer.gstNumber || 'N/A'}\n` +
                 `Address: ${customer.city}, ${customer.state}`,
      });
    } catch (e) { console.error(e); }
  };

  const InfoCard = ({ title, icon, children }) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionIcon}>{icon}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );

  const InfoRow = ({ label, value, color, bold = false }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, color && { color }, bold && { fontWeight: FONT.extraBold }]}>{value || '—'}</Text>
    </View>
  );

  if (loading && !customer) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading customer…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !customer) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>❮ Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error || 'Customer not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const name = customer.company || customer.companyName || customer.customerName || 'Customer';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Mirror Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>❮ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={() => navigation.navigate('EditCustomer', { customer })} style={{marginRight: 15}}>
             <Text style={styles.editIcon}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare}>
             <Text style={styles.shareIcon}>📤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileMain}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{name}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.codeBadge}>
                  <Text style={styles.codeText}>{customer.customerCode || 'NO CODE'}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: COLORS.secondary + '20' }]}>
                  <Text style={[styles.statusText, { color: COLORS.secondary }]}>{customer.status || 'lead'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Stickers */}
          {Array.isArray(customer.stickers) && customer.stickers.length > 0 && (
            <View style={styles.stickerRow}>
              {customer.stickers.filter((s) => s && typeof s === 'object').map((s) => (
                <View key={s._id || s.name} style={[styles.sticker, { backgroundColor: (s.color || '#64748b') + '15', borderColor: s.color || '#64748b' }]}>
                  <Text style={[styles.stickerText, { color: s.color || '#64748b' }]}>{s.name || 'Tag'}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.callBtn]} onPress={() => handleCall(customer.contactPersons?.[0]?.mobile)}>
              <Text style={styles.actionBtnText}>📞 Call Primary</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.waBtn]} onPress={() => handleWhatsApp(customer.contactPersons?.[0]?.mobile)}>
              <Text style={styles.actionBtnText}>💬 WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Interaction History (Timeline Mirror) */}
        <InfoCard title="Recent Live Timeline" icon="🕒">
            {loading ? (
              <ActivityIndicator color={COLORS.primary} style={{ margin: 20 }} />
            ) : history.length > 0 ? (
              history.map((item, idx) => (
                <View key={item._id || idx} style={[styles.historyItem, idx === history.length - 1 && { borderLeftWidth: 0 }]}>
                  <View style={styles.historyDot} />
                  <View style={styles.historyContent}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyTitle}>
                        {item.mode?.toUpperCase()} LOG
                      </Text>
                      <Text style={styles.historyDate}>
                        {new Date(item.conversationDate || item.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.historyBody}>{item.discussionDetails}</Text>
                    {item.outcome ? <Text style={styles.historyOutcome}>➤ {item.outcome}</Text> : null}
                    <Text style={styles.historyUser}>— {item.user?.name || 'Assigned User'}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No recent interaction history synced.</Text>
            )}
            <TouchableOpacity
              style={styles.logBtn}
              onPress={() => Alert.alert('Coming soon', 'Add interaction is available on web CRM for now.')}
            >
              <Text style={styles.logBtnText}>+ Add New Interaction (Web)</Text>
            </TouchableOpacity>
        </InfoCard>

        {/* Section: Contact Persons */}
        <InfoCard title="Contact Registry" icon="👥">
           {customer.contactPersons?.map((cp, idx) => (
             <View key={idx} style={[styles.contactCard, idx > 0 && { marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.gray50, paddingTop: 10 }]}>
                <View style={styles.contactHeader}>
                  <Text style={styles.contactName}>{cp.name || 'Unnamed Contact'}</Text>
                  {cp.isPrimary && <View style={styles.primaryTag}><Text style={styles.primaryTagText}>PRIMARY</Text></View>}
                </View>
                <Text style={styles.contactInfo}>{cp.designation || 'Owner'}</Text>
                <View style={styles.contactActions}>
                   <TouchableOpacity onPress={() => handleCall(cp.mobile)}><Text style={styles.contactActionText}>📞 {cp.mobile || 'No Mobile'}</Text></TouchableOpacity>
                   {cp.email && <Text style={styles.contactActionText}>✉️ {cp.email}</Text>}
                </View>
             </View>
           ))}
        </InfoCard>

        {/* Section: Financials (Mirror of CRM Finance Tab) */}
        <InfoCard title="Finance & Legal" icon="💰">
            <InfoRow label="GST Registration" value={customer.gstRegistrationType} />
            <InfoRow label="GST Number" value={customer.gstNumber} color={COLORS.primary} bold />
            <InfoRow label="Credit Limit" value={`₹${customer.creditLimit || 0}`} color={COLORS.overdue} bold />
            <InfoRow label="Payment Terms" value={customer.paymentTerms} />
            <InfoRow label="Price List" value={customer.priceList} />
        </InfoCard>

        {/* Section: Location */}
        <InfoCard title="Location" icon="📍">
            <InfoRow label="Address" value={formatAddress(customer.address)} />
            <InfoRow label="City & State" value={`${customer.city}, ${customer.state}`} />
            <InfoRow label="Pincode" value={customer.pincode} />
        </InfoCard>
        
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Floating Quick Task Button */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => navigateParent(navigation, 'CreateTask', { customerId: customer._id })}
      >
        <Text style={styles.fabText}>+ Task</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.base, backgroundColor: COLORS.primary, ...SHADOW.md,
  },
  backBtn: { paddingVertical: 8 },
  backText: { color: COLORS.white, fontSize: FONT.sm, fontWeight: FONT.bold },
  headerTitle: { fontSize: 16, fontWeight: FONT.bold, color: COLORS.white, flex: 1, marginLeft: 15 },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  shareIcon: { fontSize: 18, color: COLORS.white },
  editIcon: { fontSize: 16, color: COLORS.white },
  scroll: { padding: SPACING.md },
  profileCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg,
    marginBottom: SPACING.md, ...SHADOW.lg,
  },
  profileMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  avatarLarge: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primary + '20',
    alignItems: 'center', justifyContent: 'center', marginRight: 15,
  },
  avatarLargeText: { fontSize: 28, fontWeight: FONT.bold, color: COLORS.primary },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: FONT.bold, color: COLORS.gray900, marginBottom: 4 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  codeBadge: { backgroundColor: COLORS.gray100, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  codeText: { fontSize: 11, color: COLORS.gray600, fontWeight: FONT.bold },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: FONT.extraBold, textTransform: 'uppercase' },
  stickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 15 },
  sticker: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  stickerText: { fontSize: 10, fontWeight: FONT.bold },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  callBtn: { backgroundColor: COLORS.secondary },
  waBtn: { backgroundColor: '#25D366' },
  actionBtnText: { color: COLORS.white, fontSize: 12, fontWeight: FONT.bold },
  section: { marginBottom: SPACING.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionIcon: { fontSize: 18, marginRight: 8 },
  sectionTitle: { fontSize: 13, fontWeight: FONT.extraBold, color: COLORS.gray800, textTransform: 'uppercase' },
  sectionCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOW.card },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.gray50 },
  infoLabel: { fontSize: 12, color: COLORS.gray500, flex: 1 },
  infoValue: { fontSize: 13, color: COLORS.gray900, fontWeight: FONT.semibold, flex: 2, textAlign: 'right' },
  historyItem: { borderLeftWidth: 2, borderLeftColor: COLORS.gray100, paddingLeft: 15, marginBottom: 20, position: 'relative' },
  historyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.secondary, position: 'absolute', left: -6, top: 4 },
  historyContent: { flex: 1 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  historyTitle: { fontSize: 11, fontWeight: FONT.bold, color: COLORS.secondary },
  historyDate: { fontSize: 10, color: COLORS.gray400 },
  historyBody: { fontSize: 14, color: COLORS.gray800, lineHeight: 20 },
  historyOutcome: { fontSize: 12, color: COLORS.primary, fontWeight: FONT.bold, marginTop: 4 },
  historyUser: { fontSize: 10, color: COLORS.gray400, marginTop: 4, fontStyle: 'italic' },
  emptyText: { textAlign: 'center', color: COLORS.gray400, fontSize: 12, paddingVertical: 20 },
  logBtn: { padding: 12, alignItems: 'center', marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.gray50 },
  logBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: FONT.bold },
  contactCard: { marginBottom: 5 },
  contactHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contactName: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.gray900 },
  primaryTag: { backgroundColor: COLORS.primary, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  primaryTagText: { color: COLORS.white, fontSize: 8, fontWeight: FONT.bold },
  contactInfo: { fontSize: 11, color: COLORS.gray500, marginBottom: 5 },
  contactActions: { flexDirection: 'column', gap: 4 },
  contactActionText: { fontSize: 13, color: COLORS.secondary, fontWeight: FONT.bold },
  fab: { position: 'absolute', right: 20, bottom: 30, backgroundColor: COLORS.secondary, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', ...SHADOW.lg },
  fabText: { color: COLORS.white, fontWeight: FONT.extraBold, fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  loadingText: { marginTop: SPACING.sm, color: COLORS.gray500 },
  errorText: { color: '#b91c1c', fontSize: FONT.md, textAlign: 'center', paddingHorizontal: SPACING.xl },
});
