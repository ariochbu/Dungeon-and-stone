# Dungeon & Stone — versión con backend

Sitio 100% estático (HTML/CSS/JS con módulos ES, sin paso de build) + Supabase
como backend (Postgres + Auth + Row Level Security). No hace falta Node.js ni
ninguna instalación para desplegarlo: Vercel/Netlify sirven los archivos tal
cual desde el repositorio.

## Estructura

```
index.html              pantallas (login, creación, juego) y esqueleto HTML
src/styles.css          todo el CSS del juego
src/config.js           URL + anon key de tu proyecto Supabase (rellenar)
src/supabaseClient.js   cliente de Supabase (via CDN, sin npm install)
src/auth.js             login/registro/Google/logout
src/game.js             el juego completo (datos, combate, UI, guardado)
supabase/migrations/0001_init.sql   esquema de base de datos completo
```

## 1. Crear el proyecto Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pega y ejecuta el contenido de
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   Esto crea las tablas `profiles`/`characters`, las políticas de seguridad
   (RLS), las funciones de validación y la vista de ranking.
3. En **Authentication → Providers**, confirma que **Email** esté activo.
   Si quieres que los jugadores entren inmediatamente tras registrarse (sin
   confirmar el correo primero), desactiva "Confirm email" en
   **Authentication → Settings** — el código ya soporta ambos casos, pero la
   experiencia es más simple sin confirmación para un juego casual.
4. Para el login con Google: **Authentication → Providers → Google**, actívalo
   y pega el Client ID/Secret de un proyecto en
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (tipo "OAuth client ID", "Web application"). Como Authorized redirect URI
   usa la que Supabase te muestra en esa misma pantalla
   (`https://TU-PROYECTO.supabase.co/auth/v1/callback`).
5. En **Project Settings → API**, copia la **Project URL** y la **anon public
   key** y pégalas en [`src/config.js`](src/config.js). No es información
   secreta (está protegida por RLS, no por ocultarla), así que es seguro
   subir ese archivo al repositorio.

## 2. Probar en local

No hace falta compilar nada, pero sí un servidor HTTP (los módulos ES no
funcionan abriendo el archivo directamente con `file://`):

```bash
python -m http.server 5173
```

y abre `http://localhost:5173`. (Cualquier otro servidor estático — `npx serve`,
la extensión Live Server de VS Code, etc. — funciona igual.)

## 3. Subir a GitHub

Esta máquina no tiene Git instalado. Instala [Git para Windows](https://git-scm.com/download/win)
o usa [GitHub Desktop](https://desktop.github.com/), y desde la carpeta
`dungeon-and-stone`:

```bash
git init
git add .
git commit -m "Dungeon & Stone: backend Supabase"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/dungeon-and-stone.git
git push -u origin main
```

## 4. Conectar Vercel o Netlify

Cualquiera de las dos funciona sin configuración especial:

- **Vercel**: "Add New Project" → importa el repo de GitHub → Framework
  Preset "Other" → sin build command → Output Directory `.` → Deploy.
- **Netlify**: "Add new site" → "Import an existing project" → GitHub → el
  repo ya trae [`netlify.toml`](netlify.toml) con `publish = "."`, así que no
  hay que tocar nada más.

Cada `git push` a `main` vuelve a desplegar solo.

## Cómo darte a ti mismo el rol de administrador

Por ahora no hay panel de admin en la interfaz (queda para una siguiente
iteración); el campo ya existe en la base de datos. Para probarlo, en el SQL
Editor de Supabase:

```sql
update public.profiles set role = 'admin' where username = 'tu_usuario';
```

Esto es intencionalmente independiente de quién puede hacer `git push` al
repositorio o desplegar en Vercel/Netlify (eso lo controlan los permisos del
repo de GitHub y del proyecto en Vercel/Netlify, no esta tabla).

## Qué falta para las fases siguientes

- Panel de administración en la UI (banear jugadores, ver la lista de
  cuentas) — el esquema y las políticas ya lo soportan, falta la pantalla.
- Auditoría de responsividad dedicada a fondo en combate/mapa del laberinto
  con dispositivos reales (se probó lo esencial en móvil/escritorio, pero
  como fase aparte pediste una revisión completa).
