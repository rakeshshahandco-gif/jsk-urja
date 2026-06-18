import React, { useMemo } from 'react';
import {
    ChevronDown,
    ChevronRight,
    LayoutGrid,
    Users,
    ClipboardList,
    ShoppingCart,
    Package,
    Warehouse,
    Landmark,
    FileText,
    Settings,
    Home,
    Factory,
    MessageCircle,
    Wrench,
} from 'lucide-react';
import {
    buildVisibleColumns,
    actionsForColumn,
    normalizeAction,
} from './permissionTableConfig';
import styles from './AddUserForm.module.scss';

const MODULE_ICONS = {
    crm: Users,
    customers: Users,
    tasks: ClipboardList,
    sales: ShoppingCart,
    purchase: Package,
    inventory: Warehouse,
    accounts: Landmark,
    account_master: Landmark,
    accounts_reports: Landmark,
    voucher_entry: Landmark,
    gst: FileText,
    tds: FileText,
    tcs: FileText,
    reports: FileText,
    mis: FileText,
    admin: Settings,
    home: Home,
    production: Factory,
    whatsapp: MessageCircle,
    messenger: MessageCircle,
    wechat: MessageCircle,
    service: Wrench,
};

function ModuleIcon({ moduleId }) {
    const Icon = MODULE_ICONS[moduleId] || LayoutGrid;
    return <Icon size={14} className={styles.tableModuleIcon} aria-hidden />;
}

function CellCheckboxes({
    moduleId,
    submodule,
    column,
    subPerms,
    isGrantedByRole,
    onToggle,
    compact,
}) {
    const actions = actionsForColumn(column, submodule);
    if (!actions.length) return <span className={styles.tableCellEmpty}>—</span>;

    return (
        <div className={styles.tableCellChecks}>
            {actions.map((action) => {
                const roleGranted = isGrantedByRole(moduleId, submodule.id, action.id);
                const isChecked = roleGranted || !!subPerms[action.id];
                const title = roleGranted
                    ? `${action.label} (from role)`
                    : action.label;

                return (
                    <input
                        key={action.id}
                        type="checkbox"
                        className={styles.tableCheckbox}
                        checked={isChecked}
                        disabled={roleGranted}
                        title={title}
                        aria-label={action.label}
                        onChange={() => onToggle(moduleId, submodule.id, action.id)}
                    />
                );
            })}
        </div>
    );
}

function moduleAllChecked(module, column, selectedPermissions, isGrantedByRole) {
    const actions = [];
    module.submodules?.forEach((sub) => {
        actionsForColumn(column, sub).forEach((a) => actions.push({ sub, action: a }));
    });
    if (!actions.length) return false;
    return actions.every(({ sub, action }) =>
        isGrantedByRole(module.id, sub.id, action.id)
        || !!selectedPermissions[module.id]?.[sub.id]?.[action.id],
    );
}

function moduleAllIndeterminate(module, column, selectedPermissions, isGrantedByRole) {
    const actions = [];
    module.submodules?.forEach((sub) => {
        actionsForColumn(column, sub).forEach((a) => actions.push({ sub, action: a }));
    });
    if (!actions.length) return false;
    const checked = actions.filter(({ sub, action }) =>
        isGrantedByRole(module.id, sub.id, action.id)
        || !!selectedPermissions[module.id]?.[sub.id]?.[action.id],
    ).length;
    return checked > 0 && checked < actions.length;
}

export function UserPermissionTable({
    modules,
    columns,
    expandedModules,
    selectedPermissions,
    isGrantedByRole,
    onToggleModuleExpansion,
    onPermissionToggle,
    onModuleColumnToggle,
    onModuleAllToggle,
    onSubmoduleAllToggle,
    onSelectAllGlobal,
    globalAllChecked,
}) {
    const visibleColumns = useMemo(() => columns || [], [columns]);

    return (
        <div className={styles.permissionTableWrap}>
            <table className={styles.permissionTable}>
                <thead>
                    <tr>
                        <th className={styles.colName}>Module / Permission</th>
                        {visibleColumns.map((col) => (
                            <th key={col.key} className={styles.colAction}>
                                {col.key === 'all' ? (
                                    <label className={styles.headerAllLabel}>
                                        <input
                                            type="checkbox"
                                            className={styles.tableCheckbox}
                                            checked={globalAllChecked}
                                            onChange={(e) => onSelectAllGlobal(e.target.checked)}
                                            aria-label="Select all permissions"
                                        />
                                        <span>All</span>
                                    </label>
                                ) : (
                                    col.label
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {modules.map((module) => {
                        const isExpanded = expandedModules[module.id];
                        const modulePerms = selectedPermissions[module.id] || {};
                        const hasSubs = (module.submodules?.length || 0) > 0;

                        return (
                            <React.Fragment key={module.id}>
                                <tr className={styles.tableRowModule}>
                                    <td className={styles.colName}>
                                        <button
                                            type="button"
                                            className={styles.tableExpandBtn}
                                            onClick={() => onToggleModuleExpansion(module.id)}
                                            disabled={!hasSubs}
                                            aria-expanded={isExpanded}
                                        >
                                            {hasSubs ? (
                                                isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                                            ) : (
                                                <span className={styles.tableExpandSpacer} />
                                            )}
                                            <ModuleIcon moduleId={module.id} />
                                            <span className={styles.tableModuleName}>
                                                {module.name || module.id}
                                            </span>
                                        </button>
                                    </td>
                                    {visibleColumns.map((col) => {
                                        if (col.key === 'all') {
                                            const allOn = module.submodules?.every((sub) => {
                                                const acts = (sub.actions || []).map(normalizeAction);
                                                return acts.length > 0 && acts.every(
                                                    (a) => isGrantedByRole(module.id, sub.id, a.id)
                                                        || !!modulePerms[sub.id]?.[a.id],
                                                );
                                            });
                                            const anyAct = module.submodules?.some((s) => (s.actions?.length || 0) > 0);
                                            return (
                                                <td key={col.key} className={styles.colAction}>
                                                    {anyAct ? (
                                                        <input
                                                            type="checkbox"
                                                            className={styles.tableCheckbox}
                                                            checked={!!allOn}
                                                            onChange={(e) => onModuleAllToggle(module, e.target.checked)}
                                                            aria-label={`All permissions for ${module.name}`}
                                                        />
                                                    ) : (
                                                        <span className={styles.tableCellEmpty}>—</span>
                                                    )}
                                                </td>
                                            );
                                        }

                                        const checked = moduleAllChecked(module, col, selectedPermissions, isGrantedByRole);
                                        const indet = moduleAllIndeterminate(module, col, selectedPermissions, isGrantedByRole);
                                        const hasColActions = module.submodules?.some(
                                            (sub) => actionsForColumn(col, sub).length > 0,
                                        );

                                        return (
                                            <td key={col.key} className={styles.colAction}>
                                                {hasColActions ? (
                                                    <input
                                                        type="checkbox"
                                                        className={styles.tableCheckbox}
                                                        checked={checked}
                                                        ref={(el) => {
                                                            if (el) el.indeterminate = indet;
                                                        }}
                                                        onChange={(e) => onModuleColumnToggle(module, col, e.target.checked)}
                                                        aria-label={`${col.label} for ${module.name}`}
                                                    />
                                                ) : (
                                                    <span className={styles.tableCellEmpty}>—</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>

                                {isExpanded && module.submodules?.map((sub) => {
                                    const subPerms = modulePerms[sub.id] || {};
                                    const subLabel = sub.id === 'leads'
                                        ? (sub.name || 'Inquiry / Lead')
                                        : (sub.name || sub.id);

                                    return (
                                        <tr key={`${module.id}-${sub.id}`} className={styles.tableRowChild}>
                                            <td className={styles.colName}>
                                                <span className={styles.tableChildName}>{subLabel}</span>
                                            </td>
                                            {visibleColumns.map((col) => {
                                                if (col.key === 'all') {
                                                    const acts = (sub.actions || []).map(normalizeAction);
                                                    const allOn = acts.length > 0 && acts.every(
                                                        (a) => isGrantedByRole(module.id, sub.id, a.id)
                                                            || !!subPerms[a.id],
                                                    );
                                                    return (
                                                        <td key={col.key} className={styles.colAction}>
                                                            {acts.length ? (
                                                                <input
                                                                    type="checkbox"
                                                                    className={styles.tableCheckbox}
                                                                    checked={allOn}
                                                                    onChange={(e) => onSubmoduleAllToggle(
                                                                        module.id,
                                                                        sub,
                                                                        e.target.checked,
                                                                    )}
                                                                    aria-label={`All for ${subLabel}`}
                                                                />
                                                            ) : (
                                                                <span className={styles.tableCellEmpty}>—</span>
                                                            )}
                                                        </td>
                                                    );
                                                }

                                                return (
                                                    <td key={col.key} className={styles.colAction}>
                                                        <CellCheckboxes
                                                            moduleId={module.id}
                                                            submodule={sub}
                                                            column={col}
                                                            subPerms={subPerms}
                                                            isGrantedByRole={isGrantedByRole}
                                                            onToggle={onPermissionToggle}
                                                            compact
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
