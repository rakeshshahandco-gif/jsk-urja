import React from 'react';
import { History } from 'lucide-react';
import styles from './TalkWithCustomerForm.module.scss';

const getModeIcon = (mode) => {
    const icons = {
        call: '📞',
        whatsapp: '💬',
        visit: '🏢',
        email: '📧',
    };
    return icons[mode] || '📝';
};

const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

export const ConversationHistoryList = ({ conversations }) => {
    if (conversations.length === 0) {
        return (
            <div className={styles.historySection}>
                <div className={styles.sectionIconHeader}>
                    <History size={22} className={styles.sectionIcon} />
                    <h3 className={styles.historySectionTitle}>Conversation History</h3>
                </div>
                <div className={styles.emptyHistory}>
                    No previous conversations found for this customer.
                </div>
            </div>
        );
    }

    return (
        <div className={styles.historySection}>
            <div className={styles.sectionIconHeader}>
                <History size={22} className={styles.sectionIcon} />
                <h3 className={styles.historySectionTitle}>
                    Conversation History ({conversations.length})
                </h3>
            </div>

            <div className={styles.historyList}>
                {conversations.map((conv) => (
                    <div key={conv.id} className={styles.historyItem}>
                        <div className={styles.historyHeader}>
                            <span className={styles.historyDate}>
                                {formatDate(conv.conversationDate)}
                            </span>
                            <span className={styles.historyMode}>
                                {getModeIcon(conv.mode)} {conv.mode}
                            </span>
                        </div>
                        <div className={styles.historyDiscussion}>
                            {conv.discussionDetails}
                        </div>
                        {conv.interestedProducts && conv.interestedProducts.length > 0 && (
                            <div className={styles.historyProducts} style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                                <strong>Products:</strong> {conv.interestedProducts.join(', ')}
                            </div>
                        )}
                        {conv.productNotes && (
                            <div className={styles.historyProductNotes} style={{ marginTop: '4px', fontSize: '0.85rem', color: '#666' }}>
                                <strong>Product Notes:</strong> {conv.productNotes}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
