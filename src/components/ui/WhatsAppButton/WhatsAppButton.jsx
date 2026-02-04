import React from 'react';
import { MessageCircle } from 'lucide-react';
import styles from './WhatsAppButton.module.scss';

export const WhatsAppButton = ({
    phoneNumber,
    customerName,
    companyName,
    product = '',
    conversationSummary = '',
    nextFollowUpDate = '',
    className = '',
    size = 'md'
}) => {
    const generateWhatsAppMessage = () => {
        const message = `Hello ${customerName},

This is regarding our discussion${product ? ` about ${product}` : ''}.

${conversationSummary ? `Summary: ${conversationSummary}\n\n` : ''}${nextFollowUpDate ? `Next Follow-up Date: ${nextFollowUpDate}\n\n` : ''}Regards,
${companyName || 'Our Team'}`;

        return encodeURIComponent(message);
    };

    const handleWhatsAppClick = () => {
        if (!phoneNumber) {
            alert('Customer mobile number is not available');
            return;
        }

        // Clean phone number (remove spaces, dashes, etc.)
        const cleanNumber = phoneNumber.replace(/\D/g, '');

        // Check if number starts with country code, if not assume India (+91)
        const fullNumber = cleanNumber.startsWith('91') ? cleanNumber : `91${cleanNumber}`;

        const message = generateWhatsAppMessage();
        const whatsappUrl = `https://wa.me/${fullNumber}?text=${message}`;

        // Open in new tab
        window.open(whatsappUrl, '_blank');
    };

    const sizeClasses = {
        sm: styles.buttonSm,
        md: styles.buttonMd,
        lg: styles.buttonLg
    };

    return (
        <button
            type="button"
            onClick={handleWhatsAppClick}
            className={`${styles.whatsappButton} ${sizeClasses[size]} ${className}`}
            title="Send details via WhatsApp Web"
            disabled={!phoneNumber}
        >
            <MessageCircle size={size === 'sm' ? 16 : size === 'lg' ? 22 : 18} />
            <span>Send via WhatsApp</span>
        </button>
    );
};
