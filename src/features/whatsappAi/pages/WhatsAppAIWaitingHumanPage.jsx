import React from 'react';
import WhatsAppAiPageShell from '../components/WhatsAppAiPageShell';

export default function WhatsAppAIWaitingHumanPage() {
    return (
        <WhatsAppAiPageShell
            title="Waiting for Human"
            subtitle="Conversations escalated for human takeover. Takeover actions are foundation-only."
            filters={['Search', 'Priority', 'Waiting since']}
            actions={['Take over', 'Return to AI']}
            emptyTitle="No conversations waiting"
            emptyMessage="Nothing is waiting for a human agent in Phase 1A foundation data."
        />
    );
}
