import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { getCustomers } from '@/services/customerApi';
import { getFollowups } from '@/services/followupApi';
import { Calendar, ArrowRight, Search, Phone, MessageCircle } from 'lucide-react';

export const FollowupDashboard = () => {
    const navigate = useNavigate();
    const [error, setError] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [followups, setFollowups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [dateRange, setDateRange] = useState('today'); // Added state
    const [assignedToMe, setAssignedToMe] = useState(false); // Added state

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch all customers - we'll show those with and without follow-ups
            const [customersData, followupsData] = await Promise.all([
                getCustomers({ limit: 100, sortBy: 'createdAt:desc', search: debouncedSearch }),
                getFollowups({ limit: 100 })
            ]);
            setCustomers(customersData.results || []);
            setFollowups(followupsData.results || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
            setError(`Failed to load data: ${error.message || 'Server unreachable'}`);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch]);

    const handleOpenFollowup = (customerId) => {
        navigate(`/followup/${customerId}`);
    };

    const getPrimaryContact = (contactPersons) => {
        if (!contactPersons || contactPersons.length === 0) return null;
        return contactPersons.find(c => c.isPrimary) || contactPersons[0];
    };

    const getStatusStyle = (status) => {
        const styles = {
            hot: { bg: '#fee2e2', color: '#dc2626' },
            warm: { bg: '#fef3c7', color: '#d97706' },
            cold: { bg: '#dbeafe', color: '#2563eb' },
            active: { bg: '#d1fae5', color: '#10b981' },
            inactive: { bg: '#f3f4f6', color: '#6b7280' },
        };
        return styles[status] || styles.inactive;
    };

    const filteredCustomers = customers; // Server already filtered

    return (
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <Calendar size={32} style={{ color: '#3b82f6' }} />
                    <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937', margin: 0 }}>
                        Follow-up Tracker Dashboard
                    </h1>
                </div>
                <p style={{ color: '#6b7280', margin: 0 }}>
                    Manage follow-ups and conversations for all customers
                </p>
            </div>

            {/* Search */}
            <div style={{
                background: '#fff',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
                <div style={{ position: 'relative', maxWidth: '400px' }}>
                    <Search
                        size={18}
                        style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#9ca3af'
                        }}
                    />
                    <input
                        type="text"
                        placeholder="Search by name, company, or mobile..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 40px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '0.875rem'
                        }}
                    />
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div style={{
                    background: '#fef2f2',
                    padding: '24px',
                    borderRadius: '8px',
                    marginBottom: '24px',
                    border: '1px solid #f87171',
                    textAlign: 'center',
                    color: '#b91c1c'
                }}>
                    <p style={{ fontWeight: 600, marginBottom: '12px' }}>{error}</p>
                    <Button onClick={fetchCustomersWithFollowups} variant="outline">
                        Retry Loading
                    </Button>
                </div>
            )}

            {/* Loading */}
            {loading && !error && (
                <div style={{
                    background: '#fff',
                    padding: '40px',
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: '#6b7280'
                }}>
                    Loading customers...
                </div>
            )}

            {/* Customer Table */}
            {!loading && !error && (
                <div style={{ background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    {filteredCustomers.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                            <p style={{ margin: 0, fontSize: '1.125rem' }}>No customers found</p>
                            <p style={{ margin: '8px 0 0 0', color: '#9ca3af' }}>
                                {searchTerm ? 'Try adjusting your search' : 'Add customers to get started'}
                            </p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                    <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Customer</th>
                                    <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Company</th>
                                    <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Contact Person</th>
                                    <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Mobile</th>
                                    <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Type</th>
                                    <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Status</th>
                                    <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCustomers.map((customer) => {
                                    const primaryContact = getPrimaryContact(customer.contactPersons);
                                    const statusStyle = getStatusStyle(customer.customerStatus);

                                    return (
                                        <tr key={customer._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '16px', fontWeight: 500, color: '#1f2937' }}>
                                                {customer.customerName || customer.name || 'Not Provided'}
                                            </td>
                                            <td style={{ padding: '16px', color: '#6b7280' }}>
                                                {customer.company || '-'}
                                            </td>
                                            <td style={{ padding: '16px', color: '#6b7280' }}>
                                                {primaryContact?.name || '-'}
                                            </td>
                                            <td style={{ padding: '16px', color: '#6b7280' }}>
                                                {primaryContact?.mobile || '-'}
                                            </td>
                                            <td style={{ padding: '16px', color: '#6b7280' }}>
                                                {(() => {
                                                    const followup = followups.find(f => f.customerId?._id === customer._id || f.customerId === customer._id);
                                                    if (!followup) return '-';
                                                    return (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            {followup.followUpType === 'WHATSAPP' ? (
                                                                <><MessageCircle size={16} style={{ color: '#25D366' }} /> WhatsApp</>
                                                            ) : (
                                                                <><Phone size={16} style={{ color: '#3b82f6' }} /> Call</>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <span style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.875rem',
                                                    fontWeight: 500,
                                                    backgroundColor: statusStyle.bg,
                                                    color: statusStyle.color,
                                                    textTransform: 'capitalize'
                                                }}>
                                                    {customer.customerStatus}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleOpenFollowup(customer._id)}
                                                        title="Open follow-up tracker"
                                                    >
                                                        Open Follow-up <ArrowRight size={16} style={{ marginLeft: '4px' }} />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {/* Results count */}
                    {!loading && filteredCustomers.length > 0 && (
                        <div style={{
                            padding: '16px',
                            background: '#f9fafb',
                            borderTop: '1px solid #e5e7eb',
                            textAlign: 'center',
                            color: '#6b7280',
                            fontSize: '0.875rem'
                        }}>
                            Showing {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            )}

            {/* Info Box */}
            <div style={{
                marginTop: '24px',
                padding: '16px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                color: '#1e40af'
            }}>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>
                    <strong>💡 Tip:</strong> Click "Open Follow-up" to manage conversations and set follow-up reminders for each customer.
                </p>
            </div>
        </div>
    );
};
