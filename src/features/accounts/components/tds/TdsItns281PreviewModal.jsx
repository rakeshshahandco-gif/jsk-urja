import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { tdsComplianceApi } from '@/services/tdsComplianceApi';
import { toast } from 'react-hot-toast';
import { Itns281BankChallanView } from './Itns281BankChallanView';
import styles from './Itns281BankChallan.module.scss';

export function TdsItns281PreviewModal({ open, onClose, requestPayload, challanId }) {
    const [ctx, setCtx] = useState(null);
    const [breakup, setBreakup] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) {
            setCtx(null);
            setBreakup(null);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const data = await tdsComplianceApi.previewItns281(requestPayload);
                if (cancelled) return;
                setCtx(data);
                setBreakup(data?.paymentBreakup ? { ...data.paymentBreakup } : null);
            } catch (e) {
                if (!cancelled) {
                    toast.error(e.response?.data?.message || e.message || 'Could not load ITNS 281 challan');
                    onClose();
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, requestPayload, onClose]);

    const buildPdfBody = () => {
        const payment = {
            surcharge: breakup?.surcharge ?? 0,
            educationCess: breakup?.educationCess ?? 0,
            interest: breakup?.interest ?? 0,
            penalty: breakup?.penalty ?? 0,
        };
        if (challanId) {
            return {
                challanId,
                financialYear: requestPayload?.financialYear,
                payment,
            };
        }
        return { ...requestPayload, payment: { ...(requestPayload?.payment || {}), ...payment } };
    };

    const handlePrint = () => {
        const style = document.createElement('style');
        style.id = 'itns281-print-style';
        style.textContent = `
          @media print {
            body * { visibility: hidden !important; }
            #itns281-print-area, #itns281-print-area * { visibility: visible !important; }
            #itns281-print-area { position: absolute; left: 0; top: 0; width: 100%; }
            .${styles.noPrint} { display: none !important; }
          }
        `;
        document.head.appendChild(style);
        window.print();
        setTimeout(() => style.remove(), 500);
    };

    const handleDownloadPdf = async () => {
        try {
            const blob = await tdsComplianceApi.downloadItns281Pdf(buildPdfBody());
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Bank-Challan-ITNS-281-${ctx?.section || 'TDS'}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(e.response?.data?.message || 'PDF download failed');
        }
    };

    if (!open) return null;

    return (
        <div
            className={styles.noPrint}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                zIndex: 10000,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div
                style={{
                    background: '#f1f5f9',
                    padding: '10px 16px',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexShrink: 0,
                }}
            >
                <strong style={{ flex: 1 }}>Bank Challan ITNS 281</strong>
                <Button type="button" variant="secondary" onClick={handlePrint} disabled={!ctx}>
                    Print
                </Button>
                <Button type="button" variant="secondary" onClick={handleDownloadPdf} disabled={!ctx}>
                    Download PDF
                </Button>
                <Button type="button" onClick={onClose}>
                    Close
                </Button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: '#e2e8f0', padding: 16 }}>
                {loading && <p style={{ textAlign: 'center', padding: 40 }}>Loading ITNS 281…</p>}
                {!loading && ctx && (
                    <Itns281BankChallanView ctx={ctx} breakup={breakup} onBreakupChange={setBreakup} />
                )}
            </div>
        </div>
    );
}
