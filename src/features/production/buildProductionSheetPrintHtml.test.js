import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildProductionSheetPrintHtml,
    isSectionWorkOrderForPrint,
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
});
