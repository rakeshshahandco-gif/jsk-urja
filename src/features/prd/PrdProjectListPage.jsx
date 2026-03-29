import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Modal, Select } from '@/components/ui';
import { getProjects, deleteProject } from '@/services/prdApi';
import { Search, Plus, Trash2, Edit, Eye, Filter, Download } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import styles from './PrdProjectListPage.module.scss';
import clsx from 'clsx';
import PrdProjectForm from './PrdProjectForm';

const PrdProjectListPage = () => {
    const navigate = useNavigate();
    const { hasPermission, user } = useAuth();
    
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [stageFilter, setStageFilter] = useState('');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const limit = 15;

    // Modal
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editProject, setEditProject] = useState(null);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const params = {
                page: currentPage,
                limit,
                search: searchTerm,
                category: categoryFilter,
                status: statusFilter,
                currentStage: stageFilter
            };
            const data = await getProjects(params);
            setProjects(data.results || []);
            setTotalPages(data.totalPages || 1);
            setTotalResults(data.totalResults || 0);
        } catch (error) {
            toast.error(error.message || 'Failed to load PRD Projects');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, [currentPage, searchTerm, categoryFilter, statusFilter, stageFilter]);

    const handleCreate = () => {
        setEditProject(null);
        setIsFormOpen(true);
    };

    const handleEdit = (project) => {
        setEditProject(project);
        setIsFormOpen(true);
    };

    const handleView = (project) => {
        navigate(`/prd/projects/${project._id}`);
    };

    const handleDelete = async (project) => {
        if (window.confirm(`SUPER ADMIN ACTION: Are you absolutely sure you want to hard delete Product ${project.productCode}? This cannot be undone.`)) {
            try {
                await deleteProject(project._id);
                toast.success('Project deleted successfully');
                fetchProjects();
            } catch (error) {
                toast.error(error.message || 'Error deleting project');
            }
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.titleInfo}>
                    <h1>Product Development Register</h1>
                    <span className={styles.badge}>{totalResults} Total Projects</span>
                </div>
                
                <div className={styles.actions}>
                    <Button variant="outline" onClick={() => {}} title="Export Excel">
                        <Download size={18} /> Export
                    </Button>
                    <Button variant="primary" onClick={handleCreate}>
                        <Plus size={18} /> New Product
                    </Button>
                </div>
            </div>

            <div className={styles.filtersSection}>
                <div className={styles.searchBox}>
                    <Search className={styles.searchIcon} size={18} />
                    <Input
                        placeholder="Search by Code, Name, or Customer..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>
                
                <div className={styles.filters}>
                    <Filter className={styles.filterIcon} size={18} />
                    <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                        <option value="">All Categories</option>
                        <option value="Dimmable Driver">Dimmable Driver</option>
                        <option value="Smart Switch">Smart Switch</option>
                        <option value="Controller">Controller</option>
                        <option value="DALI Driver">DALI Driver</option>
                        <option value="Other">Other</option>
                    </select>

                    <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                        <option value="">All Stages</option>
                        <option value="Concept">Concept</option>
                        <option value="Component Search">Component Search</option>
                        <option value="Schematic Design">Schematic Design</option>
                        <option value="PCB Design">PCB Design</option>
                        <option value="Prototype Assembly">Prototype Assembly</option>
                        <option value="Initial Testing">Initial Testing</option>
                        <option value="Design Change">Design Change</option>
                        <option value="Re-Testing">Re-Testing</option>
                        <option value="Approval">Approval</option>
                        <option value="Released to Production">Released to Production</option>
                    </select>

                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">All Statuses</option>
                        <option value="Open">Open</option>
                        <option value="Under Development">Under Development</option>
                        <option value="Prototype Ready">Prototype Ready</option>
                        <option value="Testing Running">Testing Running</option>
                        <option value="Change Required">Change Required</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                        <option value="On Hold">On Hold</option>
                        <option value="Released">Released</option>
                    </select>
                </div>
            </div>

            <div className={styles.tableContainer}>
                {loading ? (
                    <div className={styles.loader}>Loading Master Register...</div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Product Code</th>
                                <th>Product Name</th>
                                <th>Category</th>
                                <th>Customer</th>
                                <th>Current Rev</th>
                                <th>Stage</th>
                                <th>Status</th>
                                <th>R&D Owner</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projects.map((proj) => (
                                <tr key={proj._id}>
                                    <td className={styles.codeCell} onClick={() => handleView(proj)}>
                                        {proj.productCode}
                                    </td>
                                    <td>
                                        <strong>{proj.productName}</strong>
                                        <div className={styles.subtext}>{proj.productType}</div>
                                    </td>
                                    <td>{proj.category}</td>
                                    <td>{proj.customerName || '-'}</td>
                                    <td><span className={styles.revBadge}>v{proj.currentRevisionNo}</span></td>
                                    <td>
                                        <span className={styles.stageBadge}>{proj.currentStage}</span>
                                    </td>
                                    <td>
                                        <span className={clsx(styles.statusBadge, styles[`status_${proj.status.replace(/\s+/g, '')}`])}>
                                            {proj.status}
                                        </span>
                                    </td>
                                    <td>{proj.rdOwner?.name || '-'}</td>
                                    <td>
                                        <div className={styles.actionButtons}>
                                            <button onClick={() => handleView(proj)} title="Open Project" className={styles.btnView}>
                                                <Eye size={16} /> Open
                                            </button>
                                            <button onClick={() => handleEdit(proj)} title="Edit Master" className={styles.btnIcon}>
                                                <Edit size={16} />
                                            </button>
                                            {user?.roleName === 'superadmin' && (
                                                <button onClick={() => handleDelete(proj)} title="Hard Delete" className={styles.btnDelete}>
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {projects.length === 0 && (
                                <tr>
                                    <td colSpan="9" className={styles.emptyState}>No PRD Projects found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Controls */}
            {!loading && totalPages > 1 && (
                <div className={styles.pagination}>
                    <span>Page {currentPage} of {totalPages}</span>
                    <div className={styles.pageButtons}>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => prev - 1)}
                        >
                            Previous
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => prev + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {isFormOpen && (
                <PrdProjectForm
                    isOpen={isFormOpen}
                    onClose={() => setIsFormOpen(false)}
                    project={editProject}
                    onSuccess={fetchProjects}
                />
            )}
        </div>
    );
};

export default PrdProjectListPage;
