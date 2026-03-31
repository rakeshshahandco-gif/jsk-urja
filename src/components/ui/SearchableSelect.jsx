import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X, Plus } from 'lucide-react';

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Search and select...",
    style = {},
    disabled = false,
    onCreateNew,
    dark = false,
    noOptionsMessage = null
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    const selectedOption = options.find(opt => opt.value === value);
    const [searchTerm, setSearchTerm] = useState(selectedOption ? selectedOption.label : '');

    // Theming tokens
    const theme = {
        bg: dark ? '#0f172a' : '#fff',
        text: dark ? '#f1f5f9' : '#1e293b',
        border: dark ? '#334155' : '#e2e8f0',
        muted: dark ? '#94a3b8' : '#64748b',
        hover: dark ? '#1e293b' : '#f8fafc',
        selected: dark ? '#1e3a5f' : '#eff6ff',
        accent: dark ? '#60a5fa' : '#2563eb',
        accentBg: dark ? '#1e3a5f' : '#eff6ff',
        divider: dark ? '#1e293b' : '#f1f5f9'
    };

    // Position tracking for dropdown to prevent clipping from table overflow
    const [dropdownStyle, setDropdownStyle] = useState({});

    // Update search term when outside value prop changes
    useEffect(() => {
        const opt = options.find(o => o.value === value);
        if (!isOpen) {
            setSearchTerm(opt ? opt.label : '');
        }
    }, [value, options, isOpen]);

    // Advanced search logic with prioritization
    const filteredOptions = useMemo(() => {
        if (!searchTerm.trim()) return options.slice(0, 200); // Show first 200 when empty

        const term = searchTerm.trim().toLowerCase();

        // Priority 1: Label starts with term
        const priority1 = [];
        // Priority 2: Meta (like Item Code) starts with term
        const priority2 = [];
        // Priority 3: Contains term
        const priority3 = [];

        options.forEach(opt => {
            const label = opt.label.toLowerCase();
            const meta = (opt.meta || '').toLowerCase();

            if (label.startsWith(term)) {
                priority1.push(opt);
            } else if (meta && meta.startsWith(term)) {
                priority2.push(opt);
            } else if (label.includes(term) || (meta && meta.includes(term))) {
                priority3.push(opt);
            }
        });

        return [...priority1, ...priority2, ...priority3].slice(0, 100); // Limit to 100 for performance
    }, [searchTerm, options]);

    // Calculate dropdown positions to avoid clipping
    const updateDropdownPosition = () => {
        if (wrapperRef.current && isOpen) {
            const rect = wrapperRef.current.getBoundingClientRect();
            setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 2,
                left: rect.left,
                width: rect.width,
                maxHeight: '280px',
                zIndex: 9999,
            });
        }
    };

    useEffect(() => {
        if (isOpen) {
            updateDropdownPosition();
            window.addEventListener('scroll', updateDropdownPosition, true);
            window.addEventListener('resize', updateDropdownPosition);
            setActiveIndex(-1);
        }
        return () => {
            window.removeEventListener('scroll', updateDropdownPosition, true);
            window.removeEventListener('resize', updateDropdownPosition);
        };
    }, [isOpen]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                if (listRef.current && listRef.current.contains(event.target)) {
                    return;
                }
                setIsOpen(false);
                const opt = options.find(o => o.value === value);
                setSearchTerm(opt ? opt.label : '');
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef, listRef, value, options]);

    const handleSelect = (val) => {
        const opt = options.find(o => o.value === val);
        onChange(val, opt);
        setIsOpen(false);
        setSearchTerm(opt ? opt.label : '');
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onChange('');
        setSearchTerm('');
        setIsOpen(true);
        if (inputRef.current) inputRef.current.focus();
    };

    const handleInputChange = (e) => {
        const newSearch = e.target.value;
        setSearchTerm(newSearch);
        setIsOpen(true);
        if (value) {
            onChange('');
        }
    };

    const handleInputFocus = () => {
        if (!disabled) {
            setIsOpen(true);
            if (inputRef.current) inputRef.current.select();
        }
    };

    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setIsOpen(true);
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
                handleSelect(filteredOptions[activeIndex].value);
            } else if (filteredOptions.length > 0) {
                // Default to first if none highlighted
                handleSelect(filteredOptions[0].value);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        if (activeIndex >= 0 && listRef.current) {
            const activeEl = listRef.current.querySelectorAll('.option-item')[activeIndex];
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

    return (
        <>
            <div ref={wrapperRef} style={{ ...style, position: 'relative', width: '100%', boxSizing: 'border-box' }}>
                <div
                    style={{
                        width: '100%', padding: '4px 8px', border: `1px solid ${theme.border}`,
                        borderRadius: '6px', background: disabled ? (dark ? '#1e293b' : '#f8fafc') : theme.bg,
                        display: 'flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'text', boxSizing: 'border-box'
                    }}
                    onClick={() => {
                        if (!disabled && inputRef.current) { inputRef.current.focus(); }
                    }}
                >
                    <Search size={14} style={{ color: theme.muted, marginRight: '6px', flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        disabled={disabled}
                        value={searchTerm}
                        onChange={handleInputChange}
                        onFocus={handleInputFocus}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        style={{
                            border: 'none', outline: 'none', width: '100%', fontSize: '12px',
                            color: theme.text, background: 'transparent', textOverflow: 'ellipsis'
                        }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        {value && !disabled && (
                            <div
                                onClick={handleClear} title="Clear selection"
                                style={{ display: 'flex', alignItems: 'center', padding: '2px', color: theme.muted, borderRadius: '50%', cursor: 'pointer' }}
                                onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                                onMouseOut={e => e.currentTarget.style.color = theme.muted}
                            >
                                <X size={13} />
                            </div>
                        )}
                        <div
                            style={{ padding: '2px', display: 'flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer' }}
                            onClick={(e) => {
                                if (disabled) return;
                                e.stopPropagation();
                                setIsOpen(!isOpen);
                                if (!isOpen && inputRef.current) inputRef.current.focus();
                            }}
                        >
                            <ChevronDown size={14} style={{ color: theme.muted }} />
                        </div>
                    </div>
                </div>
            </div>

            {isOpen && (
                <div
                    ref={listRef}
                    style={{
                        ...dropdownStyle, background: theme.bg, border: `1px solid ${theme.border}`,
                        borderRadius: '8px', boxShadow: dark ? '0 10px 15px -3px rgba(0, 0, 0, 0.5)' : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        overflow: 'hidden', display: 'flex', flexDirection: 'column'
                    }}
                >
                    <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
                        {filteredOptions.length === 0 ? (
                            <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: theme.muted }}>
                                {noOptionsMessage ? noOptionsMessage : `No items found ${searchTerm ? `for "${searchTerm}"` : ''}`}
                            </div>
                        ) : (
                            filteredOptions.map((opt, idx) => (
                                <div
                                    key={opt.value}
                                    className="option-item"
                                    onClick={(e) => { e.stopPropagation(); handleSelect(opt.value); }}
                                    style={{
                                        padding: '8px 12px', fontSize: '12px', color: theme.text, cursor: 'pointer',
                                        borderBottom: `1px solid ${theme.divider}`,
                                        background: activeIndex === idx ? theme.hover : (value === opt.value ? theme.selected : 'transparent'),
                                        fontWeight: value === opt.value ? 600 : 400
                                    }}
                                    onMouseOver={() => setActiveIndex(idx)}
                                >
                                    <div style={{ fontWeight: 600 }}>{opt.label}</div>
                                    {opt.meta && <div style={{ fontSize: '10px', color: theme.muted, marginTop: '2px' }}>{opt.meta}</div>}
                                </div>
                            ))
                        )}
                    </div>

                    {onCreateNew && (
                        <div
                            onClick={(e) => { e.stopPropagation(); setIsOpen(false); onCreateNew(searchTerm); }}
                            style={{
                                padding: '10px 12px', fontSize: '12px', color: theme.accent, fontWeight: 600,
                                cursor: 'pointer', borderTop: `1px solid ${theme.border}`, background: theme.accentBg,
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                            onMouseOver={e => e.currentTarget.style.background = dark ? '#2e4a6d' : '#dbeafe'}
                            onMouseOut={e => e.currentTarget.style.background = theme.accentBg}
                        >
                            <Plus size={14} /> Create new item &quot;{searchTerm}&quot;
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
