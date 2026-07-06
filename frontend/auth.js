/**
 * auth.js — Shared Authentication Utilities
 * Handles signup, login, logout, and session management via backend REST APIs and JWT.
 */

const AUTH_TOKEN_KEY = 'erp_token';
const AUTH_USERNAME_KEY = 'erp_username';
const AUTH_ROLE_KEY = 'erp_role';

/**
 * Register a new user. Returns Promise<{ success, message }>.
 */
async function signup(username, password, roleId) {
    const trimmed = username.trim();
    if (!trimmed || !password) {
        return { success: false, message: 'Username and password are required.' };
    }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: trimmed,
                password: password,
                role_id: roleId
            })
        });

        return await response.json();
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, message: 'Server connection failed.' };
    }
}

/**
 * Authenticate user credentials. Returns Promise<{ success, message }>.
 */
async function login(username, password) {
    const trimmed = username.trim();
    if (!trimmed || !password) {
        return { success: false, message: 'Please enter both username and password.' };
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: trimmed,
                password: password
            })
        });

        const data = await response.json();
        if (data.success) {
            // Store JWT session details
            sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
            sessionStorage.setItem(AUTH_USERNAME_KEY, data.user.username);
            sessionStorage.setItem(AUTH_ROLE_KEY, data.user.role);
        }
        return data;
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, message: 'Server connection failed.' };
    }
}

/**
 * Get the currently logged-in username, or null if not logged in.
 */
function getLoggedInUser() {
    return sessionStorage.getItem(AUTH_USERNAME_KEY);
}

/**
 * Get the active JWT token, or null.
 */
function getAuthToken() {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Get user authorization role name.
 */
function getAuthRole() {
    return sessionStorage.getItem(AUTH_ROLE_KEY);
}

/**
 * Log out the current user and redirect to login page.
 */
function logout() {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USERNAME_KEY);
    sessionStorage.removeItem(AUTH_ROLE_KEY);
    window.location.href = 'login.html';
}

/**
 * Guard: redirect to login if no active session. Call on protected pages.
 */
function requireAuth() {
    if (!getAuthToken() || !getLoggedInUser()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

/**
 * Guard: redirect to dashboard if already logged in. Call on login/signup pages.
 */
function redirectIfLoggedIn() {
    if (getAuthToken() && getLoggedInUser()) {
        window.location.href = 'index.html';
        return true;
    }
    return false;
}
