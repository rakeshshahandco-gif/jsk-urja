import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, AlertTriangle } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { createScrap, getFailures, getJobCards } from '@/services/productionReworkApi';
import { getItems } from '@/services/itemApi';
import { toast } from 'react-hot-toast';
import { Button, Input, Select } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';

const SCRAP_REASONS = [
    { value: 'Irrepairable Damage', label: 'Irrepairable Damage' },
    { value: 'Burnt PCB', label: 'Burnt PCB' },
    { value: 'Physical Breakage', label: 'Physical Breakage' },
    { value: 'Obsolescence', label: 'Obsolescence' },
    { value: 'Cost of Repair too high', label: 'Cost of Repair too high' },
    { value: 'Failure during testing', label: 'Failure during testing' },
    { value: 'Other', label: 'Other' }
];

const ProductionScrapFormPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const jobCardIdParam = searchParams.get('jobCardId');
    const failureIdParam = searchParams.get('failureId');

    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [jobCards, setJobCards] = useState([]);
    const [failures, setFailures] = useState([]);
    const [fetchingData, setFetchingData] = useState(true);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        jobCardId: '',
        failureId: '',
        itemId: '',
        qtyScrap: 0,
        reason: '',
        approvedBy: '',
        notes: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [itemsData, jcData, failData] = await Promise.all([
                getItems(),
                getJobCards(),
                getFailures()
            ]);
            setItems(itemsData);
            setJobCards(jcData);
            setFailures(failData);

            if (jobCardIdParam) {
                const jc = jcData.find(j => j._id === jobCardIdParam);
                if (jc) setFormData(prev => ({ ...prev, jobCardId: jc._id, itemId: jc.itemId }));
            } else if (failureIdParam) {
                const fail = failData.find(f => f._id === failureIdParam);
                if (fail) setFormData(prev => ({ ...prev, failureId: fail._id, itemId: fail.itemId, qtyScrap: fail.qtyFailed }));
            }
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load items or records');
        } finally {
            setFetchingData(false);
        }
    };

    const itemOptions = items
        .filter(i => ['FINISHED_GOODS', 'SUB_ASSEMBLY', 'COMPONENT'].includes(i.itemType))
        .map(i => ({
            value: i._id,
            label: i.itemName,
            meta: `${i.itemCode} | Stock: ${i.currentStock}`
        }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.itemId || !formData.reason || formData.qtyScrap <= 0) {
            toast.error('Please fill mandatory fields');
            return;
        }

        try {
            setLoading(true);
            await createScrap(formData);
            toast.success('Production Scrap recorded and stock moved');
            navigate(PATHS.PRODUCTION.REWORK.SCRAPS);
        } catch (error) {
            console.error('Error saving scrap:', error);
            toast.error(error.response?.data?.message || 'Error saving record');
        } finally {
            setLoading(false);
        }
    };

    if (fetchingData) return <div style={{ padding: 40, textAlign: 'center' }}>Loading form...</div>;

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button
                    onClick={() => navigate(-1)}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex' }}
                >
                    <ArrowLeft size={18} color="#64748b" />
                </button>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#1e293b' }}>Production Scrap / Rejection Entry</h1>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                        Scrap Details
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <Input
                            label="Scrap Date"
                            type="date"
                            required
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        />
                        <div className="form-group">
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Item to Scrap *</label>
                            <SearchableSelect
                                options={itemOptions}
                                value={formData.itemId}
                                onChange={(val) => setFormData({ ...formData, itemId: val })}
                                placeholder="Search by name or code..."
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <Input
                            label="Quantity Scrapped *"
                            type="number"
                            required
                            value={formData.qtyScrap}
                            onChange={(e) => setFormData({ ...formData, qtyScrap: Number(e.target.value) })}
                        />
                        <Select
                            label="Scrap Reason *"
                            required
                            options={SCRAP_REASONS}
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 20 }}>
                        <Input
                            label="Approved By *"
                            placeholder="Enter manager/supervisor name"
                            required
                            value={formData.approvedBy}
                            onChange={(e) => setFormData({ ...formData, approvedBy: e.target.value })}
                        />
                    </div>

                    <div style={{ marginBottom: 0 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Additional Notes</label>
                        <textarea
                            rows={3}
                            placeholder="Reasoning for scrap decision..."
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                fontSize: 14,
                                outline: 'none',
                                fontFamily: 'inherit'
                            }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24, textAlign: 'center' }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: '50%', background: '#fef2f2',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
                        }}>
                            <Trash2 size={32} color="#dc2626" />
                        </div>
                        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#dc2626' }}>Confirm Rejection</h3>
                        <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
                            This action will permanently move stock to the <b>SCRAP</b> bucket. Scrapped stock cannot be used for sales or production.
                        </p>

                        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 10, padding: 12, display: 'flex', gap: 10, marginBottom: 24, textAlign: 'left' }}>
                            <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0 }} />
                            <div style={{ fontSize: 11, color: '#92400e' }}>
                                This is a terminal action. Please ensure all items are indeed irrepairable.
                            </div>
                        </div>

                        <Button
                            type="submit"
                            variant="danger"
                            fullWidth
                            disabled={loading || !formData.itemId}
                            style={{ height: 48, fontSize: 15, fontWeight: 700, background: '#dc2626' }}
                        >
                            {loading ? 'Processing...' : 'Mark as Scrap'}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default ProductionScrapFormPage;
