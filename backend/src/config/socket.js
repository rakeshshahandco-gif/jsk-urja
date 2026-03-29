import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from './config.js';
import logger from '../utils/logger.js';

let io;

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: ['http://localhost:4000', 'http://localhost:5173', 'https://jsk-urja.onrender.com'],
            credentials: true,
        },
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
        logger.info(`🔌 Socket connected: ${socket.id} (User: ${socket.user.sub})`);

        // Join user's specific room
        socket.join(`user_${socket.user.sub}`);
        // Join global company room
        socket.join('company_all');

        // ── Messenger: Typing Indicators ──────────────────────────────────────
        socket.on('messenger:typing', ({ threadId, participantIds }) => {
            if (!threadId || !participantIds) return;
            participantIds.forEach((uid) => {
                if (uid !== socket.user.sub) {
                    io.to(`user_${uid}`).emit('messenger:typing', {
                        threadId,
                        userId: socket.user.sub,
                    });
                }
            });
        });

        socket.on('messenger:stop_typing', ({ threadId, participantIds }) => {
            if (!threadId || !participantIds) return;
            participantIds.forEach((uid) => {
                if (uid !== socket.user.sub) {
                    io.to(`user_${uid}`).emit('messenger:stop_typing', {
                        threadId,
                        userId: socket.user.sub,
                    });
                }
            });
        });

        // ── Messenger: Online Presence ─────────────────────────────────────────
        // Broadcast to company_all that this user is online
        socket.to('company_all').emit('messenger:user_online', { userId: socket.user.sub });

        socket.on('disconnect', () => {
            logger.info(`🔌 Socket disconnected: ${socket.id}`);
            socket.to('company_all').emit('messenger:user_offline', {
                userId: socket.user.sub,
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
