import React from 'react';
import { TASK_HUB_COLUMNS } from './taskHubConstants';
import styles from './TaskHubTable.module.scss';

export const TaskHubColGroup = () => (
    <colgroup>
        {TASK_HUB_COLUMNS.map((col) => (
            <col key={col.key} style={{ width: col.width }} />
        ))}
    </colgroup>
);

export const TaskHubTableHead = () => (
    <thead className={styles.thead}>
        <tr>
            {TASK_HUB_COLUMNS.map((col) => (
                <th key={col.key} className={`${styles.th} ${col.center ? styles.center : ''}`}>
                    {col.label}
                </th>
            ))}
        </tr>
    </thead>
);