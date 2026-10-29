import React from 'react';
import { Icon } from '../icons';
import '../../styles/CourseVisuals.css';

const DOMAIN_ICONS = { academics: 'school', student_life: 'event', campus: 'map' };

/** "Checked [Courses] [Events] [Campus map]": tint chips under a tool-grounded answer. */
export default function SourcesChecked({ visual }) {
  const domains = visual?.domains || [];
  if (!domains.length) return null;
  return (
    <div className="vc-checked" aria-label="Sources checked">
      <span>Checked</span>
      {domains.map((domain) => (
        <span key={domain.id} className="vc-src">
          <Icon name={DOMAIN_ICONS[domain.id] || 'check'} size={16} />
          {domain.label}
        </span>
      ))}
    </div>
  );
}
