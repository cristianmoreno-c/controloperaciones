import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../lib/supabase";

interface K { sales_period: number; goal: number; pipeline_value: number; weighted_value: number; open_opportunities: number; contacts: number; leads: number; clients: number; pending_quotations: number; pending_payments: number; scheduled_services: number; pending_inspections: number; finished_services: number; samples: number }
interface Opt { id: string; name: string }
interface Vol { label: string; received: number; delivered: number; certificates: number }
const day = (d: Date): string => d.toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
const bs = (v: number): string => "Bs " + Math.round(v).toLocaleString("es-BO");
const lt = (v: number): string => Math.round(v).toLocaleString("es-BO") + " L";
const int = (v: number): string => Math.round(v).toString();
const GROUPS: [string, string][] = [["day", "Día"], ["month", "Mes"], ["year", "Año"], ["company", "Cliente"], ["plant", "Planta"]];

function Count({ to, fmt }: { to: number; fmt: (v: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let live = true; let s: number | null = null;
    const f = (t: number) => { if (!live) return; s = s ?? t; const p = Math.min((t - s) / 600, 1); setV(to * p); if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f); return () => { live = false; };
  }, [to]);
  return <>{fmt(v)}</>;
}

export default function Dashboard() {
  const now = new Date();
  const [from, setFrom] = useState(day(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(day(now));
  const [owner, setOwner] = useState(""); const [source, setSource] = useState(""); const [company, setCompany] = useState(""); const [plant, setPlant] = useState("");
  const [group, setGroup] = useState("month");
  const [owners, setOwners] = useState<Opt[]>([]); const [sources, setSources] = useState<Opt[]>([]); const [companies, setCompanies] = useState<Opt[]>([]); const [plants, setPlants] = useState<(Opt & { company_id: string })[]>([]);
  const [k, setK] = useState<K | null>(null); const [vol, setVol] = useState<Vol[]>([]);
  const [sales, setSales] = useState<{ m: string; v: number }[]>([]); const [funnel, setFunnel] = useState<{ stage: string; opportunities: number }[]>([]);
  const [err, setErr] = useState(""); const [tick, setTick] = useState(0);

  useEffect(() => {
    supabase.from("profiles").select("id,full_name").eq("active", true).then(({ data }) => setOwners(((data as { id: string; full_name: string }[] | null) ?? []).map((p) => ({ id: p.id, name: p.full_name }))));
    supabase.from("lead_sources").select("id,name").then(({ data }) => setSources((data as Opt[] | null) ?? []));
    supabase.from("companies").select("id,name").order("name").then(({ data }) => setCompanies((data as Opt[] | null) ?? []));
    supabase.from("plants").select("id,name,company_id").then(({ data }) => setPlants((data as (Opt & { company_id: string })[] | null) ?? []));
    supabase.from("v_sales_by_month").select("month,total").then(({ data }) => {
      const a: Record<string, number> = {}; ((data as { month: string; total: number }[] | null) ?? []).forEach((r) => { const m = r.month.slice(0, 7); a[m] = (a[m] ?? 0) + Number(r.total); });
      setSales(Object.keys(a).sort().slice(-6).map((m) => ({ m, v: a[m] })));
    });
    supabase.from("pipelines").select("id").eq("is_default", true).maybeSingle().then(({ data }) => {
      const id = (data as { id: string } | null)?.id; if (!id) return;
      supabase.from("v_pipeline_funnel").select("stage,opportunities,sort").eq("pipeline_id", id).order("sort").then(({ data: f }) => setFunnel((f as { stage: string; opportunities: number }[] | null) ?? []));
    });
  }, []);
  useEffect(() => {
    setErr("");
    supabase.rpc("dashboard_kpis", { p_from: from, p_to: to, p_owner: owner || null, p_source: source || null, p_pipeline: null, p_company: company || null, p_plant: plant || null })
      .then(({ data, error }) => { if (error) setErr(error.message); else setK(data as K); });
    supabase.rpc("volumes_summary", { p_group: group, p_from: from, p_to: to, p_company: company || null, p_plant: plant || null })
      .then(({ data, error }) => { if (error) setErr(error.message); else setVol((data as Vol[] | null) ?? []); });
  }, [from, to, owner, source, company, plant, group, tick]);

  const tot = vol.reduce((a, r) => ({ r: a.r + Number(r.received), d: a.d + Number(r.delivered) }), { r: 0, d: 0 });
  const pct = k && k.goal > 0 ? Math.min(100, Math.round((k.sales_period / k.goal) * 100)) : 0;
  const cards: [string, number, (v: number) => string][] = k ? [["Pipeline abierto", k.pipeline_value, bs], ["Valor ponderado", k.weighted_value, bs], ["Oportunidades abiertas", k.open_opportunities, int], ["Cotizaciones pendientes", k.pending_quotations, int], ["Cobros pendientes", k.pending_payments, bs], ["Contactos", k.contacts, int], ["Leads", k.leads, int], ["Clientes", k.clients, int], ["Servicios programados", k.scheduled_services, int], ["Inspecciones pendientes", k.pending_inspections, int], ["Servicios terminados", k.finished_services, int], ["Muestras", k.samples, int]] : [];

  return (<>
    <h1>Dashboard</h1>
    <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input className="in" style={{ width: 150 }} type="date" aria-label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} /><input className="in" style={{ width: 150 }} type="date" aria-label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} />
      <select className="in" style={{ width: 160 }} aria-label="Responsable" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Todos los responsables</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <select className="in" style={{ width: 160 }} aria-label="Origen" value={source} onChange={(e) => setSource(e.target.value)}><option value="">Todos los orígenes</option>{sources.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <select className="in" style={{ width: 160 }} aria-label="Cliente" value={company} onChange={(e) => { setCompany(e.target.value); setPlant(""); }}><option value="">Todos los clientes</option>{companies.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <select className="in" style={{ width: 160 }} aria-label="Planta" value={plant} onChange={(e) => setPlant(e.target.value)}><option value="">Todas las plantas</option>{plants.filter((p) => !company || p.company_id === company).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
    {err && <p className="err" role="alert">{err} <button className="btn" onClick={() => setTick(tick + 1)}>Reintentar</button></p>}
    {!k && !err && <div className="card note">Cargando indicadores…</div>}
    {k && <>
      <div className="card"><span className="note">Ventas del periodo</span><div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><b style={{ fontSize: 28 }}><Count to={k.sales_period} fmt={bs} /></b><span className="note">{k.goal > 0 ? `de ${bs(k.goal)} (meta) · ${pct} %` : "Sin meta cargada para este mes"}</span></div>
        <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance hacia la meta"><i style={{ width: pct + "%" }} /></div></div>
      <div className="grid g4">{cards.map(([l, v, f]) => <div key={l} className="card kpi"><span>{l}</span><b><Count to={v} fmt={f} /></b></div>)}</div>
      <div className="grid g2">
        <div className="card"><h2>Ventas por mes</h2>{sales.length ? <div style={{ height: 220 }}><ResponsiveContainer><BarChart data={sales}><CartesianGrid stroke="#8D959E33" vertical={false} /><XAxis dataKey="m" stroke="#8D959E" /><YAxis stroke="#8D959E" /><Tooltip formatter={(v) => bs(Number(v))} contentStyle={{ background: "#17191C", border: "1px solid #2A2E33", color: "#E6E8EA" }} /><Bar dataKey="v" fill="#4A90D9" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="note">Aún no hay ventas ganadas.</p>}</div>
        <div className="card"><h2>Embudo</h2>{funnel.map((f) => <div key={f.stage} style={{ marginBottom: 7 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span>{f.stage}</span><span className="mono">{f.opportunities}</span></div><div className="bar" style={{ marginTop: 3 }}><i style={{ width: Math.min(100, f.opportunities * 10) + "%" }} /></div></div>)}</div></div>
      <div className="card"><div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><h2>Volúmenes (certificados emitidos)</h2>
        <div className="seg" role="group" aria-label="Agrupar por">{GROUPS.map(([g, l]) => <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>{l}</button>)}</div></div>
        <p>Recibidos <b className="mono">{lt(tot.r)}</b> · Entregados <b className="mono">{lt(tot.d)}</b></p>
        <table><thead><tr><th>{GROUPS.find((g) => g[0] === group)?.[1]}</th><th className="n">Recibidos</th><th className="n">Entregados</th><th className="n">Certificados</th></tr></thead><tbody>{vol.map((r) => <tr key={r.label}><td>{r.label}</td><td className="n mono">{lt(Number(r.received))}</td><td className="n mono">{lt(Number(r.delivered))}</td><td className="n mono">{r.certificates}</td></tr>)}</tbody></table>
        {!vol.length && <p className="note">Sin certificados en este periodo.</p>}</div></>}
  </>);
}
