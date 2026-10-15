import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, Plus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { downloadQuotePdf } from "../lib/quotePdf";
import CustomFields from "../CustomFields";

interface Opp { id: string; title: string; amount: number; weighted_amount: number; status: "open" | "won" | "lost"; pipeline_stages: { name: string } | null; companies: { name: string } | null }
interface Line { id: string; description: string | null; quantity: number; list_price: number; discount_pct: number; final_price: number; line_total: number; unit_id: string | null; service_id: string | null }
interface Hist { id: string; old_amount: number | null; new_amount: number | null; comment: string | null; created_at: string }
interface Quote { id: string; number: string; current_version: number; status: string; valid_until: string | null }
interface Opt { id: string; name: string }
interface Svc extends Opt { default_price: number; unit_id: string | null }
const bs = (v: number | null): string => (v === null ? "—" : "Bs " + Number(v).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const ST = { open: "● Abierta", won: "✓ Ganada", lost: "▲ Perdida" } as const;
const QST = ["borrador", "enviada", "aceptada", "rechazada", "vencida"];

export default function Oportunidades() {
  const [rows, setRows] = useState<Opp[]>([]);
  const [sel, setSel] = useState<Opp | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [hist, setHist] = useState<Hist[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [svcs, setSvcs] = useState<Svc[]>([]);
  const [companies, setCompanies] = useState<Opt[]>([]);
  const [sources, setSources] = useState<Opt[]>([]);
  const [err, setErr] = useState("");
  const [ln, setLn] = useState({ svc: "", qty: "1", disc: "0" });
  const [man, setMan] = useState({ amount: "", comment: "" });
  const [qf, setQf] = useState({ valid: "", terms: "" });
  const [open, setOpen] = useState(false);
  const [no, setNo] = useState({ title: "", company: "", source: "" });

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("opportunities").select("id,title,amount,weighted_amount,status,pipeline_stages(name),companies(name)").order("created_at", { ascending: false }).limit(200);
    if (error) setErr(error.message); else setRows((data as unknown as Opp[] | null) ?? []);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const [l, h, q] = await Promise.all([
      supabase.from("opportunity_items").select("*").eq("opportunity_id", id).order("created_at"),
      supabase.from("negotiation_history").select("*").eq("opportunity_id", id).order("created_at", { ascending: false }),
      supabase.from("quotations").select("id,number,current_version,status,valid_until").eq("opportunity_id", id).order("created_at")]);
    setLines((l.data as Line[] | null) ?? []); setHist((h.data as Hist[] | null) ?? []); setQuotes((q.data as Quote[] | null) ?? []);
    const { data: o } = await supabase.from("opportunities").select("id,title,amount,weighted_amount,status,pipeline_stages(name),companies(name)").eq("id", id).single();
    if (o) setSel(o as unknown as Opp);
  }, []);
  useEffect(() => {
    void load();
    supabase.from("services_catalog").select("id,name,default_price,unit_id").eq("active", true).order("name").then(({ data }) => setSvcs((data as Svc[] | null) ?? []));
    supabase.from("companies").select("id,name").order("name").then(({ data }) => setCompanies((data as Opt[] | null) ?? []));
    supabase.from("lead_sources").select("id,name").eq("active", true).order("sort").then(({ data }) => setSources((data as Opt[] | null) ?? []));
  }, [load]);
  useEffect(() => { setErr(""); if (sel) void loadDetail(sel.id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sel?.id, loadDetail]);

  const refresh = () => { void load(); if (sel) void loadDetail(sel.id); };
  const addLine = async (e: FormEvent) => {
    e.preventDefault(); const s = svcs.find((x) => x.id === ln.svc); if (!sel || !s) return;
    const { error } = await supabase.from("opportunity_items").insert({ opportunity_id: sel.id, service_id: s.id, description: s.name, unit_id: s.unit_id, quantity: Number(ln.qty), list_price: Number(s.default_price), discount_pct: Number(ln.disc) });
    setErr(error?.message ?? ""); setLn({ svc: "", qty: "1", disc: "0" }); refresh();
  };
  const delLine = async (id: string) => { const { error } = await supabase.from("opportunity_items").delete().eq("id", id); setErr(error?.message ?? ""); refresh(); };
  const setAmount = async (e: FormEvent) => {
    e.preventDefault(); if (!sel) return;
    const { error } = await supabase.rpc("set_opportunity_amount", { p_id: sel.id, p_amount: Number(man.amount), p_comment: man.comment });
    setErr(error?.message ?? ""); setMan({ amount: "", comment: "" }); refresh();
  };
  const saveQuote = async () => {
    if (!sel) return;
    const { data: cs } = await supabase.from("settings").select("value").eq("key", "company").maybeSingle();
    const fiscal = (cs as { value: { fiscal?: Record<string, string> } } | null)?.value.fiscal ?? {};
    const items = lines.map((l) => ({ service_id: l.service_id, description: l.description ?? "Servicio", quantity: l.quantity, unit_price: l.list_price, discount_pct: l.discount_pct }));
    const { error } = await supabase.rpc("save_quotation", { p: { opportunity_id: sel.id, quotation_id: quotes[0]?.id ?? null, valid_until: qf.valid || null, payment_terms: qf.terms, fiscal, items } });
    setErr(error?.message ?? ""); refresh();
  };
  const qStatus = async (id: string, status: string) => { const { error } = await supabase.from("quotations").update({ status }).eq("id", id); setErr(error?.message ?? ""); refresh(); };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { data: p } = await supabase.from("pipelines").select("id").eq("is_default", true).maybeSingle();
    const pid = (p as { id: string } | null)?.id;
    const { data: st } = await supabase.from("pipeline_stages").select("id").eq("pipeline_id", pid ?? "").eq("kind", "open").order("sort").limit(1);
    const stage = (st as { id: string }[] | null)?.[0]?.id;
    if (!pid || !stage) { setErr("No hay pipeline con etapas abiertas."); return; }
    const { error } = await supabase.from("opportunities").insert({ title: no.title.trim(), company_id: no.company || null, source_id: no.source, pipeline_id: pid, stage_id: stage });
    setErr(error?.message ?? ""); setNo({ title: "", company: "", source: "" }); setOpen(false); void load();
  };

  return (<>
    <div style={{ display: "flex", justifyContent: "space-between" }}><h1>Oportunidades</h1><button className="btn p" onClick={() => setOpen(!open)}><Plus size={14} /> Nueva oportunidad</button></div>
    {open && <form className="card grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }} onSubmit={(e) => void create(e)}>
      <input className="in" required placeholder="Título" aria-label="Título" value={no.title} onChange={(e) => setNo({ ...no, title: e.target.value })} />
      <select className="in" aria-label="Empresa" value={no.company} onChange={(e) => setNo({ ...no, company: e.target.value })}><option value="">Sin empresa</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className="in" required aria-label="Origen" value={no.source} onChange={(e) => setNo({ ...no, source: e.target.value })}><option value="">Origen (obligatorio)…</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button className="btn p" disabled={!no.source}>Crear</button></form>}
    {err && <p className="err" role="alert">{err}</p>}
    <div className="card"><table><thead><tr><th>Oportunidad</th><th>Cliente</th><th>Etapa</th><th className="n">Monto</th><th className="n">Ponderado</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id} onClick={() => setSel(r)} style={{ cursor: "pointer", background: sel?.id === r.id ? "var(--bg)" : "none" }}><td>{r.title}</td><td>{r.companies?.name ?? "—"}</td><td>{ST[r.status]} · {r.pipeline_stages?.name}</td><td className="n mono">{bs(r.amount)}</td><td className="n mono">{bs(r.weighted_amount)}</td></tr>)}</tbody></table>
      {!rows.length && <p className="note">Aún no hay oportunidades. Crea una o pasa un contacto a lead.</p>}</div>
    {sel && <div className="grid g2">
      <div className="card"><h2>Negociación: {sel.title}</h2>
        <table><thead><tr><th>Servicio</th><th className="n">Cant.</th><th className="n">Lista</th><th className="n">Desc.</th><th className="n">Final</th><th className="n">Total</th><th /></tr></thead><tbody>
          {lines.map((l) => <tr key={l.id}><td>{l.description}</td><td className="n mono">{l.quantity}</td><td className="n mono">{bs(l.list_price)}</td><td className="n mono">{l.discount_pct} %</td><td className="n mono">{bs(l.final_price)}</td><td className="n mono">{bs(l.line_total)}</td><td className="n">{sel.status === "open" && <button className="btn d" aria-label="Quitar línea" onClick={() => void delLine(l.id)}>Quitar</button>}</td></tr>)}</tbody></table>
        {sel.status === "open" && <form onSubmit={(e) => void addLine(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <select className="in" style={{ maxWidth: 240 }} required aria-label="Servicio" value={ln.svc} onChange={(e) => setLn({ ...ln, svc: e.target.value })}><option value="">Servicio…</option>{svcs.map((s) => <option key={s.id} value={s.id}>{s.name} — {bs(s.default_price)}</option>)}</select>
          <input className="in" style={{ width: 80 }} type="number" min="1" step="any" aria-label="Cantidad" value={ln.qty} onChange={(e) => setLn({ ...ln, qty: e.target.value })} />
          <input className="in" style={{ width: 90 }} type="number" min="0" max="100" step="any" aria-label="Descuento %" value={ln.disc} onChange={(e) => setLn({ ...ln, disc: e.target.value })} />
          <button className="btn p" disabled={!ln.svc}>Agregar línea</button></form>}
        <p style={{ marginTop: 10 }}>Monto: <b className="mono">{bs(sel.amount)}</b> · Ponderado: <b className="mono">{bs(sel.weighted_amount)}</b></p>
        {!lines.length && sel.status === "open" && <form onSubmit={(e) => void setAmount(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="in" style={{ width: 130 }} type="number" min="0" step="0.01" required placeholder="Monto Bs" aria-label="Monto manual" value={man.amount} onChange={(e) => setMan({ ...man, amount: e.target.value })} />
          <input className="in" style={{ maxWidth: 240 }} required placeholder="Comentario (obligatorio)" aria-label="Comentario" value={man.comment} onChange={(e) => setMan({ ...man, comment: e.target.value })} />
          <button className="btn">Cambiar monto</button></form>}
        <CustomFields entity="opportunity" entityId={sel.id} />
        <h2 style={{ marginTop: 14 }}>Cotizaciones</h2>
        {quotes.map((q) => <div key={q.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}><b className="mono">{q.number} v{q.current_version}</b>
          <select className="in" style={{ width: 130 }} aria-label="Estado de cotización" value={q.status} onChange={(e) => void qStatus(q.id, e.target.value)}>{QST.map((s) => <option key={s}>{s}</option>)}</select>
          <button className="btn" onClick={() => void downloadQuotePdf(q.id).catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error de PDF"))}><Download size={14} /> PDF</button></div>)}
        {sel.status === "open" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input className="in" style={{ width: 150 }} type="date" aria-label="Vence" value={qf.valid} onChange={(e) => setQf({ ...qf, valid: e.target.value })} />
          <input className="in" style={{ maxWidth: 260 }} placeholder="Condiciones de pago" aria-label="Condiciones de pago" value={qf.terms} onChange={(e) => setQf({ ...qf, terms: e.target.value })} />
          <button className="btn p" disabled={!lines.length} onClick={() => void saveQuote()}>{quotes.length ? `Nueva versión (v${quotes[0].current_version + 1})` : "Crear cotización"}</button>
          {!lines.length && <span className="note">Agrega al menos una línea para cotizar.</span>}</div>}</div>
      <div className="card"><h2>Historial de monto</h2>{hist.map((h) => <div key={h.id} style={{ marginBottom: 6 }}><span className="mono">{h.created_at.slice(0, 10)}</span> {bs(h.old_amount)} → {bs(h.new_amount)}<div className="note">{h.comment}</div></div>)}
        {!hist.length && <p className="note">Sin cambios de monto todavía.</p>}</div></div>}
  </>);
}
