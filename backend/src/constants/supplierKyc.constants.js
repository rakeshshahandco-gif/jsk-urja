/** Supplier KYC document types */
export const SUPPLIER_DOCUMENT_TYPES = [
    'gst_certificate',
    'pan_card',
    'tan_certificate',
    'msme_certificate',
    'cancelled_cheque',
    'registration_form',
    'agreement',
    'authorization_letter',
    'insurance_copy',
    'other',
];

export const SUPPLIER_DOCUMENT_EXPIRY_TYPES = new Set([
    'msme_certificate',
    'agreement',
    'authorization_letter',
    'insurance_copy',
    'other',
]);

export const SUPPLIER_OCR_FIELD_MAP = {
    gst_certificate: { targetField: 'gstNumber', label: 'GST Number' },
    pan_card: { targetField: 'panNumber', label: 'PAN Number' },
    tan_certificate: { targetField: 'tanNumber', label: 'TAN Number' },
    msme_certificate: { targetField: 'msmeRegNo', label: 'MSME / UDYAM Number' },
    cancelled_cheque: { targetField: 'bankAccountNo', label: 'Bank Account Number' },
};

export const SUPPLIER_DOCUMENT_TYPE_LABELS = {
    gst_certificate: 'GST Certificate',
    pan_card: 'PAN Card',
    tan_certificate: 'TAN Certificate',
    msme_certificate: 'MSME Certificate',
    cancelled_cheque: 'Cancelled Cheque',
    registration_form: 'Vendor Registration Form',
    agreement: 'Agreement',
    authorization_letter: 'Authorization Letter',
    insurance_copy: 'Insurance Copy',
    other: 'Other Documents',
};
