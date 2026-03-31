import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productionPlanningApi } from '@/services/productionPlanningApi';
import api from '@/services/api';
import { PATHS } from '@/routes/paths';
import { Button, Table, Badge, Card, Input, Select } from '@/components/ui';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

export default function ProductionPlanningFormPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [loading, setLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const [products, setProducts] = useState([]);
    const [formData, setFormData] = useState({
        planningDate: format(new Date(), 'yyyy-MM-dd'),
        finishedProductId: '',
        finishedProductCode: '',
        finishedProductName: '',
        plannedQty: 1,
        warehouse: 'Main Store',
        requiredDate: '',
        remarks: ''
    });

    const [mrpResult, setMrpResult] = useState(null);

    useEffect(() => {
        // Fetch finished products for selection
        api.get('/items', { params: { isManufacturable: true, limit: 1000 } })
            .then(res => {
                const formatted = res.data.data.map(i => ({
                    value: i._id,
                    label: `${i.itemName} (${i.itemCode})`,
                    code: i.itemCode,
                    name: i.itemName
                }));
                setProducts(formatted);
            })
            .catch(err => toast.error('Failed to load products'));

        if (id) fetchPlanningDetails();
    }, [id]);

    const fetchPlanningDetails = async () => {
        try {
            setLoading(true);
            const res = await productionPlanningApi.getPlanningById(id);
            const p = res.data;
            setFormData({
                planningDate: format(new Date(p.planningDate), 'yyyy-MM-dd'),
                finishedProductId: p.finishedProductId._id,
                finishedProductCode: p.finishedProductCode,
                finishedProductName: p.finishedProductName,
                plannedQty: p.plannedQty,
                warehouse: p.warehouse,
                requiredDate: p.requiredDate ? format(new Date(p.requiredDate), 'yyyy-MM-dd') : '',
                remarks: p.remarks || ''
            });
            setMrpResult({
                summary: p.summary,
                lines: p.lines,
                bomVersion: p.bomVersion,
                bomId: p.bomId
            });
        } catch (error) {
            toast.error('Failed to load planning details');
        } finally {
            setLoading(false);
        }
    };

    const handleCalculate = async () => {
        if (!formData.finishedProductId || !formData.plannedQty) {
            toast.error('Please select a product and enter planned quantity');
            return;
        }

        try {
            setCalculating(true);
            const res = await productionPlanningApi.calculateMRP({
                finishedProductId: formData.finishedProductId,
                plannedQty: formData.plannedQty
            });
            setMrpResult(res.data);
            toast.success('MRP calculation completed');
        } catch (error) {
            const msg = error.response?.data?.message || error.message || 'Calculation failed';
            toast.error(msg);
        } finally {
            setCalculating(false);
        }
    };

    const handleSave = async () => {
        if (!mrpResult) {
            toast.error('Please calculate requirements first');
            return;
        }

        try {
            setLoading(true);
            const payload = {
                ...formData,
                ...mrpResult
            };
            
            if (id) {
                await productionPlanningApi.updatePlanning(id, payload);
                toast.success('Planning updated successfully');
            } else {
                await productionPlanningApi.createPlanning(payload);
                toast.success('Planning saved successfully');
                navigate(PATHS.PRODUCTION.PLANNING.ROOT);
            }
        } catch (error) {
            toast.error(error.message || 'Failed to save planning');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { header: 'Item Code', accessor: 'itemCode' },
        { header: 'Item Name', accessor: 'itemName' },
        { header: 'BOM Unit', accessor: 'bomQtyPerUnit', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
        { header: 'Total Req', accessor: 'totalRequiredQty', render: (v) => <span style={{ fontWeight: 700, color: '#2563eb' }}>{v}</span> },
        { header: 'Stock', accessor: 'currentStock' },
        { header: 'Reserved', accessor: 'reservedQty', render: (v) => <span style={{ color: '#9333ea' }}>{v}</span> },
        { header: 'Free Avail', accessor: 'freeAvailableQty', render: (v) => <span style={{ fontWeight: 600, color: '#16a34a' }}>{v}</span> },
        { 
            header: 'Shortage', 
            accessor: 'shortageQty',
            render: (v) => <Badge color={v > 0 ? 'red' : 'green'}>{v}</Badge>
        },
        { 
            header: 'Max Cap', 
            accessor: 'maxProducibleQty',
            render: (v) => (
                <div title="Max FG units this item supports">
                    {v >= formData.plannedQty ? '✅ ' : '⚠️ '}
                    {v}
                </div>
            )
        }
    ];

    return (
        <div style={{ padding: 24, paddingBottom: 100 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>🏭 {id ? 'Edit' : 'New'} Production Planning / MRP</h1>
                    <p style={{ color: '#6b7280', margin: '4px 0 0' }}>Plan resources and check material availability</p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <Button variant="outline" onClick={() => navigate(PATHS.PRODUCTION.PLANNING.ROOT)}>Cancel</Button>
                    <Button onClick={handleSave} loading={loading}>Save Planning</Button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* Header Card */}
                    <Card style={{ padding: 24 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Finished Product</label>
                                <SearchableSelect 
                                    options={products}
                                    value={formData.finishedProductId}
                                    onChange={(val, opt) => setFormData(prev => ({ 
                                        ...prev, 
                                        finishedProductId: val,
                                        finishedProductCode: opt.code,
                                        finishedProductName: opt.name
                                    }))}
                                    placeholder="Select a product"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Planned Quantity</label>
                                <Input 
                                    type="number"
                                    value={formData.plannedQty}
                                    onChange={(e) => setFormData(prev => ({ ...prev, plannedQty: Number(e.target.value) }))}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Planning Date</label>
                                <Input 
                                    type="date"
                                    value={formData.planningDate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, planningDate: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Warehouse / Store</label>
                                <Select 
                                    options={[
                                        { value: 'Main Store', label: 'Main Store' },
                                        { value: 'Raw Material Store', label: 'Raw Material Store' },
                                        { value: 'Production Area', label: 'Production Area' }
                                    ]}
                                    value={formData.warehouse}
                                    onChange={(val) => setFormData(prev => ({ ...prev, warehouse: val }))}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Required By Date</label>
                                <Input 
                                    type="date"
                                    value={formData.requiredDate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, requiredDate: e.target.value }))}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <Button 
                                    style={{ width: '100%' }}
                                    onClick={handleCalculate}
                                    loading={calculating}
                                    variant="secondary"
                                >
                                    🔍 Calculate Requirements
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* Planning Results Grid */}
                    {mrpResult && (
                        <Card style={{ padding: 24, overflow: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Material Requirement Grid</h3>
                                <Badge color="blue">BOM Version: {mrpResult.bomVersion}</Badge>
                            </div>
                            <Table 
                                columns={columns}
                                data={mrpResult.lines}
                                rowStyle={(row) => row.shortageQty > 0 ? { backgroundColor: '#fef2f2' } : {}}
                            />
                        </Card>
                    )}
                </div>

                {/* Summary Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <Card style={{ padding: 20, textAlign: 'center', background: 'linear-gradient(135deg, #0d9488, #0ca678)', color: '#fff' }}>
                        <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 500, textTransform: 'uppercase' }}>Production Feasibility</div>
                        <div style={{ fontSize: 40, fontWeight: 800, margin: '8px 0' }}>
                            {mrpResult ? mrpResult.summary.maxProductionPossible : '--'}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Max Units Producible</div>
                        <div style={{ marginTop: 12, fontSize: 11, background: 'rgba(255,255,255,0.2)', padding: '6px 10px', borderRadius: 6 }}>
                            Based on current free stock bottlenecks
                        </div>
                    </Card>

                    <Card style={{ padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Requirement Summary</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <SummaryRow label="Total BOM Items" value={mrpResult?.summary.totalItems || 0} />
                            <SummaryRow label="Shortage Items" value={mrpResult?.summary.shortageItems || 0} color="#dc2626" />
                            <SummaryRow label="Available Items" value={mrpResult?.summary.fullyAvailableItems || 0} color="#16a34a" />
                            <div style={{ borderTop: '1px dashed #e2e8f0', margin: '8px 0' }} />
                            <SummaryRow label="Readiness" value={mrpResult ? `${Math.round((mrpResult.summary.fullyAvailableItems / mrpResult.summary.totalItems) * 100)}%` : '--'} />
                        </div>
                    </Card>

                    <Card style={{ padding: 20 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Remarks</label>
                        <textarea 
                            style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }}
                            placeholder="Add planning notes..."
                            value={formData.remarks}
                            onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                        />
                    </Card>
                </div>
            </div>
        </div>
    );
}

function SummaryRow({ label, value, color = '#475569' }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>{label}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
        </div>
    );
}
