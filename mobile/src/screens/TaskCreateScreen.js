import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { tasksApi, taskGroupsApi, usersApi } from '../api/tasks.api';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const PickerModal = ({ label, options, value, onSelect }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.optionRow}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt.value || opt}
            style={[styles.optionChip, value === (opt.value || opt) && styles.optionChipActive]}
            onPress={() => onSelect(opt.value || opt)}
          >
            <Text style={[styles.optionChipText, value === (opt.value || opt) && styles.optionChipTextActive]}>
              {opt.label || opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  </View>
);

export const TaskCreateScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [assignedTo, setAssignedTo] = useState(user?._id || '');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [gr, us] = await Promise.allSettled([
          taskGroupsApi.getMyGroups(),
          usersApi.getUsers(),
        ]);
        if (gr.status === 'fulfilled') {
          const grData = gr.value?.data || gr.value || [];
          setGroups(grData.map(g => ({ value: g._id, label: g.name })));
        }
        if (us.status === 'fulfilled') {
          const usData = us.value?.data || us.value || [];
          setUsers(usData.map(u => ({ value: u._id, label: u.name || u.username })));
        }
      } catch (e) {
        console.warn('Meta load error:', e.message);
      } finally {
        setLoadingMeta(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Task name is required.'); return; }
    if (!groupId) { Alert.alert('Required', 'Please select a group.'); return; }
    if (!assignedTo) { Alert.alert('Required', 'Please select who to assign.'); return; }

    setSaving(true);
    try {
      await tasksApi.createTask({
        title: title.trim(),
        description: description.trim(),
        group: groupId,
        assignedTo,
        priority,
        dueDate: dueDate.toISOString(),
        nextDueDate: dueDate.toISOString(),
      });
      Alert.alert('✅ Task Created', 'Task created successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  if (loadingMeta) return (
    <SafeAreaView style={styles.safe}>
      <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Task</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {/* Title */}
            <View style={styles.field}>
              <Text style={styles.label}>Task Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter task name"
                placeholderTextColor={COLORS.gray400}
                value={title}
                onChangeText={setTitle}
              />
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="Optional description..."
                placeholderTextColor={COLORS.gray400}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Priority */}
            <PickerModal
              label="Priority *"
              options={PRIORITIES}
              value={priority}
              onSelect={setPriority}
            />

            {/* Group */}
            <PickerModal
              label="Group *"
              options={groups}
              value={groupId}
              onSelect={setGroupId}
            />

            {/* Assign To */}
            <PickerModal
              label="Assign To *"
              options={users}
              value={assignedTo}
              onSelect={setAssignedTo}
            />

            {/* Due Date */}
            <View style={styles.field}>
              <Text style={styles.label}>Due Date & Time *</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.dateBtnText}>📅 {format(dueDate, 'dd MMM yyyy')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
                  <Text style={styles.dateBtnText}>🕐 {format(dueDate, 'HH:mm')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={dueDate}
                mode="date"
                display="default"
                onChange={(e, d) => { setShowDatePicker(false); if (d) setDueDate(d); }}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={dueDate}
                mode="time"
                display="default"
                onChange={(e, d) => { setShowTimePicker(false); if (d) setDueDate(d); }}
              />
            )}
          </View>

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
  backText: { color: COLORS.white, fontSize: FONT.base },
  headerTitle: { fontSize: FONT.md, fontWeight: FONT.bold, color: COLORS.white },
  saveText: { color: COLORS.accent, fontSize: FONT.base, fontWeight: FONT.bold },
  scroll: { flex: 1 },
  card: {
    backgroundColor: COLORS.white, margin: SPACING.base, borderRadius: RADIUS.lg,
    padding: SPACING.base, ...SHADOW.card,
  },
  field: { marginBottom: SPACING.base },
  label: { fontSize: FONT.sm, fontWeight: FONT.bold, color: COLORS.gray600, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.base, paddingVertical: SPACING.sm,
    fontSize: FONT.base, color: COLORS.gray900, backgroundColor: COLORS.gray50,
  },
  optionRow: { flexDirection: 'row', gap: 8, paddingVertical: SPACING.xs },
  optionChip: {
    paddingHorizontal: SPACING.base, paddingVertical: SPACING.xs,
    borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: COLORS.gray200,
    backgroundColor: COLORS.gray50,
  },
  optionChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  optionChipText: { fontSize: FONT.sm, color: COLORS.gray600, fontWeight: FONT.semibold },
  optionChipTextActive: { color: COLORS.primary, fontWeight: FONT.bold },
  dateRow: { flexDirection: 'row', gap: SPACING.sm },
  dateBtn: {
    flex: 1, borderWidth: 1.5, borderColor: COLORS.primary + '60',
    borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center',
    backgroundColor: COLORS.primary + '08',
  },
  dateBtnText: { fontSize: FONT.sm, color: COLORS.primary, fontWeight: FONT.bold },
});
