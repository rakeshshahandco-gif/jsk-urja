/** Maps registry action ids to table columns (display only — keys unchanged). */
export const STANDARD_COLUMNS = [
    { key: 'view', label: 'View', ids: ['view', 'view_all', 'report_view', 'report_view_all'] },
    { key: 'create', label: 'Create', ids: ['add'] },
    { key: 'edit', label: 'Edit', ids: ['edit', 'edit_all', 'assign', 'manage'] },
    { key: 'delete', label: 'Delete', ids: ['delete'] },
    { key: 'export', label: 'Export', ids: ['export'] },
    { key: 'print', label: 'Print', ids: ['print'] },
    { key: 'approve', label: 'Approve', ids: ['approve', 'cancel'] },
];

const ALL_STANDARD_IDS = new Set(STANDARD_COLUMNS.flatMap((c) => c.ids));

export function normalizeAction(action) {
    if (typeof action === 'string') {
        return { id: action, label: action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ') };
    }
    return { id: action.id, label: action.label || action.id };
}

export function collectActionsFromMetadata(metadata) {
    const all = [];
    const seen = new Set();
    metadata.forEach((mod) => {
        mod.submodules?.forEach((sub) => {
            sub.actions?.forEach((action) => {
                const a = normalizeAction(action);
                if (!seen.has(a.id)) {
                    seen.add(a.id);
                    all.push(a);
                }
            });
        });
    });
    return all;
}

export function buildVisibleColumns(metadata) {
    const allActions = collectActionsFromMetadata(metadata);
    const actionIds = new Set(allActions.map((a) => a.id));

    const columns = STANDARD_COLUMNS.filter((col) =>
        col.ids.some((id) => actionIds.has(id)),
    );

    const unmapped = allActions.filter((a) => !ALL_STANDARD_IDS.has(a.id));
    if (unmapped.length > 0) {
        columns.push({ key: 'extra', label: 'More', ids: unmapped.map((a) => a.id), unmapped });
    }

    columns.push({ key: 'all', label: 'All', ids: [] });
    return columns;
}

export function actionsForColumn(column, submodule) {
    const actions = (submodule.actions || []).map(normalizeAction);
    if (column.key === 'all') return actions;
    if (column.key === 'extra') {
        return actions.filter((a) => column.ids.includes(a.id));
    }
    return actions.filter((a) => column.ids.includes(a.id));
}
