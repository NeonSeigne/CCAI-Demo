import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import PlannerProfileStep from './PlannerProfileStep';
import PlannerTranscriptStep from './PlannerTranscriptStep';
import PlannerLoadingStep from './PlannerLoadingStep';
import PlannerResultsView from './PlannerResultsView';

const PLAN_STORAGE_KEY = 'semesterPlanId';

/**
 * Plan My Semester skill overlay: modal wizard → loading → floating results card.
 * Mounted on ChatPage; schedule edits also arrive via onExternalPlan from /chat-stream.
 */
const SemesterPlannerSkill = ({
  active,
  restorePlanId = null,
  externalPlan = null,
  onReadyChange,
  onDeactivate,
  sidebarCollapsed = false,
  cardSlot = null,
}) => {
  const { authToken } = useAuth();

  const [step, setStep] = useState('profile');
  const [programs, setPrograms] = useState([]);
  const [disclaimer, setDisclaimer] = useState('');
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState('');

  const [majorId, setMajorId] = useState('');
  const [certificateIds, setCertificateIds] = useState([]);
  const [year, setYear] = useState('');
  const [transcriptFile, setTranscriptFile] = useState(null);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [planId, setPlanId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, stage: '', message: '' });
  const [selecting, setSelecting] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const runGenerateRef = useRef(null);

  const persistPlanId = useCallback((id) => {
    if (!id) return;
    try {
      sessionStorage.setItem(PLAN_STORAGE_KEY, id);
    } catch (_) {
      /* ignore */
    }
  }, []);

  const clearPersistedPlanId = useCallback(() => {
    try {
      sessionStorage.removeItem(PLAN_STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
  }, []);

  const resetWizard = useCallback(() => {
    setStep('profile');
    setMajorId('');
    setCertificateIds([]);
    setYear('');
    setTranscriptFile(null);
    setStarting(false);
    setStartError('');
    setPlanId(null);
    setPlan(null);
    setProgress({ percent: 0, stage: '', message: '' });
    setSelecting(false);
    setMutating(false);
    setRestoring(false);
  }, []);

  // Notify parent of ready plan id for chat-stream
  useEffect(() => {
    if (!active) {
      onReadyChange?.(null);
      return;
    }
    if (step === 'results' && planId) {
      onReadyChange?.(planId);
    } else {
      onReadyChange?.(null);
    }
  }, [active, step, planId, onReadyChange]);

  // Apply plan patches from normal chat tool results
  useEffect(() => {
    if (!active || !externalPlan) return;
    if (externalPlan.plan_id && externalPlan.plan_id === planId) {
      setPlan(externalPlan);
      if (step !== 'results') setStep('results');
    } else if (externalPlan.plan_id && !planId) {
      setPlanId(externalPlan.plan_id);
      setPlan(externalPlan);
      setStep('results');
    }
  }, [externalPlan, active, planId, step]);

  // Load programs when skill opens
  useEffect(() => {
    if (!active || !authToken) return undefined;
    let cancelled = false;
    const load = async () => {
      setProgramsLoading(true);
      setProgramsError('');
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/planner/programs`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!response.ok) throw new Error('Failed to load programs');
        const data = await response.json();
        if (!cancelled) {
          setPrograms(data.programs || []);
          setDisclaimer(data.disclaimer || '');
        }
      } catch (err) {
        if (!cancelled) setProgramsError(err.message || 'Could not load programs');
      } finally {
        if (!cancelled) setProgramsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [active, authToken]);

  // Restore existing plan when opening with an explicit id (e.g. back from course detail)
  useEffect(() => {
    if (!active || !authToken || !restorePlanId) return undefined;

    let cancelled = false;
    const restore = async () => {
      setRestoring(true);
      try {
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/planner/plans/${restorePlanId}`,
          {
            headers: { Authorization: `Bearer ${authToken}` },
          }
        );
        if (!response.ok) throw new Error('Plan not found');
        const data = await response.json();
        if (cancelled) return;
        if (data.status === 'ready' || (data.options || []).length) {
          setPlanId(data.plan_id);
          setPlan(data);
          setStep('results');
          persistPlanId(data.plan_id);
        }
      } catch (_) {
        clearPersistedPlanId();
        if (!cancelled) {
          setStep('profile');
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    };
    restore();
    return () => {
      cancelled = true;
    };
  }, [active, authToken, restorePlanId, persistPlanId, clearPersistedPlanId]);

  // Reset when deactivated
  useEffect(() => {
    if (!active) {
      resetWizard();
    }
  }, [active, resetWizard]);

  const runGenerate = useCallback(async (id) => {
    setStep('loading');
    setProgress({ percent: 5, stage: 'parsing_transcript', message: 'Starting analysis…' });
    const response = await fetch(
      `${process.env.REACT_APP_API_URL}/api/planner/plans/${id}/generate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    if (!response.ok || !response.body) {
      throw new Error('Plan generation failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const line = chunk
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith('data:'));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice(5).trim());
          if (event.type === 'progress') {
            setProgress({
              percent: event.percent || 0,
              stage: event.stage || '',
              message: event.message || '',
            });
          } else if (event.type === 'done') {
            setPlan(event.plan);
            setProgress({ percent: 100, stage: 'done', message: event.message || 'Ready' });
            persistPlanId(id);
            setStep('results');
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Generation error');
          }
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    }
  }, [authToken, persistPlanId]);

  runGenerateRef.current = runGenerate;

  const handleStart = useCallback(async (overrides = {}) => {
    const file = overrides.transcriptFile ?? transcriptFile;
    const startMajorId = overrides.majorId ?? majorId;
    const startYear = overrides.year ?? year;
    const startCerts = overrides.certificateIds ?? certificateIds;
    if (!file) return;

    setStarting(true);
    setStartError('');
    setStep('loading');
    try {
      const form = new FormData();
      form.append('major_id', startMajorId);
      form.append('year', startYear);
      form.append('certificate_ids', JSON.stringify(startCerts));
      form.append('transcript', file, file.name || 'transcript.pdf');

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/planner/plans`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: form,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || 'Could not create plan');
      }
      const created = await response.json();
      setPlanId(created.plan_id);
      setPlan(created);
      persistPlanId(created.plan_id);
      await runGenerate(created.plan_id);
    } catch (err) {
      setStartError(err.message || 'Something went wrong');
      setStep('transcript');
    } finally {
      setStarting(false);
    }
  }, [
    authToken,
    transcriptFile,
    majorId,
    year,
    certificateIds,
    persistPlanId,
    runGenerate,
  ]);

  const handleSelectOption = async (optionId) => {
    if (!planId || optionId === plan?.selected_option_id) return;
    setSelecting(true);
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/planner/plans/${planId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ selected_option_id: optionId }),
        }
      );
      if (!response.ok) throw new Error('Could not select option');
      setPlan(await response.json());
    } catch (err) {
      console.error(err);
    } finally {
      setSelecting(false);
    }
  };

  const handleMutate = async (payload) => {
    if (!planId) return;
    setMutating(true);
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/planner/plans/${planId}/courses`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || 'Could not update courses');
      }
      setPlan(await response.json());
    } catch (err) {
      console.error(err);
    } finally {
      setMutating(false);
    }
  };

  const handleSave = () => {
    const selected = (plan?.options || []).find((o) => o.id === plan?.selected_option_id);
    if (!selected) return;
    const lines = [
      'UW–Madison Semester Plan',
      `Major: ${plan?.profile?.major_name || ''}`,
      `Certificates: ${(plan?.profile?.certificate_names || []).join(', ') || 'None'}`,
      `Year: ${plan?.profile?.year || ''}`,
      `Challenge: ${plan?.challenge || 'balanced'}`,
      `Option: ${selected.label}`,
      `Total credits: ${selected.total_credits}`,
      '',
      'Courses:',
      ...(selected.courses || []).map(
        (c) =>
          `- ${c.identifier}${c.title ? ` — ${c.title}` : ''} (${c.credits || 3} cr, ${
            c.difficulty || 'medium'
          })`
      ),
      '',
      plan?.disclaimer || '',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'semester-plan.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    onDeactivate?.();
  };

  if (!active) return null;

  const showModal = step === 'profile' || step === 'transcript' || step === 'loading' || restoring;
  const showCard = step === 'results' && plan;

  return (
    <>
      {showModal && (
        <div className="planner-skill-backdrop" role="presentation">
          <div
            className="planner-skill-modal surface-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="planner-skill-title"
          >
            <div className="planner-skill-modal-header">
              <div>
                <h2 id="planner-skill-title" className="planner-skill-modal-title">
                  Plan my Semester
                </h2>
                <p className="planner-skill-modal-sub text-text-secondary">
                  {restoring
                    ? 'Loading your semester plan…'
                    : 'Build a balanced course load from your transcript and major'}
                </p>
              </div>
              <button
                type="button"
                className="planner-skill-close"
                onClick={handleClose}
                aria-label="Close Plan my Semester"
              >
                <X size={18} />
              </button>
            </div>

            <div className="planner-skill-modal-body">
              {restoring && (
                <p className="text-text-secondary">Loading your semester plan…</p>
              )}
              {!restoring && step === 'profile' && (
                <PlannerProfileStep
                  programs={programs}
                  loading={programsLoading}
                  error={programsError}
                  majorId={majorId}
                  certificateIds={certificateIds}
                  year={year}
                  disclaimer={disclaimer}
                  onMajorChange={setMajorId}
                  onCertificatesChange={setCertificateIds}
                  onYearChange={setYear}
                  onContinue={() => setStep('transcript')}
                />
              )}
              {!restoring && step === 'transcript' && (
                <PlannerTranscriptStep
                  file={transcriptFile}
                  onFileChange={setTranscriptFile}
                  onBack={() => setStep('profile')}
                  onStart={() => handleStart()}
                  starting={starting}
                  error={startError}
                />
              )}
              {!restoring && step === 'loading' && (
                <PlannerLoadingStep
                  percent={progress.percent}
                  stage={progress.stage}
                  message={progress.message}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {showCard &&
        cardSlot &&
        createPortal(
          <div
            className={`planner-skill-floating-card surface-card ${
              sidebarCollapsed ? 'sidebar-collapsed' : ''
            }`}
            role="region"
            aria-label="Semester plan"
          >
            <div className="planner-skill-card-header planner-skill-card-header--compact">
              <h2 className="planner-skill-card-title">Semester plan</h2>
              <button
                type="button"
                className="planner-skill-close"
                onClick={handleClose}
                aria-label="Close semester plan"
              >
                <X size={16} />
              </button>
            </div>
            <div className="planner-skill-card-body">
              <PlannerResultsView
                plan={plan}
                planId={planId}
                onSelectOption={handleSelectOption}
                onSave={handleSave}
                onMutate={handleMutate}
                selecting={selecting}
                mutating={mutating}
              />
            </div>
          </div>,
          cardSlot
        )}
    </>
  );
};

export default SemesterPlannerSkill;
export { PLAN_STORAGE_KEY };
