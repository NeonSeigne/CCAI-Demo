import React from 'react';

/**
 * In the waffle's place while the student has no program (D5). Choosing
 * one saves it through `set_profile`; Completed opens the editor (O2).
 */
export default function ProgramPicker({ programs, onChoose, onEditCompleted }) {
  return (
    <section className="dg-summary dg-picker" aria-label="Program">
      <label className="dg-picker-field" htmlFor="dg-program">
        <span className="dg-label">Program</span>
        <select
          id="dg-program"
          value=""
          onChange={(event) => { if (event.target.value) onChoose(event.target.value); }}
        >
          <option value="" disabled>Choose</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>{program.name}</option>
          ))}
        </select>
      </label>
      <button type="button" className="cc-btn" onClick={onEditCompleted}>Completed</button>
    </section>
  );
}
