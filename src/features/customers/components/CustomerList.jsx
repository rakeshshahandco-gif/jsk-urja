import React, { useState, useEffect } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { useNavigate } from 'react-router-dom';
import { Button, Input, useModal } from '@/components/ui';
import { CustomerForm } from './CustomerForm';
import { TalkWithCustomerForm } from '@/features/conversations/components/TalkWithCustomerForm';
import { FollowUpForm } from '@/features/followup/components/FollowUpForm';
import { ImportCustomerModal } from './ImportCustomerModal';
import { getCustomers, getCustomer, deleteCustomer, updateCustomer } from '@/services/customerApi';
import { Search, Edit, Trash2, Plus, ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import styles from './CustomerList.module.scss';
import clsx from 'clsx';
import toast from 'react-hot-toast';

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
    const [showImportModal, setShowImportModal] = useState(false);
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

    useGlobalSync('customer', (payload) => {
        if (payload.action === 'create') {
            setCustomers(prev => [payload.data, ...prev].slice(0, limit));
            setTotalResults(prev => prev + 1);
        } else if (payload.action === 'update') {
            setCustomers(prev => prev.map(c => c._id === payload.recordId ? { ...c, ...payload.data } : c));
        } else if (payload.action === 'delete') {
            setCustomers(prev => prev.filter(c => c._id !== payload.recordId));
            setTotalResults(prev => Math.max(0, prev - 1));
        }
    });

    const handleAddCustomer = () => {
        navigate('/customers/add');
    };

    const handleImportCustomers = () => {
        setShowImportModal(true);
    };

    const handleImportSuccess = () => {
        fetchCustomers(); // Refresh list after successful import
    };

    const handleEditCustomer = async (customer) => {
        try {
            console.log('🔍 Editing customerId:', customer._id);

            // Fetch fresh customer data from MongoDB before opening modal 
            const freshCustomerData = await getCustomer(customer._id);
            console.log('✅ Fetched customer data:', freshCustomerData);

            const modalId = openModal(
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

                            if (!Array.isArray(data.contactPersons)) {
                                data.contactPersons = [];
                            }

                            const updatedCustomer = await updateCustomer(customer._id, data);
                            console.log('✅ Customer updated successfully:', updatedCustomer);

                            closeModal(modalId);
                            fetchCustomers(); // Refresh list
                            toast.success('Customer updated successfully!');
                        } catch (error) {
                            console.error('❌ Failed to update customer:', error);
                            toast.error('Failed to update customer: ' + error.message);
                        }
                    },
                    onCancel: () => closeModal(modalId),
                }
            );
        } catch (error) {
            console.error('❌ Error loading customer for edit:', error);
            toast.error('Failed to load customer details: ' + error.message);
        }
    };

    const handleDeleteCustomer = (customer) => {
        if (window.confirm(`Are you sure you want to delete ${customer.customerName || customer.name || 'this customer'}?`)) {
            deleteCustomer(customer._id)
                .then(() => {
                    fetchCustomers(); // Refresh list
                    toast.success('Customer deleted successfully!');
                })
                .catch((error) => {
                    toast.error('Failed to delete customer: ' + error.message);
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

    const getStatusClass = (status) => {
        const statusMap = {
            hot: styles.status_hot,
            warm: styles.status_warm,
            cold: styles.status_cold,
            active: styles.status_active,
            inactive: styles.status_inactive,
            lead: styles.status_lead,
            running_high: styles.status_running_high,
            running_low: styles.status_running_low,
        };
        return statusMap[status] || styles.status_inactive;
    };

    return (
        <div className={styles.container}>
            {/* Page Header */}
            <div className={styles.headerContainer}>
                <div className={styles.titleWrapper}>
                    <h1 className={styles.title}>Customers</h1>
                    {totalResults > 0 && (
                        <span className={styles.count}>({totalResults} total)</span>
                    )}
                </div>
                <div className={styles.actions}>
                    <Button variant="outline" size="sm" startIcon={<Upload size={15} />} onClick={handleImportCustomers}>
                        Import
                    </Button>
                    <Button variant="outline" size="sm" startIcon={<Plus size={15} />} onClick={() => navigate('/tasks/create')}>
                        Create Task
                    </Button>
                    <Button size="sm" startIcon={<Plus size={15} />} onClick={handleAddCustomer}>
                        Add Customer
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filtersCard}>
                <div className={styles.searchWrapper}>
                    <Input
                        type="text"
                        placeholder="Search by name, company, or mobile..."
                        value={searchTerm}
                        onChange={handleSearch}
                        startIcon={<Search size={14} />}
                        variant="md"
                    />
                </div>
                <select
                    className={styles.statusSelect}
                    value={statusFilter}
                    onChange={handleStatusFilter}
                >
                    <option value="">All Statuses</option>
                    <option value="lead">Lead</option>
                    <option value="running_high">Running High</option>
                    <option value="running_low">Running Low</option>
                    <option value="inactive">Inactive</option>
                </select>
            </div>

            {/* Content Section */}
            <div className={styles.tableSection}>
                {loading && (
                    <div className={styles.loadingState}>
                        <p className={styles.mainText}>Loading customers...</p>
                    </div>
                )}

                {error && (
                    <div className={styles.errorState}>
                        <p className={styles.title}>{error}</p>
                        <p className={styles.message}>Please check if the backend server is running and accessible.</p>
                        <Button onClick={fetchCustomers} variant="outline" size="sm">
                            Retry Loading
                        </Button>
                    </div>
                )}

                {!loading && !error && (
                    <>
                        {customers.length === 0 ? (
                            <div className={styles.emptyState}>
                                <p className={styles.mainText}>No customers found</p>
                                <p className={styles.subText}>
                                    {searchTerm || statusFilter ? 'Try adjusting your filters' : 'Click "Add Customer" to get started'}
                                </p>
                            </div>
                        ) : (
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Code</th>
                                            <th>Name</th>
                                            <th>Company</th>
                                            <th>Primary Contact</th>
                                            <th>Mobile</th>
                                            <th>Status</th>
                                            <th style={{ textAlign: 'center' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {customers.map((customer) => {
                                            const primaryContact = getPrimaryContact(customer.contactPersons);
                                            const currentStatus = customer.status || customer.customerStatus;
                                            const statusClass = getStatusClass(currentStatus);

                                            return (
                                                <tr key={customer._id}>
                                                    <td><strong>{customer.customerCode || '—'}</strong></td>
                                                    <td className={styles.nameCell}>
                                                        <div>{customer.customerName || customer.name || 'Not Provided'}</div>
                                                        {customer.stickers && customer.stickers.length > 0 && (
                                                            <div className={styles.stickerContainer}>
                                                                {customer.stickers.map(s => (
                                                                    <span
                                                                        key={s._id}
                                                                        className={styles.stickerTag}
                                                                        style={{ backgroundColor: s.color || '#64748b' }}
                                                                        title={s.description}
                                                                    >
                                                                        {s.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className={styles.companyCell}>
                                                        {customer.company || '-'}
                                                        {customer.companyBrand ? ` (${customer.companyBrand})` : ''}
                                                    </td>
                                                    <td>{primaryContact ? (primaryContact.name || '-') : '-'}</td>
                                                    <td>{primaryContact ? (primaryContact.mobile || '-') : '-'}</td>
                                                    <td>
                                                        <span className={clsx(styles.badge, statusClass)}>
                                                            {currentStatus}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className={styles.actionButtons}>
                                                            <button
                                                                className={styles.btnIcon}
                                                                onClick={() => navigate(`/tasks/create?customerId=${customer._id}`)}
                                                                title="Create Task"
                                                            >
                                                                <Plus size={16} />
                                                            </button>
                                                            <button
                                                                className={styles.btnIcon}
                                                                onClick={() => handleTalkWithCustomer(customer)}
                                                                title="Talk with customer"
                                                            >
                                                                💬
                                                            </button>
                                                            <button
                                                                className={styles.btnIcon}
                                                                onClick={() => handleFollowUp(customer)}
                                                                title="Follow-up tracker"
                                                            >
                                                                📅
                                                            </button>
                                                            <button
                                                                className={styles.btnEdit}
                                                                onClick={() => handleEditCustomer(customer)}
                                                                title="Edit customer"
                                                            >
                                                                EDIT
                                                            </button>
                                                            <button
                                                                className={styles.btnDelete}
                                                                onClick={() => handleDeleteCustomer(customer)}
                                                                title="Delete customer"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Pagination */}
            {!loading && !error && totalPages > 1 && (
                <div className={styles.pagination}>
                    <div className={styles.info}>
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className={styles.controls}>
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

            {/* Import Customer Modal */}
            {showImportModal && (
                <ImportCustomerModal
                    isOpen={showImportModal}
                    onClose={() => setShowImportModal(false)}
                    onSuccess={handleImportSuccess}
                />
            )}
        </div>
    );
};
