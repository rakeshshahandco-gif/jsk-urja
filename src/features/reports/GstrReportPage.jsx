import React, { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { Download, FileSpreadsheet, Calendar } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';

export default function GstrReportPage() {
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [financialYear, setFinancialYear] = useState('');
    const [downloading, setDownloading] = useState(false);

    const handleDownload = async () => {
        if (!dateFrom && !dateTo && !financialYear) {
            toast.error("Please select a date range or financial year");
            return;
        }

        try {
            setDownloading(true);
            const params = new URLSearchParams();
            if (dateFrom) params.append('dateFrom', dateFrom);
            if (dateTo) params.append('dateTo', dateTo);
            if (financialYear) params.append('financialYear', financialYear);

            const response = await api.get(`/v1/reports/gstr1-export?${params.toString()}`, {
                responseType: 'blob'
            });

            // Handle file download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `GSTR1_Returns_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            toast.success("GSTR-1 Report downloaded securely!");

        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Failed to generate GSTR-1 Excel');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FileSpreadsheet className="text-blue-600" size={28} />
                    GSTR-1 Compliance Portal
                </h1>
                <p style={{ color: '#64748b', marginTop: '8px' }}>
                    Download your fully structured, portal-ready GSTR-1 Excel returns. Includes auto-classified B2CL, Table 12 HSN snapshots, and Table 13 document summarizations.
                </p>
            </div>

            <Card style={{ padding: '32px', background: 'linear-gradient(to right, #ffffff, #f8fafc)', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '24px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                    Select Return Period
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>FINANCIAL YEAR</label>
                        <select 
                            value={financialYear} 
                            onChange={(e) => setFinancialYear(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                        >
                            <option value="">Select FY</option>
                            <option value="2024-2025">2024-2025</option>
                            <option value="2025-2026">2025-2026</option>
                            <option value="2026-2027">2026-2027</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>FROM DATE</label>
                        <input 
                            type="date" 
                            value={dateFrom} 
                            onChange={(e) => setDateFrom(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>TO DATE</label>
                        <input 
                            type="date" 
                            value={dateTo} 
                            onChange={(e) => setDateTo(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                        />
                    </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '16px' }}>💡</span> Engine Intelligence Status
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#1e3a8a', lineHeight: '1.6' }}>
                        <li><strong>Table 12 (HSN):</strong> Uses deeply frozen UQC and CESS data extracted exactly at point-of-sale.</li>
                        <li><strong>B2CL Rules:</strong> Evaluates Interstate Unregistered invoices dynamically (August 2024 Amendment > ₹1 Lakh).</li>
                        <li>Format matches the GST portal offline tool mathematically.</li>
                    </ul>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <Button 
                        onClick={handleDownload} 
                        disabled={downloading}
                        style={{ 
                            background: downloading ? '#e2e8f0' : 'linear-gradient(135deg, #2563eb, #4f46e5)', 
                            color: downloading ? '#94a3b8' : '#fff',
                            padding: '12px 24px', 
                            fontSize: '15px', 
                            fontWeight: 600, 
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            border: 'none',
                            cursor: downloading ? 'wait' : 'pointer'
                        }}
                    >
                        <Download size={20} />
                        {downloading ? 'Compiling Engine Export...' : 'Download GSTR-1 Excel Utility'}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
