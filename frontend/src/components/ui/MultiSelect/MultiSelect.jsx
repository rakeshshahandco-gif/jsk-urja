import React, { useState, useRef, useEffect } from 'react';
import { useController } from 'react-hook-form';
import clsx from 'clsx';
import PropTypes from 'prop-types';
import styles from './MultiSelect.module.scss';
import { Button } from '../Button'; // Assuming Button is available for clearing if needed, essentially just div interactions

export const MultiSelect = ({
    label,
    name,
    control,
    options = [],
    placeholder = 'Select options...',
    required = false,
    rules = {},
    className,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // Integrate with React Hook Form
    const {
        field: { value = [], onChange },
        fieldState: { error }
    } = useController({
        name,
        control,
        rules: { required: required && 'This field is required', ...rules },
        defaultValue: []
    });

    // Handle clicks outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (optionValue) => {
        const newValue = value.includes(optionValue)
            ? value.filter(v => v !== optionValue)
            : [...value, optionValue];
        onChange(newValue);
    };

    const displayValue = value.length > 0
        ? `${value.length} selected`
        : placeholder;

    // Optional: Better display text logic
    const detailedDisplay = value.length > 0
        ? options.filter(o => value.includes(o.value || o)).map(o => o.label || o).join(', ')
        : placeholder;

    return (
        <div className={clsx(styles.container, className)} ref={containerRef}>
            {label && (
                <label className={clsx(styles.label, { [styles.required]: required })}>
                    {label}
                </label>
            )}

            <div
                className={clsx(styles.selectDisplay, {
                    [styles.active]: isOpen,
                    [styles.error]: !!error
                })}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={value.length ? styles.selectedText : styles.placeholder}>
                    {detailedDisplay}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#999' }}>▼</span>
            </div>

            {isOpen && (
                <div className={styles.dropdown}>
                    {options.map((option) => {
                        const optValue = option.value || option;
                        const optLabel = option.label || option;
                        const isSelected = value.includes(optValue);

                        return (
                            <div
                                key={optValue}
                                className={clsx(styles.option, { [styles.selected]: isSelected })}
                                onClick={() => toggleOption(optValue)}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    readOnly
                                    className={styles.checkbox}
                                />
                                <span>{optLabel}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {error && (
                <span className={styles.errorMessage}>
                    {error.message}
                </span>
            )}
        </div>
    );
};

MultiSelect.propTypes = {
    label: PropTypes.string,
    name: PropTypes.string.isRequired,
    control: PropTypes.object.isRequired,
    options: PropTypes.array.isRequired,
    placeholder: PropTypes.string,
    required: PropTypes.bool,
};
