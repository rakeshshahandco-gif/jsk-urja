/**
 * Portable Print Format Designer layout files (.jsklayout).
 * Layout-only — never includes transaction data, Mongo IDs, credentials, or users.
 */

export const JSK_LAYOUT_FILE_EXTENSION = '.jsklayout';
export const JSK_LAYOUT_SCHEMA_VERSION = 1;
export const JSK_LAYOUT_MIME = 'application/json';

const ALLOWED_DOC_TYPES = [
    'Sales Order',
    'Sales Invoice',
    'Purchase Order',
    'Delivery Challan',
    'Quotation',
    'Estimate',
];

function stripUnsafeKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const clone = Array.isArray(obj) ? [] : {};
    Object.entries(obj).forEach(([k, v]) => {
        const key = String(k);
        if (/^(password|mongo|credential|token|secret)/i.test(key)) return;
        if (
            key === '_id'
            || key === 'companyId'
            || key === 'userId'
            || key === 'createdBy'
            || key === 'updatedBy'
            || key === 'copiedFromId'
            || key === 'sourceFormatId'
            || key === 'invoiceSeriesId'
        ) {
            return;
        }
        if (v && typeof v === 'object') clone[k] = stripUnsafeKeys(v);
        else clone[k] = v;
    });
    return clone;
}

export function buildJskLayoutFile({ docType, form, designerUi = {} } = {}) {
    if (!docType) throw new Error('Document type is required');
    const layout = form?.layout && typeof form.layout === 'object'
        ? stripUnsafeKeys(JSON.parse(JSON.stringify(form.layout)))
        : {};

    return {
        fileType: 'jsk-print-layout',
        schemaVersion: JSK_LAYOUT_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        docType: String(docType),
        name: String(form?.name || docType || 'Untitled').trim(),
        paperSize: form?.paperSize || 'A4',
        orientation: form?.orientation || 'portrait',
        margins: form?.margins || { top: 10, right: 10, bottom: 10, left: 10, unit: 'mm' },
        customPaper: form?.customPaper || null,
        layout,
        designerUi: {
            showRuler: designerUi.showRuler !== false,
            showMargins: designerUi.showMargins !== false,
            zoomPct: Number(designerUi.zoomPct) || 100,
        },
    };
}

export function validateJskLayoutFile(raw) {
    if (!raw || typeof raw !== 'object') {
        return { ok: false, error: 'Invalid layout file (not an object).' };
    }
    if (raw.fileType && raw.fileType !== 'jsk-print-layout') {
        return { ok: false, error: 'Not a JSK print layout file.' };
    }
    const schemaVersion = Number(raw.schemaVersion || 0);
    if (!Number.isFinite(schemaVersion) || schemaVersion < 1) {
        return { ok: false, error: 'Missing or invalid schema version.' };
    }
    if (schemaVersion > JSK_LAYOUT_SCHEMA_VERSION) {
        return {
            ok: false,
            error: 'This file uses schema v' + schemaVersion + '; this CRM supports up to v' + JSK_LAYOUT_SCHEMA_VERSION + '.',
        };
    }
    const docType = String(raw.docType || '').trim();
    if (!docType) {
        return { ok: false, error: 'Missing document type.' };
    }
    if (!raw.layout || typeof raw.layout !== 'object') {
        return { ok: false, error: 'Missing layout data.' };
    }
    const data = {
        fileType: 'jsk-print-layout',
        schemaVersion,
        savedAt: raw.savedAt || null,
        docType,
        name: String(raw.name || docType).trim(),
        paperSize: raw.paperSize || 'A4',
        orientation: raw.orientation || 'portrait',
        margins: raw.margins || { top: 10, right: 10, bottom: 10, left: 10, unit: 'mm' },
        customPaper: raw.customPaper || null,
        layout: stripUnsafeKeys(JSON.parse(JSON.stringify(raw.layout))),
        designerUi: raw.designerUi && typeof raw.designerUi === 'object' ? raw.designerUi : {},
        docTypeKnown: ALLOWED_DOC_TYPES.includes(docType),
    };
    return { ok: true, data };
}

export function parseJskLayoutText(text) {
    let raw;
    try {
        raw = JSON.parse(String(text || ''));
    } catch {
        return { ok: false, error: 'File is not valid JSON / .jsklayout content.' };
    }
    return validateJskLayoutFile(raw);
}

export function jskLayoutToFormState(data) {
    return {
        name: data.name,
        paperSize: data.paperSize,
        orientation: data.orientation,
        margins: data.margins,
        customPaper: data.customPaper || { widthMm: 210, heightMm: 297 },
        layout: data.layout,
    };
}

export function suggestedJskLayoutFileName(docType, name) {
    const unsafe = /[<>:"/\\|?*\x00-\x1f]/g;
    const base = String(name || docType || 'Print Layout')
        .replace(unsafe, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'Print Layout';
    return base.toLowerCase().endsWith(JSK_LAYOUT_FILE_EXTENSION)
        ? base
        : (base + JSK_LAYOUT_FILE_EXTENSION);
}

function supportsFileSystemAccess() {
    return typeof window !== 'undefined'
        && typeof window.showSaveFilePicker === 'function'
        && typeof window.showOpenFilePicker === 'function';
}

function downloadFallback(filename, contents) {
    const blob = new Blob([contents], { type: JSK_LAYOUT_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export async function saveJskLayoutToDisk({
    payload,
    fileHandle = null,
    suggestedName = 'Print Layout.jsklayout',
    forcePicker = false,
} = {}) {
    const contents = JSON.stringify(payload, null, 2) + '\n';
    const name = suggestedJskLayoutFileName(
        payload.docType,
        suggestedName.replace(/\.jsklayout$/i, '') || payload.name,
    );

    if (supportsFileSystemAccess()) {
        let handle = fileHandle;
        if (forcePicker || !handle) {
            handle = await window.showSaveFilePicker({
                suggestedName: name,
                types: [{
                    description: 'JSK Print Layout',
                    accept: { [JSK_LAYOUT_MIME]: [JSK_LAYOUT_FILE_EXTENSION] },
                }],
            });
        }
        const writable = await handle.createWritable();
        await writable.write(contents);
        await writable.close();
        return { handle, fileName: handle.name || name, method: 'fsa' };
    }

    downloadFallback(name, contents);
    return { handle: null, fileName: name, method: 'download' };
}

export async function openJskLayoutFromDisk() {
    if (supportsFileSystemAccess()) {
        const [handle] = await window.showOpenFilePicker({
            multiple: false,
            types: [{
                description: 'JSK Print Layout',
                accept: { [JSK_LAYOUT_MIME]: [JSK_LAYOUT_FILE_EXTENSION] },
            }],
        });
        const file = await handle.getFile();
        const text = await file.text();
        const parsed = parseJskLayoutText(text);
        if (!parsed.ok) throw new Error(parsed.error);
        return { data: parsed.data, handle, fileName: handle.name || file.name };
    }

    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = JSK_LAYOUT_FILE_EXTENSION + ',application/json';
        input.onchange = async () => {
            const file = input.files && input.files[0];
            if (!file) {
                reject(new Error('No file selected'));
                return;
            }
            try {
                const text = await file.text();
                const parsed = parseJskLayoutText(text);
                if (!parsed.ok) throw new Error(parsed.error);
                resolve({ data: parsed.data, handle: null, fileName: file.name });
            } catch (err) {
                reject(err);
            }
        };
        input.click();
    });
}

export function supportsJskLayoutOverwrite() {
    return supportsFileSystemAccess();
}