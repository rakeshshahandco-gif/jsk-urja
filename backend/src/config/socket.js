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

        socket.on('disconnect', () => {
            logger.info(`🔌 Socket disconnected: ${socket.id}`);
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
