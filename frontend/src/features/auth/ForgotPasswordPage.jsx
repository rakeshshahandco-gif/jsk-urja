import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { sendResetEmail } from '@/utils/passwordReset';
import styles from './ForgotPasswordPage.module.scss';

export const ForgotPasswordPage = () => {
    const { register, handleSubmit, formState: { errors } } = useForm();
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [resetToken, setResetToken] = useState(''); // For testing

    const onSubmit = async (data) => {
        setLoading(true);

        try {
            const result = await sendResetEmail(data.email);
            if (result.success) {
                setResetToken(result.token); // Store for testing
                setSubmitted(true);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.successContent}>
                        <CheckCircle size={64} className={styles.successIcon} />
                        <h1 className={styles.title}>Check Your Email</h1>
                        <p className={styles.subtitle}>
                            If an account exists with that email address, we&apos;ve sent you a password reset link.
                        </p>
                        <p className={styles.hint}>
                            The link will expire in 30 minutes.
                        </p>

                        {/* For testing only - show the reset link */}
                        {resetToken && (
                            <div className={styles.testLink}>
                                <p><strong>For Testing:</strong></p>
                                <Link to={`/reset-password?token=${resetToken}`} className={styles.resetLink}>
                                    Click here to reset password
                                </Link>
                            </div>
                        )}

                        <Link to="/login" className={styles.backLink}>
                            <ArrowLeft size={16} />
                            Back to Login
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <h1 className={styles.companyName}>JSK URJA</h1>
                    <h2 className={styles.title}>Forgot Password?</h2>
                    <p className={styles.subtitle}>
                        Enter your email address and we&apos;ll send you a link to reset your password.
                    </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                    <Input
                        label="Email Address"
                        type="email"
                        {...register('email', {
                            required: 'Email is required',
                            pattern: {
                                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                message: 'Invalid email address'
                            }
                        })}
                        error={errors.email}
                        startIcon={<Mail size={18} />}
                        placeholder="Enter your email"
                        autoFocus
                        required
                    />

                    <Button
                        type="submit"
                        isLoading={loading}
                        disabled={loading}
                        className={styles.submitButton}
                    >
                        {loading ? 'Sending...' : 'Send Reset Link'}
                    </Button>

                    <Link to="/login" className={styles.backLink}>
                        <ArrowLeft size={16} />
                        Back to Login
                    </Link>
                </form>
            </div>
        </div>
    );
};
