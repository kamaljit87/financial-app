import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState({ currency_symbol: '₹', theme: 'dark' });
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      if (data.settings) setSettings(data.settings);
    } catch {
      setUser(null);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchMe();
    } else {
      // Check if setup is required
      api.get('/auth/setup-status')
        .then(({ data }) => setSetupRequired(data.setupRequired))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [fetchMe]);

  const login = async (email, password, rememberMe) => {
    const { data } = await api.post('/auth/login', { email, password, rememberMe });
    localStorage.setItem('token', data.token);
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(data.user);
    setSetupRequired(false);
    await fetchMe();
    return data;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const register = async (username, email, password, confirmPassword) => {
    const { data } = await api.post('/auth/register', { username, email, password, confirmPassword });
    localStorage.setItem('token', data.token);
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(data.user);
    setSetupRequired(false);
    return data;
  };

  const updateSettings = async (newSettings) => {
    const { data } = await api.put('/auth/settings', newSettings);
    setSettings(data.settings);
    return data.settings;
  };

  return (
    <AuthContext.Provider value={{ user, settings, loading, setupRequired, login, logout, register, updateSettings, fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
