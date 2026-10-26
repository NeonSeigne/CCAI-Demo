import React from 'react';

const YEAR_OPTIONS = [
  { value: 'freshman', label: 'Freshman (1st Year)' },
  { value: 'sophomore', label: 'Sophomore (2nd Year)' },
  { value: 'junior', label: 'Junior (3rd Year)' },
  { value: 'senior', label: 'Senior (4th Year)' },
  { value: 'fifth-year', label: '5th Year / Super Senior' },
  { value: 'transfer', label: 'Transfer Student' },
];

const PlannerProfileStep = ({
  programs,
  loading,
  error,
  majorId,
  certificateIds,
  year,
  disclaimer,
  onMajorChange,
  onCertificatesChange,
  onYearChange,
  onContinue,
}) => {
  const majors = (programs || []).filter((p) => p.type === 'major');
  const certificates = (programs || []).filter((p) => p.type === 'certificate');

  const toggleCertificate = (id) => {
    if (certificateIds.includes(id)) {
      onCertificatesChange(certificateIds.filter((c) => c !== id));
    } else {
      onCertificatesChange([...certificateIds, id]);
    }
  };

  const canContinue = Boolean(majorId && year);

  return (
    <div className="planner-step surface-card">
      <h2 className="planner-step-title">Your academic profile</h2>
      <p className="planner-step-subtitle text-text-secondary">
        Tell us your major, any certificates, and your year so we can match requirements.
      </p>

      {loading && <p className="text-text-secondary">Loading programs…</p>}
      {error && <p className="planner-error">{error}</p>}

      <label className="planner-field">
        <span className="planner-label">Major</span>
        <select
          className="planner-select"
          value={majorId}
          onChange={(e) => onMajorChange(e.target.value)}
          disabled={loading}
        >
          <option value="">Select a major</option>
          {majors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="planner-field">
        <legend className="planner-label">Certificates (optional)</legend>
        <p className="planner-hint text-text-secondary">
          UW–Madison uses certificates in place of traditional minors.
        </p>
        <div className="planner-cert-grid">
          {certificates.map((c) => {
            const checked = certificateIds.includes(c.id);
            return (
              <label key={c.id} className={`planner-cert-chip ${checked ? 'pill-active' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCertificate(c.id)}
                />
                {c.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="planner-field">
        <span className="planner-label">Year in school</span>
        <select
          className="planner-select"
          value={year}
          onChange={(e) => onYearChange(e.target.value)}
        >
          <option value="">Select your year</option>
          {YEAR_OPTIONS.map((y) => (
            <option key={y.value} value={y.value}>
              {y.label}
            </option>
          ))}
        </select>
      </label>

      {disclaimer && (
        <p className="planner-disclaimer text-text-secondary">{disclaimer}</p>
      )}

      <div className="planner-step-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={!canContinue}
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default PlannerProfileStep;
