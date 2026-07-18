/*
  Credenciales del proyecto Supabase.
  Se encuentran en el panel de Supabase: Project Settings → API.

  - SUPABASE_URL: la "Project URL" (ej. https://abcdefgh.supabase.co)
  - SUPABASE_ANON_KEY: la clave "anon / public"

  Estos dos valores son públicos por diseño (la seguridad la dan las
  políticas RLS de la base de datos), así que está bien tenerlos aquí.

  Si se dejan vacíos, la app funciona en MODO LOCAL: los datos se guardan
  solo en el navegador de cada usuario, con la cuenta demo@golf.com / demo.
*/
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";
