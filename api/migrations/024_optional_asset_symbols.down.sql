update assets
set symbol = 'ASSET-' || upper(substr(id::text, 1, 8))
where symbol is null;

alter table assets
  alter column symbol set not null;
