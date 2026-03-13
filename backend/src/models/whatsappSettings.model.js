import mongoose from 'mongoose';

const whatsappSettingsSchema = new mongoose.Schema(
    {
        enabled: {
            type: Boolean,
            default: true,
        },
        preferredMode: {
            type: String,
            default: 'WhatsApp Web',
        },
        defaultCountryCode: {
            type: String,
            default: '91',
        },
        soTemplate: {
            type: String,
            default: 'Dear Sir/Madam,\n\nPlease find attached our Sales Order {order_number} dated {order_date}.\nKindly review and confirm.\n\nRegards,\n{company_name}',
        },
        poTemplate: {
            type: String,
            default: 'Dear Sir/Madam,\n\nPlease find attached our Purchase Order {order_number} dated {order_date}.\nKindly process the material as per PO terms.\n\nRegards,\n{company_name}',
        },
        searchDelay: {
            type: Number,
            default: 2000,
        },
        attachDelay: {
            type: Number,
            default: 3000,
        },
        sendDelay: {
            type: Number,
            default: 2000,
        }
    },
    { timestamps: true }
);

const WhatsAppSettings = mongoose.model('WhatsAppSettings', whatsappSettingsSchema);

export default WhatsAppSettings;
