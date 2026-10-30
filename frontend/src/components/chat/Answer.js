import React, { useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Icon } from '../icons';
import { useToast } from '../Toast';
import { useChat } from '../../contexts/ChatContext';
import VisualBlock from '../visuals/VisualBlock';
import CourseChip from '../visuals/CourseChip';
import AnswerSources from '../visuals/AnswerSources';
import { groupCourseVisuals } from '../visuals/CourseAnswerCard';
import ErrorBoundary from '../ErrorBoundary';

const THUMBS = [
  { value: 'up', icon: 'thumb_up', label: 'Good answer' },
  { value: 'down', icon: 'thumb_down', label: 'Bad answer' },
];

/**
 * The answer's meta row (ask-chat.html .meta): the "Checked" source chips,
 * then copy, thumbs up and thumbs down as 36px round icons in 44px hit areas
 * (design Q19). Thumbs are aria-pressed toggles saved to the chat; a failed
 * save puts the old state back. Answers that aren't saved show no thumbs.
 */
function ActionRow({ message, checkedVisual }) {
  const chat = useChat();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const feedback = message.feedback ?? null;
  const storedId = 'message_id' in message ? message.message_id : message.id;
  const canRate = Boolean(chat?.rateAnswer && chat?.sessionId && storedId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message?.compact_markdown || message?.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show({ message: 'Couldn’t copy', tone: 'error' });
    }
  };

  const rate = (value) => {
    chat.rateAnswer(message, feedback === value ? null : value).catch(() => {
      toast.show({ message: 'Couldn’t save feedback', tone: 'error' });
    });
  };

  return (
    <div className="answer-meta">
      {checkedVisual && <VisualBlock visual={checkedVisual} />}
      <span className="answer-acts">
        <button type="button" className="answer-act" aria-label={copied ? 'Copied' : 'Copy'} onClick={copy}>
          <Icon name={copied ? 'check' : 'content_copy'} size={20} />
        </button>
        {canRate && THUMBS.map((thumb) => (
          <button
            key={thumb.value}
            type="button"
            className="answer-act"
            aria-label={thumb.label}
            aria-pressed={feedback === thumb.value}
            onClick={() => rate(thumb.value)}
          >
            <Icon name={thumb.icon} size={20} filled={feedback === thumb.value} />
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * One answer in the thread: the text, its cards, the Checked chips and the
 * action row. Courses open through `onCourseSelect`; a card's follow-up
 * question goes to `onAsk`.
 */
const Answer = ({ message, onCourseSelect, onAsk }) => {
  // The "Checked" line leads the answer; every other visual follows the text.
  const visuals = Array.isArray(message?.visuals) ? message.visuals : [];
  const checkedVisual = visuals.find((visual) => visual?.type === 'sources_checked');
  const cardVisuals = groupCourseVisuals(visuals.filter((visual) => visual?.type !== 'sources_checked'));
  // Minimal, safe preprocessing (keep Markdown structure intact)
  const preprocessMarkdown = (content) => {
    const input = (content || '').toString();

    // 1) Strip trailing sentinel
    let processed = input.replace(/\s*<\/END>\s*$/i, '');

    // 2) Normalize EOL and trim right spaces (preserve newlines)
    processed = processed.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    processed = processed.split('\n').map(ln => ln.replace(/\s+$/, '')).join('\n');

    // 3) Line fixes outside fenced code: unicode bullets -> '-' (so GFM parses
    //    lists), and a lone "$$...$$" line split across three lines, which is
    //    the only form remark-math treats as display math.
    let inFence = false;
    processed = processed
      .split('\n')
      .flatMap((line) => {
        if (/^\s*(```|~~~)/.test(line)) {
          inFence = !inFence;
          return [line];
        }
        if (inFence) return [line];
        const bulleted = line.replace(/^\s*[•●▪◦]\s+/, '- ');
        const display = bulleted.match(/^\s*\$\$((?:(?!\$\$).)+)\$\$\s*$/);
        return display ? ['', '$$', display[1].trim(), '$$', ''] : [bulleted];
      })
      .join('\n');

    // 3b) Percent-encode spaces inside course: link targets. CommonMark won't
    // parse a link whose destination contains a raw space, so "[ECON 410]
    // (course:ECON 410)" would otherwise render as literal text.
    processed = processed.replace(
      /\]\(course:([^)\n]+)\)/gi,
      (_m, p1) => `](course:${p1.trim().replace(/ /g, '%20')})`
    );

    // 4) Merge orphan numbered items: "1.\nText" => "1. Text"
    processed = processed.replace(/(^\s*(\d+)\.\s*$)\n^\s*(\S.*)$/gm, (_m, _a, num, next) => `${num}. ${next}`);

    // 5) Collapse 3+ blank lines to 2
    processed = processed.replace(/\n{3,}/g, '\n\n');

    return processed.trim();
  };

  // ENHANCED MARKDOWN COMPONENTS WITH BETTER STYLING
  const markdownComponents = {
    // Keep <strong> INLINE to avoid breaking paragraphs/lists
    strong: ({ children }) => (
      <strong style={{ 
        fontWeight: '700',
        color: 'var(--ink)'
      }}>
        {children}
      </strong>
    ),
    
    // Italic text styling
    em: ({ children }) => (
      <em style={{ 
        fontStyle: 'italic',
        color: 'var(--muted)',
        fontWeight: '500'
      }}>
        {children}
      </em>
    ),
    
    // Paragraph styling with proper spacing
    p: ({ children }) => (
      <p style={{
        lineHeight: '1.6',
        fontWeight: 500,
        color: 'var(--ink)'
      }}>
        {children}
      </p>
    ),

    // Unordered list styling
    ul: ({ children }) => (
      <ul style={{ 
        listStyleType: 'disc',
        paddingLeft: '1.5rem',
        marginBottom: '1rem',
        marginTop: '0.5rem',
        color: 'var(--ink)'
      }}>
        {children}
      </ul>
    ),
    
    // Ordered list styling with better spacing
    ol: ({ children }) => (
      <ol style={{ 
        listStyleType: 'decimal',
        paddingLeft: '1.5rem',
        marginBottom: '1rem',
        marginTop: '0.5rem',
        color: 'var(--ink)',
        counterReset: 'list-counter'
      }}>
        {children}
      </ol>
    ),
    
    // List item styling with proper spacing
    li: ({ children }) => (
      <li style={{ 
        marginBottom: '0.75rem',
        lineHeight: '1.6',
      }}>
        {children}
      </li>
    ),
    
    // Course links (course:<identifier>) render as clickable chips; all other
    // links open normally in a new tab.
    a: ({ href, children }) => {
      if (typeof href === 'string' && href.toLowerCase().startsWith('course:')) {
        let identifier = href.slice('course:'.length);
        try {
          identifier = decodeURIComponent(identifier);
        } catch {
          // Malformed %-escape from the model: keep the raw text, don't crash.
        }
        identifier = identifier.trim();
        const text = Array.isArray(children) ? children.join('') : (children || '');
        return <CourseChip identifier={identifier || text} size="sm" onSelect={onCourseSelect} />;
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>
          {children}
        </a>
      );
    },

    // Headings
    h1: ({ children }) => (
      <h1 style={{ fontSize: '1.35rem', fontWeight: 700, lineHeight: 1.3, color: 'var(--ink)', margin: '1.25rem 0 0.6rem' }}>
        {children}
      </h1>
    ),

    h2: ({ children }) => (
      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.3, color: 'var(--ink)', margin: '1.15rem 0 0.55rem' }}>
        {children}
      </h2>
    ),

    h3: ({ children }) => (
      <h3 style={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.35, color: 'var(--ink)', margin: '1rem 0 0.5rem' }}>
        {children}
      </h3>
    ),

    h4: ({ children }) => (
      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.4, color: 'var(--muted)', margin: '0.9rem 0 0.45rem' }}>
        {children}
      </h4>
    ),

    // Tables (remark-gfm)
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', margin: '0.75rem 0 1rem' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
          {children}
        </table>
      </div>
    ),

    th: ({ children }) => (
      <th style={{
        border: '1px solid var(--line)',
        backgroundColor: 'var(--canvas)',
        padding: '0.45rem 0.65rem',
        textAlign: 'left',
        fontWeight: 600,
        color: 'var(--ink)'
      }}>
        {children}
      </th>
    ),

    td: ({ children }) => (
      <td style={{ border: '1px solid var(--line)', padding: '0.45rem 0.65rem', color: 'var(--ink)' }}>
        {children}
      </td>
    ),

    blockquote: ({ children }) => (
      <blockquote style={{
        borderLeft: '3px solid var(--line)',
        paddingLeft: '0.85rem',
        margin: '0.75rem 0',
        color: 'var(--muted)'
      }}>
        {children}
      </blockquote>
    ),

    hr: () => (
      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '1.25rem 0' }} />
    ),

    // Fenced code blocks. react-markdown no longer passes an `inline` prop, so
    // the block case is handled by `pre` and `code` only styles inline spans.
    pre: ({ children }) => (
      <pre style={{
        backgroundColor: 'var(--raised)',
        border: '1px solid var(--line)',
        padding: '0.85rem',
        borderRadius: '8px',
        overflowX: 'auto',
        margin: '0.5rem 0 1rem',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '0.8125rem',
        lineHeight: 1.5
      }}>
        {children}
      </pre>
    ),

    code: ({ node, className, children, ...props }) => {
      // Fenced blocks carry a language class or, when unlabelled, a trailing
      // newline in their content; inline spans have neither.
      const text = Array.isArray(children) ? children.join('') : String(children ?? '');
      const isBlock = (typeof className === 'string' && className.includes('language-')) || text.includes('\n');
      if (isBlock) {
        return <code className={className} {...props}>{children}</code>;
      }
      return (
        <code style={{
          backgroundColor: 'var(--raised)',
          padding: '0.2rem 0.35rem',
          borderRadius: '4px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: '0.875rem'
        }} {...props}>
          {children}
        </code>
      );
    }
  };

  // One voice, plain text and cards.
  if (message?.type === 'advisor') {

    return (
      <div className="advisor-message-container is-plain">
        <div className="answer">
          {/* Enhanced markdown rendering with preprocessing */}
          <div className="advisor-message-text" style={{ color: 'var(--ink)' }}>
            <ErrorBoundary fallback={<p>{message?.content || message?.text}</p>}>
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              urlTransform={(url) =>
                (typeof url === 'string' && url.toLowerCase().startsWith('course:'))
                  ? url
                  : defaultUrlTransform(url)
              }
            >
              {preprocessMarkdown(message?.compact_markdown || message?.content || message?.text)}
            </ReactMarkdown>
            </ErrorBoundary>
          </div>

          {cardVisuals.length > 0 && (
            <div className="advisor-message-visuals answer-cards">
              {cardVisuals.map((visual, idx) => (
                <VisualBlock key={idx} visual={visual} onSelectCourse={onCourseSelect} onAsk={onAsk} />
              ))}
            </div>
          )}

          <AnswerSources visuals={cardVisuals} />

          <ActionRow message={message} checkedVisual={checkedVisual} />
        </div>
      </div>
    );
  }

  return null;
};

export default Answer;
