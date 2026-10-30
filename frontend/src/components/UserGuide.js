import React, { useState, useEffect } from 'react';
import {
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon, resolveIconName } from './icons';
import { useAppConfig } from '../contexts/AppConfigContext';
import { userGuideTopics } from '../data/userGuide';
import AppDialog from './AppDialog';
import '../styles/UserGuide.css';

/**
 * Help (help.html): the band title, the topics with a search at the left
 * (chips on phones) and the topic in a reading column.
 */
const UserGuide = ({ leftInset = 0 }) => {
  const { config } = useAppConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [activeInset, setActiveInset] = useState(leftInset);
  const [activeId, setActiveId] = useState(userGuideTopics[0].id);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setActiveInset(leftInset);
  }, [leftInset]);

  useEffect(() => {
    const updateInset = (event) => {
      setActiveInset(Math.max(0, Number(event.detail?.leftInset) || 0));
    };
    const open = (event) => {
      updateInset(event);
      setIsOpen(true);
    };
    window.addEventListener('open-user-guide', open);
    window.addEventListener('dialog-inset-change', updateInset);
    return () => {
      window.removeEventListener('open-user-guide', open);
      window.removeEventListener('dialog-inset-change', updateInset);
    };
  }, []);

  const appName = config?.app?.title || 'the app';
  const q = search.toLowerCase().trim();
  const filteredTopics = q
    ? userGuideTopics.filter(t =>
        t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q))
    : userGuideTopics;
  const activeTopic = userGuideTopics.find(t => t.id === activeId) || userGuideTopics[0];

  return (
    <AppDialog
      open={isOpen}
      onClose={() => setIsOpen(false)}
      leftInset={activeInset}
      maxWidth={false}
      className="ug-dialog"
      aria-labelledby="user-guide-title"
    >
      <DialogTitle id="user-guide-title" className="ug-header">
        <span className="ug-title">Help</span>
        <IconButton
          className="ug-close"
          onClick={() => setIsOpen(false)}
          aria-label="Close user guide"
        >
          <Icon name="close" size={20} />
        </IconButton>
      </DialogTitle>

      <DialogContent className="ug-body">
        <nav className="ug-toc" aria-label="Topics">
          <label className="ug-search">
            <Icon name="search" size={20} />
            <span className="sr-only">Search the guide</span>
            <input
              type="search"
              placeholder="Search the guide…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {filteredTopics.length === 0 && (
            <div className="ug-empty">No matches</div>
          )}
          <ul className="ug-topics">
            {filteredTopics.map((t) => {
              const on = t.id === activeTopic.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`ug-topic ${on ? 'is-on' : ''}`.trim()}
                    aria-current={on ? 'true' : undefined}
                    onClick={() => setActiveId(t.id)}
                  >
                    <Icon name={resolveIconName(t.icon)} size={21} filled={on} />
                    <span>{t.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ug-chips" role="group" aria-label="Topics">
          {userGuideTopics.map((t) => (
            <button
              key={t.id}
              type="button"
              className="cc-chip"
              aria-pressed={t.id === activeTopic.id}
              onClick={() => setActiveId(t.id)}
            >
              {t.title}
            </button>
          ))}
        </div>

        <div className="ug-read">
          <article className="ug-content" key={activeTopic.id}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {activeTopic.content
                .replace(/\{\{appName\}\}/g, appName)}
            </ReactMarkdown>
          </article>
        </div>
      </DialogContent>
    </AppDialog>
  );
};

export default UserGuide;
