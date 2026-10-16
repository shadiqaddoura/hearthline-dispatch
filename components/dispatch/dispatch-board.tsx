"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  MessageBar,
  MessageBarBody,
  OverlayDrawer,
  Tab,
  TabList,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
  useRestoreFocusSource,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular, DismissRegular, VehicleTruckProfileRegular } from "@fluentui/react-icons";
import { useMediaQuery } from "@/components/shell/use-media-query";
import type { DispatchBoardDto, VanEligibilityDto } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import { formatDay, isIsoDay } from "@/lib/dispatch/presentation";
import { BoardError, BoardLoading } from "./board-states";
import { EligibilitySummary } from "./eligibility";
import { RequestDetails } from "./request-details";
import { RequestList } from "./request-list";
import { useDispatchBoard, useEligibility } from "./use-dispatch-data";
import { VanList } from "./van-list";

/** Below this width the board shows one panel at a time. */
export const NARROW_BOARD_QUERY = "(max-width: 1023px)";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  intro: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM },
  description: { color: tokens.colorNeutralForeground2, maxWidth: "720px" },
  // Each panel scrolls on its own, so the selected request's details stay in view.
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(300px, 2fr) minmax(0, 3fr)",
    gap: tokens.spacingHorizontalXL,
    height: "calc(100dvh - 210px)",
    minHeight: "480px",
  },
  scroller: {
    overflowY: "auto",
    minHeight: 0,
    // Room for focus outlines, which the scroll container would otherwise clip.
    padding: tokens.spacingHorizontalXS,
  },
  panel: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, minWidth: 0 },
  panelTitle: { margin: 0 },
  surface: {
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
  },
  hint: { color: tokens.colorNeutralForeground3 },
  // Clears the sticky app header when scrolled into view.
  vansSummary: { scrollMarginTop: "72px" },
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
});

interface DispatchBoardProps {
  /** Replace the API calls; tests use these. */
  loadBoard?: (signal: AbortSignal) => Promise<DispatchBoardDto>;
  loadEligibility?: (jobId: string, signal: AbortSignal) => Promise<VanEligibilityDto[]>;
}

/** Read-only dispatch board: unfinished customer work beside every van. */
export function DispatchBoard({ loadBoard, loadEligibility }: DispatchBoardProps) {
  const styles = useStyles();
  const { state, reload } = useDispatchBoard(loadBoard);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"requests" | "vans">("requests");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const narrow = useMediaQuery(NARROW_BOARD_QUERY) ?? false;
  const detailsPanelRef = useRef<HTMLDivElement>(null);
  // "Show vans" on phones: the request that opened the drawer is no longer on screen,
  // so focus moves to the vans summary once the drawer has closed.
  const vansSummaryRef = useRef<HTMLDivElement>(null);
  const focusVansPending = useRef(false);
  useEffect(() => {
    if (!focusVansPending.current || detailsOpen || tab !== "vans") return;
    focusVansPending.current = false;
    vansSummaryRef.current?.focus();
    vansSummaryRef.current?.scrollIntoView?.({ block: "start" });
  }, [detailsOpen, tab]);
  const restoreFocusSource = useRestoreFocusSource();

  const board = state.status === "ready" ? state.board : null;
  // A refreshed board that no longer has the job simply clears the selection.
  const selectedJob = board ? [...board.openRequests, ...board.assignedWork].find((j) => j.id === selectedId) ?? null : null;
  // Eligibility is for placing a waiting request; assigned work already has its van.
  const { state: eligibility, retry: retryEligibility } = useEligibility(
    selectedJob?.status === "REQUESTED" ? selectedJob.id : null,
    loadEligibility,
  );
  const ranking = eligibility.status === "ready" ? eligibility.vans : null;

  const select = (job: JobDto) => {
    setSelectedId(job.id);
    if (narrow) setDetailsOpen(true);
    else detailsPanelRef.current?.scrollTo?.({ top: 0 });
  };

  const boardDay = board && isIsoDay(board.date) ? formatDay(board.date) : board?.date;

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <Text as="p" className={styles.description}>
          Unfinished customer work beside every van. Waiting time counts calendar days from each request date
          {boardDay ? ` to ${boardDay}` : ""}. Assignment and scheduling come next; this board is read-only.
        </Text>
        <Button
          icon={<ArrowClockwiseRegular />}
          onClick={reload}
          disabledFocusable={state.status === "loading" || (state.status === "ready" && state.refreshing)}
        >
          {state.status === "ready" && state.refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <span className={styles.visuallyHidden} aria-live="polite">
        {selectedJob ? `Selected ${selectedJob.reference}, ${selectedJob.customer.name}` : ""}
      </span>

      {state.status === "loading" && <BoardLoading />}
      {state.status === "error" && <BoardError message={state.message} onRetry={reload} />}
      {state.status === "ready" && state.refreshError && (
        <MessageBar intent="warning">
          <MessageBarBody>Couldn&apos;t refresh: {state.refreshError} Showing the board from before.</MessageBarBody>
        </MessageBar>
      )}

      {board && narrow && (
        <>
          <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(data.value as "requests" | "vans")}>
            <Tab value="requests" id="tab-requests">
              Requests ({board.openRequests.length + board.assignedWork.length})
            </Tab>
            <Tab value="vans" id="tab-vans" icon={<VehicleTruckProfileRegular />}>
              Vans ({board.vans.length})
            </Tab>
          </TabList>
          {tab === "requests" ? (
            <div role="tabpanel" aria-labelledby="tab-requests" className={styles.panel}>
              <RequestList
                awaiting={board.openRequests}
                assigned={board.assignedWork}
                selectedId={selectedId}
                onSelect={select}
              />
            </div>
          ) : (
            <div role="tabpanel" aria-labelledby="tab-vans" className={styles.panel}>
              {selectedJob ? (
                <div ref={vansSummaryRef} tabIndex={-1} className={mergeClasses(styles.surface, styles.vansSummary)}>
                  <Text weight="semibold">
                    For {selectedJob.reference} ({selectedJob.customer.name})
                  </Text>
                  {selectedJob.status === "REQUESTED" && <EligibilitySummary state={eligibility} onRetry={retryEligibility} />}
                </div>
              ) : (
                <Text className={styles.hint}>Select a request to see which vans can take it.</Text>
              )}
              <VanList vans={board.vans} boardDate={board.date} selectedJob={selectedJob} eligibility={ranking} />
            </div>
          )}
          <OverlayDrawer
            {...restoreFocusSource}
            position="end"
            size="full"
            open={detailsOpen && selectedJob !== null}
            onOpenChange={(_, data) => setDetailsOpen(data.open)}
            aria-label="Request details"
          >
            <DrawerHeader>
              <DrawerHeaderTitle
                action={
                  <Button appearance="subtle" aria-label="Close details" icon={<DismissRegular />} onClick={() => setDetailsOpen(false)} />
                }
              >
                Request details
              </DrawerHeaderTitle>
            </DrawerHeader>
            <DrawerBody>
              {selectedJob && (
                <RequestDetails
                  job={selectedJob}
                  boardDate={board.date}
                  eligibility={eligibility}
                  onRetryEligibility={retryEligibility}
                  footer={
                    <Button
                      appearance="primary"
                      icon={<VehicleTruckProfileRegular />}
                      onClick={() => {
                        setTab("vans");
                        setDetailsOpen(false);
                        focusVansPending.current = true;
                      }}
                    >
                      Show vans for this job
                    </Button>
                  }
                />
              )}
            </DrawerBody>
          </OverlayDrawer>
        </>
      )}

      {board && !narrow && (
        <div className={styles.columns}>
          <section className={mergeClasses(styles.panel, styles.scroller)} aria-labelledby="requests-title">
            <Text as="h2" id="requests-title" size={400} weight="semibold" className={styles.panelTitle}>
              Requests
            </Text>
            <RequestList awaiting={board.openRequests} assigned={board.assignedWork} selectedId={selectedId} onSelect={select} />
          </section>
          <div ref={detailsPanelRef} className={mergeClasses(styles.panel, styles.scroller)}>
            <section className={styles.surface} aria-label="Selected request">
              {selectedJob ? (
                <RequestDetails
                  job={selectedJob}
                  boardDate={board.date}
                  eligibility={eligibility}
                  onRetryEligibility={retryEligibility}
                />
              ) : (
                <Text className={styles.hint}>
                  Select a request to see its details and which vans can take it.
                </Text>
              )}
            </section>
            <section className={styles.panel} aria-labelledby="vans-title">
              <Text as="h2" id="vans-title" size={400} weight="semibold" className={styles.panelTitle}>
                Vans ({board.vans.length})
              </Text>
              <VanList vans={board.vans} boardDate={board.date} selectedJob={selectedJob} eligibility={ranking} />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
