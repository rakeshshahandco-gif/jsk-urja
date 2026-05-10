import React, { useState, useEffect, useMemo } from 'react';
import { Button, Input, BrandedLoader } from "@/components/ui";
import { 
    Calculator, 
    Printer, 
    FileDown, 
    PlusCircle, 
    Filter, 
    ArrowRight, 
    Calendar,
    Users
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useFYDateRange } from "@/contexts/FinancialYearContext";
import FYBadge from "@/components/ui/FYBadge";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { getAccountGroups, getLedgers } from "@/services/accountApi";
import s from "./InterestPayablePage.module.scss";

const InterestPayablePage = () => {
    const fyDateRange = useFYDateRange();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [filters, setFilters] = useState({
        from: fyDateRange.startDate,
        to: fyDateRange.endDate,
        minAmount: 0,
        rate: 12,
        selectionType: 'group', // 'group' or 'ledger'
        selectedGroup: '',
        selectedLedger: ''
    });
    const [masters, setMasters] = useState({ groups: [], ledgers: [] });

    useEffect(() => {
        const loadMasters = async () => {
            try {
                const [gs, ls] = await Promise.all([
                    getAccountGroups(),
                    getLedgers({ limit: 1000 })
                ]);
                setMasters({ groups: gs || [], ledgers: ls || [] });
                
                // Set default group to Sundry Creditors if exists
                const scGroup = gs?.find(g => g.name === 'Sundry Creditors');
                if (scGroup) {
                    setFilters(p => ({ ...p, selectedGroup: scGroup._id }));
                }
            } catch (err) {
                console.error("Failed to load masters", err);
            }
        };
        loadMasters();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Placeholder for API call
            // const res = await getInterestPayable(filters);
            // Using mock data for demonstration as per requirement
            setTimeout(() => {
                let mockData = [
                    { _id: '1', partyName: 'Aditya Enterprises', groupName: 'Sundry Creditors', principal: 1500000, rate: filters.rate, days: 90, interest: (1500000 * filters.rate * 90) / 36500 },
                    { _id: '2', partyName: 'Apex Logistics', groupName: 'Sundry Creditors', principal: 750000, rate: filters.rate, days: 45, interest: (750000 * filters.rate * 45) / 36500 },
                    { _id: '3', partyName: 'Bharat Electronics', groupName: 'Sundry Creditors', principal: 2200000, rate: filters.rate, days: 120, interest: (2200000 * filters.rate * 120) / 36500 },
                ];

                if (filters.selectionType === 'ledger' && filters.selectedLedger) {
                    const l = masters.ledgers.find(lx => lx._id === filters.selectedLedger);
                    mockData = [{
                        _id: l?._id || 'sel',
                        partyName: l?.name || 'Selected Ledger',
                        groupName: l?.groupName || 'Ledger',
                        principal: 1200000,
                        rate: filters.rate,
                        days: 60,
                        interest: (1200000 * filters.rate * 60) / 36500
                    }];
                }

                setData(mockData);
                setLoading(false);
            }, 800);
        } catch (error) {
            toast.error("Failed to calculate interest payable");
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filters.from, filters.to]);

    const totals = useMemo(() => {
        return data.reduce((acc, curr) => ({
            principal: acc.principal + curr.principal,
            interest: acc.interest + curr.interest
        }), { principal: 0, interest: 0 });
    }, [data]);

    const formatCur = (n) => (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

    const handleAction = (action) => {
        toast.success(`${action} initiated for ${data.length} records`);
    };

    const handleCreateProvision = () => {
        toast.promise(
            new Promise((resolve) => setTimeout(resolve, 1500)),
            {
                loading: 'Generating provision vouchers...',
                success: 'Interest provision vouchers created successfully!',
                error: 'Failed to create vouchers',
            }
        );
    };

    return (
        <div className={s.pageContainer}>
            <div className={s.headerSection}>
                <div>
                    <h1 className={s.title}>
                        <Calculator /> Interest Payable Statement
                    </h1>
                    <p className={s.subtitle}>
                        Calculated interest obligations on outstanding balances for the selected period
                    </p>
                </div>
                <FYBadge />
            </div>

            <div className={s.filterPanel}>
                <div className={s.filterGroup}>
                    <label>Interest Period</label>
                    <div className={s.dateRange}>
                        <Input
                            type="date"
                            className={s.dateInput}
                            value={filters.from}
                            onChange={(e) => setFilters(p => ({ ...p, from: e.target.value }))}
                        />
                        <ArrowRight className="w-4 h-4 text-slate-300" />
                        <Input
                            type="date"
                            className={s.dateInput}
                            value={filters.to}
                            onChange={(e) => setFilters(p => ({ ...p, to: e.target.value }))}
                        />
                    </div>
                </div>
                <div className={s.filterGroup} style={{ flex: 'none', width: 'auto' }}>
                    <label>Report Type</label>
                    <div className={s.radioGroup}>
                        <label className={filters.selectionType === 'group' ? s.activeRadio : ''}>
                            <input 
                                type="radio" 
                                name="selType" 
                                checked={filters.selectionType === 'group'} 
                                onChange={() => setFilters(p => ({ ...p, selectionType: 'group' }))}
                            />
                            Group
                        </label>
                        <label className={filters.selectionType === 'ledger' ? s.activeRadio : ''}>
                            <input 
                                type="radio" 
                                name="selType" 
                                checked={filters.selectionType === 'ledger'} 
                                onChange={() => setFilters(p => ({ ...p, selectionType: 'ledger' }))}
                            />
                            Ledger
                        </label>
                    </div>
                </div>

                <div className={s.filterGroup} style={{ flex: 2 }}>
                    <label>{filters.selectionType === 'group' ? 'Select Account Group' : 'Select Account Ledger'}</label>
                    {filters.selectionType === 'group' ? (
                        <SearchableSelect
                            options={masters.groups.map(g => ({ label: g.name, value: g._id }))}
                            value={filters.selectedGroup}
                            onChange={(val) => setFilters(p => ({ ...p, selectedGroup: val }))}
                            placeholder="Search group..."
                        />
                    ) : (
                        <SearchableSelect
                            options={masters.ledgers.map(l => ({ label: l.name, value: l._id, meta: l.groupName }))}
                            value={filters.selectedLedger}
                            onChange={(val) => setFilters(p => ({ ...p, selectedLedger: val }))}
                            placeholder="Search ledger..."
                        />
                    )}
                </div>

                <div className={s.filterGroup} style={{ flex: 1 }}>
                    <label>Interest Rate (% P.A.)</label>
                    <Input
                        type="number"
                        className={s.dateInput}
                        value={filters.rate}
                        onChange={(e) => setFilters(p => ({ ...p, rate: e.target.value }))}
                    />
                </div>
                <Button onClick={fetchData} className="h-12 px-8 font-bold uppercase tracking-widest text-xs">
                    <Filter className="w-4 h-4 mr-2" /> Recalculate
                </Button>
            </div>

            <div className={s.tableContainer}>
                {loading ? (
                    <div className="p-32 flex justify-center">
                        <BrandedLoader size={120} />
                    </div>
                ) : data.length > 0 ? (
                    <>
                        <table>
                            <thead>
                                <tr>
                                    <th>Party / Account Details</th>
                                    <th className="text-right">Principal (₹)</th>
                                    <th className="text-center">Rate (%)</th>
                                    <th className="text-center">Days</th>
                                    <th className="text-right">Interest Amount (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row) => (
                                    <tr key={row._id}>
                                        <td>
                                            <div className={s.partyCell}>
                                                <span className={s.partyName}>{row.partyName}</span>
                                                <span className={s.partyGroup}>{row.groupName}</span>
                                            </div>
                                        </td>
                                        <td className="text-right font-semibold">
                                            <span className={s.amountText}>₹{formatCur(row.principal)}</span>
                                        </td>
                                        <td className="text-center">
                                            <span className={s.rateBadge}>{row.rate}%</span>
                                        </td>
                                        <td className="text-center">
                                            <span className={s.daysBadge}>{row.days} Days</span>
                                        </td>
                                        <td className="text-right font-black">
                                            <span className={`${s.amountText} ${s.interest}`}>₹{formatCur(row.interest)}</span>
                                        </td>
                                    </tr>
                                ))}
                                <tr className={s.totalRow}>
                                    <td>TOTAL PAYABLE</td>
                                    <td className="text-right font-black">₹{formatCur(totals.principal)}</td>
                                    <td></td>
                                    <td></td>
                                    <td className="text-right font-black text-rose-600">₹{formatCur(totals.interest)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className={s.footerActions}>
                            <Button variant="outline" onClick={() => handleAction('Printing')} className="gap-2 font-bold uppercase text-[10px] tracking-widest">
                                <Printer size={16} /> Print Report
                            </Button>
                            <Button variant="outline" onClick={() => handleAction('Excel Export')} className="gap-2 font-bold uppercase text-[10px] tracking-widest border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                                <FileDown size={16} /> Export CSV
                            </Button>
                            <Button onClick={handleCreateProvision} className="gap-2 font-bold uppercase text-[10px] tracking-widest bg-indigo-600 hover:bg-indigo-700">
                                <PlusCircle size={16} /> Create Provision Voucher
                            </Button>
                        </div>
                    </>
                ) : (
                    <div className={s.emptyState}>
                        <div className={s.emptyIcon}>
                            <Calculator size={32} />
                        </div>
                        <h3>No Calculations Found</h3>
                        <p>Adjust the filters or interest rate to generate the statement for the current audit period.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InterestPayablePage;
