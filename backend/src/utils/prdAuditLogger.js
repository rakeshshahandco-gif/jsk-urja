import PrdAudit from '../models/prdAudit.model.js';

export const logPrdAudit = async (recordId, modelName, action, userId, oldData = null, newData = null, ipAddress = null, reason = null) => {
    try {
        const audit = {
            entityId: recordId,
            entityType: modelName,
            action,
            changedBy: userId,
            date: new Date(),
            changes: [],
            reason,
            ipAddress
        };

        if (action === 'Update' && oldData && newData) {
            const changes = [];
            const allKeys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
            
            for (const key of allKeys) {
                if (['createdAt', 'updatedAt', '__v', '_id', 'enteredBy', 'projectId'].includes(key)) continue;
                
                const oldVal = oldData[key];
                const newVal = newData[key];
                const oldStr = JSON.stringify(oldVal);
                const newStr = JSON.stringify(newVal);

                if (oldStr !== newStr) {
                    changes.push({
                        field: key,
                        oldValue: oldVal ? oldVal.toString() : '',
                        newValue: newVal ? newVal.toString() : ''
                    });
                }
            }
            audit.changes = changes;
        }

        await PrdAudit.create(audit);
    } catch (error) {
        console.error('Audit Logging Error:', error);
    }
};
