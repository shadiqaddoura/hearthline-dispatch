"use client";

import {
  Button,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  OverlayDrawer,
  Spinner,
  Text,
  makeStyles,
  tokens,
  useRestoreFocusSource,
  useRestoreFocusTarget,
} from "@fluentui/react-components";
import { DeleteRegular, DismissRegular, EditRegular } from "@fluentui/react-icons";
import type { ProductDto } from "@/lib/contracts/products";
import { describeUnit, describeVanMinimum, formatQuantity, pluralUnit } from "@/lib/products/catalogue";
import { listReferences } from "@/lib/products/references";
import { RestockPolicyBadge } from "./restock-policy-badge";
import type { ProductDetailState } from "./use-product-detail";

const useStyles = makeStyles({
  sku: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground3 },
  list: {
    display: "grid",
    gridTemplateColumns: "minmax(140px, auto) 1fr",
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalM,
    margin: 0,
    "@media (max-width: 479px)": { gridTemplateColumns: "1fr", rowGap: tokens.spacingVerticalXS },
  },
  term: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300 },
  definition: {
    margin: 0,
    fontSize: tokens.fontSizeBase300,
    "@media (max-width: 479px)": { marginBottom: tokens.spacingVerticalS },
  },
  hint: { display: "block", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  body: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXL },
  usage: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  usageList: { margin: 0, paddingInlineStart: tokens.spacingHorizontalL },
  muted: { color: tokens.colorNeutralForeground3 },
  footer: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
});

interface ProductDetailsProps {
  /** Kept after closing so the panel still has content while it animates out. */
  product: ProductDto | null;
  /** Where the product is used, from the server. */
  usage: ProductDetailState;
  open: boolean;
  onClose: () => void;
  onRetryUsage: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Details of one product, in a panel over the catalogue, with where it is used and the Edit and Delete actions. */
export function ProductDetails({ product, usage, open, onClose, onRetryUsage, onEdit, onDelete }: ProductDetailsProps) {
  const styles = useStyles();
  const restoreFocusTarget = useRestoreFocusTarget();
  // Edit and Delete need the server's answer about where the product is used.
  const detail = usage.status === "ready" || usage.status === "loading" || usage.status === "error" ? usage.detail : null;
  const actionsReady = detail !== null && detail.id === product?.id;
  // Returns focus to the row's link (marked with useRestoreFocusTarget) when the panel closes.
  const restoreFocusSource = useRestoreFocusSource();

  return (
    <OverlayDrawer
      position="end"
      size="medium"
      {...restoreFocusSource}
      open={open && product !== null}
      onOpenChange={(_, data) => !data.open && onClose()}
      aria-label={product ? `${product.name} details` : "Product details"}
    >
      {product && (
        <>
          <DrawerHeader>
            <DrawerHeaderTitle
              action={<Button appearance="subtle" aria-label="Close details" icon={<DismissRegular />} onClick={onClose} />}
            >
              {product.name}
            </DrawerHeaderTitle>
            <Text className={styles.sku}>{product.sku}</Text>
          </DrawerHeader>

          <DrawerBody className={styles.body}>
            {product.restockPolicyNeedsReview && (
              <MessageBar intent="warning" layout="multiline">
                <MessageBarBody>
                  <MessageBarTitle>Restocking policy needs review</MessageBarTitle>
                  {product.restockPolicyNote ?? "Someone has flagged this product's restocking policy as unsettled."}
                </MessageBarBody>
              </MessageBar>
            )}

            <dl className={styles.list}>
              <dt className={styles.term}>Unit</dt>
              <dd className={styles.definition}>
                {describeUnit(product)}
                {product.packUnit && product.packSize && (
                  <span className={styles.hint}>
                    Quantities are counted in {pluralUnit(product.baseUnit)}: 1 {product.packUnit} ={" "}
                    {formatQuantity(product.packSize, product.baseUnit)}.
                  </span>
                )}
              </dd>

              <dt className={styles.term}>Serial numbers</dt>
              <dd className={styles.definition}>
                {product.serialised ? "Required for every unit" : "Not tracked"}
                {product.serialised && (
                  <span className={styles.hint}>A unit can only be assigned to a job once its serial is recorded.</span>
                )}
              </dd>

              <dt className={styles.term}>Van minimum</dt>
              <dd className={styles.definition}>
                {describeVanMinimum(product)}
                <span className={styles.hint}>What each van should carry.</span>
              </dd>

              <dt className={styles.term}>Automatic restocking</dt>
              <dd className={styles.definition}>
                <RestockPolicyBadge product={product} />
                <span className={styles.hint}>
                  {product.autoRestock
                    ? "Added to a van's restock list when its working stock falls below the minimum."
                    : "Not added to restock lists automatically."}
                </span>
              </dd>

              {product.restockPolicyNote && !product.restockPolicyNeedsReview && (
                <>
                  <dt className={styles.term}>Policy note</dt>
                  <dd className={styles.definition}>{product.restockPolicyNote}</dd>
                </>
              )}
            </dl>

            <section className={styles.usage} aria-labelledby="product-usage-title">
              <Text as="h3" id="product-usage-title" weight="semibold">
                Where it is used
              </Text>
              <ProductUsage usage={usage} onRetry={onRetryUsage} />
            </section>
          </DrawerBody>

          <DrawerFooter className={styles.footer}>
            <Button {...restoreFocusTarget} appearance="primary" icon={<EditRegular />} disabledFocusable={!actionsReady} onClick={onEdit}>
              Edit
            </Button>
            <Button {...restoreFocusTarget} icon={<DeleteRegular />} disabledFocusable={!actionsReady} onClick={onDelete}>
              Delete…
            </Button>
          </DrawerFooter>
        </>
      )}
    </OverlayDrawer>
  );
}

function ProductUsage({ usage, onRetry }: { usage: ProductDetailState; onRetry: () => void }) {
  const styles = useStyles();
  if (usage.status === "idle" || (usage.status === "loading" && !usage.detail)) {
    return <Spinner size="tiny" labelPosition="after" label="Checking where it is used…" />;
  }
  if (usage.status === "error" && !usage.detail) {
    return (
      <MessageBar intent="error" layout="multiline">
        <MessageBarBody>{usage.message}</MessageBarBody>
        <MessageBarActions>
          <Button onClick={onRetry}>Retry</Button>
        </MessageBarActions>
      </MessageBar>
    );
  }
  const detail = usage.detail!;
  const references = listReferences(detail.references);
  if (references.length === 0) {
    return (
      <Text className={styles.muted}>
        Nothing yet: no stock, equipment, jobs, reservations or movements. Every field can be edited, and the product
        can be deleted.
      </Text>
    );
  }
  return (
    <>
      <ul className={styles.usageList}>
        {references.map((reference) => (
          <li key={reference.kind}>
            {reference.count.toLocaleString("en")} {reference.label}
          </li>
        ))}
      </ul>
      <Text size={200} className={styles.muted}>
        The SKU, unit and serial tracking are locked while records refer to the product, and it can&apos;t be deleted.
      </Text>
    </>
  );
}
