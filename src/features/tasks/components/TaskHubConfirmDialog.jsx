import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui';

export const TaskHubConfirmDialog = ({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) => {
    if (!open) return null;

    return (
        <Modal
            title={title}
            onClose={onCancel}
            size="sm"
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button variant="outline" type="button" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant={danger ? 'danger' : 'primary'}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            }
        >
            <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{message}</p>
        </Modal>
    );
};
