import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLoginBranding } from '@/hooks/useLoginBranding';
import { Button, Input } from '@/components/ui';
import { Eye, EyeOff } from 'lucide-react';
import { LoginBrandingPanel } from '@/features/auth/LoginBrandingPanel';
import styles from './LoginPage.module.scss';

export const LoginPage = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const { branding } = useLoginBranding();
    const accentColor = branding.primaryColor || '#2563eb';

    const [formData, setFormData] = useState({
        username: '',
        password: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

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
            <div className={`${styles.bgShape} ${styles.bgShape1}`} />
            <div className={`${styles.bgShape} ${styles.bgShape2}`} />
            <div className={`${styles.bgShape} ${styles.bgShape3}`} />

            <div className={styles.loginContent}>
                <LoginBrandingPanel />

                <div className={styles.cardSection}>
                    <div className={styles.loginCard}>
                        <div className={styles.loginHeader}>
                            <h2>Login</h2>
                            <p>Enter your credentials to access your account</p>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.loginForm}>
                            {error && (
                                <div className={styles.errorBanner}>
                                    {error}
                                </div>
                            )}

                            <div className={styles.inputGroup}>
                                <Input
                                    label="Email"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleChange}
                                    placeholder="name@example.com"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <Input
                                    label="Password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder="Your password"
                                    endIcon={(
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className={styles.passwordToggle}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    )}
                                    required
                                />
                            </div>

                            <div className={styles.formFooter}>
                                <Button
                                    type="submit"
                                    className={styles.loginButton}
                                    isLoading={loading}
                                    disabled={loading}
                                    style={{ backgroundColor: accentColor, borderColor: accentColor }}
                                >
                                    {loading ? 'Logging in...' : 'Login'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};
