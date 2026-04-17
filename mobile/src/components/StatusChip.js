import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { STATUS_COLORS, FONT, SPACING, RADIUS } from '../theme/colors';

export const StatusChip = ({ status }) => {
  if (!status) return null;
  const colors = STATUS_COLORS[status] || { bg: '#f1f5f9', text: '#475569' };
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{status}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  text: {
    fontSize: FONT.xs,
    fontWeight: FONT.semibold,
  },
});
