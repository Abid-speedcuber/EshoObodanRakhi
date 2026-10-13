-- Keep each dedicated collection and its donation together in one fund record.
-- Existing collections retain their amounts and default to regular collections.
ALTER TABLE public.fund
  ADD COLUMN is_dedicated boolean NOT NULL DEFAULT false,
  ADD COLUMN dedicated_donation numeric;

ALTER TABLE public.fund ADD CONSTRAINT eor_dedicated_collection_check CHECK (
  (NOT is_dedicated AND dedicated_donation IS NULL)
  OR
  (is_dedicated AND type = 'income' AND name IS NOT NULL AND btrim(name) <> ''
    AND amount IS NOT NULL AND amount >= 0 AND amount < 'Infinity'::numeric
    AND dedicated_donation IS NOT NULL
    AND dedicated_donation >= 0 AND dedicated_donation < 'Infinity'::numeric)
);
COMMENT ON COLUMN public.fund.is_dedicated IS 'Purpose-specific collection; excluded from regular fund income.';
COMMENT ON COLUMN public.fund.dedicated_donation IS 'Total donated for the dedicated collection; only greatest(dedicated_donation - amount, 0) is charged to the main fund.';
