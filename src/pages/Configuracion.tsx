import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

interface Item { id: string; name: string; active: boolean }
interface Plant { id: string; company_id: string; name: string; location: string | null; active: boolean }
interface Svc extends Item { default_price: number; unit_id: string | null }
const TABS = ["Empresa", "Metas", "Pipeline", "Automatizaciones", "Campos personalizados", "Orígenes de leads", "Servicios", "Productos", "Cisternas", "Motivos de pérdida"] as const;
type Tab = (typeof TABS)[number];

function Simple({ table }: { table: "lead_sources" | "loss_reasons" | "products" }) {
  const [rows, setRows] = useState<Item[]>([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => { const { data, error } = await supabase.from(table).select("id,name,active").order("name"); if (error) setErr(error.message); else setRows((data as Item[] | null) ?? []); }, [table]);
  useEffect(() => { void load(); }, [load]);
  const add = async (e: FormEvent) => { e.preventDefault(); const { error } = await supabase.from(table).insert({ name: name.trim() }); setErr(error?.message ?? ""); setName(""); void load(); };
  const tog = async (r: Item) => { const { error } = await supabase.from(table).update({ active: !r.active }).eq("id", r.id); setErr(error?.message ?? ""); void load(); };
  return <div className="card">
    <form onSubmit={(e) => void add(e)} style={{ display: "flex", gap: 8, marginBottom: 10 }}><input className="in" style={{ maxWidth: 300 }} required placeholder="Nombre nuevo" aria-label="Nombre nuevo" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn p">Agregar</button></form>
    {err && <p className="err" role="alert">{err}</p>}
    <table><tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.active ? "✓ Activo" : "○ Inactivo"}</td><td className="n"><button className="btn" onClick={() => void tog(r)}>{r.active ? "Desactivar" : "Reactivar"}</button></td></tr>)}</tbody></table></div>;
}

function Servicios() {
  const [rows, setRows] = useState<Svc[]>([]);
  const [units, setUnits] = useState<Item[]>([]);
  const [n, setN] = useState({ name: "", unit: "", price: "" });
  const [err, setErr] = useState("");
  const load = useCallback(async () => { const { data } = await supabase.from("services_catalog").select("*").order("name"); setRows((data as Svc[] | null) ?? []); }, []);
  useEffect(() => { void load(); supabase.from("billing_units").select("id,name,active").then(({ data }) => setUnits((data as Item[] | null) ?? [])); }, [load]);
  const add = async (e: FormEvent) => { e.preventDefault(); const { error } = await supabase.from("services_catalog").insert({ name: n.name.trim(), unit_id: n.unit || null, default_price: Number(n.price || 0) }); setErr(error?.message ?? ""); setN({ name: "", unit: "", price: "" }); void load(); };
  const upd = async (r: Svc, patch: Partial<Svc>) => { const { error } = await supabase.from("services_catalog").update(patch).eq("id", r.id); setErr(error?.message ?? ""); void load(); };
  return <div className="card"><p className="note">Aquí cargas tus tarifas reales (Bs). El sistema no inventa precios.</p>
    <form onSubmit={(e) => void add(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}><input className="in" style={{ maxWidth: 260 }} required placeholder="Servicio" aria-label="Servicio" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
      <select className="in" style={{ maxWidth: 150 }} aria-label="Unidad" value={n.unit} onChange={(e) => setN({ ...n, unit: e.target.value })}><option value="">Unidad…</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      <input className="in" style={{ maxWidth: 120 }} type="number" min="0" step="0.01" placeholder="Precio Bs" aria-label="Precio" value={n.price} onChange={(e) => setN({ ...n, price: e.target.value })} /><button className="btn p">Agregar</button></form>
    {err && <p className="err" role="alert">{err}</p>}
    <table><thead><tr><th>Servicio</th><th className="n">Precio (Bs)</th><th>Estado</th><th /></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td>
      <td className="n"><input className="in" style={{ width: 110 }} type="number" min="0" step="0.01" aria-label={`Precio de ${r.name}`} defaultValue={r.default_price} onBlur={(e) => { const v = Number(e.target.value); if (v !== Number(r.default_price)) void upd(r, { default_price: v }); }} /></td>
      <td>{r.active ? "✓ Activo" : "○ Inactivo"}</td><td className="n"><button className="btn" onClick={() => void upd(r, { active: !r.active })}>{r.active ? "Desactivar" : "Reactivar"}</button></td></tr>)}</tbody></table></div>;
}

interface Opt { id: string; name: string }
const num = (v: string): number => Number(v || 0);

function Empresa() {
  const [v, setV] = useState({ name: "", tax_id: "", address: "", phone: "", email: "", city: "", fiscal: "" });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "company").maybeSingle().then(({ data }) => {
      const x = (data as { value: Record<string, unknown> } | null)?.value ?? {};
      const f = (x.fiscal as Record<string, string> | undefined) ?? {};
      setV({ name: String(x.name ?? ""), tax_id: String(x.tax_id ?? ""), address: String(x.address ?? ""), phone: String(x.phone ?? ""), email: String(x.email ?? ""), city: String(x.city ?? ""), fiscal: Object.entries(f).map(([k, val]) => `${k}: ${val}`).join("\n") });
    });
  }, []);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const fiscal: Record<string, string> = {};
    v.fiscal.split("\n").forEach((l) => { const i = l.indexOf(":"); if (i > 0) fiscal[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    const { error } = await supabase.from("settings").upsert({ key: "company", value: { name: v.name, tax_id: v.tax_id, address: v.address, phone: v.phone, email: v.email, city: v.city, fiscal } });
    setMsg(error ? error.message : "✓ Guardado. Se usará en las cotizaciones en PDF.");
  };
  const f = (k: keyof typeof v, label: string) => <label className="f">{label}<input className="in" style={{ textAlign: "left" }} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>;
  return <form className="card grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }} onSubmit={(e) => void save(e)}>
    {f("name", "Nombre de la empresa")}{f("tax_id", "NIT")}{f("address", "Dirección")}{f("phone", "Teléfono")}{f("email", "Correo")}{f("city", "Ciudad")}
    <label className="f" style={{ gridColumn: "1 / -1" }}>Campos fiscales para cotizaciones (uno por línea, «Etiqueta: valor»)<textarea className="in" style={{ height: 80, padding: 8 }} value={v.fiscal} onChange={(e) => setV({ ...v, fiscal: e.target.value })} /></label>
    <div><button className="btn p">Guardar datos</button> {msg && <span role="status" className="note">{msg}</span>}</div></form>;
}

function Metas() {
  const [users, setUsers] = useState<Opt[]>([]);
  const [rows, setRows] = useState<{ id: string; user_id: string | null; month: string; target: number; profiles: { full_name: string } | null }[]>([]);
  const [n, setN] = useState({ month: new Date().toISOString().slice(0, 7), user: "", target: "" });
  const [err, setErr] = useState("");
  const load = useCallback(async () => { const { data } = await supabase.from("goals").select("id,user_id,month,target,profiles(full_name)").order("month", { ascending: false }).limit(60); setRows((data as unknown as typeof rows | null) ?? []); }, []);
  useEffect(() => { void load(); supabase.from("profiles").select("id,full_name").eq("active", true).then(({ data }) => setUsers(((data as { id: string; full_name: string }[] | null) ?? []).map((p) => ({ id: p.id, name: p.full_name })))); }, [load]);
  const save = async (e: FormEvent) => { e.preventDefault(); const { error } = await supabase.from("goals").upsert({ user_id: n.user || null, month: n.month + "-01", target: num(n.target) }, { onConflict: "user_id,month" }); setErr(error?.message ?? ""); setN({ ...n, target: "" }); void load(); };
  return <div className="card"><p className="note">Meta de ventas en Bs por mes. Sin responsable = meta general de la empresa.</p>
    <form onSubmit={(e) => void save(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}><input className="in" style={{ width: 160 }} type="month" required aria-label="Mes" value={n.month} onChange={(e) => setN({ ...n, month: e.target.value })} />
      <select className="in" style={{ width: 200 }} aria-label="Responsable" value={n.user} onChange={(e) => setN({ ...n, user: e.target.value })}><option value="">Meta general</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      <input className="in" style={{ width: 140 }} type="number" min="0" step="0.01" required placeholder="Meta Bs" aria-label="Meta" value={n.target} onChange={(e) => setN({ ...n, target: e.target.value })} /><button className="btn p">Guardar meta</button></form>
    {err && <p className="err" role="alert">{err}</p>}
    <table><thead><tr><th>Mes</th><th>Responsable</th><th className="n">Meta</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td className="mono">{r.month.slice(0, 7)}</td><td>{r.profiles?.full_name ?? "General"}</td><td className="n mono">Bs {Number(r.target).toLocaleString("es-BO")}</td></tr>)}</tbody></table></div>;
}

interface St { id: string; name: string; color: string; sort: number; probability: number; kind: "open" | "won" | "lost" }
function PipelineCfg() {
  const [pipes, setPipes] = useState<Opt[]>([]);
  const [pid, setPid] = useState("");
  const [sts, setSts] = useState<St[]>([]);
  const [np, setNp] = useState("");
  const [ns, setNs] = useState({ name: "", kind: "open", prob: "0" });
  const [err, setErr] = useState("");
  const loadP = useCallback(async () => { const { data } = await supabase.from("pipelines").select("id,name").order("name"); const p = (data as Opt[] | null) ?? []; setPipes(p); setPid((x) => x || p[0]?.id || ""); }, []);
  const loadS = useCallback(async () => { if (!pid) return; const { data } = await supabase.from("pipeline_stages").select("*").eq("pipeline_id", pid).order("sort"); setSts((data as St[] | null) ?? []); }, [pid]);
  useEffect(() => { void loadP(); }, [loadP]); useEffect(() => { void loadS(); }, [loadS]);
  const upd = async (s: St, patch: Partial<St>) => { const { error } = await supabase.from("pipeline_stages").update(patch).eq("id", s.id); setErr(error?.message ?? ""); void loadS(); };
  const addP = async (e: FormEvent) => { e.preventDefault(); const { error } = await supabase.from("pipelines").insert({ name: np.trim() }); setErr(error?.message ?? ""); setNp(""); void loadP(); };
  const addS = async (e: FormEvent) => { e.preventDefault(); const { error } = await supabase.from("pipeline_stages").insert({ pipeline_id: pid, name: ns.name.trim(), kind: ns.kind, probability: num(ns.prob), sort: (sts[sts.length - 1]?.sort ?? 0) + 1 }); setErr(error?.message ?? ""); setNs({ name: "", kind: "open", prob: "0" }); void loadS(); };
  return <div className="card">
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}><select className="in" style={{ width: 220 }} aria-label="Pipeline" value={pid} onChange={(e) => setPid(e.target.value)}>{pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <form onSubmit={(e) => void addP(e)} style={{ display: "flex", gap: 8 }}><input className="in" style={{ width: 180 }} required placeholder="Nuevo pipeline" aria-label="Nuevo pipeline" value={np} onChange={(e) => setNp(e.target.value)} /><button className="btn">Crear</button></form></div>
    {err && <p className="err" role="alert">{err}</p>}
    <table><thead><tr><th>Etapa</th><th>Tipo</th><th className="n">Prob. %</th><th className="n">Orden</th><th>Color</th></tr></thead><tbody>{sts.map((s) => <tr key={s.id}>
      <td><input className="in" aria-label="Nombre de etapa" defaultValue={s.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== s.name) void upd(s, { name: e.target.value.trim() }); }} /></td>
      <td><select className="in" aria-label="Tipo" value={s.kind} onChange={(e) => void upd(s, { kind: e.target.value as St["kind"] })}><option value="open">Abierta</option><option value="won">Ganada</option><option value="lost">Perdida</option></select></td>
      <td><input className="in" type="number" min="0" max="100" aria-label="Probabilidad" defaultValue={s.probability} onBlur={(e) => { if (num(e.target.value) !== Number(s.probability)) void upd(s, { probability: num(e.target.value) }); }} /></td>
      <td><input className="in" type="number" aria-label="Orden" defaultValue={s.sort} onBlur={(e) => { if (num(e.target.value) !== s.sort) void upd(s, { sort: num(e.target.value) }); }} /></td>
      <td><input type="color" aria-label="Color" defaultValue={s.color} onBlur={(e) => { if (e.target.value !== s.color) void upd(s, { color: e.target.value }); }} /></td></tr>)}</tbody></table>
    <form onSubmit={(e) => void addS(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><input className="in" style={{ width: 200 }} required placeholder="Nueva etapa" aria-label="Nueva etapa" value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} />
      <select className="in" style={{ width: 120 }} aria-label="Tipo de etapa" value={ns.kind} onChange={(e) => setNs({ ...ns, kind: e.target.value })}><option value="open">Abierta</option><option value="won">Ganada</option><option value="lost">Perdida</option></select>
      <input className="in" style={{ width: 90 }} type="number" min="0" max="100" aria-label="Probabilidad" value={ns.prob} onChange={(e) => setNs({ ...ns, prob: e.target.value })} /><button className="btn" disabled={!pid}>Agregar etapa</button></form></div>;
}

const AUTO: [string, string, number][] = [["reassign_hours", "Horas hábiles sin actividad para reasignar un lead", 24], ["notif_upcoming_hours", "Avisar actividades y servicios próximos (horas)", 24], ["notif_quote_days", "Avisar cotización sin respuesta (días)", 3], ["notif_cert_unsigned_hours", "Avisar certificado sin firmas (horas)", 24]];
function Automatizaciones() {
  const [v, setV] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  useEffect(() => { supabase.from("settings").select("key,value").in("key", AUTO.map((a) => a[0])).then(({ data }) => { const o: Record<string, string> = {}; ((data as { key: string; value: number }[] | null) ?? []).forEach((r) => { o[r.key] = String(r.value); }); setV(o); }); }, []);
  const save = async (e: FormEvent) => { e.preventDefault(); const { error } = await supabase.from("settings").upsert(AUTO.map(([k, , d]) => ({ key: k, value: num(v[k] ?? String(d)) }))); setMsg(error ? error.message : "✓ Guardado."); };
  const run = async () => { const a = await supabase.rpc("run_reassignment"); const b = await supabase.rpc("run_notifications"); setMsg(a.error ?? b.error ? (a.error ?? b.error)?.message ?? "" : `✓ Revisión hecha: ${String(a.data)} leads reasignados y ${String(b.data)} notificaciones nuevas.`); };
  return <div className="card"><form onSubmit={(e) => void save(e)} className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
    {AUTO.map(([k, l, d]) => <label key={k} className="f">{l}<input className="in" type="number" min="0" value={v[k] ?? String(d)} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>)}
    <div><button className="btn p">Guardar plazos</button></div></form>
    <div style={{ marginTop: 14 }}><button className="btn" onClick={() => void run()}>Revisar ahora</button><p className="note">Estas revisiones corren al abrir la aplicación y con este botón. No se ejecutan en segundo plano.</p></div>
    {msg && <p role="status">{msg}</p>}</div>;
}

interface Def { id: string; entity: "contact" | "opportunity"; name: string; field_type: string; options: string[]; required: boolean; active: boolean }
function Campos() {
  const [rows, setRows] = useState<Def[]>([]);
  const [n, setN] = useState({ entity: "contact", name: "", type: "texto", options: "", required: false });
  const [err, setErr] = useState("");
  const load = useCallback(async () => { const { data } = await supabase.from("custom_field_definitions").select("*").order("entity").order("sort"); setRows((data as Def[] | null) ?? []); }, []);
  useEffect(() => { void load(); }, [load]);
  const add = async (e: FormEvent) => { e.preventDefault(); const { error } = await supabase.from("custom_field_definitions").insert({ entity: n.entity, name: n.name.trim(), field_type: n.type, options: n.type === "seleccion" ? n.options.split(",").map((x) => x.trim()).filter(Boolean) : [], required: n.required, sort: rows.length + 1 }); setErr(error?.message.includes("duplicate") ? "Ya existe un campo con ese nombre." : error?.message ?? ""); setN({ ...n, name: "", options: "" }); void load(); };
  const tog = async (r: Def) => { const { error } = await supabase.from("custom_field_definitions").update({ active: !r.active }).eq("id", r.id); setErr(error?.message ?? ""); void load(); };
  return <div className="card"><p className="note">Campos extra para contactos y oportunidades. Los datos esenciales ya son columnas fijas.</p>
    <form onSubmit={(e) => void add(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
      <select className="in" style={{ width: 150 }} aria-label="Se aplica a" value={n.entity} onChange={(e) => setN({ ...n, entity: e.target.value })}><option value="contact">Contactos</option><option value="opportunity">Oportunidades</option></select>
      <input className="in" style={{ width: 180 }} required placeholder="Nombre del campo" aria-label="Nombre del campo" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
      <select className="in" style={{ width: 150 }} aria-label="Tipo" value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })}><option value="texto">Texto</option><option value="numero">Número</option><option value="fecha">Fecha</option><option value="seleccion">Selección</option><option value="booleano">Sí / No</option><option value="texto_largo">Texto largo</option></select>
      {n.type === "seleccion" && <input className="in" style={{ width: 220 }} required placeholder="Opciones separadas por coma" aria-label="Opciones" value={n.options} onChange={(e) => setN({ ...n, options: e.target.value })} />}
      <label><input type="checkbox" checked={n.required} onChange={(e) => setN({ ...n, required: e.target.checked })} /> Obligatorio</label><button className="btn p">Agregar campo</button></form>
    {err && <p className="err" role="alert">{err}</p>}
    <table><tbody>{rows.map((r) => <tr key={r.id}><td>{r.entity === "contact" ? "Contactos" : "Oportunidades"}</td><td>{r.name}{r.required ? " *" : ""}</td><td>{r.field_type}</td><td>{r.active ? "✓ Activo" : "○ Inactivo"}</td><td className="n"><button className="btn" onClick={() => void tog(r)}>{r.active ? "Desactivar" : "Reactivar"}</button></td></tr>)}</tbody></table></div>;
}

interface Veh { id: string; plate: string; driver_name: string; driver_id_card: string; transport_company: string; active: boolean }
function Cisternas() {
  const [rows, setRows] = useState<Veh[]>([]);
  const [n, setN] = useState({ plate: "", driver: "", ci: "", company: "" });
  const [err, setErr] = useState("");
  const load = useCallback(async () => { const { data, error } = await supabase.from("vehicles").select("*").order("plate"); if (error) setErr(error.message); else setRows((data as Veh[] | null) ?? []); }, []);
  useEffect(() => { void load(); }, [load]);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("vehicles").insert({ plate: n.plate.trim().toUpperCase(), driver_name: n.driver.trim(), driver_id_card: n.ci.trim(), transport_company: n.company.trim() });
    setErr(error ? (error.message.includes("duplicate") ? "Esa placa ya está registrada." : error.message) : ""); if (!error) setN({ plate: "", driver: "", ci: "", company: "" }); void load();
  };
  const upd = async (r: Veh, patch: Partial<Veh>) => { const { error } = await supabase.from("vehicles").update(patch).eq("id", r.id); setErr(error?.message ?? ""); void load(); };
  return <div className="card"><p className="note">Registra aquí cada cisterna. Al hacer un certificado se busca por placa y se llenan conductor, carnet y empresa.</p>
    <form onSubmit={(e) => void add(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
      <input className="in mono" style={{ maxWidth: 120 }} required placeholder="Placa" aria-label="Placa" value={n.plate} onChange={(e) => setN({ ...n, plate: e.target.value })} />
      <input className="in" style={{ maxWidth: 200 }} required placeholder="Nombre del conductor" aria-label="Conductor" value={n.driver} onChange={(e) => setN({ ...n, driver: e.target.value })} />
      <input className="in" style={{ maxWidth: 140 }} required placeholder="Carnet de identidad" aria-label="Carnet de identidad" value={n.ci} onChange={(e) => setN({ ...n, ci: e.target.value })} />
      <input className="in" style={{ maxWidth: 200 }} required placeholder="Empresa de transporte" aria-label="Empresa de transporte" value={n.company} onChange={(e) => setN({ ...n, company: e.target.value })} />
      <button className="btn p">Agregar cisterna</button></form>
    {err && <p className="err" role="alert">{err}</p>}
    <table><thead><tr><th>Placa</th><th>Conductor</th><th>Carnet</th><th>Empresa de transporte</th><th>Estado</th><th /></tr></thead><tbody>{rows.map((r) => <tr key={r.id}>
      <td className="mono">{r.plate}</td>
      <td><input className="in" aria-label={`Conductor ${r.plate}`} defaultValue={r.driver_name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.driver_name) void upd(r, { driver_name: v }); }} /></td>
      <td><input className="in" aria-label={`Carnet ${r.plate}`} defaultValue={r.driver_id_card} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.driver_id_card) void upd(r, { driver_id_card: v }); }} /></td>
      <td><input className="in" aria-label={`Empresa ${r.plate}`} defaultValue={r.transport_company} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.transport_company) void upd(r, { transport_company: v }); }} /></td>
      <td>{r.active ? "✓ Activa" : "○ Inactiva"}</td><td className="n"><button className="btn" onClick={() => void upd(r, { active: !r.active })}>{r.active ? "Desactivar" : "Reactivar"}</button></td></tr>)}</tbody></table>
    {!rows.length && <p className="note">Aún no hay cisternas registradas.</p>}</div>;
}

export default function Configuracion() {
  const [tab, setTab] = useState<Tab>("Empresa");
  return <><h1>Configuración</h1>
    <div className="tabs" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === "Empresa" && <Empresa />}{tab === "Metas" && <Metas />}{tab === "Pipeline" && <PipelineCfg />}{tab === "Automatizaciones" && <Automatizaciones />}{tab === "Campos personalizados" && <Campos />}{tab === "Productos" && <Simple table="products" />}{tab === "Orígenes de leads" && <Simple table="lead_sources" />}{tab === "Servicios" && <Servicios />}{tab === "Cisternas" && <Cisternas />}{tab === "Motivos de pérdida" && <Simple table="loss_reasons" />}</>;
}
