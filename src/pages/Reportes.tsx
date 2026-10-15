import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "../lib/supabase";

interface Tbl { head: string[]; rows: (string | number)[][]; note?: string }
const TABS = ["Conversión", "Ventas", "Pérdidas", "Forecast", "Negociación", "Operativos"] as const;
type Tab = (typeof TABS)[number];
const day = (d: Date): string => d.toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
const bs = (v: number): string => "Bs " + v.toLocaleString("es-BO", { maximumFractionDigits: 2 });
const lt = (v: number): string => Math.round(v).toLocaleString("es-BO") + " L";
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

async function build(tab: Tab, from: string, to: string): Promise<Tbl> {
  const fail = (m: string): never => { throw new Error(m); };
  if (tab === "Conversión") {
    const [h, s] = await Promise.all([supabase.from("opportunity_stage_history").select("opportunity_id,to_stage_id").limit(20000), supabase.from("pipeline_stages").select("id,name,sort,pipeline_id,kind").order("sort")]);
    if (h.error || s.error) return fail((h.error ?? s.error)?.message ?? "Error");
    const reached: Record<string, Set<string>> = {};
    ((h.data as { opportunity_id: string; to_stage_id: string }[]) ?? []).forEach((r) => { (reached[r.to_stage_id] ??= new Set()).add(r.opportunity_id); });
    const st = ((s.data as { id: string; name: string; kind: string }[]) ?? []).filter((x) => x.kind !== "lost");
    return { head: ["Etapa", "Oportunidades que llegaron", "Pasan a la siguiente"], rows: st.map((x, i) => { const a = reached[x.id]?.size ?? 0; const b = st[i + 1] ? reached[st[i + 1].id]?.size ?? 0 : null; return [x.name, a, b === null ? "—" : a ? Math.round((b / a) * 100) + " %" : "—"]; }), note: "Cuenta oportunidades que pasaron alguna vez por cada etapa (historial de etapas)." };
  }
  if (tab === "Ventas") {
    const { data, error } = await supabase.from("opportunities").select("amount,created_at,closed_at,owner_id,profiles:owner_id(full_name),lead_sources(name)").eq("status", "won").gte("closed_at", from).lte("closed_at", to + "T23:59:59");
    if (error) return fail(error.message);
    const w = (data as unknown as { amount: number; created_at: string; closed_at: string; profiles: { full_name: string } | null; lead_sources: { name: string } | null }[]) ?? [];
    const tot = sum(w.map((x) => Number(x.amount)));
    const cyc = w.length ? sum(w.map((x) => (new Date(x.closed_at).getTime() - new Date(x.created_at).getTime()) / 864e5)) / w.length : 0;
    const by = (f: (x: (typeof w)[number]) => string): (string | number)[][] => { const m: Record<string, number[]> = {}; w.forEach((x) => { (m[f(x)] ??= []).push(Number(x.amount)); }); return Object.entries(m).map(([k, v]) => [k, v.length, bs(sum(v))]); };
    return { head: ["Concepto", "Ventas", "Total"], rows: [["TOTAL del periodo", w.length, bs(tot)], ["Ticket promedio", "", w.length ? bs(tot / w.length) : "—"], ["Ciclo comercial promedio", "", w.length ? cyc.toFixed(1) + " días" : "—"], ...by((x) => "Vendedor: " + (x.profiles?.full_name ?? "Sin asignar")), ...by((x) => "Origen: " + (x.lead_sources?.name ?? "—"))] };
  }
  if (tab === "Pérdidas") {
    const { data, error } = await supabase.from("v_loss_summary").select("*");
    if (error) return fail(error.message);
    return { head: ["Motivo", "Oportunidades", "Monto"], rows: ((data as { reason: string; opportunities: number; amount: number }[]) ?? []).map((r) => [r.reason, r.opportunities, bs(Number(r.amount))]) };
  }
  if (tab === "Forecast") {
    const m = to.slice(0, 7) + "-01";
    const [k, g] = await Promise.all([supabase.rpc("dashboard_kpis", { p_from: m, p_to: to, p_owner: null, p_source: null, p_pipeline: null, p_company: null, p_plant: null }), supabase.from("goals").select("target").eq("month", m).is("user_id", null).maybeSingle()]);
    if (k.error) return fail(k.error.message);
    const x = k.data as { sales_period: number; weighted_value: number };
    const goal = Number((g.data as { target: number } | null)?.target ?? 0);
    return { head: ["Concepto", "Monto"], rows: [["Comprometido (ventas ganadas del mes)", bs(x.sales_period)], ["Probable (valor ponderado de abiertas)", bs(x.weighted_value)], ["Total", bs(x.sales_period + x.weighted_value)], ["Meta del mes", goal ? bs(goal) : "Sin meta cargada"]], note: "Probable = monto × probabilidad de las oportunidades abiertas." };
  }
  if (tab === "Negociación") {
    const { data, error } = await supabase.from("negotiation_history").select("old_amount,new_amount").gte("created_at", from).lte("created_at", to + "T23:59:59");
    if (error) return fail(error.message);
    const d = ((data as { old_amount: number | null; new_amount: number | null }[]) ?? []).map((r) => Number(r.new_amount ?? 0) - Number(r.old_amount ?? 0));
    return { head: ["Efecto de la negociación", "Valor"], rows: [["Cambios de monto", d.length], ["Aumentos", d.filter((x) => x > 0).length], ["Reducciones", d.filter((x) => x < 0).length], ["Variación neta", bs(sum(d))]] };
  }
  const [o, v] = await Promise.all([supabase.from("service_orders").select("status,agreed_amount,received_amount,balance").neq("status", "anulada"), supabase.rpc("volumes_summary", { p_group: "total", p_from: from, p_to: to, p_company: null, p_plant: null })]);
  if (o.error || v.error) return fail((o.error ?? v.error)?.message ?? "Error");
  const os = (o.data as { status: string; agreed_amount: number; received_amount: number; balance: number }[]) ?? [];
  const vol = ((v.data as { received: number; delivered: number; certificates: number }[]) ?? [])[0];
  const cnt = (s: string) => os.filter((x) => x.status === s).length;
  return { head: ["Indicador", "Valor"], rows: [["Órdenes solicitadas", cnt("solicitada")], ["Órdenes programadas", cnt("programada")], ["En ejecución", cnt("en_ejecucion")], ["Terminadas", cnt("terminada")], ["Monto acordado", bs(sum(os.map((x) => Number(x.agreed_amount))))], ["Monto recibido", bs(sum(os.map((x) => Number(x.received_amount))))], ["Saldo por cobrar", bs(sum(os.map((x) => Number(x.balance))))], ["Litros recibidos (periodo)", lt(Number(vol?.received ?? 0))], ["Litros entregados (periodo)", lt(Number(vol?.delivered ?? 0))], ["Certificados (periodo)", vol?.certificates ?? 0]], note: "Control interno: no hay conexión bancaria." };
}

export default function Reportes() {
  const now = new Date();
  const [tab, setTab] = useState<Tab>("Conversión");
  const [from, setFrom] = useState(day(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(day(now));
  const [t, setT] = useState<Tbl | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { setT(null); setErr(""); build(tab, from, to).then(setT).catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error")); }, [tab, from, to, tick]);
  const csv = () => {
    if (!t) return;
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + [t.head, ...t.rows].map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `reporte-${tab.toLowerCase()}.csv`; a.click();
  };
  return (<>
    <div style={{ display: "flex", justifyContent: "space-between" }}><h1>Reportes</h1><button className="btn" onClick={csv} disabled={!t}><Download size={14} /> Exportar CSV</button></div>
    <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="in" style={{ width: 150 }} type="date" aria-label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} /><input className="in" style={{ width: 150 }} type="date" aria-label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} /></div>
    <div className="tabs" role="tablist">{TABS.map((x) => <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}>{x}</button>)}</div>
    <div className="card">{err && <p className="err" role="alert">{err} <button className="btn" onClick={() => setTick(tick + 1)}>Reintentar</button></p>}
      {!t && !err && <p className="note">Cargando…</p>}
      {t && <><table><thead><tr>{t.head.map((h, i) => <th key={h} className={i ? "n" : ""}>{h}</th>)}</tr></thead><tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "n mono" : ""}>{c}</td>)}</tr>)}</tbody></table>
        {!t.rows.length && <p className="note">Sin datos para este periodo.</p>}{t.note && <p className="note">{t.note}</p>}</>}</div>
  </>);
}
