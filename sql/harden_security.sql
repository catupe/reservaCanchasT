-- ============================================================
-- MIGRACIÓN: Endurecer seguridad
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que
-- ya corrió sql/schema.sql (versión anterior, "simple").
-- No borra datos existentes.
-- ============================================================

-- ========================================
-- 1. Sesiones de admin (para el login propio)
-- ========================================
create table if not exists admin_sessions (
  token uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admin_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '8 hours')
);

alter table admin_sessions enable row level security;
-- Sin policies para anon: esta tabla solo se toca desde funciones
-- security definer (admin_login / admin_logout / assert_admin).

-- ========================================
-- 2. Sacar las policies abiertas de la versión "simple"
-- ========================================
drop policy if exists "courts_write_public" on courts;
drop policy if exists "reservations_write_public" on reservations;
drop policy if exists "app_settings_write_public" on app_settings;
drop policy if exists "reservations_select_public" on reservations;
-- courts_select_public y app_settings_select_public quedan (no son sensibles).

-- A partir de acá, "reservations" no tiene NINGUNA policy para anon:
-- ni lectura ni escritura directa. Todo pasa por funciones de abajo.

-- ========================================
-- 3. Vista pública de disponibilidad (sin cédula)
-- ========================================
-- El front público la usa para calcular horarios libres, sin exponer
-- la cédula de nadie.
create or replace view public_court_slots as
select court_id, reservation_date, start_time, end_time
from reservations
where status = 'confirmed';

grant select on public_court_slots to anon, authenticated;

-- ========================================
-- 4. Helper: validar token de admin
-- ========================================
create or replace function assert_admin(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
begin
  select admin_id into v_admin_id
  from admin_sessions
  where token = p_token
    and expires_at > now();

  if v_admin_id is null then
    raise exception 'Sesión inválida o expirada. Iniciá sesión nuevamente.';
  end if;

  return v_admin_id;
end;
$$;

-- ========================================
-- 5. Login / logout de admin (ahora con sesión)
-- ========================================
drop function if exists admin_login(text, text);

create or replace function admin_login(p_username text, p_password text)
returns table (id uuid, username text, token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin admin_users;
  v_token uuid;
  v_expires timestamptz;
begin
  select * into v_admin
  from admin_users
  where username = p_username
    and password_hash = extensions.crypt(p_password, password_hash);

  if not found then
    raise exception 'Usuario o contraseña incorrectos.';
  end if;

  v_expires := now() + interval '8 hours';

  insert into admin_sessions (admin_id, expires_at)
  values (v_admin.id, v_expires)
  returning token into v_token;

  return query select v_admin.id, v_admin.username, v_token, v_expires;
end;
$$;

create or replace function admin_logout(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from admin_sessions where token = p_token;
$$;

-- ========================================
-- 6. Crear una reserva (TODA la validación server-side)
-- ========================================
create or replace function create_reservation(
  p_court_id uuid,
  p_cedula text,
  p_reservation_date date,
  p_start_time time
)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court courts;
  v_end_time time;
  v_today date;
  v_now_time time;
  v_result reservations;
begin
  if p_cedula !~ '^\d{6,8}$' then
    raise exception 'La cédula ingresada no es válida.';
  end if;

  -- "Hoy" según la hora de Uruguay, no la del navegador del cliente.
  v_today := (now() at time zone 'America/Montevideo')::date;
  v_now_time := (now() at time zone 'America/Montevideo')::time;

  if p_reservation_date not in (v_today, v_today + 1) then
    raise exception 'Solo se puede reservar para hoy o mañana.';
  end if;

  if p_reservation_date = v_today and p_start_time <= v_now_time then
    raise exception 'Ese horario ya pasó.';
  end if;

  select * into v_court from courts where id = p_court_id and is_active = true;
  if not found then
    raise exception 'La cancha seleccionada no existe o no está activa.';
  end if;

  v_end_time := p_start_time + interval '1 hour';

  if p_start_time < v_court.open_time or v_end_time > v_court.close_time then
    raise exception 'Ese horario está fuera del rango habilitado para esta cancha.';
  end if;

  if p_start_time < time '06:00' or v_end_time > time '22:00' then
    raise exception 'Las reservas solo se permiten entre las 06:00 y las 22:00.';
  end if;

  begin
    insert into reservations (court_id, cedula, reservation_date, start_time, end_time, status)
    values (p_court_id, p_cedula, p_reservation_date, p_start_time, v_end_time, 'confirmed')
    returning * into v_result;
  exception
    when unique_violation then
      if SQLERRM like '%uniq_cedula_per_day%' then
        raise exception 'Esa cédula ya tiene una reserva para ese día.';
      else
        raise exception 'Ese horario ya fue reservado por otra persona. Elegí otro.';
      end if;
  end;

  return v_result;
end;
$$;

-- ========================================
-- 7. Ver y cancelar MIS reservas (por cédula)
-- ========================================
create or replace function get_my_reservations(p_cedula text)
returns table (
  id uuid,
  court_name text,
  reservation_date date,
  start_time time,
  end_time time
)
language sql
security definer
set search_path = public
as $$
  select r.id, c.name as court_name, r.reservation_date, r.start_time, r.end_time
  from reservations r
  join courts c on c.id = r.court_id
  where r.cedula = p_cedula
    and r.status = 'confirmed'
  order by r.reservation_date, r.start_time;
$$;

create or replace function cancel_my_reservation(p_reservation_id uuid, p_cedula text)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result reservations;
begin
  update reservations
  set status = 'cancelled', cancelled_at = now()
  where id = p_reservation_id
    and cedula = p_cedula
    and status = 'confirmed'
  returning * into v_result;

  if not found then
    raise exception 'No se encontró una reserva activa con esa cédula.';
  end if;

  return v_result;
end;
$$;

-- ========================================
-- 8. Administración de canchas (requiere token)
-- ========================================
create or replace function admin_create_court(
  p_token uuid, p_name text, p_open_time time, p_close_time time
)
returns courts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result courts;
begin
  perform assert_admin(p_token);

  if p_open_time >= p_close_time then
    raise exception 'El horario "desde" debe ser anterior al horario "hasta".';
  end if;

  insert into courts (name, open_time, close_time, is_active)
  values (p_name, p_open_time, p_close_time, true)
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function admin_update_court(
  p_token uuid, p_court_id uuid, p_name text, p_open_time time,
  p_close_time time, p_is_active boolean
)
returns courts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result courts;
begin
  perform assert_admin(p_token);

  if p_open_time >= p_close_time then
    raise exception 'El horario "desde" debe ser anterior al horario "hasta".';
  end if;

  update courts
  set name = p_name, open_time = p_open_time, close_time = p_close_time, is_active = p_is_active
  where id = p_court_id
  returning * into v_result;

  if not found then
    raise exception 'Cancha no encontrada.';
  end if;

  return v_result;
end;
$$;

create or replace function admin_delete_court(p_token uuid, p_court_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_admin(p_token);
  delete from courts where id = p_court_id;
end;
$$;

-- ========================================
-- 9. Administración de reservas (requiere token)
-- ========================================
create or replace function admin_cancel_reservation(p_token uuid, p_reservation_id uuid)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result reservations;
begin
  perform assert_admin(p_token);

  update reservations
  set status = 'cancelled', cancelled_at = now()
  where id = p_reservation_id
    and status = 'confirmed'
  returning * into v_result;

  if not found then
    raise exception 'Reserva no encontrada o ya cancelada.';
  end if;

  return v_result;
end;
$$;

create or replace function admin_list_reservations(p_token uuid, p_date date)
returns table (
  id uuid, court_name text, cedula text, start_time time, end_time time, status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_admin(p_token);

  return query
  select r.id, c.name, r.cedula, r.start_time, r.end_time, r.status
  from reservations r
  join courts c on c.id = r.court_id
  where r.reservation_date = p_date
  order by r.start_time;
end;
$$;
