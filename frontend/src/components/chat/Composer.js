import React, {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Popover } from '@mui/material';
import {
  ArrowUp, Plus, Paperclip, FileText, X, Trash2, Mic, MicOff, Loader2, Icon,
} from '../icons';
import FileUpload from '../FileUpload';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { attachmentLabel, useChat } from '../../contexts/ChatContext';
import { useChatDock } from '../../contexts/ChatDockContext';
import { chatPlaceholder } from '../../utils/messageGroups';
import '../../styles/Composer.css';

/**
 * The chat box, bound to the one chat: `<Composer surface="home|chat|dock" />`.
 *
 * The surface decides the +, the mic, the scope chip and the placeholder
 * (ask-home.html, ask-chat.html, events.html). Home sends by opening the
 * chat page with the question; the chat page and the dock send to the chat.
 * Focus requests (useAsk) arrive through the dock state, so whichever
 * composer is on screen takes them.
 *
 * `prefill` ({ text } or { upload: true }) puts text in the box without
 * sending it, or opens the upload panel. `placeholder` overrides the
 * surface's wording.
 */
export const SURFACES = {
  home: { plus: true, mic: true, scope: true },
  chat: { plus: true, mic: true, scope: true },
  dock: { plus: true, mic: false, scope: false },
};

const DEFAULT_PLACEHOLDER = 'Ask about courses, events or places';
const NO_CHAT = { messages: [], attachments: [], uploadedDocuments: [], sessionEpoch: 0 };
export const FOLLOW_UP_PLACEHOLDER = 'Ask a follow-up';

/**
 * The placeholder each surface shows: home the first starter ("Try …"); the
 * chat page "Ask a follow-up" once a conversation is under way; the dock the
 * page's wording (`page`) when it has one.
 */
export function composerPlaceholder(surface, config, { followUp = false, page = null } = {}) {
  if (surface === 'home') {
    const first = config?.homepage?.starters?.[0]?.prompts?.[0];
    return first ? `Try “${first}”` : DEFAULT_PLACEHOLDER;
  }
  if (surface === 'chat' && followUp) return FOLLOW_UP_PLACEHOLDER;
  if (surface === 'dock' && page) return page;
  return chatPlaceholder(config);
}

/** ask(text): open the chat page and send `text` there in a fresh chat. */
export function useAskOnChatPage() {
  const navigate = useNavigate();
  return useCallback((text) => {
    const prompt = (text || '').trim();
    if (!prompt) return false;
    navigate('/chat', { state: { startNew: true, pendingPrompt: prompt, autoSend: true } });
    return true;
  }, [navigate]);
}

/** Take focus requests from useAsk while this composer is on screen. */
function useFocusRequests(textareaRef, enabled) {
  const dock = useChatDock();
  const claim = dock?.claimComposerFocus;
  useEffect(() => {
    if (enabled && claim?.()) textareaRef.current?.focus();
  }, [enabled, claim, textareaRef]);
}

/** Voice input: records, then appends the transcript to the box. */
function useVoiceInput(authToken, onText) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

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
        if (text) onText(text);
      } else {
        console.error('STT response not ok:', resp.status, await resp.text().catch(() => ''));
      }
    } catch (err) {
      console.error('Transcription failed:', err);
    } finally {
      setIsTranscribing(false);
    }
  }, [authToken, onText]);

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
        .find((mt) => mt === '' || MediaRecorder.isTypeSupported(mt));
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);

      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
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

  return { isRecording, isTranscribing, toggleRecording };
}

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

const formatUploadTime = (date) => new Date(date).toLocaleString([], {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function DocumentsPanel({ documents, onClose }) {
  return (
    <div className="floating-documents-section">
      <div className="documents-header">
        <div className="documents-title">
          <FileText size={16} />
          <span>Uploaded Documents ({documents.length})</span>
        </div>
        <button
          onClick={onClose}
          className="close-documents-btn"
        >
          <X size={16} />
        </button>
      </div>

      <div className="documents-list">
        {documents.length === 0 ? (
          <div className="no-documents">
            <FileText size={24} />
            <p>No documents uploaded yet</p>
          </div>
        ) : (
          documents.map((doc) => (
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
  );
}

/** The composer card: text on top; +, scope, docs, mic and send below. */
function ChatComposer({ surface, prefill, placeholder }) {
  // Pages rendered on their own (tests) may have no chat: home needs none to ask.
  const chat = useChat() || NO_CHAT;
  const dock = useChatDock();
  const navigate = useNavigate();
  const askOnChatPage = useAskOnChatPage();
  const { config } = useAppConfig();
  const { authToken } = useAuth();
  const features = SURFACES[surface] || SURFACES.chat;
  const onHome = surface === 'home';
  const {
    uploadedDocuments = [], attachments = [], sessionEpoch, messages = [],
  } = chat;
  // Home starts a new chat, so an answer streaming elsewhere doesn't hold it.
  const isLoading = onHome ? false : chat.isLoading;
  const followUp = messages.some((message) => message.type === 'user');
  // The dock closes and opens again; its text stays for the same conversation.
  const draftRef = surface === 'dock' ? dock?.draftRef : null;

  const [inputMessage, setInputMessage] = useState(() => {
    const saved = draftRef?.current;
    return saved && saved.epoch === sessionEpoch ? saved.text : '';
  });
  const [showUpload, setShowUpload] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [plusAnchorEl, setPlusAnchorEl] = useState(null);
  const textareaRef = useRef(null);
  const uploadRef = useRef(null);
  const plusBtnRef = useRef(null);
  const epochRef = useRef(sessionEpoch);

  const appendText = useCallback((text) => setInputMessage((prev) => (prev ? `${prev} ${text}` : text)), []);
  const { isRecording, isTranscribing, toggleRecording } = useVoiceInput(authToken, appendText);

  useFocusRequests(textareaRef, true);

  // New chat or another session replaced the conversation: clear the draft.
  useLayoutEffect(() => {
    if (epochRef.current === sessionEpoch) return;
    epochRef.current = sessionEpoch;
    setInputMessage('');
  }, [sessionEpoch]);

  useEffect(() => {
    if (typeof prefill?.text === 'string') setInputMessage(prefill.text);
    if (prefill?.upload) setShowUpload(true);
  }, [prefill]);

  useEffect(() => {
    if (draftRef) draftRef.current = { text: inputMessage, epoch: sessionEpoch };
  }, [draftRef, inputMessage, sessionEpoch]);

  const handleSend = () => {
    if (!inputMessage.trim() || isLoading || isUploading) return;
    if (onHome) askOnChatPage(inputMessage);
    else chat.send(inputMessage);
    setInputMessage('');
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
    chat.addDocument(file, response);
  };

  const openUploadPanel = () => {
    if (onHome) {
      // Documents belong to a conversation: start one on the chat page.
      setPlusAnchorEl(null);
      navigate('/chat', { state: { startNew: true, openUpload: true } });
      return;
    }
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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [inputMessage]);

  // Close upload panel when clicking outside
  useEffect(() => {
    if (!showUpload) return undefined;
    const handleClickOutside = (e) => {
      if (
        uploadRef.current && !uploadRef.current.contains(e.target)
        && plusBtnRef.current && !plusBtnRef.current.contains(e.target)
      ) {
        setShowUpload(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUpload]);

  const isDisabled = isLoading || isUploading;
  const canSend = inputMessage.trim() && !isDisabled;

  return (
    <div className={`enhanced-chat-input-container cc-composer is-${surface}`}>
      {showUpload && (
        <div className="floating-upload-section" ref={uploadRef}>
          <FileUpload
            onFileUploaded={handleFileUploaded}
            isUploading={isUploading}
            currentChatSessionId={chat.sessionId}
            authToken={authToken}
            onUploadStart={() => setIsUploading(true)}
          />
        </div>
      )}

      {showDocuments && (
        <DocumentsPanel documents={uploadedDocuments} onClose={() => setShowDocuments(false)} />
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
                  onClick={() => chat.removeAttachment(item)}
                  aria-label={`Remove ${label}`}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="floating-input-box">
        <div className="text-input-row">
          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder || composerPlaceholder(surface, config, { followUp, page: dock?.placeholder })}
            aria-label="Message"
            className="main-textarea"
            disabled={isDisabled}
            rows={1}
          />
        </div>

        <div className="controls-row">
          <div className="file-controls">
            {features.plus && (
              <>
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
                  </div>
                </Popover>
              </>
            )}

            {features.scope && (
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
          </div>

          <div className="composer-end">
            {features.mic && (
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
            )}
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
    </div>
  );
}

export default function Composer({ surface = 'chat', prefill, placeholder }) {
  return <ChatComposer surface={surface} prefill={prefill} placeholder={placeholder} />;
}
