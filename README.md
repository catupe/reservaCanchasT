# Reserva de Canchas

Sistema web de reserva de canchas. Vite + JavaScript vanilla + Supabase.

## Reglas de negocio implementadas

- Cantidad de canchas configurable desde el panel de admin.
- Reservas solo entre 06:00 y 22:00 (por cancha, dentro de ese margen).
- Solo se puede reservar para **hoy o mañana** (calculado con la hora de
  Uruguay, no la del navegador del usuario).
- Se requiere cédula para reservar (se valida formato: 6 a 8 dígitos).
- Una cédula = una reserva por día (índice único en la base).
- Reservas de 1 hora exactas.
- Horario habilitado configurable por cancha (ej: cancha 1 de 19 a 22hs).
- Panel de administración con login propio (usuario/contraseña) y sesión
  por token validada en cada acción.
- El cliente puede cancelar su propia reserva ingresando su cédula.

**Toda esta lógica se valida en la base de datos (funciones `security
definer`), no solo en el JavaScript del navegador.** Nadie puede saltearla
llamando directo a la API de Supabase con la `anon key`. Ver la sección de
seguridad más abajo.

## 1. Crear el proyecto en Supabase (instalación nueva)

1. Creá un proyecto en https://supabase.com.
2. Andá a **SQL Editor** y ejecutá el contenido de `sql/schema.sql`.
3. Creá el primer usuario administrador (cambiando usuario/clave):
   ```sql
   insert into admin_users (username, password_hash)
   values ('admin', extensions.crypt('tu-clave-segura', extensions.gen_salt('bf')));
   ```
4. Copiá la **URL** del proyecto y la **anon key** (Project Settings → API).

### ¿Ya tenías el proyecto corriendo con la versión anterior (simple)?

No hace falta borrar nada. Ejecutá `sql/harden_security.sql` en el SQL
Editor — agrega las tablas/funciones que faltan y cierra los permisos
abiertos, sin tocar los datos que ya cargaste.

## 2. Configurar el proyecto local

```bash
cp .env.example .env
# completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env

npm install
npm run dev
```

- Sitio público: `http://localhost:5173/`
- Panel admin: `http://localhost:5173/admin.html`

## 3. Cargar canchas

Entrá al panel de admin, iniciá sesión, y creá las canchas con su nombre y
horario disponible (ej: Cancha 1, 19:00 a 22:00).

## 4. Cargar datos de prueba (opcional)

Corré `sql/seed.sql` en el SQL Editor (después de `schema.sql`). Crea:
- Un admin de prueba: usuario `admin`, contraseña `admin123`.
- 4 canchas de ejemplo (una inactiva, para probar ese caso).
- Reservas de ejemplo para hoy y mañana (incluye una cancelada).

## Seguridad

- `courts` (nombre/horario) y `app_settings` son de **lectura pública**;
  no tienen datos sensibles.
- `reservations` y `admin_users` **no tienen ninguna policy pública**: cero
  acceso directo desde el navegador, ni para leer ni para escribir.
- Todo pasa por funciones `security definer` en Postgres: `create_reservation`,
  `get_my_reservations`, `cancel_my_reservation` (público, siempre atado a
  una cédula) y `admin_create_court` / `admin_update_court` /
  `admin_delete_court` / `admin_cancel_reservation` / `admin_list_reservations`
  (exigen un token de sesión de admin, que se valida en cada llamada).
- La disponibilidad de horarios en el sitio público se lee de una vista
  (`public_court_slots`) que no expone cédulas.
- El login de admin (`admin_login`) nunca expone el hash de la contraseña
  al cliente; devuelve un token válido por 8 horas.

### Pendiente para una próxima etapa

Ver el final de `sql/schema.sql`. Lo principal: reemplazar la validación de
"formato de cédula" por un padrón real de socios (para que solo gente
registrada en el club pueda reservar, y para soportar otros tipos de
documento), rate limiting/CAPTCHA en el formulario público, y notificar al
socio si el admin cancela su reserva.

## Estructura

```
index.html                → página pública de reserva
admin.html                → login + panel de administración
src/main.js                → lógica de la página pública
src/admin.js               → lógica de login/panel admin
src/lib/api.js             → todas las llamadas a Supabase (RPCs)
src/lib/dateUtils.js       → reglas de fechas/horarios (hoy/mañana, bloques de 1h)
src/lib/supabaseClient.js  → cliente de Supabase
sql/schema.sql             → estructura completa (instalación nueva)
sql/harden_security.sql    → migración de seguridad (proyecto ya existente)
sql/seed.sql                → datos de prueba
```
