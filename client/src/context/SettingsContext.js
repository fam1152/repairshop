import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const [userPrefs, setUserPrefs] = useState(null);

  const applyTheme = (darkMode) => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  };

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const [globalRes, prefsRes] = await Promise.allSettled([
        axios.get('/api/settings'),
        axios.get('/api/users/prefs'),
      ]);
      const global = globalRes.status === 'fulfilled' ? globalRes.value.data : {};
      setSettings(global);
      if (prefsRes.status === 'fulfilled') {
        const prefs = prefsRes.value.data;
        setUserPrefs(prefs);
        applyTheme(prefs.dark_mode);
      } else {
        applyTheme(global.dark_mode || 0);
      }
    } catch(e) {}
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-load prefs whenever user logs in
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('repairshop:login', handler);
    return () => window.removeEventListener('repairshop:login', handler);
  }, [load]);

  const update = async (data) => {
    const r = await axios.put('/api/settings', data);
    setSettings(r.data);
    if ('dark_mode' in data) {
      await toggleDarkMode(data.dark_mode ? 1 : 0);
    }
    return r.data;
  };

  const toggleDarkMode = async (enabled) => {
    const val = enabled ? 1 : 0;
    applyTheme(val);
    try {
      await axios.put('/api/users/prefs', {
        dark_mode: val,
        preferences: userPrefs?.preferences || {},
      });
      setUserPrefs(prev => ({ ...(prev || {}), dark_mode: val }));
    } catch(e) { console.error('Prefs save failed:', e.message); }
  };

  return (
    <SettingsContext.Provider value={{
      settings,
      userPrefs,
      update,
      toggleDarkMode,
      reload: load,
      darkMode: userPrefs?.dark_mode ?? settings?.dark_mode ?? 0,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
