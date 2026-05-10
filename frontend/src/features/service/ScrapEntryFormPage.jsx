import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, XCircle, Plus, Trash2 } from 'lucide-react';
import { createScrapEntry, getRepairJobCard } from '@/services/serviceApi';
import { getItems } from '@/services/itemApi';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';

const f = {
    label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 },
    input: { width: '100%', height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box' },
    row: (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10 }),
    sectionTitle: { fontSize: 11, fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 12 },
};

const Field = ({ label, children }) => <div><label style={f.label}>{label}</label>{children}</div>;

const ScrapEntryFormPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { addToast } = useToast();
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        date: new Date().toISOString().split('T')[0],
        jobCardId: searchParams.get('jobCardId') || '',
        jobCardNo: searchParams.get('jobCardNo') || '',
        complaintId: searchParams.get('complaintId') || '',
        complaintNo: searchParams.get('complaintNo') || '',
        items: [{ itemCode: '', itemName: '', uom: 'NOS', qty: 1, reason: 'Cannot be repaired' }],
        notes: '',
        approvedBy: '',
    });

    // Item live search state
    const [itemOptions, setItemOptions] = useState([]);
    const [showItemDropdownRow, setShowItemDropdownRow] = useState(-1);
    const [itemHighlightIndex, setItemHighlightIndex] = useState(-1);
    const itemSearchTimeout = useRef(null);
    const itemTableRef = useRef(null);

    React.useEffect(() => {
        const jcId = searchParams.get('jobCardId');
        if (jcId) {
            getRepairJobCard(jcId).then(jc => {
                if (jc) {
                    setForm(prev => ({
                        ...prev,
                        items: jc.items?.filter(i => (i.scrapQty || 0) > (i.actualScrappedQty || 0)).map(i => {
                            const available = Math.max(0, (i.scrapQty || 0) - (i.actualScrappedQty || 0));
                            return {
                                itemId: i.itemId || null,
                                itemCode: i.itemCode || '',
                                itemName: i.itemName || '',
                                uom: i.uom || 'NOS',
                                qty: available,
                                maxQty: available,
                                reason: i.faultDescription || 'Cannot be repaired'
                            };
                        }) || prev.items
                    }));
                }
            }).catch(e => console.error('Scrap pull fail:', e));
        }

        const handleClickOutside = (e) => {
            if (itemTableRef.current && !itemTableRef.current.contains(e.target)) setShowItemDropdownRow(-1);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [searchParams]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setItem = (i, k, v) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [k]: v }; return { ...f, items }; });
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, { itemCode: '', itemName: '', uom: 'NOS', qty: 1, reason: 'Cannot be repaired' }] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    // ─── Item search handlers ────────────────────────────────────────────────
    const handleItemSearch = (val, idx) => {
        setItem(idx, 'itemName', val);
        setItemHighlightIndex(-1);
        if (!val.trim() || val.length < 2) { setItemOptions([]); setShowItemDropdownRow(-1); return; }
        setShowItemDropdownRow(idx);
        if (itemSearchTimeout.current) clearTimeout(itemSearchTimeout.current);
        itemSearchTimeout.current = setTimeout(async () => {
            try {
                const res = await getItems({ search: val, limit: 15 });
                if (res.success && Array.isArray(res.data)) setItemOptions(res.data);
            } catch (e) { console.error('Error searching items:', e); }
        }, 300);
    };

    const handleItemSelect = (it, idx) => {
        setForm(f => {
            const items = [...f.items];
            items[idx] = {
                ...items[idx],
                itemCode: it.itemCode || '',
                itemName: it.itemName || '',
                uom: it.uom || 'NOS',
            };
            return { ...f, items };
        });
        setShowItemDropdownRow(-1);
        setItemOptions([]);
    };
    // ─────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────

    const handleSave = async () => {
        if (!form.jobCardId) { addToast('Job Card ID required', 'error'); return; }
        setSaving(true);
        try {
            await createScrapEntry(form);
            addToast('Scrap entry recorded!', 'success');
            navigate(-1);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save', 'error');
        } finally { setSaving(false); }
    };

    return (
        <div style={{ padding: '10px 16px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={15} /></button>
                    <XCircle size={15} color="#dc2626" />
                    <span style={{ fontSize: 14, fontWeight: 800 }}>Scrap / Rejection Entry</span>
                </div>
                <button onClick={handleSave} disabled={saving} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 6, background: saving ? '#fca5a5' : '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Save size={13} />{saving ? 'Saving…' : 'Save Scrap Entry'}
                </button>
            </div>

            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#991b1b', fontWeight: 600 }}>
                ⚠️ These items will be booked as scrap and will NOT be added back to saleable inventory.
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={f.sectionTitle}>Scrap Entry Details</div>
                <div style={f.row(4)}>
                    <Field label="Date"><input type="date" style={f.input} value={form.date} onChange={e => set('date', e.target.value)} /></Field>
                    <Field label="Job Card No."><input style={{ ...f.input, fontFamily: 'monospace', color: '#7c3aed', fontWeight: 700 }} value={form.jobCardNo} onChange={e => set('jobCardNo', e.target.value)} /></Field>
                    <Field label="Complaint No."><input style={{ ...f.input, fontFamily: 'monospace', color: '#dc2626' }} value={form.complaintNo} onChange={e => set('complaintNo', e.target.value)} /></Field>
                    <Field label="Approved By"><input style={f.input} value={form.approvedBy} onChange={e => set('approvedBy', e.target.value)} /></Field>
                </div>
            </div>

            <div ref={itemTableRef} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 16px 100px 16px', marginBottom: -84 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={f.sectionTitle}>Scrap Items</div>
                    <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Plus size={12} /> Add Row</button>
                </div>
                <div style={{ overflowX: 'auto', paddingBottom: 150, marginBottom: -150 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr style={{ background: '#fff1f2' }}>
                            {['Item Code', 'Item Name *', 'UOM', 'Scrap Qty *', 'Reason', ''].map(h =>
                                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: '#991b1b', fontSize: 10 }}>{h}</th>
                            )}
                        </tr></thead>
                        <tbody>
                            {form.items.map((item, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 90, fontFamily: 'monospace' }} value={item.itemCode} onChange={e => setItem(i, 'itemCode', e.target.value)} /></td>
                                <td style={{ padding: '4px 6px', position: 'relative' }}>
                                    <input 
                                        style={{ ...f.input, width: 220 }} 
                                        value={item.itemName} 
                                        onChange={e => handleItemSearch(e.target.value, i)} 
                                        onFocus={() => item.itemName && item.itemName.length >= 2 && setShowItemDropdownRow(i)}
                                        onKeyDown={e => {
                                            if (showItemDropdownRow !== i) return;
                                            if (e.key === 'ArrowDown') { e.preventDefault(); setItemHighlightIndex(p => Math.min(p + 1, itemOptions.length - 1)); }
                                            else if (e.key === 'ArrowUp') { e.preventDefault(); setItemHighlightIndex(p => Math.max(p - 1, 0)); }
                                            else if (e.key === 'Enter' && itemHighlightIndex >= 0 && itemHighlightIndex < itemOptions.length) {
                                                e.preventDefault(); handleItemSelect(itemOptions[itemHighlightIndex], i);
                                            }
                                            else if (e.key === 'Escape') setShowItemDropdownRow(-1);
                                        }}
                                        placeholder="Search product name..." 
                                    />
                                    {showItemDropdownRow === i && (
                                        <div style={{ position: 'absolute', top: '100%', left: 6, right: -100, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 200, overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', width: 330 }}>
                                            {itemOptions.length > 0 ? itemOptions.map((it, idx) => (
                                                <div key={it._id}
                                                    onClick={() => handleItemSelect(it, i)}
                                                    style={{ padding: '7px 10px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: itemHighlightIndex === idx ? '#f1f5f9' : 'transparent' }}
                                                    onMouseEnter={() => setItemHighlightIndex(idx)}>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{it.itemName}</div>
                                                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>
                                                        <span style={{ fontWeight: 600, color: '#0d9488' }}>{it.itemCode}</span>
                                                        {it.itemGroupName && <span style={{ marginLeft: 8 }}>• {it.itemGroupName}</span>}
                                                    </div>
                                                </div>
                                            )) : (
                                                <div style={{ padding: 10, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>No product found — type to search</div>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '4px 6px' }}><select style={{ ...f.input, width: 70 }} value={item.uom} onChange={e => setItem(i, 'uom', e.target.value)}>{['NOS', 'PCS', 'SET'].map(u => <option key={u}>{u}</option>)}</select></td>
                                <td style={{ padding: '4px 6px' }}>
                                    <input 
                                        type="number" 
                                        style={{ ...f.input, width: 80, color: '#dc2626', fontWeight: 700, border: '1px solid #fca5a5', borderColor: item.qty > (item.maxQty || 9999) ? '#991b1b' : '#fca5a5' }} 
                                        value={item.qty} 
                                        onChange={e => setItem(i, 'qty', Number(e.target.value))} 
                                        min={0}
                                        max={item.maxQty}
                                    />
                                    {item.maxQty !== undefined && (
                                        <div style={{ fontSize: 9, color: item.qty > item.maxQty ? '#dc2626' : '#991b1b', marginTop: 2, fontWeight: 600 }}>
                                            Max Scrap: {item.maxQty}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '4px 6px' }}><input style={{ ...f.input, width: 220 }} value={item.reason} onChange={e => setItem(i, 'reason', e.target.value)} placeholder="Reason for scrap" /></td>
                                <td style={{ padding: '4px 6px' }}>{form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ width: 26, height: 26, background: '#fee2e2', border: 'none', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} color="#dc2626" /></button>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <label style={f.label}>Notes</label>
                <textarea style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', outline: 'none', resize: 'vertical', minHeight: 50, boxSizing: 'border-box' }} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
        </div>
    );
};

export default ScrapEntryFormPage;
