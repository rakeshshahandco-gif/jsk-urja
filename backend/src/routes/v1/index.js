import express from 'express';
import publicInvoiceRoute from './publicInvoice.routes.js';
import publicBrandingRoute from './publicBranding.routes.js';
import productionPlanningRoute from './productionPlanning.routes.js';
import creditDebitNoteRoute from './creditDebitNote.routes.js';
import authRoute from './auth.routes.js';
import devActiveContextRoute from './devActiveContext.routes.js';
import userRoute from './user.routes.js';
import customerRoute from './customer.routes.js';
import customerDocumentRoute from './customerDocument.routes.js';
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
import itemImageRoute from './itemImage.routes.js';
import itemTypeRoute from './itemType.routes.js';
import itemGroupRoute from './itemGroup.routes.js';
import bomRoute from './bom.routes.js';
import workOrderRoute from './workOrder.routes.js';
import supplierRoute from './supplier.routes.js';
import purchaseOrderRoute from './purchaseOrder.routes.js';
import purchaseRfqRoute from './purchaseRfq.routes.js';
import grnRoute from './grn.routes.js';
import purchaseInvoiceRoute from './purchaseInvoice.routes.js';
import paymentEntryRoute from './paymentEntry.routes.js';
import salesOrderRoute from './salesOrder.routes.js';
import salesInvoiceRoute from './salesInvoice.routes.js';
import accountReportRoutes from './accountReport.routes.js';
import accountingReportRoutes from './accountingReport.routes.js';
import gpAnalysisRoutes from './gpAnalysis.routes.js';
import directorMisRoutes from './directorMis.routes.js';
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
import modelConversionRoute from './modelConversion.routes.js';
import componentReplacementRoute from './componentReplacement.routes.js';
import productionRejectionRoute from './productionRejection.routes.js';
import accountMasterRoute from './accountMaster.routes.js';
import permissionRoute from './permission.routes.js';
import debugRoute from './debug.routes.js';
import prdProjectRoute from './prdProject.routes.js';
import prdTestParameterRoute from './prdTestParameter.routes.js';
import prdComponentRoute from './prdComponent.routes.js';
import prdDesignRoute from './prdDesign.routes.js';
import prdPrototypeRoute from './prdPrototype.routes.js';
import prdTestReportRoute from './prdTestReport.routes.js';
import prdIssueRoute from './prdIssue.routes.js';
import prdChangeLogRoute from './prdChangeLog.routes.js';
import prdApprovalRoute from './prdApproval.routes.js';
import prdAuditRoute from './prdAudit.routes.js';
import hrRoute from './hr.routes.js';
import messengerRoute from './messenger.routes.js';
import fyRoute from './fy.routes.js';
import payrollRoute from './payroll.routes.js';
import adminRoute from './admin.routes.js';
import utilsRoute from './utils.routes.js';
import rdSampleRoute from './rdSample.routes.js';
import weChatRoute from './weChat.routes.js';
import analyticsRoute from './analytics.routes.js';
import salesConversionRoute from './salesConversion.routes.js';
import transporterRoute from './transporter.routes.js';
import ewayBillRoute from './ewayBill.routes.js';
import eInvoiceRoute from './eInvoice.routes.js';
import gstReportRoute from './gstReport.routes.js';
import gstReconciliationRoute from './gstReconciliation.routes.js';
import backupRoute from './backup.routes.js';
import distributorRoute from './distributor.route.js';
import userHomePreferenceRoute from './userHomePreference.route.js';
import userUiPreferencesRoute from './userUiPreferences.route.js';
import companyRoute from './company.routes.js';
import tdsRoute from './tds.routes.js';
import tcsRoute from './tcs.routes.js';
import billWiseAdjustmentRoute from './billWiseAdjustment.routes.js';
import bankReconciliationRoute from './bankReconciliation.routes.js';
import costCenterRoute from './costCenter.routes.js';
import budgetRoute from './budget.routes.js';
import pdcChequeRoute from './pdcCheque.routes.js';
import depreciationRoute from './depreciation.routes.js';
import narrationTemplateRoute from './narrationTemplate.routes.js';
import form26AsRoute from './form26As.routes.js';
import saasRoute from './saas.routes.js';
import securityRoute from './security.routes.js';
import companyFeatureSettingsRoute from './companyFeatureSettings.routes.js';
import platformFeatureSettingsRoute from './platformFeatureSettings.routes.js';
import leadRoute from './lead.routes.js';
import productCatalogRoute from './productCatalog.routes.js';
import voucherAttachmentRoute from './voucherAttachment.routes.js';
import pettyCashRoute from './pettyCash.routes.js';
import whatsappBulkRoute from './whatsappBulk.routes.js';
import emailSettingsRoute from './emailSettings.routes.js';
import emailBulkRoute from './emailBulk.routes.js';
import communicationHistoryRoute from './communicationHistory.routes.js';
import sundryDebtorSettingsRoute from './sundryDebtorSettings.routes.js';
import featureConfigurationRoute from './featureConfiguration.routes.js';
import scanEntryRoute from './scanEntry.routes.js';
import smartImportRoute from './smartImport.routes.js';
import importCenterRoute from './importCenter.routes.js';
import whatsappChatRoute from './whatsappChat.routes.js';
import whatsappAiRoute from '../../modules/whatsappAi/routes/whatsappAi.routes.js';
import industryTemplateRoute from './industryTemplate.routes.js';
import customerTemplateFieldSettingsRoute from './customerTemplateFieldSettings.routes.js';
import supplierTemplateFieldSettingsRoute from './supplierTemplateFieldSettings.routes.js';
import itemTemplateFieldSettingsRoute from './itemTemplateFieldSettings.routes.js';
import documentsKycTemplateSettingsRoute from './documentsKycTemplateSettings.routes.js';
import supplierDocumentRoute from './supplierDocument.routes.js';
import workflowMasterRoute from './workflowMaster.routes.js';
import printFormatVersionRoute from './printFormatVersion.routes.js';
import printFormatRoute from './printFormat.routes.js';
import companyWorkflowAssignmentRoute from './companyWorkflowAssignment.routes.js';
import workflowProductionLotRoute from './workflowProductionLot.routes.js';
import textileProductionLotRoute from './textileProductionLot.routes.js';
import textileJobWorkRateRoute from './textileJobWorkRate.routes.js';
import textileConversionRoute from './textileConversion.routes.js';
import textileDyeingChallanRoute from './textileDyeingChallan.routes.js';
import textileJobWorkChallanRoute from './textileJobWorkChallan.routes.js';
import textileProcessRoute from './textileProcessRoute.routes.js';
import textileProductionOrderRoute from './textileProductionOrder.routes.js';
import textileProcessOutputRoute from './textileProcessOutput.routes.js';
import dataExtractorRoute, { dataExtractorPublicRoute } from './dataExtractor.routes.js';
import { resolveCompanyScope } from '../../middlewares/companyScope.middleware.js';
import { gateApiFeatureByPath } from '../../middlewares/featureAccess.middleware.js';
import { attachModuleContext, gateApiModuleByPath } from '../../middlewares/moduleGuard.middleware.js';
import moduleAllocationRoute from './moduleAllocation.routes.js';
import deploymentManagerRoute from './deploymentManager.routes.js';
import config from '../../config/config.js';
import { getLocalAppIdentity } from '../../utils/localAppIdentity.js';

const router = express.Router();

router.use('/public', publicInvoiceRoute);
router.use('/public', publicBrandingRoute);

router.use(resolveCompanyScope);
router.use(attachModuleContext);
router.use(gateApiFeatureByPath);
router.use(gateApiModuleByPath);

router.get('/health', (req, res) => {
    // Keep status:OK for existing probes; include local identity for localhost frontend guard.
    const identity = getLocalAppIdentity({
        mongoUrl: config.mongoose.url,
        port: config.port,
    });
    res.send({
        status: 'OK',
        applicationKey: identity.applicationKey,
        industryType: identity.industryType,
        port: identity.port,
        environment: identity.environment,
        databaseName: identity.databaseName,
    });
});

const defaultRoutes = [
    {
        path: '/admin',
        route: adminRoute,
    },
    {
        path: '/backups',
        route: backupRoute,
    },
    {
        path: '/production-planning',
        route: productionPlanningRoute,
    },
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
        path: '/dev',
        route: devActiveContextRoute,
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
        path: '/customer-documents',
        route: customerDocumentRoute,
    },
    {
        path: '/supplier-documents',
        route: supplierDocumentRoute,
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
        path: '/item-images',
        route: itemImageRoute,
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
        path: '/purchase-rfqs',
        route: purchaseRfqRoute,
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
        path: '/credit-debit-notes',
        route: creditDebitNoteRoute,
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
        path: '/bill-wise-adjustment',
        route: billWiseAdjustmentRoute,
    },
    {
        path: '/bank-reconciliation',
        route: bankReconciliationRoute,
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
        path: '/model-conversions',
        route: modelConversionRoute,
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
        path: '/accounting/reports',
        route: accountingReportRoutes,
    },
    {
        path: '/gp-analysis',
        route: gpAnalysisRoutes,
    },
    {
        path: '/director-mis',
        route: directorMisRoutes,
    },
    {
        path: '/permissions',
        route: permissionRoute,
    },
    {
        path: '/debug',
        route: debugRoute,
    },
    {
        path: '/prd/projects',
        route: prdProjectRoute,
    },
    {
        path: '/prd/test-parameters',
        route: prdTestParameterRoute,
    },
    {
        path: '/prd/components',
        route: prdComponentRoute,
    },
    {
        path: '/prd/designs',
        route: prdDesignRoute,
    },
    {
        path: '/prd/prototypes',
        route: prdPrototypeRoute,
    },
    {
        path: '/prd/test-reports',
        route: prdTestReportRoute,
    },
    {
        path: '/prd/issues',
        route: prdIssueRoute,
    },
    {
        path: '/prd/changelogs',
        route: prdChangeLogRoute,
    },
    {
        path: '/prd/approvals',
        route: prdApprovalRoute,
    },
    {
        path: '/prd/audits',
        route: prdAuditRoute,
    },
    // ── HR Module ─────────────────────────────────────────────────────────────
    {
        path: '/hr',
        route: hrRoute,
    },
    {
        path: '/payroll',
        route: payrollRoute,
    },
    // ── Internal Messenger ────────────────────────────────────────────────────
    {
        path: '/messenger',
        route: messengerRoute,
    },
    {
        path: '/financial-years',
        route: fyRoute,
    },
    {
        path: '/utils',
        route: utilsRoute,
    },
    {
        path: '/rd-samples',
        route: rdSampleRoute,
    },
    {
        path: '/wechat',
        route: weChatRoute,
    },
    {
        path: '/china-supplier',
        route: weChatRoute,
    },

  {
    path: '/analytics',
    route: analyticsRoute,
  },
  {
    path: '/sales-conversion',
    route: salesConversionRoute,
  },
  {
    path: '/transporters',
    route: transporterRoute,
  },
  {
    path: '/eway-bills',
    route: ewayBillRoute,
  },
  {
    path: '/e-invoices',
    route: eInvoiceRoute,
  },
  // ── GST Reports ──────────────────────────────────────────────────────────
  {
    path: '/gst-reports',
    route: gstReportRoute,
  },
  {
    path: '/gst-reconciliation',
    route: gstReconciliationRoute,
  },
    {
        path: '/distributors',
        route: distributorRoute,
    },
    {
        path: '/user-home/preferences',
        route: userHomePreferenceRoute,
    },
    {
        path: '/user-ui-preferences',
        route: userUiPreferencesRoute,
    },
    {
        path: '/companies',
        route: companyRoute,
    },
    // ── SaaS Super Admin ───────────────────────────────────────────────────────
    {
        path: '/saas',
        route: saasRoute,
    },
    {
        path: '/tds',
        route: tdsRoute,
    },
    // ── New Accounting Modules ─────────────────────────────────────────────────
    {
        path: '/tcs',
        route: tcsRoute,
    },
    {
        path: '/cost-centers',
        route: costCenterRoute,
    },
    {
        path: '/budgets',
        route: budgetRoute,
    },
    {
        path: '/pdc-cheques',
        route: pdcChequeRoute,
    },
    {
        path: '/depreciation',
        route: depreciationRoute,
    },
    {
        path: '/narration-templates',
        route: narrationTemplateRoute,
    },
    {
        path: '/form-26as',
        route: form26AsRoute,
    },
    {
        path: '/security',
        route: securityRoute,
    },
    {
        path: '/company-feature-settings',
        route: companyFeatureSettingsRoute,
    },
    {
        path: '/platform-feature-settings',
        route: platformFeatureSettingsRoute,
    },
    // ── CRM: WhatsApp-driven Leads + Product Catalog (gated by feature flags) ─
    {
        path: '/leads',
        route: leadRoute,
    },
    {
        path: '/product-catalog',
        route: productCatalogRoute,
    },
    {
        path: '/voucher-attachments',
        route: voucherAttachmentRoute,
    },
    {
        path: '/petty-cash',
        route: pettyCashRoute,
    },
    {
        path: '/sundry-debtor',
        route: sundryDebtorSettingsRoute,
    },
    {
        path: '/feature-configuration',
        route: featureConfigurationRoute,
    },
    {
        path: '/scan-entry',
        route: scanEntryRoute,
    },
    {
        path: '/smart-import',
        route: smartImportRoute,
    },
    {
        path: '/import-center',
        route: importCenterRoute,
    },
    {
        path: '/industry-templates',
        route: industryTemplateRoute,
    },
    {
        path: '/module-allocation',
        route: moduleAllocationRoute,
    },
    {
        path: '/deployment-manager',
        route: deploymentManagerRoute,
    },
    {
        path: '/customer-template-field-settings',
        route: customerTemplateFieldSettingsRoute,
    },
    {
        path: '/supplier-template-field-settings',
        route: supplierTemplateFieldSettingsRoute,
    },
    {
        path: '/item-template-field-settings',
        route: itemTemplateFieldSettingsRoute,
    },
    {
        path: '/documents-kyc-template-settings',
        route: documentsKycTemplateSettingsRoute,
    },
    {
        path: '/workflow-masters',
        route: workflowMasterRoute,
    },
    {
        path: '/print-format-versions',
        route: printFormatVersionRoute,
    },
    {
        path: '/print-formats',
        route: printFormatRoute,
    },
    {
        path: '/company-workflow-assignment',
        route: companyWorkflowAssignmentRoute,
    },
    {
        path: '/workflow-production-lots',
        route: workflowProductionLotRoute,
    },
    {
        path: '/textile-production-lots',
        route: textileProductionLotRoute,
    },
    {
        path: '/textile-job-work-rates',
        route: textileJobWorkRateRoute,
    },
    {
        path: '/textile-conversions',
        route: textileConversionRoute,
    },
    {
        path: '/textile-dyeing-challans',
        route: textileDyeingChallanRoute,
    },
    {
        path: '/textile-job-work-challans/:processType',
        route: textileJobWorkChallanRoute,
    },
    {
        path: '/textile-process-routes',
        route: textileProcessRoute,
    },
    {
        path: '/textile-production-orders',
        route: textileProductionOrderRoute,
    },
    {
        path: '/textile-process-output',
        route: textileProcessOutputRoute,
    },
    // ── WhatsApp Bulk Messaging Utility (isolated from chat module) ─────────
    {
        path: '/whatsapp-bulk',
        route: whatsappBulkRoute,
    },
    // ── Platform Email Communication ────────────────────────────────────────
    {
        path: '/email-settings',
        route: emailSettingsRoute,
    },
    {
        path: '/email-bulk',
        route: emailBulkRoute,
    },
    {
        path: '/communication-history',
        route: communicationHistoryRoute,
    },
    // ── WhatsApp Chat Panel (additive: powers /whatsapp/chat UI) ─────────────
    {
        path: '/whatsapp-chat',
        route: whatsappChatRoute,
    },
    // ── WhatsApp AI Assistant (Phase 1A foundation — feature-flagged, no live WA) ─
    {
        path: '/whatsapp-ai',
        route: whatsappAiRoute,
    },
    // ── Data Extractor / AI Market Finder (optional — disabled by default per company) ─
    {
        path: '/data-extractor',
        route: dataExtractorPublicRoute,
    },
    {
        path: '/data-extractor',
        route: dataExtractorRoute,
    },
];



defaultRoutes.forEach((route) => {
    console.log(`Registering route: ${route.path}`);
    router.use(route.path, route.route);
});

export { weChatRoute };
export default router;
