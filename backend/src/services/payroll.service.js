import { Employee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { SalaryWorking } from '../models/salaryWorking.model.js';
import { Holiday } from '../models/holiday.model.js';
import { HRSettings } from '../models/hrSettings.model.js';
import mongoose from 'mongoose';
import moment from 'moment';

const getSundaysInRange = (start, end) => {
    let count = 0;
    let current = moment(start);
    const endMom = moment(end);
    while (current.isSameOrBefore(endMom)) {
        if (current.day() === 0) count++;
        current.add(1, 'day');
    }
    return count;
};

/**
 * Core engine to calculate and optionally save the salary for a given month and year.
 * @param {Number} month (1-12)
 * @param {Number} year
 * @param {String} employeeId (Optional - if missing, calculates for all active employees)
 * @param {Boolean} autoSave (If true, inserts/updates the SalaryWorking model)
 * @param {String} userId (Passed to set createdBy/updatedBy when autoSaving)
 */
export const recalculateMonthlySalary = async (month, year, employeeId = null, autoSave = false, userId = null) => {
    const totalDays = new Date(year, month, 0).getDate();
    // Using strict UTC bounds to prevent timezone leakage
    const startDate = moment.utc({ year, month: month - 1, day: 1 }).startOf('month');
    const endDate = moment.utc({ year, month: month - 1, day: 1 }).endOf('month');

    // 1. Fetch HR Settings & Rules
    const settings = await HRSettings.findOne() || {};
    const lateRule = settings.latePenaltyRule || 'No Deduction';
    const lateThreshold = settings.latePenaltyThresholdMarks || 3;
    const isHolidayPaid = settings.isHolidayPaid !== false; // Default true
    const isSundayPaid = settings.isSundayPaid !== false; // Default true
    const isSandwichRuleEnabled = settings.isSandwichRuleEnabled !== false; // Default true
    const sandwichPaidLeaveAsAbsent = settings.sandwichPaidLeaveAsAbsent === true; // Default false

    // 2. Fetch Employees
    const empQuery = {
        $or: [
            { isActive: true },
            { dateOfLeaving: { $gte: startDate.toDate() } }
        ]
    };
    if (employeeId) empQuery._id = employeeId;
    
    const employees = await Employee.find(empQuery).select('employeeCode employeeName basicSalary hra conveyance specialAllowance incentive salaryType dateOfJoining dateOfLeaving');

    // 3. Fetch Attendance & Holidays for the month
    const attendances = await Attendance.find({
        date: { $gte: startDate.toDate(), $lte: endDate.toDate() }
    });

    const holidays = await Holiday.find({
        date: { $gte: startDate.toDate(), $lte: endDate.toDate() },
        isActive: true
    });

    const results = [];
    const bulkOps = [];

    for (const emp of employees) {
        const empIdStr = emp._id.toString();
        const empAttendances = attendances.filter(att => att.employee.toString() === empIdStr);
        
        // 4. Tenure Calculation. (Handles join mid-month or leave mid-month)
        const firstRecordDate = empAttendances.length > 0 ? new Date(Math.min(...empAttendances.map(a => new Date(a.date)))) : null;
        const effectiveTenureStart = (firstRecordDate && firstRecordDate < emp.dateOfJoining) ? firstRecordDate : emp.dateOfJoining;
        const tenureStart = (effectiveTenureStart && moment(effectiveTenureStart).isAfter(startDate)) ? moment.utc(effectiveTenureStart).startOf('day') : startDate;
        const tenureEnd = (emp.dateOfLeaving && moment(emp.dateOfLeaving).isBefore(endDate)) ? moment.utc(emp.dateOfLeaving).endOf('day') : endDate;
        
        const recordedAttendance = empAttendances.filter(att => {
            const d = moment.utc(att.date).add(5.5, 'hours');
            return d.isSameOrAfter(tenureStart) && d.isSameOrBefore(tenureEnd);
        });

        // 5. Counters
        const currentSundays = getSundaysInRange(tenureStart, tenureEnd);
        const activeHolidays = holidays.filter(h => moment.utc(h.date).isSameOrAfter(tenureStart) && moment.utc(h.date).isSameOrBefore(tenureEnd)).length;
        
        let presentDays = 0;
        let halfDays = 0;
        let lateCount = 0;
        let unpaidSundays = 0;
        let unpaidHolidays = 0;
        let explicitAbsents = 0;
        let hasPositiveRecords = false;

        recordedAttendance.forEach(att => {
            const d = moment.utc(att.date).add(5.5, 'hours');
            const isSunday = d.day() === 0;
            const isHol = holidays.some(h => moment.utc(h.date).add(5.5, 'hours').isSame(d, 'day'));
            
            if (isSunday || isHol) {
                att.status = 'Present';
            }
            
            const status = (att.status || '').toLowerCase().trim();

            if (['present', 'half day', 'late'].includes(status) || att.inTime || att.outTime) {
                hasPositiveRecords = true;
            }

            if (['present', 'late'].includes(status)) {
                if (!isSunday && !isHol) presentDays += 1;
            } else if (status === 'half day') {
                if (!isSunday && !isHol) halfDays += 1;
            }

            if (att.isLate || status === 'late') {
                lateCount += 1;
            }

            // Unpaid explicitly marked days
            if (['absent', 'unpaid leave'].includes(status)) {
                explicitAbsents += 1;
                if (isSunday) unpaidSundays += 1;
                if (isHol) unpaidHolidays += 1;
            }
        });

        let daysWorked = 0;
        let paidSundays = 0;
        let paidHolidays = 0;
        let lateDeductionDays = 0;
        let sandwichDeductionDays = 0;

        const isDayAbsentForSandwich = (d) => {
            const dateStr = d.format('YYYY-MM-DD');
            const record = recordedAttendance.find(att => moment.utc(att.date).add(5.5, 'hours').format('YYYY-MM-DD') === dateStr);
            if (record) {
                const isSun = d.day() === 0;
                const isHol = holidays.some(h => moment.utc(h.date).add(5.5, 'hours').format('YYYY-MM-DD') === dateStr);
                let status = (record.status || '').toLowerCase().trim();
                
                if (isSun || isHol) {
                    status = 'present';
                }

                if (['absent', 'unpaid leave'].includes(status)) return true;
                if (sandwichPaidLeaveAsAbsent && ['paid leave', 'leave'].includes(status)) return true;
            } else if (hasPositiveRecords) {
                const isSun = d.day() === 0;
                const isHol = holidays.some(h => moment.utc(h.date).add(5.5, 'hours').format('YYYY-MM-DD') === dateStr);
                if (!isSun && !isHol) return true; // Working day, missing record -> absent
            }
            return false;
        };

        if (isSandwichRuleEnabled) {
            let currentBlock = [];
            for (let d = moment.utc(tenureStart); d.isSameOrBefore(tenureEnd); d.add(1, 'day')) {
                const dateStr = d.format('YYYY-MM-DD');
                const isSun = d.day() === 0;
                const isHol = holidays.some(h => moment.utc(h.date).format('YYYY-MM-DD') === dateStr);
                if (isSun || isHol) {
                    currentBlock.push(moment.utc(d));
                } else {
                    if (currentBlock.length > 0) {
                        const dayBefore = moment.utc(currentBlock[0]).subtract(1, 'day');
                        const dayAfter = moment.utc(currentBlock[currentBlock.length - 1]).add(1, 'day');
                        
                        let beforeAbsent = dayBefore.isBefore(tenureStart) ? false : isDayAbsentForSandwich(dayBefore);
                        let afterAbsent = dayAfter.isAfter(tenureEnd) ? false : isDayAbsentForSandwich(dayAfter);

                        if (beforeAbsent && afterAbsent) {
                            for (const blockDay of currentBlock) {
                                const bStr = blockDay.format('YYYY-MM-DD');
                                const record = recordedAttendance.find(att => moment.utc(att.date).add(5.5, 'hours').format('YYYY-MM-DD') === bStr);
                                const blockIsSun = blockDay.day() === 0;
                                const blockIsHol = holidays.some(h => moment.utc(h.date).add(5.5, 'hours').format('YYYY-MM-DD') === bStr);
                                
                                let status = record ? (record.status || '').toLowerCase().trim() : '';
                                if (blockIsSun || blockIsHol) {
                                    status = 'present';
                                }
                                
                                const isAlreadyUnpaid = ['absent', 'unpaid leave'].includes(status);
                                
                                let deductionForThisDay = 0;
                                if (blockIsSun && isSundayPaid && !isAlreadyUnpaid) deductionForThisDay += 1;
                                if (blockIsHol && isHolidayPaid && !isAlreadyUnpaid) deductionForThisDay += 1;
                                sandwichDeductionDays += deductionForThisDay;
                            }
                        }
                        currentBlock = [];
                    }
                }
            }
        }

        // Ensure we don't count duplicate attendance entries for the same date 
        // which would artificially inflate presentDays. We cap presentDays at max regular working days.
        const maxRegularDays = Math.max(0, (tenureEnd.diff(tenureStart, 'days') + 1) - currentSundays - activeHolidays);
        presentDays = Math.min(presentDays, maxRegularDays);

        if (!hasPositiveRecords) {
            // Negative Attendance Mode: If absolutely 0 punches found, default to full minus explicit absents
            const tenureTotalDays = tenureEnd.diff(tenureStart, 'days') + 1;
            if (tenureStart.isSameOrBefore(moment())) {
                const totalAbsencesCount = recordedAttendance.filter(att => ['absent', 'unpaid leave'].includes((att.status || '').toLowerCase().trim())).length;
                daysWorked = Math.max(0, tenureTotalDays - totalAbsencesCount - sandwichDeductionDays);
                paidSundays = isSundayPaid ? Math.max(0, currentSundays - totalAbsencesCount) : 0; // rough prox
                paidHolidays = isHolidayPaid ? Math.max(0, activeHolidays) : 0;
            }
        } else {
            // Positive Mode
            paidSundays = isSundayPaid ? Math.max(0, currentSundays - unpaidSundays) : 0;
            paidHolidays = isHolidayPaid ? Math.max(0, activeHolidays - unpaidHolidays) : 0;
            
            let basePayable = presentDays + (halfDays * 0.5) + paidSundays + paidHolidays;
            
            // Late Penalty Deduction Logic
            if (lateRule === 'Half Day Deduction' && lateThreshold > 0 && lateCount > 0) {
                const penaltyInstances = Math.floor(lateCount / lateThreshold);
                lateDeductionDays = penaltyInstances * 0.5;
            } else if (lateRule === 'Full Day Deduction' && lateThreshold > 0 && lateCount > 0) {
                const penaltyInstances = Math.floor(lateCount / lateThreshold);
                lateDeductionDays = penaltyInstances * 1.0;
            }
            
            daysWorked = Math.max(0, basePayable - lateDeductionDays - sandwichDeductionDays);
        }

        // Hard boundary protection
        daysWorked = Math.min(daysWorked, totalDays);

        const fraction = totalDays > 0 ? (daysWorked / totalDays) : 0;
        const basic = Math.round((emp.basicSalary || 0) * fraction);
        const hra = Math.round((emp.hra || 0) * fraction);
        const conveyance = Math.round((emp.conveyance || 0) * fraction);
        const specialAllowance = Math.round((emp.specialAllowance || 0) * fraction);
        const incentives = Math.round((emp.incentive || 0) * fraction);
        
        const grossAmount = basic + hra + conveyance + specialAllowance + incentives;
        const deductions = 0;
        const netPayable = grossAmount - deductions;
        const masterGross = (emp.basicSalary || 0) + (emp.hra || 0) + (emp.conveyance || 0) + (emp.specialAllowance || 0);

        const recData = {
            month,
            year,
            employeeId: emp._id,
            totalDays,
            daysWorked,
            paidLeaves: 0,
            paidHolidays,
            paidSundays,
            lateDeductionDays,
            absentDeductionDays: explicitAbsents, // For tracking
            sandwichDeductionDays,
            masterGross,
            basic,
            hra,
            conveyance,
            specialAllowance,
            incentives,
            deductions,
            grossAmount,
            netPayable,
            remarks: [
                lateDeductionDays > 0 ? `Late Deduction: ${lateDeductionDays} days` : '',
                sandwichDeductionDays > 0 ? `Sandwich Deduction: ${sandwichDeductionDays} off-days unpaid` : ''
            ].filter(Boolean).join(' | ')
        };

        results.push({ ...recData, employeeCode: emp.employeeCode, employeeName: emp.employeeName });

        if (autoSave) {
            bulkOps.push({
                updateOne: {
                    filter: { month, year, employeeId: emp._id },
                    update: { 
                        $set: { 
                            ...recData,
                            status: 'Draft',
                            ...(userId ? { createdBy: userId } : {})
                        } 
                    },
                    upsert: true
                }
            });
        }
    }

    if (autoSave && bulkOps.length > 0) {
        await SalaryWorking.bulkWrite(bulkOps);
    }

    return results;
};
