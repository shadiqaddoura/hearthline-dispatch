"use client";
import { useState } from "react";
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { CustomerOption } from "@/lib/api/requests";
import type { ProductDto } from "@/lib/contracts/products";
import type { UpdateJobRequest } from "@/lib/contracts/jobs";
const useStyles = makeStyles({
  fields: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  line: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 80px auto",
    gap: tokens.spacingHorizontalS,
    alignItems: "end",
    "@media (max-width: 479px)": {
      gridTemplateColumns: "minmax(0, 1fr) 70px",
      "& > button": { gridColumn: "1 / -1" },
    },
  },
});
export function RequestFormFields({
  value,
  onChange,
  customers,
  products,
  busy,
  errors,
}: {
  value: UpdateJobRequest;
  onChange: (v: UpdateJobRequest) => void;
  customers: CustomerOption[];
  products: ProductDto[];
  busy: boolean;
  errors: Record<string, string>;
}) {
  const styles = useStyles();
  const customer = customers.find((c) =>
    c.branches.some((b) => b.id === value.branchId),
  );
  const [customerId, setCustomerId] = useState(customer?.id ?? "");
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const field = (name: string) => ({
    validationMessage: errors[name],
    validationState: errors[name] ? ("error" as const) : ("none" as const),
  });
  return (
    <div className={styles.fields}>
      <Field label="Customer" required {...field("branchId")}>
        <Select
          disabled={busy}
          value={customerId}
          onChange={(_, d) => {
            setCustomerId(d.value);
            onChange({ ...value, branchId: "" });
          }}
        >
          <option value="">Select customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Branch" required {...field("branchId")}>
        <Select
          disabled={busy || !customerId}
          value={value.branchId}
          onChange={(_, d) => onChange({ ...value, branchId: d.value })}
        >
          <option value="">Select branch</option>
          {selectedCustomer?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Job type" required>
        <Select
          disabled={busy}
          value={value.type}
          onChange={(_, d) =>
            onChange({ ...value, type: d.value as UpdateJobRequest["type"] })
          }
        >
          <option value="DELIVERY">Delivery</option>
          <option value="INSTALLATION">Installation</option>
          <option value="REPAIR">Repair</option>
        </Select>
      </Field>
      <Field
        label="Original request date"
        hint="Change this only to correct when the customer originally requested the work."
        {...field("requestedOn")}
      >
        <Input
          disabled={busy}
          type="date"
          value={value.requestedOn ?? ""}
          onChange={(_, d) =>
            onChange({ ...value, requestedOn: d.value || null })
          }
        />
      </Field>
      <Field label="Required products" required {...field("items")} />
      {value.items.map((item, index) => (
        <div className={styles.line} key={index}>
          <Field label={`Product ${index + 1}`}>
            <Select
              disabled={busy}
              value={item.productId}
              onChange={(_, d) =>
                onChange({
                  ...value,
                  items: value.items.map((i, n) =>
                    n === index ? { ...i, productId: d.value } : i,
                  ),
                })
              }
            >
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name} ({p.baseUnit})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Quantity ${index + 1}`}>
            <Input
              disabled={busy}
              type="number"
              min={1}
              step={1}
              value={Number.isNaN(item.quantity) ? "" : String(item.quantity)}
              onChange={(_, d) =>
                onChange({
                  ...value,
                  items: value.items.map((i, n) =>
                    n === index
                      ? {
                          ...i,
                          quantity: d.value === "" ? NaN : Number(d.value),
                        }
                      : i,
                  ),
                })
              }
            />
          </Field>
          <Button
            disabled={busy}
            aria-label={`Remove product ${index + 1}`}
            onClick={() =>
              onChange({
                ...value,
                items: value.items.filter((_, n) => n !== index),
              })
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        disabled={busy}
        onClick={() =>
          onChange({
            ...value,
            items: [...value.items, { productId: "", quantity: 1 }],
          })
        }
      >
        Add product
      </Button>
      <Field label="Notes" {...field("notes")}>
        <Textarea
          disabled={busy}
          value={value.notes ?? ""}
          onChange={(_, d) => onChange({ ...value, notes: d.value })}
        />
      </Field>
    </div>
  );
}
