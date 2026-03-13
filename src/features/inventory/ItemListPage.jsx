import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, RotateCcw, Pencil, Trash2, ChevronLeft, ChevronRight, Package, Upload } from 'lucide-react';
import { getItems, deleteItem, exportItemsExcel, exportItemsPDF, importItemsExcel, exportItemTemplate } from '@/services/itemApi';
import { FileDown, FileText } from 'lucide-react';
import { getItemTypes } from '@/services/itemTypeApi';
import { getItemGroups } from '@/services/itemGroupApi';
import { useToast } from '@/components/ui/Toast';
import { useGlobalSync } from '@/hooks/useGlobalSync';

const CATEGORIES = [
    { value: '', label: 'All Categories' },
    { value: 'RAW_MATERIAL', label: 'Raw Material' },
    { value: 'WIP', label: 'WIP / Semi-Finished' },
    { value: 'FINISHED_GOOD', label: 'Finished Good' },
    { value: 'TRADING', label: 'Trading Item' },
    { value: 'CONSUMABLE', label: 'Consumable' },
];

// Initial static types as fallback, will be augmented by API
const STATIC_TYPES = [
    { value: '', label: 'All Types' },
    { value: 'ELECTRICAL', label: 'Electrical' },
    { value: 'PCB', label: 'PCB' },
    { value: 'HOUSING', label: 'Housing' },
    { value: 'IC', label: 'IC' },
    { value: 'RESISTOR', label: 'Resistor' },
    { value: 'CAPACITOR', label: 'Capacitor' },
    { value: 'TRANSFORMER', label: 'Transformer' },
    { value: 'WIRE', label: 'Wire' },
    { value: 'PACKAGING', label: 'Packaging' },
    { value: 'FINISHED_PRODUCT', label: 'Finished Product' },
    { value: 'OTHER', label: 'Other' },
];

const catColors = {
    RAW_MATERIAL: { bg: '#fef9c3', color: '#854d0e' },
    WIP: { bg: '#fce7f3', color: '#9d174d' },
    FINISHED_GOOD: { bg: '#dcfce7', color: '#166534' },
    TRADING: { bg: '#dbeafe', color: '#1e40af' },
    CONSUMABLE: { bg: '#f3f4f6', color: '#374151' },
};

const catLabel = {
    RAW_MATERIAL: 'Raw Matl', WIP: 'WIP', FINISHED_GOOD: 'Finished',
    TRADING: 'Trading', CONSUMABLE: 'Consumable'
};

const s = {
    sel: { height: 32, fontSize: 13, padding: '0 24px 0 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', outline: 'none', cursor: 'pointer', appearance: 'none', minWidth: 120, backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '0.9em' },
    inp: { height: 32, fontSize: 13, padding: '0 8px 0 24px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', outline: 'none', flex: 1 },
    th: { padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
    td: { padding: '10px 12px', fontSize: 15, color: '#1e293b', verticalAlign: 'middle', borderBottom: '1px solid #f3f4f6' },
};

const ItemListPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [items, setItems] = useState([]);
    const [types, setTypes] = useState(STATIC_TYPES);
    const [groups, setGroups] = useState([{ value: '', label: 'All Groups' }]);
    const [loading, setLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef(null);
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [groupFilter, setGroupFilter] = useState('');
    const [activeFilter, setActiveFilter] = useState('true');
    const [sortBy, setSortBy] = useState('itemCode:asc');
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({ total: 0, pages: 1 });
    const limit = 25;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page,
                limit,
                search: search || undefined,
                itemCategory: catFilter || undefined,
                itemType: typeFilter || undefined,
                itemGroupName: groupFilter || undefined,
                isActive: activeFilter,
                sortBy
            };
            const res = await getItems(params);
            setItems(res.data || []);
            setMeta(res.meta || { total: 0, pages: 1 });
        } catch (err) {
            console.error('Load Items Error:', err);
            addToast(err?.response?.data?.message || 'Failed to load items', 'error');
        } finally { setLoading(false); }
    }, [page, search, catFilter, typeFilter, groupFilter, activeFilter, sortBy]);

    useEffect(() => { load(); }, [load]);

    useGlobalSync('item', (payload) => {
        if (payload.action === 'create') setItems(prev => [payload.data, ...prev].slice(0, limit));
        else if (payload.action === 'update') setItems(prev => prev.map(i => i._id === payload.recordId ? { ...i, ...payload.data } : i));
        else if (payload.action === 'delete') setItems(prev => prev.filter(i => i._id !== payload.recordId));
    });

    useEffect(() => {
        getItemTypes().then(data => {
            if (data && data.length > 0) {
                const dynamicTypes = data.map(t => ({ value: t.code, label: t.name }));
                setTypes([{ value: '', label: 'All Types' }, ...dynamicTypes]);
            }
        }).catch(err => console.error('Failed to fetch item types', err));

        getItemGroups().then(data => {
            if (data && data.length > 0) {
                const dynamicGroups = data.map(g => ({ value: g.name, label: g.name }));
                setGroups([{ value: '', label: 'All Groups' }, ...dynamicGroups]);
            }
        }).catch(err => console.error('Failed to fetch item groups', err));
    }, []);

    const reset = () => { setSearch(''); setCatFilter(''); setTypeFilter(''); setGroupFilter(''); setActiveFilter('true'); setSortBy('itemCode:asc'); setPage(1); };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Deactivate "${name}"?`)) return;
        try { await deleteItem(id); addToast('Item deactivated', 'success'); load(); }
        catch { addToast('Failed to deactivate item', 'error'); }
    };

    const toggleSort = (field) => {
        const [currField, currDir] = sortBy.split(':');
        if (currField === field) {
            setSortBy(`${field}:${currDir === 'asc' ? 'desc' : 'asc'}`);
        } else {
            setSortBy(`${field}:asc`);
        }
        setPage(1);
    };

    const handleExportExcel = async () => {
        try {
            const params = {
                search: search || undefined,
                itemCategory: catFilter || undefined,
                itemType: typeFilter || undefined,
                itemGroupName: groupFilter || undefined,
                isActive: activeFilter,
                sortBy
            };
            const blob = await exportItemsExcel(params);
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Item_Master_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (err) {
            console.error('Export Excel Error:', err);
            addToast('Failed to export Excel', 'error');
        }
    };

    const handleExportPDF = async () => {
        try {
            const params = {
                search: search || undefined,
                itemCategory: catFilter || undefined,
                itemType: typeFilter || undefined,
                itemGroupName: groupFilter || undefined,
                isActive: activeFilter,
                sortBy
            };
            const blob = await exportItemsPDF(params);
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Item_Master_${new Date().toISOString().split('T')[0]}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (err) {
            console.error('Export PDF Error:', err);
            addToast('Failed to export PDF', 'error');
        }
    };

    const handleExportTemplate = async () => {
        try {
            const blob = await exportItemTemplate();
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'Item_Master_Template.xlsx');
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            addToast('Template downloaded successfully', 'success');
        } catch (err) {
            console.error('Export Template Error:', err);
            addToast('Failed to export template', 'error');
        }
    };

    const handleImportExcel = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const res = await importItemsExcel(file);
            addToast(res.message || 'Import successful', 'success');
            load(); // Reload the list
        } catch (err) {
            console.error('Import Error:', err);
            addToast(err?.response?.data?.message || 'Failed to import items', 'error');
            if (err?.response?.data?.errors) {
                // If there are detailed element errors
                console.error('Import Details:', err.response.data.errors);
            }
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
        }
    };

    const SortIndicator = ({ field }) => {
        const [currField, currDir] = sortBy.split(':');
        if (currField !== field) return <span style={{ color: '#d1d5db', marginLeft: 4, fontSize: 10 }}>↕</span>;
        return <span style={{ color: '#2563eb', marginLeft: 4, fontSize: 10 }}>{currDir === 'asc' ? '▲' : '▼'}</span>;
    };

    return (
        <div style={{ padding: '10px 16px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Package size={16} style={{ color: '#2563eb' }} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Item Master</span>
                    <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '1px 8px', borderRadius: 10, fontWeight: 600 }}>{meta.total} items</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        style={{ display: 'none' }}
                        ref={fileInputRef}
                        onChange={handleImportExcel}
                    />
                    <button
                        onClick={handleExportTemplate}
                        style={{ height: 30, padding: '0 12px', background: '#f8fafc', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                        title="Download Format for Import"
                        disabled={isImporting}
                    >
                        <FileText size={13} /> Template
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{ height: 30, padding: '0 12px', background: isImporting ? '#9ca3af' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: isImporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                        title="Import Items from Excel"
                        disabled={isImporting}
                    >
                        {isImporting ? <div style={{ width: 13, height: 13, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
                        {isImporting ? 'Importing...' : 'Import'}
                    </button>

                    <div style={{ width: 1, height: 20, background: '#d1d5db', margin: '0 4px' }} />

                    <button
                        onClick={handleExportExcel}
                        style={{ height: 30, padding: '0 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                        title="Export All Filtered Data to Excel"
                    >
                        <FileDown size={13} /> Excel
                    </button>
                    <button
                        onClick={handleExportPDF}
                        style={{ height: 30, padding: '0 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                        title="Export All Filtered Data to PDF"
                    >
                        <FileText size={13} /> PDF
                    </button>
                    <button
                        onClick={() => navigate('/inventory/items/new')}
                        style={{ height: 30, padding: '0 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                        <Plus size={13} /> New Item
                    </button>
                </div>
            </div>

            {/* Filter bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, padding: '6px 10px' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
                    <Search size={11} style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input style={s.inp} placeholder="Search code, name, HSN…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <select style={s.sel} value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <select style={s.sel} value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setPage(1); }}>
                    {groups.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
                <select style={s.sel} value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
                    {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select style={s.sel} value={activeFilter} onChange={e => { setActiveFilter(e.target.value); setPage(1); }}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                    <option value="">All Status</option>
                </select>
                <select style={s.sel} value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}>
                    <option value="itemCode:asc">Sort: Item Code (A-Z)</option>
                    <option value="itemName:asc">Sort: Item Name (A-Z)</option>
                    <option value="itemGroupName:asc">Sort: Group (A-Z)</option>
                    <option value="currentStock:desc">Sort: Stock (High-Low)</option>
                </select>
                <button onClick={reset} style={{ height: 28, padding: '0 10px', fontSize: 11, fontWeight: 600, border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RotateCcw size={11} /> Reset
                </button>
            </div>

            {/* Table */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', flex: 1 }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, gap: 8, color: '#6b7280', fontSize: 12 }}>
                        <div style={{ width: 16, height: 16, border: '2px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        Loading items...
                    </div>
                ) : items.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180, color: '#9ca3af', gap: 8 }}>
                        <Package size={32} style={{ opacity: 0.3 }} />
                        <span style={{ fontSize: 13 }}>No items found</span>
                        <button onClick={() => navigate('/inventory/items/new')} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>+ Create your first item</button>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={s.th}>#</th>
                                    <th style={{ ...s.th, cursor: 'pointer' }} onClick={() => toggleSort('itemCode')}>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>Item Code <SortIndicator field="itemCode" /></div>
                                    </th>
                                    <th style={{ ...s.th, cursor: 'pointer' }} onClick={() => toggleSort('itemName')}>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>Item Name <SortIndicator field="itemName" /></div>
                                    </th>
                                    <th style={{ ...s.th, cursor: 'pointer' }} onClick={() => toggleSort('itemGroupName')}>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>Group <SortIndicator field="itemGroupName" /></div>
                                    </th>
                                    <th style={s.th}>Category</th>
                                    <th style={s.th}>Type</th>
                                    <th style={s.th}>UOM</th>
                                    <th style={{ ...s.th, textAlign: 'right' }}>Stock</th>
                                    <th style={{ ...s.th, textAlign: 'right' }}>Faulty</th>
                                    <th style={{ ...s.th, textAlign: 'right' }}>Rate ₹</th>
                                    <th style={{ ...s.th, textAlign: 'center' }}>⚙</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => {
                                    const cStyle = catColors[item.itemCategory] || { bg: '#f3f4f6', color: '#374151' };
                                    const rowBg = idx % 2 === 0 ? '#fff' : '#fafafa';
                                    return (
                                        <tr key={item._id}
                                            style={{ background: rowBg }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                            onMouseLeave={e => e.currentTarget.style.background = rowBg}
                                        >
                                            <td style={{ ...s.td, color: '#9ca3af', fontSize: 12 }}>{(page - 1) * limit + idx + 1}</td>
                                            <td style={s.td}>
                                                <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#2563eb' }}>{item.itemCode}</span>
                                            </td>
                                            <td style={s.td}>
                                                <div style={{ fontWeight: 700, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.itemName}>{item.itemName}</div>
                                                {item.hsnCode && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>HSN: {item.hsnCode}</div>}
                                            </td>
                                            <td style={s.td}>
                                                <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{item.itemGroupName || '—'}</span>
                                            </td>
                                            <td style={s.td}>
                                                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: cStyle.bg, color: cStyle.color, textTransform: 'uppercase' }}>
                                                    {catLabel[item.itemCategory] || item.itemCategory}
                                                </span>
                                            </td>
                                            <td style={{ ...s.td, color: '#6b7280' }}>
                                                {typeof item.itemType === 'string' ? item.itemType.replace('_', ' ') : (item.itemType || '—')}
                                            </td>
                                            <td style={s.td}>{item.uom}</td>
                                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: item.currentStock <= item.minStockLevel ? '#dc2626' : '#374151' }}>
                                                {item.currentStock ?? 0}
                                                {item.currentStock <= item.minStockLevel && item.minStockLevel > 0 && (
                                                    <span style={{ fontSize: 9, color: '#dc2626', marginLeft: 4 }}>LOW</span>
                                                )}
                                            </td>
                                            <td style={{ ...s.td, textAlign: 'right', color: '#dc2626' }}>
                                                {item.faultyStock ?? 0}
                                            </td>
                                            <td style={{ ...s.td, textAlign: 'right' }}>₹{(item.sellingPrice || 0).toFixed(2)}</td>
                                            <td style={{ ...s.td, textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                                    <button onClick={() => navigate(`/inventory/items/${item._id}`)}
                                                        title="Edit" style={{ width: 24, height: 24, border: '1px solid #dbeafe', borderRadius: 4, background: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                                                        <Pencil size={11} />
                                                    </button>
                                                    <button onClick={() => handleDelete(item._id, item.itemName)}
                                                        title="Deactivate" style={{ width: 24, height: 24, border: '1px solid #fee2e2', borderRadius: 4, background: '#fef2f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                                                        <Trash2 size={11} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {meta.total > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{((page - 1) * limit) + 1}–{Math.min(page * limit, meta.total)} of {meta.total}</span>
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                        style={{ height: 26, width: 26, border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: page <= 1 ? 0.4 : 1 }}>
                        <ChevronLeft size={13} />
                    </button>
                    {[...Array(Math.min(meta.pages, 7))].map((_, i) => (
                        <button key={i} onClick={() => setPage(i + 1)}
                            style={{ height: 26, minWidth: 26, padding: '0 4px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: page === i + 1 ? '#2563eb' : '#fff', color: page === i + 1 ? '#fff' : '#374151' }}>
                            {i + 1}
                        </button>
                    ))}
                    <button disabled={page >= meta.pages} onClick={() => setPage(p => p + 1)}
                        style={{ height: 26, width: 26, border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', cursor: page >= meta.pages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: page >= meta.pages ? 0.4 : 1 }}>
                        <ChevronRight size={13} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default ItemListPage;
