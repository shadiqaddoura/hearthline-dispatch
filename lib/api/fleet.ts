import { deleteJson, getJson, sendJson } from "./client";
import type { CreateVanRequest, TechnicianDto, UpdateVanRequest, VanDto } from "@/lib/contracts/fleet";
import type { JobDto } from "@/lib/contracts/jobs";
import type { LocationStockDto } from "@/lib/contracts/inventory";
const path = (id: string) => `/api/vans/${encodeURIComponent(id)}`;
export const fleetApi = {
  list: (signal?: AbortSignal) => getJson<VanDto[]>("/api/vans", { signal }),
  technicians: (signal?: AbortSignal) => getJson<TechnicianDto[]>("/api/technicians", { signal }),
  jobs: (signal?: AbortSignal) => getJson<JobDto[]>("/api/jobs?open=true", { signal }),
  stock: (id: string, signal?: AbortSignal) => getJson<LocationStockDto>(`${path(id)}/stock`, { signal }),
  create: (input: CreateVanRequest) => sendJson<VanDto>("POST", "/api/vans", input),
  update: (id: string, input: UpdateVanRequest) => sendJson<VanDto>("PATCH", path(id), input),
  remove: (id: string) => deleteJson<{ id: string }>(path(id)),
};
