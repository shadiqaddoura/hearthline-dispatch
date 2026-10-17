import type { DataResetPreview, DataResetResult } from "@/lib/contracts/data-reset";
import { getJson, sendJson } from "./client";

export const dataResetApi = {
  preview: (signal?: AbortSignal) => getJson<DataResetPreview>("/api/settings/data-reset", { signal }),
  clear: (confirmation: string, expected: DataResetPreview["counts"]) =>
    sendJson<DataResetResult>("POST", "/api/settings/data-reset", { confirmation, expected }),
};
