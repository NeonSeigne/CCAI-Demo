import React from 'react';
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { AlertTriangle } from './icons';
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
        sx={{ textAlign: 'center' }}
      >
        <Box
          className="cc-confirm-icon"
          sx={{ color: isDanger ? 'var(--band-harder-text)' : 'var(--on-deep)' }}
        >
          <AlertTriangle size={24} />
        </Box>
        <Box component="span">{title}</Box>
      </DialogTitle>
      {message && (
        <DialogContent sx={{ pb: 2, textAlign: 'center' }}>
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
