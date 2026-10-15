-- =====================================================================
-- CM — Control de Operaciones · SCRIPT 2 de 2: HACER ADMINISTRADOR
-- Antes: crea tu usuario en Authentication → Users y ejecuta el Script 1.
-- Cambia SOLO la línea marcada con  <<<  y pulsa Run.
-- =====================================================================
do $$
declare
  v_email text := lower(trim('CAMBIA_AQUI@tucorreo.com'));   -- <<< escribe tu correo entre las comillas
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then
    raise exception 'No existe un usuario con el correo "%". Créalo primero en Authentication → Users y vuelve a ejecutar.', v_email;
  end if;

  insert into public.profiles(id, email, full_name, role, active)
  values (v_id, v_email, split_part(v_email, '@', 1), 'admin', true)
  on conflict (id) do update set role = 'admin', active = true;
end $$;

-- Resultado: debe aparecer tu correo con rol "admin" y active = true
select email, role, active from public.profiles where role = 'admin';
