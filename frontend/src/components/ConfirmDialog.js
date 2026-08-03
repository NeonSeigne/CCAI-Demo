import React from 'react';
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { AlertTriangle } from 'lucide-react';
import AppDialog from './AppDialog';

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  tone = 'default',
  leftInset = 0,
}) => {
  const isDanger = tone === 'danger';

  return (
    <AppDialog
      open={isOpen}
      onClose={onCancel}
      leftInset={leftInset}
      maxWidth="xs"
      aria-labelledby="app-confirm-dialog-title"
    >
      <DialogTitle
        id="app-confirm-dialog-title"
        component="div"
        sx={{ pt: 3, textAlign: 'center' }}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            mx: 'auto',
            mb: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'var(--paper-sunken)',
            color: isDanger ? 'var(--accent-red)' : 'var(--ink-soft)',
          }}
        >
          <AlertTriangle size={22} />
        </Box>
        <Box component="span">{title}</Box>
      </DialogTitle>
      {message && (
        <DialogContent sx={{ pt: 0, pb: 2, textAlign: 'center' }}>
          <DialogContentText>{message}</DialogContentText>
        </DialogContent>
      )}
      <DialogActions sx={{ justifyContent: 'center' }}>
        <Button variant="outlined" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          color={isDanger ? 'error' : 'primary'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </AppDialog>
  );
};

export default ConfirmDialog;
