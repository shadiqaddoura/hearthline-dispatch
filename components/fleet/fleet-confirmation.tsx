"use client";
import type { ReactNode } from "react";
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle } from "@fluentui/react-components";
export function FleetConfirmation({ open, title, onClose, onConfirm, children, action, pending = false }: {
  open: boolean; title: string; onClose: () => void; onConfirm: () => void; children: ReactNode; action: string; pending?: boolean;
}) {
  return <Dialog open={open} onOpenChange={(_, d) => { if (!d.open && !pending) onClose(); }}><DialogSurface><DialogBody><DialogTitle>{title}</DialogTitle><DialogContent>{children}</DialogContent><DialogActions><Button disabled={pending} onClick={onClose}>Cancel</Button><Button appearance="primary" disabled={pending} onClick={onConfirm}>{pending ? "Deleting…" : action}</Button></DialogActions></DialogBody></DialogSurface></Dialog>;
}
