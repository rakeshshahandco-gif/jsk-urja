# Phase 1–16 Module Inventory

Workspace: `D:\JSK-DATA-EXTRACTOR-DEV`  
Branch: `feature/data-extractor-serpapi-places`  
Generated: Phase 16.5

| Phase | Module | Primary models | Controller / routes prefix | Key permissions submodule | Frontend page |
|------:|--------|----------------|----------------------------|---------------------------|---------------|
| 1–3 | Extractor / search / import | ExtractorSettings, ExtractorSearchJob, ExtractorImportBatch, ExtractedLead | extractor.controller · `/data-extractor/*` | `extractor` | Home, Keyword, Manual URL, Import, Leads, Preview, Settings |
| 2–4 | Discovery + merge | DiscoveryJob, DiscoverySourceTask, DiscoveryAgentJob, DiscoveryMergeReview | discovery*, discoveryAgent, discoveryMergeReview · `/ai-lead-intelligence` discovery paths | `discovery` | Discovery, Jobs, Agent, Duplicate Review |
| 5–6 | Industry / customer type | AiIndustryMaster, AiCustomerTypeMaster, AiOpportunityMap, AiIndustryClassification, AiClassificationBatchJob | industryClassification · classifications | `lead_intelligence` | Classifications |
| 7 | Lead Relevance | AiLeadRelevance | leadRelevance · relevance | `lead_intelligence` | Relevance |
| 8 | Product Recommendation | AiProductRecommendation, AiProductMaster, batch | productRecommendation · recommendations | `product_recommendation` | Recommendations |
| 9 | Contact Intelligence | AiContactIntelligence, AiContactRoleMaster, batch | contactIntelligence · contacts | `contact_intelligence` | Contacts |
| 10 | Company Intelligence | AiCompanyIntelligenceProfile, batch | companyIntelligence · profiles | `company_intelligence` | Profiles |
| 11 | Lead Scoring | AiLeadScore, batch | leadScoring · scores | `lead_scoring` | Scores |
| 12 | Similar / Market | AiSimilarCompanyResult, AiMarketIntelligence, batch | similarCompany · similar/market | `similar_company`, `market_intelligence` | Similar / Market |
| 13 | CRM Enrichment | AiCrmEnrichmentDraft, Transaction, BatchJob | crmEnrichment · crm-enrichment | `crm_enrichment` | CRM Enrichment |
| 14 | Sales Workflow | AiSalesWorkflowDraft, Transaction, BatchJob | salesWorkflow · sales-workflow | `sales_workflow` | Sales Workflow |
| 15 | Executive Analytics | AiAnalyticsSnapshot, SavedView, Audit | dataExtractorAnalytics · analytics | `analytics` | Executive Analytics |
| 16 | Marketing Intelligence | AiMarketingCampaignDraft, Recipient, BatchJob | marketingIntelligence · marketing-intelligence | `marketing_intelligence` | Marketing Intelligence |

## Cross-cutting

- **Settings nest:** `ExtractorSettings.aiLeadIntelligence.<feature>`
- **Company scope:** `req.companyId` authoritative; body/query `companyId`/`tenantId` rejected on Phase 13–16 controllers
- **Rollback:** Phase 13 CRM enrichment + Phase 14 sales workflow
- **Lock / outdated:** Phases 8–16 intelligence + enrichment + sales + marketing drafts
- **Analytics:** read-only; no provider/AI/CRM mutation
- **Marketing:** draft + handoff only; `executable:false`; no send/execute

## Dependency chain (summary)

Discovery/ExtractedLead → classification/relevance/product/contact/profile/score → similar/market → CRM enrichment → sales workflow → analytics aggregates → marketing audience from real records (not analytics totals).