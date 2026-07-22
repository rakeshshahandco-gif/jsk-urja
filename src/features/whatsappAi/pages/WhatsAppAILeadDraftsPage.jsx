import React from 'react';
import WhatsAppAiPageShell from '../components/WhatsAppAiPageShell';

export default function WhatsAppAILeadDraftsPage() {
    return (
        <WhatsAppAiPageShell
            title="AI Lead Drafts"
            subtitle="Draft leads captured by the assistant. Promotion to CRM Lead Master is not available in Phase 1A."
            filters={['Search', 'Status', 'Date range']}
            actions={['Review draft']}
            emptyTitle="No lead drafts"
            emptyMessage="Lead drafts will appear here. Final CRM lead creation is blocked in this phase."
        />
    );
}
