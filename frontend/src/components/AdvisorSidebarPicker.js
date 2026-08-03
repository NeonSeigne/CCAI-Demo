import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { useAppConfig } from '../contexts/AppConfigContext';
import AppDialog from './AppDialog';

const AdvisorAvatarButton = ({
  advisorId,
  advisor,
  enabled,
  thinking,
  collapsed,
  onToggle,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const IconComponent = advisor.icon;

  useEffect(() => {
    setImageFailed(false);
  }, [advisor.avatarUrl]);

  const status = enabled ? 'in panel' : 'not in panel';

  return (
    <Tooltip
      title={`${advisor.name} · ${status}${thinking ? ' · thinking' : ''}`}
      placement={collapsed ? 'right' : 'top'}
    >
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <IconButton
          className="advisor-avatar-toggle"
          aria-label={`${enabled ? 'Remove' : 'Add'} ${advisor.name} ${
            enabled ? 'from' : 'to'
          } panel`}
          aria-pressed={enabled}
          onClick={() => onToggle(advisorId, !enabled)}
          sx={{
            p: 0.375,
            border: enabled
              ? '2px solid var(--ink)'
              : '2px solid var(--line)',
            opacity: enabled ? 1 : 0.45,
            transition: 'opacity 150ms ease, border-color 150ms ease',
            '&:hover': {
              bgcolor: 'transparent',
              opacity: enabled ? 0.86 : 0.7,
            },
          }}
        >
          <Avatar
            sx={{
              width: collapsed ? 34 : 38,
              height: collapsed ? 34 : 38,
              bgcolor: 'var(--paper-sunken)',
              color: 'var(--ink)',
            }}
          >
            {advisor.avatarUrl && !imageFailed ? (
              <Box
                component="img"
                src={advisor.avatarUrl}
                alt=""
                onError={() => setImageFailed(true)}
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <IconComponent size={collapsed ? 17 : 19} aria-hidden="true" />
            )}
          </Avatar>
        </IconButton>

        {enabled && (
          <Box
            className="advisor-selected-check"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              right: -1,
              bottom: -1,
              width: 15,
              height: 15,
              borderRadius: '50%',
              bgcolor: 'var(--ink)',
              color: 'var(--paper)',
              border: '2px solid var(--paper)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <CheckIcon sx={{ fontSize: 9 }} />
          </Box>
        )}

        {thinking && (
          <Box
            className="advisor-thinking-dot"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'var(--accent-blue)',
              border: '2px solid var(--paper)',
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>
    </Tooltip>
  );
};

const AdvisorSidebarPicker = ({
  thinkingAdvisors = [],
  collapsed = false,
  dialogInset = 0,
}) => {
  const {
    advisors,
    isAdvisorEnabled,
    setAdvisorEnabled,
  } = useAppConfig();
  const [pendingDisableId, setPendingDisableId] = useState(null);

  const advisorEntries = useMemo(
    () => Object.entries(advisors || {}),
    [advisors],
  );
  const enabledCount = advisorEntries.filter(([id]) =>
    isAdvisorEnabled(id),
  ).length;
  const thinkingSet = new Set(
    Array.isArray(thinkingAdvisors) ? thinkingAdvisors : [],
  );

  const handleToggle = (advisorId, nextEnabled) => {
    if (
      !nextEnabled &&
      enabledCount === 1 &&
      isAdvisorEnabled(advisorId)
    ) {
      setPendingDisableId(advisorId);
      return;
    }
    setAdvisorEnabled(advisorId, nextEnabled);
  };

  const pendingAdvisor = pendingDisableId
    ? advisors?.[pendingDisableId]
    : null;

  if (advisorEntries.length === 0) return null;

  return (
    <>
      <Box
        className="advisor-sidebar-picker"
        aria-label="Advisor panel"
        sx={{
          px: collapsed ? 0.75 : 1.5,
          pt: collapsed ? 1 : 1.5,
          pb: collapsed ? 1.25 : 1.75,
        }}
      >
        {!collapsed && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              mb: 1.25,
            }}
          >
            <Typography
              variant="overline"
              sx={{ color: 'var(--ink-soft)', lineHeight: 1.2 }}
            >
              Advisor panel
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {enabledCount} of {advisorEntries.length}
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            display: collapsed ? 'flex' : 'grid',
            flexDirection: collapsed ? 'column' : undefined,
            gridTemplateColumns: collapsed
              ? undefined
              : 'repeat(5, minmax(0, 1fr))',
            justifyItems: 'center',
            alignItems: 'center',
            gap: collapsed ? 0.75 : 1,
          }}
        >
          {advisorEntries.map(([id, advisor]) => (
            <AdvisorAvatarButton
              key={id}
              advisorId={id}
              advisor={advisor}
              enabled={isAdvisorEnabled(id)}
              thinking={thinkingSet.has(id)}
              collapsed={collapsed}
              onToggle={handleToggle}
            />
          ))}
        </Box>
      </Box>

      <AppDialog
        open={Boolean(pendingDisableId)}
        onClose={() => setPendingDisableId(null)}
        leftInset={dialogInset}
        maxWidth="xs"
        aria-labelledby="disable-final-advisor-title"
      >
        <DialogTitle id="disable-final-advisor-title">
          Disable your final advisor?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Removing {pendingAdvisor?.name || 'this advisor'} leaves your panel
            empty, so chat will not work until you add an advisor again.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDisableId(null)}>Keep advisor</Button>
          <Button
            color="error"
            onClick={() => {
              setAdvisorEnabled(pendingDisableId, false);
              setPendingDisableId(null);
            }}
          >
            Disable anyway
          </Button>
        </DialogActions>
      </AppDialog>
    </>
  );
};

export default AdvisorSidebarPicker;
