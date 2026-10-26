import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  CircularProgress,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import { useAuth } from '../contexts/AuthContext';

const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = Math.abs(now - date);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    if (diffMins <= 1) return 'Just now';
    return `${diffMins} minutes ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffDays === 1) return 'Today';
  if (diffDays === 2) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays - 1} days ago`;
  return date.toLocaleDateString();
};

const ChatSearchPage = () => {
  const navigate = useNavigate();
  const { authToken } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!authToken) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchSessions = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/chat-sessions`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          },
        );
        if (response.ok && !cancelled) {
          setSessions(await response.json());
        }
      } catch (error) {
        console.error('Error fetching chat sessions:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchSessions();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const filteredSessions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) =>
      session.title.toLowerCase().includes(query),
    );
  }, [searchTerm, sessions]);

  const handleSelectSession = (sessionId) => {
    navigate('/chat', { state: { sessionId } });
  };

  return (
    <Box
      className="chat-search-page"
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--paper-sunken)',
      }}
    >
        <AppBar position="static" color="transparent" elevation={0}>
          <Toolbar sx={{ gap: 1, borderBottom: '1px solid var(--line)' }}>
            <IconButton
              edge="start"
              aria-label="Back to chat"
              onClick={() => navigate('/chat')}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography component="h1" variant="h6" fontWeight={700} noWrap>
              Search chats
            </Typography>
          </Toolbar>
        </AppBar>

        <Box
          sx={{
            width: '100%',
            maxWidth: 720,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            py: 3,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <TextField
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search your chats"
            size="small"
            fullWidth
            autoFocus
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
              htmlInput: { 'aria-label': 'Search your chats' },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                background: 'var(--paper)',
                borderRadius: 2,
              },
            }}
          />

          {isLoading ? (
            <Box
              role="status"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                py: 8,
                color: 'var(--ink-soft)',
              }}
            >
              <CircularProgress size={22} color="inherit" />
              <Typography variant="body2">Loading chats…</Typography>
            </Box>
          ) : filteredSessions.length === 0 ? (
            <Typography
              align="center"
              variant="body2"
              color="text.secondary"
              sx={{ py: 8 }}
            >
              {searchTerm.trim() ? 'No chats found' : 'No chats yet'}
            </Typography>
          ) : (
            <List
              disablePadding
              sx={{
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              {filteredSessions.map((session, index) => (
                <ListItemButton
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  divider={index < filteredSessions.length - 1}
                  sx={{
                    px: 2,
                    py: 1.5,
                    alignItems: 'flex-start',
                  }}
                >
                  <ListItemText
                    primary={session.title}
                    secondary={`${formatRelativeTime(session.updated_at)} · ${session.message_count} messages`}
                    slotProps={{
                      primary: {
                        noWrap: true,
                        fontWeight: 600,
                        sx: {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        },
                      },
                      secondary: {
                        noWrap: true,
                      },
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
    </Box>
  );
};

export default ChatSearchPage;
