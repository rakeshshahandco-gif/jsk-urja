export const CUSTOMER_DOCUMENT_TYPES = [
    { id: 'gst_certificate', label: 'GST Certificate' },
    { id: 'pan_card', label: 'PAN Card' },
    { id: 'tan_certificate', label: 'TAN Certificate' },
    { id: 'msme_certificate', label: 'MSME Certificate' },
    { id: 'iec_certificate', label: 'IEC Certificate' },
    { id: 'registration_form', label: 'Customer Registration Form' },
    { id: 'cancelled_cheque', label: 'Cancelled Cheque' },
    { id: 'agreement', label: 'Agreement / Contract' },
    { id: 'authorization_letter', label: 'Authorization Letter' },
    { id: 'kyc_form', label: 'KYC Form' },
    { id: 'insurance_copy', label: 'Insurance Copy' },
    { id: 'other', label: 'Other Documents' },
];

export const FIELD_DOCUMENT_LINKS = {
    gstNumber: 'gst_certificate',
    panNumber: 'pan_card',
    tanNumber: 'tan_certificate',
    msmeRegNo: 'msme_certificate',
    iecNumber: 'iec_certificate',
    bankDetails: 'cancelled_cheque',
};

export const EXPIRY_DOCUMENT_TYPES = new Set([
    'msme_certificate',
    'iec_certificate',
    'agreement',
    'insurance_copy',
    'other',
]);

/** OCR-ready — extraction not implemented */
export const OCR_FIELD_MAP = {
    gst_certificate: 'gstNumber',
    pan_card: 'panNumber',
    tan_certificate: 'tanNumber',
    msme_certificate: 'msmeRegNo',
    iec_certificate: 'iecNumber',
    cancelled_cheque: 'bankAccountNumber',
};

export const CUSTOMER_FORM_TABS = [
    { id: 'basic', label: 'Basic Details' },
    { id: 'gstTax', label: 'GST & Tax' },
    { id: 'banking', label: 'Banking' },
    { id: 'export', label: 'Export' },
    { id: 'documents', label: 'Documents / KYC' },
];
