import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { salesApi } from '../api/sales.api';
import { useCompany } from '../context/CompanyContext';
import { navigateParent } from '../navigation/rootNavigation';
import { SalesCard } from '../components/SalesCard';
import { EmptyState } from '../components/EmptyState';
import { DEFAULT_LIMIT } from '../utils/pagination';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

export const SalesListScreen = ({ navigation }) => {
  const { selectedCompany, loading: companyLoading } = useCompany();
  const companyId = selectedCompany?._id || selectedCompany?.id;
  const [data, setData] = useState([]);
  const [activeTab, setActiveTab] = useState('invoices');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async (pageNum = 1, append = false) => {
    if (!companyId) return;
    setError('');
    try {
      const params = { page: pageNum, limit: DEFAULT_LIMIT };
      if (debouncedSearch) params.search = debouncedSearch;

      let list = [];
      if (activeTab === 'invoices') {
        const res = await salesApi.getInvoices(params);
        list = res?.invoices || [];
        const total = res?.total ?? list.length;
        setHasMore(pageNum * DEFAULT_LIMIT < total);
      } else {
        const res = await salesApi.getSalesOrders(params);
        list = res?.salesOrders || [];
        const total = res?.total ?? list.length;
        setHasMore(pageNum * DEFAULT_LIMIT < total);
      }
      setPage(pageNum);
      setData((prev) => (append ? [...prev, ...list] : list));
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Failed to load sales data';
      setError(msg);
      if (!append) setData([]);
      console.error('Sales fetch error:', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [activeTab, companyId, debouncedSearch]);

  useEffect(() => {
    if (companyLoading || !companyId) return;
    setLoading(true);
    fetchData(1, false);
  }, [fetchData, companyId, companyLoading]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(1, false);
  };

  const loadMore = () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    fetchData(page + 1, true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Sales Register</Text>
          <Text style={styles.subtitle}>{activeTab === 'invoices' ? 'Tax Invoices' : 'Sales Orders'}</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigateParent(navigation, activeTab === 'invoices' ? 'CreateInvoice' : 'CreateOrder')}
        >
          <Text style={styles.addBtnText}>+ {activeTab === 'invoices' ? 'Invoice' : 'Order'}</Text>
        </TouchableOpacity>
      </View>

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

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>Pull down to retry</Text>
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${activeTab === 'invoices' ? 'invoice' : 'order'} no or customer…`}
          placeholderTextColor={COLORS.gray400}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching {activeTab}…</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <SalesCard
              invoice={item}
              type={activeTab === 'invoices' ? 'invoice' : 'order'}
              onPress={(val) => navigateParent(navigation, 'SalesDetail', {
                docId: val._id,
                docType: activeTab === 'invoices' ? 'invoice' : 'order',
              })}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={COLORS.primary} /> : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="📄"
              message={debouncedSearch ? 'No matching records' : 'No records found'}
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
  addBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 6, ...SHADOW.sm },
  addBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold' },
  searchRow: {
    padding: SPACING.base,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
    ...SHADOW.card,
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
  errorBanner: {
    marginHorizontal: SPACING.base,
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: '#fef2f2',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { color: '#b91c1c', fontSize: FONT.sm, fontWeight: FONT.semibold },
  errorHint: { color: '#991b1b', fontSize: FONT.xs, marginTop: 4 },
});
