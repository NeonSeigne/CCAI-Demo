import React, { useState } from 'react';
import { useAppConfig } from '../contexts/AppConfigContext';
import { Icon } from './icons';
import {
  Field, RevealButton, SocialButtons, SubmitError,
} from './Login';

/** The Create account form, inside the auth card (AuthPage). */
const Signup = ({ onAuthSuccess }) => {
  const { config } = useAppConfig();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    academicStage: '',
    researchArea: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const academicStages = config?.login?.academic_stages?.length
    ? config.login.academic_stages
    : [
        { value: '', label: 'Select your stage' },
        { value: 'beginner', label: 'Beginner' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'advanced', label: 'Advanced' },
      ];

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

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, and number';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.academicStage) {
      newErrors.academicStage = 'Please select your academic stage';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
          academicStage: formData.academicStage,
          researchArea: formData.researchArea
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store the token and user info
        localStorage.setItem('authToken', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        onAuthSuccess?.(data.user, data.access_token);
      } else {
        setErrors({ submit: data.detail || 'Signup failed. Please try again.' });
      }

    } catch (error) {
      console.error('Signup error:', error);
      setErrors({ submit: 'Signup failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = () => {
    console.log('Google Sign Up clicked');
    // Future Google Auth integration will go here
  };

  const handlePhoneSignUp = () => {
    console.log('Phone Sign Up clicked');
    // Future Phone Auth integration will go here
  };

  // The stages as chips (sign-in.html); the select's empty prompt isn't one.
  const stageChips = academicStages.filter((stage) => stage.value);
  const pickStage = (value) => handleInputChange({ target: { name: 'academicStage', value } });

  return (
    <>
      <h1 className="sr-only">Create account</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div className="au-pair">
          <Field
            id="firstName"
            label="First name"
            type="text"
            autoComplete="given-name"
            value={formData.firstName}
            onChange={handleInputChange}
            placeholder="First name"
            disabled={isLoading}
            error={errors.firstName}
          />
          <Field
            id="lastName"
            label="Last name"
            type="text"
            autoComplete="family-name"
            value={formData.lastName}
            onChange={handleInputChange}
            placeholder="Last name"
            disabled={isLoading}
            error={errors.lastName}
          />
        </div>

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

        <div className="au-pair">
          <Field
            id="password"
            label="Password"
            icon="lock"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="Create password"
            disabled={isLoading}
            error={errors.password}
            end={<RevealButton shown={showPassword} onToggle={() => setShowPassword(!showPassword)} disabled={isLoading} />}
          />
          <Field
            id="confirmPassword"
            label="Confirm password"
            icon="lock"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={handleInputChange}
            placeholder="Confirm password"
            disabled={isLoading}
            error={errors.confirmPassword}
            end={<RevealButton shown={showConfirmPassword} onToggle={() => setShowConfirmPassword(!showConfirmPassword)} disabled={isLoading} />}
          />
        </div>

        <div className="au-field">
          <span className="au-label" id="academicStage-label">Academic stage</span>
          <div
            className="au-chips"
            role="radiogroup"
            aria-labelledby="academicStage-label"
            aria-describedby={errors.academicStage ? 'academicStage-error' : undefined}
          >
            {stageChips.map((stage) => (
              <button
                key={stage.value}
                type="button"
                role="radio"
                aria-checked={formData.academicStage === stage.value}
                className="cc-chip"
                onClick={() => pickStage(stage.value)}
                disabled={isLoading}
              >
                {stage.label}
              </button>
            ))}
          </div>
          {errors.academicStage && (
            <span className="au-error" id="academicStage-error"><Icon name="error" size={16} />{errors.academicStage}</span>
          )}
        </div>

        <Field
          id="researchArea"
          label={<>Research area <small>(Optional)</small></>}
          icon="menu_book"
          type="text"
          value={formData.researchArea}
          onChange={handleInputChange}
          placeholder="e.g., Computer Science, Biology, Psychology..."
          disabled={isLoading}
        />

        <p className="au-terms">
          By creating an account, you agree to our{' '}
          <button type="button" className="au-link">Terms of Service</button>
          {' '}and{' '}
          <button type="button" className="au-link">Privacy Policy</button>
        </p>

        <SubmitError>{errors.submit}</SubmitError>

        <button type="submit" className="cc-btn cc-btn-primary au-wide au-submit" disabled={isLoading}>
          {isLoading ? 'Creating account…' : 'Create account'}
          {!isLoading && <Icon name="arrow_forward" size={20} />}
        </button>
      </form>

      <SocialButtons
        divider="or sign up with"
        disabled={isLoading}
        onGoogle={handleGoogleSignUp}
        onPhone={handlePhoneSignUp}
      />
    </>
  );
};

export default Signup;
