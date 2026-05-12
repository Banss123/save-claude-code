delete from public.app_settings
where key = 'app_theme_mode';

update public.communications
set channel_code = 'other'
where channel_code = 'discord';

delete from public.communication_channels
where code = 'discord';
