import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import {
    buildCleanTitle,
    findDateShortcutInText,
    filterGroups,
    filterUsers,
    getActiveTrigger,
    removeTriggerToken,
} from '../utils/taskShortcutParser';
import styles from './TaskShortcutInput.module.scss';

export const TaskShortcutInput = ({
    groupsOptions = [],
    usersOptions = [],
    onApply,
    onEnterSubmit,
}) => {
    const inputRef = useRef(null);
    const [text, setText] = useState('');
    const [cursorPos, setCursorPos] = useState(0);
    const [dateChip, setDateChip] = useState(null);
    const [dateError, setDateError] = useState(null);
    const [groupChip, setGroupChip] = useState(null);
    const [assigneeChip, setAssigneeChip] = useState(null);
    const [dropdown, setDropdown] = useState(null);
    const [highlightIndex, setHighlightIndex] = useState(0);

    const syncCursor = () => {
        const el = inputRef.current;
        if (el) setCursorPos(el.selectionStart ?? el.value.length);
    };

    const applyToForm = useCallback(
        (overrides = {}) => {
            const cleanTitle = buildCleanTitle(text);
            onApply?.({
                title: cleanTitle,
                dueDate: overrides.dueDate !== undefined ? overrides.dueDate : dateChip?.isoDate,
                groupId: overrides.groupId !== undefined ? overrides.groupId : groupChip?.id,
                assigneeIds:
                    overrides.assigneeIds !== undefined
                        ? overrides.assigneeIds
                        : assigneeChip
                          ? [assigneeChip.id]
                          : undefined,
                assignmentMode: assigneeChip || overrides.assigneeIds?.length ? 'SINGLE' : undefined,
                dateError,
                ...overrides,
            });
        },
        [text, dateChip, groupChip, assigneeChip, dateError, onApply]
    );

    useEffect(() => {
        const parsed = findDateShortcutInText(text);
        if (!text.match(/\$\d{1,2}(?=\s|$|#|@)/)) {
            setDateError(null);
            setDateChip(null);
            onApply?.({ dueDate: undefined, title: buildCleanTitle(text) });
            return;
        }
        if (parsed?.error) {
            setDateError(parsed.error);
            setDateChip(null);
            onApply?.({ dueDate: undefined, title: buildCleanTitle(text), dateError: parsed.error });
            return;
        }
        if (parsed?.isoDate) {
            setDateError(null);
            setDateChip({ isoDate: parsed.isoDate, label: parsed.label });
            onApply?.({
                dueDate: parsed.isoDate,
                title: buildCleanTitle(text),
                dateError: null,
                groupId: groupChip?.id,
                assigneeIds: assigneeChip ? [assigneeChip.id] : undefined,
                assignmentMode: assigneeChip ? 'SINGLE' : undefined,
            });
        }
    }, [text, groupChip, assigneeChip, onApply]);

    const trigger = useMemo(() => getActiveTrigger(text, cursorPos), [text, cursorPos]);

    const suggestions = useMemo(() => {
        if (!trigger) return [];
        if (trigger.type === 'group') return filterGroups(groupsOptions, trigger.query);
        return filterUsers(usersOptions, trigger.query);
    }, [trigger, groupsOptions, usersOptions]);

    useEffect(() => {
        if (trigger) {
            setDropdown(trigger.type);
            setHighlightIndex(0);
        } else {
            setDropdown(null);
            setHighlightIndex(0);
        }
    }, [trigger, suggestions.length]);

    const selectSuggestion = (item) => {
        if (!trigger) return;
        const nextText = removeTriggerToken(text, cursorPos);
        setText(nextText);
        setDropdown(null);

        if (trigger.type === 'group') {
            const id = item._id || item.id;
            setGroupChip({ id, name: item.name });
            onApply?.({
                title: buildCleanTitle(nextText),
                groupId: id,
                dueDate: dateChip?.isoDate,
                assigneeIds: assigneeChip ? [assigneeChip.id] : undefined,
                assignmentMode: assigneeChip ? 'SINGLE' : undefined,
            });
        } else {
            const id = item._id || item.id;
            const name = item.fullName || item.name;
            setAssigneeChip({ id, name });
            onApply?.({
                title: buildCleanTitle(nextText),
                groupId: groupChip?.id,
                dueDate: dateChip?.isoDate,
                assigneeIds: [id],
                assignmentMode: 'SINGLE',
            });
        }
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    const handleChange = (e) => {
        setText(e.target.value);
        setCursorPos(e.target.selectionStart ?? 0);
    };

    const handleKeyDown = (e) => {
        syncCursor();

        if (dropdown && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightIndex((i) => Math.max(i - 1, 0));
                return;
            }
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                selectSuggestion(suggestions[highlightIndex]);
                return;
            }
        }

        if (e.key === 'Escape') {
            if (dropdown) {
                e.preventDefault();
                setDropdown(null);
            }
            return;
        }

        if (e.key === 'Backspace' && text === '') {
            if (assigneeChip) {
                e.preventDefault();
                removeAssigneeChip();
                return;
            }
            if (groupChip) {
                e.preventDefault();
                removeGroupChip();
                return;
            }
            if (dateChip) {
                e.preventDefault();
                removeDateChip();
                return;
            }
        }

        if (e.key === 'Enter' && !dropdown) {
            e.preventDefault();
            if (dateError) return;
            applyToForm();
            onEnterSubmit?.();
        }
    };

    const removeDateChip = () => {
        setDateChip(null);
        setDateError(null);
        const next = text.replace(/\$\d{1,2}(?=\s|$|#|@)/g, '').replace(/\s+/g, ' ').trim();
        setText(next);
        onApply?.({ dueDate: undefined, title: buildCleanTitle(next) });
    };

    const removeGroupChip = () => {
        setGroupChip(null);
        onApply?.({ groupId: '', title: buildCleanTitle(text) });
    };

    const removeAssigneeChip = () => {
        setAssigneeChip(null);
        onApply?.({ assigneeIds: [], assignmentMode: 'SELF', title: buildCleanTitle(text) });
    };

    const hasChips = dateChip || groupChip || assigneeChip;

    return (
        <div className={styles.wrap}>
            <span className={styles.label}>Quick task shortcuts</span>
            {hasChips && (
                <div className={styles.chips}>
                    {dateChip && (
                        <span className={clsx(styles.chip, styles.date)}>
                            Due {dateChip.label}
                            <button
                                type="button"
                                className={styles.chipRemove}
                                onClick={removeDateChip}
                                aria-label="Remove due date"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    )}
                    {groupChip && (
                        <span className={styles.chip}>
                            {groupChip.name}
                            <button
                                type="button"
                                className={styles.chipRemove}
                                onClick={removeGroupChip}
                                aria-label="Remove group"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    )}
                    {assigneeChip && (
                        <span className={clsx(styles.chip, styles.assignee)}>
                            {assigneeChip.name}
                            <button
                                type="button"
                                className={styles.chipRemove}
                                onClick={removeAssigneeChip}
                                aria-label="Remove assignee"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    )}
                </div>
            )}
            <div className={styles.inputRow}>
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.input}
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onKeyUp={syncCursor}
                    onClick={syncCursor}
                    onSelect={syncCursor}
                    placeholder="e.g. Follow up Kevin Group $15 #Sales @Raj"
                    autoComplete="off"
                />
                {dropdown && (
                    <div className={styles.dropdown} role="listbox">
                        {suggestions.length === 0 ? (
                            <div className={styles.option} style={{ color: '#9ca3af' }}>
                                No matches
                            </div>
                        ) : (
                            suggestions.map((item, idx) => {
                                const key = item._id || item.id || idx;
                                const label =
                                    dropdown === 'group'
                                        ? item.name
                                        : item.fullName || item.name;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        role="option"
                                        aria-selected={idx === highlightIndex}
                                        className={clsx(styles.option, {
                                            [styles.highlighted]: idx === highlightIndex,
                                        })}
                                        onMouseDown={(ev) => ev.preventDefault()}
                                        onClick={() => selectSuggestion(item)}
                                        onMouseEnter={() => setHighlightIndex(idx)}
                                    >
                                        {label}
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
            {dateError && <div className={styles.error}>{dateError}</div>}
            <span className={styles.hint}>$day = due date · #group · @assignee · Tab/Enter to pick</span>
        </div>
    );
};
