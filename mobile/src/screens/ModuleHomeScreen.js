import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import ENV from '../config/env';
import { COLORS, RADIUS, SHADOW, SPACING } from '../theme/colors';

const ModuleCard = ({ title, subtitle, icon, onPress, color }) => (
  <TouchableOpacity style={[styles.card, { borderLeftColor: color }]} onPress={onPress} activeOpacity={0.85}>
    <Text style={styles.cardIcon}>{icon}</Text>
    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.cardSub}>{subtitle}</Text>
  </TouchableOpacity>
);

export const ModuleHomeScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const cardWidth = isTablet ? '48%' : '100%';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>JSK CRM</Text>
          <Text style={styles.welcome}>Hello, {user?.name || user?.username || 'User'}</Text>
          <Text style={styles.env}>
            {ENV.envName} · {selectedCompany?.companyName || 'Loading company…'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.section}>Modules</Text>
        <View style={[styles.grid, isTablet && styles.gridTablet]}>
          <View style={{ width: cardWidth }}>
            <ModuleCard
              title="CRM"
              subtitle="Customer Master — list, create, edit"
              icon="👤"
              color="#2563eb"
              onPress={() => navigation.navigate('CRM')}
            />
          </View>
          <View style={{ width: cardWidth }}>
            <ModuleCard
              title="Task Management"
              subtitle="Tasks — create, assign, complete"
              icon="📋"
              color="#059669"
              onPress={() => navigation.navigate('Tasks')}
            />
          </View>
          <View style={{ width: cardWidth }}>
            <ModuleCard
              title="Sales"
              subtitle="Sales Order & Tax Invoice"
              icon="🧾"
              color="#d97706"
              onPress={() => navigation.navigate('Sales')}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  brand: { fontSize: 22, fontWeight: '800', color: COLORS.white },
  welcome: { fontSize: 15, color: '#e2e8f0', marginTop: 4 },
  env: { fontSize: 11, color: '#94a3b8', marginTop: 6 },
  scroll: { padding: SPACING.lg, paddingBottom: 40 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gray500,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: { gap: SPACING.md },
  gridTablet: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderLeftWidth: 4,
    ...SHADOW.card,
  },
  cardIcon: { fontSize: 28, marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray800 },
  cardSub: { fontSize: 13, color: COLORS.gray500, marginTop: 4 },
});
