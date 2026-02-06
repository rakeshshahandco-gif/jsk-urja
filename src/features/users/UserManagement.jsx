import React, { useState, useMemo, useEffect } from 'react';
import { Button, useModal } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { AddUserForm } from './components/AddUserForm';
import { UserPlus } from 'lucide-react';
import { userService } from '@/services/user.service';
import { ROLE_CONFIG, PERMISSION_LABELS, ROLES } from '@/utils/permissions';
import styles from './UserManagement.module.scss';
import { toast } from 'react-hot-toast'; // Assuming toast is available or use console

export const UserManagement = () => {
    const { openModal } = useModal();
    const { user: currentUser, updateUserProfile } = useAuth();
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchUsers = async () => {
        try {
            setIsLoading(true);
            const response = await userService.getAllUsers();
            if (response.success && Array.isArray(response.data)) {
                setUsers(response.data);
            } else {
                console.error("Invalid users response", response);
            }
        } catch (error) {
            console.error("Failed to fetch users", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

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
            onSave: async (newUser) => {
                try {
                    const response = await userService.createUser(newUser);
                    if (response.success) {
                        toast.success("User created successfully");
                        fetchUsers();
                    }
                } catch (error) {
                    console.error("Create user failed", error);
                    toast.error(error.message || "Failed to create user");
                }
            }
        });
    };

    const handleEditUser = (user) => {
        openModal(AddUserForm, {
            title: 'Edit User',
            size: 'lg',
            user,
            onSave: async (updatedData) => {
                try {
                    const response = await userService.updateUser(user._id, updatedData);
                    if (response.success) {
                        toast.success("User updated successfully");

                        // Update local list optimistic or re-fetch
                        setUsers(prev => prev.map(u => u._id === user._id ? response.data : u));

                        // If editing current logged-in user, update auth context
                        if (user._id === currentUser._id) {
                            updateUserProfile(response.data);
                        }
                    }
                } catch (error) {
                    console.error("Update user failed", error);
                    toast.error(error.message || "Failed to update user");
                }
            }
        });
    };

    const handleToggleStatus = async (user) => {
        try {
            const newStatus = !user.isActive;
            const response = await userService.updateUser(user._id, { isActive: newStatus });
            if (response.success) {
                setUsers(prev => prev.map(u => u._id === user._id ? { ...u, isActive: newStatus } : u));
                toast.success(`User ${newStatus ? 'activated' : 'deactivated'}`);
            }
        } catch (error) {
            console.error("Toggle status failed", error);
            toast.error("Failed to update status");
        }
    };

    const handleDeleteUser = async (user) => {
        if (confirm('Are you sure you want to delete this user?')) {
            try {
                await userService.deleteUser(user._id);
                setUsers(prev => prev.filter(u => u._id !== user._id));
                toast.success("User deleted");
            } catch (error) {
                console.error("Delete failed", error);
                toast.error("Failed to delete user");
            }
        }
    };

    const handleResetPassword = (userId) => {
        alert(`Password reset link sent to user (Implement separately via email service)`);
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
                        {isLoading ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>Loading users...</td></tr>
                        ) : sortedUsers.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No users found</td></tr>
                        ) : sortedUsers.map((user) => {
                            const roleConfig = ROLE_CONFIG[user.role] || {};
                            const isAdmin = user.role === ROLES.ADMIN;
                            const isCurrentUser = user._id === currentUser?._id;

                            return (
                                <tr key={user._id} className={isAdmin ? styles.adminRow : ''}>
                                    <td className={styles.nameCell}>
                                        {user.name?.toUpperCase()}
                                        {isCurrentUser && (
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
                                        {getPermissionsSummary(user.permissions || [])}
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
                                                onClick={() => handleToggleStatus(user)}
                                                title={user.isActive ? 'Disable User' : 'Enable User'}
                                                disabled={isCurrentUser}
                                            >
                                                {user.isActive ? '⏸️' : '▶️'}
                                            </button>
                                            <button
                                                className={styles.actionButton}
                                                onClick={() => handleResetPassword(user._id)}
                                                title="Reset Password"
                                            >
                                                🔑
                                            </button>
                                            <button
                                                className={styles.actionButton}
                                                onClick={() => handleDeleteUser(user)}
                                                title="Delete User"
                                                disabled={isCurrentUser}
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
