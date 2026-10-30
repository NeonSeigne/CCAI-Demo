import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { ThemeToggle } from '../components/CampusRail';
import { useAuth } from '../contexts/AuthContext';
import '../styles/CampusHome.css';
import '../styles/SettingsPage.css';

const apiUrl = process.env.REACT_APP_API_URL;

/** "gemini" -> "Gemini". */
export const modelLabel = (backend) => (backend ? backend.charAt(0).toUpperCase() + backend.slice(1) : '');

const extractError = (data, fallback) => {
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
  return fallback;
};

/** One panel's result line: ink text with an icon (DESIGN.md States). */
function Status({ message }) {
  if (!message) return null;
  const error = message.type === 'error';
  return (
    <p className={`st-status ${error ? 'is-error' : 'is-good'}`} role={error ? 'alert' : 'status'}>
      <Icon name={error ? 'error' : 'check_circle'} size={19} />
      {message.text}
    </p>
  );
}

/** A form row: the label at the left, the control at the right (settings.html). */
function Row({ id, label, children }) {
  return (
    <div className="st-row">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function Panel({ id, children, className = '' }) {
  return (
    <section className={`cc-panel st-panel ${className}`.trim()} id={id} aria-labelledby={`${id}-title`}>
      {children}
    </section>
  );
}

function ProfilePanel({ user, authToken, onUserUpdate }) {
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setMessage(null);
    if (!firstName.trim() && !lastName.trim()) {
      setMessage({ type: 'error', text: 'Enter a first or last name.' });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ first_name: firstName.trim(), last_name: lastName.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ type: 'error', text: extractError(data, 'Could not update profile.') });
        return;
      }
      onUserUpdate?.(data);
      setFirstName(data?.firstName || '');
      setLastName(data?.lastName || '');
      setMessage({ type: 'success', text: 'Profile updated.' });
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel id="profile">
      <div className="cc-panel-head"><h2 id="profile-title">Profile</h2></div>
      <form onSubmit={submit}>
        <Row id="st-email" label="Email">
          <input id="st-email" className="st-input" value={user?.email || ''} disabled />
        </Row>
        <Row id="st-first" label="First name">
          <input id="st-first" className="st-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Row>
        <Row id="st-last" label="Last name">
          <input id="st-last" className="st-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Row>
        <Status message={message} />
        <div className="st-foot">
          <button type="submit" className="cc-btn cc-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function PasswordPanel({ authToken }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/auth/me/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
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
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel id="password">
      <div className="cc-panel-head"><h2 id="password-title">Password</h2></div>
      <form onSubmit={submit}>
        <Row id="st-current" label="Current password">
          <input id="st-current" type="password" className="st-input" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </Row>
        <Row id="st-new" label="New password">
          <input id="st-new" type="password" className="st-input" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </Row>
        <Row id="st-confirm" label="Confirm new password">
          <input id="st-confirm" type="password" className="st-input" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </Row>
        <Status message={message} />
        <div className="st-foot">
          <button type="submit" className="cc-btn" disabled={busy}>
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </Panel>
  );
}

/** The model: the backend's own options; only the default backend changes. */
function ModelPanel({ authToken }) {
  const [llmConfig, setLlmConfig] = useState(null);
  const [backends, setBackends] = useState([]);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authToken) return undefined;
    let cancelled = false;
    fetch(`${apiUrl}/current-provider`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const available = Array.isArray(data.available_backends) ? data.available_backends : [];
        setBackends(available);
        setLlmConfig(data.llm_config || null);
        setDraft(data.llm_config?.default_backend || available[0] || '');
      })
      .catch((error) => console.error('Error fetching current provider:', error));
    return () => { cancelled = true; };
  }, [authToken]);

  const saved = llmConfig?.default_backend || backends[0] || '';
  const unchanged = draft === saved;

  const save = async () => {
    setMessage(null);
    setSaving(true);
    try {
      const response = await fetch(`${apiUrl}/switch-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ mode: 'uniform', ...llmConfig, default_backend: draft }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ type: 'error', text: extractError(data, 'Could not change the model.') });
        return;
      }
      setLlmConfig(data?.llm_config || { ...llmConfig, default_backend: draft });
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel id="model">
      <div className="cc-panel-head"><h2 id="model-title">Model</h2></div>
      <Row id="st-model" label="Model">
        <span className="st-select">
          <select id="st-model" className="st-input" value={draft} onChange={(e) => setDraft(e.target.value)}>
            {backends.map((backend) => <option key={backend} value={backend}>{modelLabel(backend)}</option>)}
          </select>
          <Icon name="expand_more" size={20} />
        </span>
      </Row>
      <Status message={message} />
      <div className="st-foot">
        <button
          type="button"
          className="cc-btn cc-btn-ghost"
          onClick={() => { setDraft(saved); setMessage(null); }}
          disabled={saving || unchanged}
        >
          Cancel
        </button>
        <button type="button" className="cc-btn" onClick={save} disabled={saving || !draft || unchanged}>
          {saving ? 'Saving…' : 'Save configuration'}
        </button>
      </div>
    </Panel>
  );
}

function DeletePanel({ authToken, onDeleted }) {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setMessage(null);
    if (confirmText !== 'DELETE') {
      setMessage({ type: 'error', text: 'Type DELETE to confirm.' });
      return;
    }
    if (!password) {
      setMessage({ type: 'error', text: 'Password required to delete account.' });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/auth/me`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ type: 'error', text: extractError(data, 'Could not delete account.') });
        setBusy(false);
        return;
      }
      onDeleted?.();
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
      setBusy(false);
    }
  };

  return (
    <Panel id="delete-account">
      <div className="cc-panel-head"><h2 id="delete-account-title">Delete account</h2></div>
      <form onSubmit={submit}>
        <p className="st-warn">
          <Icon name="warning" size={20} />
          Deleting your account is permanent. All chat history and personal data will be removed.
        </p>
        <Row id="st-delete-password" label="Confirm password">
          <input id="st-delete-password" type="password" className="st-input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Row>
        <Row id="st-delete-confirm" label={<>Type <strong>DELETE</strong> to confirm</>}>
          <input id="st-delete-confirm" className="st-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" required />
        </Row>
        <Status message={message} />
        <div className="st-foot">
          <button type="submit" className="cc-btn st-danger" disabled={busy}>
            <Icon name="delete" size={20} />
            {busy ? 'Deleting…' : 'Permanently delete account'}
          </button>
        </div>
      </form>
    </Panel>
  );
}

/**
 * Settings (settings.html): Profile, Password, Model, Theme and Delete
 * account as panels of form rows. The account menu links to #profile and
 * #model.
 */
export default function SettingsPage() {
  const { user, authToken, handleUserUpdate, handleSignOut } = useAuth();
  const { hash } = useLocation();
  const navigate = useNavigate();

  // #profile / #model: focus that panel's heading and bring it into view,
  // after RouteFocus has focused the page title.
  useEffect(() => {
    const id = hash.replace('#', '');
    if (!id) return undefined;
    const timer = setTimeout(() => {
      const heading = document.getElementById(`${id}-title`);
      if (!heading) return;
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      const section = document.getElementById(id);
      if (typeof section?.scrollIntoView === 'function') section.scrollIntoView({ block: 'start' });
    }, 0);
    return () => clearTimeout(timer);
  }, [hash]);

  const onDeleted = () => {
    handleSignOut?.();
    navigate('/', { replace: true });
  };

  return (
    <div className="campus-home st-page">
      <main className="campus-main st-main" id="main-content">
        <div className="st-column">
          <h1>Settings</h1>
          <ProfilePanel user={user} authToken={authToken} onUserUpdate={handleUserUpdate} />
          <PasswordPanel authToken={authToken} />
          <ModelPanel authToken={authToken} />
          <Panel id="theme" className="st-theme">
            <div className="cc-panel-head">
              <h2 id="theme-title">Theme</h2>
              <ThemeToggle className="st-toggle" />
            </div>
          </Panel>
          <DeletePanel authToken={authToken} onDeleted={onDeleted} />
        </div>
      </main>
    </div>
  );
}
