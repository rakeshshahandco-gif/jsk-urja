import React from 'react';
import styles from './Table.module.scss';
import clsx from 'clsx';

export const Table = ({ 
    columns, 
    data, 
    loading, 
    className = '', 
    noDataMessage = 'No records found',
    children 
}) => {
    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <span>Loading data...</span>
            </div>
        );
    }

    // If children are provided, we use the composition pattern
    if (children) {
        return (
            <div className={clsx(styles.tableWrapper, className)}>
                <table className={styles.table}>
                    {children}
                </table>
            </div>
        );
    }

    // Otherwise, we use the legacy columns/data pattern
    if (!data || data.length === 0) {
        return (
            <div className={styles.noData}>
                {noDataMessage}
            </div>
        );
    }

    return (
        <div className={clsx(styles.tableWrapper, className)}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        {columns.map((col, idx) => (
                            <th key={idx} style={col.width ? { width: col.width } : {}}>
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, rowIdx) => (
                        <tr key={row._id || rowIdx}>
                            {columns.map((col, colIdx) => (
                                <td key={colIdx}>
                                    {col.cell ? col.cell(row) : row[col.accessor]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// Sub-components for composition pattern
Table.Th = ({ children, className = '', ...props }) => (
    <th className={clsx(styles.th, className)} {...props}>
        {children}
    </th>
);

Table.Td = ({ children, className = '', ...props }) => (
    <td className={clsx(styles.td, className)} {...props}>
        {children}
    </td>
);

export default Table;
