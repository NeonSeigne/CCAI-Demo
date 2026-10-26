import React, { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';

const ACCEPTED = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/plain': 'TXT',
};

const PlannerTranscriptStep = ({
  file,
  onFileChange,
  onBack,
  onStart,
  starting,
  error,
}) => {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState('');

  const validate = (next) => {
    if (!next) return 'Please choose a transcript file.';
    if (!ACCEPTED[next.type] && !/\.(pdf|docx|txt)$/i.test(next.name || '')) {
      return 'Only PDF, DOCX, and TXT files are supported.';
    }
    if (next.size > 10 * 1024 * 1024) {
      return 'File size must be less than 10MB.';
    }
    return '';
  };

  const handleFile = (next) => {
    const err = validate(next);
    setLocalError(err);
    if (!err) onFileChange(next);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const next = e.dataTransfer?.files?.[0];
    if (next) handleFile(next);
  };

  return (
    <div className="planner-step surface-card">
      <h2 className="planner-step-title">Upload your transcript</h2>
      <p className="planner-step-subtitle text-text-secondary">
        We’ll extract completed courses to see what’s left for your major and certificates.
      </p>

      <div
        className={`planner-dropzone ${dragActive ? 'is-active' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <Upload size={22} aria-hidden="true" />
        <div>
          <strong>Drop a PDF, DOCX, or TXT</strong>
          <div className="text-text-secondary">or click to browse</div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(e) => {
            const next = e.target.files?.[0];
            if (next) handleFile(next);
          }}
        />
      </div>

      {file && (
        <div className="planner-file-row">
          <FileText size={16} />
          <span className="planner-file-name">{file.name}</span>
          <button
            type="button"
            className="home-icon-btn"
            aria-label="Remove file"
            onClick={() => {
              onFileChange(null);
              setLocalError('');
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {(localError || error) && (
        <p className="planner-error">{localError || error}</p>
      )}

      <div className="planner-step-actions">
        <button type="button" className="home-btn-secondary" onClick={onBack} disabled={starting}>
          Back
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!file || starting}
          onClick={onStart}
        >
          {starting ? 'Starting…' : 'Start'}
        </button>
      </div>
    </div>
  );
};

export default PlannerTranscriptStep;
