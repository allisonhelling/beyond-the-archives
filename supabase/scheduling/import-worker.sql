-- Retirement procedure; run only with explicit production approval.
-- No schedule is created. Applying app migrations does not modify pg_cron.
select cron.unschedule(jobid) from cron.job where jobname = 'ao3-metadata-worker';
-- After verifying extension imports, remove IMPORT_WORKER_TOKEN and the Vault
-- import_worker_url/import_worker_token secrets through your approved operations workflow.
