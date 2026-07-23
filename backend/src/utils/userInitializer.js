import { Role } from '../models/role.model.js';
import { Department } from '../models/department.model.js';
import { User } from '../models/user.model.js';
import logger from './logger.js';
import { persistClientAdminWhatsappBulkPermissions } from '../services/whatsappBulkClientAdminPermissions.service.js';
import { ensureClientAdminWhatsappBulkPermissions } from './permission.utils.js';

const defaultRoles = [
    { name: 'superadmin', description: 'Full access to everything', isSystemRole: true },
    { name: 'admin', description: 'Administrative access', isSystemRole: true },
    { name: 'accounts', description: 'Accounting and finance access', isSystemRole: false },
    { name: 'sales', description: 'Sales and CRM access', isSystemRole: false },
    { name: 'purchase', description: 'Purchase and procurement access', isSystemRole: false },
    { name: 'inventory', description: 'Inventory and warehouse access', isSystemRole: false },
    { name: 'production', description: 'Production and manufacturing access', isSystemRole: false },
    { name: 'staff', description: 'General staff access', isSystemRole: false },
    { name: 'viewer', description: 'Read-only access', isSystemRole: false }
];

const defaultDepartments = [
    'Admin', 'Accounts', 'Sales', 'Purchase', 'Inventory', 'Production', 'Service', 'Dispatch', 'QC'
];

export const initializeUserManagement = async () => {
    try {
        logger.info('Initializing User Management entries...');

        // 1. Initialize Departments
        for (const deptName of defaultDepartments) {
            const exists = await Department.findOne({ name: deptName });
            if (!exists) {
                await Department.create({ name: deptName });
                logger.info(`Created department: ${deptName}`);
            }
        }

        // 2. Initialize Roles
        const roleMap = {};
        for (const roleData of defaultRoles) {
            let role = await Role.findOne({ name: roleData.name });
            if (!role) {
                // New Client Admin role gets WhatsApp Bulk keys from registry immediately
                const createPayload = { ...roleData };
                if (String(roleData.name).toLowerCase() === 'admin') {
                    createPayload.permissions = ensureClientAdminWhatsappBulkPermissions({});
                }
                role = await Role.create(createPayload);
                logger.info(`Created role: ${roleData.name}`);
            }
            roleMap[roleData.name] = role._id;
        }

        // 2b. Idempotent backfill: existing Client Admin roles missing whatsapp_bulk.*
        try {
            const result = await persistClientAdminWhatsappBulkPermissions();
            if (result.updated > 0) {
                logger.info(`Client Admin whatsapp_bulk permissions updated for ${result.updated} role(s)`);
            }
        } catch (permErr) {
            logger.error('Client Admin whatsapp_bulk permission backfill failed:', permErr);
        }

        // 3. Ensure Super Admin user has the role assigned correctly
        // (Assuming there might be an existing 'admin' user from previous setup)
        const superadmin = await User.findOne({ username: 'admin' });
        if (superadmin && !superadmin.role) {
            superadmin.role = roleMap['superadmin'];
            superadmin.roleName = 'superadmin';
            await superadmin.save();
            logger.info('Assigned superadmin role to admin user');
        }

        logger.info('User Management initialization completed.');
    } catch (error) {
        logger.error('Error initializing User Management:', error);
    }
};
