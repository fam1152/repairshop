import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/AccountManagement';
import { format } from 'date-fns';

export default function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [recipient, setRecipient] = useState('broadcast'); // 'broadcast' | 'ai' | user_id
  const [aiTyping, setAiTyping] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const messagesEndRef = useRef(null);
  const lastFetch = useRef(null);
  const pollRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = useCallback(async (since) => {
    try {
      const params = since ? `?since=${since}` : '';
      const r = await axios.get(`/api/chat/messages${params}`);
      if (since) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMsgs = r.data.filter(m => !existingIds.has(m.id));
          return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
        });
      } else {
        setMessages(r.data);
      }
      if (r.data.length > 0) {
        lastFetch.current = r.data[r.data.length - 1].created_at;
      }
    } catch(e) {}
  }, []);

  useEffect(() => {
    loadMessages();
    axios.get('/api/users').then(r => setUsers(r.data)).catch(() => {});
    axios.get('/api/ai/model-updates').then(r => {
      setAvailableModels(r.data.installed || []);
      setSelectedModel(r.data.current_model || '');
    }).catch(() => {});

    // Poll for new messages every 3 seconds
    pollRef.current = setInterval(() => {
      loadMessages(lastFetch.current);
    }, 3000);

    return () => clearInterval(pollRef.current);
  }, [loadMessages]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const msg = input.trim();
    setInput('');

    try {
      if (recipient === 'ai') {
        setAiTyping(true);
        const r = await axios.post('/api/chat/ai', { message: msg, model: selectedModel });
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          const toAdd = [r.data.userMessage, r.data.aiMessage].filter(m => m && !ids.has(m.id));
          return [...prev, ...toAdd];
        });
        setAiTyping(false);
      } else {
        const r = await axios.post('/api/chat/messages', {
          message: msg,
          recipient_id: recipient === 'broadcast' ? '' : recipient,
          is_broadcast: recipient === 'broadcast' ? 1 : 0,
        });
        setMessages(prev => [...prev, r.data]);
        lastFetch.current = r.data.created_at;
      }
    } catch(e) { setInput(msg); setAiTyping(false); }
    setSending(false);
  };

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  // Filter messages for current view
  const visibleMessages = messages.filter(m => {
    if (recipient === 'broadcast') return m.is_broadcast || m.recipient_id === '' || m.is_ai;
    if (recipient === 'ai') return (m.sender_id === user?.id && m.recipient_id === 'ai') || (m.is_ai && m.recipient_id === user?.id);
    return (m.sender_id === user?.id && m.recipient_id === recipient) ||
           (m.sender_id === recipient && m.recipient_id === user?.id);
  });

  const otherUsers = users.filter(u => u.id !== user?.id);

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', padding: 0 }}>
      <div style={{ display: 'flex', height: '100%' }}>
        {/* Sidebar */}
        <div style={{ width: 200, minWidth: 200, borderRight: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 12px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>💬 Chat</div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
            {/* Channels */}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6, padding: '0 4px' }}>Channels</div>
            <button className={`nav-item ${recipient === 'broadcast' ? 'active' : ''}`} onClick={() => setRecipient('broadcast')}>
              # General
            </button>
            <button className={`nav-item ${recipient === 'ai' ? 'active' : ''}`} onClick={() => setRecipient('ai')} style={{ color: recipient === 'ai' ? 'var(--purple)' : undefined, background: recipient === 'ai' ? 'var(--purple-light)' : undefined }}>
              🤖 RepairBot AI
            </button>

            {/* Direct messages */}
            {otherUsers.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', margin: '12px 0 6px', padding: '0 4px' }}>Direct Messages</div>
                {otherUsers.map(u => (
                  <button key={u.id} className={`nav-item ${recipient === u.id ? 'active' : ''}`} onClick={() => setRecipient(u.id)} style={{ gap: 8 }}>
                    <Avatar user={u} size={20} />
                    {u.display_name || u.username}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Message area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 13, fontWeight: 600 }}>
            {recipient === 'broadcast' ? '# General — all users' : recipient === 'ai' ? '🤖 RepairBot AI' : `@ ${users.find(u => u.id === recipient)?.display_name || 'Direct message'}`}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            {visibleMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 16px' }}>
                {recipient === 'ai' ? '🤖 Ask RepairBot anything about your shop, repairs, or IT issues.' : 'No messages yet. Send the first one!'}
              </div>
            )}
            {visibleMessages.map(msg => {
              const isMe = msg.sender_id === user?.id;
              const isAI = msg.is_ai;
              const sender = isAI ? { username: 'RepairBot', display_name: 'RepairBot', avatar_url: null } : users.find(u => u.id === msg.sender_id) || { username: msg.sender_name };

              return (
                <div key={msg.id} style={{ marginBottom: 12, display: 'flex', gap: 10, flexDirection: isMe && !isAI ? 'row-reverse' : 'row' }}>
                  {isAI ? (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--purple-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🤖</div>
                  ) : (
                    <Avatar user={sender} size={32} />
                  )}
                  <div style={{ maxWidth: '75%' }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3, textAlign: isMe && !isAI ? 'right' : 'left' }}>
                      {isAI ? 'RepairBot' : (sender?.display_name || msg.sender_name)}
                      <span style={{ marginLeft: 6 }}>{format(new Date(msg.created_at), 'h:mm a')}</span>
                    </div>
                    <div style={{
                      padding: '8px 12px', borderRadius: isMe && !isAI ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                      background: isAI ? 'var(--purple-light)' : isMe ? 'var(--accent)' : 'var(--bg3)',
                      color: isAI ? 'var(--text)' : isMe ? '#fff' : 'var(--text)',
                      fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap'
                    }}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })}
            {aiTyping && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--purple-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🤖</div>
                <div style={{ background: 'var(--bg3)', padding: '10px 14px', borderRadius: '2px 12px 12px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, background: 'var(--purple)', borderRadius: '50%', animation: `bounce 1.2s ease-in-out ${i*.2}s infinite` }} />)}
                  <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}`}</style>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
            {recipient === 'ai' && availableModels.length > 0 && (
              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>Model:</span>
                <select 
                  className="form-control form-control-xs" 
                  style={{ width: 'auto', fontSize: 11, height: 24, padding: '0 8px' }}
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                >
                  {availableModels.map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '4px 4px 4px 12px' }}>
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                placeholder={recipient === 'ai' ? 'Ask RepairBot anything…' : 'Type a message… (Enter to send)'}
                style={{ flex: 1, border: 'none', background: 'none', resize: 'none', outline: 'none', fontSize: 13, lineHeight: 1.5, padding: '6px 0', fontFamily: 'var(--font)', color: 'var(--text)', minHeight: 36, maxHeight: 120 }}
                rows={1} />
              <button className="btn btn-primary btn-sm" onClick={send} disabled={!input.trim() || sending} style={{ alignSelf: 'flex-end', marginBottom: 2 }}>
                {sending ? '…' : '↑'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Enter to send · Shift+Enter for new line</div>
          </div>
        </div>
      </div>
    </div>
  );
}
