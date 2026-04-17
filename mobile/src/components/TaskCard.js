import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';
import { PriorityBadge } from './PriorityBadge';
import { StatusChip } from './StatusChip';

const getDueStatus = (dueDate) => {
  if (!dueDate) return 'none';
  const d = typeof dueDate === 'string' ? parseISO(dueDate) : new Date(dueDate);
  if (isPast(d) && !isToday(d)) return 'overdue';
  if (isToday(d)) return 'today';
  return 'upcoming';
};

const DUE_COLORS = {
  overdue: COLORS.overdue,
  today: COLORS.today,
  upcoming: COLORS.upcoming7,
  none: COLORS.gray400,
};

export const TaskCard = ({ task, onPress }) => {
  const dueStatus = getDueStatus(task.nextDueDate || task.dueDate);
  const dueColor = DUE_COLORS[dueStatus];

  const formatDue = (date) => {
    if (!date) return '—';
    try {
      const d = typeof date === 'string' ? parseISO(date) : new Date(date);
      return format(d, 'dd/MM/yy HH:mm');
    } catch {
      return '—';
    }
  };

  const assigneeName = task.assignedTo?.name || task.assignedTo || '—';
  const groupName = task.group?.name || task.group || '—';

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: dueColor }]}
      onPress={() => onPress(task)}
      activeOpacity={0.85}
    >
      {/* Task Name */}
      <Text style={styles.taskName} numberOfLines={2}>
        {task.title || task.name || 'Untitled Task'}
      </Text>

      {/* Group & Due Date Row */}
      <View style={styles.infoRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText} numberOfLines={1}>📁 {groupName}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: dueColor + '20', borderColor: dueColor + '60' }]}>
          <Text style={[styles.pillText, { color: dueColor }]}>
            🗓 {formatDue(task.nextDueDate || task.dueDate)}
          </Text>
        </View>
      </View>

      {/* Assignee, Priority, Status */}
      <View style={styles.bottomRow}>
        <Text style={styles.assignee} numberOfLines={1}>👤 {assigneeName}</Text>
        <View style={styles.badgeRow}>
          <PriorityBadge priority={task.priority} />
          <View style={{ width: 6 }} />
          <StatusChip status={task.status} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    marginVertical: SPACING.xs,
    marginHorizontal: SPACING.base,
    borderLeftWidth: 4,
    ...SHADOW.card,
  },
  taskName: {
    fontSize: FONT.base,
    fontWeight: FONT.bold,
    color: COLORS.gray900,
    marginBottom: SPACING.sm,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  pill: {
    backgroundColor: COLORS.gray100,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    maxWidth: '60%',
  },
  pillText: {
    fontSize: FONT.xs,
    color: COLORS.gray600,
    fontWeight: FONT.semibold,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assignee: {
    fontSize: FONT.sm,
    color: COLORS.gray500,
    flex: 1,
    marginRight: SPACING.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
