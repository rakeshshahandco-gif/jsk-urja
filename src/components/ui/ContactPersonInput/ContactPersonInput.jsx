import React from 'react';
import { useFieldArray } from 'react-hook-form';
import { Input } from '../Input';
import { Button } from '../Button';
import { Plus, Trash2, Star } from 'lucide-react';
import styles from './ContactPersonInput.module.scss';

export const ContactPersonInput = ({ control, register, errors }) => {
    const { fields, append, remove } = useFieldArray({
        control,
        name: 'contactPersons',
    });

    const addContactPerson = () => {
        append({
            name: '',
            mobile: '',
            email: '',
            isPrimary: fields.length === 0, // First contact is primary by default
        });
    };

    // Initialize with one contact if empty
    React.useEffect(() => {
        if (fields.length === 0) {
            addContactPerson();
        }
    }, []);

    const handleSetPrimary = (index) => {
        // This will be handled by radio button in the form
        // The radio button will automatically unset others
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h4 className={styles.title}>Contact Persons</h4>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addContactPerson}
                    className={styles.addButton}
                >
                    <Plus size={16} />
                    Add Contact
                </Button>
            </div>

            <div className={styles.contactList}>
                {fields.map((field, index) => (
                    <div
                        key={field.id}
                        className={`${styles.contactCard} ${field.isPrimary ? styles.primary : ''
                            }`}
                    >
                        <div className={styles.cardHeader}>
                            <div className={styles.primaryToggle}>
                                <input
                                    type="radio"
                                    id={`primary-${index}`}
                                    value={index}
                                    {...register('primaryContactIndex', {
                                        required: 'Please select a primary contact',
                                    })}
                                    defaultChecked={index === 0}
                                    className={styles.radioInput}
                                />
                                <label htmlFor={`primary-${index}`} className={styles.radioLabel}>
                                    <Star size={16} className={styles.starIcon} />
                                    <span>Primary Contact</span>
                                </label>
                            </div>
                            {fields.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => remove(index)}
                                    className={styles.removeButton}
                                    aria-label="Remove contact"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>

                        <div className={styles.cardBody}>
                            <Input
                                label="Contact Person Name"
                                placeholder="John Doe"
                                {...register(`contactPersons.${index}.name`, {
                                    required: 'Name is required',
                                })}
                                error={errors?.contactPersons?.[index]?.name}
                            />

                            <div className={styles.row}>
                                <Input
                                    label="Mobile Number 1"
                                    placeholder="9876543210"
                                    {...register(`contactPersons.${index}.mobile`, {
                                        required: 'Mobile is required',
                                        pattern: {
                                            value: /^[0-9]{10}$/,
                                            message: 'Must be exactly 10 digits',
                                        },
                                    })}
                                    error={errors?.contactPersons?.[index]?.mobile}
                                />
                                <Input
                                    label="Mobile Number 2"
                                    placeholder="Optional"
                                    {...register(`contactPersons.${index}.mobile2`, {
                                        pattern: {
                                            value: /^[0-9]{10}$/,
                                            message: 'Must be exactly 10 digits',
                                        },
                                    })}
                                    error={errors?.contactPersons?.[index]?.mobile2}
                                />
                            </div>
                            <div className={styles.row}>
                                <Input
                                    label="Email Address"
                                    type="email"
                                    placeholder="john@example.com (Optional)"
                                    {...register(`contactPersons.${index}.email`, {
                                        pattern: {
                                            value: /^\S+@\S+$/i,
                                            message: 'Invalid email',
                                        },
                                    })}
                                    error={errors?.contactPersons?.[index]?.email}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {errors?.primaryContactIndex && (
                <p className={styles.error}>{errors.primaryContactIndex.message}</p>
            )}
        </div>
    );
};
