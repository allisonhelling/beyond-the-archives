-- Run AFTER deploying import-worker, enabling pg_cron + pg_net, and adding two Vault secrets:
-- import_worker_url = https://<project-ref>.supabase.co/functions/v1/import-worker
-- import_worker_token = same random secret configured as IMPORT_WORKER_TOKEN in Edge Functions
-- Never substitute credentials into this file or commit a populated copy.
select cron.schedule('ao3-metadata-worker', '* * * * *', $schedule$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='import_worker_url'),
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
   (select decrypted_secret from vault.decrypted_secrets where name='import_worker_token')),
  body := '{}'::jsonb,
  timeout_milliseconds := 110000
 );
$schedule$);
-- To stop the schedule: select cron.unschedule('ao3-metadata-worker');
