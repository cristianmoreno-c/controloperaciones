import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

interface Def { id: string; name: string; field_type: "texto" | "numero" | "fecha" | "seleccion" | "booleano" | "texto_largo"; options: string[]; required: boolean }

export default function CustomFields({ entity, entityId }: { entity: "contact" | "opportunity"; entityId: string }) {
  const [defs, setDefs] = useState<Def[]>([]);
  const [vals, setVals] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState("");
  useEffect(() => {
    supabase.from("custom_field_definitions").select("id,name,field_type,options,required").eq("entity", entity).eq("active", true).order("sort").then(({ data }) => setDefs((data as Def[] | null) ?? []));
  }, [entity]);
  useEffect(() => {
    setVals({});
    supabase.from("custom_field_values").select("definition_id,value").eq("entity_id", entityId).then(({ data }) => {
      const o: Record<string, unknown> = {};
      ((data as { definition_id: string; value: unknown }[] | null) ?? []).forEach((r) => { o[r.definition_id] = r.value; });
      setVals(o);
    });
  }, [entityId]);
  const save = async (d: Def, v: unknown) => {
    setVals((p) => ({ ...p, [d.id]: v }));
    const { error } = await supabase.from("custom_field_values").upsert({ definition_id: d.id, entity_id: entityId, value: v }, { onConflict: "definition_id,entity_id" });
    setErr(error?.message ?? "");
  };
  if (!defs.length) return null;
  const str = (d: Def): string => (vals[d.id] === undefined || vals[d.id] === null ? "" : String(vals[d.id]));
  return (<div style={{ marginTop: 12 }}><h2>Campos adicionales</h2>
    {defs.map((d) => <label key={d.id + entityId} className="f" style={{ marginBottom: 8 }}>{d.name}{d.required ? " *" : ""}
      {d.field_type === "booleano" ? <input type="checkbox" checked={vals[d.id] === true} onChange={(e) => void save(d, e.target.checked)} />
        : d.field_type === "seleccion" ? <select className="in" value={str(d)} onChange={(e) => void save(d, e.target.value)}><option value="">—</option>{d.options.map((o) => <option key={o}>{o}</option>)}</select>
        : d.field_type === "texto_largo" ? <textarea className="in" style={{ height: 70, padding: 8 }} defaultValue={str(d)} onBlur={(e) => void save(d, e.target.value)} />
        : <input className="in" style={{ textAlign: "left" }} type={d.field_type === "numero" ? "number" : d.field_type === "fecha" ? "date" : "text"} defaultValue={str(d)}
            onBlur={(e) => { if (d.field_type === "numero") { if (e.target.value !== "") void save(d, Number(e.target.value)); } else void save(d, e.target.value); }} />}
      {d.required && str(d) === "" && vals[d.id] !== true && <span className="note">▲ Falta completar</span>}</label>)}
    {err && <p className="err" role="alert">{err}</p>}</div>);
}
