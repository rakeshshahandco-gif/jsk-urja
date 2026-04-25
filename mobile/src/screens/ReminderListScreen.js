import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { reminderApi } from '../api/interaction.api';
import { EmptyState } from '../components/EmptyState';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';
import { format } from 'date-fns';

export const ReminderListScreen = ({ navigation }) => {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReminders = useCallback(async () => {
    try {
      const res = await reminderApi.getReminders({ limit: 1000 });
      const data = res?.docs || res?.data?.docs || res?.results || res?.data?.results || res?.data || (Array.isArray(res) ? res : []);
      setReminders(data);
    } catch (e) {
      console.warn('Reminders fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);
  const onRefresh = () => { setRefreshing(true); fetchReminders(); };

  const formatDate = (date) => {
    if (!date) return '—';
    try { return format(new Date(date), 'dd MMM yyyy'); } catch { return '—'; }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Reminders</Text>
        <Text style={styles.subtitle}>{reminders.length} Records</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title || 'Reminder'}</Text>
                <View style={[styles.statusBadge, { backgroundColor: item.status === 'Closed' ? COLORS.success + '20' : COLORS.upcoming7 + '20' }]}>
                  <Text style={[styles.statusText, { color: item.status === 'Closed' ? COLORS.success : COLORS.upcoming7 }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.dateText}>📅 Due: {formatDate(item.reminderDate)}</Text>
              {item.description && <Text style={styles.descText} numberOfLines={2}>{item.description}</Text>}
              {item.customerId && (
                <Text style={styles.customerText}>👤 {item.customerId?.company || item.customerId?.customerName || 'Linked Customer'}</Text>
              )}
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="⏰" message="No reminders found" />}
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
  cardTitle: { flex: 1, fontSize: 15, fontWeight: FONT.bold, color: COLORS.gray900, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  dateText: { fontSize: 12, color: COLORS.primary, fontWeight: 'bold', marginBottom: 4 },
  descText: { fontSize: 13, color: COLORS.gray700, marginTop: 4 },
  customerText: { fontSize: 11, color: COLORS.secondary, marginTop: 6, fontWeight: 'bold' },
});
