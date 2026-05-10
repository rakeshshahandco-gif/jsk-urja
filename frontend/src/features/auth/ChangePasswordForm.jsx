import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { Lock, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import styles from './ChangePasswordForm.module.scss';

export const ChangePasswordForm = ({ closeModal }) => {
    const { user } = useAuth();
    const { register, handleSubmit, watch, formState: { errors } } = useForm();
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const newPassword = watch('newPassword', '');
    const confirmPassword = watch('confirmPassword', '');

    // Password strength validation
    const passwordValidation = {
        minLength: newPassword.length >= 8,
        hasNumber: /\d/.test(newPassword),
        hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword),
        matches: newPassword && newPassword === confirmPassword
    };

    const isPasswordValid = Object.values(passwordValidation).every(v => v);

    const togglePasswordVisibility = (field) => {
        setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
    };

    const onSubmit = async (data) => {
        setError('');
        setLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock validation - in real app, verify against backend
        if (data.currentPassword !== 'admin123') { // Mock check
            setError('Current password is incorrect');
            setLoading(false);
            return;
        }

        if (data.newPassword !== data.confirmPassword) {
            setError('New passwords do not match');
            setLoading(false);
            return;
        }

        // Success
        setSuccess(true);
        setLoading(false);

        // Close modal after 2 seconds
        setTimeout(() => {
            closeModal();
            // Optionally logout user to force re-login
            // logout();
        }, 2000);
    };

    if (success) {
        return (
            <div className={styles.successContainer}>
                <CheckCircle size={64} className={styles.successIcon} />
                <h2>Password Changed Successfully!</h2>
                <p>Your password has been updated.</p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                {error && (
                    <div className={styles.errorBanner}>
                        <XCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Current Password */}
                <div className={styles.inputGroup}>
                    <Input
                        label="Current Password"
                        type={showPasswords.current ? 'text' : 'password'}
                        {...register('currentPassword', { required: 'Current password is required' })}
                        error={errors.currentPassword}
                        startIcon={<Lock size={18} />}
                        endIcon={
                            <button
                                type="button"
                                onClick={() => togglePasswordVisibility('current')}
                                className={styles.toggleButton}
                            >
                                {showPasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        }
                        required
                    />
                </div>

                {/* New Password */}
                <div className={styles.inputGroup}>
                    <Input
                        label="New Password"
                        type={showPasswords.new ? 'text' : 'password'}
                        {...register('newPassword', { required: 'New password is required' })}
                        error={errors.newPassword}
                        startIcon={<Lock size={18} />}
                        endIcon={
                            <button
                                type="button"
                                onClick={() => togglePasswordVisibility('new')}
                                className={styles.toggleButton}
                            >
                                {showPasswords.new ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        }
                        required
                    />
                </div>

                {/* Confirm Password */}
                <div className={styles.inputGroup}>
                    <Input
                        label="Confirm New Password"
                        type={showPasswords.confirm ? 'text' : 'password'}
                        {...register('confirmPassword', { required: 'Please confirm password' })}
                        error={errors.confirmPassword}
                        startIcon={<Lock size={18} />}
                        endIcon={
                            <button
                                type="button"
                                onClick={() => togglePasswordVisibility('confirm')}
                                className={styles.toggleButton}
                            >
                                {showPasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        }
                        required
                    />
                </div>

                {/* Password Requirements */}
                {newPassword && (
                    <div className={styles.requirements}>
                        <p className={styles.requirementsTitle}>Password Requirements:</p>
                        <div className={styles.requirement}>
                            {passwordValidation.minLength ? (
                                <CheckCircle size={16} className={styles.valid} />
                            ) : (
                                <XCircle size={16} className={styles.invalid} />
                            )}
                            <span>At least 8 characters</span>
                        </div>
                        <div className={styles.requirement}>
                            {passwordValidation.hasNumber ? (
                                <CheckCircle size={16} className={styles.valid} />
                            ) : (
                                <XCircle size={16} className={styles.invalid} />
                            )}
                            <span>Contains at least 1 number</span>
                        </div>
                        <div className={styles.requirement}>
                            {passwordValidation.hasSpecial ? (
                                <CheckCircle size={16} className={styles.valid} />
                            ) : (
                                <XCircle size={16} className={styles.invalid} />
                            )}
                            <span>Contains at least 1 special character</span>
                        </div>
                        {confirmPassword && (
                            <div className={styles.requirement}>
                                {passwordValidation.matches ? (
                                    <CheckCircle size={16} className={styles.valid} />
                                ) : (
                                    <XCircle size={16} className={styles.invalid} />
                                )}
                                <span>Passwords match</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className={styles.actions}>
                    <Button type="button" variant="outline" onClick={closeModal}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        isLoading={loading}
                        disabled={loading || !isPasswordValid}
                    >
                        Update Password
                    </Button>
                </div>
            </form>
        </div>
    );
};
