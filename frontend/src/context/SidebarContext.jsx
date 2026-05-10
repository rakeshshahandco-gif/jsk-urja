import React, { createContext, useContext, useState, useEffect } from 'react';

const SidebarContext = createContext();

export const SidebarProvider = ({ children }) => {
    // Initial state from localStorage or default to 'expanded'
    const [sidebarState, setSidebarState] = useState(() => {
        const saved = localStorage.getItem('sidebarPreference');
        return saved || 'expanded'; // 'expanded' or 'collapsed'
    });

    const [isHovered, setIsHovered] = useState(false);

    // Derived state
    const isCollapsed = sidebarState === 'collapsed';
    const isHoverOpen = isCollapsed && isHovered;

    // Persist preference
    useEffect(() => {
        if (sidebarState !== 'hovered') {
            localStorage.setItem('sidebarPreference', sidebarState);
        }
    }, [sidebarState]);

    const toggleSidebar = () => {
        setSidebarState(prev => prev === 'expanded' ? 'collapsed' : 'expanded');
    };

    const value = {
        sidebarState,
        isCollapsed,
        isHovered,
        isHoverOpen,
        setIsHovered,
        toggleSidebar,
        setSidebarState
    };

    return (
        <SidebarContext.Provider value={value}>
            {children}
        </SidebarContext.Provider>
    );
};

export const useSidebar = () => {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return context;
};
