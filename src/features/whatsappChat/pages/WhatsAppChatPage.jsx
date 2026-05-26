import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MessageSquare, Search, Send, Users, Phone, ArrowLeft,
    Loader2, AlertCircle, ExternalLink, Paperclip, UserPlus, CalendarPlus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSocket } from '@/contexts/SocketContext';
import {
    listChats, listMessages, markRead, sendChatMessage,
} from '@/services/whatsappChatApi';
import { getWhatsAppStatus } from '@/services/whatsappApi';
import ConvertFromWhatsAppModal from '@/features/leads/components/ConvertFromWhatsAppModal';
import ProductCatalogPicker from '@/features/productCatalog/components/ProductCatalogPicker';
import styles from './WhatsAppChatPage.module.scss';

const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
};

const chatDisplayName = (chat) => {
    if (chat.isGroup) return chat.jid.split('@')[0].replace(/-/g, ' · ');
    return `+${chat.phone || chat.jid.split('@')[0]}`;
};

const WhatsAppChatPage = () => {
    const navigate = useNavigate();
    const { socket } = useSocket();

    const [chats, setChats] = useState([]);
    const [chatsLoading, setChatsLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [activeJid, setActiveJid] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(false);

    const [composer, setComposer] = useState('');
    const [sending, setSending] = useState(false);

    const [waStatus, setWaStatus] = useState({ status: 'UNKNOWN', connected: false });
    const messagesEndRef = useRef(null);

    // ── Modals / drawers ───────────────────────────────────────────────────
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [sharingCatalog, setSharingCatalog] = useState(false);
    const [convertOpen, setConvertOpen] = useState(false);
    const [createdLead, setCreatedLead] = useState(null);   // lead created from this chat
    const [followUpOpen, setFollowUpOpen] = useState(false);

    // ── Load chat list ─────────────────────────────────────────────────────
    const reloadChats = async () => {
        try {
            const data = await listChats();
            setChats(Array.isArray(data?.chats) ? data.chats : []);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Could not load chats');
        } finally {
            setChatsLoading(false);
        }
    };

    useEffect(() => { reloadChats(); }, []);
    useEffect(() => {
        getWhatsAppStatus().then(setWaStatus).catch(() => {});
    }, []);

    // ── Load messages for active chat ──────────────────────────────────────
    useEffect(() => {
        if (!activeJid) { setMessages([]); return; }
        let cancelled = false;
        setMessagesLoading(true);
        listMessages(activeJid)
            .then((data) => {
                if (cancelled) return;
                setMessages(Array.isArray(data?.messages) ? data.messages : []);
            })
            .catch((err) => {
                if (cancelled) return;
                toast.error(err.response?.data?.message || err.message || 'Could not load messages');
            })
            .finally(() => { if (!cancelled) setMessagesLoading(false); });
        // mark as read (best-effort)
        markRead(activeJid).catch(() => {});
        return () => { cancelled = true; };
    }, [activeJid]);

    // ── Socket live updates ────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        const onMessage = (msg) => {
            // If this message belongs to the active chat, append it.
            if (msg.jid === activeJid) {
                setMessages((prev) => {
                    if (msg._id && prev.some((m) => m._id === msg._id)) return prev;
                    return [...prev, msg];
                });
                // mark read for live in-view
                if (msg.direction === 'in') markRead(activeJid).catch(() => {});
            }
            // Always refresh chat list previews on any new message.
            reloadChats();
        };
        const onStatus = (s) => setWaStatus(s);
        socket.on('whatsapp:message', onMessage);
        socket.on('whatsapp:status', onStatus);
        return () => {
            socket.off('whatsapp:message', onMessage);
            socket.off('whatsapp:status', onStatus);
        };
    }, [socket, activeJid]);

    // ── Auto-scroll to bottom when messages change ─────────────────────────
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        }
    }, [messages, activeJid]);

    // ── Filtered chat list ─────────────────────────────────────────────────
    const filteredChats = useMemo(() => {
        if (!search.trim()) return chats;
        const q = search.trim().toLowerCase();
        return chats.filter((c) =>
            (c.jid || '').toLowerCase().includes(q) ||
            (c.lastText || '').toLowerCase().includes(q)
        );
    }, [chats, search]);

    // ── Derive helpers for the active chat ─────────────────────────────────
    const activeChat = chats.find((c) => c.jid === activeJid);
    const activePhone = activeChat?.phone || (activeJid ? activeJid.split('@')[0] : '');
    const recentChatText = useMemo(() => {
        // Last 8 messages as a single text block — used to pre-fill the
        // "Convert to Lead" modal so user doesn't have to copy/paste.
        return messages
            .slice(-8)
            .map((m) => `${m.direction === 'out' ? 'You' : '+' + activePhone}: ${m.text || `[${m.mediaType}]`}`)
            .join('\n');
    }, [messages, activePhone]);

    // ── Send catalog/datasheet (uses active chat JID — no phone prompt) ────
    const buildCatalogMessage = (picked) => {
        const lines = picked.map((p) => {
            const bits = [`*${p.name}*${p.code ? ` (${p.code})` : ''}`];
            if (p.shortDescription) bits.push(p.shortDescription);
            if (p.catalogPdfUrl)   bits.push(`Catalog:   ${p.catalogPdfUrl}`);
            if (p.datasheetPdfUrl) bits.push(`Datasheet: ${p.datasheetPdfUrl}`);
            return bits.join('\n');
        });
        return `📄 *Product Catalog*\n\n${lines.join('\n\n')}`;
    };

    const handleCatalogConfirm = async (picked) => {
        if (!picked || picked.length === 0) { setCatalogOpen(false); return; }
        if (!activeJid) { toast.error('Open a chat first.'); setCatalogOpen(false); return; }
        if (waStatus.status !== 'CONNECTED') {
            toast.error('WhatsApp not connected.');
            setCatalogOpen(false); return;
        }
        setSharingCatalog(true);
        try {
            const message = buildCatalogMessage(picked);
            await sendChatMessage(activeJid, message);
            toast.success(`Catalog sent (${picked.length} item${picked.length > 1 ? 's' : ''})`);
            setCatalogOpen(false);
            // Optimistic append; the socket event will eventually overwrite by _id if needed.
            setMessages((prev) => [...prev, {
                _id: `local-cat-${Date.now()}`,
                jid: activeJid, direction: 'out', fromMe: true,
                text: message, mediaType: 'text',
                timestamp: new Date().toISOString(), _local: true,
            }]);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Could not send catalog');
        } finally {
            setSharingCatalog(false);
        }
    };

    const handleLeadCreated = (lead) => {
        setCreatedLead(lead);
        setConvertOpen(false);
        toast.success('Lead created from this chat.');
    };

    const handleAddFollowUp = () => {
        if (createdLead?._id) {
            // We have a lead from this chat — go to its detail/followup page.
            // Lead detail route in App.jsx is /crm/leads/:id
            navigate(`/crm/leads/${createdLead._id}`);
        } else {
            // No lead yet — open the Convert modal first.
            setFollowUpOpen(true);
            setConvertOpen(true);
        }
    };

    // ── Send composer ──────────────────────────────────────────────────────
    const handleSend = async (e) => {
        e?.preventDefault?.();
        const text = composer.trim();
        if (!text || !activeJid) return;
        if (waStatus.status !== 'CONNECTED') {
            toast.error('WhatsApp not connected. Open Settings and scan the QR.');
            return;
        }
        setSending(true);
        try {
            await sendChatMessage(activeJid, text);
            setComposer('');
            // The messages.upsert socket event will append; in case socket is laggy
            // we optimistically append an "out" entry.
            setMessages((prev) => [
                ...prev,
                {
                    _id: `local-${Date.now()}`,
                    jid: activeJid,
                    direction: 'out',
                    fromMe: true,
                    text,
                    mediaType: 'text',
                    timestamp: new Date().toISOString(),
                    _local: true,
                },
            ]);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Send failed');
        } finally {
            setSending(false);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className={styles.container}>
            {/* LEFT: chat list panel */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    <button
                        className={styles.iconBtn}
                        onClick={() => navigate('/whatsapp')}
                        title="Back to WhatsApp Settings"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className={styles.sidebarTitle}>
                        <MessageSquare size={18} />
                        <span>WhatsApp Chats</span>
                    </div>
                    <span
                        className={waStatus.status === 'CONNECTED' ? styles.connDot : styles.disconnDot}
                        title={waStatus.message || waStatus.status}
                    />
                </div>

                <div className={styles.searchWrap}>
                    <Search size={15} className={styles.searchIcon} />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search chats"
                        className={styles.searchInput}
                    />
                </div>

                <div className={styles.chatList}>
                    {chatsLoading && (
                        <div className={styles.listInfo}><Loader2 size={16} className={styles.spin} /> Loading chats...</div>
                    )}
                    {!chatsLoading && filteredChats.length === 0 && (
                        <div className={styles.listInfo}>
                            <AlertCircle size={16} />
                            {search ? 'No chats match your search.' : 'No conversations yet. Incoming messages will appear here.'}
                        </div>
                    )}
                    {filteredChats.map((c) => (
                        <button
                            key={c.jid}
                            className={`${styles.chatRow} ${activeJid === c.jid ? styles.chatRowActive : ''}`}
                            onClick={() => setActiveJid(c.jid)}
                        >
                            <div className={styles.avatar}>
                                {c.isGroup ? <Users size={18} /> : <Phone size={18} />}
                            </div>
                            <div className={styles.chatRowBody}>
                                <div className={styles.chatRowHead}>
                                    <div className={styles.chatRowName}>{chatDisplayName(c)}</div>
                                    <div className={styles.chatRowTime}>{formatTime(c.lastTimestamp)}</div>
                                </div>
                                <div className={styles.chatRowMeta}>
                                    <div className={styles.chatRowPreview}>
                                        {c.lastDirection === 'out' ? 'You: ' : ''}{c.lastText || ''}
                                    </div>
                                    {c.unread > 0 && (
                                        <span className={styles.unreadBadge}>{c.unread}</span>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </aside>

            {/* RIGHT: chat panel */}
            <main className={styles.chatPanel}>
                {!activeJid && (
                    <div className={styles.empty}>
                        <MessageSquare size={64} strokeWidth={1} />
                        <h3>Select a chat</h3>
                        <p>Pick any conversation on the left to view its history and reply.</p>
                        <button
                            className={styles.linkBtn}
                            onClick={() => window.open('https://web.whatsapp.com', '_blank', 'noopener')}
                        >
                            <ExternalLink size={14} /> Or open WhatsApp Web in a new tab
                        </button>
                    </div>
                )}

                {activeJid && (
                    <>
                        <header className={styles.chatHeader}>
                            <div className={styles.avatar}>
                                {activeChat?.isGroup ? <Users size={18} /> : <Phone size={18} />}
                            </div>
                            <div className={styles.chatHeaderText}>
                                <div className={styles.chatHeaderName}>
                                    {activeChat ? chatDisplayName(activeChat) : activeJid}
                                </div>
                                <div className={styles.chatHeaderSub}>
                                    {activeChat?.isGroup ? 'Group chat' : 'WhatsApp contact'}
                                    {createdLead?._id && (
                                        <span className={styles.leadTag} title="A Lead was created from this chat">
                                            · Lead #{createdLead.leadNo || createdLead._id.slice(-6)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* ── Sales action toolbar ─────────────────────── */}
                            <div className={styles.chatActions}>
                                <button
                                    type="button"
                                    className={styles.actionBtn}
                                    onClick={() => setCatalogOpen(true)}
                                    disabled={sharingCatalog || waStatus.status !== 'CONNECTED'}
                                    title="Send product catalog / datasheet to this chat"
                                >
                                    <Paperclip size={15} />
                                    <span>Catalog</span>
                                </button>
                                <button
                                    type="button"
                                    className={styles.actionBtn}
                                    onClick={() => setConvertOpen(true)}
                                    title="Convert this chat into a Lead"
                                >
                                    <UserPlus size={15} />
                                    <span>{createdLead?._id ? 'Re-create Lead' : 'Create Lead'}</span>
                                </button>
                                <button
                                    type="button"
                                    className={styles.actionBtn}
                                    onClick={handleAddFollowUp}
                                    title={createdLead?._id
                                        ? 'Open the lead to add a follow-up'
                                        : 'Convert this chat to a Lead first, then add follow-up'}
                                >
                                    <CalendarPlus size={15} />
                                    <span>Follow-up</span>
                                </button>
                            </div>
                        </header>

                        <div className={styles.messagesScroll}>
                            {messagesLoading && (
                                <div className={styles.msgInfo}><Loader2 size={16} className={styles.spin} /> Loading messages...</div>
                            )}
                            {!messagesLoading && messages.length === 0 && (
                                <div className={styles.msgInfo}>No messages in this chat yet.</div>
                            )}
                            {messages.map((m) => (
                                <div
                                    key={m._id}
                                    className={`${styles.bubble} ${m.direction === 'out' ? styles.bubbleOut : styles.bubbleIn}`}
                                >
                                    <div className={styles.bubbleText}>{m.text || `[${m.mediaType}]`}</div>
                                    <div className={styles.bubbleTime}>{formatTime(m.timestamp)}</div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <form onSubmit={handleSend} className={styles.composer}>
                            <button
                                type="button"
                                className={styles.composerAttachBtn}
                                onClick={() => setCatalogOpen(true)}
                                disabled={sharingCatalog || waStatus.status !== 'CONNECTED'}
                                title="Attach product catalog / datasheet"
                            >
                                <Paperclip size={18} />
                            </button>
                            <input
                                type="text"
                                value={composer}
                                onChange={(e) => setComposer(e.target.value)}
                                placeholder={waStatus.status === 'CONNECTED'
                                    ? 'Type a message'
                                    : 'WhatsApp not connected — open Settings to scan QR'}
                                disabled={sending || waStatus.status !== 'CONNECTED'}
                                className={styles.composerInput}
                            />
                            <button
                                type="submit"
                                className={styles.composerSendBtn}
                                disabled={sending || !composer.trim() || waStatus.status !== 'CONNECTED'}
                                title="Send"
                            >
                                {sending
                                    ? <Loader2 size={16} className={styles.spin} />
                                    : <Send size={16} />}
                            </button>
                        </form>
                    </>
                )}
            </main>

            {/* ── Modals / drawers (rendered outside the panel so they overlay) ── */}
            <ProductCatalogPicker
                open={catalogOpen}
                onClose={() => setCatalogOpen(false)}
                onConfirm={handleCatalogConfirm}
            />
            <ConvertFromWhatsAppModal
                open={convertOpen}
                onClose={() => {
                    setConvertOpen(false);
                    setFollowUpOpen(false);
                }}
                onCreated={(lead) => {
                    handleLeadCreated(lead);
                    if (followUpOpen && lead?._id) {
                        // user clicked "Follow-up" without a lead — now we have one,
                        // jump to the lead detail page to add the follow-up there.
                        setFollowUpOpen(false);
                        navigate(`/crm/leads/${lead._id}`);
                    }
                }}
                initialMessageText={recentChatText}
                initialCustomerMobile={activePhone ? `+${activePhone}` : ''}
                initialCustomerName={activeChat?.isGroup ? '' : ''}
            />
        </div>
    );
};

export default WhatsAppChatPage;
