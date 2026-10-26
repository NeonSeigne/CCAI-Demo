import React, { useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import TextSnippetOutlinedIcon from '@mui/icons-material/TextSnippetOutlined';

const ExportButton = ({ hasMessages = false, currentSessionId = null, authToken = null }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const [selectedType, setSelectedType] = useState('chat');

  const exportTypes = [
    {
      id: 'chat',
      name: 'Full Chat',
      description: 'Complete conversation history',
      endpoint: 'export-chat'
    },
    {
      id: 'summary',
      name: 'Chat Summary',
      description: 'AI-generated conversation summary',
      endpoint: 'chat-summary'
    }
  ];

  const exportFormats = [
    {
      id: 'txt',
      name: 'Text File',
      description: 'Plain text format (.txt)',
      icon: TextSnippetOutlinedIcon,
      extension: '.txt'
    },
    {
      id: 'docx',
      name: 'Word Document',
      description: 'Microsoft Word format (.docx)',
      icon: ArticleOutlinedIcon,
      extension: '.docx'
    },
    {
      id: 'pdf',
      name: 'PDF Document',
      description: 'Portable Document Format (.pdf)',
      icon: PictureAsPdfOutlinedIcon,
      extension: '.pdf'
    }
  ];

  const handleExportClick = (event) => {
    if (!hasMessages) return;
    setAnchorEl(event.currentTarget);
    setExportStatus(null);
  };

  const handleFormatSelect = async (format) => {
    setIsExporting(true);
    setAnchorEl(null);
    setExportStatus(null);

    try {
      const selectedTypeData = exportTypes.find(t => t.id === selectedType);
      const endpoint = selectedTypeData.endpoint;
      
      // Build the URL with session ID if available
      let url = `${process.env.REACT_APP_API_URL}/${endpoint}?format=${format}`;
      if (currentSessionId) {
        url += `&chat_session_id=${currentSessionId}`;
      }
      
      // Build headers - include auth token if available (needed for specific session export)
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (authToken && currentSessionId) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Export failed with status ${response.status}`);
      }

      // Get the filename from the Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${selectedType}_export.${format}`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const url_blob = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url_blob;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url_blob);

      setExportStatus('success');

    } catch (error) {
      console.error('Export error:', error);
      setExportStatus('error');
    } finally {
      setIsExporting(false);
    }
  };

  const getButtonTitle = () => {
    if (!hasMessages) return 'No messages to share';
    if (isExporting) return 'Exporting chat...';
    return 'Share or export chat';
  };

  return (
    <>
      <Tooltip title={getButtonTitle()}>
        <span>
          <IconButton
            aria-label="Share or export chat"
            aria-controls={anchorEl ? 'share-export-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={anchorEl ? 'true' : undefined}
            onClick={handleExportClick}
            disabled={!hasMessages || isExporting}
          >
            {isExporting ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              <ShareOutlinedIcon />
            )}
          </IconButton>
        </span>
      </Tooltip>

      <Menu
        id="share-export-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: 340,
              maxWidth: 'calc(100vw - 24px)',
              border: '1px solid var(--line)',
              boxShadow: 'var(--shadow-soft-md)',
            },
          },
        }}
      >
        <Box sx={{ px: 2, pt: 1, pb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Share or export
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {currentSessionId
              ? 'Download this saved conversation'
              : 'Download the current conversation'}
          </Typography>
        </Box>

        <Box sx={{ px: 2, pb: 2 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: 'block', mb: 0.75 }}
          >
            What to export
          </Typography>
          <ToggleButtonGroup
            value={selectedType}
            exclusive
            fullWidth
            size="small"
            onChange={(_, value) => value && setSelectedType(value)}
            aria-label="Export type"
          >
            {exportTypes.map((type) => (
              <ToggleButton key={type.id} value={type.id}>
                {type.name}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <Divider />
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: 'block', px: 2, pt: 1.5, pb: 0.5 }}
        >
          Format
        </Typography>
        {exportFormats.map((format) => {
          const Icon = format.icon;
          return (
            <MenuItem
              key={format.id}
              onClick={() => handleFormatSelect(format.id)}
              disabled={isExporting}
              sx={{ py: 1.25 }}
            >
              <ListItemIcon>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={format.name}
                secondary={format.description}
              />
              <Typography variant="caption" color="text.secondary">
                {format.extension}
              </Typography>
            </MenuItem>
          );
        })}
      </Menu>

      <Snackbar
        open={Boolean(exportStatus)}
        autoHideDuration={exportStatus === 'error' ? 5000 : 3000}
        onClose={() => setExportStatus(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={exportStatus === 'error' ? 'error' : 'success'}
          variant="filled"
          onClose={() => setExportStatus(null)}
        >
          {exportStatus === 'error'
            ? 'Export failed. Please try again.'
            : 'Chat exported successfully.'}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ExportButton;