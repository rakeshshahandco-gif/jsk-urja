import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '@/hooks/useAuth';
import { env } from '@/config/env';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const { user, token } = useAuth();
    const [connected, setConnected] = useState(false);
    const socketRef = useRef(null);
    const [socketInstance, setSocketInstance] = useState(null);

    useEffect(() => {
        if (user && token) {
            const socket = io(env.SOCKET_URL, {
                auth: { token },
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 15,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000,
            });

            socketRef.current = socket;
            setSocketInstance(socket);

            socket.on('connect', () => {
                console.log('🔌 Socket Connected:', socket.id);
                setConnected(true);
            });

            socket.on('disconnect', (reason) => {
                console.log('🔌 Socket Disconnected:', reason);
                setConnected(false);
            });

            socket.on('connect_error', (err) => {
                console.warn('🔌 Socket Connection Error:', err.message);
                setConnected(false);
            });

            return () => {
                socket.disconnect();
                socketRef.current = null;
                setSocketInstance(null);
                setConnected(false);
            };
        }
    }, [user, token]);

    return (
        <SocketContext.Provider value={{ socket: socketInstance, connected }}>
            {children}
        </SocketContext.Provider>
    );
};
