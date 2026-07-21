import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLoginBranding } from '@/hooks/useLoginBranding';
import { Button, Input } from '@/components/ui';
import { Eye, EyeOff } from 'lucide-react';
import { LoginBrandingPanel } from '@/features/auth/LoginBrandingPanel';
import { getLoginBranding } from '@/config/loginBranding';
import { buildForgotPasswordPath } from '@/utils/authPaths';
import { verifyLocalBackendIdentity } from '@/config/localEnvGuard';
import styles from './LoginPage.module.scss';

const brand = getLoginBranding();

export const LoginPage = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const { slug } = useLoginBranding();
    const forgotPath = buildForgotPasswordPath(slug);

    const [formData, setFormData] = useState({
        username: '',
        password: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [envBlocked, setEnvBlocked] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const check = await verifyLocalBackendIdentity();
            if (cancelled) return;
            if (!check.ok) {
                setEnvBlocked(true);
                setError(check.message);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
        if (!envBlocked) setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const check = await verifyLocalBackendIdentity();
        if (!check.ok) {
            setEnvBlocked(true);
            setError(check.message);
            setLoading(false);
            return;
        }
        setEnvBlocked(false);

        const result = await login(formData.username, formData.password);

        setLoading(false);

        if (result.success) {
            navigate('/');
        } else {
            setError(result.error || 'Login failed. Please try again.');
        }
    };

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginContent}>
                <LoginBrandingPanel />

                <div className={styles.cardSection}>
                    <div className={styles.loginCard}>
                        <div className={styles.cardLogoWrap}>
                            <img
                                src={brand.companyLogo}
                                alt={brand.companyName}
                                className={styles.companyLogo}
                                onError={(e) => {
                                    if (e.currentTarget.src.includes('-ui.png') && brand.companyLogoFallback) {
                                        e.currentTarget.src = brand.companyLogoFallback;
                                    }
                                }}
                            />
                        </div>

                        <div className={styles.loginHeader}>
                            <h2>Welcome Back</h2>
                            <p>Sign in to continue to your CRM dashboard</p>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.loginForm}>
                            {error && (
                                <div className={styles.errorBanner} style={{ whiteSpace: 'pre-wrap' }}>
                                    {error}
                                </div>
                            )}

                            <div className={styles.inputGroup}>
                                <Input
                                    label="Email / User ID"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleChange}
                                    placeholder="Enter your email or user ID"
                                    required
                                    autoFocus
                                    autoComplete="username"
                                    disabled={envBlocked}
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <Input
                                    label="Password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    disabled={envBlocked}
                                    endIcon={(
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className={styles.passwordToggle}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    )}
                                    required
                                />
                            </div>

                            <div className={styles.formMeta}>
                                <Link to={forgotPath} className={styles.forgotLink}>
                                    Forgot Password?
                                </Link>
                            </div>

                            <div className={styles.formFooter}>
                                <Button
                                    type="submit"
                                    className={styles.loginButton}
                                    isLoading={loading}
                                    disabled={loading || envBlocked}
                                    style={{
                                        backgroundColor: brand.primaryColour,
                                        borderColor: brand.primaryColour,
                                    }}
                                >
                                    {loading ? 'Logging in...' : 'Login'}
                                </Button>
                            </div>
                        </form>

                        <div className={styles.cardFooter}>
                            Powered by {brand.platformName}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
