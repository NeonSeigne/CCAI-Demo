import React, { createContext, useContext, useState, useEffect } from 'react';

const AppConfigContext = createContext(null);

export const useAppConfig = () => {
  const ctx = useContext(AppConfigContext);
  if (!ctx) {
    throw new Error('useAppConfig must be used within an AppConfigProvider');
  }
  return ctx;
};

export const AppConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/config`);
        if (!response.ok) throw new Error(`Config fetch failed: ${response.status}`);
        const data = await response.json();
        setConfig(data);
      } catch (err) {
        console.error('Failed to load app config:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  // Keep the tab title in step with the school. Colours are ThemeContext's job.
  useEffect(() => {
    if (config?.app?.title) {
      document.title = config.app.title;
    }
  }, [config]);

  const value = {
    config,
    loading,
    error,
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        color: 'var(--muted)',
      }}>
        Loading configuration…
      </div>
    );
  }

  if (error && !config) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        color: 'var(--error)',
        gap: '8px',
      }}>
        <p>Failed to load application configuration.</p>
        <p style={{ fontSize: '14px', color: 'var(--muted)' }}>{error}</p>
      </div>
    );
  }

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
};

export default AppConfigContext;
