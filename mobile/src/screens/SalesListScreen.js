import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { salesApi } from '../api/sales.api';
import { SalesCard } from '../components/SalesCard';
import { EmptyState } from '../components/EmptyState';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

export const SalesListScreen = ({ navigation }) => {
  const [data, setData] = useState([]);
  const [activeTab, setActiveTab] = useState('invoices');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    try {
      let res;
      if (activeTab === 'invoices') {
        res = await salesApi.getInvoices({ limit: 500 });
      } else {
        res = await salesApi.getSalesOrders({ limit: 500 });
      }
      
      // Handle backend keys: 'invoices' or 'salesOrders'
      const results = res?.results || res?.invoices || res?.salesOrders || res?.data || (Array.isArray(res) ? res : []);
      setData(results);
    } catch (e) {
      console.error('Sales fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const filteredData = data.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    // Use correct backend fields: invoiceNumber, soNumber, customerName
    const no = (item.invoiceNumber || item.soNumber || item.invoiceNo || item.orderNo || '').toLowerCase();
    const cust = (item.customerName || item.customer?.companyName || item.customer?.name || '').toLowerCase();
    return no.includes(q) || cust.includes(q);
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Sales Register</Text>
          <Text style={styles.subtitle}>{activeTab === 'invoices' ? 'Tax Invoices' : 'Sales Orders'}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
             style={styles.addBtn}
             onPress={() => navigation.navigate(activeTab === 'invoices' ? 'CreateInvoice' : 'CreateOrder')}
          >
            <Text style={styles.addBtnText}>+ {activeTab === 'invoices' ? 'Invoice' : 'Order'}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'invoices' && styles.activeTab]} 
          onPress={() => { setLoading(true); setActiveTab('invoices'); }}
        >
          <Text style={[styles.tabText, activeTab === 'invoices' && styles.activeTabText]}>INVOICES</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'orders' && styles.activeTab]} 
          onPress={() => { setLoading(true); setActiveTab('orders'); }}
        >
          <Text style={[styles.tabText, activeTab === 'orders' && styles.activeTabText]}>ORDERS</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={`🔍 Search ${activeTab === 'invoices' ? 'Inv' : 'Order'} No or Customer...`}
          placeholderTextColor={COLORS.gray400}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching {activeTab}...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item._id || Math.random().toString()}
          renderItem={({ item }) => (
            <SalesCard
              invoice={item}
              type={activeTab === 'invoices' ? 'invoice' : 'order'}
              onPress={(val) => navigation.navigate('SalesDetail', { [activeTab === 'invoices' ? 'invoice' : 'order']: val })}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon="📄"
              message={search ? "No matching invoices found" : "No invoices found"}
              subtext="Pull down to refresh"
            />
          }
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
  },
  title: { fontSize: FONT.lg, fontWeight: FONT.bold, color: COLORS.white },
  subtitle: { fontSize: FONT.xs, color: COLORS.white + '99', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  addBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, ...SHADOW.sm },
  addBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold' },
  backBtn: { backgroundColor: COLORS.white + '20', borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 6 },
  backText: { color: COLORS.white, fontSize: 13, fontWeight: FONT.semibold },
  searchRow: { 
    padding: SPACING.base, 
    backgroundColor: COLORS.white, 
    borderBottomWidth: 1, 
    borderBottomColor: COLORS.gray100,
    ...SHADOW.card 
  },
  searchInput: {
    height: 42, backgroundColor: COLORS.gray50, borderWidth: 1.5,
    borderColor: COLORS.gray200, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.base,
    fontSize: FONT.sm, color: COLORS.gray900,
  },
  tabRow: { flexDirection: 'row', backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: COLORS.accent },
  tabText: { fontSize: 11, fontWeight: FONT.bold, color: COLORS.gray400 },
  activeTabText: { color: COLORS.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: SPACING.sm, color: COLORS.gray400, fontSize: FONT.sm },
});
