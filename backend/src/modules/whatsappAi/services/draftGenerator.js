/**
 * DraftGenerator interface — deterministic templates for Phase 1B-2.
 * Replaceable later with provider adapters without changing orchestration.
 */

const TEMPLATES = Object.freeze({
    greeting: 'Thank you for contacting us. How may we assist you?',
    product_enquiry: 'Thank you for your enquiry. Our team will review your product requirement and respond shortly.',
    price_enquiry: 'Thank you for your pricing enquiry. Our team will review your request and respond shortly.',
    support_request: 'Thank you for contacting support. A team member will review your request and reply shortly.',
    order_status: 'Thank you for your message. Our team will review your order status request and respond shortly.',
    unknown: 'Thank you for your message. A team member will review it and reply shortly.',
});

/** @returns {{ generate: (input: { intent: string, context?: object }) => { draftText: string } }} */
export function createDraftGenerator() {
    return {
        generate({ intent } = {}) {
            const draftText = TEMPLATES[intent] || TEMPLATES.unknown;
            return { draftText };
        },
    };
}

export default createDraftGenerator;
