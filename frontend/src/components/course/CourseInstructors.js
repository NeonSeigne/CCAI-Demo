import React, { useMemo, useState } from 'react';
import { ExternalLink, Mail, Star } from 'lucide-react';

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'class', 'course', 'professor', 'very', 'really',
  'were', 'have', 'from', 'they', 'just', 'your', 'show', 'easy', 'music',
]);

export function CourseInstructorCard({ instructor }) {
  const rmp = instructor?.rmp_data;
  const rating = rmp?.average_rating;
  const rmpUrl = rmp?.legacy_id
    ? `https://www.ratemyprofessors.com/professor/${rmp.legacy_id}`
    : null;
  const initial = (instructor?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <article className="course-instructor-card">
      <div className="course-instructor-avatar" aria-hidden="true">{initial}</div>
      <div className="course-instructor-main">
        <h3>{instructor?.name || 'Instructor unavailable'}</h3>
        {instructor?.position && <p>{instructor.position}</p>}
        {instructor?.email && (
          <a href={`mailto:${instructor.email}`}>
            <Mail size={14} />
            {instructor.email}
          </a>
        )}
      </div>
      <div className="course-rating">
        <strong>{rating == null ? '?' : rating.toFixed(1)}</strong>
        <span><Star size={13} /> Rating</span>
        {rmpUrl && (
          <a href={rmpUrl} target="_blank" rel="noreferrer">
            RMP <ExternalLink size={12} />
          </a>
        )}
      </div>
    </article>
  );
}

function InstructorKeywords({ instructors }) {
  const keywords = useMemo(() => {
    const counts = {};
    instructors
      .flatMap((instructor) => instructor.rmp_data?.ratings || [])
      .forEach((rating) => {
        String(rating.comment || '')
          .toLowerCase()
          .match(/[a-z]{4,}/g)
          ?.forEach((word) => {
            if (!STOP_WORDS.has(word)) counts[word] = (counts[word] || 0) + 1;
          });
      });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [instructors]);

  if (!keywords.length) return null;
  return (
    <div className="course-keywords" aria-label="Common review keywords">
      <p className="course-eyebrow">Common review themes</p>
      <div>
        {keywords.map(([word, total]) => (
          <span key={word} style={{ '--keyword-weight': Math.min(total, 5) }}>{word}</span>
        ))}
      </div>
    </div>
  );
}

export default function CourseInstructors({
  instructors = [],
  termLabel,
  limit,
  showKeywords = true,
  variant = 'page',
}) {
  const [visible, setVisible] = useState(limit || 6);
  const capped = typeof limit === 'number' ? Math.min(visible, limit) : visible;
  const shown = instructors.slice(0, capped);
  const titleId = limit ? 'overview-instructors-title' : 'instructors-title';

  return (
    <section
      className={`course-section ${variant === 'compact' ? 'course-card--compact' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="course-section-heading">
        <div>
          <p className="course-eyebrow">Sorted by ratings from Rate My Professors</p>
          <h2 id={titleId}>Instructors ({termLabel || 'selected term'})</h2>
        </div>
      </div>
      <div className="course-instructor-list">
        {shown.map((instructor) => (
          <CourseInstructorCard key={instructor.name} instructor={instructor} />
        ))}
        {!instructors.length && (
          <div className="course-empty">No instructors are listed for this term.</div>
        )}
      </div>
      {!limit && visible < instructors.length && (
        <button
          type="button"
          className="btn-secondary course-load-more"
          onClick={() => setVisible((count) => count + 6)}
        >
          Show more instructors
        </button>
      )}
      {limit && instructors.length > limit && (
        <p className="course-showing">Showing {limit} of {instructors.length} instructors.</p>
      )}
      {showKeywords && !limit && <InstructorKeywords instructors={instructors} />}
    </section>
  );
}
