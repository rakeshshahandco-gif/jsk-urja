import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { productionPlanningApi } from '@/services/productionPlanningApi';
import { PATHS } from '@/routes/paths';
import { Button, Table, Badge, Card, Input } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

export default function ProductionPlanningListPage() {
    const navigate = useNavigate();
    const [plannings, setPlannings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });

    const fetchPlannings = async () => {
        try {
            setLoading(true);
            const res = await productionPlanningApi.getPlannings({ 
                search: search || undefined,
                page: pagination.page 
            });
            setPlannings(res.data.plannings);
            setPagination({
                page: res.data.page,
                total: res.data.total,
                pages: res.data.pages
            });
        } catch (error) {
            toast.error(error.message || 'Failed to fetch plannings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlannings();
    }, [pagination.page, search]);

    const columns = [
        {
            header: 'Planning No',
            accessor: 'planningNo',
            render: (val, row) => (
                <span 
                    style={{ fontWeight: 700, color: '#0d9488', cursor: 'pointer' }}
                    onClick={() => navigate(PATHS.PRODUCTION.PLANNING.DETAILS(row._id))}
                >
                    {val}
                </span>
            )
        },
        {
            header: 'Date',
            accessor: 'planningDate',
            render: (val) => format(new Date(val), 'dd-MM-yyyy')
        },
        {
            header: 'Finished Product',
            accessor: 'finishedProductName',
            render: (val, row) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{val}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{row.finishedProductCode}</div>
                </div>
            )
        },
        {
            header: 'Planned Qty',
            accessor: 'plannedQty',
            render: (val) => <span style={{ fontWeight: 700 }}>{val}</span>
        },
        {
            header: 'Max Producible',
            accessor: 'summary.maxProductionPossible',
            render: (val) => (
                <Badge color={val === 0 ? 'red' : 'green'}>
                    {val}
                </Badge>
            )
        },
        {
            header: 'Status',
            accessor: 'status',
            render: (val) => {
                const colors = {
                    Draft: 'gray',
                    Calculated: 'blue',
                    Approved: 'green',
                    'Purchase Pending': 'yellow',
                    Cancelled: 'red'
                };
                return <Badge color={colors[val] || 'gray'}>{val}</Badge>;
            }
        },
        {
            header: 'Actions',
            accessor: '_id',
            render: (id) => (
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="outline" onClick={() => navigate(PATHS.PRODUCTION.PLANNING.DETAILS(id))}>
                        View
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>📋 Production Planning History</h1>
                    <p style={{ color: '#6b7280', margin: '4px 0 0' }}>Manage Material Requirement Planning (MRP) records</p>
                </div>
                <Button onClick={() => navigate(PATHS.PRODUCTION.PLANNING.NEW)}>
                    + New Planning / MRP
                </Button>
            </div>

            <Card style={{ padding: 20 }}>
                <div style={{ marginBottom: 20 }}>
                    <Input 
                        placeholder="Search by Planning No or Product Name..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ maxWidth: 400 }}
                    />
                </div>

                <Table 
                    columns={columns}
                    data={plannings}
                    loading={loading}
                />

                {pagination.pages > 1 && (
                    <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 10 }}>
                        <Button 
                            disabled={pagination.page === 1}
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                        >
                            Previous
                        </Button>
                        <span style={{ alignSelf: 'center' }}>
                            Page {pagination.page} of {pagination.pages}
                        </span>
                        <Button 
                            disabled={pagination.page === pagination.pages}
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                        >
                            Next
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );
}
