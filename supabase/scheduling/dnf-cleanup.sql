-- Run after applying 20261024000200_dnf_cleanup.sql and enabling pg_cron.
-- Executes in PostgreSQL while the app is closed; no browser or AO3 requests.
select cron.schedule('dnf-cleanup', '17 * * * *', $schedule$
 select public.run_scheduled_dnf_cleanup();
$schedule$);
-- To stop: select cron.unschedule('dnf-cleanup');
