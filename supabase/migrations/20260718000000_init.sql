-- GolfBuddy: esquema inicial.
-- Cómo aplicarlo: en el panel de Supabase, abre "SQL Editor", pega todo
-- este archivo y presiona "Run".

-- Tabla de colecciones: guarda los datos de la app (jugadores, comunidades,
-- canchas, rondas y eventos) como documentos JSON, uno por colección.
create table if not exists public.collections (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.collections enable row level security;

-- Solo usuarios con cuenta (autenticados) pueden leer y escribir.
create policy "authenticated can read"
  on public.collections for select
  to authenticated
  using (true);

create policy "authenticated can insert"
  on public.collections for insert
  to authenticated
  with check (true);

create policy "authenticated can update"
  on public.collections for update
  to authenticated
  using (true);
