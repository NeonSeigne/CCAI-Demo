import React, { useState, useEffect } from 'react';
import {
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as LucideIcons from 'lucide-react';
import { X, Search, ChevronRight, BookOpen } from 'lucide-react';
import { useAppConfig } from '../contexts/AppConfigContext';
import { userGuideTopics } from '../data/userGuide';
import AppDialog from './AppDialog';
import '../styles/UserGuide.css';

const UserGuide = ({ leftInset = 0 }) => {
  const { config, advisors } = useAppConfig();
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
  const advisorEntries = Object.values(advisors || {});
  const advisorCount = advisorEntries.length;
  const advisorList = advisorEntries
    .map((a) => `- **${a.name}:** ${a.description || a.role || ''}`.trimEnd())
    .join('\n');
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
      maxWidth="lg"
      aria-labelledby="user-guide-title"
      slotProps={{
        paper: {
          sx: {
            height: '80vh',
            maxHeight: 720,
            overflow: 'hidden',
          },
        },
      }}
    >
      <DialogTitle id="user-guide-title" className="ug-header">
        <span className="ug-title">
          <span className="ug-title-icon">
            <BookOpen size={18} />
          </span>
          <span>User Guide</span>
        </span>
        <IconButton
          className="ug-close"
          onClick={() => setIsOpen(false)}
          aria-label="Close user guide"
          size="small"
        >
            <X size={20} />
        </IconButton>
      </DialogTitle>

      <DialogContent className="ug-body" sx={{ p: 0, overflow: 'hidden' }}>
          {/* Sidebar / TOC */}
          <aside className="ug-sidebar">
            <div className="ug-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search the guide…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <nav className="ug-toc">
              {filteredTopics.length === 0 && (
                <div className="ug-empty">No matches</div>
              )}
              {filteredTopics.map((t) => {
                const TopicIcon = LucideIcons[t.icon] || BookOpen;
                return (
                  <button
                    key={t.id}
                    className={`ug-toc-item ${t.id === activeId ? 'active' : ''}`}
                    onClick={() => setActiveId(t.id)}
                  >
                    <TopicIcon size={16} />
                    <span>{t.title}</span>
                    <ChevronRight size={14} className="ug-toc-arrow" />
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <main className="ug-content" key={activeTopic.id}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {activeTopic.content
                .replace(/\{\{appName\}\}/g, appName)
                .replace(/\{\{advisorCount\}\}/g, String(advisorCount))
                .replace(/\{\{advisorList\}\}/g, advisorList)}
            </ReactMarkdown>
          </main>
      </DialogContent>
    </AppDialog>
  );
};

export default UserGuide;
