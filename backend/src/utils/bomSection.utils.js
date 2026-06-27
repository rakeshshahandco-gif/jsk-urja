import httpStatus from 'http-status';
import { ApiError } from './ApiError.js';

export const DEFAULT_SECTION_COUNT = 1;
export const DEFAULT_SECTION_NAME = 'Main BOM';

export function resolveSectionCount(bom) {
    const n = parseInt(bom?.sectionCount, 10);
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_SECTION_COUNT;
}

export function buildDefaultSections(sectionCount = DEFAULT_SECTION_COUNT) {
    const count = Math.max(1, parseInt(sectionCount, 10) || DEFAULT_SECTION_COUNT);
    return Array.from({ length: count }, (_, i) => ({
        sectionNo: i + 1,
        sectionName: i === 0 ? DEFAULT_SECTION_NAME : '',
    }));
}

/** Apply safe defaults when reading BOM (legacy rows without section data). */
export function normalizeBomSectionsForRead(bomDoc) {
    const plain = bomDoc?.toObject ? bomDoc.toObject() : { ...(bomDoc || {}) };
    const sectionCount = resolveSectionCount(plain);

    let sections = Array.isArray(plain.sections) && plain.sections.length
        ? plain.sections.map((s, i) => ({
            sectionNo: Number(s.sectionNo) || i + 1,
            sectionName: String(s.sectionName || '').trim() || (Number(s.sectionNo) === 1 ? DEFAULT_SECTION_NAME : ''),
        }))
        : buildDefaultSections(sectionCount);

    if (sections.length < sectionCount) {
        const defaults = buildDefaultSections(sectionCount);
        sections = defaults.map((def, i) => sections[i] || def);
    } else if (sections.length > sectionCount) {
        sections = sections.slice(0, sectionCount);
    }

    const nameByNo = Object.fromEntries(sections.map((s) => [s.sectionNo, s.sectionName]));

    const components = (plain.components || []).map((c) => {
        const sectionNo = Number(c.sectionNo) >= 1 ? Number(c.sectionNo) : DEFAULT_SECTION_COUNT;
        return {
            ...c,
            sectionNo,
            sectionName: String(c.sectionName || '').trim() || nameByNo[sectionNo] || DEFAULT_SECTION_NAME,
        };
    });

    return { ...plain, sectionCount, sections, components };
}

/** Validate and normalize section data before create/update. */
export function normalizeBomSectionsForWrite(body) {
    const sectionCount = Math.max(1, parseInt(body.sectionCount, 10) || DEFAULT_SECTION_COUNT);
    if (!Number.isFinite(sectionCount) || sectionCount < 1) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'BOM section count must be at least 1');
    }

    let sections;
    if (sectionCount === 1) {
        sections = [{ sectionNo: 1, sectionName: DEFAULT_SECTION_NAME }];
    } else {
        const inputSections = Array.isArray(body.sections) ? body.sections : [];
        sections = buildDefaultSections(sectionCount).map((def) => {
            const existing = inputSections.find((s) => Number(s.sectionNo) === def.sectionNo)
                || inputSections[def.sectionNo - 1];
            const sectionName = String(existing?.sectionName || '').trim();
            if (!sectionName) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Section ${def.sectionNo} name is required when using multiple BOM sections`);
            }
            return { sectionNo: def.sectionNo, sectionName };
        });
    }

    const validSectionNos = new Set(sections.map((s) => s.sectionNo));
    const nameByNo = Object.fromEntries(sections.map((s) => [s.sectionNo, s.sectionName]));

    const components = (body.components || []).map((c, idx) => {
        let sectionNo = sectionCount === 1
            ? DEFAULT_SECTION_COUNT
            : (parseInt(c.sectionNo, 10) || DEFAULT_SECTION_COUNT);

        if (sectionNo < 1 || sectionNo > sectionCount) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Component row ${idx + 1} has invalid section ${sectionNo}. Valid sections: 1 to ${sectionCount}.`
            );
        }
        if (!validSectionNos.has(sectionNo)) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Component row ${idx + 1} references unknown section ${sectionNo}`);
        }

        return {
            ...c,
            sectionNo,
            sectionName: nameByNo[sectionNo] || DEFAULT_SECTION_NAME,
        };
    });

    return { ...body, sectionCount, sections, components };
}

export function calcSectionCostTotals(components = []) {
    const map = new Map();
    for (const c of components) {
        const no = Number(c.sectionNo) || DEFAULT_SECTION_COUNT;
        const prev = map.get(no) || { sectionNo: no, sectionName: c.sectionName || DEFAULT_SECTION_NAME, rawMaterialCost: 0, pointsLabourCost: 0 };
        prev.rawMaterialCost += Number(c.totalCost) || 0;
        prev.pointsLabourCost += Number(c.pointsLabourCost) || 0;
        prev.sectionName = c.sectionName || prev.sectionName;
        map.set(no, prev);
    }
    return [...map.values()].sort((a, b) => a.sectionNo - b.sectionNo);
}
