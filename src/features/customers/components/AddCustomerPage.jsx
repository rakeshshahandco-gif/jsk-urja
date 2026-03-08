import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerForm } from './CustomerForm';
import { Button } from '@/components/ui';
import { createCustomer } from '@/services/customerApi';
import styles from './AddCustomerPage.module.scss';
import toast from 'react-hot-toast';

export const AddCustomerPage = () => {
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleClose = () => {
        navigate(-1); // Go back to previous page
    };

    const handleSubmit = async (data) => {
        setIsSubmitting(true);

        try {
            // Process tags if it's a string
            if (typeof data.tags === 'string') {
                data.tags = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
            }

            await createCustomer(data);
            toast.success('Customer created successfully!');
            navigate(-1); // Go back to keep user flow
        } catch (error) {
            toast.error('Failed to create customer: ' + error.message);
            console.error('Error creating customer:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.fullScreenContainer}>
            <div className={styles.header}>
                <h1 className={styles.title}>Add New Customer</h1>
                <Button variant="outline" onClick={handleClose}>
                    ✕ Close
                </Button>
            </div>
            <div className={styles.formContainer}>
                <CustomerForm
                    onSubmit={handleSubmit}
                    onCancel={handleClose}
                    isSubmitting={isSubmitting}
                />
            </div>
            <NavigationGuides />
        </div>
    );
};

// ─── Navigation Guides ───────────────────────────────────────────────────────
function NavigationGuides() {
    const scroll = (dir) => {
        const container = document.querySelector(`[class*="fullScreenContainer"]`);
        if (!container) return;
        const step = 400;
        if (dir === 'up') container.scrollBy({ top: -step, behavior: 'smooth' });
        if (dir === 'down') container.scrollBy({ top: step, behavior: 'smooth' });
        if (dir === 'left') container.scrollBy({ left: -step, behavior: 'smooth' });
        if (dir === 'right') container.scrollBy({ left: step, behavior: 'smooth' });
    };

    const guideStyle = {
        position: 'fixed', zIndex: 999999, padding: '10px',
        background: 'rgba(255, 255, 255, 0.4)', borderRadius: '50%',
        border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backdropFilter: 'blur(4px)',
        transition: 'all 0.2s', width: '40px', height: '40px', color: '#2563eb',
        fontSize: '24px', fontWeight: 'bold'
    };

    return (
        <>
            <button onClick={() => scroll('up')} style={{ ...guideStyle, top: '80px', left: '50%', transform: 'translateX(-50%)' }} title="Scroll Up">↑</button>
            <button onClick={() => scroll('down')} style={{ ...guideStyle, bottom: '20px', left: '50%', transform: 'translateX(-50%)' }} title="Scroll Down">↓</button>
            <button onClick={() => scroll('left')} style={{ ...guideStyle, top: '50%', left: '260px', transform: 'translateY(-50%)' }} title="Scroll Left">←</button>
            <button onClick={() => scroll('right')} style={{ ...guideStyle, top: '50%', right: '20px', transform: 'translateY(-50%)' }} title="Scroll Right">→</button>
        </>
    );
}

