import React from 'react';
import { format } from 'date-fns';
import { CheckCheck } from 'lucide-react';
import clsx from 'clsx';
import styles from '../MessengerPage.module.scss';

export const MessageBubble = ({ message, isOwn, showSenderName }) => {
    const time = format(new Date(message.createdAt || new Date()), 'h:mm a');
    const isSeen = message.readBy?.length > 0;

    return (
        <div className={clsx(styles.bubbleRow, isOwn ? styles.own : styles.other)}>
            <div className={clsx(styles.bubble, isOwn ? styles.own : styles.other)}>
                {showSenderName && !isOwn && (
                    <div className={styles.senderName}>
                        {message.sender?.name || 'User'}
                    </div>
                )}
                
                <p className={styles.content}>
                    {message.content}
                </p>

                <div className={styles.footer}>
                    <span className={styles.time}>{time}</span>
                    {isOwn && (
                        <span className={clsx(styles.statusIcon, isSeen && styles.read)}>
                            <CheckCheck size={16} />
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
