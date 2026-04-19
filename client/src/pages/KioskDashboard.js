import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useSettings } from '../context/SettingsContext';

// ── Live clock ──
function LiveClock({ businessName, logoUrl, phone }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div style={{ textAlign: 'center', padding: '24px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 8 }}>
        {logoUrl && <img src={logoUrl} alt="Logo" style={{ height: 64, width: 64, objectFit: 'contain', borderRadius: 8 }} />}
        <div style={{ textAlign: 'left' }}>
          {businessName && <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{businessName}</div>}
          {phone && <div style={{ fontSize: 16, color: 'var(--text3)', marginTop: 4, fontWeight: 500 }}>{phone}</div>}
        </div>
      </div>
      <div style={{ fontSize: 48, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '.04em', color: 'var(--accent)' }}>
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
  // Safely handle colors
  const borderColor = color ? `${color}40` : 'var(--border)';
  const bgColor = color ? `${color}10` : 'var(--bg3)';
  const dotColor = color || 'var(--accent)';

  return (
    <div style={{
      background: 'var(--bg2)', borderRadius: 14, border: `1px solid ${borderColor}`,
      overflow: 'hidden', transition: 'all .2s',
    }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding: '20px 20px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{icon}</div>
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
        <div style={{ borderTop: `1px solid ${borderColor}`, background: bgColor }}>
          {items.slice(0, 6).map((item, i) => (
            <div key={i} style={{ padding: '8px 20px', borderBottom: i < Math.min(items.length, 6) - 1 ? `1px solid ${borderColor}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
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
  const [activeKioskRepair, setActiveKioskRepair] = useState(null);
  const [activeGuide, setActiveGuide] = useState(null);

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
      const active = repairs.find(r => r.is_active_kiosk === 1);
      setActiveKioskRepair(active);

      if (active) {
        // Fetch matching guide for this repair
        const guidesRes = await axios.get(`/api/ai/guides?brand=${active.device_brand || ''}&model=${active.device_model || ''}`);
        if (guidesRes.data?.length > 0) setActiveGuide(guidesRes.data[0]);
        else setActiveGuide(null);
      } else {
        setActiveGuide(null);
      }
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
        <LiveClock
          businessName={settings?.company_name || 'RepairShop'}
          logoUrl={settings?.logo_url}
          phone={settings?.phone}
        />

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

        {/* ── Kiosk Dual Display ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Left: Active Repairs List */}
          <div className="card" style={{ height: 600, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📋 Shop Workflow</span>
              <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>{(data?.inRepair?.length || 0) + (data?.diagnosing?.length || 0)} in progress</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {[...(data?.inRepair || []), ...(data?.diagnosing || [])].map(r => (
                <div key={r.id} style={{
                  padding: '14px 16px', borderRadius: 10, background: r.id === activeKioskRepair?.id ? 'var(--accent-light)' : 'var(--bg3)',
                  border: `1px solid ${r.id === activeKioskRepair?.id ? 'var(--accent)' : 'var(--border)'}`,
                  marginBottom: 10
                }}>
                  <div className="flex-between">
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.customer_name}</div>
                    <span className={`badge badge-${r.status}`} style={{ fontSize: 10 }}>{r.status.replace('_',' ').toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{r.device_brand} {r.device_model} — {r.title}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: AI Panel */}
          <div className="card" style={{ height: 600, display: 'flex', flexDirection: 'column', border: '1px solid rgba(124, 58, 237, 0.25)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>🤖 AI Technical Recommendations</div>
            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg3)', borderRadius: 10, padding: 20 }}>
              {activeKioskRepair ? (
                <div>
                  <div style={{ background: 'var(--purple-light)', border: '1px solid var(--purple)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>FOCUS: {activeKioskRepair.device_brand} {activeKioskRepair.device_model}</div>
                    <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 4 }}>{activeKioskRepair.description}</div>
                  </div>
                  {activeGuide ? (
                    <div>
                      <div style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{activeGuide.guide_content}</div>
                      <div style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
                        ⚠️ double check ai documentsition, AI can make mistakes
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Researching specific model guides…</div>
                  )}
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text3)' }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>👈</div>
                  <div>Select a repair in the Repairs tab to display AI guides here.</div>
                </div>
              )}
            </div>
          </div>
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
        <div style={{ textAlign: 'center', marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            {settings?.donation_link && (
              <a href={settings.donation_link} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ background: 'var(--warning-light)', color: 'var(--warning)', borderColor: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 8 }}>
                ☕ Like my software? Buy me a cup of coffee
              </a>
            )}
            {settings?.support_email && (
              <div style={{ fontSize: 13, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                📧 Feedback & Requests: <a href={`mailto:${settings.support_email}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>{settings.support_email}</a>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            Refreshes automatically every minute · RepairShop v10
          </div>
        </div>
      </div>
    </div>
  );
}
