import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useSettings } from '../context/SettingsContext';

// ── Live clock ──
function LiveClock({ businessName }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div style={{ textAlign: 'center', padding: '24px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
      {businessName && <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 4 }}>{businessName}</div>}
      <div style={{ fontSize: 42, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '.04em', color: 'var(--accent)' }}>
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={{ fontSize: 18, color: 'var(--text2)', marginTop: 4 }}>
        {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}

// ── Stat card with expandable list ──
function StatCard({ icon, label, count, color, items, itemRenderer }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: 'var(--bg2)', borderRadius: 14, border: `1px solid ${color}30`,
      overflow: 'hidden', transition: 'all .2s',
    }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding: '20px 20px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 38, fontWeight: 800, color, lineHeight: 1 }}>{count}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, fontWeight: 600 }}>{label}</div>
        </div>
        {items?.length > 0 && (
          <div style={{ fontSize: 18, color: 'var(--text3)', transition: 'transform .2s', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</div>
        )}
      </div>
      {/* Always show up to 6 items */}
      {items?.length > 0 && (
        <div style={{ borderTop: `1px solid ${color}20`, background: color + '08' }}>
          {items.slice(0, 6).map((item, i) => (
            <div key={i} style={{ padding: '8px 20px', borderBottom: i < Math.min(items.length, 6) - 1 ? `1px solid ${color}15` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13 }}>{itemRenderer ? itemRenderer(item) : item}</div>
            </div>
          ))}
          {items.length > 6 && (
            <div style={{ padding: '6px 20px', fontSize: 12, color: 'var(--text3)' }}>+{items.length - 6} more</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function KioskDashboard({ onNavigate }) {
  const { settings } = useSettings();
  const [data, setData] = useState(null);
  const [aiMessage, setAiMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

      const [repairsRes, apptsRes, remindersRes, statsRes] = await Promise.allSettled([
        axios.get('/api/repairs'),
        axios.get(`/api/appointments?start=${todayStart}&end=${todayEnd}`),
        axios.get('/api/reminders/pending'),
        axios.get('/api/repairs/stats'),
      ]);

      const repairs = repairsRes.status === 'fulfilled' ? repairsRes.value.data : [];
      const appts = apptsRes.status === 'fulfilled' ? apptsRes.value.data : [];
      const reminders = remindersRes.status === 'fulfilled' ? remindersRes.value.data : [];
      const stats = statsRes.status === 'fulfilled' ? statsRes.value.data : {};

      // Filter categories
      const inRepair = repairs.filter(r => r.status === 'in_repair');
      const waitingParts = repairs.filter(r => r.status === 'waiting_parts');
      const diagnosing = repairs.filter(r => r.status === 'diagnosing' || r.status === 'intake');
      const readyPickup = repairs.filter(r => r.status === 'ready');
      const hits3Days = repairs.filter(r =>
        !['completed','cancelled'].includes(r.status) &&
        new Date(r.created_at) <= new Date(Date.now() - 3 * 86400000)
      );
      const overdueReminders = reminders.filter(r => new Date(r.due_date) <= new Date());
      const todayRepairs = repairs.filter(r => r.created_at >= todayStart && r.created_at <= todayEnd);

      setData({ repairs, appts, reminders, overdueReminders, inRepair, waitingParts, diagnosing, readyPickup, hits3Days, todayRepairs, stats });
    } catch(e) {
      console.error('Kiosk load error:', e.message);
    }
  }, []);

  // Load AI follow-up message
  const loadAI = useCallback(async () => {
    try {
      const r = await axios.post('/api/ai/insights', { period: 'week' });
      setAiMessage(r.data?.result?.split('\n')[0] || '');
    } catch(e) {}
  }, []);

  useEffect(() => {
    load();
    loadAI();
    const t = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(t);
  }, [load, loadAI]);

  const repairLabel = r => `${r.customer_name} — ${r.title}${r.device_brand ? ` (${r.device_brand})` : ''}`;
  const apptLabel = a => `${a.customer_name || a.title} — ${new Date(a.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const reminderLabel = r => `${r.customer_name} — ${r.message || 'Follow up'}`;
  const overdueLabel = r => {
    const days = Math.floor((Date.now() - new Date(r.created_at)) / 86400000);
    return `${r.customer_name} — ${r.title} (${days}d ago)`;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0 0 32px' }}>
      {/* Header with clock */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px' }}>
        <LiveClock businessName={settings?.company_name || 'RepairShop'} />

        {/* AI follow-up notification */}
        {aiMessage && (
          <div style={{ background: 'var(--purple-light)', border: '1px solid var(--purple)', borderRadius: 10, padding: '12px 16px', marginBottom: 24, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🤖</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--purple)', marginBottom: 3 }}>AI Follow-up Insight</div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{aiMessage}</div>
            </div>
          </div>
        )}

        {/* Today's appointments */}
        {data?.appts?.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>📅 Today's appointments ({data.appts.length})</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {data.appts.map(a => (
                <div key={a.id} style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{new Date(a.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                  <div>{a.customer_name || a.title}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Overdue reminders */}
        {data?.overdueReminders?.length > 0 && (
          <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--warning)', marginBottom: 8 }}>⏰ Follow-ups due ({data.overdueReminders.length})</div>
            {data.overdueReminders.slice(0, 4).map(r => (
              <div key={r.id} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
                • {r.customer_name} — {r.message || 'Follow up'} <span style={{ fontSize: 11, color: 'var(--warning)' }}>(due {new Date(r.due_date).toLocaleDateString()})</span>
              </div>
            ))}
          </div>
        )}

        {/* 3-day alert */}
        {data?.hits3Days?.length > 0 && (
          <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--danger)', marginBottom: 8 }}>🔴 Repairs approaching 3+ days ({data.hits3Days.length})</div>
            {data.hits3Days.slice(0, 4).map(r => {
              const days = Math.floor((Date.now() - new Date(r.created_at)) / 86400000);
              return (
                <div key={r.id} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
                  • {r.customer_name} — {r.title} <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>{days} days</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Main stat cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard
            icon="🔧" label="Currently In Repair" count={data?.inRepair?.length || 0}
            color="var(--accent)" items={data?.inRepair}
            itemRenderer={r => repairLabel(r)}
          />
          <StatCard
            icon="📦" label="Waiting for Parts" count={data?.waitingParts?.length || 0}
            color="var(--warning)" items={data?.waitingParts}
            itemRenderer={r => repairLabel(r)}
          />
          <StatCard
            icon="🔍" label="Needs Diagnosed" count={data?.diagnosing?.length || 0}
            color="var(--purple)" items={data?.diagnosing}
            itemRenderer={r => repairLabel(r)}
          />
          <StatCard
            icon="✅" label="Ready for Pickup" count={data?.readyPickup?.length || 0}
            color="var(--success)" items={data?.readyPickup}
            itemRenderer={r => repairLabel(r)}
          />
        </div>

        {/* Today's incoming */}
        {data?.todayRepairs?.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>📥 Received today ({data.todayRepairs.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {data.todayRepairs.map(r => (
                <div key={r.id} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{r.customer_name}</div>
                  <div style={{ color: 'var(--text2)' }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.device_brand} {r.device_model}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All reminders */}
        {data?.reminders?.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>⏰ Reminders ({data.reminders.length})</div>
            {data.reminders.slice(0, 6).map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14 }}>📞</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{r.customer_name}</span>
                  {r.message && <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>{r.message}</span>}
                </div>
                <span style={{ fontSize: 12, color: new Date(r.due_date) < new Date() ? 'var(--danger)' : 'var(--text3)', fontWeight: new Date(r.due_date) < new Date() ? 700 : 400 }}>
                  {new Date(r.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tasks for today */}
        {(data?.inRepair?.length > 0 || data?.diagnosing?.length > 0) && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>📋 Today's tasks</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {[...( data?.inRepair||[]), ...(data?.diagnosing||[])].slice(0, 12).map(r => (
                <div key={r.id} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{r.status === 'in_repair' ? '🔧' : '🔍'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.status.replace('_',' ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text3)' }}>
          Refreshes automatically every minute · RepairShop v10
        </div>
      </div>
    </div>
  );
}
