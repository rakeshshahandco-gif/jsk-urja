import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
    const navigate = useNavigate();
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

    const sel = { height: 28, fontSize: 12, padding: '0 22px 0 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '1em' };
    const inp = { height: 28, fontSize: 12, padding: '0 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff' };
    const btn = (primary) => ({ height: 28, fontSize: 11, padding: '0 10px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', border: primary ? 'none' : '1px solid #d1d5db', background: primary ? '#2563eb' : '#fff', color: primary ? '#fff' : '#374151' });

    return (
        <div className="p-3 h-[calc(100vh-64px)] flex flex-col bg-gray-50 gap-2">

            {/* ── Line 1: Title + Tabs ── */}
            <div className="flex items-center gap-3">
                <h1 className="text-base font-bold text-gray-800 flex items-center gap-1.5 whitespace-nowrap">
                    <Calendar className="w-4 h-4 text-blue-600" /> Follow-up Task Report
                </h1>
                <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
                    <button
                        onClick={() => setActiveTab('ALL')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activeTab === 'ALL' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                    >For All</button>
                    <button
                        onClick={() => setActiveTab('SINGLE')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activeTab === 'SINGLE' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                    >For Single</button>
                </div>
            </div>

            {/* ── TAB CONTENT: ALL ── */}
            {activeTab === 'ALL' && (
                <div className="flex-1 flex flex-col bg-white rounded-lg shadow border overflow-hidden">
                    {/* Line 2: Filters + Export */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50 flex-wrap">
                        <input type="date" value={filters.fromDate} onChange={e => setFilters({ ...filters, fromDate: e.target.value })} style={inp} placeholder="From" title="From Date" />
                        <input type="date" value={filters.toDate} onChange={e => setFilters({ ...filters, toDate: e.target.value })} style={inp} placeholder="To" title="To Date" />
                        <select value={filters.followUpType} onChange={e => setFilters({ ...filters, followUpType: e.target.value })} style={{ ...sel, minWidth: 100 }}>
                            <option value="ALL">All Types</option>
                            <option value="CALL">Call</option>
                            <option value="WHATSAPP">WhatsApp</option>
                        </select>
                        <button onClick={fetchAllData} style={btn(true)}>Apply</button>
                        <div className="ml-auto flex gap-1.5">
                            <button onClick={() => handleExport('excel')} style={btn(false)}>Excel</button>
                            <button onClick={() => handleExport('pdf')} style={btn(false)}>PDF</button>
                            <button onClick={() => handleExport('docx')} style={btn(false)}>Word</button>
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
                                    <tr
                                        key={idx}
                                        className="hover:bg-blue-50 cursor-pointer"
                                        onClick={() => row.customerId && navigate(`/followup/${row.customerId}`)}
                                        title="Click to open customer details"
                                    >
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

            {/* ── TAB CONTENT: SINGLE ── */}
            {activeTab === 'SINGLE' && (
                <div className="flex-1 flex flex-col bg-white rounded-lg shadow border overflow-hidden">
                    {/* Line 2: Search + buttons */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
                        <div className="relative">
                            <input
                                value={customerSearch}
                                onChange={e => onSearchChange(e.target.value)}
                                placeholder="Search customer (company / name)..."
                                style={{ ...inp, width: 280 }}
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
                        <button onClick={fetchSingleData} disabled={!selectedCustomer} style={{ ...btn(true), opacity: selectedCustomer ? 1 : 0.5 }}>View Report</button>
                        {singleData && (
                            <div className="ml-auto flex gap-1.5">
                                <button onClick={() => handleExport('excel')} style={btn(false)}>Excel</button>
                                <button onClick={() => handleExport('pdf')} style={btn(false)}>PDF</button>
                                <button onClick={() => handleExport('docx')} style={btn(false)}>Word</button>
                            </div>
                        )}
                    </div>

                    {/* REPORT VIEW */}
                    {singleData ? (
                        <div className="flex-1 overflow-auto border-t">
                            {/* Compact customer info bar */}
                            <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b text-sm">
                                <span className="font-bold text-blue-800">{singleData.customer.company || singleData.customer.customerName}</span>
                                {singleData.customer.contactPersons?.[0]?.name && (
                                    <span className="text-gray-500 text-xs">Contact: {singleData.customer.contactPersons[0].name} | {singleData.customer.contactPersons[0].mobile}</span>
                                )}
                            </div>
                            <table className="w-full border-collapse bg-white">
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
                        <div className="flex-1 flex items-center justify-center text-gray-400 border-t bg-gray-50/50">
                            {loading ? 'Loading report...' : 'Select a customer and click View Report'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FollowupTaskReport;
