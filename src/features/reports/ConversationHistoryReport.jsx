import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { getCustomers, getConversationHistory } from '@/services/customerApi';
import { Input, Button, Select } from '@/components/ui';
import { Search, Filter, Phone, MessageSquare, Calendar, User, ArrowRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

// Local debounce utility to avoid external dependency issues
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

const ConversationHistoryReport = () => {
    const { addToast } = useToast();

    // -- State: Customer List --
    const [customers, setCustomers] = useState([]);
    const [loadingCustomers, setLoadingCustomers] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    // -- State: History Data --
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // -- State: Filters --
    const [filters, setFilters] = useState({
        fromDate: '',
        toDate: '',
        mode: 'All',
        search: ''
    });

    // 1. Fetch Customers (Debounced Search)
    const fetchCustomers = useCallback(async (search = '') => {
        setLoadingCustomers(true);
        try {
            // Using existing getCustomers API
            const params = {
                limit: 20,
                page: 1,
                sortBy: 'customerName:asc'
            };
            if (search) params.search = search;

            const response = await getCustomers(params);
            setCustomers(response.results || []);
        } catch (error) {
            console.error(error);
            addToast('Failed to load customers', 'error');
        } finally {
            setLoadingCustomers(false);
        }
    }, [addToast]);

    // Initial Load & Debounced Search
    useEffect(() => {
        fetchCustomers(customerSearch);
    }, []); // Only mount

    const debouncedCustomerSearch = useCallback(
        debounce((val) => fetchCustomers(val), 500),
        [fetchCustomers]
    );

    const handleCustomerSearchChange = (e) => {
        const val = e.target.value;
        setCustomerSearch(val);
        debouncedCustomerSearch(val);
    };

    // 2. Fetch History when Customer or Filters change
    useEffect(() => {
        if (!selectedCustomer) {
            setHistory([]);
            return;
        }

        const fetchHistory = async () => {
            setLoadingHistory(true);
            try {
                // Manually construct params for our updated controller
                const params = {};
                if (filters.fromDate) params.fromDate = filters.fromDate;
                if (filters.toDate) params.toDate = filters.toDate;
                if (filters.mode && filters.mode !== 'All') params.mode = filters.mode;
                if (filters.search) params.search = filters.search;

                // getConversationHistory from customerApi usually just takes Id. 
                // We might need to update customerApi.js to accept params if not supported yet.
                // Assuming we updated customerApi.js or pass params as second arg (axios style).

                // Let's check how we updated customerApi.js earlier.
                // We updated getConversationHistory(customerId) to return response.data.data
                // It does NOT currently accept params. We need to fix that or use getCustomerConversations?
                // The task instruction was to add a new endpoint. 
                // Wait, getConversationHistory in customer.controller.js reads req.query. Use that.

                // Since I can't edit customerApi.js inside this file creation, I will assume 
                // I need to patch customerApi.js too. For now I'll try to pass it, 
                // if it fails I'll fix the service in next step.

                // Actually, I should use the `api` instance directly or update the service.
                // I'll update the service in the next step.

                // Temporary workaround/assumption: getConversationHistory accepts params or we patch it.
                // I'll use a direct invocation pattern if needed or just assume I update the service next.

                // Let's proceed assuming I will update `getConversationHistory(customerId, params)` next.
                const data = await getConversationHistory(selectedCustomer._id, params);
                setHistory(data || []);

            } catch (error) {
                console.error(error);
                addToast('Failed to load history', 'error');
            } finally {
                setLoadingHistory(false);
            }
        };

        fetchHistory();
    }, [selectedCustomer, filters, addToast]);


    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-50">
            {/* --- Left Panel: Sidebar --- */}
            <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-800 mb-2">Customers</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        <Input
                            placeholder="Search customer..."
                            value={customerSearch}
                            onChange={handleCustomerSearchChange}
                            className="pl-9"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loadingCustomers ? (
                        <div className="flex justify-center p-4"><Loader2 className="animate-spin text-blue-500" /></div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {customers.map(c => (
                                <div
                                    key={c._id}
                                    onClick={() => setSelectedCustomer(c)}
                                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${selectedCustomer?._id === c._id ? 'bg-blue-50 border-r-2 border-blue-500' : ''}`}
                                >
                                    <div className="font-medium text-gray-900">{c.company || c.customerName}</div>
                                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                        <User size={12} /> {c.customerName}
                                    </div>
                                </div>
                            ))}
                            {customers.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">No customers found</div>}
                        </div>
                    )}
                </div>
            </div>

            {/* --- Right Panel: Content --- */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header / Filters */}
                <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-xl font-bold text-gray-800">
                            {selectedCustomer ? `History: ${selectedCustomer.company || selectedCustomer.customerName}` : 'Conversation History'}
                        </h1>
                        {/* Selected Customer badge or clear button could go here */}
                    </div>

                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="w-40">
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">From</label>
                            <Input
                                type="date"
                                value={filters.fromDate}
                                onChange={e => setFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                            />
                        </div>
                        <div className="w-40">
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">To</label>
                            <Input
                                type="date"
                                value={filters.toDate}
                                onChange={e => setFilters(prev => ({ ...prev, toDate: e.target.value }))}
                            />
                        </div>
                        <div className="w-40">
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">Mode</label>
                            <Select
                                options={[
                                    { value: 'All', label: 'All Modes' },
                                    { value: 'call', label: 'Call' },
                                    { value: 'whatsapp', label: 'WhatsApp' },
                                ]}
                                value={filters.mode}
                                onChange={e => setFilters(prev => ({ ...prev, mode: e.target.value }))}
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">Search Content</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                <Input
                                    placeholder="Search in discussions..."
                                    value={filters.search}
                                    onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => setFilters({ fromDate: '', toDate: '', mode: 'All', search: '' })}
                            className="mb-[2px]"
                        >
                            Reset
                        </Button>
                    </div>
                </div>

                {/* History List */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {!selectedCustomer ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <ArrowRight size={48} className="mb-4 opacity-20" />
                            <p className="text-lg">Select a customer to view history</p>
                        </div>
                    ) : loadingHistory ? (
                        <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
                    ) : history.length === 0 ? (
                        <div className="text-center p-10 text-gray-500 bg-white rounded-lg shadow-sm border border-gray-100">
                            <p>No conversation history found for this filters.</p>
                        </div>
                    ) : (
                        <div className="space-y-4 max-w-4xl mx-auto">
                            {history.map((item) => (
                                <div key={item._id} className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${item.mode === 'whatsapp' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                                {item.mode === 'whatsapp' ? <MessageSquare size={18} /> : <Phone size={18} />}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-gray-900">
                                                    {format(new Date(item.conversationDate), 'dd MMMM yyyy')}
                                                </div>
                                                <div className="text-xs text-gray-500 capitalize flex items-center gap-1">
                                                    {item.mode}
                                                    {item.isFollowup && <span className="bg-orange-100 text-orange-700 px-1.5 rounded text-[10px] ml-2">From Follow-up</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="text-xs text-gray-400">{format(new Date(item.createdAt), 'hh:mm a')}</span>
                                    </div>

                                    <div className="pl-[52px]">
                                        <div className="text-gray-800 text-sm whitespace-pre-wrap mb-3 leading-relaxed">
                                            {item.discussionDetails}
                                        </div>

                                        {item.outcome && (
                                            <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 border border-gray-100">
                                                <span className="font-semibold text-gray-700 block mb-1">Outcome / Next Steps:</span>
                                                {item.outcome}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConversationHistoryReport;
