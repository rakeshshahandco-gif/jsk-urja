import React, { useState, useMemo } from 'react';
import { Button, useModal } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { AddUserForm } from './components/AddUserForm';
import { UserPlus } from 'lucide-react';
import { MOCK_USERS } from '@/utils/auth';
import { ROLE_CONFIG, PERMISSION_LABELS, ROLES } from '@/utils/permissions';
import styles from './UserManagement.module.scss';

export const UserManagement = () => {
    const { openModal } = useModal();
    const { user: currentUser, updateUserProfile } = useAuth();
    const [users, setUsers] = useState(MOCK_USERS);

    // Role hierarchy for sorting (lower number = higher priority)
    const roleOrder = {
        [ROLES.ADMIN]: 1,
        [ROLES.MANAGER]: 2,
        [ROLES.STAFF]: 3,
        [ROLES.VIEWER]: 4
    };

    // Sort users: Admin first, then by role hierarchy, then by name
    const sortedUsers = useMemo(() => {
        return [...users].sort((a, b) => {
            // First, sort by role priority
            const roleComparison = roleOrder[a.role] - roleOrder[b.role];
            if (roleComparison !== 0) return roleComparison;

            // Within same role, sort by name (A-Z)
            return a.name.localeCompare(b.name);
        });
    }, [users]);

    const handleAddUser = () => {
        openModal(AddUserForm, {
            title: 'Add New User',
            size: 'lg',
            onSave: (newUser) => {
                const userWithId = {
                    ...newUser,
                    id: users.length + 1,
                    isActive: true,
                    lastLogin: null
                };
                setUsers([...users, userWithId]);
            }
        });
    };

    const handleEditUser = (user) => {
        openModal(AddUserForm, {
            title: 'Edit User',
            size: 'lg',
            user,
            onSave: (updatedUser) => {
                // Update users list
                setUsers(users.map(u => u.id === user.id ? { ...u, ...updatedUser } : u));

                // If editing current logged-in user, update auth context
                if (user.id === currentUser.id) {
                    updateUserProfile(updatedUser);
                }
            }
        });
    };

    const handleToggleStatus = (userId) => {
        setUsers(users.map(u =>
            u.id === userId ? { ...u, isActive: !u.isActive } : u
        ));
    };

    const handleDeleteUser = (userId) => {
        if (confirm('Are you sure you want to delete this user?')) {
            setUsers(users.filter(u => u.id !== userId));
        }
    };

    const handleResetPassword = (userId) => {
        alert(`Password reset link sent to user ${userId}`);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getPermissionsSummary = (permissions) => {
        if (permissions.includes('*')) return 'All Permissions';
        return `${permissions.length} permission${permissions.length !== 1 ? 's' : ''}`;
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>User Management</h1>
                    <p className={styles.subtitle}>Manage system users and their permissions</p>
                </div>
                <Button onClick={handleAddUser} startIcon={<UserPlus size={18} />}>
                    Add User
                </Button>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Full Name</th>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Permissions</th>
                            <th>Last Login</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map((user) => {
                            const roleConfig = ROLE_CONFIG[user.role] || {};
                            const isAdmin = user.role === ROLES.ADMIN;

                            return (
                                <tr key={user.id} className={isAdmin ? styles.adminRow : ''}>
                                    <td className={styles.nameCell}>
                                        {user.name.toUpperCase()}
                                        {user.id === currentUser.id && (
                                            <span className={styles.youBadge}>You</span>
                                        )}
                                    </td>
                                    <td>{user.username}</td>
                                    <td>
                                        <span
                                            className={styles.roleBadge}
                                            style={{ backgroundColor: roleConfig.color }}
                                        >
                                            {roleConfig.badge} {roleConfig.label}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`${styles.statusBadge} ${user.isActive ? styles.active : styles.inactive}`}>
                                            {user.isActive ? '✓ Active' : '✕ Inactive'}
                                        </span>
                                    </td>
                                    <td className={styles.permissionsCell}>
                                        {getPermissionsSummary(user.permissions)}
                                    </td>
                                    <td className={styles.dateCell}>{formatDate(user.lastLogin)}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button
                                                className={styles.actionButton}
                                                onClick={() => handleEditUser(user)}
                                                title="Edit User"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className={styles.actionButton}
                                                onClick={() => handleToggleStatus(user.id)}
                                                title={user.isActive ? 'Disable User' : 'Enable User'}
                                                disabled={user.id === currentUser.id}
                                            >
                                                {user.isActive ? '⏸️' : '▶️'}
                                            </button>
                                            <button
                                                className={styles.actionButton}
                                                onClick={() => handleResetPassword(user.id)}
                                                title="Reset Password"
                                            >
                                                🔑
                                            </button>
                                            <button
                                                className={styles.actionButton}
                                                onClick={() => handleDeleteUser(user.id)}
                                                title="Delete User"
                                                disabled={user.id === currentUser.id}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
