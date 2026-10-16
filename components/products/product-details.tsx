"use client";

import {
  Button,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  OverlayDrawer,
  Text,
  makeStyles,
  tokens,
  useRestoreFocusSource,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import type { ProductDto } from "@/lib/contracts/products";
import { describeUnit, describeVanMinimum, formatQuantity, pluralUnit } from "@/lib/products/catalogue";
import { RestockPolicyBadge } from "./restock-policy-badge";

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
  footer: { color: tokens.colorNeutralForeground3 },
});

interface ProductDetailsProps {
  /** Kept after closing so the panel still has content while it animates out. */
  product: ProductDto | null;
  open: boolean;
  onClose: () => void;
}

/** Read-only details of one product, in a panel over the catalogue. */
export function ProductDetails({ product, open, onClose }: ProductDetailsProps) {
  const styles = useStyles();
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
          </DrawerBody>

          <DrawerFooter>
            <Text size={200} className={styles.footer}>
              Read-only. Editing products isn&apos;t available yet.
            </Text>
          </DrawerFooter>
        </>
      )}
    </OverlayDrawer>
  );
}
