import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { format, parseISO } from 'date-fns';
import { COLORS, FONT, SPACING, RADIUS } from '../theme/colors';

export const UpdateItem = ({ update, isLast }) => {
  const formatDate = (date) => {
    if (!date) return '';
    try {
      const d = typeof date === 'string' ? parseISO(date) : new Date(date);
      return format(d, 'dd/MM/yy HH:mm');
    } catch {
      return '';
    }
  };

  const authorName = update.updatedBy?.name || update.author?.name || update.updatedBy || 'System';

  return (
    <View style={styles.container}>
      <View style={styles.timeline}>
        <View style={styles.dot} />
        {!isLast && <View style={styles.line} />}
      </View>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.author}>{authorName}</Text>
          <Text style={styles.date}>{formatDate(update.createdAt || update.date)}</Text>
        </View>
        <Text style={styles.note}>{update.note || update.text || update.message || ''}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: SPACING.xs,
  },
  timeline: {
    width: 20,
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.gray200,
    marginTop: 2,
  },
  content: {
    flex: 1,
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  author: {
    fontSize: FONT.sm,
    fontWeight: FONT.bold,
    color: COLORS.primary,
  },
  date: {
    fontSize: FONT.xs,
    color: COLORS.gray400,
  },
  note: {
    fontSize: FONT.sm,
    color: COLORS.gray700,
    lineHeight: 19,
  },
});
