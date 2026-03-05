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
import taskGroupRoute from './taskGroup.routes.js';
import groupRoute from './group.routes.js';
import taskChatRoute from './taskChat.routes.js';
import itemRoute from './item.routes.js';
import itemTypeRoute from './itemType.routes.js';
import itemGroupRoute from './itemGroup.routes.js';
import bomRoute from './bom.routes.js';
import workOrderRoute from './workOrder.routes.js';
import supplierRoute from './supplier.routes.js';
import purchaseOrderRoute from './purchaseOrder.routes.js';
import grnRoute from './grn.routes.js';
import purchaseInvoiceRoute from './purchaseInvoice.routes.js';
import paymentEntryRoute from './paymentEntry.routes.js';
import salesOrderRoute from './salesOrder.routes.js';
import salesInvoiceRoute from './salesInvoice.routes.js';
import invoiceSeriesRoute from './invoiceSeries.routes.js';
import productionSheetRoute from './productionSheet.routes.js';

const router = express.Router();

// Route definitions will go here
router.get('/health', (req, res) => {
    res.send({ status: 'OK', version: '1.2.0', uptime: process.uptime() });
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
        path: '/task-groups',
        route: taskGroupRoute,
    },
    {
        path: '/groups',
        route: groupRoute,
    },
    {
        path: '/task-chats',
        route: taskChatRoute,
    },
    {
        path: '/items',
        route: itemRoute,
    },
    {
        path: '/item-types',
        route: itemTypeRoute,
    },
    {
        path: '/item-groups',
        route: itemGroupRoute,
    },
    {
        path: '/boms',
        route: bomRoute,
    },
    {
        path: '/work-orders',
        route: workOrderRoute,
    },
    {
        path: '/suppliers',
        route: supplierRoute,
    },
    {
        path: '/purchase-orders',
        route: purchaseOrderRoute,
    },
    {
        path: '/grns',
        route: grnRoute,
    },
    {
        path: '/purchase-invoices',
        route: purchaseInvoiceRoute,
    },
    {
        path: '/payment-entries',
        route: paymentEntryRoute,
    },
    {
        path: '/sales-orders',
        route: salesOrderRoute,
    },
    {
        path: '/sales-invoices',
        route: salesInvoiceRoute,
    },
    {
        path: '/invoice-series',
        route: invoiceSeriesRoute,
    },
    {
        path: '/production-sheets',
        route: productionSheetRoute,
    },
];

defaultRoutes.forEach((route) => {
    router.use(route.path, route.route);
});

export default router;
