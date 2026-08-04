import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, Plus } from 'lucide-react';
import { listCompanies } from '@/services/companyApi';
import { useCompany } from '@/contexts/CompanyContext';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import ModuleHomeBackLink from '@/features/dashboard/components/ModuleHomeBackLink';

export default function CompaniesListPage() {
    const navigate = useNavigate();
    const { selectedCompany, switchCompany } = useCompany();
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await listCompanies();
            setCompanies(list || []);
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to load companies');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = companies.filter((c) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        const hay = [
            c.companyName,
            c.companyType,
            c.city,
            c.state,
            c.gstNumber,
            c.industryTemplateRef?.templateName,
            c.industryTemplateRef?.templateCode,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
    });

    const openProfile = (company) => {
        switchCompany(company);
        navigate(PATHS.SETTINGS.COMPANY_PROFILE);
    };

    return (
        <div style={{ padding: '32px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <ModuleHomeBackLink to={PATHS.SAAS_ADMIN.HOME} label="Back to Super Admin Home" />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                    <div>
                        <h1 style={{ margin: '0 0 8px', fontSize: '26px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Building2 size={28} color="#2563eb" />
                            Companies
                        </h1>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
                            Click a company to open its full profile — industry template, workflow, GST, address, and more.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate(PATHS.SETTINGS.COMPANY_PROFILE)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '10px 16px',
                            background: '#2563eb',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                        }}
                    >
                        <Plus size={16} />
                        Create New Company
                    </button>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, city, GST, industry…"
                        style={{
                            width: '100%',
                            maxWidth: 420,
                            padding: '10px 14px',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            fontSize: 14,
                            outline: 'none',
                        }}
                    />
                </div>

                {loading ? (
                    <div style={{ padding: 24, color: '#94a3b8' }}>Loading companies…</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {filtered.map((c) => {
                            const isSelected = selectedCompany?._id === c._id;
                            const industry = c.industryTemplateRef?.templateName
                                || (c.industryTemplateRef?.templateCode ? c.industryTemplateRef.templateCode : 'Not set');
                            return (
                                <button
                                    key={c._id}
                                    type="button"
                                    onClick={() => openProfile(c)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 16,
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '18px 20px',
                                        background: isSelected ? '#eff6ff' : '#fff',
                                        border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                            <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{c.companyName}</span>
                                            {c.isDefault && (
                                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8' }}>Default</span>
                                            )}
                                            {isSelected && (
                                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#2563eb', color: '#fff' }}>Active now</span>
                                            )}
                                            {!c.isActive && (
                                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#fee2e2', color: '#b91c1c' }}>Inactive</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', fontSize: 13, color: '#64748b' }}>
                                            <span><strong style={{ color: '#475569' }}>Type:</strong> {c.companyType || '—'}</span>
                                            <span><strong style={{ color: '#475569' }}>Industry:</strong> {industry}</span>
                                            {c.city && <span><strong style={{ color: '#475569' }}>City:</strong> {c.city}{c.state ? `, ${c.state}` : ''}</span>}
                                            {c.gstNumber && <span><strong style={{ color: '#475569' }}>GST:</strong> {c.gstNumber}</span>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                                        Open Profile
                                        <ChevronRight size={18} />
                                    </div>
                                </button>
                            );
                        })}
                        {filtered.length === 0 && (
                            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
                                No companies found.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
