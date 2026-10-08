-- 0009_cron.sql — tick de automatizaciones cada minuto (el secreto vive en Vault: 'cron_secret')
select cron.schedule(
  'automation-tick',
  '* * * * *',
  $$select net.http_post(
      url := 'https://snfifjecgmjerdcfvhzp.supabase.co/functions/v1/automation-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{}'::jsonb)$$
);
