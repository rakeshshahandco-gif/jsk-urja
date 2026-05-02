import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Plus, 
    Star, 
    X, 
    History, 
    ChevronRight,
    Users,
    FileText,
    ShoppingCart,
    ShoppingBag,
    Package,
    Factory,
    Wallet,
    BarChart3,
    ClipboardList,
    Settings,
    FileSearch,
    Receipt,
    CreditCard,
    LayoutDashboard,
    Search,
    PinOff,
    RotateCcw,
    GripVertical,
    Palette
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Card, Modal } from '@/components/ui';
import { PATHS } from '@/routes/paths';
import styles from './DashboardPage.module.scss';
import clsx from 'clsx';
import { toast } from 'react-hot-toast';

// Icon Map for easy rendering
const ICON_MAP = {
    'crm': Users,
    'sales': ShoppingBag,
    'purchase': ShoppingCart,
    'inventory': Package,
    'production': Factory,
    'voucher': FileText,
    'account-master': Settings,
    'accounts': Wallet,
    'gst': BarChart3,
    'mis': LayoutDashboard,
    'tasks': ClipboardList,
    'report': FileSearch,
    'receipt': Receipt,
    'credit': CreditCard,
};

const COLORS = [
    { name: 'Default', value: 'default', bg: '#eff6ff', text: '#3b82f6' },
    { name: 'Emerald', value: 'emerald', bg: '#ecfdf5', text: '#10b981' },
    { name: 'Amber', value: 'amber', bg: '#fffbeb', text: '#f59e0b' },
    { name: 'Rose', value: 'rose', bg: '#fff1f2', text: '#f43f5e' },
    { name: 'Violet', value: 'violet', bg: '#f5f3ff', text: '#8b5cf6' },
    { name: 'Slate', value: 'slate', bg: '#f8fafc', text: '#64748b' },
];

const ALL_FORMS = [
    // CRM
    { id: 'customer-master', title: 'Customer Master', path: PATHS.CUSTOMERS.LIST, icon: 'crm', permission: 'customers.customer_master.view', module: 'CRM' },
    { id: 'lead-inquiry', title: 'Lead / Inquiry', path: '/crm/leads', icon: 'crm', permission: 'customers', module: 'CRM' },
    { id: 'follow-up', title: 'Follow-up', path: '/followups', icon: 'crm', permission: 'customers.follow_up.view', module: 'CRM' },

    // Sales
    { id: 'sales-order', title: 'Sales Order', path: PATHS.SALES.ORDERS, icon: 'sales', permission: 'sales.sales_orders.view', module: 'Sales' },
    { id: 'sales-invoice', title: 'Tax Invoice (GST)', path: PATHS.SALES.INVOICES, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'estimate', title: 'Estimate / Internal Sale', path: '/sales/estimates', icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'eway-bill', title: 'E-Way Bill Tracking', path: PATHS.EWAY_BILL.LIST, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'logistics', title: 'Logistics & Courier Master', path: PATHS.TRANSPORTERS.LIST, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },

    // Purchase
    { id: 'purchase-order', title: 'Purchase Order', path: PATHS.PURCHASE.ORDERS, icon: 'purchase', permission: 'purchase.purchase_orders.view', module: 'Purchase' },
    { id: 'purchase-invoice', title: 'Purchase Invoice', path: PATHS.PURCHASE.INVOICES, icon: 'purchase', permission: 'purchase.purchase_invoices.view', module: 'Purchase' },

    // Inventory
    { id: 'item-master', title: 'Item Master', path: '/inventory/items', icon: 'inventory', permission: 'inventory.item_master.view', module: 'Inventory' },
    { id: 'bom', title: 'Bill of Materials (BOM)', path: PATHS.INVENTORY.BOM.ROOT, icon: 'inventory', permission: 'inventory.bom.view', module: 'Inventory' },
    { id: 'raw-material-report', title: 'Raw Material Stock Report', path: '/inventory/stock/raw-material', icon: 'inventory', permission: 'inventory.raw_material_report.view', module: 'Inventory' },
    { id: 'finished-goods-report', title: 'Finished Goods Stock Report', path: '/inventory/stock/finished-goods', icon: 'inventory', permission: 'inventory.finished_goods_report.view', module: 'Inventory' },
    { id: 'stock-ledger', title: 'Stock Movement Ledger', path: '/inventory/stock/ledger', icon: 'inventory', permission: 'inventory.stock_ledger.view', module: 'Inventory' },

    // Production
    { id: 'work-order', title: 'Work Order', path: PATHS.PRODUCTION.WORK_ORDERS, icon: 'production', permission: 'production.production_planning.view', module: 'Production' },
    { id: 'production-entry', title: 'Production Entry', path: '/production/output/new', icon: 'production', permission: 'production.prod_output.add', module: 'Production' },

    // Voucher Entry
    { id: 'receipt-voucher', title: 'Receipt Voucher', path: PATHS.ACCOUNTS.RECEIPT_ENTRY, icon: 'receipt', permission: 'accounts.receipt_entry.view', module: 'Voucher Entry' },
    { id: 'payment-voucher', title: 'Payment Voucher', path: PATHS.ACCOUNTS.PAYMENT_ENTRY, icon: 'receipt', permission: 'accounts.payment_entry.view', module: 'Voucher Entry' },
    { id: 'journal-voucher', title: 'Journal Voucher', path: PATHS.ACCOUNTS.JOURNAL_ENTRY, icon: 'receipt', permission: 'accounts.journal_entry.view', module: 'Voucher Entry' },
    { id: 'debit-note', title: 'Debit Note', path: PATHS.ACCOUNTS.DEBIT_NOTES, icon: 'credit', permission: 'accounts.debit_notes.view', module: 'Voucher Entry' },
    { id: 'credit-note', title: 'Credit Note', path: PATHS.ACCOUNTS.CREDIT_NOTES, icon: 'credit', permission: 'accounts.credit_notes.view', module: 'Voucher Entry' },

    // Account Master
    { id: 'group-master', title: 'Group Master', path: PATHS.ACCOUNT_MASTER.GROUP_MASTER, icon: 'account-master', permission: 'accounts.group_master.view', module: 'Account Master' },
    { id: 'ledger-master', title: 'Ledger Master', path: PATHS.ACCOUNT_MASTER.LEDGER_MASTER, icon: 'account-master', permission: 'accounts.ledger_master.view', module: 'Account Master' },
    { id: 'financial-year-master', title: 'Financial Year Master', path: PATHS.ACCOUNT_MASTER.FINANCIAL_YEAR, icon: 'account-master', permission: 'accounts.financial_year.view', module: 'Account Master' },
    { id: 'series-master', title: 'Series Master', path: PATHS.ACCOUNT_MASTER.SERIES_MASTER, icon: 'account-master', permission: 'accounts.vouchers.view', module: 'Account Master' },

    // Accounts
    { id: 'voucher-register', title: 'Voucher Register', path: PATHS.ACCOUNTS.VOUCHER_LIST, icon: 'accounts', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'ledger-report', title: 'Ledger Report', path: PATHS.ACCOUNTS.LEDGER_REPORT, icon: 'accounts', permission: 'accounts.ledger_report.view', module: 'Accounts' },
    { id: 'sales-register', title: 'Sales Register', path: PATHS.ACCOUNTS.SALES_REGISTER, icon: 'accounts', permission: 'accounts.sales_register.view', module: 'Accounts' },
    { id: 'purchase-register', title: 'Purchase Register', path: PATHS.ACCOUNTS.PURCHASE_REGISTER, icon: 'accounts', permission: 'accounts.purchase_register.view', module: 'Accounts' },
    { id: 'expense-register', title: 'Expense Register', path: PATHS.ACCOUNTS.EXPENSE_REGISTER, icon: 'accounts', permission: 'accounts.vouchers.view', module: 'Accounts' },
    { id: 'day-book', title: 'Day Book', path: PATHS.ACCOUNTS.DAY_BOOK, icon: 'accounts', permission: 'accounts.day_book.view', module: 'Accounts' },
    { id: 'cash-book', title: 'Cash Book', path: PATHS.ACCOUNTS.CASH_BOOK, icon: 'accounts', permission: 'accounts.cash_book.view', module: 'Accounts' },
    { id: 'bank-book', title: 'Bank Book', path: PATHS.ACCOUNTS.BANK_BOOK, icon: 'accounts', permission: 'accounts.bank_book.view', module: 'Accounts' },
    { id: 'outstanding-report', title: 'Outstanding Report', path: PATHS.ACCOUNTS.OUTSTANDING_REPORT, icon: 'accounts', permission: 'accounts.outstanding.view', module: 'Accounts' },

    // GST
    { id: 'gstr1', title: 'GSTR-1', path: '/reports/gstr1', icon: 'gst', permission: 'admin.company_profile.view', module: 'GST' },
    { id: 'gstr3b', title: 'GSTR-3B', path: '/reports/gstr3b', icon: 'gst', permission: 'admin.company_profile.view', module: 'GST' },
    { id: 'gst-recon', title: '2A / 2B Reconciliation', path: '/reports/gst-reconciliation', icon: 'gst', permission: 'admin.company_profile.view', module: 'GST' },
    { id: 'gst-payable', title: 'GST Payable Summary', path: '/reports/gst-payable', icon: 'gst', permission: 'admin.company_profile.view', module: 'GST' },

    // MIS Reports
    { id: 'sales-mis', title: 'Sales MIS Dashboard', path: PATHS.MIS.SALES_DASHBOARD, icon: 'mis', permission: 'mis.sales_marketing.view', module: 'MIS Reports' },
    { id: 'product-gp', title: 'Product-wise GP Analysis', path: PATHS.MIS.PRODUCT_GP, icon: 'mis', permission: 'mis.product_gp_analysis.view', module: 'MIS Reports' },

    // Task Management
    { id: 'manage-tasks', title: 'Manage Tasks', path: '/tasks/list', icon: 'tasks', permission: 'tasks.task_list.view', module: 'Task Management' },
    { id: 'reminders', title: 'Reminder / Follow-up', path: '/reminders', icon: 'tasks', permission: 'customers.reminder_tasks.view', module: 'Task Management' },
];

const DashboardPage = () => {
    const navigate = useNavigate();
    const { user, hasPermission } = useAuth();
    const [pinnedFormsData, setPinnedFormsData] = useState([]); // [{ id, color }]
    const [recentForms, setRecentForms] = useState([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [draggedIndex, setDraggedIndex] = useState(null);

    // Storage keys
    const PINNED_KEY = `dashboard_pinned_v3_${user?._id || user?.id}`; // Version 3 with correct ID
    const RECENT_KEY = `dashboard_recent_${user?._id || user?.id}`;

    // Load settings
    useEffect(() => {
        if (!user?._id && !user?.id) return;
        
        const savedPinned = localStorage.getItem(PINNED_KEY);
        if (savedPinned) {
            setPinnedFormsData(JSON.parse(savedPinned));
        } else {
            resetToDefault(false);
        }
    }, [user?._id, user?.id, hasPermission]);

    const resetToDefault = (showToast = true) => {
        let defaults = [];
        const role = user?.roleName?.toLowerCase() || 'viewer';
        const isAdmin = role.includes('admin') || role.includes('super');
        
        if (isAdmin) {
            defaults = ['customer-master', 'sales-order', 'sales-invoice', 'purchase-order', 'purchase-invoice', 'stock-ledger', 'product-gp'];
        } else if (role.includes('sales')) {
            defaults = ['customer-master', 'sales-order', 'sales-invoice', 'follow-up', 'manage-tasks'];
        } else if (role === 'purchase') {
            defaults = ['purchase-order', 'purchase-invoice', 'stock-ledger'];
        } else {
            defaults = ['manage-tasks', 'follow-up'];
        }
        
        const filteredDefaults = defaults
            .filter(id => {
                const form = ALL_FORMS.find(f => f.id === id);
                return form && hasPermission(form.permission);
            })
            .map(id => ({ id, color: 'default' }));
        
        setPinnedFormsData(filteredDefaults);
        localStorage.setItem(PINNED_KEY, JSON.stringify(filteredDefaults));
        if (showToast) toast.success('Home reset to defaults');
    };

    const pinnedForms = useMemo(() => {
        return pinnedFormsData
            .map(data => {
                const form = ALL_FORMS.find(f => f.id === data.id);
                if (!form || !hasPermission(form.permission)) return null;
                return { ...form, color: data.color || 'default' };
            })
            .filter(Boolean);
    }, [pinnedFormsData, hasPermission]);

    const availableToPin = useMemo(() => {
        return ALL_FORMS.filter(f => hasPermission(f.permission));
    }, [hasPermission]);

    const filteredAvailable = useMemo(() => {
        if (!searchTerm) return availableToPin;
        return availableToPin.filter(f => 
            f.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
            f.module.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [availableToPin, searchTerm]);

    const groupedAvailable = useMemo(() => {
        const groups = {};
        filteredAvailable.forEach(f => {
            if (!groups[f.module]) groups[f.module] = [];
            groups[f.module].push(f);
        });
        return groups;
    }, [filteredAvailable]);

    const togglePin = (formId) => {
        setPinnedFormsData(prev => {
            let next;
            const existing = prev.find(p => p.id === formId);
            if (existing) {
                next = prev.filter(p => p.id !== formId);
            } else {
                next = [...prev, { id: formId, color: 'default' }];
            }
            localStorage.setItem(PINNED_KEY, JSON.stringify(next));
            return next;
        });
    };

    const changeCardColor = (formId, colorValue) => {
        setPinnedFormsData(prev => {
            const next = prev.map(p => p.id === formId ? { ...p, color: colorValue } : p);
            localStorage.setItem(PINNED_KEY, JSON.stringify(next));
            return next;
        });
    };

    const handleFormClick = (form) => {
        navigate(form.path);
    };

    const renderIcon = (name, className) => {
        const IconComp = ICON_MAP[name] || FileText;
        return <IconComp className={className} size={24} />;
    };

    const getTimeAgo = (isoString) => {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin} min ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr} hr ago`;
        return date.toLocaleDateString();
    };

    // Drag and Drop handlers
    const onDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // Add a ghost image or styling if needed
    };

    const onDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        
        const nextData = [...pinnedFormsData];
        const draggedItem = nextData[draggedIndex];
        nextData.splice(draggedIndex, 1);
        nextData.splice(index, 0, draggedItem);
        
        setPinnedFormsData(nextData);
        setDraggedIndex(index);
    };

    const onDragEnd = () => {
        setDraggedIndex(null);
        localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedFormsData));
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.titleSection}>
                    <h1 className={styles.title}>Home</h1>
                    <p className={styles.subtitle}>Your Quick Access Forms</p>
                </div>
                <div className={styles.headerActions}>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => resetToDefault()}
                        className={styles.resetBtn}
                    >
                        <RotateCcw size={14} className="mr-2" />
                        Reset to Default
                    </Button>
                </div>
            </header>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>My Forms</h2>
                    <span className={styles.hint}>Drag to reorder</span>
                </div>

                <div className={styles.grid}>
                    {pinnedForms.map((form, index) => {
                        const colorTheme = COLORS.find(c => c.value === form.color) || COLORS[0];
                        return (
                            <div 
                                key={form.id} 
                                className={clsx(styles.cardWrapper, { [styles.isDragging]: draggedIndex === index })}
                                draggable
                                onDragStart={(e) => onDragStart(e, index)}
                                onDragOver={(e) => onDragOver(e, index)}
                                onDragEnd={onDragEnd}
                            >
                                <Card 
                                    className={styles.formCard} 
                                    onClick={() => handleFormClick(form)}
                                    style={{ 
                                        '--card-bg': colorTheme.bg,
                                        '--card-accent': colorTheme.text
                                    }}
                                >
                                    <div className={styles.dragHandle}>
                                        <GripVertical size={14} />
                                    </div>
                                    
                                    <div className={styles.cardIcon}>
                                        {renderIcon(form.icon, styles.icon)}
                                    </div>
                                    <div className={styles.cardBody}>
                                        <h3 className={styles.formName}>{form.title}</h3>
                                        <span className={styles.actionText}>Open Form</span>
                                    </div>

                                    <div className={styles.cardActions}>
                                        <div className={styles.colorPickerTrigger}>
                                            <Palette size={14} />
                                            <div className={styles.colorDropdown}>
                                                {COLORS.map(c => (
                                                    <button 
                                                        key={c.value}
                                                        className={clsx(styles.colorCircle, { [styles.active]: form.color === c.value })}
                                                        style={{ backgroundColor: c.text }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            changeCardColor(form.id, c.value);
                                                        }}
                                                        title={c.name}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <button 
                                            className={styles.unpinBtn} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                togglePin(form.id);
                                            }}
                                            title="Unpin from Home"
                                        >
                                            <PinOff size={14} />
                                        </button>
                                    </div>
                                </Card>
                            </div>
                        );
                    })}

                    <div className={styles.cardWrapper}>
                        <Card 
                            className={clsx(styles.formCard, styles.addCard)} 
                            onClick={() => setIsAddModalOpen(true)}
                        >
                            <div className={styles.addIcon}>
                                <Plus size={32} />
                            </div>
                            <div className={styles.cardBody}>
                                <h3 className={styles.formName}>Add Form</h3>
                                <span className={styles.actionText}>Pin more forms</span>
                            </div>
                        </Card>
                    </div>
                </div>
            </section>

            {recentForms.length > 0 && (
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Recently Opened</h2>
                        <History size={18} className="text-gray-400" />
                    </div>
                    <div className={styles.recentList}>
                        {recentForms.map(form => (
                            <div 
                                key={`${form.id}-${form.timestamp}`} 
                                className={styles.recentItem}
                                onClick={() => handleFormClick(form)}
                            >
                                <div className={styles.recentIcon}>
                                    {renderIcon(form.icon, styles.smallIcon)}
                                </div>
                                <div className={styles.recentInfo}>
                                    <span className={styles.recentName}>{form.title}</span>
                                    <span className={styles.recentTime}>{getTimeAgo(form.timestamp)}</span>
                                </div>
                                <ChevronRight size={16} className={styles.recentArrow} />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {isAddModalOpen && (
                <Modal
                    onClose={() => setIsAddModalOpen(false)}
                    title="Manage Home Forms"
                    size="lg"
                >
                    <div className={styles.modalContent}>
                        <div className={styles.searchBar}>
                            <Search size={18} className={styles.searchIcon} />
                            <input 
                                type="text" 
                                placeholder="Search forms or modules..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className={styles.clearSearch}>
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        <div className={styles.moduleList}>
                            {Object.entries(groupedAvailable).map(([moduleName, forms]) => (
                                <div key={moduleName} className={styles.moduleGroup}>
                                    <h3 className={styles.moduleTitle}>{moduleName}</h3>
                                    <div className={styles.moduleForms}>
                                        {forms.map(form => {
                                            const isPinned = pinnedFormsData.some(p => p.id === form.id);
                                            return (
                                                <div 
                                                    key={form.id} 
                                                    className={clsx(styles.modalFormItem, { [styles.isPinned]: isPinned })}
                                                    onClick={() => togglePin(form.id)}
                                                >
                                                    <div className={styles.modalFormIcon}>
                                                        {renderIcon(form.icon, styles.icon)}
                                                    </div>
                                                    <div className={styles.modalFormDetails}>
                                                        <span className={styles.modalFormName}>{form.title}</span>
                                                    </div>
                                                    <div className={styles.pinToggle}>
                                                        {isPinned ? <Star size={16} fill="#f59e0b" color="#f59e0b" /> : <Plus size={16} className="text-gray-400" />}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={styles.modalFooter}>
                        <Button onClick={() => setIsAddModalOpen(false)} variant="primary">Done</Button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default DashboardPage;
