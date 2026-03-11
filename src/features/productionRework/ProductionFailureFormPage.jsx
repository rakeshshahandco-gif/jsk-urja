import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { createFailure } from '@/services/productionReworkApi';
import { getItems } from '@/services/itemApi';
import * as workOrderApi from '@/services/workOrderApi';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'react-hot-toast';
import { Button, Input, Select } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';

const STAGES = [
    { value: 'PCB Assembly', label: 'PCB Assembly' },
    { value: 'Manual Assembly', label: 'Manual Assembly' },
    { value: 'Soldering', label: 'Soldering' },
    { value: 'Testing', label: 'Testing' },
    { value: '1st QC', label: '1st QC' },
    { value: 'Final QC', label: 'Final QC' },
    { value: 'Burn Test', label: 'Burn Test' },
    { value: 'Packing Inspection', label: 'Packing Inspection' },
    { value: 'Other', label: 'Other' }
];

const REASONS = [
    { value: 'Not Working', label: 'Not Working' },
    { value: 'Low Output', label: 'Low Output' },
    { value: 'Flickering', label: 'Flickering' },
    { value: 'Wrong CCT', label: 'Wrong CCT' },
    { value: 'Dimming Issue', label: 'Dimming Issue' },
    { value: 'Driver Failure', label: 'Driver Failure' },
    { value: 'Solder Issue', label: 'Solder Issue' },
    { value: 'Component Missing', label: 'Component Missing' },
    { value: 'Wrong Component Mounted', label: 'Wrong Component Mounted' },
    { value: 'Short Circuit', label: 'Short Circuit' },
    { value: 'Open Circuit', label: 'Open Circuit' },
    { value: 'PCB Damage', label: 'PCB Damage' },
    { value: 'Heating Issue', label: 'Heating Issue' },
    { value: 'Cosmetic Defect', label: 'Cosmetic Defect' },
    { value: 'Label Issue', label: 'Label Issue' },
    { value: 'Packing Issue', label: 'Packing Issue' },
    { value: 'Other', label: 'Other' }
];

const ProductionFailureFormPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [workOrders, setWorkOrders] = useState([]);
    const [fetchingData, setFetchingData] = useState(true);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        workOrderId: '',
        workOrderNo: '',
        itemId: '',
        qtyChecked: 0,
        qtyFailed: 0,
        qtyPassed: 0,
        stage: '',
        reason: '',
        detailedObservation: '',
        reportedBy: user?.name || '',
        department: '',
        priority: 'Medium'
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [itemsData, woData] = await Promise.all([
                getItems(),
                workOrderApi.getWorkOrders()
            ]);
            setItems(itemsData.filter(i => i.itemType === 'FINISHED_GOODS' || i.itemType === 'SUB_ASSEMBLY'));
            setWorkOrders(woData);
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load items or work orders');
        } finally {
            setFetchingData(false);
        }
    };

    const woOptions = workOrders.map(wo => ({
        value: wo._id,
        label: wo.workOrderNo,
        meta: wo.itemName
    }));

    const itemOptions = items.map(item => ({
        value: item._id,
        label: item.itemName,
        meta: item.itemCode
    }));

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.itemId || !formData.stage || !formData.reason || formData.qtyFailed <= 0) {
            toast.error('Please fill all mandatory fields');
            return;
        }

        try {
            setLoading(true);
            await createFailure(formData);
            toast.success('Failure record created successfully');
            navigate(PATHS.PRODUCTION.REWORK.FAILURES);
        } catch (error) {
            console.error('Error saving failure:', error);
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
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#1e293b' }}>New Production Failure Entry</h1>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                        Failure Details
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
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Work Order (Optional)</label>
                            <SearchableSelect
                                options={woOptions}
                                value={formData.workOrderId}
                                onChange={(val) => {
                                    const wo = workOrders.find(w => w._id === val);
                                    setFormData({
                                        ...formData,
                                        workOrderId: val,
                                        workOrderNo: wo ? wo.workOrderNo : '',
                                        itemId: wo && wo.itemId ? wo.itemId : formData.itemId
                                    });
                                }}
                                placeholder="Select Work Order..."
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Product / Item *</label>
                        <SearchableSelect
                            options={itemOptions}
                            value={formData.itemId}
                            onChange={(val) => setFormData({ ...formData, itemId: val })}
                            placeholder="Select Product..."
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <Select
                            label="Production Stage"
                            required
                            options={STAGES}
                            value={formData.stage}
                            onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                        />
                        <Select
                            label="Failure Reason"
                            required
                            options={REASONS}
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        />
                    </div>

                    <h3 style={{ margin: '24px 0 20px', fontSize: 16, fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                        Quantities & Observations
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <Input
                            label="Qty Checked"
                            type="number"
                            value={formData.qtyChecked}
                            onChange={(e) => {
                                const checked = Number(e.target.value);
                                setFormData({
                                    ...formData,
                                    qtyChecked: checked,
                                    qtyPassed: checked - formData.qtyFailed
                                });
                            }}
                        />
                        <Input
                            label="Qty Failed"
                            type="number"
                            required
                            value={formData.qtyFailed}
                            onChange={(e) => {
                                const failed = Number(e.target.value);
                                setFormData({
                                    ...formData,
                                    qtyFailed: failed,
                                    qtyPassed: formData.qtyChecked - failed
                                });
                            }}
                        />
                        <Input
                            label="Qty Passed"
                            type="number"
                            disabled
                            value={formData.qtyPassed}
                        />
                    </div>

                    <div style={{ marginBottom: 0 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Detailed Observation</label>
                        <textarea
                            rows={4}
                            value={formData.detailedObservation}
                            onChange={(e) => setFormData({ ...formData, detailedObservation: e.target.value })}
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
                        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Metadata</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <Select
                                label="Priority"
                                options={[
                                    { value: 'Low', label: 'Low' },
                                    { value: 'Medium', label: 'Medium' },
                                    { value: 'High', label: 'High' },
                                    { value: 'Urgent', label: 'Urgent' }
                                ]}
                                value={formData.priority}
                                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                            />
                            <Input
                                label="Reported By"
                                value={formData.reportedBy}
                                onChange={(e) => setFormData({ ...formData, reportedBy: e.target.value })}
                            />
                            <Input
                                label="Department"
                                value={formData.department}
                                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                            />
                        </div>
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        disabled={loading}
                        style={{ height: 48, fontSize: 15, fontWeight: 700, background: '#2563eb' }}
                    >
                        {loading ? 'Saving...' : <><Save size={18} style={{ marginRight: 8 }} /> Save Failure Record</>}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default ProductionFailureFormPage;
