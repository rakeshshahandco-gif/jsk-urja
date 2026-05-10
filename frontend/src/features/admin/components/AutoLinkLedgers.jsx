import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Input } from '@/components/ui';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { Play, CheckCircle, AlertTriangle, Link as LinkIcon, PlusCircle, Search, Loader2, Landmark } from 'lucide-react';

const AutoLinkLedgers = () => {
    const [loading, setLoading] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [cbPreviewData, setCbPreviewData] = useState(null);
    const [applying, setApplying] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('customers'); // 'customers', 'suppliers', or 'cashbank'

    const fetchPreview = async () => {
        setLoading(true);
        try {
            const [entityRes, cbRes] = await Promise.all([
                axios.get('/api/v1/accounts/masters/ledger-link/preview'),
                axios.get('/api/v1/accounts/masters/ledger-link/cb-preview')
            ]);

            if (entityRes.data.success) {
                setPreviewData(entityRes.data.data);
            }
            if (cbRes.data.success) {
                setCbPreviewData(cbRes.data.data);
            }
        } catch (error) {
            toast.error('Failed to fetch preview data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPreview();
    }, []);

    const handleApply = async () => {
        const isCB = activeTab === 'cashbank';
        const msg = isCB 
            ? 'Are you sure you want to apply Cash/Bank linking? This will create new ledgers or link existing ones for all unlinked Cash/Bank accounts.'
            : 'Are you sure you want to apply Customer/Supplier linking? This will create new ledgers or link existing ones as shown in the preview.';

        if (!window.confirm(msg)) {
            return;
        }

        setApplying(true);
        try {
            const url = isCB 
                ? '/api/v1/accounts/masters/ledger-link/cb-apply'
                : '/api/v1/accounts/masters/ledger-link/apply';
            
            const response = await axios.post(url);
            if (response.data.success) {
                toast.success('Ledger linking completed successfully');
                fetchPreview();
            }
        } catch (error) {
            toast.error('Error applying ledger linking');
        } finally {
            setApplying(false);
        }
    };

    const filteredData = () => {
        let data = [];
        if (activeTab === 'customers') data = previewData?.customers || [];
        else if (activeTab === 'suppliers') data = previewData?.suppliers || [];
        else if (activeTab === 'cashbank') data = cbPreviewData?.accounts || [];

        if (!searchTerm) return data;
        
        return data.filter(item => 
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.ledgerName && item.ledgerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (item.proposedLedgerName && item.proposedLedgerName.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    };

    if (loading && !previewData && !cbPreviewData) {
        return (
            <div className="p-8 flex justify-center items-center">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
                <span className="ml-3 text-lg font-medium">Scanning masters and ledgers...</span>
            </div>
        );
    }

    const hasDataToApply = () => {
        if (activeTab === 'cashbank') return (cbPreviewData?.summary.toLink || 0) + (cbPreviewData?.summary.toCreate || 0) > 0;
        if (activeTab === 'customers') return (previewData?.summary.customersToLink || 0) + (previewData?.summary.customersToCreate || 0) > 0;
        if (activeTab === 'suppliers') return (previewData?.summary.suppliersToLink || 0) + (previewData?.summary.suppliersToCreate || 0) > 0;
        return false;
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Ledger Linking Utility</h1>
                    <p className="text-gray-500 mt-1">Bulk scan and auto-link masters to Accounting Ledgers.</p>
                </div>
                <div className="flex gap-3">
                    <Button 
                        variant="outline" 
                        onClick={fetchPreview}
                        disabled={loading || applying}
                    >
                        Refresh Scan
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={handleApply}
                        disabled={loading || applying || !hasDataToApply()}
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-md"
                    >
                        {applying ? <Loader2 className="animate-spin mr-2" size={18} /> : <Play size={18} className="mr-2" />}
                        Apply {activeTab === 'cashbank' ? 'Cash/Bank' : 'Links'}
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {previewData && (
                    <>
                        <SummaryCard 
                            title="Customers" 
                            value={previewData.summary.totalCustomers} 
                            subValue={`Pending: ${previewData.summary.customersToLink + previewData.summary.customersToCreate}`}
                            color="bg-blue-50 text-blue-700" 
                        />
                        <SummaryCard 
                            title="Suppliers" 
                            value={previewData.summary.totalSuppliers} 
                            subValue={`Pending: ${previewData.summary.suppliersToLink + previewData.summary.suppliersToCreate}`}
                            color="bg-amber-50 text-amber-700" 
                        />
                    </>
                )}
                {cbPreviewData && (
                    <SummaryCard 
                        title="Cash & Bank Accounts" 
                        value={cbPreviewData.summary.totalAccounts} 
                        subValue={`Pending: ${cbPreviewData.summary.toLink + cbPreviewData.summary.toCreate}`}
                        color="bg-emerald-50 text-emerald-700"
                        icon={<Landmark className="opacity-20" size={40} />}
                    />
                )}
            </div>

            <Card className="overflow-hidden shadow-sm border-gray-200">
                <div className="border-b border-gray-200 bg-gray-50/50 p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex bg-white p-1 rounded-lg border border-gray-200 w-fit shadow-sm">
                            <TabButton 
                                active={activeTab === 'customers'} 
                                onClick={() => setActiveTab('customers')}
                                label="Customers"
                                count={previewData?.customers.length || 0}
                            />
                            <TabButton 
                                active={activeTab === 'suppliers'} 
                                onClick={() => setActiveTab('suppliers')}
                                label="Suppliers"
                                count={previewData?.suppliers.length || 0}
                            />
                            <TabButton 
                                active={activeTab === 'cashbank'} 
                                onClick={() => setActiveTab('cashbank')}
                                label="Cash & Bank"
                                count={cbPreviewData?.accounts.length || 0}
                            />
                        </div>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <Input 
                                placeholder={`Search ${activeTab}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-10 border-gray-200 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 border-b border-gray-200">Master Name</th>
                                <th className="px-6 py-4 border-b border-gray-200">{activeTab === 'cashbank' ? 'Type' : 'City'}</th>
                                <th className="px-6 py-4 border-b border-gray-200">Suggested Action</th>
                                <th className="px-6 py-4 border-b border-gray-200">Accounting Ledger</th>
                                <th className="px-6 py-4 border-b border-gray-200">Group</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredData().map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                                    <td className="px-6 py-4 text-gray-500">
                                        {activeTab === 'cashbank' ? (
                                            <Badge variant={item.type === 'Bank' ? 'primary' : 'warning'} className="text-[10px]">
                                                {item.type}
                                            </Badge>
                                        ) : (item.city || '-')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <Badge 
                                            variant={item.existingLedgerFound ? 'success' : 'info'}
                                            className="px-2 py-1 rounded-full text-xs"
                                        >
                                            {item.existingLedgerFound ? (
                                                <span className="flex items-center"><LinkIcon size={12} className="mr-1" /> Link Existing</span>
                                            ) : (
                                                <span className="flex items-center"><PlusCircle size={12} className="mr-1" /> Create New</span>
                                            )}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-gray-800 font-semibold">{item.ledgerName || item.proposedLedgerName}</span>
                                            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">
                                                {item.existingLedgerFound ? 'FOUND IN DATABASE' : 'WILL BE CREATED'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-gray-600 bg-gray-100 px-2 py-1 rounded text-xs font-medium">
                                            {item.group}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {filteredData().length === 0 && (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-400 font-medium">
                                        {searchTerm ? 'No matches found for your search.' : `All ${activeTab} are already linked correctly!`}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

const TabButton = ({ active, onClick, label, count }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            active 
            ? 'bg-indigo-600 text-white shadow-sm' 
            : 'text-gray-600 hover:bg-gray-100'
        }`}
    >
        {label} ({count})
    </button>
);

const SummaryCard = ({ title, value, subValue, color, icon }) => (
    <Card className={`${color.split(' ')[0]} border-none shadow-sm relative overflow-hidden`}>
        <div className="p-5 flex justify-between items-start">
            <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider opacity-70 mb-1">{title}</h3>
                <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-extrabold">{value}</span>
                    {subValue && <span className="text-xs font-bold opacity-60 underline decoration-indigo-200 underline-offset-4">{subValue}</span>}
                </div>
            </div>
            {icon && <div className="absolute right-[-10px] bottom-[-10px]">{icon}</div>}
        </div>
    </Card>
);

export default AutoLinkLedgers;
