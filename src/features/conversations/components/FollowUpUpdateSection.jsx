import React from 'react';
import { Input, Select, Button } from '@/components/ui';
import { CalendarDays, Bell, Clock, FileText, Flag } from 'lucide-react';
import styles from './TalkWithCustomerForm.module.scss';

export const FollowUpUpdateSection = ({ form, onUpdate }) => {
    const { register, formState: { errors, isSubmitting } } = form;

    return (
        <div className={styles.formSection}>
            <div className={styles.sectionIconHeader}>
                <div className={styles.iconGroup}>
                    <CalendarDays size={22} className={styles.sectionIcon} />
                    <Bell size={18} className={styles.sectionIconSecondary} />
                </div>
                <h3 className={styles.formSectionTitle}>Follow-up & Reminder</h3>
            </div>

            <Input
                label="Next Call Date"
                type="date"
                startIcon={<CalendarDays size={18} />}
                {...register('nextCallDate', { required: 'Next call date is required' })}
                error={errors.nextCallDate}
            />

            <Input
                label="Next Call Time (Optional)"
                type="time"
                startIcon={<Clock size={18} />}
                {...register('nextCallTime')}
            />

            <div className={styles.textareaGroup}>
                <label className={styles.label}>
                    <FileText size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    What to Talk Next
                </label>
                <textarea
                    className={styles.textarea}
                    rows={6}
                    placeholder="Enter notes for next conversation..."
                    {...register('whatToTalkNext')}
                />
            </div>

            <Select
                label="Follow-up Priority"
                startIcon={<Flag size={18} />}
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
                    <Bell size={18} style={{ marginRight: '8px' }} />
                    <span className={styles.toggleText}>Enable Reminder</span>
                </label>
            </div>

            <Button
                type="button"
                onClick={onUpdate}
                isLoading={isSubmitting}
                variant="secondary"
                className={styles.updateButton}
            >
                Update Follow-up
            </Button>
        </div>
    );
};
