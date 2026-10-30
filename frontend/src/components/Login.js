import React, { useState } from 'react';
import { Icon } from './icons';

/** Google's own sign-in logo (its brand colours). */
const GoogleLogo = () => (
  <svg className="au-google" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

/** "or continue with" and the Google and Phone buttons (sign-in.html). */
export function SocialButtons({ divider, disabled, onGoogle, onPhone }) {
  return (
    <>
      <div className="au-or"><span>{divider}</span></div>
      <div className="au-social">
        <button type="button" className="cc-btn au-wide" onClick={onGoogle} disabled={disabled}>
          <GoogleLogo />
          Continue with Google
        </button>
        <button type="button" className="cc-btn au-wide" onClick={onPhone} disabled={disabled}>
          <Icon name="call" size={20} />
          Continue with Phone
        </button>
      </div>
    </>
  );
}

/**
 * A labelled input with a leading icon, an optional trailing control and its
 * error under it (sign-in.html `.f`).
 */
export function Field({
  id, label, icon, error, end, ...input
}) {
  return (
    <div className="au-field">
      <label htmlFor={id}>{label}</label>
      <div className={`au-input ${error ? 'is-error' : ''}`.trim()}>
        {icon && <Icon name={icon} size={19} />}
        <input id={id} name={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...input} />
        {end}
      </div>
      {error && <span className="au-error" id={`${id}-error`}><Icon name="error" size={16} />{error}</span>}
    </div>
  );
}

/** The eye button that shows or hides a password. */
export function RevealButton({ shown, onToggle, disabled }) {
  return (
    <button
      type="button"
      className="au-reveal"
      onClick={onToggle}
      disabled={disabled}
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
    >
      <Icon name={shown ? 'visibility_off' : 'visibility'} size={20} />
    </button>
  );
}

/** A form-level error: ink text with an icon. */
export function SubmitError({ children }) {
  if (!children) return null;
  return (
    <p className="au-submit-error" role="alert">
      <Icon name="error" size={19} />
      {children}
    </p>
  );
}

/** The Sign in form, inside the auth card (AuthPage). */
const Login = ({ onAuthSuccess }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store the token and user info
        localStorage.setItem('authToken', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        onAuthSuccess?.(data.user, data.access_token);
      } else {
        setErrors({ submit: data.detail || 'Login failed. Please try again.' });
      }

    } catch (error) {
      console.error('Login error:', error);
      setErrors({ submit: 'Login failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    console.log('Google Sign In clicked');
    // Future Google Auth integration will go here
  };

  const handlePhoneSignIn = () => {
    console.log('Phone Sign In clicked');
    // Future Phone Auth integration will go here
  };

  return (
    <>
      <h1 className="sr-only">Sign in</h1>
      <form onSubmit={handleSubmit} noValidate>
        <Field
          id="email"
          label="Email address"
          icon="mail"
          type="email"
          autoComplete="email"
          value={formData.email}
          onChange={handleInputChange}
          placeholder="Enter your email"
          disabled={isLoading}
          error={errors.email}
        />
        <Field
          id="password"
          label="Password"
          icon="lock"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={formData.password}
          onChange={handleInputChange}
          placeholder="Enter your password"
          disabled={isLoading}
          error={errors.password}
          end={<RevealButton shown={showPassword} onToggle={() => setShowPassword(!showPassword)} disabled={isLoading} />}
        />

        <div className="au-forgot">
          <button type="button" className="cc-btn cc-btn-ghost">
            Forgot your password?
          </button>
        </div>

        <SubmitError>{errors.submit}</SubmitError>

        <button type="submit" className="cc-btn cc-btn-primary au-wide au-submit" disabled={isLoading}>
          {isLoading ? 'Signing in…' : 'Sign in'}
          {!isLoading && <Icon name="arrow_forward" size={20} />}
        </button>
      </form>

      <SocialButtons
        divider="or continue with"
        disabled={isLoading}
        onGoogle={handleGoogleSignIn}
        onPhone={handlePhoneSignIn}
      />
    </>
  );
};

export default Login;
