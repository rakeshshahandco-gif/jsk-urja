import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { createMaterialIssue, getJobCards } from '@/services/productionReworkApi';
import { getItems } from '@/services/itemApi';
import { toast } from 'react-hot-toast';
import { Button, Input } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';

const ReworkMaterialIssueFormPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const jobCardIdParam = searchParams.get('jobCardId');

    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [jobCards, setJobCards] = useState([]);
    const [fetchingData, setFetchingData] = useState(true);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        jobCardId: '',
        issuedTo: '',
        items: []
    });

    const [currentItem, setCurrentItem] = useState({
        itemId: '',
        qty: 1,
        remarks: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [itemsData, jcData] = await Promise.all([
                getItems(),
                getJobCards()
            ]);
            setItems(itemsData.filter(i => i.itemType === 'COMPONENT' || i.itemType === 'RAW_MATERIAL' || i.itemType === 'SUB_ASSEMBLY'));
            setJobCards(jcData.filter(j => j.status === 'In Progress' || j.status === 'Pending'));

            if (jobCardIdParam) {
                const selected = jcData.find(j => j._id === jobCardIdParam);
                if (selected) {
                    setFormData(prev => ({
                        ...prev,
                        jobCardId: selected._id,
                        issuedTo: selected.technicianName
                    }));
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load items or job cards');
        } finally {
            setFetchingData(false);
        }
    };

    const jcOptions = jobCards.map(j => ({
        value: j._id,
        label: `${j.jobCardNo} - ${j.itemName}`,
        meta: `Technician: ${j.technicianName}`
    }));

    const itemOptions = items.map(item => ({
        value: item._id,
        label: item.itemName,
        meta: `${item.itemCode} | Stock: ${item.currentStock}`
    }));

    const addItem = () => {
        if (!currentItem.itemId || currentItem.qty <= 0) {
            toast.error('Please select an item and enter valid quantity');
            return;
        }

        const selectedItem = items.find(i => i._id === currentItem.itemId);
        const newItem = {
            ...currentItem,
            itemName: selectedItem.itemName,
            itemCode: selectedItem.itemCode,
            uom: selectedItem.uom
        };

        setFormData({
            ...formData,
            items: [...formData.items, newItem]
        });

        setCurrentItem({ itemId: '', qty: 1, remarks: '' });
    };

    const removeItem = (index) => {
        const newItems = [...formData.items];
        newItems.splice(index, 1);
        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.jobCardId || formData.items.length === 0) {
            toast.error('Please select a Job Card and add at least one item');
            return;
        }

        try {
            setLoading(true);
            await createMaterialIssue(formData);
            toast.success('Material Issue recorded successfully');
            navigate(PATHS.PRODUCTION.REWORK.MATERIAL_ISSUES);
        } catch (error) {
            console.error('Error saving issue:', error);
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
                    onClick={() => window.confirm('Discard changes?') && navigate(-1)}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex' }}
                >
                    <ArrowLeft size={18} color="#64748b" />
                </button>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#1e293b' }}>Material Issue for Rework</h1>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 0 }}>
                        <Input
                            label="Issue Date"
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
                                        issuedTo: jc ? jc.technicianName : formData.issuedTo
                                    });
                                }}
                                placeholder="Select Job Card..."
                            />
                        </div>
                        <Input
                            label="Issued To"
                            placeholder="Technician/Issuer Name"
                            value={formData.issuedTo}
                            onChange={(e) => setFormData({ ...formData, issuedTo: e.target.value })}
                        />
                    </div>
                </div>

                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Add Components/Items</h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr 100px', gap: 12, alignItems: 'end', background: '#f8fafc', padding: 16, borderRadius: 10, border: '1px dashed #e2e8f0' }}>
                        <div className="form-group">
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Select Component</label>
                            <SearchableSelect
                                options={itemOptions}
                                value={currentItem.itemId}
                                onChange={(val) => setCurrentItem({ ...currentItem, itemId: val })}
                                placeholder="Select item..."
                            />
                        </div>
                        <Input
                            label="Quantity"
                            type="number"
                            value={currentItem.qty}
                            onChange={(e) => setCurrentItem({ ...currentItem, qty: Number(e.target.value) })}
                        />
                        <Input
                            label="Remarks/Notes"
                            placeholder="e.g. Reason for replacement"
                            value={currentItem.remarks}
                            onChange={(e) => setCurrentItem({ ...currentItem, remarks: e.target.value })}
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={addItem}
                            style={{ height: 40, background: '#1e293b', color: '#fff', width: '100%' }}
                        >
                            <Plus size={18} />
                        </Button>
                    </div>

                    <div style={{ marginTop: 24, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left' }}>
                                    <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: 600 }}>Item Name</th>
                                    <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: 600 }}>Item Code</th>
                                    <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: 600 }}>Qty</th>
                                    <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: 600 }}>UOM</th>
                                    <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: 600 }}>Remarks</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {formData.items.map((item, index) => (
                                    <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{item.itemName}</td>
                                        <td style={{ padding: '12px 16px', color: '#64748b' }}>{item.itemCode}</td>
                                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{item.qty}</td>
                                        <td style={{ padding: '12px 16px' }}>{item.uom || 'Nos'}</td>
                                        <td style={{ padding: '12px 16px' }}>{item.remarks || '—'}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            <button
                                                type="button"
                                                onClick={() => removeItem(index)}
                                                style={{ background: '#fef2f2', border: 'none', padding: 6, borderRadius: 6, cursor: 'pointer', color: '#dc2626' }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {formData.items.length === 0 && (
                                    <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No items added yet. Search and add components above.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={loading || formData.items.length === 0}
                        style={{ height: 48, padding: '0 40px', fontSize: 15, fontWeight: 700, background: '#2563eb' }}
                    >
                        {loading ? 'Processing...' : <><Save size={18} style={{ marginRight: 8 }} /> Record Material Issue</>}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default ReworkMaterialIssueFormPage;
