import fs from 'fs';
import path from 'path';

export async function extractTextFromScanFile(filePath, mimeType = '') {
    if (!filePath || !fs.existsSync(filePath)) return '';

    const ext = path.extname(filePath).toLowerCase();
    const isPdf = mimeType.includes('pdf') || ext === '.pdf';

    if (isPdf) {
        try {
            const buf = fs.readFileSync(filePath);
            const mod = await import('pdf-parse');
            const pdfParse = mod.default || mod;
            const parsed = await pdfParse(buf);
            return String(parsed?.text || '').trim();
        } catch {
            return '';
        }
    }

    // Image OCR requires external provider; return empty so review screen can be filled manually.
    return '';
}
