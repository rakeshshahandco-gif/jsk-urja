/** Customer KYC document types */
export const CUSTOMER_DOCUMENT_TYPES = [
    'gst_certificate',
    'pan_card',
    'tan_certificate',
    'msme_certificate',
    'iec_certificate',
    'registration_form',
    'cancelled_cheque',
    'agreement',
    'authorization_letter',
    'kyc_form',
    'insurance_copy',
    'other',
];

/** Maps registration field to primary document type (OCR-ready links) */
export const CUSTOMER_FIELD_DOCUMENT_LINKS = {
    gstNumber: 'gst_certificate',
    panNumber: 'pan_card',
    tanNumber: 'tan_certificate',
    msmeRegNo: 'msme_certificate',
    iecNumber: 'iec_certificate',
    bankDetails: 'cancelled_cheque',
};

/** Document types that support expiry + reminder */
export const CUSTOMER_DOCUMENT_EXPIRY_TYPES = new Set([
    'msme_certificate',
    'iec_certificate',
    'agreement',
    'insurance_copy',
    'other',
]);

/** OCR-ready metadata (implementation deferred) */
export const CUSTOMER_OCR_FIELD_MAP = {
    gst_certificate: { targetField: 'gstNumber', label: 'GST Number' },
    pan_card: { targetField: 'panNumber', label: 'PAN Number' },
    tan_certificate: { targetField: 'tanNumber', label: 'TAN Number' },
    msme_certificate: { targetField: 'msmeRegNo', label: 'MSME / UDYAM Number' },
    iec_certificate: { targetField: 'iecNumber', label: 'IEC Number' },
    cancelled_cheque: { targetField: 'bankAccountNumber', label: 'Bank Account Number' },
};

export const CUSTOMER_DOCUMENT_TYPE_LABELS = {
    gst_certificate: 'GST Certificate',
    pan_card: 'PAN Card',
    tan_certificate: 'TAN Certificate',
    msme_certificate: 'MSME Certificate',
    iec_certificate: 'IEC Certificate',
    registration_form: 'Customer Registration Form',
    cancelled_cheque: 'Cancelled Cheque',
    agreement: 'Agreement / Contract',
    authorization_letter: 'Authorization Letter',
    kyc_form: 'KYC Form',
    insurance_copy: 'Insurance Copy',
    other: 'Other Documents',
};
