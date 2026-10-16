-- Assigned jobs whose van no longer holds enough stock for their reservations
-- (for example after a lower stock count) are flagged with this reason.
ALTER TYPE "BlockingReason" ADD VALUE 'RESERVATION_SHORTFALL';
