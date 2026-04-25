import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isPast, isToday, isWithinInterval, addDays, parseISO } from 'date-fns';
import { tasksApi } from '../api/tasks.api';
import { useAuth } from '../context/AuthContext';
import { TaskCard } from '../components/TaskCard';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

const categorizeToSections = (tasks) => {
  const now = new Date();
  const in7 = addDays(now, 7);
  
  const sections = [
    { title: 'OVERDUE', data: [], color: '#991b1b', bg: '#fee2e2', count: 0 },
    { title: 'TODAY', data: [], color: '#9a3412', bg: '#ffedd5', count: 0 },
    { title: 'UPCOMING (Within 7 Days)', data: [], color: '#854d0e', bg: '#fef9c3', count: 0 },
    { title: 'UPCOMING (Above 7 Days)', data: [], color: '#1e40af', bg: '#dbeafe', count: 0 },
  ];

  tasks.forEach(task => {
    // Skip finished tasks for the dashboard view
    const status = (task.status || '').toUpperCase();
    if (['COMPLETED', 'CLOSED', 'CONCLUDED'].includes(status)) return;

    const raw = task.nextDueDate || task.dueDate;
    if (!raw) { sections[3].data.push(task); return; }
    
    const d = typeof raw === 'string' ? parseISO(raw) : new Date(raw);
    
    if (isPast(d) && !isToday(d)) {
      sections[0].data.push(task);
      sections[0].count++;
    } else if (isToday(d)) {
      sections[1].data.push(task);
      sections[1].count++;
    } else if (isWithinInterval(d, { start: now, end: in7 })) {
      sections[2].data.push(task);
      sections[2].count++;
    } else {
      sections[3].data.push(task);
      sections[3].count++;
    }
  });

  return sections.filter(s => s.data.length > 0 || s.title === 'TODAY'); // Keep TODAY even if empty
};

export const TaskDashboardScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [sections, setSections] = useState([]);
  const [summary, setSummary] = useState({ overdue: 0, today: 0, upcoming: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchTasks = useCallback(async () => {
    try {
      const res = await tasksApi.getTasks({ limit: 1000 });
      const tasks = res?.results || res?.data?.tasks || res?.tasks || res?.data || (Array.isArray(res) ? res : []);
      const processed = categorizeToSections(tasks);
      setSections(processed);
      
      // Update summary counts
      setSummary({
        overdue: processed[0]?.count || 0,
        today: processed[1]?.count || 0,
        upcoming: (processed[2]?.count || 0) + (processed[3]?.count || 0)
      });
    } catch (e) {
      console.error('Task fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const onRefresh = () => { setRefreshing(true); fetchTasks(); };

  const filteredSections = sections.map(section => ({
    ...section,
    data: section.data.filter(t => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (t.title || t.name || '').toLowerCase().includes(q) ||
        (t.group?.name || t.group || '').toLowerCase().includes(q) ||
        (t.customerName || '').toLowerCase().includes(q)
      );
    })
  })).filter(s => s.data.length > 0 || s.title === 'TODAY');

  const userName = user?.name || user?.username || 'User';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Top Header - White Background */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.headerTitle}>Manage Tasks</Text>
          <Text style={styles.headerSubtitle}>Assign and follow up your business tasks</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('CreateTask')}>
          <Text style={styles.newBtnText}>+ New Task</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Bar - Greyish */}
      <View style={styles.filterBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search task name, group..."
          placeholderTextColor={COLORS.gray400}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Summary Status Bar - Mirrors Desktop Dots */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.summaryLabel}>OVERDUE: <Text style={{ fontWeight: 'bold' }}>{summary.overdue}</Text></Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />
          <Text style={styles.summaryLabel}>TODAY: <Text style={{ fontWeight: 'bold' }}>{summary.today}</Text></Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.dot, { backgroundColor: '#3b82f6' }]} />
          <Text style={styles.summaryLabel}>UPCOMING: <Text style={{ fontWeight: 'bold' }}>{summary.upcoming}</Text></Text>
        </View>
      </View>

      {/* Sectioned Task List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <SectionList
          sections={filteredSections}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onPress={(task) => navigation.navigate('TaskDetail', { task })}
            />
          )}
          renderSectionHeader={({ section: { title, color, bg, data } }) => (
            <View style={[styles.sectionHeader, { backgroundColor: bg }]}>
               <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
                  <View style={[styles.countBadge, { backgroundColor: color }]}>
                     <Text style={styles.countText}>{data.length}</Text>
                  </View>
               </View>
            </View>
          )}
          stickySectionHeadersEnabled={true}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
             <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: COLORS.gray400 }}>No tasks found matching your filters.</Text>
             </View>
          }
        />
      )}

      {/* Floating Action Menu Placeholder or Footer */}
      <View style={styles.footer}>
         <TouchableOpacity onPress={logout}>
            <Text style={{ color: COLORS.gray400, fontSize: 10 }}>Logged in as {userName} (Logout)</Text>
         </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  topHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.base, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.gray900 },
  headerSubtitle: { fontSize: 10, color: COLORS.gray400, marginTop: 2 },
  newBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.md },
  newBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 12 },
  filterBar: { padding: SPACING.base, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  searchInput: {
    height: 40, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.gray200,
    borderRadius: RADIUS.md, paddingHorizontal: 12, fontSize: 14,
  },
  summaryBar: {
    flexDirection: 'row', paddingHorizontal: SPACING.base, paddingVertical: 10,
    gap: 15, borderBottomWidth: 1, borderBottomColor: COLORS.gray100,
  },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  summaryLabel: { fontSize: 10, color: COLORS.gray600 },
  sectionHeader: {
    paddingHorizontal: SPACING.base, paddingVertical: 6,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  sectionTitle: { fontSize: 11, fontWeight: 'bold' },
  countBadge: { marginLeft: 8, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  countText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', bottom: 10, width: '100%', alignItems: 'center' },
});
