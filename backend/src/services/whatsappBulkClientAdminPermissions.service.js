/**
 * Persist WhatsApp Bulk permissions for Client Admin roles only.
 * Idempotent. Does not touch Superadmin, viewer, staff, or custom roles.
 * Does not overwrite explicit false denies.
 */
import { Role } from '../models/role.model.js';
import logger from '../utils/logger.js';
import {
  ensureClientAdminWhatsappBulkPermissions,
  isClientAdminRole,
} from '../utils/permission.utils.js';

export async function persistClientAdminWhatsappBulkPermissions() {
  const roles = await Role.find({ name: { $regex: /^admin$/i } });
  let updated = 0;
  let skipped = 0;

  for (const role of roles) {
    if (!isClientAdminRole(role)) {
      skipped += 1;
      continue;
    }
    const before = JSON.stringify(role.permissions || {});
    const next = ensureClientAdminWhatsappBulkPermissions(role.permissions || {});
    const after = JSON.stringify(next);
    if (before === after) {
      skipped += 1;
      continue;
    }
    role.permissions = next;
    role.markModified('permissions');
    await role.save();
    updated += 1;
    logger.info(`Granted missing whatsapp_bulk permissions to Client Admin role: ${role.name}`);
  }

  return { updated, skipped, matched: roles.length };
}

export default { persistClientAdminWhatsappBulkPermissions };
