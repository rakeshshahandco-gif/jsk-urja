import { getPermissionsForRole } from './permissions';

// Mock users for testing
export const MOCK_USERS = [
    {
        id: 1,
        name: 'John Admin',
        username: 'admin',
        email: 'admin@crm.com',
        password: 'admin123', // In real app, this would be hashed
        role: 'admin',
        permissions: ['*'],
        isActive: true,
        lastLogin: new Date().toISOString()
    },
    {
        id: 2,
        name: 'Jane Manager',
        username: 'manager',
        email: 'manager@crm.com',
        password: 'manager123',
        role: 'manager',
        permissions: getPermissionsForRole('manager'),
        isActive: true,
        lastLogin: '2026-01-24T10:30:00'
    },
    {
        id: 3,
        name: 'Bob Staff',
        username: 'staff',
        email: 'staff@crm.com',
        password: 'staff123',
        role: 'staff',
        permissions: getPermissionsForRole('staff'),
        isActive: true,
        lastLogin: '2026-01-24T14:15:00'
    },
    {
        id: 4,
        name: 'Alice Viewer',
        username: 'viewer',
        email: 'viewer@crm.com',
        password: 'viewer123',
        role: 'viewer',
        permissions: getPermissionsForRole('viewer'),
        isActive: true,
        lastLogin: '2026-01-23T09:00:00'
    }
];

// Mock login function
export const mockLogin = async (username, password) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const user = MOCK_USERS.find(
        u => (u.username === username || u.email === username) && u.password === password
    );

    if (!user) {
        throw new Error('Invalid username or password');
    }

    if (!user.isActive) {
        throw new Error('User account is disabled');
    }

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    return {
        ...userWithoutPassword,
        token: `mock_token_${user.id}_${Date.now()}` // Mock JWT token
    };
};

// Mock logout
export const mockLogout = async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return true;
};

// Storage keys
export const AUTH_STORAGE_KEY = 'crm_auth_user';
export const TOKEN_STORAGE_KEY = 'crm_auth_token';

// Save auth data to localStorage
export const saveAuthData = (user, token) => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
};

// Get auth data from localStorage
export const getAuthData = () => {
    try {
        const userStr = localStorage.getItem(AUTH_STORAGE_KEY);
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);

        if (!userStr || !token) return null;

        return {
            user: JSON.parse(userStr),
            token
        };
    } catch (error) {
        console.error('Error reading auth data:', error);
        return null;
    }
};

// Clear auth data
export const clearAuthData = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
};

// Check if user is authenticated
export const isAuthenticated = () => {
    const authData = getAuthData();
    return !!authData && !!authData.token;
};
