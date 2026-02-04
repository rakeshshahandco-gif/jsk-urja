import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Select } from '@/components/ui';
import { ROLES, PERMISSIONS, PERMISSION_LABELS, getPermissionsForRole } from '@/utils/permissions';
import styles from './AddUserForm.module.scss';

export const AddUserForm = ({ user = null, onSave, closeModal }) => {
    const isEdit = !!user;
    const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
        defaultValues: user ? {
            ...user,
            name: user.name?.toUpperCase() || '',
        } : {
            name: '',
            username: '',
            email: '',
            mobile: '',
            password: '',
            confirmPassword: '',
            role: ROLES.STAFF,
            isActive: true,
            permissions: []
        }
    });

    const selectedRole = watch('role');
    const [selectedPermissions, setSelectedPermissions] = useState(user?.permissions || []);

    // Update permissions when role changes
    useEffect(() => {
        if (!isEdit) { // Only auto-set for new users
            const rolePermissions = getPermissionsForRole(selectedRole);
            setSelectedPermissions(rolePermissions);
            setValue('permissions', rolePermissions);
        }
    }, [selectedRole, isEdit, setValue]);

    const handlePermissionToggle = (permission) => {
        const newPermissions = selectedPermissions.includes(permission)
            ? selectedPermissions.filter(p => p !== permission)
            : [...selectedPermissions, permission];

        setSelectedPermissions(newPermissions);
        setValue('permissions', newPermissions);
    };

    const handleSelectAll = () => {
        const allPermissions = Object.values(PERMISSIONS);
        setSelectedPermissions(allPermissions);
        setValue('permissions', allPermissions);
    };

    const handleClearAll = () => {
        setSelectedPermissions([]);
        setValue('permissions', []);
    };

    // Helper function to convert input to uppercase
    const handleUppercaseChange = (fieldName) => (e) => {
        const upperValue = e.target.value.toUpperCase();
        setValue(fieldName, upperValue);
    };

    const onSubmit = (data) => {
        const { confirmPassword, ...userData } = data;
        userData.permissions = selectedPermissions;

        // Validation
        if (!isEdit && data.password !== confirmPassword) {
            alert('Passwords do not match!');
            return;
        }

        onSave(userData);
        closeModal();
    };

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
                            onChange={handleUppercaseChange('name')}
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
                        <Input
                            label="Email"
                            type="email"
                            {...register('email')}
                            placeholder="Optional"
                        />

                        <Input
                            label="Mobile"
                            {...register('mobile')}
                            icon Label="Optional"
                        />
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
                                {...register('password', { required: 'Password is required' })}
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

                {/* Role & Status */}
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Role & Status</h3>

                    <div className={styles.row2}>
                        <Select
                            label="Role"
                            {...register('role', { required: true })}
                            options={[
                                { value: ROLES.ADMIN, label: '🔴 Admin' },
                                { value: ROLES.MANAGER, label: '🟡 Manager' },
                                { value: ROLES.STAFF, label: '🔵 Staff' },
                                { value: ROLES.VIEWER, label: '⚪ Viewer' }
                            ]}
                            required
                        />

                        <div className={styles.toggleGroup}>
                            <label className={styles.toggleLabel}>
                                <input
                                    type="checkbox"
                                    {...register('isActive')}
                                    className={styles.checkbox}
                                />
                                <span>Active User</span>
                            </label>
                        </div>
                    </div>
                </section>

                {/* Permissions */}
                <section className={styles.section}>
                    <div className={styles.permissionHeader}>
                        <h3 className={styles.sectionTitle}>Permissions</h3>
                        <div className={styles.permissionActions}>
                            <button type="button" onClick={handleSelectAll} className={styles.linkButton}>
                                Select All
                            </button>
                            <button type="button" onClick={handleClearAll} className={styles.linkButton}>
                                Clear All
                            </button>
                        </div>
                    </div>

                    <div className={styles.permissionGrid}>
                        {Object.entries(PERMISSIONS).map(([key, permission]) => (
                            <label key={permission} className={styles.permissionItem}>
                                <input
                                    type="checkbox"
                                    checked={selectedPermissions.includes(permission)}
                                    onChange={() => handlePermissionToggle(permission)}
                                    className={styles.checkbox}
                                />
                                <span>{PERMISSION_LABELS[permission]}</span>
                            </label>
                        ))}
                    </div>

                    <div className={styles.permissionCount}>
                        {selectedPermissions.length} permission{selectedPermissions.length !== 1 ? 's' : ''} selected
                    </div>
                </section>

                {/* Actions */}
                <div className={styles.actions}>
                    <Button type="button" variant="outline" onClick={closeModal}>
                        Cancel
                    </Button>
                    <Button type="submit" isLoading={isSubmitting}>
                        {isEdit ? 'Update User' : 'Create User'}
                    </Button>
                </div>
            </form>
        </div>
    );
};
