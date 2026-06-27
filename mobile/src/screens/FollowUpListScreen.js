import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { followupApi } from '../api/interaction.api';
import { EmptyState } from '../components/EmptyState';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';
import { format } from 'date-fns';

export const FollowUpListScreen = ({ navigation }) => {
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFollowups = useCallback(async () => {
    try {
      const res = await followupApi.getFollowups({ limit: 50, page: 1 });
      const data = res?.docs || res?.data?.docs || res?.results || res?.data?.results || res?.data || (Array.isArray(res) ? res : []);
      setFollowups(data);
    } catch (e) {
      console.warn('Followups fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchFollowups(); }, [fetchFollowups]);
  const onRefresh = () => { setRefreshing(true); fetchFollowups(); };

  const formatDate = (date) => {
    if (!date) return '—';
    try { return format(new Date(date), 'dd MMM yyyy'); } catch { return '—'; }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Follow-ups</Text>
        <Text style={styles.subtitle}>{followups.length} Records</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={followups}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.customerName} numberOfLines={1}>{item.customerId?.company || item.customerId?.customerName || 'Unknown Customer'}</Text>
                <View style={[styles.statusBadge, { backgroundColor: item.status === 'Completed' ? COLORS.success + '20' : COLORS.overdue + '20' }]}>
                  <Text style={[styles.statusText, { color: item.status === 'Completed' ? COLORS.success : COLORS.overdue }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.dateText}>📅 Due: {formatDate(item.followUpDate)}</Text>
              <Text style={styles.typeText}>Type: {item.followUpType}</Text>
              {item.notes && <Text style={styles.notesText} numberOfLines={2}>{item.notes}</Text>}
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="🤝" message="No follow-ups found" />}
          contentContainerStyle={{ padding: SPACING.base, paddingBottom: 80 }}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACING.base, backgroundColor: COLORS.primary },
  title: { fontSize: 20, fontWeight: FONT.bold, color: COLORS.white },
  subtitle: { fontSize: 12, color: COLORS.white + 'cc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOW.card },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  customerName: { flex: 1, fontSize: 15, fontWeight: FONT.bold, color: COLORS.gray900, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  dateText: { fontSize: 12, color: COLORS.primary, fontWeight: 'bold', marginBottom: 4 },
  typeText: { fontSize: 12, color: COLORS.gray600, marginBottom: 4 },
  notesText: { fontSize: 13, color: COLORS.gray700, marginTop: 4, fontStyle: 'italic' },
});
