import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { createRdSample, updateRdSample, getRdProjects } from '../../../services/rdSampleApi';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { Card } from '../../../components/ui/Card';
import { IndianRupee, Globe, Truck, DollarSign, Microscope } from 'lucide-react';

const RdSampleForm = ({ sample, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        entryNo: '',
        entryDate: new Date().toISOString().split('T')[0],
        project: '',
        sampleType: '',
        itemName: '',
        itemDescription: '',
        internalSampleCode: '',
        supplierName: '',
        supplierCountry: 'India',
        supplierContactPerson: '',
        supplierMobile: '',
        supplierWeChat: '',
        purchaseSource: 'Local',
        manufacturerName: '',
        brand: '',
        partNumber: '',
        technicalSpec: '',
        quantity: 1,
        uom: 'PCS',
        unitRate: 0,
        currency: 'INR',
        exchangeRate: 1,
        totalAmount: 0,
        freight: 0,
        landedCost: 0,
        receiptDate: '',
        testStatus: 'Pending',
        testResultSummary: '',
        finalSelectionStatus: 'Not Selected',
        notes: '',
        notConvertedDetails: {
            reason: '',
            matter: '',
            remarks: ''
        }
    });

    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchProjects();
        if (sample) {
            setFormData({
                ...sample,
                project: sample.project?._id || sample.project || '',
                entryDate: new Date(sample.entryDate).toISOString().split('T')[0],
                receiptDate: sample.receiptDate ? new Date(sample.receiptDate).toISOString().split('T')[0] : ''
            });
        }
    }, [sample]);

    const fetchProjects = async () => {
        try {
            const res = await getRdProjects();
            setProjects(res.data?.data || []);
        } catch (error) {
            console.error('Failed to fetch projects', error);
        }
    };

    const calculateLandedCost = (data) => {
        const rateInInr = (parseFloat(data.unitRate) || 0) * (parseFloat(data.exchangeRate) || 1);
        const qty = parseFloat(data.quantity) || 1;
        const total = rateInInr * qty;
        const fr = parseFloat(data.freight) || 0;
        const lc = (total + fr) / qty;
        return {
            totalAmount: total,
            landedCost: parseFloat(lc.toFixed(2))
        };
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        let newData = { ...formData, [name]: value };

        // Auto calculate costing fields
        if (['unitRate', 'exchangeRate', 'quantity', 'freight'].includes(name)) {
            const updates = calculateLandedCost(newData);
            newData = { ...newData, ...updates };
        }

        // Auto set exchange rate for currency
        if (name === 'currency') {
            if (value === 'INR') newData.exchangeRate = 1;
            else if (value === 'USD') newData.exchangeRate = 83;
            else if (value === 'CNY') newData.exchangeRate = 11.5;
            
            const updates = calculateLandedCost(newData);
            newData = { ...newData, ...updates };
        }

        setFormData(newData);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            const payload = { ...formData };
            if (!payload.project) {
                toast.error('Please select a project');
                return;
            }

            const negativeStatuses = ['Rejected', 'Not Converted', 'Hold'];
            if (negativeStatuses.includes(payload.testStatus)) {
                if (!payload.notConvertedDetails?.reason || !payload.notConvertedDetails?.matter) {
                    toast.error('Reason and Detailed Matter are mandatory for this status');
                    return;
                }
            }

            if (sample) {
                await updateRdSample(sample._id, payload);
                toast.success('Sample updated successfully');
            } else {
                await createRdSample(payload);
                toast.success('Sample created successfully');
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save sample');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={sample ? 'Edit Sample Entry' : 'New Sample Entry'} width="max-w-4xl">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                    <Card className="col-span-1 p-4 bg-gray-50 border-none shadow-none">
                        <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Microscope size={16} /> Basic Details</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Project *</label>
                                <Select required name="project" value={formData.project} onChange={handleChange}>
                                    <option value="">Select Project</option>
                                    {projects.map(p => (
                                        <option key={p._id} value={p._id}>{p.projectName}</option>
                                    ))}
                                </Select>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Item Name *</label>
                                <Input required name="itemName" value={formData.itemName} onChange={handleChange} placeholder="e.g., Driver IC v2" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Part Number</label>
                                <Input name="partNumber" value={formData.partNumber} onChange={handleChange} placeholder="Manufacturer PN" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Internal Code</label>
                                <Input name="internalSampleCode" value={formData.internalSampleCode} onChange={handleChange} placeholder="Assigned Internal Code" />
                            </div>
                        </div>
                    </Card>

                    <Card className="col-span-1 p-4 bg-gray-50 border-none shadow-none">
                        <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Globe size={16} /> Supplier Info</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Supplier Name *</label>
                                <Input required name="supplierName" value={formData.supplierName} onChange={handleChange} placeholder="Supplier / Vendor" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Country</label>
                                <Select name="supplierCountry" value={formData.supplierCountry} onChange={handleChange}>
                                    <option value="India">India</option>
                                    <option value="China">China</option>
                                    <option value="Other">Other</option>
                                </Select>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Source</label>
                                <Select name="purchaseSource" value={formData.purchaseSource} onChange={handleChange}>
                                    <option value="Local">Local Market</option>
                                    <option value="Import">Import</option>
                                    <option value="Agent">Agent</option>
                                    <option value="Online">Online / Portal</option>
                                    <option value="Existing Vendor">Existing Vendor</option>
                                    <option value="Other">Other</option>
                                </Select>
                            </div>
                             <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">WeChat / WhatsApp</label>
                                <Input name="supplierWeChat" value={formData.supplierWeChat} onChange={handleChange} placeholder="Contact Handle" />
                            </div>
                        </div>
                    </Card>

                    <Card className="col-span-1 p-4 bg-gray-50 border-none shadow-none">
                        <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><DollarSign size={16} /> Costing (INR)</h3>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase">Rate</label>
                                    <Input type="number" name="unitRate" value={formData.unitRate} onChange={handleChange} />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase">Curr</label>
                                    <Select name="currency" value={formData.currency} onChange={handleChange}>
                                        <option value="INR">INR</option>
                                        <option value="USD">USD</option>
                                        <option value="CNY">CNY</option>
                                    </Select>
                                </div>
                            </div>
                            {formData.currency !== 'INR' && (
                                <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase">Exch Rate</label>
                                    <Input type="number" step="0.01" name="exchangeRate" value={formData.exchangeRate} onChange={handleChange} />
                                </div>
                            )}
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Freight / Shipping</label>
                                <Input type="number" name="freight" value={formData.freight} onChange={handleChange} />
                            </div>
                            <div className="p-2 bg-blue-100 rounded text-center">
                                <div className="text-[10px] text-blue-600 font-bold uppercase">Net Landed Cost</div>
                                <div className="text-xl font-mono font-bold text-blue-800">₹{formData.landedCost}</div>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h3 className="font-bold text-sm border-b pb-1">Sample Tracking</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Receipt Date</label>
                                <Input type="date" name="receiptDate" value={formData.receiptDate} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase">Sample Qty</label>
                                <Input type="number" name="quantity" value={formData.quantity} onChange={handleChange} />
                            </div>
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-gray-500 uppercase">Testing Status</label>
                            <Select name="testStatus" value={formData.testStatus} onChange={handleChange}>
                                <option value="Pending">Pending</option>
                                <option value="Sample Sent">Sample Sent</option>
                                <option value="Under Testing">Under Testing</option>
                                <option value="Approved">Approved</option>
                                <option value="Rejected">Rejected</option>
                                <option value="Alternative">Alternative</option>
                                <option value="Final Selected">Final Selected</option>
                                <option value="Negotiation">Negotiation</option>
                                <option value="Converted to Order">Converted to Order</option>
                                <option value="Not Converted">Not Converted</option>
                                <option value="Hold">Hold</option>
                            </Select>
                        </div>

                        {['Rejected', 'Not Converted', 'Hold'].includes(formData.testStatus) && (
                            <Card className="p-3 bg-red-50 border-red-200 mt-2">
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[11px] font-bold text-red-600 uppercase">Fixed Reason *</label>
                                        <Select 
                                            name="notConvertedReason" 
                                            value={formData.notConvertedDetails?.reason} 
                                            onChange={(e) => setFormData({...formData, notConvertedDetails: {...formData.notConvertedDetails, reason: e.target.value}})}
                                        >
                                            <option value="">Select Reason</option>
                                            <option value="Rate is high">Rate is high</option>
                                            <option value="Product not suitable">Product not suitable</option>
                                            <option value="Competitor selected">Competitor selected</option>
                                            <option value="Technical Issue">Technical Issue</option>
                                            <option value="Sample Failed">Sample Failed</option>
                                            <option value="Other">Other</option>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-red-600 uppercase">Detailed Matter *</label>
                                        <textarea 
                                            className="w-full border rounded p-2 text-sm" 
                                            value={formData.notConvertedDetails?.matter}
                                            onChange={(e) => setFormData({...formData, notConvertedDetails: {...formData.notConvertedDetails, matter: e.target.value}})}
                                            rows={2}
                                            placeholder="Details about rejection/hold..."
                                        />
                                    </div>
                                </div>
                            </Card>
                        )}
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-bold text-sm border-b pb-1">Technical Notes</h3>
                        <div>
                            <textarea 
                                name="technicalSpec"
                                className="w-full border rounded-md p-2 text-sm min-h-[120px]"
                                value={formData.technicalSpec} 
                                onChange={handleChange}
                                placeholder="Technical specifications, voltage, current, etc..."
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" loading={loading}>{sample ? 'Update' : 'Create'} Sample Entry</Button>
                </div>
            </form>
        </Modal>
    );
};

export default RdSampleForm;
