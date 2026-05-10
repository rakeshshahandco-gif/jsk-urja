import React, { forwardRef, useRef } from 'react';
import clsx from 'clsx';
import PropTypes from 'prop-types';
import { ChevronUp, ChevronDown } from 'lucide-react';
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
    const internalRef = useRef(null);

    const setRefs = (el) => {
        internalRef.current = el;
        if (typeof ref === 'function') {
            ref(el);
        } else if (ref) {
            ref.current = el;
        }
    };

    const handleIncrement = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (internalRef.current) {
            internalRef.current.stepUp();
            // Trigger both input and change events for react-hook-form and other listeners
            internalRef.current.dispatchEvent(new Event('input', { bubbles: true }));
            internalRef.current.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    const handleDecrement = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (internalRef.current) {
            internalRef.current.stepDown();
            // Trigger both input and change events for react-hook-form and other listeners
            internalRef.current.dispatchEvent(new Event('input', { bubbles: true }));
            internalRef.current.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

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
                    ref={setRefs}
                    id={inputId}
                    name={name}
                    type={type}
                    disabled={disabled}
                    readOnly={readOnly}
                    required={required}
                    placeholder={placeholder}
                    className={clsx(styles.input, styles[variant], {
                        [styles.hasStartIcon]: !!startIcon,
                        [styles.hasEndIcon]: !!endIcon || (type === 'number' && !readOnly && !disabled)
                    })}
                    {...props}
                />

                {type === 'number' && !readOnly && !disabled && (
                    <div className={styles.numberControls}>
                        <button
                            type="button"
                            className={styles.controlBtn}
                            onClick={handleIncrement}
                            tabIndex="-1"
                        >
                            <ChevronUp size={12} />
                        </button>
                        <button
                            type="button"
                            className={styles.controlBtn}
                            onClick={handleDecrement}
                            tabIndex="-1"
                        >
                            <ChevronDown size={12} />
                        </button>
                    </div>
                )}

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
