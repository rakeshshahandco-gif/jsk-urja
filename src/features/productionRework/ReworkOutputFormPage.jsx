import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { createOutput, getJobCards } from '@/services/productionReworkApi';
import { toast } from 'react-hot-toast';
import { Button, Input, Select } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';

const REPAIR_TYPES = [
    { value: 'Component Replacement', label: 'Component Replacement' },
    { value: 'Reflowed Solder', label: 'Reflowed Solder' },
    { value: 'Patched Circuit', label: 'Patched Circuit' },
    { value: 'Reassembled', label: 'Reassembled' },
    { value: 'Adjusted Settings', label: 'Adjusted Settings' },
    { value: 'Full Board Swap', label: 'Full Board Swap' },
    { value: 'Other', label: 'Other' }
];

const ReworkOutputFormPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const jobCardIdParam = searchParams.get('jobCardId');

    const [loading, setLoading] = useState(false);
    const [jobCards, setJobCards] = useState([]);
    const [fetchingData, setFetchingData] = useState(true);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        jobCardId: '',
        qtyRepaired: 0,
        repairType: '',
        technicianNotes: '',
        isPassed: true
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const data = await getJobCards();
            setJobCards(data.filter(j => j.status === 'In Progress' || j.status === 'Pending'));

            if (jobCardIdParam) {
                const selected = data.find(j => j._id === jobCardIdParam);
                if (selected) {
                    setFormData(prev => ({
                        ...prev,
                        jobCardId: selected._id,
                        qtyRepaired: selected.qtyToRepair
                    }));
                }
            }
        } catch (error) {
            console.error('Error loading job cards:', error);
            toast.error('Failed to load job cards');
        } finally {
            setFetchingData(false);
        }
    };

    const jcOptions = jobCards.map(j => ({
        value: j._id,
        label: `${j.jobCardNo} - ${j.itemName}`,
        meta: `Technician: ${j.technicianName} | Qty: ${j.qtyToRepair}`
    }));

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.jobCardId || formData.qtyRepaired <= 0 || !formData.repairType) {
            toast.error('Please fill all mandatory fields');
            return;
        }

        try {
            setLoading(true);
            await createOutput(formData);
            toast.success('Rework Output recorded');
            navigate(PATHS.PRODUCTION.REWORK.JOB_CARDS);
        } catch (error) {
            console.error('Error saving output:', error);
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
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#1e293b' }}>Technician Repair Output</h1>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                        Final Repair Result
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <Input
                            label="Repair Date"
                            type="date"
                            required
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        />
                        <div className="form-group">
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Rework Job Card *</label>
                            <SearchableSelect
                                options={jcOptions}
                                value={formData.jobCardId}
                                onChange={(val) => {
                                    const jc = jobCards.find(j => j._id === val);
                                    setFormData({
                                        ...formData,
                                        jobCardId: val,
                                        qtyRepaired: jc ? jc.qtyToRepair : formData.qtyRepaired
                                    });
                                }}
                                placeholder="Select Job Card..."
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <Input
                            label="Qty Repaired/Handled *"
                            type="number"
                            required
                            value={formData.qtyRepaired}
                            onChange={(e) => setFormData({ ...formData, qtyRepaired: Number(e.target.value) })}
                        />
                        <Select
                            label="Action Taken *"
                            required
                            options={REPAIR_TYPES}
                            value={formData.repairType}
                            onChange={(e) => setFormData({ ...formData, repairType: e.target.value })}
                        />
                    </div>

                    <div style={{ marginBottom: 0 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Technician Notes / Work Done</label>
                        <textarea
                            rows={4}
                            placeholder="Detailed explanation of what was fixed..."
                            value={formData.technicianNotes}
                            onChange={(e) => setFormData({ ...formData, technicianNotes: e.target.value })}
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
                        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Status Gate</h3>

                        <div style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: 16,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            alignItems: 'center',
                            marginBottom: 24
                        }}>
                            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Is the product ready for QC Retest?</div>
                            <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 3, width: '100%' }}>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, isPassed: true })}
                                    style={{
                                        flex: 1, padding: '8px 0', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                        background: formData.isPassed ? '#16a34a' : 'transparent',
                                        color: formData.isPassed ? '#fff' : '#64748b',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Yes (Passed)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, isPassed: false })}
                                    style={{
                                        flex: 1, padding: '8px 0', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                        background: !formData.isPassed ? '#dc2626' : 'transparent',
                                        color: !formData.isPassed ? '#fff' : '#64748b',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    No (Internal Flaw)
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#64748b', textAlign: 'left', marginBottom: 24 }}>
                            <AlertCircle size={32} color="#2563eb" style={{ flexShrink: 0 }} />
                            <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                                Marked units will be moved to <b>QC PENDING REWORK</b> stage. A QC Retest record must be created to move them back to saleable stock.
                            </div>
                        </div>

                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            disabled={loading}
                            style={{ height: 48, fontSize: 15, fontWeight: 700, background: '#16a34a' }}
                        >
                            {loading ? 'Submitting...' : <><Save size={18} style={{ marginRight: 8 }} /> Submit Repair Results</>}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default ReworkOutputFormPage;
