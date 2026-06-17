import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppConfigProvider } from './contexts/AppConfigContext';
import HomePage from './pages/HomePage';
import ChatPage from './pages/ChatPage';
import AuthPage from './pages/AuthPage';
import CanvasPage from './pages/CanvasPage';
import UserGuide from './components/UserGuide';
import './styles/components.css';

// Set REACT_APP_TESTING_ONBOARDING=true in your .env to force the onboarding
// tour to run on every page load. Leave unset in production — tour will only
// show once per user (localStorage).
export const TESTING_ONBOARDING = process.env.REACT_APP_TESTING_ONBOARDING === 'true';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);

  const clearAuth = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setUser(null);
    setAuthToken(null);
    setIsAuthenticated(false);
  };

  // Check for existing authentication on app start
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('user');

    if (!token || !userData) return;

    try {
      JSON.parse(userData);
    } catch (error) {
      clearAuth();
      return;
    }

    const validateSession = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          clearAuth();
          setCurrentView('auth');
          return;
        }

        const freshUser = await response.json();
        setAuthToken(token);
        setUser(freshUser);
        setIsAuthenticated(true);
        setCurrentView('chat');
      } catch (error) {
        clearAuth();
      }
    };

    validateSession();
  }, []);

  const navigateToAuth = () => {
    setCurrentView('auth');
  };

  const navigateToCanvas = () => {
    setCurrentView('canvas');
  };

  const navigateToChat = () => {
    setCurrentView('chat');
  };

  

  const navigateToHome = () => {
    setCurrentView('home');
  };

  const handleAuthSuccess = (userData, token) => {
    setUser(userData);
    setAuthToken(token);
    setIsAuthenticated(true);
    setCurrentView('chat');
  };

  const handleUserUpdate = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const handleSignOut = () => {
    clearAuth();
    setCurrentView('home');
  };

  return (
    <AppConfigProvider>
      <ThemeProvider>
        <div className="App">
          {currentView === 'home' && (
            <HomePage
              onNavigateToChat={isAuthenticated ? navigateToChat : navigateToAuth}
              isAuthenticated={isAuthenticated}
            />
          )}
          {currentView === 'auth' && (
            <AuthPage onAuthSuccess={handleAuthSuccess} />
          )}
          {currentView === 'canvas' && isAuthenticated && (
            <CanvasPage 
              user={user}
              authToken={authToken}
              onNavigateToChat={navigateToChat}
              onSignOut={handleSignOut}
            />
          )}
          {currentView === 'chat' && isAuthenticated && (
            <ChatPage
              user={user}
              authToken={authToken}
              onNavigateToHome={navigateToHome}
              onNavigateToCanvas={navigateToCanvas}
              onSignOut={handleSignOut}
              onUserUpdate={handleUserUpdate}
            />
          )}
          {/* Global help center — listens for the 'open-user-guide' event */}
          <UserGuide />
        </div>
      </ThemeProvider>
    </AppConfigProvider>
  );
}

export default App;
