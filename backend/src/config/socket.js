import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from './config.js';
import logger from '../utils/logger.js';

let io;

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: [
                'http://localhost:4000', 
                'http://localhost:4001', 
                'http://localhost:5173', 
                'https://jsk-urja.onrender.com',
                'https://jsk-urja-backend.onrender.com'
            ],
            credentials: true,
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
        connectTimeout: 45000,
        allowEIO3: true,
    });

    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
            if (!token) {
                return next(new Error('Authentication error'));
            }

            const decoded = jwt.verify(token, config.jwt.secret);
            socket.user = decoded; // Attach user info to socket
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user.id || socket.user.sub;
        if (!userId) {
            logger.warn(`🔌 Socket connected without userId: ${socket.id}`);
            return;
        }
        
        logger.info(`🔌 Socket connected: ${socket.id} (User: ${userId})`);

        // Join user's specific room
        socket.join(`user:${userId}`);

        // Join global company room
        socket.join('company_all');

        // ── Messenger: Typing Indicators ──────────────────────────────────────
        socket.on('messenger:typing', ({ threadId, participantIds }) => {
            if (!threadId || !participantIds) return;
            participantIds.forEach((uid) => {
                if (uid !== userId) {
                    // Emit to both formats for safety during migration
                    io.to(`user:${uid}`).emit('messenger:typing', {
                        threadId,
                        userId,
                    });
                    io.to(`user_${uid}`).emit('messenger:typing', {
                        threadId,
                        userId,
                    });
                }
            });
        });

        socket.on('messenger:stop_typing', ({ threadId, participantIds }) => {
            if (!threadId || !participantIds) return;
            participantIds.forEach((uid) => {
                if (uid !== userId) {
                    io.to(`user:${uid}`).emit('messenger:stop_typing', {
                        threadId,
                        userId,
                    });
                    io.to(`user_${uid}`).emit('messenger:stop_typing', {
                        threadId,
                        userId,
                    });
                }
            });
        });

        // ── Messenger: Online Presence ─────────────────────────────────────────
        // Broadcast to company_all that this user is online
        socket.to('company_all').emit('messenger:user_online', { userId });

        socket.on('disconnect', (reason) => {
            logger.info(`🔌 Socket disconnected: ${socket.id} (User: ${userId}) Reason: ${reason}`);
            socket.to('company_all').emit('messenger:user_offline', {
                userId,
                lastSeen: new Date(),
            });
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};
