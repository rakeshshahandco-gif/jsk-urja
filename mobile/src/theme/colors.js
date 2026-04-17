// Design tokens for JSK Urja Task Mobile App
export const COLORS = {
  primary: '#1e3a8a',       // Deep blue — matches CRM brand
  primaryLight: '#3b82f6',
  primaryDark: '#1e40af',
  accent: '#f59e0b',        // Amber
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  overdue: '#dc2626',
  today: '#7c3aed',
  upcoming7: '#2563eb',
  upcomingMore: '#059669',
  white: '#ffffff',
  black: '#0f172a',
  gray50: '#f8fafc',
  gray100: '#f1f5f9',
  gray200: '#e2e8f0',
  gray300: '#cbd5e1',
  gray400: '#94a3b8',
  gray500: '#64748b',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1e293b',
  gray900: '#0f172a',
  card: '#ffffff',
  background: '#f1f5f9',
};

export const PRIORITY_COLORS = {
  LOW: { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  MEDIUM: { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
  HIGH: { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
  URGENT: { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
};

export const STATUS_COLORS = {
  Open: { bg: '#dbeafe', text: '#1d4ed8' },
  'In Progress': { bg: '#fef3c7', text: '#b45309' },
  Closed: { bg: '#dcfce7', text: '#15803d' },
  Concluded: { bg: '#dcfce7', text: '#15803d' },
  Overdue: { bg: '#fee2e2', text: '#b91c1c' },
};

export const FONT = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 19,
  xl: 22,
  xxl: 26,
  bold: '700',
  semibold: '600',
  regular: '400',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  strong: {
    shadowColor: '#1e3a8a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
};
