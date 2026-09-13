-- ============================================================
-- ESQUEMA: Sistema de Reserva de Canchas
-- Versión: MVP simple. Ver sección "PENDIENTE PARA ENDURECER"
-- al final para la evolución a una versión más robusta.
-- ============================================================

create extension if not exists pgcrypto;

-- ========================================
-- 1. CONFIGURACIÓN GLOBAL (ventana horaria general)
-- ========================================
create table app_settings (
  id boolean primary key default true, -- fila única
  global_open_time time not null default '06:00',
  global_close_time time not null default '22:00',
  constraint app_settings_singleton check (id)
);

insert into app_settings (id) values (true);

-- ========================================
-- 2. CANCHAS
-- ========================================
create table courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  open_time time not null,   -- ej: 18:00
  close_time time not null,  -- ej: 22:00
  created_at timestamptz not null default now(),
  constraint open_before_close check (open_time < close_time)
);

-- ========================================
-- 3. RESERVAS
-- ========================================
create table reservations (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  cedula text not null,
  reservation_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

-- Evita doble reserva del mismo horario en la misma cancha
create unique index uniq_court_slot
  on reservations (court_id, reservation_date, start_time)
  where status = 'confirmed';

-- Evita que una cédula reserve más de una cancha el mismo día
create unique index uniq_cedula_per_day
  on reservations (cedula, reservation_date)
  where status = 'confirmed';

create index idx_reservations_date on reservations (reservation_date);

-- ========================================
-- 4. USUARIOS ADMIN
-- ========================================
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null, -- crypt(password, gen_salt('bf'))
  created_at timestamptz not null default now()
);

-- Función de login: es la ÚNICA puerta de entrada a admin_users,
-- así el hash nunca se expone al cliente.
create or replace function admin_login(p_username text, p_password text)
returns table (id uuid, username text)
language sql
security definer
set search_path = public
as $$
  select id, username
  from admin_users
  where username = p_username
    and password_hash = crypt(p_password, password_hash);
$$;

-- Ejemplo para crear el primer usuario admin (ejecutar manualmente,
-- cambiando usuario/contraseña):
-- insert into admin_users (username, password_hash)
-- values ('admin', crypt('cambiar-esta-clave', gen_salt('bf')));

-- ========================================
-- 5. ROW LEVEL SECURITY (versión simple)
-- ========================================
alter table courts enable row level security;
alter table reservations enable row level security;
alter table admin_users enable row level security;
alter table app_settings enable row level security;

-- Lectura pública (necesaria para que cualquiera vea canchas y disponibilidad)
create policy "courts_select_public" on courts for select using (true);
create policy "reservations_select_public" on reservations for select using (true);
create policy "app_settings_select_public" on app_settings for select using (true);

-- Escritura pública TEMPORAL (simple, se endurece más adelante).
-- El front-end de admin usa estas mismas políticas por ahora.
create policy "courts_write_public" on courts for all using (true) with check (true);
create policy "reservations_write_public" on reservations for all using (true) with check (true);
create policy "app_settings_write_public" on app_settings for all using (true) with check (true);

-- admin_users: SIN acceso público directo (ni select). Solo se llega
-- a través de la función admin_login (security definer).
-- (No se crea ninguna policy de select/insert/update para anon.)

-- ============================================================
-- PENDIENTE PARA ENDURECER (próxima etapa)
-- ============================================================
-- 1. Reemplazar las policies "_write_public" por policies reales
--    basadas en sesión: crear tabla admin_sessions (token, admin_id,
--    expires_at) y exponer las escrituras solo vía funciones RPC
--    security definer que validen el token recibido.
-- 2. Mover la lógica de "cancelar mi reserva" (hoy: update directo
--    filtrando por cédula desde el cliente) a una función RPC que
--    valide server-side que la cédula coincide.
-- 3. Migrar admin_users a Supabase Auth si se quiere login más
--    estándar (recuperación de contraseña, 2FA, etc.).
-- 4. Agregar rate limiting / captcha en el formulario público para
--    evitar reservas automatizadas.
-- ============================================================
