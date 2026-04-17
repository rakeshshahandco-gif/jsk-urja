import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT, SPACING } from '../theme/colors';

export const EmptyState = ({ icon = '📋', message = 'No tasks found', subtext }) => (
  <View style={styles.container}>
    <Text style={styles.icon}>{icon}</Text>
    <Text style={styles.message}>{message}</Text>
    {subtext && <Text style={styles.subtext}>{subtext}</Text>}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  icon: {
    fontSize: 52,
    marginBottom: SPACING.base,
  },
  message: {
    fontSize: FONT.md,
    fontWeight: FONT.bold,
    color: COLORS.gray500,
    textAlign: 'center',
  },
  subtext: {
    fontSize: FONT.sm,
    color: COLORS.gray400,
    marginTop: 6,
    textAlign: 'center',
  },
});
