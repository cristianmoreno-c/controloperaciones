import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth";

interface Act { id: string; title: string; due_at: string | null; done: boolean; contacts: { full_name: string; phone: string | null } | null }
interface Ord { id: string; number: string; status: string; scheduled_at: string | null; companies: { name: string } | null }
interface Note { id: string; title: string; link: string | null }
const wa = (p: string): string => { let d = p.replace(/\D/g, "").replace(/^00/, ""); if (d.length === 8) d = "591" + d; return "https://wa.me/" + d; };
const hm = (s: string | null): string => (s ? new Date(s).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }) : "—");

export default function MiDia() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [acts, setActs] = useState<Act[]>([]);
  const [ords, setOrds] = useState<Ord[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [liters, setLiters] = useState(0);
  const [err, setErr] = useState("");
  const canCert = profile !== null && ["admin", "sup_operativo", "inspector"].includes(profile.role);

  const load = useCallback(async () => {
    if (!profile) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
    const end = new Date(Date.now() + 864e5).toISOString();
    const [a, o, n, c] = await Promise.all([
      supabase.from("activities").select("id,title,due_at,done,contacts(full_name,phone)").eq("assigned_to", profile.id).eq("done", false).lt("due_at", end).order("due_at"),
      supabase.from("service_orders").select("id,number,status,scheduled_at,companies(name)").eq("assigned_to", profile.id).in("status", ["solicitada", "programada", "en_ejecucion"]).lt("scheduled_at", end).order("scheduled_at"),
      supabase.from("notifications").select("id,title,link").eq("user_id", profile.id).eq("read", false).order("created_at", { ascending: false }).limit(8),
      supabase.from("certificates").select("total_volume").eq("created_by", profile.id).eq("cert_date", today).eq("status", "emitido")]);
    const e = a.error ?? o.error ?? n.error ?? c.error;
    if (e) { setErr(e.message); return; }
    setErr(""); setActs((a.data as unknown as Act[] | null) ?? []); setOrds((o.data as unknown as Ord[] | null) ?? []); setNotes((n.data as Note[] | null) ?? []);
    setLiters(((c.data as { total_volume: number | null }[] | null) ?? []).reduce((s, r) => s + Number(r.total_volume ?? 0), 0));
  }, [profile]);
  useEffect(() => { void load(); }, [load]);

  const complete = async (id: string) => { await supabase.from("activities").update({ done: true }).eq("id", id); void load(); };
  const read = async (id: string) => { await supabase.from("notifications").update({ read: true }).eq("id", id); void load(); };
  const overdue = (s: string | null): boolean => s !== null && new Date(s).getTime() < Date.now();

  return (<>
    <h1>Hola, {profile?.full_name.split(" ")[0]}</h1>
    {err && <p className="err" role="alert">{err} <button className="btn" onClick={() => void load()}>Reintentar</button></p>}
    <div className="card"><h2>Agenda de hoy</h2>
      {ords.map((o) => <div key={o.id} style={{ minHeight: 32 }}><span className="mono">{hm(o.scheduled_at)}</span> · {o.number} · {o.companies?.name} · {overdue(o.scheduled_at) ? "▲ Vencida" : "◔ Pendiente"}</div>)}
      {acts.map((a) => <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", minHeight: 36 }}>
        <span className="mono">{hm(a.due_at)}</span><span style={{ color: overdue(a.due_at) ? "var(--bad)" : "inherit" }}>{overdue(a.due_at) ? "▲ " : "◔ "}{a.title}</span>
        {a.contacts?.phone && <><a className="btn" href={`tel:${a.contacts.phone}`}>Llamar</a><a className="btn" href={wa(a.contacts.phone)} target="_blank" rel="noreferrer">WhatsApp</a></>}
        <button className="btn" onClick={() => void complete(a.id)}>Completar</button></div>)}
      {!ords.length && !acts.length && <p className="note">Nada pendiente para hoy.</p>}
      {canCert ? <div style={{ marginTop: 10 }}><button className="btn p" onClick={() => nav("/certificados")}>Iniciar certificado</button></div> : null}</div>
    <div className="card"><h2>Alertas</h2>
      {notes.map((n) => <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 36 }}><span>▲ {n.title}</span>{n.link && <button className="btn" onClick={() => nav(n.link as string)}>Abrir</button>}<button className="btn" onClick={() => void read(n.id)}>Marcar leída</button></div>)}
      {!notes.length && <p className="note">Sin alertas nuevas.</p>}</div>
    {canCert && <div className="card kpi"><span>Tus litros hoy</span><b>{Math.round(liters).toLocaleString("es-BO")} L</b></div>}
  </>);
}
