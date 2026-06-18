export const SUPPLIER_DOCUMENT_TYPES = [
    { id: 'gst_certificate', label: 'GST Certificate' },
    { id: 'pan_card', label: 'PAN Card' },
    { id: 'tan_certificate', label: 'TAN Certificate' },
    { id: 'msme_certificate', label: 'MSME Certificate' },
    { id: 'cancelled_cheque', label: 'Cancelled Cheque' },
    { id: 'registration_form', label: 'Vendor Registration Form' },
    { id: 'agreement', label: 'Agreement' },
    { id: 'authorization_letter', label: 'Authorization Letter' },
    { id: 'insurance_copy', label: 'Insurance Copy' },
    { id: 'other', label: 'Other Documents' },
];

export const EXPIRY_DOCUMENT_TYPES = new Set([
    'msme_certificate',
    'agreement',
    'authorization_letter',
    'insurance_copy',
    'other',
]);

export const OCR_FIELD_MAP = {
    gst_certificate: 'gstNumber',
    pan_card: 'panNumber',
    tan_certificate: 'tanNumber',
    msme_certificate: 'msmeRegNo',
    cancelled_cheque: 'bankAccountNo',
};
