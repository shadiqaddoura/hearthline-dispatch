"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button, Field, Input, Select, Textarea, Text, MessageBar, MessageBarBody, Spinner } from "@fluentui/react-components";
import { createVanRequest, updateVanRequest, type VanDto, type TechnicianDto } from "@/lib/contracts/fleet";
import { fleetApi } from "@/lib/api/fleet";
import { FleetSheet } from "./fleet-sheet";
import { FleetConfirmation } from "./fleet-confirmation";

export function FleetForm({ van, technicians, open, onClose, onSaved, onRefresh }: {
  van: VanDto | null; technicians: TechnicianDto[]; open: boolean; onClose: () => void; onSaved: (van: VanDto) => void; onRefresh: () => void;
}) {
  const [initial] = useState(() => ({ code: van?.code ?? "", plate: van?.plate ?? "", zone: van?.zone ?? "", status: van?.status ?? "ACTIVE", statusNote: van?.statusNote ?? "", technicianId: van?.technician?.id ?? "" }));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => {
    if (!dirty || !open) return;
    const prevent = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, open]);
  const close = () => { if (!inFlight.current) { if (dirty) setDiscard(true); else onClose(); } };
  const change = (field: keyof typeof values, value: string) => { setValues(v => ({ ...v, [field]: value })); setErrors(e => ({ ...e, [field]: "" })); };
  const save = async () => {
    if (inFlight.current) return;
    const input = { code: values.code, plate: values.plate.trim() || null, zone: values.zone.trim() || null, status: values.status, statusNote: values.statusNote.trim() || null };
    // Only send changed fields on edit, including the driver: avoid overwriting a concurrent handover.
    const patch = { ...Object.fromEntries(Object.entries(input).filter(([key, value]) => value !== (key === "code" || key === "status" ? initial[key] : initial[key as "plate" | "zone" | "statusNote"].trim() || null))), ...(values.technicianId !== initial.technicianId ? { technicianId: values.technicianId || null } : {}), updatedBy: "Demo dispatcher" };
    const parsed = van ? updateVanRequest.safeParse(patch) : createVanRequest.safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0] ?? "form"), i.message])));
      setProblem(parsed.error.issues.map(i => i.message).join(". "));
      requestAnimationFrame(() => (formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? problemRef.current)?.focus());
      return;
    }
    inFlight.current = true; setPending(true); setProblem("");
    try { onSaved(van ? await fleetApi.update(van.id, updateVanRequest.parse(patch)) : await fleetApi.create(createVanRequest.parse(input))); }
    catch (e) { setProblem(`${e instanceof Error ? e.message : "Unable to confirm save."} Check the refreshed list before retrying.`); onRefresh(); requestAnimationFrame(() => problemRef.current?.focus()); }
    finally { inFlight.current = false; setPending(false); }
  };
  return <>
    <FleetSheet title={van ? `Edit ${van.code}` : "Add van"} open={open} onClose={close} busy={pending} footer={<><Button disabled={pending} onClick={close}>Cancel</Button><Button appearance="primary" type="submit" form={id} disabled={pending || (!!van && !dirty)}>{pending ? "Saving…" : van ? "Save changes" : "Add van"}</Button></>}>
      <Text>{van ? "Driver changes leave physical stock on its van. Assigned jobs pass to the new driver; in-progress jobs keep their on-site technician." : "A new van starts without stock or equipment. Assign a technician after creating it."}</Text>
      <div ref={problemRef} tabIndex={-1}>{problem && <MessageBar intent="error"><MessageBarBody>{problem}</MessageBarBody></MessageBar>}</div>
      <form id={id} ref={formRef} onSubmit={e => { e.preventDefault(); void save(); }} noValidate style={{ display: "grid", gap: 20 }}>
        {([ ["code", "Vehicle identifier", 50], ["plate", "Registration plate", 50], ["zone", "Usual zone", 100] ] as const).map(([key, label, max]) => <Field key={key} label={label} required={key === "code"} validationMessage={errors[key]} validationState={errors[key] ? "error" : "none"}><Input value={values[key]} maxLength={max} disabled={pending} onChange={(_, d) => change(key, d.value)} /></Field>)}
        <Text size={200}>Zones are a dispatch preference. Changing a zone never moves stock or jobs.</Text>
        <Field label="Status" validationMessage={errors.status}><Select value={values.status} disabled={pending} onChange={(_, d) => change("status", d.value)}><option value="ACTIVE">Active</option><option value="GARAGE">Garage</option><option value="SOLD">Sold</option></Select></Field>
        <Field label="Notes" validationMessage={errors.statusNote}><Textarea value={values.statusNote} maxLength={500} disabled={pending} onChange={(_, d) => change("statusNote", d.value)} /></Field>
        {van && <Field label="Current technician"><Select value={values.technicianId} disabled={pending} onChange={(_, d) => change("technicianId", d.value)}><option value="">No technician</option>{technicians.map(t => <option key={t.id} value={t.id} disabled={!t.active && t.id !== initial.technicianId}>{t.name}{!t.active ? " (inactive)" : t.vanId && t.vanId !== van.id ? " (assigned to another van)" : ""}</option>)}</Select></Field>}
        {pending && <Spinner size="tiny" label="Saving van" />}
      </form>
    </FleetSheet>
    <FleetConfirmation open={discard} title="Discard unsaved changes?" onClose={() => setDiscard(false)} onConfirm={onClose} action="Discard changes">Your entered changes will be lost.</FleetConfirmation>
  </>;
}
