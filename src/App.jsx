import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import CashBookPage from '@/features/purchase/CashBookPage';
import BankBookPage from '@/features/purchase/BankBookPage';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ToastProvider } from '@/components/ui/Toast';
import './styles/main.scss';

import { Toaster } from 'react-hot-toast';

// Component that uses the modal hook
const DemoContent = () => {
    // ... reused from before if needed for dashboard
    return <div style={{ padding: '20px' }}><h1>Dashboard</h1><p>Welcome to the CRM.</p></div>;
};

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <ToastProvider>
                    <Toaster position="top-right" />
                    <ModalProvider>
                        <Routes>
                            {/* Public routes - Login, Forgot Password, Reset Password */}
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                            <Route path="/reset-password" element={<ResetPasswordPage />} />

                            {/* Full-screen page without sidebar */}
                            <Route
                                path="/customers/add"
                                element={
                                    <ProtectedRoute requirePermission="add_customer">
                                        <AddCustomerPage />
                                    </ProtectedRoute>
                                }
                            />

                            {/* Pages with sidebar and header */}
                            <Route path="*" element={
                                <ProtectedRoute>
                                    <ErrorBoundary>
                                        <div style={{ display: 'flex', minHeight: '100vh' }}>
                                            <Sidebar />
                                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                                <Header />
                                                <main style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
                                                    <Routes>
                                                        <Route path="/" element={<Navigate to="/customers/list" replace />} />
                                                        <Route
                                                            path="/customers"
                                                            element={
                                                                <ProtectedRoute requirePermission="view_customers">
                                                                    <CustomerList />
                                                                </ProtectedRoute>
                                                            }
                                                        />
                                                        <Route
                                                            path="/customers/list"
                                                            element={
                                                                <ProtectedRoute requirePermission="view_customers">
                                                                    <CustomerList />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        {/* Follow-up Dashboard - shows all customers */}
                                                        <Route
                                                            path="/followups"
                                                            element={
                                                                <ProtectedRoute requirePermission="view_customers">
                                                                    <FollowupDashboard />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        {/* Follow-up and conversation pages require customerId */}
                                                        <Route
                                                            path="/followup/:customerId"
                                                            element={
                                                                <ProtectedRoute requirePermission="talk_with_customer">
                                                                    <FollowUpForm />
                                                                </ProtectedRoute>
                                                            }
                                                        />
                                                        <Route
                                                            path="/talk/:customerId"
                                                            element={
                                                                <ProtectedRoute requirePermission="talk_with_customer">
                                                                    <TalkWithCustomerForm />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        {/* Redirect to customer list if no ID provided */}
                                                        <Route path="/followup" element={<Navigate to="/customers/list" replace />} />
                                                        <Route path="/talk" element={<Navigate to="/customers/list" replace />} />

                                                        <Route
                                                            path="/admin/users"
                                                            element={
                                                                <ProtectedRoute requireRole="admin">
                                                                    <UserManagement />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/reports/customer-master"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager']}>
                                                                    <CustomerMasterReport />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/reports/followups"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager']}>
                                                                    <FollowUpTrackerReport />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/reports/reminders"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager', 'staff', 'viewer']}>
                                                                    <ReminderReport />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/reports/open-reminders"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager', 'staff', 'viewer']}>
                                                                    <OpenRemindersReport />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/reports/conversation-history"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager', 'staff', 'viewer']}>
                                                                    <ConversationHistoryReport />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/reports/followup-dashboard"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager']}>
                                                                    <FollowupDashboardReport />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/reports/followup-task-report"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager']}>
                                                                    <FollowupTaskReport />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/reports/task-reminders"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager', 'staff']}>
                                                                    <TaskReminderReport />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/task-chats"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager', 'staff']}>
                                                                    <TaskChatDashboard />
                                                                </ProtectedRoute>
                                                            }
                                                        />
                                                        <Route
                                                            path="/task-chats/:taskId"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager', 'staff']}>
                                                                    <TaskChatDashboard />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/reminders"
                                                            element={
                                                                <ProtectedRoute requirePermission="view_reminders">
                                                                    <RemindersDashboard />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        <Route
                                                            path="/tasks/create"
                                                            element={
                                                                <ProtectedRoute requirePermission="add_task">
                                                                    <TaskCreatePage />
                                                                </ProtectedRoute>
                                                            }
                                                        />
                                                        <Route
                                                            path="/tasks/list"
                                                            element={
                                                                <ProtectedRoute requirePermission="view_tasks">
                                                                    <ManageTasksPage />
                                                                </ProtectedRoute>
                                                            }
                                                        />
                                                        <Route
                                                            path="/tasks/groups"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager', 'staff']}>
                                                                    <TaskGroupList />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        {/* Groups */}
                                                        <Route
                                                            path="/groups"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager', 'staff']}>
                                                                    <GroupList />
                                                                </ProtectedRoute>
                                                            }
                                                        />
                                                        <Route
                                                            path="/groups/:id"
                                                            element={
                                                                <ProtectedRoute requireRole={['admin', 'manager', 'staff']}>
                                                                    <GroupDetails />
                                                                </ProtectedRoute>
                                                            }
                                                        />

                                                        {/* Inventory */}
                                                        <Route path="/inventory/items" element={<ProtectedRoute requirePermission="view_inventory"><ItemListPage /></ProtectedRoute>} />
                                                        <Route path="/inventory/items/new" element={<ProtectedRoute requirePermission="manage_inventory"><ItemFormPage /></ProtectedRoute>} />
                                                        <Route path="/inventory/items/:id" element={<ProtectedRoute requirePermission="manage_inventory"><ItemFormPage /></ProtectedRoute>} />
                                                        <Route path="/inventory/item-types" element={<ProtectedRoute requirePermission="manage_inventory"><ItemTypePage /></ProtectedRoute>} />
                                                        <Route path="/inventory/item-groups" element={<ProtectedRoute requirePermission="manage_inventory"><ItemGroupPage /></ProtectedRoute>} />

                                                        <Route path="/inventory/bom" element={<ProtectedRoute requirePermission="view_inventory"><BOMPage /></ProtectedRoute>} />
                                                        <Route path="/inventory/bom/new" element={<ProtectedRoute requirePermission="manage_inventory"><BOMFormPage /></ProtectedRoute>} />
                                                        <Route path="/inventory/bom/edit/:id" element={<ProtectedRoute requirePermission="manage_inventory"><BOMFormPage /></ProtectedRoute>} />

                                                        {/* Production */}
                                                        <Route path="/production" element={<ProtectedRoute requirePermission="view_production"><ProductionDashboard /></ProtectedRoute>} />
                                                        <Route path="/production/work-orders" element={<ProtectedRoute requirePermission="view_production"><WorkOrderListPage /></ProtectedRoute>} />
                                                        <Route path="/production/work-orders/new" element={<ProtectedRoute requirePermission="manage_production"><WorkOrderFormPage /></ProtectedRoute>} />
                                                        <Route path="/production/work-orders/:id" element={<ProtectedRoute requirePermission="manage_production"><WorkOrderDetailPage /></ProtectedRoute>} />

                                                        {/* Purchase Module */}
                                                        <Route path="/purchase/suppliers" element={<ProtectedRoute requireRole={['admin', 'manager', 'staff']}><SupplierListPage /></ProtectedRoute>} />
                                                        <Route path="/purchase/orders" element={<ProtectedRoute requireRole={['admin', 'manager', 'staff']}><PurchaseOrderListPage /></ProtectedRoute>} />
                                                        <Route path="/purchase/orders/new" element={<ProtectedRoute requireRole={['admin', 'manager', 'staff']}><PurchaseOrderFormPage /></ProtectedRoute>} />
                                                        <Route path="/purchase/orders/:id" element={<ProtectedRoute requireRole={['admin', 'manager', 'staff']}><PurchaseOrderDetailPage /></ProtectedRoute>} />
                                                        <Route path="/purchase/grn" element={<ProtectedRoute requireRole={['admin', 'manager', 'staff']}><GRNListPage /></ProtectedRoute>} />
                                                        <Route path="/purchase/invoices" element={<ProtectedRoute requireRole={['admin', 'manager', 'staff']}><PurchaseInvoiceListPage /></ProtectedRoute>} />
                                                        <Route path="/purchase/invoices/new" element={<ProtectedRoute requireRole={['admin', 'manager', 'staff']}><PurchaseInvoiceFormPage /></ProtectedRoute>} />
                                                        <Route path="/purchase/invoices/:id" element={<ProtectedRoute requireRole={['admin', 'manager', 'staff']}><PurchaseInvoiceDetailPage /></ProtectedRoute>} />
                                                        <Route path="/purchase/cash-book" element={<ProtectedRoute requireRole={['admin', 'manager', 'staff']}><CashBookPage /></ProtectedRoute>} />
                                                        <Route path="/purchase/bank-book" element={<ProtectedRoute requireRole={['admin', 'manager', 'staff']}><BankBookPage /></ProtectedRoute>} />


                                                        {/* Redirects */}
                                                        <Route path="/reports" element={<Navigate to="/reports/open-reminders" replace />} />
                                                    </Routes>
                                                </main>
                                            </div>
                                        </div>
                                    </ErrorBoundary>
                                </ProtectedRoute>
                            } />
                        </Routes>
                    </ModalProvider>
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
