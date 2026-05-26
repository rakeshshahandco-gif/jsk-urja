import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsvBuffer } from '../src/services/bankReconciliation/parseStatement.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, 'fixtures', 'bank-stubs', 'sample.csv');

describe('parseStatement', () => {
    it('rejects PDF with clear message', async () => {
        const { parseStatementFile } = await import('../src/services/bankReconciliation/parseStatement.js');
        await assert.rejects(
            () => parseStatementFile(Buffer.from('%PDF'), 'stmt.pdf'),
            (err) => err.message.includes('PDF'),
        );
    });

    it('parses CSV with debit/credit columns', () => {
        const buf = fs.readFileSync(fixture);
        const lines = parseCsvBuffer(buf);
        assert.ok(lines.length >= 2);
        const deposit = lines.find((l) => l.drCr === 'Deposit');
        const withdrawal = lines.find((l) => l.drCr === 'Withdrawal');
        assert.ok(deposit && deposit.amount === 10556);
        assert.ok(withdrawal && withdrawal.amount === 5000);
    });
});
