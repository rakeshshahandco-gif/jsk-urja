import React, { createContext, useContext, useState, useEffect } from 'react';

const SidebarContext = createContext();

export const SidebarProvider = ({ children }) => {
    // Initial state from localStorage or default to 'expanded'
    const [sidebarState, setSidebarState] = useState(() => {
        const saved = localStorage.getItem('sidebarPreference');
        return saved || 'expanded'; // 'expanded' or 'collapsed'
    });

    const [isHovered, setIsHovered] = useState(false);
    const [isMobileLayout, setIsMobileLayout] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Derived state
    const isCollapsed = sidebarState === 'collapsed';
    const isHoverOpen = isCollapsed && isHovered;

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1024px)');
        const apply = () => {
            setIsMobileLayout(mq.matches);
            if (!mq.matches) setIsMobileMenuOpen(false);
        };
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);

    // Persist preference
    useEffect(() => {
        if (sidebarState !== 'hovered') {
            localStorage.setItem('sidebarPreference', sidebarState);
        }
    }, [sidebarState]);

    const toggleSidebar = () => {
        setSidebarState(prev => prev === 'expanded' ? 'collapsed' : 'expanded');
    };

    const toggleMobileMenu = () => setIsMobileMenuOpen((open) => !open);
    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    const value = {
        sidebarState,
        isCollapsed,
        isHovered,
        isHoverOpen,
        isMobileLayout,
        isMobileMenuOpen,
        setIsHovered,
        toggleSidebar,
        toggleMobileMenu,
        closeMobileMenu,
        setSidebarState,
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
