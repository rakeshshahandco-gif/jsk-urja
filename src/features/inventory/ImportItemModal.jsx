import React, { useState, useRef } from 'react';
import { Upload, Download, X, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { importItems, downloadItemTemplate } from '@/services/itemApi';

const ImportItemModal = ({ onClose, onSuccess }) => {
    const [file, setFile] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [downloadingTemplate, setDownloadingTemplate] = useState(false);
    const fileInputRef = useRef(null);

    const handleFile = (f) => {
        if (!f) return;
        const name = f.name.toLowerCase();
        if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
            alert('Only .xlsx or .xls files are allowed.');
            return;
        }
        setFile(f);
        setResult(null);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        handleFile(f);
    };

    const handleDownloadTemplate = async () => {
        setDownloadingTemplate(true);
        try {
            await downloadItemTemplate();
        } catch {
            alert('Failed to download template.');
        } finally {
            setDownloadingTemplate(false);
        }
    };

    const handleImport = async () => {
        if (!file) return;
        setLoading(true);
        try {
            const res = await importItems(file);
            setResult(res);
            if (res.success > 0) onSuccess?.();
        } catch (err) {
            alert(err?.response?.data?.message || 'Import failed.');
        } finally {
            setLoading(false);
        }
    };

    // Inline styles to keep self-contained, no scss needed
    const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
    const modal = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' };
    const header = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
    const body = { padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 };

    return (
        <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div style={modal}>
                {/* Header */}
                <div style={header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Upload size={18} style={{ color: '#2563eb' }} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Import Items from Excel</span>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={body}>
                    {/* Template section */}
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0369a1' }}>Step 1: Download Template</div>
                            <div style={{ fontSize: 11, color: '#0284c7', marginTop: 2 }}>Fill in your item data using the provided Excel template.</div>
                        </div>
                        <button
                            onClick={handleDownloadTemplate}
                            disabled={downloadingTemplate}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                            <Download size={13} />
                            {downloadingTemplate ? 'Downloading…' : 'Download Template'}
                        </button>
                    </div>

                    {/* Upload section */}
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Step 2: Upload Your File</div>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${dragging ? '#2563eb' : file ? '#16a34a' : '#d1d5db'}`,
                                borderRadius: 8, padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                                background: dragging ? '#eff6ff' : file ? '#f0fdf4' : '#fafafa',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
                            <Upload size={28} style={{ color: dragging ? '#2563eb' : file ? '#16a34a' : '#9ca3af', marginBottom: 8 }} />
                            {file ? (
                                <>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>{file.name}</div>
                                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Click to change file</div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: 13, color: '#374151' }}>Drag & drop your Excel file here</div>
                                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>or click to browse (.xlsx, .xls)</div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Results */}
                    {result && (
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', gap: 0 }}>
                                <div style={{ flex: 1, padding: '12px 16px', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 8, borderRight: '1px solid #e5e7eb' }}>
                                    <CheckCircle size={16} style={{ color: '#16a34a' }} />
                                    <div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{result.success}</div>
                                        <div style={{ fontSize: 11, color: '#15803d' }}>Imported</div>
                                    </div>
                                </div>
                                <div style={{ flex: 1, padding: '12px 16px', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: 8, borderRight: '1px solid #e5e7eb' }}>
                                    <XCircle size={16} style={{ color: '#dc2626' }} />
                                    <div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>{result.failed}</div>
                                        <div style={{ fontSize: 11, color: '#b91c1c' }}>Failed</div>
                                    </div>
                                </div>
                                <div style={{ flex: 1, padding: '12px 16px', background: '#fff7ed', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <AlertCircle size={16} style={{ color: '#ea580c' }} />
                                    <div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#ea580c' }}>{result.duplicates}</div>
                                        <div style={{ fontSize: 11, color: '#c2410c' }}>Duplicates</div>
                                    </div>
                                </div>
                            </div>

                            {result.errors?.length > 0 && (
                                <div style={{ padding: '12px 16px' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Errors ({result.errors.length}):</div>
                                    <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {result.errors.slice(0, 15).map((e, i) => (
                                            <div key={i} style={{ fontSize: 11, padding: '4px 8px', background: '#fef2f2', borderRadius: 4, color: '#991b1b', display: 'flex', gap: 6 }}>
                                                <span style={{ fontWeight: 700 }}>Row {e.row}:</span>
                                                <span>{e.itemCode && `[${e.itemCode}] `}{e.errors?.join(', ')}</span>
                                            </div>
                                        ))}
                                        {result.errors.length > 15 && (
                                            <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center' }}>… and {result.errors.length - 15} more errors</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                        <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontWeight: 600, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                            {result?.success > 0 ? 'Close' : 'Cancel'}
                        </button>
                        {!result && (
                            <button
                                onClick={handleImport}
                                disabled={!file || loading}
                                style={{ padding: '8px 20px', background: !file || loading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: !file || loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                {loading ? (
                                    <>
                                        <div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                        Importing…
                                    </>
                                ) : (
                                    <>
                                        <Upload size={13} />
                                        Import Items
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImportItemModal;
