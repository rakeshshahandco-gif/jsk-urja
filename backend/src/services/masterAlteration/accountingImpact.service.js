/**
 * Ledger group alteration impact + locked FY protection.
 */
import { AccountingPeriodLock } from '../../models/accountingPeriodLock.model.js';
import { AccountGroup } from '../../models/accountGroup.model.js';
import { discoverLedgerDependencies } from './dependencyDiscovery.service.js';
import { resolveLedgerGroupAtDate } from './ledgerGroupHistory.js';

function natureLabel(nature) {
    if (nature === 'Expenses' || nature === 'Income') return 'P&L';
    if (nature === 'Assets' || nature === 'Liabilities') return 'Balance Sheet';
    return nature || 'Unknown';
}

async function isFyBooksLocked(financialYear) {
    if (!financialYear || financialYear === 'Unknown') return false;
    const lock = await AccountingPeriodLock.findOne({ financialYear, isActive: true }).lean();
    if (!lock?.booksLockedTill) return false;
    // Any booksLockedTill means period has locked history through that date
    return true;
}

/**
 * Assess ledger group change impact. Blocks silent retrospective when locked FYs have entries.
 */
export async function assessLedgerGroupChange({
    ledger,
    newGroupId,
    companyId,
    effectiveFrom = null,
}) {
    const deps = await discoverLedgerDependencies(ledger._id, companyId);
    const oldGroup = ledger.underGroup
        ? await AccountGroup.findById(ledger.underGroup).lean()
        : null;
    const newGroup = newGroupId ? await AccountGroup.findById(newGroupId).lean() : null;

    const fyDetails = [];
    let openFyTxns = 0;
    let lockedFyTxns = 0;
    let lockedFys = [];

    for (const fy of deps.financialYears || []) {
        const locked = await isFyBooksLocked(fy.financialYear);
        fyDetails.push({
            financialYear: fy.financialYear,
            entryCount: fy.entryCount,
            locked,
            minDate: fy.minDate,
            maxDate: fy.maxDate,
        });
        if (locked) {
            lockedFyTxns += fy.entryCount;
            lockedFys.push(fy.financialYear);
        } else {
            openFyTxns += fy.entryCount;
        }
    }

    const hasLockedHistory = lockedFyTxns > 0;
    const eff = effectiveFrom ? new Date(effectiveFrom) : null;
    let retrospectivePermitted = !hasLockedHistory;
    let blockReason = '';
    let requiresEffectiveFrom = false;

    if (hasLockedHistory) {
        requiresEffectiveFrom = true;
        if (!eff || Number.isNaN(eff.getTime())) {
            retrospectivePermitted = false;
            blockReason =
                'Historical locked accounting periods use this ledger. Group alteration cannot be applied retrospectively without a controlled reclassification workflow. Provide Effective From Date / Financial Year for prospective classification only.';
        } else {
            // Prospective only: effectiveFrom must be after all locked booksLockedTill dates
            let ok = true;
            for (const fy of lockedFys) {
                const lock = await AccountingPeriodLock.findOne({ financialYear: fy, isActive: true }).lean();
                if (lock?.booksLockedTill && eff <= new Date(lock.booksLockedTill)) {
                    ok = false;
                    blockReason = `Effective From must be after books lock date (${new Date(lock.booksLockedTill).toLocaleDateString('en-IN')}) for F.Y. ${fy}. Locked history will keep prior group via groupHistory.`;
                    break;
                }
            }
            retrospectivePermitted = ok;
            if (ok) {
                blockReason = '';
            }
        }
    }

    const oldNature = oldGroup?.nature || '';
    const newNature = newGroup?.nature || '';
    const plImpact =
        natureLabel(oldNature) === 'P&L' || natureLabel(newNature) === 'P&L'
            ? 'P&L classification changes'
            : 'No direct P&L nature change';
    const bsImpact =
        natureLabel(oldNature) === 'Balance Sheet' || natureLabel(newNature) === 'Balance Sheet'
            ? 'Balance Sheet / liability-asset grouping may change'
            : 'No direct Balance Sheet nature change';
    const outstandingImpact =
        newGroup?.name?.toLowerCase().includes('creditor') ||
        oldGroup?.name?.toLowerCase().includes('creditor') ||
        newGroup?.name?.toLowerCase().includes('debtor') ||
        oldGroup?.name?.toLowerCase().includes('debtor')
            ? 'Outstanding creditor/debtor reporting may change'
            : 'No outstanding classification change expected';

    // Sample resolve for locked FY end (prove protection design)
    const sampleAsOf = lockedFys.length
        ? (await AccountingPeriodLock.findOne({ financialYear: lockedFys[0], isActive: true }).lean())
              ?.booksLockedTill
        : null;
    const historicalResolve = sampleAsOf
        ? resolveLedgerGroupAtDate(
              {
                  ...ledger.toObject?.() || ledger,
                  underGroup: newGroupId,
                  groupName: newGroup?.name,
                  groupHistory: [
                      ...(ledger.groupHistory || []),
                      {
                          groupId: ledger.underGroup,
                          groupNameSnapshot: ledger.groupName,
                          effectiveFrom: null,
                          effectiveTo: new Date(new Date(eff || Date.now()).getTime() - 86400000),
                      },
                  ],
              },
              sampleAsOf,
          )
        : null;

    return {
        currentGroup: { id: oldGroup?._id, name: oldGroup?.name || ledger.groupName || '', nature: oldNature },
        proposedGroup: { id: newGroup?._id, name: newGroup?.name || '', nature: newNature },
        totalAffectedVouchers: deps.counts.vouchers,
        totalLedgerEntries: deps.counts.ledgerEntries,
        financialYearsAffected: fyDetails,
        openFyTransactions: openFyTxns,
        lockedFyTransactions: lockedFyTxns,
        lockedFinancialYears: lockedFys,
        plImpact,
        bsImpact,
        outstandingImpact,
        hasLockedHistory,
        requiresEffectiveFrom,
        retrospectiveAlterationPermitted: retrospectivePermitted,
        blockReason,
        historicalResolveSample: historicalResolve,
        accountingReportsNote:
            'Reports resolve group per LedgerEntry.date via ledgerId + groupHistory (not only period-end). Locked periods keep prior classification when Effective From is prospective.',
    };
}
