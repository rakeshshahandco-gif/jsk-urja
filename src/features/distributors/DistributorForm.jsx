import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import styles from './DistributorForm.module.scss';

export const DistributorForm = ({ distributor, onSubmit, onCancel, isSubmitting = false }) => {
    const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
        defaultValues: distributor || {
            name: '',
            contactPerson: '',
            mobile: '',
            email: '',
            gstin: '',
            address: '',
            city: '',
            state: '',
            defaultIncentiveType: 'Percentage of sales',
            defaultIncentivePercentage: 0,
            status: 'Active',
        }
    });

    const { addToast } = useToast();

    useEffect(() => {
        if (distributor) {
            reset(distributor);
        }
    }, [distributor, reset]);

    const handleUppercaseChange = (fieldName) => (e) => {
        const upperValue = e.target.value.toUpperCase();
        setValue(fieldName, upperValue);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
            <div className={styles.grid}>
                <div className={styles.formGroup}>
                    <label>Distributor Name *</label>
                    <Input
                        {...register('name', { required: 'Name is required' })}
                        placeholder="Enter distributor name"
                        onChange={handleUppercaseChange('name')}
                    />
                    {errors.name && <span className={styles.error}>{errors.name.message}</span>}
                </div>

                <div className={styles.formGroup}>
                    <label>Contact Person</label>
                    <Input
                        {...register('contactPerson')}
                        placeholder="Contact person name"
                        onChange={handleUppercaseChange('contactPerson')}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Mobile</label>
                    <Input
                        {...register('mobile')}
                        placeholder="Mobile number"
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Email</label>
                    <Input
                        {...register('email')}
                        type="email"
                        placeholder="Email address"
                        style={{ textTransform: 'uppercase' }}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>GSTIN</label>
                    <Input
                        {...register('gstin')}
                        placeholder="GST Number"
                        onChange={handleUppercaseChange('gstin')}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>City</label>
                    <Input
                        {...register('city')}
                        placeholder="City"
                        onChange={handleUppercaseChange('city')}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>State</label>
                    <Input
                        {...register('state')}
                        placeholder="State"
                        onChange={handleUppercaseChange('state')}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Status</label>
                    <select {...register('status')} className={styles.select}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                </div>

                <div className={styles.formGroup}>
                    <label>Default Incentive Type</label>
                    <select {...register('defaultIncentiveType')} className={styles.select}>
                        <option value="Percentage of sales">Percentage of sales</option>
                        <option value="Fixed amount per invoice">Fixed amount per invoice</option>
                        <option value="Fixed amount per customer">Fixed amount per customer</option>
                        <option value="Item-wise incentive">Item-wise incentive</option>
                        <option value="Manual">Manual</option>
                    </select>
                </div>

                <div className={styles.formGroup}>
                    <label>Default Incentive % / Value</label>
                    <Input
                        type="number"
                        {...register('defaultIncentivePercentage', { valueAsNumber: true })}
                        placeholder="0"
                    />
                </div>
            </div>

            <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
                <label>Address</label>
                <textarea
                    {...register('address')}
                    className={styles.textarea}
                    placeholder="Complete address"
                    rows={3}
                    onChange={handleUppercaseChange('address')}
                />
            </div>

            <div className={styles.actions}>
                <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
                    {distributor ? 'Update' : 'Create'}
                </Button>
            </div>
        </form>
    );
};
