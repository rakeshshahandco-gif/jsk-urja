import {
    listModuleLocks,
    getModuleLock,
    setModuleLock,
    getModuleLockReport,
} from '../services/moduleLock.service.js';

export async function getModuleLocks(req, res) {
    try {
        const report = await getModuleLockReport();
        return res.json({ success: true, data: report });
    } catch (e) {
        return res.status(e.statusCode || 500).json({ success: false, message: e.message });
    }
}

export async function getOneModuleLock(req, res) {
    try {
        const entry = await getModuleLock(req.params.moduleKey);
        return res.json({ success: true, data: entry });
    } catch (e) {
        return res.status(e.statusCode || 500).json({ success: false, message: e.message });
    }
}

export async function putModuleLock(req, res) {
    try {
        const { locked, scope, reason } = req.body || {};
        if (typeof locked !== 'boolean') {
            return res.status(400).json({ success: false, message: 'locked (boolean) is required' });
        }
        const entry = await setModuleLock({
            moduleKey: req.params.moduleKey,
            locked,
            scope,
            reason,
            user: req.user,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });
        return res.json({ success: true, data: entry });
    } catch (e) {
        return res.status(e.statusCode || 500).json({ success: false, message: e.message });
    }
}

export async function listCatalogLocks(req, res) {
    try {
        const locks = await listModuleLocks();
        return res.json({ success: true, data: locks });
    } catch (e) {
        return res.status(e.statusCode || 500).json({ success: false, message: e.message });
    }
}
