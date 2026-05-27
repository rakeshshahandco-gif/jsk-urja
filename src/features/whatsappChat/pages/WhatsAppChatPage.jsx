import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MessageSquare, Search, Send, Users, Phone, ArrowLeft,
    Loader2, AlertCircle, ExternalLink, Paperclip, UserPlus, CalendarPlus,
    RefreshCw, PlusCircle, Info, X, Download, Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSocket } from '@/contexts/SocketContext';
import {
    listChats, listMessages, markRead, sendChatMessage, syncChats, startChat,
    downloadMessageMedia,
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
    // Priority: CRM Customer name > WhatsApp saved name > group jid prefix > +phone
    if (chat.crmCustomerName) return chat.crmCustomerName;
    if (chat.chatName) return chat.chatName;
    if (chat.isGroup) return chat.jid.split('@')[0].replace(/-/g, ' · ');
    return `+${chat.phone || chat.jid.split('@')[0]}`;
};

const BADGE_LABELS = {
    group:    { label: 'Group',    color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
    customer: { label: 'Customer', color: '#0369a1', bg: '#eff6ff', border: '#bfdbfe' },
    contact:  { label: 'Contact',  color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    unknown:  { label: 'Unknown',  color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
};

const FILTERS = [
    { id: 'all',       label: 'All'       },
    { id: 'unread',    label: 'Unread'    },
    { id: 'groups',    label: 'Groups'    },
    { id: 'contacts',  label: 'Contacts'  },
    { id: 'unknown',   label: 'Unknown'   },
    { id: 'customers', label: 'Customers' },
];

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);
const MEDIA_LABEL = {
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    document: 'Document',
    sticker: 'Sticker',
};

// Single chat bubble. For media-bearing messages it adds a "Download" button
// that streams the bytes from Baileys via /whatsapp-chat/messages/:id/media.
// Only messages persisted after the download feature was deployed carry the
// raw payload — older "[unsupported]" rows surface a hint instead.
// Also accepts onContextMenu so the parent can render a right-click menu
// ("Add as Lead from this message", "Copy text").
const MessageBubble = ({ m, onContextMenu }) => {
    const isMedia = MEDIA_TYPES.has(m.mediaType);
    const [downloading, setDownloading] = useState(false);
    const handleDownload = async () => {
        if (!m._id || downloading) return;
        setDownloading(true);
        try {
            await downloadMessageMedia(m._id, m.mediaFilename || `whatsapp-${m.mediaType}-${m._id}`);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Could not download media');
        } finally {
            setDownloading(false);
        }
    };
    return (
        <div
            className={`${styles.bubble} ${m.direction === 'out' ? styles.bubbleOut : styles.bubbleIn}`}
            onContextMenu={(e) => onContextMenu?.(e, m)}
            title="Right-click for actions (Add as Lead, Copy)"
        >
            <div className={styles.bubbleText}>
                {m.text || `[${m.mediaType}]`}
            </div>
            {isMedia && (
                <div className={styles.bubbleMedia}>
                    <button
                        type="button"
                        className={styles.mediaDownloadBtn}
                        onClick={handleDownload}
                        disabled={downloading}
                        title={m.mediaFilename
                            ? `Download ${m.mediaFilename}`
                            : `Download ${MEDIA_LABEL[m.mediaType] || 'file'}`}
                    >
                        {downloading
                            ? <Loader2 size={13} className={styles.spin} />
                            : <Download size={13} />}
                        <span>
                            Download {MEDIA_LABEL[m.mediaType] || 'file'}
                            {m.mediaFilename ? ` · ${m.mediaFilename}` : ''}
                        </span>
                    </button>
                </div>
            )}
            <div className={styles.bubbleTime}>{formatTime(m.timestamp)}</div>
        </div>
    );
};

const WhatsAppChatPage = () => {
    const navigate = useNavigate();
    const { socket } = useSocket();

    const [chats, setChats] = useState([]);
    const [chatsLoading, setChatsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');

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
    const [syncing, setSyncing] = useState(false);

    // When set, the ConvertFromWhatsAppModal uses THIS text instead of the
    // generic "last 8 messages" preview — populated by the per-message
    // right-click "Add as Lead from this message" action.
    const [convertOverrideText, setConvertOverrideText] = useState(null);

    // Right-click context menu state for individual message bubbles.
    // `{ x, y, message }` when open, null when closed.
    const [ctxMenu, setCtxMenu] = useState(null);

    // ── Start-new-chat state ───────────────────────────────────────────────
    const [newChatOpen, setNewChatOpen] = useState(false);
    const [newPhone, setNewPhone] = useState('');
    const [startingChat, setStartingChat] = useState(false);

    // ── Dismissable status banner ──────────────────────────────────────────
    const [showHistoryNote, setShowHistoryNote] = useState(() => {
        try { return localStorage.getItem('wa-chat-history-note-dismissed') !== '1'; }
        catch { return true; }
    });
    const dismissHistoryNote = () => {
        setShowHistoryNote(false);
        try { localStorage.setItem('wa-chat-history-note-dismissed', '1'); } catch {}
    };

    // ── Start a new chat with an unknown phone number ──────────────────────
    const handleStartChat = async () => {
        const digits = newPhone.replace(/\D/g, '');
        if (!digits) { toast.error('Enter a mobile number.'); return; }
        setStartingChat(true);
        try {
            const res = await startChat(digits);
            const created = res?.chat;
            if (created?.jid) {
                await reloadChats();
                setActiveJid(created.jid);
                toast.success(created.chatName
                    ? `Opened chat with ${created.chatName}`
                    : `Started chat with +${created.phone}`);
            } else {
                toast.success('Chat ready.');
            }
            setNewChatOpen(false);
            setNewPhone('');
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Could not start chat');
        } finally {
            setStartingChat(false);
        }
    };

    // ── Pull WhatsApp data (groups + any cached history) ───────────────────
    const handleSync = async () => {
        if (waStatus.status !== 'CONNECTED') {
            toast.error('Connect WhatsApp first.');
            return;
        }
        setSyncing(true);
        try {
            const res = await syncChats();
            const n = res?.groupCount || 0;
            toast.success(n > 0
                ? `Synced ${n} group${n > 1 ? 's' : ''}. New 1:1 chats appear as messages arrive.`
                : 'Sync done. New chats will appear as messages arrive.');
            await reloadChats();
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    // ── Load chat list ─────────────────────────────────────────────────────
    // `silent=true` is used for background refreshes triggered by socket
    // events: failures (e.g. axios timeout under a burst of incoming msgs)
    // are logged but do not toast — the existing chat list stays visible.
    const reloadChats = async ({ silent = false } = {}) => {
        try {
            const data = await listChats();
            setChats(Array.isArray(data?.chats) ? data.chats : []);
        } catch (err) {
            if (silent) {
                // eslint-disable-next-line no-console
                console.warn('[WhatsAppChat] background reloadChats failed:', err.message);
            } else {
                toast.error(err.response?.data?.message || err.message || 'Could not load chats');
            }
        } finally {
            setChatsLoading(false);
        }
    };

    // Debounced socket-triggered refresh: incoming messages can land in
    // bursts (group activity, history sync). Coalesce them into one reload.
    const reloadChatsDebounceRef = useRef(null);
    const scheduleReloadChats = () => {
        if (reloadChatsDebounceRef.current) clearTimeout(reloadChatsDebounceRef.current);
        reloadChatsDebounceRef.current = setTimeout(() => {
            reloadChatsDebounceRef.current = null;
            reloadChats({ silent: true });
        }, 800);
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
        // mark as read (best-effort) and reflect it locally so the unread
        // badge + the "Unread" filter count drop to zero immediately, even
        // before the debounced chat-list refresh fires.
        markRead(activeJid).catch(() => {});
        setChats((prev) => prev.map((c) =>
            c.jid === activeJid && (c.unread || 0) > 0 ? { ...c, unread: 0 } : c
        ));
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
                // mark read for live in-view + keep local chat-list unread at 0
                if (msg.direction === 'in') {
                    markRead(activeJid).catch(() => {});
                    setChats((prev) => prev.map((c) =>
                        c.jid === activeJid && (c.unread || 0) > 0 ? { ...c, unread: 0 } : c
                    ));
                }
            }
            // Refresh chat list previews — debounced so a burst of incoming
            // messages causes only one listChats call.
            scheduleReloadChats();
        };
        const onStatus = (s) => setWaStatus(s);
        const onHistorySync = (info) => {
            // Baileys streamed a batch of historical chats/messages — reload
            // (debounced to coalesce multiple history batches).
            scheduleReloadChats();
            if (info?.messages > 0) {
                toast.success(`Synced ${info.chats} chat${info.chats !== 1 ? 's' : ''}, ${info.messages} message${info.messages !== 1 ? 's' : ''}`);
            }
        };
        socket.on('whatsapp:message', onMessage);
        socket.on('whatsapp:status', onStatus);
        socket.on('whatsapp:history-sync', onHistorySync);
        return () => {
            socket.off('whatsapp:message', onMessage);
            socket.off('whatsapp:status', onStatus);
            socket.off('whatsapp:history-sync', onHistorySync);
        };
    }, [socket, activeJid]);

    // ── Auto-scroll to bottom when messages change ─────────────────────────
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        }
    }, [messages, activeJid]);

    // ── Filtered chat list (tab + search) ──────────────────────────────────
    const filteredChats = useMemo(() => {
        const byTab = (c) => {
            switch (activeFilter) {
                case 'all':       return true;
                case 'unread':    return (c.unread || 0) > 0;
                case 'groups':    return c.badge === 'group';
                case 'contacts':  return c.badge === 'contact';
                case 'unknown':   return c.badge === 'unknown';
                case 'customers': return c.badge === 'customer';
                default:          return true;
            }
        };
        const bySearch = (c) => {
            const q = search.trim().toLowerCase();
            if (!q) return true;
            return (
                (c.chatName || '').toLowerCase().includes(q) ||
                (c.crmCustomerName || '').toLowerCase().includes(q) ||
                (c.phone || '').toLowerCase().includes(q) ||
                (c.jid || '').toLowerCase().includes(q) ||
                (c.lastText || '').toLowerCase().includes(q)
            );
        };
        return chats.filter((c) => byTab(c) && bySearch(c));
    }, [chats, search, activeFilter]);

    // Counts per filter tab — for badges in the tab strip.
    const filterCounts = useMemo(() => ({
        all:       chats.length,
        unread:    chats.filter((c) => (c.unread || 0) > 0).length,
        groups:    chats.filter((c) => c.badge === 'group').length,
        contacts:  chats.filter((c) => c.badge === 'contact').length,
        unknown:   chats.filter((c) => c.badge === 'unknown').length,
        customers: chats.filter((c) => c.badge === 'customer').length,
    }), [chats]);

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
            const res = await sendChatMessage(activeJid, message);
            toast.success(`Catalog sent (${picked.length} item${picked.length > 1 ? 's' : ''})`);
            setCatalogOpen(false);
            // Use the persisted doc returned by the controller (same _id the
            // socket echo will carry) so the message appears exactly once.
            const real = res?.message;
            if (real?._id) {
                setMessages((prev) =>
                    prev.some((m) => m._id === real._id) ? prev : [...prev, real]
                );
            }
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

    // ── Right-click menu on a chat bubble ──────────────────────────────────
    const openCtxMenu = (e, message) => {
        e.preventDefault();
        // Position: clamp so the menu (≈240px wide, ≈100px tall) stays in view.
        const MENU_W = 260;
        const MENU_H = 110;
        const x = Math.min(e.clientX, window.innerWidth - MENU_W - 8);
        const y = Math.min(e.clientY, window.innerHeight - MENU_H - 8);
        setCtxMenu({ x, y, message });
    };
    const closeCtxMenu = () => setCtxMenu(null);

    // Close the menu on any outside click / Escape / another right-click.
    useEffect(() => {
        if (!ctxMenu) return;
        const onAnyClick = () => closeCtxMenu();
        const onKey = (e) => { if (e.key === 'Escape') closeCtxMenu(); };
        window.addEventListener('click', onAnyClick);
        window.addEventListener('contextmenu', onAnyClick);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('click', onAnyClick);
            window.removeEventListener('contextmenu', onAnyClick);
            window.removeEventListener('keydown', onKey);
        };
    }, [ctxMenu]);

    // Build a short, sender-prefixed snippet for one message so the lead
    // contains useful context ("You: ..." or "+9199...: ...").
    const oneMessageAsLeadText = (m) => {
        if (!m) return '';
        const body = m.text || `[${m.mediaType || 'media'}]`;
        const sender = m.direction === 'out' ? 'You' : `+${activePhone || (m.participant || '').split('@')[0] || ''}`;
        return `${sender}: ${body}`;
    };

    const handleCtxAddAsLead = () => {
        const m = ctxMenu?.message;
        closeCtxMenu();
        if (!m) return;
        setConvertOverrideText(oneMessageAsLeadText(m));
        setConvertOpen(true);
    };

    const handleCtxCopy = async () => {
        const m = ctxMenu?.message;
        closeCtxMenu();
        if (!m) return;
        const body = m.text || `[${m.mediaType || 'media'}]`;
        try {
            await navigator.clipboard.writeText(body);
            toast.success('Copied');
        } catch {
            toast.error('Could not copy');
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
            const res = await sendChatMessage(activeJid, text);
            setComposer('');
            // The controller already persisted the outgoing message with the
            // real Baileys messageId and returned the saved doc. Append that
            // doc directly so the socket echo (same _id) becomes a no-op via
            // the dedupe in onMessage. Using a fake `local-...` _id here used
            // to cause the message to appear twice.
            const real = res?.message;
            if (real?._id) {
                setMessages((prev) =>
                    prev.some((m) => m._id === real._id) ? prev : [...prev, real]
                );
            }
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
                    <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={handleSync}
                        disabled={syncing || waStatus.status !== 'CONNECTED'}
                        title="Sync Chats / Contacts / Groups from WhatsApp"
                    >
                        {syncing
                            ? <Loader2 size={16} className={styles.spin} />
                            : <RefreshCw size={16} />}
                    </button>
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
                        placeholder="Search name, mobile, group, message"
                        className={styles.searchInput}
                    />
                </div>

                {/* Filter tabs */}
                <div className={styles.filterTabs}>
                    {FILTERS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            className={`${styles.filterTab} ${activeFilter === f.id ? styles.filterTabActive : ''}`}
                            onClick={() => setActiveFilter(f.id)}
                        >
                            {f.label}
                            <span className={styles.filterCount}>{filterCounts[f.id]}</span>
                        </button>
                    ))}
                </div>

                {/* Start new chat */}
                {!newChatOpen ? (
                    <button
                        type="button"
                        className={styles.startChatBtn}
                        onClick={() => setNewChatOpen(true)}
                        disabled={waStatus.status !== 'CONNECTED'}
                        title="Start a new WhatsApp chat with a phone number"
                    >
                        <PlusCircle size={15} />
                        <span>Start New Chat</span>
                    </button>
                ) : (
                    <div className={styles.startChatPanel}>
                        <input
                            type="tel"
                            inputMode="numeric"
                            autoFocus
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleStartChat(); }}
                            placeholder="Phone (e.g. 919920730373)"
                            className={styles.startChatInput}
                            disabled={startingChat}
                        />
                        <button
                            type="button"
                            className={styles.startChatGo}
                            onClick={handleStartChat}
                            disabled={startingChat || !newPhone.replace(/\D/g, '')}
                        >
                            {startingChat ? <Loader2 size={14} className={styles.spin} /> : 'Open'}
                        </button>
                        <button
                            type="button"
                            className={styles.startChatCancel}
                            onClick={() => { setNewChatOpen(false); setNewPhone(''); }}
                            title="Cancel"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* History limitation note */}
                {showHistoryNote && (
                    <div className={styles.infoBanner}>
                        <Info size={14} className={styles.infoIcon} />
                        <span className={styles.infoText}>
                            Old WhatsApp message history may not be available from Baileys.
                            New incoming/outgoing messages will sync from now onward.
                        </span>
                        <button
                            type="button"
                            className={styles.infoClose}
                            onClick={dismissHistoryNote}
                            title="Dismiss"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}

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
                    {filteredChats.map((c) => {
                        const b = BADGE_LABELS[c.badge] || BADGE_LABELS.unknown;
                        const subLabel = c.isGroup
                            ? `${c.jid}`
                            : (c.phone ? `+${c.phone}` : c.jid);
                        return (
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
                                    <div className={styles.chatRowSubLine}>
                                        <span
                                            className={styles.rowBadge}
                                            style={{ color: b.color, background: b.bg, borderColor: b.border }}
                                        >
                                            {b.label}
                                        </span>
                                        <span className={styles.chatRowSub} title={subLabel}>{subLabel}</span>
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
                        );
                    })}
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
                                <MessageBubble
                                    key={m._id}
                                    m={m}
                                    onContextMenu={openCtxMenu}
                                />
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
                    setConvertOverrideText(null);
                }}
                onCreated={(lead) => {
                    handleLeadCreated(lead);
                    setConvertOverrideText(null);
                    if (followUpOpen && lead?._id) {
                        // user clicked "Follow-up" without a lead — now we have one,
                        // jump to the lead detail page to add the follow-up there.
                        setFollowUpOpen(false);
                        navigate(`/crm/leads/${lead._id}`);
                    }
                }}
                // Right-click "Add as Lead from this message" sets an override
                // so the modal opens pre-filled with JUST that one message
                // instead of the generic last-8-messages preview.
                initialMessageText={convertOverrideText != null ? convertOverrideText : recentChatText}
                initialCustomerMobile={activePhone ? `+${activePhone}` : ''}
                initialCustomerName={activeChat?.isGroup ? '' : ''}
            />

            {/* Right-click context menu over chat bubbles */}
            {ctxMenu && (
                <div
                    className={styles.ctxMenu}
                    style={{ left: ctxMenu.x, top: ctxMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                    role="menu"
                >
                    <button
                        type="button"
                        className={styles.ctxMenuItem}
                        onClick={handleCtxAddAsLead}
                        title="Open the Convert-to-Lead modal pre-filled with this message"
                    >
                        <UserPlus size={14} />
                        <span>Add as Lead from this message</span>
                    </button>
                    <button
                        type="button"
                        className={styles.ctxMenuItem}
                        onClick={handleCtxCopy}
                        title="Copy this message text to clipboard"
                    >
                        <Copy size={14} />
                        <span>Copy text</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default WhatsAppChatPage;
