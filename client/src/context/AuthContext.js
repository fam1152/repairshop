import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
// SettingsContext loaded lazily to avoid circular deps

// Initialize axios token immediately if present in localStorage
const initialToken = localStorage.getItem('token');
if (initialToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get('/api/users/me')
        .then(r => setUser(r.data))
        .catch(() => { 
          setToken(null); 
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
        })
        .finally(() => setLoading(false));
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setLoading(false);
    }
  }, [token]);

  const login = async (username, password) => {
    const r = await axios.post('/api/auth/login', { username, password });
    const { token: t, user: u } = r.data;
    localStorage.setItem('token', t);
    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    setToken(t);
    // Fetch full profile including avatar
    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    try {
      const profile = await axios.get('/api/users/me');
      setUser(profile.data);
      // Trigger dark mode reload for this user — dispatch custom event
      window.dispatchEvent(new CustomEvent('repairshop:login', { detail: profile.data }));
      return profile.data;
    } catch {
      setUser(u);
      window.dispatchEvent(new CustomEvent('repairshop:login', { detail: u }));
      return u;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, token, login, logout, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
