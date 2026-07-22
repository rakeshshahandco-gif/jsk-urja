// Version: 1.0.9 - Deploy: 2026-04-25T15:48:00Z
import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { useForm } from 'react-hook-form';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import ModuleLockBanner from './components/module/ModuleLockBanner';
import { TopMenuBar } from './components/layout/TopMenuBar/TopMenuBar';
import { Button, Input, Select, ModalProvider, useModal } from '@/components/ui';
import { SidebarProvider, useSidebar } from './context/SidebarContext';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PlaceholderPage } from '@/components/ui/PlaceholderPage';
import { CustomerList } from '@/features/customers/components';
import { AddCustomerPage } from '@/features/customers/components/AddCustomerPage';
import { FollowUpForm, FollowupDashboard } from '@/features/followup/components';
import { TalkWithCustomerForm } from '@/features/conversations/components/TalkWithCustomerForm';
import { UserManagement } from '@/features/users/UserManagement';
import { LoginPage } from '@/features/auth/LoginPage';
import CompanyProfilePage from '@/features/settings/CompanyProfilePage';
import CompaniesListPage from '@/features/companies/CompaniesListPage';
import WhatsAppSettingsPage from '@/features/settings/WhatsAppSettingsPage';
import { CustomerMasterReport } from '@/features/reports/CustomerMasterReport';
import CustomerKycReportsPage from '@/features/reports/CustomerKycReportsPage';
import SupplierKycReportsPage from '@/features/reports/SupplierKycReportsPage';
import { FollowUpTrackerReport } from '@/features/reports/FollowUpTrackerReport';
import ReminderReport from '@/features/reports/ReminderReport';
import OpenRemindersReport from '@/features/reports/OpenRemindersReport';
import ConversationHistoryReport from '@/features/reports/ConversationHistoryReport';
import FollowupDashboardReport from '@/features/reports/FollowupDashboardReport';
import FollowupTaskReport from '@/features/reports/FollowupTaskReport';
import TaskReminderReport from '@/features/reports/TaskReminderReport';
import ConsumableCostReport from '@/features/reports/ConsumableCostReport';
import ProductGpReport from '@/features/reports/ProductGpReport';
import GpAnalysisPage from '@/features/reports/GpAnalysisPage';
const ReplacementReport = lazy(() => import('@/features/reports/ReplacementReport'));
const SampleConversionReport = lazy(() => import('@/features/reports/SampleConversionReport'));
const LeadListPage = lazy(() => import('@/features/leads/pages/LeadListPage'));
const LeadFormPage = lazy(() => import('@/features/leads/pages/LeadFormPage'));
const ProductCatalogListPage = lazy(() => import('@/features/productCatalog/pages/ProductCatalogListPage'));
const ProductCatalogFormPage = lazy(() => import('@/features/productCatalog/pages/ProductCatalogFormPage'));
const WhatsAppChatPage = lazy(() => import('@/features/whatsappChat/pages/WhatsAppChatPage'));
import TaskChatDashboard from '@/features/taskChats/TaskChatDashboard';
import { RemindersDashboard } from '@/features/reminders/RemindersDashboard';
import { TaskCreatePage } from '@/features/tasks/components/TaskCreatePage';
import { TaskEditPage } from '@/features/tasks/components/TaskEditPage';
import ManageTasksPage from '@/features/tasks/components/ManageTasksPage';
import { TaskGroupList } from '@/features/tasks/components/TaskGroupList';
import ItemListPage from '@/features/inventory/ItemListPage';
import ItemFormPage from '@/features/inventory/ItemFormPage';
import ItemTypePage from '@/features/inventory/ItemTypePage';
import ItemGroupPage from '@/features/inventory/ItemGroupPage';
import BOMPage from '@/features/inventory/BOMPage';
import BOMFormPage from '@/features/inventory/BOMFormPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { GroupList } from '@/features/groups/components/GroupList';
import { GroupDetails } from '@/features/groups/components/GroupDetails';
import ProductionDashboard from '@/features/production/ProductionDashboard';
import WorkOrderListPage from '@/features/production/WorkOrderListPage';
import WorkOrderFormPage from '@/features/production/WorkOrderFormPage';
import WorkOrderDetailPage from '@/features/production/WorkOrderDetailPage';
import WorkflowProductionListPage from '@/features/production/workflowProduction/WorkflowProductionListPage';
import WorkflowProductionFormPage from '@/features/production/workflowProduction/WorkflowProductionFormPage';
import WorkflowProductionDetailPage from '@/features/production/workflowProduction/WorkflowProductionDetailPage';
import TextileProductionListPage from '@/features/production/textileProduction/TextileProductionListPage';
import TextileProductionFormPage from '@/features/production/textileProduction/TextileProductionFormPage';
import TextileStageProgressPage from '@/features/production/textileProduction/TextileStageProgressPage';
import TextileDyeingIssuePage from '@/features/production/textileProduction/TextileDyeingIssuePage';
import TextileDyeingReturnPage from '@/features/production/textileProduction/TextileDyeingReturnPage';
import TextileLotReportPage from '@/features/production/textileProduction/TextileLotReportPage';
import TextileJobWorkRatePage from '@/features/production/textileJobWork/TextileJobWorkRatePage';
import TextileConversionMasterPage from '@/features/production/textileConversion/TextileConversionMasterPage';
import TextileTransformationEntryPage from '@/features/production/textileConversion/TextileTransformationEntryPage';
import TextileTransformationHistoryPage from '@/features/production/textileConversion/TextileTransformationHistoryPage';
import TextileJobWorkReportsPage from '@/features/production/textileJobWork/TextileJobWorkReportsPage';
import TextileJobWorkHomePage from '@/features/production/textileJobWork/TextileJobWorkHomePage';
import TextileJobWorkIssuePage from '@/features/production/textileJobWork/TextileJobWorkIssuePage';
import TextileJobWorkReturnEntryPage from '@/features/production/textileJobWork/TextileJobWorkReturnEntryPage';
import TextileJobWorkStockWithVendorPage from '@/features/production/textileJobWork/TextileJobWorkStockWithVendorPage';
import TextileJobWorkModuleReportsPage from '@/features/production/textileJobWork/TextileJobWorkModuleReportsPage';
import TextileProcessOutputStockPage from '@/features/production/textileJobWork/TextileProcessOutputStockPage';
import TextileProcessTracePage from '@/features/production/textileJobWork/TextileProcessTracePage';
import TextileProcessOutputReportsPage from '@/features/production/textileJobWork/TextileProcessOutputReportsPage';
import TextileDyeingChallanListPage from '@/features/production/textileDyeingChallan/TextileDyeingChallanListPage';
import TextileDyeingChallanFormPage from '@/features/production/textileDyeingChallan/TextileDyeingChallanFormPage';
import TextileDyeingChallanDetailPage from '@/features/production/textileDyeingChallan/TextileDyeingChallanDetailPage';
import TextileDyeingChallanReturnPage from '@/features/production/textileDyeingChallan/TextileDyeingChallanReturnPage';
import TextileStockWithDyersPage from '@/features/production/textileDyeingChallan/TextileStockWithDyersPage';
import TextileEmbroideryChallanListPage from '@/features/production/textileEmbroideryChallan/TextileEmbroideryChallanListPage';
import TextileEmbroideryChallanFormPage from '@/features/production/textileEmbroideryChallan/TextileEmbroideryChallanFormPage';
import TextileEmbroideryChallanDetailPage from '@/features/production/textileEmbroideryChallan/TextileEmbroideryChallanDetailPage';
import TextileEmbroideryChallanReturnPage from '@/features/production/textileEmbroideryChallan/TextileEmbroideryChallanReturnPage';
import TextileStockWithEmbroideryPage from '@/features/production/textileEmbroideryChallan/TextileStockWithEmbroideryPage';
import TextileProcessRouteMasterPage from '@/features/production/textileProductionWorkflow/TextileProcessRouteMasterPage';
import TextileProductionDashboardPage from '@/features/production/textileProductionWorkflow/TextileProductionDashboardPage';
import TextileProductionOrderFormPage from '@/features/production/textileProductionWorkflow/TextileProductionOrderFormPage';
import TextileProductionOrderDetailPage from '@/features/production/textileProductionWorkflow/TextileProductionOrderDetailPage';
import TextileProcessIssueChallanPage from '@/features/production/textileProductionWorkflow/TextileProcessIssueChallanPage';
import TextileProcessReceiveChallanPage from '@/features/production/textileProductionWorkflow/TextileProcessReceiveChallanPage';
import TextileProcessChallanDetailPage from '@/features/production/textileProductionWorkflow/TextileProcessChallanDetailPage';
import SupplierListPage from '@/features/purchase/SupplierListPage';
import PurchaseOrderListPage from '@/features/purchase/PurchaseOrderListPage';
import PurchaseRfqListPage from '@/features/purchase/rfq/PurchaseRfqListPage';
import PurchaseRfqFormPage from '@/features/purchase/rfq/PurchaseRfqFormPage';
import PurchaseRfqDetailPage from '@/features/purchase/rfq/PurchaseRfqDetailPage';
import QuotationComparisonPage from '@/features/purchase/rfq/QuotationComparisonPage';
import PurchaseRfqComparisonListPage from '@/features/purchase/rfq/PurchaseRfqComparisonListPage';
import SupplierQuotationListPage from '@/features/purchase/rfq/SupplierQuotationListPage';
import SupplierQuotationFormPage from '@/features/purchase/rfq/SupplierQuotationFormPage';
import PurchaseRfqReportsPage from '@/features/purchase/rfq/PurchaseRfqReportsPage';
import PurchaseRfqFeatureGate from '@/features/purchase/rfq/PurchaseRfqFeatureGate';
import PurchaseOrderFormPage from '@/features/purchase/PurchaseOrderFormPage';
import PurchaseOrderDetailPage from '@/features/purchase/PurchaseOrderDetailPage';
import PurchaseInvoiceListPage from '@/features/purchase/PurchaseInvoiceListPage';
import PurchaseInvoiceFormPage from '@/features/purchase/PurchaseInvoiceFormPage';
import PurchaseInvoiceDetailPage from '@/features/purchase/PurchaseInvoiceDetailPage';
import ScanBillsPage from '@/features/documents/pages/ScanBillsPage';
import MissingAttachmentsPage from '@/features/documents/pages/MissingAttachmentsPage';
import MobileScanPage from '@/features/documents/pages/MobileScanPage';
import PettyCashEntryPage from '@/features/pettyCash/PettyCashEntryPage';
import PettyCashImportPage from '@/features/pettyCash/PettyCashImportPage';
import PettyCashReportsPage from '@/features/pettyCash/PettyCashReportsPage';
import PettyCashSettingsPage from '@/features/pettyCash/PettyCashSettingsPage';
import WhatsappBulkCampaignsPage from '@/features/whatsappBulk/WhatsappBulkCampaignsPage';
import WhatsappBulkMatterPage from '@/features/whatsappBulk/WhatsappBulkMatterPage';
import WhatsappBulkBlacklistPage from '@/features/whatsappBulk/WhatsappBulkBlacklistPage';
import WhatsappBulkHistoryPage from '@/features/whatsappBulk/WhatsappBulkHistoryPage';
import WhatsappBulkSettingsPage from '@/features/whatsappBulk/WhatsappBulkSettingsPage';
import {
    WhatsAppAIDashboardPage,
    WhatsAppAIInboxPage,
    WhatsAppAIActiveConversationsPage,
    WhatsAppAIWaitingHumanPage,
    WhatsAppAILeadDraftsPage,
    WhatsAppAIKnowledgePage,
    WhatsAppAIDocumentsPage,
    WhatsAppAIRulesPage,
    WhatsAppAISettingsPage,
    WhatsAppAIAuditLogsPage,
    WhatsAppAiAnyPermission,
    WhatsAppAiFeatureGuard,
    WHATSAPP_AI_PERMISSIONS,
} from '@/features/whatsappAi';
import EmailSettingsPage from '@/features/emailSettings/EmailSettingsPage';
import EmailBulkCampaignsPage from '@/features/emailBulk/EmailBulkCampaignsPage';
import EmailBulkTemplatesPage from '@/features/emailBulk/EmailBulkTemplatesPage';
import EmailBulkBlacklistPage from '@/features/emailBulk/EmailBulkBlacklistPage';
import EmailBulkHistoryPage from '@/features/emailBulk/EmailBulkHistoryPage';
import EmailBulkSettingsPage from '@/features/emailBulk/EmailBulkSettingsPage';
import CommunicationHistoryPage from '@/features/communicationHistory/CommunicationHistoryPage';
import ScanEntryDraftsPage from '@/features/scanEntry/ScanEntryDraftsPage';
import ScanEntryReviewPage from '@/features/scanEntry/ScanEntryReviewPage';
import BulkScanImportPage from '@/features/scanEntry/BulkScanImportPage';
import ScanEntryReportsPage from '@/features/scanEntry/ScanEntryReportsPage';
import ScanEntryKeywordSettingsPage from '@/features/scanEntry/ScanEntryKeywordSettingsPage';
import DataExtractorGuard from '@/features/dataExtractor/DataExtractorGuard';
import DataExtractorLayout from '@/features/dataExtractor/DataExtractorLayout';
import DataExtractorKeywordSearchPage from '@/features/dataExtractor/DataExtractorKeywordSearchPage';
import DataExtractorManualUrlPage from '@/features/dataExtractor/DataExtractorManualUrlPage';
import DataExtractorImportPage from '@/features/dataExtractor/DataExtractorImportPage';
import DataExtractorHistoryPage from '@/features/dataExtractor/DataExtractorHistoryPage';
import DataExtractorLeadsPage from '@/features/dataExtractor/DataExtractorLeadsPage';
import DataExtractorPreviewPage from '@/features/dataExtractor/DataExtractorPreviewPage';
import DataExtractorSettingsPage from '@/features/dataExtractor/DataExtractorSettingsPage';
import SmartImportHubPage from '@/features/smartImport/SmartImportHubPage';
import SmartImportBatchPage from '@/features/smartImport/SmartImportBatchPage';
import ImportCenterPage from '@/features/importCenter/ImportCenterPage';
import GRNListPage from '@/features/purchase/GRNListPage';
import GRNFormPage from '@/features/purchase/GRNFormPage';
import CashBookPage from '@/features/purchase/CashBookPage';
import BankBookPage from '@/features/purchase/BankBookPage';
import PurchaseComparisonReportPage from '@/features/reports/PurchaseComparisonReportPage';
import SalesOrderListPage from '@/features/sales/SalesOrderListPage';
import SalesOrderFormPage from '@/features/sales/SalesOrderFormPage';
import SalesOrderDetailPage from '@/features/sales/SalesOrderDetailPage';
import SalesInvoiceListPage from '@/features/sales/SalesInvoiceListPage';
import SalesInvoiceFormPage from '@/features/sales/SalesInvoiceFormPage';
import SalesInvoiceDetailPage from '@/features/sales/SalesInvoiceDetailPage';
import PublicInvoicePage from '@/features/sales/PublicInvoicePage';
import ProductionSheetPage from '@/features/sales/ProductionSheetPage';
import InvoiceSeriesPage from '@/features/sales/InvoiceSeriesPage';
import InvoiceCleanupPage from '@/features/sales/InvoiceCleanupPage';
import ResequenceTool from '@/features/sales/ResequenceTool';
import BulkInvoiceRenumber from '@/features/sales/BulkInvoiceRenumber';
import CreditNoteListPage from '@/features/sales/pages/CreditNoteListPage';
import DebitNoteListPage from '@/features/sales/pages/DebitNoteListPage';
import CreditDebitNoteFormPage from '@/features/sales/pages/CreditDebitNoteFormPage';
import CreditDebitNoteDetailPage from '@/features/sales/pages/CreditDebitNoteDetailPage';
import EwayBillListPage from '@/features/eway-bill/EwayBillListPage';
import EwayBillDraftPage from '@/features/eway-bill/EwayBillDraftPage';
import EInvoiceListPage from '@/features/e-invoice/EInvoiceListPage';
import EInvoiceDraftPage from '@/features/e-invoice/EInvoiceDraftPage';
import TransporterListPage from '@/features/transporters/TransporterListPage';
import DiagnosticDashboard from '@/features/admin/diagnostics/DiagnosticDashboard';
import BackupRestorePage from '@/features/admin/backup/BackupRestorePage';
import { DistributorList } from '@/features/distributors/DistributorList';
import IncentiveReport from '@/features/reports/IncentiveReport';
import AutoLinkLedgers from '@/features/admin/components/AutoLinkLedgers';


// Service / Replacement Module
import ComplaintListPage from '@/features/service/ComplaintListPage';
import ComplaintFormPage from '@/features/service/ComplaintFormPage';
import ComplaintDetailPage from '@/features/service/ComplaintDetailPage';
import ReplacementDispatchFormPage from '@/features/service/ReplacementDispatchFormPage';
import ReplacementDispatchPrintPage from '@/features/service/ReplacementDispatchPrintPage';
import FaultyReceiptFormPage from '@/features/service/FaultyReceiptFormPage';
import RepairJobCardFormPage from '@/features/service/RepairJobCardFormPage';
import RepairedStockInwardFormPage from '@/features/service/RepairedStockInwardFormPage';
import ScrapEntryFormPage from '@/features/service/ScrapEntryFormPage';
import ReplacementDashboard from '@/features/service/ReplacementDashboard';

// Accounts Module
const ReceiptEntryPage = lazy(() => import('./features/accounts/ReceiptEntryPage'));
const PaymentEntryPage = lazy(() => import('./features/accounts/PaymentEntryPage'));
const ExpenseEntryPage = lazy(() => import('./features/accounts/ExpenseEntryPage'));
const JournalEntryPage = lazy(() => import('./features/accounts/JournalEntryPage'));
const ContraEntryPage = lazy(() => import('./features/accounts/ContraEntryPage'));
const PeriodLockPage = lazy(() => import('./features/accounts/PeriodLockPage'));
const AccountingAuditPage = lazy(() => import('./features/accounts/AccountingAuditPage'));
const VoucherListPage = lazy(() => import('./features/accounts/VoucherListPage'));
const CashBankMasterPage = lazy(() => import('./features/accounts/CashBankMasterPage'));
const GroupMasterPage = lazy(() => import('./features/accounts/GroupMasterPage'));
const LedgerMasterPage = lazy(() => import('./features/accounts/LedgerMasterPage'));
const VoucherTypeMasterPage = lazy(() => import('./features/accounts/VoucherTypeMasterPage'));
const SalesRegisterPage = lazy(() => import('./features/accounts/SalesRegisterPage'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const ModuleHomePage = lazy(() => import('./features/dashboard/components/ModuleHomePage'));
const PurchaseRegisterPage = lazy(() => import('./features/accounts/PurchaseRegisterPage'));
const ExpenseRegisterPage = lazy(() => import('./features/accounts/ExpenseRegisterPage'));
const FinancialYearMasterPage = lazy(() => import('./features/accounts/FinancialYearMasterPage.jsx'));
const DayBookPage = lazy(() => import('./features/accounts/DayBookPage'));
const LedgerReportPage = lazy(() => import('./features/accounts/LedgerReportPage'));
const OutstandingReportPage = lazy(() => import('./features/accounts/OutstandingReportPage'));
const InterestPayablePage = lazy(() => import('./features/accounts/InterestPayablePage'));
const BillWiseAdjustmentPage = lazy(() => import('./features/accounts/BillWiseAdjustmentPage'));
const BankReconciliationPage = lazy(() => import('./features/accounts/BankReconciliationPage'));
const TdsCompliancePage = lazy(() => import('./features/accounts/TdsCompliancePage'));
// ── SaaS Admin ─────────────────────────────────────────────────────────────────
const SaasAdminPage = lazy(() => import('./features/superAdmin/SaasAdminPage'));

// ── New Accounting Modules ─────────────────────────────────────────────────────
const CostCentrePage = lazy(() => import('./features/accounts/CostCentrePage'));
const CostCentrePLPage = lazy(() => import('./features/accounts/CostCentrePLPage'));
const BudgetPage = lazy(() => import('./features/accounts/BudgetPage'));
const PDCRegisterPage = lazy(() => import('./features/accounts/PDCRegisterPage'));
const TcsCompliancePage = lazy(() => import('./features/accounts/TcsCompliancePage'));
const CashFlowPage = lazy(() => import('./features/accounts/CashFlowPage'));
const ComparativePLPage = lazy(() => import('./features/accounts/ComparativePLPage'));
const ComparativeBSPage = lazy(() => import('./features/accounts/ComparativeBSPage'));
const AgeingAnalysisPage = lazy(() => import('./features/accounts/AgeingAnalysisPage'));
const MsmeReportPage = lazy(() => import('./features/accounts/MsmeReportPage'));
const RatioAnalysisPage = lazy(() => import('./features/accounts/RatioAnalysisPage'));
const FundFlowPage = lazy(() => import('./features/accounts/FundFlowPage'));
const NarrationTemplatesPage = lazy(() => import('./features/accounts/NarrationTemplatesPage'));
const Form26AsPage = lazy(() => import('./features/accounts/Form26AsPage'));
const DepreciationPage = lazy(() => import('./features/fixedAssets/DepreciationPage'));
const DepreciationSchedulePage = lazy(() => import('./features/fixedAssets/DepreciationSchedulePage'));
const TrialBalancePage = lazy(() => import('./features/mis/TrialBalancePage'));
const ProfitAndLossPage = lazy(() => import('./features/mis/ProfitAndLossPage'));
const BalanceSheetPage = lazy(() => import('./features/mis/BalanceSheetPage'));
const MISDashboard = lazy(() => import('./features/mis/MISDashboard'));
const DirectorMisDashboard = lazy(() => import('./features/mis/DirectorMisDashboard'));
const SalesMarketingDashboard = lazy(() => import('./features/mis/SalesMarketingDashboard'));
const SalesConversionDashboard = lazy(() => import('./features/mis/SalesConversionDashboard'));
const AssetCategoryPage = lazy(() => import('./features/fixedAssets/AssetCategoryPage'));
import AssetLocationPage from '@/features/fixedAssets/AssetLocationPage';
import FixedAssetMasterPage from '@/features/fixedAssets/FixedAssetMasterPage';
import AssetDetailPage from '@/features/fixedAssets/AssetDetailPage';


// Stock & Production Entry Module
import RawMaterialStockReport from '@/features/inventory/RawMaterialStockReport';
import FinishedGoodsStockReport from '@/features/inventory/FinishedGoodsStockReport';
import StockMovementLedger from '@/features/inventory/StockMovementLedger';
import ProductionOutputFormPage from './features/production/ProductionOutputFormPage';
import ProductConversionFormPage from './features/production/ProductConversionFormPage';
import ComponentReplacementFormPage from '@/features/production/ComponentReplacementFormPage';
import ProductionRejectionFormPage from '@/features/production/ProductionRejectionFormPage';
import ProductionPlanningListPage from '@/features/production/planning/ProductionPlanningListPage';
import ProductionPlanningFormPage from '@/features/production/planning/ProductionPlanningFormPage';

// PRD Module
import PrdProjectListPage from '@/features/prd/PrdProjectListPage';
import PrdProjectDetailPage from '@/features/prd/PrdProjectDetailPage';
import PrdTestParameterMasterPage from '@/features/prd/PrdTestParameterMasterPage';
import PrdDashboard from './features/prd/PrdDashboard';

import MessengerPage from '@/features/messenger/MessengerPage';

// R&D Samples Module
const RdProjectListPage = lazy(() => import('./features/rdSamples/pages/RdProjectListPage'));
const RdSampleListPage = lazy(() => import('./features/rdSamples/pages/RdSampleListPage'));
const RdComparisonPage = lazy(() => import('./features/rdSamples/pages/RdComparisonPage'));

// Optional Kanban / Workflow layer (default OFF, gated by workflow.* feature flags)
const SalesInquiryKanbanPage = lazy(() => import('./features/kanban/pages/SalesInquiryKanbanPage'));
const TaskKanbanPage = lazy(() => import('./features/kanban/pages/TaskKanbanPage'));
const ComplaintKanbanPage = lazy(() => import('./features/kanban/pages/ComplaintKanbanPage'));
const DispatchKanbanPage = lazy(() => import('./features/kanban/pages/DispatchKanbanPage'));
const PurchaseKanbanPage = lazy(() => import('./features/kanban/pages/PurchaseKanbanPage'));
const ProductionKanbanPage = lazy(() => import('./features/kanban/pages/ProductionKanbanPage'));
const GstTdsKanbanPage = lazy(() => import('./features/kanban/pages/GstTdsKanbanPage'));
const ApkKanbanPage = lazy(() => import('./features/kanban/pages/ApkKanbanPage'));
const KanbanComingSoonPage = lazy(() => import('./features/kanban/pages/KanbanComingSoonPage'));

// Optional per-user UI customization page (default OFF, gated by ui.advancedCustomizationEnabled).
// The page itself also gracefully renders an "ask admin to enable" banner when the flag is off,
// but we still wrap it in FeatureGuard for defense-in-depth.
const UiPreferencesPage = lazy(() => import('./features/profile/UiPreferencesPage'));

// WeChat Module
const WechatListPage = lazy(() => import('./features/wechat/pages/WechatListPage'));
const WechatGroupCreatePage = lazy(() => import('./features/wechat/pages/WechatGroupCreatePage'));

// HR Module
import ShiftList from '@/features/hr/components/ShiftMaster/ShiftList';
import EmployeeList from '@/features/hr/components/EmployeeMaster/EmployeeList';
import EmployeeForm from '@/features/hr/components/EmployeeMaster/EmployeeForm';
import HRDashboard from '@/features/hr/components/HRDashboard';
import HolidayListPage from '@/features/hr/components/HolidayListPage';
import AttendancePage from '@/features/hr/components/AttendancePage';
import AttendanceImportPage from '@/features/hr/components/AttendanceImportPage';
import LeaveManagementPage from '@/features/hr/components/LeaveManagementPage';
import PayrollPage from '@/features/hr/components/PayrollPage';
import HRReportsPage from '@/features/hr/components/HRReportsPage';
import HRSettingsPage from '@/features/hr/components/HRSettingsPage';
import DailyAttendanceReport from '@/features/hr/components/DailyAttendanceReport';
import MonthlySummaryReport from '@/features/hr/components/MonthlySummaryReport';
import LateComingReport from '@/features/hr/components/LateComingReport';
import MissingPunchReport from '@/features/hr/components/MissingPunchReport';
import SalaryWorkingReport from '@/features/hr/components/SalaryWorkingReport';
import GstrReportPage from '@/features/reports/GstrReportPage';
import Gstr3bReportPage from '@/features/reports/Gstr3bReportPage';
import Gstr9ReportPage from '@/features/reports/Gstr9ReportPage';
import GstReconciliationPage from '@/features/gst-reconciliation/GstReconciliationPage';
import ItcRegisterPage from '@/features/reports/gst/ItcRegisterPage';
import GstPayableSummary from '@/features/reports/gst/GstPayableSummary';
import HsnSummaryPage from '@/features/reports/gst/HsnSummaryPage';
import GstLedgerPage from '@/features/reports/gst/GstLedgerPage';

import { CustomerAnalysisTab } from '@/features/mis/CustomerAnalysisTab';
import { AuthProvider } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { MessengerProvider } from '@/contexts/MessengerContext';
import { FinancialYearProvider, useFinancialYear } from '@/contexts/FinancialYearContext';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { FeatureSettingsProvider } from '@/contexts/FeatureSettingsContext';
import { UiPreferencesProvider } from '@/contexts/UiPreferencesContext';
import FeatureComplianceSettingsPage from '@/features/settings/FeatureComplianceSettingsPage';
import FeatureConfigurationPage from '@/features/settings/FeatureConfigurationPage';
import PlatformFeatureDefaultsPage from '@/features/settings/PlatformFeatureDefaultsPage';
import IndustryTemplateMasterPage from '@/features/settings/IndustryTemplateMasterPage';
import CompanyModuleAllocationPage from '@/features/settings/CompanyModuleAllocationPage';
import IndustryDeploymentManagerPage from '@/features/settings/IndustryDeploymentManagerPage';
import ModuleDisabledPage from '@/features/settings/ModuleDisabledPage';
import { ModuleGuardProvider } from '@/contexts/ModuleGuardContext';
import WorkflowMasterPage from '@/features/settings/WorkflowMasterPage';
import PrintFormatVersionManagerPage from '@/features/settings/PrintFormatVersionManagerPage';
import PrintFormatDesignerPage from '@/features/settings/PrintFormatDesignerPage';
import { FeatureGuard } from '@/components/FeatureGuard';
import { LiveNotificationProvider } from '@/components/ui/LiveNotificationPopup';


import { useAuth } from '@/hooks/useAuth';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ProtectedPlatformRoute } from '@/components/auth/ProtectedPlatformRoute';
import { PlatformAccessDenied } from '@/components/auth/PlatformAccessDenied';
import { ToastProvider } from '@/components/ui/Toast';
import './styles/main.scss';
import { BrandedSplashGate, BrandedModuleLoader, BrandedLoader } from '@/components/ui/BrandedLoading';

import { Toaster } from 'react-hot-toast';

// Redirect component that preserves parameters
const ParamRedirect = ({ to }) => {
    const params = useParams();
    let target = to;
    Object.keys(params).forEach(key => {
        target = target.replace(`:${key}`, params[key]);
        // Also support just appending id if target doesn't have it
        if (!target.includes(`:${key}`) && key === 'id') {
            target = `${target}/${params[key]}`;
        }
    });
    return <Navigate to={target} replace />;
};

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                    <CompanyProvider>
                <FinancialYearProvider>
                        <FeatureSettingsProvider>
                        <BrandedSplashGate>
                        <ModuleGuardProvider>
                        <UiPreferencesProvider>
                        <SocketProvider>
                    <LiveNotificationProvider>
                    <NotificationProvider>
                        <MessengerProvider>
                            <ToastProvider>
                                <Toaster
                                    position="bottom-right"
                                    toastOptions={{
                                        duration: 5000,
                                        style: { zIndex: 99999 }
                                    }}
                                />

                                <ModalProvider>
                                    <Suspense fallback={<BrandedLoader size={120} />}>
                                        <Routes>
                                            {/* Public routes - Login, Forgot Password, Reset Password */}
                                            <Route path="/login" element={<LoginPage />} />
                                            <Route path="/login/:slug" element={<LoginPage />} />
                                            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                                            <Route path="/forgot-password/:slug" element={<ForgotPasswordPage />} />
                                            <Route path="/reset-password" element={<ResetPasswordPage />} />
                                            <Route path="/reset-password/:slug" element={<ResetPasswordPage />} />
                                            <Route path="/public/invoice/:token" element={<PublicInvoicePage />} />

                                            {/* Full-screen pages without sidebar */}
                                            <Route
                                                path="/customers/add"
                                                element={
                                                    <ProtectedRoute requirePermission="add_customer">
                                                        <AddCustomerPage />
                                                    </ProtectedRoute>
                                                }
                                            />

                                            {/* Messenger - full screen, no CRM sidebar */}
                                            <Route
                                                path="/messenger"
                                                element={
                                                    <ProtectedRoute>
                                                        <ErrorBoundary>
                                                            <MessengerPage />
                                                        </ErrorBoundary>
                                                    </ProtectedRoute>
                                                }
                                            />

                                            {/* Pages with sidebar and header */}
                                            <Route path="*" element={
                                                <ProtectedRoute>
                                                    <SidebarProvider>
                                                        <ErrorBoundary>
                                                            <AppLayout />
                                                        </ErrorBoundary>
                                                    </SidebarProvider>
                                                </ProtectedRoute>
                                            } />
                                        </Routes>
                                    </Suspense>
                                </ModalProvider>
                            </ToastProvider>
                        </MessengerProvider>
                    </NotificationProvider>
                    </LiveNotificationProvider>
                    </SocketProvider>
                        </UiPreferencesProvider>
                        </ModuleGuardProvider>
                        </BrandedSplashGate>
                        </FeatureSettingsProvider>
                </FinancialYearProvider>
                    </CompanyProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

// Separate layout component to handle route-specific logic
const AppLayout = () => {
    const { user } = useAuth();
    const { selectedFY } = useFinancialYear();
    const { isMobileLayout, isMobileMenuOpen, closeMobileMenu } = useSidebar();

    const location = useLocation();

    // Tracking for Recently Opened forms
    useEffect(() => {
        const path = location.pathname;
        // Simple check to see if this is a form path (avoiding heavy imports here)
        // We'll just look for common form path patterns or exact matches in a simple list
        const forms = [
            { path: '/customers/list', title: 'Customer Master', id: 'customer-master', icon: 'crm' },
            { path: '/sales/orders', title: 'Sales Order', id: 'sales-order', icon: 'sales' },
            { path: '/sales/invoices', title: 'Tax Invoice (GST)', id: 'sales-invoice', icon: 'sales' },
            { path: '/purchase/orders', title: 'Purchase Order', id: 'purchase-order', icon: 'purchase' },
            { path: '/purchase/invoices', title: 'Purchase Invoice', id: 'purchase-invoice', icon: 'purchase' },
            { path: '/inventory/stock/ledger', title: 'Stock Movement Ledger', id: 'stock-ledger', icon: 'inventory' },
            { path: '/inventory/items', title: 'Item Master', id: 'item-master', icon: 'inventory' },
            { path: '/followups', title: 'Follow-up', id: 'follow-up', icon: 'crm' },
            { path: '/tasks/list', title: 'Task Hub', id: 'manage-tasks', icon: 'tasks' },
        ];
        
        const form = forms.find(f => path === f.path);
        if (form && (user?._id || user?.id)) {
            const RECENT_KEY = `dashboard_recent_${user?._id || user?.id}`;
            const saved = localStorage.getItem(RECENT_KEY);
            let recent = saved ? JSON.parse(saved) : [];
            recent = recent.filter(item => item.id !== form.id);
            recent = [{
                ...form,
                timestamp: new Date().toISOString()
            }, ...recent].slice(0, 5);
            localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
        }
    }, [location.pathname, user?.id]);

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }} data-jsk-ui-component="app-shell">
            {isMobileLayout && isMobileMenuOpen ? (
                <div className="jsk-mobile-backdrop" onClick={closeMobileMenu} aria-hidden="true" />
            ) : null}
            <Sidebar />
            <div
                data-jsk-ui-component="main-column"
                style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minWidth: 0,
                width: '100%',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
                <TopMenuBar />
                <Header />
                <ModuleLockBanner />
                <main
                    className="jsk-main-content"
                    key={selectedFY}
                    style={{ 
                        flex: 1, 
                        backgroundColor: '#F6F8FC', 
                        maxHeight: '92vh', 
                        overflow: 'auto' 
                    }}
                >
                    <ErrorBoundary>
                        <Routes>
                        <Route path="/" element={<ProtectedRoute><ModuleHomePage moduleName="dashboard" title="Home" subtitle="Your Global Shortcuts" isStatic={false} /></ProtectedRoute>} />
                        
                        {/* Module Home Pages - Static */}
                        <Route path={PATHS.SALES.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="Sales" title="Sales - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.PURCHASE.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="Purchase" title="Purchase - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.INVENTORY.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="Inventory" title="Inventory - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="Production" title="Production - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNT_MASTER.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="Account Master" title="Account Master - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.VOUCHER_ENTRY.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="Voucher Entry" title="Voucher Entry - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="Accounts" title="Accounts - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.GST.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="GST" title="GST - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.MIS.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="MIS Reports" title="MIS Reports - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.CRM.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="CRM" title="CRM - Home" isStatic={true} /></ProtectedRoute>} />
                        
                        {/* Other modules can stay dynamic or be made static as needed */}
                        <Route path={PATHS.HR.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="HR Management" title="HR Management - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.SERVICE.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="Service" title="Service - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.PRD.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="Product R&D" title="Product R&D - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.RD_SAMPLES.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="R&D Samples" title="R&D Samples - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path="/tasks" element={<Navigate to="/tasks/home" replace />} />
                        <Route path="/tasks/home" element={<ProtectedRoute><ModuleHomePage moduleName="Task Management" title="Task Management - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path="/admin" element={<Navigate to="/admin/home" replace />} />
                        <Route path="/admin/home" element={<ProtectedRoute><ModuleHomePage moduleName="Admin" title="Admin - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.CHINA_SUPPLIER.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="China Sourcing" title="China Sourcing - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.EWAY_BILL.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="eway-bill" title="E-Way Bills - Home" isStatic={false} /></ProtectedRoute>} />
                        <Route path={PATHS.TRANSPORTERS.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="transporters" title="Transporters - Home" isStatic={false} /></ProtectedRoute>} />
                        <Route path={PATHS.MESSENGER.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="messenger" title="Messenger - Home" isStatic={false} /></ProtectedRoute>} />
                        <Route path={PATHS.WECHAT.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="wechat" title="WeChat - Home" isStatic={false} /></ProtectedRoute>} />

                        <Route path="/customers" element={<ProtectedRoute requirePermission="view_customers"><CustomerList /></ProtectedRoute>} />
                        <Route path="/customers/list" element={<ProtectedRoute requirePermission="view_customers"><CustomerList /></ProtectedRoute>} />
                        <Route path="/followups" element={<ProtectedRoute requirePermission="customers"><FollowupDashboard /></ProtectedRoute>} />
                        <Route path="/followup/:customerId" element={<ProtectedRoute requirePermission="customers"><FollowUpForm /></ProtectedRoute>} />
                        <Route path="/talk/:customerId" element={<ProtectedRoute requirePermission="customers"><TalkWithCustomerForm /></ProtectedRoute>} />
                        <Route path="/followup" element={<Navigate to="/customers/list" replace />} />
                        <Route path="/talk" element={<Navigate to="/customers/list" replace />} />
                        <Route path="/admin/users" element={<ProtectedRoute requireRole="admin"><UserManagement /></ProtectedRoute>} />
                        <Route path="/admin/diagnostics" element={<ProtectedPlatformRoute><DiagnosticDashboard /></ProtectedPlatformRoute>} />
                        <Route path="/admin/ledger-linking" element={<ProtectedRoute requirePermission="admin.ledger_linking.view"><AutoLinkLedgers /></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.IMPORT_CENTER} element={<ProtectedRoute requirePermission="import_utility.import_utility.view"><ImportCenterPage /></ProtectedRoute>} />
                        <Route path="/admin/backups" element={<ProtectedPlatformRoute><BackupRestorePage /></ProtectedPlatformRoute>} />

                        <Route path={PATHS.SETTINGS.COMPANIES_LIST} element={<ProtectedPlatformRoute><CompaniesListPage /></ProtectedPlatformRoute>} />
                        <Route path="/company-profile" element={<ProtectedRoute requirePermission="admin.company_profile.view"><CompanyProfilePage /></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.FEATURE_CONFIGURATION} element={<ProtectedPlatformRoute><FeatureConfigurationPage /></ProtectedPlatformRoute>} />
                        <Route path={PATHS.SETTINGS.FEATURE_COMPLIANCE} element={<ProtectedRoute requirePermission="admin"><FeatureComplianceSettingsPage /></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.CUSTOMER_MASTER_SETTINGS} element={<Navigate to={`${PATHS.SETTINGS.FEATURE_COMPLIANCE}?tab=customer`} replace />} />
                        <Route path={PATHS.CUSTOMERS.SETTINGS} element={<Navigate to={`${PATHS.SETTINGS.FEATURE_COMPLIANCE}?tab=customer`} replace />} />
                        <Route path={PATHS.SETTINGS.ACCOUNTS_SUNDRY_DEBTOR} element={<Navigate to={`${PATHS.SETTINGS.FEATURE_COMPLIANCE}?tab=customer`} replace />} />
                        <Route path={PATHS.SETTINGS.CUSTOMER_SETTINGS} element={<Navigate to={`${PATHS.SETTINGS.FEATURE_COMPLIANCE}?tab=customer`} replace />} />
                        <Route path={PATHS.SETTINGS.PLATFORM_FEATURE_DEFAULTS} element={<ProtectedPlatformRoute><PlatformFeatureDefaultsPage /></ProtectedPlatformRoute>} />
                        <Route path={PATHS.SETTINGS.INDUSTRY_TEMPLATES} element={<ProtectedPlatformRoute><IndustryTemplateMasterPage /></ProtectedPlatformRoute>} />
                        <Route path={PATHS.SETTINGS.COMPANY_MODULE_ALLOCATION} element={<ProtectedPlatformRoute><CompanyModuleAllocationPage /></ProtectedPlatformRoute>} />
                        <Route path={PATHS.SETTINGS.INDUSTRY_DEPLOYMENT_MANAGER} element={<ProtectedPlatformRoute><IndustryDeploymentManagerPage /></ProtectedPlatformRoute>} />
                        <Route path="/module-disabled" element={<ModuleDisabledPage />} />
                        <Route path="/platform-access-denied" element={<PlatformAccessDenied />} />
                        <Route path={PATHS.SETTINGS.WORKFLOW_MASTER} element={<ProtectedPlatformRoute><WorkflowMasterPage /></ProtectedPlatformRoute>} />
                        <Route path={PATHS.SETTINGS.PRINT_FORMAT_VERSION_MANAGER} element={<ProtectedPlatformRoute><PrintFormatVersionManagerPage /></ProtectedPlatformRoute>} />
                        <Route path={PATHS.SETTINGS.PRINT_FORMAT_DESIGNER} element={<ProtectedRoute requirePermission="admin.print_format_designer.view"><PrintFormatDesignerPage /></ProtectedRoute>} />
                        <Route path={PATHS.E_INVOICE.LIST} element={<ProtectedRoute requirePermission="sales"><FeatureGuard feature="gst.eInvoiceRequired"><EInvoiceListPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/e-invoices/draft/:id" element={<ProtectedRoute requirePermission="sales"><FeatureGuard feature="gst.eInvoiceRequired"><EInvoiceDraftPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/whatsapp" element={<ProtectedRoute requirePermission="whatsapp.whatsapp_settings.view"><WhatsAppSettingsPage /></ProtectedRoute>} />
                        <Route path="/whatsapp/chat" element={<ProtectedRoute requirePermission="whatsapp.whatsapp_settings.view"><WhatsAppChatPage /></ProtectedRoute>} />
                        {/* Legacy redirect for old URL */}
                        <Route path="/settings/whatsapp" element={<Navigate to="/whatsapp" replace />} />

                        {/* WhatsApp Bulk Messaging Utility (isolated module; feature + permissions gated) */}
                        <Route path={PATHS.SETTINGS.WHATSAPP_BULK.CAMPAIGNS} element={<ProtectedRoute requirePermission="whatsapp_bulk.campaigns.view"><FeatureGuard feature="communication.enableWhatsappBulk"><WhatsappBulkCampaignsPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_BULK.MATTERS} element={<ProtectedRoute requirePermission="whatsapp_bulk.matter_master.view"><FeatureGuard feature="communication.enableWhatsappBulk"><WhatsappBulkMatterPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_BULK.BLACKLIST} element={<ProtectedRoute requirePermission="whatsapp_bulk.blacklist.view"><FeatureGuard feature="communication.enableWhatsappBulk"><WhatsappBulkBlacklistPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_BULK.HISTORY} element={<ProtectedRoute requirePermission="whatsapp_bulk.campaigns.view"><FeatureGuard feature="communication.enableWhatsappBulk"><WhatsappBulkHistoryPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_BULK.SETTINGS} element={<ProtectedRoute requirePermission="whatsapp_bulk.settings.view"><FeatureGuard feature="communication.enableWhatsappBulk"><WhatsappBulkSettingsPage /></FeatureGuard></ProtectedRoute>} />

                                                {/* WhatsApp AI Assistant — Phase 1A foundation shells (feature-flagged; no live WA) */}
                        <Route path={PATHS.SETTINGS.WHATSAPP_AI.DASHBOARD} element={<ProtectedRoute requirePermission={WHATSAPP_AI_PERMISSIONS.DASHBOARD_VIEW}><WhatsAppAiFeatureGuard><WhatsAppAIDashboardPage /></WhatsAppAiFeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_AI.INBOX} element={<ProtectedRoute requirePermission={WHATSAPP_AI_PERMISSIONS.VIEW}><WhatsAppAiFeatureGuard><WhatsAppAIInboxPage /></WhatsAppAiFeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_AI.ACTIVE} element={<ProtectedRoute><WhatsAppAiFeatureGuard><WhatsAppAiAnyPermission permissions={[WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ALL, WHATSAPP_AI_PERMISSIONS.CONVERSATIONS_VIEW_ASSIGNED]}><WhatsAppAIActiveConversationsPage /></WhatsAppAiAnyPermission></WhatsAppAiFeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_AI.WAITING_HUMAN} element={<ProtectedRoute requirePermission={WHATSAPP_AI_PERMISSIONS.TAKEOVER}><WhatsAppAiFeatureGuard><WhatsAppAIWaitingHumanPage /></WhatsAppAiFeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_AI.LEAD_DRAFTS} element={<ProtectedRoute><WhatsAppAiFeatureGuard><WhatsAppAiAnyPermission permissions={[WHATSAPP_AI_PERMISSIONS.LEAD_DRAFT_CREATE, WHATSAPP_AI_PERMISSIONS.LEAD_DRAFT_APPROVE]}><WhatsAppAILeadDraftsPage /></WhatsAppAiAnyPermission></WhatsAppAiFeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_AI.KNOWLEDGE} element={<ProtectedRoute><WhatsAppAiFeatureGuard><WhatsAppAiAnyPermission permissions={[WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_MANAGE, WHATSAPP_AI_PERMISSIONS.KNOWLEDGE_APPROVE]}><WhatsAppAIKnowledgePage /></WhatsAppAiAnyPermission></WhatsAppAiFeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_AI.DOCUMENTS} element={<ProtectedRoute><WhatsAppAiFeatureGuard><WhatsAppAiAnyPermission permissions={[WHATSAPP_AI_PERMISSIONS.DOCUMENTS_MANAGE, WHATSAPP_AI_PERMISSIONS.DOCUMENTS_SHARE]}><WhatsAppAIDocumentsPage /></WhatsAppAiAnyPermission></WhatsAppAiFeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_AI.RULES} element={<ProtectedRoute requirePermission={WHATSAPP_AI_PERMISSIONS.SETTINGS_MANAGE}><WhatsAppAiFeatureGuard><WhatsAppAIRulesPage /></WhatsAppAiFeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_AI.SETTINGS} element={<ProtectedRoute requirePermission={WHATSAPP_AI_PERMISSIONS.SETTINGS_MANAGE}><WhatsAppAiFeatureGuard><WhatsAppAISettingsPage /></WhatsAppAiFeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.WHATSAPP_AI.AUDIT} element={<ProtectedRoute requirePermission={WHATSAPP_AI_PERMISSIONS.AUDIT_VIEW}><WhatsAppAiFeatureGuard><WhatsAppAIAuditLogsPage /></WhatsAppAiFeatureGuard></ProtectedRoute>} />

                        {/* Platform Email Communication */}
                        <Route path={PATHS.SETTINGS.EMAIL} element={<ProtectedRoute requirePermission="email.settings.view"><FeatureGuard feature="communication.enableEmail"><EmailSettingsPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.COMMUNICATION_HISTORY} element={<ProtectedRoute requirePermission="email.communication_history.view"><FeatureGuard feature="communication.enableEmail"><CommunicationHistoryPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.EMAIL_BULK.CAMPAIGNS} element={<ProtectedRoute requirePermission="email_bulk.campaigns.view"><FeatureGuard feature="communication.enableEmailBulk"><EmailBulkCampaignsPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.EMAIL_BULK.TEMPLATES} element={<ProtectedRoute requirePermission="email_bulk.templates.view"><FeatureGuard feature="communication.enableEmailBulk"><EmailBulkTemplatesPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.EMAIL_BULK.BLACKLIST} element={<ProtectedRoute requirePermission="email_bulk.blacklist.view"><FeatureGuard feature="communication.enableEmailBulk"><EmailBulkBlacklistPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.EMAIL_BULK.HISTORY} element={<ProtectedRoute requirePermission="email_bulk.campaigns.view"><FeatureGuard feature="communication.enableEmailBulk"><EmailBulkHistoryPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.SETTINGS.EMAIL_BULK.SETTINGS} element={<ProtectedRoute requirePermission="email_bulk.settings.view"><FeatureGuard feature="communication.enableEmailBulk"><EmailBulkSettingsPage /></FeatureGuard></ProtectedRoute>} />

                        {/* CRM — WhatsApp Leads + Product Catalog (gated by crm.whatsappToLeadEnabled / crm.productCatalogEnabled) */}
                        <Route path="/crm/leads" element={<ProtectedRoute requirePermission="crm.leads.view"><FeatureGuard feature="crm.whatsappToLeadEnabled"><LeadListPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/leads/new" element={<ProtectedRoute requirePermission="crm.leads.add"><FeatureGuard feature="crm.whatsappToLeadEnabled"><LeadFormPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/leads/:id" element={<ProtectedRoute requirePermission="crm.leads.view"><FeatureGuard feature="crm.whatsappToLeadEnabled"><LeadFormPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/product-catalog" element={<ProtectedRoute requirePermission="crm.product_catalog.view"><FeatureGuard feature="crm.productCatalogEnabled"><ProductCatalogListPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/product-catalog/new" element={<ProtectedRoute requirePermission="crm.product_catalog.add"><FeatureGuard feature="crm.productCatalogEnabled"><ProductCatalogFormPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/product-catalog/:id" element={<ProtectedRoute requirePermission="crm.product_catalog.view"><FeatureGuard feature="crm.productCatalogEnabled"><ProductCatalogFormPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/reports/customer-master" element={<ProtectedRoute requirePermission="reports.customer_master_report.view"><CustomerMasterReport /></ProtectedRoute>} />
                        <Route path={PATHS.REPORTS.CUSTOMER_KYC} element={<ProtectedRoute requirePermission="reports.customer_kyc_reports.view"><CustomerKycReportsPage /></ProtectedRoute>} />
                        <Route path={PATHS.REPORTS.SUPPLIER_KYC} element={<ProtectedRoute requirePermission="reports.supplier_kyc_reports.view"><SupplierKycReportsPage /></ProtectedRoute>} />
                        <Route path="/reports/followups" element={<ProtectedRoute requirePermission="reports.followup_report.view"><FollowUpTrackerReport /></ProtectedRoute>} />
                        <Route path="/reports/reminders" element={<ProtectedRoute requirePermission="reports"><ReminderReport /></ProtectedRoute>} />
                        <Route path="/reports/open-reminders" element={<ProtectedRoute requirePermission="reports.reminder_report.view"><OpenRemindersReport /></ProtectedRoute>} />
                        <Route path="/reports/conversation-history" element={<ProtectedRoute requirePermission="reports"><ConversationHistoryReport /></ProtectedRoute>} />
                        <Route path="/reports/consumable-cost" element={<ProtectedRoute requirePermission="reports"><ConsumableCostReport /></ProtectedRoute>} />
                        
                        {/* MIS Reports */}
                        <Route path={PATHS.MIS.SALES_DASHBOARD} element={<ProtectedRoute requirePermission="mis.sales_marketing.view"><SalesMarketingDashboard /></ProtectedRoute>} />
                        <Route path={PATHS.MIS.PRODUCT_GP} element={<ProtectedRoute requirePermission="mis.product_gp_analysis.view"><ProductGpReport /></ProtectedRoute>} />
                        <Route path={PATHS.MIS.GP_ANALYSIS} element={<ProtectedRoute requirePermission="mis.product_gp_analysis.view"><GpAnalysisPage /></ProtectedRoute>} />
                        
                        {/* Redirects for MIS Reports */}
                        <Route path="/mis/sales-marketing" element={<Navigate to={PATHS.MIS.SALES_DASHBOARD} replace />} />
                        <Route path="/reports/product-gp" element={<Navigate to={PATHS.MIS.PRODUCT_GP} replace />} />

                        <Route path={PATHS.REPORTS.PRODUCT_GP} element={<Navigate to={PATHS.MIS.PRODUCT_GP} replace />} />
                        <Route path={PATHS.REPORTS.REPLACEMENTS} element={<ProtectedRoute requirePermission="reports"><ReplacementReport /></ProtectedRoute>} />
                        <Route path={PATHS.REPORTS.SAMPLE_CONVERSION} element={<ProtectedRoute requirePermission="reports"><SampleConversionReport /></ProtectedRoute>} />
                        <Route path="/reports/followup-dashboard" element={<ProtectedRoute requirePermission="reports.followup_report.view"><FollowupDashboardReport /></ProtectedRoute>} />
                        <Route path="/reports/followup-task-report" element={<ProtectedRoute requirePermission="reports.followup_report.view"><FollowupTaskReport /></ProtectedRoute>} />
                        <Route path="/reports/incentive" element={<ProtectedRoute requirePermission="sales"><IncentiveReport /></ProtectedRoute>} />
                        {/* GST module */}
                        <Route path={PATHS.GST.GSTR1} element={<ProtectedRoute requirePermission="gst.gstr1.view"><GstrReportPage /></ProtectedRoute>} />
                        <Route path={PATHS.GST.GSTR3B} element={<ProtectedRoute requirePermission="gst.gstr3b.view"><Gstr3bReportPage /></ProtectedRoute>} />
                        <Route path={PATHS.GST.GSTR9} element={<ProtectedRoute requirePermission="gst.gstr3b.view"><Gstr9ReportPage /></ProtectedRoute>} />
                        <Route path={PATHS.GST.RECONCILIATION} element={<ProtectedRoute requirePermission="gst.gst_reconciliation.view"><GstReconciliationPage /></ProtectedRoute>} />
                        <Route path={PATHS.GST.PAYABLE} element={<ProtectedRoute requirePermission="gst.gst_payable.view"><GstPayableSummary /></ProtectedRoute>} />
                        <Route path={PATHS.GST.ITC_REGISTER} element={<ProtectedRoute requirePermission="gst.itc_register.view"><ItcRegisterPage /></ProtectedRoute>} />
                        <Route path={PATHS.GST.HSN_SUMMARY} element={<ProtectedRoute requirePermission="gst.hsn_summary.view"><HsnSummaryPage /></ProtectedRoute>} />
                        <Route path={PATHS.GST.LEDGER} element={<ProtectedRoute requirePermission="gst.gst_ledger.view"><GstLedgerPage /></ProtectedRoute>} />
                        {/* Legacy /reports/gst* URLs → GST module */}
                        <Route path="/reports/gstr1" element={<Navigate to={PATHS.GST.GSTR1} replace />} />
                        <Route path="/reports/gstr3b" element={<Navigate to={PATHS.GST.GSTR3B} replace />} />
                        <Route path="/reports/gst-reconciliation" element={<Navigate to={PATHS.GST.RECONCILIATION} replace />} />
                        <Route path="/reports/gst-payable" element={<Navigate to={PATHS.GST.PAYABLE} replace />} />
                        <Route path="/reports/gst/itc-register" element={<Navigate to={PATHS.GST.ITC_REGISTER} replace />} />
                        <Route path="/reports/gst/hsn-summary" element={<Navigate to={PATHS.GST.HSN_SUMMARY} replace />} />
                        <Route path="/reports/gst/ledger" element={<Navigate to={PATHS.GST.LEDGER} replace />} />
                        <Route path="/reports/task-reminders" element={<ProtectedRoute requirePermission="tasks"><TaskReminderReport /></ProtectedRoute>} />
                        <Route path="/task-chats" element={<ProtectedRoute requirePermission="tasks"><TaskChatDashboard /></ProtectedRoute>} />
                        <Route path="/task-chats/:taskId" element={<ProtectedRoute requirePermission="tasks"><TaskChatDashboard /></ProtectedRoute>} />
                        <Route path="/reminders" element={<ProtectedRoute requirePermission="customers"><RemindersDashboard /></ProtectedRoute>} />
                        <Route path="/tasks/create" element={<ProtectedRoute requirePermission="tasks"><TaskCreatePage /></ProtectedRoute>} />
                        <Route path="/tasks/edit/:id" element={<ProtectedRoute requirePermission="tasks"><TaskEditPage /></ProtectedRoute>} />
                        <Route path="/tasks/list" element={<ProtectedRoute requirePermission="tasks"><ManageTasksPage /></ProtectedRoute>} />
                        <Route path="/tasks/groups" element={<ProtectedRoute requirePermission="tasks"><TaskGroupList /></ProtectedRoute>} />
                        <Route path="/tasks/:id" element={<ProtectedRoute requirePermission="tasks"><ManageTasksPage /></ProtectedRoute>} />
                        <Route path="/groups" element={<ProtectedRoute requirePermission="tasks"><GroupList /></ProtectedRoute>} />
                        <Route path="/groups/:id" element={<ProtectedRoute requirePermission="tasks"><GroupDetails /></ProtectedRoute>} />
                        <Route path="/inventory/items" element={<ProtectedRoute requirePermission="inventory"><ItemListPage /></ProtectedRoute>} />
                        <Route path="/inventory/items/new" element={<ProtectedRoute requirePermission="inventory"><ItemFormPage /></ProtectedRoute>} />
                        <Route path="/inventory/items/:id" element={<ProtectedRoute requirePermission="inventory"><ItemFormPage /></ProtectedRoute>} />
                        <Route path="/inventory/item-types" element={<ProtectedRoute requirePermission="inventory"><ItemTypePage /></ProtectedRoute>} />
                        <Route path="/inventory/item-groups" element={<ProtectedRoute requirePermission="inventory"><ItemGroupPage /></ProtectedRoute>} />
                        <Route path="/inventory/bom" element={<ProtectedRoute requirePermission="inventory"><BOMPage /></ProtectedRoute>} />
                        <Route path="/inventory/bom/new" element={<ProtectedRoute requirePermission="inventory"><BOMFormPage /></ProtectedRoute>} />
                        <Route path="/inventory/bom/edit/:id" element={<ProtectedRoute requirePermission="inventory"><BOMFormPage /></ProtectedRoute>} />
                        <Route path="/production" element={<ProtectedRoute requirePermission="production"><ProductionDashboard /></ProtectedRoute>} />
                        <Route path="/production/work-orders" element={<ProtectedRoute requirePermission="production"><WorkOrderListPage /></ProtectedRoute>} />
                        <Route path="/production/work-orders/new" element={<ProtectedRoute requirePermission="production"><WorkOrderFormPage /></ProtectedRoute>} />
                        <Route path="/production/work-orders/:id" element={<ProtectedRoute requirePermission="production"><WorkOrderDetailPage /></ProtectedRoute>} />
                        <Route path="/production/workflow-lots" element={<ProtectedRoute requirePermission="production.workflow_production.view"><WorkflowProductionListPage /></ProtectedRoute>} />
                        <Route path="/production/workflow-lots/new" element={<ProtectedRoute requirePermission="production.workflow_production.add"><WorkflowProductionFormPage /></ProtectedRoute>} />
                        <Route path="/production/workflow-lots/:id" element={<ProtectedRoute requirePermission="production.workflow_production.view"><WorkflowProductionDetailPage /></ProtectedRoute>} />
                        <Route path="/production/textile-lots" element={<ProtectedRoute requirePermission="production.textile_production.view"><TextileProductionListPage /></ProtectedRoute>} />
                        <Route path="/production/textile-lots/new" element={<ProtectedRoute requirePermission="production.textile_production.add"><TextileProductionFormPage /></ProtectedRoute>} />
                        <Route path="/production/textile-lots/:id/dyeing-issue" element={<ProtectedRoute requirePermission="production.textile_production.edit"><TextileDyeingIssuePage /></ProtectedRoute>} />
                        <Route path="/production/textile-lots/:id/dyeing-return" element={<ProtectedRoute requirePermission="production.textile_production.edit"><TextileDyeingReturnPage /></ProtectedRoute>} />
                        <Route path="/production/textile-lots/:id/report" element={<ProtectedRoute requirePermission="production.textile_production.view"><TextileLotReportPage /></ProtectedRoute>} />
                        <Route path="/production/textile-lots/:id" element={<ProtectedRoute requirePermission="production.textile_production.view"><TextileStageProgressPage /></ProtectedRoute>} />
                        <Route path="/production/textile-job-work-rates" element={<ProtectedRoute requirePermission="production.textile_job_work_rates.view"><TextileJobWorkRatePage /></ProtectedRoute>} />
                        <Route path="/production/textile-job-work-reports" element={<ProtectedRoute requirePermission="production.textile_job_work_rates.view"><TextileJobWorkReportsPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_JOB_WORK.ROOT} element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileJobWorkHomePage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_JOB_WORK.ISSUE} element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.add"><TextileJobWorkIssuePage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_JOB_WORK.RETURN} element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.edit"><TextileJobWorkReturnEntryPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_JOB_WORK.STOCK} element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileJobWorkStockWithVendorPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_JOB_WORK.REPORTS} element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileJobWorkModuleReportsPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_JOB_WORK.PROCESS_OUTPUT_STOCK} element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileProcessOutputStockPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_JOB_WORK.PROCESS_TRACE} element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileProcessTracePage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_JOB_WORK.PROCESS_OUTPUT_REPORTS} element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileProcessOutputReportsPage /></ProtectedRoute>} />
                        <Route path="/production/textile-conversion-master" element={<ProtectedRoute requirePermission="production.textile_conversion.view"><TextileConversionMasterPage /></ProtectedRoute>} />
                        <Route path="/production/textile-transformation-entry" element={<ProtectedRoute requirePermission="production.textile_conversion.add"><TextileTransformationEntryPage /></ProtectedRoute>} />
                        <Route path="/production/textile-transformation-history" element={<ProtectedRoute requirePermission="production.textile_conversion.view"><TextileTransformationHistoryPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_DYEING_CHALLANS} element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileDyeingChallanListPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_DYEING_CHALLAN_NEW} element={<Navigate to={`${PATHS.PRODUCTION.TEXTILE_JOB_WORK.ISSUE}?process=Dyeing`} replace />} />
                        <Route path="/production/textile-dyeing-challans/:id" element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileDyeingChallanDetailPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_DYEING_CHALLAN_RETURN} element={<Navigate to={`${PATHS.PRODUCTION.TEXTILE_JOB_WORK.RETURN}?process=Dyeing`} replace />} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_STOCK_WITH_DYERS} element={<Navigate to={`${PATHS.PRODUCTION.TEXTILE_JOB_WORK.STOCK}?process=Dyeing`} replace />} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_DYEING_REPORTS} element={<Navigate to={`${PATHS.PRODUCTION.TEXTILE_JOB_WORK.REPORTS}?process=Dyeing`} replace />} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_EMBROIDERY_CHALLANS} element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileEmbroideryChallanListPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_EMBROIDERY_CHALLAN_NEW} element={<Navigate to={`${PATHS.PRODUCTION.TEXTILE_JOB_WORK.ISSUE}?process=Embroidery`} replace />} />
                        <Route path="/production/textile-embroidery-challans/:id" element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileEmbroideryChallanDetailPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_EMBROIDERY_CHALLAN_RETURN} element={<Navigate to={`${PATHS.PRODUCTION.TEXTILE_JOB_WORK.RETURN}?process=Embroidery`} replace />} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_STOCK_WITH_EMBROIDERY} element={<Navigate to={`${PATHS.PRODUCTION.TEXTILE_JOB_WORK.STOCK}?process=Embroidery`} replace />} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_EMBROIDERY_REPORTS} element={<Navigate to={`${PATHS.PRODUCTION.TEXTILE_JOB_WORK.REPORTS}?process=Embroidery`} replace />} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_PRODUCTION_WORKFLOW} element={<ProtectedRoute requirePermission="production.textile_production_workflow.view"><TextileProductionDashboardPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_PROCESS_ROUTES} element={<ProtectedRoute requirePermission="production.textile_process_route.view"><TextileProcessRouteMasterPage /></ProtectedRoute>} />
                        <Route path={PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_NEW} element={<ProtectedRoute requirePermission="production.textile_production_workflow.add"><TextileProductionOrderFormPage /></ProtectedRoute>} />
                        <Route path="/production/textile-production-orders/:id/issue" element={<ProtectedRoute requirePermission="production.textile_production_workflow.edit"><TextileProcessIssueChallanPage /></ProtectedRoute>} />
                        <Route path="/production/textile-production-orders/:id/receive" element={<ProtectedRoute requirePermission="production.textile_production_workflow.edit"><TextileProcessReceiveChallanPage /></ProtectedRoute>} />
                        <Route path="/production/textile-process-challans/:processType/:id" element={<ProtectedRoute requirePermission="production.textile_dyeing_challan.view"><TextileProcessChallanDetailPage /></ProtectedRoute>} />
                        <Route path="/production/textile-production-orders/:id" element={<ProtectedRoute requirePermission="production.textile_production_workflow.view"><TextileProductionOrderDetailPage /></ProtectedRoute>} />
                        <Route path="/production/planning" element={<ProtectedRoute requirePermission="production.production_planning.view"><ProductionPlanningListPage /></ProtectedRoute>} />
                        <Route path="/production/planning/new" element={<ProtectedRoute requirePermission="production.production_planning.add"><ProductionPlanningFormPage /></ProtectedRoute>} />
                        <Route path="/production/planning/:id" element={<ProtectedRoute requirePermission="production.production_planning.view"><ProductionPlanningFormPage /></ProtectedRoute>} />
                        <Route path="/purchase/suppliers" element={<ProtectedRoute requirePermission="purchase"><SupplierListPage /></ProtectedRoute>} />
                        <Route path={PATHS.PURCHASE.RFQ_REPORTS} element={<ProtectedRoute requirePermission="purchase"><PurchaseRfqFeatureGate><PurchaseRfqReportsPage /></PurchaseRfqFeatureGate></ProtectedRoute>} />
                        <Route path={PATHS.PURCHASE.QUOTATION_COMPARISON_LIST} element={<ProtectedRoute requirePermission="purchase"><PurchaseRfqFeatureGate><PurchaseRfqComparisonListPage /></PurchaseRfqFeatureGate></ProtectedRoute>} />
                        <Route path={PATHS.PURCHASE.RFQ_NEW} element={<ProtectedRoute requirePermission="purchase"><PurchaseRfqFeatureGate><PurchaseRfqFormPage /></PurchaseRfqFeatureGate></ProtectedRoute>} />
                        <Route path="/purchase/rfq/:id/edit" element={<ProtectedRoute requirePermission="purchase"><PurchaseRfqFeatureGate><PurchaseRfqFormPage /></PurchaseRfqFeatureGate></ProtectedRoute>} />
                        <Route path="/purchase/rfq/:id/comparison" element={<ProtectedRoute requirePermission="purchase"><PurchaseRfqFeatureGate><QuotationComparisonPage /></PurchaseRfqFeatureGate></ProtectedRoute>} />
                        <Route path="/purchase/rfq/:id" element={<ProtectedRoute requirePermission="purchase"><PurchaseRfqFeatureGate><PurchaseRfqDetailPage /></PurchaseRfqFeatureGate></ProtectedRoute>} />
                        <Route path={PATHS.PURCHASE.RFQ} element={<ProtectedRoute requirePermission="purchase"><PurchaseRfqFeatureGate><PurchaseRfqListPage /></PurchaseRfqFeatureGate></ProtectedRoute>} />
                        <Route path="/purchase/supplier-quotations/new" element={<ProtectedRoute requirePermission="purchase"><PurchaseRfqFeatureGate><SupplierQuotationFormPage /></PurchaseRfqFeatureGate></ProtectedRoute>} />
                        <Route path="/purchase/supplier-quotations/edit/:id" element={<ProtectedRoute requirePermission="purchase"><PurchaseRfqFeatureGate><SupplierQuotationFormPage /></PurchaseRfqFeatureGate></ProtectedRoute>} />
                        <Route path={PATHS.PURCHASE.SUPPLIER_QUOTATIONS} element={<ProtectedRoute requirePermission="purchase"><PurchaseRfqFeatureGate><SupplierQuotationListPage /></PurchaseRfqFeatureGate></ProtectedRoute>} />
                        <Route path="/distributors" element={<ProtectedRoute requirePermission="sales"><DistributorList /></ProtectedRoute>} />
                        <Route path="/purchase/orders" element={<ProtectedRoute requirePermission="purchase"><PurchaseOrderListPage /></ProtectedRoute>} />
                        <Route path="/purchase/orders/new" element={<ProtectedRoute requirePermission="purchase"><PurchaseOrderFormPage /></ProtectedRoute>} />
                        <Route path="/purchase/orders/edit/:id" element={<ProtectedRoute requirePermission="purchase"><PurchaseOrderFormPage /></ProtectedRoute>} />
                        <Route path="/purchase/orders/:id" element={<ProtectedRoute requirePermission="purchase"><PurchaseOrderDetailPage /></ProtectedRoute>} />
                        <Route path="/purchase/grn" element={<ProtectedRoute requirePermission="purchase"><GRNListPage /></ProtectedRoute>} />
                        <Route path="/purchase/grn/new" element={<ProtectedRoute requirePermission="purchase"><GRNFormPage /></ProtectedRoute>} />
                        <Route path="/purchase/invoices" element={<ProtectedRoute requirePermission="purchase"><PurchaseInvoiceListPage /></ProtectedRoute>} />
                        <Route path="/purchase/invoices/new" element={<ProtectedRoute requirePermission="purchase"><PurchaseInvoiceFormPage /></ProtectedRoute>} />
                        <Route path="/purchase/invoices/edit/:id" element={<ProtectedRoute requirePermission="purchase"><PurchaseInvoiceFormPage /></ProtectedRoute>} />
                        <Route path="/purchase/invoices/:id" element={<ProtectedRoute requirePermission="purchase"><PurchaseInvoiceDetailPage /></ProtectedRoute>} />
                        <Route path={PATHS.DOCUMENTS.SCAN_BILLS} element={<ProtectedRoute requirePermission="documents"><ScanBillsPage /></ProtectedRoute>} />
                        <Route path={PATHS.DOCUMENTS.MISSING} element={<ProtectedRoute requirePermission="documents"><MissingAttachmentsPage /></ProtectedRoute>} />
                        <Route path={PATHS.DOCUMENTS.MOBILE_SCAN} element={<ProtectedRoute requirePermission="documents"><MobileScanPage /></ProtectedRoute>} />
                        <Route path="/purchase/cash-book" element={<ProtectedRoute requirePermission="purchase"><CashBookPage /></ProtectedRoute>} />
                        <Route path="/purchase/bank-book" element={<ProtectedRoute requirePermission="purchase"><BankBookPage /></ProtectedRoute>} />
                        <Route path="/reports/purchase-comparison" element={<ProtectedRoute requirePermission="purchase"><PurchaseComparisonReportPage /></ProtectedRoute>} />
                        <Route path="/sales/orders" element={<ProtectedRoute requirePermission="sales"><SalesOrderListPage /></ProtectedRoute>} />
                        <Route path="/sales/orders/new" element={<ProtectedRoute requirePermission="sales"><SalesOrderFormPage /></ProtectedRoute>} />
                        <Route path="/sales/orders/:id/edit" element={<ProtectedRoute requirePermission="sales"><SalesOrderFormPage /></ProtectedRoute>} />
                        <Route path="/sales/orders/:id" element={<ProtectedRoute requirePermission="sales"><SalesOrderDetailPage /></ProtectedRoute>} />
                        <Route path="/sales/invoices" element={<ProtectedRoute requirePermission="sales"><SalesInvoiceListPage /></ProtectedRoute>} />
                        <Route path="/sales/invoices/new" element={<ProtectedRoute requirePermission="sales"><SalesInvoiceFormPage /></ProtectedRoute>} />
                        <Route path="/sales/invoices/:id" element={<ProtectedRoute requirePermission="sales"><SalesInvoiceDetailPage /></ProtectedRoute>} />
                        <Route path={PATHS.SALES.ESTIMATES} element={<ProtectedRoute requirePermission="sales"><SalesInvoiceListPage listMode="estimate" /></ProtectedRoute>} />
                        <Route path={PATHS.SALES.NEW_ESTIMATE} element={<ProtectedRoute requirePermission="sales"><SalesInvoiceFormPage listMode="estimate" /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.CREDIT_NOTES} element={<ProtectedRoute requirePermission="accounts.credit_notes.view || sales.sales_invoices.view"><CreditNoteListPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.DEBIT_NOTES} element={<ProtectedRoute requirePermission="accounts.debit_notes.view || sales.sales_invoices.view"><DebitNoteListPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.CREDIT_NOTE_DETAIL_PATTERN} element={<ProtectedRoute requirePermission="accounts.credit_notes.view || sales.sales_invoices.view"><CreditDebitNoteDetailPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.DEBIT_NOTE_DETAIL_PATTERN} element={<ProtectedRoute requirePermission="accounts.debit_notes.view || sales.sales_invoices.view"><CreditDebitNoteDetailPage /></ProtectedRoute>} />
                        
                        {/* New Routes for Form (Voucher Entry) */}
                        <Route path="/voucher-entry/credit-notes/new" element={<ProtectedRoute requirePermission="accounts.credit_notes.view || sales.sales_invoices.view"><CreditDebitNoteFormPage /></ProtectedRoute>} />
                        <Route path="/voucher-entry/debit-notes/new" element={<ProtectedRoute requirePermission="accounts.debit_notes.view || sales.sales_invoices.view"><CreditDebitNoteFormPage /></ProtectedRoute>} />
                        <Route path="/voucher-entry/credit-notes/edit/:id" element={<ProtectedRoute requirePermission="accounts.credit_notes.view || sales.sales_invoices.view"><CreditDebitNoteFormPage /></ProtectedRoute>} />
                        <Route path="/voucher-entry/debit-notes/edit/:id" element={<ProtectedRoute requirePermission="accounts.debit_notes.view || sales.sales_invoices.view"><CreditDebitNoteFormPage /></ProtectedRoute>} />

                        {/* Redirects for Credit/Debit Notes */}
                        <Route path="/sales/credit-notes" element={<Navigate to={PATHS.ACCOUNTS.CREDIT_NOTES} replace />} />
                        <Route path="/sales/debit-notes" element={<Navigate to={PATHS.ACCOUNTS.DEBIT_NOTES} replace />} />
                        <Route path="/sales/credit-notes/new" element={<Navigate to="/voucher-entry/credit-notes/new" replace />} />
                        <Route path="/sales/debit-notes/new" element={<Navigate to="/voucher-entry/debit-notes/new" replace />} />
                        <Route path="/sales/credit-notes/edit/:id" element={<Navigate to="/voucher-entry/credit-notes/edit/:id" replace />} />
                        <Route path="/sales/debit-notes/edit/:id" element={<Navigate to="/voucher-entry/debit-notes/edit/:id" replace />} />
                        
                        <Route path="/sales/credit-notes/:id" element={<ParamRedirect to="/voucher-entry/credit-notes" />} />
                        <Route path="/sales/debit-notes/:id" element={<ParamRedirect to="/voucher-entry/debit-notes" />} />
                        
                        {/* Keep old routes temporarily if redirecting logic is not enough, but redirect is better */}
                        <Route path="/sales/production-sheets/:id" element={<ProtectedRoute requirePermission="sales"><ProductionSheetPage /></ProtectedRoute>} />
                        <Route path={PATHS.SALES.INVOICE_SERIES} element={<ProtectedRoute requirePermission="sales.invoice_series.view"><InvoiceSeriesPage /></ProtectedRoute>} />
                        <Route path={PATHS.SALES.BULK_RENUMBER} element={<ProtectedRoute requireRole="admin"><BulkInvoiceRenumber /></ProtectedRoute>} />
                        <Route path={PATHS.EWAY_BILL.LIST} element={<ProtectedRoute requirePermission="sales"><FeatureGuard feature="gst.eWayBillRequired"><EwayBillListPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/eway-bills/draft/:id" element={<ProtectedRoute requirePermission="sales"><FeatureGuard feature="gst.eWayBillRequired"><EwayBillDraftPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.TRANSPORTERS.LIST} element={<ProtectedRoute requirePermission="sales"><TransporterListPage /></ProtectedRoute>} />

                        <Route path={PATHS.SALES.INVOICE_CLEANUP} element={<ProtectedRoute requireRole="admin"><InvoiceCleanupPage /></ProtectedRoute>} />
                        <Route path="/sales/invoice-resequence" element={<ProtectedRoute requireRole="admin"><ResequenceTool /></ProtectedRoute>} />
                        <Route path="/service/complaints" element={<ProtectedRoute requirePermission="service"><ComplaintListPage /></ProtectedRoute>} />
                        <Route path="/service/complaints/new" element={<ProtectedRoute requirePermission="service"><ComplaintFormPage /></ProtectedRoute>} />
                        <Route path="/service/complaints/:id/edit" element={<ProtectedRoute requirePermission="service"><ComplaintFormPage /></ProtectedRoute>} />
                        <Route path="/service/complaints/:id" element={<ProtectedRoute requirePermission="service"><ComplaintDetailPage /></ProtectedRoute>} />
                        <Route path="/service/replacement-dashboard" element={<ProtectedRoute requirePermission="service"><ReplacementDashboard /></ProtectedRoute>} />
                        <Route path="/service/replacement-dispatches/new" element={<ProtectedRoute requirePermission="service"><ReplacementDispatchFormPage /></ProtectedRoute>} />
                        <Route path="/service/replacement-dispatches/:id/print" element={<ProtectedRoute requirePermission="service"><ReplacementDispatchPrintPage /></ProtectedRoute>} />
                        <Route path="/service/faulty-receipts/new" element={<ProtectedRoute requirePermission="service"><FaultyReceiptFormPage /></ProtectedRoute>} />
                        <Route path="/service/repair-job-cards/new" element={<ProtectedRoute requirePermission="service"><RepairJobCardFormPage /></ProtectedRoute>} />
                        <Route path="/service/repaired-stock-inwards/new" element={<ProtectedRoute requirePermission="service"><RepairedStockInwardFormPage /></ProtectedRoute>} />
                        <Route path="/service/scrap-entries/new" element={<ProtectedRoute requirePermission="service"><ScrapEntryFormPage /></ProtectedRoute>} />
                        <Route path="/reports" element={<Navigate to="/reports/open-reminders" replace />} />
                        <Route path={PATHS.ACCOUNTS.BILL_WISE_ADJUSTMENT} element={<ProtectedRoute requirePermission="accounts"><BillWiseAdjustmentPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.BANK_RECONCILIATION} element={<ProtectedRoute requirePermission="accounts"><BankReconciliationPage /></ProtectedRoute>} />
                        <Route path="/accounts/receipt-entry" element={<ProtectedRoute requirePermission="accounts"><ReceiptEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/receipt-entry/edit/:id" element={<ProtectedRoute requirePermission="accounts"><ReceiptEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/payment-entry" element={<ProtectedRoute requirePermission="accounts"><PaymentEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/payment-entry/edit/:id" element={<ProtectedRoute requirePermission="accounts"><PaymentEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/expense-entry" element={<ProtectedRoute requirePermission="accounts"><ExpenseEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/expense-entry/edit/:id" element={<ProtectedRoute requirePermission="accounts"><ExpenseEntryPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.PETTY_CASH_ENTRY} element={<ProtectedRoute requirePermission="voucher_entry.petty_cash.view"><PettyCashEntryPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.PETTY_CASH_IMPORT} element={<ProtectedRoute requirePermission="voucher_entry.petty_cash.import"><PettyCashImportPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.PETTY_CASH_REPORTS} element={<ProtectedRoute requirePermission="voucher_entry.petty_cash.view"><PettyCashReportsPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.PETTY_CASH_SETTINGS} element={<ProtectedRoute requirePermission="voucher_entry.petty_cash.edit"><PettyCashSettingsPage /></ProtectedRoute>} />
                        <Route path={PATHS.DOCUMENTS.SMART_IMPORT_HUB} element={<ProtectedRoute requirePermission="import_utility.import_utility.view"><FeatureGuard feature="accounting.enableAiSmartImport"><SmartImportHubPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/documents/smart-import/batch/:importType" element={<ProtectedRoute requirePermission="import_utility.import_utility.upload"><FeatureGuard feature="accounting.enableAiSmartImport"><SmartImportBatchPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.DOCUMENTS.SCAN_ENTRY_DRAFTS} element={<ProtectedRoute requirePermission="scan_entry.scan_entry.view"><FeatureGuard feature="accounting.enableAiSmartImport"><ScanEntryDraftsPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/documents/scan-entry/review/:id" element={<ProtectedRoute requirePermission="scan_entry.scan_entry.review"><FeatureGuard feature="accounting.enableAiSmartImport"><ScanEntryReviewPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.DOCUMENTS.SCAN_ENTRY_BULK} element={<ProtectedRoute requirePermission="scan_entry.scan_entry.upload"><FeatureGuard feature="accounting.enableAiSmartImport"><BulkScanImportPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.DOCUMENTS.SCAN_ENTRY_REPORTS} element={<ProtectedRoute requirePermission="scan_entry.scan_entry.view"><FeatureGuard feature="accounting.enableAiSmartImport"><ScanEntryReportsPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.DOCUMENTS.SCAN_ENTRY_KEYWORDS} element={<ProtectedRoute requirePermission="scan_entry.scan_entry.review"><FeatureGuard feature="accounting.enableAiSmartImport"><ScanEntryKeywordSettingsPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path={PATHS.DATA_EXTRACTOR.ROOT} element={<ProtectedRoute requirePermission="data_extractor.extractor.view"><DataExtractorGuard><DataExtractorLayout /></DataExtractorGuard></ProtectedRoute>}>
                            <Route index element={<Navigate to={PATHS.DATA_EXTRACTOR.KEYWORD_SEARCH} replace />} />
                            <Route path="keyword-search" element={<ProtectedRoute requirePermission="data_extractor.extractor.search"><DataExtractorKeywordSearchPage /></ProtectedRoute>} />
                            <Route path="manual-url" element={<ProtectedRoute requirePermission="data_extractor.extractor.search"><DataExtractorManualUrlPage /></ProtectedRoute>} />
                            <Route path="import" element={<ProtectedRoute requirePermission="data_extractor.extractor.import"><DataExtractorImportPage /></ProtectedRoute>} />
                            <Route path="history" element={<ProtectedRoute requirePermission="data_extractor.extractor.view"><DataExtractorHistoryPage /></ProtectedRoute>} />
                            <Route path="leads" element={<ProtectedRoute requirePermission="data_extractor.extractor.view"><DataExtractorLeadsPage /></ProtectedRoute>} />
                        </Route>
                        <Route path="/data-extractor/preview/:jobId" element={<ProtectedRoute requirePermission="data_extractor.extractor.view"><DataExtractorGuard><DataExtractorPreviewPage /></DataExtractorGuard></ProtectedRoute>} />
                        <Route path={PATHS.DATA_EXTRACTOR.SETTINGS} element={<ProtectedRoute requirePermission="data_extractor.extractor.settings"><DataExtractorSettingsPage /></ProtectedRoute>} />
                        <Route path="/accounts/journal-entry" element={<ProtectedRoute requirePermission="accounts"><JournalEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/journal-entry/edit/:id" element={<ProtectedRoute requirePermission="accounts"><JournalEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/contra-entry" element={<ProtectedRoute requirePermission="accounts"><ContraEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/contra-entry/edit/:id" element={<ProtectedRoute requirePermission="accounts"><ContraEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/period-lock" element={<ProtectedRoute requirePermission="accounts"><PeriodLockPage /></ProtectedRoute>} />
                        <Route path="/accounts/accounting-audit" element={<ProtectedRoute requirePermission="accounts"><AccountingAuditPage /></ProtectedRoute>} />
                        <Route path="/accounts/vouchers" element={<ProtectedRoute requirePermission="accounts"><VoucherListPage /></ProtectedRoute>} />
                        <Route path="/accounts/masters/cash-bank" element={<ProtectedRoute requirePermission="accounts"><CashBankMasterPage /></ProtectedRoute>} />
                        {/* Account Master Routes */}
                        <Route path={PATHS.ACCOUNT_MASTER.GROUP_MASTER} element={<ProtectedRoute requirePermission="accounts"><GroupMasterPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNT_MASTER.LEDGER_MASTER} element={<ProtectedRoute requirePermission="accounts"><LedgerMasterPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNT_MASTER.FINANCIAL_YEAR} element={<ProtectedRoute requirePermission="accounts"><FinancialYearMasterPage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNT_MASTER.SERIES_MASTER} element={<ProtectedRoute requirePermission="accounts"><VoucherTypeMasterPage /></ProtectedRoute>} />

                        {/* Legacy Redirects for Account Master */}
                        <Route path="/accounts/masters/groups" element={<Navigate to={PATHS.ACCOUNT_MASTER.GROUP_MASTER} replace />} />
                        <Route path="/accounts/masters/ledgers" element={<Navigate to={PATHS.ACCOUNT_MASTER.LEDGER_MASTER} replace />} />
                        <Route path="/accounts/masters/voucher-types" element={<Navigate to={PATHS.ACCOUNT_MASTER.SERIES_MASTER} replace />} />
                        <Route path="/accounts/masters/financial-years" element={<Navigate to={PATHS.ACCOUNT_MASTER.FINANCIAL_YEAR} replace />} />

                        <Route path="/accounts/masters/cash-bank" element={<ProtectedRoute requirePermission="accounts"><CashBankMasterPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/ledger" element={<ProtectedRoute requirePermission="accounts"><LedgerReportPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/sales-register" element={<ProtectedRoute requirePermission="accounts"><SalesRegisterPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/purchase-register" element={<ProtectedRoute requirePermission="accounts"><PurchaseRegisterPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/expense-register" element={<ProtectedRoute requirePermission="accounts"><ExpenseRegisterPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/day-book" element={<ProtectedRoute requirePermission="accounts"><DayBookPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/cash-book" element={<ProtectedRoute requirePermission="accounts"><LedgerReportPage defaultType="Cash" /></ProtectedRoute>} />
                        <Route path="/accounts/reports/bank-book" element={<ProtectedRoute requirePermission="accounts"><LedgerReportPage defaultType="Bank" /></ProtectedRoute>} />
                        <Route path="/accounts/reports/outstanding" element={<ProtectedRoute requirePermission="accounts"><OutstandingReportPage /></ProtectedRoute>} />
                        <Route path="/accounts/interest-payable" element={<ProtectedRoute requirePermission="accounts"><InterestPayablePage /></ProtectedRoute>} />
                        <Route path="/tds" element={<Navigate to={PATHS.TDS.DASHBOARD} replace />} />
                        <Route path={PATHS.TDS.DASHBOARD} element={<ProtectedRoute requirePermission="tds.dashboard.view"><TdsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TDS.MASTER} element={<ProtectedRoute requirePermission="tds.master.view"><TdsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TDS.LEDGER_MAPPING} element={<ProtectedRoute requirePermission="tds.ledger_mapping.view"><TdsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TDS.DEDUCTIONS} element={<ProtectedRoute requirePermission="tds.deduction_register.view"><TdsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TDS.PAYABLE_REGISTER} element={<ProtectedRoute requirePermission="tds.payable_register.view"><TdsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TDS.CHALLANS} element={<ProtectedRoute requirePermission="tds.challan.view"><TdsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TDS.RETURNS} element={<ProtectedRoute requirePermission="tds.returns.view"><TdsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TDS.FORM16A} element={<ProtectedRoute requirePermission="tds.returns.view"><TdsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TDS.SETTINGS} element={<ProtectedRoute requirePermission="tds.settings.view"><TdsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TDS.REPORTS} element={<ProtectedRoute requirePermission="tds.reports.view"><TdsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.ACCOUNTS.TDS_COMPLIANCE} element={<Navigate to={PATHS.TDS.DASHBOARD} replace />} />
                        <Route path="/mis/dashboard" element={<ProtectedRoute requirePermission="mis.dashboard.view"><MISDashboard /></ProtectedRoute>} />
                        <Route path={PATHS.MIS.DIRECTOR_DASHBOARD} element={<ProtectedRoute requirePermission="mis.director_dashboard.view"><DirectorMisDashboard /></ProtectedRoute>} />
                        <Route path="/mis/sales-marketing" element={<ProtectedRoute requirePermission="mis.sales_marketing.view"><SalesMarketingDashboard /></ProtectedRoute>} />
                        <Route path="/mis/sales-conversion" element={<ProtectedRoute requirePermission="mis.sales_conversion.view"><SalesConversionDashboard /></ProtectedRoute>} />
                        <Route path="/mis/reports/profit-loss" element={<ProtectedRoute requirePermission="mis.profit_loss.view"><ProfitAndLossPage /></ProtectedRoute>} />
                        <Route path="/mis/reports/balance-sheet" element={<ProtectedRoute requirePermission="mis.balance_sheet.view"><BalanceSheetPage /></ProtectedRoute>} />
                        <Route path="/mis/reports/trial-balance" element={<ProtectedRoute requirePermission="mis.trial_balance.view"><TrialBalancePage /></ProtectedRoute>} />
                        <Route path={PATHS.FIXED_ASSETS.HOME} element={<ProtectedRoute><ModuleHomePage moduleName="Fixed Assets" title="Fixed Assets - Home" isStatic={true} /></ProtectedRoute>} />
                        <Route path={PATHS.FIXED_ASSETS.LIST} element={<ProtectedRoute requirePermission="accounts"><FixedAssetMasterPage /></ProtectedRoute>} />
                        <Route path={`${PATHS.FIXED_ASSETS.LIST}/:id`} element={<ProtectedRoute requirePermission="accounts"><AssetDetailPage /></ProtectedRoute>} />
                        <Route path={PATHS.FIXED_ASSETS.CATEGORIES} element={<ProtectedRoute requirePermission="accounts"><AssetCategoryPage /></ProtectedRoute>} />
                        <Route path={PATHS.FIXED_ASSETS.LOCATIONS} element={<ProtectedRoute requirePermission="accounts"><AssetLocationPage /></ProtectedRoute>} />

                        {/* Legacy Redirects for Fixed Assets */}
                        <Route path="/accounts/fixed-assets" element={<Navigate to={PATHS.FIXED_ASSETS.LIST} replace />} />
                        <Route path="/accounts/asset-categories" element={<Navigate to={PATHS.FIXED_ASSETS.CATEGORIES} replace />} />
                        <Route path="/accounts/asset-locations" element={<Navigate to={PATHS.FIXED_ASSETS.LOCATIONS} replace />} />
                        {/* ── New Accounting Modules ──────────────────────────────────────────── */}
                        <Route path={PATHS.COST_CENTERS.LIST} element={<ProtectedRoute requirePermission="accounts"><CostCentrePage /></ProtectedRoute>} />
                        <Route path={PATHS.COST_CENTERS.PL_REPORT} element={<ProtectedRoute requirePermission="accounts"><CostCentrePLPage /></ProtectedRoute>} />
                        <Route path={PATHS.BUDGETS.LIST} element={<ProtectedRoute requirePermission="accounts"><BudgetPage /></ProtectedRoute>} />
                        <Route path={PATHS.PDC.LIST} element={<ProtectedRoute requirePermission="accounts"><PDCRegisterPage /></ProtectedRoute>} />
                        <Route path={PATHS.NARRATION_TEMPLATES} element={<ProtectedRoute requirePermission="accounts"><NarrationTemplatesPage /></ProtectedRoute>} />
                        <Route path={PATHS.CASH_FLOW} element={<ProtectedRoute requirePermission="accounts"><CashFlowPage /></ProtectedRoute>} />
                        <Route path={PATHS.COMPARATIVE_PL} element={<ProtectedRoute requirePermission="accounts"><ComparativePLPage /></ProtectedRoute>} />
                        <Route path={PATHS.COMPARATIVE_BS} element={<ProtectedRoute requirePermission="accounts"><ComparativeBSPage /></ProtectedRoute>} />
                        <Route path={PATHS.AGEING} element={<ProtectedRoute requirePermission="accounts"><AgeingAnalysisPage /></ProtectedRoute>} />
                        <Route path={PATHS.MSME_REPORT} element={<ProtectedRoute requirePermission="accounts"><MsmeReportPage /></ProtectedRoute>} />
                        <Route path={PATHS.RATIO_ANALYSIS} element={<ProtectedRoute requirePermission="accounts"><RatioAnalysisPage /></ProtectedRoute>} />
                        <Route path={PATHS.FUND_FLOW} element={<ProtectedRoute requirePermission="accounts"><FundFlowPage /></ProtectedRoute>} />
                        <Route path={PATHS.TCS.DASHBOARD} element={<ProtectedRoute requirePermission="tds"><TcsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TCS.MASTER} element={<ProtectedRoute requirePermission="tds"><TcsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TCS.DEDUCTIONS} element={<ProtectedRoute requirePermission="tds"><TcsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TCS.CHALLANS} element={<ProtectedRoute requirePermission="tds"><TcsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.TCS.REPORTS} element={<ProtectedRoute requirePermission="tds"><TcsCompliancePage /></ProtectedRoute>} />
                        <Route path={PATHS.FORM_26AS.LIST} element={<ProtectedRoute requirePermission="tds"><Form26AsPage /></ProtectedRoute>} />
                        <Route path={PATHS.DEPRECIATION.ROOT} element={<ProtectedRoute requirePermission="accounts"><DepreciationPage /></ProtectedRoute>} />
                        <Route path={PATHS.DEPRECIATION.SCHEDULE} element={<ProtectedRoute requirePermission="accounts"><DepreciationSchedulePage /></ProtectedRoute>} />
                        <Route path={PATHS.EINVOICE} element={<Navigate to={PATHS.E_INVOICE.LIST} replace />} />
                        <Route path={PATHS.E_INVOICE.ROOT} element={<Navigate to={PATHS.E_INVOICE.LIST} replace />} />
                        {/* SaaS Super Admin Routes */}
                        <Route path={PATHS.SAAS_ADMIN.DASHBOARD} element={<ProtectedPlatformRoute><SaasAdminPage /></ProtectedPlatformRoute>} />
                        <Route path={PATHS.SAAS_ADMIN.COMPANIES} element={<ProtectedPlatformRoute><SaasAdminPage /></ProtectedPlatformRoute>} />
                        <Route path={PATHS.SAAS_ADMIN.SUBSCRIPTIONS} element={<ProtectedPlatformRoute><SaasAdminPage /></ProtectedPlatformRoute>} />
                        <Route path={PATHS.SAAS_ADMIN.ACTIVITY_LOGS} element={<ProtectedPlatformRoute><SaasAdminPage /></ProtectedPlatformRoute>} />
                        <Route path="prd/dashboard" element={<ProtectedRoute requirePermission="prd"><PrdDashboard /></ProtectedRoute>} />
                        <Route path="/prd/projects" element={<ProtectedRoute requirePermission="prd"><PrdProjectListPage /></ProtectedRoute>} />
                        <Route path="/prd/projects/:id" element={<ProtectedRoute requirePermission="prd"><PrdProjectDetailPage /></ProtectedRoute>} />
                        <Route path="/prd/test-parameters" element={<ProtectedRoute requirePermission="prd"><PrdTestParameterMasterPage /></ProtectedRoute>} />
                        <Route path="/hr/dashboard" element={<ProtectedRoute requirePermission="hr"><HRDashboard /></ProtectedRoute>} />
                        <Route path="/hr/employees" element={<ProtectedRoute requirePermission="hr"><EmployeeList /></ProtectedRoute>} />
                        <Route path="/hr/employees/new" element={<ProtectedRoute requirePermission="hr"><EmployeeForm /></ProtectedRoute>} />
                        <Route path="/hr/employees/:id" element={<ProtectedRoute requirePermission="hr"><EmployeeForm /></ProtectedRoute>} />
                        <Route path="/hr/shifts" element={<ProtectedRoute requirePermission="hr"><ShiftList /></ProtectedRoute>} />
                        <Route path="/hr/attendance" element={<ProtectedRoute requirePermission="hr"><AttendancePage /></ProtectedRoute>} />
                        <Route path="/hr/attendance/import" element={<ProtectedRoute requirePermission="hr"><AttendanceImportPage /></ProtectedRoute>} />
                        <Route path="/hr/leaves" element={<ProtectedRoute requirePermission="hr"><LeaveManagementPage /></ProtectedRoute>} />
                        <Route path="/hr/payroll" element={<ProtectedRoute requirePermission="hr"><PayrollPage /></ProtectedRoute>} />
                        <Route path="/hr/holidays" element={<ProtectedRoute requirePermission="hr"><HolidayListPage /></ProtectedRoute>} />
                        <Route path="/hr/reports" element={<ProtectedRoute requirePermission="hr"><HRReportsPage /></ProtectedRoute>} />
                        <Route path="/hr/settings" element={<ProtectedRoute requirePermission="hr"><HRSettingsPage /></ProtectedRoute>} />
                        <Route path="/hr/reports/daily" element={<ProtectedRoute requirePermission="hr"><DailyAttendanceReport /></ProtectedRoute>} />
                        <Route path="/hr/reports/monthly-summary" element={<ProtectedRoute requirePermission="hr"><MonthlySummaryReport /></ProtectedRoute>} />
                        <Route path="/hr/reports/late-coming" element={<ProtectedRoute requirePermission="hr"><LateComingReport /></ProtectedRoute>} />
                        <Route path="/hr/reports/missing-punch" element={<ProtectedRoute requirePermission="hr"><MissingPunchReport /></ProtectedRoute>} />
                        <Route path="/hr/reports/salary-working" element={<ProtectedRoute requirePermission="hr"><SalaryWorkingReport /></ProtectedRoute>} />
                        
                        {/* R&D Samples Module */}
                        <Route path="/rd-samples/projects" element={<ProtectedRoute requirePermission="rd_samples.projects.view"><RdProjectListPage /></ProtectedRoute>} />
                        <Route path="/rd-samples/samples" element={<ProtectedRoute requirePermission="rd_samples.samples.view"><RdSampleListPage /></ProtectedRoute>} />
                        <Route path="/rd-samples/comparison" element={<ProtectedRoute requirePermission="rd_samples.samples.compare"><RdComparisonPage /></ProtectedRoute>} />

                        {/* WeChat Module */}
                        <Route path="/wechat/contacts" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatListPage /></ProtectedRoute>} />
                        <Route path="/wechat/groups/new" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatGroupCreatePage /></ProtectedRoute>} />
                        <Route path="/wechat/groups/edit/:groupId" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatGroupCreatePage /></ProtectedRoute>} />

                        {/* China Supplier / WeChat Contacts Module */}
                        <Route path="/china-supplier" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatListPage /></ProtectedRoute>} />
                        <Route path="/china-supplier/dashboard" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatListPage /></ProtectedRoute>} />
                        <Route path="/china-supplier/products" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatListPage /></ProtectedRoute>} />
                        <Route path="/china-supplier/contacts" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatListPage /></ProtectedRoute>} />
                        <Route path="/china-supplier/groups" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatListPage /></ProtectedRoute>} />
                        <Route path="/china-supplier/groups/new" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatGroupCreatePage /></ProtectedRoute>} />
                        <Route path="/china-supplier/groups/edit/:groupId" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatGroupCreatePage /></ProtectedRoute>} />
                        <Route path="/china-supplier/prices" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatListPage /></ProtectedRoute>} />
                        <Route path="/china-supplier/samples" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatListPage /></ProtectedRoute>} />
                        <Route path="/china-supplier/reports" element={<ProtectedRoute requirePermission="wechat.contacts.view"><WechatListPage /></ProtectedRoute>} />

                        <Route path="/inventory/stock/raw-material" element={<ProtectedRoute requirePermission="inventory"><RawMaterialStockReport /></ProtectedRoute>} />
                        <Route path="/inventory/stock/ageing" element={<ProtectedRoute requirePermission="inventory"><RawMaterialStockReport showAgeing={true} /></ProtectedRoute>} />
                        <Route path="/mis/reports/customer-gp" element={<ProtectedRoute requirePermission="mis.product_gp_analysis.view"><CustomerAnalysisTab /></ProtectedRoute>} />
                        <Route path="/reports/replacement-cost" element={<ProtectedRoute requirePermission="reports"><ConsumableCostReport /></ProtectedRoute>} />


                        <Route path="/inventory/stock/finished-goods" element={<ProtectedRoute requirePermission="inventory"><FinishedGoodsStockReport /></ProtectedRoute>} />
                        <Route path="/inventory/stock/ledger" element={<ProtectedRoute requirePermission="inventory"><StockMovementLedger /></ProtectedRoute>} />
                        <Route path="/production/outputs" element={<ProtectedRoute requirePermission="production"><ProductionOutputFormPage /></ProtectedRoute>} />
                        <Route path="/production/conversion/new" element={<ProtectedRoute requirePermission="production"><ProductConversionFormPage /></ProtectedRoute>} />
                        <Route path="/production/component-replacements/new" element={<ProtectedRoute requirePermission="production"><ComponentReplacementFormPage /></ProtectedRoute>} />
                        <Route path="/production/component-replacements" element={<ProtectedRoute requirePermission="production"><ComponentReplacementFormPage /></ProtectedRoute>} />
                        <Route path="/production/rejections/new" element={<ProtectedRoute requirePermission="production"><ProductionRejectionFormPage /></ProtectedRoute>} />
                        <Route path="/production/rejections" element={<ProtectedRoute requirePermission="production"><ProductionRejectionFormPage /></ProtectedRoute>} />

                        {/* Optional Kanban / Workflow layer (each route gated by its own workflow.* flag; flags default OFF) */}
                        <Route path="/crm/kanban/sales-inquiry" element={<ProtectedRoute requirePermission="customers"><FeatureGuard feature="workflow.salesInquiryKanbanEnabled"><SalesInquiryKanbanPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/kanban/tasks" element={<ProtectedRoute requirePermission="tasks"><FeatureGuard feature="workflow.taskKanbanEnabled"><TaskKanbanPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/kanban/purchase-rfq" element={<ProtectedRoute requirePermission="purchase"><FeatureGuard feature="workflow.purchaseRfqKanbanEnabled"><PurchaseKanbanPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/kanban/production" element={<ProtectedRoute requirePermission="production"><FeatureGuard feature="workflow.productionKanbanEnabled"><ProductionKanbanPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/kanban/dispatch" element={<ProtectedRoute requirePermission="sales"><FeatureGuard feature="workflow.dispatchKanbanEnabled"><DispatchKanbanPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/kanban/gst-tds" element={<ProtectedRoute requirePermission="gst"><FeatureGuard feature="workflow.gstTdsKanbanEnabled"><GstTdsKanbanPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/kanban/complaints" element={<ProtectedRoute requirePermission="service"><FeatureGuard feature="workflow.complaintKanbanEnabled"><ComplaintKanbanPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/crm/kanban/apk" element={<ProtectedRoute requirePermission="customers"><FeatureGuard feature="workflow.apkKanbanEnabled"><ApkKanbanPage /></FeatureGuard></ProtectedRoute>} />

                        {/* Optional per-user UI customization (gated by ui.advancedCustomizationEnabled; defaults OFF) */}
                        <Route path="/profile/ui-preferences" element={<ProtectedRoute><UiPreferencesPage /></ProtectedRoute>} />
                    </Routes>
                    </ErrorBoundary>
                </main>
            </div>
        </div>
    );
};

export default App;

