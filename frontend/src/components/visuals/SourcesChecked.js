import React from 'react';
import { Check } from '../icons';

/** "Checked: Courses · Events · Campus map" above a tool-grounded answer. */
export default function SourcesChecked({ visual }) {
  const domains = visual?.domains || [];
  if (!domains.length) return null;
  return (
    <div className="cc-checked" aria-label="Sources checked">
      <Check size={14} strokeWidth={2.6} aria-hidden="true" />
      <span>Checked</span>
      {domains.map((domain) => (
        <span key={domain.id} className={`cc-domain cc-domain--${domain.id}`}>
          {domain.label}
        </span>
      ))}
    </div>
  );
}
