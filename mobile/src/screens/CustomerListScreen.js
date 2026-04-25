import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { customersApi } from '../api/customers.api';
import { CustomerCard } from '../components/CustomerCard';
import { EmptyState } from '../components/EmptyState';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

export const CustomerListScreen = ({ navigation }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await customersApi.getCustomers({ 
        limit: 1000,
        sortBy: 'company:asc' 
      });
      // Handle various backend response formats (docs, results, data.results, customers)
      const data = res?.docs || res?.data?.docs || res?.results || res?.customers || res?.data?.results || (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
      setCustomers(data);
    } catch (e) {
      console.error('Customer fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const onRefresh = () => { setRefreshing(true); fetchCustomers(); };

  const filteredCustomers = customers.filter(c => {
    if (!c) return false;
    // 1. Status Filter
    if (activeFilter !== 'all' && c.status !== activeFilter) return false;

    // 2. Multi-field Search (Mirror of CRM Search)
    if (!search) return true;
    const q = search.toLowerCase();
    
    const company = (c.company || '').toLowerCase();
    const brand = (c.companyBrand || '').toLowerCase();
    const code = (c.customerCode || '').toLowerCase();
    const gst = (c.gstNumber || '').toLowerCase();
    const city = (c.city || '').toLowerCase();
    const state = (c.state || '').toLowerCase();
    
    // Search in contacts
    const contactMatch = c.contactPersons?.some(cp => 
      (cp.name || '').toLowerCase().includes(q) || 
      (cp.mobile || '').includes(q) ||
      (cp.email || '').toLowerCase().includes(q)
    );

    // Search in stickers/tags
    const tagMatch = c.stickers?.some(s => 
      (s.name || '').toLowerCase().includes(q)
    );

    return company.includes(q) || 
           brand.includes(q) || 
           code.includes(q) || 
           gst.includes(q) || 
           city.includes(q) || 
           state.includes(q) ||
           contactMatch ||
           tagMatch;
  });

  const FilterTab = ({ label, value }) => (
    <TouchableOpacity 
      style={[styles.filterTab, activeFilter === value && styles.filterTabActive]}
      onPress={() => setActiveFilter(value)}
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
          <Text style={styles.subtitle}>{customers.length} Sync'd Records</Text>
        </View>
        <TouchableOpacity 
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

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
          data={filteredCustomers}
          keyExtractor={(item) => item._id || Math.random().toString()}
          renderItem={({ item }) => (
            <CustomerCard
              customer={item}
              onPress={(customer) => navigation.navigate('CustomerDetail', { customer })}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon="👤"
              message={search ? "No matching records" : "No customers found"}
              subtext="Pull down to refresh live data"
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
});
