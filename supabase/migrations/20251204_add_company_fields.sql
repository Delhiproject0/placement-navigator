-- Migration: add registration_deadline and cgpa_cutoff to companies
-- Date: 2025-12-04

BEGIN;

-- 1) Add new columns
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cgpa_cutoff NUMERIC(3,2);

-- 2) Optional: index registration_deadline for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_companies_registration_deadline ON public.companies (registration_deadline);

-- 3) Optional: create a canonical selections table for accepted applicants
--    (recommended if you want a single source of truth rather than parsing free-text 'result')
CREATE TABLE IF NOT EXISTS public.company_selections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_selections_company_id ON public.company_selections (company_id);

COMMIT;
