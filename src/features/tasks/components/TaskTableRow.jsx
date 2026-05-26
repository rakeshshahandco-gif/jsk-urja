import React from 'react';
import styles from './TaskHubTable.module.scss';
import {
    TaskPrimaryCell,
    DueCell,
    AssigneeCell,
    StateCell,
    TaskHubActionsMenu,
} from './TaskHubRowParts';

export const TaskTableRow = ({
    task,
    onExtend,
    onCloseTask,
    onEdit,
    onDelete,
    onOpen,
    zebra = false,
    showComplete = true,
}) => {
    return (
        <tr
            className={`${styles.row} ${zebra ? styles.zebra : ''}`}
            onClick={() => onOpen(task)}
        >
            <td className={styles.td}>
                <TaskPrimaryCell task={task} />
            </td>
            <td className={styles.td}>
                <DueCell task={task} />
            </td>
            <td className={styles.td}>
                <AssigneeCell assignees={task.assigneeIds} />
            </td>
            <td className={styles.td}>
                <StateCell task={task} />
            </td>
            <td className={`${styles.td} ${styles.actionsCell}`}>
                <TaskHubActionsMenu
                    task={task}
                    onOpen={onOpen}
                    onEdit={onEdit}
                    onExtend={onExtend}
                    onDelete={onDelete}
                    onCloseTask={onCloseTask}
                    showComplete={showComplete}
                />
            </td>
        </tr>
    );
};
