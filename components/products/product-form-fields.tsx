"use client";

import { useId, type MutableRefObject } from "react";
import { Field, Input, Switch, Text, makeStyles, tokens } from "@fluentui/react-components";
import { LockClosedRegular } from "@fluentui/react-icons";
import type { ProductDetailDto, ProductField } from "@/lib/contracts/products";
import { pluralUnit } from "@/lib/products/catalogue";
import type { ProductFormErrors, ProductFormValues } from "@/lib/products/product-form";

const useStyles = makeStyles({
  fields: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  pair: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: tokens.spacingHorizontalM,
    alignItems: "start",
    "@media (max-width: 479px)": { gridTemplateColumns: "1fr" },
  },
  switchRow: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS },
  description: { color: tokens.colorNeutralForeground3, paddingInlineStart: "52px" },
  locked: { display: "flex", gap: tokens.spacingHorizontalXS, alignItems: "flex-start", color: tokens.colorNeutralForeground3 },
  lockIcon: { flexShrink: 0, marginTop: "2px" },
});

export type FieldRefs = MutableRefObject<Partial<Record<ProductField, HTMLElement | null>>>;

interface ProductFormFieldsProps {
  values: ProductFormValues;
  errors: ProductFormErrors;
  onChange: <K extends keyof ProductFormValues>(field: K, value: ProductFormValues[K]) => void;
  /** Why the SKU, unit or serial tracking can't change, from the server. Absent when creating. */
  locked?: ProductDetailDto["locked"];
  /** A save is in flight: values stay visible but can't change. */
  busy?: boolean;
  fieldRefs: FieldRefs;
}

/** The product's editable fields, with the error for each beside it. Shared by Add and Edit. */
export function ProductFormFields({ values, errors, onChange, locked, busy, fieldRefs }: ProductFormFieldsProps) {
  const styles = useStyles();
  const ids = useId();
  const register = (field: ProductField) => (element: HTMLElement | null) => {
    fieldRefs.current[field] = element;
  };
  const unit = values.baseUnit.trim() || "unit";

  return (
    <div className={styles.fields}>
      <Field
        label="SKU"
        required
        validationState={errors.sku ? "error" : "none"}
        validationMessage={errors.sku}
        hint={locked?.sku ? <LockedReason reason={locked.sku} /> : "Letters, numbers and - . _ only. Saved in capitals and must be unique."}
      >
        <Input
          ref={register("sku")}
          value={values.sku}
          onChange={(_, data) => onChange("sku", data.value)}
          readOnly={Boolean(locked?.sku) || busy}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
      </Field>

      <Field label="Product name" required validationState={errors.name ? "error" : "none"} validationMessage={errors.name}>
        <Input
          ref={register("name")}
          value={values.name}
          onChange={(_, data) => onChange("name", data.value)}
          readOnly={busy}
          autoComplete="off"
        />
      </Field>

      <Field
        label="Unit of measurement"
        required
        validationState={errors.baseUnit ? "error" : "none"}
        validationMessage={errors.baseUnit}
        hint={
          locked?.baseUnit ? (
            <LockedReason reason={locked.baseUnit} />
          ) : (
            "What stock is counted in, singular and lower case: each, roll, metre."
          )
        }
      >
        <Input
          ref={register("baseUnit")}
          value={values.baseUnit}
          onChange={(_, data) => onChange("baseUnit", data.value)}
          readOnly={Boolean(locked?.baseUnit) || busy}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      <div className={styles.pair}>
        <Field
          label="Pack name (optional)"
          validationState={errors.packUnit ? "error" : "none"}
          validationMessage={errors.packUnit}
          hint="What the hub issues it in, e.g. box."
        >
          <Input
            ref={register("packUnit")}
            value={values.packUnit}
            onChange={(_, data) => onChange("packUnit", data.value)}
            readOnly={busy}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field
          label="Quantity per pack"
          validationState={errors.packSize ? "error" : "none"}
          validationMessage={errors.packSize}
          hint={`How many ${pluralUnit(unit)} are in one pack. Needed when the pack has a name.`}
        >
          <Input
            ref={register("packSize")}
            value={values.packSize}
            onChange={(_, data) => onChange("packSize", data.value)}
            inputMode="numeric"
            readOnly={busy}
            autoComplete="off"
          />
        </Field>
      </div>

      <div className={styles.switchRow}>
        <Switch
          ref={register("serialised")}
          label="Each unit has a serial number"
          checked={values.serialised}
          onChange={(_, data) => onChange("serialised", data.checked)}
          disabled={busy || Boolean(locked?.serialised)}
          aria-describedby={`${ids}-serialised`}
        />
        <Text id={`${ids}-serialised`} size={200} className={styles.description}>
          {locked?.serialised ? (
            <LockedReason reason={locked.serialised} />
          ) : (
            "A unit can only be assigned to a job once its serial is recorded."
          )}
        </Text>
        {errors.serialised && (
          <Text size={200} className={styles.description} role="alert">
            {errors.serialised}
          </Text>
        )}
      </div>

      <Field
        label="Van minimum"
        required
        validationState={errors.vanMinimum ? "error" : "none"}
        validationMessage={errors.vanMinimum}
        hint={`What each van should carry, in ${pluralUnit(unit)}. Enter 0 for no minimum.`}
      >
        <Input
          ref={register("vanMinimum")}
          value={values.vanMinimum}
          onChange={(_, data) => onChange("vanMinimum", data.value)}
          inputMode="numeric"
          readOnly={busy}
          autoComplete="off"
        />
      </Field>

      <div className={styles.switchRow}>
        <Switch
          ref={register("autoRestock")}
          label="Restock vans automatically"
          checked={values.autoRestock}
          onChange={(_, data) => onChange("autoRestock", data.checked)}
          disabled={busy}
          aria-describedby={`${ids}-auto`}
        />
        <Text id={`${ids}-auto`} size={200} className={styles.description}>
          {values.autoRestock
            ? "Added to a van's restock list when its working stock falls below the minimum."
            : "Never added to restock lists automatically."}
        </Text>
      </div>
    </div>
  );
}

function LockedReason({ reason }: { reason: string }) {
  const styles = useStyles();
  return (
    <span className={styles.locked}>
      <LockClosedRegular className={styles.lockIcon} aria-hidden />
      <span>{reason}</span>
    </span>
  );
}
