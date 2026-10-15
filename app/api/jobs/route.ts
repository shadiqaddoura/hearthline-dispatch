import { handle, readJson, readQuery } from "@/server/http/route";
import { createJob, listJobs } from "@/server/modules/jobs/jobs.service";
import { createJobRequest, listJobsQuery } from "@/lib/contracts/jobs";

export async function GET(request: Request) {
  return handle(async () => {
    const query = readQuery(request, listJobsQuery);
    return listJobs({ status: query.status, open: query.open === "true" });
  });
}

export async function POST(request: Request) {
  return handle(async () => createJob(await readJson(request, createJobRequest)), 201);
}
