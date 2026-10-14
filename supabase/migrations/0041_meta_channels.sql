-- Canales de WhatsApp Business API (Meta): ids de la cuenta/número y token (60 días). El token NO es legible desde el navegador.
alter table public.channels
  add column if not exists meta_waba_id text,
  add column if not exists meta_phone_number_id text,
  add column if not exists meta_access_token text,
  add column if not exists meta_token_expires_at timestamptz;
create unique index if not exists channels_meta_phone_uq on public.channels (meta_phone_number_id) where meta_phone_number_id is not null;
