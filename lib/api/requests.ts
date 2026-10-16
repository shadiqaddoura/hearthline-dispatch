import { getJson, sendJson, deleteJson } from "./client";
import type {
  CreateJobRequest,
  UpdateJobRequest,
  JobDto,
} from "@/lib/contracts/jobs";
import type { ProductDto } from "@/lib/contracts/products";
export interface CustomerOption {
  id: string;
  name: string;
  branches: { id: string; name: string }[];
}
export const loadRequestOptions = async () => {
  const [customers, products] = await Promise.all([
    getJson<CustomerOption[]>("/api/customers"),
    getJson<ProductDto[]>("/api/products"),
  ]);
  return { customers, products };
};
export const createRequest = (input: CreateJobRequest) =>
  sendJson<JobDto>("POST", "/api/jobs", input);
export const editRequest = (id: string, input: UpdateJobRequest) =>
  sendJson<JobDto>("PATCH", `/api/jobs/${encodeURIComponent(id)}`, input);
export const deleteRequest = (id: string) =>
  deleteJson<{ id: string }>(`/api/jobs/${encodeURIComponent(id)}`);
export const cancelRequest = (
  id: string,
  reason: string,
  cancelledBy: string,
) =>
  sendJson<JobDto>("POST", `/api/jobs/${encodeURIComponent(id)}/cancel`, {
    reason,
    cancelledBy,
  });
