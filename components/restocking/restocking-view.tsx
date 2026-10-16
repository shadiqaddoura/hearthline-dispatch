"use client";

import { useState } from "react";
import {
  Button,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  MessageBar,
  MessageBarBody,
  OverlayDrawer,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
  useRestoreFocusSource,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular, DismissRegular } from "@fluentui/react-icons";
import { useMediaQuery } from "@/components/shell/use-media-query";
import type { RestockJobDto } from "@/lib/contracts/restocking";
import { orderByVan } from "@/lib/restocking/presentation";
import { RestockDetails } from "./restock-details";
import { RestockJobList } from "./restock-job-list";
import { RestockEmpty, RestockError, RestockLoading } from "./restock-states";
import { useRestockJobs } from "./use-restock-jobs";

/** Below this width the page shows the list, and a van's details in a drawer. */
const NARROW_QUERY = "(max-width: 1023px)";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  intro: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM },
  description: { color: tokens.colorNeutralForeground2, maxWidth: "760px" },
  // Each panel scrolls on its own, so the selected van's pick list stays in view.
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) minmax(0, 2.4fr)",
    gap: tokens.spacingHorizontalXL,
    height: "calc(100dvh - 210px)",
    minHeight: "480px",
  },
  scroller: { overflowY: "auto", minHeight: 0, padding: tokens.spacingHorizontalXS },
  panel: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, minWidth: 0 },
  panelTitle: { margin: 0 },
  surface: {
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
  },
  hint: { color: tokens.colorNeutralForeground3 },
});

interface RestockingViewProps {
  /** Replaces the API call; tests use it. */
  loadJobs?: (signal: AbortSignal) => Promise<RestockJobDto[]>;
}

/** Open restock jobs by van, with each van's pick list. Read-only: viewing never changes stock. */
export function RestockingView({ loadJobs }: RestockingViewProps) {
  const styles = useStyles();
  const { state, reload } = useRestockJobs(loadJobs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const narrow = useMediaQuery(NARROW_QUERY) ?? false;
  const restoreFocusSource = useRestoreFocusSource();

  const jobs = state.status === "ready" ? orderByVan(state.jobs) : [];
  // A refreshed list without the selected job (e.g. the van reached its minimums) clears the selection.
  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  const select = (job: RestockJobDto) => {
    setSelectedId(job.id);
    if (narrow) setDetailsOpen(true);
  };

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <Text as="p" className={styles.description}>
          Vans below their minimums, with what to collect from the hub and broken equipment to take back. The lists
          update themselves after every stock change; opening this page never changes stock.
        </Text>
        <Button
          icon={<ArrowClockwiseRegular />}
          onClick={reload}
          disabledFocusable={state.status === "loading" || (state.status === "ready" && state.refreshing)}
        >
          {state.status === "ready" && state.refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {state.status === "loading" && <RestockLoading />}
      {state.status === "error" && <RestockError message={state.message} onRetry={reload} />}
      {state.status === "ready" && state.refreshError && (
        <MessageBar intent="warning">
          <MessageBarBody>Couldn&apos;t refresh: {state.refreshError} Showing the list from before.</MessageBarBody>
        </MessageBar>
      )}
      {state.status === "ready" && jobs.length === 0 && <RestockEmpty />}

      {jobs.length > 0 && narrow && (
        <>
          <section className={styles.panel} aria-labelledby="restock-vans-title">
            <Text as="h2" id="restock-vans-title" size={400} weight="semibold" className={styles.panelTitle}>
              Vans to restock ({jobs.length})
            </Text>
            <RestockJobList jobs={jobs} selectedId={selectedId} onSelect={select} />
          </section>
          <OverlayDrawer
            {...restoreFocusSource}
            position="end"
            size="full"
            open={detailsOpen && selected !== null}
            onOpenChange={(_, data) => setDetailsOpen(data.open)}
            aria-label={selected ? `${selected.van.code} pick list` : "Pick list"}
          >
            <DrawerHeader>
              <DrawerHeaderTitle
                action={
                  <Button appearance="subtle" aria-label="Close pick list" icon={<DismissRegular />} onClick={() => setDetailsOpen(false)} />
                }
              >
                Pick list
              </DrawerHeaderTitle>
            </DrawerHeader>
            <DrawerBody>{selected && <RestockDetails job={selected} compact />}</DrawerBody>
          </OverlayDrawer>
        </>
      )}

      {jobs.length > 0 && !narrow && (
        <div className={styles.columns}>
          <section className={mergeClasses(styles.panel, styles.scroller)} aria-labelledby="restock-vans-title">
            <Text as="h2" id="restock-vans-title" size={400} weight="semibold" className={styles.panelTitle}>
              Vans to restock ({jobs.length})
            </Text>
            <RestockJobList jobs={jobs} selectedId={selectedId} onSelect={select} />
          </section>
          <div className={mergeClasses(styles.panel, styles.scroller)}>
            <section className={styles.surface} aria-label="Selected pick list">
              {selected ? (
                <RestockDetails job={selected} compact={false} />
              ) : (
                <Text className={styles.hint}>Select a van to see its pick list and broken equipment to return.</Text>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
