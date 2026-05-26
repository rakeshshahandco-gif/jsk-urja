# Bank Reconciliation — Phase 2

## PDF bank statements

- Add pdf-parse or bank-specific parsers with template IDs per bank.
- MVP fallback: export PDF to CSV/Excel from net banking.
- Future: BankImportTemplate collection for column/regex config.

## PaymentEntry book lines

- PaymentEntry may not create LedgerEntry rows.
- Phase 2: synthetic read-only book lines from PaymentEntry with dedup vs vouchers.

## Auto-learning

- BankMatchMemory collection to boost scores from approved matches.

## Undo in UI

- Wire POST /bank-reconciliation/:id/undo for admins in the UI.
