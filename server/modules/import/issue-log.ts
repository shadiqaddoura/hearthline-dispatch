// Every doubt or decision the import makes is recorded against the row it came from.

export type Severity = "INFO" | "WARNING" | "ERROR";

export interface RowRef {
  sheet: string;
  rowNumber: number;
}

export interface PlannedIssue {
  ref: RowRef | null;
  severity: Severity;
  code: string;
  message: string;
}

export class IssueLog {
  readonly issues: PlannedIssue[] = [];

  /** Something was normalised or decided; worth knowing. */
  info(ref: RowRef | null, code: string, message: string) {
    this.issues.push({ ref, severity: "INFO", code, message });
  }

  /** Imported, but a person needs to confirm it. */
  warn(ref: RowRef | null, code: string, message: string) {
    this.issues.push({ ref, severity: "WARNING", code, message });
  }

  /** Could not be imported as written. */
  error(ref: RowRef | null, code: string, message: string) {
    this.issues.push({ ref, severity: "ERROR", code, message });
  }
}
