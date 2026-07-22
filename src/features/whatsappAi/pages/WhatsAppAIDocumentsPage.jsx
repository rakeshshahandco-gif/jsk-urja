import React from 'react';
import WhatsAppAiPageShell from '../components/WhatsAppAiPageShell';

export default function WhatsAppAIDocumentsPage() {
    return (
        <WhatsAppAiPageShell
            title="AI Product Documents"
            subtitle="Approved product documents for future AI sharing. No WhatsApp send in Phase 1A."
            filters={['Search', 'Type', 'Status']}
            actions={['Add document']}
            emptyTitle="No documents"
            emptyMessage="Document catalogue is empty. Sharing to WhatsApp is not enabled yet."
        />
    );
}
