/**
 * Tests: merge unique contacts for confirmed same-company duplicates.
 * Original enrichment objects must remain unchanged.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    confirmSameCompanyIdentity,
    groupConfirmedDuplicateEnrichments,
    mergeContactsForDuplicateGroup,
    normalizeEmailKey,
    normalizePhoneKey,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/duplicateContactMerge.util.js';
import { buildGenuinenessWorkbook } from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/rawCaptureGenuineness.export.service.js';

function enrich(partial) {
    return {
        _id: partial._id,
        companyName: partial.companyName || 'SmarDen',
        canonicalDomain: partial.canonicalDomain || 'smarden.in',
        websiteUrl: partial.websiteUrl || 'https://smarden.in/',
        city: partial.city || 'Mumbai',
        state: partial.state || 'Maharashtra',
        phones: partial.phones || [],
        whatsappNumbers: partial.whatsappNumbers || [],
        emails: partial.emails || [],
        contactPersons: partial.contactPersons || [],
        addresses: partial.addresses || [],
        facebook: partial.facebook || {},
        instagram: partial.instagram || {},
        linkedin: partial.linkedin || {},
        productsServices: partial.productsServices || [],
        gstin: partial.gstin || '',
        createdAt: new Date('2026-01-01'),
        lastEnrichedAt: new Date('2026-01-02'),
        ...partial,
    };
}

describe('duplicateContactMerge util', () => {
    it('same company with two different phones combines both phones', () => {
        const a = enrich({
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            phones: [
                { original: '9876543210', normalized: '+919876543210', sourceUrl: 'https://smarden.in/contact', confidence: 'verified_from_tel_link' },
            ],
        });
        const b = enrich({
            _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            phones: [
                { original: '9123456780', normalized: '+919123456780', sourceUrl: 'https://smarden.in/about', confidence: 'visible_labelled_phone' },
            ],
        });
        const snapshotA = JSON.stringify(a);
        const merged = mergeContactsForDuplicateGroup([a, b]);
        assert.equal(merged.phones.all.length, 2);
        assert.equal(JSON.stringify(a), snapshotA); // originals unchanged
        assert.ok(merged.contactSummary.allPhones || merged.phones.allValuesJoined.includes('9876543210'));
        assert.ok(merged.phones.allValuesJoined.includes('9123456780'));
    });

    it('same company with three different emails combines all unique emails', () => {
        const a = enrich({
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            emails: [{ value: 'sales@smarden.in', sourceUrl: 'https://smarden.in/contact', kind: 'sales' }],
        });
        const b = enrich({
            _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            emails: [{ value: 'info@smarden.in', sourceUrl: 'https://smarden.in/', kind: 'enquiry' }],
        });
        const c = enrich({
            _id: 'cccccccccccccccccccccccc',
            emails: [{ value: 'support@smarden.in', sourceUrl: 'https://smarden.in/support', kind: 'support' }],
        });
        const merged = mergeContactsForDuplicateGroup([a, b, c]);
        assert.equal(merged.emails.all.length, 3);
        assert.match(merged.emails.allValuesJoined, /sales@smarden\.in/);
        assert.match(merged.emails.allValuesJoined, /info@smarden\.in/);
        assert.match(merged.emails.allValuesJoined, /support@smarden\.in/);
    });

    it('same phone in different formats appears only once', () => {
        assert.equal(normalizePhoneKey('+91 98765 43210'), normalizePhoneKey('9876543210'));
        const a = enrich({
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            phones: [
                { original: '+91 98765 43210', normalized: '+919876543210', sourceUrl: 'https://a.example/c1', confidence: 'verified_from_tel_link' },
                { original: '9876543210', normalized: '+919876543210', sourceUrl: 'https://a.example/c2', confidence: 'visible_labelled_phone' },
            ],
        });
        const merged = mergeContactsForDuplicateGroup([a]);
        assert.equal(merged.phones.all.length, 1);
        assert.equal(merged.phones.primary.sourceUrl, 'https://a.example/c1');
    });

    it('same email with different letter case appears only once', () => {
        assert.equal(normalizeEmailKey('Sales@Smarden.IN'), 'sales@smarden.in');
        const a = enrich({
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            emails: [
                { value: 'Sales@Smarden.IN', sourceUrl: 'https://smarden.in/a' },
                { value: 'sales@smarden.in', sourceUrl: 'https://smarden.in/b' },
            ],
        });
        const merged = mergeContactsForDuplicateGroup([a]);
        assert.equal(merged.emails.all.length, 1);
    });

    it('different contacts retain their individual evidence URLs', () => {
        const a = enrich({
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            phones: [
                { original: '9876543210', normalized: '+919876543210', sourceUrl: 'https://smarden.in/sales', confidence: 'verified_from_tel_link' },
            ],
            emails: [{ value: 'sales@smarden.in', sourceUrl: 'https://smarden.in/sales' }],
        });
        const b = enrich({
            _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            phones: [
                { original: '9123456780', normalized: '+919123456780', sourceUrl: 'https://smarden.in/support', confidence: 'visible_labelled_phone' },
            ],
            emails: [{ value: 'support@smarden.in', sourceUrl: 'https://smarden.in/support' }],
        });
        const merged = mergeContactsForDuplicateGroup([a, b]);
        const phoneUrls = merged.phones.all.map((p) => p.sourceUrl).sort();
        const emailUrls = merged.emails.all.map((e) => e.sourceUrl).sort();
        assert.deepEqual(phoneUrls, ['https://smarden.in/sales', 'https://smarden.in/support']);
        assert.deepEqual(emailUrls, ['https://smarden.in/sales', 'https://smarden.in/support']);
    });

    it('conflicting company identities are not merged automatically', () => {
        const a = enrich({
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            companyName: 'SmarDen',
            canonicalDomain: 'smarden.in',
            city: 'Mumbai',
            phones: [{ original: '9876543210', normalized: '+919876543210', sourceUrl: 'https://smarden.in', confidence: 'verified_from_tel_link' }],
        });
        const b = enrich({
            _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            companyName: 'SmarDen',
            canonicalDomain: 'otherbrand.com',
            city: 'Mumbai',
            phones: [{ original: '9000000001', normalized: '+919000000001', sourceUrl: 'https://otherbrand.com', confidence: 'verified_from_tel_link' }],
        });
        const verdict = confirmSameCompanyIdentity(a, b);
        assert.equal(verdict.confirmed, false);
        assert.equal(verdict.conflict, true);
        const { groups, conflicts } = groupConfirmedDuplicateEnrichments([a, b]);
        assert.equal(groups.length, 2);
        assert.ok(conflicts.length >= 1);
        assert.match(conflicts[0].label, /Possible Duplicate — Owner Review/);
    });

    it('same domain confirms merge and combines contacts', () => {
        const a = enrich({
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            phones: [{ original: '9876543210', normalized: '+919876543210', sourceUrl: 'https://smarden.in/a', confidence: 'verified_from_tel_link' }],
        });
        const b = enrich({
            _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            emails: [{ value: 'info@smarden.in', sourceUrl: 'https://smarden.in/b' }],
            whatsappNumbers: [{ original: '9988776655', normalized: '+919988776655', sourceUrl: 'https://smarden.in/wa', confidence: 'visible_labelled_phone', labelledWhatsApp: true }],
        });
        assert.equal(confirmSameCompanyIdentity(a, b).confirmed, true);
        const merged = mergeContactsForDuplicateGroup([a, b]);
        assert.equal(merged.phones.all.length, 1);
        assert.equal(merged.emails.all.length, 1);
        assert.equal(merged.whatsapp.all.length, 1);
    });

    it('Final Verified Excel shows one company row with all unique contacts', async () => {
        const enA = enrich({
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            phones: [{ original: '9876543210', normalized: '+919876543210', sourceUrl: 'https://smarden.in/a', confidence: 'verified_from_tel_link' }],
            emails: [{ value: 'sales@smarden.in', sourceUrl: 'https://smarden.in/a' }],
        });
        const enB = enrich({
            _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            phones: [{ original: '9123456780', normalized: '+919123456780', sourceUrl: 'https://smarden.in/b', confidence: 'visible_labelled_phone' }],
            emails: [{ value: 'info@smarden.in', sourceUrl: 'https://smarden.in/b' }],
        });
        const qA = { _id: 'qa', enrichmentId: enA._id, systemDecision: 'strong_match', relevanceScore: 90, companyName: 'SmarDen' };
        const qB = { _id: 'qb', enrichmentId: enB._id, systemDecision: 'strong_match', relevanceScore: 88, companyName: 'SmarDen' };
        const gA = {
            _id: 'ga',
            qualificationId: qA._id,
            enrichmentId: enA._id,
            companyName: 'SmarDen',
            websiteUrl: 'https://smarden.in/',
            systemDecision: 'verified_genuine',
            genuinenessScore: 92,
            genuinenessConfidence: 'high',
            verificationReason: 'ok',
            positiveSignals: [],
            warningSignals: [],
            conflictingEvidence: [],
            evidenceUrls: [],
        };
        const gB = {
            ...gA,
            _id: 'gb',
            qualificationId: qB._id,
            enrichmentId: enB._id,
            genuinenessScore: 80,
        };

        const beforeA = JSON.stringify(enA);
        const buf = await buildGenuinenessWorkbook({
            genuinenessRecords: [gA, gB],
            qualifications: [qA, qB],
            enrichments: [enA, enB],
            summary: { verifiedGenuineCount: 2 },
        });
        assert.equal(JSON.stringify(enA), beforeA);

        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const sheet = wb.getWorksheet('Verified Genuine');
        assert.ok(sheet);
        // header + one merged company row
        assert.equal(sheet.rowCount, 2);
        const headers = sheet.getRow(1).values.slice(1).map(String);
        assert.ok(headers.includes('Primary Phone'));
        assert.ok(headers.includes('All Phone Numbers'));
        assert.ok(headers.includes('Primary Email'));
        assert.ok(headers.includes('All Email Addresses'));
        const row = sheet.getRow(2);
        const allPhonesIdx = headers.indexOf('All Phone Numbers') + 1;
        const allEmailsIdx = headers.indexOf('All Email Addresses') + 1;
        const phonesCell = String(row.getCell(allPhonesIdx).value || '');
        const emailsCell = String(row.getCell(allEmailsIdx).value || '');
        assert.match(phonesCell, /9876543210/);
        assert.match(phonesCell, /9123456780/);
        assert.match(emailsCell, /sales@smarden\.in/);
        assert.match(emailsCell, /info@smarden\.in/);
    });
});
