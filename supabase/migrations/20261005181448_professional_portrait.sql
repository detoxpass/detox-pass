-- Foto pública do catálogo. O arquivo fica no app, o caminho fica na ficha.

alter table public.professionals
  add column portrait_path text;

comment on column public.professionals.portrait_path is
  'Caminho público da foto, servido pelo app. Não guarda segredo.';
