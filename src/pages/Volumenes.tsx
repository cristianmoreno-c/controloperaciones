import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Row { label: string; received: number; delivered: number; certificates: number }
interface C { id: string; number: string; operation: string; plate: string | null; total_volume: number | null; cert_date: string }
interface Opt { id: string; name: string }
interface Plant extends Opt { company_id: string }
const lt = (v: number): string => Math.round(v).toLocaleString("es-BO") + " L";
const today = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });

export default function Volumenes() {
  const [companies, setCompanies] = useState<Opt[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [company, setCompany] = useState("");
  const [plant, setPlant] = useState("");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);
  const [c, setC] = useState<C[]>([]);
  const [err, setErr] = useState("");
  const [at, setAt] = useState("");

  useEffect(() => {
    supabase.from("companies").select("id,name").eq("active", true).order("name").then(({ data }) => setCompanies((data as Opt[] | null) ?? []));
    supabase.from("plants").select("id,name,company_id").eq("active", true).order("name").then(({ data }) => setPlants((data as Plant[] | null) ?? []));
  }, []);

  useEffect(() => {
    const load = () => {
      const f = from || "2000-01-01"; const t = to || "2100-12-31";
      supabase.rpc("volumes_summary", { p_group: "plant", p_from: f, p_to: t, p_company: company || null, p_plant: plant || null }).then(({ data, error }) => {
        if (error) setErr(error.message); else { setErr(""); setRows((data as Row[] | null) ?? []); setAt(new Date().toLocaleTimeString("es-BO", { timeZone: "America/La_Paz" })); }
      });
      let q = supabase.from("certificates").select("id,number,operation,plate,total_volume,cert_date").eq("status", "emitido").gte("cert_date", f).lte("cert_date", t).order("created_at", { ascending: false }).limit(8);
      if (company) q = q.eq("company_id", company);
      if (plant) q = q.eq("plant_id", plant);
      q.then(({ data }) => setC((data as C[] | null) ?? []));
    };
    load(); const i = setInterval(load, 30000); return () => clearInterval(i);
  }, [company, plant, from, to]);

  const sum = (k: "received" | "delivered"): number => rows.reduce((a, r) => a + Number(r[k]), 0);
  const general = !company && !plant && !from && !to;
  return (<>
    <h1>Volúmenes en vivo</h1>
    <p className="note">Se actualiza cada 30 s{at ? ` · última: ${at}` : ""}. Solo certificados emitidos.</p>
    <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <select className="in" style={{ maxWidth: 220 }} aria-label="Empresa" value={company} onChange={(e) => { setCompany(e.target.value); setPlant(""); }}><option value="">Todas las empresas</option>{companies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select className="in" style={{ maxWidth: 220 }} aria-label="Planta" value={plant} onChange={(e) => setPlant(e.target.value)}><option value="">Todas las plantas</option>{plants.filter((p) => !company || p.company_id === company).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <input className="in" style={{ width: 150 }} type="date" aria-label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} />
      <input className="in" style={{ width: 150 }} type="date" aria-label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} />
      <button className="btn" onClick={() => { setFrom(today()); setTo(today()); setCompany(""); setPlant(""); }}>Hoy</button>
      <button className="btn" onClick={() => { setFrom(""); setTo(""); setCompany(""); setPlant(""); }}>General (todos)</button></div>
    {err && <p className="err" role="alert">{err}</p>}
    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="card kpi"><span>Recibidos</span><b style={{ fontSize: 40 }}>{lt(sum("received"))}</b><span>{general ? "Todos los registros" : `${from || "inicio"} → ${to || "hoy"}`}</span></div>
      <div className="card kpi"><span>Entregados</span><b style={{ fontSize: 40 }}>{lt(sum("delivered"))}</b><span>{general ? "Todos los registros" : `${from || "inicio"} → ${to || "hoy"}`}</span></div></div>
    <div className="card"><h2>Por planta</h2><table><thead><tr><th>Planta</th><th className="n">Certificados</th><th className="n">Recibidos</th><th className="n">Entregados</th></tr></thead><tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="n mono">{r.certificates}</td><td className="n mono">{lt(Number(r.received))}</td><td className="n mono">{lt(Number(r.delivered))}</td></tr>)}</tbody></table>{!rows.length && <p className="note">No hay certificados con este filtro.</p>}</div>
    <div className="card"><h2>Últimos certificados del filtro</h2>{c.map((x) => <div key={x.id}><span className="mono">{x.number}</span> · {x.cert_date} · {x.operation === "recepcion" ? "Recepción" : "Entrega"} · {x.plate} · {lt(Number(x.total_volume ?? 0))}</div>)}{!c.length && <p className="note">Sin certificados.</p>}</div>
  </>);
}
