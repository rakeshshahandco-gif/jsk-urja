export const ENGINE_VERSION = 'knowledge-graph-v1';
export const SETTINGS_VERSION = '1.0.0';
export const MODULE = 'data_extractor.knowledge_graph';

export const PERMS = {
    view: `${MODULE}.view`,
    search: `${MODULE}.search`,
    relationships: `${MODULE}.relationships`,
    analytics: `${MODULE}.analytics`,
    export: `${MODULE}.export`,
    manage: `${MODULE}.manage`,
};

export const DISCOVERY_METHODS = [
    'Website', 'Domain', 'Public Company Data', 'Shared Contact', 'Shared GST', 'Shared PAN',
    'Shared Director', 'Shared Address', 'CRM Link', 'Lead Intelligence', 'Manual', 'Imported',
    'AI Suggestion', 'Rules Engine',
];

export const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    engineVersion: ENGINE_VERSION,
    defaultResultLimit: 50,
    maximumResultLimit: 200,
    maximumGraphNodes: 80,
    maximumEvidenceItems: 40,
    minConfidenceToShow: 40,
    autoDiscoverOnRead: false,
    allowExport: true,
};

/** Deterministic confidence contributions by evidence type (capped later). */
export const CONFIDENCE_WEIGHTS = {
    SharedGST: 95,
    SharedDomain: 85,
    SharedWebsite: 85,
    SharedPhone: 80,
    SharedEmail: 75,
    SharedContact: 70,
    SharedAddress: 65,
    SharedIndustry: 55,
    SharedProduct: 60,
    SimilarCompany: 70,
    PotentialDuplicate: 75,
    CrmLinked: 90,
    WorkflowLinked: 80,
    CampaignLinked: 70,
    ProductRecommended: 65,
    LocatedIn: 50,
    PotentialCrossSell: 55,
    Competitor: 45,
};
