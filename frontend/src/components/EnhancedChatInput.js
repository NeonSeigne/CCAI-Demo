import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Popover } from '@mui/material';
import { ArrowUp, Plus, Paperclip, FileText, X, Trash2, Mic, MicOff, MessageCircle, ClipboardList, Loader2, CalendarDays, Icon } from './icons';
import FileUpload from './FileUpload';
import { attachmentLabel } from '../contexts/ChatContext';

const EnhancedChatInput = ({ 
  onSendMessage, 
  onFileUploaded,
  uploadedDocuments = [],
  isLoading,
  currentChatSessionId,
  authToken, 
  placeholder = "Ask about courses, events or places",
  showProfileButtons = false,
  onOpenOnboarding,
  onOpenProfileForm,
  ensureSessionId,
  initialMessage = '',
  messageValue,
  onMessageChange,
  isLanding = false,
  // One-row pill (+, text, mic, send).
  compact = false,
  onInvokeSkill,
  activeSkills = [],
  onDismissSkill,
  // Course, event and place chips; each is sent as a line before the message.
  attachments = [],
  onRemoveAttachment,
  // What Ask looks through, as a chip beside +. The dock leaves it out.
  showScope = true,
}) => {
  const [inputMessage, setInputMessage] = useState(initialMessage || '');
  const [showUpload, setShowUpload] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const textareaRef = useRef(null);
  const uploadRef = useRef(null);
  const plusBtnRef = useRef(null);
  const appliedInitialRef = useRef('');
  const [plusAnchorEl, setPlusAnchorEl] = useState(null);

  useEffect(() => {
    if (typeof messageValue === 'string' && messageValue !== inputMessage) {
      setInputMessage(messageValue);
    }
  }, [messageValue, inputMessage]);

  useEffect(() => {
    if (!initialMessage || initialMessage === appliedInitialRef.current) return;
    appliedInitialRef.current = initialMessage;
    setInputMessage(initialMessage);
  }, [initialMessage]);

  const sendForTranscription = useCallback(async (blob) => {
    if (!blob || blob.size < 100) {
      console.warn('STT: blob too small, skipping', blob?.size);
      return;
    }
    setIsTranscribing(true);
    try {
      const form = new FormData();
      form.append('audio', blob, 'recording.webm');
      const token = authToken || localStorage.getItem('authToken');
      const resp = await fetch(`${process.env.REACT_APP_API_URL}/voice/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form,
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data?.text?.trim();
        if (text) {
          setInputMessage(prev => prev ? `${prev} ${text}` : text);
        }
      } else {
        console.error('STT response not ok:', resp.status, await resp.text().catch(() => ''));
      }
    } catch (err) {
      console.error('Transcription failed:', err);
    } finally {
      setIsTranscribing(false);
    }
  }, [authToken]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick a supported mimeType
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', '']
        .find(mt => mt === '' || MediaRecorder.isTypeSupported(mt));
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);

      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blobType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: blobType });
        sendForTranscription(blob);
      };
      mediaRecorderRef.current = mediaRecorder;
      // Request data every 500ms so chunks are available when stop() fires
      mediaRecorder.start(500);
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access error:', err);
    }
  }, [isRecording, sendForTranscription]);

  const handleSend = () => {
    if (!inputMessage.trim() || isLoading || isUploading) return;
    
    onSendMessage(inputMessage);
    setInputMessage('');
    onMessageChange?.('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUploaded = (file, response) => {
    setIsUploading(false);
    setShowUpload(false);
    
    if (onFileUploaded) {
      onFileUploaded(file, response);
    }
  };

  const handleUploadStart = () => {
    setIsUploading(true);
  };

  const openUploadPanel = () => {
    if (!isUploading) {
      setShowUpload(true);
      setShowDocuments(false);
      setPlusAnchorEl(null);
    }
  };

  const toggleDocuments = () => {
    setShowDocuments(!showDocuments);
    setShowUpload(false);
  };

  const handleInvokeSkill = (skillId) => {
    setPlusAnchorEl(null);
    setShowUpload(false);
    onInvokeSkill?.(skillId);
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [inputMessage]);

  // Close upload panel when clicking outside
  useEffect(() => {
    if (!showUpload) return;
    const handleClickOutside = (e) => {
      if (
        uploadRef.current && !uploadRef.current.contains(e.target) &&
        plusBtnRef.current && !plusBtnRef.current.contains(e.target)
      ) {
        setShowUpload(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUpload]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type) => {
    if (type.includes('word') || type.includes('document')) return 'draft';
    return 'description';
  };

  const formatUploadTime = (date) => {
    return new Date(date).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isDisabled = isLoading || isUploading;
  const canSend = inputMessage.trim() && !isDisabled;

  const updateMessage = (value) => {
    setInputMessage(value);
    onMessageChange?.(value);
  };

  return (
    <div className={`enhanced-chat-input-container cc-composer ${isLanding ? 'landing-composer' : ''} ${compact ? 'compact-composer' : ''}`}>
      {/* File Upload Area */}
      {showUpload && (
        <div className="floating-upload-section" ref={uploadRef}>
          <FileUpload 
            onFileUploaded={handleFileUploaded}
            isUploading={isUploading}
            currentChatSessionId={currentChatSessionId}  
            authToken={authToken}
            onUploadStart={handleUploadStart}
            ensureSessionId={ensureSessionId}
          />
        </div>
      )}

      {/* Documents Viewer Panel */}
      {showDocuments && (
        <div className="floating-documents-section">
          <div className="documents-header">
            <div className="documents-title">
              <FileText size={16} />
              <span>Uploaded Documents ({uploadedDocuments.length})</span>
            </div>
            <button 
              onClick={() => setShowDocuments(false)}
              className="close-documents-btn"
            >
              <X size={16} />
            </button>
          </div>
          
          <div className="documents-list">
            {uploadedDocuments.length === 0 ? (
              <div className="no-documents">
                <FileText size={24} />
                <p>No documents uploaded yet</p>
                <span>Upload documents to reference them in your conversations</span>
              </div>
            ) : (
              uploadedDocuments.map((doc) => (
                <div key={doc.id} className="document-item">
                  <div className="document-icon">
                    <Icon name={getFileIcon(doc.type)} size={20} />
                  </div>
                  <div className="document-info">
                    <div className="document-name">{doc.name}</div>
                    <div className="document-details">
                      {formatFileSize(doc.size)} • {formatUploadTime(doc.uploadTime)}
                    </div>
                  </div>
                  <div className="document-actions">
                    <button 
                      className="document-action-btn"
                      title="Remove document"
                      onClick={() => {
                        // TODO: Implement remove functionality
                        console.log('Remove document:', doc.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="composer-attachments" aria-label="Attached">
          {attachments.map((item) => {
            const label = attachmentLabel(item);
            return (
              <li key={`${item.type}:${item.id}`} className="composer-skill-pill composer-attachment">
                <span>{label}</span>
                <button
                  type="button"
                  className="composer-attachment-remove"
                  onClick={() => onRemoveAttachment?.(item)}
                  aria-label={`Remove ${label}`}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Main Input Box */}
      <div className="floating-input-box">
        {/* Text Input Row */}
        <div className="text-input-row">
          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={(e) => updateMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            className="main-textarea"
            disabled={isDisabled}
            rows={1}
          />
        </div>

        {/* Controls Row */}
        <div className="controls-row">
          {/* Left - File Controls */}
          <div className="file-controls">
            <button
              ref={plusBtnRef}
              onClick={(event) => setPlusAnchorEl(event.currentTarget)}
              className={`composer-plus-btn ${showUpload || Boolean(plusAnchorEl) ? 'active' : ''}`}
              disabled={isUploading}
              type="button"
              aria-haspopup="menu"
              aria-expanded={Boolean(plusAnchorEl)}
              title="Add documents or skills"
              aria-label="Add documents or skills"
            >
              <Plus size={22} />
            </button>
            <Popover
              open={Boolean(plusAnchorEl)}
              anchorEl={plusAnchorEl}
              onClose={() => setPlusAnchorEl(null)}
              anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
              transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              slotProps={{ paper: { className: 'composer-plus-popover' } }}
            >
              <div className="composer-plus-menu" role="menu">
                <button
                  type="button"
                  className="composer-plus-item"
                  role="menuitem"
                  onClick={openUploadPanel}
                  disabled={isUploading}
                >
                  <Paperclip size={21} />
                  <span>Upload documents</span>
                </button>
                {/* Skills show only when the page can run them. */}
                {onInvokeSkill && (
                  <>
                    <div className="composer-plus-section-label">Skills</div>
                    <button
                      type="button"
                      className="composer-plus-item"
                      role="menuitem"
                      onClick={() => handleInvokeSkill('plan_semester')}
                    >
                      <CalendarDays size={21} />
                      <span>Plan my Semester</span>
                    </button>
                  </>
                )}
              </div>
            </Popover>

            {showScope && (
              <span className="composer-scope">
                <Icon name="school" size={18} />
                Courses, events and places
              </span>
            )}

            {uploadedDocuments.length > 0 && (
              <button
                onClick={toggleDocuments}
                className={`view-docs-btn ${showDocuments ? 'active' : ''}`}
                type="button"
                title={`View ${uploadedDocuments.length} uploaded document${uploadedDocuments.length !== 1 ? 's' : ''}`}
              >
                <FileText size={18} />
                <span className="docs-count">{uploadedDocuments.length}</span>
              </button>
            )}

            {showProfileButtons && (
              <>
                <button
                  onClick={onOpenOnboarding}
                  className="add-docs-btn"
                  type="button"
                >
                  <MessageCircle size={16} />
                  <span>Tell us about yourself</span>
                </button>
                <button
                  onClick={onOpenProfileForm}
                  className="add-docs-btn"
                  type="button"
                >
                  <ClipboardList size={16} />
                  <span>Fill out profile form</span>
                </button>
              </>
            )}

          </div>

          {/* Right - Mic + Send */}
          <div className="composer-end">
            <button
              onClick={toggleRecording}
              disabled={isTranscribing}
              className={`mic-button ${isRecording ? 'listening' : ''} ${isTranscribing ? 'transcribing' : ''}`.trim()}
              type="button"
              title={isTranscribing ? 'Transcribing...' : isRecording ? 'Stop recording' : 'Voice input'}
              aria-label={isTranscribing ? 'Transcribing' : isRecording ? 'Stop recording' : 'Voice input'}
            >
              {isTranscribing ? <Loader2 size={22} className="spinning" /> : isRecording ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={`send-button ${canSend ? 'enabled' : 'disabled'}`}
              type="button"
              aria-label="Send"
            >
              <ArrowUp size={22} />
            </button>
          </div>
        </div>
      </div>

      {activeSkills.length > 0 && (
        <div className="composer-active-skills" aria-label="Active skills">
          {activeSkills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              className="composer-skill-pill pill-active"
              onClick={() => onDismissSkill?.(skill.id)}
              title={`Dismiss ${skill.label}`}
            >
              <span>{skill.label}</span>
              <X size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EnhancedChatInput;
