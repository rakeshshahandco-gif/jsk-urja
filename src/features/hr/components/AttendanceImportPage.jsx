import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, FilePlus, X, Loader, Trash2 } from 'lucide-react';

import toast from 'react-hot-toast';
import moment from 'moment';
import api from '../../../services/api'; // Corrected import path

const AttendanceImportPage = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [importErrors, setImportErrors] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(moment().format('MM'));
    const [selectedYear, setSelectedYear] = useState(moment().format('YYYY'));
    const [isDeleting, setIsDeleting] = useState(false);
    const fileInputRef = useRef(null);


    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    const validateAndSetFile = (file) => {
        setImportErrors([]); // Clear previous errors
        const validTypes = ['.csv', '.xlsx', '.xls'];
        const isValid = validTypes.some(ext => file.name.toLowerCase().endsWith(ext));
        
        if (isValid) {
            setSelectedFile(file);
        } else {
            toast.error('Invalid file type. Please upload a .csv or .xlsx file.');
        }
    };

    const handleBrowseClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleRemoveFile = (e) => {
        e.stopPropagation(); // prevent opening file dialog again
        setSelectedFile(null);
        setImportErrors([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleBulkDelete = async () => {
        const monthName = months.find(m => m.val === selectedMonth)?.label;
        const confirmMsg = `Are you sure you want to PERMANENTLY delete ALL attendance and salary data for ${monthName} ${selectedYear}?\n\nThis action cannot be undone.`;
        
        if (!window.confirm(confirmMsg)) return;

        setIsDeleting(true);
        try {
            const response = await api.delete('/hr/attendance/bulk', {
                data: { month: selectedMonth, year: selectedYear }
            });
            toast.success(response.data.message || 'Data cleared successfully');
        } catch (error) {
            console.error('Bulk delete error:', error);
            const msg = error.response?.data?.message || 'Failed to clear data';
            toast.error(msg);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleUpload = async () => {

        if (!selectedFile) return;
        
        setIsUploading(true);
        setImportErrors([]);
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('month', selectedMonth);
        formData.append('year', selectedYear);

        try {
            const response = await api.post('/hr/attendance/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            toast.success(`Success! Imported ${response.data.data.imported || 0} records.`);
            if (response.data.data.errors && response.data.data.errors.length > 0) {
                console.warn('Import Errors:', response.data.data.errors);
                setImportErrors(response.data.data.errors);
                toast.error(`There were ${response.data.data.errors.length} rows with errors.`);
            } else {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error(error.response?.data?.message || 'Failed to import attendance data. Please verify file format.');
        } finally {
            setIsUploading(false);
        }
    };

    const months = [
        { val: '01', label: 'January' }, { val: '02', label: 'February' }, { val: '03', label: 'March' },
        { val: '04', label: 'April' }, { val: '05', label: 'May' }, { val: '06', label: 'June' },
        { val: '07', label: 'July' }, { val: '08', label: 'August' }, { val: '09', label: 'September' },
        { val: '10', label: 'October' }, { val: '11', label: 'November' }, { val: '12', label: 'December' }
    ];

    const currentYear = parseInt(moment().format('YYYY'));
    const years = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0 }}>Import Attendance</h1>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Synchronize biometric or Excel logs with the HR system</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <select 
                        value={selectedMonth} 
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        style={{ height: '40px', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#475569', outline: 'none' }}
                    >
                        {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                    </select>
                    <select 
                        value={selectedYear} 
                        onChange={(e) => setSelectedYear(e.target.value)}
                        style={{ height: '40px', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#475569', outline: 'none' }}
                    >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    
                    <button
                        onClick={handleBulkDelete}
                        disabled={isDeleting || isUploading}
                        title="Delete all attendance for selected month"
                        style={{ 
                            height: '40px', 
                            padding: '0 15px', 
                            background: '#fff', 
                            color: '#e11d48', 
                            border: '1px solid #fecdd3', 
                            borderRadius: '10px', 
                            fontSize: '13px', 
                            fontWeight: '700', 
                            cursor: (isDeleting || isUploading) ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => { if(!isDeleting) e.currentTarget.style.background = '#fff1f2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                    >
                        {isDeleting ? <Loader size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        {isDeleting ? 'Clearing...' : 'Clear Month Data'}
                    </button>
                </div>

            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Drag and Drop Zone */}
                    <div 
                        onClick={!selectedFile ? handleBrowseClick : undefined}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        style={{ 
                            background: isDragging ? '#eff6ff' : '#fff', 
                            borderRadius: '20px', 
                            border: `2px dashed ${isDragging ? '#2563eb' : '#cbd5e1'}`, 
                            padding: '100px 40px', 
                            textAlign: 'center', 
                            cursor: selectedFile ? 'default' : 'pointer', 
                            transition: 'all 0.2s',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            style={{ display: 'none' }} 
                            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                        />

                        {!selectedFile ? (
                            <>
                                <div style={{ width: '64px', height: '64px', background: '#fff', borderRadius: '16px', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                    <Upload size={32} />
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>Click or Drag to Upload File</h3>
                                <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>Supports .xlsx, .csv, and standard biometric formats</p>
                                <button 
                                    type="button"
                                    style={{ height: '40px', padding: '0 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}
                                >
                                    Browse Files
                                </button>
                            </>
                        ) : (
                            <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ width: '64px', height: '64px', background: '#f0fdf4', borderRadius: '16px', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                    <FileText size={32} />
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', marginBottom: '8px', wordBreak: 'break-all' }}>{selectedFile.name}</h3>
                                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>{(selectedFile.size / 1024).toFixed(2)} KB</p>
                                
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button 
                                        onClick={handleRemoveFile}
                                        disabled={isUploading}
                                        style={{ height: '45px', padding: '0 20px', background: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        <X size={16} /> Remove
                                    </button>
                                    <button 
                                        onClick={handleUpload}
                                        disabled={isUploading}
                                        style={{ height: '45px', padding: '0 24px', background: '#059669', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        {isUploading ? <Loader size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={18} />}
                                        {isUploading ? 'Importing Data...' : 'Upload Data'}
                                    </button>
                                </div>
                                {isUploading && (
                                    <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px', marginTop: '24px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', background: '#059669', width: '60%', transition: 'width 2s linear', animation: 'progress 2s ease-in-out' }} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Import Errors Log */}
                    {importErrors.length > 0 && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '16px', padding: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', marginBottom: '16px' }}>
                                <AlertCircle size={20} />
                                <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0 }}>Import Failed for {importErrors.length} records</h3>
                            </div>
                            <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: '8px', padding: '16px', maxHeight: '200px', overflowY: 'auto' }}>
                                <ul style={{ margin: 0, paddingLeft: '20px', color: '#7f1d1d', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'monospace' }}>
                                    {importErrors.slice(0, 15).map((err, idx) => (
                                        <li key={idx}>{err}</li>
                                    ))}
                                    {importErrors.length > 15 && (
                                        <li style={{ color: '#ef4444', fontWeight: '700', listStyleType: 'none', marginLeft: '-20px', paddingTop: '8px' }}>
                                            ... and {importErrors.length - 15} more errors.
                                        </li>
                                    )}
                                </ul>
                            </div>
                            <p style={{ fontSize: '13px', color: '#b91c1c', marginTop: '12px', fontWeight: '600' }}>
                                Please fix exactly what the above errors describe in your Excel/CSV file and try uploading again.
                            </p>
                        </div>
                    )}
                </div>

                {/* Right Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={18} /> Templates
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <a 
                                href={`${api.defaults.baseURL}/hr/attendance/template`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ textDecoration: 'none', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#475569', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.2s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#059669'; e.currentTarget.style.background = '#f0fdf4'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
                            >
                                <FilePlus size={16} color="#059669" /> Download Attendance Template (.xlsx)
                            </a>
                        </div>
                    </div>

                    <div style={{ background: '#fefce8', padding: '20px', borderRadius: '16px', border: '1px solid #fef08a' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <AlertCircle size={20} color="#854d0e" />
                            <div>
                                <h5 style={{ fontSize: '13px', fontWeight: '800', color: '#854d0e', margin: '0 0 4px' }}>Import Instructions</h5>
                                <p style={{ fontSize: '12px', color: '#854d0e', margin: '0 0 12px', lineHeight: '1.5' }}>
                                    Your Excel/CSV file must have the following columns in exactly these positions:
                                </p>
                                <ul style={{ fontSize: '12px', color: '#a16207', margin: '0 0 12px', paddingLeft: '20px', lineHeight: '1.8' }}>
                                    <li><strong>Column 1:</strong> Employee Name (or Employee Code)</li>
                                    <li><strong>Column 2:</strong> Date (DD-MM-YYYY)</li>
                                    <li><strong>Column 3:</strong> In Time (HH:mm AM/PM)</li>
                                    <li><strong>Column 4:</strong> Out Time (HH:mm AM/PM)</li>
                                </ul>
                                <p style={{ fontSize: '11px', color: '#a16207', margin: 0, lineHeight: '1.5', background: '#fffbeb', padding: '8px', borderRadius: '8px' }}>
                                    <strong>Safety:</strong> Only records for the selected month/year will be imported. Any dates outside this range in the file will be automatically skipped.
                                </p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            {/* Inject minimal keyframes for progress bar animation */}
            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
                @keyframes progress { 0% { width: 0%; } 100% { width: 100%; } }
            `}</style>
        </div>
    );
};

export default AttendanceImportPage;
