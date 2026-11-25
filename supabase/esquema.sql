-- Mercado: esquema para sincronizar entre dispositivos.
-- Pegar completo en Supabase → SQL Editor → Run. Se puede correr más de una vez.
--
-- Cada tabla guarda el registro tal como lo usa la app (datos jsonb) más lo que hace falta para sincronizar:
--   actualizado_en  reloj del dispositivo que hizo el cambio (ms); gana el más reciente
--   borrado         los borrados se marcan para que no reaparezcan en otro dispositivo
--   modificado      hora del servidor del último cambio; los dispositivos bajan lo modificado desde su última vez
-- Solo el dueño (auth.uid()) ve y cambia sus filas (Row Level Security).

create or replace function public.mercado_ultimo_gana() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.actualizado_en < old.actualizado_en then
      return old;                    -- llegó un cambio más viejo: se ignora
    end if;
    new.user_id := old.user_id;
  else
    new.user_id := coalesce(new.user_id, auth.uid());
  end if;
  new.modificado := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['mercados', 'productos', 'ofertas', 'lista', 'compras'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id text primary key,
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        datos jsonb,
        actualizado_en bigint not null,
        borrado boolean not null default false,
        modificado timestamptz not null default now()
      );
      create index if not exists %1$s_usuario_modificado on public.%1$I (user_id, modificado);
      alter table public.%1$I enable row level security;
      drop policy if exists "solo el dueño" on public.%1$I;
      create policy "solo el dueño" on public.%1$I for all to authenticated
        using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
      grant select, insert, update on public.%1$I to authenticated;
      revoke all on public.%1$I from anon;
      drop trigger if exists ultimo_gana on public.%1$I;
      create trigger ultimo_gana before insert or update on public.%1$I
        for each row execute function public.mercado_ultimo_gana();
    $f$, t);
  end loop;
end $$;

-- Productos repetidos: un solo producto vivo por nombre (sin mayúsculas, tildes ni espacios de más).
alter table public.productos add column if not exists nombre_normalizado text;
create unique index if not exists productos_nombre_unico
  on public.productos (user_id, nombre_normalizado) where not borrado;

-- Fotos: bucket privado; cada usuario solo en su carpeta <user_id>/...
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
  on conflict (id) do nothing;
drop policy if exists "fotos del dueño" on storage.objects;
create policy "fotos del dueño" on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Para que el proyecto gratis no se pause por inactividad: GitHub lo "toca" dos veces por semana.
create or replace function public.mercado_ping() returns integer language sql stable as $$ select 1 $$;
grant execute on function public.mercado_ping() to anon, authenticated;
