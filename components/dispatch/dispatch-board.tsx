"use client";

import { useRef, useState } from "react";
import {
  Button,
  DrawerBody,
  DrawerFooter,
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
import { JOB_TYPE_LABEL, describeWaitingTime, formatDay, isIsoDay, waitingLabel } from "@/lib/dispatch/presentation";
import { useJobActions } from "./assignment/use-job-actions";
import { BoardError, BoardLoading } from "./board-states";
import { EligibilitySummary } from "./eligibility";
import { RequestDetails } from "./request-details";
import { RequestList } from "./request-list";
import { useDispatchBoard, useEligibility } from "./use-dispatch-data";
import { VanList } from "./van-list";

export const NARROW_BOARD_QUERY = "(max-width: 1023px)";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
  },
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(300px, 1fr) minmax(0, 2fr)",
    gap: tokens.spacingHorizontalL,
    height: "calc(100dvh - 170px)",
    minHeight: "480px",
  },
  scroller: { overflowY: "auto", minHeight: 0, padding: tokens.spacingHorizontalXS },
  panel: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, minWidth: 0 },
  panelTitle: { margin: 0 },
  surface: {
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
  },
  hint: { color: tokens.colorNeutralForeground3 },
  context: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS },
  footer: {
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
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
  loadBoard?: (signal: AbortSignal) => Promise<DispatchBoardDto>;
  loadEligibility?: (jobId: string, signal: AbortSignal) => Promise<VanEligibilityDto[]>;
}

export function DispatchBoard({ loadBoard, loadEligibility }: DispatchBoardProps) {
  const styles = useStyles();
  const { state, reload } = useDispatchBoard(loadBoard);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"requests" | "vans">("requests");
  const [workspaceTab, setWorkspaceTab] = useState<"details" | "choices">("details");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const narrow = useMediaQuery(NARROW_BOARD_QUERY) ?? false;
  const detailsPanelRef = useRef<HTMLDivElement>(null);
  const restoreFocusSource = useRestoreFocusSource();
  const board = state.status === "ready" ? state.board : null;
  const selectedJob = board
    ? ([...board.openRequests, ...board.assignedWork].find((j) => j.id === selectedId) ?? null)
    : null;
  const { state: eligibility, retry: retryEligibility } = useEligibility(
    selectedJob?.status === "REQUESTED" ? selectedJob.id : null,
    loadEligibility,
  );
  const ranking = eligibility.status === "ready" ? eligibility.vans : null;
  const jobActions = useJobActions({ board, job: selectedJob, eligibility, retryEligibility, reloadBoard: reload });
  const noticeInDrawer = narrow && detailsOpen && selectedJob !== null;
  const select = (job: JobDto) => {
    setSelectedId(job.id);
    setWorkspaceTab("details");
    if (narrow) setDetailsOpen(true);
    else detailsPanelRef.current?.scrollTo?.({ top: 0 });
  };
  const boardDay = board && isIsoDay(board.date) ? formatDay(board.date) : board?.date;

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Text size={200}>
          {boardDay ?? "Dispatch board"}
          {board ? ` · ${board.openRequests.length} waiting · ${board.assignedWork.length} assigned / in progress` : ""}
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
      {!noticeInDrawer && jobActions.notice}
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
              Fleet ({board.vans.length})
            </Tab>
          </TabList>
          <div
            role="tabpanel"
            aria-labelledby={tab === "requests" ? "tab-requests" : "tab-vans"}
            className={styles.panel}
          >
            {tab === "requests" ? (
              <RequestList
                awaiting={board.openRequests}
                assigned={board.assignedWork}
                selectedId={selectedId}
                onSelect={select}
              />
            ) : (
              <VanList vans={board.vans} boardDate={board.date} selectedJob={null} eligibility={null} />
            )}
          </div>
          <OverlayDrawer
            {...restoreFocusSource}
            position="end"
            size="full"
            open={detailsOpen && selectedJob !== null}
            onOpenChange={(_, data) => setDetailsOpen(data.open)}
            aria-label="Request workspace"
          >
            <DrawerHeader>
              <DrawerHeaderTitle
                action={
                  <Button
                    appearance="subtle"
                    aria-label="Close details"
                    icon={<DismissRegular />}
                    onClick={() => setDetailsOpen(false)}
                  />
                }
              >
                Request workspace
              </DrawerHeaderTitle>
              {selectedJob && (
                <div className={styles.context}>
                  <Text
                    as="h2"
                    id={`request-${selectedJob.id}-title`}
                    size={400}
                    weight="semibold"
                    className={styles.panelTitle}
                  >
                    {selectedJob.customer.name} — {selectedJob.branch.name}
                  </Text>
                  <Text size={200}>
                    {selectedJob.reference} · {JOB_TYPE_LABEL[selectedJob.type]} ·{" "}
                    {selectedJob.branch.zone ?? "Zone not set"}
                  </Text>
                  <Text weight="semibold">{waitingLabel(describeWaitingTime(selectedJob))}</Text>
                </div>
              )}
              <TabList
                selectedValue={workspaceTab}
                onTabSelect={(_, data) => setWorkspaceTab(data.value as "details" | "choices")}
              >
                <Tab value="details" id="workspace-details">
                  Details
                </Tab>
                <Tab value="choices" id="workspace-choices">
                  Van choices
                </Tab>
              </TabList>
            </DrawerHeader>
            <DrawerBody>
              {noticeInDrawer && jobActions.notice}
              {selectedJob && (
                <div
                  role="tabpanel"
                  aria-labelledby={workspaceTab === "details" ? "workspace-details" : "workspace-choices"}
                  className={styles.panel}
                >
                  {workspaceTab === "details" ? (
                    <RequestDetails
                      key={selectedJob.id}
                      job={selectedJob}
                      boardDate={board.date}
                      eligibility={eligibility}
                      onRetryEligibility={retryEligibility}
                      hideHeader
                    />
                  ) : (
                    <>
                      {selectedJob.status === "REQUESTED" && (
                        <EligibilitySummary state={eligibility} onRetry={retryEligibility} />
                      )}
                      <VanList
                        vans={board.vans}
                        boardDate={board.date}
                        selectedJob={selectedJob}
                        eligibility={ranking}
                      />
                    </>
                  )}
                </div>
              )}
            </DrawerBody>
            <DrawerFooter className={styles.footer}>{jobActions.actionButton}</DrawerFooter>
          </OverlayDrawer>
        </>
      )}
      {board && !narrow && (
        <div className={styles.columns}>
          <section className={mergeClasses(styles.panel, styles.scroller)} aria-labelledby="requests-title">
            <Text as="h2" id="requests-title" size={400} weight="semibold" className={styles.panelTitle}>
              Requests
            </Text>
            <RequestList
              awaiting={board.openRequests}
              assigned={board.assignedWork}
              selectedId={selectedId}
              onSelect={select}
            />
          </section>
          <div ref={detailsPanelRef} className={mergeClasses(styles.panel, styles.scroller)}>
            <section className={styles.surface} aria-label="Selected request">
              {selectedJob ? (
                <RequestDetails
                  key={selectedJob.id}
                  job={selectedJob}
                  boardDate={board.date}
                  eligibility={eligibility}
                  onRetryEligibility={retryEligibility}
                  actions={jobActions.actionButton}
                />
              ) : (
                <Text className={styles.hint}>Select a request to see its details and which vans can take it.</Text>
              )}
            </section>
            <section className={styles.panel} aria-labelledby="vans-title">
              <Text as="h2" id="vans-title" size={400} weight="semibold" className={styles.panelTitle}>
                Van choices ({board.vans.length})
              </Text>
              <VanList vans={board.vans} boardDate={board.date} selectedJob={selectedJob} eligibility={ranking} />
            </section>
          </div>
        </div>
      )}
      {jobActions.dialogs}
    </div>
  );
}
