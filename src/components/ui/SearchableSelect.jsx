import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Plus } from 'lucide-react';

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Search and select...",
    style = {},
    disabled = false,
    onCreateNew
}) {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    const selectedOption = options.find(opt => opt.value === value);
    const [searchTerm, setSearchTerm] = useState(selectedOption ? selectedOption.label : '');

    // Position tracking for dropdown to prevent clipping from table overflow
    const [dropdownStyle, setDropdownStyle] = useState({});

    // Update search term when outside value prop changes
    useEffect(() => {
        const opt = options.find(o => o.value === value);
        if (!isOpen) {
            setSearchTerm(opt ? opt.label : '');
        }
    }, [value, options, isOpen]);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculate dropdown positions to avoid clipping
    const updateDropdownPosition = () => {
        if (wrapperRef.current && isOpen) {
            const rect = wrapperRef.current.getBoundingClientRect();
            // Optional: calculate space below and above
            // For now, fixed position relative to the viewport avoids all clipping
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
        }
        return () => {
            window.removeEventListener('scroll', updateDropdownPosition, true);
            window.removeEventListener('resize', updateDropdownPosition);
        };
    }, [isOpen]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                // If they click inside the detached dropdown, it's NOT in the wrapper,
                // so we also need to check if they clicked inside the list container!
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
        onChange(val);
        setIsOpen(false);
        const opt = options.find(o => o.value === val);
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

        // If typing, clear the actual value selection so it's fresh
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

    return (
        <>
            <div ref={wrapperRef} style={{ ...style, position: 'relative', width: '100%', boxSizing: 'border-box' }}>
                <div
                    style={{
                        width: '100%',
                        padding: '4px 8px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        background: disabled ? '#f8fafc' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        cursor: disabled ? 'not-allowed' : 'text',
                        boxSizing: 'border-box'
                    }}
                    onClick={() => {
                        if (!disabled && inputRef.current) {
                            inputRef.current.focus();
                        }
                    }}
                >
                    <Search size={14} style={{ color: '#94a3b8', marginRight: '6px', flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        disabled={disabled}
                        value={searchTerm}
                        onChange={handleInputChange}
                        onFocus={handleInputFocus}
                        placeholder={placeholder}
                        style={{
                            border: 'none',
                            outline: 'none',
                            width: '100%',
                            fontSize: '12px',
                            color: '#1e293b',
                            background: 'transparent',
                            textOverflow: 'ellipsis'
                        }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        {value && !disabled && (
                            <div
                                onClick={handleClear}
                                title="Clear selection"
                                style={{ display: 'flex', alignItems: 'center', padding: '2px', color: '#94a3b8', borderRadius: '50%', cursor: 'pointer' }}
                                onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                                onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
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
                            <ChevronDown size={14} style={{ color: '#64748b' }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Portal-like Dropdown Menu attached to window but positioned manually */}
            {isOpen && (
                <div
                    ref={listRef}
                    style={{
                        ...dropdownStyle,
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
                        {filteredOptions.length === 0 ? (
                            <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                                No items found for "{searchTerm}"
                            </div>
                        ) : (
                            filteredOptions.map((opt) => (
                                <div
                                    key={opt.value}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelect(opt.value);
                                    }}
                                    style={{
                                        padding: '8px 12px',
                                        fontSize: '12px',
                                        color: '#1e293b',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #f1f5f9',
                                        background: value === opt.value ? '#eff6ff' : 'transparent',
                                        fontWeight: value === opt.value ? 600 : 400
                                    }}
                                    onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseOut={e => e.currentTarget.style.background = value === opt.value ? '#eff6ff' : 'transparent'}
                                >
                                    {opt.label}
                                </div>
                            ))
                        )}
                    </div>

                    {onCreateNew && (
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsOpen(false);
                                onCreateNew(searchTerm);
                            }}
                            style={{
                                padding: '10px 12px',
                                fontSize: '12px',
                                color: '#2563eb',
                                fontWeight: 600,
                                cursor: 'pointer',
                                borderTop: '1px solid #e2e8f0',
                                background: '#eff6ff',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                            onMouseOver={e => e.currentTarget.style.background = '#dbeafe'}
                            onMouseOut={e => e.currentTarget.style.background = '#eff6ff'}
                        >
                            <Plus size={14} /> Create new item "{searchTerm}"
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
