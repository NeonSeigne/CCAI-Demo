import React from 'react';
import { ChevronRight } from 'lucide-react';
import { courseLabel } from './courseUtils';

export default function CourseSimilarCourses({
  courses,
  onCourse,
  variant = 'page',
}) {
  if (!courses?.length) {
    return variant === 'compact'
      ? <div className="course-empty">No similar courses are available.</div>
      : null;
  }

  return (
    <section
      className={`course-section ${variant === 'compact' ? 'course-card--compact' : ''}`}
      aria-labelledby="similar-courses-title"
    >
      <div className="course-section-heading">
        <div>
          <p className="course-eyebrow">Keep exploring</p>
          <h2 id="similar-courses-title">Similar Courses</h2>
        </div>
      </div>
      <div className="course-similar-grid">
        {courses.map((course) => {
          const label = courseLabel(course.course_reference);
          return (
            <button
              key={label}
              type="button"
              className="course-similar-card"
              onClick={() => onCourse?.(label)}
            >
              <span>{course.course_title || label}</span>
              <strong>{label}</strong>
              <p>{course.description || 'Open this course to see details.'}</p>
              <ChevronRight size={18} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
