import { useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

type Row = Record<string, string>;
interface Ex { full_name: string; email: string | null; phone: string | null }
const norm = (s: string): string => s.trim().toLowerCase();
const digits = (s: string): string => s.replace(/\D/g, "");
const FIELDS: [string, string][] = [["name", "Nombre *"], ["email", "Correo"], ["phone", "Teléfono"], ["company", "Empresa"]];

export default function ImportarContactos({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [exist, setExist] = useState<Ex[]>([]);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState("");
  const [review, setReview] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const data = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
    const c = data[0] ? Object.keys(data[0]) : [];
    setRows(data); setCols(c); setReview(false); setMsg(data.length ? `${data.length} filas leídas.` : "El archivo no tiene filas.");
    const guess = (re: RegExp) => c.find((x) => re.test(norm(x))) ?? "";
    setMap({ name: guess(/nombre|name/), email: guess(/correo|mail/), phone: guess(/tel|cel|phone|whats/), company: guess(/empresa|company/) });
    const { data: ex } = await supabase.from("contacts").select("full_name,email,phone").limit(10000);
    setExist((ex as Ex[] | null) ?? []);
  };
  const get = (r: Row, k: string): string => (map[k] ? String(r[map[k]] ?? "").trim() : "");
  const dupOf = (r: Row): string | null => {
    const em = norm(get(r, "email")), ph = digits(get(r, "phone")), nm = norm(get(r, "name"));
    const d = exist.find((x) => (em && x.email && norm(x.email) === em) || (ph.length >= 7 && x.phone && digits(x.phone) === ph) || (nm && norm(x.full_name) === nm));
    return d ? d.full_name : null;
  };
  const start = () => { setPick(new Set(rows.map((r, i) => (get(r, "name") && !dupOf(r) ? i : -1)).filter((i) => i >= 0))); setReview(true); };
  const toggle = (i: number) => { const n = new Set(pick); if (n.has(i)) n.delete(i); else n.add(i); setPick(n); };
  const run = async () => {
    setMsg("Importando…");
    const { data: cs } = await supabase.from("companies").select("id,name");
    const cmap = new Map(((cs as { id: string; name: string }[] | null) ?? []).map((c) => [norm(c.name), c.id]));
    const out: { full_name: string; email: string | null; phone: string | null; company_id: string | null }[] = [];
    for (const i of pick) {
      const r = rows[i]; const cn = get(r, "company"); let cid: string | null = null;
      if (cn) { cid = cmap.get(norm(cn)) ?? null; if (!cid) { const { data, error } = await supabase.from("companies").insert({ name: cn }).select("id").single(); if (error) { setMsg(error.message); return; } cid = (data as { id: string }).id; cmap.set(norm(cn), cid); } }
      out.push({ full_name: get(r, "name"), email: get(r, "email") || null, phone: get(r, "phone") || null, company_id: cid });
    }
    for (let k = 0; k < out.length; k += 200) { const { error } = await supabase.from("contacts").insert(out.slice(k, k + 200)); if (error) { setMsg(error.message); return; } }
    setMsg(`✓ ${out.length} contactos importados. Los duplicados que no marcaste se omitieron.`); setRows([]); setReview(false); onDone();
  };

  return (<div className="card"><h2>Importar contactos (Excel o CSV)</h2>
    <input type="file" accept=".csv,.xlsx,.xls" aria-label="Archivo" onChange={(e) => void onFile(e)} />
    {rows.length > 0 && !review && <div style={{ marginTop: 10 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>{FIELDS.map(([k, l]) => <label key={k} className="f">{l}<select className="in" value={map[k] ?? ""} onChange={(e) => setMap({ ...map, [k]: e.target.value })}><option value="">— no importar —</option>{cols.map((c) => <option key={c}>{c}</option>)}</select></label>)}</div>
      <button className="btn p" style={{ marginTop: 10 }} disabled={!map.name} onClick={start}>Revisar duplicados</button>{!map.name && <span className="note"> Elige la columna del nombre.</span>}</div>}
    {review && <div style={{ marginTop: 10 }}><p className="note">Nunca se fusiona nada automáticamente. Los posibles duplicados vienen sin marcar; márcalos solo si quieres crearlos igual.</p>
      <div style={{ maxHeight: 300, overflow: "auto" }}><table><thead><tr><th /><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Aviso</th></tr></thead><tbody>{rows.map((r, i) => { const d = dupOf(r); return <tr key={i}><td><input type="checkbox" aria-label={`Importar fila ${i + 1}`} disabled={!get(r, "name")} checked={pick.has(i)} onChange={() => toggle(i)} /></td><td>{get(r, "name") || "—"}</td><td>{get(r, "email")}</td><td>{get(r, "phone")}</td><td>{!get(r, "name") ? "▲ Sin nombre" : d ? `▲ Posible duplicado de ${d}` : "✓ Nuevo"}</td></tr>; })}</tbody></table></div>
      <button className="btn p" style={{ marginTop: 10 }} disabled={!pick.size} onClick={() => void run()}>Importar {pick.size} contactos</button>{!pick.size && <span className="note"> Marca al menos una fila.</span>}</div>}
    {msg && <p role="status" className={msg.startsWith("✓") ? "" : "note"}>{msg}</p>}</div>);
}
