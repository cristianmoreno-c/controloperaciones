import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabase";
import ImportarContactos from "./ImportarContactos";
import CustomFields from "../CustomFields";

interface Contact { id: string; full_name: string; email: string | null; phone: string | null; status: "contacto" | "lead" | "cliente"; company_id: string | null; companies: { name: string } | null }
interface Opt { id: string; name: string }
interface C360 { liters_received: number; liters_delivered: number; balance: number; active_plants: number; last_service: string | null }
const PAGE = 25;
const ST = { contacto: "○ Contacto", lead: "● Lead", cliente: "✓ Cliente" } as const;
const lt = (v: number): string => Math.round(v).toLocaleString("es-BO") + " L";
const wa = (p: string): string => { let d = p.replace(/\D/g, "").replace(/^00/, ""); if (d.length === 8) d = "591" + d; return "https://wa.me/" + d; };

export default function Contactos() {
  const [rows, setRows] = useState<Contact[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [st, setSt] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Opt[]>([]);
  const [sources, setSources] = useState<Opt[]>([]);
  const [open, setOpen] = useState(false);
  const [nc, setNc] = useState({ name: "", email: "", phone: "", company_id: "", company_new: "" });
  const [sel, setSel] = useState<Contact | null>(null);
  const [c360, setC360] = useState<C360 | null>(null);
  const [src, setSrc] = useState("");
  const [msg, setMsg] = useState("");
  const [imp, setImp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    let qb = supabase.from("contacts").select("id,full_name,email,phone,status,company_id,companies(name)", { count: "exact" }).order("full_name").range(page * PAGE, page * PAGE + PAGE - 1);
    const s = q.trim().replace(/[,()%]/g, "");
    if (s) qb = qb.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    if (st) qb = qb.eq("status", st);
    const { data, error, count: c } = await qb;
    setLoading(false);
    if (error) setErr(error.message); else { setRows((data as unknown as Contact[] | null) ?? []); setCount(c ?? 0); }
  }, [q, st, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    supabase.from("companies").select("id,name").order("name").then(({ data }) => setCompanies((data as Opt[] | null) ?? []));
    supabase.from("lead_sources").select("id,name").eq("active", true).order("sort").then(({ data }) => setSources((data as Opt[] | null) ?? []));
  }, []);
  useEffect(() => {
    setC360(null); setMsg(""); setSrc("");
    if (sel) supabase.from("v_contact_360").select("*").eq("contact_id", sel.id).maybeSingle().then(({ data }) => setC360(data as C360 | null));
  }, [sel]);

  const create = async (e: FormEvent) => {
    e.preventDefault(); setErr("");
    let cid: string | null = nc.company_id || null;
    if (!cid && nc.company_new.trim()) {
      const { data, error } = await supabase.from("companies").insert({ name: nc.company_new.trim() }).select("id").single();
      if (error) { setErr(error.message); return; }
      cid = (data as { id: string }).id;
    }
    const { error } = await supabase.from("contacts").insert({ full_name: nc.name.trim(), email: nc.email || null, phone: nc.phone || null, company_id: cid });
    if (error) { setErr(error.message); return; }
    setNc({ name: "", email: "", phone: "", company_id: "", company_new: "" }); setOpen(false); void load();
  };
  const promote = async () => {
    if (!sel) return;
    const { error } = await supabase.rpc("promote_to_lead", { p_contact: sel.id, p_source: src, p_title: "" });
    setMsg(error ? error.message : "✓ Pasó a lead con su oportunidad inicial."); void load();
  };
  const csv = () => {
    const body = rows.map((r) => [r.full_name, r.email ?? "", r.phone ?? "", r.companies?.name ?? "", r.status].map((v) => `"${v.replace(/"/g, '""')}"`).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + ["Nombre,Correo,Teléfono,Empresa,Estado", ...body].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "contactos.csv"; a.click();
  };

  return (<>
    <div style={{ display: "flex", justifyContent: "space-between" }}><h1>Contactos</h1><div style={{ display: "flex", gap: 8 }}><button className="btn" onClick={() => setImp(!imp)}>Importar Excel/CSV</button><button className="btn p" onClick={() => setOpen(!open)}><Plus size={14} /> Nuevo contacto</button></div></div>
    {imp && <ImportarContactos onDone={() => void load()} />}
    {open && <form className="card grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }} onSubmit={(e) => void create(e)}>
      <input className="in" required placeholder="Nombre" aria-label="Nombre" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
      <input className="in" type="email" placeholder="Correo" aria-label="Correo" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
      <input className="in" placeholder="Teléfono" aria-label="Teléfono" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
      <select className="in" aria-label="Empresa" value={nc.company_id} onChange={(e) => setNc({ ...nc, company_id: e.target.value })}><option value="">Sin empresa</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <input className="in" placeholder="…o empresa nueva" aria-label="Empresa nueva" disabled={Boolean(nc.company_id)} value={nc.company_new} onChange={(e) => setNc({ ...nc, company_new: e.target.value })} />
      <button className="btn p">Guardar contacto</button></form>}
    <div className="grid g2">
      <div className="card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input className="in" style={{ maxWidth: 260 }} placeholder="Buscar nombre, correo o teléfono" aria-label="Buscar" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          <select className="in" style={{ maxWidth: 150 }} aria-label="Estado" value={st} onChange={(e) => { setSt(e.target.value); setPage(0); }}><option value="">Todos</option><option value="contacto">Contacto</option><option value="lead">Lead</option><option value="cliente">Cliente</option></select>
          <button className="btn" onClick={csv} disabled={!rows.length}>Exportar CSV</button></div>
        {err && <p className="err" role="alert">{err} <button className="btn" onClick={() => void load()}>Reintentar</button></p>}
        {loading ? <p className="note">Cargando…</p> : <table><thead><tr><th>Nombre</th><th>Empresa</th><th>Estado</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id} onClick={() => setSel(r)} style={{ cursor: "pointer", background: sel?.id === r.id ? "var(--bg)" : "none" }}><td>{r.full_name}</td><td>{r.companies?.name ?? "—"}</td><td>{ST[r.status]}</td></tr>)}</tbody></table>}
        {!loading && !rows.length && !err && <p className="note">Sin contactos con este filtro. Crea el primero con «Nuevo contacto».</p>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
          <span className="note">Página {page + 1} de {Math.max(1, Math.ceil(count / PAGE))} · {count} contactos</span>
          <button className="btn" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>Siguiente</button></div>
      </div>
      {sel && <aside className="card" aria-label="Ficha del contacto"><h2>{sel.full_name}</h2><p className="note">{sel.companies?.name ?? "Sin empresa"} · {ST[sel.status]}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          {sel.phone && <a className="btn" href={wa(sel.phone)} target="_blank" rel="noreferrer">WhatsApp</a>}
          {sel.phone && <a className="btn" href={`tel:${sel.phone}`}>Llamar</a>}
          {sel.email && <a className="btn" href={`mailto:${sel.email}`}>Correo</a>}</div>
        {c360 && <table><tbody>
          <tr><td>Litros recibidos</td><td className="n mono">{lt(c360.liters_received)}</td></tr><tr><td>Litros entregados</td><td className="n mono">{lt(c360.liters_delivered)}</td></tr>
          <tr><td>Saldo</td><td className="n mono">Bs {Math.round(c360.balance).toLocaleString("es-BO")}</td></tr><tr><td>Plantas activas</td><td className="n mono">{c360.active_plants}</td></tr>
          <tr><td>Último servicio</td><td className="n">{c360.last_service ? c360.last_service.slice(0, 10) : "—"}</td></tr></tbody></table>}
        <CustomFields entity="contact" entityId={sel.id} />
        {sel.status === "contacto" && <div style={{ marginTop: 10 }}>
          <select className="in" aria-label="Origen del lead" value={src} onChange={(e) => setSrc(e.target.value)}><option value="">Elige el origen…</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <button className="btn p" style={{ marginTop: 8 }} disabled={!src} onClick={() => void promote()}>Pasar a lead</button>
          {!src && <p className="note">Elige el origen para poder pasarlo a lead.</p>}</div>}
        {msg && <p role="status" className={msg.startsWith("✓") ? "" : "err"}>{msg}</p>}</aside>}
    </div>
  </>);
}
