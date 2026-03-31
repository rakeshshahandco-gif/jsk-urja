import React from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, FilePlus } from 'lucide-react';

const AttendanceImportPage = () => {
    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0 }}>Import Attendance</h1>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Synchronize biometric or Excel logs with the HR system</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px' }}>
                <div style={{ background: '#fff', borderRadius: '20px', border: '1px dashed #cbd5e1', padding: '100px 40px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = '#eff6ff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#fff'; }}
                >
                    <div style={{ width: '64px', height: '64px', background: '#fff', borderRadius: '16px', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <Upload size={32} />
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>Click to Upload Attendance File</h3>
                    <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>Supports .xlsx, .csv, and standard biometric export formats</p>
                    <button style={{ height: '40px', padding: '0 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                        Browse Files
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={18} /> Templates
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <button style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#475569', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FilePlus size={16} color="#059669" /> Excel Template.xlsx
                            </button>
                            <button style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#475569', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FilePlus size={16} color="#d97706" /> CSV Format Guide.pdf
                            </button>
                        </div>
                    </div>

                    <div style={{ background: '#fefce8', padding: '20px', borderRadius: '16px', border: '1px solid #fef08a' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <AlertCircle size={20} color="#854d0e" />
                            <div>
                                <h5 style={{ fontSize: '13px', fontWeight: '800', color: '#854d0e', margin: '0 0 4px' }}>Important Note</h5>
                                <p style={{ fontSize: '12px', color: '#a16207', margin: 0, lineHeight: '1.5' }}>
                                    Ensure that employee IDs in the file match the system employee codes to avoid mapping errors.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AttendanceImportPage;
