import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildProductionSheetPrintHtml,
    buildSupplementaryWorkOrderPrintHtml,
    buildLateMaterialIssueNoteHtml,
    isSectionWorkOrderForPrint,
    isSupplementaryWorkOrderForPrint,
} from './buildProductionSheetPrintHtml.js';

const parentWo = {
    woKind: 'main',
    woNumber: 'WO-2026-2027-00011',
    status: 'Draft',
    finishedProductName: 'JUDL20WN-DT8',
    targetQty: 1,
    bomVersion: 'V1',
    bomSectionName: '',
    parentWorkOrderId: null,
};

const powerSide = {
    woKind: 'section',
    woNumber: 'WO-2026-2027-00010-S1',
    status: 'Draft',
    finishedProductName: 'JUDL20WN-DT8',
    targetQty: 1,
    bomVersion: 'V1',
    bomSectionName: 'POWER SIDE',
    parentWorkOrderId: { _id: 'p1', woNumber: 'WO-2026-2027-00010' },
};

const daughterBoard = {
    woKind: 'section',
    woNumber: 'WO-2026-2027-00011-S2',
    status: 'Draft',
    finishedProductName: 'JUDL20WN-DT8',
    targetQty: 1,
    bomVersion: 'V1',
    bomSectionName: 'DAUGHTER BOARD',
    parentWorkOrderId: { _id: 'p2', woNumber: 'WO-2026-2027-00011' },
};

describe('Print Production Sheet HTML — actual generator used by the button', () => {
    it('does not treat parent/main WO as a section print', () => {
        assert.equal(isSectionWorkOrderForPrint(parentWo), false);
        const html = buildProductionSheetPrintHtml({ wo: parentWo, companyName: 'JSK', isTextile: false });
        assert.equal(html.includes('SECTION / SUBASSEMBLY'), false);
        assert.equal(html.includes('SECTION PRODUCTION SHEET'), false);
        assert.equal(html.includes('Item to Manufacture'), true);
        assert.equal(html.includes('SMD'), true);
        assert.equal(html.includes('TH-MOUNTING'), true);
    });

    it('A. DAUGHTER BOARD Section WO HTML contains the section identity', () => {
        assert.equal(isSectionWorkOrderForPrint(daughterBoard), true);
        const html = buildProductionSheetPrintHtml({ wo: daughterBoard, companyName: 'JSK', isTextile: false });
        assert.match(html, /SECTION \/ SUBASSEMBLY :/);
        assert.match(html, /DAUGHTER BOARD/);
        assert.match(html, /Section WO No\. : WO-2026-2027-00011-S2/);
        assert.match(html, /Parent WO No\. : WO-2026-2027-00011/);
        assert.equal(html.includes('POWER SIDE'), false);
    });

    it('B. POWER SIDE Section WO HTML contains the section identity', () => {
        const html = buildProductionSheetPrintHtml({ wo: powerSide, companyName: 'JSK', isTextile: false });
        assert.match(html, /SECTION \/ SUBASSEMBLY :/);
        assert.match(html, /POWER SIDE/);
        assert.match(html, /Section WO No\. : WO-2026-2027-00010-S1/);
        assert.match(html, /Parent WO No\. : WO-2026-2027-00010/);
        assert.equal(html.includes('DAUGHTER BOARD'), false);
    });

    it('detects section WO from -S2 number even if woKind missing', () => {
        const wo = { woNumber: 'WO-2026-2027-00011-S2', bomSectionName: 'DAUGHTER BOARD' };
        assert.equal(isSectionWorkOrderForPrint(wo), true);
        const html = buildProductionSheetPrintHtml({ wo, isTextile: false });
        assert.match(html, /DAUGHTER BOARD/);
    });

    it('does not treat Supplementary WO as a Section production sheet', () => {
        const sup = {
            woKind: 'supplementary',
            woNumber: 'WO-2026-2027-00002-S2-SUP1',
            parentWorkOrderId: { woNumber: 'WO-2026-2027-00002' },
            bomSectionName: 'DAUGHTER BOARD',
        };
        assert.equal(isSupplementaryWorkOrderForPrint(sup), true);
        assert.equal(isSectionWorkOrderForPrint(sup), false);
    });
});

describe('Print Supplementary Work Order HTML — read-only generator', () => {
    const sourceSection = {
        woNumber: 'WO-2026-2027-00002-S2',
        bomSectionName: 'DAUGHTER BOARD',
        materialStatus: [{
            _id: 'm1',
            itemId: 'i1',
            itemCode: 'MB10F',
            itemName: 'MB10F Bridge',
            requiredQty: 100,
            addedLaterQty: 60,
            supplementaryAllocatedQty: 40,
            supplementaryCompletedQty: 0,
        }],
    };

    const supWo = {
        woKind: 'supplementary',
        woNumber: 'WO-2026-2027-00002-S2-SUP1',
        status: 'In Process',
        createdAt: '2026-09-04T10:00:00.000Z',
        financialYear: '2026-2027',
        supervisor: 'Rakesh',
        supplementaryReason: 'Pending material received later',
        startFromStageName: 'TH Mounting',
        startFromSeq: 3,
        targetQty: 40,
        finishedProductName: 'JUDL20WN-DT8',
        finishedProductId: { itemCode: 'JUDL20', modelNo: 'DT8' },
        bomSectionName: 'DAUGHTER BOARD',
        parentWorkOrderId: { woNumber: 'WO-2026-2027-00002' },
        sourceSectionWorkOrderId: { woNumber: 'WO-2026-2027-00002-S2', bomSectionName: 'DAUGHTER BOARD' },
        supplementaryMaterials: [{
            materialId: 'm1',
            itemId: 'i1',
            itemCode: 'MB10F',
            itemName: 'MB10F Bridge',
            qty: 40,
        }],
        stages: [
            { seq: 1, stageName: 'PCB', status: 'Completed', inputQty: 40, outputQty: 40, notApplicable: true, isApplicable: false },
            { seq: 3, stageName: 'TH Mounting', status: 'Completed', inputQty: 40, outputQty: 40, remarks: '' },
            { seq: 4, stageName: 'Wave Soldering', status: 'Completed', inputQty: 40, outputQty: 40 },
            { seq: 5, stageName: 'Touch Up', status: 'Running', inputQty: 40, outputQty: 20 },
            { seq: 9, stageName: 'Final QC', status: 'Not Started', inputQty: 0, outputQty: 0 },
        ],
    };

    it('prints missing-material instruction without process stages', () => {
        const html = buildSupplementaryWorkOrderPrintHtml({
            wo: { ...supWo, materialIssueNo: 'MI-WO-2026-2027-00002-S2-001' },
            companyName: 'JSK URJA',
            sourceSectionWo: sourceSection,
        });
        assert.match(html, /SUPPLEMENTARY WORK ORDER/);
        assert.match(html, /Purpose: Add late-received missing components to existing production/);
        assert.equal(html.includes('SECTION PRODUCTION SHEET'), false);
        assert.match(html, /WO-2026-2027-00002-S2-SUP1/);
        assert.match(html, /WO-2026-2027-00002/);
        assert.match(html, /WO-2026-2027-00002-S2/);
        assert.match(html, /DAUGHTER BOARD/);
        assert.match(html, /MB10F/);
        assert.match(html, />40</);
        assert.match(html, /Pending material received later/);
        assert.match(html, /MI-WO-2026-2027-00002-S2-001/);
        assert.match(html, /Store \/ Issued By/);
        assert.match(html, /Received By/);
        assert.match(html, /Production Supervisor/);
        assert.match(html, /Production In-Charge/);
        assert.match(html, /Signature \/ Date/);
        assert.match(html, /Qty Issued/);
        assert.equal(html.includes('Process Details'), false);
        assert.equal(html.includes('Start From Stage'), false);
        assert.equal(html.includes('TH Mounting'), false);
        assert.equal(html.includes('Production Sheet'), false);
    });
});

describe('Late Material Issue Note print is read-only', () => {
    it('renders heading and issued lines without any write API', () => {
        const html = buildLateMaterialIssueNoteHtml({
            companyName: 'JSK URJA',
            wo: daughterBoard,
            batch: {
                issueNo: 'MI-WO-2026-2027-00011-S2-001',
                issueDate: '2026-09-04',
                financialYear: '2026-2027',
                parentWoNumber: 'WO-2026-2027-00011',
                sectionWoNumber: 'WO-2026-2027-00011-S2',
                sectionName: 'DAUGHTER BOARD',
                status: 'Posted',
                remarks: 'Received together',
                lines: [
                    { itemCode: 'A', itemName: 'Comp A', requiredQty: 10, qtyIssued: 10, remainingAfter: 0 },
                    { itemCode: 'B', itemName: 'Comp B', requiredQty: 40, qtyIssued: 40, remainingAfter: 0 },
                ],
            },
        });
        assert.match(html, /MATERIAL ISSUE NOTE/);
        assert.match(html, />Sr\.</);
        assert.match(html, /MI-WO-2026-2027-00011-S2-001/);
        assert.match(html, /printing does not change inventory/);
        assert.match(html, /Qty Issued/);
        assert.equal(html.includes('fetch('), false);
        assert.equal(html.includes('/api/'), false);
    });
});
