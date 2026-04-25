import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, 
  StyleSheet, Modal, ActivityIndicator
} from 'react-native';
import { itemsApi } from '../api/items.api';
import { COLORS, FONT, RADIUS, SPACING, SHADOW } from '../theme/colors';

export const ItemSearchModal = ({ visible, onClose, onSelect }) => {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [query, visible]);

  const search = async () => {
    setLoading(true);
    try {
      const res = await itemsApi.searchItems(query);
      setItems(res || []);
    } catch (e) {
      console.warn('Search error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Product</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
             <TextInput
               style={styles.searchInput}
               placeholder="Search by code or name..."
               value={query}
               onChangeText={setQuery}
               autoFocus
             />
          </View>

          {loading ? (
            <ActivityIndicator style={{marginTop: 20}} color={COLORS.primary} />
          ) : (
            <FlatList
              data={items}
              keyExtractor={item => item._id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity 
                   style={styles.item}
                   onPress={() => { onSelect(item); onClose(); }}
                >
                  <View style={{flex: 1}}>
                    <Text style={styles.itemCode}>{item.itemCode}</Text>
                    <Text style={styles.itemName} numberOfLines={1}>{item.itemName}</Text>
                    <Text style={styles.itemMeta}>{item.hsnCode ? `HSN: ${item.hsnCode}` : ''} • Stock: {item.currentStock || 0}</Text>
                  </View>
                  <Text style={styles.itemPrice}>₹{item.standardRate || item.rate || 0}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No items found</Text>}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: { height: '85%', backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.base },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  title: { fontSize: 16, fontWeight: FONT.bold, color: COLORS.gray900 },
  closeText: { color: COLORS.overdue, fontWeight: FONT.bold },
  searchBox: { paddingBottom: SPACING.sm },
  searchInput: { height: 48, backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.gray200 },
  list: { paddingBottom: 20 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.gray50 },
  itemCode: { fontSize: 11, fontWeight: FONT.bold, color: COLORS.secondary, marginBottom: 2 },
  itemName: { fontSize: 14, fontWeight: FONT.semibold, color: COLORS.gray800 },
  itemMeta: { fontSize: 11, color: COLORS.gray500, marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.primary },
  empty: { textAlign: 'center', marginTop: 40, color: COLORS.gray400 }
});
