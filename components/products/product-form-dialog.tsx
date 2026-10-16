"use client";

import { useEffect, useRef } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { createProduct, updateProduct } from "@/lib/api/products";
import type { ProductDetailDto, ProductDto, ProductInput } from "@/lib/contracts/products";
import { EMPTY_PRODUCT_FORM, PRODUCT_FIELD_ORDER, formFromProduct } from "@/lib/products/product-form";
import { ProductFormFields, type FieldRefs } from "./product-form-fields";
import { useProductForm } from "./use-product-form";

const useStyles = makeStyles({
  surface: { maxWidth: "560px", width: "calc(100vw - 32px)" },
  problem: { ":focus": { outlineStyle: "none" } },
  intro: { color: tokens.colorNeutralForeground2 },
  content: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
});

export type ProductFormTarget = { mode: "create" } | { mode: "edit"; product: ProductDetailDto };

interface ProductFormDialogProps {
  /** Null while closed. */
  target: ProductFormTarget | null;
  onClose: () => void;
  onSaved: (product: ProductDto, mode: "create" | "edit") => void;
  onDataChanged: () => void;
  /** Replace the API calls; tests use it. */
  submit?: (target: ProductFormTarget, input: ProductInput) => Promise<ProductDto>;
}

function send(target: ProductFormTarget, input: ProductInput) {
  return target.mode === "create" ? createProduct(input) : updateProduct(target.product.id, input);
}

export function ProductFormDialog({ target, ...props }: ProductFormDialogProps) {
  return (
    <Dialog open={target !== null} modalType="modal">
      {/* A new key per opening, so every opening starts with a fresh form. */}
      {target ? <ProductForm key={target.mode === "edit" ? target.product.id : "create"} target={target} {...props} /> : <></>}
    </Dialog>
  );
}

function ProductForm({ target, onClose, onSaved, onDataChanged, submit = send }: Omit<ProductFormDialogProps, "target"> & { target: ProductFormTarget }) {
  const styles = useStyles();
  const editing = target.mode === "edit";
  const form = useProductForm({
    initial: editing ? formFromProduct(target.product) : EMPTY_PRODUCT_FORM,
    verb: editing ? "saved" : "created",
    submit: (input) => submit(target, input),
    onSaved: (product) => onSaved(product, target.mode),
    onDataChanged,
  });
  const fieldRefs: FieldRefs = useRef({});
  const problemRef = useRef<HTMLDivElement>(null);

  // After a failed save, focus goes to the first field with an error, or to the problem message.
  const { focusRequest } = form;
  useEffect(() => {
    if (!focusRequest) return;
    const element = focusRequest.target === "problem" ? problemRef.current : fieldRefs.current[focusRequest.target];
    element?.focus();
  }, [focusRequest]);

  const close = () => {
    if (!form.pending) onClose();
  };
  const invalidFields = PRODUCT_FIELD_ORDER.filter((field) => form.errors[field]);
  const product = editing ? target.product : null;

  return (
    <DialogSurface
      className={styles.surface}
      aria-describedby="product-form-intro"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.save();
        }}
      >
        <DialogBody>
          <DialogTitle
            action={<Button appearance="subtle" aria-label="Close" icon={<DismissRegular />} onClick={close} disabledFocusable={form.pending} />}
          >
            {product ? `Edit ${product.name}` : "Add product"}
          </DialogTitle>
          <DialogContent className={styles.content}>
            <Text id="product-form-intro" className={styles.intro}>
              {product
                ? "Changes apply to the whole catalogue as soon as you save."
                : "Adding a product doesn't add any stock or equipment: vans start with none of it."}
            </Text>

            {/* Fluent's message bars announce themselves when they appear; this wrapper only takes focus. */}
            <div ref={problemRef} tabIndex={-1} className={styles.problem}>
              {form.problem && (
                <MessageBar intent="error" layout="multiline">
                  <MessageBarBody>
                    <MessageBarTitle>{form.problem.title}</MessageBarTitle>
                    {form.problem.message}
                  </MessageBarBody>
                </MessageBar>
              )}
              {!form.problem && invalidFields.length > 0 && (
                <MessageBar intent="error" layout="multiline">
                  <MessageBarBody>
                    <MessageBarTitle>
                      {invalidFields.length === 1 ? "One field needs attention." : `${invalidFields.length} fields need attention.`}
                    </MessageBarTitle>
                    Fix what is marked below, then save again.
                  </MessageBarBody>
                </MessageBar>
              )}
            </div>

            {product?.restockPolicyNeedsReview && (
              <MessageBar intent="warning" layout="multiline">
                <MessageBarBody>
                  <MessageBarTitle>Restocking policy needs review</MessageBarTitle>
                  {product.restockPolicyNote ?? "Someone has flagged this product's restocking policy as unsettled."} Saving
                  here doesn&apos;t resolve the review: the flag and note stay until it is settled.
                </MessageBarBody>
              </MessageBar>
            )}

            <ProductFormFields
              values={form.values}
              errors={form.errors}
              onChange={form.setValue}
              locked={product?.locked}
              busy={form.pending}
              fieldRefs={fieldRefs}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={close} disabledFocusable={form.pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              appearance="primary"
              disabledFocusable={form.pending}
              icon={form.pending ? <Spinner size="tiny" appearance="inverted" /> : undefined}
            >
              {form.pending ? (editing ? "Saving…" : "Adding…") : editing ? "Save changes" : "Add product"}
            </Button>
          </DialogActions>
        </DialogBody>
      </form>
    </DialogSurface>
  );
}
