import React from 'react';
import WhatsAppAiPageShell from '../components/WhatsAppAiPageShell';

export default function WhatsAppAIActiveConversationsPage() {
    return (
        <WhatsAppAiPageShell
            title="Active AI Conversations"
            subtitle="Active AI-handled conversations. Live processing is not enabled."
            filters={['Search', 'Assignee', 'Status']}
            actions={['Take over']}
            emptyTitle="No active conversations"
            emptyMessage="There are no active AI conversations in this company yet."
        />
    );
}
