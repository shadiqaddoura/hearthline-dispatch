"use client";

import type { Ref } from "react";
import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, makeStyles } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import type { ProductNotice } from "./use-product-actions";

const useStyles = makeStyles({
  // Clears the sticky app header when scrolled into view.
  region: { scrollMarginTop: "72px", ":focus": { outlineStyle: "none" } },
});

/**
 * Confirmation of a change the server has made. The message bar announces itself when it
 * appears; after a deletion, when the button that started it is gone, the region also takes focus.
 */
export function ProductNoticeRegion({
  notice,
  regionRef,
  onDismiss,
}: {
  notice: ProductNotice | null;
  regionRef: Ref<HTMLDivElement>;
  onDismiss: () => void;
}) {
  const styles = useStyles();
  return (
    <div ref={regionRef} tabIndex={-1} className={styles.region}>
      {notice && (
        <MessageBar intent="success" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>{notice.title}</MessageBarTitle>
            {notice.message}
          </MessageBarBody>
          <MessageBarActions
            containerAction={<Button appearance="transparent" aria-label="Dismiss message" icon={<DismissRegular />} onClick={onDismiss} />}
          />
        </MessageBar>
      )}
    </div>
  );
}
