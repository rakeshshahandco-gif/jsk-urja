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
            <div className={styles.loginCard}>
                <div className={styles.loginHeader}>
                    <h1 className={styles.companyName}>JSK URJA</h1>
                    <h2 className={styles.title}>CRM Application</h2>
                    <p className={styles.subtitle}>Sign in to your account</p>
                </div>

                <form onSubmit={handleSubmit} className={styles.loginForm}>
                    {error && (
                        <div className={styles.errorBanner}>
                            {error}
                        </div>
                    )}

                    <div className={styles.inputGroup}>
                        <Input
                            label="Username or Email"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            placeholder="Enter your username"
                            startIcon={<User size={18} />}
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
                            placeholder="Enter your password"
                            startIcon={<Lock size={18} />}
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

                    <Button
                        type="submit"
                        className={styles.loginButton}
                        isLoading={loading}
                        disabled={loading}
                    >
                        {loading ? 'Signing In...' : 'Sign In'}
                    </Button>
                </form>

                {/* <div className={styles.demoCredentials}>
                    <p className={styles.demoTitle}>Demo Credentials:</p>
                    <div className={styles.demoList}>
                        <div><strong>Admin:</strong> admin / admin123</div>
                        <div><strong>Manager:</strong> manager / manager123</div>
                        <div><strong>Staff:</strong> staff / staff123</div>
                        <div><strong>Viewer:</strong> viewer / viewer123</div>
                    </div>
                </div> */}
            </div>
        </div>
    );
};
