import React from 'react';
import WhatsAppAiPageShell from '../components/WhatsAppAiPageShell';

export default function WhatsAppAIInboxPage() {
    return (
        <WhatsAppAiPageShell
            title="WhatsApp AI Inbox"
            subtitle="Unified inbox shell. Live inbound WhatsApp messages are not connected in Phase 1A."
            filters={['Search contact', 'Status', 'Date range']}
            actions={['Open conversation']}
            emptyTitle="Inbox is empty"
            emptyMessage="No conversations yet. This page will list AI-managed threads after live integration."
        />
    );
}
