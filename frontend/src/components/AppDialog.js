import React, { forwardRef } from 'react';
import Dialog from '@mui/material/Dialog';

const AppDialog = forwardRef(function AppDialog(
  { leftInset = 0, slotProps, style, ...props },
  ref,
) {
  const inset = Math.max(0, Number(leftInset) || 0);
  const left = `${inset}px`;

  return (
    <Dialog
      ref={ref}
      {...props}
      style={{ ...style, left }}
      slotProps={{
        ...slotProps,
        backdrop: {
          ...slotProps?.backdrop,
          style: {
            ...slotProps?.backdrop?.style,
            left,
          },
        },
      }}
    />
  );
});

export default AppDialog;
