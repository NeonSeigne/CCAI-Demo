import React, { useCallback, useMemo } from 'react';

import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ExternalLink,
  MessageCircle,
  Network,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import useCourseDetail from '../hooks/useCourseDetail';
import {
  courseLabel,
  courseRoute,
  resolveGradeContext,
  termGradeRows,
} from '../components/course/courseUtils';
import { CourseMetricsRow } from '../components/course/CourseMetricCard';
import CourseSimilarCourses from '../components/course/CourseSimilarCourses';
import CourseSchedule from '../components/course/CourseSchedule';
import CourseInstructors from '../components/course/CourseInstructors';
import {
  CourseGradeDistribution,
  CoursePrereqMap,
  CourseTrends,
} from '../components/course/CourseVisuals';
import '../styles/CourseDetailPage.css';

const TABS = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'prerequisites', label: 'Prerequisites Map', icon: Network },
  { id: 'instructors', label: 'Instructors', icon: Users },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
];

function CourseDetails({ course, enrollment, onCourse }) {
  const prerequisiteLinks = course?.prerequisites?.course_references || [];
  const linkedText = course?.prerequisites?.linked_requisite_text?.join(' ') || 'None';
  const satisfies = course?.satisfies || [];
  const credits = enrollment?.credit_count;
  const creditText = Array.isArray(credits)
    ? credits[0] === credits[1] ? credits[0] : `${credits[0]}–${credits[1]}`
    : 'Not listed';

  return (
    <aside className="course-details surface-card" aria-label="Course details">
      <div className="course-details-block">
        <p className="course-eyebrow">Course Description</p>
        <p>{course?.description || 'No course description is available.'}</p>
      </div>
      <div className="course-details-block">
        <p className="course-eyebrow">Prerequisites</p>
        <p>{linkedText}</p>
        {prerequisiteLinks.length > 0 && (
          <div className="course-inline-pills">
            {prerequisiteLinks.map((reference) => (
              <button
                key={courseLabel(reference)}
                type="button"
                onClick={() => onCourse(courseLabel(reference))}
              >
                {courseLabel(reference)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="course-details-block">
        <p className="course-eyebrow">Satisfies</p>
        <p>
          {satisfies.length
            ? satisfies.join(', ')
            : 'This course does not satisfy any prerequisites.'}
        </p>
      </div>
      <dl className="course-facts">
        <div><dt>Credits</dt><dd>{creditText}</dd></div>
        <div><dt>Offered</dt><dd>{enrollment?.typically_offered || 'Not listed'}</dd></div>
      </dl>
    </aside>
  );
}

function OverviewTab({ payload, onCourse }) {
  const { selectedGrades, termLabel } = resolveGradeContext(payload);
  return (
    <div className="course-tab-stack">
      <CourseMetricsRow payload={payload} />
      <CourseGradeDistribution grades={selectedGrades} termLabel={termLabel} />
      <CourseInstructors
        instructors={payload.instructors || []}
        termLabel={termLabel}
        limit={3}
        showKeywords={false}
      />
      <CourseSimilarCourses courses={payload.similar_courses} onCourse={onCourse} />
    </div>
  );
}

function CourseLoading() {
  return (
    <main className="course-page">
      <div className="course-shell course-skeleton" role="status">
        <span>Loading course details…</span>
        <div /><div /><div />
      </div>
    </main>
  );
}

function CourseDetailPage() {
  const { courseIdentifier = '' } = useParams();
  const navigate = useNavigate();
  const { authToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTerm = searchParams.get('term') || undefined;
  const activeTab = TABS.some(({ id }) => id === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'overview';
  const { data, error, loading, retry } = useCourseDetail(
    courseIdentifier,
    authToken,
    requestedTerm,
  );

  const setQuery = useCallback((changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => (
      value ? next.set(key, value) : next.delete(key)
    ));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openCourse = useCallback(
    (identifier) => navigate(courseRoute(identifier)),
    [navigate],
  );

  const rows = useMemo(
    () => (data ? termGradeRows(data.course?.term_data, data.terms) : []),
    [data],
  );

  if (loading) return <CourseLoading />;
  if (error || !data) {
    return (
      <main className="course-page">
        <div className="course-state surface-card">
          <BookOpen size={28} />
          <h1>{error?.status === 404 ? 'Course not found' : 'Course details unavailable'}</h1>
          <p>{error?.message || 'Please try again.'}</p>
          <div>
            <button type="button" className="btn-primary" onClick={retry}>
              <RefreshCw size={16} /> Try again
            </button>
            <Link to="/chat">Back to chat</Link>
          </div>
        </div>
      </main>
    );
  }

  const { course, enrollment } = data;
  const label = courseLabel(course.course_reference) || courseIdentifier;
  const title = course.course_title || label;
  const gradedTerms = Object.entries(course.term_data || {})
    .filter(([, termData]) => termData?.grade_data)
    .sort(([left], [right]) => Number(right) - Number(left));

  let tabContent;
  if (activeTab === 'schedule') {
    tabContent = <CourseSchedule meetings={data.meetings} courseName={label} />;
  } else if (activeTab === 'prerequisites') {
    tabContent = (
      <CoursePrereqMap elements={data.prerequisite_graph} onNavigate={openCourse} />
    );
  } else if (activeTab === 'instructors') {
    tabContent = (
      <CourseInstructors
        instructors={data.instructors || []}
        termLabel={data.selected_term_label}
      />
    );
  } else if (activeTab === 'trends') {
    tabContent = <CourseTrends rows={rows} />;
  } else {
    tabContent = <OverviewTab payload={data} onCourse={openCourse} />;
  }

  return (
    <main className="course-page">
      <div className="course-shell">
        <header className="course-header">
          <div className="course-header-top">
            <button type="button" className="course-back" onClick={() => navigate(-1)}>
              <ArrowLeft size={17} /> Back
            </button>
            <select
              aria-label="Course term"
              value={data.selected_term || ''}
              onChange={(event) => setQuery({ term: event.target.value })}
            >
              {gradedTerms.map(([code]) => (
                <option key={code} value={code}>{data.terms?.[code] || code}</option>
              ))}
            </select>
          </div>
          <p className="course-code">{label}</p>
          <div className="course-title-row">
            <div>
              <h1>{title}</h1>
              <p>{data.selected_term_label || 'Historical course information'}</p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/chat', {
                state: { pendingPrompt: `Tell me about ${label}` },
              })}
            >
              <MessageCircle size={17} /> Ask advisors
            </button>
          </div>
        </header>

        <nav className="course-tabs" aria-label="Course sections">
          {TABS.map(({ id, label: tabLabel, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={activeTab === id ? 'active' : ''}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => setQuery({ tab: id === 'overview' ? null : id })}
            >
              <Icon size={16} />{tabLabel}
            </button>
          ))}
        </nav>

        <div className="course-layout">
          <CourseDetails course={course} enrollment={enrollment} onCourse={openCourse} />
          <div className="course-content">{tabContent}</div>
        </div>

        <footer className="course-attribution">
          Course data provided by{' '}
          <a href="https://uwcourses.com" target="_blank" rel="noreferrer">
            UW Course Map <ExternalLink size={12} />
          </a>
          . Grade aggregates originate from MadGrades; instructor ratings originate from
          Rate My Professors.
        </footer>
      </div>
    </main>
  );
}

export default CourseDetailPage;
