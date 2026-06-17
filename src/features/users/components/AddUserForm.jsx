import React, { useState, useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Input, Select } from '@/components/ui';
import { userService } from '@/services/user.service';
import { listCompanies } from '@/services/companyApi';
import { useCompany } from '@/contexts/CompanyContext';
import { hasPermission as checkRolePermission } from '@/utils/permissions';
import styles from './AddUserForm.module.scss';
import { toast } from 'react-hot-toast';
import { getFlattenedMenu } from '@/config/menu.config';
import { UserPermissionTable } from './UserPermissionTable';
import { buildVisibleColumns, actionsForColumn, normalizeAction } from './permissionTableConfig';
import {
    mergePermissionMetadata,
    DEFAULT_EXPANDED_MODULES,
    sortModulesForTable,
} from './permissionMetadataMerge';

export const AddUserForm = ({ user = null, onSave, closeModal }) => {
    const isEdit = !!user;
    const { selectedCompany } = useCompany();
    const [searchTerm, setSearchTerm] = useState('');
     const [metadata, setMetadata] = useState([]);
    const [roles, setRoles] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [users, setUsers] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [assignedCompanyIds, setAssignedCompanyIds] = useState(
        (user?.assignedCompanyIds || []).map((c) => String(c._id || c)),
    );
    const [companyAccessConfigured, setCompanyAccessConfigured] = useState(!!user?.companyAccessConfigured);
    const [isLoading, setIsLoading] = useState(true);

    // Permission groups: maps every module id to a human-friendly category.
    // Any new module not listed here is automatically rendered under "Other Modules"
    // (so the UI never breaks when a new module is added to the registry or menu).
    const PERMISSION_GROUPS = [
        { id: 'home', name: '🏠 Home & Dashboard', modules: ['home'] },
        { id: 'crm', name: '💼 CRM & Customers', modules: ['crm', 'customers'] },
        { id: 'tasks', name: '📋 Tasks & Workflow', modules: ['tasks'] },
        { id: 'communications', name: '💬 Communications', modules: ['messenger', 'whatsapp', 'wechat'] },
        { id: 'sales', name: '🛒 Sales', modules: ['sales'] },
        { id: 'purchase', name: '📦 Purchase', modules: ['purchase'] },
        { id: 'inventory', name: '📥 Inventory', modules: ['inventory'] },
        { id: 'production', name: '🏭 Production', modules: ['production'] },
        { id: 'vouchers', name: '🧾 Voucher Entry & Accounts', modules: ['voucher_entry', 'account_master', 'accounts', 'accounts_reports'] },
        { id: 'taxes', name: '💰 Taxes (GST / TDS / TCS)', modules: ['gst', 'tds', 'tcs'] },
        { id: 'fixed_assets', name: '🏢 Fixed Assets', modules: ['fixed_assets'] },
        { id: 'service', name: '🛠 Service & Support', modules: ['service'] },
        { id: 'rd', name: '🔬 R&D / Product Development', modules: ['prd', 'rd_samples'] },
        { id: 'hr', name: '👥 HR Management', modules: ['hr'] },
        { id: 'mis_reports', name: '📊 MIS & Reports', modules: ['mis', 'reports'] },
        { id: 'admin', name: '⚙️ Admin & Settings', modules: ['admin'] }
    ];

    const [expandedModules, setExpandedModules] = useState({ ...DEFAULT_EXPANDED_MODULES });
    const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
        defaultValues: user ? {
            ...user,
            name: user.name?.toUpperCase() || '',
            role: user.role?._id || user.role || '',
            department: user.department?._id || user.department || '',
        } : {
            name: '',
            username: '',
            email: '',
            mobile: '',
            password: '',
            confirmPassword: '',
            role: '',
            department: '',
            isActive: true,
            additionalPermissions: {}
        }
    });

    const selectedRole = watch('role');
    const [selectedPermissions, setSelectedPermissions] = useState(user?.additionalPermissions || {});

    // Fetch Metadata, Roles, Departments
    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                const results = await Promise.allSettled([
                    userService.getPermissionMetadata(),
                    userService.getRoles(),
                    userService.getDepartments(),
                    userService.getAllUsers(),
                    listCompanies(),
                ]);

                const [metaRes, rolesRes, deptsRes, usersRes, companiesList] = results.map((r, i) => {
                    if (r.status === 'fulfilled') return r.value;
                    console.error(`API Call failed index ${i}:`, r.reason);
                    return { success: false, data: [] };
                });

                const flattenedMenu = getFlattenedMenu();
                const merged = mergePermissionMetadata(
                    metaRes.success ? metaRes.data : [],
                    flattenedMenu,
                );
                setMetadata(merged);

                if (rolesRes.success) setRoles(rolesRes.data);
                else console.warn("Roles failed to load", rolesRes);

                if (deptsRes.success) setDepartments(deptsRes.data);
                else console.warn("Departments failed to load", deptsRes);

                if (usersRes?.status === 'fulfilled' && usersRes.value?.success) setUsers(usersRes.value.data);
                else if (usersRes?.success) setUsers(usersRes.data);
                else console.warn("Users failed to load", usersRes);

                setCompanies(Array.isArray(companiesList) ? companiesList : []);

                if (!isEdit && selectedCompany?._id) {
                    setAssignedCompanyIds([String(selectedCompany._id)]);
                    setCompanyAccessConfigured(true);
                }

                if (!metaRes.success || !rolesRes.success || !deptsRes.success) {
                    toast.error("Partial data load: some features may be limited");
                }
            } catch (error) {
                console.error("Critical form load failure:", error);
                toast.error("Failed to load form data");
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [isEdit, selectedCompany?._id]);

    const toggleAssignedCompany = (companyId) => {
        const id = String(companyId);
        setAssignedCompanyIds((prev) => (
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        ));
    };

    // Default role permissions (if any) based on selectedRole
    const defaultRolePerms = useMemo(() => {
        if (!selectedRole || !roles.length) return {};
        const roleObj = roles.find(r => r._id === selectedRole || r.id === selectedRole);
        return roleObj?.permissions || {};
    }, [selectedRole, roles]);

    // Update permissions when role changes ONLY for new users, to set a baseline if needed.
    // For existing users, we maintain their saved additional permissions.
    useEffect(() => {
        if (!isEdit && selectedRole && Object.keys(selectedPermissions).length === 0) {
           // On new user creation, usually we leave additionalPermissions empty
           // because the role covers the basics.
        }
    }, [selectedRole, isEdit]);

    // Check if the current Role already grants a specific permission
    const isGrantedByRole = (moduleId, submoduleId, actionId) => {
        if (!selectedRole || !roles.length) return false;
        const roleObj = roles.find(r => r._id === selectedRole || r.id === selectedRole);
        if (!roleObj) return false;

        // If it's a superadmin/admin role or has '*' wildcard
        if (roleObj.name?.toLowerCase().includes('admin') || roleObj.isSystemRole) return true;
        if (roleObj.permissions?.['*']) return true;

        // Deep check
        return !!(roleObj.permissions?.[moduleId]?.[submoduleId]?.[actionId] || 
                  roleObj.permissions?.[moduleId]?.[actionId]);
    };

    const handlePermissionToggle = (moduleId, submoduleId, actionId) => {
        setSelectedPermissions(prev => {
            const moduleData = prev[moduleId] || {};
            const submoduleData = moduleData[submoduleId] || {};
            const newVal = !submoduleData[actionId];

            const updated = {
                ...prev,
                [moduleId]: {
                    ...moduleData,
                    [submoduleId]: {
                        ...submoduleData,
                        [actionId]: newVal
                    }
                }
            };
            setValue('additionalPermissions', updated);
            return updated;
        });
    };

    const toggleModuleExpansion = (moduleId) => {
        setExpandedModules(prev => ({
            ...prev,
            [moduleId]: !prev[moduleId]
        }));
    };

    const handleSubmoduleSelection = (moduleId, submodule, isSelect) => {
        setSelectedPermissions(prev => {
            const moduleData = prev[moduleId] || {};
            const submoduleData = { ...(moduleData[submodule.id] || {}) };

            submodule.actions.forEach(action => {
                const actionId = typeof action === 'string' ? action : action.id;
                submoduleData[actionId] = isSelect;
            });

            const updated = {
                ...prev,
                [moduleId]: {
                    ...moduleData,
                    [submodule.id]: submoduleData
                }
            };
            setValue('additionalPermissions', updated);
            return updated;
        });
    };

    const handleModuleSelection = (module, isSelect) => {
        setSelectedPermissions(prev => {
            const moduleData = { ...(prev[module.id] || {}) };

            module.submodules.forEach(sub => {
                const submoduleData = {};
                sub.actions.forEach(action => {
                    const actionId = typeof action === 'string' ? action : action.id;
                    submoduleData[actionId] = isSelect;
                });
                moduleData[sub.id] = submoduleData;
            });

            const updated = {
                ...prev,
                [module.id]: moduleData
            };
            setValue('additionalPermissions', updated);
            return updated;
        });
    };

    const handleModuleColumnToggle = (module, column, isSelect) => {
        setSelectedPermissions(prev => {
            const moduleData = { ...(prev[module.id] || {}) };
            module.submodules.forEach((sub) => {
                const submoduleData = { ...(moduleData[sub.id] || {}) };
                actionsForColumn(column, sub).forEach((action) => {
                    if (!isGrantedByRole(module.id, sub.id, action.id)) {
                        submoduleData[action.id] = isSelect;
                    }
                });
                moduleData[sub.id] = submoduleData;
            });
            const updated = { ...prev, [module.id]: moduleData };
            setValue('additionalPermissions', updated);
            return updated;
        });
    };

    const handleSelectAll = () => {
        const all = {};
        metadata.forEach(module => {
            const moduleData = {};
            module.submodules.forEach(sub => {
                const submoduleData = {};
                sub.actions.forEach(action => {
                    const actionId = typeof action === 'string' ? action : action.id;
                    submoduleData[actionId] = true;
                });
                moduleData[sub.id] = submoduleData;
            });
            all[module.id] = moduleData;
        });
        setSelectedPermissions(all);
        setValue('additionalPermissions', all);
    };

    const handleSelectAllGlobal = (isSelect) => {
        if (!isSelect) {
            setSelectedPermissions({});
            setValue('additionalPermissions', {});
            return;
        }
        handleSelectAll();
    };

    const handleUppercaseChange = (fieldName) => (e) => {
        const upperValue = e.target.value.toUpperCase();
        setValue(fieldName, upperValue);
    };

    const onSubmit = async (data) => {
        const { confirmPassword, _id, createdAt, updatedAt, __v, lastLogin, preferences, permissions, ...userData } = data;
        userData.additionalPermissions = selectedPermissions;
        userData.assignedCompanyIds = companyAccessConfigured ? assignedCompanyIds : [];
        userData.companyAccessConfigured = companyAccessConfigured;

        if (!isEdit && data.password !== confirmPassword) {
            toast.error('Passwords do not match!');
            return;
        }

        try {
            await onSave(userData);
            closeModal();
        } catch (error) {
            console.error("Form submission error:", error);
        }
    };

    const filteredMetadata = searchTerm ? metadata.filter(m => 
        m.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        m.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.submodules?.some(s => s.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    ) : metadata;

    const tableModules = useMemo(
        () => sortModulesForTable(filteredMetadata),
        [filteredMetadata],
    );

    const visibleColumns = useMemo(() => buildVisibleColumns(filteredMetadata), [filteredMetadata]);

    const globalAllChecked = useMemo(() => {
        if (!tableModules.length) return false;
        return tableModules.every((module) =>
            module.submodules?.every((sub) =>
                (sub.actions || []).map(normalizeAction).every(
                    (a) => isGrantedByRole(module.id, sub.id, a.id)
                        || !!selectedPermissions[module.id]?.[sub.id]?.[a.id],
                ),
            ),
        );
    }, [tableModules, selectedPermissions, selectedRole, roles]);

    if (isLoading) return <div className={styles.loading}>Loading form configuration...</div>;

    return (
        <div className={styles.container}>
            <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>

                <section className={styles.card}>
                    <h3 className={styles.sectionTitle}>User Details</h3>
                    <div className={styles.row2}>
                        <Input
                            label="Full Name"
                            {...register('name', { required: 'Name is required' })}
                            error={errors.name}
                            onChange={(e) => {
                                register('name').onChange(e);
                                handleUppercaseChange('name')(e);
                            }}
                            required
                        />
                        <Input
                            label="Username"
                            {...register('username', { required: 'Username is required' })}
                            error={errors.username}
                            required
                            disabled={isEdit}
                        />
                    </div>
                    <div className={styles.row2}>
                        <Input label="Email" type="email" {...register('email')} placeholder="Optional" />
                        <Input label="Mobile Number" {...register('mobile')} placeholder="Optional" />
                    </div>
                    <div className={styles.row3}>
                        <Select
                            label="Role"
                            {...register('role', { required: 'Role is required' })}
                            options={roles.map(r => ({ value: r._id, label: r.name }))}
                            error={errors.role}
                            required
                        />
                        <Select
                            label="Department"
                            {...register('department')}
                            options={[{ value: '', label: 'None' }, ...departments.map(d => ({ value: d._id, label: d.name }))]}
                        />
                        <div className={styles.statusField}>
                            <span className={styles.statusLabel}>Status</span>
                            <label className={styles.statusToggle}>
                                <input type="checkbox" {...register('isActive')} className={styles.tableCheckbox} />
                                <span>Active</span>
                            </label>
                        </div>
                    </div>
                    <div className={styles.row2} style={{ marginTop: 12 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <span className={styles.statusLabel}>Company Access</span>
                            <label className={styles.statusToggle} style={{ display: 'flex', marginTop: 6, marginBottom: 8 }}>
                                <input
                                    type="checkbox"
                                    checked={companyAccessConfigured}
                                    onChange={(e) => setCompanyAccessConfigured(e.target.checked)}
                                />
                                <span>Restrict user to selected companies only</span>
                            </label>
                            {companyAccessConfigured && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                                    {companies.map((c) => (
                                        <label key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
                                            <input
                                                type="checkbox"
                                                checked={assignedCompanyIds.includes(String(c._id))}
                                                onChange={() => toggleAssignedCompany(c._id)}
                                            />
                                            {c.companyName}
                                        </label>
                                    ))}
                                </div>
                            )}
                            {!companyAccessConfigured && (
                                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                                    Legacy mode — user can access all companies (JSK default).
                                </p>
                            )}
                        </div>
                    </div>
                    {!isEdit && (
                        <div className={styles.row2}>
                            <Input
                                label="Password"
                                type="password"
                                {...register('password', {
                                    required: 'Password is required',
                                    minLength: { value: 6, message: 'Password must be at least 6 characters' }
                                })}
                                error={errors.password}
                                required
                            />
                            <Input
                                label="Confirm Password"
                                type="password"
                                {...register('confirmPassword', { required: 'Please confirm password' })}
                                error={errors.confirmPassword}
                                required
                            />
                        </div>
                    )}
                </section>

                <section className={styles.card}>
                    <div className={styles.permissionHeader}>
                        <h3 className={styles.sectionTitle}>Module Permissions</h3>
                        <div className={styles.permissionActions}>
                            <div className={styles.searchWrapper}>
                                <input
                                    type="text"
                                    placeholder="Search module..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={styles.searchInput}
                                />
                            </div>
                            <select
                                className={styles.copySelect}
                                onChange={(e) => {
                                    const userId = e.target.value;
                                    if (userId && window.confirm('Copy permissions from this user? This will overwrite current selections.')) {
                                        const sourceUser = users.find(u => u._id === userId);
                                        if (sourceUser) {
                                            setSelectedPermissions(sourceUser.additionalPermissions || {});
                                            setValue('additionalPermissions', sourceUser.additionalPermissions || {});
                                            toast.success(`Copied permissions from ${sourceUser.name}`);
                                        }
                                    }
                                    e.target.value = '';
                                }}
                            >
                                <option value="">Copy from user...</option>
                                {users.filter(u => u._id !== (user?._id || '')).map(u => (
                                    <option key={u._id} value={u._id}>{u.name} ({u.roleName || u.role?.name})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <UserPermissionTable
                        modules={tableModules}
                        columns={visibleColumns}
                        expandedModules={{
                            ...expandedModules,
                            ...(searchTerm
                                ? Object.fromEntries(tableModules.map((m) => [m.id, true]))
                                : {}),
                        }}
                        selectedPermissions={selectedPermissions}
                        isGrantedByRole={isGrantedByRole}
                        onToggleModuleExpansion={toggleModuleExpansion}
                        onPermissionToggle={handlePermissionToggle}
                        onModuleColumnToggle={handleModuleColumnToggle}
                        onModuleAllToggle={handleModuleSelection}
                        onSubmoduleAllToggle={handleSubmoduleSelection}
                        onSelectAllGlobal={handleSelectAllGlobal}
                        globalAllChecked={globalAllChecked}
                    />
                </section>

                <div className={styles.actions}>
                    <Button type="button" variant="outline" onClick={() => { if (window.confirm('Discard changes?')) closeModal(); }}>Cancel</Button>
                    <Button type="submit" isLoading={isSubmitting}>{isEdit ? 'Update User' : 'Create User'}</Button>
                </div>
            </form>
        </div>
    );
};
