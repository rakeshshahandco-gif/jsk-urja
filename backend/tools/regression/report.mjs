#!/usr/bin/env node
/**
 * Print latest Safe Change / CRM regression report (no re-run of live/destructive tests).
 */
import { printLatestReport } from './safe-change/reportGuard.js';

const r = printLatestReport();
process.exitCode = r.ok ? 0 : 1;
