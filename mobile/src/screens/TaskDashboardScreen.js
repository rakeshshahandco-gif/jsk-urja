import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isPast, isToday, isWithinInterval, addDays, parseISO } from 'date-fns';
import { tasksApi } from '../api/tasks.api';
import { useAuth } from '../context/AuthContext';
import { TaskCard } from '../components/TaskCard';
import { EmptyState } from '../components/EmptyState';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

const TABS = [
  { id: 'overdue', label: 'Overdue', emoji: '🔴', color: COLORS.overdue },
  { id: 'today', label: 'Today', emoji: '🟡', color: COLORS.today },
  { id: 'week', label: '7 Days', emoji: '🔵', color: COLORS.upcoming7 },
  { id: 'future', label: 'Future', emoji: '🟢', color: COLORS.upcomingMore },
  { id: 'history', label: 'History', emoji: '📁', color: COLORS.gray500 },
];

const categorize = (tasks) => {
  const now = new Date();
  const in7 = addDays(now, 7);
  const result = { overdue: [], today: [], week: [], future: [], history: [] };

  tasks.forEach(task => {
    // If task is finished, move to history
    const status = (task.status || '').toUpperCase();
    if (['COMPLETED', 'CLOSED', 'CONCLUDED'].includes(status)) {
        result.history.push(task);
        return;
    }

    const raw = task.nextDueDate || task.dueDate;
    if (!raw) { result.future.push(task); return; }
    const d = typeof raw === 'string' ? parseISO(raw) : new Date(raw);
    if (isPast(d) && !isToday(d)) result.overdue.push(task);
    else if (isToday(d)) result.today.push(task);
    else if (isWithinInterval(d, { start: now, end: in7 })) result.week.push(task);
    else result.future.push(task);
  });
  return result;
};

export const TaskDashboardScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overdue');
  const [allTasks, setAllTasks] = useState([]);
  const [categorized, setCategorized] = useState({ overdue: [], today: [], week: [], future: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');


  const fetchTasks = useCallback(async () => {
    try {
      const res = await tasksApi.getTasks({ limit: 1000 });
      const tasks = res?.results || res?.data?.tasks || res?.tasks || res?.data || (Array.isArray(res) ? res : []);
      setAllTasks(tasks);
      setCategorized(categorize(tasks));
    } catch (e) {
      console.error('Task fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const onRefresh = () => { setRefreshing(true); fetchTasks(); };

  const displayTasks = (categorized[activeTab] || []).filter(t => {
    if (!t) return false;

    // 1. Search Filter
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (t.title || t.name || '').toLowerCase().includes(q) ||
      (t.group?.name || t.group || '').toLowerCase().includes(q) ||
      (t.customerName || '').toLowerCase().includes(q)
    );
  });

  const userName = user?.name || user?.username || 'User';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {userName.split(' ')[0]} 👋</Text>
          <Text style={styles.subtitle}>Task Management</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>



      {/* Quick Actions Bar */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={[styles.quickBtn, {backgroundColor: COLORS.secondary + '15'}]} onPress={() => navigation.navigate('CreateInvoice')}>
          <Text style={[styles.quickBtnText, {color: COLORS.secondary}]}>🧾 +Invoice</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.quickBtn, {backgroundColor: COLORS.primary + '15'}]} onPress={() => navigation.navigate('CreateOrder')}>
          <Text style={[styles.quickBtnText, {color: COLORS.primary}]}>📝 +Order</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.quickBtn, {backgroundColor: '#25D36615'}]} onPress={() => navigation.navigate('CreateCustomer')}>
          <Text style={[styles.quickBtnText, {color: '#128C7E'}]}>👤 +Customer</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const count = categorized[tab.id]?.length || 0;
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, isActive && { borderBottomColor: tab.color, borderBottomWidth: 3 }]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={styles.tabEmoji}>{tab.emoji}</Text>
              <Text style={[styles.tabLabel, isActive && { color: tab.color, fontWeight: FONT.bold }]}>
                {tab.label}
              </Text>
              {count > 0 && (
                <View style={[styles.badge, { backgroundColor: tab.color }]}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search Bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search tasks..."
          placeholderTextColor={COLORS.gray400}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => navigation.navigate('CreateTask')}
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Task List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      ) : (
        <FlatList
          data={displayTasks}
          keyExtractor={(item) => item._id || Math.random().toString()}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onPress={(task) => navigation.navigate('TaskDetail', { task })}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon={activeTab === 'overdue' ? '✅' : '📋'}
              message={`No ${TABS.find(t => t.id === activeTab)?.label} tasks`}
              subtext="Pull down to refresh"
            />
          }
          contentContainerStyle={{ paddingBottom: 80, flexGrow: 1 }}
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
  greeting: { fontSize: FONT.md, fontWeight: FONT.bold, color: COLORS.white },
  subtitle: { fontSize: FONT.sm, color: COLORS.white + 'BB', marginTop: 2 },
  logoutBtn: { backgroundColor: COLORS.white + '20', borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 6 },
  logoutText: { color: COLORS.white, fontSize: FONT.sm, fontWeight: FONT.semibold },
  typeRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    padding: SPACING.base,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gray50,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  typeBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.gray600,
  },
  typeBtnTextActive: {
    color: COLORS.white,
  },
  moduleCenter: { 
    flexDirection: 'row', 
    backgroundColor: COLORS.white, 
    paddingVertical: SPACING.md, 
    paddingHorizontal: SPACING.base,
    gap: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  moduleBtn: { alignItems: 'center', flex: 1 },
  moduleIcon: { 
    width: 44, height: 44, borderRadius: RADIUS.md, 
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    ...SHADOW.sm,
  },
  moduleLabel: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.gray600 },
  quickActions: { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.base, paddingBottom: SPACING.sm, backgroundColor: COLORS.white },
  quickBtn: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  quickBtnText: { fontSize: 11, fontWeight: 'bold' },
  tabBar: { flexDirection: 'row', backgroundColor: COLORS.white, ...SHADOW.card },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.sm, position: 'relative',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabEmoji: { fontSize: 16, marginBottom: 2 },
  tabLabel: { fontSize: FONT.xs, color: COLORS.gray500, fontWeight: FONT.semibold },
  badge: {
    position: 'absolute', top: 4, right: 6,
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: COLORS.white, fontSize: 10, fontWeight: FONT.bold },
  searchRow: { flexDirection: 'row', padding: SPACING.base, gap: SPACING.sm, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  searchInput: {
    flex: 1, height: 42, backgroundColor: COLORS.gray50, borderWidth: 1.5,
    borderColor: COLORS.gray200, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.base,
    fontSize: FONT.sm, color: COLORS.gray900,
  },
  newBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.base, alignItems: 'center', justifyContent: 'center',
  },
  newBtnText: { color: COLORS.white, fontSize: FONT.sm, fontWeight: FONT.bold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: SPACING.sm, color: COLORS.gray400, fontSize: FONT.sm },
});
