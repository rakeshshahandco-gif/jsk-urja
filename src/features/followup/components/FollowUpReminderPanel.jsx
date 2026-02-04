import React from 'react';
import { Input, Select, Button } from '@/components/ui';
import styles from './FollowUpForm.module.scss';

export const FollowUpReminderPanel = ({ register, errors, control, onSubmit, isSubmitting }) => {
    return (
        <section className={`${styles.section} ${styles.stickyPanel}`}>
            <h2 className={styles.sectionTitle}>Follow-up & Reminder</h2>

            <div className={styles.reminderContent}>
                <Input
                    label="Next Call Date"
                    type="date"
                    {...register('nextCallDate', { required: 'Next call date is required' })}
                    error={errors.nextCallDate}
                />

                <Input
                    label="Next Call Time (Optional)"
                    type="time"
                    {...register('nextCallTime')}
                    error={errors.nextCallTime}
                />

                <div className={styles.textareaGroup}>
                    <label className={styles.label}>What to Talk Next</label>
                    <textarea
                        className={styles.textarea}
                        rows={5}
                        placeholder="Enter notes for next conversation..."
                        {...register('whatToTalkNext')}
                    />
                </div>

                <Select
                    label="Priority"
                    options={[
                        { value: 'high', label: '🔴 High' },
                        { value: 'medium', label: '🟡 Medium' },
                        { value: 'low', label: '🟢 Low' },
                    ]}
                    {...register('priority')}
                />

                <div className={styles.reminderToggle}>
                    <label className={styles.toggleLabel}>
                        <input
                            type="checkbox"
                            {...register('reminderEnabled')}
                            className={styles.checkbox}
                        />
                        <span className={styles.toggleText}>Enable Reminder</span>
                    </label>
                </div>

                <Button
                    type="button"
                    onClick={onSubmit}
                    isLoading={isSubmitting}
                    className={styles.updateButton}
                >
                    Update Follow-up
                </Button>
            </div>
        </section>
    );
};
