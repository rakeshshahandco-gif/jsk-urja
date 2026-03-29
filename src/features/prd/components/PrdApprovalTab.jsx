import React, { useState, useEffect } from 'react';
import { getPrdApprovals, createPrdApproval, updatePrdApproval, getPrdPrototypes } from '@/services/prdApi';
import { Button, Modal, Select } from '@/components/ui';
import { CheckCircle, XCircle, FileText, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './PrdApprovalTab.module.scss';
import clsx from 'clsx';
import moment from 'moment';

const PrdApprovalTab = ({ projectId }) => {
    const [approvals, setApprovals] = useState([]);
    const [prototypes, setPrototypes] = useState([]);
    const [loading, setLoading] = useState(true);

    const [isCreating, setIsCreating] = useState(false);
    const [selectedProto, setSelectedProto] = useState('');

    const fetchApprovals = async () => {
        setLoading(true);
        try {
            const [appRes, protoRes] = await Promise.all([
                getPrdApprovals({ projectId }),
                getPrdPrototypes({ projectId })
            ]);
            setApprovals(appRes);
            setPrototypes(protoRes.filter(p => p.status?.includes('Tested - Pass'))); // Only prototype tests that passed
        } catch (error) {
            toast.error('Failed to load approval data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) fetchApprovals();
    }, [projectId]);

    const handleInitiateApproval = async () => {
        if (!selectedProto) return toast.error('Please select a tested prototype/revision to approve');
        
        try {
            const proto = prototypes.find(p => p._id === selectedProto);
            await createPrdApproval({
                projectId,
                revisionNo: proto.revisionNo,
                approvedFor: proto.sampleType,
                date: new Date()
            });
            toast.success('Approval cycle initiated');
            setIsCreating(false);
            fetchApprovals();
        } catch (err) {
            toast.error('Failed to initiate approval');
        }
    };

    const handleSignOff = async (approvalId, role, status, remarks) => {
        try {
            const payload = {};
            if (role === 'QA') {
                payload.qaStatus = status;
                payload.qaRemarks = remarks;
            } else if (role === 'RD') {
                payload.rdStatus = status;
                payload.rdRemarks = remarks;
            } else if (role === 'MGMT') {
                payload.managementStatus = status;
                payload.managementRemarks = remarks;
            }

            await updatePrdApproval(approvalId, payload);
            toast.success(`Signed off as ${status}`);
            fetchApprovals();
        } catch (error) {
            toast.error(error.message || 'Signature failed');
        }
    };

    return (
        <div className={styles.tabWrapper}>
            <div className={styles.tabHeader}>
                <div>
                    <h3 className={styles.tabTitle}>Product Release & Approvals</h3>
                    <p className={styles.tabDesc}>Secure 3-tier routing (R&D, QA, Management) before locking a revision for mass production.</p>
                </div>
                <Button variant="primary" onClick={() => setIsCreating(true)}>
                    <FileText size={16} /> Initiate Release
                </Button>
            </div>

            {isCreating && (
                <div className={styles.initBox}>
                    <h4>Which revision is ready for production release?</h4>
                    <p className={styles.initTxt}>Only prototypes that have passed their Product Testing phase appear here.</p>
                    <div className={styles.initAction}>
                        <select className={styles.protoSelect} value={selectedProto} onChange={e => setSelectedProto(e.target.value)}>
                            <option value="">- Select Eligible Revision -</option>
                            {prototypes.map(p => (
                                <option key={p._id} value={p._id}>Rev {p.revisionNo} ({p.sampleType})</option>
                            ))}
                        </select>
                        <Button variant="primary" onClick={handleInitiateApproval}>Start Routing</Button>
                        <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className={styles.loader}>Loading...</div>
            ) : approvals.length === 0 ? (
                <div className={styles.emptyState}>No approval cycles initiated yet.</div>
            ) : (
                <div className={styles.approvalList}>
                    {approvals.map(app => (
                        <div key={app._id} className={clsx(styles.approvalCard, app.locked ? styles.lockedCard : '')}>
                            <div className={styles.cardHeader}>
                                <div className={styles.headerLeft}>
                                    <div className={styles.revBadge}>Rev: {app.revisionNo}</div>
                                    <h4 className={styles.cardTitle}>Release Approval</h4>
                                    {app.locked && <Lock size={14} className={styles.lockIcon} />}
                                </div>
                                <div className={clsx(styles.finalStatusBadge, styles[`fs_${app.finalStatus.replace(/\s+/g, '').replace(/[\/\-]/g, '')}`])}>
                                    {app.finalStatus}
                                </div>
                            </div>
                            
                            <div className={styles.roleGrid}>
                                {/* R&D Node */}
                                <ApprovalNode 
                                    title="R&D Engineering" 
                                    data={app.rdApproval} 
                                    role="RD" 
                                    approvalId={app._id} 
                                    onSign={handleSignOff} 
                                    locked={app.locked} 
                                />
                                {/* QA Node */}
                                <ApprovalNode 
                                    title="Quality Assurance" 
                                    data={app.qaApproval} 
                                    role="QA" 
                                    approvalId={app._id} 
                                    onSign={handleSignOff} 
                                    locked={app.locked} 
                                />
                                {/* MGMT Node */}
                                <ApprovalNode 
                                    title="Management" 
                                    data={app.managementApproval} 
                                    role="MGMT" 
                                    approvalId={app._id} 
                                    onSign={handleSignOff} 
                                    locked={app.locked} 
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ApprovalNode = ({ title, data, role, approvalId, onSign, locked }) => {
    const [actioning, setActioning] = useState(false);
    const [remarks, setRemarks] = useState('');

    const status = data?.status || 'Pending';
    const byName = data?.by?.name;
    const date = data?.date ? moment(data.date).format('DD MMM, HH:mm') : null;

    if (actioning && !locked) {
        return (
            <div className={styles.nodeBox}>
                <h5 className={styles.nodeTitle}>{title}</h5>
                <textarea 
                    className={styles.actionText} 
                    placeholder="Approval / Rejection Remarks..." 
                    value={remarks} 
                    onChange={e => setRemarks(e.target.value)}
                />
                <div className={styles.actionBtns}>
                    <button className={styles.btnApprove} onClick={() => { onSign(approvalId, role, 'Approved', remarks); setActioning(false); }}>
                        <CheckCircle size={14}/> Approve
                    </button>
                    <button className={styles.btnReject} onClick={() => { onSign(approvalId, role, 'Rejected', remarks); setActioning(false); }}>
                        <XCircle size={14}/> Reject
                    </button>
                    <button className={styles.btnCancel} onClick={() => setActioning(false)}>Cancel</button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.nodeBox}>
            <h5 className={styles.nodeTitle}>{title}</h5>
            <div className={styles.nodeStatus}>
                <span className={clsx(styles.statTxt, styles[`st_${status}`])}>{status}</span>
                {!locked && status === 'Pending' && (
                    <button className={styles.btnActionSmall} onClick={() => setActioning(true)}>Action</button>
                )}
            </div>
            {byName && (
                <div className={styles.nodeMeta}>
                    <div className={styles.signedBy}>{byName}</div>
                    <div className={styles.signedAt}>{date}</div>
                </div>
            )}
            {data?.remarks && (
                <div className={styles.nodeRemarks}>"{data.remarks}"</div>
            )}
        </div>
    );
};

export default PrdApprovalTab;
