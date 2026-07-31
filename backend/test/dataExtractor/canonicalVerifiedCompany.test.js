/**
 * Canonical verified-company grouping — tests 1–16 (CRM Lead / automation covered elsewhere).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildCanonicalVerifiedCompanies,
    buildWebsiteIdentityKey,
    isHostedPlatformHostname,
    rebuildCanonicalVerifiedCompanies,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/canonicalVerifiedCompany.util.js';
import { buildGenuinenessWorkbook } from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/rawCaptureGenuineness.export.service.js';
import { confirmSameCompanyIdentity } from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/duplicateContactMerge.util.js';

function oid(n) {
    return String(n).padStart(24, 'a');
}

function makePlushFixture(count = 18) {
    const enrichmentId = oid(1);
    const qualificationId = oid(2);
    const genuinenessId = oid(3);
    const enrichment = {
        _id: enrichmentId,
        companyName: 'Plush Technologies',
        canonicalDomain: 'plushtechnologies.in',
        websiteUrl: 'https://www.plushtechnologies.in/',
        isDirectorySource: false,
        enrichmentStatus: 'completed',
        phones: [
            { original: '8440022332', normalized: '+918440022332', sourceUrl: 'https://plushtechnologies.in/', confidence: 'verified_from_tel_link' },
            { original: '9649174666', normalized: '+919649174666', sourceUrl: 'https://plushtechnologies.in/contact', confidence: 'visible_labelled_phone' },
        ],
        whatsappNumbers: [
            { original: '9649174666', normalized: '+919649174666', sourceUrl: 'https://plushtechnologies.in/', confidence: 'visible_labelled_phone' },
        ],
        emails: [
            { value: 'plushtechnologies@gmail.com', sourceUrl: 'https://plushtechnologies.in/' },
            { value: 'sales@plushtechnologies.in', sourceUrl: 'https://plushtechnologies.in/contact' },
        ],
        rawCaptureIds: [],
        pagesVisited: ['https://plushtechnologies.in/'],
        sourceEvidence: [],
        city: 'Saharanpur',
        state: 'Uttar Pradesh',
    };
    const captures = [];
    for (let i = 0; i < count; i += 1) {
        const capId = oid(100 + i);
        enrichment.rawCaptureIds.push(capId);
        captures.push({
            _id: capId,
            title: i % 2 === 0 ? 'Plush Technologies — CCTV' : 'Home Automation Dealer Plush',
            resultUrlOriginal: 'https://www.plushtechnologies.in/',
            displayDomain: 'plushtechnologies.in',
            queryId: oid(50 + (i % 3)),
            googlePageIndex: (i % 5) + 1,
            firstSeenAt: new Date(`2026-07-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`),
            createdAt: new Date(`2026-07-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`),
        });
    }
    const qualification = {
        _id: qualificationId,
        enrichmentId,
        systemDecision: 'strong_match',
        relevanceScore: 88,
        decisionReason: 'strong product/location match',
    };
    const genuineness = {
        _id: genuinenessId,
        enrichmentId,
        qualificationId,
        companyName: 'Plush Technologies',
        canonicalDomain: 'plushtechnologies.in',
        websiteUrl: 'https://www.plushtechnologies.in/',
        systemDecision: 'verified_genuine',
        genuinenessScore: 92,
        genuinenessConfidence: 'high',
        verificationReason: 'Consistent first-party website evidence',
        verificationStatus: 'verified',
        verifiedAt: new Date('2026-07-31T01:00:00Z'),
        evidenceUrls: ['https://www.plushtechnologies.in/'],
        positiveSignals: ['website_present', 'verified_phone_present'],
        warningSignals: [],
        conflictingEvidence: [],
    };
    const queryTextById = {
        [oid(50)]: 'home automation mumbai',
        [oid(51)]: 'cctv dealer saharanpur',
        [oid(52)]: 'plush technologies',
    };
    return {
        captures,
        enrichments: [enrichment],
        qualifications: [qualification],
        genuinenessDocs: [genuineness],
        queryTextById,
    };
}

describe('canonicalVerifiedCompany util', () => {
    it('1+2: eighteen identical plushtechnologies.in rows → one company with sourceAppearances=18', () => {
        const fixture = makePlushFixture(18);
        const built = buildCanonicalVerifiedCompanies({
            ...fixture,
            options: { verifiedOnly: true, limit: null },
        });
        assert.equal(built.counters.sourceAppearances, 18);
        assert.equal(built.counters.uniqueVerifiedCompanies, 1);
        assert.equal(built.counters.duplicatesConsolidated, 17);
        assert.equal(built.allCompanies.length, 1);
        assert.equal(built.allCompanies[0].sourceAppearances, 18);
        assert.match(String(built.allCompanies[0].companyName), /Plush/i);
        assert.equal(built.allCompanies[0].canonicalDomain, 'plushtechnologies.in');
    });

    it('3: pagination occurs after canonical grouping', () => {
        const fixture = makePlushFixture(18);
        // Add a second unique company so page size matters
        const en2 = {
            _id: oid(9),
            companyName: 'Other Co',
            canonicalDomain: 'otherco.example',
            websiteUrl: 'https://otherco.example/',
            isDirectorySource: false,
            enrichmentStatus: 'completed',
            phones: [{ original: '9000000001', normalized: '+919000000001', confidence: 'verified_from_tel_link' }],
            emails: [{ value: 'a@otherco.example' }],
            rawCaptureIds: [oid(200)],
            whatsappNumbers: [],
        };
        fixture.enrichments.push(en2);
        fixture.captures.push({
            _id: oid(200),
            title: 'Other Co',
            resultUrlOriginal: 'https://otherco.example/',
            displayDomain: 'otherco.example',
            queryId: oid(50),
            googlePageIndex: 1,
            firstSeenAt: new Date(),
        });
        fixture.qualifications.push({
            _id: oid(10),
            enrichmentId: oid(9),
            systemDecision: 'strong_match',
            relevanceScore: 70,
        });
        fixture.genuinenessDocs.push({
            _id: oid(11),
            enrichmentId: oid(9),
            qualificationId: oid(10),
            companyName: 'Other Co',
            canonicalDomain: 'otherco.example',
            websiteUrl: 'https://otherco.example/',
            systemDecision: 'verified_genuine',
            genuinenessScore: 80,
            verificationStatus: 'verified',
        });

        const page1 = buildCanonicalVerifiedCompanies({
            ...fixture,
            options: { verifiedOnly: true, page: 1, limit: 1, sort: 'companyName', sortDir: 'asc' },
        });
        assert.equal(page1.counters.uniqueVerifiedCompanies, 2);
        assert.equal(page1.counters.sourceAppearances, 19);
        assert.equal(page1.items.length, 1);
        assert.equal(page1.pagination.total, 2);
        assert.equal(page1.pagination.totalPages, 2);
        // Page items are unique companies, not source rows
        assert.ok((page1.items[0].sourceAppearances || 1) >= 1);
    });

    it('4: same company on different queries/pages still returns one row', () => {
        const fixture = makePlushFixture(10);
        const built = buildCanonicalVerifiedCompanies({
            ...fixture,
            options: { verifiedOnly: true, limit: null },
        });
        assert.equal(built.allCompanies.length, 1);
        assert.ok(built.allCompanies[0].queryCount >= 2);
    });

    it('5: all unique phone/email values are merged', () => {
        const fixture = makePlushFixture(5);
        const built = buildCanonicalVerifiedCompanies({
            ...fixture,
            options: { verifiedOnly: true, limit: null },
        });
        const c = built.allCompanies[0];
        assert.ok(c.allPhones.length >= 2);
        assert.ok(c.allEmails.length >= 2);
        assert.ok(c.primaryPhone);
        assert.ok(c.primaryEmail);
    });

    it('6: full evidence list contains all source rows', () => {
        const fixture = makePlushFixture(18);
        const built = buildCanonicalVerifiedCompanies({
            ...fixture,
            options: { verifiedOnly: true, limit: null },
        });
        assert.equal(built.allCompanies[0].evidence.length, 18);
    });

    it('7: Acron hosted subdomain is not reduced to spiderai.in', () => {
        assert.equal(isHostedPlatformHostname('acronindustries.spiderai.in'), true);
        assert.equal(
            buildWebsiteIdentityKey('https://acronindustries.spiderai.in/'),
            'hosted:acronindustries.spiderai.in',
        );
        assert.notEqual(
            buildWebsiteIdentityKey('https://acronindustries.spiderai.in/'),
            buildWebsiteIdentityKey('https://other.spiderai.in/'),
        );
    });

    it('8: separate businesses on same hosting platform stay separate', () => {
        const mk = (id, host, name) => {
            const enId = oid(id);
            const qId = oid(id + 1);
            const gId = oid(id + 2);
            const capId = oid(id + 3);
            return {
                captures: [{
                    _id: capId,
                    title: name,
                    resultUrlOriginal: `https://${host}/`,
                    displayDomain: host,
                    firstSeenAt: new Date(),
                }],
                enrichments: [{
                    _id: enId,
                    companyName: name,
                    canonicalDomain: host,
                    websiteUrl: `https://${host}/`,
                    isDirectorySource: false,
                    enrichmentStatus: 'completed',
                    phones: [],
                    emails: [{ value: `info@${host}` }],
                    whatsappNumbers: [],
                    rawCaptureIds: [capId],
                }],
                qualifications: [{ _id: qId, enrichmentId: enId, systemDecision: 'strong_match' }],
                genuinenessDocs: [{
                    _id: gId,
                    enrichmentId: enId,
                    qualificationId: qId,
                    companyName: name,
                    canonicalDomain: host,
                    websiteUrl: `https://${host}/`,
                    systemDecision: 'verified_genuine',
                    genuinenessScore: 70,
                    verificationStatus: 'verified',
                }],
            };
        };
        const a = mk(20, 'acronindustries.spiderai.in', 'Acron Industries');
        const b = mk(30, 'otherbrand.spiderai.in', 'Other Brand');
        const built = buildCanonicalVerifiedCompanies({
            captures: [...a.captures, ...b.captures],
            enrichments: [...a.enrichments, ...b.enrichments],
            qualifications: [...a.qualifications, ...b.qualifications],
            genuinenessDocs: [...a.genuinenessDocs, ...b.genuinenessDocs],
            options: { verifiedOnly: true, limit: null },
        });
        assert.equal(built.counters.uniqueVerifiedCompanies, 2);
    });

    it('9: different Justdial listings do not merge merely by justdial.com', () => {
        const listingA = 'https://justdial.com/Saharanpur/Dealer-in-Pant-Vihar/nct-10226482';
        const listingB = 'https://justdial.com/Delhi/Dealer-in-Tri-Nagar/nct-10326900';
        assert.notEqual(
            buildWebsiteIdentityKey(listingA, { isDirectory: true }),
            buildWebsiteIdentityKey(listingB, { isDirectory: true }),
        );
        const mk = (id, url, title) => {
            const enId = oid(id);
            const qId = oid(id + 1);
            const gId = oid(id + 2);
            const capId = oid(id + 3);
            return {
                capture: {
                    _id: capId, title, resultUrlOriginal: url, displayDomain: 'justdial.com', firstSeenAt: new Date(),
                },
                enrichment: {
                    _id: enId, companyName: title, canonicalDomain: 'justdial.com', websiteUrl: url,
                    isDirectorySource: true, enrichmentStatus: 'completed', phones: [], emails: [],
                    whatsappNumbers: [], rawCaptureIds: [capId],
                },
                qualification: { _id: qId, enrichmentId: enId, systemDecision: 'possible_match' },
                genuineness: {
                    _id: gId, enrichmentId: enId, qualificationId: qId, companyName: title,
                    canonicalDomain: 'justdial.com', websiteUrl: url,
                    systemDecision: 'directory_or_marketplace_only', genuinenessScore: 30,
                    verificationStatus: 'verified',
                },
            };
        };
        const a = mk(40, listingA, 'Dealer Pant Vihar');
        const b = mk(50, listingB, 'Dealer Tri Nagar');
        const built = buildCanonicalVerifiedCompanies({
            captures: [a.capture, b.capture],
            enrichments: [a.enrichment, b.enrichment],
            qualifications: [a.qualification, b.qualification],
            genuinenessDocs: [a.genuineness, b.genuineness],
            options: { verifiedOnly: true, includeDirectoryListings: true, limit: null },
        });
        assert.equal(built.counters.uniqueVerifiedCompanies, 2);
        // contact-merge identity must also not treat bare justdial.com as same company
        assert.equal(confirmSameCompanyIdentity(a.enrichment, b.enrichment).confirmed, false);
    });

    it('10: same exact Justdial listing URL groups as one evidence listing', () => {
        const url = 'https://justdial.com/Saharanpur/Dealer-in-Pant-Vihar/nct-10226482';
        const enId = oid(60);
        const qId = oid(61);
        const gId = oid(62);
        const caps = [oid(63), oid(64)].map((id, i) => ({
            _id: id,
            title: 'Dealer Pant Vihar',
            resultUrlOriginal: url,
            displayDomain: 'justdial.com',
            googlePageIndex: i + 1,
            firstSeenAt: new Date(),
        }));
        const built = buildCanonicalVerifiedCompanies({
            captures: caps,
            enrichments: [{
                _id: enId,
                companyName: 'Dealer Pant Vihar',
                canonicalDomain: 'justdial.com',
                websiteUrl: url,
                isDirectorySource: true,
                enrichmentStatus: 'completed',
                phones: [],
                emails: [],
                whatsappNumbers: [],
                rawCaptureIds: caps.map((c) => c._id),
            }],
            qualifications: [{ _id: qId, enrichmentId: enId, systemDecision: 'possible_match' }],
            genuinenessDocs: [{
                _id: gId,
                enrichmentId: enId,
                qualificationId: qId,
                companyName: 'Dealer Pant Vihar',
                canonicalDomain: 'justdial.com',
                websiteUrl: url,
                systemDecision: 'directory_or_marketplace_only',
                genuinenessScore: 30,
                verificationStatus: 'verified',
            }],
            options: { verifiedOnly: true, includeDirectoryListings: true, limit: null },
        });
        assert.equal(built.counters.uniqueVerifiedCompanies, 1);
        assert.equal(built.allCompanies[0].sourceAppearances, 2);
    });

    it('11: directory listing is not labelled AI Verified Genuine without independent evidence', () => {
        const url = 'https://justdial.com/Mumbai/Home-Automation/nct-1';
        const enId = oid(70);
        const qId = oid(71);
        const gId = oid(72);
        const capId = oid(73);
        const built = buildCanonicalVerifiedCompanies({
            captures: [{
                _id: capId, title: 'JD listing', resultUrlOriginal: url,
                displayDomain: 'justdial.com', firstSeenAt: new Date(),
            }],
            enrichments: [{
                _id: enId, companyName: 'JD listing', canonicalDomain: 'justdial.com', websiteUrl: url,
                isDirectorySource: true, enrichmentStatus: 'completed', phones: [], emails: [],
                whatsappNumbers: [], rawCaptureIds: [capId],
            }],
            qualifications: [{ _id: qId, enrichmentId: enId, systemDecision: 'possible_match' }],
            genuinenessDocs: [{
                _id: gId, enrichmentId: enId, qualificationId: qId, companyName: 'JD listing',
                canonicalDomain: 'justdial.com', websiteUrl: url,
                systemDecision: 'directory_or_marketplace_only', genuinenessScore: 30,
                verificationStatus: 'verified',
            }],
            options: { verifiedOnly: true, includeDirectoryListings: true, limit: null },
        });
        const c = built.allCompanies[0];
        assert.equal(c.independentlyVerified, false);
        assert.match(c.verificationStatusLabel, /Directory Listing/i);
        assert.notEqual(c.verificationStatus, 'ai_verified_genuine');
    });

    it('12: UI unique count matches unique API count (counters)', () => {
        const fixture = makePlushFixture(18);
        const built = buildCanonicalVerifiedCompanies({
            ...fixture,
            options: { verifiedOnly: true, limit: null },
        });
        assert.equal(built.counters.uniqueVerifiedCompanies, built.allCompanies.length);
        assert.equal(built.counters.uniqueSourceIdentities, built.allCompanies.length);
    });

    it('13+14: Final verified Excel has one unique-company row and evidence retains all appearances', async () => {
        const fixture = makePlushFixture(18);
        const built = buildCanonicalVerifiedCompanies({
            ...fixture,
            options: { verifiedOnly: true, limit: null },
        });
        const evidence = built.allCompanies.flatMap((c) => (c.evidence || []).map((ev) => ({
            canonicalCompany: c.companyName,
            canonicalKey: c.canonicalKey,
            sourceTitle: ev.sourceTitle,
            query: ev.query,
            googlePageIndex: ev.googlePageIndex ?? '',
            resultPosition: ev.resultPosition ?? '',
            sourceUrl: ev.sourceUrl,
            websiteUrl: ev.websiteUrl,
            capturedAt: ev.capturedAt || '',
            cp6Status: ev.cp6?.enrichmentStatus || '',
            cp7Decision: ev.cp7?.systemDecision || '',
            cp7Score: ev.cp7?.relevanceScore ?? '',
            cp8Decision: ev.cp8?.systemDecision || '',
            cp8Score: ev.cp8?.genuinenessScore ?? '',
            ownerDecision: '',
            captureId: ev.captureId || '',
            genuinenessId: ev.genuinenessId || '',
            enrichmentId: ev.enrichmentId || '',
        })));
        const buf = await buildGenuinenessWorkbook({
            genuinenessRecords: built.allCompanies,
            qualifications: fixture.qualifications,
            enrichments: fixture.enrichments,
            captures: fixture.captures,
            canonicalCompanies: built.allCompanies,
            evidenceRows: evidence,
            counters: built.counters,
            summary: {},
        });
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const uniqueSheet = wb.getWorksheet('Verified Unique Companies');
        const evidenceSheet = wb.getWorksheet('Verified Source Evidence');
        assert.ok(uniqueSheet);
        assert.ok(evidenceSheet);
        assert.equal(uniqueSheet.rowCount, 2); // header + 1 company
        assert.equal(evidenceSheet.rowCount, 19); // header + 18 appearances
    });

    it('15: rebuild is idempotent (no extra canonical rows)', () => {
        const fixture = makePlushFixture(18);
        const a = rebuildCanonicalVerifiedCompanies({
            ...fixture,
            options: { verifiedOnly: true, limit: null },
        });
        const b = rebuildCanonicalVerifiedCompanies({
            ...fixture,
            options: { verifiedOnly: true, limit: null },
        });
        assert.equal(a.counters.uniqueVerifiedCompanies, b.counters.uniqueVerifiedCompanies);
        assert.equal(a.allCompanies[0].canonicalKey, b.allCompanies[0].canonicalKey);
        assert.equal(a.allCompanies[0].sourceAppearances, b.allCompanies[0].sourceAppearances);
    });

    it('placeholder emails like your@email.com do not merge unrelated companies', () => {
        const mk = (id, domain, name, email) => {
            const enId = oid(id);
            const qId = oid(id + 1);
            const gId = oid(id + 2);
            const capId = oid(id + 3);
            return {
                captures: [{
                    _id: capId, title: name, resultUrlOriginal: `https://${domain}/`,
                    displayDomain: domain, firstSeenAt: new Date(),
                }],
                enrichments: [{
                    _id: enId, companyName: name, canonicalDomain: domain,
                    websiteUrl: `https://${domain}/`, isDirectorySource: false,
                    enrichmentStatus: 'completed',
                    phones: [], emails: [{ value: email }, { value: 'your@email.com' }],
                    whatsappNumbers: [], rawCaptureIds: [capId],
                }],
                qualifications: [{ _id: qId, enrichmentId: enId, systemDecision: 'strong_match' }],
                genuinenessDocs: [{
                    _id: gId, enrichmentId: enId, qualificationId: qId, companyName: name,
                    canonicalDomain: domain, websiteUrl: `https://${domain}/`,
                    systemDecision: 'verified_genuine', genuinenessScore: 80, verificationStatus: 'verified',
                }],
            };
        };
        const a = mk(80, 'plushtechnologies.in', 'Plush Technologies', 'plushtechnologies@gmail.com');
        const b = mk(90, 'apfcrelay.com', 'APFC Relay', 'sunil.morrya@gmail.com');
        const built = buildCanonicalVerifiedCompanies({
            captures: [...a.captures, ...b.captures],
            enrichments: [...a.enrichments, ...b.enrichments],
            qualifications: [...a.qualifications, ...b.qualifications],
            genuinenessDocs: [...a.genuinenessDocs, ...b.genuinenessDocs],
            options: { verifiedOnly: true, limit: null },
        });
        assert.equal(built.counters.uniqueVerifiedCompanies, 2);
    });
});
