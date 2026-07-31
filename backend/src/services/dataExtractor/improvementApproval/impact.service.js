/**
 * Read-only descriptive impact / risk analysis.
 * Does NOT run proposed configuration against historical records (Phase 22).
 */

const MODULE_DEPENDENCIES = {
    industry_classification: ['lead_relevance', 'product_recommendation', 'lead_scoring', 'knowledge_graph'],
    product_recommendation: ['sales_assistant', 'marketing_audience', 'knowledge_graph'],
    lead_scoring: ['sales_workflow', 'crm_enrichment', 'marketing_audience'],
    contact_intelligence: ['crm_enrichment', 'sales_workflow', 'sales_assistant'],
    knowledge_graph: ['similar_company', 'sales_assistant'],
    sales_assistant: [],
    similar_company: ['knowledge_graph', 'crm_enrichment'],
    crm_enrichment: ['sales_workflow'],
    sales_workflow: [],
    marketing_audience: [],
};

export function assessRisk(proposal = {}, eligibility = {}) {
    const factors = [];
    let score = 0;
    const affected = Number(proposal.affectedRecordsEstimate || proposal.sampleSize || 0);
    if (affected >= 500) { score += 3; factors.push('Large estimated affected-record count'); }
    else if (affected >= 50) { score += 2; factors.push('Moderate estimated affected-record count'); }
    else if (affected > 0) { score += 1; factors.push('Small estimated affected-record count'); }

    if (['lead_scoring', 'industry_classification', 'product_recommendation'].includes(proposal.sourceModule)) {
        score += 2;
        factors.push(`Core intelligence module impact: ${proposal.sourceModule}`);
    }
    if (proposal.sourceModule === 'contact_intelligence') {
        score += 2;
        factors.push('Contact privacy impact');
    }
    if (proposal.sourceModule === 'crm_enrichment' || proposal.sourceModule === 'sales_workflow') {
        score += 2;
        factors.push('CRM / workflow integration impact');
    }
    if (proposal.sourceModule === 'knowledge_graph') {
        score += 1;
        factors.push('Knowledge Graph impact');
    }
    if (proposal.sourceModule === 'sales_assistant') {
        score += 1;
        factors.push('AI Sales Assistant impact');
    }
    if (eligibility.conflictedFeedbackCount > 0) {
        score += 2;
        factors.push('Conflicting feedback present');
    }
    if (eligibility.outdatedFeedbackCount > 0) {
        score += 1;
        factors.push('Outdated feedback present');
    }
    if ((proposal.sampleSize || 0) < 10) {
        score += 1;
        factors.push('Low sample size');
    }
    if ((proposal.limitations || []).length === 0) {
        score += 1;
        factors.push('Missing limitations documentation');
    }
    factors.push('Rollback difficulty: future implementation phase must define rollback');
    factors.push('Missing sandbox historical simulation (Phase 22)');

    let riskLevel = 'LOW';
    if (score >= 10) riskLevel = 'CRITICAL';
    else if (score >= 7) riskLevel = 'HIGH';
    else if (score >= 4) riskLevel = 'MEDIUM';

    return {
        riskLevel,
        riskScore: score,
        riskFactors: factors,
        autoApprove: false,
        autoReject: false,
        note: 'Risk informs required reviews only; it does not auto-approve or auto-reject.',
    };
}

export function buildImpactSummary(proposal = {}, eligibility = {}) {
    const deps = MODULE_DEPENDENCIES[proposal.sourceModule] || [];
    return {
        configurationFamily: proposal.proposalType || 'UNKNOWN',
        estimatedAffectedRecords: proposal.affectedRecordsEstimate || proposal.sampleSize || 0,
        estimatedAffectedCompanies: 1,
        modulesDependingOnConfiguration: deps,
        potentialBenefits: proposal.expectedBenefit || 'Improved acceptance / reduced dispute rate after future implementation',
        potentialNegativeEffects: proposal.potentialRisk || 'Incorrect change could harm scoring or recommendations if applied without review',
        missingEvidence: eligibility.reasons || [],
        requiredSandboxTests: [
            'Offline evaluation dataset comparison',
            'Permission and tenant-isolation regression',
            'Module-specific unit tests',
        ],
        requiredRollbackCapability: true,
        historicalSimulationRun: false,
        note: 'Impact analysis is descriptive and read-only. Historical simulation belongs to Phase 22.',
    };
}

export function requiredReviewsFor(proposal, risk, policy) {
    const req = {
        businessReviewRequired: true,
        technicalReviewRequired: true,
        riskReviewRequired: false,
        privacyReviewRequired: false,
        securityReviewRequired: false,
        dataQualityReviewRequired: proposal.proposalType === 'DATA_QUALITY_RULE_DRAFT',
        complianceReviewRequired: false,
    };
    if (policy.requireRiskReviewForHighOrCritical && ['HIGH', 'CRITICAL'].includes(risk.riskLevel)) {
        req.riskReviewRequired = true;
    }
    if (policy.requirePrivacyReviewForContactModules && proposal.sourceModule === 'contact_intelligence') {
        req.privacyReviewRequired = true;
    }
    if (policy.requireSecurityReviewForCritical && risk.riskLevel === 'CRITICAL') {
        req.securityReviewRequired = true;
    }
    return req;
}
