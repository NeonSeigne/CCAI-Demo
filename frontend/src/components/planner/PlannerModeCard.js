import React from 'react';
import { ArrowRight, Lock } from 'lucide-react';

/**
 * Mode selection tile for the home launchpad.
 */
const PlannerModeCard = ({
  title,
  description,
  icon: Icon,
  accentClass = 'bg-accent-blue',
  disabled = false,
  onClick,
}) => {
  if (disabled) {
    return (
      <div
        className="planner-mode-card planner-mode-card--disabled surface-card"
        aria-disabled="true"
        title="Coming soon"
      >
        <span className={`accent-dot ${accentClass}`} />
        <div className="planner-mode-card-icon">
          <Icon size={18} aria-hidden="true" />
        </div>
        <div className="planner-mode-card-body">
          <div className="planner-mode-card-title">
            {title}
            <Lock size={12} className="planner-mode-lock" aria-hidden="true" />
          </div>
          <p className="planner-mode-card-desc text-text-secondary">{description}</p>
          <span className="planner-mode-coming">Coming soon</span>
        </div>
      </div>
    );
  }

  return (
    <button type="button" className="planner-mode-card surface-card" onClick={onClick}>
      <span className={`accent-dot ${accentClass}`} />
      <div className="planner-mode-card-icon">
        <Icon size={18} aria-hidden="true" />
      </div>
      <div className="planner-mode-card-body">
        <div className="planner-mode-card-title">{title}</div>
        <p className="planner-mode-card-desc text-text-secondary">{description}</p>
        <span className="planner-mode-cta">
          Open
          <ArrowRight size={14} />
        </span>
      </div>
    </button>
  );
};

export default PlannerModeCard;
