import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth";

interface Act { id: string; title: string; due_at: string | null; done: boolean; assigned_to: string | null; activity_types: { name: string } | null; contacts: { full_name: string } | null }
interface Opt { id: string; name: string }
const TABS = ["Hoy", "Próximas", "Vencidas", "Completadas"] as const;
type Tab = (typeof TABS)[number];
const fmt = (s: string | null): string => (s ? new Date(s).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: "America/La_Paz" }) : "Sin fecha");
const dayKey = (s: string): string => new Date(s).toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });

export default function Actividades() {
  const { profile } = useAuth();
  const sup = profile !== null && ["admin", "sup_comercial", "sup_operativo"].includes(profile.role);
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<Act[]>([]);
  const [tab, setTab] = useState<Tab>("Hoy");
  const [types, setTypes] = useState<Opt[]>([]);
  const [contacts, setContacts] = useState<{ id: string; full_name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [n, setN] = useState({ type: "", title: "", due: "", contact: "" });
  const [err, setErr] = useState("");
  const [view, setView] = useState<"Lista" | "Calendario">("Lista");
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [dayS, setDayS] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    let qb = supabase.from("activities").select("id,title,due_at,done,assigned_to,activity_types(name),contacts(full_name)").order("due_at", { ascending: true, nullsFirst: false }).limit(300);
    if (!(sup && all)) qb = qb.eq("assigned_to", profile.id);
    const { data, error } = await qb;
    if (error) setErr(error.message); else { setErr(""); setRows((data as unknown as Act[] | null) ?? []); }
  }, [profile, sup, all]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    supabase.from("activity_types").select("id,name").eq("active", true).order("sort").then(({ data }) => setTypes((data as Opt[] | null) ?? []));
    supabase.from("contacts").select("id,full_name").order("full_name").limit(300).then(({ data }) => setContacts((data as { id: string; full_name: string }[] | null) ?? []));
  }, []);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
  const inTab = (a: Act): boolean => {
    if (tab === "Completadas") return a.done;
    if (a.done) return false;
    const d = a.due_at ? dayKey(a.due_at) : null;
    if (tab === "Vencidas") return d !== null && d < today;
    if (tab === "Hoy") return d === today;
    return d === null || d > today;
  };
  const list = rows.filter(inTab);
  const count = (t: Tab) => rows.filter((a) => { const d = a.due_at ? dayKey(a.due_at) : null; return t === "Completadas" ? a.done : !a.done && (t === "Vencidas" ? d !== null && d < today : t === "Hoy" ? d === today : d === null || d > today); }).length;
  const toggle = async (a: Act) => { const { error } = await supabase.from("activities").update({ done: !a.done, done_at: a.done ? null : new Date().toISOString() }).eq("id", a.id); setErr(error?.message ?? ""); void load(); };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("activities").insert({ type_id: n.type || null, title: n.title.trim(), due_at: n.due ? new Date(n.due).toISOString() : null, contact_id: n.contact || null });
    setErr(error?.message ?? ""); setN({ type: "", title: "", due: "", contact: "" }); setOpen(false); void load();
  };

  const y = cur.getFullYear(); const mo = cur.getMonth();
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7; const dim = new Date(y, mo + 1, 0).getDate();
  const byDay: Record<string, Act[]> = {}; rows.forEach((x) => { if (x.due_at) (byDay[dayKey(x.due_at)] ??= []).push(x); });
  const key = (d: number): string => `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const cal = (<div className="card"><div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
      <button className="btn" aria-label="Mes anterior" onClick={() => setCur(new Date(y, mo - 1, 1))}>‹</button><b style={{ minWidth: 150, textAlign: "center" }}>{cur.toLocaleDateString("es-BO", { month: "long", year: "numeric" })}</b><button className="btn" aria-label="Mes siguiente" onClick={() => setCur(new Date(y, mo + 1, 1))}>›</button></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>{["L", "M", "X", "J", "V", "S", "D"].map((d) => <div key={d} className="note" style={{ textAlign: "center" }}>{d}</div>)}
      {Array.from({ length: lead + dim }, (_, i) => (i < lead ? null : i - lead + 1)).map((d, i) => d === null ? <div key={i} /> : (() => { const list2 = byDay[key(d)] ?? []; const late = list2.some((z) => !z.done && key(d) < today);
        return <button key={i} className="btn" style={{ minHeight: 52, flexDirection: "column", alignItems: "flex-start", background: dayS === key(d) ? "var(--bg)" : "none" }} aria-label={`Día ${d}, ${list2.length} actividades`} onClick={() => setDayS(key(d))}><span className="mono">{d}</span>{list2.length > 0 && <span className="note" style={{ color: late ? "var(--bad)" : "var(--tx2)" }}>{late ? "▲" : "●"} {list2.length}</span>}</button>; })())}</div>
    {dayS && <div style={{ marginTop: 10 }}><h2>{dayS}</h2>{(byDay[dayS] ?? []).map((x) => <label key={x.id} style={{ display: "flex", gap: 10, minHeight: 36, alignItems: "center" }}><input type="checkbox" checked={x.done} onChange={() => void toggle(x)} aria-label={`Completar ${x.title}`} /><span>{x.done ? "✓ " : "◔ "}<b>{x.activity_types?.name ?? "Actividad"}</b> · {x.title} <span className="note mono">{fmt(x.due_at)}</span></span></label>)}{!(byDay[dayS] ?? []).length && <p className="note">Sin actividades este día.</p>}</div>}</div>);
  return (<>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h1>Actividades</h1>
      <div style={{ display: "flex", gap: 8 }}><div className="seg" role="group" aria-label="Vista"><button aria-pressed={view === "Lista"} onClick={() => setView("Lista")}>Lista</button><button aria-pressed={view === "Calendario"} onClick={() => setView("Calendario")}>Calendario</button></div>{sup && <div className="seg" role="group" aria-label="Alcance"><button aria-pressed={!all} onClick={() => setAll(false)}>Mías</button><button aria-pressed={all} onClick={() => setAll(true)}>Todas</button></div>}
        <button className="btn p" onClick={() => setOpen(!open)}><Plus size={14} /> Nueva actividad</button></div></div>
    {open && <form className="card grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }} onSubmit={(e) => void create(e)}>
      <select className="in" required aria-label="Tipo" value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })}><option value="">Tipo…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <input className="in" required placeholder="Título" aria-label="Título" value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} />
      <input className="in" type="datetime-local" aria-label="Fecha y hora" value={n.due} onChange={(e) => setN({ ...n, due: e.target.value })} />
      <select className="in" aria-label="Contacto" value={n.contact} onChange={(e) => setN({ ...n, contact: e.target.value })}><option value="">Sin contacto</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select>
      <button className="btn p">Guardar</button></form>}
    {err && <p className="err" role="alert">{err} <button className="btn" onClick={() => void load()}>Reintentar</button></p>}
    {view === "Calendario" && cal}
    {view === "Lista" && <><div className="tabs" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t} ({count(t)})</button>)}</div>
    <div className="card">{list.map((a) => <label key={a.id} style={{ display: "flex", gap: 10, minHeight: 40, alignItems: "center" }}>
      <input type="checkbox" checked={a.done} onChange={() => void toggle(a)} aria-label={`Completar ${a.title}`} />
      <span style={{ color: tab === "Vencidas" ? "var(--bad)" : "inherit" }}>{tab === "Vencidas" ? "▲ " : a.done ? "✓ " : "◔ "}<b>{a.activity_types?.name ?? "Actividad"}</b> · {a.title}{a.contacts ? ` · ${a.contacts.full_name}` : ""} <span className="note mono">{fmt(a.due_at)}</span></span></label>)}
      {!list.length && <p className="note">Nada en «{tab}». Crea una actividad con «Nueva actividad».</p>}</div></>}
  </>);
}
