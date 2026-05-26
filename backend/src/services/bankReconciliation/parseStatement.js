import ExcelJS from 'exceljs';

const HEADER_ALIASES = {
    txnDate: ['date', 'txn date', 'transaction date', 'trans date', 'posting date', 'value date'],
    valueDate: ['value date', 'val date'],
    amount: ['amount', 'txn amount', 'transaction amount'],
    debit: ['debit', 'withdrawal', 'dr', 'debit amount'],
    credit: ['credit', 'deposit', 'cr', 'credit amount'],
    narration: ['narration', 'description', 'particulars', 'remarks', 'details'],
    chequeNo: ['cheque', 'cheque no', 'chq no', 'cheque number'],
    utrRef: ['utr', 'reference', 'ref no', 'transaction id', 'utr no', 'imps ref'],
    counterpartyName: ['name', 'party', 'beneficiary', 'remitter', 'payee'],
    balance: ['balance', 'closing balance', 'running balance', 'available balance'],
    bankTxnId: ['bank transaction id', 'txn id', 'transaction id', 'serial no', 'sr no'],
};

function normHeader(h) {
    return String(h || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function mapHeaders(row) {
    const map = {};
    row.forEach((cell, idx) => {
        const key = normHeader(cell);
        for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
            if (aliases.some((a) => key === a || key.includes(a))) {
                if (!map[field]) map[field] = idx;
            }
        }
    });
    return map;
}

function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
    const s = String(val).trim();
    if (!s) return null;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
        let y = parseInt(m[3], 10);
        if (y < 100) y += 2000;
        const d2 = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
        if (!Number.isNaN(d2.getTime())) return d2;
    }
    return null;
}

function parseAmount(val) {
    if (val == null || val === '') return 0;
    const n = parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? Math.abs(n) : 0;
}

function rowToLine(row, colMap, rowIndex) {
    const get = (field) => {
        const i = colMap[field];
        return i != null ? row[i] : undefined;
    };

    let amount = parseAmount(get('amount'));
    let drCr = 'Deposit';
    const debit = parseAmount(get('debit'));
    const credit = parseAmount(get('credit'));
    if (debit > 0 && credit <= 0) {
        amount = debit;
        drCr = 'Withdrawal';
    } else if (credit > 0 && debit <= 0) {
        amount = credit;
        drCr = 'Deposit';
    } else if (amount > 0) {
        const raw = String(get('amount') || '').toLowerCase();
        if (raw.includes('dr') || raw.startsWith('-')) drCr = 'Withdrawal';
    }
    if (amount <= 0) return null;

    const txnDate = parseDate(get('txnDate')) || parseDate(get('valueDate'));
    if (!txnDate) return null;

    const runningBalance = parseAmount(get('balance')) || null;
    const bankTxnId = String(get('bankTxnId') || get('utrRef') || '').trim();

    return {
        txnDate,
        valueDate: parseDate(get('valueDate')) || txnDate,
        amount,
        runningBalance: runningBalance > 0 ? runningBalance : null,
        drCr,
        narration: String(get('narration') || '').trim(),
        chequeNo: String(get('chequeNo') || '').trim(),
        utrRef: String(get('utrRef') || '').trim(),
        bankTxnId,
        counterpartyName: String(get('counterpartyName') || '').trim(),
        bankCharges: 0,
        raw: { rowIndex, cells: row },
    };
}

function detectDelimiter(text) {
    const first = text.split('\n')[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    for (const c of Object.keys(counts)) counts[c] = (first.match(new RegExp(`\\${c}`, 'g')) || []).length;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

export function parseCsvBuffer(buffer) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const delim = detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const rows = lines.map((line) => {
        if (delim === '\t') return line.split('\t');
        return line.split(delim).map((c) => c.replace(/^"|"$/g, '').trim());
    });

    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
        const map = mapHeaders(rows[i]);
        if (map.txnDate != null || map.debit != null || map.credit != null) {
            headerIdx = i;
            break;
        }
    }

    const colMap = mapHeaders(rows[headerIdx]);
    const out = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const line = rowToLine(rows[i], colMap, i);
        if (line) out.push(line);
    }
    return out;
}

export async function parseExcelBuffer(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0];
    if (!sheet) return [];

    const rows = [];
    sheet.eachRow((row) => {
        const cells = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cells[colNumber - 1] = cell.value instanceof Date ? cell.value : cell.text ?? cell.value;
        });
        rows.push(cells);
    });

    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
        const map = mapHeaders(rows[i]);
        if (map.txnDate != null || map.debit != null || map.credit != null) {
            headerIdx = i;
            break;
        }
    }
    const colMap = mapHeaders(rows[headerIdx]);
    const out = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const line = rowToLine(rows[i], colMap, i);
        if (line) out.push(line);
    }
    return out;
}

export async function parseStatementFile(buffer, fileName = '') {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) {
        const { parsePdfBuffer } = await import('./pdfParser.stub.js');
        const pdf = await parsePdfBuffer(buffer, fileName);
        if (pdf.unsupported) {
            const err = new Error(pdf.message);
            err.code = 'PDF_UNSUPPORTED';
            throw err;
        }
        return { lines: pdf.lines, fileType: 'pdf' };
    }
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        return { lines: await parseExcelBuffer(buffer), fileType: lower.endsWith('.xls') ? 'xls' : 'xlsx' };
    }
    return { lines: parseCsvBuffer(buffer), fileType: lower.endsWith('.txt') ? 'txt' : 'csv' };
}
