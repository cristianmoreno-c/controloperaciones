import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Opp { id: string; title: string; owner_id: string | null; last_activity_at: string | null; pipeline_stages: { name: string } | null }
interface Opt { id: string; name: string }
interface Log { id: string; opportunity_id: string; from_owner: string | null; to_owner: string | null; reassigned_at: string }

export default function Reasignacion() {
  const [opps, setOpps] = useState<Opp[]>([]);
  const [users, setUsers] = useState<Opt[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const name = (id: string | null): string => users.find((u) => u.id === id)?.name ?? "Sin asignar";
  const load = useCallback(async () => {
    const [o, l] = await Promise.all([
      supabase.from("opportunities").select("id,title,owner_id,last_activity_at,pipeline_stages(name)").eq("status", "open").order("last_activity_at", { ascending: true, nullsFirst: true }).limit(200),
      supabase.from("lead_reassignments").select("*").order("reassigned_at", { ascending: false }).limit(20)]);
    if (o.error) { setErr(o.error.message); return; }
    const os = (o.data as unknown as Opp[] | null) ?? []; const ls = (l.data as Log[] | null) ?? [];
    setOpps(os); setLog(ls); setErr("");
    const ids = ls.map((x) => x.opportunity_id).filter((i) => !os.some((p) => p.id === i));
    if (ids.length) { const { data } = await supabase.from("opportunities").select("id,title").in("id", ids); setTitles(Object.fromEntries(((data as { id: string; title: string }[] | null) ?? []).map((x) => [x.id, x.title]))); }
  }, []);
  useEffect(() => { void load(); supabase.from("profiles").select("id,full_name").eq("active", true).order("full_name").then(({ data }) => setUsers(((data as { id: string; full_name: string }[] | null) ?? []).map((p) => ({ id: p.id, name: p.full_name })))); }, [load]);
  const move = async (o: Opp, to: string) => {
    if (!to) return;
    const { error } = await supabase.rpc("reassign_lead", { p_opp: o.id, p_new_owner: to });
    setErr(error?.message ?? ""); setMsg(error ? "" : `✓ «${o.title}» pasó a ${name(to)}. Quedó registrado y se notificó.`); void load();
  };
  const ago = (s: string | null): string => (s ? Math.floor((Date.now() - new Date(s).getTime()) / 36e5) + " h" : "—");
  return (<>
    <h1>Reasignación de leads</h1><p className="note">Solo oportunidades abiertas. Cada cambio guarda el responsable anterior y el nuevo, y avisa al nuevo responsable.</p>
    {err && <p className="err" role="alert">{err}</p>}{msg && <p role="status">{msg}</p>}
    <div className="card"><table><thead><tr><th>Oportunidad</th><th>Etapa</th><th>Sin actividad</th><th>Responsable</th></tr></thead><tbody>
      {opps.map((o) => <tr key={o.id}><td>{o.title}</td><td>{o.pipeline_stages?.name}</td><td className="mono">{ago(o.last_activity_at)}</td>
        <td><select className="in" style={{ maxWidth: 220 }} aria-label={`Responsable de ${o.title}`} value={o.owner_id ?? ""} onChange={(e) => void move(o, e.target.value)}><option value="">Sin asignar</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td></tr>)}</tbody></table>
      {!opps.length && <p className="note">No hay oportunidades abiertas.</p>}</div>
    <div className="card"><h2>Últimas reasignaciones</h2>{log.map((l) => <div key={l.id}><span className="mono">{l.reassigned_at.slice(0, 10)}</span> {opps.find((o) => o.id === l.opportunity_id)?.title ?? titles[l.opportunity_id] ?? "Oportunidad"}: {name(l.from_owner)} → {name(l.to_owner)}</div>)}{!log.length && <p className="note">Aún no hay reasignaciones.</p>}</div>
  </>);
}
