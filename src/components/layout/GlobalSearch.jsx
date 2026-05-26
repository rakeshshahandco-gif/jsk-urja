import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Command, FileText, Layout, Settings, AlertCircle, ShieldCheck, BarChart3, Receipt, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ALL_FORMS } from '@/config/forms.config';
import { menuConfig } from '@/config/menu.config';
import { useAuth } from '@/hooks/useAuth';
import { hasPermission } from '@/utils/permissions';
import styles from './GlobalSearch.module.scss';

/**
 * Builds a unified, deduplicated search catalog from two sources:
 *   1. forms.config.js  — explicit module/form registrations (primary metadata)
 *   2. menu.config.js   — sidebar navigation tree (auto-included for any item with a path)
 *
 * Adding to EITHER file makes an item automatically searchable.
 * forms.config.js entries win on deduplication (richer metadata).
 */
function buildSearchCatalog() {
    const seen = new Set();
    const catalog = [];

    // 1. Primary: ALL_FORMS (forms.config.js)
    ALL_FORMS.forEach(form => {
        if (form.path && !seen.has(form.path)) {
            seen.add(form.path);
            catalog.push({ ...form, _source: 'forms' });
        }
    });

    // 2. Secondary: flatten menuConfig children that have a path
    const flattenMenu = (items, parentTitle = '') => {
        items.forEach(item => {
            if (item.children && item.children.length > 0) {
                flattenMenu(item.children, item.title);
            }
            if (item.path && !seen.has(item.path)) {
                seen.add(item.path);
                catalog.push({
                    id: item.id,
                    title: item.title,
                    path: item.path,
                    module: parentTitle || item.title,
                    permission: item.permission,
                    icon: 'menu',
                    _source: 'menu',
                });
            }
        });
    };
    flattenMenu(menuConfig);

    return catalog;
}

// Built once at module load time — updates automatically when either config changes
const SEARCH_CATALOG = buildSearchCatalog();

const getIcon = (item) => {
    if (item.icon === 'report' || item.icon === 'chart' || item.module?.includes('Report')) return <BarChart3 size={14} />;
    if (item.icon === 'security' || item.module === 'Admin') return <ShieldCheck size={14} />;
    if (item.icon === 'receipt' || item.icon === 'voucher' || item.module?.includes('Voucher')) return <Receipt size={14} />;
    if (item.icon === 'accounts' || item.icon === 'account-master') return <BookOpen size={14} />;
    if (item.module === 'Admin' || item.icon === 'settings') return <Settings size={14} />;
    return <Layout size={14} />;
};

export const GlobalSearch = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { user } = useAuth();
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const searchRef = useRef(null);

    // Filter catalog based on user permissions and search query
    const results = useMemo(() => {
        if (!query.trim()) return [];

        const q = query.toLowerCase();
        const userPermissions = user?.permissions || [];
        const userRole = user?.roleName || (typeof user?.role === 'string' ? user.role : user?.role?.name);

        return SEARCH_CATALOG.filter(form => {
            // 1. Permission check
            if (form.permission && user) {
                if (!hasPermission(userPermissions, form.permission, userRole)) return false;
            }
            // 2. Query match — title, module, id, or keywords in path
            return (
                form.title.toLowerCase().includes(q) ||
                form.module.toLowerCase().includes(q) ||
                (form.id && form.id.toLowerCase().replace(/-/g, ' ').includes(q))
            );
        }).slice(0, 12);
    }, [query, user]);

    // Handle Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
                inputRef.current?.blur();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleSelect = (form) => {
        if (!form) return;
        navigate(form.path);
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[selectedIndex]) {
                handleSelect(results[selectedIndex]);
            }
        }
    };

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={styles.container} ref={searchRef}>
            <div className={`${styles.searchBox} ${isOpen ? styles.active : ''}`}>
                <Search size={16} className={styles.searchIcon} />
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.input}
                    placeholder="Search..."
                    value={query}
                    onFocus={() => setIsOpen(true)}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                        setSelectedIndex(0);
                    }}
                    onKeyDown={onKeyDown}
                />
                <div className={styles.shortcut}>
                    <Command size={10} />
                    <span>K</span>
                </div>
            </div>

            {/* Dropdown Results */}
            {isOpen && query.trim() !== '' && (
                <div className={styles.dropdown}>
                    {results.length > 0 ? (
                        <div className={styles.resultsList}>
                            {results.map((result, index) => (
                                <div
                                    key={result.id || result.path}
                                    className={`${styles.resultItem} ${index === selectedIndex ? styles.selected : ''}`}
                                    onClick={() => handleSelect(result)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <div className={styles.iconWrapper}>
                                        {getIcon(result)}
                                    </div>
                                    <div className={styles.info}>
                                        <div className={styles.title}>{result.title}</div>
                                        <div className={styles.module}>{result.module}</div>
                                    </div>
                                </div>
                            ))}
                            <div style={{ padding: '6px 14px', fontSize: 10, color: '#94a3b8', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
                                <span>↑↓ navigate &nbsp; ↵ open &nbsp; Esc close</span>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.noResults}>
                            <AlertCircle size={14} />
                            <span>No results for &ldquo;{query}&rdquo;</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
