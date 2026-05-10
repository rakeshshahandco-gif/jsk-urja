import React from 'react';
import { Input, Select } from '@/components/ui';
import { INDIAN_STATES } from '@/utils/constants';
import styles from './FollowUpForm.module.scss';

export const ContactDetailsSection = ({ register, errors }) => {
    return (
        <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Contact Details</h2>

            <div className={styles.grid3}>
                <Input
                    label="Company Name"
                    placeholder="Enter company name"
                    {...register('company', { required: 'Company name is required' })}
                    error={errors.company}
                />
                <Input
                    label="Contact Person Name"
                    placeholder="Enter contact person name"
                    {...register('contactPerson', { required: 'Contact person is required' })}
                    error={errors.contactPerson}
                />
                <Input
                    label="Mobile Number"
                    placeholder="9876543210"
                    {...register('mobile', {
                        required: 'Mobile is required',
                        pattern: { value: /^[0-9]{10}$/, message: 'Must be 10 digits' }
                    })}
                    error={errors.mobile}
                />
            </div>

            <div className={styles.grid3}>
                <Input
                    label="Email"
                    type="email"
                    placeholder="contact@example.com (Optional)"
                    {...register('email', {
                        pattern: { value: /^\S+@\S+$/i, message: 'Invalid email' }
                    })}
                    error={errors.email}
                />
                <Input
                    label="City"
                    placeholder="Enter city"
                    {...register('city')}
                    error={errors.city}
                />
                <div>
                    <Input
                        label="State"
                        list="indian-states-followup"
                        placeholder="Type to search..."
                        {...register('state')}
                    />
                    <datalist id="indian-states-followup">
                        {INDIAN_STATES.map(state => (
                            <option key={state} value={state} />
                        ))}
                    </datalist>
                </div>
            </div>

            <div className={styles.grid3}>
                <Select
                    label="Customer Status"
                    options={[
                        { value: 'hot', label: '🔥 Hot' },
                        { value: 'warm', label: '☀️ Warm' },
                        { value: 'cold', label: '❄️ Cold' },
                        { value: 'active', label: '✅ Active' },
                        { value: 'inactive', label: '⏸️ Inactive' },
                    ]}
                    {...register('customerStatus')}
                />
            </div>
        </section>
    );
};
