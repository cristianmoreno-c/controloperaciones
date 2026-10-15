import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth";
import { downloadCertificatePdf } from "../lib/pdf";

type Kind = "inicial" | "final";
interface Company { id: string; name: string }
interface Plant { id: string; company_id: string; name: string }
interface Cert { id: string; number: string; cert_date: string; operation: "recepcion" | "entrega"; product: string | null; plate: string | null; driver: string | null; total_volume: number | null; status: "emitido" | "anulado" }

const MF: ReadonlyArray<readonly [string, string, string]> = [
  ["measured_date", "Fecha", "date"], ["measured_time", "Hora", "time"], ["product_level", "Nivel producto", "number"], ["water_level", "Nivel agua", "number"],
  ["api_gravity", "Grav. API", "number"], ["temp_f", "Temp. (°F)", "number"], ["avg_temp_f", "Temp. promedio (°F)", "number"], ["api_60f", "API a 60°F (Tabla 5B)", "number"],
  ["tov", "TOV (L)", "number"], ["free_water", "Agua libre FW (L)", "number"], ["vcf", "VCF (Tabla 6B)", "number"], ["gsv", "GSV (L)", "number"]];
const TXT: ReadonlyArray<readonly [string, string]> = [
  ["measurement_type", "Tipo de medición"], ["product", "Producto"], ["tank_no", "Tanque #"], ["ticket_no", "Ticket de medición N°"],
  ["from_dispatcher", "DE: Expedido"], ["from_delivery_point", "DE: Punto de entrega"], ["to_receiver", "A: Receptor"], ["to_reception_point", "A: Punto de recepción"],
  ["driver", "Conductor"], ["driver_id_card", "Carnet de identidad"], ["plate", "Placa *"], ["transport_company", "Empresa de transporte"],
  ["remito_volume", "Volumen remito (L)"], ["difference", "Diferencia (L)"],
  ["sig_inspector_name", "Inspector (nombre)"], ["sig_carrier_name", "Representante transportista (nombre)"], ["sig_storage_name", "Representante almacenador (nombre)"]];
const today = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
const blankM = (): Record<string, string> => Object.fromEntries(MF.map(([k]) => [k, ""]));
const lt = (n: number | null): string => (n === null ? "—" : n.toLocaleString("es-BO") + " L");

export default function Certificados() {
  const { profile } = useAuth();
  const canWrite = profile !== null && ["admin", "sup_operativo", "inspector"].includes(profile.role);
  const canVoid = profile !== null && ["admin", "sup_operativo"].includes(profile.role);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [f, setF] = useState<Record<string, string>>({ operation: "recepcion", cert_date: today(), company_id: "", plant_id: "", observations: "" });
  const [m, setM] = useState<Record<Kind, Record<string, string>>>({ inicial: blankM(), final: blankM() });
  const [seals, setSeals] = useState<string[]>([""]);
  const [saved, setSaved] = useState<Cert | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Cert[]>([]);
  const [q, setQ] = useState("");
  const [opF, setOpF] = useState("");
  const [year, setYear] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [voidId, setVoidId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const total = m.inicial.gsv !== "" && m.final.gsv !== "" ? Number(m.final.gsv) - Number(m.inicial.gsv) : null;
  const ok = canWrite && f.plate?.trim() && total !== null && !Number.isNaN(total) && !saved;
  const why = !canWrite ? "Tu rol no puede registrar certificados." : saved ? "Certificado guardado. Limpia el formulario para crear otro." : !f.plate?.trim() ? "Falta la placa." : total === null ? "Ingresa el GSV inicial y el final." : "";

  useEffect(() => {
    supabase.from("companies").select("id,name").eq("active", true).order("name").then(({ data }) => setCompanies((data as Company[] | null) ?? []));
    supabase.from("plants").select("id,company_id,name").eq("active", true).order("name").then(({ data }) => setPlants((data as Plant[] | null) ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoadErr("");
    let qb = supabase.from("certificates").select("id,number,cert_date,operation,product,plate,driver,total_volume,status").order("created_at", { ascending: false }).limit(200);
    const s = q.trim().replace(/[,()%]/g, "");
    if (s) qb = qb.or(`number.ilike.%${s}%,plate.ilike.%${s}%,product.ilike.%${s}%,driver.ilike.%${s}%`);
    if (opF) qb = qb.eq("operation", opF);
    if (year) qb = qb.gte("cert_date", `${year}-01-01`).lte("cert_date", `${year}-12-31`);
    const { data, error } = await qb;
    if (error) setLoadErr(error.message); else setRows((data as Cert[] | null) ?? []);
  }, [q, opF, year]);
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const ok2 = rows.filter((r) => r.status === "emitido");
    const sum = (op: string) => ok2.filter((r) => r.operation === op).reduce((a, r) => a + (r.total_volume ?? 0), 0);
    return { rec: sum("recepcion"), ent: sum("entrega") };
  }, [rows]);

  const save = async () => {
    setErr(""); setBusy(true);
    const p = { ...f, measurements: (["inicial", "final"] as Kind[]).map((k) => ({ kind: k, ...m[k] })), seals };
    const { data, error } = await supabase.rpc("save_certificate", { p });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSaved(data as Cert); void load();
  };
  const reset = () => { setF({ operation: "recepcion", cert_date: today(), company_id: "", plant_id: "", observations: "" }); setM({ inicial: blankM(), final: blankM() }); setSeals([""]); setSaved(null); setErr(""); };
  const doVoid = async () => {
    if (!voidId) return;
    const { error } = await supabase.rpc("void_certificate", { p_id: voidId, p_reason: reason });
    if (error) setLoadErr(error.message); else { setVoidId(null); setReason(""); void load(); }
  };
  const csv = () => {
    const head = "Número,Fecha,Operación,Producto,Placa,Conductor,Litros,Estado";
    const body = rows.map((r) => [r.number, r.cert_date, r.operation, r.product ?? "", r.plate ?? "", r.driver ?? "", r.total_volume ?? "", r.status].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + [head, ...body].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "certificados.csv"; a.click();
  };
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const dis = Boolean(saved) || !canWrite;
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdf = async (id: string) => { setPdfBusy(true); try { await downloadCertificatePdf(id); } catch (e) { setErr(e instanceof Error ? e.message : "No se pudo generar el PDF"); } setPdfBusy(false); };

  return (<>
    <h1>Certificados</h1>
    {canWrite && (<>
      {saved && <div className="banner" role="status">✓ Certificado guardado con el número <b className="mono">{saved.number}</b></div>}
      <div className="card grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <label className="f">Operación<select className="in" value={f.operation} onChange={set("operation")} disabled={dis}><option value="recepcion">Recepción</option><option value="entrega">Entrega</option></select></label>
        <label className="f">Fecha<input className="in" type="date" value={f.cert_date} onChange={set("cert_date")} disabled={dis} /></label>
        <label className="f">Cliente<select className="in" value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value, plant_id: "" })} disabled={dis}><option value="">Sin cliente</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="f">Planta<select className="in" value={f.plant_id} onChange={set("plant_id")} disabled={dis}><option value="">Sin planta</option>{plants.filter((p) => p.company_id === f.company_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {TXT.map(([k, l]) => <label key={k} className="f">{l}<input className="in" style={{ textAlign: "left" }} type={k === "remito_volume" || k === "difference" ? "number" : "text"} value={f[k] ?? ""} onChange={set(k)} disabled={dis} /></label>)}
      </div>
      <div className="card"><h2>Mediciones</h2>
        <table><thead><tr><th>Campo</th><th>INICIAL</th><th>FINAL</th></tr></thead><tbody>
          {MF.map(([k, l, t]) => <tr key={k}><td>{l}</td>{(["inicial", "final"] as Kind[]).map((kd) => <td key={kd}><input className="in" aria-label={`${l} ${kd}`} type={t} step="any" value={m[kd][k]} disabled={dis} onChange={(e) => setM({ ...m, [kd]: { ...m[kd], [k]: e.target.value } })} /></td>)}</tr>)}</tbody></table>
        <p style={{ marginTop: 10 }}>Volumen total {f.operation === "recepcion" ? "recibido" : "entregado"} (GSV final − inicial): <b className="mono">{total === null || Number.isNaN(total) ? "—" : lt(total)}</b></p>
      </div>
      <div className="card"><h2>Precintos</h2><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {seals.map((s, i) => <input key={i} className="in mono" style={{ width: 130, textAlign: "left" }} aria-label={`Precinto ${i + 1}`} value={s} disabled={dis} onChange={(e) => setSeals(seals.map((x, j) => (j === i ? e.target.value : x)))} />)}
        <button className="btn" disabled={dis} onClick={() => setSeals([...seals, ""])}><Plus size={14} /> Agregar precinto</button></div></div>
      <label className="f card">Observaciones<textarea className="in" style={{ height: 80, padding: 8 }} value={f.observations} onChange={set("observations")} disabled={dis} /></label>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn p" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar certificado"}</button>
        <button className="btn" disabled={!saved || pdfBusy} onClick={() => { if (saved) void pdf(saved.id); }}><Download size={14} /> {pdfBusy ? "Generando…" : "Descargar PDF"}</button>
        {!saved && <span className="note">Guarda el certificado para descargar el PDF</span>}
        {saved && <button className="btn" onClick={reset}>Nuevo certificado</button>}
        {why && <span className="note">{why}</span>}{err && <span className="err" role="alert">{err}</span>}</div>
    </>)}
    <div className="card"><h2>Registro de certificados</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input className="in" style={{ maxWidth: 280 }} placeholder="Buscar por N°, placa, producto o conductor" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="in" style={{ maxWidth: 160 }} aria-label="Operación" value={opF} onChange={(e) => setOpF(e.target.value)}><option value="">Todas</option><option value="recepcion">Recepción</option><option value="entrega">Entrega</option></select>
        <input className="in" style={{ maxWidth: 110 }} type="number" placeholder="Año" aria-label="Año" value={year} onChange={(e) => setYear(e.target.value)} />
        <button className="btn" onClick={csv} disabled={!rows.length}>Exportar CSV</button></div>
      <p className="note">Recibidos: <b className="mono">{lt(totals.rec)}</b> · Entregados: <b className="mono">{lt(totals.ent)}</b> (solo certificados emitidos del filtro)</p>
      {loadErr && <p className="err" role="alert">{loadErr} <button className="btn" onClick={() => void load()}>Reintentar</button></p>}
      <table><thead><tr><th>N°</th><th>Fecha</th><th>Operación</th><th>Producto</th><th>Placa</th><th className="n">Litros</th><th>Estado</th><th /></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td className="mono">{r.number}</td><td>{r.cert_date}</td><td>{r.operation === "recepcion" ? "Recepción" : "Entrega"}</td><td>{r.product}</td><td className="mono">{r.plate}</td><td className="n mono">{lt(r.total_volume)}</td><td>{r.status === "emitido" ? "✓ Emitido" : "▲ Anulado"}</td>
          <td className="n"><button className="btn" disabled={pdfBusy} onClick={() => void pdf(r.id)}>PDF</button>{" "}{canVoid && r.status === "emitido" && <button className="btn d" onClick={() => setVoidId(r.id)}>Anular</button>}</td></tr>)}</tbody></table>
      {!rows.length && !loadErr && <p className="note">No hay certificados con este filtro. Registra el primero arriba.</p>}
      {voidId && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><input className="in" style={{ maxWidth: 320 }} placeholder="Motivo de anulación (obligatorio)" aria-label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn d" disabled={!reason.trim()} onClick={() => void doVoid()}>Confirmar anulación</button><button className="btn" onClick={() => setVoidId(null)}>Cancelar</button></div>}
    </div>
  </>);
}
