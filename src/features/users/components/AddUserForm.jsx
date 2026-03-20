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

    const handlePermissionToggle = (moduleId, actionId) => {
        setSelectedPermissions(prev => {
            const modulePerms = prev[moduleId] || {};
            const newVal = !modulePerms[actionId];
            
            const updated = {
                ...prev,
                [moduleId]: {
                    ...modulePerms,
                    [actionId]: newVal
                }
            };
            setValue('additionalPermissions', updated);
            return updated;
        });
    };

    const handleScopeChange = (moduleId, actionId, value) => {
        setSelectedPermissions(prev => {
            const modulePerms = prev[moduleId] || {};
            const updated = {
                ...prev,
                [moduleId]: {
                    ...modulePerms,
                    [actionId]: value
                }
            };
            setValue('additionalPermissions', updated);
            return updated;
        });
    };

    const handleModuleSelection = (module, isSelect) => {
        setSelectedPermissions(prev => {
            const modulePerms = { ...(prev[module.id] || {}) };
            
            module.actions.forEach(action => {
                if (action.type === 'boolean') {
                    modulePerms[action.id] = isSelect;
                } else if (action.type === 'scope' && isSelect) {
                    modulePerms[action.id] = 'Own'; // Default scope on select all
                } else if (action.type === 'scope' && !isSelect) {
                    delete modulePerms[action.id];
                }
            });

            const updated = {
                ...prev,
                [module.id]: modulePerms
            };
            setValue('additionalPermissions', updated);
            return updated;
        });
    };

    const handleSelectAll = () => {
        const all = {};
        metadata.forEach(module => {
            const modulePerms = {};
            module.actions.forEach(action => {
                if (action.type === 'boolean') modulePerms[action.id] = true;
                else if (action.type === 'scope') modulePerms[action.id] = 'Own';
            });
            all[module.id] = modulePerms;
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
                            <button type="button" onClick={handleSelectAll} className={styles.linkButton}>Select All</button>
                            <button type="button" onClick={handleClearAll} className={styles.linkButton}>Clear All</button>
                        </div>
                    </div>

                    <div className={styles.modulesContainer}>
                        {metadata.map((module) => (
                            <div key={module.id} className={styles.moduleGroup}>
                                <div className={styles.moduleHeader}>
                                    <h4 className={styles.moduleTitle}>{module.name}</h4>
                                    <div className={styles.groupActions}>
                                        <button type="button" className={styles.groupLinkButton} onClick={() => handleModuleSelection(module, true)}>SELECT ALL</button>
                                        <span className={styles.divider}>|</span>
                                        <button type="button" className={styles.groupLinkButton} onClick={() => handleModuleSelection(module, false)}>CLEAR</button>
                                    </div>
                                </div>
                                <div className={styles.permissionGrid}>
                                    {module.actions.map((action) => (
                                        <div key={action.id} className={styles.permissionItemWrapper}>
                                            {action.type === 'boolean' ? (
                                                <label className={styles.permissionItem}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selectedPermissions[module.id]?.[action.id]}
                                                        onChange={() => handlePermissionToggle(module.id, action.id)}
                                                        className={styles.checkbox}
                                                    />
                                                    <span>{action.label}</span>
                                                </label>
                                            ) : (
                                                <div className={styles.scopeControl}>
                                                    <span className={styles.scopeLabel}>{action.label}:</span>
                                                    <select
                                                        value={selectedPermissions[module.id]?.[action.id] || 'Own'}
                                                        onChange={(e) => handleScopeChange(module.id, action.id, e.target.value)}
                                                        className={styles.scopeSelect}
                                                    >
                                                        {action.options.map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
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
