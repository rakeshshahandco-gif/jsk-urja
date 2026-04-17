import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, addDays } from 'date-fns';
import { tasksApi } from '../api/tasks.api';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

const EXTEND_OPTIONS = [
  { label: '+1 Day', days: 1 },
  { label: '+3 Days', days: 3 },
  { label: '+7 Days', days: 7 },
  { label: '+15 Days', days: 15 },
  { label: '+1 Month', days: 30 },
];

export const ExtendTaskScreen = ({ route, navigation }) => {
  const { task, onExtended } = route.params;
  const [newDate, setNewDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const applyQuickExtend = (days) => {
    setNewDate(addDays(new Date(), days));
  };

  const handleExtend = async () => {
    if (!reason.trim()) {
      Alert.alert('Required', 'Please enter a reason for extending the task.');
      return;
    }
    setSaving(true);
    try {
      await tasksApi.extendTask(task._id, newDate.toISOString(), reason.trim());
      if (onExtended) onExtended();
      Alert.alert('✅ Extended', 'Task extended successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message || 'Failed to extend task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Extend Task</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.taskName} numberOfLines={2}>{task.title || task.name}</Text>

          {/* Quick extend */}
          <Text style={styles.label}>Quick Extend</Text>
          <View style={styles.quickRow}>
            {EXTEND_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.days}
                style={styles.quickChip}
                onPress={() => applyQuickExtend(opt.days)}
              >
                <Text style={styles.quickChipText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom date/time */}
          <Text style={styles.label}>New Due Date</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dateBtnText}>📅 {format(newDate, 'dd MMM yyyy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
              <Text style={styles.dateBtnText}>🕐 {format(newDate, 'HH:mm')}</Text>
            </TouchableOpacity>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={newDate}
              mode="date"
              minimumDate={new Date()}
              display="default"
              onChange={(e, d) => { setShowDatePicker(false); if (d) setNewDate(prev => { const n = new Date(prev); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); return n; }); }}
            />
          )}
          {showTimePicker && (
            <DateTimePicker
              value={newDate}
              mode="time"
              display="default"
              onChange={(e, d) => { setShowTimePicker(false); if (d) setNewDate(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }}
            />
          )}

          {/* Reason */}
          <Text style={styles.label}>Reason for Extension *</Text>
          <TextInput
            style={styles.reasonInput}
            placeholder="Why is the task being extended?"
            placeholderTextColor={COLORS.gray400}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.extendBtn, saving && { opacity: 0.7 }]}
            onPress={handleExtend}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={styles.extendBtnText}>⏰ Extend Task</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.primary, paddingHorizontal: SPACING.base, paddingVertical: SPACING.md,
  },
  backText: { color: COLORS.white, fontSize: FONT.base, width: 60 },
  headerTitle: { fontSize: FONT.md, fontWeight: FONT.bold, color: COLORS.white },
  scroll: { flex: 1 },
  card: {
    backgroundColor: COLORS.white, margin: SPACING.base, borderRadius: RADIUS.lg,
    padding: SPACING.base, ...SHADOW.card,
  },
  taskName: { fontSize: FONT.base, fontWeight: FONT.bold, color: COLORS.gray900, marginBottom: SPACING.base },
  label: { fontSize: FONT.sm, fontWeight: FONT.bold, color: COLORS.gray600, marginBottom: 6, marginTop: SPACING.sm },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.sm },
  quickChip: {
    paddingHorizontal: SPACING.base, paddingVertical: SPACING.xs,
    backgroundColor: COLORS.primary + '15', borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: COLORS.primary + '40',
  },
  quickChipText: { fontSize: FONT.sm, color: COLORS.primary, fontWeight: FONT.bold },
  dateRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  dateBtn: {
    flex: 1, borderWidth: 1.5, borderColor: COLORS.primary + '60',
    borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center',
    backgroundColor: COLORS.primary + '08',
  },
  dateBtnText: { fontSize: FONT.sm, color: COLORS.primary, fontWeight: FONT.bold },
  reasonInput: {
    borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: RADIUS.md,
    padding: SPACING.sm, fontSize: FONT.sm, color: COLORS.gray900,
    backgroundColor: COLORS.gray50, minHeight: 80, marginBottom: SPACING.lg,
  },
  extendBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md, padding: SPACING.md,
    alignItems: 'center', ...SHADOW.card,
  },
  extendBtnText: { color: COLORS.white, fontSize: FONT.base, fontWeight: FONT.bold },
});
