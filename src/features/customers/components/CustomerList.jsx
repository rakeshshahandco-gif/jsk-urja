import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, useModal } from '@/components/ui';
import { CustomerForm } from './CustomerForm';
import { TalkWithCustomerForm } from '@/features/conversations/components/TalkWithCustomerForm';
import { FollowUpForm } from '@/features/followup/components/FollowUpForm';
import { getCustomers, getCustomer, deleteCustomer, updateCustomer } from '@/services/customerApi';
import { Search, Edit, Trash2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';

export const CustomerList = () => {
    const { openModal, closeModal } = useModal();
    const navigate = useNavigate();

    // State management
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const limit = 10;

    // Fetch customers from API
    const fetchCustomers = async () => {
        setLoading(true);
        setError(null);

        try {
            const params = {
                page: currentPage,
                limit,
                search: searchTerm,
                sortBy: 'createdAt:desc',
            };

            if (statusFilter) {
                params.status = statusFilter;
            }

            const data = await getCustomers(params);
            setCustomers(data.results || []);
            setTotalPages(data.totalPages || 1);
            setTotalResults(data.totalResults || 0);
        } catch (err) {
            setError(err.message || 'Failed to fetch customers');
            console.error('Error fetching customers:', err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch customers on component mount and when filters change
    useEffect(() => {
        fetchCustomers();
    }, [currentPage, searchTerm, statusFilter]);

    const handleAddCustomer = () => {
        navigate('/customers/add');
    };

    const handleEditCustomer = async (customer) => {
        try {
            console.log('🔍 Editing customerId:', customer._id);

            // Fetch fresh customer data from MongoDB before opening modal 
            const freshCustomerData = await getCustomer(customer._id);
            console.log('✅ Fetched customer data:', freshCustomerData);

            openModal(
                CustomerForm,
                {
                    title: 'Edit Customer',
                    size: 'xl',
                    customer: freshCustomerData,
                    onSubmit: async (data) => {
                        try {
                            console.log('📤 Updating customer with payload:', data);

                            // Process tags if it's a string
                            if (typeof data.tags === 'string') {
                                data.tags = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
                            }

                            // Ensure arrays are properly formatted
                            if (!Array.isArray(data.interestedProducts)) {
                                data.interestedProducts = [];
                            }
                            if (!Array.isArray(data.contactPersons)) {
                                data.contactPersons = [];
                            }

                            const updatedCustomer = await updateCustomer(customer._id, data);
                            console.log('✅ Customer updated successfully:', updatedCustomer);

                            closeModal();
                            fetchCustomers(); // Refresh list
                            alert('Customer updated successfully!');
                        } catch (error) {
                            console.error('❌ Failed to update customer:', error);
                            alert('Failed to update customer: ' + error.message);
                        }
                    },
                    onCancel: closeModal,
                }
            );
        } catch (error) {
            console.error('❌ Error loading customer for edit:', error);
            alert('Failed to load customer details: ' + error.message);
        }
    };

    const handleDeleteCustomer = (customer) => {
        if (window.confirm(`Are you sure you want to delete ${customer.customerName || customer.name || 'this customer'}?`)) {
            deleteCustomer(customer._id)
                .then(() => {
                    fetchCustomers(); // Refresh list
                    alert('Customer deleted successfully!');
                })
                .catch((error) => {
                    alert('Failed to delete customer: ' + error.message);
                });
        }
    };

    const handleTalkWithCustomer = (customer) => {
        navigate(`/talk/${customer._id}`);
    };

    const handleFollowUp = (customer) => {
        navigate(`/followup/${customer._id}`);
    };

    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1); // Reset to first page on search
    };

    const handleStatusFilter = (e) => {
        setStatusFilter(e.target.value);
        setCurrentPage(1); // Reset to first page on filter
    };

    const getPrimaryContact = (contactPersons) => {
        if (!contactPersons || contactPersons.length === 0) return null;
        return contactPersons.find(c => c.isPrimary) || contactPersons[0];
    };

    const getStatusBadgeStyle = (status) => {
        const styles = {
            hot: { bg: '#fee2e2', color: '#dc2626' },
            warm: { bg: '#fef3c7', color: '#d97706' },
            cold: { bg: '#dbeafe', color: '#2563eb' },
            active: { bg: '#d1fae5', color: '#10b981' },
            inactive: { bg: '#f3f4f6', color: '#6b7280' },
        };
        return styles[status] || styles.inactive;
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
            {/* Page Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px'
            }}>
                <h1 style={{
                    fontSize: '2rem',
                    fontWeight: '700',
                    color: '#1f2937',
                    margin: 0
                }}>
                    Customers
                    {totalResults > 0 && (
                        <span style={{ fontSize: '1rem', fontWeight: 400, color: '#6b7280', marginLeft: '12px' }}>
                            ({totalResults} total)
                        </span>
                    )}
                </h1>
                <Button onClick={handleAddCustomer}>
                    <Plus size={20} /> Add Customer
                </Button>
            </div>

            {/* Filters */}
            <div style={{
                background: '#fff',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '24px',
                display: 'flex',
                gap: '16px',
                alignItems: 'center',
                flexWrap: 'wrap'
            }}>
                <div style={{ flex: '1', minWidth: '250px' }}>
                    <div style={{ position: 'relative' }}>
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
                        <Input
                            type="text"
                            placeholder="Search customers..."
                            value={searchTerm}
                            onChange={handleSearch}
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>
                </div>
                <div style={{ minWidth: '180px' }}>
                    <select
                        value={statusFilter}
                        onChange={handleStatusFilter}
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            backgroundColor: '#fff',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="">All Statuses</option>
                        <option value="lead">Lead</option>
                        <option value="running_high">Running High</option>
                        <option value="running_low">Running Low</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
            </div>

            {/* Loading State */}
            {loading && (
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
                    <div style={{ fontSize: '0.875rem', marginBottom: '16px', color: '#7f1d1d' }}>
                        Please check if the backend server is running and accessible.
                    </div>
                    <Button onClick={fetchCustomers} variant="outline" style={{ borderColor: '#b91c1c', color: '#b91c1c' }}>
                        Retry Loading
                    </Button>
                </div>
            )}

            {/* Customer Table */}
            {!loading && !error && (
                <>
                    {customers.length === 0 ? (
                        <div style={{ background: '#fff', padding: '40px', borderRadius: '8px', textAlign: 'center', color: '#666' }}>
                            <p style={{ margin: 0, fontSize: '1.125rem' }}>No customers found</p>
                            <p style={{ margin: '8px 0 0 0', color: '#9ca3af' }}>
                                {searchTerm || statusFilter ? 'Try adjusting your filters' : 'Click "Add Customer" to get started'}
                            </p>
                        </div>
                    ) : (
                        <div style={{ background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Company</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Primary Contact</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Mobile</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Customer Status</th>
                                        <th style={{ padding: '16px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customers.map((customer) => {
                                        const primaryContact = getPrimaryContact(customer.contactPersons);
                                        const statusStyle = getStatusBadgeStyle(customer.customerStatus);

                                        return (
                                            <tr key={customer._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '16px', fontWeight: 500, color: '#1f2937' }}>{customer.customerName || customer.name || 'Not Provided'}</td>
                                                <td style={{ padding: '16px', color: '#6b7280' }}>
                                                    {customer.company || '-'}
                                                    {customer.companyBrand ? ` (${customer.companyBrand})` : ''}
                                                </td>
                                                <td style={{ padding: '16px', color: '#6b7280' }}>
                                                    {primaryContact ? (primaryContact.name || '-') : '-'}
                                                </td>
                                                <td style={{ padding: '16px', color: '#6b7280' }}>
                                                    {primaryContact ? (primaryContact.mobile || '-') : '-'}
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
                                                            variant="outline"
                                                            onClick={() => handleTalkWithCustomer(customer)}
                                                            title="Talk with customer"
                                                        >
                                                            💬
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleFollowUp(customer)}
                                                            title="Follow-up tracker"
                                                        >
                                                            📅
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleEditCustomer(customer)}
                                                            style={{
                                                                backgroundColor: '#3b82f6',
                                                                color: 'white',
                                                                border: 'none',
                                                                fontWeight: '600'
                                                            }}
                                                            title="Edit customer"
                                                        >
                                                            EDIT
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            style={{ color: '#dc2626' }}
                                                            onClick={() => handleDeleteCustomer(customer)}
                                                            title="Delete customer"
                                                        >
                                                            <Trash2 size={16} />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: '24px',
                            padding: '16px',
                            background: '#fff',
                            borderRadius: '8px'
                        }}>
                            <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                                Page {currentPage} of {totalPages}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft size={16} /> Previous
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    Next <ChevronRight size={16} />
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

