import React, { useState, useEffect } from 'react';
import { updateInvoiceGstDetails } from '@/services/salesApi';
import toast from 'react-hot-toast';
import { Save, X, AlertTriangle, Info } from 'lucide-react';

const STATE_CODE_MAP = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory'
};

const inp = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#1e293b' };
const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4, textTransform: 'uppercase' };

export default function GstCorrectionModal({ inv, onClose, onSuccess }) {
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        placeOfSupply: inv.placeOfSupply || '',
        billingStateCode: inv.billingStateCode || '',
        gstType: inv.gstType || 'IGST',
        reverseCharge: inv.reverseCharge || false,
        customerRegistrationType: inv.customerRegistrationType || 'Regular',
        ecommerceGstin: inv.ecommerceGstin || '',
        exportType: inv.exportType || '',
        portCode: inv.portCode || '',
        shippingBillNo: inv.shippingBillNo || '',
        shippingBillDate: inv.shippingBillDate ? new Date(inv.shippingBillDate).toISOString().split('T')[0] : '',
        reason: '',
        items: inv.items ? inv.items.map(it => ({ _id: it._id, itemName: it.itemName, hsnCode: it.hsnCode || '', uqc: it.uqc || '' })) : []
    });

    useEffect(() => {
        // Auto-suggestion logic on mount if POS is blank
        if (!inv.placeOfSupply) {
            let suggestedPos = '';
            let suggestedCode = '';
            let suggestedGstType = 'IGST';

            // Check GSTIN first 2 digits
            const gstin = inv.customerGstin;
            if (gstin && gstin.length >= 2) {
                suggestedCode = gstin.substring(0, 2);
                const stateName = STATE_CODE_MAP[suggestedCode] || '';
                suggestedPos = stateName ? `${suggestedCode}-${stateName}` : suggestedCode;
            } else if (inv.billingStateCode && inv.billingState) {
                suggestedCode = inv.billingStateCode;
                suggestedPos = `${inv.billingStateCode}-${inv.billingState}`;
            }

            if (suggestedCode === '27') {
                suggestedGstType = 'CGST/SGST';
            }

            setFormData(prev => ({
                ...prev,
                placeOfSupply: suggestedPos,
                billingStateCode: suggestedCode,
                gstType: suggestedGstType
            }));

            if (suggestedPos) {
                toast.success(`Auto-suggested Place of Supply: ${suggestedPos}`, { icon: <Info size={16} />});
            }
        }
    }, [inv]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.reason.trim()) return toast.error("Reason for correction is required for the Audit Log.");
        if (!formData.placeOfSupply.trim()) return toast.error("Place of Supply cannot be blank.");

        setLoading(true);
        try {
            await updateInvoiceGstDetails(inv._id, formData);
            toast.success("GST Return Details securely updated!");
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to update GST details");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '750px', maxHeight: '90vh', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={20} color="#d97706" />
                            Admin GST Correction Mode
                        </h2>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                            Invoice: <strong style={{ color: '#0f172a' }}>{inv.invoiceNumber}</strong> | Customer: <strong style={{ color: '#0f172a' }}>{inv.customerName}</strong>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Warning Banner */}
                <div style={{ background: '#fffbeb', borderBottom: '1px solid #fef3c7', padding: '12px 24px', fontSize: 13, color: '#92400e', display: 'flex', gap: 8 }}>
                    <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                        <strong>Strict Integrity Lock Active:</strong> You are modifying GST Return fields ONLY. Invoice numbers, dates, stock, ledgers, and commercial totals are completely locked and cannot be altered from this mode.
                    </div>
                </div>

                {/* Form Body */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                    <form id="gst-correction-form" onSubmit={handleSave}>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                            <div>
                                <label style={lbl}>Place of Supply *</label>
                                <input type="text" name="placeOfSupply" value={formData.placeOfSupply} onChange={handleChange} style={inp} placeholder="e.g. 07-Delhi" required />
                            </div>
                            <div>
                                <label style={lbl}>State Code</label>
                                <input type="text" name="billingStateCode" value={formData.billingStateCode} onChange={handleChange} style={inp} placeholder="e.g. 07" />
                            </div>
                            <div>
                                <label style={lbl}>GST Type</label>
                                <select name="gstType" value={formData.gstType} onChange={handleChange} style={inp}>
                                    <option value="IGST">IGST</option>
                                    <option value="CGST/SGST">CGST + SGST</option>
                                </select>
                            </div>
                            <div>
                                <label style={lbl}>Registration Type</label>
                                <select name="customerRegistrationType" value={formData.customerRegistrationType} onChange={handleChange} style={inp}>
                                    <option value="Regular">Regular</option>
                                    <option value="SEZ">SEZ</option>
                                    <option value="Export">Export</option>
                                    <option value="Deemed Export">Deemed Export</option>
                                </select>
                            </div>
                            <div>
                                <label style={lbl}>Reverse Charge</label>
                                <select name="reverseCharge" value={formData.reverseCharge ? 'true' : 'false'} onChange={(e) => setFormData(p => ({...p, reverseCharge: e.target.value === 'true'}))} style={inp}>
                                    <option value="false">No</option>
                                    <option value="true">Yes</option>
                                </select>
                            </div>
                            <div>
                                <label style={lbl}>E-Commerce GSTIN</label>
                                <input type="text" name="ecommerceGstin" value={formData.ecommerceGstin} onChange={handleChange} style={inp} placeholder="If applicable" />
                            </div>
                        </div>

                        {/* Export Details */}
                        {(formData.customerRegistrationType === 'Export' || formData.customerRegistrationType === 'SEZ' || formData.customerRegistrationType === 'Deemed Export') && (
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Export / SEZ Details</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div>
                                        <label style={lbl}>Export Type</label>
                                        <select name="exportType" value={formData.exportType} onChange={handleChange} style={inp}>
                                            <option value="">-- Select --</option>
                                            <option value="WPAY">With Payment of Tax (WPAY)</option>
                                            <option value="WOPAY">Without Payment of Tax (WOPAY)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={lbl}>Port Code</label>
                                        <input type="text" name="portCode" value={formData.portCode} onChange={handleChange} style={inp} />
                                    </div>
                                    <div>
                                        <label style={lbl}>Shipping Bill No.</label>
                                        <input type="text" name="shippingBillNo" value={formData.shippingBillNo} onChange={handleChange} style={inp} />
                                    </div>
                                    <div>
                                        <label style={lbl}>Shipping Bill Date</label>
                                        <input type="date" name="shippingBillDate" value={formData.shippingBillDate} onChange={handleChange} style={inp} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Item Level HSN / UQC Correction */}
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Item Details (HSN/UQC Only)</h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Item Name</th>
                                        <th style={{ width: 120, padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>HSN Code</th>
                                        <th style={{ width: 100, padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>UQC</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formData.items.map((item, idx) => (
                                        <tr key={item._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#334155' }}>{item.itemName}</td>
                                            <td style={{ padding: '8px' }}>
                                                <input type="text" value={item.hsnCode} onChange={(e) => handleItemChange(idx, 'hsnCode', e.target.value)} style={{...inp, padding: '6px 8px'}} placeholder="HSN" />
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <input type="text" value={item.uqc} onChange={(e) => handleItemChange(idx, 'uqc', e.target.value)} style={{...inp, padding: '6px 8px'}} placeholder="NOS/KGS" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mandatory Reason */}
                        <div>
                            <label style={lbl}>Reason for Correction (Required for Audit Log) *</label>
                            <textarea 
                                name="reason" 
                                value={formData.reason} 
                                onChange={handleChange} 
                                style={{ ...inp, height: 80, resize: 'none' }} 
                                placeholder="E.g., Updated missing Place of Supply to clear GSTR-1 blocking error."
                                required
                            />
                        </div>

                    </form>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button type="button" onClick={onClose} disabled={loading} style={{ padding: '10px 20px', borderRadius: 8, background: '#fff', border: '1px solid #cbd5e1', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button type="submit" form="gst-correction-form" disabled={loading} style={{ padding: '10px 24px', borderRadius: 8, background: '#d97706', border: 'none', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, cursor: loading ? 'wait' : 'pointer' }}>
                        {loading ? 'Saving...' : <><Save size={18} /> Update GST Return Details</>}
                    </button>
                </div>

            </div>
        </div>
    );
}
