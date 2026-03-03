import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button, Input } from '@/components/ui';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import styles from './LoginPage.module.scss';

export const LoginPage = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [formData, setFormData] = useState({
        username: '',
        password: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
        setError(''); // Clear error when user types
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await login(formData.username, formData.password);

        setLoading(false);

        if (result.success) {
            navigate('/customers/list');
        } else {
            setError(result.error || 'Login failed. Please try again.');
        }
    };

    return (
        <div className={styles.loginContainer}>
            {/* Abstract background shapes */}
            <div className={`${styles.bgShape} ${styles.bgShape1}`}></div>
            <div className={`${styles.bgShape} ${styles.bgShape2}`}></div>
            <div className={`${styles.bgShape} ${styles.bgShape3}`}></div>

            <div className={styles.loginContent}>
                {/* Left side content */}
                <div className={styles.brandingSection}>
                    <div className={styles.logoWrapper}>
                        <div className={styles.brandText}>
                            <span className={styles.focus}>JSK <span className={styles.one}>URJA</span></span>
                            <span className={styles.tagline}>CRM Application</span>
                        </div>
                    </div>

                    <div className={styles.heroText}>
                        <h1 className={styles.mainHeading}>Login into <br /> your account</h1>
                        <p className={styles.subHeading}>Elevating your business efficiency with modern CRM solutions.</p>
                    </div>
                </div>

                {/* Right side login form */}
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
                                    endIcon={
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className={styles.passwordToggle}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    }
                                    required
                                />
                            </div>

                            <div className={styles.formFooter}>
                                <Button
                                    type="submit"
                                    className={styles.loginButton}
                                    isLoading={loading}
                                    disabled={loading}
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
