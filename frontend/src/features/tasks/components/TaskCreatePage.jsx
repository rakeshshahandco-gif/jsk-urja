import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TaskForm } from './TaskForm';
import { Button } from '@/components/ui';
import { ChevronLeft } from 'lucide-react';
import styles from './TaskCreatePage.module.scss';

export const TaskCreatePage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const customerId = searchParams.get('customerId');

    const handleSuccess = () => {
        navigate('/tasks/list');
    };

    return (
        <div className={styles.container}>
            <div className={styles.headerContainer}>
                <button 
                    className={styles.backButton}
                    onClick={() => navigate(-1)}
                    aria-label="Go back"
                >
                    <ChevronLeft size={16} />
                </button>
                <div className={styles.titleWrapper}>
                    <h1 className={styles.title}>Create New Task</h1>
                    <p className={styles.subtitle}>Assign and schedule a task</p>
                </div>
            </div>

            <div className={styles.formCard}>
                <TaskForm
                    task={customerId ? { customerId } : null}
                    onSuccess={handleSuccess}
                    onCancel={() => navigate(-1)}
                />
            </div>
        </div>
    );
};
