import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Login from '../components/Login';
import Signup from '../components/Signup';
import { useAuth } from '../contexts/AuthContext';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();
  const { handleAuthSuccess } = useAuth();

  const handleAuthComplete = (userData, token) => {
    handleAuthSuccess(userData, token);
    navigate('/home', { replace: true });
  };

  return (
    <>
      {isLogin ? (
        <Login
          onNavigateToSignup={() => setIsLogin(false)}
          onAuthSuccess={handleAuthComplete}
        />
      ) : (
        <Signup
          onNavigateToLogin={() => setIsLogin(true)}
          onAuthSuccess={handleAuthComplete}
        />
      )}
    </>
  );
};

export default AuthPage;
