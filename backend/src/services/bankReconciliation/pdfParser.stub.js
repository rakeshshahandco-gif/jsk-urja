/**
 * PDF bank statement parsing - structure only (Phase 3).
 * Implement per-bank templates when sample PDFs are available.
 */
export async function parsePdfBuffer(_buffer, _fileName = '') {
    return {
        lines: [],
        fileType: 'pdf',
        unsupported: true,
        message: 'PDF import is not enabled yet. Export statement as CSV or Excel from your bank.',
    };
}
