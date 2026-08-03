import React, { useMemo, useState } from 'react';
import { useAppConfig } from '../contexts/AppConfigContext';

const ACCENT_DOTS = ['var(--accent-red)', 'var(--accent-blue)', 'var(--accent-green)'];
const FILTER_LABELS = {
  academic: 'Academic',
  career: 'Career',
  'study-skills': 'Study Skills',
  wellness: 'Wellness',
};

const SuggestionsPanel = ({ onSuggestionClick }) => {
  const { config, resolveIcon, advisors } = useAppConfig();
  const [activeFilter, setActiveFilter] = useState('all');
  const examples = useMemo(
    () => config?.chat_page?.examples || [],
    [config?.chat_page?.examples],
  );
  const filters = useMemo(
    () => [
      { id: 'all', label: 'All' },
      ...examples.map((category) => ({
        id: category.id || category.title,
        label: FILTER_LABELS[category.id] || category.title,
      })),
    ],
    [examples],
  );
  const visibleExamples = activeFilter === 'all'
    ? examples
    : examples.filter((category) => (category.id || category.title) === activeFilter);

  return (
    <div className="suggestions-panel">
      <div className="suggestion-filters" role="group" aria-label="Filter starter prompts">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`suggestion-filter ${activeFilter === filter.id ? 'pill-active' : ''}`}
            aria-pressed={activeFilter === filter.id}
            onClick={() => setActiveFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className={`suggestions-grid ${visibleExamples.length === 1 ? 'single-card' : ''}`}>
        {visibleExamples.map((category, categoryIndex) => {
          const Icon = resolveIcon(category.icon);
          const dot = ACCENT_DOTS[categoryIndex % ACCENT_DOTS.length];
          const mappedAdvisors = (category.advisor_ids || [])
            .map((id) => ({ id, ...advisors[id] }))
            .filter((advisor) => advisor.name);
          return (
            <section key={category.id || category.title} className="suggestion-category surface-card">
              <div className="category-header">
                <div className="category-icon">
                  <Icon size={20} />
                </div>
                <h3 className="category-title">
                  <span className="accent-dot" style={{ backgroundColor: dot }} />
                  {category.title}
                </h3>
              </div>

              <div className="suggestion-buttons">
                {(category.suggestions || []).map((suggestion, suggestionIndex) => (
                  <button
                    key={suggestionIndex}
                    type="button"
                    onClick={() => onSuggestionClick(suggestion, category.advisor_ids || [])}
                    className="suggestion-button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              {mappedAdvisors.length > 0 && (
                <div className="prompt-advisors" aria-label="Advisors for these prompts">
                  {mappedAdvisors.map((advisor) => {
                    const AdvisorIcon = advisor.icon;
                    return (
                      <span key={advisor.id} className="prompt-advisor-chip">
                        <span className="prompt-advisor-avatar" aria-hidden="true">
                          {advisor.avatarUrl
                            ? <img src={advisor.avatarUrl} alt="" />
                            : <AdvisorIcon size={13} />}
                        </span>
                        {advisor.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default SuggestionsPanel;
