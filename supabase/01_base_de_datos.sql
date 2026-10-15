-- =====================================================================
-- CM — Control de Operaciones · SCRIPT 1 de 2: BASE DE DATOS
-- Se pega UNA sola vez en Supabase → SQL Editor → Run.
-- Es idempotente: si lo ejecutas de nuevo no duplica nada.
-- =====================================================================
create extension if not exists pgcrypto;

-- =====================================================================
-- 1. TABLAS
-- =====================================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'vendedor'
    check (role in ('admin','sup_comercial','sup_operativo','vendedor','inspector')),
  active boolean not null default false,
  theme text not null default 'dark' check (theme in ('dark','light')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, active boolean not null default true, sort int not null default 0
);
create table if not exists billing_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, active boolean not null default true
);
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, active boolean not null default true
);
create table if not exists activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, active boolean not null default true, sort int not null default 0
);
create table if not exists loss_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, active boolean not null default true
);
create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, is_default boolean not null default false, active boolean not null default true
);
create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null, color text not null default '#737B84',
  sort int not null default 0,
  probability numeric(5,2) not null default 0 check (probability between 0 and 100),
  kind text not null default 'open' check (kind in ('open','won','lost')),
  unique (pipeline_id, name)
);
create table if not exists services_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit_id uuid references billing_units(id),
  default_price numeric(14,2) not null default 0 check (default_price >= 0),
  active boolean not null default true
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null, tax_id text, address text, city text, notes text,
  is_client boolean not null default false, active boolean not null default true,
  is_demo boolean not null default false,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists plants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null, location text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, name)
);
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, email text, phone text, position text,
  company_id uuid references companies(id),
  status text not null default 'contacto' check (status in ('contacto','lead','cliente')),
  source_id uuid references lead_sources(id),
  owner_id uuid references profiles(id),
  last_activity_at timestamptz, notes text, is_demo boolean not null default false,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  contact_id uuid references contacts(id), company_id uuid references companies(id),
  plant_id uuid references plants(id),
  pipeline_id uuid not null references pipelines(id),
  stage_id uuid not null references pipeline_stages(id),
  source_id uuid not null references lead_sources(id),
  owner_id uuid default auth.uid() references profiles(id),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  probability numeric(5,2) not null default 0,
  weighted_amount numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open','won','lost')),
  expected_close date,
  loss_reason_id uuid references loss_reasons(id), loss_comment text,
  closed_at timestamptz, last_activity_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  from_stage_id uuid references pipeline_stages(id),
  to_stage_id uuid not null references pipeline_stages(id),
  probability numeric(5,2), user_id uuid, changed_at timestamptz not null default now()
);
create table if not exists opportunity_items (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  service_id uuid references services_catalog(id),
  description text, unit_id uuid references billing_units(id),
  quantity numeric(14,2) not null default 1 check (quantity > 0),
  list_price numeric(14,2) not null default 0 check (list_price >= 0),
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  final_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists negotiation_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  old_amount numeric(14,2), new_amount numeric(14,2),
  user_id uuid, comment text, created_at timestamptz not null default now()
);
create table if not exists alternative_offers (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  description text not null, amount numeric(14,2) not null default 0,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists lead_reassignments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  from_owner uuid, to_owner uuid, reassigned_at timestamptz not null default now()
);
create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  opportunity_id uuid not null references opportunities(id) on delete restrict,
  current_version int not null default 1,
  status text not null default 'borrador' check (status in ('borrador','enviada','aceptada','rechazada','vencida')),
  valid_until date, payment_terms text, fiscal jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists quotation_versions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  version int not null, snapshot jsonb not null, total numeric(14,2) not null default 0,
  valid_until date, payment_terms text,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  unique (quotation_id, version)
);
create table if not exists quotation_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references quotation_versions(id) on delete cascade,
  service_id uuid references services_catalog(id),
  description text not null, unit text,
  quantity numeric(14,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_pct numeric(5,2) not null default 0,
  line_total numeric(14,2) not null default 0
);
create table if not exists service_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  opportunity_id uuid references opportunities(id) on delete restrict,
  company_id uuid not null references companies(id),
  plant_id uuid references plants(id),
  status text not null default 'solicitada'
    check (status in ('solicitada','programada','en_ejecucion','terminada','anulada')),
  inspection_done boolean not null default false,
  sampling_done boolean not null default false,
  scheduled_at timestamptz, due_date date, finished_at timestamptz,
  assigned_to uuid references profiles(id),
  agreed_amount numeric(14,2) not null default 0 check (agreed_amount >= 0),
  received_amount numeric(14,2) not null default 0,
  balance numeric(14,2) generated always as (agreed_amount - received_amount) stored,
  payment_status text not null default 'pendiente' check (payment_status in ('pendiente','parcial','pagado')),
  payment_condition text, notes text,
  void_reason text, voided_by uuid, voided_at timestamptz,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint so_void_reason check (status <> 'anulada' or length(trim(coalesce(void_reason,''))) > 0)
);
create table if not exists service_order_tankers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references service_orders(id) on delete cascade,
  plate text not null, driver text, driver_id_card text, transport_company text, product text, notes text,
  created_at timestamptz not null default now()
);
create table if not exists service_order_samples (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references service_orders(id) on delete cascade,
  tanker_id uuid references service_order_tankers(id) on delete set null,
  code text, description text, taken_at timestamptz, taken_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (number ~ '^CRE-[0-9]{4}-[0-9]{4,}$'),
  year int not null,
  operation text not null check (operation in ('recepcion','entrega')),
  cert_date date not null, measurement_type text,
  company_id uuid references companies(id), plant_id uuid references plants(id),
  service_order_id uuid references service_orders(id),
  product text, tank_no text, ticket_no text,
  from_dispatcher text, from_delivery_point text, to_receiver text, to_reception_point text,
  total_volume numeric(14,2),
  remito_volume numeric(14,2), difference numeric(14,2),
  driver text, driver_id_card text, plate text, transport_company text,
  observations text,
  sig_inspector_name text, sig_inspector_path text,
  sig_carrier_name text, sig_carrier_path text,
  sig_storage_name text, sig_storage_path text,
  status text not null default 'emitido' check (status in ('emitido','anulado')),
  void_reason text, voided_by uuid, voided_at timestamptz,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint cert_void_reason check (status <> 'anulado' or length(trim(coalesce(void_reason,''))) > 0)
);
create table if not exists certificate_measurements (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references certificates(id) on delete cascade,
  kind text not null check (kind in ('inicial','final')),
  measured_date date, measured_time time,
  product_level numeric(14,4), water_level numeric(14,4),
  api_gravity numeric(14,4), temp_f numeric(14,4), avg_temp_f numeric(14,4),
  api_60f numeric(14,4), tov numeric(14,2), free_water numeric(14,2),
  vcf numeric(14,6), gsv numeric(14,2),
  unique (certificate_id, kind)
);
create table if not exists certificate_seals (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references certificates(id) on delete cascade,
  seal_no text not null, sort int not null default 0
);
create table if not exists certificate_sequences (
  kind text not null, year int not null, last_value int not null default 0,
  primary key (kind, year)
);
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  type_id uuid references activity_types(id),
  title text not null, due_at timestamptz,
  done boolean not null default false, done_at timestamptz,
  assigned_to uuid default auth.uid() references profiles(id),
  contact_id uuid references contacts(id), opportunity_id uuid references opportunities(id),
  order_id uuid references service_orders(id), notes text,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('contact','company','opportunity','order','certificate')),
  entity_id uuid not null, body text not null,
  user_id uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references service_orders(id) on delete restrict,
  method_id uuid references payment_methods(id),
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null default current_date, reference text,
  voided boolean not null default false, void_reason text,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('contact','opportunity')),
  name text not null,
  field_type text not null check (field_type in ('texto','numero','fecha','seleccion','booleano','texto_largo')),
  options jsonb not null default '[]'::jsonb, required boolean not null default false,
  sort int not null default 0, active boolean not null default true,
  unique (entity, name)
);
create table if not exists custom_field_values (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references custom_field_definitions(id) on delete cascade,
  entity_id uuid not null, value jsonb,
  unique (definition_id, entity_id)
);
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),            -- null = meta general de la empresa
  month date not null check (month = date_trunc('month', month)::date),
  target numeric(14,2) not null check (target >= 0),
  unique nulls not distinct (user_id, month)
);
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null, title text not null, body text, link text,
  read boolean not null default false, dedupe_key text,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null, entity_id uuid not null,
  bucket text not null default 'documentos', path text not null, filename text,
  uploaded_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null, record_id uuid, action text not null,
  old_data jsonb, new_data jsonb, user_id uuid, at timestamptz not null default now()
);

-- Productos que maneja cada empresa, en qué plantas llegan y qué servicios requiere
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, active boolean not null default true
);
create table if not exists company_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  product_id uuid not null references products(id),
  plant_id uuid references plants(id) on delete cascade,     -- null = planta por definir
  created_at timestamptz not null default now(),
  unique nulls not distinct (company_id, product_id, plant_id)
);
create table if not exists company_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  service_id uuid not null references services_catalog(id),
  plant_id uuid references plants(id) on delete cascade,     -- null = todas las plantas
  notes text, created_at timestamptz not null default now(),
  unique nulls not distinct (company_id, service_id, plant_id)
);

-- Índices
create index if not exists ix_contacts_company on contacts(company_id);
create index if not exists ix_contacts_name on contacts(lower(full_name));
create index if not exists ix_opp_stage on opportunities(stage_id);
create index if not exists ix_opp_owner on opportunities(owner_id);
create index if not exists ix_opp_status on opportunities(status);
create index if not exists ix_orders_company on service_orders(company_id);
create index if not exists ix_orders_status on service_orders(status);
create index if not exists ix_cert_date on certificates(cert_date);
create index if not exists ix_cert_company on certificates(company_id, plant_id);
create index if not exists ix_cert_plate on certificates(lower(plate));
create index if not exists ix_seal_no on certificate_seals(lower(seal_no));
create index if not exists ix_act_due on activities(due_at) where not done;
create index if not exists ix_notif_user on notifications(user_id, read);
create index if not exists ix_audit_table on audit_logs(table_name, at desc);

-- =====================================================================
-- 2. FUNCIONES DE APOYO Y SEGURIDAD
-- =====================================================================
create or replace function app_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

create or replace function is_active_user() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and active) $$;

create or replace function has_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = any(p_roles) from profiles where id = auth.uid() and active), false) $$;

create or replace function set_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;

create or replace function setting_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as
$$ select coalesce((select (value #>> '{}')::numeric from settings where key = p_key), p_default) $$;

-- Numeración correlativa segura (un solo INSERT..ON CONFLICT es atómico: sin duplicados)
create or replace function next_number(p_kind text, p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into certificate_sequences(kind, year, last_value) values (p_kind, p_year, 1)
  on conflict (kind, year) do update set last_value = certificate_sequences.last_value + 1
  returning last_value into v;
  return v;
end $$;

create or replace function year_la_paz() returns int language sql stable as
$$ select extract(year from (now() at time zone 'America/La_Paz'))::int $$;

create or replace function trg_no_delete() returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() = 1 then
    raise exception 'Este registro no se puede borrar (solo anular o corregir con historial)';
  end if;
  return old;
end $$;

create or replace function trg_no_update() returns trigger language plpgsql as $$
begin raise exception 'Este historial es de solo lectura y no puede modificarse'; end $$;

-- Auditoría genérica
create or replace function trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(table_name, record_id, action, old_data, new_data, user_id)
  values (tg_table_name,
          coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id')::uuid, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end, auth.uid());
  return null;
end $$;

-- ---- Perfiles ----
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name, role, active)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
          'vendedor', false)                       -- el registro NUNCA elige rol y queda inactivo
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Usuarios que ya existían antes de este script (p. ej. tu administrador)
insert into profiles(id, email, full_name, role, active)
select u.id, u.email, coalesce(nullif(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1)), 'vendedor', false
from auth.users u on conflict (id) do nothing;

create or replace function trg_profile_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not has_role(array['admin']) then
    if new.role is distinct from old.role or new.active is distinct from old.active
       or new.id is distinct from old.id or new.email is distinct from old.email then
      raise exception 'No puedes cambiar tu rol, tu estado ni tu correo';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profile_guard on profiles;
create trigger trg_profile_guard before update on profiles for each row execute function trg_profile_guard();

-- Función protegida: solo el administrador asigna rol / activa / desactiva
create or replace function admin_set_user(p_user uuid, p_name text, p_role text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(array['admin']) then raise exception 'Solo el administrador puede gestionar usuarios'; end if;
  if p_role not in ('admin','sup_comercial','sup_operativo','vendedor','inspector') then
    raise exception 'Rol inválido'; end if;
  if (p_role <> 'admin' or not p_active)
     and not exists (select 1 from profiles where role = 'admin' and active and id <> p_user) then
    raise exception 'Debe quedar al menos un administrador activo'; end if;
  update profiles set full_name = coalesce(nullif(trim(p_name),''), full_name),
         role = p_role, active = p_active where id = p_user;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

-- ---- Oportunidades ----
create or replace function trg_opp_biu() returns trigger
language plpgsql security definer set search_path = public as $$
declare st pipeline_stages%rowtype;
begin
  select * into st from pipeline_stages where id = new.stage_id;
  if not found then raise exception 'Etapa inválida'; end if;
  new.pipeline_id := st.pipeline_id;
  if tg_op = 'UPDATE' and old.status <> 'open' and new.stage_id <> old.stage_id
     and not has_role(array['admin']) then
    raise exception 'Una oportunidad cerrada solo puede reabrirla un administrador';
  end if;
  new.status := st.kind;
  new.probability := st.probability;
  if st.kind = 'lost' and new.loss_reason_id is null then
    raise exception 'El motivo de pérdida es obligatorio';
  end if;
  if st.kind <> 'lost' then new.loss_reason_id := null; new.loss_comment := null; end if;
  new.weighted_amount := round(new.amount * new.probability / 100, 2);
  if st.kind in ('won','lost') then new.closed_at := coalesce(new.closed_at, now()); else new.closed_at := null; end if;
  if tg_op = 'INSERT' then new.last_activity_at := coalesce(new.last_activity_at, now()); end if;
  if tg_op = 'UPDATE' and new.stage_id <> old.stage_id then new.last_activity_at := now(); end if;
  return new;
end $$;
drop trigger if exists trg_opp_biu on opportunities;
create trigger trg_opp_biu before insert or update on opportunities for each row execute function trg_opp_biu();

create or replace function trg_opp_aiu() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into opportunity_stage_history(opportunity_id, from_stage_id, to_stage_id, probability, user_id)
    values (new.id, null, new.stage_id, new.probability, auth.uid());
    update contacts set status = 'lead', source_id = coalesce(source_id, new.source_id)
     where id = new.contact_id and status = 'contacto';
  else
    if new.stage_id <> old.stage_id then
      insert into opportunity_stage_history(opportunity_id, from_stage_id, to_stage_id, probability, user_id)
      values (new.id, old.stage_id, new.stage_id, new.probability, auth.uid());
    end if;
    if new.amount is distinct from old.amount then
      insert into negotiation_history(opportunity_id, old_amount, new_amount, user_id, comment)
      values (new.id, old.amount, new.amount, auth.uid(),
              coalesce(nullif(current_setting('app.comment', true), ''), 'Edición manual del monto'));
    end if;
    -- Conversión a cliente al ganar la venta
    if new.status = 'won' and old.status <> 'won' then
      update contacts set status = 'cliente' where id = new.contact_id;
      update companies set is_client = true where id = new.company_id;
      if new.contact_id is not null then
        update companies set is_client = true where id = (select company_id from contacts where id = new.contact_id);
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_opp_aiu on opportunities;
create trigger trg_opp_aiu after insert or update on opportunities for each row execute function trg_opp_aiu();

-- Líneas de negociación → monto automático
create or replace function trg_item_biu() returns trigger language plpgsql as $$
begin
  new.final_price := round(new.list_price * (1 - new.discount_pct / 100), 2);
  new.line_total := round(new.quantity * new.final_price, 2);
  return new;
end $$;
drop trigger if exists trg_item_biu on opportunity_items;
create trigger trg_item_biu before insert or update on opportunity_items for each row execute function trg_item_biu();

create or replace function trg_item_aiud() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid := coalesce(new.opportunity_id, old.opportunity_id);
begin
  perform set_config('app.comment', 'Cambio en líneas de negociación', true);
  update opportunities
     set amount = (select coalesce(sum(line_total), 0) from opportunity_items where opportunity_id = v)
   where id = v;
  perform set_config('app.comment', '', true);
  return null;
end $$;
drop trigger if exists trg_item_aiud on opportunity_items;
create trigger trg_item_aiud after insert or update or delete on opportunity_items for each row execute function trg_item_aiud();

-- Cambio manual de monto con comentario obligatorio
create or replace function set_opportunity_amount(p_id uuid, p_amount numeric, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_active_user() then raise exception 'No autorizado'; end if;
  if length(trim(coalesce(p_comment,''))) = 0 then raise exception 'El comentario es obligatorio'; end if;
  perform set_config('app.comment', p_comment, true);
  update opportunities set amount = p_amount where id = p_id;
  perform set_config('app.comment', '', true);
end $$;

-- Contacto → lead activo con oportunidad inicial (sin duplicar)
create or replace function promote_to_lead(p_contact uuid, p_source uuid, p_title text, p_pipeline uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c contacts%rowtype; v_pipe uuid; v_stage uuid; v_opp uuid;
begin
  if not is_active_user() then raise exception 'No autorizado'; end if;
  if p_source is null then raise exception 'El origen del lead es obligatorio'; end if;
  select * into c from contacts where id = p_contact;
  if not found then raise exception 'Contacto no encontrado'; end if;
  select id into v_opp from opportunities where contact_id = p_contact and status = 'open' limit 1;
  if v_opp is not null then return v_opp; end if;   -- ya tiene oportunidad abierta: no se duplica
  v_pipe := coalesce(p_pipeline, (select id from pipelines where is_default and active limit 1));
  select id into v_stage from pipeline_stages where pipeline_id = v_pipe and kind = 'open' order by sort limit 1;
  if v_stage is null then raise exception 'El pipeline no tiene etapas abiertas'; end if;
  insert into opportunities(title, contact_id, company_id, pipeline_id, stage_id, source_id, owner_id)
  values (coalesce(nullif(trim(p_title),''), 'Oportunidad — ' || c.full_name), c.id, c.company_id, v_pipe, v_stage, p_source, auth.uid())
  returning id into v_opp;
  update contacts set status = 'lead', source_id = p_source where id = c.id and status = 'contacto';
  return v_opp;
end $$;

-- Actividades → última actividad
create or replace function trg_activity_aiu() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update opportunities set last_activity_at = now() where id = new.opportunity_id and status = 'open';
  update contacts set last_activity_at = now() where id = new.contact_id;
  if new.done and (tg_op = 'INSERT' or not old.done) then
    update activities set done_at = coalesce(done_at, now()) where id = new.id and done_at is null;
  end if;
  return null;
end $$;
drop trigger if exists trg_activity_aiu on activities;
create trigger trg_activity_aiu after insert or update on activities for each row execute function trg_activity_aiu();

-- ---- Cotizaciones con versiones inmutables ----
create or replace function trg_quotation_bu() returns trigger language plpgsql as $$
begin
  if new.status = 'enviada' and old.status <> 'enviada' then new.sent_at := now(); end if;
  if new.number is distinct from old.number then raise exception 'El número de cotización no se puede cambiar'; end if;
  return new;
end $$;
drop trigger if exists trg_quotation_bu on quotations;
create trigger trg_quotation_bu before update on quotations for each row execute function trg_quotation_bu();

create or replace function save_quotation(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare q quotations%rowtype; v_id uuid; v_ver int; v_vid uuid; it jsonb; v_total numeric(14,2) := 0;
        v_price numeric(14,2); v_line numeric(14,2); v_yr int := year_la_paz();
begin
  if not has_role(array['admin','sup_comercial','vendedor']) then raise exception 'Sin permiso para cotizar'; end if;
  if jsonb_array_length(coalesce(p->'items','[]')) = 0 then raise exception 'La cotización necesita al menos una línea'; end if;
  if nullif(p->>'quotation_id','') is null then
    insert into quotations(number, opportunity_id, valid_until, payment_terms, fiscal)
    values ('COT-' || v_yr || '-' || lpad(next_number('COT', v_yr)::text, 4, '0'),
            (p->>'opportunity_id')::uuid, nullif(p->>'valid_until','')::date, p->>'payment_terms',
            coalesce(p->'fiscal','{}'::jsonb))
    returning id into v_id;
    v_ver := 1;
  else
    v_id := (p->>'quotation_id')::uuid;
    select * into q from quotations where id = v_id for update;
    if not found then raise exception 'Cotización no encontrada'; end if;
    v_ver := q.current_version + 1;
  end if;
  insert into quotation_versions(quotation_id, version, snapshot, valid_until, payment_terms)
  values (v_id, v_ver, p, nullif(p->>'valid_until','')::date, p->>'payment_terms')
  returning id into v_vid;
  for it in select * from jsonb_array_elements(p->'items') loop
    v_price := round((it->>'unit_price')::numeric * (1 - coalesce(nullif(it->>'discount_pct','')::numeric, 0) / 100), 2);
    v_line := round((it->>'quantity')::numeric * v_price, 2);
    v_total := v_total + v_line;
    insert into quotation_items(version_id, service_id, description, unit, quantity, unit_price, discount_pct, line_total)
    values (v_vid, nullif(it->>'service_id','')::uuid, it->>'description', it->>'unit',
            (it->>'quantity')::numeric, (it->>'unit_price')::numeric,
            coalesce(nullif(it->>'discount_pct','')::numeric, 0), v_line);
  end loop;
  update quotation_versions set total = v_total where id = v_vid;
  update quotations set current_version = v_ver, valid_until = nullif(p->>'valid_until','')::date,
         payment_terms = p->>'payment_terms', fiscal = coalesce(p->'fiscal', fiscal)
   where id = v_id;
  return v_id;
end $$;

-- ---- Órdenes de servicio y pagos ----
create or replace function trg_order_biu() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_yr int := year_la_paz();
begin
  if tg_op = 'INSERT' then
    if new.number is null or new.number = '' then
      new.number := 'OS-' || v_yr || '-' || lpad(next_number('OS', v_yr)::text, 4, '0');
    end if;
  else
    if old.status = 'anulada' then raise exception 'La orden está anulada y no puede modificarse'; end if;
    if new.number is distinct from old.number then raise exception 'El número de orden no se puede cambiar'; end if;
    if new.status = 'anulada' and coalesce(current_setting('app.allow_void', true), '') <> '1' then
      raise exception 'Para anular usa la acción «Anular orden» (con motivo)';
    end if;
    if new.status = 'terminada' and old.status <> 'terminada' then new.finished_at := now(); end if;
  end if;
  new.payment_status := case
    when new.agreed_amount > 0 and new.received_amount >= new.agreed_amount then 'pagado'
    when new.received_amount > 0 then 'parcial' else 'pendiente' end;
  return new;
end $$;
drop trigger if exists trg_order_biu on service_orders;
create trigger trg_order_biu before insert or update on service_orders for each row execute function trg_order_biu();

create or replace function trg_payment_aiud() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid := coalesce(new.order_id, old.order_id);
begin
  update service_orders
     set received_amount = (select coalesce(sum(amount), 0) from payments where order_id = v and not voided)
   where id = v and status <> 'anulada';
  return null;
end $$;
drop trigger if exists trg_payment_aiud on payments;
create trigger trg_payment_aiud after insert or update or delete on payments for each row execute function trg_payment_aiud();

create or replace function void_service_order(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role(array['admin','sup_operativo']) then raise exception 'Sin permiso para anular órdenes'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'El motivo es obligatorio'; end if;
  perform set_config('app.allow_void', '1', true);
  update service_orders set status = 'anulada', void_reason = p_reason, voided_by = auth.uid(), voided_at = now()
   where id = p_id and status <> 'anulada';
  perform set_config('app.allow_void', '', true);
  if not found then raise exception 'Orden no encontrada o ya anulada'; end if;
end $$;

-- ---- Certificados ----
create or replace function trg_cert_biu() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_yr int := year_la_paz();
begin
  if tg_op = 'INSERT' then
    new.year := v_yr;
    new.number := 'CRE-' || v_yr || '-' || lpad(next_number('CRE', v_yr)::text, 4, '0');
    new.status := 'emitido';
  else
    if new.number is distinct from old.number or new.year is distinct from old.year then
      raise exception 'El número del certificado es inalterable'; end if;
    if old.status = 'anulado' then raise exception 'El certificado está anulado y no puede modificarse'; end if;
    if new.status = 'anulado' and coalesce(current_setting('app.allow_void', true), '') <> '1' then
      raise exception 'Para anular usa la acción «Anular certificado» (con motivo)'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_cert_biu on certificates;
create trigger trg_cert_biu before insert or update on certificates for each row execute function trg_cert_biu();

-- Único cálculo automático: volumen total = GSV final − GSV inicial
create or replace function trg_meas_aiud() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid := coalesce(new.certificate_id, old.certificate_id);
begin
  update certificates c set total_volume =
      (select gsv from certificate_measurements where certificate_id = v and kind = 'final')
    - (select gsv from certificate_measurements where certificate_id = v and kind = 'inicial')
   where c.id = v and c.status = 'emitido';
  return null;
end $$;
drop trigger if exists trg_meas_aiud on certificate_measurements;
create trigger trg_meas_aiud after insert or update or delete on certificate_measurements for each row execute function trg_meas_aiud();

create or replace function save_certificate(p jsonb) returns certificates
language plpgsql security definer set search_path = public as $$
declare c certificates; m jsonb; s text; i int := 0;
begin
  if not has_role(array['admin','sup_operativo','inspector']) then
    raise exception 'Sin permiso para registrar certificados'; end if;
  insert into certificates(operation, cert_date, measurement_type, company_id, plant_id, service_order_id,
      product, tank_no, ticket_no, from_dispatcher, from_delivery_point, to_receiver, to_reception_point,
      remito_volume, difference, driver, driver_id_card, plate, transport_company, observations,
      sig_inspector_name, sig_inspector_path, sig_carrier_name, sig_carrier_path, sig_storage_name, sig_storage_path)
  values (p->>'operation', (p->>'cert_date')::date, p->>'measurement_type',
      nullif(p->>'company_id','')::uuid, nullif(p->>'plant_id','')::uuid, nullif(p->>'service_order_id','')::uuid,
      p->>'product', p->>'tank_no', p->>'ticket_no', p->>'from_dispatcher', p->>'from_delivery_point',
      p->>'to_receiver', p->>'to_reception_point',
      nullif(p->>'remito_volume','')::numeric, nullif(p->>'difference','')::numeric,
      p->>'driver', p->>'driver_id_card', p->>'plate', p->>'transport_company', p->>'observations',
      p->>'sig_inspector_name', p->>'sig_inspector_path', p->>'sig_carrier_name', p->>'sig_carrier_path',
      p->>'sig_storage_name', p->>'sig_storage_path')
  returning * into c;
  for m in select * from jsonb_array_elements(coalesce(p->'measurements', '[]'::jsonb)) loop
    insert into certificate_measurements(certificate_id, kind, measured_date, measured_time, product_level, water_level,
        api_gravity, temp_f, avg_temp_f, api_60f, tov, free_water, vcf, gsv)
    values (c.id, m->>'kind', nullif(m->>'measured_date','')::date, nullif(m->>'measured_time','')::time,
        nullif(m->>'product_level','')::numeric, nullif(m->>'water_level','')::numeric,
        nullif(m->>'api_gravity','')::numeric, nullif(m->>'temp_f','')::numeric, nullif(m->>'avg_temp_f','')::numeric,
        nullif(m->>'api_60f','')::numeric, nullif(m->>'tov','')::numeric, nullif(m->>'free_water','')::numeric,
        nullif(m->>'vcf','')::numeric, nullif(m->>'gsv','')::numeric);
  end loop;
  for s in select jsonb_array_elements_text(coalesce(p->'seals', '[]'::jsonb)) loop
    if length(trim(s)) > 0 then
      i := i + 1;
      insert into certificate_seals(certificate_id, seal_no, sort) values (c.id, trim(s), i);
    end if;
  end loop;
  select * into c from certificates where id = c.id;
  return c;
end $$;

create or replace function void_certificate(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role(array['admin','sup_operativo']) then raise exception 'Sin permiso para anular certificados'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'El motivo es obligatorio'; end if;
  perform set_config('app.allow_void', '1', true);
  update certificates set status = 'anulado', void_reason = p_reason, voided_by = auth.uid(), voided_at = now()
   where id = p_id and status <> 'anulado';
  perform set_config('app.allow_void', '', true);
  if not found then raise exception 'Certificado no encontrado o ya anulado'; end if;
end $$;

-- Protección: no borrar / no reescribir historiales
do $$
declare t text;
begin
  foreach t in array array['certificates','service_orders','payments','quotations','negotiation_history',
    'opportunity_stage_history','quotation_versions','quotation_items','audit_logs','lead_reassignments'] loop
    execute format('drop trigger if exists trg_no_delete on public.%I', t);
    execute format('create trigger trg_no_delete before delete on public.%I for each row execute function public.trg_no_delete()', t);
  end loop;
  foreach t in array array['negotiation_history','opportunity_stage_history','quotation_versions','quotation_items',
    'audit_logs','lead_reassignments'] loop
    execute format('drop trigger if exists trg_no_update on public.%I', t);
    execute format('create trigger trg_no_update before update on public.%I for each row execute function public.trg_no_update()', t);
  end loop;
  foreach t in array array['companies','plants','contacts','opportunities','quotations','service_orders','certificates',
    'payments','profiles','pipeline_stages','services_catalog','goals','settings'] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.trg_audit()', t);
  end loop;
  -- updated_at en todas las tablas que lo tengan
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'updated_at' and x.table_type = 'BASE TABLE' loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- =====================================================================
-- 3. AUTOMATIZACIONES (se ejecutan al abrir la app y con «Revisar ahora»)
--    No hay tareas en segundo plano: solo corren cuando alguien las llama.
-- =====================================================================
create or replace function business_hours_since(p_since timestamptz) returns numeric
language sql stable as $$
  select greatest(0, extract(epoch from (now() - p_since)) / 3600
    - 24 * (select count(*) from generate_series(date_trunc('day', p_since), date_trunc('day', now()), interval '1 day') d
            where extract(isodow from d) in (6, 7)))
$$;

create or replace function run_reassignment() returns int
language plpgsql security definer set search_path = public as $$
declare hrs numeric := setting_num('reassign_hours', 24); r record; v_new uuid; n int := 0;
begin
  if not is_active_user() then raise exception 'No autorizado'; end if;
  for r in
    select o.id, o.owner_id, o.title from opportunities o
     where o.status = 'open'
       and business_hours_since(coalesce(o.last_activity_at, o.created_at)) >= hrs
       and not exists (select 1 from lead_reassignments x where x.opportunity_id = o.id)
  loop
    select p.id into v_new from profiles p
     where p.active and p.role = 'vendedor' and p.id is distinct from r.owner_id
     order by (select count(*) from opportunities q where q.owner_id = p.id and q.status = 'open'), p.full_name
     limit 1;
    continue when v_new is null;
    insert into lead_reassignments(opportunity_id, from_owner, to_owner) values (r.id, r.owner_id, v_new);
    update opportunities set owner_id = v_new, last_activity_at = now() where id = r.id;
    insert into notifications(user_id, kind, title, body, link, dedupe_key)
    values (v_new, 'lead_reasignado', 'Se te asignó un lead: ' || r.title, 'Sin actividad por ' || hrs || ' h hábiles', '/oportunidades/' || r.id, 'reasig:' || r.id || ':new')
    on conflict (user_id, dedupe_key) do nothing;
    if r.owner_id is not null then
      insert into notifications(user_id, kind, title, body, link, dedupe_key)
      values (r.owner_id, 'lead_reasignado', 'Lead reasignado: ' || r.title, 'Pasó a otro vendedor por falta de actividad', '/oportunidades/' || r.id, 'reasig:' || r.id || ':old')
      on conflict (user_id, dedupe_key) do nothing;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function run_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c int; up_h numeric := setting_num('notif_upcoming_hours', 24);
        q_d numeric := setting_num('notif_quote_days', 3); sig_h numeric := setting_num('notif_cert_unsigned_hours', 24);
begin
  if not is_active_user() then raise exception 'No autorizado'; end if;
  insert into notifications(user_id, kind, title, body, link, dedupe_key)
  select a.assigned_to, 'actividad_vencida', 'Actividad vencida: ' || a.title, null, '/actividades', 'act_venc:' || a.id
    from activities a where not a.done and a.due_at < now() and a.assigned_to is not null
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into notifications(user_id, kind, title, body, link, dedupe_key)
  select a.assigned_to, 'actividad_proxima', 'Actividad próxima: ' || a.title, null, '/actividades', 'act_prox:' || a.id
    from activities a where not a.done and a.due_at >= now() and a.due_at < now() + make_interval(hours => up_h::int) and a.assigned_to is not null
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into notifications(user_id, kind, title, body, link, dedupe_key)
  select o.owner_id, 'cotizacion_sin_respuesta', 'Cotización sin respuesta: ' || q.number, null, '/oportunidades/' || o.id, 'cot_sr:' || q.id
    from quotations q join opportunities o on o.id = q.opportunity_id
   where q.status = 'enviada' and q.sent_at < now() - make_interval(days => q_d::int) and o.owner_id is not null
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into notifications(user_id, kind, title, body, link, dedupe_key)
  select s.assigned_to, case when s.scheduled_at < now() then 'servicio_vencido' else 'servicio_proximo' end,
         (case when s.scheduled_at < now() then 'Servicio vencido: ' else 'Servicio próximo: ' end) || s.number, null, '/servicios/' || s.id,
         'srv:' || s.id || ':' || case when s.scheduled_at < now() then 'v' else 'p' end
    from service_orders s
   where s.status in ('solicitada','programada') and s.assigned_to is not null and s.scheduled_at is not null
     and s.scheduled_at < now() + make_interval(hours => up_h::int)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into notifications(user_id, kind, title, body, link, dedupe_key)
  select ce.created_by, 'certificado_sin_firmas', 'Certificado sin firmas: ' || ce.number, null, '/certificados/' || ce.id, 'cert_sf:' || ce.id
    from certificates ce
   where ce.status = 'emitido' and ce.created_by is not null and ce.created_at < now() - make_interval(hours => sig_h::int)
     and (coalesce(ce.sig_inspector_path,'') = '' or coalesce(ce.sig_carrier_path,'') = '' or coalesce(ce.sig_storage_path,'') = '')
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into notifications(user_id, kind, title, body, link, dedupe_key)
  select p.id, 'pago_pendiente', 'Cobro pendiente: ' || s.number, 'Saldo Bs ' || s.balance, '/servicios/' || s.id, 'pago_p:' || s.id
    from service_orders s cross join profiles p
   where s.status = 'terminada' and s.balance > 0 and p.active and p.role in ('admin','sup_comercial')
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;
  return n;
end $$;

-- Reasignación manual de un lead (administrador o supervisor comercial)
create or replace function reassign_lead(p_opp uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o opportunities%rowtype;
begin
  if not has_role(array['admin','sup_comercial']) then raise exception 'Sin permiso para reasignar leads'; end if;
  select * into o from opportunities where id = p_opp for update;
  if not found then raise exception 'Oportunidad no encontrada'; end if;
  if o.status <> 'open' then raise exception 'No se reasignan oportunidades cerradas'; end if;
  if not exists (select 1 from profiles where id = p_new_owner and active) then raise exception 'El nuevo responsable no está activo'; end if;
  if o.owner_id is not distinct from p_new_owner then raise exception 'Ya es el responsable actual'; end if;
  insert into lead_reassignments(opportunity_id, from_owner, to_owner) values (o.id, o.owner_id, p_new_owner);
  update opportunities set owner_id = p_new_owner, last_activity_at = now() where id = o.id;
  insert into notifications(user_id, kind, title, body, link, dedupe_key)
  values (p_new_owner, 'lead_reasignado', 'Se te asignó un lead: ' || o.title, 'Reasignación manual', '/oportunidades', 'reasig_m:' || o.id || ':' || extract(epoch from now())::bigint)
  on conflict (user_id, dedupe_key) do nothing;
end $$;

-- =====================================================================
-- 4. REPORTES Y DASHBOARD (respetan RLS: security invoker)
-- =====================================================================
create or replace function dashboard_kpis(p_from date, p_to date, p_owner uuid default null, p_source uuid default null,
  p_pipeline uuid default null, p_company uuid default null, p_plant uuid default null) returns jsonb
language plpgsql stable as $$
declare v_month date := date_trunc('month', p_to)::date; v_goal numeric;
begin
  v_goal := case when p_owner is not null
    then (select target from goals where user_id = p_owner and month = v_month)
    else coalesce((select target from goals where user_id is null and month = v_month),
                  (select sum(target) from goals where month = v_month)) end;
  return jsonb_build_object(
    'sales_period', coalesce((select sum(o.amount) from opportunities o where o.status = 'won'
        and o.closed_at::date between p_from and p_to
        and (p_owner is null or o.owner_id = p_owner) and (p_source is null or o.source_id = p_source)
        and (p_pipeline is null or o.pipeline_id = p_pipeline) and (p_company is null or o.company_id = p_company)
        and (p_plant is null or o.plant_id = p_plant)), 0),
    'goal', coalesce(v_goal, 0),
    'pipeline_value', coalesce((select sum(o.amount) from opportunities o where o.status = 'open'
        and (p_owner is null or o.owner_id = p_owner) and (p_source is null or o.source_id = p_source)
        and (p_pipeline is null or o.pipeline_id = p_pipeline) and (p_company is null or o.company_id = p_company)
        and (p_plant is null or o.plant_id = p_plant)), 0),
    'weighted_value', coalesce((select sum(o.weighted_amount) from opportunities o where o.status = 'open'
        and (p_owner is null or o.owner_id = p_owner) and (p_source is null or o.source_id = p_source)
        and (p_pipeline is null or o.pipeline_id = p_pipeline) and (p_company is null or o.company_id = p_company)
        and (p_plant is null or o.plant_id = p_plant)), 0),
    'open_opportunities', (select count(*) from opportunities o where o.status = 'open'
        and (p_owner is null or o.owner_id = p_owner) and (p_source is null or o.source_id = p_source)
        and (p_pipeline is null or o.pipeline_id = p_pipeline) and (p_company is null or o.company_id = p_company)
        and (p_plant is null or o.plant_id = p_plant)),
    'contacts', (select count(*) from contacts c where (p_owner is null or c.owner_id = p_owner)
        and (p_source is null or c.source_id = p_source) and (p_company is null or c.company_id = p_company)),
    'leads', (select count(*) from contacts c where c.status = 'lead' and (p_owner is null or c.owner_id = p_owner)
        and (p_source is null or c.source_id = p_source) and (p_company is null or c.company_id = p_company)),
    'clients', (select count(*) from contacts c where c.status = 'cliente' and (p_owner is null or c.owner_id = p_owner)
        and (p_source is null or c.source_id = p_source) and (p_company is null or c.company_id = p_company)),
    'pending_quotations', (select count(*) from quotations q join opportunities o on o.id = q.opportunity_id
        where q.status in ('borrador','enviada') and (p_owner is null or o.owner_id = p_owner)
        and (p_company is null or o.company_id = p_company) and (p_plant is null or o.plant_id = p_plant)),
    'pending_payments', coalesce((select sum(s.balance) from service_orders s where s.status <> 'anulada' and s.balance > 0
        and (p_company is null or s.company_id = p_company) and (p_plant is null or s.plant_id = p_plant)), 0),
    'scheduled_services', (select count(*) from service_orders s where s.status = 'programada'
        and (p_company is null or s.company_id = p_company) and (p_plant is null or s.plant_id = p_plant)),
    'pending_inspections', (select count(*) from service_orders s where not s.inspection_done
        and s.status in ('solicitada','programada','en_ejecucion')
        and (p_company is null or s.company_id = p_company) and (p_plant is null or s.plant_id = p_plant)),
    'finished_services', (select count(*) from service_orders s where s.status = 'terminada'
        and s.finished_at::date between p_from and p_to
        and (p_company is null or s.company_id = p_company) and (p_plant is null or s.plant_id = p_plant)),
    'samples', (select count(*) from service_order_samples sm join service_orders s on s.id = sm.order_id
        where s.status <> 'anulada' and sm.taken_at::date between p_from and p_to
        and (p_company is null or s.company_id = p_company) and (p_plant is null or s.plant_id = p_plant))
  );
end $$;

create or replace function volumes_summary(p_group text, p_from date, p_to date,
  p_company uuid default null, p_plant uuid default null)
returns table(label text, received numeric, delivered numeric, certificates bigint)
language sql stable as $$
  select case p_group
           when 'day' then to_char(c.cert_date, 'YYYY-MM-DD')
           when 'month' then to_char(c.cert_date, 'YYYY-MM')
           when 'year' then to_char(c.cert_date, 'YYYY')
           when 'company' then coalesce(co.name, 'Sin cliente')
           when 'plant' then coalesce(pl.name, 'Sin planta')
           else 'Total' end as label,
         coalesce(sum(c.total_volume) filter (where c.operation = 'recepcion'), 0),
         coalesce(sum(c.total_volume) filter (where c.operation = 'entrega'), 0),
         count(*)
    from certificates c
    left join companies co on co.id = c.company_id
    left join plants pl on pl.id = c.plant_id
   where c.status = 'emitido' and c.cert_date between p_from and p_to
     and (p_company is null or c.company_id = p_company) and (p_plant is null or c.plant_id = p_plant)
   group by 1 order by 1
$$;

create or replace function global_search(q text) returns table(kind text, id uuid, title text, subtitle text, link text)
language sql stable as $$
  with t as (select '%' || lower(trim(q)) || '%' as pat)
  (select 'certificado', c.id, c.number, coalesce(c.plate,'') || ' · ' || coalesce(c.product,''), '/certificados/' || c.id
     from certificates c, t where lower(c.number) like t.pat or lower(coalesce(c.plate,'')) like t.pat
        or lower(coalesce(c.driver,'')) like t.pat limit 8)
  union all
  (select 'precinto', c.id, s.seal_no, c.number, '/certificados/' || c.id
     from certificate_seals s join certificates c on c.id = s.certificate_id, t where lower(s.seal_no) like t.pat limit 8)
  union all
  (select 'orden', o.id, o.number, o.status, '/servicios/' || o.id from service_orders o, t where lower(o.number) like t.pat limit 8)
  union all
  (select 'cliente', co.id, co.name, coalesce(co.city,''), '/contactos?empresa=' || co.id from companies co, t where lower(co.name) like t.pat limit 8)
  union all
  (select 'contacto', k.id, k.full_name, coalesce(k.email,''), '/contactos/' || k.id from contacts k, t
    where lower(k.full_name) like t.pat or lower(coalesce(k.email,'')) like t.pat limit 8)
$$;

create or replace view v_pipeline_funnel with (security_invoker = true) as
select s.pipeline_id, s.id as stage_id, s.name as stage, s.sort, s.kind,
       count(o.id) as opportunities, coalesce(sum(o.amount), 0) as amount, coalesce(sum(o.weighted_amount), 0) as weighted
  from pipeline_stages s left join opportunities o on o.stage_id = s.id
 group by s.pipeline_id, s.id, s.name, s.sort, s.kind;

create or replace view v_sales_by_month with (security_invoker = true) as
select date_trunc('month', closed_at)::date as month, owner_id, source_id, count(*) as sales, sum(amount) as total
  from opportunities where status = 'won' group by 1, 2, 3;

create or replace view v_loss_summary with (security_invoker = true) as
select r.name as reason, count(o.id) as opportunities, coalesce(sum(o.amount), 0) as amount
  from loss_reasons r left join opportunities o on o.loss_reason_id = r.id and o.status = 'lost' group by r.name;

create or replace view v_contact_360 with (security_invoker = true) as
select c.id as contact_id, c.company_id,
  coalesce((select sum(ce.total_volume) from certificates ce where ce.company_id = c.company_id and ce.operation = 'recepcion' and ce.status = 'emitido'), 0) as liters_received,
  coalesce((select sum(ce.total_volume) from certificates ce where ce.company_id = c.company_id and ce.operation = 'entrega' and ce.status = 'emitido'), 0) as liters_delivered,
  coalesce((select sum(so.balance) from service_orders so where so.company_id = c.company_id and so.status <> 'anulada'), 0) as balance,
  (select count(*) from plants p where p.company_id = c.company_id and p.active) as active_plants,
  (select max(so.finished_at) from service_orders so where so.company_id = c.company_id and so.status = 'terminada') as last_service
from contacts c;

create or replace view v_volumes_today with (security_invoker = true) as
select coalesce(p.name, 'Sin planta') as plant,
  coalesce(sum(ce.total_volume) filter (where ce.operation = 'recepcion' and ce.cert_date = (now() at time zone 'America/La_Paz')::date), 0) as received_today,
  coalesce(sum(ce.total_volume) filter (where ce.operation = 'entrega' and ce.cert_date = (now() at time zone 'America/La_Paz')::date), 0) as delivered_today,
  coalesce(sum(ce.total_volume) filter (where ce.operation = 'recepcion' and ce.cert_date = (now() at time zone 'America/La_Paz')::date - 1), 0) as received_yesterday,
  coalesce(sum(ce.total_volume) filter (where ce.operation = 'entrega' and ce.cert_date = (now() at time zone 'America/La_Paz')::date - 1), 0) as delivered_yesterday
from certificates ce left join plants p on p.id = ce.plant_id
where ce.status = 'emitido' and ce.cert_date >= (now() at time zone 'America/La_Paz')::date - 1
group by p.name;

-- =====================================================================
-- 5. SEGURIDAD POR FILAS (RLS) Y POLÍTICAS POR ROL
-- =====================================================================
create or replace function _pol(t text, cmd text, roles text[]) returns void language plpgsql as $f$
declare cond text; nm text := t || '_' || lower(cmd);
begin
  cond := case when roles is null then 'public.is_active_user()'
               else format('public.has_role(%L::text[])', roles) end;
  execute format('drop policy if exists %I on public.%I', nm, t);
  if cmd = 'INSERT' then
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', nm, t, cond);
  elsif cmd = 'UPDATE' then
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', nm, t, cond, cond);
  else
    execute format('create policy %I on public.%I for %s to authenticated using (%s)', nm, t, cmd, cond);
  end if;
end $f$;

do $$
declare t text; r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;

  -- Lectura: cualquier usuario activo (excepto tablas especiales)
  foreach t in array array['settings','lead_sources','billing_units','payment_methods','activity_types','loss_reasons',
    'pipelines','pipeline_stages','services_catalog','companies','plants','contacts','opportunities',
    'opportunity_stage_history','opportunity_items','negotiation_history','alternative_offers','lead_reassignments',
    'quotations','quotation_versions','quotation_items','service_orders','service_order_tankers','service_order_samples',
    'certificates','certificate_measurements','certificate_seals','activities','notes','payments',
    'custom_field_definitions','custom_field_values','goals','attachments','products','company_products','company_services'] loop
    perform _pol(t, 'SELECT', null);
  end loop;

  -- Solo administrador: configuración
  foreach t in array array['settings','lead_sources','billing_units','payment_methods','activity_types','loss_reasons',
    'pipelines','pipeline_stages','services_catalog','custom_field_definitions','goals'] loop
    perform _pol(t, 'INSERT', array['admin']);
    perform _pol(t, 'UPDATE', array['admin']);
    perform _pol(t, 'DELETE', array['admin']);
  end loop;

  -- Todos los usuarios activos: clientes y oportunidades (sin borrado)
  foreach t in array array['companies','plants','contacts','opportunities'] loop
    perform _pol(t, 'INSERT', null);
    perform _pol(t, 'UPDATE', null);
  end loop;
  foreach t in array array['opportunity_items','alternative_offers','custom_field_values','activities'] loop
    perform _pol(t, 'INSERT', null);
    perform _pol(t, 'UPDATE', null);
  end loop;
  perform _pol('opportunity_items', 'DELETE', null);
  perform _pol('alternative_offers', 'DELETE', null);
  perform _pol('custom_field_values', 'DELETE', null);
  perform _pol('activities', 'DELETE', array['admin']);
  perform _pol('notes', 'INSERT', null);
  perform _pol('notes', 'DELETE', array['admin']);
  perform _pol('attachments', 'INSERT', null);
  perform _pol('attachments', 'DELETE', array['admin']);
  -- Productos: cualquiera registra uno nuevo («otros»); solo el administrador edita o desactiva
  perform _pol('products', 'INSERT', null);
  perform _pol('products', 'UPDATE', array['admin']);
  perform _pol('products', 'DELETE', array['admin']);
  foreach t in array array['company_products','company_services'] loop
    perform _pol(t, 'INSERT', null); perform _pol(t, 'UPDATE', null); perform _pol(t, 'DELETE', null);
  end loop;

  -- Comercial
  perform _pol('quotations', 'INSERT', array['admin','sup_comercial','vendedor']);
  perform _pol('quotations', 'UPDATE', array['admin','sup_comercial','vendedor']);
  perform _pol('quotation_versions', 'INSERT', array['admin','sup_comercial','vendedor']);
  perform _pol('quotation_items', 'INSERT', array['admin','sup_comercial','vendedor']);

  -- Operación
  perform _pol('service_orders', 'INSERT', array['admin','sup_operativo']);
  perform _pol('service_orders', 'UPDATE', array['admin','sup_operativo','inspector']);
  foreach t in array array['service_order_tankers','service_order_samples'] loop
    perform _pol(t, 'INSERT', array['admin','sup_operativo','inspector']);
    perform _pol(t, 'UPDATE', array['admin','sup_operativo','inspector']);
    perform _pol(t, 'DELETE', array['admin','sup_operativo']);
  end loop;
  foreach t in array array['certificates','certificate_measurements','certificate_seals'] loop
    perform _pol(t, 'INSERT', array['admin','sup_operativo','inspector']);
    perform _pol(t, 'UPDATE', array['admin','sup_operativo','inspector']);
  end loop;
  perform _pol('certificate_seals', 'DELETE', array['admin','sup_operativo']);

  -- Pagos (control interno)
  perform _pol('payments', 'INSERT', array['admin','sup_comercial','sup_operativo']);
  perform _pol('payments', 'UPDATE', array['admin']);
end $$;

-- Perfiles
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (id = auth.uid() or is_active_user());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or has_role(array['admin'])) with check (id = auth.uid() or has_role(array['admin']));

-- Notificaciones: solo las propias
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Auditoría: solo el administrador la lee; nadie escribe desde el cliente
drop policy if exists audit_logs_select on audit_logs;
create policy audit_logs_select on audit_logs for select to authenticated using (has_role(array['admin']));
-- certificate_sequences: sin políticas = sin acceso desde el cliente

drop function _pol(text, text, text[]);

-- =====================================================================
-- 6. DATOS INICIALES
-- =====================================================================
insert into lead_sources(name, sort) values
 ('Referidos',1),('Llamadas comerciales',2),('WhatsApp',3),('Correo electrónico',4),
 ('Visitas a empresas',5),('Licitaciones o contratos',6),('Clientes actuales con nuevos servicios',7)
on conflict (name) do nothing;

insert into loss_reasons(name) values
 ('Precio'),('Eligió a otra empresa'),('Sin respuesta del cliente'),('Ya no requiere el servicio'),('Otro')
on conflict (name) do nothing;

insert into activity_types(name, sort) values
 ('Llamada',1),('WhatsApp',2),('Correo',3),('Visita',4),('Reunión',5),('Seguimiento',6),
 ('Cotización enviada',7),('Inspección',8),('Toma de muestra',9),('Servicio programado',10),
 ('Servicio terminado',11),('Registro de pago',12)
on conflict (name) do nothing;

insert into billing_units(name) values ('Servicio'),('Cisterna'),('Muestra'),('Hora'),('Día')
on conflict (name) do nothing;

insert into payment_methods(name) values ('Transferencia bancaria'),('Pago por servicio terminado')
on conflict (name) do nothing;

insert into products(name) values ('Gasolina'),('Diésel') on conflict (name) do nothing;

-- Servicios sin precio: tú cargas las tarifas reales desde Configuración
insert into services_catalog(name, unit_id, default_price)
select s.name, (select id from billing_units where name = s.unit), 0 from (values
 ('Inspección de carga y descarga de camión cisterna','Cisterna'),
 ('Toma de muestras','Muestra'),
 ('Inspección con toma de muestras','Cisterna')) as s(name, unit)
on conflict (name) do nothing;

insert into settings(key, value) values
 ('company', '{"name":"","tax_id":"","address":"","phone":"","email":"","city":"Santa Cruz de la Sierra","fiscal_fields":[]}'),
 ('reassign_hours', '24'), ('notif_upcoming_hours', '24'),
 ('notif_quote_days', '3'), ('notif_cert_unsigned_hours', '24')
on conflict (key) do nothing;

do $$
declare pid uuid;
begin
  select id into pid from pipelines where name = 'Pipeline comercial';
  if pid is null then
    insert into pipelines(name, is_default) values ('Pipeline comercial', true) returning id into pid;
    insert into pipeline_stages(pipeline_id, name, color, sort, probability, kind) values
     (pid,'Nuevo','#737B84',1,10,'open'), (pid,'Contactado','#6FA8DC',2,20,'open'),
     (pid,'Calificado','#4A90D9',3,40,'open'), (pid,'Solicitud de cotización','#4A90D9',4,50,'open'),
     (pid,'Propuesta enviada','#174A7E',5,60,'open'), (pid,'Negociación','#174A7E',6,80,'open'),
     (pid,'Venta ganada','#3FA66B',7,100,'won'), (pid,'Venta perdida','#B5534E',8,0,'lost');
  end if;
end $$;

-- ---- Datos de demostración (marcados is_demo; se borran con delete_demo_data()) ----
do $$
declare c1 uuid; c2 uuid; p1 uuid; src uuid; pid uuid; k1 uuid; k2 uuid; k3 uuid;
begin
  if exists (select 1 from companies where is_demo) then return; end if;
  select id into src from lead_sources where name = 'Referidos';
  select id into pid from pipelines where is_default limit 1;
  insert into companies(name, city, is_demo) values ('DEMO · Distribuidora Oriente S.R.L.', 'Santa Cruz de la Sierra', true) returning id into c1;
  insert into companies(name, city, is_demo) values ('DEMO · Combustibles del Este S.A.', 'Santa Cruz de la Sierra', true) returning id into c2;
  insert into plants(company_id, name, location) values (c1, 'DEMO · Planta Norte', 'Zona Norte') returning id into p1;
  insert into plants(company_id, name, location) values (c2, 'DEMO · Planta Satélite', 'Camino a Cotoca');
  insert into contacts(full_name, email, phone, company_id, is_demo) values ('DEMO · Contacto Uno', 'uno@demo.invalid', '70000001', c1, true) returning id into k1;
  insert into contacts(full_name, email, phone, company_id, is_demo) values ('DEMO · Contacto Dos', 'dos@demo.invalid', '70000002', c2, true) returning id into k2;
  insert into contacts(full_name, email, phone, is_demo) values ('DEMO · Contacto Tres', 'tres@demo.invalid', '70000003', true) returning id into k3;
  insert into opportunities(title, contact_id, company_id, plant_id, pipeline_id, stage_id, source_id, amount, is_demo)
  values ('DEMO · Inspección mensual Planta Norte', k1, c1, p1, pid, (select id from pipeline_stages where pipeline_id = pid and name = 'Propuesta enviada'), src, 12000, true),
         ('DEMO · Toma de muestras trimestral', k2, c2, null, pid, (select id from pipeline_stages where pipeline_id = pid and name = 'Calificado'), src, 5000, true);
end $$;

create or replace function delete_demo_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role(array['admin']) then raise exception 'Solo el administrador puede borrar los datos de demostración'; end if;
  delete from opportunities o where o.is_demo
    and not exists (select 1 from quotations q where q.opportunity_id = o.id)
    and not exists (select 1 from service_orders s where s.opportunity_id = o.id);
  delete from contacts where is_demo;
  delete from plants p where p.company_id in (select id from companies where is_demo)
    and not exists (select 1 from certificates c where c.plant_id = p.id)
    and not exists (select 1 from service_orders s where s.plant_id = p.id);
  delete from companies c where c.is_demo
    and not exists (select 1 from certificates x where x.company_id = c.id)
    and not exists (select 1 from service_orders s where s.company_id = c.id)
    and not exists (select 1 from plants p where p.company_id = c.id);
end $$;

-- =====================================================================
-- 7. ALMACENAMIENTO (buckets): logos = público · documentos = privado
-- =====================================================================
insert into storage.buckets(id, name, public) values ('logos','logos',true), ('documentos','documentos',false)
on conflict (id) do update set public = excluded.public;

do $$
begin
  drop policy if exists cm_logos_read on storage.objects;
  create policy cm_logos_read on storage.objects for select using (bucket_id = 'logos');
  drop policy if exists cm_logos_insert on storage.objects;
  create policy cm_logos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and public.has_role(array['admin']));
  drop policy if exists cm_logos_update on storage.objects;
  create policy cm_logos_update on storage.objects for update to authenticated
    using (bucket_id = 'logos' and public.has_role(array['admin']));
  drop policy if exists cm_logos_delete on storage.objects;
  create policy cm_logos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'logos' and public.has_role(array['admin']));
  drop policy if exists cm_docs_read on storage.objects;
  create policy cm_docs_read on storage.objects for select to authenticated
    using (bucket_id = 'documentos' and public.is_active_user());
  drop policy if exists cm_docs_insert on storage.objects;
  create policy cm_docs_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'documentos' and public.is_active_user());
  drop policy if exists cm_docs_update on storage.objects;
  create policy cm_docs_update on storage.objects for update to authenticated
    using (bucket_id = 'documentos' and public.has_role(array['admin','sup_operativo']));
  drop policy if exists cm_docs_delete on storage.objects;
  create policy cm_docs_delete on storage.objects for delete to authenticated
    using (bucket_id = 'documentos' and public.has_role(array['admin']));
exception when insufficient_privilege then
  raise notice 'No se pudieron crear las políticas de Storage: créalas desde el panel (ver LEEME).';
end $$;

-- =====================================================================
-- 8. PERMISOS FINALES
-- =====================================================================
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function next_number(text, int) from authenticated;
notify pgrst, 'reload schema';
-- FIN DEL SCRIPT 1
