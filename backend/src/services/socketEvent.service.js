import { getIO } from '../config/socket.js';
import { User } from '../models/user.model.js';
import { Task } from '../models/task.model.js';

export const emitTaskUpdate = async (taskId, action, actorId) => {
    try {
        const fullTask = await Task.findById(taskId)
            .populate('assigneeIds', 'name email username')
            .populate('createdBy', 'name email username')
            .populate('taskCategoryId', 'name')
            .populate('assignedGroupId', 'name')
            .populate('groupId', 'name')
            .populate('taskMasterId', 'title recurrence');

        if (!fullTask) return;

        const updateNotifyUsers = new Set();
        if (fullTask.assigneeIds) {
            fullTask.assigneeIds.forEach(u => updateNotifyUsers.add(u._id.toString()));
        }
        if (fullTask.createdBy) {
            updateNotifyUsers.add(fullTask.createdBy._id.toString());
        }

        if (fullTask.assignToAll) {
            const allUsers = await User.find({ isActive: true }).select('_id');
            allUsers.forEach(u => updateNotifyUsers.add(u._id.toString()));
        }

        const io = getIO();
        const payload = {
            moduleName: 'task',
            action, // 'create', 'update', 'delete'
            recordId: taskId.toString(),
            data: fullTask.toObject(),
            timestamp: new Date()
        };

        for (const userId of updateNotifyUsers) {
            const roomNew = `user:${userId}`;
            const roomOld = `user_${userId}`;
            
            // 1. Unified entityChange event for sync logic
            io.to(roomNew).emit('entityChange', payload);
            io.to(roomOld).emit('entityChange', payload);

            // 2. Specific 'task:*' events for detailed UI/state management
            const taskEventMapping = {
                create: 'task:assigned',
                update: 'task:updated',
                delete: 'task:deleted'
            };
            io.to(roomNew).emit(taskEventMapping[action] || 'task:updated', fullTask.toObject());
            io.to(roomOld).emit(taskEventMapping[action] || 'task:updated', fullTask.toObject());
        }
    } catch (err) {
        console.error(`Socket emit task update failed:`, err);
    }
};
