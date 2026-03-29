import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '@/hooks/useAuth';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const { user, token } = useAuth();
    const [connected, setConnected] = useState(false);
    const socketRef = useRef(null);

    useEffect(() => {
        if (user && token) {
            const socketUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';
            
            socketRef.current = io(socketUrl, {
                auth: { token },
                transports: ['websocket', 'polling'],
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
