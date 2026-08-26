import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import {
    approveCustomerPriceList,
    downloadCustomerPriceListExcel,
    expireCustomerPriceList,
    getCustomerPriceList,
    getCustomerPriceListPrintPayload,
    markCustomerPriceListSent,
    reviseCustomerPriceList,
    findPossibleCustomersForPriceList,
    linkCustomerPriceList,
} from '@/services/customerPriceListApi';
import { createCustomer } from '@/services/customerApi';
import CustomerPartySearch from './CustomerPartySearch';
import { openCustomerPriceListPrint } from './customerPriceListPrint';
import toast from 'react-hot-toast';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const dmy = (v) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

export default function CustomerPriceListDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [doc, setDoc] = useState(null);
    const [busy, setBusy] = useState(false);
    const [sendOpen, setSendOpen] = useState(false);
    const [sendForm, setSendForm] = useState({ channel: 'WhatsApp', recipient: '', contactName: '' });
    const [convertOpen, setConvertOpen] = useState(false);
    const [dupes, setDupes] = useState([]);
    const [converting, setConverting] = useState(false);

    const load = () => getCustomerPriceList(id).then(setDoc).catch(() => toast.error('Failed to load'));
    useEffect(() => { load(); }, [id]);

    if (!doc) return <div style={{ padding: 24 }}>Loading…</div>;

    const run = async (fn, ok) => {
        setBusy(true);
        try {
            const next = await fn();
            if (next?._id && next._id !== doc._id) {
                toast.success(ok);
                navigate(PATHS.SALES.CUSTOMER_PRICE_LIST_DETAIL(next._id));
                return;
            }
            setDoc(next);
            toast.success(ok);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Action failed');
        } finally {
            setBusy(false);
        }
    };

    const previewPdf = async () => {
        const payload = await getCustomerPriceListPrintPayload(id);
        openCustomerPriceListPrint(payload);
    };

    const excel = async () => {
        const blob = await downloadCustomerPriceListExcel(id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${doc.priceListNo.replace(/\//g, '-')}-${doc.version}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <div>
                    <button type="button" onClick={() => navigate(PATHS.SALES.CUSTOMER_PRICE_LISTS)} style={{ border: 0, background: 'none', color: '#0f766e', cursor: 'pointer', fontWeight: 700 }}>← Price Lists</button>
                    <h1 style={{ margin: '6px 0 0', fontSize: 22 }}>{doc.priceListNo} {doc.version}</h1>
                    <div style={{ color: '#64748b', fontSize: 13 }}>{doc.customerCompany || doc.customerName} · {doc.partyType === 'Prospect' && !doc.customerId ? 'Prospect' : doc.status}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignContent: 'flex-start' }}>
                    {doc.status === 'Draft' && (
                        <>
                            <button type="button" disabled={busy} onClick={() => navigate(PATHS.SALES.CUSTOMER_PRICE_LIST_EDIT(id))} style={btn()}>Edit</button>
                            <button type="button" disabled={busy} onClick={() => run(() => approveCustomerPriceList(id), 'Approved')} style={btn('#0f766e')}>Approve</button>
                        </>
                    )}
                    {['Approved', 'Sent'].includes(doc.status) && (
                        <button type="button" disabled={busy} onClick={() => run(() => expireCustomerPriceList(id), 'Expired')} style={btn()}>Expire</button>
                    )}
                    {!doc.customerId && (
                        <button type="button" disabled={busy} onClick={async () => {
                            setConvertOpen(true);
                            try {
                                const data = await findPossibleCustomersForPriceList({
                                    mobile: doc.customerPhone || doc.customerWhatsapp,
                                    gstin: doc.customerGstin,
                                    email: doc.customerEmail,
                                    company: doc.customerCompany,
                                });
                                setDupes(data?.matches || []);
                            } catch {
                                setDupes([]);
                            }
                        }} style={btn('#0f766e')}>+ Create Customer</button>
                    )}
                    {['Approved', 'Sent', 'Expired'].includes(doc.status) && (
                        <button type="button" disabled={busy} onClick={() => {
                            const reason = window.prompt('Revision reason (kept on the new version):') || '';
                            return run(() => reviseCustomerPriceList(id, { revisionReason: reason }), 'New version created');
                        }} style={btn()}>Revise (new version)</button>
                    )}
                    <button type="button" onClick={previewPdf} style={btn()}>Preview / PDF</button>
                    {['Approved', 'Sent'].includes(doc.status) && (
                        <>
                            <button type="button" onClick={excel} style={btn()}>Generate Excel</button>
                            <button type="button" onClick={() => setSendOpen(true)} style={btn('#0f766e')}>Send</button>
                        </>
                    )}
                </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 13 }}>
                    <Field k="Date" v={dmy(doc.date)} />
                    <Field k="Effective From" v={dmy(doc.effectiveFrom)} />
                    <Field k="Valid Upto" v={doc.validUpto ? dmy(doc.validUpto) : 'Open'} />
                    <Field k="Type" v={doc.priceType} />
                    <Field k="Customer" v={doc.customerName} />
                    <Field k="Company" v={doc.customerCompany || '—'} />
                    <Field k="City" v={doc.customerCity || '—'} />
                    <Field k="GSTIN" v={doc.customerGstin || '—'} />
                    <Field k="Mobile" v={doc.customerPhone || doc.customerWhatsapp || '—'} />
                    <Field k="Email" v={doc.customerEmail || '—'} />
                    <Field k="GST" v={doc.gstTreatment} />
                    <Field k="Freight" v={doc.freightTerms || '—'} />
                    <Field k="Payment" v={doc.paymentTerms || '—'} />
                    <Field k="Delivery" v={doc.deliveryTerms || '—'} />
                </div>
                {doc.revisionReason && <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>Revision reason: {doc.revisionReason}</div>}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            {['Product', 'Model No.', 'Description', 'Quantity', 'UOM', 'Std', 'Unit Rate', 'GST'].map((h) => (
                                <th key={h} style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(doc.lines || []).filter((l) => l.finalRate !== '' && l.finalRate != null && Number.isFinite(Number(l.finalRate))).map((l) => (
                            <tr key={l._id}>
                                <td style={{ padding: 10 }}>{l.productName || '—'}<div style={{ fontSize: 11, color: '#94a3b8' }}>{l.itemCode || '—'}</div></td>
                                <td style={{ padding: 10 }}>{l.modelNo || '—'}</td>
                                <td style={{ padding: 10, maxWidth: 280 }}>{l.description || '—'}</td>
                                <td style={{ padding: 10 }}>{qtyLabel(l)}</td>
                                <td style={{ padding: 10 }}>{l.uom}</td>
                                <td style={{ padding: 10 }}>{inr(l.standardPrice)}</td>
                                <td style={{ padding: 10, fontWeight: 700 }}>{inr(l.finalRate)}</td>
                                <td style={{ padding: 10 }}>{l.taxTreatment}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {!!doc.sentHistory?.length && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Sent history</div>
                    {doc.sentHistory.map((s) => (
                        <div key={s._id} style={{ fontSize: 12, padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
                            {s.channel} · {s.recipient || s.contactName || '—'} · {s.sentByName} · {dmy(s.sentAt)} · {s.version}
                        </div>
                    ))}
                </div>
            )}

            {convertOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 480, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,.15)' }}>
                        <div style={{ fontWeight: 800, marginBottom: 8 }}>Save as Customer</div>
                        <p style={{ fontSize: 12, color: '#64748b' }}>
                            This is an explicit action. The Price List is not converted automatically. Original recipient snapshot stays on this document.
                        </p>
                        {!!dupes.length && (
                            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                                <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 6 }}>Possible existing customer found</div>
                                {dupes.map((m) => (
                                    <button
                                        key={m._id}
                                        type="button"
                                        disabled={converting}
                                        onClick={async () => {
                                            setConverting(true);
                                            try {
                                                const linked = await linkCustomerPriceList(id, m._id);
                                                setDoc(linked);
                                                setConvertOpen(false);
                                                toast.success('Linked to existing customer. History kept.');
                                            } catch (e) {
                                                toast.error(e?.response?.data?.message || 'Link failed');
                                            } finally {
                                                setConverting(false);
                                            }
                                        }}
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 0', border: 0, background: 'none', cursor: 'pointer', fontSize: 13 }}
                                    >
                                        <strong>{m.company || m.customerName}</strong> · {m.customerCode} · {m.phone || m.gstin || ''}
                                    </button>
                                ))}
                                <div style={{ fontSize: 11, color: '#92400e' }}>Select above to link, or create a new customer below. Records are not merged silently.</div>
                            </div>
                        )}
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Or link another existing customer</div>
                            <CustomerPartySearch onSelect={async (c) => {
                                setConverting(true);
                                try {
                                    const linked = await linkCustomerPriceList(id, c.id);
                                    setDoc(linked);
                                    setConvertOpen(false);
                                    toast.success('Linked to existing customer. History kept.');
                                } catch (e) {
                                    toast.error(e?.response?.data?.message || 'Link failed');
                                } finally {
                                    setConverting(false);
                                }
                            }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" onClick={() => setConvertOpen(false)} style={btn()}>Cancel</button>
                            <button
                                type="button"
                                disabled={converting}
                                onClick={async () => {
                                    setConverting(true);
                                    try {
                                        const contact = {
                                            name: doc.customerContactName || doc.customerName || doc.customerCompany || 'Contact',
                                            mobile: doc.customerPhone || '',
                                            whatsApp: doc.customerWhatsapp || '',
                                            isPrimary: true,
                                        };
                                        if (doc.customerEmail) contact.email = doc.customerEmail;
                                        const payload = {
                                            customerName: doc.customerName || '',
                                            company: doc.customerCompany || '',
                                            city: doc.customerCity || '',
                                            state: doc.customerState || '',
                                            address: doc.customerAddress || '',
                                            gstNumber: doc.customerGstin || '',
                                            contactPersons: [contact],
                                        };
                                        if (doc.customerEmail) payload.companyEmail = doc.customerEmail;
                                        const created = await createCustomer(payload);
                                        const linked = await linkCustomerPriceList(id, created._id);
                                        setDoc(linked);
                                        setConvertOpen(false);
                                        toast.success('Customer created and Price List linked. History kept.');
                                    } catch (e) {
                                        toast.error(e?.response?.data?.message || 'Create customer failed');
                                    } finally {
                                        setConverting(false);
                                    }
                                }}
                                style={btn('#0f766e')}
                            >
                                {converting ? 'Working…' : 'Create new Customer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {sendOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 420, boxShadow: '0 10px 40px rgba(0,0,0,.15)' }}>
                        <div style={{ fontWeight: 800, marginBottom: 12 }}>Send Price List</div>
                        <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                            Opens this saved version as PDF. Existing WhatsApp/Email engines are not changed — attach the PDF after you confirm.
                        </p>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Channel</label>
                        <select value={sendForm.channel} onChange={(e) => setSendForm((p) => ({ ...p, channel: e.target.value }))} style={{ width: '100%', margin: '4px 0 10px', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                            <option>WhatsApp</option>
                            <option>Email</option>
                            <option>Manual</option>
                        </select>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Recipient / contact</label>
                        <input value={sendForm.recipient} onChange={(e) => setSendForm((p) => ({ ...p, recipient: e.target.value }))} style={{ width: '100%', margin: '4px 0 10px', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', boxSizing: 'border-box' }} placeholder="Phone or email" />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" onClick={() => setSendOpen(false)} style={btn()}>Cancel</button>
                            <button
                                type="button"
                                onClick={async () => {
                                    await previewPdf();
                                    await markCustomerPriceListSent(id, {
                                        channel: sendForm.channel,
                                        recipient: sendForm.recipient,
                                        contactName: sendForm.contactName || doc.customerName,
                                        documentKind: 'PDF',
                                    });
                                    setSendOpen(false);
                                    load();
                                    toast.success('PDF opened for this saved version. Send recorded.');
                                }}
                                style={btn('#0f766e')}
                            >
                                Confirm &amp; open PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({ k, v }) {
    return (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{k}</div>
            <div>{v || '—'}</div>
        </div>
    );
}

function btn(bg) {
    return {
        padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12,
        border: bg ? 0 : '1px solid #e2e8f0', background: bg || '#fff', color: bg ? '#fff' : '#334155',
    };
}

function qtyLabel(l) {
    const rawUom = String(l?.uom || 'pcs').trim();
    const unit = !rawUom || rawUom.toUpperCase() === 'NOS' ? 'pcs' : rawUom.toLowerCase();
    const min = Number(l.minQty) || 0;
    if (!min) return 'Any qty';
    if (min === 1) return unit === 'pcs' ? 'Sample / 1 pc' : `Sample / 1 ${unit}`;
    return `${min}+ ${unit}`;
}
