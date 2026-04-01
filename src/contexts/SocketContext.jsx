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

    useEffect(() => {
        if (user && token) {
            socketRef.current = io(env.SOCKET_URL, {
                auth: { token },
                transports: ['websocket', 'polling'], // Prioritize websocket
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 2000,
                timeout: 5000,
            });

            const socket = socketRef.current;

            socket.on('connect', () => {
                console.log('🔌 Global Socket Connected');
                setConnected(true);
            });

            socket.on('disconnect', () => {
                console.log('🔌 Global Socket Disconnected');
                setConnected(false);
            });

            return () => {
                if (socket) {
                    socket.disconnect();
                }
            };
        }
    }, [user, token]);

    return (
        <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
            {children}
        </SocketContext.Provider>
    );
};
