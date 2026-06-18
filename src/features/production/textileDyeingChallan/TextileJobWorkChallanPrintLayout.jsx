import React from 'react';
import TextileJobWorkChallanQrBlock from '@/features/production/textileDyeingChallan/TextileJobWorkChallanQrBlock';

const COLOUR_LABELS = {
    FIXED_COLOUR: 'Fixed Colour',
    DYER_CHOICE: 'Dyer Choice',
    AS_PER_SAMPLE: 'As Per Sample',
    AS_PER_EXPERTISE: 'As Per Expertise',
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtNum = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 4 }));

const labelStyle = { fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap' };
const infoCellStyle = { padding: '2px 0', verticalAlign: 'top' };

function InfoField({ label, value, width }) {
    return (
        <td style={{ ...infoCellStyle, width: width || 'auto', paddingRight: 16 }}>
            <span style={labelStyle}>{label} :</span>{' '}
            <span>{value}</span>
        </td>
    );
}

function colourInstruction(line) {
    const type = COLOUR_LABELS[line.colourInstructionType] || line.colourInstructionType || '';
    const name = line.colourName || line.designPattern || '';
    if (type && name) return `${type}: ${name}`;
    return name || type || '—';
}

export default function TextileJobWorkChallanPrintLayout({ doc, company, processType, jobWorker }) {
    const pt = processType || doc.processType || doc.labourProcessName || 'Dyeing';
    const processTitle = `${String(pt).toUpperCase()} JOB WORK CHALLAN`;

    const defaultInstructions = [
        'Colour as per approved sample.',
        'Return material only against this challan.',
        'Any shortage must be informed immediately.',
    ];
    const specialInstructions = doc.remarks?.trim()
        ? [doc.remarks.trim(), ...defaultInstructions]
        : defaultInstructions;

    const workerAddress = [jobWorker?.address, jobWorker?.city, jobWorker?.state, jobWorker?.pincode].filter(Boolean).join(', ');
    const workerName = doc.dyerName || jobWorker?.supplierName || '—';
    const workerGst = jobWorker?.gstNumber || '—';
    const workerMobile = jobWorker?.phone || jobWorker?.mobile || '—';
    const workerContact = jobWorker?.contactPerson || '—';

    const lines = doc.lines || [];

    return (
        <div className="print-content" style={{ border: '1px solid #000', padding: '8mm 8mm', display: 'flex', flexDirection: 'column', background: '#fff', boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '8.5pt', color: '#000', lineHeight: 1.25 }}>
            {/* Company header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '6px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flex: 1 }}>
                    {company?.logoUrl ? (
                        <img src={company.logoUrl} alt="Company Logo" style={{ maxHeight: '52px', maxWidth: '90px', objectFit: 'contain' }} />
                    ) : null}
                    <div>
                        <div style={{ fontSize: '16pt', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>
                            {company?.companyName || company?.legalName || '—'}
                        </div>
                        <div style={{ fontSize: '8.5pt', maxWidth: '420px' }}>
                            {company?.address ? <div>{company.address}</div> : null}
                            {(company?.city || company?.state || company?.pincode) ? (
                                <div>{[company.city, company.state, company.pincode].filter(Boolean).join(', ')}</div>
                            ) : null}
                            <div style={{ marginTop: '4px' }}>
                                {company?.gstNumber ? <span><strong>GSTIN:</strong> {company.gstNumber}</span> : null}
                                {company?.gstNumber && company?.panNumber ? ' · ' : null}
                                {company?.panNumber ? <span><strong>PAN:</strong> {company.panNumber}</span> : null}
                            </div>
                            <div>
                                {company?.phone ? <span><strong>Phone:</strong> {company.phone}</span> : null}
                                {company?.phone && company?.email ? ' · ' : null}
                                {company?.email ? <span><strong>Email:</strong> {company.email}</span> : null}
                            </div>
                            {company?.website ? <div><strong>Website:</strong> {company.website}</div> : null}
                        </div>
                    </div>
                </div>
            </div>

            {/* Document title */}
            <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                <div style={{ fontSize: '10pt', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '2px' }}>TEXTILE JOB WORK ISSUE CHALLAN</div>
                <div style={{ fontSize: '11pt', fontWeight: 900, textTransform: 'uppercase', border: '2px solid #000', display: 'inline-block', padding: '2px 12px' }}>
                    {processTitle}
                </div>
            </div>

            {/* Challan info + QR (top-right) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 42mm', gap: '8px', marginBottom: '6px', border: '1px solid #000' }}>
                <div style={{ padding: '6px 10px', fontSize: '8pt', lineHeight: 1.45 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            <tr>
                                <InfoField label="Challan No" value={doc.challanNo} />
                                <InfoField label="Date" value={fmtDate(doc.issueDate)} />
                            </tr>
                            <tr>
                                <InfoField label="Process" value={pt} />
                                <InfoField label="Status" value={doc.status} />
                            </tr>
                            <tr>
                                <InfoField label="Expected Return Date" value={fmtDate(doc.expectedReturnDate)} />
                                {doc.productionOrderNo ? (
                                    <InfoField label="Production Order" value={doc.productionOrderNo} />
                                ) : (
                                    <td style={infoCellStyle} />
                                )}
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div style={{ borderLeft: '1px solid #000', padding: '4mm 3mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TextileJobWorkChallanQrBlock
                        doc={doc}
                        company={company}
                        processType={processType}
                        jobWorker={jobWorker}
                        variant="print"
                    />
                </div>
            </div>

            {/* Job worker / dyer — full details */}
            <div style={{ border: '1px solid #000', marginBottom: '6px' }}>
                <div style={{ background: '#f5f5f5', borderBottom: '1px solid #000', padding: '3px 8px', fontWeight: 800, fontSize: '7.5pt', textTransform: 'uppercase' }}>
                    Job Worker / Dyer Details
                </div>
                <div style={{ padding: '5px 10px', fontSize: '8pt', lineHeight: 1.45 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            <tr>
                                <td style={{ ...infoCellStyle, width: '155px' }}><span style={labelStyle}>Name of Dyer / Job Worker :</span></td>
                                <td style={infoCellStyle}><strong>{workerName}</strong></td>
                            </tr>
                            <tr>
                                <td style={infoCellStyle}><span style={labelStyle}>Address :</span></td>
                                <td style={infoCellStyle}>{workerAddress || '—'}</td>
                            </tr>
                            <tr>
                                <td style={infoCellStyle}><span style={labelStyle}>GSTIN No. :</span></td>
                                <td style={infoCellStyle}>{workerGst}</td>
                            </tr>
                            <tr>
                                <td style={infoCellStyle}><span style={labelStyle}>Mobile :</span></td>
                                <td style={infoCellStyle}>
                                    {workerMobile}
                                    {workerContact !== '—' ? ` · Contact Person : ${workerContact}` : ''}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Material table */}
            <div style={{ marginBottom: '4px' }}>
                <div style={{ background: '#f5f5f5', border: '1px solid #000', borderBottom: 'none', padding: '3px 8px', fontWeight: 800, fontSize: '7.5pt', textTransform: 'uppercase' }}>
                    Material Details
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '7pt', tableLayout: 'fixed' }}>
                    <thead>
                        <tr style={{ background: '#f5f5f5' }}>
                            {['Sr', 'Lot No', 'Than No', 'Item Code', 'Item Name', 'Colour Instruction', 'Issued m', 'M/PCS', 'Exp PCS', 'Exp Ret m', 'Exp Loss m', 'Labour ₹', 'Remarks'].map((h) => (
                                <th key={h} style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center', fontWeight: 800, verticalAlign: 'middle', wordWrap: 'break-word' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l, i) => (
                            <tr key={l._id || i}>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center' }}>{i + 1}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center' }}>{l.lotNo || '—'}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center' }}>{l.thanNo || '—'}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center', wordWrap: 'break-word' }}>{l.fabricItemId?.itemCode || '—'}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', wordWrap: 'break-word' }}>{l.fabricItemName || l.fabricItemId?.itemName || '—'}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', wordWrap: 'break-word' }}>{colourInstruction(l)}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'right' }}>{fmtNum(l.issuedMeter)}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'right' }}>{fmtNum(l.meterPerPcs)}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'right' }}>{fmtNum(l.expectedPcs)}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'right' }}>{fmtNum(l.expectedReturnMeter)}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'right' }}>{fmtNum(l.expectedLossMeter)}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'right' }}>{l.labourAmount != null ? fmtNum(l.labourAmount) : '—'}</td>
                                <td style={{ border: '1px solid #000', padding: '2px 2px', wordWrap: 'break-word' }}>{l.remarks || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer: summary + instructions + signatures */}
            <div className="challan-print-footer" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div style={{ border: '1px solid #000', marginBottom: '4px', padding: '3px 6px', background: '#fafafa', fontSize: '7.5pt', lineHeight: 1.3 }}>
                    <strong style={{ textTransform: 'uppercase', marginRight: 6 }}>Summary:</strong>
                    <span><strong>Issued m</strong> {fmtNum(doc.totalIssuedMeter)}</span>
                    <span style={{ margin: '0 8px', color: '#999' }}>|</span>
                    <span><strong>Exp PCS</strong> {fmtNum(doc.totalExpectedPcs)}</span>
                    <span style={{ margin: '0 8px', color: '#999' }}>|</span>
                    <span><strong>Exp Ret m</strong> {fmtNum(doc.totalExpectedReturnMeter)}</span>
                    <span style={{ margin: '0 8px', color: '#999' }}>|</span>
                    <span><strong>Exp Loss m</strong> {fmtNum(doc.totalExpectedLossMeter)}</span>
                    <span style={{ margin: '0 8px', color: '#999' }}>|</span>
                    <span><strong>Labour</strong> {doc.totalLabourAmount != null ? `₹ ${fmtNum(doc.totalLabourAmount)}` : '—'}</span>
                </div>

                <div style={{ border: '1px solid #000', marginBottom: '4px', padding: '3px 6px', fontSize: '7pt', lineHeight: 1.3 }}>
                    <strong style={{ textTransform: 'uppercase', marginRight: 6 }}>Special Instructions:</strong>
                    {specialInstructions.join(' · ')}
                </div>

                {/* Signatures — one row with blank signing space kept */}
                <div className="challan-print-signatures" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', border: '1px solid #000' }}>
                    {[
                        { key: 'prepared', label: 'Prepared By' },
                        { key: 'stores', label: 'Stores Incharge' },
                        { key: 'authorized', label: 'Authorized Signatory' },
                        { key: 'worker', label: 'Job Worker Acceptance' },
                        { key: 'received', label: 'Received By' },
                    ].map((item, i, arr) => (
                        <div
                            key={item.key}
                            style={{
                                flex: '1 1 0',
                                minWidth: 0,
                                padding: '4px 3px 6px',
                                borderRight: i < arr.length - 1 ? '1px solid #000' : 'none',
                                textAlign: 'center',
                                minHeight: 42,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'flex-end',
                            }}
                        >
                            <div style={{ flex: 1, minHeight: 18 }} />
                            <div style={{ borderTop: '1px solid #666', marginBottom: 3, paddingTop: 2, fontSize: '5.5pt', color: '#666' }}>Sign &amp; Date</div>
                            <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '6pt', lineHeight: 1.2, wordWrap: 'break-word' }}>{item.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
