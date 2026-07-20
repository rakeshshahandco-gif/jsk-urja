import React from 'react';
import { Lock } from 'lucide-react';
import { useModuleGuard } from '@/contexts/ModuleGuardContext';
import { MODULE_STATE } from '@/utils/moduleAccessDecision';

/**
 * Shows a lock banner when the current route's pilot module is LOCKED.
 */
export default function ModuleLockBanner() {
    const { currentPathModule } = useModuleGuard();
    if (!currentPathModule || currentPathModule.state !== MODULE_STATE.LOCKED) return null;

    const mode = currentPathModule.lockMode || 'LOCKED';
    const reason = currentPathModule.lockReason;

    return (
        <div
            role="status"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                background: '#fff7ed',
                borderBottom: '1px solid #fdba74',
                color: '#9a3412',
                fontSize: 13,
                fontWeight: 600,
            }}
        >
            <Lock size={16} strokeWidth={2.4} aria-hidden />
            <span>
                Module locked ({mode})
                {reason ? ` — ${reason}` : ''}
            </span>
        </div>
    );
}
