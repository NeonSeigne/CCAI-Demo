import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, ChevronDown, Download, Plus, Trash2 } from 'lucide-react';
import { courseRoute } from '../course/courseUtils';
import PlannerDegreeGuide from './PlannerDegreeGuide';
import PlannerCoursePicker from './PlannerCoursePicker';

const CHALLENGES = [
  { id: 'light', label: 'Light', enabled: false },
  { id: 'balanced', label: 'Balanced', enabled: true },
  { id: 'intense', label: 'Intense', enabled: false },
];

const PlannerResultsView = ({
  plan,
  planId,
  onSelectOption,
  onSave,
  onMutate,
  selecting,
  mutating,
}) => {
  const navigate = useNavigate();
  const selected = (plan?.options || []).find((o) => o.id === plan?.selected_option_id);
  const remainingCount = plan?.requirements_projection?.remaining?.length
    ?? plan?.requirements_status?.remaining?.length
    ?? 0;
  const satisfiedCount = plan?.requirements_projection?.satisfied?.length
    ?? plan?.requirements_status?.satisfied?.length
    ?? 0;

  const [resultsTab, setResultsTab] = useState('courses');
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [picker, setPicker] = useState({ open: false, mode: 'add', old: null });

  const openCourse = (identifier) => {
    if (!identifier) return;
    if (planId) {
      try {
        sessionStorage.setItem('semesterPlanId', planId);
      } catch (_) {
        /* ignore */
      }
    }
    navigate(courseRoute(identifier), { state: { planId } });
  };

  const excludeIds = (selected?.courses || []).map((c) => c.identifier);
  const challengeLabel =
    CHALLENGES.find((c) => c.id === (plan?.challenge || 'balanced'))?.label || 'Balanced';
  const packLabel = selected?.label || 'Pack';

  return (
    <div className="planner-results">
      <div className="planner-results-tabs" role="tablist" aria-label="Semester plan views">
        <button
          type="button"
          role="tab"
          id="planner-tab-courses"
          aria-selected={resultsTab === 'courses'}
          aria-controls="planner-panel-courses"
          className={`planner-results-tab ${resultsTab === 'courses' ? 'is-active' : ''}`}
          onClick={() => setResultsTab('courses')}
        >
          Selected courses
        </button>
        <button
          type="button"
          role="tab"
          id="planner-tab-guide"
          aria-selected={resultsTab === 'guide'}
          aria-controls="planner-panel-guide"
          className={`planner-results-tab ${resultsTab === 'guide' ? 'is-active' : ''}`}
          onClick={() => setResultsTab('guide')}
        >
          Degree guide
        </button>
      </div>

      {resultsTab === 'courses' && (
        <div
          className="planner-courses-tab"
          role="tabpanel"
          id="planner-panel-courses"
          aria-labelledby="planner-tab-courses"
        >
          <p className="planner-results-meta text-text-secondary">
            {plan?.profile?.major_name}
            {plan?.profile?.certificate_names?.length
              ? ` · ${plan.profile.certificate_names.join(', ')}`
              : ''}
            {' · '}
            {satisfiedCount} groups met / projected, {remainingCount} still open
          </p>

          <div className="planner-disclosures">
            <div className="planner-disclosure">
              <button
                type="button"
                className="planner-disclosure-trigger"
                aria-expanded={challengeOpen}
                onClick={() => setChallengeOpen((v) => !v)}
              >
                <span>
                  Challenge
                  <span className="planner-disclosure-value text-text-secondary">
                    {' '}
                    · {challengeLabel}
                  </span>
                </span>
                <ChevronDown
                  size={14}
                  className={`planner-disclosure-chevron ${challengeOpen ? 'is-open' : ''}`}
                />
              </button>
              {challengeOpen && (
                <div className="planner-disclosure-body">
                  <div className="planner-challenge-toggles">
                    {CHALLENGES.map((c) => {
                      const active = (plan?.challenge || 'balanced') === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`planner-challenge-btn ${active ? 'pill-active' : ''} ${
                            c.enabled ? '' : 'is-disabled'
                          }`}
                          disabled={!c.enabled}
                          title={c.enabled ? c.label : 'Coming soon'}
                          aria-disabled={!c.enabled}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="planner-disclosure">
              <button
                type="button"
                className="planner-disclosure-trigger"
                aria-expanded={packOpen}
                onClick={() => setPackOpen((v) => !v)}
              >
                <span>
                  Pack
                  <span className="planner-disclosure-value text-text-secondary">
                    {' '}
                    · {packLabel}
                  </span>
                </span>
                <ChevronDown
                  size={14}
                  className={`planner-disclosure-chevron ${packOpen ? 'is-open' : ''}`}
                />
              </button>
              {packOpen && (
                <div className="planner-disclosure-body">
                  <div className="planner-pack-list">
                    {(plan?.options || []).map((opt) => {
                      const isSelected = opt.id === plan?.selected_option_id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`planner-pack-row ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => onSelectOption(opt.id)}
                          disabled={selecting}
                        >
                          <div className="planner-option-title">{opt.label}</div>
                          <div className="planner-option-meta text-text-secondary">
                            {opt.total_credits} credits · {opt.hard_count || 0} hard ·{' '}
                            {opt.source === 'llm' ? 'advisor-tuned' : 'balanced mix'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="planner-course-panel">
            <div className="planner-panel-header">
              <h3 className="home-section-label">Courses</h3>
              <button
                type="button"
                className="home-btn-secondary planner-mini-btn"
                onClick={() => setPicker({ open: true, mode: 'add', old: null })}
                disabled={mutating}
              >
                <Plus size={14} />
                Add
              </button>
            </div>

            <div className="planner-course-list-wrap">
              {!selected || !(selected.courses || []).length ? (
                <p className="text-text-secondary">No courses in this pack yet.</p>
              ) : (
                <ul className="planner-course-list">
                  {selected.courses.map((course) => (
                    <li key={course.identifier} className="planner-course-row">
                      <button
                        type="button"
                        className="planner-course-main"
                        onClick={() => openCourse(course.identifier)}
                      >
                        <div className="planner-course-id">{course.identifier}</div>
                        {course.title && (
                          <div className="planner-course-title text-text-secondary">
                            {course.title}
                          </div>
                        )}
                        {course.reason && (
                          <div className="planner-course-reason text-text-secondary">
                            {course.reason}
                          </div>
                        )}
                        {(course.program_name || course.category) && (
                          <div className="planner-course-reason text-text-secondary">
                            {[course.program_name, course.category].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </button>
                      <div className="planner-course-metrics">
                        <span
                          className={`planner-diff planner-diff--${course.difficulty || 'medium'}`}
                        >
                          {course.difficulty || 'medium'}
                        </span>
                        <span className="text-text-secondary">
                          GPA {course.avg_gpa != null ? course.avg_gpa.toFixed(2) : '—'}
                        </span>
                        <span className="text-text-secondary">
                          A-rate {course.a_rate != null ? `${course.a_rate.toFixed(0)}%` : '—'}
                        </span>
                        <span className="text-text-secondary">{course.credits || 3} cr</span>
                        <div className="planner-row-actions">
                          <button
                            type="button"
                            className="home-icon-btn"
                            title="Swap"
                            disabled={mutating}
                            onClick={() =>
                              setPicker({ open: true, mode: 'replace', old: course.identifier })
                            }
                          >
                            <ArrowRightLeft size={14} />
                          </button>
                          <button
                            type="button"
                            className="home-icon-btn"
                            title="Drop"
                            disabled={mutating}
                            onClick={() =>
                              onMutate?.({ action: 'remove', identifier: course.identifier })
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="planner-courses-footer">
              <button
                type="button"
                className="home-icon-btn"
                onClick={onSave}
                disabled={!selected}
                title="Save schedule"
                aria-label="Save schedule"
              >
                <Download size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {resultsTab === 'guide' && (
        <div
          className="planner-guide-tab"
          role="tabpanel"
          id="planner-panel-guide"
          aria-labelledby="planner-tab-guide"
        >
          <PlannerDegreeGuide
            plan={plan}
            onAddCourse={(identifier) => onMutate?.({ action: 'add', identifier })}
          />
        </div>
      )}

      {plan?.disclaimer && (
        <p className="planner-disclaimer text-text-secondary">{plan.disclaimer}</p>
      )}

      <PlannerCoursePicker
        open={picker.open}
        mode={picker.mode}
        title={picker.mode === 'replace' ? `Replace ${picker.old}` : 'Add a course'}
        candidates={plan?.candidates || []}
        excludeIds={picker.mode === 'add' ? excludeIds : excludeIds.filter((id) => id !== picker.old)}
        onClose={() => setPicker({ open: false, mode: 'add', old: null })}
        onPick={(identifier) => {
          if (picker.mode === 'replace') {
            onMutate?.({ action: 'replace', old: picker.old, new: identifier });
          } else {
            onMutate?.({ action: 'add', identifier });
          }
          setPicker({ open: false, mode: 'add', old: null });
        }}
      />
    </div>
  );
};

export default PlannerResultsView;
