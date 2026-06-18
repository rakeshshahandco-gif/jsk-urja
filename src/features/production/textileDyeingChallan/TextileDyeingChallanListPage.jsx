import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getTextileJobWorkProcessConfig } from '@/utils/textileJobWorkProcessConfig';
import { listTextileJobWorkChallans, getTextileJobWorkChallanEligibility } from '@/services/textileJobWorkChallanApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

export function TextileJobWorkChallanListPage({ processType = 'Dyeing' }) {
    const cfg = getTextileJobWorkProcessConfig(processType);
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isTextile || !selectedCompany?._id) return setLoading(false);
        getTextileJobWorkChallanEligibility(selectedCompany._id, processType)
            .then((e) => { if (!e.eligible) toast.error(e.message || 'Not eligible'); })
            .catch(() => {});
        listTextileJobWorkChallans(processType, { companyId: selectedCompany._id })
            .then(setRows)
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [isTextile, selectedCompany?._id, processType]);

    if (!isTextile) {
        return <div style={{ padding: 24 }}>{cfg.issueTitle} is only available for Textile / Handloom companies.</div>;
    }
    if (loading) return <BrandedLoader size={100} />;

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{cfg.issueTitle}</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{cfg.listSubtitle}</p>
                </div>
                <button type="button" onClick={() => navigate(cfg.paths.new)}
                    style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, cursor: 'pointer' }}>
                    + New Issue Challan
                </button>
            </div>
            {rows.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>{cfg.emptyListText}</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {rows.map((r) => (
                        <div key={r._id} onClick={() => navigate(cfg.paths.detail(r._id))}
                            style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                <strong>{r.challanNo}</strong>
                                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: '#f5f3ff', color: '#6d28d9' }}>{r.status}</span>
                            </div>
                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
                                {r.dyerName} · Issued {r.totalIssuedMeter} m · Pending {r.totalPendingMeter} m · Labour ₹{r.totalLabourAmount || 0}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function TextileDyeingChallanListPage() {
    return <TextileJobWorkChallanListPage processType="Dyeing" />;
}
