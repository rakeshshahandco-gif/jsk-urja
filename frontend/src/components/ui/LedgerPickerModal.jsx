import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from '@/components/ui';
import { Search, Check, Loader2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

export const LedgerPickerModal = ({ isOpen, onClose, onSelect, title = "Select Ledger", initialSearch = "", entityType = "Customer" }) => {
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [ledgers, setLedgers] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchLedgers = async () => {
        setLoading(true);
        try {
            const params = {
                search: searchTerm,
                // If it's a customer, we usually want Sundry Debtors
                // But let's just search all ledgers for flexibility
            };
            const response = await axios.get('/api/v1/accounts/masters/ledgers', { params });
            if (response.data.success) {
                setLedgers(response.data.data);
            }
        } catch (error) {
            toast.error('Failed to fetch ledgers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchLedgers();
        }
    }, [isOpen]);

    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
    };

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (isOpen) fetchLedgers();
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
            <div className="p-4">
                <div className="mb-4 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <Input 
                        placeholder="Search by ledger name..."
                        value={searchTerm}
                        onChange={handleSearch}
                        className="pl-10"
                        autoFocus
                    />
                </div>

                <div className="max-h-[400px] overflow-auto border border-gray-200 rounded-lg">
                    {loading && ledgers.length === 0 ? (
                        <div className="p-8 text-center flex justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 border-b">Ledger Name</th>
                                    <th className="px-4 py-3 border-b">Group</th>
                                    <th className="px-4 py-3 border-b text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {ledgers.map(ledger => (
                                    <tr key={ledger._id} className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="px-4 py-3 font-medium text-gray-900">{ledger.name}</td>
                                        <td className="px-4 py-3 text-gray-500">{ledger.underGroup?.name}</td>
                                        <td className="px-4 py-3 text-right">
                                            <Button 
                                                size="xs" 
                                                variant="primary"
                                                onClick={() => onSelect(ledger)}
                                                startIcon={<Check size={14} />}
                                            >
                                                Select
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {ledgers.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan="3" className="px-4 py-8 text-center text-gray-400">
                                            No ledgers found matching "{searchTerm}"
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </Modal>
    );
};
