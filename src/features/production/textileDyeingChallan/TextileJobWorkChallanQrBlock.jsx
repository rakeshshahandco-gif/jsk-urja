import React, { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export function buildTextileChallanQrPayload({ doc, company, processType, jobWorker }) {
    const pt = processType || doc?.processType || doc?.labourProcessName || 'Dyeing';
    const issueDate = doc?.issueDate ? new Date(doc.issueDate).toISOString().slice(0, 10) : '';
    return JSON.stringify({
        challan: doc?.challanNo || '',
        process: String(pt).toUpperCase(),
        vendor: doc?.dyerName || '',
        vendorId: jobWorker?._id || '',
        company: company?.companyName || company?.legalName || '',
        companyId: company?._id || doc?.companyId || '',
        date: issueDate,
        barcode: doc?.barcodeValue || doc?.challanNo || '',
    });
}

export default function TextileJobWorkChallanQrBlock({
    doc,
    company,
    processType,
    jobWorker,
    variant = 'print',
}) {
    const payload = useMemo(
        () => buildTextileChallanQrPayload({ doc, company, processType, jobWorker }),
        [doc, company, processType, jobWorker],
    );

    const isPrint = variant === 'print';
    const renderSize = isPrint ? 256 : 128;
    const displaySize = isPrint ? '40mm' : '128px';

    return (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div
                style={{
                    border: '1px solid #999',
                    padding: isPrint ? '1.5mm' : 6,
                    background: '#fff',
                    lineHeight: 0,
                }}
            >
                <QRCodeSVG
                    value={payload}
                    size={renderSize}
                    level="M"
                    includeMargin={false}
                    style={{ width: displaySize, height: displaySize, display: 'block' }}
                />
            </div>
            <div style={{
                fontSize: isPrint ? '7.5pt' : 11,
                fontWeight: 800,
                marginTop: isPrint ? 4 : 8,
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
            }}
            >
                Scan For Return Entry
            </div>
            {doc?.challanNo ? (
                <div style={{ fontSize: isPrint ? '7pt' : 10, color: '#555', marginTop: 2 }}>{doc.challanNo}</div>
            ) : null}
        </div>
    );
}
