import React, { forwardRef } from 'react';
import clsx from 'clsx';
import PropTypes from 'prop-types';
import styles from '../Input/Input.module.scss'; // Reuse Input styles

export const Select = forwardRef(({
    label,
    name,
    id,
    error,
    helperText,
    options = [],
    placeholder = 'Select an option',
    disabled = false,
    required = false,
    variant = 'md',
    className,
    startIcon,
    ...props
}, ref) => {
    const selectId = id || name;

    return (
        <div className={clsx(styles.container, className)}>
            {label && (
                <label htmlFor={selectId} className={clsx(styles.label, { [styles.required]: required })}>
                    {label}
                </label>
            )}

            <div
                className={clsx(styles.inputWrapper, {
                    [styles.error]: !!error,
                    [styles.disabled]: disabled
                })}
            >
                {startIcon && <span className={clsx(styles.icon, styles.start)}>{startIcon}</span>}

                <select
                    ref={ref}
                    id={selectId}
                    name={name}
                    disabled={disabled}
                    required={required}
                    className={clsx(styles.input, styles[variant], {
                        [styles.hasStartIcon]: !!startIcon
                    })}
                    defaultValue=""
                    {...props}
                >
                    <option value="" disabled hidden>{placeholder}</option>
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>

                {/* Custom Arrow */}
                <span className={clsx(styles.icon, styles.end)} style={{ pointerEvents: 'none' }}>▼</span>
            </div>

            {error ? (
                <span className={styles.errorMessage} role="alert">
                    {error.message || error}
                </span>
            ) : helperText ? (
                <span className={styles.helperText}>{helperText}</span>
            ) : null}
        </div>
    );
});

Select.displayName = 'Select';

Select.propTypes = {
    label: PropTypes.string,
    name: PropTypes.string.isRequired,
    id: PropTypes.string,
    error: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    helperText: PropTypes.string,
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired
    })),
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    required: PropTypes.bool,
    variant: PropTypes.oneOf(['sm', 'md', 'lg']),
    className: PropTypes.string,
    startIcon: PropTypes.node,
};
