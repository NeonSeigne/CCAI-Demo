import React, { useMemo } from 'react';
import { Clock, Download, MapPin, Users } from 'lucide-react';
import { createScheduleIcs } from './courseUtils';

export default function CourseSchedule({
  meetings,
  courseName,
  variant = 'page',
}) {
  const grouped = useMemo(() => {
    const map = new Map();
    (meetings || []).forEach((meeting) => {
      const date = new Date(meeting.start_time);
      const key = date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(meeting);
    });
    return Array.from(map.entries());
  }, [meetings]);

  const exportSchedule = () => {
    const blob = new Blob([createScheduleIcs(courseName, meetings)], {
      type: 'text/calendar;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${String(courseName || 'course').replace(/\s+/g, '-')}-schedule.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className={`course-section ${variant === 'compact' ? 'course-card--compact' : ''}`}
      aria-labelledby="schedule-title"
    >
      <div className="course-section-heading">
        <div>
          <p className="course-eyebrow">Class meetings</p>
          <h2 id="schedule-title">Schedule</h2>
        </div>
        {meetings?.length > 0 && (
          <button type="button" className="btn-secondary" onClick={exportSchedule}>
            <Download size={16} /> Export .ics
          </button>
        )}
      </div>
      {!grouped.length ? (
        <div className="course-empty">No meeting schedule is available for this course.</div>
      ) : (
        <div className="course-schedule">
          {grouped.map(([day, dayMeetings]) => (
            <div className="course-schedule-day" key={day}>
              <h3>{day}</h3>
              <div>
                {dayMeetings.map((meeting, index) => (
                  <article
                    className="course-meeting"
                    key={`${meeting.name}-${meeting.start_time}-${index}`}
                  >
                    <div>
                      <strong>{meeting.name}</strong>
                      <span>{meeting.type}</span>
                    </div>
                    <p>
                      <Clock size={14} />
                      {new Date(meeting.start_time).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      –
                      {new Date(meeting.end_time).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                    <p>
                      <MapPin size={14} />
                      {[meeting.location?.building, meeting.location?.room]
                        .filter(Boolean)
                        .join(' · ') || 'Location TBA'}
                    </p>
                    <p>
                      <Users size={14} />
                      {(meeting.instructors || []).join(', ') || 'Instructor TBA'}
                    </p>
                    {meeting.current_enrollment != null && (
                      <small>
                        {meeting.current_enrollment}
                        {meeting.location?.capacity ? ` / ${meeting.location.capacity}` : ''} enrolled
                      </small>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
