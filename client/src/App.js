import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { AIProvider } from './context/AIContext';
import Login from './pages/Login';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[React Error Boundary]', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, background: '#fff', color: '#000', height: '100vh' }}>
          <h1 style={{ color: '#dc2626' }}>Application Crash</h1>
          <p>A runtime error occurred in the browser.</p>
          <pre style={{ background: '#f8fafc', padding: 20, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, overflow: 'auto' }}>
            {this.state.error?.stack || this.state.error?.toString()}
          </pre>
          <button className="btn btn-primary" onClick={() => { localStorage.clear(); window.location.reload(); }}>Clear Cache & Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Repairs from './pages/Repairs';
import Invoices from './pages/Invoices';
import Reminders from './pages/Reminders';
import Inventory from './pages/Inventory';
import Scanner from './pages/Scanner';
import { Avatar } from './components/AccountManagement';
import Money from './pages/Money';
import Reports from './pages/Reports';
import Trash from './pages/Trash';
import PriceBook from './pages/PriceBook';
import Workflows from './pages/Workflows';
import NotificationBell from './components/NotificationBell';
import KioskDashboard from './pages/KioskDashboard';
import Chat from './pages/Chat';
import Estimates from './pages/Estimates';
import Appointments from './pages/Appointments';
import Settings from './pages/Settings';
import Operations from './pages/Operations';
import axios from 'axios';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="2"/></svg> },
  { id: 'repairs', label: 'Repairs', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" strokeWidth="2" strokeLinecap="round"/></svg> },
  { id: 'customers', label: 'Customers', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeWidth="2"/><circle cx="9" cy="7" r="4" strokeWidth="2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="2" strokeLinecap="round"/></svg> },
  { id: 'reports', label: 'Reports', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeWidth="2"/><polyline points="14 2 14 8 20 8" strokeWidth="2"/><line x1="16" y1="13" x2="8" y2="13" strokeWidth="2"/><line x1="16" y1="17" x2="8" y2="17" strokeWidth="2"/><polyline points="10 9 9 9 8 9" strokeWidth="2"/></svg> },
  { id: 'money', label: 'Money', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23" strokeWidth="2" strokeLinecap="round"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeWidth="2" strokeLinecap="round"/></svg> },
  { id: 'estimates', label: 'Estimates', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeWidth="2"/><polyline points="14 2 14 8 20 8" strokeWidth="2"/><line x1="9" y1="13" x2="15" y2="13" strokeWidth="2"/><line x1="9" y1="17" x2="11" y2="17" strokeWidth="2"/></svg> },
  { id: 'invoices', label: 'Invoices', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeWidth="2"/><polyline points="14 2 14 8 20 8" strokeWidth="2"/><line x1="9" y1="13" x2="15" y2="13" strokeWidth="2"/><line x1="9" y1="17" x2="12" y2="17" strokeWidth="2"/></svg> },
  { id: 'appointments', label: 'Appointments', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2"/><line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round"/><line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="10" x2="21" y2="10" strokeWidth="2"/></svg> },
  { id: 'reminders', label: 'Reminders', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeWidth="2"/><path d="M13.73 21a2 2 0 0 1-3.46 0" strokeWidth="2" strokeLinecap="round"/></svg> },
  { id: 'chat', label: 'Chat', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id: 'scanner', label: 'Scanner', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" strokeWidth="2" strokeLinecap="round"/><rect x="7" y="7" width="10" height="10" rx="1" strokeWidth="2"/></svg> },
  { id: 'inventory', label: 'Inventory', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" strokeWidth="2"/><polyline points="3.27 6.96 12 12.01 20.73 6.96" strokeWidth="2"/><line x1="12" y1="22.08" x2="12" y2="12" strokeWidth="2"/></svg> },
  { id: 'pricebook', label: 'Price Book', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeWidth="2" strokeLinecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeWidth="2"/></svg> },
  { id: 'workflows', label: 'Workflows', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="13 17 18 12 13 7" strokeWidth="2" strokeLinecap="round"/><polyline points="6 17 11 12 6 7" strokeWidth="2" strokeLinecap="round"/></svg> },
  { id: 'trash', label: 'Trash', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" strokeWidth="2" strokeLinecap="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeWidth="2" strokeLinecap="round"/></svg> },
  { id: 'ops', label: 'Operations', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" strokeWidth="2"/><path d="M3 2v7h7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 22v-7h-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 22a9 9 0 0 1-15.66-6.66L3 9" strokeWidth="2" strokeLinecap="round"/><path d="M3 2a9 9 0 0 1 15.66 6.66L21 15" strokeWidth="2" strokeLinecap="round"/></svg> },
  { id: 'settings', label: 'Settings', icon: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" strokeWidth="2"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeWidth="2" strokeLinecap="round"/></svg> },
];

function PendingReminderBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const check = () => axios.get('/api/reminders/pending').then(r => setCount(r.data.length)).catch(() => {});
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, []);
  if (!count) return null;
  return <span style={{ background: 'var(--warning)', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }}>{count}</span>;
}

function LowStockBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const check = () => axios.get("/api/inventory/stats").then(r => setCount(r.data.low_stock + r.data.out_of_stock)).catch(() => {});
    check();
    const t = setInterval(check, 120000);
    return () => clearInterval(t);
  }, []);
  if (!count) return null;
  return <span style={{ background: "var(--danger)", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: "auto" }}>{count}</span>;
}


function UpdateBadge() {
  const [available, setAvailable] = React.useState(false);
  React.useEffect(() => {
    // Check for updates every 6 hours silently
    const check = () => axios.get('/api/update/check').then(r => setAvailable(r.data.available)).catch(() => {});
    setTimeout(check, 10000); // First check 10s after load
    const t = setInterval(check, 6 * 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  if (!available) return null;
  return <span style={{ background: 'var(--success)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, marginLeft: 'auto' }}>NEW</span>;
}

function Shell() {
  const { user, logout, loading } = useAuth();
  const { darkMode } = useSettings();
  const [page, setPage] = useState('dashboard');
  const [pageState, setPageState] = useState({});

  useEffect(() => {
    const theme = darkMode === 1 || darkMode === true ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  }, [darkMode]);

  const navigate = (p, state = {}) => {
    setPage(p);
    setPageState(state);
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--text2)' }}>Loading RepairShop...</div>;
  if (!user) return <Login />;
  // Kiosk accounts get the public display dashboard
  if (user.is_kiosk) return <KioskDashboard onNavigate={navigate} />;

  const pages = {
    dashboard: <Dashboard onNavigate={navigate} />,
    customers: <Customers key={JSON.stringify(pageState)} initialState={pageState} onNavigate={navigate} />,
    repairs: <Repairs key={JSON.stringify(pageState)} initialState={pageState} onNavigate={navigate} />,
    invoices: <Invoices key={JSON.stringify(pageState)} initialState={pageState} onNavigate={navigate} />,
    reminders: <Reminders />,
    estimates: <Estimates onNavigate={navigate} />,
    money: <Money />,
    reports: <Reports />,
    trash: <Trash onNavigate={navigate} />,
    pricebook: <PriceBook />,
    workflows: <Workflows />,
    chat: <Chat />,
    appointments: <Appointments key={JSON.stringify(pageState)} initialState={pageState} onNavigate={navigate} />,
    inventory: <Inventory onNavigate={navigate} />,
    scanner: <Scanner onNavigate={navigate} />,
    ops: <Operations />,
    settings: <Settings onNavigate={navigate} />,
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>🔧 RepairShop</h1>
          <span>IT Repair Management</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(n => (
            <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => navigate(n.id)}>
              {n.icon}
              {n.label}
              {n.id === 'reminders' && <PendingReminderBadge />}
              {n.id === 'inventory' && <LowStockBadge />}
              {n.id === 'settings' && <UpdateBadge />}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '4px 0' }}>
            <Avatar user={user} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.display_name || user.username}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>{user.role}</div>
            </div>
          </div>
          <button className="btn btn-sm w-full" style={{ justifyContent: 'center' }} onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main-content">
        <div style={{ position:'fixed', top:12, right:16, zIndex:500 }}>
          <NotificationBell />
        </div>
        {pages[page]}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SettingsProvider>
          <AIProvider>
            <Shell />
          </AIProvider>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
