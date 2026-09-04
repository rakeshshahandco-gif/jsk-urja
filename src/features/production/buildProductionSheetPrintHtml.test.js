import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildProductionSheetPrintHtml,
    buildSupplementaryWorkOrderPrintHtml,
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

    it('prints SUP heading, links, component qty, start-from, and signature — not a normal WO', () => {
        const html = buildSupplementaryWorkOrderPrintHtml({
            wo: supWo,
            companyName: 'JSK URJA',
            sourceSectionWo: sourceSection,
        });
        assert.match(html, /SUPPLEMENTARY WORK ORDER/);
        assert.equal(html.includes('SECTION PRODUCTION SHEET'), false);
        assert.match(html, /WO-2026-2027-00002-S2-SUP1/);
        assert.match(html, /WO-2026-2027-00002/);
        assert.match(html, /WO-2026-2027-00002-S2/);
        assert.match(html, /DAUGHTER BOARD/);
        assert.match(html, /MB10F/);
        assert.match(html, />40</);
        assert.match(html, /TH Mounting/);
        assert.match(html, /Pending material received later/);
        assert.match(html, /Remaining To Resolve/);
        assert.match(html, /Prepared By/);
        assert.match(html, /Production In-Charge/);
        assert.match(html, /does not create separate Finished Goods/);
        assert.match(html, /Not Applicable — completed in original WO/);
        assert.match(html, /In Progress/);
        assert.equal(html.includes('Production Sheet'), false);
    });

    it('does not treat allocated qty as completed in the traceability block', () => {
        const html = buildSupplementaryWorkOrderPrintHtml({
            wo: supWo,
            companyName: 'JSK',
            sourceSectionWo: sourceSection,
        });
        assert.match(html, /Supplementary Allocated Qty/);
        assert.match(html, /Supplementary Completed Qty/);
        const completedIdx = html.indexOf('Supplementary Completed Qty');
        const tableStart = html.indexOf('<tr>', completedIdx);
        const firstDataRow = html.slice(tableStart, html.indexOf('</table>', tableStart));
        assert.match(firstDataRow, />40</);
        assert.match(firstDataRow, />0</);
    });
});
