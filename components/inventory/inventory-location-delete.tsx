"use client";

import { useRef, useState } from "react";
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { DeleteRegular } from "@fluentui/react-icons";
import type { InventoryLocationDto } from "@/lib/contracts/inventory";
import { fleetApi } from "@/lib/api/fleet";
import { inventoryApi } from "@/lib/api/inventory";

export function InventoryLocationDelete({ location, onDeleted, onRefresh }: {
  location: InventoryLocationDto;
  onDeleted: (name: string) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState("");
  const deleting = useRef(false);
  const kind = location.kind === "HUB" ? "warehouse" : "van";

  const remove = async () => {
    if (deleting.current) return;
    deleting.current = true;
    setPending(true);
    setProblem("");
    try {
      if (location.kind === "HUB") await inventoryApi.deleteWarehouse(location.locationId);
      else if (location.vanId) await fleetApi.remove(location.vanId);
      else throw new Error("This van is missing its Fleet record and cannot be deleted here.");
      setOpen(false);
      onDeleted(location.locationName);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The location was not deleted. Refresh and try again.");
      onRefresh();
    } finally {
      deleting.current = false;
      setPending(false);
    }
  };

  return <>
    <Button
      size="small"
      appearance="subtle"
      icon={<DeleteRegular />}
      aria-label={`Delete ${kind} ${location.locationName}`}
      title={`Delete ${kind}`}
      onClick={() => { setProblem(""); setOpen(true); }}
      disabled={pending}
    />
    <Dialog open={open} modalType="alert" onOpenChange={(_, data) => { if (!data.open && !pending) setOpen(false); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Delete {kind} {location.locationName}?</DialogTitle>
          <DialogContent>
            <p>Deletion is allowed only when there are no product stock lines or dependent records. Stock movements and other history are retained and will block deletion.</p>
            {problem && <MessageBar intent="error"><MessageBarBody>{problem}</MessageBarBody></MessageBar>}
          </DialogContent>
          <DialogActions>
            <Button disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button appearance="primary" disabled={pending} onClick={() => void remove()}>{pending ? "Deleting…" : "Delete location"}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  </>;
}
