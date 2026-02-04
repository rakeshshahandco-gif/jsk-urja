import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import styles from '../CustomerMasterReport.module.scss';

export const ReportTable = ({ data, sortConfig, onSort }) => {
    const getSortIcon = (key) => {
        if (sortConfig.sortBy !== key) return <ArrowUpDown size={14} className={styles.sortIcon} />;
        return sortConfig.sortOrder === 'asc' ?
            <ArrowUp size={14} className={styles.sortIconActive} /> :
            <ArrowDown size={14} className={styles.sortIconActive} />;
    };

    const handleSort = (key) => {
        onSort(key);
    };

    const renderMobiles = (customer) => {
        const primary = customer.contactPersons?.find(cp => cp.isPrimary) || customer.contactPersons?.[0] || {};
        const mobiles = [
            primary.mobile,
            primary.mobile2,
            primary.mobile3,
            primary.mobile4,
            primary.mobile5
        ].filter(Boolean);

        return mobiles.length > 0 ? mobiles.join(', ') : '-';
    };

    return (
        <div className={styles.tableContainer}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th onClick={() => handleSort('customerName')} className={styles.sortable}>
                            Customer Name {getSortIcon('customerName')}
                        </th>
                        <th onClick={() => handleSort('company')} className={styles.sortable}>
                            Company {getSortIcon('company')}
                        </th>
                        <th>Contact</th>
                        <th>Mobiles</th>
                        <th>Email</th>
                        <th>Address</th>
                        <th>Area</th>
                        <th>City</th>
                        <th>State</th>
                        <th>Pincode</th>
                        <th onClick={() => handleSort('status')} className={styles.sortable}>
                            Status {getSortIcon('status')}
                        </th>
                        <th>Type</th>
                        <th>Interested Products</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((customer) => {
                        const primaryContact = customer.contactPersons?.find(cp => cp.isPrimary) || customer.contactPersons?.[0] || {};

                        return (
                            <tr key={customer._id}>
                                <td className={styles.bold}>{customer.customerName || 'Unknown Customer'}</td>
                                <td>{customer.company || '-'}</td>
                                <td>{primaryContact.name || '-'}</td>
                                <td className={styles.mobileCell}>{renderMobiles(customer)}</td>
                                <td>{primaryContact.email || customer.companyEmail || '-'}</td>
                                <td>{customer.address || '-'}</td>
                                <td>{customer.area || '-'}</td>
                                <td>{customer.city || '-'}</td>
                                <td>{customer.state || '-'}</td>
                                <td>{customer.pincode || '-'}</td>
                                <td>
                                    <span className={`${styles.statusBadge} ${styles[customer.status || 'lead']}`}>
                                        {customer.status || 'lead'}
                                    </span>
                                </td>
                                <td>{customer.customerType || '-'}</td>
                                <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {(customer.interestedProducts || []).join(', ') || '-'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
