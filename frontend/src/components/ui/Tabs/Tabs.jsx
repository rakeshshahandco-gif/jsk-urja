import React, { createContext, useContext, useState, useEffect } from 'react';
import styles from './Tabs.module.scss';

const TabsContext = createContext();

export const Tabs = ({ children, defaultValue, value, onValueChange, className = '' }) => {
    const [activeTab, setActiveTab] = useState(value || defaultValue);

    useEffect(() => {
        if (value !== undefined) {
            setActiveTab(value);
        }
    }, [value]);

    const handleTabChange = (newValue) => {
        if (value === undefined) {
            setActiveTab(newValue);
        }
        if (onValueChange) {
            onValueChange(newValue);
        }
    };

    return (
        <TabsContext.Provider value={{ activeTab, handleTabChange }}>
            <div className={`${styles.tabsRoot} ${className}`}>
                {children}
            </div>
        </TabsContext.Provider>
    );
};

export const TabsList = ({ children, className = '' }) => {
    return (
        <div className={`${styles.tabsList} ${className}`}>
            {children}
        </div>
    );
};

export const TabsTrigger = ({ children, value, className = '' }) => {
    const { activeTab, handleTabChange } = useContext(TabsContext);
    const isActive = activeTab === value;

    return (
        <button
            type="button"
            role="tab"
            aria-selected={isActive}
            data-state={isActive ? 'active' : 'inactive'}
            className={`${styles.tabsTrigger} ${className}`}
            onClick={() => handleTabChange(value)}
        >
            {children}
        </button>
    );
};

export const TabsContent = ({ children, value, className = '' }) => {
    const { activeTab } = useContext(TabsContext);
    const isActive = activeTab === value;

    return (
        <div
            role="tabpanel"
            data-state={isActive ? 'active' : 'inactive'}
            className={`${styles.tabsContent} ${className}`}
        >
            {isActive && children}
        </div>
    );
};
