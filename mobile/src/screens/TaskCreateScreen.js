import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, Switch, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { format } from 'date-fns';
import { tasksApi, taskGroupsApi, taskCategoriesApi, usersApi, teamsApi } from '../api/tasks.api';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'];
const ASSIGN_MODES = [
  { value: 'SELF', label: 'Self (Me)' },
  { value: 'SINGLE', label: 'Single User' },
  { value: 'MULTI', label: 'Multiple Users' },
  { value: 'ALL', label: 'All Users' },
  { value: 'GROUP', label: 'Specific Group' },
];

const FREQUENCIES = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'EVERY_15_DAYS', label: 'Every 15 Days' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'EVERY_2_MONTHS', label: 'Every 2 Months' },
  { value: 'EVERY_6_MONTHS', label: 'Every 6 Months' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
];

const END_RULES = [
  { value: 'NEVER', label: 'Never ends' },
  { value: 'DATE', label: 'Ends on date' },
  { value: 'ON_COUNT', label: 'After N occurrences' },
];

export const TaskCreateScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);

  // Options
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);

  // Form State
  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  const [taskCategoryId, setTaskCategoryId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [assignMode, setAssignMode] = useState('SELF');
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [assignedGroupId, setAssignedGroupId] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [description, setDescription] = useState('');

  // Recurring
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState({
    frequency: 'MONTHLY',
    interval: '1',
    recurrenceEndType: 'NEVER',
    recurrenceEndDate: new Date(),
    recurrenceEndCount: '1'
  });
  const [showRecurrenceEndDatePicker, setShowRecurrenceEndDatePicker] = useState(false);

  // Billing
  const [enableBilling, setEnableBilling] = useState(false);
  const [amount, setAmount] = useState('0');
  const [billNumber, setBillNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [remarks, setRemarks] = useState('');

  // Modal for New Group
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [gr, cat, us, tm] = await Promise.allSettled([
          taskGroupsApi.getMyGroups(),
          taskCategoriesApi.getCategories(),
          usersApi.getUsers(),
          teamsApi.getTeams()
        ]);
        
        if (gr.status === 'fulfilled') {
          const arr = gr.value?.data || (Array.isArray(gr.value) ? gr.value : []);
          setGroups(arr);
          const gen = arr.find(g => g.name === 'General');
          if (gen) setGroupId(gen._id);
        }
        if (cat.status === 'fulfilled') setCategories(cat.value?.data || (Array.isArray(cat.value) ? cat.value : []));
        if (us.status === 'fulfilled') setUsers(us.value?.data || (Array.isArray(us.value) ? us.value : []));
        if (tm.status === 'fulfilled') setTeams(tm.value?.data || (Array.isArray(tm.value) ? tm.value : []));

      } catch (e) {
        console.warn('Meta load error:', e.message);
      } finally {
        setLoadingMeta(false);
      }
    };
    load();
  }, []);

  const selectedGroup = groups.find(g => g._id === groupId);
  const hasFixedUsers = selectedGroup && selectedGroup.userIds && selectedGroup.userIds.length > 0;

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const res = await taskGroupsApi.createGroup({ name: newGroupName.trim() });
      const newGroup = res?.data || res;
      setGroups(prev => [newGroup, ...prev]);
      setGroupId(newGroup._id);
      setShowNewGroupModal(false);
      setNewGroupName('');
    } catch (e) {
      Alert.alert('Error', 'Failed to create group');
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Task title is required.'); return; }
    if (!groupId) { Alert.alert('Required', 'Please select a group.'); return; }

    setSaving(true);
      // LOG THE PAYLOAD FOR DEBUGGING
      console.log('--- SAVING TASK ---');
      console.log('isRecurring:', isRecurring);

      if (isRecurring) {
        const masterPayload = {
          title: title.trim(),
          description: description.trim(),
          category: taskCategoryId || null,
          priority,
          assignmentMode: assignMode,
          assigneeIds: (assignMode === 'SELF' ? [user?._id] : (assignMode === 'ALL' ? [] : assigneeIds)),
          group: groupId || null,
          defaultAmount: parseFloat(amount) || 0,
          defaultBillNumber: billNumber || '',
          defaultReferenceNumber: referenceNumber || '',
          defaultRemarks: remarks || '',
          recurrence: {
            frequency: recurrence.frequency,
            interval: parseInt(recurrence.interval) || 1,
            startDate: dueDate.toISOString(),
            endType: recurrence.recurrenceEndType,
            occurrenceCount: (recurrence.recurrenceEndType === 'ON_COUNT' || recurrence.recurrenceEndType === 'AFTER_COUNT') ? (parseInt(recurrence.recurrenceEndCount) || 1) : undefined,
            endDate: (recurrence.recurrenceEndType === 'DATE' || recurrence.recurrenceEndType === 'ON_DATE') ? recurrence.recurrenceEndDate.toISOString() : undefined
          }
        };
        console.log('Master Payload:', JSON.stringify(masterPayload, null, 2));
        await tasksApi.createTaskMaster(masterPayload);
      } else {
        const payload = {
          title: title.trim(),
          description: description.trim(),
          dueDate: dueDate.toISOString(),
          assignmentMode: hasFixedUsers ? 'GROUP' : assignMode,
          assignedGroupId: hasFixedUsers ? groupId : (assignMode === 'GROUP' ? assignedGroupId : null),
          groupId: groupId || null,
          taskCategoryId: taskCategoryId || null,
          priority,
          assigneeIds: hasFixedUsers ? selectedGroup.userIds.map(u => u._id || u) : (assignMode === 'SELF' ? [user?._id] : (assignMode === 'ALL' ? [] : assigneeIds)),
          amount: parseFloat(amount) || 0,
          billNumber,
          referenceNumber,
          remarks,
          isPaid,
          recurrence: { enabled: false }
        };
        console.log('Task Payload:', JSON.stringify(payload, null, 2));
        await tasksApi.createTask(payload);
      }
      
      // SUCCESS HANDLING
      if (Platform.OS === 'web') {
        alert('Task Created Successfully');
      } else {
        Alert.alert('Success', 'Task Created');
      }
      navigation.goBack();

    } catch (e) {
      console.error('Save Error:', e);
      const msg = e.response?.data?.message || e.message || 'Failed to save';
      if (Platform.OS === 'web') alert('Error: ' + msg);
      else Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loadingMeta) return (
    <SafeAreaView style={styles.safe}><ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} /></SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backText}>❮ Cancel</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>New Task</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView 
          style={styles.scroll} 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            
            {/* 1. Group & Title Row */}
            <View style={styles.row}>
               <View style={{ flex: 2 }}>
                  <Text style={styles.label}>GROUP *</Text>
                  <View style={styles.pickerWrap}>
                    <Picker selectedValue={groupId} onValueChange={setGroupId} style={styles.picker}>
                      <Picker.Item label="— Select Group —" value="" />
                      {groups.map(g => <Picker.Item key={g._id} label={g.name} value={g._id} />)}
                    </Picker>
                  </View>
               </View>
               <TouchableOpacity style={styles.newGroupBtn} onPress={() => setShowNewGroupModal(true)}>
                  <Text style={styles.newGroupBtnText}>+ NEW</Text>
               </TouchableOpacity>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>TASK TITLE *</Text>
              <TextInput style={styles.input} placeholder="What needs to be done?" value={title} onChangeText={setTitle} />
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>CATEGORY</Text>
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={taskCategoryId} onValueChange={setTaskCategoryId} style={styles.picker}>
                    <Picker.Item label="No Category" value="" />
                    {categories.map(c => <Picker.Item key={c._id} label={c.name} value={c._id} />)}
                  </Picker>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>PRIORITY</Text>
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={priority} onValueChange={setPriority} style={styles.picker}>
                    {PRIORITIES.map(p => <Picker.Item key={p} label={p} value={p} />)}
                  </Picker>
                </View>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>ASSIGN TO</Text>
              {hasFixedUsers ? (
                <View style={styles.fixedBadge}>
                   <Text style={styles.fixedBadgeText}>Fixed to Group Users ({selectedGroup.userIds.length})</Text>
                </View>
              ) : (
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={assignMode} onValueChange={setAssignMode} style={styles.picker}>
                    {ASSIGN_MODES.map(m => <Picker.Item key={m.value} label={m.label} value={m.value} />)}
                  </Picker>
                </View>
              )}
            </View>

            {!hasFixedUsers && (assignMode === 'SINGLE' || assignMode === 'MULTI') && (
              <View style={styles.field}>
                <Text style={styles.label}>SELECT USER(S) *</Text>
                <View style={styles.userGrid}>
                  {users.map(u => {
                    const isSel = assigneeIds.includes(u._id);
                    return (
                      <TouchableOpacity 
                        key={u._id} 
                        style={[styles.userChip, isSel && styles.userChipActive]}
                        onPress={() => {
                          if (assignMode === 'SINGLE') setAssigneeIds([u._id]);
                          else setAssigneeIds(prev => prev.includes(u._id) ? prev.filter(id => id !== u._id) : [...prev, u._id]);
                        }}
                      >
                        <Text style={[styles.userChipText, isSel && styles.userChipTextActive]}>{u.name || u.username}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {!hasFixedUsers && assignMode === 'GROUP' && (
              <View style={styles.field}>
                <Text style={styles.label}>SELECT TEAM *</Text>
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={assignedGroupId} onValueChange={setAssignedGroupId} style={styles.picker}>
                    <Picker.Item label="— Select Team —" value="" />
                    {teams.map(t => <Picker.Item key={t._id} label={t.name} value={t._id} />)}
                  </Picker>
                </View>
              </View>
            )}

            <View style={styles.row}>
               <View style={{ flex: 1 }}>
                  <Text style={styles.label}>DUE DATE *</Text>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.dateText}>{format(dueDate, 'dd MMM yyyy')}</Text>
                  </TouchableOpacity>
               </View>
               <View style={styles.switchRow}>
                  <Switch value={isRecurring} onValueChange={setIsRecurring} trackColor={{ true: COLORS.primary }} />
                  <Text style={styles.switchLabel}>Recurring</Text>
               </View>
            </View>

            {isRecurring && (
              <View style={styles.recurrenceCard}>
                 <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                       <Text style={styles.label}>FREQUENCY</Text>
                       <View style={styles.pickerWrap}>
                          <Picker 
                            selectedValue={recurrence.frequency} 
                            onValueChange={(v) => setRecurrence(p => ({ ...p, frequency: v }))}
                            style={styles.picker}
                          >
                            {FREQUENCIES.map(f => <Picker.Item key={f.value} label={f.label} value={f.value} />)}
                          </Picker>
                       </View>
                    </View>
                    <View style={{ flex: 1 }}>
                       <Text style={styles.label}>EVERY X</Text>
                       <TextInput 
                         style={styles.input} 
                         keyboardType="numeric" 
                         value={recurrence.interval} 
                         onChangeText={(v) => setRecurrence(p => ({ ...p, interval: v }))} 
                       />
                    </View>
                 </View>

                 <Text style={styles.label}>END RULE</Text>
                 <View style={styles.pickerWrap}>
                    <Picker 
                      selectedValue={recurrence.recurrenceEndType} 
                      onValueChange={(v) => setRecurrence(p => ({ ...p, recurrenceEndType: v }))}
                      style={styles.picker}
                    >
                      {END_RULES.map(r => <Picker.Item key={r.value} label={r.label} value={r.value} />)}
                    </Picker>
                 </View>

                 {recurrence.recurrenceEndType === 'DATE' && (
                    <TouchableOpacity style={styles.dateBtn} onPress={() => setShowRecurrenceEndDatePicker(true)}>
                       <Text style={styles.dateText}>{format(recurrence.recurrenceEndDate, 'dd MMM yyyy')}</Text>
                    </TouchableOpacity>
                 )}
                 {recurrence.recurrenceEndType === 'ON_COUNT' && (
                    <TextInput 
                      style={styles.input} 
                      placeholder="Number of occurrences" 
                      keyboardType="numeric"
                      value={recurrence.recurrenceEndCount}
                      onChangeText={(v) => setRecurrence(p => ({ ...p, recurrenceEndCount: v }))}
                    />
                 )}
              </View>
            )}

            <View style={styles.billingToggleRow}>
               <Switch value={enableBilling} onValueChange={setEnableBilling} trackColor={{ true: COLORS.success }} />
               <Text style={styles.billingToggleLabel}>Add Billing & Payment Details</Text>
            </View>

            {enableBilling && (
              <View style={styles.billingCard}>
                 <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                       <Text style={styles.label}>AMOUNT (₹)</Text>
                       <TextInput style={styles.input} keyboardType="numeric" value={amount} onChangeText={setAmount} />
                    </View>
                    <View style={{ flex: 1 }}>
                       <Text style={styles.label}>BILL NUMBER</Text>
                       <TextInput style={styles.input} placeholder="Invoice #" value={billNumber} onChangeText={setBillNumber} />
                    </View>
                 </View>
                 <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                       <Text style={styles.label}>REFERENCE / REF #</Text>
                       <TextInput style={styles.input} placeholder="UTR / Ref" value={referenceNumber} onChangeText={setReferenceNumber} />
                    </View>
                    <View style={{ flex: 1 }}>
                       <Text style={styles.label}>STATUS</Text>
                       <TouchableOpacity 
                         style={[styles.statusBtn, isPaid ? styles.statusBtnPaid : styles.statusBtnUnpaid]} 
                         onPress={() => setIsPaid(!isPaid)}
                       >
                         <Text style={styles.statusBtnText}>{isPaid ? '✓ PAID' : 'UNPAID'}</Text>
                       </TouchableOpacity>
                    </View>
                 </View>
                 <Text style={styles.label}>BILLING REMARKS</Text>
                 <TextInput style={styles.input} placeholder="Payment method, date, etc." value={remarks} onChangeText={setRemarks} />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>ADDITIONAL DESCRIPTION</Text>
              <TextInput 
                style={[styles.input, styles.textArea]} 
                multiline 
                numberOfLines={4} 
                value={description} 
                onChangeText={setDescription}
                blurOnSubmit={true}
              />
            </View>

          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
               <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
               {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveBtnText}>🚀 Create Task</Text>}
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {showDatePicker && <DateTimePicker value={dueDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if (d) setDueDate(d); }} />}
        {showRecurrenceEndDatePicker && <DateTimePicker value={recurrence.recurrenceEndDate} mode="date" onChange={(e, d) => { setShowRecurrenceEndDatePicker(false); if (d) setRecurrence(p => ({ ...p, recurrenceEndDate: d })); }} />}

        {/* Modal: New Group */}
        <Modal visible={showNewGroupModal} transparent animationType="slide">
           <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                 <Text style={styles.modalTitle}>Create New Group</Text>
                 <TextInput style={styles.input} placeholder="Group Name" value={newGroupName} onChangeText={setNewGroupName} autoFocus />
                 <View style={styles.modalBtns}>
                    <TouchableOpacity onPress={() => setShowNewGroupModal(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity onPress={handleCreateGroup} style={styles.modalAdd}><Text style={styles.modalAddText}>Create</Text></TouchableOpacity>
                 </View>
              </View>
           </View>
        </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, paddingHorizontal: SPACING.base, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray100, ...SHADOW.sm,
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.gray900 },
  backText: { color: COLORS.primary, fontWeight: 'bold' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  card: { backgroundColor: COLORS.white, margin: SPACING.base, borderRadius: RADIUS.md, padding: SPACING.base, ...SHADOW.card },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-end', marginBottom: 15 },
  field: { marginBottom: 15 },
  label: { fontSize: 10, fontWeight: 'bold', color: COLORS.gray500, marginBottom: 6, letterSpacing: 0.5 },
  pickerWrap: { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: RADIUS.md, backgroundColor: COLORS.gray50, height: 48, justifyContent: 'center' },
  picker: { height: 48, width: '100%', color: COLORS.gray800, backgroundColor: 'transparent', outlineStyle: 'none', borderStyle: 'none' },
  input: { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: RADIUS.md, paddingHorizontal: 12, height: 48, fontSize: 14, color: COLORS.gray900, backgroundColor: COLORS.white },
  textArea: { height: 80, paddingTop: 10, textAlignVertical: 'top' },
  newGroupBtn: { height: 48, paddingHorizontal: 12, backgroundColor: COLORS.primary + '15', borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.primary + '30' },
  newGroupBtnText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 11 },
  fixedBadge: { backgroundColor: '#fef9c3', padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#fde047' },
  fixedBadgeText: { fontSize: 12, color: '#854d0e', fontWeight: 'bold' },
  userGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  userChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.gray50, borderWidth: 1, borderColor: COLORS.gray200 },
  userChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  userChipText: { fontSize: 12, color: COLORS.gray600 },
  userChipTextActive: { color: COLORS.white, fontWeight: 'bold' },
  dateBtn: { height: 48, borderWidth: 1, borderColor: COLORS.gray200, borderRadius: RADIUS.md, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: COLORS.gray50 },
  dateText: { fontSize: 14, color: COLORS.gray800 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { fontSize: 14, color: COLORS.gray700, fontWeight: 'bold' },
  recurrenceCard: { backgroundColor: COLORS.gray50, padding: 12, borderRadius: RADIUS.md, marginTop: 10 },
  billingToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  billingToggleLabel: { fontSize: 14, color: COLORS.gray800, fontWeight: 'bold' },
  billingCard: { backgroundColor: '#f9fafb', padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.gray100, marginTop: 5 },
  statusBtn: { height: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  statusBtnPaid: { backgroundColor: COLORS.success },
  statusBtnUnpaid: { backgroundColor: COLORS.gray200 },
  statusBtnText: { color: COLORS.white, fontWeight: 'bold' },
  actionRow: { flexDirection: 'row', padding: SPACING.base, gap: 12, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.gray200 },
  cancelBtnText: { color: COLORS.gray600, fontWeight: 'bold' },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, ...SHADOW.md },
  saveBtnText: { color: COLORS.white, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: 20, ...SHADOW.lg },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 15 },
  modalCancel: { color: COLORS.gray500, fontWeight: 'bold' },
  modalAdd: { backgroundColor: COLORS.primary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: RADIUS.md },
  modalAddText: { color: COLORS.white, fontWeight: 'bold' },
});
