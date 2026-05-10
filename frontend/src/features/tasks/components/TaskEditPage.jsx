import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTask } from '@/services/taskApi';
import { TaskForm } from './TaskForm';
import { ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './TaskCreatePage.module.scss';

export const TaskEditPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTask = async () => {
            try {
                setLoading(true);
                const data = await getTask(id);
                setTask(data);
            } catch (err) {
                toast.error('Failed to load task details');
                navigate('/tasks/list');
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchTask();
    }, [id, navigate]);

    const handleSuccess = () => {
        navigate('/tasks/list');
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                    <p style={{ fontSize: '14px', color: '#6b7280' }}>Loading task details...</p>
                </div>
            </div>
        );
    }

    if (!task) return null;

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
                    <h1 className={styles.title}>Edit Task</h1>
                    <p className={styles.subtitle}>Update task details and assignments</p>
                </div>
            </div>

            <div className={styles.formCard}>
                <TaskForm
                    task={task}
                    onSuccess={handleSuccess}
                    onCancel={() => navigate(-1)}
                />
            </div>
        </div>
    );
};
