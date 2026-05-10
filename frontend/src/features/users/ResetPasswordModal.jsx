import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Lock, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import styles from './ResetPasswordModal.module.scss';

export const ResetPasswordModal = ({ closeModal, user }) => {
    const { register, handleSubmit, watch, formState: { errors } } = useForm();
    const { success, error: showError } = useToast();
    const [showPasswords, setShowPasswords] = useState({ new: false, confirm: false });
    const [loading, setLoading] = useState(false);

    const newPassword = watch('newPassword', '');
    const confirmPassword = watch('confirmPassword', '');

    // Password validation
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
        setLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));

        // In real app, update password in database
        success(`Password reset successfully for ${user.name}`);

        setLoading(false);
        closeModal();
    };

    return (
        <div className={styles.container}>
            <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                <div className={styles.userInfo}>
                    <p>Resetting password for:</p>
                    <p className={styles.userName}><strong>{user.name}</strong> ({user.username})</p>
                </div>

                {/* New Password */}
                <div className={styles.inputGroup}>
                    <Input
                        label="New Password"
                        type={showPasswords.new ? 'text' : 'password'}
                        {...register('newPassword', { required: 'Password is required' })}
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
                        Reset Password
                    </Button>
                </div>
            </form>
        </div>
    );
};
