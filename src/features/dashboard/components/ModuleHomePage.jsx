import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Plus, 
    Star, 
    X, 
    History, 
    ChevronRight,
    Users,
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
    FileText,
    TrendingUp,
    ShieldAlert,
    PieChart,
    Timer,
    Globe
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Card, Modal } from '@/components/ui';
import { PATHS } from '@/routes/paths';
import styles from '../DashboardPage.module.scss'; // Reuse dashboard styles
import moduleStyles from './ModuleHome.module.scss'; // New module specific styles
import clsx from 'clsx';
import { toast } from 'react-hot-toast';
import { userHomeService } from '@/services/userHome.service';
import { ALL_FORMS } from '@/config/forms.config';
import { MENU_FEATURE_BY_ID } from '@/config/menuFeatureMap';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { useModuleGuard } from '@/contexts/ModuleGuardContext';
import { moduleForFormId } from '@/config/menuModuleMap';

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
    'supplier': UserCheck,
    'chart': TrendingUp,
    'security': ShieldAlert,
    'analytics': PieChart,
    'time': Timer,
    'globe': Globe
};

const ModuleHomePage = ({ moduleName, title, subtitle, isStatic = false }) => {
    const navigate = useNavigate();
    const { user, hasPermission } = useAuth();
    const { selectedCompany } = useCompany();
    const { isFeatureEnabled, settings: featureSettings } = useFeatureSettings();
    const { isModuleEnabled, moduleGuardEnabled } = useModuleGuard();
    const isTextileCo = isTextileIndustryCompany(selectedCompany);

    const isFormAllowed = (form) => {
        if (form.textileOnly && !isTextileCo) return false;
        if (form.electronicsOnly && isTextileCo) return false;
        if (moduleGuardEnabled) {
            const code = moduleForFormId(form.id);
            if (code && !isModuleEnabled(code)) return false;
        }
        return true;
    };

    const isFormFeatureOn = (formId) => {
        const path = MENU_FEATURE_BY_ID[formId];
        if (!path) return true;
        return isFeatureEnabled(path);
    };
    const [pinnedFormsData, setPinnedFormsData] = useState([]);
    const [recentForms, setRecentForms] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [draggedIndex, setDraggedIndex] = useState(null);

    // Load preferences or static data
    const loadData = async () => {
        try {
            setIsLoading(true);
            if (isStatic) {
                // For static pages, we just use the ALL_FORMS filtered by module
                const normalizedModuleName = moduleName.toLowerCase().replace(/\s/g, '-');
                const moduleForms = ALL_FORMS.filter(f => {
                    const normalizedFModule = f.module.toLowerCase().replace(/\s/g, '-');
                    if (normalizedFModule !== normalizedModuleName && f.module !== moduleName) return false;
                    if (!isFormAllowed(f)) return false;
                    if (!isFormFeatureOn(f.id)) return false;
                    return true;
                });
                
                // Map to the same structure as preference data for compatibility
                setPinnedFormsData(moduleForms.map((f, idx) => ({
                    id: f.id,
                    boxColor: 'default',
                    textColor: 'default',
                    orderNo: idx
                })));
            } else {
                const response = await userHomeService.getPreferences(moduleName);
                if (response.success) {
                    setPinnedFormsData(response.data.selectedCards || []);
                }
            }
        } catch (error) {
            console.error(`Failed to load ${moduleName} data`, error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (user && moduleName) {
            loadData();
            
            if (!isStatic) {
                // Load module-specific recents from localStorage
                const RECENT_KEY = `module_recent_${user?._id || user?.id}_${moduleName}`;
                const savedRecent = localStorage.getItem(RECENT_KEY);
                if (savedRecent) {
                    setRecentForms(JSON.parse(savedRecent));
                }
            }
        }
    }, [user, moduleName, isStatic, featureSettings]);

    const savePreferences = async (newData) => {
        if (isStatic) return;
        try {
            await userHomeService.updatePreferences(newData, moduleName);
        } catch (error) {
            console.error(`Failed to save ${moduleName} preferences`, error);
        }
    };

    const resetToDefault = async () => {
        if (isStatic) return;
        try {
            setIsLoading(true);
            const response = await userHomeService.resetPreferences(moduleName);
            if (response.success) {
                setPinnedFormsData(response.data.selectedCards || []);
                toast.success('Settings reset to defaults');
            }
        } catch (error) {
            console.error(`Failed to reset ${moduleName} preferences`, error);
            toast.error('Failed to reset settings');
        } finally {
            setIsLoading(false);
        }
    };

    const pinnedForms = useMemo(() => {
        return pinnedFormsData
            .map(data => {
                const form = ALL_FORMS.find(f => f.id === data.id);
                if (!form || !isFormAllowed(form) || !hasPermission(form.permission) || !isFormFeatureOn(form.id)) return null;
                
                return { 
                    ...form, 
                    orderNo: data.orderNo 
                };
            })
            .filter(Boolean)
            .sort((a, b) => (a.orderNo || 0) - (b.orderNo || 0));
    }, [pinnedFormsData, hasPermission, isTextileCo]);

    const filteredAvailable = useMemo(() => {
        if (isStatic) return []; // Not used in static mode
        
        const relevantForms = moduleName === 'dashboard' 
            ? ALL_FORMS 
            : ALL_FORMS.filter(f => f.module.toLowerCase().replace(/\s/g, '-') === moduleName || f.module === moduleName);

        const permitted = relevantForms.filter(f => isFormAllowed(f) && hasPermission(f.permission) && isFormFeatureOn(f.id));

        if (!searchTerm) return permitted;
        return permitted.filter(f => 
            f.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
            f.module.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [moduleName, hasPermission, searchTerm, isStatic, isTextileCo]);

    const groupedAvailable = useMemo(() => {
        const groups = {};
        filteredAvailable.forEach(f => {
            if (!groups[f.module]) groups[f.module] = [];
            groups[f.module].push(f);
        });
        return groups;
    }, [filteredAvailable]);

    const togglePin = async (formId) => {
        if (isStatic) return;
        const existing = pinnedFormsData.find(p => p.id === formId);
        let newData;
        
        if (existing) {
            newData = pinnedFormsData.filter(p => p.id !== formId);
        } else {
            newData = [...pinnedFormsData, { 
                id: formId, 
                boxColor: 'default', 
                textColor: 'default', 
                orderNo: pinnedFormsData.length 
            }];
        }
        
        setPinnedFormsData(newData);
        await savePreferences(newData);
    };

    const handleFormClick = (form) => {
        // Save to module-specific recents
        if (!isStatic) {
            const RECENT_KEY = `module_recent_${user?._id || user?.id}_${moduleName}`;
            const currentRecents = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            const updatedRecents = [
                { id: form.id, title: form.title, path: form.path, icon: form.icon, timestamp: new Date().toISOString() },
                ...currentRecents.filter(r => r.id !== form.id)
            ].slice(0, 5);
            localStorage.setItem(RECENT_KEY, JSON.stringify(updatedRecents));
        }
        
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
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        return date.toLocaleDateString();
    };

    const onDragStart = (e, index) => {
        if (isStatic || activeSettingsId) return e.preventDefault();
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = (e, index) => {
        if (isStatic) return;
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
        if (isStatic) return;
        setDraggedIndex(null);
        await savePreferences(pinnedFormsData);
    };

    // Calculate dynamic card size based on count
    const cardCount = pinnedForms.length;
    let sizeClass = 'medium';
    if (cardCount > 0 && cardCount <= 4) sizeClass = 'large';
    else if (cardCount >= 9) sizeClass = 'compact';

    if (isLoading) {
        return <div className={styles.loadingContainer}>Loading {title}...</div>;
    }

    return (
        <div className={clsx(styles.container, moduleStyles.moduleContainer, { [moduleStyles.isStatic]: isStatic })}>
            <header className={styles.header}>
                <div className={styles.titleSection}>
                    <h1 className={styles.title}>{title || 'Home'}</h1>
                    <p className={styles.subtitle}>{subtitle || (isStatic ? 'Available Forms' : 'Your Quick Access Forms')}</p>
                </div>
                {!isStatic && (
                    <div className={styles.headerActions}>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={resetToDefault}
                            className={styles.resetBtn}
                        >
                            <RotateCcw size={14} className="mr-2" />
                            Reset
                        </Button>
                    </div>
                )}
            </header>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>{isStatic ? 'Forms' : 'My Forms'}</h2>
                    {!isStatic && <span className={styles.hint}>Drag to reorder</span>}
                </div>

                <div className={clsx(styles.grid, moduleStyles.dynamicGrid, moduleStyles[sizeClass])}>
                    {pinnedForms.map((form, index) => {
                        return (
                            <div 
                                key={form.id} 
                                className={clsx(styles.cardWrapper, { 
                                    [styles.isDragging]: draggedIndex === index,
                                    [moduleStyles.staticWrapper]: isStatic
                                })}
                                draggable={!isStatic}
                                onDragStart={(e) => onDragStart(e, index)}
                                onDragOver={(e) => onDragOver(e, index)}
                                onDragEnd={onDragEnd}
                            >
                                <Card 
                                    className={clsx(styles.formCard, moduleStyles.dynamicCard, { [moduleStyles.staticCard]: isStatic })} 
                                    onClick={() => handleFormClick(form)}
                                >
                                    {!isStatic && (
                                        <div className={styles.dragHandle}>
                                            <GripVertical size={14} />
                                        </div>
                                    )}
                                    
                                    <div className={clsx(styles.cardIcon, moduleStyles.cardIconWrap)}>
                                        {renderIcon(form.icon, styles.icon)}
                                    </div>
                                    <div className={styles.cardBody}>
                                        <h3 className={clsx(styles.formName, moduleStyles.cardTitle)}>{form.title}</h3>
                                        <span className={styles.actionText}>Open Form</span>
                                    </div>
                                </Card>
                            </div>
                        );
                    })}

                    {!isStatic && (
                        <div className={styles.cardWrapper}>
                            <Card 
                                className={clsx(styles.formCard, styles.addCard, moduleStyles.dynamicCard)} 
                                onClick={() => setIsAddModalOpen(true)}
                            >
                                <div className={styles.addIcon}>
                                    <Plus size={28} />
                                </div>
                                <div className={styles.cardBody}>
                                    <h3 className={styles.formName}>Pin Form</h3>
                                    <span className={styles.actionText}>Add more</span>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </section>

            {!isStatic && recentForms.length > 0 && (
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
                                onClick={() => navigate(form.path)}
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

            {!isStatic && isAddModalOpen && (
                <Modal
                    onClose={() => setIsAddModalOpen(false)}
                    title="Pin Forms"
                    size="lg"
                >
                    <div className={styles.modalContent}>
                        <div className={styles.searchBar}>
                            <Search size={18} className={styles.searchIcon} />
                            <input 
                                type="text" 
                                placeholder="Search forms..." 
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
                            {Object.entries(groupedAvailable).map(([module, forms]) => (
                                <div key={module} className={styles.moduleGroup}>
                                    <h3 className={styles.moduleTitle}>{module}</h3>
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

export default ModuleHomePage;
