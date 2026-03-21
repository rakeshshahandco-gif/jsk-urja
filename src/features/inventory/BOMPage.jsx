import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardList,
    Plus,
    Search,
    Filter,
    MoreVertical,
    Eye,
    Pencil,
    Trash2,
    CheckCircle2,
    Clock,
    XCircle,
    ChevronRight,
    Search as SearchIcon,
    Filter as FilterIcon,
    Upload,
    FileDown,
    FileText,
    Save
} from 'lucide-react';
import { getBOMs, deleteBOM, exportBOMTemplate, importBOMsExcel, exportBOMList } from '@/services/bomApi';
import { PATHS } from '@/routes/paths';
import { useToast } from '@/components/ui/Toast';

const s = {
    page: { background: '#f8fafc', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", color: '#1e293b' },
    // Header
    header: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 14 },
    title: { fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
    subtitle: { fontSize: 13, color: '#94a3b8', margin: '2px 0 0' },
    createBtn: { padding: '10px 20px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 8px rgba(37,99,235,0.35)' },
    // Filters
    filterBar: { padding: '16px 28px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
    searchWrap: { position: 'relative', flex: 1, minWidth: 280, maxWidth: 400 },
    searchIcon: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' },
    searchInput: { width: '100%', padding: '9px 12px 9px 40px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', transition: 'border-color 0.15s' },
    select: { padding: '9px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer', outline: 'none' },
    clearBtn: { padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
    // Table
    tableCard: { margin: '0 28px 28px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '12px 16px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' },
    td: { padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'middle' },
    // Buttons
    btn: { height: 38, padding: '0 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s', border: 'none' },
    whiteBtn: { background: '#fff', color: '#475569', border: '1.5px solid #e2e8f0' },
    indigoBtn: { background: '#4f46e5', color: '#fff' },
    blueBtn: { background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', boxShadow: '0 2px 8px rgba(37,99,235,0.35)' },
    // Status Badge
    badge: (status) => {
        let colors = { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
        if (status === 'Approved') colors = { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' };
        if (status === 'Draft') colors = { color: '#d97706', bg: '#fffbeb', border: '#fef3c7' };
        if (status === 'Inactive') colors = { color: '#ef4444', bg: '#fef2f2', border: '#fee2e2' };
        return { padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: colors.bg, color: colors.color, border: `1px solid ${colors.border}`, display: 'inline-flex', alignItems: 'center', gap: 5 };
    },
    // Action buttons
    actionBtn: { padding: '6px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};

const BOMPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [boms, setBoms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = React.useRef(null);
    const [filters, setFilters] = useState({ search: '', status: '', bomType: '' });

    const fetchBoms = async () => {
        try {
            setLoading(true);
            const response = await getBOMs({ ...filters, limit: 1000 });
            setBoms(response.data || []);
        } catch (error) {
            addToast('Failed to fetch BOMs', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchBoms(); }, [filters]);

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this BOM?')) {
            try {
                await deleteBOM(id);
                addToast('BOM deleted successfully', 'success');
                fetchBoms();
            } catch (error) {
                addToast('Failed to delete BOM', 'error');
            }
        }
    };

    const handleExportTemplate = async () => {
        try {
            const blob = await exportBOMTemplate();
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'BOM_Import_Template.xlsx');
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            addToast('Template downloaded', 'success');
        } catch (error) {
            addToast('Failed to download template', 'error');
        }
    };

    const handleExportList = async () => {
        try {
            const data = await exportBOMList(filters);
            const url = window.URL.createObjectURL(new Blob([data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'BOM_List.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
            addToast('BOM list exported successfully', 'success');
        } catch (error) {
            addToast('Failed to export BOM list', 'error');
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsImporting(true);
        try {
            const res = await importBOMsExcel(file);
            
            // Check for detailed errors even if success is true
            if (res.errors && res.errors.length > 0) {
                const errorText = res.errors.slice(0, 5).join('\n');
                const summary = `${res.message}${res.errors.length > 5 ? '\n(Check browser console for full log)' : ''}`;
                const fullMsg = `${summary}\n\nDetails:\n${errorText}`;
                
                if (res.successCount > 0) {
                    addToast(fullMsg, 'warning', 10000);
                } else {
                    addToast(fullMsg, 'error', 15000);
                }
                console.error('BOM Import Errors:', res.errors);
            } else {
                addToast(res.message, 'success');
            }
            fetchBoms();
        } catch (error) {
            const msg = error.response?.data?.message || 'Import process failed';
            addToast(msg, 'error');
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'Approved': return <CheckCircle2 size={13} />;
            case 'Draft': return <Clock size={13} />;
            case 'Inactive': return <XCircle size={13} />;
            default: return null;
        }
    };

    return (
        <div style={s.page}>
            {/* Header */}
            <div style={s.header}>
                <div style={s.headerLeft}>
                    <h1 style={s.title}>
                        <ClipboardList size={24} color="#2563eb" />
                        Bill of Materials
                    </h1>
                    <p style={s.subtitle}>{boms.length} master configurations</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImport} accept=".xlsx, .xls" />
                    <button onClick={handleExportTemplate} style={{ ...s.btn, ...s.whiteBtn }}>
                        <FileText size={16} /> Template
                    </button>
                    <button onClick={handleExportList} style={{ ...s.btn, ...s.whiteBtn }}>
                        <Save size={16} /> Export List
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} style={{ ...s.btn, ...s.indigoBtn, opacity: isImporting ? 0.7 : 1 }}>
                        {isImporting ? <div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : <Upload size={16} />}
                        {isImporting ? 'Importing...' : 'Import'}
                    </button>
                    <button
                        onClick={() => navigate(PATHS.INVENTORY.BOM.NEW)}
                        style={{ ...s.btn, ...s.blueBtn }}
                    >
                        <Plus size={18} />
                        Create New BOM
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div style={s.filterBar}>
                <div style={s.searchWrap}>
                    <SearchIcon style={s.searchIcon} size={18} />
                    <input
                        type="text"
                        placeholder="Search BOM#, component or product..."
                        style={s.searchInput}
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                        onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    />
                </div>

                <select style={s.select} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                    <option value="">All Statuses</option>
                    <option value="Draft">Draft</option>
                    <option value="Approved">Approved</option>
                    <option value="Inactive">Inactive</option>
                </select>

                <select style={s.select} value={filters.bomType} onChange={(e) => setFilters({ ...filters, bomType: e.target.value })}>
                    <option value="">All Types</option>
                    <option value="Production">Production</option>
                    <option value="Sub-Assembly">Sub-Assembly</option>
                    <option value="Service BOM">Service BOM</option>
                </select>

                {(filters.search || filters.status || filters.bomType) && (
                    <button onClick={() => setFilters({ search: '', status: '', bomType: '' })} style={s.clearBtn}>
                        Reset
                    </button>
                )}
            </div>

            {/* Table Area */}
            <div style={s.tableCard}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={s.table}>
                        <thead>
                            <tr>
                                <th style={s.th}>BOM Number</th>
                                <th style={s.th}>Finished Product</th>
                                <th style={s.th}>Type</th>
                                <th style={s.th}>Version</th>
                                <th style={s.th}>Quantity</th>
                                <th style={s.th}>Unit Cost</th>
                                <th style={s.th}>Status</th>
                                <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i}>
                                        <td colSpan="8" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Loading BOM records...</td>
                                    </tr>
                                ))
                            ) : boms.length === 0 ? (
                                <tr>
                                    <td colSpan="8" style={{ padding: '80px 24px', textAlign: 'center', color: '#94a3b8' }}>
                                        <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                                        <div style={{ fontSize: 15, fontWeight: 500 }}>No BOMs found</div>
                                        <p style={{ margin: '4px 0 20px', fontSize: 13 }}>Create your first production recipe to see it here.</p>
                                        <button 
                                            onClick={() => navigate(PATHS.INVENTORY.BOM.NEW)}
                                            style={{ ...s.createBtn, margin: '0 auto' }}
                                        >
                                            <Plus size={16} /> Create BOM
                                        </button>
                                    </td>
                                </tr>
                            ) : boms.map((bom) => (
                                <tr key={bom._id} style={{ cursor: 'pointer' }} 
                                    onClick={() => navigate(PATHS.INVENTORY.BOM.EDIT(bom._id))}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <td style={s.td}>
                                        <span style={{ fontWeight: 800, color: '#2563eb' }}>{bom.bomNumber}</span>
                                        {bom.isDefault && (
                                            <span style={{ marginLeft: 8, padding: '2px 6px', background: '#dbeafe', color: '#1e40af', fontSize: 9, fontWeight: 900, borderRadius: 4, textTransform: 'uppercase' }}>Default</span>
                                        )}
                                    </td>
                                    <td style={s.td}>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{bom.finishedProductId?.itemName}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{bom.finishedProductId?.itemCode}</div>
                                    </td>
                                    <td style={s.td}>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{bom.bomType}</span>
                                    </td>
                                    <td style={s.td}>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{bom.version}</span>
                                    </td>
                                    <td style={s.td}>
                                        <span style={{ fontWeight: 600 }}>{bom.productionQuantity} {bom.finishedProductId?.uom || 'NOS'}</span>
                                    </td>
                                    <td style={s.td}>
                                        <span style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>₹{bom.finalProductionCostPerUnit?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </td>
                                    <td style={s.td}>
                                        <span style={s.badge(bom.status)}>
                                            {getStatusIcon(bom.status)}
                                            {bom.status}
                                        </span>
                                    </td>
                                    <td style={{ ...s.td, textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <button
                                                style={{ ...s.actionBtn, color: '#64748b' }}
                                                onClick={(e) => { e.stopPropagation(); navigate(PATHS.INVENTORY.BOM.EDIT(bom._id)); }}
                                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#2563eb'; }}
                                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}
                                            >
                                                <Pencil size={15} />
                                            </button>
                                            <button
                                                style={{ ...s.actionBtn, color: '#64748b' }}
                                                onClick={(e) => { e.stopPropagation(); handleDelete(bom._id); }}
                                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
                                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                            <div style={{ ...s.actionBtn, border: 'none', background: 'transparent' }}>
                                                <ChevronRight size={16} color="#cbd5e1" />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BOMPage;
