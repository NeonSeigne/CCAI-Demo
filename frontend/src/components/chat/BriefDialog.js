import React, {
  useCallback, useEffect, useId, useRef, useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from '../icons';
import { useToast } from '../Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useAppConfig } from '../../contexts/AppConfigContext';
import {
  BandSheet, SheetActions, SheetBand, SheetDialog,
} from '../../modules/sheet';
import { getBrief, getBriefPdf } from '../../api/chatSessions';
import { AdvisorAvatar, advisorFor } from './PanelRow';
import '../../styles/Panel.css';
import '../../styles/Brief.css';

export const BRIEF_TITLE = 'Brief for my advisor';

const planTitle = (plan) => (plan?.term ? `My plan for ${plan.term}` : 'My plan');

/** The questions as sent: trimmed, empty ones left out. */
const keptQuestions = (questions) => (questions || []).map((q) => (q || '').trim()).filter(Boolean);

/** The brief as plain text, the same sections as the dialog (and the PDF). */
export function briefText(brief) {
  const blocks = [BRIEF_TITLE];
  const section = (title, body) => { if (body) blocks.push(`${title}\n${body}`); };
  const list = (items) => (items.length ? items.map((item) => `- ${item}`).join('\n') : '');
  section('My question', (brief?.question || '').trim());
  section('What the panel said', (brief?.summary || '').trim());
  section('Where they differed', list((brief?.differences || []).map((d) => {
    const positions = (d.positions || []).map((p) => `${p.name || p.persona_id}: ${p.stance}`).join('; ');
    return positions ? `${d.topic}: ${positions}` : d.topic;
  })));
  const plan = brief?.plan;
  if (plan?.courses?.length) {
    const rows = plan.courses.map((c) => {
      const line = [c.code, c.title].filter(Boolean).join(' ');
      return c.credits ? `${line}, ${c.credits} credits` : line;
    });
    if (plan.total_credits) rows.push(`Total: ${plan.total_credits} credits`);
    section(planTitle(plan), list(rows));
  }
  section('Questions for you', list(keptQuestions(brief?.questions)));
  return blocks.join('\n\n');
}

function save(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/** The dialog's real layout in raised blocks while the brief loads. */
function Skeleton() {
  return (
    <div className="ab-body">
      {[2, 3, 2, 3, 2].map((lines, n) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={n} className="ab-sec">
          <span className="pnl-block ab-skel-title" />
          {Array.from({ length: lines }, (_, i) => <span key={i} className="pnl-block ab-skel-line" />)}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }) {
  const id = useId();
  return (
    <section className="ab-sec" aria-labelledby={id}>
      <h3 id={id} className="ab-title">{title}</h3>
      {children}
    </section>
  );
}

function Differences({ differences, personas }) {
  return differences.map((difference) => (
    <div key={difference.topic} className="ap-diff-topic">
      <h4 className="ap-diff-topic-name">{difference.topic}</h4>
      <ul className="ap-diff-positions">
        {(difference.positions || []).map((position) => {
          const advisor = advisorFor(position.persona_id, personas, position.name);
          return (
            <li key={position.persona_id} className={`ap-diff-position adv-${advisor.slot}`}>
              <AdvisorAvatar advisor={advisor} size="sm" />
              <p><b>{advisor.name}</b> {position.stance}</p>
            </li>
          );
        })}
      </ul>
    </div>
  ));
}

function Questions({ questions, onChange }) {
  const set = (index, value) => onChange(questions.map((q, i) => (i === index ? value : q)));
  const remove = (index) => onChange(questions.filter((_, i) => i !== index));
  return (
    <>
      <ol className="ab-questions">
        {questions.map((question, index) => (
          // Questions have no ids; their order is their identity while editing.
          // eslint-disable-next-line react/no-array-index-key
          <li key={index} className="ab-question">
            <input
              type="text"
              className="ab-input"
              value={question}
              aria-label={`Question ${index + 1}`}
              onChange={(event) => set(index, event.target.value)}
            />
            <button
              type="button"
              className="ab-icon-btn"
              aria-label={`Remove question ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Icon name="close" size={20} />
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="ab-icon-btn ab-add" aria-label="Add question" onClick={() => onChange([...questions, ''])}>
        <Icon name="add" size={20} />
      </button>
    </>
  );
}

/**
 * Brief for my advisor (DESIGN.md Components, "Brief for my advisor"): the
 * chat's question, the panel's summary, where they differed, the plan for the
 * plan's term and editable questions, with Copy and Download PDF.
 */
export default function BriefDialog({ sessionId, onClose }) {
  const { authToken } = useAuth();
  const { config } = useAppConfig();
  const toast = useToast();
  const titleId = useId();
  const [state, setState] = useState({ status: 'loading', brief: null, error: null });
  const [questions, setQuestions] = useState([]);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const live = useRef(true);
  const personas = config?.personas?.items || [];

  const load = useCallback(() => {
    setState({ status: 'loading', brief: null, error: null });
    getBrief(authToken, sessionId)
      .then((brief) => {
        if (!live.current) return;
        setQuestions(Array.isArray(brief?.questions) ? brief.questions : []);
        setState({ status: 'ready', brief, error: null });
      })
      .catch((error) => {
        if (live.current) setState({ status: 'error', brief: null, error });
      });
  }, [authToken, sessionId]);

  useEffect(() => {
    live.current = true;
    load();
    return () => { live.current = false; };
  }, [load]);

  const { status, brief } = state;
  const edited = brief ? { ...brief, questions: keptQuestions(questions) } : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(briefText(edited));
      setCopied(true);
      setTimeout(() => { if (live.current) setCopied(false); }, 2000);
    } catch {
      toast.show({ message: 'Couldn’t copy', tone: 'error' });
    }
  };

  const download = async () => {
    setSaving(true);
    try {
      save(await getBriefPdf(authToken, sessionId, edited), 'brief-for-my-advisor.pdf');
    } catch {
      toast.show({ message: 'Couldn’t export', tone: 'error' });
    } finally {
      if (live.current) setSaving(false);
    }
  };

  const ready = status === 'ready';
  const differences = (brief?.differences || []).filter((d) => d?.topic && d.positions?.length);
  const courses = brief?.plan?.courses || [];
  // A chat with no answer yet (400) has nothing to retry.
  const retry = state.error?.status === 400 ? undefined : load;

  return (
    <SheetDialog open onClose={onClose} labelledBy={titleId} size="medium">
      <BandSheet
        className="ab"
        titleId={titleId}
        status={status}
        error={{ onRetry: retry }}
        loadingLabel={BRIEF_TITLE}
        band={<SheetBand title={BRIEF_TITLE} titleId={titleId} onClose={onClose} />}
        actions={(
          <SheetActions>
            <button type="button" className="pop-btn pop-btn--primary" disabled={!ready} onClick={copy}>
              <Icon name={copied ? 'check' : 'content_copy'} size={20} />
              Copy
            </button>
            <button type="button" className="pop-btn" disabled={!ready || saving} onClick={download}>
              <Icon name="download" size={20} />
              Download PDF
            </button>
          </SheetActions>
        )}
      >
        {ready ? (
          <div className="ab-body">
            {brief.question && (
              <Section title="My question"><p className="ab-text">{brief.question}</p></Section>
            )}
            {brief.summary && (
              <Section title="What the panel said">
                <div className="ab-text ab-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{brief.summary}</ReactMarkdown>
                </div>
              </Section>
            )}
            {differences.length > 0 && (
              <Section title="Where they differed">
                <Differences differences={differences} personas={personas} />
              </Section>
            )}
            {courses.length > 0 && (
              <Section title={planTitle(brief.plan)}>
                <ul className="ab-courses">
                  {courses.map((course) => (
                    <li key={course.code} className="ab-course">
                      <span className="ab-code">{course.code}</span>
                      <span className="ab-course-title">{course.title}</span>
                      {course.credits && <span className="ab-credits">{course.credits}<span className="sr-only"> credits</span></span>}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Section title="Questions for you">
              <Questions questions={questions} onChange={setQuestions} />
            </Section>
          </div>
        ) : <Skeleton />}
      </BandSheet>
    </SheetDialog>
  );
}
