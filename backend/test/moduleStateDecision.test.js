import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    evaluateModuleAccess,
    resolveModuleState,
    isLikelyCreateRequest,
    MODULE_ACCESS_DENY_REASON,
} from '../src/constants/moduleAccessDecision.constants.js';
import { MODULE_STATE, MODULE_LOCK_MODE } from '../src/constants/moduleState.constants.js';

describe('moduleAccessDecision Phase 2', () => {
    it('falls back to ON when guard off and no moduleStates', () => {
        const r = resolveModuleState({
            moduleGuardEnabled: false,
            enabledModules: [],
            moduleStates: [],
            moduleCode: 'tasks',
        });
        assert.equal(r.state, MODULE_STATE.ON);
        assert.equal(r.source, 'guard_off');
    });

    it('falls back to ON when guard on and module in enabledModules', () => {
        const r = resolveModuleState({
            moduleGuardEnabled: true,
            enabledModules: ['tasks', 'crm'],
            moduleStates: [],
            moduleCode: 'tasks',
        });
        assert.equal(r.state, MODULE_STATE.ON);
        assert.equal(r.source, 'enabledModules');
    });

    it('falls back to OFF when guard on and module absent', () => {
        const r = resolveModuleState({
            moduleGuardEnabled: true,
            enabledModules: ['crm'],
            moduleStates: [],
            moduleCode: 'tasks',
        });
        assert.equal(r.state, MODULE_STATE.OFF);
    });

    it('explicit moduleStates wins over enabledModules', () => {
        const r = resolveModuleState({
            moduleGuardEnabled: true,
            enabledModules: ['tasks'],
            moduleStates: [{ moduleKey: 'tasks', state: 'LOCKED', lockMode: 'READ_ONLY' }],
            moduleCode: 'tasks',
        });
        assert.equal(r.state, MODULE_STATE.LOCKED);
        assert.equal(r.lockMode, MODULE_LOCK_MODE.READ_ONLY);
        assert.equal(r.source, 'moduleStates');
    });

    it('READ_ONLY allows GET and blocks POST', () => {
        const base = {
            moduleGuardEnabled: true,
            enabledModules: ['tasks'],
            moduleStates: [{ moduleKey: 'tasks', state: 'LOCKED', lockMode: 'READ_ONLY' }],
            moduleCode: 'tasks',
        };
        const getOk = evaluateModuleAccess({ ...base, method: 'GET', pathname: '/tasks' });
        const postBlocked = evaluateModuleAccess({ ...base, method: 'POST', pathname: '/tasks' });
        assert.equal(getOk.allowed, true);
        assert.equal(postBlocked.allowed, false);
        assert.equal(postBlocked.reason, MODULE_ACCESS_DENY_REASON.MODULE_LOCKED_READ_ONLY);
    });

    it('NEW_ENTRY_BLOCKED blocks create POST but allows action POST', () => {
        const base = {
            moduleGuardEnabled: true,
            enabledModules: ['tasks'],
            moduleStates: [{ moduleKey: 'tasks', state: 'LOCKED', lockMode: 'NEW_ENTRY_BLOCKED' }],
            moduleCode: 'tasks',
        };
        const createBlocked = evaluateModuleAccess({
            ...base,
            method: 'POST',
            pathname: '/tasks',
        });
        const actionOk = evaluateModuleAccess({
            ...base,
            method: 'POST',
            pathname: '/tasks/6a5b6a3cc94043acb0576009/complete',
        });
        assert.equal(createBlocked.allowed, false);
        assert.equal(actionOk.allowed, true);
        assert.equal(isLikelyCreateRequest('POST', '/tasks'), true);
        assert.equal(isLikelyCreateRequest('POST', '/tasks/6a5b6a3cc94043acb0576009/complete'), false);
    });

    it('FULL_LOCK blocks non-admin GET', () => {
        const base = {
            moduleGuardEnabled: true,
            enabledModules: ['crm'],
            moduleStates: [{ moduleKey: 'crm', state: 'LOCKED', lockMode: 'FULL_LOCK' }],
            moduleCode: 'crm',
            method: 'GET',
            pathname: '/leads',
        };
        assert.equal(evaluateModuleAccess({ ...base, isPlatformAdmin: false }).allowed, false);
        assert.equal(evaluateModuleAccess({ ...base, isPlatformAdmin: true }).allowed, true);
    });

    it('OFF blocks all methods', () => {
        const r = evaluateModuleAccess({
            moduleGuardEnabled: true,
            enabledModules: [],
            moduleStates: [{ moduleKey: 'tasks', state: 'OFF' }],
            moduleCode: 'tasks',
            method: 'GET',
            pathname: '/tasks',
        });
        assert.equal(r.allowed, false);
        assert.equal(r.reason, MODULE_ACCESS_DENY_REASON.MODULE_OFF);
    });
});
