import React, { forwardRef, useLayoutEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';

const px = (value) => Math.max(0, Number(value) || 0);

/**
 * The container's left and right edges as viewport insets, kept current
 * while open. The dialog stays fixed to the viewport, so it and its scrim
 * cover exactly the page column (between the rail and the chat dock).
 */
function useContainerInsets(container, open) {
  const [insets, setInsets] = useState({ left: 0, right: 0 });

  useLayoutEffect(() => {
    if (!open || !(container instanceof Element)) return undefined;
    const measure = () => {
      const rect = container.getBoundingClientRect();
      const left = px(rect.left);
      const right = rect.width ? px(window.innerWidth - rect.right) : 0;
      setInsets((current) => (current.left === left && current.right === right
        ? current
        : { left, right }));
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(container);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [container, open]);

  return insets;
}

/**
 * MUI Dialog with its scrim kept off the rail and the dock (design D3, eng
 * R10, R15).
 *
 * - `leftInset` / `rightInset`: pixels the dialog and scrim stop short of.
 * - `container`: render into that element (usePageColumn()), so MUI hides
 *   only its other children from screen readers and the rail and dock stay
 *   live. The insets then follow the container's edges, and the dialog
 *   defaults to `disableEnforceFocus` and `aria-modal="false"`, so Tab can
 *   reach the dock. Escape closes and focus returns to the trigger as usual.
 */
const AppDialog = forwardRef(function AppDialog(
  {
    leftInset = 0, rightInset = 0, container, slotProps, style, ...props
  },
  ref,
) {
  const edges = useContainerInsets(container, props.open);
  const left = `${Math.max(px(leftInset), edges.left)}px`;
  const right = `${Math.max(px(rightInset), edges.right)}px`;
  const inColumn = Boolean(container);

  return (
    <Dialog
      ref={ref}
      {...(inColumn ? { container, disableEnforceFocus: true, 'aria-modal': 'false' } : {})}
      {...props}
      style={{ ...style, left, right }}
      slotProps={{
        ...slotProps,
        backdrop: {
          ...slotProps?.backdrop,
          style: {
            ...slotProps?.backdrop?.style,
            left,
            right,
          },
        },
      }}
    />
  );
});

export default AppDialog;
