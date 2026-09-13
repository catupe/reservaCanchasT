# Reserva de Canchas

Sistema web de reserva de canchas. Vite + JavaScript vanilla + Supabase.

## Reglas de negocio implementadas

- Cantidad de canchas configurable desde el panel de admin.
- Reservas solo entre 06:00 y 22:00 (por cancha, dentro de ese margen).
- Solo se puede reservar para **hoy o mañana**.
- Se requiere cédula para reservar.
- Una cédula = una reserva por día (a nivel base de datos, con índice único).
- Reservas de 1 hora exactas.
- Horario habilitado configurable por cancha (ej: cancha 1 de 19 a 22hs).
- Panel de administración con login propio (usuario/contraseña).
- El cliente puede cancelar su propia reserva ingresando su cédula.

## 1. Crear el proyecto en Supabase

1. Creá un proyecto en https://supabase.com.
2. Andá a **SQL Editor** y ejecutá el contenido de `sql/schema.sql`.
3. Creá el primer usuario administrador ejecutando (cambiando usuario/clave):
   ```sql
   insert into admin_users (username, password_hash)
   values ('admin', crypt('tu-clave-segura', gen_salt('bf')));
   ```
4. Copiá la **URL** del proyecto y la **anon key** (Project Settings → API).

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

## Seguridad — versión actual (simple) y próximos pasos

Esta primera versión prioriza simplicidad para arrancar rápido. El acceso de
escritura a `courts` y `reservations` está abierto a través de la `anon key`
(protegido solo por la interfaz), y la sesión de admin es un simple flag en
`localStorage`. El login en sí NO expone la contraseña ni el hash: se valida
con la función `admin_login` (`security definer`) en Postgres.

Cuando quieras endurecerlo, en `sql/schema.sql` (sección final) están
documentados los pasos: sesiones con token validado server-side vía RPC,
mover la cancelación de reservas a una función que verifique la cédula en el
servidor, y opcionalmente migrar `admin_users` a Supabase Auth.

## Estructura

```
index.html          → página pública de reserva
admin.html           → login + panel de administración
src/main.js          → lógica de la página pública
src/admin.js          → lógica de login/panel admin
src/lib/api.js       → todas las llamadas a Supabase
src/lib/dateUtils.js → reglas de fechas/horarios (hoy/mañana, bloques de 1h)
src/lib/supabaseClient.js → cliente de Supabase
sql/schema.sql       → estructura de la base de datos
```
