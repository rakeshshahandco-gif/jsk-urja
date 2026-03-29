import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject } from '@/services/prdApi';
import { Button } from '@/components/ui';
import { 
    ArrowLeft, Info, Cpu, PenTool, Wrench, 
    CheckSquare, FileWarning, RefreshCw, 
    ShieldCheck, Activity, Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './PrdProjectDetailPage.module.scss';
import clsx from 'clsx';
import moment from 'moment';

import PrdComponentTab from './components/PrdComponentTab';
import PrdDesignTab from './components/PrdDesignTab';
import PrdPrototypeTab from './components/PrdPrototypeTab';
import PrdTestingTab from './components/PrdTestingTab';
import PrdIssueTab from './components/PrdIssueTab';
import PrdChangeLogTab from './components/PrdChangeLogTab';
import PrdApprovalTab from './components/PrdApprovalTab';
import PrdAuditTab from './components/PrdAuditTab';

const TABS = [
    { id: 'basic', label: 'Basic Details', icon: Info },
    { id: 'components', label: 'IC / Component Research', icon: Cpu },
    { id: 'designs', label: 'Design & Schematic', icon: PenTool },
    { id: 'prototypes', label: 'Prototype Builds', icon: Wrench },
    { id: 'testing', label: 'Product Testing', icon: CheckSquare },
    { id: 'ecn', label: 'Engineering Change Log', icon: RefreshCw },
    { id: 'issues', label: 'Failure Analysis', icon: FileWarning },
    { id: 'approvals', label: 'Approvals & Release', icon: ShieldCheck },
    { id: 'audit', label: 'Audit Trail', icon: Activity },
];

const PrdProjectDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('basic');

    const fetchProjectDetails = async () => {
        setLoading(true);
        try {
            const data = await getProject(id);
            setProject(data);
        } catch (error) {
            toast.error(error.message || 'Failed to fetch project details');
            navigate('/prd/projects');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) fetchProjectDetails();
    }, [id]);

    if (loading) return <div className={styles.loader}>Loading Product Engineering Data...</div>;
    if (!project) return null;

    return (
        <div className={styles.container}>
            {/* Top Bar Navigation */}
            <div className={styles.topHeader}>
                <button onClick={() => navigate('/prd/projects')} className={styles.backBtn}>
                    <ArrowLeft size={20} /> Back to Register
                </button>
                <div className={styles.headerActions}>
                    <Button variant="outline" onClick={() => fetchProjectDetails()}>
                        <RefreshCw size={16} /> Refresh
                    </Button>
                </div>
            </div>

            {/* Product Identity Header */}
            <div className={styles.identityHeader}>
                <div className={styles.idLeft}>
                    <div className={styles.codeWrap}>
                        <h1>{project.productCode}</h1>
                        <span className={styles.revBadge}>v{project.currentRevisionNo}</span>
                    </div>
                    <h2>{project.productName}</h2>
                    <div className={styles.meta}>
                        <span>{project.category}</span>
                        {project.productType && <><span className={styles.dot}>•</span><span>{project.productType}</span></>}
                        {project.customerName && <><span className={styles.dot}>•</span><span>Client: {project.customerName}</span></>}
                    </div>
                </div>
                
                <div className={styles.idRight}>
                    <div className={styles.statusBlock}>
                        <div className={styles.sLabel}>Current Stage</div>
                        <div className={styles.stageValue}>{project.currentStage}</div>
                    </div>
                    <div className={styles.statusBlock}>
                        <div className={styles.sLabel}>Overall Status</div>
                        <div className={clsx(styles.statusValue, styles[`status_${project.status.replace(/\s+/g, '')}`])}>
                            {project.status}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Layout Grid */}
            <div className={styles.layoutGrid}>
                {/* Left Sidebar Tabs */}
                <div className={styles.verticalTabs}>
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                className={clsx(styles.tabBtn, activeTab === tab.id && styles.activeTab)}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <Icon size={18} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Right Content Area */}
                <div className={styles.contentArea}>
                    
                    {activeTab === 'basic' && (
                        <div className={styles.tabContent}>
                            <h3 className={styles.tabTitle}>Basic Master Details</h3>
                            
                            <div className={styles.cardGrid}>
                                <div className={styles.infoCard}>
                                    <h4>R&D Ownership</h4>
                                    <div className={styles.kvList}>
                                        <div className={styles.kvRow}><span>Project Owner:</span> <strong>{project.rdOwner?.name || '-'}</strong></div>
                                        <div className={styles.kvRow}><span>Hardware Developer:</span> <strong>{project.hardwareDeveloper?.name || '-'}</strong></div>
                                        <div className={styles.kvRow}><span>Firmware Developer:</span> <strong>{project.firmwareDeveloper?.name || '-'}</strong></div>
                                        <div className={styles.kvRow}><span>Testing Engineer:</span> <strong>{project.testingEngineer?.name || '-'}</strong></div>
                                    </div>
                                </div>
                                
                                <div className={styles.infoCard}>
                                    <h4>Timeline</h4>
                                    <div className={styles.kvList}>
                                        <div className={styles.kvRow}><span>Start Date:</span> <strong>{moment(project.startDate).format('DD MMM YYYY')}</strong></div>
                                        <div className={styles.kvRow}><span>Target Completion:</span> <strong>{project.targetCompletionDate ? moment(project.targetCompletionDate).format('DD MMM YYYY') : '-'}</strong></div>
                                        <div className={styles.kvRow}><span>Last Updated:</span> <strong>{moment(project.updatedAt).format('DD MMM YYYY HH:mm')}</strong></div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.fullCard}>
                                <h4>Remarks & Objectives</h4>
                                <p className={styles.remarksText}>{project.remarks || 'No remarks provided.'}</p>
                            </div>

                            <div className={styles.fullCard}>
                                <h4>Initial Specifications / Documents</h4>
                                {project.attachments && project.attachments.length > 0 ? (
                                    <div className={styles.docGrid}>
                                        {project.attachments.map((doc, idx) => (
                                            <a 
                                                key={idx} 
                                                href={`${import.meta.env.VITE_API_URL || ''}/${doc.url}`} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className={styles.docItem}
                                                download={doc.filename}
                                            >
                                                <Download size={20} className={styles.docIcon} />
                                                <div className={styles.docInfo}>
                                                    <span className={styles.docName}>{doc.filename}</span>
                                                    <span className={styles.docSize}>{(doc.size / 1024).toFixed(1)} KB</span>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <div className={styles.emptyText}>No initial documents attached.</div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'components' && <PrdComponentTab projectId={project._id} />}
                    {activeTab === 'designs' && <PrdDesignTab projectId={project._id} />}
                    {activeTab === 'prototypes' && <PrdPrototypeTab projectId={project._id} />}
                    {activeTab === 'testing' && <PrdTestingTab projectId={project._id} projectCategory={project.category} />}
                    {activeTab === 'issues' && <PrdIssueTab projectId={project._id} />}
                    {activeTab === 'changes' && <PrdChangeLogTab projectId={project._id} />}
                    {activeTab === 'approvals' && <PrdApprovalTab projectId={project._id} />}
                    {activeTab === 'audits' && <PrdAuditTab projectId={project._id} />}

                    {!['basic', 'components', 'designs', 'prototypes', 'testing', 'issues', 'changes', 'approvals', 'audits'].includes(activeTab) && (
                        <div className={styles.tabContent}>
                            <div className={styles.wipState}>
                                <div className={styles.wipIcon}>🚧</div>
                                <h3>{TABS.find(t => t.id === activeTab)?.label}</h3>
                                <p>This submodule is scheduled for Phase 3-6 deployment.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PrdProjectDetailPage;
