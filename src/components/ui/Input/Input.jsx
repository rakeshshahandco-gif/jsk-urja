import React, { forwardRef } from 'react';
import clsx from 'clsx';
import PropTypes from 'prop-types';
import styles from './Input.module.scss';

export const Input = forwardRef(({
    type = 'text',
    label,
    name,
    id,
    placeholder,
    helperText,
    error,
    disabled = false,
    readOnly = false,
    required = false,
    variant = 'md', // sm, md, lg
    className,
    startIcon,
    endIcon,
    ...props
}, ref) => {
    const inputId = id || name;

    return (
        <div className={clsx(styles.container, className)}>
            {label && (
                <label htmlFor={inputId} className={clsx(styles.label, { [styles.required]: required })}>
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

                <input
                    ref={ref}
                    id={inputId}
                    name={name}
                    type={type}
                    disabled={disabled}
                    readOnly={readOnly}
                    required={required}
                    placeholder={placeholder}
                    className={clsx(styles.input, styles[variant], {
                        [styles.hasStartIcon]: !!startIcon,
                        [styles.hasEndIcon]: !!endIcon
                    })}
                    {...props}
                />

                {endIcon && <span className={clsx(styles.icon, styles.end)}>{endIcon}</span>}
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

Input.displayName = 'Input';

Input.propTypes = {
    type: PropTypes.string,
    label: PropTypes.string,
    name: PropTypes.string.isRequired,
    id: PropTypes.string,
    placeholder: PropTypes.string,
    helperText: PropTypes.string,
    error: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    disabled: PropTypes.bool,
    readOnly: PropTypes.bool,
    required: PropTypes.bool,
    variant: PropTypes.oneOf(['sm', 'md', 'lg']),
    className: PropTypes.string,
    startIcon: PropTypes.node,
    endIcon: PropTypes.node,
};
