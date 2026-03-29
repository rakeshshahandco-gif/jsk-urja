import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './useAuth'; // Assumes useAuth is available here

import { env } from '../config/env';
const SOCKET_URL = env.SOCKET_URL;

let socketInstance = null;

export const getSocket = (token) => {
    if (!socketInstance && token) {
        socketInstance = io(SOCKET_URL, {
            auth: { token },
            transports: ['websocket', 'polling'] // Try websocket first
        });

        socketInstance.on('connect', () => {
            console.log('Connected to global real-time sync server');
        });

        socketInstance.on('disconnect', () => {
            console.log('Disconnected from real-time sync server');
        });
    }
    return socketInstance;
};

export const useGlobalSync = (moduleName, onSyncEvent) => {
    const { token } = useAuth();
    const callbackRef = useRef(onSyncEvent);

    // Keep the latest callback without re-triggering useEffect
    useEffect(() => {
        callbackRef.current = onSyncEvent;
    }, [onSyncEvent]);

    useEffect(() => {
        if (!token) return;

        const socket = getSocket(token);

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
    }, [token, moduleName]);
};
