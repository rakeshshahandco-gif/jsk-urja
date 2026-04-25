import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { conversationApi, followupApi } from '../api/interaction.api';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../theme/colors';

export const CustomerInteractionScreen = ({ route, navigation }) => {
  const { customer } = route.params;
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [existingFollowup, setExistingFollowup] = useState(null);

  // Form State
  const [conv, setConv] = useState({
    mode: 'call',
    discussionDetails: '',
    outcome: '',
  });

  const [followup, setFollowup] = useState({
    nextCallDate: new Date(),
    nextCallTime: '10:00',
    whatToTalkNext: '',
    priority: 'medium',
    reminderEnabled: true,
  });

  useEffect(() => {
    const fetchExisting = async () => {
      try {
        const res = await followupApi.getFollowupByCustomer(customer._id);
        if (res) {
           setExistingFollowup(res);
           setFollowup({
             ...followup,
             nextCallDate: res.nextCallDate ? new Date(res.nextCallDate) : new Date(),
             nextCallTime: res.nextCallTime || '10:00',
             whatToTalkNext: res.whatToTalkNext || '',
             priority: res.priority || 'medium',
             reminderEnabled: res.reminderEnabled ?? true,
           });
        }
      } catch (e) {
        // No existing followup found
      }
    };
    fetchExisting();
  }, [customer._id]);

  const handleSave = async () => {
    if (!conv.discussionDetails) {
      Alert.alert('Required', 'Please enter discussion details.');
      return;
    }

    setLoading(true);
    try {
      // 1. Log Conversation (History Mirror)
      await conversationApi.createConversation({
        customerId: customer._id,
        mode: conv.mode,
        discussionDetails: conv.discussionDetails,
        outcome: conv.outcome,
      });

      // 2. Update Follow-up (Mirror Status)
      const fData = {
        customerId: customer._id,
        nextCallDate: followup.nextCallDate,
        nextCallTime: followup.nextCallTime,
        whatToTalkNext: followup.whatToTalkNext,
        priority: followup.priority,
        reminderEnabled: followup.reminderEnabled,
      };

      if (existingFollowup) {
        await followupApi.updateFollowup(existingFollowup._id, fData);
      } else {
        await followupApi.createFollowup(fData);
      }

      Alert.alert('Success ✅', 'Interaction logged and synced to CRM.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      Alert.alert('Sync Failed ❌', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Update Timeline</Text>
          <Text style={styles.headerSubtitle}>{customer.company || customer.name}</Text>
        </View>
        <TouchableOpacity onPress={handleSave} disabled={loading} style={styles.headerBtn}>
          {loading ? <ActivityIndicator size="small" color={COLORS.secondary} /> : <Text style={styles.saveText}>Sync</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          
          {/* Mirroring Interaction Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>✍️</Text>
              <Text style={styles.cardTitle}>What happened today?</Text>
            </View>
            
            <View style={styles.modeRow}>
               {[
                 { id: 'call', label: 'Call', icon: '📞' },
                 { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
                 { id: 'visit', label: 'Visit', icon: '📍' }
               ].map(m => (
                 <TouchableOpacity 
                   key={m.id} 
                   style={[styles.modeBtn, conv.mode === m.id && styles.modeBtnActive]}
                   onPress={() => setConv({...conv, mode: m.id})}
                 >
                   <Text style={[styles.modeIcon, conv.mode === m.id && { color: COLORS.white }]}>{m.icon}</Text>
                   <Text style={[styles.modeBtnText, conv.mode === m.id && styles.modeBtnTextActive]}>
                     {m.label}
                   </Text>
                 </TouchableOpacity>
               ))}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Discussion Highlights</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                multiline
                placeholder="Briefly describe the conversation..."
                placeholderTextColor={COLORS.gray400}
                value={conv.discussionDetails}
                onChangeText={(t) => setConv({...conv, discussionDetails: t})}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Outcome</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Price agreed, Shared catalog"
                placeholderTextColor={COLORS.gray400}
                value={conv.outcome}
                onChangeText={(t) => setConv({...conv, outcome: t})}
              />
            </View>
          </View>

          {/* Mirroring Follow-up Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>📅</Text>
              <Text style={styles.cardTitle}>Next Step (Cloud Sync)</Text>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Follow-up Date</Text>
              <TouchableOpacity 
                style={styles.dateBtn} 
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateBtnText}>{followup.nextCallDate.toDateString()}</Text>
                <Text>📅</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={followup.nextCallDate}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={(event, date) => {
                    setShowDatePicker(false);
                    if (date) setFollowup({...followup, nextCallDate: date});
                  }}
                />
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Next Agenda</Text>
              <TextInput
                style={styles.input}
                placeholder="Finalize PO? Send sample?"
                placeholderTextColor={COLORS.gray400}
                value={followup.whatToTalkNext}
                onChangeText={(t) => setFollowup({...followup, whatToTalkNext: t})}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Priority Level</Text>
              <View style={styles.prioRow}>
                {[
                  { id: 'low', color: '#94a3b8' },
                  { id: 'medium', color: COLORS.primary },
                  { id: 'high', color: COLORS.overdue }
                ].map(p => (
                  <TouchableOpacity 
                    key={p.id} 
                    style={[styles.prioBtn, followup.priority === p.id && { backgroundColor: p.color, borderColor: p.color }]}
                    onPress={() => setFollowup({...followup, priority: p.id})}
                  >
                    <Text style={[styles.prioText, followup.priority === p.id && { color: COLORS.white }]}>
                      {p.id.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.mainBtn, loading && {opacity: 0.7}]} 
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.mainBtnText}>Update CRM Records</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { 
    height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: SPACING.base, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100
  },
  headerBtn: { padding: 4, minWidth: 60 },
  headerTitleGroup: { alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: 15, fontWeight: FONT.bold, color: COLORS.gray900 },
  headerSubtitle: { fontSize: 11, color: COLORS.primary, fontWeight: FONT.bold },
  cancelText: { color: COLORS.gray500, fontWeight: FONT.medium, fontSize: 14 },
  saveText: { color: COLORS.secondary, fontWeight: FONT.extraBold, fontSize: 14, textAlign: 'right' },
  scroll: { padding: SPACING.md },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOW.card },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray100, paddingBottom: 8 },
  cardIcon: { fontSize: 16, marginRight: 8 },
  cardTitle: { fontSize: 13, fontWeight: FONT.extraBold, color: COLORS.gray800, textTransform: 'uppercase' },
  label: { fontSize: 11, fontWeight: FONT.bold, color: COLORS.gray400, marginBottom: 8, textTransform: 'uppercase' },
  inputGroup: { marginBottom: 15 },
  input: { height: 44, backgroundColor: COLORS.gray50, borderRadius: 8, paddingHorizontal: 12, fontSize: 14, color: COLORS.gray900, borderWidth: 1, borderColor: COLORS.gray200 },
  textArea: { height: 80, paddingTop: 10, textAlignVertical: 'top' },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  modeBtn: { flex: 1, height: 60, borderRadius: 10, backgroundColor: COLORS.gray50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gray200 },
  modeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modeIcon: { fontSize: 18, marginBottom: 4 },
  modeBtnText: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.gray600 },
  modeBtnTextActive: { color: COLORS.white },
  dateBtn: { height: 44, backgroundColor: COLORS.gray50, borderRadius: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: COLORS.gray200 },
  dateBtnText: { fontSize: 14, color: COLORS.gray900, fontWeight: FONT.bold },
  prioRow: { flexDirection: 'row', gap: 10 },
  prioBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.gray200, alignItems: 'center' },
  prioText: { fontSize: 10, fontWeight: FONT.extraBold, color: COLORS.gray500 },
  mainBtn: { backgroundColor: COLORS.primary, height: 54, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', marginTop: 10, ...SHADOW.md },
  mainBtnText: { color: COLORS.white, fontSize: 16, fontWeight: FONT.bold },
});

