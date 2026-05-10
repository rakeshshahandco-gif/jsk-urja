import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { productionPlanningApi } from '@/services/productionPlanningApi';
import { PATHS } from '@/routes/paths';
import { Button, Table, Badge, Card, Input } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ArrowUp, ArrowDown } from 'lucide-react';


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

    const statusColors = {
        Draft: 'gray', Calculated: 'blue', Approved: 'green',
        'Purchase Pending': 'yellow', 'Material Arranged': 'blue',
        'Ready for Production': 'green', Closed: 'gray', Cancelled: 'red'
    };

    const columns = [
        {
            header: 'Planning No',
            accessor: 'planningNo',
            render: (val, row) => (
                <span
                    style={{ fontWeight: 700, color: '#0d9488', cursor: 'pointer', fontFamily: 'monospace' }}
                    onClick={() => navigate(PATHS.PRODUCTION.PLANNING.DETAILS(row._id))}
                >
                    {val}
                </span>
            )
        },
        {
            header: 'Date',
            accessor: 'planningDate',
            render: (val) => val ? format(new Date(val), 'dd-MM-yyyy') : '—'
        },
        {
            header: 'Products',
            accessor: 'productLines',
            render: (productLines, row) => {
                const lines = productLines?.length
                    ? productLines
                    : (row.finishedProductName ? [{ finishedProductName: row.finishedProductName, finishedProductCode: row.finishedProductCode }] : []);
                return (
                    <div>
                        {lines.slice(0, 2).map((pl, i) => (
                            <div key={i} style={{ fontSize: 12 }}>
                                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{pl.finishedProductCode}</span>
                                <span style={{ color: '#64748b', marginLeft: 4 }}>{pl.finishedProductName}</span>
                            </div>
                        ))}
                        {lines.length > 2 && (
                            <div style={{ fontSize: 11, color: '#0d9488', fontWeight: 700 }}>+{lines.length - 2} more products</div>
                        )}
                        {lines.length === 0 && <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                    </div>
                );
            }
        },
        {
            header: 'MRP Summary',
            accessor: 'summary',
            render: (summary, row) => {
                const productCount = row.productLines?.length || (row.finishedProductId ? 1 : 0);
                return (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>
                            🏭 {productCount} Product{productCount !== 1 ? 's' : ''}
                        </span>
                        {summary?.shortageItems > 0 && (
                            <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>
                                ⚠️ {summary.shortageItems} Short
                            </span>
                        )}
                        {summary?.readinessPercent !== undefined && (
                            <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>
                                {summary.readinessPercent}% Ready
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            header: 'Warehouse',
            accessor: 'warehouse',
            render: (val) => <span style={{ fontSize: 12, color: '#475569' }}>{val || 'Main Store'}</span>
        },
        {
            header: 'Status',
            accessor: 'status',
            render: (val) => <Badge color={statusColors[val] || 'gray'}>{val}</Badge>
        },
        {
            header: 'Actions',
            accessor: '_id',
            render: (id) => (
                <Button size="sm" variant="outline" onClick={() => navigate(PATHS.PRODUCTION.PLANNING.DETAILS(id))}>
                    View / Edit
                </Button>
            )
        }
    ];

    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>🏭 Production Planning / MRP</h1>
                    <p style={{ color: '#6b7280', margin: '4px 0 0' }}>Multi-product Material Requirement Planning records</p>
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
                            Page {pagination.page} of {pagination.pages} ({pagination.total} records)
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

