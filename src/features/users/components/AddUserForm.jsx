import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Select } from '@/components/ui';
import { userService } from '@/services/user.service';
import styles from './AddUserForm.module.scss';
import { toast } from 'react-hot-toast';

export const AddUserForm = ({ user = null, onSave, closeModal }) => {
    const isEdit = !!user;
    const [metadata, setMetadata] = useState([]);
    const [roles, setRoles] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [expandedModules, setExpandedModules] = useState({});
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
                const [metaRes, rolesRes, deptsRes] = await Promise.all([
                    userService.getPermissionMetadata(),
                    userService.getRoles(),
                    userService.getDepartments()
                ]);

                if (metaRes.success) setMetadata(metaRes.data);
                if (rolesRes.success) setRoles(rolesRes.data);
                if (deptsRes.success) setDepartments(deptsRes.data);
            } catch (error) {
                console.error("Failed to fetch form metadata", error);
                toast.error("Failed to load form data");
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    // Update permissions when role changes
    useEffect(() => {
        if (!isEdit && selectedRole) {
            const roleObj = roles.find(r => r._id === selectedRole || r.id === selectedRole);
            if (roleObj && roleObj.permissions) {
                setSelectedPermissions(roleObj.permissions);
                setValue('additionalPermissions', roleObj.permissions);
            }
        }
    }, [selectedRole, isEdit, setValue, roles]);

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

    const handleClearAll = () => {
        setSelectedPermissions({});
        setValue('additionalPermissions', {});
    };

    const handleUppercaseChange = (fieldName) => (e) => {
        const upperValue = e.target.value.toUpperCase();
        setValue(fieldName, upperValue);
    };

    const onSubmit = async (data) => {
        const { confirmPassword, _id, createdAt, updatedAt, __v, lastLogin, preferences, permissions, ...userData } = data;
        userData.additionalPermissions = selectedPermissions;

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

    if (isLoading) return <div className={styles.loading}>Loading form configuration...</div>;

    return (
        <div className={styles.container}>
            <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>

                {/* Basic Information */}
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Basic Information</h3>
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
                        <Input label="Mobile" {...register('mobile')} placeholder="Optional" />
                    </div>
                </section>

                {/* Password (only for new users) */}
                {!isEdit && (
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Password</h3>
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
                    </section>
                )}

                {/* Organization & Status */}
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Organization & Status</h3>
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
                        <div className={styles.toggleGroup}>
                            <label className={styles.toggleLabel}>
                                <input type="checkbox" {...register('isActive')} className={styles.checkbox} />
                                <span>Active User</span>
                            </label>
                        </div>
                    </div>
                </section>

                {/* Permissions */}
                <section className={styles.section}>
                    <div className={styles.permissionHeader}>
                        <h3 className={styles.sectionTitle}>Module Permissions</h3>
                        <div className={styles.permissionActions}>
                            <button type="button" onClick={handleSelectAll} className={styles.linkButton}>✅ Select All</button>
                            <button type="button" onClick={handleClearAll} className={styles.linkButton}>❌ Clear All</button>
                        </div>
                    </div>

                    <div className={styles.modulesContainer}>
                        {metadata?.map((module) => {
                            const isExpanded = expandedModules[module.id];
                            const modulePerms = selectedPermissions[module.id] || {};
                            const hasAnyPermission = Object.values(modulePerms).some(sub => Object.values(sub).some(val => !!val));

                            return (
                                <div key={module.id} className={`${styles.moduleGroup} ${isExpanded ? styles.expanded : ''}`}>
                                    <div className={styles.moduleHeader} onClick={() => toggleModuleExpansion(module.id)}>
                                        <div className={styles.moduleTitleRow}>
                                            <span className={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
                                            <h4 className={`${styles.moduleTitle} ${hasAnyPermission ? styles.activeModule : ''}`}>
                                                {module.name || module.label || module.title || (module.id?.charAt(0).toUpperCase() + module.id?.slice(1)) || 'Untitled Module'}
                                            </h4>
                                        </div>
                                        <div className={styles.groupActions} onClick={e => e.stopPropagation()}>
                                            <button type="button" className={styles.groupLinkButton} onClick={() => handleModuleSelection(module, true)}>ALLOW ALL</button>
                                            <button type="button" className={styles.groupLinkButton} onClick={() => handleModuleSelection(module, false)}>DENY ALL</button>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className={styles.submodulesList}>
                                            {module.submodules?.map((sub) => {
                                                const subPerms = modulePerms[sub.id] || {};
                                                const hasSubPermission = Object.values(subPerms).some(val => !!val);

                                                return (
                                                    <div key={sub.id} className={styles.submoduleItem}>
                                                        <div className={styles.submoduleHeader}>
                                                            <span className={`${styles.submoduleTitle} ${hasSubPermission ? styles.activeSubmodule : ''}`}>
                                                                {sub.name || sub.label || sub.title || (sub.id?.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')) || 'Untitled'}
                                                            </span>
                                                            <div className={styles.submoduleActions}>
                                                                <button type="button" onClick={() => handleSubmoduleSelection(module.id, sub, true)}>All</button>
                                                                <button type="button" onClick={() => handleSubmoduleSelection(module.id, sub, false)}>None</button>
                                                            </div>
                                                        </div>
                                                        <div className={styles.actionGrid}>
                                                            {sub.actions?.map((action) => {
                                                                const actionId = typeof action === 'string' ? action : action.id;
                                                                const actionLabel = typeof action === 'string' ? (action.charAt(0).toUpperCase() + action.slice(1)) : action.label;

                                                                return (
                                                                    <label key={actionId} className={styles.actionItem}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!subPerms[actionId]}
                                                                            onChange={() => handlePermissionToggle(module.id, sub.id, actionId)}
                                                                            className={styles.checkbox}
                                                                        />
                                                                        <span>{actionLabel}</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Actions */}
                <div className={styles.actions}>
                    <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
                    <Button type="submit" isLoading={isSubmitting}>{isEdit ? 'Update User' : 'Create User'}</Button>
                </div>
            </form>
        </div>
    );
};
