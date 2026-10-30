import React, { useEffect, useState } from 'react';
import {
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material';
import { X, User as UserIcon, Lock, Trash2, AlertTriangle, Layers } from './icons';
import AppDialog from './AppDialog';

const tabRow = {
  display: 'flex', gap: 4, padding: '12px 16px 0',
  borderBottom: '1px solid var(--line)',
};

const tabBtn = (active) => ({
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 14px', background: 'transparent',
  border: 'none', borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
  color: active ? 'var(--ink)' : 'var(--muted)',
  cursor: 'pointer', fontSize: 13.5, fontWeight: 500,
  marginBottom: -1,
});

const label = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 };

const input = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--line)', background: 'var(--surface)',
  color: 'var(--ink)', fontSize: 14, boxSizing: 'border-box',
};

const primaryBtn = {
  padding: '10px 16px', background: 'var(--ink)',
  color: 'var(--surface)', border: 'none', borderRadius: 8,
  cursor: 'pointer', fontSize: 14, fontWeight: 500,
};

const dangerBtn = {
  padding: '10px 16px', background: 'var(--error)',
  color: 'var(--surface)', border: 'none', borderRadius: 8,
  cursor: 'pointer', fontSize: 14, fontWeight: 500,
};

const SettingsModal = ({
  user,
  authToken,
  onUserUpdate,
  onSignOut,
  onClose,
  leftInset = 0,
  initialTab = 'profile',
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [message, setMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [llmConfig, setLlmConfig] = useState(null);
  const [availableBackends, setAvailableBackends] = useState([]);
  const [modelDraft, setModelDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const apiUrl = process.env.REACT_APP_API_URL;

  useEffect(() => {
    if (!authToken) return undefined;
    let cancelled = false;
    fetch(`${apiUrl}/current-provider`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const backends = Array.isArray(data.available_backends) ? data.available_backends : [];
        setAvailableBackends(backends);
        setLlmConfig(data.llm_config || null);
        setModelDraft(data.llm_config?.default_backend || backends[0] || '');
      })
      .catch((error) => console.error('Error fetching current provider:', error));
    return () => { cancelled = true; };
  }, [apiUrl, authToken]);

  const extractError = (data, fallback) => {
    if (!data) return fallback;
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
    return fallback;
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (!firstName.trim() && !lastName.trim()) {
      setMessage({ type: 'error', text: 'Enter a first or last name.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ type: 'error', text: extractError(data, 'Could not update profile.') });
        return;
      }
      onUserUpdate?.(data);
      setFirstName(data.firstName || '');
      setLastName(data.lastName || '');
      setMessage({ type: 'success', text: 'Profile updated.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/me/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ type: 'error', text: extractError(data, 'Could not change password.') });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: 'Password changed.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (deleteConfirmText !== 'DELETE') {
      setMessage({ type: 'error', text: 'Type DELETE to confirm.' });
      return;
    }
    if (!deleteConfirmPassword) {
      setMessage({ type: 'error', text: 'Password required to delete account.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/me`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ password: deleteConfirmPassword }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ type: 'error', text: extractError(data, 'Could not delete account.') });
        return;
      }
      onClose?.();
      onSignOut?.();
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Only the default backend changes; the rest of the saved config is kept.
  const handleModelSave = async () => {
    setMessage(null);
    setIsSaving(true);
    try {
      const response = await fetch(`${apiUrl}/switch-provider`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ mode: 'uniform', ...llmConfig, default_backend: modelDraft }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ type: 'error', text: extractError(data, 'Could not change the model.') });
        return;
      }
      setLlmConfig(data?.llm_config || { ...llmConfig, default_backend: modelDraft });
      onClose?.();
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const messageStyle = (type) => ({
    padding: '10px 12px', borderRadius: 8, marginBottom: 16, fontSize: 13,
    background: type === 'error'
      ? 'rgba(220,38,38,0.1)'
      : type === 'success'
        ? 'rgba(22,163,74,0.1)'
        : 'var(--surface)',
    color: type === 'error'
      ? 'var(--error)'
      : type === 'success'
        ? 'var(--good)'
        : 'var(--muted)',
    border: `1px solid ${
      type === 'error'
        ? 'rgba(220,38,38,0.3)'
        : type === 'success'
          ? 'rgba(22,163,74,0.3)'
          : 'var(--line)'
    }`,
  });

  return (
    <AppDialog
      open
      onClose={onClose}
      leftInset={leftInset}
      maxWidth="md"
      aria-labelledby="settings-dialog-title"
      slotProps={{
        paper: {
          sx: {
            maxWidth: 640,
            maxHeight: '85vh',
          },
        },
      }}
    >
        <DialogTitle
          id="settings-dialog-title"
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          Settings
          <IconButton onClick={onClose} aria-label="Close settings" size="small">
            <X size={20} />
          </IconButton>
        </DialogTitle>

        <div style={tabRow}>
          <button style={tabBtn(activeTab === 'profile')} onClick={() => { setActiveTab('profile'); setMessage(null); }}>
            <UserIcon size={15} /> Profile
          </button>
          <button style={tabBtn(activeTab === 'password')} onClick={() => { setActiveTab('password'); setMessage(null); }}>
            <Lock size={15} /> Password
          </button>
          <button style={tabBtn(activeTab === 'model')} onClick={() => { setActiveTab('model'); setMessage(null); }}>
            <Layers size={15} /> Model
          </button>
          <button style={tabBtn(activeTab === 'danger')} onClick={() => { setActiveTab('danger'); setMessage(null); }}>
            <Trash2 size={15} /> Delete Account
          </button>
        </div>

        <DialogContent sx={{ p: 3, overflowY: 'auto' }}>
          {message && <div style={messageStyle(message.type)}>{message.text}</div>}

          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Email</label>
                <input style={{ ...input, opacity: 0.6, cursor: 'not-allowed' }} value={user?.email || ''} disabled />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={label}>First Name</label>
                  <input style={input} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div>
                  <label style={label}>Last Name</label>
                  <input style={input} value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <button type="submit" style={primaryBtn} disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          )}

          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Current Password</label>
                <input type="password" style={input} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>New Password</label>
                <input type="password" style={input} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Confirm New Password</label>
                <input type="password" style={input} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <button type="submit" style={primaryBtn} disabled={isSubmitting}>
                {isSubmitting ? 'Changing…' : 'Change Password'}
              </button>
            </form>
          )}

          {activeTab === 'model' && (
            <>
              <label style={label} htmlFor="settings-model">Model</label>
              <select
                id="settings-model"
                style={{ ...input, colorScheme: 'light dark' }}
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
              >
                {availableBackends.map((backend) => <option key={backend} value={backend}>{backend}</option>)}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: '1px solid var(--line)',
                    background: 'transparent', color: 'var(--ink)', cursor: 'pointer', fontSize: 13.5,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleModelSave}
                  disabled={isSaving || !modelDraft}
                  style={{
                    ...primaryBtn,
                    padding: '8px 14px', fontSize: 13.5, fontWeight: 600,
                    cursor: isSaving ? 'wait' : 'pointer',
                  }}
                >
                  {isSaving ? 'Saving…' : 'Save configuration'}
                </button>
              </div>
            </>
          )}

          {activeTab === 'danger' && (
            <form onSubmit={handleDeleteAccount}>
              <div style={{
                display: 'flex', gap: 10, padding: 12, borderRadius: 8,
                background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
                marginBottom: 16,
              }}>
                <AlertTriangle size={18} style={{ color: 'var(--error)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                  Deleting your account is permanent. All chat history and personal data will be removed.
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Confirm Password</label>
                <input type="password" style={input} value={deleteConfirmPassword} onChange={(e) => setDeleteConfirmPassword(e.target.value)} required />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Type <strong>DELETE</strong> to confirm</label>
                <input style={input} value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" required />
              </div>
              <button type="submit" style={dangerBtn} disabled={isSubmitting}>
                {isSubmitting ? 'Deleting…' : 'Permanently Delete Account'}
              </button>
            </form>
          )}
        </DialogContent>

    </AppDialog>
  );
};

export default SettingsModal;
