import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Modal, TextInput, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { customersApi } from '../api/customers.api';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../theme/colors';

export const CustomerSearchModal = ({ visible, onClose, onSelect }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchCustomers = useCallback(async (q) => {
    setLoading(true);
    try {
      const res = await customersApi.getCustomers({ search: q, limit: 50 });
      const data = res?.docs || res?.data?.docs || res?.results || res?.data?.results || res?.data || (Array.isArray(res) ? res : []);
      setResults(data);
    } catch (e) {
      console.warn('Customer search error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) searchCustomers('');
  }, [visible, searchCustomers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (visible) searchCustomers(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, visible, searchCustomers]);

  const handleSelect = (customer) => {
    onSelect(customer);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Customer</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Close</Text></TouchableOpacity>
        </View>
        
        <View style={styles.searchBox}>
          <TextInput
            style={styles.input}
            placeholder="Search company, brand, code, GST..."
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={COLORS.primary} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => item._id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.card} onPress={() => handleSelect(item)}>
                <Text style={styles.companyName}>{item.company || item.customerName}</Text>
                <Text style={styles.detailText}>{item.customerCode} | GST: {item.gstNumber || 'N/A'}</Text>
                <Text style={styles.detailText}>{item.city}, {item.state}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No customers found</Text>}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.base, backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.gray200 },
  title: { fontSize: 16, fontWeight: 'bold' },
  closeText: { color: COLORS.primary, fontWeight: 'bold' },
  searchBox: { padding: SPACING.base, backgroundColor: COLORS.white },
  input: { height: 44, backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.gray300 },
  card: { padding: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  companyName: { fontSize: 15, fontWeight: 'bold', color: COLORS.gray900 },
  detailText: { fontSize: 12, color: COLORS.gray500, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 20, color: COLORS.gray500 }
});
