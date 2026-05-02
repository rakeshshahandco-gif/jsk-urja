import React, { useState, useEffect } from 'react';
import { Button, Input, useModal } from '@/components/ui';
import { Search, Edit, Trash2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { getDistributors, deleteDistributor, createDistributor, updateDistributor } from '@/services/distributorApi';
import { DistributorForm } from './DistributorForm';
import styles from './DistributorList.module.scss';
import toast from 'react-hot-toast';

export const DistributorList = () => {
    const { openModal, closeModal } = useModal();
    const [distributors, setDistributors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const limit = 10;

    const fetchDistributors = async () => {
        setLoading(true);
        try {
            const data = await getDistributors({
                page: currentPage,
                limit,
                name: searchTerm,
                sortBy: 'name:asc',
            });
            setDistributors(data.results || []);
            setTotalPages(data.totalPages || 1);
            setTotalResults(data.totalResults || 0);
        } catch (error) {
            toast.error('Failed to fetch distributors');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDistributors();
    }, [currentPage, searchTerm]);

    const handleAddDistributor = () => {
        const modalId = openModal(DistributorForm, {
            title: 'Add Distributor',
            size: 'lg',
            onSubmit: async (data) => {
                try {
                    await createDistributor(data);
                    toast.success('Distributor added successfully');
                    closeModal(modalId);
                    fetchDistributors();
                } catch (error) {
                    toast.error('Failed to add distributor');
                }
            },
            onCancel: () => closeModal(modalId),
        });
    };

    const handleEditDistributor = (distributor) => {
        const modalId = openModal(DistributorForm, {
            title: 'Edit Distributor',
            size: 'lg',
            distributor,
            onSubmit: async (data) => {
                try {
                    await updateDistributor(distributor._id, data);
                    toast.success('Distributor updated successfully');
                    closeModal(modalId);
                    fetchDistributors();
                } catch (error) {
                    toast.error('Failed to update distributor');
                }
            },
            onCancel: () => closeModal(modalId),
        });
    };

    const handleDeleteDistributor = async (distributor) => {
        if (window.confirm(`Are you sure you want to delete ${distributor.name}?`)) {
            try {
                await deleteDistributor(distributor._id);
                toast.success('Distributor deleted');
                fetchDistributors();
            } catch (error) {
                toast.error('Failed to delete distributor');
            }
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Distributor Master</h1>
                <Button startIcon={<Plus size={18} />} onClick={handleAddDistributor}>
                    Add Distributor
                </Button>
            </div>

            <div className={styles.filters}>
                <Input
                    placeholder="Search distributors..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    startIcon={<Search size={18} />}
                />
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Contact Person</th>
                            <th>Mobile</th>
                            <th>City</th>
                            <th>Default Incentive</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
                        ) : distributors.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No distributors found</td></tr>
                        ) : (
                            distributors.map((d) => (
                                <tr key={d._id}>
                                    <td><strong>{d.name}</strong></td>
                                    <td>{d.contactPerson || '-'}</td>
                                    <td>{d.mobile || '-'}</td>
                                    <td>{d.city || '-'}</td>
                                    <td>{d.defaultIncentivePercentage}% ({d.defaultIncentiveType})</td>
                                    <td>
                                        <span className={d.status === 'Active' ? styles.statusActive : styles.statusInactive}>
                                            {d.status}
                                        </span>
                                    </td>
                                    <td className={styles.actions}>
                                        <button onClick={() => handleEditDistributor(d)} className={styles.editBtn}><Edit size={16} /></button>
                                        <button onClick={() => handleDeleteDistributor(d)} className={styles.deleteBtn}><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => p - 1)}
                    >
                        <ChevronLeft size={16} /> Previous
                    </Button>
                    <span>Page {currentPage} of {totalPages}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => p + 1)}
                    >
                        Next <ChevronRight size={16} />
                    </Button>
                </div>
            )}
        </div>
    );
};
