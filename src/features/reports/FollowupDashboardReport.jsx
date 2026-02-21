import React, { useState, useEffect } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Search, Filter, Phone, MessageSquare, Calendar, Download, AlertCircle, Loader2, User, Building, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { apiClient as api } from '@/lib/apiClient';
import { getCustomers } from '@/services/customerApi';
import { closeReminder } from '@/services/reminderApi';

// Internal Service wrappers
const getFollowupDashboardList = async (params) => {
    const { data } = await api.get('/reports/followup-dashboard', { params });
    return data;
};

const getFollowupDashboardDetail = async (customerId) => {
    const { data } = await api.get(`/reports/followup-dashboard/${customerId}`);
    return data;
};

const exportFollowupDashboardList = async (format, filters) => {
    const response = await api.get('/reports/followup-dashboard/export', {
        params: { ...filters, format },
        responseType: 'blob'
    });
    return response.data;
};

const exportFollowupDashboardDetail = async (format, customerId) => {
    const response = await api.get(`/reports/followup-dashboard/${customerId}/export`, {
        params: { format },
        responseType: 'blob'
    });
    return response.data;
};


const FollowupDashboardReport = () => {
    const { addToast } = useToast();

    // Left Panel State
    const [tasks, setTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [filters, setFilters] = useState({
        q: '',
        type: '',
        priority: '',
        due: 'ALL'
    });

    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Right Panel State
    const [customerData, setCustomerData] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [historySearch, setHistorySearch] = useState('');

    // Fetch List
    const fetchTasks = async () => {
        setLoadingTasks(true);
        try {
            const result = await getFollowupDashboardList(filters);
            setTasks(result.data || []);
        } catch (error) {
            console.error(error);
            addToast('Failed to load tasks', 'error');
        } finally {
            setLoadingTasks(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, [filters.due, filters.type, filters.priority]);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchTasks();
    };

    // Fetch Detail
    useEffect(() => {
        if (!selectedCustomerId) {
            setCustomerData(null);
            return;
        }
        const fetchDetail = async () => {
            setLoadingDetail(true);
            try {
                const data = await getFollowupDashboardDetail(selectedCustomerId);
                // data = { customer, openFollowups, conversations }
                setCustomerData(data);
            } catch (error) {
                console.error(error);
                addToast('Failed to load customer history', 'error');
            } finally {
                setLoadingDetail(false);
            }
        };
        fetchDetail();
    }, [selectedCustomerId]);


    // Exports
    const handleExport = async (format) => {
        try {
            let blob;
            let filename;
            if (selectedCustomerId) {
                blob = await exportFollowupDashboardDetail(format, selectedCustomerId);
                filename = `customer_report_${selectedCustomerId}.${format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'doc'}`;
            } else {
                blob = await exportFollowupDashboardList(format, filters);
                filename = `followup_list.${format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'doc'}`;
            }

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (error) {
            console.error(error);
            addToast('Export failed', 'error');
        }
    };

    const handleCloseTask = async (id) => {
        if (!window.confirm('Are you sure you want to close this task?')) return;
        try {
            await closeReminder(id);
            addToast('Task closed successfully', 'success');
            // Refresh Both
            fetchTasks();
            if (selectedCustomerId) {
                const data = await getFollowupDashboardDetail(selectedCustomerId);
                setCustomerData(data);
            }
        } catch (error) {
            console.error(error);
            addToast('Failed to close task', 'error');
        }
    };

    // Filtered History
    const filteredHistory = customerData?.conversations?.filter(c =>
        (c.discussionDetails || '').toLowerCase().includes(historySearch.toLowerCase()) ||
        (c.outcome || '').toLowerCase().includes(historySearch.toLowerCase())
    ) || [];

    return (
        <div className="h-[calc(100vh-100px)] flex gap-4 p-4">
            {/* LEFT PANEL: Filters & List */}
            <div className="w-1/3 flex flex-col gap-4 bg-white rounded-lg shadow border p-4">
                <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                    <Calendar className="w-5 h-5 text-blue-600" /> Follow-up Tasks
                </h2>

                <div className="grid grid-cols-2 gap-2 mb-2">
                    <Select
                        value={filters.due}
                        onChange={(e) => setFilters({ ...filters, due: e.target.value })}
                        options={[
                            { label: 'All Open', value: 'ALL' },
                            { label: 'Today', value: 'TODAY' },
                            { label: 'Overdue', value: 'OVERDUE' },
                            { label: 'Upcoming', value: 'UPCOMING' }
                        ]}
                        className="w-full"
                    />
                    <Select
                        value={filters.priority}
                        onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                        options={[
                            { label: 'All Priorities', value: '' },
                            { label: 'High', value: 'High' },
                            { label: 'Medium', value: 'Medium' },
                            { label: 'Low', value: 'Low' }
                        ]}
                        className="w-full"
                    />
                </div>
                <div className="relative mb-2">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <Input
                            placeholder="Search customer..."
                            value={filters.q}
                            onChange={(e) => {
                                const val = e.target.value;
                                setFilters({ ...filters, q: val });
                                if (val.length > 1) {
                                    getCustomers({ search: val, limit: 10 }).then(res => {
                                        setSuggestions(res.results || []);
                                        setShowSuggestions(true);
                                    }).catch(err => console.error(err));
                                } else {
                                    setSuggestions([]);
                                    setShowSuggestions(false);
                                }
                            }}
                            onFocus={() => { if (filters.q.length > 1) setShowSuggestions(true); }}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            className="flex-1"
                            autoComplete="off"
                        />
                        <Button type="submit" variant="outline" size="icon"><Search className="w-4 h-4" /></Button>
                    </form>
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-12 z-50 bg-white border rounded shadow-lg mt-1 max-h-60 overflow-y-auto">
                            {suggestions.map(customer => (
                                <div
                                    key={customer.id}
                                    className="p-2 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-0"
                                    onClick={() => {
                                        setFilters({ ...filters, q: customer.customerName || customer.company });
                                        setSelectedCustomerId(customer.id);
                                        setSuggestions([]);
                                        setShowSuggestions(false);
                                    }}
                                >
                                    <div className="font-semibold">{customer.customerName}</div>
                                    <div className="text-xs text-gray-500">{customer.company}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {loadingTasks ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-gray-400" /></div>
                    ) : tasks.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">No open tasks found.</div>
                    ) : (
                        tasks.map(task => (
                            <div
                                key={task._id}
                                className={`p-3 cursor-pointer transition-all border rounded-lg shadow-sm mb-2 group ${selectedCustomerId === task.customerId ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-white hover:border-blue-400'}`}
                                onClick={() => setSelectedCustomerId(task.customerId)}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="font-bold text-gray-800 text-sm truncate pr-2" title={task.customerName}>{task.customerName}</h3>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${task.priority === 'High' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                        {task.priority || 'Normal'}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-600 mb-2 truncate flex items-center gap-1">
                                    <Building size={10} className="text-gray-400" />
                                    {task.companyName}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-500 border-t pt-2 mt-2">
                                    <div className="flex items-center gap-1">
                                        {task.followUpType === 'WHATSAPP' ? <MessageSquare size={12} className="text-green-600" /> : <Phone size={12} className="text-blue-600" />}
                                        <span className="font-medium">{task.followUpType || 'Call'}</span>
                                    </div>
                                    <div className="flex items-center gap-1 ml-auto">
                                        <Calendar size={12} className={new Date(task.reminderDate) < new Date().setHours(0, 0, 0, 0) ? "text-red-500" : "text-gray-400"} />
                                        <span className={new Date(task.reminderDate) < new Date().setHours(0, 0, 0, 0) ? "text-red-600 font-bold" : ""}>
                                            {format(new Date(task.reminderDate), 'dd MMM yyyy')}
                                        </span>
                                    </div>
                                </div>
                                {(task.creator?.name || task.createdBy?.name) && (
                                    <div className="text-[10px] text-gray-400 mt-1 flex items-center justify-end gap-1 italic">
                                        <span>By: {task.creator?.name || task.createdBy?.name}</span>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* RIGHT PANEL: Details & History */}
            <div className="w-2/3 flex flex-col bg-gray-50 rounded-lg shadow border overflow-hidden">
                {!selectedCustomerId ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
                        <Building className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-lg font-medium text-gray-500">Select a customer to view dashboard</p>
                        <p className="text-sm text-gray-400 mb-6">View open tasks and complete conversation history</p>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => handleExport('excel')}><Download className="w-4 h-4 mr-2" /> Export List (Excel)</Button>
                            <Button variant="outline" onClick={() => handleExport('pdf')}><Download className="w-4 h-4 mr-2" /> PDF</Button>
                        </div>
                    </div>
                ) : loadingDetail ? (
                    <div className="flex-1 flex justify-center items-center"><Loader2 className="animate-spin w-8 h-8 text-blue-500" /></div>
                ) : !customerData ? (
                    <div className="flex-1 flex justify-center items-center">Failed to load data</div>
                ) : (
                    <div className="flex flex-col h-full">
                        {/* 1. Header Card */}
                        <div className="bg-white p-5 border-b shadow-sm flex justify-between items-start">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                    {customerData.customer.company || customerData.customer.customerName}
                                </h1>
                                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                                    <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                                        <User size={14} className="text-gray-500" />
                                        <span className="font-semibold">{customerData.customer.customerName}</span>
                                    </div>
                                    {(customerData.customer.contactPersons?.[0]?.mobile) && (
                                        <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                                            <Phone size={14} className="text-gray-500" />
                                            <span>{customerData.customer.contactPersons[0].mobile}</span>
                                        </div>
                                    )}
                                    {(customerData.customer.email) && (
                                        <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                                            <span className="text-gray-500">@</span>
                                            <span>{customerData.customer.email}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => handleExport('excel')} title="Export Excel"><Download className="w-4 h-4" /> XL</Button>
                                <Button size="sm" variant="outline" onClick={() => handleExport('pdf')} title="Export PDF"><Download className="w-4 h-4" /> PDF</Button>
                                <Button size="sm" variant="outline" onClick={() => handleExport('docx')} title="Export Word"><Download className="w-4 h-4" /> Word</Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">

                            {/* 2. Open Tasks Table */}
                            {customerData.openFollowups?.length > 0 && (
                                <div className="mb-6 bg-white rounded-lg border shadow-sm overflow-hidden">
                                    <div className="bg-yellow-50 px-4 py-2 border-b border-yellow-100 flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                                        <h3 className="font-bold text-yellow-800 text-sm">Open Follow-up Tasks</h3>
                                    </div>
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                                            <tr>
                                                <th className="px-4 py-2 w-32 border-r">Due Date</th>
                                                <th className="px-4 py-2 w-24 border-r">Type</th>
                                                <th className="px-4 py-2 w-24 border-r">By</th>
                                                <th className="px-4 py-2 w-24 border-r">Priority</th>
                                                <th className="px-4 py-2">What to Talk (Note)</th>
                                                <th className="px-4 py-2 w-20">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {customerData.openFollowups.map(task => (
                                                <tr key={task._id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-2 border-r whitespace-nowrap font-medium text-gray-700">
                                                        {format(new Date(task.reminderDate), 'dd MMM yyyy')}
                                                        {task.reminderTime && <div className="text-xs text-gray-500 font-normal">{task.reminderTime}</div>}
                                                    </td>
                                                    <td className="px-4 py-2 border-r">
                                                        <span className="inline-flex items-center gap-1">
                                                            {task.followUpType === 'WHATSAPP' ? <MessageSquare size={12} className="text-green-600" /> : <Phone size={12} className="text-blue-600" />}
                                                            {task.followUpType}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 border-r">
                                                        <span className="text-xs text-gray-600 whitespace-nowrap">
                                                            {task.createdBy?.name || task.creator?.name || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 border-r">
                                                        <span className={`px-2 py-0.5 rounded text-xs ${task.priority === 'High' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}>
                                                            {task.priority}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 text-gray-700">{task.taskNote}</td>
                                                    <td className="px-4 py-2 text-center">
                                                        <button
                                                            onClick={() => handleCloseTask(task._id)}
                                                            className="p-1.5 hover:bg-green-100 text-green-600 rounded-full transition-colors"
                                                            title="Close Task"
                                                        >
                                                            <CheckCircle className="w-5 h-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* 3. History Table */}
                            <div className="bg-white rounded-lg border shadow-sm overflow-hidden flex flex-col">
                                <div className="px-4 py-3 border-b flex justify-between items-center bg-gray-50">
                                    <h3 className="font-bold text-gray-700">Conversation History</h3>
                                    <div className="relative w-64">
                                        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Search history..."
                                            className="w-full pl-9 pr-3 py-1.5 text-sm border rounded hover:border-blue-400 focus:outline-none focus:border-blue-500 transition-colors"
                                            value={historySearch}
                                            onChange={(e) => setHistorySearch(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left border-collapse">
                                        <thead className="bg-gray-100 text-gray-700 font-semibold border-b">
                                            <tr>
                                                <th className="px-4 py-3 border-r w-40">Date</th>
                                                <th className="px-4 py-3 border-r">Discussion Details</th>
                                                <th className="px-4 py-3 w-1/4">Outcome / Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {filteredHistory.length > 0 ? filteredHistory.map(c => (
                                                <tr key={c._id} className="hover:bg-blue-50/30 transition-colors group">
                                                    <td className="px-4 py-3 border-r align-top bg-gray-50/50">
                                                        <div className="font-bold text-gray-800">{format(new Date(c.conversationDate), 'dd-MM-yyyy')}</div>
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wide font-medium ${c.mode === 'whatsapp' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                                {c.mode}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 border-r align-top text-gray-800 whitespace-pre-wrap leading-relaxed">
                                                        {c.discussionDetails}
                                                    </td>
                                                    <td className="px-4 py-3 align-top text-gray-600 whitespace-pre-wrap">
                                                        {c.outcome || '-'}
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan="3" className="px-4 py-8 text-center text-gray-500 italic">
                                                        No conversation history found.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="bg-gray-50 border-t px-4 py-2 text-xs text-gray-500 flex justify-between">
                                    <span>Showing {filteredHistory.length} records</span>
                                    <span>Total: {customerData.conversations?.length || 0}</span>
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FollowupDashboardReport;
