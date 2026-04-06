import React, { useState, useRef, useEffect } from 'react';
import { useMessenger } from '@/contexts/MessengerContext';
import { Smile, Paperclip, Send, Mic, X, Plus } from 'lucide-react';
import clsx from 'clsx';
import styles from '../MessengerPage.module.scss';

export const MessageComposer = () => {
    const [content, setContent] = useState('');
    const [attachments, setAttachments] = useState([]);
    const { sendMessage, startTyping, stopTyping } = useMessenger();
    const typingTimeoutRef = useRef(null);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);

    // Auto-expand textarea handled by SCSS max-height and JS height
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '20px';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [content]);

    const handleSend = () => {
        if (!content.trim() && attachments.length === 0) return;
        
        sendMessage(content.trim(), attachments);
        
        setContent('');
        setAttachments([]);
        stopTyping();
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        
        if (textareaRef.current) {
            textareaRef.current.style.height = '20px';
        }
    };

    const handleChange = (e) => {
        setContent(e.target.value);
        startTyping();
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            stopTyping();
        }, 3000);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            const newAttachments = files.map(f => ({
                id: Math.random().toString(36).substr(2, 9),
                file: f,
                name: f.name,
                type: f.type.startsWith('image/') ? 'image' : 'document',
                url: URL.createObjectURL(f)
            }));
            setAttachments(prev => [...prev, ...newAttachments]);
        }
        e.target.value = '';
    };

    return (
        <div className={styles.composer}>
            <div className={styles.iconBtn}>
                <Smile size={24} />
            </div>
            <div className={styles.iconBtn} onClick={() => fileInputRef.current?.click()}>
                <Paperclip size={24} style={{ transform: 'rotate(-45deg)' }} />
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    multiple 
                    onChange={handleFileSelect}
                />
            </div>
            
            <div className={styles.inputWrapper}>
                <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder="Type a message"
                    value={content}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    autoFocus
                />
            </div>

            <div className={styles.iconBtn}>
                { (content.trim() || attachments.length > 0) ? (
                    <div onClick={handleSend} style={{ color: '#00a884' }}>
                        <Send size={24} />
                    </div>
                ) : (
                    <Mic size={24} />
                )}
            </div>
        </div>
    );
};
