import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING } from '../theme/colors';

/**
 * Blocks screen when user lacks the same permission key used on web CRM.
 */
/** permission: string, or string[] (any one grants access) */
export const PermissionGate = ({ permission, permissions, children, title = 'Access denied' }) => {
  const { hasPermission } = useAuth();

  const keys = permissions || (permission ? [permission] : []);
  const allowed = keys.length === 0 || keys.some((p) => hasPermission(p));

  if (keys.length > 0 && !allowed) {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.msg}>
          Your account does not have permission for this module on JSK CRM.
        </Text>
      </View>
    );
  }

  return children;
};

const styles = StyleSheet.create({
  box: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: 8,
  },
  msg: {
    fontSize: 14,
    color: COLORS.gray500,
    textAlign: 'center',
  },
});
