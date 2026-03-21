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
import accountReportRoutes from './accountReport.routes.js';
import invoiceSeriesRoute from './invoiceSeries.routes.js';
import productionSheetRoute from './productionSheet.routes.js';
import companyProfileRoute from './companyProfile.routes.js';
import communicationRoute from './communication.routes.js';
import stickerRoute from './sticker.routes.js';
import notificationRoute from './notification.routes.js';
import complaintRoute from './complaint.routes.js';
import replacementDispatchRoute from './replacementDispatch.routes.js';
import faultyReceiptRoute from './faultyReceipt.routes.js';
import repairJobCardRoute from './repairJobCard.routes.js';
import repairedStockInwardRoute from './repairedStockInward.routes.js';
import scrapEntryRoute from './scrapEntry.routes.js';
import productionFailureRoute from './productionFailure.routes.js';
import reworkJobCardRoute from './reworkJobCard.routes.js';
import reworkMaterialIssueRoute from './reworkMaterialIssue.routes.js';
import reworkOutputRoute from './reworkOutput.routes.js';
import retestConfirmationRoute from './retestConfirmation.routes.js';
import productionScrapRoute from './productionScrap.routes.js';
import cashBankAccountRoute from './cashBankAccount.routes.js';
import voucherTypeRoute from './voucherType.routes.js';
import voucherRoute from './voucher.routes.js';
import ledgerRoute from './ledger.routes.js';
import assetCategoryRoute from './assetCategory.routes.js';
import assetLocationRoute from './assetLocation.routes.js';
import fixedAssetRoute from './fixedAsset.routes.js';
import assetTransferRoute from './assetTransfer.routes.js';
import assetMaintenanceRoute from './assetMaintenance.routes.js';
import whatsappSettingsRoute from './whatsappSettings.routes.js';
import assetDisposalRoute from './assetDisposal.routes.js';
import stockRoute from './stock.routes.js';
import productionOutputRoute from './productionOutput.routes.js';
import componentReplacementRoute from './componentReplacement.routes.js';
import productionRejectionRoute from './productionRejection.routes.js';
import accountMasterRoute from './accountMaster.routes.js';
import permissionRoute from './permission.routes.js';


const router = express.Router();

router.get('/health', (req, res) => {
    res.send({
        status: 'OK',
    });
});

const defaultRoutes = [
    {
        path: '/communication',
        route: communicationRoute,
    },
    {
        path: '/whatsapp-settings',
        route: whatsappSettingsRoute,
    },
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
    {
        path: '/company-profile',
        route: companyProfileRoute,
    },
    {
        path: '/stickers',
        route: stickerRoute,
    },
    {
        path: '/notifications',
        route: notificationRoute,
    },
    // ── Service / Replacement Module ──────────────────────────────────────────
    {
        path: '/complaints',
        route: complaintRoute,
    },
    {
        path: '/replacement-dispatches',
        route: replacementDispatchRoute,
    },
    {
        path: '/faulty-receipts',
        route: faultyReceiptRoute,
    },
    {
        path: '/repair-job-cards',
        route: repairJobCardRoute,
    },
    {
        path: '/repaired-stock-inwards',
        route: repairedStockInwardRoute,
    },
    {
        path: '/scrap-entries',
        route: scrapEntryRoute,
    },
    // ── Production Failure & Rework Module ──────────────────────────────────
    {
        path: '/production-rework-failures',
        route: productionFailureRoute,
    },
    {
        path: '/production-rework-job-cards',
        route: reworkJobCardRoute,
    },
    {
        path: '/production-rework-material-issues',
        route: reworkMaterialIssueRoute,
    },
    {
        path: '/production-rework-outputs',
        route: reworkOutputRoute,
    },
    {
        path: '/production-rework-retests',
        route: retestConfirmationRoute,
    },
    {
        path: '/production-rework-scraps',
        route: productionScrapRoute,
    },
    // ── Accounts Module ──────────────────────────────────────────────────────
    {
        path: '/cash-bank-accounts',
        route: cashBankAccountRoute,
    },
    {
        path: '/voucher-types',
        route: voucherTypeRoute,
    },
    {
        path: '/vouchers',
        route: voucherRoute,
    },
    {
        path: '/ledgers',
        route: ledgerRoute,
    },
    {
        path: '/asset-categories',
        route: assetCategoryRoute,
    },
    {
        path: '/asset-locations',
        route: assetLocationRoute,
    },
    {
        path: '/fixed-assets',
        route: fixedAssetRoute,
    },
    {
        path: '/asset-transfers',
        route: assetTransferRoute,
    },
    {
        path: '/asset-maintenance',
        route: assetMaintenanceRoute,
    },
    {
        path: '/asset-disposals',
        route: assetDisposalRoute,
    },
    // ── Stock & Production ────────────────────────────────────────────────────
    {
        path: '/stock',
        route: stockRoute,
    },
    {
        path: '/production-outputs',
        route: productionOutputRoute,
    },
    {
        path: '/component-replacements',
        route: componentReplacementRoute,
    },
    {
        path: '/production-rejections',
        route: productionRejectionRoute,
    },
    {
        path: '/accounts/masters',
        route: accountMasterRoute,
    },
    {
        path: '/accounts/reports',
        route: accountReportRoutes,
    },
    {
        path: '/permissions',
        route: permissionRoute,
    },
];

defaultRoutes.forEach((route) => {
    router.use(route.path, route.route);
});

export default router;
