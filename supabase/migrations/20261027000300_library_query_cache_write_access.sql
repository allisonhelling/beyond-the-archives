-- Query matching now writes revision-scoped caches. PostgREST runs STABLE
-- functions in read-only transactions, even when invoked with POST.
alter function public.query_library(jsonb,integer,integer) volatile;

notify pgrst, 'reload schema';
