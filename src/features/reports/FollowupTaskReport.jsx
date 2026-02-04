import React, { useState, useEffect } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Search, Download, Calendar, ArrowRight, User } from 'lucide-react';
import { format } from 'date-fns';
import { apiClient as api } from '@/lib/apiClient';
import { getCustomers } from '@/services/customerApi';

// Styled Components / Classes
const tabClass = (active) => `px-6 py-3 font-bold text-sm transition-colors border-b-2 ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`;
const tableHeaderClass = "px-4 py-3 bg-gray-50 border border-gray-200 text-left text-xs font-bold text-gray-700 uppercase tracking-wider";
const tableCellClass = "px-4 py-3 border border-gray-200 text-sm align-top text-gray-800 whitespace-pre-wrap";

const FollowupTaskReport = () => {
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState('ALL'); // ALL | SINGLE

    // ALL Filter State
    const [filters, setFilters] = useState({
        followUpType: 'ALL',
        fromDate: '',
        toDate: ''
    });

    // SINGLE State
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [suggestions, setSuggestions] = useState([]);

    // Data State
    const [data, setData] = useState([]); // For ALL tab
    const [singleData, setSingleData] = useState(null); // { customer, rows } For SINGLE tab
    const [loading, setLoading] = useState(false);

    // --- Actions ---

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/reports/followup-task-report', { params: filters });
            setData(res.data.data || []);
        } catch (error) {
            console.error(error);
            addToast('Failed to load report', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchSingleData = async () => {
        if (!selectedCustomer) {
            addToast('Please select a customer', 'error');
            return;
        }
        setLoading(true);
        try {
            const res = await api.get('/reports/followup-task-report', {
                params: {
                    mode: 'single',
                    customerId: selectedCustomer._id || selectedCustomer.id
                }
            });
            if (res.data.data) {
                setSingleData({
                    customer: res.data.data.customer,
                    rows: res.data.data.followups
                });
            }
        } catch (error) {
            console.error(error);
            addToast('Failed to load customer report', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Load initial data for ALL
    useEffect(() => {
        if (activeTab === 'ALL') fetchAllData();
    }, [activeTab]);

    // Handle Customer Search
    const onSearchChange = (val) => {
        setCustomerSearch(val);
        if (val.length > 1) {
            getCustomers({ search: val, limit: 5 }).then(res => setSuggestions(res.results || []));
        } else {
            setSuggestions([]);
        }
    };

    const handleExport = async (format) => {
        try {
            const url = activeTab === 'ALL'
                ? `/reports/followup-task-report/export`
                : `/reports/followup-task-report/${selectedCustomer?._id || selectedCustomer?.id}/export`;

            const params = activeTab === 'ALL' ? { ...filters, format } : { format };

            if (activeTab === 'SINGLE' && !selectedCustomer) {
                addToast('Please select a customer first', 'error');
                return;
            }

            const res = await api.get(url, { params, responseType: 'blob' });

            // Download
            const blobUrl = window.URL.createObjectURL(res.data);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', `followup_task_report_${activeTab}.${format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'doc'}`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

        } catch (error) {
            console.error(error);
            addToast('Export failed', 'error');
        }
    };

    return (
        <div className="p-6 h-[calc(100vh-64px)] flex flex-col bg-gray-50">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" /> Follow-up Task Report
            </h1>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-6 bg-white rounded-t-lg px-2">
                <button onClick={() => setActiveTab('ALL')} className={tabClass(activeTab === 'ALL')}>FOR ALL</button>
                <button onClick={() => setActiveTab('SINGLE')} className={tabClass(activeTab === 'SINGLE')}>FOR SINGLE</button>
            </div>

            {/* TAB CONTENT: ALL */}
            {activeTab === 'ALL' && (
                <div className="flex-1 flex flex-col bg-white rounded-b-lg shadow p-4 border overflow-hidden">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-4 mb-4 items-end bg-gray-50 p-4 rounded border">
                        <div className="w-40">
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">From Date</label>
                            <Input type="date" value={filters.fromDate} onChange={e => setFilters({ ...filters, fromDate: e.target.value })} />
                        </div>
                        <div className="w-40">
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">To Date</label>
                            <Input type="date" value={filters.toDate} onChange={e => setFilters({ ...filters, toDate: e.target.value })} />
                        </div>
                        <div className="w-40">
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">Type</label>
                            <Select
                                value={filters.followUpType}
                                onChange={e => setFilters({ ...filters, followUpType: e.target.value })}
                                options={[
                                    { label: 'All Types', value: 'ALL' },
                                    { label: 'Call', value: 'CALL' },
                                    { label: 'WhatsApp', value: 'WHATSAPP' }
                                ]}
                            />
                        </div>
                        <Button onClick={fetchAllData} className="mb-[2px]">Apply Filters</Button>

                        <div className="ml-auto flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>Excel</Button>
                            <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>PDF</Button>
                            <Button variant="outline" size="sm" onClick={() => handleExport('docx')}>Word</Button>
                        </div>
                    </div>

                    {/* DATA TABLE */}
                    <div className="flex-1 overflow-auto border rounded">
                        <table className="w-full border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th className={tableHeaderClass}>Company</th>
                                    <th className={tableHeaderClass}>Date of Conversation</th>
                                    <th className={tableHeaderClass}>Discussion Details</th>
                                    <th className={tableHeaderClass}>Outcome</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && <tr><td colSpan="4" className="p-8 text-center text-gray-500">Loading...</td></tr>}
                                {!loading && data.length === 0 && <tr><td colSpan="4" className="p-8 text-center text-gray-500">No records found.</td></tr>}
                                {data.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className={tableCellClass + " font-medium"}>{row.companyName || row.customerName}</td>
                                        <td className={tableCellClass}>
                                            {format(new Date(row.conversationDate), 'dd-MM-yyyy')}
                                            {row.mode && (
                                                <div className={`mt-1 text-xs inline-block px-1.5 py-0.5 rounded border ${row.mode === 'whatsapp' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                                                    {row.mode}
                                                </div>
                                            )}
                                        </td>
                                        <td className={tableCellClass}>{row.discussionDetails}</td>
                                        <td className={tableCellClass}>{row.outcomeRemarks || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: SINGLE */}
            {activeTab === 'SINGLE' && (
                <div className="flex-1 flex flex-col bg-white rounded-b-lg shadow p-4 border overflow-hidden">
                    {/* Search Section */}
                    <div className="flex gap-4 mb-6 items-end">
                        <div className="relative w-96">
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">Search Customer (Company / Name)</label>
                            <Input
                                value={customerSearch}
                                onChange={e => onSearchChange(e.target.value)}
                                placeholder="Type to search..."
                            />
                            {suggestions.length > 0 && (
                                <div className="absolute top-full left-0 w-full bg-white border shadow-lg rounded mt-1 z-50 max-h-60 overflow-y-auto">
                                    {suggestions.map(c => (
                                        <div
                                            key={c._id || c.id}
                                            className="p-2 hover:bg-gray-100 cursor-pointer border-b"
                                            onClick={() => {
                                                setSelectedCustomer(c);
                                                setCustomerSearch(c.company || c.customerName);
                                                setSuggestions([]);
                                            }}
                                        >
                                            <div className="font-bold text-sm">{c.company}</div>
                                            <div className="text-xs text-gray-500">{c.customerName} - {c.mobile}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <Button
                            onClick={fetchSingleData}
                            disabled={!selectedCustomer}
                            className="mb-[2px]"
                        >
                            View Report
                        </Button>

                        {singleData && (
                            <div className="ml-auto flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>Excel</Button>
                                <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>PDF</Button>
                                <Button variant="outline" size="sm" onClick={() => handleExport('docx')}>Word</Button>
                            </div>
                        )}
                    </div>

                    {/* REPORT VIEW */}
                    {singleData ? (
                        <div className="flex-1 overflow-auto border rounded p-4 bg-gray-50">
                            <div className="bg-white border p-6 mb-4 shadow-sm">
                                <h2 className="text-xl font-bold text-gray-800">Company NAME: <span className="text-blue-700">{singleData.customer.company || singleData.customer.customerName}</span></h2>
                                <div className="text-sm text-gray-500 mt-2">
                                    Contact: {singleData.customer.contactPersons?.[0]?.name} | {singleData.customer.contactPersons?.[0]?.mobile}
                                </div>
                            </div>

                            <table className="w-full border-collapse bg-white shadow-sm">
                                <thead>
                                    <tr>
                                        <th className={tableHeaderClass}>Date of Conversation</th>
                                        <th className={tableHeaderClass}>Discussion Details</th>
                                        <th className={tableHeaderClass}>Outcome</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {singleData.rows.length === 0 && <tr><td colSpan="3" className="p-8 text-center text-gray-500">No conversation history found.</td></tr>}
                                    {singleData.rows.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className={tableCellClass}>
                                                {format(new Date(row.conversationDate), 'dd-MM-yyyy')}
                                                {row.mode && (
                                                    <div className={`mt-1 text-xs px-1 py-0.5 rounded border inline-block ml-2 ${row.mode === 'whatsapp' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                                                        {row.mode}
                                                    </div>
                                                )}
                                            </td>
                                            <td className={tableCellClass}>{row.discussionDetails}</td>
                                            <td className={tableCellClass}>{row.outcomeRemarks || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 border rounded bg-gray-50/50">
                            {loading ? 'Loading report...' : 'Select a customer and click View Report'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FollowupTaskReport;
