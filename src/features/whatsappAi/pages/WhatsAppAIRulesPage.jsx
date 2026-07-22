import React from 'react';
import WhatsAppAiPageShell from '../components/WhatsAppAiPageShell';

export default function WhatsAppAIRulesPage() {
    return (
        <WhatsAppAiPageShell
            title="WhatsApp AI Rules"
            subtitle="Conversation and escalation rules shell. Configuration is settings-backed only in Phase 1A."
            filters={['Search rule', 'Category']}
            actions={['Add rule']}
            emptyTitle="No custom rules yet"
            emptyMessage="Rules UI is a foundation shell. Use Settings for confidence and escalation toggles."
        />
    );
}
