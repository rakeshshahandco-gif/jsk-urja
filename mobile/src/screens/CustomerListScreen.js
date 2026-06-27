import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { customersApi } from '../api/customers.api';
import { useCompany } from '../context/CompanyContext';
import { extractList } from '../utils/apiResponse';
import { DEFAULT_LIMIT, getTotalPages } from '../utils/pagination';
import { CustomerCard } from '../components/CustomerCard';
import { EmptyState } from '../components/EmptyState';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

export const CustomerListScreen = ({ navigation: navigationProp }) => {
  const navigation = useNavigation() || navigationProp;
  const { selectedCompany, loading: companyLoading } = useCompany();
  const companyId = selectedCompany?._id || selectedCompany?.id;
  const [customers, setCustomers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCustomers = useCallback(async (pageNum = 1, append = false) => {
    if (!companyId) return;
    setError('');
    try {
      const params = {
        page: pageNum,
        limit: DEFAULT_LIMIT,
        sortBy: 'company:asc',
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (activeFilter !== 'all') params.status = activeFilter;

      const res = await customersApi.getCustomers(params);
      const list = extractList(res, ['results', 'docs', 'customers']);
      setTotalPages(getTotalPages(res));
      setTotalResults(res?.totalResults ?? res?.total ?? list.length);
      setPage(pageNum);
      setCustomers((prev) => (append ? [...prev, ...list] : list));
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Failed to load customers';
      setError(msg);
      if (!append) setCustomers([]);
      console.error('Customer fetch error:', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [companyId, debouncedSearch, activeFilter]);

  useEffect(() => {
    if (companyLoading || !companyId) return;
    setLoading(true);
    fetchCustomers(1, false);
  }, [fetchCustomers, companyId, companyLoading]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCustomers(1, false);
  };

  const loadMore = () => {
    if (loadingMore || loading || page >= totalPages) return;
    setLoadingMore(true);
    fetchCustomers(page + 1, true);
  };

  const FilterTab = ({ label, value }) => (
    <TouchableOpacity 
      style={[styles.filterTab, activeFilter === value && styles.filterTabActive]}
      onPress={() => { setActiveFilter(value); setLoading(true); }}
    >
      <Text style={[styles.filterTabText, activeFilter === value && styles.filterTabTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Customer Master</Text>
          <Text style={styles.subtitle}>
            {totalResults > 0 ? `${totalResults} customers` : `${customers.length} loaded`}
            {totalPages > 1 ? ` · page ${page}/${totalPages}` : ''}
          </Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>Pull down to retry · check company on Home screen</Text>
        </View>
      ) : null}

      {/* Mirror Search Bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search Name, Phone, GST, City..."
          placeholderTextColor={COLORS.gray400}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => navigation.navigate('CreateCustomer')}
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Status Quick Filters */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.base }}>
          <FilterTab label="All" value="all" />
          <FilterTab label="Leads" value="lead" />
          <FilterTab label="Running High" value="running_high" />
          <FilterTab label="Running Low" value="running_low" />
          <FilterTab label="Inactive" value="inactive" />
        </ScrollView>
      </View>

      {/* Customer List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching Records...</Text>
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item._id || String(item.customerCode)}
          renderItem={({ item }) => (
            <CustomerCard
              customer={item}
              onPress={(customer) => navigation.navigate('CustomerDetail', {
                customerId: customer._id,
                customer,
              })}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={COLORS.primary} />
            ) : page < totalPages ? (
              <Text style={styles.loadMoreHint}>Scroll for more…</Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="👤"
              message={debouncedSearch ? 'No matching records' : 'No customers found'}
              subtext="Pull down to refresh · search uses server"
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
  backBtn: { backgroundColor: COLORS.white + '20', borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 5 },
  backText: { color: COLORS.white, fontSize: 13, fontWeight: FONT.semibold },
  searchRow: { 
    flexDirection: 'row', 
    padding: SPACING.base, 
    gap: SPACING.sm, 
    backgroundColor: COLORS.white, 
    ...SHADOW.sm 
  },
  searchInput: {
    flex: 1, height: 42, backgroundColor: COLORS.gray50, borderWidth: 1.5,
    borderColor: COLORS.gray200, borderRadius: RADIUS.md, paddingHorizontal: SPACING.base,
    fontSize: FONT.sm, color: COLORS.gray900,
  },
  newBtn: {
    backgroundColor: COLORS.secondary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.base, alignItems: 'center', justifyContent: 'center',
  },
  newBtnText: { color: COLORS.white, fontSize: FONT.sm, fontWeight: FONT.bold },
  filterRow: {
    backgroundColor: COLORS.white,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.gray100,
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.gray600,
  },
  filterTabTextActive: {
    color: COLORS.white,
  },
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
  loadMoreHint: { textAlign: 'center', color: COLORS.gray400, fontSize: FONT.xs, paddingVertical: 12 },
});
