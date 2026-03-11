import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, Info } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { createRetest, getJobCards, getOutputs } from '@/services/productionReworkApi';
import { toast } from 'react-hot-toast';
import { Button, Input } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';

const RetestConfirmationFormPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const jobCardIdParam = searchParams.get('jobCardId');

    const [loading, setLoading] = useState(false);
    const [jobCards, setJobCards] = useState([]);
    const [outputs, setOutputs] = useState([]);
    const [fetchingData, setFetchingData] = useState(true);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        jobCardId: '',
        outputId: '',
        qtyTested: 0,
        qtyPassed: 0,
        qtyFailed: 0,
        qcApprovedBy: '',
        remarks: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const jcData = await getJobCards();
            // Show those that have outputs recorded
            setJobCards(jcData.filter(j => j.status === 'Repaired'));

            if (jobCardIdParam) {
                const selected = jcData.find(j => j._id === jobCardIdParam);
                if (selected) {
                    setFormData(prev => ({
                        ...prev,
                        jobCardId: selected._id
                    }));
                    fetchOutputs(selected._id);
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load job cards');
        } finally {
            setFetchingData(false);
        }
    };

    const fetchOutputs = async (jcId) => {
        try {
            const outputData = await getOutputs({ jobCardId: jcId });
            setOutputs(outputData);
            if (outputData.length > 0) {
                const latest = outputData[0];
                setFormData(prev => ({
                    ...prev,
                    outputId: latest._id,
                    qtyTested: latest.qtyRepaired,
                    qtyPassed: latest.qtyRepaired // Default all pass
                }));
            }
        } catch (error) {
            console.error('Error fetching outputs:', error);
        }
    };

    const jcOptions = jobCards.map(j => ({
        value: j._id,
        label: `${j.jobCardNo} - ${j.itemName}`,
        meta: `${j.itemCode} | Ready for final test`
    }));

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.qtyPassed + formData.qtyFailed > formData.qtyTested) {
            toast.error('Pass + Fail qty cannot exceed Tested qty');
            return;
        }

        try {
            setLoading(true);
            await createRetest(formData);
            toast.success('Retest recorded and stock moved to SALEABLE');
            navigate(PATHS.PRODUCTION.REWORK.RETESTS);
        } catch (error) {
            console.error('Error saving retest:', error);
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
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#1e293b' }}>Retest / QC Confirmation</h1>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                        QC Approval Details
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <Input
                            label="Retest Date"
                            type="date"
                            required
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        />
                        <div className="form-group">
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Repaired Job Card *</label>
                            <SearchableSelect
                                options={jcOptions}
                                value={formData.jobCardId}
                                onChange={(val) => {
                                    setFormData({ ...formData, jobCardId: val });
                                    fetchOutputs(val);
                                }}
                                placeholder="Search for repaired units..."
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <Input
                            label="QC Approved By *"
                            placeholder="Approver name"
                            required
                            value={formData.qcApprovedBy}
                            onChange={(e) => setFormData({ ...formData, qcApprovedBy: e.target.value })}
                        />
                        <Input
                            label="Total Units Tested (Locked)"
                            type="number"
                            readOnly
                            value={formData.qtyTested}
                            style={{ background: '#f8fafc' }}
                        />
                    </div>

                    <h3 style={{ margin: '24px 0 20px', fontSize: 16, fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                        Decision
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <div className="form-group">
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#16a34a', marginBottom: 6 }}>Qty PASSED *</label>
                            <input
                                type="number"
                                required
                                value={formData.qtyPassed}
                                onChange={(e) => setFormData({ ...formData, qtyPassed: Number(e.target.value) })}
                                style={{
                                    width: '100%', padding: '10px 12px', border: '1px solid #bcf0d0', borderRadius: 8, fontSize: 14,
                                    background: '#f0fdf4', color: '#166534', fontWeight: 700, outline: 'none'
                                }}
                            />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>Qty FAILED AGAIN</label>
                            <input
                                type="number"
                                value={formData.qtyFailed}
                                onChange={(e) => setFormData({ ...formData, qtyFailed: Number(e.target.value) })}
                                style={{
                                    width: '100%', padding: '10px 12px', border: '1px solid #fecaca', borderRadius: 8, fontSize: 14,
                                    background: '#fef2f2', color: '#991b1b', fontWeight: 700, outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 0 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>QC Remarks / Test Result</label>
                        <textarea
                            rows={3}
                            placeholder="Log any technical observations from the final test..."
                            value={formData.remarks}
                            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
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
                            width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
                        }}>
                            <CheckCircle size={32} color="#16a34a" />
                        </div>
                        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Stock Movement</h3>
                        <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
                            Units marked as <b>PASSED</b> will be added back to <b>Saleable Finished Goods</b> stock bucket automatically.
                        </p>

                        <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 10, padding: 12, display: 'flex', gap: 10, marginBottom: 24, textAlign: 'left' }}>
                            <Info size={18} color="#2563eb" style={{ flexShrink: 0 }} />
                            <div style={{ fontSize: 11, color: '#1e40af' }}>
                                This action updates the Stock Ledger and increases current inventory.
                            </div>
                        </div>

                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            disabled={loading || !formData.jobCardId}
                            style={{ height: 48, fontSize: 15, fontWeight: 700, background: '#059669' }}
                        >
                            {loading ? 'Processing...' : 'Confirm & Approve Stock'}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default RetestConfirmationFormPage;
