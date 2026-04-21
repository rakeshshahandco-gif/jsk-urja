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

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
            socket.user = decoded; // Attach user info to socket
            next();
        } catch (error) {
            logger.error(`Socket auth failed: ${error.message}`);
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

        // Join both user room formats
        socket.join(`user:${userId}`);
        socket.join(`user_${userId}`);

        // Join global company room
        socket.join('company_all');

        // Notify others that user is online
        socket.to('company_all').emit('messenger:user_online', { userId });
        
        // Sync status on connect/reconnect
        socket.emit('messenger:sync_status', { status: 'online' });

        // ── WhatsApp Room ──────────────────────────────────────────────────────
        // Client emits this when opening the WhatsApp Settings page
        socket.on('join:whatsapp', () => {
            socket.join('whatsapp_room');
            logger.info(`[WhatsApp] Socket ${socket.id} (User: ${userId}) joined whatsapp_room`);

            // Push this user's specific status (not the shared admin session)
            import('../services/whatsapp.service.js').then(({ default: WhatsAppService }) => {
                const status = WhatsAppService.getStatus(userId);
                socket.emit('whatsapp:status', status);
            }).catch(() => {});
        });

        socket.on('leave:whatsapp', () => {
            socket.leave('whatsapp_room');
        });

        // ── Messenger: Typing Indicators ──────────────────────────────────────
        socket.on('messenger:typing', ({ threadId, participantIds }) => {
            if (!threadId || !participantIds) return;
            participantIds.forEach((uid) => {
                if (uid !== userId) {
                    io.to(`user:${uid}`).to(`user_${uid}`).emit('messenger:typing', {
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
                    io.to(`user:${uid}`).to(`user_${uid}`).emit('messenger:stop_typing', {
                        threadId,
                        userId,
                    });
                }
            });
        });

        // ── Messenger: Online Presence ─────────────────────────────────────────
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
