-- Products can now be created and edited by people, so the database holds the rules too.
--
-- The unique index on "sku" is case-sensitive, so on its own "prn-80" and "PRN-80" could
-- both exist. Requiring the stored SKU to be in canonical form (upper case, no spaces,
-- letters and digits joined by - . _) makes that index a case-insensitive one. The
-- application canonicalises before saving; this stops anything else from bypassing it.
ALTER TABLE "products" ADD CONSTRAINT "products_sku_canonical_check"
  CHECK ("sku" ~ '^[A-Z0-9]+([-._][A-Z0-9]+)*$' AND char_length("sku") <= 32);

-- Quantities are whole numbers and a minimum is never negative.
ALTER TABLE "products" ADD CONSTRAINT "products_van_minimum_check" CHECK ("vanMinimum" >= 0);

-- A pack needs both a name and a size, and a pack of one is not a pack.
ALTER TABLE "products" ADD CONSTRAINT "products_pack_check"
  CHECK (("packUnit" IS NULL AND "packSize" IS NULL) OR ("packUnit" IS NOT NULL AND "packSize" IS NOT NULL AND "packSize" >= 2));
