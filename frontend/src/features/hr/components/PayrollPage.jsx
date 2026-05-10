import React, { useState, useEffect } from 'react';
import { Calculator, Download, Save, Loader2, CheckCircle, Search, Calendar } from 'lucide-react';
import { apiClient as api } from '@/lib/apiClient';
import { useToast } from '@/components/ui/Toast';

const PayrollPage = () => {
    const { addToast } = useToast();
    const [month, setMonth] = useState(new Date().getMonth() + 1); // 1-12
    const [year, setYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [records, setRecords] = useState([]);
    const [isSaved, setIsSaved] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchPayroll = async (isRefresh = false) => {
        setLoading(true);
        try {
            // First check if saved records exist for this month
            if (!isRefresh) {
                const savedRes = await api.get('/payroll/saved', { params: { month, year } });
                if (savedRes.data?.data?.length > 0) {
                    setRecords(savedRes.data.data);
                    setIsSaved(true);
                    setLoading(false);
                    return;
                }
            }

            // If refresh forced or no saved data, generate preview from live attendance
            const t = new Date().getTime();
            const previewRes = await api.get('/payroll/preview', { params: { month, year, t } });
            setRecords(previewRes.data?.data || []);
            setIsSaved(false);
        } catch (error) {
            console.error(error);
            addToast('Failed to fetch payroll data', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Initial load for current month/year
    useEffect(() => {
        fetchPayroll();
    }, [month, year]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.post('/payroll/save', { month, year, records });
            addToast('Payroll Working saved successfully!', 'success');
            setIsSaved(true);
        } catch (error) {
            addToast('Failed to save payroll', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleCellChange = (empId, field, value) => {
        const numVal = parseFloat(value) || 0;
        setRecords(prev => prev.map(r => {
            if (r.employeeId === empId) {
                const updated = { ...r, [field]: numVal };
                // Recalculate Gross and Net
                updated.grossAmount = updated.basic + updated.hra + updated.conveyance + updated.specialAllowance + updated.incentives;
                updated.netPayable = updated.grossAmount - updated.deductions;
                return updated;
            }
            return r;
        }));
    };

    const filteredRecords = records.filter(r => 
        (r.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.employeeCode || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0 }}>Salary Working Sheet</h1>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Generate and verify monthly payroll based on daily attendance</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    
                    <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ padding: '0 12px', color: '#64748b', borderRight: '1px solid #e2e8f0' }}><Calendar size={16} /></div>
                        <select 
                            value={month} 
                            onChange={e => setMonth(parseInt(e.target.value))}
                            style={{ border: 'none', outline: 'none', padding: '10px', fontWeight: '600', color: '#1e293b', background: 'transparent' }}
                        >
                            {Array.from({ length: 12 }).map((_, i) => (
                                <option key={i} value={i + 1}>{new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}</option>
                            ))}
                        </select>
                        <select 
                            value={year} 
                            onChange={e => setYear(parseInt(e.target.value))}
                            style={{ border: 'none', borderLeft: '1px solid #e2e8f0', outline: 'none', padding: '10px', fontWeight: '600', color: '#1e293b', background: 'transparent' }}
                        >
                            {[...Array(5)].map((_, i) => {
                                const y = new Date().getFullYear() - 2 + i;
                                return <option key={y} value={y}>{y}</option>;
                            })}
                        </select>
                    </div>

                    <button 
                        onClick={() => fetchPayroll(true)}
                        style={{ height: '40px', padding: '0 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                    >
                        <Calculator size={16} /> Regenerate Calculation
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={saving || records.length === 0}
                        style={{ height: '40px', padding: '0 16px', background: isSaved ? '#059669' : '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: (saving || records.length===0) ? 'not-allowed' : 'pointer', opacity: (saving || records.length===0) ? 0.7 : 1 }}
                    >
                        {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : (isSaved ? <CheckCircle size={16} /> : <Save size={16} />)}
                        {saving ? 'Saving...' : (isSaved ? 'Saved' : 'Save Working')}
                    </button>
                </div>
            </div>

            {/* Content Body */}
            <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                
                {/* Table Toolbar */}
                <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', width: '300px' }}>
                        <Search size={16} color="#94a3b8" />
                        <input 
                            type="text" 
                            placeholder="Search employee..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px' }}
                        />
                    </div>

                    <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>
                        Total Employees: <span style={{ color: '#0f172a' }}>{filteredRecords.length}</span>
                    </div>
                </div>

                {/* Data Grid */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {loading ? (
                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: '#64748b', flexDirection: 'column', gap: '12px' }}>
                             <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
                             <span>Calculating Payroll...</span>
                         </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1200px' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 10 }}>
                                <tr>
                                    <th style={thStyle}>Employee</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Monthly Salary</th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>Total Days</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Day Rate</th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>Present</th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>Absent</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Prorated Gross</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Deductions</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Net Payable</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' }}>
                                            No employee records found for this period. Try regenerating or uploading attendance.
                                        </td>
                                    </tr>
                                ) : filteredRecords.map((r, i) => (
                                    <tr key={r.employeeId || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '13px' }}>{r.employeeName}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{r.employeeCode}</div>
                                            {r.isNew && <span style={{ fontSize: '9px', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>New Preview</span>}
                                            {r.remarks && <div style={{ fontSize: '10px', color: '#b91c1c', marginTop: '4px', fontStyle: 'italic' }}>{r.remarks}</div>}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right', color: '#475569', fontWeight: '600' }}>
                                            {formatCurrency(r.masterGross)}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center', color: '#64748b' }}>{r.totalDays || 0}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b', fontSize: '12px' }}>
                                            {formatCurrency(r.masterGross / (r.totalDays || 1))}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                            <span style={{ display: 'inline-block', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }} title="Present Working Days + Paid Leaves + Paid Holidays/Sundays">
                                                {r.daysWorked || 0}
                                            </span>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                                <span style={{ display: 'inline-block', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }} title="Explicit Absences + Unpaid Days">
                                                    {((r.totalDays || 0) - (r.daysWorked || 0) - (r.lateDeductionDays || 0) - (r.sandwichDeductionDays || 0)).toFixed(1)}
                                                </span>
                                                {(r.lateDeductionDays > 0) && (
                                                    <span style={{ display: 'inline-block', background: '#ffedd5', color: '#9a3412', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }} title="Late Penalties Deducted from Payable">
                                                        +{r.lateDeductionDays.toFixed(1)} Late Pen.
                                                    </span>
                                                )}
                                                {(r.sandwichDeductionDays > 0) && (
                                                    <span style={{ display: 'inline-block', background: '#fce7f3', color: '#9d174d', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }} title="Sandwich Penalty Deducted">
                                                        +{r.sandwichDeductionDays.toFixed(1)} Sand. Pen.
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600', color: '#1e293b' }}>
                                            {formatCurrency(r.grossAmount)}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right', padding: '8px' }}>
                                            <input 
                                                type="number" 
                                                value={r.deductions || 0}
                                                onChange={e => handleCellChange(r.employeeId, 'deductions', e.target.value)}
                                                style={{ width: '80px', textAlign: 'right', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '6px', outline: 'none', color: '#ef4444', fontWeight: '600' }}
                                            />
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '800', color: '#059669', fontSize: '14px' }}>
                                            {formatCurrency(r.netPayable)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

const thStyle = {
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
};

const tdStyle = {
    padding: '12px 16px',
    fontSize: '13px',
    color: '#334155'
};

export default PayrollPage;
