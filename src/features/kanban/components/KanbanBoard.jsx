import React from 'react';

const boardStyle = {
    display: 'flex',
    gap: 12,
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '4px 4px 12px 4px',
    alignItems: 'stretch',
    flex: 1,
    minHeight: 0,
};

export default function KanbanBoard({ children }) {
    return <div style={boardStyle}>{children}</div>;
}
