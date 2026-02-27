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
                                        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                                            <Header />
                                            <div style={{ display: 'flex', flex: 1 }}>
                                                <Sidebar />
                                                <main style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
                                                    <Routes>
                                                        <Route path="/" element={<Navigate to="/customers/list" replace />} />
                                                        <Route path="/customers" element={<CustomerList />} />
                                                        <Route path="/customers/list" element={<CustomerList />} />

                                                        {/* Follow-up Dashboard - shows all customers */}
                                                        <Route path="/followups" element={<FollowupDashboard />} />

                                                        {/* Follow-up and conversation pages require customerId */}
                                                        <Route path="/followup/:customerId" element={<FollowUpForm />} />
                                                        <Route path="/talk/:customerId" element={<TalkWithCustomerForm />} />

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

                                                        <Route path="/tasks/create" element={<TaskCreatePage />} />
                                                        <Route path="/tasks/list" element={<ManageTasksPage />} />
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
                                                        <Route path="/inventory/items" element={<ItemListPage />} />
                                                        <Route path="/inventory/items/new" element={<ItemFormPage />} />
                                                        <Route path="/inventory/items/:id" element={<ItemFormPage />} />
                                                        <Route path="/inventory/item-types" element={<ItemTypePage />} />
                                                        <Route path="/inventory/item-groups" element={<ItemGroupPage />} />

                                                        <Route path="/inventory/bom" element={<BOMPage />} />
                                                        <Route path="/inventory/bom/new" element={<BOMFormPage />} />
                                                        <Route path="/inventory/bom/edit/:id" element={<BOMFormPage />} />

                                                        {/* Production */}
                                                        <Route path="/production" element={<ProductionDashboard />} />
                                                        <Route path="/production/work-orders" element={<WorkOrderListPage />} />
                                                        <Route path="/production/work-orders/new" element={<WorkOrderFormPage />} />
                                                        <Route path="/production/work-orders/:id" element={<WorkOrderDetailPage />} />

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
