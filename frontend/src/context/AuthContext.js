import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            setCurrentUser(data.user);
            localStorage.setItem('userRole', data.user.role);
            localStorage.setItem('userEmail', data.user.email);
            localStorage.setItem('userName', data.user.name);
            localStorage.setItem('userPhone', data.user.mobile);
            localStorage.setItem('userWard', data.user.ward);
            localStorage.setItem('userAvatarType', data.user.avatarType);
            localStorage.setItem('userAvatarBadge', data.user.avatarBadge);
            localStorage.setItem('userAvatarUrl', data.user.avatarUrl || '');
          }
        } else {
          setCurrentUser(null);
        }
      } catch (error) {
        console.error('Session check failed:', error);
      } finally {
        setLoading(false);
      }
    }

    checkSession();
  }, []);

  const loginUser = async (value, password) => {
    const isEmail = value.includes('@');
    
    if (isEmail) {
      if (!value.endsWith('@gmail.com')) {
        alert('Email must end with @gmail.com');
        return false;
      }
    } else {
      if (value.length !== 10 || !/^\d+$/.test(value)) {
        alert('Please enter a valid 10-digit mobile number or Gmail address.');
        return false;
      }
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters');
      return false;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, password, isAdminLogin: false }),
        credentials: 'include'
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Login failed');
        return false;
      }

      setCurrentUser(data.user);
      localStorage.setItem('userRole', data.user.role);
      localStorage.setItem('userEmail', data.user.email);
      localStorage.setItem('userName', data.user.name);
      localStorage.setItem('userPhone', data.user.mobile);
      localStorage.setItem('userWard', data.user.ward);
      localStorage.setItem('userAvatarType', data.user.avatarType);
      localStorage.setItem('userAvatarBadge', data.user.avatarBadge);
      localStorage.setItem('userAvatarUrl', data.user.avatarUrl || '');
      return true;

    } catch (error) {
      console.error('Login error:', error);
      alert('Network error during login.');
      return false;
    }
  };

  const sendOTP = async (email, name) => {
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to dispatch verification code' };
      }
      return { success: true, message: data.message, devMode: data.devMode, devOtp: data.devOtp };
    } catch (err) {
      console.error('Send OTP failed:', err);
      return { success: false, error: 'Network error while dispatching OTP.' };
    }
  };

  const registerUser = async (name, email, mobile, password, city, state, otp) => {
    if (mobile.length !== 10) {
      alert('Mobile number must be exactly 10 digits');
      return false;
    }
    if (password.length < 6) {
      alert('Password must be at least 6 characters');
      return false;
    }
    if (!city || !state) {
      alert('City and State are compulsory fields');
      return false;
    }
    if (!otp || otp.toString().trim().length !== 6) {
      alert('Please enter a valid 6-digit verification code sent to your email.');
      return false;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, mobile, password, city, state, role: 'user', otp: otp.toString().trim() }),
        credentials: 'include'
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Registration failed');
        return false;
      }

      setCurrentUser(data.user);
      localStorage.setItem('userRole', data.user.role);
      localStorage.setItem('userEmail', data.user.email);
      localStorage.setItem('userName', data.user.name);
      localStorage.setItem('userPhone', data.user.mobile);
      localStorage.setItem('userWard', data.user.ward);
      localStorage.setItem('userAvatarType', data.user.avatarType || 'badge');
      localStorage.setItem('userAvatarBadge', data.user.avatarBadge || 'initials');
      localStorage.setItem('userAvatarUrl', data.user.avatarUrl || '');
      return true;

    } catch (error) {
      console.error('Registration error:', error);
      alert('Network error during registration.');
      return false;
    }
  };

  const loginAdmin = async (value, password) => {
    const trimmed = (value || '').toLowerCase().trim();
    if (trimmed !== 'civivision@gmail.com') {
      alert('Access Denied: Only official admin email civivision@gmail.com is permitted.');
      return false;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: trimmed, password, isAdminLogin: true }),
        credentials: 'include'
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Admin login failed');
        return false;
      }

      setCurrentUser(data.user);
      localStorage.setItem('userRole', data.user.role);
      localStorage.setItem('userEmail', data.user.email);
      localStorage.setItem('userName', data.user.name);
      return true;

    } catch (error) {
      console.error('Admin login error:', error);
      alert('Network error during admin login.');
      return false;
    }
  };

  const updateUser = async (name, additionalData = {}) => {
    if (!currentUser) return;

    try {
      const payload = {
        name,
        mobile: additionalData.phone,
        ward: additionalData.ward,
        language: additionalData.language,
        avatarType: additionalData.avatarType,
        avatarBadge: additionalData.avatarBadge,
        avatarUrl: additionalData.avatarUrl
      };

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Failed to update profile');
        return;
      }

      setCurrentUser(data.user);
      localStorage.setItem('userName', data.user.name);
      localStorage.setItem('userPhone', data.user.mobile);
      localStorage.setItem('userWard', data.user.ward);
      localStorage.setItem('userLanguage', data.user.language || 'en');
      localStorage.setItem('userAvatarType', data.user.avatarType);
      localStorage.setItem('userAvatarBadge', data.user.avatarBadge);
      localStorage.setItem('userAvatarUrl', data.user.avatarUrl || '');

    } catch (error) {
      console.error('Update profile error:', error);
      alert('Network error updating profile.');
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setCurrentUser(null);
      localStorage.removeItem('userRole');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userName');
      localStorage.removeItem('userPhone');
      localStorage.removeItem('userWard');
      localStorage.removeItem('userLanguage');
      localStorage.removeItem('userAvatarType');
      localStorage.removeItem('userAvatarBadge');
      localStorage.removeItem('userAvatarUrl');
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, loginUser, registerUser, loginAdmin, logout, updateUser, sendOTP }}>
      {children}
    </AuthContext.Provider>
  );
};
