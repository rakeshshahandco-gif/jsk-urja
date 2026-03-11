import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { createJobCard, getFailures } from '@/services/productionReworkApi';
import { toast } from 'react-hot-toast';
import { Button, Input, Select } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';

const REWORK_TYPES = [
    { value: 'Component Replacement', label: 'Component Replacement' },
    { value: 'Circuit Repair', label: 'Circuit Repair' },
    { value: 'Soldering Correction', label: 'Soldering Correction' },
    { value: 'Firmware Reload', label: 'Firmware Reload' },
    { value: 'Cleaning/Finishing', label: 'Cleaning/Finishing' },
    { value: 'Full Assembly Rework', label: 'Full Assembly Rework' },
    { value: 'Other', label: 'Other' }
];

const ReworkJobCardFormPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const failureIdParam = searchParams.get('failureId');

    const [loading, setLoading] = useState(false);
    const [failures, setFailures] = useState([]);
    const [fetchingData, setFetchingData] = useState(true);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        failureId: '',
        technicianName: '',
        reworkType: '',
        instructions: '',
        targetDate: '',
        priority: 'Normal'
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const data = await getFailures();
            // Only show failures that are not already in rework (or allow multiple cards?)
            // For now, show Open ones.
            setFailures(data.filter(f => f.status === 'Open'));

            if (failureIdParam) {
                const selected = data.find(f => f._id === failureIdParam);
                if (selected) {
                    setFormData(prev => ({
                        ...prev,
                        failureId: selected._id
                    }));
                }
            }
        } catch (error) {
            console.error('Error loading failures:', error);
            toast.error('Failed to load failure records');
        } finally {
            setFetchingData(false);
        }
    };

    const failureOptions = failures.map(f => ({
        value: f._id,
        label: `${f.failureNo} - ${f.itemName}`,
        meta: `Qty: ${f.qtyFailed} | ${f.reason}`
    }));

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.failureId || !formData.technicianName || !formData.reworkType) {
            toast.error('Please fill all mandatory fields');
            return;
        }

        try {
            setLoading(true);
            await createJobCard(formData);
            toast.success('Rework Job Card assigned successfully');
            navigate(PATHS.PRODUCTION.REWORK.JOB_CARDS);
        } catch (error) {
            console.error('Error saving job card:', error);
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
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#1e293b' }}>New Rework Job Card</h1>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                        Assignment Details
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <Input
                            label="Date"
                            type="date"
                            required
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        />
                        <div className="form-group">
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Select Failure Record *</label>
                            <SearchableSelect
                                options={failureOptions}
                                value={formData.failureId}
                                onChange={(val) => setFormData({ ...formData, failureId: val })}
                                placeholder="Search by Failure No or Product..."
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <Input
                            label="Technician Name *"
                            placeholder="Enter person assigned to repair"
                            required
                            value={formData.technicianName}
                            onChange={(e) => setFormData({ ...formData, technicianName: e.target.value })}
                        />
                        <Select
                            label="Rework Type *"
                            required
                            options={REWORK_TYPES}
                            value={formData.reworkType}
                            onChange={(e) => setFormData({ ...formData, reworkType: e.target.value })}
                        />
                    </div>

                    <div style={{ marginBottom: 0 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Repair Instructions</label>
                        <textarea
                            rows={4}
                            placeholder="Describe what needs to be fixed..."
                            value={formData.instructions}
                            onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
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
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Timeline & Priority</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <Select
                                label="Priority"
                                options={[
                                    { value: 'Normal', label: 'Normal' },
                                    { value: 'High', label: 'High' },
                                    { value: 'Critical', label: 'Critical' }
                                ]}
                                value={formData.priority}
                                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                            />
                            <Input
                                label="Target Completion Date"
                                type="date"
                                value={formData.targetDate}
                                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                            />
                        </div>
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        disabled={loading}
                        style={{ height: 48, fontSize: 15, fontWeight: 700, background: '#d97706' }}
                    >
                        {loading ? 'Creating...' : <><Save size={18} style={{ marginRight: 8 }} /> Create Job Card</>}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default ReworkJobCardFormPage;
