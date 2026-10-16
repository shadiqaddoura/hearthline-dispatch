"use client";

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
import { DeleteRegular } from "@fluentui/react-icons";
import { deleteProduct } from "@/lib/api/products";
import type { DeletedProductDto, ProductDetailDto } from "@/lib/contracts/products";
import { listReferences } from "@/lib/products/references";
import { useDeleteProduct } from "./use-delete-product";

const useStyles = makeStyles({
  surface: { maxWidth: "480px", width: "calc(100vw - 32px)" },
  content: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  identity: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  sku: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground2 },
  list: { margin: 0, paddingInlineStart: tokens.spacingHorizontalL },
  // `:enabled` raises the specificity: Fluent's own button rules would otherwise win by source order.
  danger: {
    whiteSpace: "nowrap",
    ":enabled": { backgroundColor: tokens.colorStatusDangerBackground3, color: tokens.colorNeutralForegroundOnBrand },
    ":enabled:hover": { backgroundColor: tokens.colorStatusDangerForeground1, color: tokens.colorNeutralForegroundOnBrand },
    ":enabled:hover:active": { backgroundColor: tokens.colorStatusDangerForeground1, color: tokens.colorNeutralForegroundOnBrand },
  },
});

interface DeleteProductDialogProps {
  /** Null while closed. */
  product: ProductDetailDto | null;
  onClose: () => void;
  onDeleted: (deleted: DeletedProductDto) => void;
  onDataChanged: () => void;
  /** Replaces the API call; tests use it. */
  submit?: (productId: string) => Promise<DeletedProductDto>;
}

export function DeleteProductDialog({ product, ...props }: DeleteProductDialogProps) {
  return (
    <Dialog open={product !== null} modalType="alert">
      {product ? <DeleteConfirmation key={product.id} product={product} {...props} /> : <></>}
    </Dialog>
  );
}

function DeleteConfirmation({
  product,
  onClose,
  onDeleted,
  onDataChanged,
  submit = deleteProduct,
}: Omit<DeleteProductDialogProps, "product"> & { product: ProductDetailDto }) {
  const styles = useStyles();
  const del = useDeleteProduct({ productId: product.id, submit, onDeleted, onDataChanged });
  const blocked = !product.deletion.allowed;
  const references = listReferences(product.references);

  return (
    <DialogSurface className={styles.surface} aria-describedby="delete-product-body">
      <DialogBody>
        <DialogTitle>{blocked ? "This product can't be deleted" : "Delete this product?"}</DialogTitle>
        <DialogContent className={styles.content} id="delete-product-body">
          <div className={styles.identity}>
            <Text weight="semibold">{product.name}</Text>
            <Text className={styles.sku}>{product.sku}</Text>
          </div>

          <div>
            {del.problem && (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>
                  <MessageBarTitle>{del.problem.title}</MessageBarTitle>
                  {del.problem.message}
                </MessageBarBody>
              </MessageBar>
            )}
          </div>

          {blocked ? (
            <>
              <Text>
                It is kept because other records refer to it, and deleting it would erase stock, equipment, job or
                movement history:
              </Text>
              <ul className={styles.list}>
                {references.map((reference) => (
                  <li key={reference.kind}>
                    {reference.count.toLocaleString("en")} {reference.label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <Text>
                Nothing refers to this product: no stock, equipment, jobs, reservations or movements. Deleting it is
                permanent and can&apos;t be undone.
              </Text>
              {product.removableRestockLines > 0 && (
                <Text>
                  It is also on {product.removableRestockLines === 1 ? "1 line" : `${product.removableRestockLines} lines`} of open restock lists, where
                  nothing has been collected for it. {product.removableRestockLines === 1 ? "That line" : "Those lines"} will be removed too.
                </Text>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabledFocusable={del.pending}>
            {blocked ? "Close" : "Cancel"}
          </Button>
          {!blocked && (
            <Button
              appearance="primary"
              className={styles.danger}
              icon={del.pending ? <Spinner size="tiny" appearance="inverted" /> : <DeleteRegular />}
              disabledFocusable={del.pending}
              onClick={() => void del.confirm()}
            >
              {del.pending ? "Deleting…" : "Delete product"}
            </Button>
          )}
        </DialogActions>
      </DialogBody>
    </DialogSurface>
  );
}
