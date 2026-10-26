import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import { useNavigate } from 'react-router-dom';
import { useAppConfig } from '../contexts/AppConfigContext';
import muiTheme from '../theme/muiTheme';
import AppDialog from './AppDialog';
import AdvisorSidebarPicker from './AdvisorSidebarPicker';
import '../styles/Sidebar.css';

const EXPANDED_WIDTH = 300;
const COLLAPSED_WIDTH = 70;
const MOBILE_WIDTH = 280;

const Sidebar = ({
  user,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onSignOut,
  onOpenSettings,
  authToken,
  onSidebarToggle,
  isMobileOpen = false,
  onMobileToggle,
  refreshTrigger,
  onCurrentSessionDeleted,
  thinkingAdvisors = [],
  dialogInset = 0,
}) => {
  const navigate = useNavigate();
  const { config, hydrateAdvisorPreferences } = useAppConfig();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const hydratedTokenRef = useRef(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState(null);

  const canvasLabel = config?.app?.title ? `${config.app.title} Canvas` : 'Canvas';
  const showCollapsed = !isMobile && isCollapsed;
  const drawerWidth = isMobile
    ? MOBILE_WIDTH
    : showCollapsed
      ? COLLAPSED_WIDTH
      : EXPANDED_WIDTH;

  const fetchChatSessions = useCallback(async () => {
    if (!authToken) {
      setChatSessions([]);
      setIsLoading(false);
      return;
    }

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

      if (response.ok) {
        setChatSessions(await response.json());
      } else {
        console.error('Failed to fetch chat sessions');
      }
    } catch (error) {
      console.error('Error fetching chat sessions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchChatSessions();
  }, [fetchChatSessions]);

  useEffect(() => {
    onSidebarToggle?.(isCollapsed);
  }, [isCollapsed, onSidebarToggle]);

  useEffect(() => {
    if (!authToken) {
      hydratedTokenRef.current = null;
      return;
    }
    if (hydratedTokenRef.current === authToken) return;
    hydratedTokenRef.current = authToken;
    hydrateAdvisorPreferences();
  }, [authToken, hydrateAdvisorPreferences]);

  useEffect(() => {
    if (!currentSessionId || !authToken) return undefined;

    const timer = setTimeout(fetchChatSessions, 200);
    return () => clearTimeout(timer);
  }, [authToken, currentSessionId, fetchChatSessions]);

  useEffect(() => {
    if (refreshTrigger > 0 && authToken) {
      fetchChatSessions();
    }
  }, [authToken, fetchChatSessions, refreshTrigger]);

  const closeMobileDrawer = () => {
    if (isMobile) onMobileToggle?.(false);
  };

  const handleNewChat = async () => {
    setIsCreatingNewChat(true);
    try {
      await onNewChat();
      await fetchChatSessions();
      closeMobileDrawer();
    } catch (error) {
      console.error('Error creating new chat:', error);
    } finally {
      setIsCreatingNewChat(false);
    }
  };

  const handleSelectSession = (sessionId) => {
    onSelectSession(sessionId);
    closeMobileDrawer();
  };

  const handleCanvasNavigation = () => {
    closeMobileDrawer();
    navigate('/canvas');
  };

  const handleHomeNavigation = () => {
    closeMobileDrawer();
    navigate('/home');
  };

  const handleSearchNavigation = () => {
    closeMobileDrawer();
    navigate('/search');
  };

  const handleOpenSettings = () => {
    closeMobileDrawer();
    onOpenSettings();
  };

  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;

    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/chat-sessions/${sessionToDelete.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.ok) {
        setChatSessions((sessions) =>
          sessions.filter((session) => session.id !== sessionToDelete.id),
        );
        if (currentSessionId === sessionToDelete.id) {
          onCurrentSessionDeleted?.();
        }
      }
    } catch (error) {
      console.error('Error deleting chat session:', error);
    } finally {
      setSessionToDelete(null);
    }
  };

  const toggleSidebar = () => {
    setIsCollapsed((collapsed) => !collapsed);
    setAccountMenuAnchor(null);
  };

  const navItemSx = {
    minHeight: 40,
    px: showCollapsed ? 1 : 1.25,
    justifyContent: showCollapsed ? 'center' : 'flex-start',
    borderRadius: 2,
  };

  const drawerContent = (
    <Box
      className="sidebar-content"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minWidth: 0,
      }}
    >
      <Box
        className="sidebar-command-area"
        data-sidebar-region="commands"
        sx={{ flexShrink: 0, px: showCollapsed ? 0.75 : 1.5, pt: 1.25, pb: 1 }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: showCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: showCollapsed ? 'center' : 'space-between',
            minHeight: 42,
            gap: showCollapsed ? 0.5 : 1,
            mb: 0.75,
          }}
        >
          <Box
            component="a"
            href="https://neon.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-neon-link"
            title="Neon.ai"
            aria-label={showCollapsed ? 'Neon.ai' : undefined}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: 'var(--ink)',
              textDecoration: 'none',
              fontWeight: 700,
              minWidth: 0,
            }}
          >
            <Box
              component="img"
              src="/neon-logo.png"
              alt=""
              className="sidebar-neon-logo"
              sx={{ width: 24, height: 24, objectFit: 'contain' }}
            />
            {!showCollapsed && <span>Neon.ai</span>}
          </Box>

          <Tooltip
            title={
              isMobile
                ? 'Close sidebar'
                : showCollapsed
                  ? 'Expand sidebar'
                  : 'Collapse sidebar'
            }
            placement={showCollapsed ? 'right' : 'bottom'}
          >
            <IconButton
              aria-label={
                isMobile
                  ? 'Close sidebar'
                  : showCollapsed
                    ? 'Expand sidebar'
                    : 'Collapse sidebar'
              }
              size="small"
              onClick={
                isMobile ? () => onMobileToggle?.(false) : toggleSidebar
              }
            >
              {isMobile ? (
                <CloseIcon fontSize="small" />
              ) : (
                <ViewSidebarOutlinedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        <List disablePadding>
          <Tooltip title={showCollapsed ? 'New chat' : ''} placement="right">
            <span>
              <ListItemButton
                className="new-chat-button"
                onClick={handleNewChat}
                disabled={isCreatingNewChat}
                sx={{
                  ...navItemSx,
                  bgcolor: showCollapsed
                    ? 'var(--paper-sunken)'
                    : 'var(--bg-tertiary)',
                  mb: 0.25,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: showCollapsed ? 0 : 36,
                    color: 'inherit',
                    justifyContent: 'center',
                  }}
                >
                  {isCreatingNewChat ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <EditOutlinedIcon fontSize="small" />
                  )}
                </ListItemIcon>
                {!showCollapsed && (
                  <ListItemText
                    primary={isCreatingNewChat ? 'Creating…' : 'New chat'}
                    slotProps={{ primary: { variant: 'body2', fontWeight: 600 } }}
                  />
                )}
              </ListItemButton>
            </span>
          </Tooltip>

          <Tooltip title={showCollapsed ? 'Home' : ''} placement="right">
            <ListItemButton
              className="sidebar-home-button"
              onClick={handleHomeNavigation}
              sx={{ ...navItemSx, mb: 0.25 }}
            >
              <ListItemIcon
                sx={{
                  minWidth: showCollapsed ? 0 : 36,
                  color: 'inherit',
                  justifyContent: 'center',
                }}
              >
                <HomeOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {!showCollapsed && (
                <ListItemText
                  primary="Home"
                  slotProps={{ primary: { variant: 'body2', fontWeight: 500 } }}
                />
              )}
            </ListItemButton>
          </Tooltip>

          <Tooltip title={showCollapsed ? 'Search chats' : ''} placement="right">
            <ListItemButton
              className="sidebar-search"
              onClick={handleSearchNavigation}
              sx={{ ...navItemSx, mb: 0.25 }}
            >
              <ListItemIcon
                sx={{
                  minWidth: showCollapsed ? 0 : 36,
                  color: 'inherit',
                  justifyContent: 'center',
                }}
              >
                <SearchIcon fontSize="small" />
              </ListItemIcon>
              {!showCollapsed && (
                <ListItemText
                  primary="Search chats"
                  slotProps={{ primary: { variant: 'body2', fontWeight: 500 } }}
                />
              )}
            </ListItemButton>
          </Tooltip>

          <Tooltip title={showCollapsed ? canvasLabel : ''} placement="right">
            <ListItemButton
              className="sidebar-canvas-btn"
              onClick={handleCanvasNavigation}
              sx={{ ...navItemSx, mt: 0.25 }}
            >
              <ListItemIcon
                sx={{
                  minWidth: showCollapsed ? 0 : 36,
                  color: 'inherit',
                  justifyContent: 'center',
                }}
              >
                <DescriptionOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {!showCollapsed && (
                <ListItemText
                  primary={canvasLabel}
                  slotProps={{ primary: { variant: 'body2', fontWeight: 500 } }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        </List>
      </Box>

      <Divider />

      <Box
        className="sidebar-scroll-region"
        data-sidebar-region="scroll"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        <AdvisorSidebarPicker
          thinkingAdvisors={thinkingAdvisors}
          collapsed={showCollapsed}
          dialogInset={dialogInset}
        />

        <Divider />

        <Box
          className="chat-sessions"
          sx={{ display: showCollapsed ? 'none' : 'block', px: 1 }}
        >
          {!showCollapsed && (
            <Typography
              variant="overline"
              sx={{
                display: 'block',
                px: 0.75,
                pt: 1.5,
                pb: 0.75,
                color: 'var(--ink-soft)',
                lineHeight: 1.2,
              }}
            >
              Recent chats
            </Typography>
          )}

          {isLoading || isCreatingNewChat ? (
            <Box
              role="status"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                py: 4,
                color: 'var(--ink-soft)',
              }}
            >
              <CircularProgress size={20} color="inherit" />
              {!showCollapsed && (
                <Typography variant="body2">
                  {isCreatingNewChat ? 'Creating new chat…' : 'Loading chats…'}
                </Typography>
              )}
            </Box>
          ) : chatSessions.length === 0 ? (
            !showCollapsed && (
              <Typography
                align="center"
                variant="body2"
                color="text.secondary"
                sx={{ py: 4 }}
              >
                No chats yet
              </Typography>
            )
          ) : (
            <List className="sessions-list" disablePadding>
              {chatSessions.map((session) => (
                <Box
                  className="session-item"
                  key={session.id}
                  sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}
                >
                  <Tooltip
                    title={showCollapsed ? session.title : ''}
                    placement="right"
                    disableHoverListener={!showCollapsed}
                  >
                    <ListItemButton
                      selected={currentSessionId === session.id}
                      aria-current={
                        currentSessionId === session.id ? 'page' : undefined
                      }
                      onClick={() => handleSelectSession(session.id)}
                      sx={{
                        minWidth: 0,
                        minHeight: 40,
                        px: showCollapsed ? 1 : 1.25,
                        justifyContent: showCollapsed ? 'center' : 'flex-start',
                      }}
                    >
                      {!showCollapsed && (
                        <ListItemText
                          className="sidebar-session-title"
                          primary={session.title}
                          sx={{ minWidth: 0, my: 0 }}
                          slotProps={{
                            primary: {
                              noWrap: true,
                              fontSize: 14,
                              sx: {
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              },
                            },
                          }}
                        />
                      )}
                    </ListItemButton>
                  </Tooltip>
                  {!showCollapsed && (
                    <Tooltip title={`Delete ${session.title}`}>
                      <IconButton
                        className="session-menu-button"
                        aria-label={`Delete ${session.title}`}
                        color="error"
                        size="small"
                        onClick={() => setSessionToDelete(session)}
                      >
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              ))}
            </List>
          )}
        </Box>
      </Box>

      <Divider />

      <Box
        className="sidebar-account-footer"
        data-sidebar-region="account"
        sx={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: showCollapsed ? 'column' : 'row',
          alignItems: 'center',
          gap: showCollapsed ? 0.5 : 0.75,
          p: showCollapsed ? 0.75 : 1,
        }}
      >
        <Tooltip title={showCollapsed ? 'Account' : ''} placement="right">
          <ButtonBase
            className="sidebar-profile-button"
            aria-label="Open account menu"
            onClick={(event) => setAccountMenuAnchor(event.currentTarget)}
            sx={{
              flex: showCollapsed ? 'none' : 1,
              width: showCollapsed ? 42 : 'auto',
              minWidth: 0,
              justifyContent: showCollapsed ? 'center' : 'flex-start',
              gap: 1,
              p: 0.75,
              borderRadius: 2,
              textAlign: 'left',
              '&:hover': { bgcolor: 'var(--paper-sunken)' },
            }}
          >
            <Avatar
              sx={{
                width: 34,
                height: 34,
                bgcolor: 'var(--ink)',
                color: 'var(--paper)',
                fontSize: 14,
              }}
            >
              {user?.firstName?.[0] || <PersonOutlinedIcon fontSize="small" />}
            </Avatar>
            {!showCollapsed && (
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap variant="body2" fontWeight={600}>
                  {user?.firstName} {user?.lastName}
                </Typography>
                <Typography
                  noWrap
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', maxWidth: 160 }}
                >
                  {user?.email}
                </Typography>
              </Box>
            )}
          </ButtonBase>
        </Tooltip>

        <Tooltip title="Settings" placement={showCollapsed ? 'right' : 'top'}>
          <IconButton
            className="sidebar-settings-button"
            aria-label="Open settings"
            onClick={handleOpenSettings}
            size="small"
          >
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <>
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? isMobileOpen : true}
        onClose={() => onMobileToggle?.(false)}
        ModalProps={{ keepMounted: true }}
        slotProps={{
          paper: {
            className: `sidebar ${showCollapsed ? 'collapsed' : ''} ${
              isMobileOpen ? 'mobile-open' : ''
            }`,
          },
        }}
        sx={{
          width: 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            overflow: 'hidden',
            transition: muiTheme.transitions.create('width', {
              duration: muiTheme.transitions.duration.shorter,
            }),
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Menu
        anchorEl={accountMenuAnchor}
        open={Boolean(accountMenuAnchor)}
        onClose={() => setAccountMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setAccountMenuAnchor(null);
            onSignOut();
          }}
          sx={{ color: 'var(--accent-red)', gap: 1 }}
        >
          <LogoutIcon fontSize="small" />
          Sign out
        </MenuItem>
      </Menu>

      <AppDialog
        open={Boolean(sessionToDelete)}
        onClose={() => setSessionToDelete(null)}
        leftInset={dialogInset}
        maxWidth="xs"
        aria-labelledby="delete-chat-title"
      >
        <DialogTitle id="delete-chat-title">Delete this chat?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            “{sessionToDelete?.title}” will be permanently deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSessionToDelete(null)}>Cancel</Button>
          <Button color="error" onClick={handleDeleteSession}>
            Delete chat
          </Button>
        </DialogActions>
      </AppDialog>
    </>
  );
};

export default Sidebar;
