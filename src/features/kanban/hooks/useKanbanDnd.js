import { useRef, useCallback } from 'react';

/**
 * Lightweight HTML5 drag-and-drop hook for Kanban cards.
 *
 * Usage:
 *   const dnd = useKanbanDnd({ onDrop: (cardId, fromColumn, toColumn) => {...} });
 *   <div {...dnd.cardProps(cardId, columnId)}>card</div>
 *   <div {...dnd.columnProps(columnId)}>column</div>
 *
 * Keeps the drag context in a ref so we never re-render mid-drag.
 * Caller is responsible for optimistic state update and rollback.
 */
export function useKanbanDnd({ onDrop } = {}) {
    const dragContext = useRef({ cardId: null, fromColumn: null });

    const handleDragStart = useCallback((cardId, columnId) => (e) => {
        dragContext.current = { cardId, fromColumn: columnId };
        try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(cardId));
        } catch (_) { /* some browsers throw on certain media types */ }
    }, []);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch (_) { /* noop */ }
    }, []);

    const handleDrop = useCallback((columnId) => (e) => {
        e.preventDefault();
        const { cardId, fromColumn } = dragContext.current;
        dragContext.current = { cardId: null, fromColumn: null };
        if (!cardId || !columnId || fromColumn === columnId) return;
        if (typeof onDrop === 'function') {
            onDrop(cardId, fromColumn, columnId);
        }
    }, [onDrop]);

    const cardProps = useCallback((cardId, columnId) => ({
        draggable: true,
        onDragStart: handleDragStart(cardId, columnId),
    }), [handleDragStart]);

    const columnProps = useCallback((columnId) => ({
        onDragOver: handleDragOver,
        onDrop: handleDrop(columnId),
    }), [handleDragOver, handleDrop]);

    return { cardProps, columnProps };
}

export default useKanbanDnd;
