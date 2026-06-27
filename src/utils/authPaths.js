/** Build login URL preserving tenant slug when present. */
export function buildLoginPath(slug = '') {
    const s = String(slug || '').trim();
    return s ? `/login/${encodeURIComponent(s)}` : '/login';
}

export function buildForgotPasswordPath(slug = '') {
    const s = String(slug || '').trim();
    return s ? `/forgot-password/${encodeURIComponent(s)}` : '/forgot-password';
}

export function buildResetPasswordPath(slug = '', token = '') {
    const base = String(slug || '').trim()
        ? `/reset-password/${encodeURIComponent(slug)}`
        : '/reset-password';
    if (!token) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}token=${encodeURIComponent(token)}`;
}
