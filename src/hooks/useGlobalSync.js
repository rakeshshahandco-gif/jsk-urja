import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { useSocket } from '../contexts/SocketContext';

/**
 * useGlobalSync
 * Listens to real-time entity change events from the backend.
 * 
 * Events listened:
 *   - 'entityChange'  - generic event emitted by task/entity controllers
 *   - 'task:assigned' - specific event emitted when a task is assigned to a user
 *   - 'task:updated'  - specific event emitted when a task is updated
 *   - 'task:deleted'  - specific event emitted when a task is deleted
 */
export const useGlobalSync = (moduleName, onSyncEvent) => {
    const { token } = useAuth();
    const { socket } = useSocket();
    const callbackRef = useRef(onSyncEvent);

    // Always keep the latest callback without re-triggering useEffect
    useEffect(() => {
        callbackRef.current = onSyncEvent;
    }, [onSyncEvent]);

    useEffect(() => {
        if (!token || !socket) return;

        // ── Handler 1: Generic entityChange event ─────────────────────────────
        const handleEntityChange = (payload) => {
            // payload format: { moduleName, action, recordId, data, changedFields, timestamp }
            if (payload.moduleName === moduleName || moduleName === 'all') {
                if (callbackRef.current) {
                    callbackRef.current(payload);
                }
            }
        };

        // ── Handler 2: task:assigned (specific event for new task assignments) ──
        // This fires in addition to entityChange for immediate redundancy
        const handleTaskAssigned = (taskData) => {
            if (moduleName === 'task' || moduleName === 'all') {
                if (callbackRef.current) {
                    callbackRef.current({
                        moduleName: 'task',
                        action: 'create',
                        recordId: taskData._id,
                        data: taskData,
                        changedFields: [],
                        timestamp: new Date(),
                    });
                }
            }
        };

        // ── Handler 3: task:updated ───────────────────────────────────────────
        const handleTaskUpdated = (taskData) => {
            if (moduleName === 'task' || moduleName === 'all') {
                if (callbackRef.current) {
                    callbackRef.current({
                        moduleName: 'task',
                        action: 'update',
                        recordId: taskData._id,
                        data: taskData,
                        changedFields: [],
                        timestamp: new Date(),
                    });
                }
            }
        };

        // ── Handler 4: task:deleted ───────────────────────────────────────────
        const handleTaskDeleted = (taskData) => {
            if (moduleName === 'task' || moduleName === 'all') {
                if (callbackRef.current) {
                    callbackRef.current({
                        moduleName: 'task',
                        action: 'delete',
                        recordId: taskData._id,
                        data: taskData,
                        changedFields: [],
                        timestamp: new Date(),
                    });
                }
            }
        };

        socket.on('entityChange', handleEntityChange);

        // Only register task-specific listeners for task module
        if (moduleName === 'task' || moduleName === 'all') {
            socket.on('task:assigned', handleTaskAssigned);
            socket.on('task:updated', handleTaskUpdated);
            socket.on('task:deleted', handleTaskDeleted);
        }

        return () => {
            socket.off('entityChange', handleEntityChange);
            if (moduleName === 'task' || moduleName === 'all') {
                socket.off('task:assigned', handleTaskAssigned);
                socket.off('task:updated', handleTaskUpdated);
                socket.off('task:deleted', handleTaskDeleted);
            }
        };
    }, [token, socket, moduleName]);

    return { socket };
};
