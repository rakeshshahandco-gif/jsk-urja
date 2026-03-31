import React from 'react';
import styles from './Table.module.scss';

export const Table = ({ columns, data, loading, className = '', noDataMessage = 'No records found' }) => {
    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <span>Loading data...</span>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className={styles.noData}>
                {noDataMessage}
            </div>
        );
    }

    return (
        <div className={`${styles.tableWrapper} ${className}`}>
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

export default Table;
