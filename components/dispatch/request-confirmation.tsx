"use client";
import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@fluentui/react-components";
export function RequestConfirmation({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Keep request",
  pending,
  blocked,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  blocked?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open && !pending) onCancel();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{children}</DialogContent>
          <DialogActions>
            <Button disabled={pending} onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button
              disabled={pending || blocked}
              appearance="primary"
              onClick={onConfirm}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
