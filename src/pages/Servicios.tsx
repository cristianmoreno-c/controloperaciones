import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth";

interface Order { id: string; number: string; status: "solicitada" | "programada" | "en_ejecucion" | "terminada" | "anulada"; scheduled_at: string | null; agreed_amount: number; received_amount: number; balance: number; payment_status: string; inspection_done: boolean; sampling_done: boolean; companies: { name: string } | null; plants: { name: string } | null }
interface Opt { id: string; name: string }
interface Plant extends Opt { company_id: string }
interface Tanker { id: string; plate: string; driver: string | null; product: string | null }
interface Sample { id: string; code: string | null; description: string | null }
interface Pay { id: string; amount: number; paid_at: string; reference: string | null; voided: boolean }
const NEXT = { solicitada: "programada", programada: "en_ejecucion", en_ejecucion: "terminada" } as const;
const bs = (v: number): string => "Bs " + Number(v).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lamp = (o: Order): string => {
  if (o.status === "terminada") return o.balance > 0 ? "▲ Por cobrar" : "✓ Cobrada";
  if (!o.scheduled_at) return "○ Sin fecha";
  const d = new Date(o.scheduled_at).getTime() - Date.now();
  return d < 0 ? "▲ Vencida" : d < 864e5 ? "◔ Próxima (24 h)" : "○ En plazo";
};
const col = (o: Order): string => (o.status === "terminada" ? (o.balance > 0 ? "Por cobrar" : "Terminada") : o.status === "en_ejecucion" ? "En ejecución" : "Programada");
const COLS = ["Programada", "En ejecución", "Terminada", "Por cobrar"];

export default function Servicios() {
  const { profile } = useAuth();
  const role = profile?.role ?? "vendedor";
  const [orders, setOrders] = useState<Order[]>([]);
  const [companies, setCompanies] = useState<Opt[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [methods, setMethods] = useState<Opt[]>([]);
  const [sel, setSel] = useState<Order | null>(null);
  const [tk, setTk] = useState<Tanker[]>([]);
  const [sm, setSm] = useState<Sample[]>([]);
  const [py, setPy] = useState<Pay[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [no, setNo] = useState({ company: "", plant: "", when: "", amount: "", cond: "" });
  const [nt, setNt] = useState({ plate: "", driver: "", ci: "", co: "", product: "" });
  const [ns, setNs] = useState({ code: "", desc: "" });
  const [np, setNp] = useState({ method: "", amount: "", ref: "" });
  const [voidR, setVoidR] = useState<string | null>(null);
  const canOps = ["admin", "sup_operativo"].includes(role);
  const canField = canOps || role === "inspector";
  const canPay = ["admin", "sup_comercial", "sup_operativo"].includes(role);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("service_orders").select("id,number,status,scheduled_at,agreed_amount,received_amount,balance,payment_status,inspection_done,sampling_done,companies(name),plants(name)").neq("status", "anulada").order("created_at", { ascending: false }).limit(200);
    if (error) setErr(error.message); else { const o = (data as unknown as Order[] | null) ?? []; setOrders(o); setSel((s) => (s ? o.find((x) => x.id === s.id) ?? null : s)); }
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const [t, s, p] = await Promise.all([supabase.from("service_order_tankers").select("id,plate,driver,product").eq("order_id", id), supabase.from("service_order_samples").select("id,code,description").eq("order_id", id), supabase.from("payments").select("id,amount,paid_at,reference,voided").eq("order_id", id).order("created_at")]);
    setTk((t.data as Tanker[] | null) ?? []); setSm((s.data as Sample[] | null) ?? []); setPy((p.data as Pay[] | null) ?? []);
  }, []);
  useEffect(() => {
    void load();
    supabase.from("companies").select("id,name").eq("active", true).order("name").then(({ data }) => setCompanies((data as Opt[] | null) ?? []));
    supabase.from("plants").select("id,name,company_id").eq("active", true).then(({ data }) => setPlants((data as Plant[] | null) ?? []));
    supabase.from("payment_methods").select("id,name").eq("active", true).then(({ data }) => setMethods((data as Opt[] | null) ?? []));
  }, [load]);
  useEffect(() => { setErr(""); setVoidR(null); if (sel) void loadDetail(sel.id); }, [sel?.id, loadDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (error: { message: string } | null) => { setErr(error?.message ?? ""); void load(); if (sel) void loadDetail(sel.id); };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("service_orders").insert({ company_id: no.company, plant_id: no.plant || null, scheduled_at: no.when ? new Date(no.when).toISOString() : null, status: no.when ? "programada" : "solicitada", agreed_amount: Number(no.amount || 0), payment_condition: no.cond || null });
    setNo({ company: "", plant: "", when: "", amount: "", cond: "" }); setOpen(false); done(error);
  };
  const upd = async (patch: Record<string, unknown>) => { if (sel) done((await supabase.from("service_orders").update(patch).eq("id", sel.id)).error); };
  const addTk = async (e: FormEvent) => { e.preventDefault(); if (!sel) return; done((await supabase.from("service_order_tankers").insert({ order_id: sel.id, plate: nt.plate.trim(), driver: nt.driver || null, driver_id_card: nt.ci || null, transport_company: nt.co || null, product: nt.product || null })).error); setNt({ plate: "", driver: "", ci: "", co: "", product: "" }); };
  const addSm = async (e: FormEvent) => { e.preventDefault(); if (!sel) return; done((await supabase.from("service_order_samples").insert({ order_id: sel.id, code: ns.code || null, description: ns.desc || null, taken_at: new Date().toISOString(), taken_by: profile?.id })).error); setNs({ code: "", desc: "" }); };
  const addPy = async (e: FormEvent) => { e.preventDefault(); if (!sel) return; done((await supabase.from("payments").insert({ order_id: sel.id, method_id: np.method || null, amount: Number(np.amount), reference: np.ref || null })).error); setNp({ method: "", amount: "", ref: "" }); };
  const doVoid = async () => { if (!sel || voidR === null) return; const { error } = await supabase.rpc("void_service_order", { p_id: sel.id, p_reason: voidR }); if (!error) setSel(null); done(error); };

  return (<>
    <div style={{ display: "flex", justifyContent: "space-between" }}><h1>Servicios operativos</h1>{canOps && <button className="btn p" onClick={() => setOpen(!open)}><Plus size={14} /> Nueva orden</button>}</div>
    {open && <form className="card grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }} onSubmit={(e) => void create(e)}>
      <select className="in" required aria-label="Cliente" value={no.company} onChange={(e) => setNo({ ...no, company: e.target.value, plant: "" })}><option value="">Cliente…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className="in" aria-label="Planta" value={no.plant} onChange={(e) => setNo({ ...no, plant: e.target.value })}><option value="">Sin planta</option>{plants.filter((p) => p.company_id === no.company).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <input className="in" type="datetime-local" aria-label="Programar para" value={no.when} onChange={(e) => setNo({ ...no, when: e.target.value })} />
      <input className="in" type="number" min="0" step="0.01" placeholder="Monto acordado Bs" aria-label="Monto acordado" value={no.amount} onChange={(e) => setNo({ ...no, amount: e.target.value })} />
      <input className="in" placeholder="Condición de pago" aria-label="Condición de pago" value={no.cond} onChange={(e) => setNo({ ...no, cond: e.target.value })} />
      <button className="btn p" disabled={!no.company}>Crear orden</button></form>}
    {err && <p className="err" role="alert">{err}</p>}
    <div className="cols">{COLS.map((c) => <section key={c} className="col" aria-label={c}><b>{c}</b>
      {orders.filter((o) => col(o) === c).map((o) => <button key={o.id} className="opp" style={{ width: "100%", textAlign: "left", color: "inherit", font: "inherit" }} onClick={() => setSel(o)}><b className="mono">{o.number}</b><div className="note">{o.companies?.name} {o.plants?.name ? "· " + o.plants.name : ""}</div><div style={{ color: lamp(o).startsWith("▲") ? "var(--bad)" : "inherit" }}>{lamp(o)}</div></button>)}</section>)}</div>
    {sel && <div className="card" aria-label="Detalle de la orden"><h2>{sel.number} · {sel.companies?.name}</h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <span>Estado: <b>{sel.status.replace("_", " ")}</b></span>
        {canField && sel.status !== "terminada" && <button className="btn p" onClick={() => void upd({ status: NEXT[sel.status as keyof typeof NEXT] })}>Pasar a {NEXT[sel.status as keyof typeof NEXT].replace("_", " ")}</button>}
        {canField && <label><input type="checkbox" checked={sel.inspection_done} onChange={(e) => void upd({ inspection_done: e.target.checked })} /> Inspección realizada</label>}
        {canField && <label><input type="checkbox" checked={sel.sampling_done} onChange={(e) => void upd({ sampling_done: e.target.checked })} /> Muestra tomada</label>}</div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        <div><h2>Cisternas</h2>{tk.map((t) => <div key={t.id}><span className="mono">{t.plate}</span> {t.driver} {t.product}</div>)}{!tk.length && <p className="note">Sin cisternas.</p>}
          {canField && <form onSubmit={(e) => void addTk(e)} style={{ display: "grid", gap: 6, marginTop: 6 }}><input className="in" required placeholder="Placa" aria-label="Placa" value={nt.plate} onChange={(e) => setNt({ ...nt, plate: e.target.value })} /><input className="in" placeholder="Conductor" aria-label="Conductor" value={nt.driver} onChange={(e) => setNt({ ...nt, driver: e.target.value })} /><input className="in" placeholder="Producto" aria-label="Producto" value={nt.product} onChange={(e) => setNt({ ...nt, product: e.target.value })} /><button className="btn">Agregar cisterna</button></form>}</div>
        <div><h2>Muestras</h2>{sm.map((s) => <div key={s.id}><span className="mono">{s.code}</span> {s.description}</div>)}{!sm.length && <p className="note">Sin muestras.</p>}
          {canField && <form onSubmit={(e) => void addSm(e)} style={{ display: "grid", gap: 6, marginTop: 6 }}><input className="in" placeholder="Código" aria-label="Código de muestra" value={ns.code} onChange={(e) => setNs({ ...ns, code: e.target.value })} /><input className="in" placeholder="Descripción" aria-label="Descripción" value={ns.desc} onChange={(e) => setNs({ ...ns, desc: e.target.value })} /><button className="btn">Registrar muestra</button></form>}</div>
        <div><h2>Cobro</h2><p>Acordado <b className="mono">{bs(sel.agreed_amount)}</b> · Recibido <b className="mono">{bs(sel.received_amount)}</b> · Saldo <b className="mono">{bs(sel.balance)}</b> · {sel.payment_status}</p>
          {py.map((p) => <div key={p.id} className={p.voided ? "note" : ""}>{p.paid_at} {bs(p.amount)} {p.reference} {p.voided ? "(anulado)" : ""}</div>)}
          {canPay ? <form onSubmit={(e) => void addPy(e)} style={{ display: "grid", gap: 6, marginTop: 6 }}><select className="in" aria-label="Método" value={np.method} onChange={(e) => setNp({ ...np, method: e.target.value })}><option value="">Método…</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><input className="in" type="number" min="0.01" step="0.01" required placeholder="Importe Bs" aria-label="Importe" value={np.amount} onChange={(e) => setNp({ ...np, amount: e.target.value })} /><input className="in" placeholder="Referencia" aria-label="Referencia" value={np.ref} onChange={(e) => setNp({ ...np, ref: e.target.value })} /><button className="btn p">Registrar pago</button></form> : <p className="note">Tu rol no registra pagos.</p>}</div></div>
      {canOps && <div style={{ marginTop: 14 }}>{voidR === null ? <button className="btn d" onClick={() => setVoidR("")}>Anular orden</button> : <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="in" style={{ maxWidth: 300 }} placeholder="Motivo (obligatorio)" aria-label="Motivo" value={voidR} onChange={(e) => setVoidR(e.target.value)} /><button className="btn d" disabled={!voidR.trim()} onClick={() => void doVoid()}>Confirmar anulación</button><button className="btn" onClick={() => setVoidR(null)}>Cancelar</button></div>}</div>}
    </div>}
  </>);
}
