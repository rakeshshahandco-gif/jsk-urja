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
        </div>
    );
};

