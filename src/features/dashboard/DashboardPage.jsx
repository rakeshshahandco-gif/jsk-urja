import React, { useState, useEffect, useMemo, useRef } from 'react';
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
    Palette,
    MessageSquare,
    UserCheck,
    Check,
    CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Card, Modal } from '@/components/ui';
import { PATHS } from '@/routes/paths';
import styles from './DashboardPage.module.scss';
import clsx from 'clsx';
import { toast } from 'react-hot-toast';
import { userHomeService } from '@/services/userHome.service';

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
    'messenger': MessageSquare,
    'supplier': UserCheck
};

const BOX_COLORS = [
    { name: 'White', value: 'default', bg: '#ffffff', accent: '#3b82f6' },
    { name: 'Light Peach', value: 'peach', bg: '#fff0e6', accent: '#f97316' },
    { name: 'Light Blue', value: 'blue', bg: '#e0f2fe', accent: '#0284c7' },
    { name: 'Light Green', value: 'green', bg: '#f0fdf4', accent: '#16a34a' },
    { name: 'Light Purple', value: 'purple', bg: '#faf5ff', accent: '#9333ea' },
    { name: 'Light Yellow', value: 'yellow', bg: '#fefce8', accent: '#ca8a04' },
    { name: 'Light Cyan', value: 'cyan', bg: '#ecfeff', accent: '#0891b2' },
    { name: 'Light Pink', value: 'pink', bg: '#fdf2f8', accent: '#db2777' },
    { name: 'Light Grey', value: 'grey', bg: '#f9fafb', accent: '#4b5563' },
];

const TEXT_COLORS = [
    { name: 'Default', value: 'default', color: '#1f2937' },
    { name: 'Black', value: 'black', color: '#000000' },
    { name: 'Dark Navy', value: 'dark-navy', color: '#000080' },
    { name: 'Dark Grey', value: 'dark-grey', color: '#333333' },
    { name: 'White', value: 'white', color: '#ffffff' },
    { name: 'Dark Green', value: 'dark-green', color: '#006400' },
    { name: 'Dark Blue', value: 'dark-blue', color: '#00008b' },
    { name: 'Brown', value: 'brown', color: '#8b4513' },
];

const ALL_FORMS = [
    // CRM
    { id: 'customer-master', title: 'Customer Master', path: PATHS.CUSTOMERS.LIST, icon: 'crm', permission: 'customers.customer_master.view', module: 'CRM' },
    { id: 'lead-inquiry', title: 'Lead / Inquiry', path: '/crm/leads', icon: 'crm', permission: 'customers', module: 'CRM' },
    { id: 'follow-up', title: 'Follow-up', path: '/followups', icon: 'tasks', permission: 'customers.follow_up.view', module: 'CRM' },

    // Sales
    { id: 'sales-order', title: 'Sales Order', path: PATHS.SALES.ORDERS, icon: 'sales', permission: 'sales.sales_orders.view', module: 'Sales' },
    { id: 'sales-invoice', title: 'Tax Invoice (GST)', path: PATHS.SALES.INVOICES, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'estimate', title: 'Estimate / Internal Sale', path: '/sales/estimates', icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'eway-bill', title: 'E-Way Bill Tracking', path: PATHS.EWAY_BILL.LIST, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },
    { id: 'logistics', title: 'Logistics & Courier Master', path: PATHS.TRANSPORTERS.LIST, icon: 'sales', permission: 'sales.sales_invoices.view', module: 'Sales' },

    // Purchase
    { id: 'purchase-order', title: 'Purchase Order', path: PATHS.PURCHASE.ORDERS, icon: 'purchase', permission: 'purchase.purchase_orders.view', module: 'Purchase' },
    { id: 'purchase-invoice', title: 'Purchase Invoice', path: PATHS.PURCHASE.INVOICES, icon: 'purchase', permission: 'purchase.purchase_invoices.view', module: 'Purchase' },
    { id: 'supplier-master', title: 'Supplier Master', path: '/purchase/suppliers', icon: 'supplier', permission: 'purchase', module: 'Purchase' },

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
    { id: 'follow-up', title: 'Follow-up', path: '/followups', icon: 'tasks', permission: 'customers.follow_up.view', module: 'Task Management' },
    { id: 'reminders', title: 'Reminder / Follow-up', path: '/reminders', icon: 'tasks', permission: 'customers.reminder_tasks.view', module: 'Task Management' },
    { id: 'messenger', title: 'Messenger', path: '/messenger', icon: 'messenger', permission: 'tasks', module: 'Task Management' },
];

const DashboardPage = () => {
    const navigate = useNavigate();
    const { user, hasPermission } = useAuth();
    const [pinnedFormsData, setPinnedFormsData] = useState([]); // [{ id, boxColor, textColor, iconColor, orderNo }]
    const [recentForms, setRecentForms] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [draggedIndex, setDraggedIndex] = useState(null);
    
    // Customization state
    const [activeSettingsId, setActiveSettingsId] = useState(null);
    const [tempStyles, setTempStyles] = useState(null); // { boxColor, textColor, customBg, customText } for preview
    const settingsRef = useRef(null);
    const customBgRef = useRef(null);
    const customTextRef = useRef(null);

    // Close settings when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target)) {
                handleCancel();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load settings from backend
    const loadPreferences = async () => {
        try {
            setIsLoading(true);
            const response = await userHomeService.getPreferences();
            if (response.success) {
                setPinnedFormsData(response.data.selectedCards || []);
            }
        } catch (error) {
            console.error('Failed to load home preferences', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            loadPreferences();
            
            // Load recents from localStorage
            const RECENT_KEY = `dashboard_recent_${user?._id || user?.id}`;
            const savedRecent = localStorage.getItem(RECENT_KEY);
            if (savedRecent) {
                setRecentForms(JSON.parse(savedRecent));
            }
        }
    }, [user]);

    const savePreferences = async (newData) => {
        try {
            await userHomeService.updatePreferences(newData);
        } catch (error) {
            console.error('Failed to save home preferences', error);
        }
    };

    const resetToDefault = async () => {
        try {
            setIsLoading(true);
            const response = await userHomeService.resetPreferences();
            if (response.success) {
                setPinnedFormsData(response.data.selectedCards || []);
                toast.success('Home reset to role-based defaults');
            }
        } catch (error) {
            console.error('Failed to reset home preferences', error);
            toast.error('Failed to reset home');
        } finally {
            setIsLoading(false);
        }
    };

    const pinnedForms = useMemo(() => {
        return pinnedFormsData
            .map(data => {
                const form = ALL_FORMS.find(f => f.id === data.id);
                if (!form || !hasPermission(form.permission)) return null;
                
                const isEditing = activeSettingsId === data.id && tempStyles;
                const boxColor = isEditing ? tempStyles.boxColor : (data.boxColor || 'default');
                const textColor = isEditing ? tempStyles.textColor : (data.textColor || 'default');
                const customBg = isEditing ? tempStyles.customBg : (data.customBg || '');
                const customText = isEditing ? tempStyles.customText : (data.customText || '');
                return { 
                    ...form, 
                    boxColor,
                    textColor,
                    customBg,
                    customText,
                    iconColor: data.iconColor || 'theme',
                    orderNo: data.orderNo 
                };
            })
            .filter(Boolean)
            .sort((a, b) => (a.orderNo || 0) - (b.orderNo || 0));
    }, [pinnedFormsData, hasPermission, activeSettingsId, tempStyles]);

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

    const togglePin = async (formId) => {
        const existing = pinnedFormsData.find(p => p.id === formId);
        let newData;
        
        if (existing) {
            newData = pinnedFormsData.filter(p => p.id !== formId);
        } else {
            newData = [...pinnedFormsData, { 
                id: formId, 
                boxColor: 'default', 
                textColor: 'default', 
                iconColor: 'theme',
                orderNo: pinnedFormsData.length 
            }];
        }
        
        setPinnedFormsData(newData);
        await savePreferences(newData);
    };

    const handleOpenSettings = (e, form) => {
        e.stopPropagation();
        if (activeSettingsId === form.id) {
            handleCancel();
            return;
        }
        setActiveSettingsId(form.id);
        const saved = pinnedFormsData.find(p => p.id === form.id);
        setTempStyles({ 
            boxColor: form.boxColor, 
            textColor: form.textColor,
            customBg: saved?.customBg || '',
            customText: saved?.customText || ''
        });
    };

    const handleSelectColor = (type, value) => {
        setTempStyles(prev => {
            const next = { ...prev, [type]: value };
            // Clear custom override when a preset is picked
            if (type === 'boxColor') next.customBg = '';
            if (type === 'textColor') next.customText = '';
            return next;
        });
    };

    const handleCustomColor = (type, hexValue) => {
        setTempStyles(prev => {
            if (type === 'boxColor') {
                return { ...prev, boxColor: 'custom', customBg: hexValue };
            } else {
                return { ...prev, textColor: 'custom', customText: hexValue };
            }
        });
    };

    const handleApply = async () => {
        const newData = pinnedFormsData.map(p => {
            if (p.id === activeSettingsId) {
                return { 
                    ...p, 
                    boxColor: tempStyles.boxColor,
                    textColor: tempStyles.textColor,
                    customBg: tempStyles.customBg || '',
                    customText: tempStyles.customText || ''
                };
            }
            return p;
        });
        setPinnedFormsData(newData);
        await savePreferences(newData);
        setActiveSettingsId(null);
        setTempStyles(null);
        toast.success('Style applied successfully');
    };

    const handleCancel = () => {
        setActiveSettingsId(null);
        setTempStyles(null);
    };

    const handleResetCard = async () => {
        const newData = pinnedFormsData.map(p => {
            if (p.id === activeSettingsId) {
                return { ...p, boxColor: 'default', textColor: 'default', iconColor: 'theme' };
            }
            return p;
        });
        setPinnedFormsData(newData);
        await savePreferences(newData);
        setActiveSettingsId(null);
        setTempStyles(null);
        toast.success('Card style reset');
    };

    const handleFormClick = (form) => {
        if (activeSettingsId) return; // Don't navigate while customizing
        navigate(form.path);
    };

    const renderIcon = (name, className, style) => {
        const IconComp = ICON_MAP[name] || FileText;
        return <IconComp className={className} size={24} style={style} />;
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
        if (activeSettingsId) return e.preventDefault();
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        
        const nextData = [...pinnedFormsData];
        const draggedItem = nextData[draggedIndex];
        nextData.splice(draggedIndex, 1);
        nextData.splice(index, 0, draggedItem);
        
        const orderedData = nextData.map((item, idx) => ({ ...item, orderNo: idx }));
        setPinnedFormsData(orderedData);
        setDraggedIndex(index);
    };

    const onDragEnd = async () => {
        setDraggedIndex(null);
        await savePreferences(pinnedFormsData);
    };

    if (isLoading) {
        return <div className={styles.loadingContainer}>Loading your personal home...</div>;
    }

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
                        onClick={resetToDefault}
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
                        const boxTheme = BOX_COLORS.find(c => c.value === form.boxColor) || BOX_COLORS[0];
                        const textTheme = TEXT_COLORS.find(c => c.value === form.textColor) || TEXT_COLORS[0];
                        // Resolve actual colors (custom overrides preset)
                        const resolvedBg = form.customBg || boxTheme.bg;
                        const resolvedText = form.customText || textTheme.color;
                        const resolvedAccent = boxTheme.accent;
                        
                        return (
                            <div 
                                key={form.id} 
                                className={clsx(styles.cardWrapper, { 
                                    [styles.isDragging]: draggedIndex === index,
                                    [styles.isEditing]: activeSettingsId === form.id 
                                })}
                                draggable={!activeSettingsId}
                                onDragStart={(e) => onDragStart(e, index)}
                                onDragOver={(e) => onDragOver(e, index)}
                                onDragEnd={onDragEnd}
                            >
                                <div className={styles.cardActions} ref={activeSettingsId === form.id ? settingsRef : null}>
                                    <button 
                                        className={clsx(styles.settingsBtn, { [styles.active]: activeSettingsId === form.id })}
                                        onClick={(e) => handleOpenSettings(e, form)}
                                        style={{ color: textTheme.color }}
                                        title="Card Customization"
                                    >
                                        <Palette size={16} />
                                    </button>

                                    {activeSettingsId === form.id && (
                                        <div className={styles.settingsDropdown} onClick={e => e.stopPropagation()}>
                                            <div className={styles.settingsSection}>
                                                <span className={styles.settingsLabel}>Box Background</span>
                                                <div className={styles.colorGrid}>
                                                    {BOX_COLORS.map(c => (
                                                        <div key={c.value} className={styles.swatchWrapper}>
                                                            <button 
                                                                className={clsx(styles.colorCircle, { [styles.active]: tempStyles?.boxColor === c.value && !tempStyles?.customBg })}
                                                                style={{ backgroundColor: c.bg, border: '1px solid #ddd' }}
                                                                onClick={() => handleSelectColor('boxColor', c.value)}
                                                                title={c.name}
                                                            >
                                                                {tempStyles?.boxColor === c.value && !tempStyles?.customBg && <Check size={14} color={c.accent} />}
                                                            </button>
                                                            <span className={styles.swatchLabel}>{c.name}</span>
                                                        </div>
                                                    ))}
                                                    <div className={styles.swatchWrapper}>
                                                        <button 
                                                            className={clsx(styles.colorCircle, { [styles.active]: tempStyles?.boxColor === 'custom' })}
                                                            style={{ 
                                                                background: tempStyles?.customBg || 'linear-gradient(135deg, #f97316, #8b5cf6, #06b6d4)', 
                                                                border: '1px solid #ddd' 
                                                            }} 
                                                            title="Pick Custom Color"
                                                            onClick={() => customBgRef.current?.click()}
                                                        >
                                                            {tempStyles?.boxColor === 'custom' && <Check size={14} color="#fff" />}
                                                        </button>
                                                        <span className={styles.swatchLabel}>Custom</span>
                                                        <input 
                                                            ref={customBgRef}
                                                            type="color" 
                                                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                                                            value={tempStyles?.customBg || '#ffffff'}
                                                            onChange={e => handleCustomColor('boxColor', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                {tempStyles?.customBg && (
                                                    <div className={styles.customColorPreview}>
                                                        <span style={{ background: tempStyles.customBg }} className={styles.customColorDot} />
                                                        <span className={styles.customColorHex}>{tempStyles.customBg}</span>
                                                        <button className={styles.customColorChange} onClick={() => customBgRef.current?.click()}>Change</button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className={styles.settingsSection}>
                                                <span className={styles.settingsLabel}>Text Color</span>
                                                <div className={styles.colorGrid}>
                                                    {TEXT_COLORS.map(c => (
                                                        <div key={c.value} className={styles.swatchWrapper}>
                                                            <button 
                                                                className={clsx(styles.colorCircle, { [styles.active]: tempStyles?.textColor === c.value && !tempStyles?.customText })}
                                                                style={{ backgroundColor: c.color, border: '1px solid #ddd' }}
                                                                onClick={() => handleSelectColor('textColor', c.value)}
                                                                title={c.name}
                                                            >
                                                                {tempStyles?.textColor === c.value && !tempStyles?.customText && <Check size={14} color={c.value === 'white' ? '#333' : '#fff'} />}
                                                            </button>
                                                            <span className={styles.swatchLabel}>{c.name}</span>
                                                        </div>
                                                    ))}
                                                    <div className={styles.swatchWrapper}>
                                                        <button 
                                                            className={clsx(styles.colorCircle, { [styles.active]: tempStyles?.textColor === 'custom' })}
                                                            style={{ 
                                                                background: tempStyles?.customText || 'linear-gradient(135deg, #f97316, #8b5cf6, #06b6d4)', 
                                                                border: '1px solid #ddd' 
                                                            }} 
                                                            title="Pick Custom Text Color"
                                                            onClick={() => customTextRef.current?.click()}
                                                        >
                                                            {tempStyles?.textColor === 'custom' && <Check size={14} color="#fff" />}
                                                        </button>
                                                        <span className={styles.swatchLabel}>Custom</span>
                                                        <input 
                                                            ref={customTextRef}
                                                            type="color" 
                                                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                                                            value={tempStyles?.customText || '#1f2937'}
                                                            onChange={e => handleCustomColor('textColor', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                {tempStyles?.customText && (
                                                    <div className={styles.customColorPreview}>
                                                        <span style={{ background: tempStyles.customText }} className={styles.customColorDot} />
                                                        <span className={styles.customColorHex}>{tempStyles.customText}</span>
                                                        <button className={styles.customColorChange} onClick={() => customTextRef.current?.click()}>Change</button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className={styles.settingsFooter}>
                                                <div className={styles.primaryActions}>
                                                    <button className={styles.applyBtn} onClick={handleApply}>
                                                        Apply / Save
                                                    </button>
                                                    <button className={styles.cancelBtn} onClick={handleCancel}>
                                                        Cancel
                                                    </button>
                                                </div>
                                                <div className={styles.secondaryActions}>
                                                    <button className={styles.resetCardBtn} onClick={handleResetCard}>
                                                        <RotateCcw size={12} className="mr-1" />
                                                        Reset Style
                                                    </button>
                                                    <button className={styles.removeCardBtn} onClick={() => togglePin(form.id)}>
                                                        <PinOff size={12} className="mr-1" />
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <Card 
                                    className={styles.formCard} 
                                    onClick={() => handleFormClick(form)}
                                    style={{ 
                                        '--card-bg': resolvedBg,
                                        '--card-accent': resolvedAccent,
                                        '--text-color': resolvedText,
                                        '--border-color': resolvedBg === '#ffffff' ? '#e5e7eb' : resolvedAccent
                                    }}
                                >
                                    {!activeSettingsId && (
                                        <div className={styles.dragHandle} style={{ color: textTheme.color, opacity: 0.3 }}>
                                            <GripVertical size={14} />
                                        </div>
                                    )}
                                    
                                    <div className={styles.cardIcon}>
                                        {renderIcon(form.icon, styles.icon, { color: resolvedAccent })}
                                    </div>
                                    <div className={styles.cardBody}>
                                        <h3 className={styles.formName} style={{ color: resolvedText }}>{form.title}</h3>
                                        <span className={styles.actionText} style={{ color: resolvedText, opacity: 0.6 }}>Open Form</span>
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
                                <Plus size={28} />
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
