import express from 'express';
import authRoute from './auth.routes.js';
import userRoute from './user.routes.js';
import customerRoute from './customer.routes.js';
import followUpRoute from './followup.routes.js';
import conversationRoute from './conversation.routes.js';
import reminderRoute from './reminder.routes.js';
import reportRoute from './report.routes.js';
import taskRoute from './task.routes.js';
import taskCategoryRoute from './taskCategory.routes.js';
import groupRoute from './group.routes.js';

const router = express.Router();

// Route definitions will go here
router.get('/health', (req, res) => {
    res.send({ status: 'OK', version: '1.1.0-debug', uptime: process.uptime() });
});

const defaultRoutes = [
    {
        path: '/auth',
        route: authRoute,
    },
    {
        path: '/users',
        route: userRoute,
    },
    {
        path: '/customers',
        route: customerRoute,
    },
    {
        path: '/followups',
        route: followUpRoute,
    },
    {
        path: '/conversations',
        route: conversationRoute,
    },
    {
        path: '/reminders',
        route: reminderRoute,
    },
    {
        path: '/reports',
        route: reportRoute,
    },
    {
        path: '/tasks',
        route: taskRoute,
    },
    {
        path: '/task-categories',
        route: taskCategoryRoute,
    },
    {
        path: '/groups',
        route: groupRoute,
    },
];

defaultRoutes.forEach((route) => {
    router.use(route.path, route.route);
});

export default router;
