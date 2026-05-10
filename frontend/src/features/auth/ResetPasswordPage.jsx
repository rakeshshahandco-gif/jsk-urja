import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { Lock, Eye, EyeOff, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { validateResetToken, resetPasswordWithToken } from '@/utils/passwordReset';
import styles from './ResetPasswordPage.module.scss';

export const ResetPasswordPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const { register, handleSubmit, watch, formState: { errors } } = useForm();
    const [showPasswords, setShowPasswords] = useState({ new: false, confirm: false });
    const [loading, setLoading] = useState(false);
    const [tokenValid, setTokenValid] = useState(null);
    const [tokenError, setTokenError] = useState('');
    const [success, setSuccess] = useState(false);

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

    // Validate token on mount
    useEffect(() => {
        if (!token) {
            setTokenValid(false);
            setTokenError('No reset token provided');
            return;
        }

        const validation = validateResetToken(token);
        setTokenValid(validation.valid);
        if (!validation.valid) {
            setTokenError(validation.error);
        }
    }, [token]);

    const togglePasswordVisibility = (field) => {
        setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
    };

    const onSubmit = async (data) => {
        if (!tokenValid) return;

        setLoading(true);

        try {
            const result = await resetPasswordWithToken(token, data.newPassword);

            if (result.success) {
                setSuccess(true);
                // Redirect to login after 3 seconds
                setTimeout(() => {
                    navigate('/login', { state: { message: 'Password reset successful! Please login with your new password.' } });
                }, 3000);
            } else {
                setTokenError(result.error);
                setTokenValid(false);
            }
        } catch (error) {
            setTokenError('An error occurred. Please try again.');
            setTokenValid(false);
        } finally {
            setLoading(false);
        }
    };

    // Token invalid or expired
    if (tokenValid === false) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.errorContent}>
                        <AlertCircle size={64} className={styles.errorIcon} />
                        <h1 className={styles.title}>Invalid or Expired Link</h1>
                        <p className={styles.subtitle}>{tokenError}</p>
                        <Link to="/forgot-password" className={styles.link}>
                            <Button>Request New Reset Link</Button>
                        </Link>
                        <Link to="/login" className={styles.backLink}>
                            Back to Login
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Success state
    if (success) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.successContent}>
                        <CheckCircle size={64} className={styles.successIcon} />
                        <h1 className={styles.title}>Password Reset Successful!</h1>
                        <p className={styles.subtitle}>
                            Your password has been updated. You can now login with your new password.
                        </p>
                        <p className={styles.hint}>Redirecting to login...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Loading token validation
    if (tokenValid === null) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <p>Validating reset link...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <h1 className={styles.companyName}>SHREEJAL</h1>
                    <h2 className={styles.title}>Reset Password</h2>
                    <p className={styles.subtitle}>Enter your new password below</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
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

                    <Button
                        type="submit"
                        isLoading={loading}
                        disabled={loading || !isPasswordValid}
                        className={styles.submitButton}
                    >
                        {loading ? 'Resetting...' : 'Reset Password'}
                    </Button>

                    <Link to="/login" className={styles.backLink}>
                        Back to Login
                    </Link>
                </form>
            </div>
        </div>
    );
};
