// Version: 1.0.9 - Deploy: 2026-04-25T15:48:00Z
import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { useForm } from 'react-hook-form';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
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
import WhatsAppSettingsPage from '@/features/settings/WhatsAppSettingsPage';
import { CustomerMasterReport } from '@/features/reports/CustomerMasterReport';
import { FollowUpTrackerReport } from '@/features/reports/FollowUpTrackerReport';
import ReminderReport from '@/features/reports/ReminderReport';
import OpenRemindersReport from '@/features/reports/OpenRemindersReport';
import ConversationHistoryReport from '@/features/reports/ConversationHistoryReport';
import FollowupDashboardReport from '@/features/reports/FollowupDashboardReport';
import FollowupTaskReport from '@/features/reports/FollowupTaskReport';
import TaskReminderReport from '@/features/reports/TaskReminderReport';
import ConsumableCostReport from '@/features/reports/ConsumableCostReport';
import ProductGpReport from '@/features/reports/ProductGpReport';
const ReplacementReport = lazy(() => import('@/features/reports/ReplacementReport'));
const SampleConversionReport = lazy(() => import('@/features/reports/SampleConversionReport'));
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
import CreditNoteListPage from '@/features/sales/pages/CreditNoteListPage';
import DebitNoteListPage from '@/features/sales/pages/DebitNoteListPage';
import CreditDebitNoteFormPage from '@/features/sales/pages/CreditDebitNoteFormPage';
import CreditDebitNoteDetailPage from '@/features/sales/pages/CreditDebitNoteDetailPage';
import EwayBillListPage from '@/features/eway-bill/EwayBillListPage';
import EwayBillDraftPage from '@/features/eway-bill/EwayBillDraftPage';
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
import GstReconciliationPage from '@/features/gst-reconciliation/GstReconciliationPage';
import ItcRegisterPage from '@/features/reports/gst/ItcRegisterPage';
import GstPayableSummary from '@/features/reports/gst/GstPayableSummary';
import HsnSummaryPage from '@/features/reports/gst/HsnSummaryPage';
import GstLedgerPage from '@/features/reports/gst/GstLedgerPage';

import { AuthProvider } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { MessengerProvider } from '@/contexts/MessengerContext';
import { FinancialYearProvider, useFinancialYear } from '@/contexts/FinancialYearContext';
import { LiveNotificationProvider } from '@/components/ui/LiveNotificationPopup';


import { useAuth } from '@/hooks/useAuth';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ToastProvider } from '@/components/ui/Toast';
import './styles/main.scss';
import { BrandedSplashScreen, BrandedModuleLoader, BrandedLoader } from '@/components/ui/BrandedLoading';

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
    const [showSplash, setShowSplash] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setShowSplash(false);
        }, 2000);
        return () => clearTimeout(timer);
    }, []);

    if (showSplash) {
        return <BrandedSplashScreen />;
    }

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
                                <BrandedModuleLoader />
                                <ModalProvider>
                                    <Suspense fallback={<BrandedLoader size={120} />}>
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
                </FinancialYearProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

// Separate layout component to handle route-specific logic
const AppLayout = () => {
    const { user } = useAuth();
    const { selectedFY } = useFinancialYear();
    const { isCollapsed, isHoverOpen } = useSidebar();

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
            { path: '/tasks/list', title: 'Manage Tasks', id: 'manage-tasks', icon: 'tasks' },
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
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            <Sidebar />
            <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                flex: 1, 
                minWidth: 0,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
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
                        <Route path="/tasks/home" element={<ProtectedRoute><ModuleHomePage moduleName="Task Management" title="Task Management - Home" isStatic={true} /></ProtectedRoute>} />
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
                        <Route path="/admin/diagnostics" element={<ProtectedRoute requireRole="admin"><DiagnosticDashboard /></ProtectedRoute>} />
                        <Route path="/admin/ledger-linking" element={<ProtectedRoute requirePermission="admin.ledger_linking.view"><AutoLinkLedgers /></ProtectedRoute>} />
                        <Route path="/admin/backups" element={<ProtectedRoute requireRole="admin"><BackupRestorePage /></ProtectedRoute>} />

                        <Route path="/company-profile" element={<ProtectedRoute requirePermission="admin.company_profile.view"><CompanyProfilePage /></ProtectedRoute>} />
                        <Route path="/whatsapp" element={<ProtectedRoute requirePermission="whatsapp.whatsapp_settings.view"><WhatsAppSettingsPage /></ProtectedRoute>} />
                        {/* Legacy redirect for old URL */}
                        <Route path="/settings/whatsapp" element={<Navigate to="/whatsapp" replace />} />
                        <Route path="/reports/customer-master" element={<ProtectedRoute requirePermission="reports.customer_master_report.view"><CustomerMasterReport /></ProtectedRoute>} />
                        <Route path="/reports/followups" element={<ProtectedRoute requirePermission="reports.followup_report.view"><FollowUpTrackerReport /></ProtectedRoute>} />
                        <Route path="/reports/reminders" element={<ProtectedRoute requirePermission="reports"><ReminderReport /></ProtectedRoute>} />
                        <Route path="/reports/open-reminders" element={<ProtectedRoute requirePermission="reports.reminder_report.view"><OpenRemindersReport /></ProtectedRoute>} />
                        <Route path="/reports/conversation-history" element={<ProtectedRoute requirePermission="reports"><ConversationHistoryReport /></ProtectedRoute>} />
                        <Route path="/reports/consumable-cost" element={<ProtectedRoute requirePermission="reports"><ConsumableCostReport /></ProtectedRoute>} />
                        
                        {/* MIS Reports */}
                        <Route path={PATHS.MIS.SALES_DASHBOARD} element={<ProtectedRoute requirePermission="mis.sales_marketing.view"><SalesMarketingDashboard /></ProtectedRoute>} />
                        <Route path={PATHS.MIS.PRODUCT_GP} element={<ProtectedRoute requirePermission="mis.product_gp_analysis.view"><ProductGpReport /></ProtectedRoute>} />
                        
                        {/* Redirects for MIS Reports */}
                        <Route path="/mis/sales-marketing" element={<Navigate to={PATHS.MIS.SALES_DASHBOARD} replace />} />
                        <Route path="/reports/product-gp" element={<Navigate to={PATHS.MIS.PRODUCT_GP} replace />} />

                        <Route path={PATHS.REPORTS.PRODUCT_GP} element={<Navigate to={PATHS.MIS.PRODUCT_GP} replace />} />
                        <Route path={PATHS.REPORTS.REPLACEMENTS} element={<ProtectedRoute requirePermission="reports"><ReplacementReport /></ProtectedRoute>} />
                        <Route path={PATHS.REPORTS.SAMPLE_CONVERSION} element={<ProtectedRoute requirePermission="reports"><SampleConversionReport /></ProtectedRoute>} />
                        <Route path="/reports/followup-dashboard" element={<ProtectedRoute requirePermission="reports.followup_report.view"><FollowupDashboardReport /></ProtectedRoute>} />
                        <Route path="/reports/followup-task-report" element={<ProtectedRoute requirePermission="reports.followup_report.view"><FollowupTaskReport /></ProtectedRoute>} />
                        <Route path="/reports/incentive" element={<ProtectedRoute requirePermission="sales"><IncentiveReport /></ProtectedRoute>} />
                        <Route path="/reports/gstr1" element={<ProtectedRoute requirePermission="admin.company_profile.view"><GstrReportPage /></ProtectedRoute>} />
                        <Route path="/reports/gstr3b" element={<ProtectedRoute requirePermission="admin.company_profile.view"><Gstr3bReportPage /></ProtectedRoute>} />
                        <Route path="/reports/gst-reconciliation" element={<ProtectedRoute requirePermission="admin.company_profile.view"><GstReconciliationPage /></ProtectedRoute>} />
                        
                        {/* New GST Reports */}
                        <Route path="/reports/gst-payable" element={<ProtectedRoute requirePermission="admin.company_profile.view"><GstPayableSummary /></ProtectedRoute>} />
                        <Route path="/reports/gst/itc-register" element={<ProtectedRoute requirePermission="admin.company_profile.view"><ItcRegisterPage /></ProtectedRoute>} />
                        <Route path="/reports/gst/hsn-summary" element={<ProtectedRoute requirePermission="admin.company_profile.view"><HsnSummaryPage /></ProtectedRoute>} />
                        <Route path="/reports/gst/ledger" element={<ProtectedRoute requirePermission="admin.company_profile.view"><GstLedgerPage /></ProtectedRoute>} />
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
                        <Route path="/reports" element={<Navigate to="/reports/open-reminders" replace />} />
                        <Route path="/accounts/receipt-entry" element={<ProtectedRoute requirePermission="accounts"><ReceiptEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/receipt-entry/edit/:id" element={<ProtectedRoute requirePermission="accounts"><ReceiptEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/payment-entry" element={<ProtectedRoute requirePermission="accounts"><PaymentEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/payment-entry/edit/:id" element={<ProtectedRoute requirePermission="accounts"><PaymentEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/expense-entry" element={<ProtectedRoute requirePermission="accounts"><ExpenseEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/expense-entry/edit/:id" element={<ProtectedRoute requirePermission="accounts"><ExpenseEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/journal-entry" element={<ProtectedRoute requirePermission="accounts"><JournalEntryPage /></ProtectedRoute>} />
                        <Route path="/accounts/journal-entry/edit/:id" element={<ProtectedRoute requirePermission="accounts"><JournalEntryPage /></ProtectedRoute>} />
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
                        <Route path="/mis/dashboard" element={<ProtectedRoute requirePermission="mis.dashboard.view"><MISDashboard /></ProtectedRoute>} />
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


                        <Route path="/inventory/stock/finished-goods" element={<ProtectedRoute requirePermission="inventory"><FinishedGoodsStockReport /></ProtectedRoute>} />
                        <Route path="/inventory/stock/ledger" element={<ProtectedRoute requirePermission="inventory"><StockMovementLedger /></ProtectedRoute>} />
                        <Route path="/production/outputs" element={<ProtectedRoute requirePermission="production"><ProductionOutputFormPage /></ProtectedRoute>} />
                        <Route path="/production/conversion/new" element={<ProtectedRoute requirePermission="production"><ProductConversionFormPage /></ProtectedRoute>} />
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
