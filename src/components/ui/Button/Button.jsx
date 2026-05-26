import React, { forwardRef } from 'react';
import clsx from 'clsx';
import styles from './Button.module.scss';
import PropTypes from 'prop-types';
import { BrandedLoader } from '../BrandedLoading';

export const Button = forwardRef(({
    children,
    type = 'button',
    variant = 'primary',
    size = 'md',
    className,
    startIcon,
    endIcon,
    isLoading = false,
    disabled = false,
    fullWidth = false,
    ...props
}, ref) => {

    const buttonClasses = clsx(
        styles.button,
        styles[variant],
        styles[size],
        {
            [styles.fullWidth]: fullWidth,
            [styles.disabled]: disabled || isLoading,
        },
        className
    );

    return (
        <button
            ref={ref}
            type={type}
            className={buttonClasses}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && <BrandedLoader size={20} className={styles.buttonLoader} inline={true} />}

            {!isLoading && startIcon && <span className={styles.startIcon}>{startIcon}</span>}

            <span>{children}</span>

            {!isLoading && endIcon && <span className={styles.endIcon}>{endIcon}</span>}
        </button>
    );
});

Button.displayName = 'Button';

Button.propTypes = {
    children: PropTypes.node.isRequired,
    type: PropTypes.oneOf(['button', 'submit', 'reset']),
    variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'ghost', 'danger']),
    size: PropTypes.oneOf(['sm', 'md', 'lg']),
    className: PropTypes.string,
    startIcon: PropTypes.node,
    endIcon: PropTypes.node,
    isLoading: PropTypes.bool,
    disabled: PropTypes.bool,
    fullWidth: PropTypes.bool,
};
