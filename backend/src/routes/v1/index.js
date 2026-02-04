import express from 'express';
import customerRoute from './customer.routes.js';
import followupRoute from './followup.routes.js';
import conversationRoute from './conversation.routes.js';
import reportRoute from './report.routes.js';
import reminderRoute from './reminder.routes.js';

const router = express.Router();

// Route definitions will go here
router.get('/health', (req, res) => {
    res.send({ status: 'OK', uptime: process.uptime() });
});

const defaultRoutes = [
    {
        path: '/customers',
        route: customerRoute,
    },
    {
        path: '/followups',
        route: followupRoute,
    },
    {
        path: '/conversations',
        route: conversationRoute,
    },
    {
        path: '/reports',
        route: reportRoute,
    },
    {
        path: '/reminders',
        route: reminderRoute,
    }
];

defaultRoutes.forEach((route) => {
    router.use(route.path, route.route);
});

export default router;
