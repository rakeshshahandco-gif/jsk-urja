import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Save } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';
import { getItems } from '@/services/itemApi';
import { listTextileProcessRoutes, createTextileProductionOrder } from '@/services/textileProductionWorkflowApi';

export default function TextileProductionOrderFormPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [items, setItems] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        designNo: '', itemId: '', outputItemId: '', qty: '', qtyUom: 'PCS',
        colour: '', size: '', lotNo: '', processRouteId: '', remarks: '',
    });

    useEffect(() => {
        if (!isTextile || !selectedCompany?._id) return;
        getItems({ limit: 500 }).then((d) => setItems(d.items || d.data || [])).catch(() => {});
        listTextileProcessRoutes({ companyId: selectedCompany._id, isActive: 'true' }).then(setRoutes).catch(() => {});
    }, [isTextile, selectedCompany?._id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.itemId || !form.processRouteId || !form.qty) return toast.error('Item, route and qty required');
        setSaving(true);
        try {
            const order = await createTextileProductionOrder({
                companyId: selectedCompany._id,
                ...form,
                qty: Number(form.qty),
                startImmediately: true,
            });
            toast.success(`Order ${order.orderNo} created`);
            navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_DETAIL(order._id));
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;

    const f = { label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }, input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' } };

    return (
        <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_WORKFLOW)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12 }}>
                <ChevronLeft size={16} /> Back
            </button>
            <h1 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700 }}>New Textile Production Order</h1>
            <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <label><span style={f.label}>Design No</span><input value={form.designNo} onChange={(e) => setForm({ ...form, designNo: e.target.value })} style={f.input} /></label>
                    <label><span style={f.label}>Process Route *</span>
                        <select value={form.processRouteId} onChange={(e) => setForm({ ...form, processRouteId: e.target.value })} required style={f.input}>
                            <option value="">Select route</option>
                            {routes.map((r) => <option key={r._id} value={r._id}>{r.routeName}</option>)}
                        </select>
                    </label>
                    <label><span style={f.label}>Qty *</span><input type="number" min="0.0001" step="any" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} required style={f.input} /></label>
                    <label><span style={f.label}>UOM</span>
                        <select value={form.qtyUom} onChange={(e) => setForm({ ...form, qtyUom: e.target.value })} style={f.input}>
                            {['PCS', 'Meter', 'Than'].map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </label>
                    <label style={{ gridColumn: 'span 2' }}><span style={f.label}>Input Item *</span>
                        <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} required style={f.input}>
                            <option value="">Select item</option>
                            {items.map((it) => <option key={it._id} value={it._id}>{it.itemName} (stock: {it.currentStock ?? 0})</option>)}
                        </select>
                    </label>
                    <label style={{ gridColumn: 'span 2' }}><span style={f.label}>Expected Output Item</span>
                        <select value={form.outputItemId} onChange={(e) => setForm({ ...form, outputItemId: e.target.value })} style={f.input}>
                            <option value="">Same as input</option>
                            {items.map((it) => <option key={it._id} value={it._id}>{it.itemName}</option>)}
                        </select>
                    </label>
                    <label><span style={f.label}>Colour</span><input value={form.colour} onChange={(e) => setForm({ ...form, colour: e.target.value })} style={f.input} /></label>
                    <label><span style={f.label}>Size</span><input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} style={f.input} /></label>
                    <label><span style={f.label}>Lot No</span><input value={form.lotNo} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} style={f.input} /></label>
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                        <Save size={16} /> {saving ? 'Creating…' : 'Create & Start Production'}
                    </button>
                </div>
            </form>
        </div>
    );
}
