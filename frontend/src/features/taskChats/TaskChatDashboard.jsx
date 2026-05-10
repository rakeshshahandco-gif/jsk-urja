import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    MessageSquare, Send, Paperclip, Phone, Video, Search,
    MoreVertical, User, ArrowLeft, Info, ExternalLink,
    Check, CheckCheck, Clock, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { Button, Input } from '@/components/ui';
import { getMessages, sendMessage, getChatRooms } from '@/services/taskChatApi';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

const TaskChatDashboard = () => {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const [rooms, setRooms] = useState([]);
    const [loadingRooms, setLoadingRooms] = useState(true);
    const [searchRoom, setSearchRoom] = useState('');

    useEffect(() => {
        const fetchRooms = async () => {
            try {
                const data = await getChatRooms();
                setRooms(data.data || []);
            } catch (error) {
                console.error('Failed to fetch chat rooms:', error);
            } finally {
                setLoadingRooms(false);
            }
        };
        fetchRooms();
    }, []);

    const filteredRooms = rooms.filter(room =>
        room.title.toLowerCase().includes(searchRoom.toLowerCase())
    );

    return (
        <div className="flex h-[calc(100vh-64px)] bg-gray-100 overflow-hidden font-sans">
            {/* Sidebar: Chat Rooms */}
            <div className={`w-full md:w-80 lg:w-96 bg-white border-r border-gray-200 flex flex-col ${taskId ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-xl font-black text-gray-900 tracking-tight">Task chats</h1>
                        <button className="p-2 text-blue-500 hover:bg-blue-50 rounded-full transition-colors">
                            <MessageSquare size={20} />
                        </button>
                    </div>
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <Input
                            placeholder="Search tasks..."
                            className="pl-10 bg-gray-50 border-gray-100 focus:bg-white"
                            value={searchRoom}
                            onChange={(e) => setSearchRoom(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loadingRooms ? (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <Loader2 className="w-8 h-8 animate-spin mb-2" />
                            <span className="text-sm font-bold">Loading chats...</span>
                        </div>
                    ) : filteredRooms.length === 0 ? (
                        <div className="p-10 text-center text-gray-400">
                            <p className="font-bold">No active task chats</p>
                            <p className="text-xs mt-1">Assignees of tasks will appear here</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {filteredRooms.map(room => (
                                <ChatRoomItem
                                    key={room._id}
                                    room={room}
                                    active={taskId === room._id}
                                    onClick={() => navigate(`/task-chats/${room._id}`)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content: Message Area */}
            <div className={`flex-1 flex flex-col bg-[#E3EBF3] relative ${!taskId ? 'hidden md:flex' : 'flex'}`}>
                {taskId ? (
                    <TaskChatMessageArea taskId={taskId} />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-10 text-center">
                        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                            <MessageSquare size={40} className="text-blue-500" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-700 mb-2">Select a Task Chat</h2>
                        <p className="max-w-xs text-sm font-medium">Choose a task from the sidebar to start collaborating with your team members.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const ChatRoomItem = ({ room, active, onClick }) => {
    const lastMsg = room.lastMessage;
    const time = lastMsg ? format(new Date(lastMsg.createdAt), 'hh:mm a') : format(new Date(room.createdAt), 'hh:mm a');

    return (
        <button
            onClick={onClick}
            className={`w-full p-4 flex items-start gap-3 transition-all text-left border-l-4 ${active ? 'bg-[#00AEEF] border-[#00AEEF] text-white shadow-lg z-10' : 'hover:bg-gray-50 border-transparent'
                }`}
        >
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-black text-lg shrink-0 ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                {room.title.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                    <h3 className={`font-black text-sm truncate ${active ? 'text-white' : 'text-gray-900'}`}>{room.title}</h3>
                    <span className={`text-[10px] whitespace-nowrap ml-2 ${active ? 'text-white/70' : 'text-gray-400'}`}>{time}</span>
                </div>
                <div className="flex items-center gap-1">
                    {lastMsg && (
                        <span className={`text-xs font-bold shrink-0 ${active ? 'text-white/80' : 'text-gray-500'}`}>
                            {lastMsg.senderId?.name}:
                        </span>
                    )}
                    <p className={`text-xs truncate ${active ? 'text-white/80' : 'text-gray-400 italic'}`}>
                        {lastMsg ? lastMsg.content : 'Task created'}
                    </p>
                </div>
            </div>
            {active && <Check className="shrink-0 w-4 h-4 text-white mt-1" />}
        </button>
    );
};

const TaskChatMessageArea = ({ taskId }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [taskInfo, setTaskInfo] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        const fetchMessages = async () => {
            setLoading(true);
            try {
                // Fetch messages
                const msgData = await getMessages(taskId);
                setMessages(msgData.data || []);

                // We'd ideally fetch task details too, for now we infer from the room list or a separate call
                // For Bitrix24 look, we show a 'task summary' card in the chat
                const roomsData = await getChatRooms();
                const currentTask = roomsData.data.find(r => r._id === taskId);
                setTaskInfo(currentTask);
            } catch (error) {
                toast.error('Failed to load chat');
            } finally {
                setLoading(false);
            }
        };

        if (taskId) {
            fetchMessages();
            // Optional: polling
            const interval = setInterval(fetchMessages, 10000); // 10s polling
            return () => clearInterval(interval);
        }
    }, [taskId]);

    useEffect(scrollToBottom, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || sending) return;

        setSending(true);
        try {
            const data = await sendMessage(taskId, newMessage);
            setMessages(prev => [...prev, data.data]);
            setNewMessage('');
        } catch (error) {
            toast.error('Failed to send message');
        } finally {
            setSending(false);
        }
    };

    if (loading && messages.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                <p className="font-bold">Entering chat room...</p>
            </div>
        );
    }

    return (
        <>
            {/* Chat Header */}
            <div className="h-16 bg-white border-b border-gray-200 px-4 flex items-center justify-between z-10 shadow-sm">
                <div className="flex items-center gap-3 overflow-hidden">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="md:hidden p-1 text-gray-500"
                        onClick={() => navigate('/task-chats')}
                    >
                        <ArrowLeft size={20} />
                    </Button>
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center font-bold text-blue-600 shrink-0">
                        {taskInfo?.title?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                        <h2 className="font-black text-gray-900 truncate tracking-tight">{taskInfo?.title}</h2>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 italic">
                            <span>1 member</span>
                            <button className="text-blue-500 hover:underline uppercase flex items-center gap-1" onClick={() => navigate('/tasks/list')}>
                                <ExternalLink size={10} /> View Task
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="hidden sm:flex gap-1 mr-2 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
                        <Video size={16} className="text-blue-500" />
                        <span className="text-xs font-bold text-blue-600">Video call</span>
                    </div>
                    <button className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"><Search size={20} /></button>
                    <button className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"><MoreVertical size={20} /></button>
                </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-6">
                {/* Task System Message (The Bitrix Style Card) */}
                <div className="flex flex-col items-center gap-2 my-4">
                    <span className="bg-gray-100/80 px-4 py-1 rounded-full text-[10px] font-bold text-gray-500 uppercase tracking-widest">today</span>

                    <div className="max-w-md w-full bg-white/90 backdrop-blur rounded-2xl shadow-sm border border-gray-200 overflow-hidden mt-2 p-5 flex flex-col gap-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shrink-0">
                                <User className="text-white" size={20} />
                            </div>
                            <div className="flex-1 text-xs">
                                <p className="font-medium text-gray-500 mb-1">
                                    <span className="text-blue-600 font-bold">{taskInfo?.createdBy?.email || 'admin@example.com'}</span> created <span className="text-blue-600 font-bold hover:underline cursor-pointer">this task</span>.
                                </p>
                                <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white text-xs">
                                            {taskInfo?.title?.substring(0, 2).toUpperCase()}
                                        </div>
                                        <span className="font-bold text-blue-700">{taskInfo?.title}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-y-2 text-[11px]">
                                        <span className="text-gray-400 font-bold">Status:</span>
                                        <span className="col-span-2 font-bold text-gray-700">{taskInfo?.status || 'Pending'}</span>

                                        <span className="text-gray-400 font-bold">Created by:</span>
                                        <span className="col-span-2 font-bold text-gray-700">{taskInfo?.createdBy?.email || 'admin@example.com'}</span>

                                        <span className="text-gray-400 font-bold">Assignee:</span>
                                        <span className="col-span-2 font-bold text-gray-700">{taskInfo?.lastMessage?.senderId?.name || 'Everyone'}</span>

                                        <span className="text-gray-400 font-bold">Deadline:</span>
                                        <span className="col-span-2 font-bold text-gray-700">
                                            {taskInfo?.dueDate ? format(new Date(taskInfo.dueDate), 'dd/MM/yyyy hh:mm a') : 'No deadline'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="text-right text-[10px] text-gray-400 font-bold">
                            {format(new Date(taskInfo?.createdAt || Date.now()), 'hh:mm a')}
                        </div>
                    </div>
                </div>

                {/* Chat Bubbles */}
                {messages.map((msg, idx) => {
                    const isMe = msg.senderId?._id === user?.id || msg.senderId === user?.id;
                    const showName = idx === 0 || messages[idx - 1]?.senderId?._id !== msg.senderId?._id;

                    return (
                        <div key={msg._id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] ${isMe ? 'self-end' : 'self-start'}`}>
                            {showName && !isMe && (
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1 px-2">{msg.senderId?.name}</span>
                            )}
                            <div className="flex items-end gap-2 group">
                                {!isMe && (
                                    <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                        {msg.senderId?.name?.substring(0, 1).toUpperCase()}
                                    </div>
                                )}
                                <div className={`relative px-4 py-2.5 rounded-2xl shadow-sm text-sm font-medium ${isMe
                                    ? 'bg-[#CCF2FF] text-[#004D66] rounded-br-none'
                                    : 'bg-white text-gray-800 rounded-bl-none'
                                    }`}>
                                    {msg.content}
                                    <div className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${isMe ? 'text-[#004D66]/60' : 'text-gray-400'}`}>
                                        {format(new Date(msg.createdAt), 'hh:mm a')}
                                        {isMe && <CheckCheck size={10} />}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 md:p-6 bg-[#E3EBF3] z-10">
                <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-200 p-2 flex flex-col gap-2">
                    <form onSubmit={handleSend} className="flex items-end gap-2">
                        <Button variant="ghost" size="sm" type="button" className="text-gray-400 p-2"><Paperclip size={20} /></Button>
                        <textarea
                            className="flex-1 border-0 focus:ring-0 text-sm py-2 px-1 resize-none bg-transparent min-h-[40px] max-h-32 font-medium"
                            placeholder="Type a message or use @ to mention..."
                            rows="1"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend(e);
                                }
                            }}
                        />
                        <div className="flex items-center gap-1 p-1">
                            <button type="button" className="p-2 text-gray-400 hover:text-gray-600 transition-colors">😊</button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={!newMessage.trim() || sending}
                                className="bg-[#00AEEF] hover:bg-[#0092c7] text-white rounded-xl px-4 py-2 h-10 shadow-md transition-all active:scale-95"
                            >
                                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send size={20} />}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};

export default TaskChatDashboard;
