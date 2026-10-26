import React from 'react';

const STAGES = [
  { id: 'parsing_transcript', label: 'Parsing transcript' },
  { id: 'matching_requirements', label: 'Matching requirements' },
  { id: 'scoring_difficulty', label: 'Scoring difficulty' },
  { id: 'building_packs', label: 'Building course packs' },
  { id: 'done', label: 'Ready' },
];

const PlannerLoadingStep = ({ percent = 0, stage = '', message = '' }) => {
  const activeIndex = Math.max(
    0,
    STAGES.findIndex((s) => s.id === stage)
  );

  return (
    <div className="planner-step surface-card planner-loading">
      <h2 className="planner-step-title">Building your semester plan</h2>
      <p className="planner-step-subtitle text-text-secondary">
        {message || 'Analyzing your transcript and major requirements…'}
      </p>

      <div
        className="planner-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="planner-progress-fill" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <div className="planner-progress-meta text-text-secondary">{Math.min(100, percent)}%</div>

      <ol className="planner-stage-list">
        {STAGES.map((s, index) => {
          const state =
            index < activeIndex || stage === 'done'
              ? 'done'
              : index === activeIndex
                ? 'active'
                : 'pending';
          return (
            <li key={s.id} className={`planner-stage-item is-${state}`}>
              <span className="planner-stage-dot" />
              {s.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default PlannerLoadingStep;
