-- =====================================================================
-- 04 · Observaciones de la Versión 1
-- Ejecutar UNA vez en Supabase → SQL Editor → Run
-- =====================================================================

-- 1) Cisternas (placa, conductor, carnet, empresa de transporte)
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  driver_name text not null,
  driver_id_card text not null,
  transport_company text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists vehicles_plate_uq on vehicles (upper(trim(plate)));
alter table vehicles enable row level security;
drop policy if exists vehicles_select on vehicles;
drop policy if exists vehicles_insert on vehicles;
drop policy if exists vehicles_update on vehicles;
create policy vehicles_select on vehicles for select to authenticated using (public.is_active_user());
create policy vehicles_insert on vehicles for insert to authenticated with check (public.has_role(array['admin']));
create policy vehicles_update on vehicles for update to authenticated
  using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

-- 2) Lote de almacenaje en certificados (modelo Fénix)
alter table certificates add column if not exists storage_lot text;

-- 3) save_certificate con lote de almacenaje
create or replace function save_certificate(p jsonb) returns certificates
language plpgsql security definer set search_path = public as $$
declare c certificates; m jsonb; s text; i int := 0;
begin
  if not has_role(array['admin','sup_operativo','inspector']) then
    raise exception 'Sin permiso para registrar certificados'; end if;
  insert into certificates(operation, cert_date, measurement_type, company_id, plant_id, service_order_id,
      product, tank_no, ticket_no, storage_lot, from_dispatcher, from_delivery_point, to_receiver, to_reception_point,
      remito_volume, difference, driver, driver_id_card, plate, transport_company, observations,
      sig_inspector_name, sig_inspector_path, sig_carrier_name, sig_carrier_path, sig_storage_name, sig_storage_path)
  values (p->>'operation', (p->>'cert_date')::date, p->>'measurement_type',
      nullif(p->>'company_id','')::uuid, nullif(p->>'plant_id','')::uuid, nullif(p->>'service_order_id','')::uuid,
      p->>'product', p->>'tank_no', p->>'ticket_no', p->>'storage_lot', p->>'from_dispatcher', p->>'from_delivery_point',
      p->>'to_receiver', p->>'to_reception_point',
      nullif(p->>'remito_volume','')::numeric, null,
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
