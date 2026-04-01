import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productionPlanningApi } from '@/services/productionPlanningApi';
import api from '@/services/api';
import { PATHS } from '@/routes/paths';
import { Button, Badge, Card } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ChevronLeft, Info, Search as SearchIcon, Maximize2, Minimize2, Edit2 } from 'lucide-react';

// ── Utility: Export to Excel (uses SheetJS if available, fallback to CSV) ─────
const exportToExcel = (data, filename) => {
    try {
        if (window.XLSX) {
            const ws = window.XLSX.utils.json_to_sheet(data);
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, 'Shortage');
            window.XLSX.writeFile(wb, `${filename}.xlsx`);
        } else {
            // CSV fallback
            if (!data.length) return;
            const headers = Object.keys(data[0]).join(',');
            const rows = data.map(r => Object.values(r).join(',')).join('\n');
            const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${filename}.csv`; a.click();
        }
    } catch (e) {
        toast.error('Export failed');
    }
};

// ── Component: Summary Card ────────────────────────────────────────────────────
const SummaryCard = ({ label, value, color = '#1e293b', bg = '#f8fafc', icon, onClick }) => (
    <div
        onClick={onClick}
        style={{
            background: bg, borderRadius: 12, padding: '16px 20px',
            display: 'flex', flexDirection: 'column', gap: 4,
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)', flex: '1 1 140px', minWidth: 130,
            cursor: onClick ? 'pointer' : 'default',
            transition: 'all 0.2s ease'
        }}
        onMouseEnter={e => {
            if (onClick) {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
            }
        }}
        onMouseLeave={e => {
            if (onClick) {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.07)';
            }
        }}
    >
        <div style={{ fontSize: 22 }}>{icon}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color }}>{value ?? '--'}</div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</div>
    </div>
);

// ── Component: Product Line Row ────────────────────────────────────────────────
const ProductLineRow = ({ row, idx, products, onChange, onRemove, onKeyDown }) => (
    <tr style={{ background: idx % 2 === 0 ? '#f8fafc' : '#fff' }}>
        <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>{idx + 1}</td>
        <td style={{ padding: '8px 12px', minWidth: 280 }}>
            <SearchableSelect
                options={products}
                value={row.finishedProductId}
                onKeyDown={(e) => onKeyDown(e, idx, 0)}
                data-row={idx}
                data-col={0}
                onChange={(val, opt) => onChange(idx, {
                    finishedProductId: val,
                    finishedProductCode: opt?.code || '',
                    finishedProductName: opt?.name || ''
                })}
                placeholder="Select finished product..."
            />
        </td>
        <td style={{ padding: '8px 12px' }}>
            <span style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: 6 }}>
                {row.finishedProductCode || '—'}
            </span>
        </td>
        <td style={{ padding: '8px 12px' }}>
            <input
                type="number"
                min="1"
                value={row.plannedQty}
                onKeyDown={(e) => onKeyDown(e, idx, 1)}
                onChange={(e) => onChange(idx, { plannedQty: Number(e.target.value) })}
                data-row={idx}
                data-col={1}
                style={{
                    width: 100, padding: '8px 10px', border: '1.5px solid #e2e8f0',
                    borderRadius: 8, fontSize: 14, fontWeight: 600, outline: 'none',
                    background: '#fff'
                }}
            />
        </td>
        <td style={{ padding: '8px 12px' }}>
            <input
                type="date"
                value={row.requiredDate || ''}
                onKeyDown={(e) => onKeyDown(e, idx, 2)}
                onChange={(e) => onChange(idx, { requiredDate: e.target.value })}
                data-row={idx}
                data-col={2}
                style={{
                    padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8,
                    fontSize: 13, outline: 'none', background: '#fff'
                }}
            />
        </td>
        <td style={{ padding: '8px 12px' }}>
            <button
                onClick={() => onRemove(idx)}
                title="Remove this product"
                style={{
                    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
            >🗑️</button>
        </td>
    </tr>
);

// ── Component: Material Requirement Row (expandable) ──────────────────────────
const MaterialRow = ({ line, isExpanded, onToggle, isShortage }) => (
    <>
        <tr
            style={{
                background: isShortage ? '#fef2f2' : '#f0fdf4',
                borderBottom: '1px solid #e2e8f0',
                cursor: line.productWiseBreakdown?.length > 1 ? 'pointer' : 'default'
            }}
            onClick={line.productWiseBreakdown?.length > 1 ? onToggle : undefined}
        >
            <td style={{ padding: '10px 12px', fontSize: 12 }}>
                {line.productWiseBreakdown?.length > 1 && (
                    <span style={{ marginRight: 6 }}>{isExpanded ? '▼' : '▶'}</span>
                )}
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{line.itemCode}</span>
            </td>
            <td style={{ padding: '10px 12px', fontSize: 13 }}>{line.itemName}</td>
            <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{line.uom}</td>
            <td style={{ padding: '10px 12px', fontSize: 12 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {(line.usedInProducts || []).map(p => (
                        <span key={p} style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{p}</span>
                    ))}
                </div>
            </td>
            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#2563eb', fontSize: 14 }}>{line.totalRequiredQty?.toLocaleString()}</td>
            <td style={{ padding: '10px 12px', fontWeight: 700 }}>{(line.currentStock || 0)?.toLocaleString()}</td>
            <td style={{ padding: '10px 12px', color: '#9333ea' }}>{(line.reservedQty || 0)?.toLocaleString()}</td>
            <td style={{ padding: '10px 12px', color: '#16a34a', fontWeight: 600 }}>{(line.freeAvailableQty || 0)?.toLocaleString()}</td>
            <td style={{ padding: '10px 12px' }}>
                {isShortage
                    ? <span style={{ background: '#fecaca', color: '#dc2626', padding: '4px 10px', borderRadius: 6, fontWeight: 700, fontSize: 13 }}>
                        {line.shortageQty?.toLocaleString()}
                    </span>
                    : <span style={{ background: '#bbf7d0', color: '#15803d', padding: '4px 10px', borderRadius: 6, fontWeight: 700, fontSize: 13 }}>✓ OK</span>
                }
            </td>
            <td style={{ padding: '10px 12px', fontWeight: 700, color: isShortage ? '#dc2626' : '#16a34a', fontSize: 14 }}>
                {isShortage ? line.suggestedOrderQty?.toLocaleString() : 0}
            </td>
        </tr>
        {/* ── Expandable per-product breakdown ─────────────────────────── */}
        {isExpanded && line.productWiseBreakdown?.map((bd, i) => (
            <tr key={i} style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <td colSpan={2} style={{ padding: '6px 12px 6px 36px', fontSize: 12, color: '#64748b' }}>
                    ↳ <strong>{bd.finishedProductCode}</strong>: {bd.finishedProductName}
                </td>
                <td style={{ padding: '6px 12px', fontSize: 12, color: '#475569' }}>—</td>
                <td style={{ padding: '6px 12px', fontSize: 12, color: '#475569' }}>—</td>
                <td style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>{bd.requiredQty?.toLocaleString()}</td>
                <td colSpan={5} style={{ padding: '6px 12px', fontSize: 12, color: '#94a3b8' }}>
                    BOM: {bd.bomQtyPerUnit} × {Math.round(bd.requiredQty / bd.bomQtyPerUnit)} pcs planned
                </td>
            </tr>
        ))}
    </>
);

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ProductionPlanningFormPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [loading, setLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [products, setProducts] = useState([]);
    const [expandedRows, setExpandedRows] = useState({});
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'shortage' | 'available'
    const [searchTerm, setSearchTerm] = useState('');
    const [isExpandedView, setIsExpandedView] = useState(false);
    const gridRef = React.useRef(null);
    const formRef = React.useRef(null);

    const [header, setHeader] = useState({
        planningDate: format(new Date(), 'yyyy-MM-dd'),
        warehouse: 'Main Store',
        requiredDate: '',
        status: 'Draft',
        remarks: ''
    });

    const [productLines, setProductLines] = useState([
        { finishedProductId: '', finishedProductCode: '', finishedProductName: '', plannedQty: 1, requiredDate: '' }
    ]);

    const [mrpResult, setMrpResult] = useState(null);

    // Load available products with BOMs
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await api.get('/boms', { params: { limit: 1000, status: 'Approved' } });
                const boms = res.data.data || [];
                const productMap = new Map();
                boms.forEach(b => {
                    if (b.finishedProductId && !productMap.has(b.finishedProductId._id)) {
                        productMap.set(b.finishedProductId._id, {
                            value: b.finishedProductId._id,
                            label: `${b.finishedProductId.itemCode} – ${b.finishedProductId.itemName}`,
                            code: b.finishedProductId.itemCode,
                            name: b.finishedProductId.itemName
                        });
                    }
                });
                setProducts(Array.from(productMap.values()));
            } catch { toast.error('Failed to load products'); }
        };
        fetchProducts();
        if (id) loadExistingPlan();
    }, [id]);

    const loadExistingPlan = async () => {
        try {
            setLoading(true);
            const res = await productionPlanningApi.getPlanningById(id);
            const p = res.data;
            setHeader({
                planningDate: format(new Date(p.planningDate), 'yyyy-MM-dd'),
                warehouse: p.warehouse || 'Main Store',
                requiredDate: p.requiredDate ? format(new Date(p.requiredDate), 'yyyy-MM-dd') : '',
                status: p.status,
                remarks: p.remarks || ''
            });
            if (p.productLines?.length) {
                setProductLines(p.productLines.map(pl => ({
                    finishedProductId: pl.finishedProductId?._id || pl.finishedProductId,
                    finishedProductCode: pl.finishedProductCode,
                    finishedProductName: pl.finishedProductName,
                    plannedQty: pl.plannedQty,
                    requiredDate: pl.requiredDate ? format(new Date(pl.requiredDate), 'yyyy-MM-dd') : ''
                })));
            }
            if (p.lines?.length) {
                setMrpResult({ summary: p.summary, lines: p.lines, productSummary: p.productLines });
            }
        } catch { toast.error('Failed to load planning'); }
        finally { setLoading(false); }
    };

    // ── Product Lines Handlers ─────────────────────────────────────────────
    const addProductLine = () => {
        setProductLines(prev => [...prev, { finishedProductId: '', finishedProductCode: '', finishedProductName: '', plannedQty: 1, requiredDate: '' }]);
    };

    const removeProductLine = (idx) => {
        if (productLines.length === 1) { toast.error('At least one product line is required'); return; }
        setProductLines(prev => prev.filter((_, i) => i !== idx));
    };

    const updateProductLine = (idx, changes) => {
        setProductLines(prev => prev.map((row, i) => i === idx ? { ...row, ...changes } : row));
    };

    // ── Calculate ──────────────────────────────────────────────────────────
    const handleCalculate = async () => {
        const validLines = productLines.filter(pl => pl.finishedProductId && pl.plannedQty > 0);
        if (validLines.length === 0) {
            toast.error('Please select at least one product with planned quantity');
            return;
        }
        try {
            setCalculating(true);
            const res = await productionPlanningApi.calculateMultiMRP({
                productLines: validLines.map(pl => ({
                    finishedProductId: pl.finishedProductId,
                    plannedQty: pl.plannedQty
                })),
                warehouse: header.warehouse
            });
            setMrpResult(res.data);
            setExpandedRows({});
            setActiveTab('all');
            toast.success(`MRP calculated: ${res.data.summary.totalItems} items, ${res.data.summary.shortageItems} shortage items`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Calculation failed');
        } finally {
            setCalculating(false);
        }
    };

    // ── Save ───────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!mrpResult) { toast.error('Please calculate requirements first'); return; }
        const validLines = productLines.filter(pl => pl.finishedProductId && pl.plannedQty > 0);
        try {
            setSaving(true);
            const payload = {
                ...header,
                productLines: validLines,
                summary: mrpResult.summary,
                lines: mrpResult.lines,
                status: 'Calculated'
            };
            if (id) {
                await productionPlanningApi.updatePlanning(id, payload);
                toast.success('Planning updated');
            } else {
                await productionPlanningApi.createPlanning(payload);
                toast.success('Planning saved');
                navigate(PATHS.PRODUCTION.PLANNING.ROOT);
            }
        } catch (err) {
            toast.error(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    // ── Export ─────────────────────────────────────────────────────────────
    const handleExport = async () => {
        if (!mrpResult?.lines) { toast.error('Calculate first'); return; }
        try {
            const res = await productionPlanningApi.exportShortage({
                lines: mrpResult.lines,
                planningNo: id ? `PLAN-${id}` : 'PLAN-DRAFT'
            });
            exportToExcel(res.data.exportData, `Shortage-${format(new Date(), 'yyyy-MM-dd')}`);
            toast.success('Shortage list exported');
        } catch { toast.error('Export failed'); }
    };

    // ── Convert to PO ──────────────────────────────────────────────────────
    const handleConvertToPO = async () => {
        if (!id) { toast.error('Please save the planning first, then create PO'); return; }
        toast('PO creation: Please save the plan first, then use "Create PO" from the planning list.', { icon: 'ℹ️' });
    };

    // ── Filtered lines ─────────────────────────────────────────────────────
    const allLines = mrpResult?.lines || [];
    const filteredLines = allLines.filter(l => {
        const matchesTab = activeTab === 'shortage' ? l.shortageQty > 0
            : activeTab === 'available' ? l.shortageQty === 0
                : true;
        const matchesSearch = !searchTerm ||
            l.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.itemName.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesTab && matchesSearch;
    });

    const toggleRow = useCallback((idx) => {
        setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }));
    }, []);

    const scrollToGrid = (tab) => {
        setActiveTab(tab);
        setTimeout(() => {
            gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    const scrollToForm = () => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ── Keyboard Navigation ───────────────────────────────────────────────
    const handleRowKeyDown = (e, rowIdx, colIdx) => {
        if (e.key === 'ArrowDown') {
            const next = document.querySelector(`[data-row="${rowIdx + 1}"][data-col="${colIdx}"]`);
            if (next) {
                e.preventDefault();
                next.focus();
            } else if (rowIdx === productLines.length - 1 && productLines[rowIdx].finishedProductId) {
                // Auto add row on down arrow at last row
                addProductLine();
            }
        } else if (e.key === 'ArrowUp') {
            const prev = document.querySelector(`[data-row="${rowIdx - 1}"][data-col="${colIdx}"]`);
            if (prev) {
                e.preventDefault();
                prev.focus();
            }
        } else if (e.key === 'Enter') {
            if (colIdx < 2) {
                const nextCol = document.querySelector(`[data-row="${rowIdx}"][data-col="${colIdx + 1}"]`);
                if (nextCol) {
                    e.preventDefault();
                    nextCol.focus();
                }
            } else {
                // Enter on last column
                if (rowIdx < productLines.length - 1) {
                    const nextRowCol0 = document.querySelector(`[data-row="${rowIdx + 1}"][data-col="0"]`);
                    if (nextRowCol0) {
                        e.preventDefault();
                        nextRowCol0.focus();
                    }
                } else {
                    addProductLine();
                }
            }
        }
    };

    if (loading) return (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 15 }}>
            ⏳ Loading planning...
        </div>
    );

    return (
        <div style={{ padding: 24, paddingBottom: 60, background: '#f8fafc', minHeight: '100vh' }}>
            {/* ── Page Header ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <button
                        onClick={() => navigate(PATHS.PRODUCTION.PLANNING.ROOT)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, border: 'none',
                            background: 'none', color: '#64748b', cursor: 'pointer',
                            fontSize: 14, fontWeight: 600, padding: 0
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#0d9488'}
                        onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                    >
                        <ChevronLeft size={18} /> Back to Planning List
                    </button>
                    <div ref={formRef}>
                        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                            🏭 {id ? 'Edit' : 'New'} Production Planning / MRP
                        </h1>
                        <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                            Multi-product material requirement planning
                            <span title="Excel-style navigation enabled: Use Arrows and Enter to navigate" style={{ cursor: 'help', color: '#0d9488' }}>
                                <Info size={14} />
                            </span>
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                        onClick={() => navigate(PATHS.PRODUCTION.PLANNING.ROOT)}
                        style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !mrpResult}
                        style={{
                            padding: '9px 18px', borderRadius: 8, border: 'none',
                            background: saving ? '#94a3b8' : '#0d9488', color: '#fff',
                            cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700
                        }}
                    >{saving ? '⏳ Saving...' : '💾 Save Planning'}</button>
                </div>
            </div>

            {/* ── Planning Header Card ─────────────────────────────────────── */}
            <div style={{
                background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0'
            }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📋 Planning Header
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                    {[
                        { label: 'Planning Date', key: 'planningDate', type: 'date' },
                        { label: 'Required By Date', key: 'requiredDate', type: 'date' },
                    ].map(({ label, key, type }) => (
                        <div key={key}>
                            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</label>
                            <input
                                type={type}
                                value={header[key]}
                                onChange={e => setHeader(h => ({ ...h, [key]: e.target.value }))}
                                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>
                    ))}
                    <div>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#64748b' }}>Warehouse / Store</label>
                        <select
                            value={header.warehouse}
                            onChange={e => setHeader(h => ({ ...h, warehouse: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }}
                        >
                            <option>Main Store</option>
                            <option>Raw Material Store</option>
                            <option>Production Area</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status</label>
                        <select
                            value={header.status}
                            onChange={e => setHeader(h => ({ ...h, status: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }}
                        >
                            {['Draft', 'Calculated', 'Approved', 'Purchase Pending', 'Material Arranged', 'Ready for Production', 'Closed', 'Cancelled'].map(s => (
                                <option key={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#64748b' }}>Remarks</label>
                        <input
                            type="text"
                            value={header.remarks}
                            onChange={e => setHeader(h => ({ ...h, remarks: e.target.value }))}
                            placeholder="Add planning notes..."
                            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Product Lines ────────────────────────────────────────────── */}
            <div style={{
                background: '#fff', borderRadius: 12, marginBottom: 20,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'hidden'
            }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🧩 Product Lines — {productLines.filter(pl => pl.finishedProductId).length} product(s) selected
                    </h3>
                    <button
                        onClick={addProductLine}
                        style={{
                            padding: '8px 16px', borderRadius: 8, border: '1.5px dashed #0d9488',
                            background: '#f0fdfa', color: '#0d9488', cursor: 'pointer', fontSize: 13, fontWeight: 700
                        }}
                    >+ Add Product Line</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                {['#', 'Finished Product', 'Code', 'Planned Qty', 'Required Date', 'Action'].map(h => (
                                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {productLines.map((row, idx) => (
                                <ProductLineRow
                                    key={idx}
                                    row={row}
                                    idx={idx}
                                    products={products}
                                    onChange={updateProductLine}
                                    onRemove={removeProductLine}
                                    onKeyDown={handleRowKeyDown}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ── Action Bar ─────────────────────────────────────────── */}
                <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        onClick={handleCalculate}
                        disabled={calculating}
                        style={{
                            padding: '11px 24px', borderRadius: 8, border: 'none',
                            background: calculating ? '#94a3b8' : 'linear-gradient(135deg, #0d9488, #0284c7)',
                            color: '#fff', cursor: calculating ? 'not-allowed' : 'pointer',
                            fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8
                        }}
                    >
                        {calculating ? '⏳ Calculating...' : '🔍 Calculate Combined Requirements'}
                    </button>
                    {mrpResult && (
                        <>
                            <button
                                onClick={handleExport}
                                style={{ padding: '11px 18px', borderRadius: 8, border: '1.5px solid #0284c7', background: '#eff6ff', color: '#0284c7', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                            >📊 Export Shortage Excel</button>
                            <button
                                onClick={handleConvertToPO}
                                style={{ padding: '11px 18px', borderRadius: 8, border: '1.5px solid #7c3aed', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                            >🛒 Create Purchase Order</button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Summary Cards ────────────────────────────────────────────── */}
            {mrpResult && (
                <>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                        <SummaryCard label="Products Selected" value={mrpResult.summary?.totalSelectedProducts} icon="🏭" color="#0d9488" bg="#f0fdfa" />
                        <SummaryCard
                            label="Total BOM Items"
                            value={mrpResult.summary?.totalItems}
                            icon="📦"
                            color="#1e293b"
                            bg="#f8fafc"
                            onClick={() => scrollToGrid('all')}
                        />
                        <SummaryCard
                            label="Shortage Items"
                            value={mrpResult.summary?.shortageItems}
                            icon="⚠️"
                            color="#dc2626"
                            bg="#fef2f2"
                            onClick={() => scrollToGrid('shortage')}
                        />
                        <SummaryCard
                            label="Available Items"
                            value={mrpResult.summary?.fullyAvailableItems}
                            icon="✅"
                            color="#16a34a"
                            bg="#f0fdf4"
                            onClick={() => scrollToGrid('available')}
                        />
                        <SummaryCard label="Readiness" value={`${mrpResult.summary?.readinessPercent || 0}%`} icon="📈" color="#7c3aed" bg="#f5f3ff" />
                        <SummaryCard
                            label="Est. Shortage Value"
                            value={`₹${(mrpResult.summary?.estimatedShortageValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                            icon="💰" color="#d97706" bg="#fffbeb"
                        />
                    </div>

                    {/* ── Combined Material Requirement Grid ──────────────── */}
                    <div
                        ref={gridRef}
                        style={{
                            background: '#fff', borderRadius: 12,
                            boxShadow: '0 4px 15px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0',
                            overflow: 'hidden', marginTop: 24, transition: 'all 0.3s',
                            position: 'relative'
                        }}
                    >
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
                            background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
                            position: 'sticky', top: 0, zIndex: 10,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    📋 Material Requirement Results
                                    {isExpandedView && <Badge color="blue">Focused Mode</Badge>}
                                </h3>
                                <button
                                    onClick={scrollToForm}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #e2e8f0',
                                        background: '#fff', color: '#64748b', cursor: 'pointer', borderRadius: 8,
                                        fontSize: 12, fontWeight: 700, padding: '6px 12px'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
                                    onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                                >
                                    <Edit2 size={14} /> Edit Planning Data
                                </button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                {/* Search Box */}
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <SearchIcon size={16} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                                    <input
                                        type="text"
                                        placeholder="Search by code or name..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        style={{
                                            padding: '8px 12px 8px 36px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                                            fontSize: 13, outline: 'none', width: 220, background: '#f8fafc'
                                        }}
                                    />
                                </div>

                                {/* Filter Tabs */}
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {[
                                        { key: 'all', label: `All (${allLines.length})` },
                                        { key: 'shortage', label: `Shortage (${allLines.filter(l => l.shortageQty > 0).length})`, color: '#dc2626' },
                                        { key: 'available', label: `Available (${allLines.filter(l => l.shortageQty === 0).length})`, color: '#16a34a' }
                                    ].map(tab => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveTab(tab.key)}
                                            style={{
                                                padding: '6px 14px', borderRadius: 6, border: '1.5px solid',
                                                borderColor: activeTab === tab.key ? (tab.color || '#0d9488') : '#e2e8f0',
                                                background: activeTab === tab.key ? (tab.key === 'shortage' ? '#fef2f2' : tab.key === 'available' ? '#f0fdf4' : '#f0fdfa') : '#fff',
                                                color: activeTab === tab.key ? (tab.color || '#0d9488') : '#64748b',
                                                cursor: 'pointer', fontSize: 12, fontWeight: 700
                                            }}
                                        >{tab.label}</button>
                                    ))}
                                </div>

                                {/* Expand Toggle */}
                                <button
                                    onClick={() => setIsExpandedView(!isExpandedView)}
                                    title={isExpandedView ? "Normal View" : "Full Space View"}
                                    style={{
                                        border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b',
                                        borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center'
                                    }}
                                >
                                    {isExpandedView ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                                </button>
                            </div>
                        </div>

                        <div style={{
                            overflowX: 'auto',
                            maxHeight: isExpandedView ? '85vh' : '550px',
                            overflowY: 'auto',
                            scrollbarWidth: 'thin',
                            scrollbarColor: '#94a3b8 #f1f5f9'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1000 }}>
                                <thead style={{ position: 'sticky' , top: 0, zIndex: 5 }}>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        {[
                                            'Item Code', 'Item Name', 'UOM', 'Used In Products',
                                            'Total Required', 'Current Stock', 'Reserved', 'Free Available',
                                            'Shortage Qty', 'Order Qty'
                                        ].map(h => (
                                            <th key={h} style={{
                                                padding: '12px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800,
                                                color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em',
                                                whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0'
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLines.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                                                {activeTab === 'shortage' ? '✅ No shortage items!' : 'No items found'}
                                            </td>
                                        </tr>
                                    ) : filteredLines.map((line, idx) => (
                                        <MaterialRow
                                            key={line.itemCode + idx}
                                            line={line}
                                            isExpanded={!!expandedRows[idx]}
                                            onToggle={() => toggleRow(idx)}
                                            isShortage={line.shortageQty > 0}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* ── Footer Totals ──────────────────────────────── */}
                        {filteredLines.length > 0 && (
                            <div style={{ padding: '12px 20px', borderTop: '2px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', gap: 24 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
                                        Total Shortage Items: {filteredLines.filter(l => l.shortageQty > 0).length}
                                    </span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>
                                        Est. Purchase Value: ₹{filteredLines.reduce((s, l) => s + (l.estimatedPurchaseValue || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </span>
                                </div>
                                <span style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>
                                    💡 Click on a row with multiple products to see product-wise breakdown
                                </span>
                            </div>
                        )}
                    </div>


                </>
            )}

            {!mrpResult && (
                <div style={{
                    background: '#fff', borderRadius: 12, padding: 48, textAlign: 'center',
                    border: '2px dashed #cbd5e1', color: '#94a3b8'
                }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No Results Yet</div>
                    <div style={{ fontSize: 13 }}>Add product lines above and click "Calculate Combined Requirements" to see the material requirement grid</div>
                </div>
            )}
        </div>
    );
}
