-- ============================================================
-- DATOS DE PRUEBA
-- Ejecutar en el SQL Editor de Supabase después de sql/schema.sql
-- ============================================================

-- ---------- Usuario admin de prueba ----------
-- Usuario: admin / Contraseña: admin123
-- (Cambiar esta contraseña antes de usar en producción)
insert into admin_users (username, password_hash)
values ('admin', extensions.crypt('admin123', extensions.gen_salt('bf')))
on conflict (username) do nothing;

-- ---------- Canchas ----------
insert into courts (name, open_time, close_time, is_active) values
  ('Cancha 1', '19:00', '22:00', true),
  ('Cancha 2', '18:00', '22:00', true),
  ('Cancha 3 (fútbol 5)', '06:00', '12:00', true),
  ('Cancha 4 (en mantenimiento)', '08:00', '20:00', false);

-- ---------- Reservas de ejemplo para HOY ----------
-- (usa subconsultas por nombre para no depender de UUIDs fijos)
insert into reservations (court_id, cedula, reservation_date, start_time, end_time, status)
values
  (
    (select id from courts where name = 'Cancha 1'),
    '12345678',
    current_date,
    '19:00', '20:00',
    'confirmed'
  ),
  (
    (select id from courts where name = 'Cancha 2'),
    '87654321',
    current_date,
    '18:00', '19:00',
    'confirmed'
  ),
  (
    (select id from courts where name = 'Cancha 3 (fútbol 5)'),
    '11223344',
    current_date,
    '07:00', '08:00',
    'cancelled'
  );

-- ---------- Reservas de ejemplo para MAÑANA ----------
insert into reservations (court_id, cedula, reservation_date, start_time, end_time, status)
values
  (
    (select id from courts where name = 'Cancha 1'),
    '99887766',
    current_date + interval '1 day',
    '20:00', '21:00',
    'confirmed'
  ),
  (
    (select id from courts where name = 'Cancha 2'),
    '55667788',
    current_date + interval '1 day',
    '21:00', '22:00',
    'confirmed'
  );
