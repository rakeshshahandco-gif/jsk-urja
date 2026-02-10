import React, { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { importCustomers, downloadCustomerTemplate } from '@/services/customerApi';
import styles from './ImportCustomerModal.module.scss';

export const ImportCustomerModal = ({ isOpen, onClose, onSuccess }) => {
    const [file, setFile] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [importing, setImporting] = useState(false);
    const [results, setResults] = useState(null);

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const selectedFile = files[0];
            if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
                setFile(selectedFile);
                setResults(null);
            } else {
                alert('Please select an Excel file (.xlsx or .xls)');
            }
        }
    };

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            setResults(null);
        }
    };

    const handleDownloadTemplate = async () => {
        try {
            const blob = await downloadCustomerTemplate();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'Customer_Import_Template.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            alert(`Failed to download template: ${error.message}`);
        }
    };

    const handleImport = async () => {
        if (!file) {
            alert('Please select a file to import');
            return;
        }

        setImporting(true);
        setResults(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await importCustomers(formData);
            setResults(response);

            if (response.success > 0 && onSuccess) {
                onSuccess();
            }
        } catch (error) {
            alert(`Import failed: ${error.message}`);
        } finally {
            setImporting(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setResults(null);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Import Customers" size="lg">
            <div className={styles.modalContent}>
                {/* Download Template Section */}
                <div className={styles.templateSection}>
                    <div className={styles.templateInfo}>
                        <FileSpreadsheet size={20} />
                        <div>
                            <h4>Excel Template</h4>
                            <p>Download the template to see the required format</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                        <Download size={16} /> Download Template
                    </Button>
                </div>

                {/* File Upload Section */}
                <div
                    className={`${styles.dropzone} ${dragging ? styles.dragging : ''} ${file ? styles.hasFile : ''}`}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    {file ? (
                        <div className={styles.fileSelected}>
                            <FileSpreadsheet size={48} className={styles.fileIcon} />
                            <div className={styles.fileName}>{file.name}</div>
                            <div className={styles.fileSize}>{(file.size / 1024).toFixed(2)} KB</div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setFile(null)}
                                className={styles.removeButton}
                            >
                                Remove File
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Upload size={48} className={styles.uploadIcon} />
                            <h4>Drag & Drop Excel File</h4>
                            <p>or</p>
                            <label htmlFor="file-input" className={styles.browseButton}>
                                <span className={styles.browseButtonText}>
                                    Browse Files
                                </span>
                            </label>
                            <input
                                id="file-input"
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileSelect}
                                className={styles.fileInput}
                            />
                            <p className={styles.hint}>Supports .xlsx and .xls files (Max 5MB)</p>
                        </>
                    )}
                </div>

                {/* Results Section */}
                {results && (
                    <div className={styles.results}>
                        <div className={styles.resultsSummary}>
                            <div className={styles.resultItem}>
                                <CheckCircle size={20} className={styles.successIcon} />
                                <span><strong>{results.success}</strong> Imported</span>
                            </div>
                            <div className={styles.resultItem}>
                                <XCircle size={20} className={styles.errorIcon} />
                                <span><strong>{results.failed}</strong> Failed</span>
                            </div>
                            {results.duplicates > 0 && (
                                <div className={styles.resultItem}>
                                    <AlertCircle size={20} className={styles.warningIcon} />
                                    <span><strong>{results.duplicates}</strong> Duplicates</span>
                                </div>
                            )}
                        </div>

                        {/* Error Details */}
                        {results.errors && results.errors.length > 0 && (
                            <div className={styles.errorDetails}>
                                <h4>Error Details</h4>
                                <div className={styles.errorTable}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Row/Mobile</th>
                                                <th>Contact Name</th>
                                                <th>Errors</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {results.errors.slice(0, 10).map((error, index) => (
                                                <tr key={index}>
                                                    <td>{error.row || error.mobile || '-'}</td>
                                                    <td>{error.contactName || '-'}</td>
                                                    <td>
                                                        <ul>
                                                            {error.errors.map((err, idx) => (
                                                                <li key={idx}>{err}</li>
                                                            ))}
                                                        </ul>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {results.errors.length > 10 && (
                                        <p className={styles.moreErrors}>
                                            ... and {results.errors.length - 10} more errors
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                <div className={styles.actions}>
                    <Button variant="outline" onClick={handleClose} disabled={importing}>
                        {results ? 'Close' : 'Cancel'}
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={!file || importing}
                        isLoading={importing}
                    >
                        {importing ? (
                            <>
                                <Loader2 size={16} className={styles.spinner} />
                                Importing...
                            </>
                        ) : (
                            <>
                                <Upload size={16} />
                                Import Customers
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
