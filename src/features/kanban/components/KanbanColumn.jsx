import React from 'react';

const columnStyle = {
    flex: '0 0 280px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '100%',
};

const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '1px solid #e2e8f0',
};

const titleStyle = {
    fontSize: 13,
    fontWeight: 700,
    color: '#0f172a',
    textTransform: 'capitalize',
};

const countStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: '#475569',
    background: '#e2e8f0',
    padding: '1px 7px',
    borderRadius: 10,
};

const listStyle = {
    overflowY: 'auto',
    flex: 1,
    minHeight: 60,
};

const emptyStyle = {
    border: '1px dashed #cbd5e1',
    borderRadius: 6,
    padding: 16,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 12,
    margin: '6px 2px',
};

export default function KanbanColumn({
    id,
    title,
    accent,
    count,
    children,
    droppableProps,
    isEmpty,
    emptyHint,
}) {
    const style = {
        ...columnStyle,
        ...(accent ? { borderTop: `3px solid ${accent}` } : {}),
    };
    return (
        <div style={style} {...(droppableProps || {})}>
            <div style={headerStyle}>
                <span style={titleStyle}>{title || id}</span>
                <span style={countStyle}>{count ?? 0}</span>
            </div>
            <div style={listStyle}>
                {isEmpty ? (
                    <div style={emptyStyle}>{emptyHint || 'Drop leads here'}</div>
                ) : children}
            </div>
        </div>
    );
}
