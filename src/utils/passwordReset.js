// Password reset token management
const RESET_TOKENS_KEY = 'crm_reset_tokens';
const TOKEN_EXPIRY_MINUTES = 30;

// Generate a random token
export const generateResetToken = () => {
    return 'rst_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

// Create a password reset token
export const createResetToken = (email) => {
    const tokens = getResetTokens();
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();

    tokens[token] = {
        email,
        expiresAt,
        used: false,
        createdAt: new Date().toISOString()
    };

    localStorage.setItem(RESET_TOKENS_KEY, JSON.stringify(tokens));
    return token;
};

// Validate a reset token
export const validateResetToken = (token) => {
    const tokens = getResetTokens();
    const tokenData = tokens[token];

    if (!tokenData) {
        return { valid: false, error: 'Invalid or expired token' };
    }

    if (tokenData.used) {
        return { valid: false, error: 'This reset link has already been used' };
    }

    const now = new Date();
    const expiresAt = new Date(tokenData.expiresAt);

    if (now > expiresAt) {
        return { valid: false, error: 'This reset link has expired' };
    }

    return { valid: true, email: tokenData.email };
};

// Mark token as used
export const markTokenAsUsed = (token) => {
    const tokens = getResetTokens();
    if (tokens[token]) {
        tokens[token].used = true;
        localStorage.setItem(RESET_TOKENS_KEY, JSON.stringify(tokens));
    }
};

// Get all tokens (for internal use)
const getResetTokens = () => {
    try {
        const tokens = localStorage.getItem(RESET_TOKENS_KEY);
        return tokens ? JSON.parse(tokens) : {};
    } catch {
        return {};
    }
};

// Clean up expired tokens
export const cleanupExpiredTokens = () => {
    const tokens = getResetTokens();
    const now = new Date();
    let cleaned = false;

    Object.keys(tokens).forEach(token => {
        const expiresAt = new Date(tokens[token].expiresAt);
        if (now > expiresAt) {
            delete tokens[token];
            cleaned = true;
        }
    });

    if (cleaned) {
        localStorage.setItem(RESET_TOKENS_KEY, JSON.stringify(tokens));
    }
};

// Mock: Simulate sending reset email
export const sendResetEmail = async (email) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In real app, this would send an email via backend
    // For now, we generate a token and return it (for testing)
    const token = createResetToken(email);

    // Clean up old tokens
    cleanupExpiredTokens();

    console.log(`[MOCK EMAIL] Password reset link: /reset-password?token=${token}`);
    return { success: true, token }; // In real app, wouldn't return token
};

// Reset password with token
export const resetPasswordWithToken = async (token, newPassword) => {
    const validation = validateResetToken(token);

    if (!validation.valid) {
        return { success: false, error: validation.error };
    }

    // Mock password update
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mark token as used
    markTokenAsUsed(token);

    // In real app, update password in database
    console.log(`Password reset for ${validation.email}`);

    return { success: true, email: validation.email };
};
