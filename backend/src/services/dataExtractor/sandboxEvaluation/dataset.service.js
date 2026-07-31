import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AiLearningEvaluationDataset } from '../../../models/aiLearningEvaluationDataset.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { notDeleted, assertNoSecrets } from './normalize.util.js';

/**
 * Load approved dataset rows read-only. Never mutates source collections.
 */
export async function loadDatasetRows(companyId, datasetId, options = {}) {
    if (!datasetId && options.syntheticRows?.length) {
        const rows = options.syntheticRows.map((r, i) => ({
            ...r,
            _datasetKind: 'SYNTHETIC',
            _rowId: r.id || `synthetic-${i}`,
        }));
        assertNoSecrets(rows);
        return {
            kind: 'SYNTHETIC',
            dataset: null,
            rows,
            checksum: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
            redactionLevel: 'STRICT',
        };
    }

    const dataset = await AiLearningEvaluationDataset.findOne({
        _id: datasetId, companyId, ...notDeleted(),
    }).lean();
    if (!dataset) throw new ApiError(404, 'Dataset not found for this company');
    if (!['READY', 'EXPORTED', 'DRAFT'].includes(dataset.status)) {
        throw new ApiError(400, `Dataset status ${dataset.status} not usable`);
    }

    let rows = [];
    if (dataset.storageKind === 'LOCAL_FILE' && dataset.storageReference) {
        const raw = await fs.readFile(dataset.storageReference, 'utf8');
        const checksum = createHash('sha256').update(raw || '').digest('hex');
        if (options.expectedChecksum && options.expectedChecksum !== checksum && options.expectedChecksum !== dataset.checksum) {
            throw new ApiError(400, 'Dataset checksum mismatch');
        }
        if (dataset.checksum && checksum !== dataset.checksum && options.requireChecksum !== false) {
            // Prefer stored checksum match when file still present
            if (options.expectedChecksum && options.expectedChecksum !== dataset.checksum) {
                throw new ApiError(400, 'Dataset checksum mismatch');
            }
        }
        rows = raw.split('\n').filter(Boolean).map((line, i) => {
            try {
                return { ...JSON.parse(line), _rowId: `ds-${i}`, _datasetKind: 'PHASE19_DATASET' };
            } catch {
                return null;
            }
        }).filter(Boolean);
    } else if (options.fixtureRows?.length) {
        rows = options.fixtureRows.map((r, i) => ({ ...r, _rowId: `fix-${i}`, _datasetKind: 'FIXTURE' }));
    }

    if (options.maxRows) rows = rows.slice(0, options.maxRows);
    assertNoSecrets(rows);
    return {
        kind: dataset.storageKind === 'LOCAL_FILE' ? 'PHASE19_DATASET' : 'FIXTURE',
        dataset,
        rows,
        checksum: dataset.checksum,
        redactionLevel: dataset.redactionLevel || 'STRICT',
    };
}

export function buildSyntheticFixture(familyCode) {
    // Deterministic synthetic rows marked SYNTHETIC for sandbox only
    if (familyCode.startsWith('LEAD_SCORE') || familyCode === 'LEAD_PRIORITY_BANDS') {
        return [
            { id: 's1', fit: 0.9, intent: 0.8, groundTruth: { priority: 'HIGH', score: 85 }, groundTruthType: 'REVIEWER_CONSENSUS' },
            { id: 's2', fit: 0.4, intent: 0.3, groundTruth: { priority: 'LOW', score: 35 }, groundTruthType: 'REVIEWER_CONSENSUS' },
            { id: 's3', fit: 0.6, intent: 0.55, groundTruth: { priority: 'MEDIUM', score: 58 }, groundTruthType: 'VERIFIED_BUSINESS_OUTCOME' },
            { id: 's4', fit: 0.7, intent: 0.2, groundTruthType: 'NONE' },
        ];
    }
    if (familyCode.includes('INDUSTRY') || familyCode.includes('CUSTOMER') || familyCode.includes('RELEVANCE')) {
        return [
            { id: 'c1', text: 'steel manufacturing plant', label: 'steel', groundTruth: { label: 'Manufacturing' }, groundTruthType: 'CONFIRMED_LABEL' },
            { id: 'c2', text: 'retail grocery store', label: 'retail', groundTruth: { label: 'Retail' }, groundTruthType: 'REVIEWER_CONSENSUS' },
            { id: 'c3', text: 'unknown biz', groundTruthType: 'NONE' },
        ];
    }
    if (familyCode.includes('PRODUCT')) {
        return [
            { id: 'p1', industry: 'steel', fit: 0.8, groundTruth: { productIds: ['prod-a'] }, groundTruthType: 'REVIEWER_CONSENSUS' },
            { id: 'p2', industry: 'retail', fit: 0.3, groundTruth: { productIds: [] }, groundTruthType: 'REVIEWER_CONSENSUS' },
            { id: 'p3', industry: 'steel', fit: 0.5, groundTruthType: 'NONE' },
        ];
    }
    if (familyCode.includes('DUPLICATE') || familyCode.includes('ENTITY') || familyCode.includes('SIMILAR')) {
        return [
            { id: 'd1', similarity: 0.9, duplicateScore: 0.92, groundTruth: { pass: true, duplicate: true }, groundTruthType: 'CONFIRMED_LABEL' },
            { id: 'd2', similarity: 0.2, duplicateScore: 0.15, groundTruth: { pass: false, duplicate: false }, groundTruthType: 'CONFIRMED_LABEL' },
            { id: 'd3', similarity: 0.55, duplicateScore: 0.5, groundTruthType: 'NONE' },
        ];
    }
    if (familyCode.includes('KG')) {
        return [
            { id: 'k1', confidence: 0.9, relationshipType: 'SUPPLIES', groundTruth: { suggested: true }, groundTruthType: 'REVIEWER_CONSENSUS' },
            { id: 'k2', confidence: 0.2, groundTruth: { suggested: false }, groundTruthType: 'REVIEWER_CONSENSUS' },
            { id: 'k3', confidence: 0.5, groundTruthType: 'NONE' },
        ];
    }
    if (familyCode.includes('CONTACT')) {
        return [
            { id: 't1', title: 'purchase manager', confidence: 0.9, groundTruth: { role: 'BUYER' }, groundTruthType: 'CONFIRMED_LABEL' },
            { id: 't2', title: 'intern', confidence: 0.2, groundTruth: { role: 'OTHER' }, groundTruthType: 'REVIEWER_CONSENSUS' },
            { id: 't3', title: 'director', confidence: 0.7, groundTruthType: 'NONE' },
        ];
    }
    if (familyCode.includes('ASSISTANT') || familyCode.includes('MARKETING')) {
        return [
            { id: 'a1', citation: 'source:1', groundTruthType: 'NONE' },
            { id: 'a2', groundTruthType: 'NONE' },
            { id: 'a3', groundTruthType: 'NONE' },
        ];
    }
    return [
        { id: 'x1', name: 'Acme', groundTruthType: 'NONE' },
        { id: 'x2', name: '', groundTruthType: 'NONE' },
        { id: 'x3', name: 'Beta', source: 'crm', groundTruthType: 'NONE' },
    ];
}
