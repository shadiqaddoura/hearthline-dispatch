"use client";

import { Badge } from "@fluentui/react-components";
import type { JobDto } from "@/lib/contracts/jobs";
import { BLOCKING_REASON_LABEL, JOB_STATUS_LABEL } from "@/lib/dispatch/presentation";

export function JobStatusBadge({ status }: { status: JobDto["status"] }) {
  const color = status === "REQUESTED" ? "informative" : status === "IN_PROGRESS" ? "brand" : "success";
  return (
    <Badge appearance="tint" color={color} shape="rounded">
      {JOB_STATUS_LABEL[status]}
    </Badge>
  );
}

export function BlockingBadge({ reason }: { reason: NonNullable<JobDto["blockingReason"]> }) {
  return (
    <Badge appearance="tint" color={reason === "IMPORT_NEEDS_REVIEW" ? "warning" : "danger"} shape="rounded">
      {BLOCKING_REASON_LABEL[reason]}
    </Badge>
  );
}
