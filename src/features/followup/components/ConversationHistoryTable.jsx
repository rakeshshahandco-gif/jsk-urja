import React from 'react';
import { Button, Input, Select } from '@/components/ui';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { AddConversationModal } from './AddConversationModal';
import styles from './FollowUpForm.module.scss';

export const ConversationHistoryTable = ({
    conversations,
    onAdd,
    onEdit,
    onDelete,
    showModal,
    setShowModal,
    editingConversation,
    onSaveConversation,
}) => {
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const getModeIcon = (mode) => {
        const icons = {
            call: '📞',
            whatsapp: '💬',
            visit: '🏢',
            email: '📧'
        };
        return icons[mode] || '📝';
    };

    return (
        <section className={styles.section}>
            <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Conversation History</h2>
                <Button
                    type="button"
                    variant="primary"
                    onClick={onAdd}
                    className={styles.addButton}
                >
                    <Plus size={18} />
                    Add Conversation
                </Button>
            </div>

            {conversations.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>No conversations yet. Click "Add Conversation" to start tracking.</p>
                </div>
            ) : (
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Mode</th>
                                <th>Discussion Details</th>
                                <th>Outcome</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {conversations.map((conv) => (
                                <tr key={conv.id}>
                                    <td>{formatDate(conv.conversationDate)}</td>
                                    <td>
                                        <span className={styles.modeBadge}>
                                            {getModeIcon(conv.mode)} {conv.mode}
                                        </span>
                                    </td>
                                    <td className={styles.discussionCell}>{conv.discussionDetails}</td>
                                    <td className={styles.outcomeCell}>{conv.outcome || '-'}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button
                                                type="button"
                                                onClick={() => onEdit(conv.id)}
                                                className={styles.actionButton}
                                                title="Edit"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onDelete(conv.id)}
                                                className={`${styles.actionButton} ${styles.delete}`}
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <AddConversationModal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    onSave={onSaveConversation}
                    editingConversation={editingConversation}
                />
            )}
        </section>
    );
};
