import React, { useMemo } from 'react';

const PlannerDegreeGuide = ({ plan, onAddCourse }) => {
  const projection = plan?.requirements_projection || plan?.requirements_status || {};
  const groups = useMemo(() => {
    const all = [
      ...(projection.satisfied || []).map((g) => ({ ...g, _status: 'satisfied' })),
      ...(projection.remaining || []).map((g) => ({ ...g, _status: 'remaining' })),
    ];
    const byProgram = {};
    for (const g of all) {
      const key = g.program_id || 'unknown';
      if (!byProgram[key]) {
        byProgram[key] = {
          program_id: key,
          program_name: g.program_name || key,
          program_type: g.program_type || 'major',
          groups: [],
        };
      }
      byProgram[key].groups.push(g);
    }
    return Object.values(byProgram).sort((a, b) => {
      if (a.program_type === b.program_type) return a.program_name.localeCompare(b.program_name);
      return a.program_type === 'major' ? -1 : 1;
    });
  }, [projection]);

  const selectedIds = new Set(
    (
      (plan?.options || []).find((o) => o.id === plan?.selected_option_id)?.courses || []
    ).map((c) => c.identifier)
  );

  return (
    <div className="surface-card planner-degree-guide">
      <h3 className="home-section-label">Degree guide</h3>
      <p className="planner-hint text-text-secondary">
        Live view of what your transcript and this semester’s courses satisfy. Add remaining
        courses to update the projection.
      </p>

      {groups.length === 0 ? (
        <p className="text-text-secondary">No requirement data yet.</p>
      ) : (
        groups.map((program) => (
          <section key={program.program_id} className="planner-guide-program">
            <div className="planner-guide-program-header">
              <span
                className={`accent-dot ${
                  program.program_type === 'certificate' ? 'bg-accent-green' : 'bg-accent-blue'
                }`}
              />
              <div>
                <div className="planner-guide-program-name">{program.program_name}</div>
                <div className="text-text-secondary planner-guide-program-type">
                  {program.program_type}
                </div>
              </div>
            </div>

            <ul className="planner-guide-req-list">
              {program.groups.map((req) => {
                const projected = Boolean(req.projected_satisfied) || req._status === 'satisfied';
                const planned = req.planned_courses || [];
                const remaining = req.remaining_courses || [];
                return (
                  <li
                    key={`${req.program_id}-${req.requirement_id}`}
                    className={`planner-guide-req ${projected ? 'is-met' : 'is-open'}`}
                  >
                    <div className="planner-guide-req-top">
                      <div>
                        <div className="planner-guide-req-title">{req.title}</div>
                        <div className="text-text-secondary planner-guide-req-meta">
                          {req.completed_count}/{req.needed} · {req.category || 'core'}
                          {projected ? ' · on track' : ''}
                        </div>
                      </div>
                      <span className={`planner-guide-badge ${projected ? 'is-met' : ''}`}>
                        {projected ? 'Satisfied' : 'Remaining'}
                      </span>
                    </div>

                    {(req.matched_courses || []).length > 0 && (
                      <div className="planner-guide-chips">
                        {(req.matched_courses || []).map((id) => (
                          <span
                            key={id}
                            className={`planner-guide-chip ${
                              planned.includes(id) || selectedIds.has(id) ? 'is-planned' : ''
                            }`}
                          >
                            {id}
                            {(planned.includes(id) || selectedIds.has(id)) && ' (plan)'}
                          </span>
                        ))}
                      </div>
                    )}

                    {!projected && remaining.length > 0 && (
                      <div className="planner-guide-remaining">
                        <span className="text-text-secondary">Still needed:</span>
                        <div className="planner-guide-chips">
                          {remaining.slice(0, 8).map((id) => (
                            <button
                              key={id}
                              type="button"
                              className="planner-guide-chip planner-guide-chip--action"
                              onClick={() => onAddCourse?.(id)}
                              title={`Add ${id} to schedule`}
                            >
                              + {id}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};

export default PlannerDegreeGuide;
