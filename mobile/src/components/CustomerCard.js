import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../theme/colors';

export const CustomerCard = ({ customer, onPress }) => {
  if (!customer) return null;
  // Mirror logic for display names
  const company = customer.company || customer.customerName || customer.companyName || 'Unknown';
  const brand = customer.companyBrand ? ` (${customer.companyBrand})` : '';
  const displayName = company + brand;
  
  const city = customer.city || 'No City';
  const code = customer.customerCode || customer.ledgerCode || '---';
  
  // Status mapping to match CRM Web
  const status = customer.status || customer.customerStatus || 'lead';
  
  const getStatusColor = (s) => {
    if (!s) return { bg: '#F5F5F5', text: '#616161', label: 'Lead' };
    const val = s.toLowerCase();
    switch (val) {
      case 'running_high': return { bg: '#E8F5E9', text: '#2E7D32', label: 'Running High' };
      case 'running_low': return { bg: '#FFF3E0', text: '#EF6C00', label: 'Running Low' };
      case 'inactive': return { bg: '#FFEBEE', text: '#C62828', label: 'Inactive' };
      case 'lead': return { bg: '#E3F2FD', text: '#1565C0', label: 'Lead' };
      default: return { bg: '#F5F5F5', text: '#616161', label: s };
    }
  };

  const statusStyle = getStatusColor(status);
  const primaryContact = Array.isArray(customer.contactPersons) ? (customer.contactPersons.find(c => c.isPrimary) || customer.contactPersons[0]) : null;
  const phone = primaryContact?.mobile || customer.phone;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(customer)}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{company.charAt(0).toUpperCase()}</Text>
        </View>
        
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {statusStyle.label}
              </Text>
            </View>
          </View>
          
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Code:</Text>
              <Text style={styles.infoValue}>{code}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>City:</Text>
              <Text style={styles.infoValue}>{city}</Text>
            </View>
          </View>

          {/* Stickers Row (Mirror of Web tags) */}
          {customer.stickers && customer.stickers.length > 0 && (
            <View style={styles.stickerRow}>
              {customer.stickers.slice(0, 3).map((s, idx) => (
                <View 
                  key={s._id || idx} 
                  style={[styles.sticker, { backgroundColor: (s.color || '#64748b') + '20', borderColor: s.color || '#64748b' }]}
                >
                  <Text style={[styles.stickerText, { color: s.color || '#64748b' }]}>{s.name}</Text>
                </View>
              ))}
              {customer.stickers.length > 3 && (
                <Text style={styles.moreStickers}>+{customer.stickers.length - 3} more</Text>
              )}
            </View>
          )}
          
          {phone && (
            <View style={styles.contactRow}>
              <Text style={styles.phone}>📞 {phone}</Text>
              {primaryContact?.name ? (
                <Text style={styles.contactName}> • {primaryContact.name}</Text>
              ) : null}
            </View>
          )}
        </View>
        
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.base,
    marginVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    ...SHADOW.card,
    padding: SPACING.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: FONT.bold,
    color: COLORS.primary,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: FONT.md,
    fontWeight: FONT.bold,
    color: COLORS.gray900,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  statusText: {
    fontSize: 9,
    fontWeight: FONT.bold,
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 11,
    color: COLORS.gray500,
    marginRight: 4,
  },
  infoValue: {
    fontSize: 11,
    fontWeight: FONT.semibold,
    color: COLORS.gray700,
  },
  stickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginVertical: 4,
  },
  sticker: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  stickerText: {
    fontSize: 9,
    fontWeight: FONT.bold,
  },
  moreStickers: {
    fontSize: 9,
    color: COLORS.gray400,
    alignSelf: 'center',
  },
  contactRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  phone: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: FONT.bold,
  },
  contactName: {
    fontSize: 11,
    color: COLORS.gray500,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.gray300,
    marginLeft: 8,
  },
});
