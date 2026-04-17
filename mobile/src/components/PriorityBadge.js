import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, PRIORITY_COLORS, FONT, SPACING, RADIUS } from '../theme/colors';

export const PriorityBadge = ({ priority }) => {
  if (!priority) return null;
  const p = priority.toUpperCase();
  const colors = PRIORITY_COLORS[p] || PRIORITY_COLORS.MEDIUM;
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.text, { color: colors.text }]}>{priority}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  text: {
    fontSize: FONT.xs,
    fontWeight: FONT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
