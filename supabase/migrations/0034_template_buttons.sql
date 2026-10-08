-- 0034_template_buttons.sql — botones de las plantillas: [{ type: 'quick_reply', text } | { type: 'url', text, url }]
alter table public.message_templates add column if not exists buttons jsonb not null default '[]';
