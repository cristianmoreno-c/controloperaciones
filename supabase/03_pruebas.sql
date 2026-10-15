-- =====================================================================
-- CM — PRUEBAS de las reglas críticas (opcional, después de los Scripts 1 y 2)
-- Pégalo en SQL Editor → Run. Usa datos temporales y SIEMPRE los descarta.
-- El resultado aparece como un mensaje: "✓ PRUEBAS OK" (todo bien) o "✗ FALLARON: …".
-- Aunque salga en rojo como error, es la forma de descartar los datos de prueba.
-- =====================================================================
do $$
declare
  adm uuid; v_pipe uuid; v_open uuid; v_won uuid; v_src uuid; v_co uuid; v_ct uuid; v_opp uuid;
  c1 certificates; c2 certificates; v_ord uuid; q1 uuid; v_p numeric; x numeric; s text;
  fails text := ''; passed int := 0; n_tests int := 0; n1 int; n2 int;
begin
  select id into adm from profiles where role = 'admin' and active limit 1;
  if adm is null then raise exception 'Primero ejecuta el Script 2: no hay un administrador activo.'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  -- 1) Numeración correlativa anual y 2) volumen = GSV final − inicial
  c1 := save_certificate(jsonb_build_object('operation','recepcion','cert_date',current_date,'plate','TEST-1',
        'measurements', jsonb_build_array(jsonb_build_object('kind','inicial','gsv',1000), jsonb_build_object('kind','final','gsv',31000)),
        'seals', jsonb_build_array('A1','A2')));
  c2 := save_certificate(jsonb_build_object('operation','entrega','cert_date',current_date,'plate','TEST-2'));
  n1 := right(c1.number, 4)::int; n2 := right(c2.number, 4)::int;
  n_tests := n_tests + 1; if c1.number ~ '^CRE-[0-9]{4}-[0-9]{4}$' and n2 = n1 + 1 and c1.number <> c2.number then passed := passed + 1; else fails := fails || ' [numeración correlativa]'; end if;
  n_tests := n_tests + 1; if c1.total_volume = 30000 then passed := passed + 1; else fails := fails || ' [volumen final−inicial]'; end if;
  n_tests := n_tests + 1; begin update certificates set number = 'CRE-2000-0001' where id = c1.id; fails := fails || ' [número inalterable]'; exception when others then passed := passed + 1; end;
  n_tests := n_tests + 1; begin delete from certificates where id = c1.id; fails := fails || ' [certificado no se borra]'; exception when others then passed := passed + 1; end;

  -- 3) Montos, ponderado, conversión a cliente
  select id into v_pipe from pipelines where is_default limit 1;
  select id into v_open from pipeline_stages where pipeline_id = v_pipe and kind = 'open' order by sort limit 1;
  select id into v_won from pipeline_stages where pipeline_id = v_pipe and kind = 'won' limit 1;
  select id into v_src from lead_sources limit 1;
  select probability into v_p from pipeline_stages where id = v_open;
  insert into companies(name) values ('TEST Empresa') returning id into v_co;
  insert into contacts(full_name, company_id) values ('TEST Contacto', v_co) returning id into v_ct;
  insert into opportunities(title, contact_id, company_id, pipeline_id, stage_id, source_id) values ('TEST Opp', v_ct, v_co, v_pipe, v_open, v_src) returning id into v_opp;
  n_tests := n_tests + 1; select status into s from contacts where id = v_ct; if s = 'lead' then passed := passed + 1; else fails := fails || ' [contacto pasa a lead]'; end if;
  insert into opportunity_items(opportunity_id, description, quantity, list_price, discount_pct) values (v_opp, 'x', 2, 100, 10);
  select amount into x from opportunities where id = v_opp;
  n_tests := n_tests + 1; if x = 180 then passed := passed + 1; else fails := fails || ' [monto desde líneas]'; end if;
  select weighted_amount into x from opportunities where id = v_opp;
  n_tests := n_tests + 1; if x = round(180 * v_p / 100, 2) then passed := passed + 1; else fails := fails || ' [monto ponderado]'; end if;
  update opportunities set stage_id = v_won where id = v_opp;
  n_tests := n_tests + 1; select status into s from contacts where id = v_ct; if s = 'cliente' then passed := passed + 1; else fails := fails || ' [conversión a cliente al ganar]'; end if;

  -- 4) Cotización con versiones que conservan su contenido
  q1 := save_quotation(jsonb_build_object('opportunity_id', v_opp, 'payment_terms', 'x', 'items', jsonb_build_array(jsonb_build_object('description','x','quantity',1,'unit_price',100))));
  perform save_quotation(jsonb_build_object('quotation_id', q1, 'opportunity_id', v_opp, 'payment_terms', 'x', 'items', jsonb_build_array(jsonb_build_object('description','x','quantity',1,'unit_price',200))));
  n_tests := n_tests + 1; select qv.total into x from quotation_versions qv where qv.quotation_id = q1 and qv.version = 1;
  if x = 100 and (select count(*) from quotation_versions where quotation_id = q1) = 2 and (select current_version from quotations where id = q1) = 2 then passed := passed + 1; else fails := fails || ' [versiones de cotización]'; end if;
  n_tests := n_tests + 1; begin update quotation_versions set total = 1 where quotation_id = q1; fails := fails || ' [versión inmutable]'; exception when others then passed := passed + 1; end;

  -- 5) Pagos parciales y saldo
  insert into service_orders(company_id, agreed_amount) values (v_co, 500) returning id into v_ord;
  insert into payments(order_id, amount) values (v_ord, 200);
  n_tests := n_tests + 1; if (select balance from service_orders where id = v_ord) = 300 and (select payment_status from service_orders where id = v_ord) = 'parcial' then passed := passed + 1; else fails := fails || ' [pago parcial y saldo]'; end if;
  insert into payments(order_id, amount) values (v_ord, 300);
  n_tests := n_tests + 1; if (select balance from service_orders where id = v_ord) = 0 and (select payment_status from service_orders where id = v_ord) = 'pagado' then passed := passed + 1; else fails := fails || ' [pago completo]'; end if;

  -- 6) Permisos por rol: el usuario baja a Inspector dentro de la prueba
  update profiles set role = 'inspector' where id = adm;
  n_tests := n_tests + 1; begin perform void_service_order(v_ord, 'prueba'); fails := fails || ' [inspector no anula órdenes]'; exception when others then passed := passed + 1; end;
  n_tests := n_tests + 1; begin update profiles set role = 'admin' where id = adm; fails := fails || ' [nadie se sube de rol]'; exception when others then passed := passed + 1; end;
  n_tests := n_tests + 1; begin perform admin_set_user(adm, 'x', 'admin', true); fails := fails || ' [solo admin gestiona usuarios]'; exception when others then passed := passed + 1; end;

  raise exception '%', case when fails = '' then '✓ PRUEBAS OK (' || passed || '/' || n_tests || '). Los datos de prueba se descartaron.'
                            else '✗ FALLARON:' || fails || ' (' || passed || '/' || n_tests || ' correctas)' end;
end $$;
