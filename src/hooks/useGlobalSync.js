import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { useSocket } from '../contexts/SocketContext';

export const useGlobalSync = (moduleName, onSyncEvent) => {
    const { token } = useAuth();
    const { socket } = useSocket();
    const callbackRef = useRef(onSyncEvent);

    // Keep the latest callback without re-triggering useEffect
    useEffect(() => {
        callbackRef.current = onSyncEvent;
    }, [onSyncEvent]);

    useEffect(() => {
        if (!token || !socket) return;

        const handleEntityChange = (payload) => {
            // payload format: { moduleName, action, recordId, data, changedFields, timestamp }
            if (payload.moduleName === moduleName || moduleName === 'all') {
                if (callbackRef.current) {
                    callbackRef.current(payload);
                }
            }
        };

        socket.on('entityChange', handleEntityChange);

        return () => {
            socket.off('entityChange', handleEntityChange);
        };
    }, [token, socket, moduleName]);

    return { socket };
};
