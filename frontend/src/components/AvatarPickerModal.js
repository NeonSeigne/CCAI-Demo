import React from 'react';
import {
  Box,
  Button,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material';
import { X } from 'lucide-react';
import { useAppConfig } from '../contexts/AppConfigContext';
import AppDialog from './AppDialog';

const API = process.env.REACT_APP_API_URL || '';

const BUNDLED = [
  'advisor1.png','advisor2.png','advisor3.png','advisor4.png',
  'advisor5.png','advisor6.png','advisor7.png',
];

const AvatarPickerModal = ({
  advisorId,
  advisorName,
  onClose,
  leftInset = 0,
}) => {
  const { setAdvisorAvatar } = useAppConfig();

  const select = (url) => {
    setAdvisorAvatar(advisorId, url || '');
    onClose();
  };

  return (
    <AppDialog
      open
      onClose={onClose}
      leftInset={leftInset}
      maxWidth="sm"
      aria-labelledby="avatar-picker-title"
    >
      <DialogTitle
        id="avatar-picker-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        Choose Avatar — {advisorName}
        <IconButton onClick={onClose} aria-label="Close avatar picker" size="small">
          <X size={20} />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography
          variant="caption"
          sx={{ display: 'block', mb: 1.25, color: 'var(--ink-soft)', fontWeight: 600 }}
        >
          Pre-made Avatars
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 1,
            mb: 2.5,
          }}
        >
          {BUNDLED.map((file) => (
            <Box
              component="button"
              type="button"
              key={file}
              onClick={() => select(`${API}/api/avatars/bundled/${file}`)}
              aria-label={`Use ${file.replace('.png', '')}`}
              sx={{
                p: 0,
                border: '2px solid transparent',
                borderRadius: '50%',
                background: 'transparent',
                cursor: 'pointer',
                lineHeight: 0,
                '&:hover, &:focus-visible': { borderColor: 'var(--ink)' },
              }}
            >
              <Box
                component="img"
                src={`${API}/api/avatars/bundled/${file}`}
                alt=""
                sx={{
                  display: 'block',
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            </Box>
          ))}
        </Box>

        <Button
          variant="outlined"
          color="inherit"
          onClick={() => select(null)}
          startIcon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          }
        >
          Use default icon
        </Button>
      </DialogContent>
    </AppDialog>
  );
};

export default AvatarPickerModal;
