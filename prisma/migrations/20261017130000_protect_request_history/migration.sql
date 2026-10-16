ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_jobId_fkey";
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Optional operational references must never silently detach when a job is deleted.
-- The import relationship points outwards, so it also needs a database backstop.
CREATE FUNCTION protect_request_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'REQUESTED' OR OLD."vanId" IS NOT NULL OR OLD."technicianId" IS NOT NULL
    OR OLD."assignedAt" IS NOT NULL OR OLD."startedAt" IS NOT NULL OR OLD."completedOn" IS NOT NULL
    OR OLD."cancelledAt" IS NOT NULL OR OLD."importRowId" IS NOT NULL OR OLD."sourceStatus" IS NOT NULL
    OR EXISTS (SELECT 1 FROM reservations WHERE "jobId" = OLD.id)
    OR EXISTS (SELECT 1 FROM stock_movements WHERE "jobId" = OLD.id)
    OR EXISTS (SELECT 1 FROM job_completions WHERE "jobId" = OLD.id) THEN
    RAISE EXCEPTION 'Request has protected operational or import history' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER protect_request_history BEFORE DELETE ON jobs FOR EACH ROW EXECUTE FUNCTION protect_request_history();
