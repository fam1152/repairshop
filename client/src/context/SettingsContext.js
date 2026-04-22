import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Set global timeout for all requests to prevent white screen hangs
axios.defaults.timeout = 10000;

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const [userPrefs, setUserPrefs] = useState(null);

  const applyTheme = useCallback((darkMode) => {
    const isDark = darkMode === 1 || darkMode === true;
    const theme = isDark ? 'dark' : 'light';
    console.log('[Theme] Applying:', theme);
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('repairshop:theme', theme);
  }, []);

  // Immediate theme application from local cache on mount
  useEffect(() => {
    const cached = localStorage.getItem('repairshop:theme');
    if (cached) {
      document.documentElement.setAttribute('data-theme', cached);
    }
  }, []);

  const applyScale = (scale) => {
    const s = scale || '1.0';
    document.documentElement.style.setProperty('--ui-scale', s);
    document.documentElement.style.fontSize = `${16 * parseFloat(s)}px`;
  };

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      console.log('[Settings] Loading global and user preferences...');
      const [globalRes, prefsRes] = await Promise.allSettled([
        axios.get('/api/settings'),
        axios.get('/api/users/prefs'),
      ]);

      if (globalRes.status === 'fulfilled' && globalRes.value.data) {
        setSettings(globalRes.value.data);
        applyScale(globalRes.value.data.ui_scale);
      }
      
      if (prefsRes.status === 'fulfilled' && prefsRes.value.data) {
        const prefs = prefsRes.value.data;
        setUserPrefs(prefs);
        applyTheme(prefs.dark_mode);
      } else if (globalRes.status === 'fulfilled' && globalRes.value.data) {
        applyTheme(globalRes.value.data.dark_mode || 0);
      }
    } catch(e) {
      console.error('[Settings] Load failed:', e.message);
    }
  }, [applyTheme]); // Removed all potentially changing dependencies

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
    if ('ui_scale' in data) {
      applyScale(data.ui_scale);
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
      darkMode: userPrefs?.dark_mode ?? settings?.dark_mode ?? 1,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
