-- Additive only: legacy hubs remain uncounted; no historical stock is fabricated.
ALTER TABLE "locations" ADD COLUMN "inventoryTracked" BOOLEAN NOT NULL DEFAULT false;
-- The current restocking model has one canonical hub. Fail rather than merge data
-- if an installation contains ambiguous hubs requiring operator review.
CREATE UNIQUE INDEX "locations_single_hub" ON "locations" (kind) WHERE kind = 'HUB';
