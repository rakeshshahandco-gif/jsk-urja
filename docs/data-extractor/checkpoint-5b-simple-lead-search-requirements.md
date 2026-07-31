# Checkpoint 5B - Simple Lead Search (Approved Business Requirement)

**Status:** Approved requirement recorded. Implementation starts only after Checkpoint 5 passes and owner confirms.

**Do not** start Checkpoint 5B until Checkpoint 5 compatibility, backend tests, Discovery Agent checks, and local assisted Google capture verification are complete.

**Do not** start Checkpoint 6, website enrichment, commit, push, or deploy without explicit approval.

---

## Primary user experience

Ordinary users must not complete complicated campaign fields.

They enter only:

1. Product / Industry / Requirement (required)
2. City or State (optional)
3. Click **Search & Capture**

Examples:

| Product / Industry | City | State |
|---|---|---|
| Home Automation | Mumbai | |
| Home Automation | | Maharashtra |
| DALI Lighting | Pune | |

CRM automatically handles campaign, queries, sources, and technical settings.

---

## Simple Search form

Visible fields:

- Product / Industry / Requirement - required
- City - optional
- State - optional
- Country - optional; visible default may be India
- **Search & Capture** button
- Advanced Options - link or collapsed section

Do **not** require users to enter:

- Campaign name
- Query type
- Search operators
- Include / exclude keywords
- Provider or API name
- Business-type combinations
- Qualification score
- Maximum jobs per day
- Technical campaign settings

---

## Automatic SearchCampaign

For Product `Home Automation` + City `Mumbai`, create or reuse:

- targetIndustry: Home Automation
- city: Mumbai
- country: India only when selected/defaulted visibly
- sources: Google assisted capture
- minimumQualificationScore: existing approved default
- include keywords generated from the product
- standard exclude keywords for irrelevant results

Suggested campaign name: `Home Automation - Mumbai`

If the same active campaign already exists for the company: safely reuse it, or clearly ask to reuse. Do not create uncontrolled duplicates.

---

## Automatic SearchQuery generation

Controlled first set (about 6-10 queries). Example for Home Automation + Mumbai:

- home automation companies Mumbai
- home automation providers Mumbai
- home automation manufacturers Mumbai
- home automation suppliers Mumbai
- home automation dealers Mumbai
- home automation distributors Mumbai
- home automation system integrators Mumbai
- smart home companies Mumbai
- lighting automation companies Mumbai

Safe Google exclusions where useful: `-jobs` `-course` `-training` `-DIY`

User must see and select a generated query before Google opens. Do not ask users to type operators. Do not generate hundreds of repetitive queries.

### City / State behavior

- City only: prioritize city queries; optional later state/India query
- State only: state-level searches
- City + State: use both naturally; avoid duplicate location text
- Neither: broader India searches only when India is visibly selected; do not silently infer country in backend

### Example generated queries

- `home automation providers Mumbai -jobs -course -training`
- `smart switch manufacturers Gujarat -jobs -course -training`
- `DALI system integrators Bengaluru -jobs -course -training`

---

## Search & Capture flow

1. Enter Product / Industry
2. Optional City or State
3. Click Search & Capture
4. CRM creates or reuses campaign
5. CRM generates queries
6. User selects one query (or recommended first)
7. Existing Discovery Agent opens Google visibly
8. User reviews and scrolls manually
9. User clicks Capture Visible Results
10. Results go through existing RawCapture ingestion
11. Duplicate visible results are not stored twice
12. Results appear in a simple table

Must not: require paid Google/SerpAPI/CSE/Places; autonomous scraping; CAPTCHA bypass; auto-scroll or auto-click pagination.

Architecture (reuse existing): SearchCampaign -> SearchQuery -> AssistedCaptureSession -> RawCapture

Do not create a second Data Extractor engine.

---

## Captured result table (CP5B)

Show now: Company/result title, Website URL, Domain, Search snippet, Search position, Source, Query used, Capture status, Duplicate status, Captured date.

Later checkpoints may add email, phone, WhatsApp, address, products, business type, AI relevance. Do not invent those before enrichment/qualification exist.

---

## Limit rules (assisted visible capture)

Must not inherit legacy API-search limits: maxJobsPerDay, maxResultsPerSearch, Google CSE / SerpAPI / Places quotas.

Assisted rules:

- no default daily 100-record limit
- max 100 records per explicit capture event (technical safety)
- multiple explicit capture events allowed
- repeated results deduplicated
- future daily assisted limit value 0 means unlimited
- user must not see provider API quota for this workflow

---

## Advanced Options (collapsed)

May include: business type, include/exclude keywords, country, number of generated queries, query selection, results-per-capture safety limit, campaign selection, source.

---

## Business-type auto variations (controlled)

Consider where relevant: Company, Provider, Manufacturer, Supplier, Dealer, Distributor, OEM, Exporter, System Integrator, Consultant.

Do not append every type to every query. Use controlled ranking.

---

## Non-regression

Do not disturb: SearchCampaign backend, SearchQuery engine, RawCapture identity/ingestion, import adapters, Discovery Agent security, existing Keyword Search, legacy API-provider settings, Data Extractor permissions, CRM Lead / ExtractedLead, website enrichment, AI/Ollama, WhatsApp, global sidebar, production, Render.

---

## Implementation order

1. Finish Checkpoint 5 compatibility and regression
2. Complete local manual Google capture test
3. Stop and report Checkpoint 5 results
4. Implement Checkpoint 5B Simple Lead Search localhost screen
5. Test: Product Home Automation, City Mumbai
6. Provide exact localhost startup and testing instructions
7. Do not start website enrichment until owner approves this screen

---

## Checkpoint 5B success criteria

Owner can:

1. Open Data Extractor locally
2. Enter Home Automation + Mumbai
3. Click Search & Capture
4. See generated Google queries
5. Open the recommended query
6. Scroll Google manually
7. Click Capture Visible Results
8. See captured data in CRM
9. Capture again without duplicate records
10. Confirm no CRM Lead is auto-created
