import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

interface Pipe { id: string; name: string; is_default: boolean }
interface Stage { id: string; pipeline_id: string; name: string; sort: number; probability: number; kind: "open" | "won" | "lost" }
interface Opp { id: string; title: string; amount: number; stage_id: string; companies: { name: string } | null }
interface Reason { id: string; name: string }
const bs = (v: number): string => "Bs " + Math.round(v).toLocaleString("es-BO");

export default function Pipeline() {
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [pid, setPid] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [pend, setPend] = useState<{ opp: Opp; stage: Stage } | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const drag = useRef<string | null>(null);

  useEffect(() => {
    supabase.from("pipelines").select("id,name,is_default").eq("active", true).then(({ data }) => {
      const p = (data as Pipe[] | null) ?? []; setPipes(p); setPid((p.find((x) => x.is_default) ?? p[0])?.id ?? "");
    });
    supabase.from("loss_reasons").select("id,name").eq("active", true).then(({ data }) => setReasons((data as Reason[] | null) ?? []));
  }, []);
  const load = useCallback(async () => {
    if (!pid) return;
    const [s, o] = await Promise.all([
      supabase.from("pipeline_stages").select("*").eq("pipeline_id", pid).order("sort"),
      supabase.from("opportunities").select("id,title,amount,stage_id,companies(name)").eq("pipeline_id", pid).order("created_at", { ascending: false })]);
    if (s.error || o.error) { setErr((s.error ?? o.error)?.message ?? "Error"); return; }
    setErr(""); setStages((s.data as Stage[] | null) ?? []); setOpps((o.data as unknown as Opp[] | null) ?? []);
  }, [pid]);
  useEffect(() => { void load(); }, [load]);

  const apply = async (o: Opp, stage: Stage, lossReason?: string) => {
    const { error } = await supabase.from("opportunities").update({ stage_id: stage.id, loss_reason_id: lossReason ?? null }).eq("id", o.id);
    setErr(error ? error.message : ""); void load();
  };
  const move = (o: Opp, stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || stage.id === o.stage_id) return;
    if (stage.kind === "lost") { setPend({ opp: o, stage }); setReason(""); } else void apply(o, stage);
  };

  return (<>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h1>Pipeline comercial</h1>
      {pipes.length > 1 && <select className="in" style={{ maxWidth: 220 }} aria-label="Pipeline" value={pid} onChange={(e) => setPid(e.target.value)}>{pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</div>
    <p className="note">Arrastra una tarjeta o usa el selector «Mover a». Al pasar a una etapa perdida se pide el motivo.</p>
    {err && <p className="err" role="alert">{err} <button className="btn" onClick={() => void load()}>Reintentar</button></p>}
    <div className="cols" style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)},minmax(210px,1fr))` }}>
      {stages.map((s) => { const cs = opps.filter((o) => o.stage_id === s.id); const tot = cs.reduce((a, o) => a + Number(o.amount), 0);
        return <section key={s.id} className="col" aria-label={s.name} onDragOver={(e) => e.preventDefault()} onDrop={() => { const o = opps.find((x) => x.id === drag.current); if (o) move(o, s.id); }}>
          <b>{s.name}</b><div className="note">{cs.length} · {bs(tot)} · ponderado {bs((tot * s.probability) / 100)} ({s.probability} %)</div>
          {cs.map((o) => <div key={o.id} className="opp" draggable onDragStart={() => { drag.current = o.id; }}><b>{o.title}</b><div className="note">{o.companies?.name ?? "—"}</div><div className="mono">{bs(Number(o.amount))}</div>
            <select className="in" style={{ marginTop: 6, height: 28 }} aria-label={`Mover ${o.title} a`} value={o.stage_id} onChange={(e) => move(o, e.target.value)}>{stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>)}
          {!cs.length && <p className="note">Sin oportunidades en esta etapa.</p>}</section>; })}</div>
    {pend && <div className="modal" role="dialog" aria-modal="true" aria-label="Motivo de pérdida"><div className="card" style={{ width: 340 }}>
      <h2>Motivo de pérdida</h2><select className="in" aria-label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Elige un motivo…</option>{reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <p className="note">{reason ? "Quedará registrado en el historial." : "Elige un motivo para poder confirmar."}</p>
      <div style={{ display: "flex", gap: 8 }}><button className="btn d" disabled={!reason} onClick={() => { void apply(pend.opp, pend.stage, reason); setPend(null); }}>Confirmar pérdida</button><button className="btn" onClick={() => setPend(null)}>Cancelar</button></div></div></div>}
  </>);
}
