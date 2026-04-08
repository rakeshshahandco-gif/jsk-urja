import React, { useState, useEffect } from 'react';
import { 
    BarChart3, Microscope, Search, Filter, 
    ArrowUpDown, CheckCircle2, XCircle, Clock,
    Info, DollarSign, Globe2, MoreHorizontal
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getRdComparisonReport, getRdProjects } from '../../../services/rdSampleApi';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import { Badge } from '../../../components/ui/Badge';

const RdComparisonPage = () => {
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [samples, setSamples] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            const res = await getRdProjects();
            setProjects(res.data.data || []);
        } catch (error) {
            toast.error('Failed to fetch projects');
        }
    };

    const handleFetchReport = async (projectId) => {
        if (!projectId) {
            setSamples([]);
            return;
        }
        try {
            setLoading(true);
            const res = await getRdComparisonReport(projectId);
            setSamples(res.data.data || []);
        } catch (error) {
            toast.error('Failed to fetch comparison data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        handleFetchReport(selectedProject);
    }, [selectedProject]);

    const ComparisonTable = () => {
        if (!selectedProject) return (
            <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <BarChart3 className="mx-auto text-gray-300 w-12 h-12 mb-3" />
                <p className="text-gray-500">Select a project to compare samples side-by-side.</p>
            </div>
        );

        if (loading) return <div className="text-center py-20">Analysing sample data...</div>;

        if (samples.length === 0) return (
            <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <p className="text-gray-500">No samples found for the selected project.</p>
            </div>
        );

        return (
            <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
                    <thead>
                        <tr className="bg-gray-100/50 border-b">
                            <th className="p-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-64">Parameters</th>
                            {samples.map(sample => (
                                <th key={sample._id} className="p-4 text-left border-l min-w-[250px]">
                                    <div className="flex flex-col">
                                        <div className="text-blue-700 font-bold">{sample.itemName}</div>
                                        <div className="text-xs text-gray-500">{sample.supplierName}</div>
                                        <div className="mt-2">
                                            <Badge variant={sample.finalSelectionStatus === 'Final Selected' ? 'success' : 'default'} className="text-[10px]">
                                                {sample.finalSelectionStatus}
                                            </Badge>
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        <tr>
                            <td className="p-4 bg-gray-50/30 font-semibold text-sm">Unit Rate & Currency</td>
                            {samples.map(sample => (
                                <td key={sample._id} className="p-4 border-l font-mono text-sm font-bold">
                                    {sample.currency} {sample.unitRate}
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="p-4 bg-gray-50/30 font-semibold text-sm">Landed Cost (approx)</td>
                            {samples.map(sample => (
                                <td key={sample._id} className="p-4 border-l font-mono text-sm text-blue-700 font-bold">
                                    ₹{sample.landedCost}
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="p-4 bg-gray-50/30 font-semibold text-sm">Source / Country</td>
                            {samples.map(sample => (
                                <td key={sample._id} className="p-4 border-l text-sm">
                                    <div className="flex items-center gap-1">
                                        {sample.supplierCountry === 'China' ? <Globe2 size={14} className="text-red-500" /> : <Globe2 size={14} className="text-orange-500" />}
                                        {sample.supplierCountry} ({sample.purchaseSource})
                                    </div>
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="p-4 bg-gray-50/30 font-semibold text-sm">Testing Status</td>
                            {samples.map(sample => (
                                <td key={sample._id} className="p-4 border-l text-sm">
                                    <div className="flex items-center gap-2">
                                        {sample.testStatus === 'Approved' ? <CheckCircle2 size={16} className="text-green-500" /> : <Clock size={16} className="text-yellow-500" />}
                                        {sample.testStatus}
                                    </div>
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="p-4 bg-gray-50/30 font-semibold text-sm">Technical Specifications</td>
                            {samples.map(sample => (
                                <td key={sample._id} className="p-4 border-l text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                                    {sample.technicalSpec || 'N/A'}
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="p-4 bg-gray-50/30 font-semibold text-sm">Manufacturer / Brand</td>
                            {samples.map(sample => (
                                <td key={sample._id} className="p-4 border-l text-sm">
                                    <div className="font-medium">{sample.manufacturerName || '-'}</div>
                                    <div className="text-xs text-gray-500">{sample.brand || ''}</div>
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="p-4 bg-gray-50/30 font-semibold text-sm">General Notes</td>
                            {samples.map(sample => (
                                <td key={sample._id} className="p-4 border-l text-xs text-gray-500">
                                    {sample.notes || '-'}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <BarChart3 className="text-blue-600" />
                        Sample Comparison Report
                    </h1>
                    <p className="text-gray-500">Side-by-side technical and cost analysis of R&D samples.</p>
                </div>
            </div>

            <Card className="mb-6 p-4">
                <div className="flex items-center gap-4">
                    <div className="w-80">
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Selected Project</label>
                        <Select 
                            value={selectedProject} 
                            onChange={(e) => setSelectedProject(e.target.value)}
                        >
                            <option value="">Select a project to compare</option>
                            {projects.map(p => (
                                <option key={p._id} value={p._id}>{p.projectName} - {p.productName}</option>
                            ))}
                        </Select>
                    </div>
                </div>
            </Card>

            <ComparisonTable />
        </div>
    );
};

export default RdComparisonPage;
