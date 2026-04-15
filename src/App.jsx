import { useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { useForm } from 'react-hook-form';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Button, Input, Select, ModalProvider, useModal } from '@/components/ui';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { CustomerList } from '@/features/customers/components';
import { AddCustomerPage } from '@/features/customers/components/AddCustomerPage';
import { FollowUpForm, FollowupDashboard } from '@/features/followup/components';
import { TalkWithCustomerForm } from '@/features/conversations/components/TalkWithCustomerForm';
import { UserManagement } from '@/features/users/UserManagement';
import { LoginPage } from '@/features/auth/LoginPage';
import CompanyProfilePage from '@/features/settings/CompanyProfilePage';
import WhatsAppSettingsPage from '@/features/settings/WhatsAppSettingsPage';
import { CustomerMasterReport } from '@/features/reports/CustomerMasterReport';
import { FollowUpTrackerReport } from '@/features/reports/FollowUpTrackerReport';
import ReminderReport from '@/features/reports/ReminderReport';
import OpenRemindersReport from '@/features/reports/OpenRemindersReport';
import ConversationHistoryReport from '@/features/reports/ConversationHistoryReport';
import FollowupDashboardReport from '@/features/reports/FollowupDashboardReport';
import FollowupTaskReport from '@/features/reports/FollowupTaskReport';
import TaskReminderReport from '@/features/reports/TaskReminderReport';
import TaskChatDashboard from '@/features/taskChats/TaskChatDashboard';
import { RemindersDashboard } from '@/features/reminders/RemindersDashboard';
import { TaskList } from '@/features/tasks/components/TaskList';
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
import SupplierListPage from '@/features/purchase/SupplierListPage';
import PurchaseOrderListPage from '@/features/purchase/PurchaseOrderListPage';
import PurchaseOrderFormPage from '@/features/purchase/PurchaseOrderFormPage';
import PurchaseOrderDetailPage from '@/features/purchase/PurchaseOrderDetailPage';
import PurchaseInvoiceListPage from '@/features/purchase/PurchaseInvoiceListPage';
import PurchaseInvoiceFormPage from '@/features/purchase/PurchaseInvoiceFormPage';
import PurchaseInvoiceDetailPage from '@/features/purchase/PurchaseInvoiceDetailPage';
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
import ProductionSheetPage from '@/features/sales/ProductionSheetPage';
import InvoiceSeriesPage from '@/features/sales/InvoiceSeriesPage';
import InvoiceCleanupPage from '@/features/sales/InvoiceCleanupPage';
import ResequenceTool from '@/features/sales/ResequenceTool';
import BulkInvoiceRenumber from '@/features/sales/BulkInvoiceRenumber';
import EwayBillListPage from '@/features/eway-bill/EwayBillListPage';
import EwayBillDraftPage from '@/features/eway-bill/EwayBillDraftPage';
import TransporterListPage from '@/features/transporters/TransporterListPage';
import DiagnosticDashboard from '@/features/admin/diagnostics/DiagnosticDashboard';



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
const VoucherListPage = lazy(() => import('./features/accounts/VoucherListPage'));
const CashBankMasterPage = lazy(() => import('./features/accounts/CashBankMasterPage'));
const GroupMasterPage = lazy(() => import('./features/accounts/GroupMasterPage'));
const LedgerMasterPage = lazy(() => import('./features/accounts/LedgerMasterPage'));
const VoucherTypeMasterPage = lazy(() => import('./features/accounts/VoucherTypeMasterPage'));
const SalesRegisterPage = lazy(() => import('./features/accounts/SalesRegisterPage'));
const PurchaseRegisterPage = lazy(() => import('./features/accounts/PurchaseRegisterPage'));
const FinancialYearMasterPage = lazy(() => import('./features/accounts/FinancialYearMasterPage.jsx'));
const DayBookPage = lazy(() => import('./features/accounts/DayBookPage'));
const LedgerReportPage = lazy(() => import('./features/accounts/LedgerReportPage'));
const OutstandingReportPage = lazy(() => import('./features/accounts/OutstandingReportPage'));
const TrialBalancePage = lazy(() => import('./features/mis/TrialBalancePage'));
const ProfitAndLossPage = lazy(() => import('./features/mis/ProfitAndLossPage'));
const BalanceSheetPage = lazy(() => import('./features/mis/BalanceSheetPage'));
const MISDashboard = lazy(() => import('./features/mis/MISDashboard'));
const SalesMarketingDashboard = lazy(() => import('./features/mis/SalesMarketingDashboard'));
const SalesConversionDashboard = lazy(() => import('./features/mis/SalesConversionDashboard'));
const AssetCategoryPage = lazy(() => import('./features/fixedAssets/AssetCategoryPage'));
import AssetLocationPage from '@/features/fixedAssets/AssetLocationPage';
import FixedAssetMasterPage from '@/features/fixedAssets/FixedAssetMasterPage';
import AssetDetailPage from '@/features/fixedAssets/AssetDetailPage';

// Production Rework Module
import ProductionReworkDashboard from '@/features/productionRework/ProductionReworkDashboard';
import ProductionFailureListPage from '@/features/productionRework/ProductionFailureListPage';
import ProductionFailureFormPage from '@/features/productionRework/ProductionFailureFormPage';
import ReworkJobCardListPage from '@/features/productionRework/ReworkJobCardListPage';
import ReworkJobCardListPage_fixed from '@/features/productionRework/ReworkJobCardListPage';
import ReworkJobCardFormPage from '@/features/productionRework/ReworkJobCardFormPage';
import ReworkMaterialIssueFormPage from '@/features/productionRework/ReworkMaterialIssueFormPage';
import ReworkOutputFormPage from '@/features/productionRework/ReworkOutputFormPage';
import RetestConfirmationFormPage from '@/features/productionRework/RetestConfirmationFormPage';
import ProductionScrapFormPage from '@/features/productionRework/ProductionScrapFormPage';

// Stock & Production Entry Module
import RawMaterialStockReport from '@/features/inventory/RawMaterialStockReport';
import FinishedGoodsStockReport from '@/features/inventory/FinishedGoodsStockReport';
import StockMovementLedger from '@/features/inventory/StockMovementLedger';
import ProductionOutputFormPage from '@/features/production/ProductionOutputFormPage';
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

// WeChat Module
const WechatListPage = lazy(() => import('./features/wechat/pages/WechatListPage'));

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

import { AuthProvider } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { MessengerProvider } from '@/contexts/MessengerContext';
import { FinancialYearProvider, useFinancialYear } from '@/contexts/FinancialYearContext';
import { LiveNotificationProvider } from '@/components/ui/LiveNotificationPopup';


import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ToastProvider } from '@/components/ui/Toast';
import './styles/main.scss';

import { Toaster } from 'react-hot-toast';

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <FinancialYearProvider>
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
                                    <Suspense fallback={<div className="flex items-center justify-center h-screen font-bold text-gray-400">Loading Module...</div>}>
                                        <Routes>
                                            {/* Public routes - Login, Forgot Password, Reset Password */}
                                            <Route path="/login" element={<LoginPage />} />
                                            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                                            <Route path="/reset-password" element={<ResetPasswordPage />} />

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
                                                    <ErrorBoundary>
                                                        <AppLayout />
                                                    </ErrorBoundary>
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
                </FinancialYearProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

// Separate layout component to handle route-specific logic
const AppLayout = () => {
    const { selectedFY } = useFinancialYear();

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            <Sidebar />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <Header />
                <main 
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
                            <Route path="/" element={<Navigate to="/tasks/list" replace />} />
                        <Route path="/customers" element={<ProtectedRoute requirePermission="view_customers"><CustomerList /></ProtectedRoute>} />
                        <Route path="/customers/list" element={<ProtectedRoute requirePermission="view_customers"><CustomerList /></ProtectedRoute>} />
                        <Route path="/followups" element={<ProtectedRoute requirePermission="customers"><FollowupDashboard /></ProtectedRoute>} />
                        <Route path="/followup/:customerId" element={<ProtectedRoute requirePermission="customers"><FollowUpForm /></ProtectedRoute>} />
                        <Route path="/talk/:customerId" element={<ProtectedRoute requirePermission="customers"><TalkWithCustomerForm /></ProtectedRoute>} />
                        <Route path="/followup" element={<Navigate to="/customers/list" replace />} />
                        <Route path="/talk" element={<Navigate to="/customers/list" replace />} />
                        <Route path="/admin/users" element={<ProtectedRoute requireRole="admin"><UserManagement /></ProtectedRoute>} />
                        <Route path="/admin/diagnostics" element={<ProtectedRoute requireRole="admin"><DiagnosticDashboard /></ProtectedRoute>} />

                        <Route path="/company-profile" element={<ProtectedRoute requirePermission="admin.company_profile.view"><CompanyProfilePage /></ProtectedRoute>} />
                        <Route path="/settings/whatsapp" element={<ProtectedRoute requirePermission="admin.whatsapp_settings.view"><WhatsAppSettingsPage /></ProtectedRoute>} />
                        <Route path="/reports/customer-master" element={<ProtectedRoute requirePermission="reports.customer_master_report.view"><CustomerMasterReport /></ProtectedRoute>} />
                        <Route path="/reports/followups" element={<ProtectedRoute requirePermission="reports.followup_report.view"><FollowUpTrackerReport /></ProtectedRoute>} />
                        <Route path="/reports/reminders" element={<ProtectedRoute requirePermission="reports"><ReminderReport /></ProtectedRoute>} />
                        <Route path="/reports/open-reminders" element={<ProtectedRoute requirePermission="reports.reminder_report.view"><OpenRemindersReport /></ProtectedRoute>} />
                        <Route path="/reports/conversation-history" element={<ProtectedRoute requirePermission="reports"><ConversationHistoryReport /></ProtectedRoute>} />
                        <Route path="/reports/followup-dashboard" element={<ProtectedRoute requirePermission="reports.followup_report.view"><FollowupDashboardReport /></ProtectedRoute>} />
                        <Route path="/reports/followup-task-report" element={<ProtectedRoute requirePermission="reports.followup_report.view"><FollowupTaskReport /></ProtectedRoute>} />
                        <Route path="/reports/task-reminders" element={<ProtectedRoute requirePermission="tasks"><TaskReminderReport /></ProtectedRoute>} />
                        <Route path="/task-chats" element={<ProtectedRoute requirePermission="tasks"><TaskChatDashboard /></ProtectedRoute>} />
                        <Route path="/task-chats/:taskId" element={<ProtectedRoute requirePermission="tasks"><TaskChatDashboard /></ProtectedRoute>} />
                        <Route path="/reminders" element={<ProtectedRoute requirePermission="customers"><RemindersDashboard /></ProtectedRoute>} />
                        <Route path="/tasks/create" element={<ProtectedRoute requirePermission="tasks"><TaskCreatePage /></ProtectedRoute>} />
                        <Route path="/tasks/edit/:id" element={<ProtectedRoute requirePermission="tasks"><TaskEditPage /></ProtectedRoute>} />
                        <Route path="/tasks/list" element={<ProtectedRoute requirePermission="tasks"><ManageTasksPage /></ProtectedRoute>} />
                        <Route path="/tasks/groups" element={<ProtectedRoute requirePermission="tasks"><TaskGroupList /></ProtectedRoute>} />
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
                        <Route path="/production/planning" element={<ProtectedRoute requirePermission="production.production_planning.view"><ProductionPlanningListPage /></ProtectedRoute>} />
                        <Route path="/production/planning/new" element={<ProtectedRoute requirePermission="production.production_planning.add"><ProductionPlanningFormPage /></ProtectedRoute>} />
                        <Route path="/production/planning/:id" element={<ProtectedRoute requirePermission="production.production_planning.view"><ProductionPlanningFormPage /></ProtectedRoute>} />
                        <Route path="/purchase/suppliers" element={<ProtectedRoute requirePermission="purchase"><SupplierListPage /></ProtectedRoute>} />
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
                        <Route path="/sales/production-sheets/:id" element={<ProtectedRoute requirePermission="sales"><ProductionSheetPage /></ProtectedRoute>} />
                        <Route path={PATHS.SALES.INVOICE_SERIES} element={<ProtectedRoute requirePermission="sales.invoice_series.view"><InvoiceSeriesPage /></ProtectedRoute>} />
                        <Route path={PATHS.SALES.BULK_RENUMBER} element={<ProtectedRoute requireRole="admin"><BulkInvoiceRenumber /></ProtectedRoute>} />
                        <Route path={PATHS.EWAY_BILL.LIST} element={<ProtectedRoute requirePermission="sales"><EwayBillListPage /></ProtectedRoute>} />
                        <Route path="/eway-bills/draft/:id" element={<ProtectedRoute requirePermission="sales"><EwayBillDraftPage /></ProtectedRoute>} />
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
                        <Route path="/production/rework/dashboard" element={<ProtectedRoute requirePermission="production"><ProductionReworkDashboard /></ProtectedRoute>} />
                        <Route path="/production/rework/failures" element={<ProtectedRoute requirePermission="production"><ProductionFailureListPage /></ProtectedRoute>} />
                        <Route path="/production/rework/failures/new" element={<ProtectedRoute requirePermission="production"><ProductionFailureFormPage /></ProtectedRoute>} />
                        <Route path="/production/rework/failures/:id" element={<ProtectedRoute requirePermission="production"><ProductionFailureListPage /></ProtectedRoute>} />
                        <Route path="/production/rework/job-cards" element={<ProtectedRoute requirePermission="production"><ReworkJobCardListPage /></ProtectedRoute>} />
                        <Route path="/production/rework/job-cards/new" element={<ProtectedRoute requirePermission="production"><ReworkJobCardFormPage /></ProtectedRoute>} />
                        <Route path="/production/rework/material-issues/new" element={<ProtectedRoute requirePermission="production"><ReworkMaterialIssueFormPage /></ProtectedRoute>} />
                        <Route path="/production/rework/outputs/new" element={<ProtectedRoute requirePermission="production"><ReworkOutputFormPage /></ProtectedRoute>} />
                        <Route path="/production/rework/retests/new" element={<ProtectedRoute requirePermission="production"><RetestConfirmationFormPage /></ProtectedRoute>} />
                        <Route path="/production/rework/scraps/new" element={<ProtectedRoute requirePermission="production"><ProductionScrapFormPage /></ProtectedRoute>} />
                        <Route path="/reports" element={<Navigate to="/reports/open-reminders" replace />} />
                        <Route path="/accounts/receipt-entry" element={<ProtectedRoute requirePermission="accounts"><ReceiptEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/payment-entry" element={<ProtectedRoute requirePermission="accounts"><PaymentEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/expense-entry" element={<ProtectedRoute requirePermission="accounts"><ExpenseEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/journal-entry" element={<ProtectedRoute requirePermission="accounts"><JournalEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/vouchers" element={<ProtectedRoute requirePermission="accounts"><VoucherListPage /></ProtectedRoute>} />
                        <Route path="/accounts/masters/cash-bank" element={<ProtectedRoute requirePermission="accounts"><CashBankMasterPage /></ProtectedRoute>} />
                        <Route path="/accounts/masters/groups" element={<ProtectedRoute requirePermission="accounts"><GroupMasterPage /></ProtectedRoute>} />
                        <Route path="/accounts/masters/ledgers" element={<ProtectedRoute requirePermission="accounts"><LedgerMasterPage /></ProtectedRoute>} />
                        <Route path="/accounts/masters/voucher-types" element={<ProtectedRoute requirePermission="accounts"><VoucherTypeMasterPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/ledger" element={<ProtectedRoute requirePermission="accounts"><LedgerReportPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/sales-register" element={<ProtectedRoute requirePermission="accounts"><SalesRegisterPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/purchase-register" element={<ProtectedRoute requirePermission="accounts"><PurchaseRegisterPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/day-book" element={<ProtectedRoute requirePermission="accounts"><DayBookPage /></ProtectedRoute>} />
                        <Route path="/accounts/reports/cash-book" element={<ProtectedRoute requirePermission="accounts"><LedgerReportPage defaultType="Cash" /></ProtectedRoute>} />
                        <Route path="/accounts/reports/bank-book" element={<ProtectedRoute requirePermission="accounts"><LedgerReportPage defaultType="Bank" /></ProtectedRoute>} />
                        <Route path="/accounts/reports/outstanding" element={<ProtectedRoute requirePermission="accounts"><OutstandingReportPage /></ProtectedRoute>} />
                        <Route path="/mis/dashboard" element={<ProtectedRoute requirePermission="accounts"><MISDashboard /></ProtectedRoute>} />
                        <Route path="/mis/sales-marketing" element={<ProtectedRoute requirePermission="accounts"><SalesMarketingDashboard /></ProtectedRoute>} />
                        <Route path="/mis/sales-conversion" element={<ProtectedRoute requirePermission="reports"><SalesConversionDashboard /></ProtectedRoute>} />
                        <Route path="/mis/reports/profit-loss" element={<ProtectedRoute requirePermission="accounts"><ProfitAndLossPage /></ProtectedRoute>} />
                        <Route path="/mis/reports/balance-sheet" element={<ProtectedRoute requirePermission="accounts"><BalanceSheetPage /></ProtectedRoute>} />
                        <Route path="/mis/reports/trial-balance" element={<ProtectedRoute requirePermission="accounts"><TrialBalancePage /></ProtectedRoute>} />
                        <Route path="/accounts/masters/financial-years" element={<ProtectedRoute requirePermission="accounts"><FinancialYearMasterPage /></ProtectedRoute>} />
                        <Route path="/accounts/fixed-assets" element={<ProtectedRoute requirePermission="accounts"><FixedAssetMasterPage /></ProtectedRoute>} />
                        <Route path="/accounts/fixed-assets/:id" element={<ProtectedRoute requirePermission="accounts"><AssetDetailPage /></ProtectedRoute>} />
                        <Route path="/accounts/asset-categories" element={<ProtectedRoute requirePermission="accounts"><AssetCategoryPage /></ProtectedRoute>} />
                        <Route path="/accounts/asset-locations" element={<ProtectedRoute requirePermission="accounts"><AssetLocationPage /></ProtectedRoute>} />
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

                        <Route path="/inventory/stock/raw-material" element={<ProtectedRoute requirePermission="inventory"><RawMaterialStockReport /></ProtectedRoute>} />


                        <Route path="/inventory/stock/finished-goods" element={<ProtectedRoute requirePermission="inventory"><FinishedGoodsStockReport /></ProtectedRoute>} />
                        <Route path="/inventory/stock/ledger" element={<ProtectedRoute requirePermission="inventory"><StockMovementLedger /></ProtectedRoute>} />
                        <Route path="/production/outputs/new" element={<ProtectedRoute requirePermission="production"><ProductionOutputFormPage /></ProtectedRoute>} />
                        <Route path="/production/outputs" element={<ProtectedRoute requirePermission="production"><ProductionOutputFormPage /></ProtectedRoute>} />
                        <Route path="/production/component-replacements/new" element={<ProtectedRoute requirePermission="production"><ComponentReplacementFormPage /></ProtectedRoute>} />
                        <Route path="/production/component-replacements" element={<ProtectedRoute requirePermission="production"><ComponentReplacementFormPage /></ProtectedRoute>} />
                        <Route path="/production/rejections/new" element={<ProtectedRoute requirePermission="production"><ProductionRejectionFormPage /></ProtectedRoute>} />
                        <Route path="/production/rejections" element={<ProtectedRoute requirePermission="production"><ProductionRejectionFormPage /></ProtectedRoute>} />
                    </Routes>
                    </ErrorBoundary>
                </main>
            </div>
        </div>
    );
};

export default App;
