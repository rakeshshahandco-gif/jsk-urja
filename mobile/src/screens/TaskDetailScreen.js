import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useFocusEffect } from '@react-navigation/native';
import { tasksApi } from '../api/tasks.api';
import { useAuth } from '../context/AuthContext';
import { UpdateItem } from '../components/UpdateItem';
import { PriorityBadge } from '../components/PriorityBadge';
import { StatusChip } from '../components/StatusChip';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

const InfoRow = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value || '—'}</Text>
  </View>
);

export const TaskDetailScreen = ({ route, navigation }) => {
  const { task: initialTask } = route.params;
  const { user } = useAuth();
  const [task, setTask] = useState(initialTask);
  const [loading, setLoading] = useState(false);
  const [updateNote, setUpdateNote] = useState('');
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [activeAction, setActiveAction] = useState(null); // 'update' | 'extend' | null

  // Quick-note options
  const QUICK_NOTES = [
    'Called but not picked',
    'Called again, no answer',
    'Customer busy, call later',
    'Spoke to customer, awaiting response',
    'Work in progress',
    'Follow up required',
  ];

  const refreshTask = useCallback(async () => {
    try {
      setLoading(true);
      const res = await tasksApi.getTask(task._id);
      const t = res?.data || res;
      if (t?._id) setTask(t);
    } catch (e) {
      console.warn('Task refresh error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [task._id]);

  useFocusEffect(useCallback(() => { refreshTask(); }, [refreshTask]));

  const handleAddUpdate = async () => {
    if (!updateNote.trim()) {
      Alert.alert('Empty Note', 'Please enter an update note.');
      return;
    }
    setSavingUpdate(true);
    try {
      await tasksApi.addUpdate(task._id, updateNote.trim());
      setUpdateNote('');
      setActiveAction(null);
      await refreshTask();
      Alert.alert('✅ Done', 'Update saved successfully!');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message || 'Failed to save update');
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleClose = () => {
    Alert.alert(
      'Close Task',
      'Are you sure you want to close/conclude this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Task',
          style: 'destructive',
          onPress: async () => {
            try {
              await tasksApi.closeTask(task._id, 'Closed from mobile app');
              await refreshTask();
              Alert.alert('✅ Task Closed', 'Task has been concluded successfully.');
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || e.message);
            }
          },
        },
      ]
    );
  };

  const formatDate = (date) => {
    if (!date) return '—';
    try {
      const d = typeof date === 'string' ? parseISO(date) : new Date(date);
      return format(d, 'dd MMM yyyy HH:mm');
    } catch { return '—'; }
  };

  const updates = task.updates || task.history || [];
  const isClosed = task.status === 'Closed' || task.status === 'Concluded';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          {loading && <ActivityIndicator color={COLORS.white} />}
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Task Title Card */}
          <View style={styles.titleCard}>
            <Text style={styles.taskTitle}>{task.title || task.name || 'Task'}</Text>
            <View style={styles.chipRow}>
              <PriorityBadge priority={task.priority} />
              <View style={{ width: 8 }} />
              <StatusChip status={task.status} />
            </View>
          </View>

          {/* Task Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            <InfoRow label="Due Date" value={formatDate(task.nextDueDate || task.dueDate)} />
            <InfoRow label="Assigned To" value={task.assignedTo?.name || task.assignedTo} />
            <InfoRow label="Created By" value={task.createdBy?.name || task.createdBy} />
            <InfoRow label="Group" value={task.group?.name || task.group} />
            {task.description && (
              <View style={styles.descBox}>
                <Text style={styles.infoLabel}>Description</Text>
                <Text style={styles.descText}>{task.description}</Text>
              </View>
            )}
          </View>

          {/* Updates History */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Updates ({updates.length})</Text>
            {updates.length === 0
              ? <Text style={styles.noUpdates}>No updates yet</Text>
              : updates.slice().reverse().map((u, i) => (
                <UpdateItem key={i} update={u} isLast={i === updates.length - 1} />
              ))
            }
          </View>

          {/* Action Panel */}
          {!isClosed && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Actions</Text>

              {/* Quick Notes */}
              {activeAction === 'update' && (
                <View style={styles.updatePanel}>
                  <Text style={styles.panelTitle}>Quick Notes</Text>
                  <View style={styles.quickNotes}>
                    {QUICK_NOTES.map(note => (
                      <TouchableOpacity
                        key={note}
                        style={styles.quickNote}
                        onPress={() => setUpdateNote(note)}
                      >
                        <Text style={styles.quickNoteText}>{note}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Or type your own update..."
                    placeholderTextColor={COLORS.gray400}
                    value={updateNote}
                    onChangeText={setUpdateNote}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                  <View style={styles.panelBtns}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => { setActiveAction(null); setUpdateNote(''); }}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, savingUpdate && { opacity: 0.7 }]}
                      onPress={handleAddUpdate}
                      disabled={savingUpdate}
                    >
                      {savingUpdate
                        ? <ActivityIndicator color={COLORS.white} />
                        : <Text style={styles.saveBtnText}>Save Update</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              {activeAction === null && (
                <View style={styles.actionBtns}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: COLORS.primaryLight }]}
                    onPress={() => setActiveAction('update')}
                  >
                    <Text style={styles.actionBtnText}>📝 Add Update</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: COLORS.accent }]}
                    onPress={() => navigation.navigate('ExtendTask', { task, onExtended: refreshTask })}
                  >
                    <Text style={styles.actionBtnText}>⏰ Extend Task</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: COLORS.success }]}
                    onPress={handleClose}
                  >
                    <Text style={[styles.actionBtnText, { color: COLORS.white }]}>✅ Close Task</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {isClosed && (
            <View style={[styles.section, styles.closedBanner]}>
              <Text style={styles.closedText}>✅ This task has been {task.status}</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.primary, paddingHorizontal: SPACING.base, paddingVertical: SPACING.md,
  },
  backBtn: { padding: SPACING.xs },
  backText: { color: COLORS.white, fontSize: FONT.base, fontWeight: FONT.semibold },
  scroll: { flex: 1 },
  titleCard: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.sm,
  },
  taskTitle: { fontSize: FONT.lg, fontWeight: FONT.bold, color: COLORS.white, lineHeight: 26, marginBottom: SPACING.sm },
  chipRow: { flexDirection: 'row', alignItems: 'center' },
  section: {
    backgroundColor: COLORS.white, margin: SPACING.base,
    marginBottom: 0, borderRadius: RADIUS.lg, padding: SPACING.base, ...SHADOW.card,
  },
  sectionTitle: { fontSize: FONT.md, fontWeight: FONT.bold, color: COLORS.gray800, marginBottom: SPACING.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.xs, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  infoLabel: { fontSize: FONT.sm, color: COLORS.gray400, fontWeight: FONT.semibold },
  infoValue: { fontSize: FONT.sm, color: COLORS.gray800, fontWeight: FONT.semibold, maxWidth: '60%', textAlign: 'right' },
  descBox: { marginTop: SPACING.sm },
  descText: { fontSize: FONT.sm, color: COLORS.gray700, lineHeight: 20, marginTop: 4 },
  noUpdates: { fontSize: FONT.sm, color: COLORS.gray400, textAlign: 'center', paddingVertical: SPACING.base },
  updatePanel: { marginTop: SPACING.sm },
  panelTitle: { fontSize: FONT.sm, fontWeight: FONT.bold, color: COLORS.gray600, marginBottom: SPACING.sm },
  quickNotes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.sm },
  quickNote: { backgroundColor: COLORS.primary + '15', borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.primary + '30' },
  quickNoteText: { fontSize: FONT.xs, color: COLORS.primary, fontWeight: FONT.semibold },
  noteInput: {
    borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: RADIUS.md,
    padding: SPACING.sm, fontSize: FONT.sm, color: COLORS.gray900,
    backgroundColor: COLORS.gray50, minHeight: 80,
  },
  panelBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  cancelBtn: { flex: 1, padding: SPACING.sm, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: RADIUS.md },
  cancelBtnText: { color: COLORS.gray600, fontWeight: FONT.semibold },
  saveBtn: { flex: 2, backgroundColor: COLORS.primary, padding: SPACING.sm, alignItems: 'center', borderRadius: RADIUS.md },
  saveBtnText: { color: COLORS.white, fontWeight: FONT.bold },
  actionBtns: { gap: SPACING.sm },
  actionBtn: { padding: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center' },
  actionBtnText: { fontSize: FONT.base, fontWeight: FONT.bold, color: COLORS.white },
  closedBanner: { backgroundColor: '#dcfce7', alignItems: 'center' },
  closedText: { fontSize: FONT.base, fontWeight: FONT.bold, color: COLORS.success },
});
