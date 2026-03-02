import { getIO } from '../config/socket.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

const _emitEvent = (doc, action, oldDoc = null) => {
    try {
        const io = getIO();
        if (!io) return;

        const modelName = doc.constructor.modelName;
        const recordId = doc._id.toString();

        // Find fields that changed (for updates)
        let changedFields = [];
        if (action === 'update' && oldDoc) {
            const currentObj = doc.toJSON();
            const oldObj = oldDoc;
            for (const key in currentObj) {
                // simple check for what changed, mostly for debugging or precise frontend patching
                // For nested objects stringify is naive but works for a generic flag.
                // We'll just send the full document for the frontend to patch safely, or let them merge.
                // Actually, just knowing it changed is often enough.
                if (JSON.stringify(currentObj[key]) !== JSON.stringify(oldObj[key])) {
                    changedFields.push(key);
                }
            }
        }

        const payload = {
            moduleName: modelName.toLowerCase(), // task, customer, item
            action, // create, update, delete
            recordId,
            data: action === 'delete' ? {} : doc.toJSON(),
            changedFields,
            timestamp: new Date()
        };

        // Determine visibility rules
        // Default: broadcast to global room, UNLESS specific logic is required.
        // For Tasks: only visible to assigned / created / 'All Users'
        // For Customers: usually all users in this small CRM, but let's check visibility

        let rooms = ['company_all']; // broadcast to everyone natively

        // If it's a model with strict visibility, send selectively
        // E.g Task model where visibility is restrictive
        if (modelName === 'Task') {
            rooms = [];
            const isAllUsers = doc.visibility === 'All Users';
            if (isAllUsers) {
                rooms.push('company_all');
            } else {
                // Send to assigned users
                if (doc.assignedUsers && Array.isArray(doc.assignedUsers)) {
                    doc.assignedUsers.forEach(id => rooms.push(`user_${id.toString()}`));
                }
                // Send to creator
                if (doc.createdBy) {
                    rooms.push(`user_${doc.createdBy.toString()}`);
                }
                // Send to task group members
                // This requires joining group rooms or querying the group. 
                // To keep it simple globally, if it has restricted assignment, we emit strictly. 
                // If the frontend receives an event for a record they don't have access to, they just won't show it anyway.
                // So emitting strictly to assignee/creator is best here.
            }
        }

        // Ensure unique rooms
        rooms = [...new Set(rooms)];

        rooms.forEach(room => {
            io.to(room).emit('entityChange', payload);
        });

    } catch (e) {
        logger.error(`Error emitting socket event for ${action} on ${doc?.constructor?.modelName}`, e);
    }
};

export const realtimeSyncPlugin = (schema) => {
    // PRE hooks to capture old document before update/delete (to compute diffs or get ID)
    schema.pre('findOneAndUpdate', async function () {
        this._oldDoc = await this.model.findOne(this.getQuery()).lean();
    });

    schema.pre('findOneAndDelete', async function () {
        this._oldDoc = await this.model.findOne(this.getQuery()).lean();
    });

    // POST hooks
    schema.post('save', function (doc) {
        // if isNew is true, it was created, else updated
        // Mongoose post save on existing docs does not have `isNew` directly available here unless we checked it pre-save.
        // However, standard .save() on new docs triggers this.
        const action = doc.createdAt && doc.createdAt.getTime() === doc.updatedAt?.getTime() ? 'create' : 'update';
        _emitEvent(doc, action);
    });

    schema.post('findOneAndUpdate', function (doc) {
        if (!doc) return;
        _emitEvent(doc, 'update', this._oldDoc);
    });

    schema.post('findOneAndDelete', function (doc) {
        if (!doc) return;
        _emitEvent(doc, 'delete');
    });
};
