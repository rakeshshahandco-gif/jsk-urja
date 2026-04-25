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
const MODES = [
  { value: 'SELF', label: 'Self' },
  { value: 'SINGLE', label: 'Single User' },
  { value: 'MULTI', label: 'Multiple Users' },
  { value: 'ALL', label: 'All Users' },
];

const MultiPicker = ({ label, options, selectedValues, onToggle }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.chipGrid}>
      {options.map(opt => {
        const val = opt.value || opt;
        const isSelected = Array.isArray(selectedValues) ? selectedValues.includes(val) : selectedValues === val;
        return (
          <TouchableOpacity
            key={val}
            style={[styles.optionChip, isSelected && styles.optionChipActive]}
            onPress={() => onToggle(val)}
          >
            <Text style={[styles.optionChipText, isSelected && styles.optionChipTextActive]}>
              {opt.label || opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
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
  const [assignMode, setAssignMode] = useState('SELF');
  const [assigneeIds, setAssigneeIds] = useState([user?._id]);
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceConfig, setRecurrenceConfig] = useState({
    frequency: 'MONTHLY',
    interval: '1',
    endType: 'NEVER'
  });

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

  const toggleAssignee = (id) => {
    if (assignMode === 'SINGLE' || assignMode === 'SELF') {
      setAssigneeIds([id]);
    } else {
      setAssigneeIds(prev => 
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Task name is required.'); return; }
    if (!groupId) { Alert.alert('Required', 'Please select a group.'); return; }
    
    if (assignMode !== 'ALL' && (!assigneeIds || assigneeIds.length === 0)) {
       Alert.alert('Required', 'At least one assignee is required.');
       return;
    }

    setSaving(true);
    try {
      if (isRecurring) {
        await tasksApi.createTaskMaster({
          title: title.trim(),
          description: description.trim(),
          category: groupId, // Note: mobile uses same ID for group/category contextually
          priority,
          assignedTo: (assignMode === 'SINGLE' || assignMode === 'SELF') ? assigneeIds[0] : null,
          group: groupId,
          recurrence: {
            frequency: recurrenceConfig.frequency,
            interval: parseInt(recurrenceConfig.interval) || 1,
            startDate: dueDate.toISOString(),
            endType: recurrenceConfig.endType,
          },
        });
        Alert.alert('✅ Template Created', 'Recurring task template created successfully!', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        await tasksApi.createTask({
          title: title.trim(),
          description: description.trim(),
          groupId,
          assignmentMode: assignMode,
          assigneeIds: assignMode === 'ALL' ? [] : assigneeIds,
          priority,
          dueDate: dueDate.toISOString(),
        });
        Alert.alert('✅ Task Created', 'Task created successfully!', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
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
            <MultiPicker
              label="Priority *"
              options={PRIORITIES}
              selectedValues={priority}
              onToggle={setPriority}
            />

            {/* Group */}
            <MultiPicker
              label="Group *"
              options={groups}
              selectedValues={groupId}
              onToggle={setGroupId}
            />

            {/* Assignment Mode */}
            <MultiPicker
              label="Assignment Mode *"
              options={MODES}
              selectedValues={assignMode}
              onToggle={(m) => {
                setAssignMode(m);
                if (m === 'SELF') setAssigneeIds([user?._id]);
                else if (m === 'ALL') setAssigneeIds([]);
              }}
            />

            {/* Assign To Users */}
            {(assignMode === 'SINGLE' || assignMode === 'MULTI') && (
              <MultiPicker
                label={assignMode === 'SINGLE' ? "Assign To *" : "Assign To (Multiple) *"}
                options={users}
                selectedValues={assigneeIds}
                onToggle={toggleAssignee}
              />
            )}

            {/* Due Date */}
            <View style={styles.field}>
              <Text style={styles.label}>Due Date *</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateBtnText}>📅 {format(dueDate, 'dd MMM yyyy')}</Text>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={dueDate}
                mode="date"
                display="default"
                onChange={(e, d) => { setShowDatePicker(false); if (d) setDueDate(d); }}
              />
            )}

            {/* Recurring Options */}
            <View style={[styles.field, { marginTop: SPACING.sm }]}>
              <TouchableOpacity 
                style={styles.recurringOption} 
                onPress={() => setIsRecurring(!isRecurring)}
              >
                <View style={[styles.checkbox, isRecurring && styles.checkboxActive]}>
                  {isRecurring && <Text style={styles.checkboxTick}>✓</Text>}
                </View>
                <View>
                  <Text style={styles.recurringLabel}>Recurring Task</Text>
                  <Text style={styles.recurringSub}>Automatically create next task</Text>
                </View>
              </TouchableOpacity>

              {isRecurring && (
                <View style={{ marginTop: SPACING.md, gap: SPACING.sm, paddingLeft: 8, borderLeftWidth: 2, borderColor: COLORS.primary + '40' }}>
                  <Text style={styles.label}>Frequency</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                    {['DAILY', 'WEEKLY', 'EVERY_15_DAYS', 'MONTHLY', 'EVERY_2_MONTHS', 'EVERY_6_MONTHS', 'QUARTERLY', 'YEARLY'].map(f => (
                      <TouchableOpacity 
                        key={f}
                        style={[styles.optionChip, { marginRight: 8 }, recurrenceConfig.frequency === f && styles.optionChipActive]}
                        onPress={() => setRecurrenceConfig(p => ({ ...p, frequency: f }))}
                      >
                        <Text style={[styles.optionChipText, recurrenceConfig.frequency === f && styles.optionChipTextActive]}>
                          {f.replace(/_/g, ' ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={[styles.label, { marginTop: 8 }]}>Every X (Interval)</Text>
                  <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    value={recurrenceConfig.interval} 
                    onChangeText={(t) => setRecurrenceConfig(p => ({ ...p, interval: t }))} 
                  />
                  
                  <Text style={[styles.label, { marginTop: 8 }]}>End Rule</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['NEVER', 'DATE', 'ON_COUNT'].map(e => (
                      <TouchableOpacity 
                        key={e}
                        style={[styles.optionChip, recurrenceConfig.endType === e && styles.optionChipActive]}
                        onPress={() => setRecurrenceConfig(p => ({ ...p, endType: e }))}
                      >
                        <Text style={[styles.optionChipText, recurrenceConfig.endType === e && styles.optionChipTextActive]}>
                          {e.replace('_', ' ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Large Clear Save Button at Bottom */}
          <View style={{ paddingHorizontal: SPACING.base, marginBottom: 20 }}>
            <TouchableOpacity 
              style={[styles.bottomSaveBtn, saving && { opacity: 0.7 }]} 
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.bottomSaveText}>SAVE TASK</Text>
              )}
            </TouchableOpacity>
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
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: SPACING.xs },
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
  recurringOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  checkbox: { 
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, 
    borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' 
  },
  checkboxActive: { backgroundColor: COLORS.primary },
  checkboxTick: { color: COLORS.white, fontSize: 14, fontWeight: 'bold' },
  recurringLabel: { fontSize: FONT.base, fontWeight: FONT.bold, color: COLORS.gray900 },
  recurringSub: { fontSize: FONT.xs, color: COLORS.gray500 },
  bottomSaveBtn: {
    backgroundColor: COLORS.primary,
    height: 56,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.strong,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  bottomSaveText: {
    color: COLORS.white,
    fontSize: FONT.md,
    fontWeight: 'bold',
    letterSpacing: 1.2,
  },
});
