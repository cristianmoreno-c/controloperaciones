import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface V { plant: string; received_today: number; delivered_today: number; received_yesterday: number; delivered_yesterday: number }
interface C { id: string; number: string; operation: string; plate: string | null; total_volume: number | null; created_at: string }
const lt = (v: number): string => Math.round(v).toLocaleString("es-BO") + " L";
const dl = (a: number, b: number): string => (b === 0 ? (a > 0 ? "▲ nuevo vs ayer" : "○ sin cambio") : `${a >= b ? "▲" : "▼"} ${Math.abs(Math.round(((a - b) / b) * 100))} % vs ayer`);

export default function Volumenes() {
  const [v, setV] = useState<V[]>([]); const [c, setC] = useState<C[]>([]); const [err, setErr] = useState(""); const [at, setAt] = useState("");
  useEffect(() => {
    const load = () => {
      supabase.from("v_volumes_today").select("*").then(({ data, error }) => { if (error) setErr(error.message); else { setErr(""); setV((data as V[] | null) ?? []); setAt(new Date().toLocaleTimeString("es-BO", { timeZone: "America/La_Paz" })); } });
      supabase.from("certificates").select("id,number,operation,plate,total_volume,created_at").eq("status", "emitido").order("created_at", { ascending: false }).limit(6).then(({ data }) => setC((data as C[] | null) ?? []));
    };
    load(); const t = setInterval(load, 30000); return () => clearInterval(t);
  }, []);
  const s = (k: keyof V) => v.reduce((a, r) => a + Number(r[k]), 0);
  return (<>
    <h1>Volúmenes en vivo</h1><p className="note">Se actualiza cada 30 s{at ? ` · última: ${at}` : ""}. Solo certificados emitidos.</p>
    {err && <p className="err" role="alert">{err}</p>}
    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="card kpi"><span>Recibidos hoy</span><b style={{ fontSize: 40 }}>{lt(s("received_today"))}</b><span>{dl(s("received_today"), s("received_yesterday"))}</span></div>
      <div className="card kpi"><span>Entregados hoy</span><b style={{ fontSize: 40 }}>{lt(s("delivered_today"))}</b><span>{dl(s("delivered_today"), s("delivered_yesterday"))}</span></div></div>
    <div className="card"><h2>Por planta</h2><table><thead><tr><th>Planta</th><th className="n">Recibidos</th><th className="n">Entregados</th></tr></thead><tbody>{v.map((r) => <tr key={r.plant}><td>{r.plant}</td><td className="n mono">{lt(Number(r.received_today))}</td><td className="n mono">{lt(Number(r.delivered_today))}</td></tr>)}</tbody></table>{!v.length && <p className="note">Aún no hay certificados de hoy ni de ayer.</p>}</div>
    <div className="card"><h2>Últimos certificados</h2>{c.map((x) => <div key={x.id}><span className="mono">{x.number}</span> · {x.operation === "recepcion" ? "Recepción" : "Entrega"} · {x.plate} · {lt(Number(x.total_volume ?? 0))}</div>)}</div>
  </>);
}
