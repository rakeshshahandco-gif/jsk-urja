import { PilotDefect } from '../../../models/pilotDefect.model.js';
import { PilotRisk } from '../../../models/pilotRisk.model.js';
import { UatExecution } from '../../../models/uatExecution.model.js';
import { PERMS } from './constants.js';
import { assertPerm } from './permissions.util.js';
import { rejectTenantOverrides, forceSimulationOnly, sanitizeExportFormula, assertNoSecrets } from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { getSettings } from './settings.service.js';
import { loadScopedProgram } from './pilotProgram.service.js';

export async function exportPilotReport(companyId, userId, query = {}, user = null) {
    assertPerm(user, PERMS.export);
    rejectTenantOverrides(query);
    const settings = await getSettings(companyId, user);
    const limit = Math.min(Number(query.limit || settings.settings.maximumExportRows || 500), settings.settings.maximumExportRows || 500);
    const program = await loadScopedProgram(companyId, query.pilotProgramId);
    const [defects, risks, executions] = await Promise.all([
        PilotDefect.find({ companyId, pilotProgramId: program._id, isDeleted: { $ne: true } }).limit(limit).lean(),
        PilotRisk.find({ companyId, pilotProgramId: program._id, isDeleted: { $ne: true } }).limit(limit).lean(),
        UatExecution.find({ companyId, pilotProgramId: program._id, isDeleted: { $ne: true } }).limit(limit).lean(),
    ]);
    const report = {
        type: query.type || 'pilot_summary',
        pilot: {
            code: sanitizeExportFormula(program.pilotCode),
            name: sanitizeExportFormula(program.pilotName),
            status: program.status,
            recommendation: program.recommendation,
        },
        defects: defects.map((d) => ({ code: d.defectCode, title: sanitizeExportFormula(d.title), severity: d.severity, status: d.status })),
        risks: risks.map((r) => ({ code: r.riskCode, title: sanitizeExportFormula(r.title), score: r.inherentScore, status: r.status })),
        executions: executions.map((e) => ({ result: e.resultStatus, testCaseId: String(e.testCaseId) })),
        secretsExcluded: true,
        deploymentPackageIncluded: false,
        simulationOnly: true,
        productionActivated: false,
    };
    assertNoSecrets(report);
    await writeAudit(companyId, userId, 'EXPORT', 'PilotProgram', program._id, { type: report.type, rows: defects.length + risks.length }, { pilotProgramId: program._id });
    return forceSimulationOnly(report);
}