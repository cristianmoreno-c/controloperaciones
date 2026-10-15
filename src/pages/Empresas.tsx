import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabase";

interface Co { id: string; name: string; tax_id: string | null; city: string | null; address: string | null }
interface Opt { id: string; name: string }
interface Plant extends Opt { company_id: string; location: string | null; active: boolean }
interface CP { id: string; plant_id: string | null; products: { name: string } | null; plants: { name: string } | null }
interface CS { id: string; notes: string | null; services_catalog: { name: string } | null; plants: { name: string } | null }

export default function Empresas() {
  const [cos, setCos] = useState<Co[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Co | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [cps, setCps] = useState<CP[]>([]);
  const [css, setCss] = useState<CS[]>([]);
  const [products, setProducts] = useState<Opt[]>([]);
  const [svcs, setSvcs] = useState<Opt[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [nc, setNc] = useState({ name: "", tax: "", city: "", address: "" });
  const [ed, setEd] = useState({ name: "", tax: "", city: "", address: "" });
  const [np, setNp] = useState({ name: "", loc: "" });
  const [pr, setPr] = useState({ product: "", other: "", plant: "" });
  const [sv, setSv] = useState({ service: "", plant: "", notes: "" });

  const loadCos = useCallback(async () => {
    const { data, error } = await supabase.from("companies").select("id,name,tax_id,city,address").order("name");
    if (error) setErr(error.message); else setCos((data as Co[] | null) ?? []);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const [p, a, b] = await Promise.all([
      supabase.from("plants").select("*").eq("company_id", id).order("name"),
      supabase.from("company_products").select("id,plant_id,products(name),plants(name)").eq("company_id", id),
      supabase.from("company_services").select("id,notes,services_catalog(name),plants(name)").eq("company_id", id)]);
    setPlants((p.data as Plant[] | null) ?? []); setCps((a.data as unknown as CP[] | null) ?? []); setCss((b.data as unknown as CS[] | null) ?? []);
  }, []);
  const loadCatalogs = useCallback(() => {
    supabase.from("products").select("id,name").eq("active", true).order("name").then(({ data }) => setProducts((data as Opt[] | null) ?? []));
    supabase.from("services_catalog").select("id,name").eq("active", true).order("name").then(({ data }) => setSvcs((data as Opt[] | null) ?? []));
  }, []);
  useEffect(() => { void loadCos(); loadCatalogs(); }, [loadCos, loadCatalogs]);
  useEffect(() => { setErr(""); if (sel) { void loadDetail(sel.id); setEd({ name: sel.name, tax: sel.tax_id ?? "", city: sel.city ?? "", address: sel.address ?? "" }); } }, [sel, loadDetail]);

  const after = (error: { message: string } | null) => { setErr(error?.message.includes("duplicate") ? "Ya está registrado." : error?.message ?? ""); if (sel) void loadDetail(sel.id); };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from("companies").insert({ name: nc.name.trim(), tax_id: nc.tax || null, city: nc.city || null, address: nc.address || null }).select("id,name,tax_id,city,address").single();
    if (error) { setErr(error.message); return; }
    setNc({ name: "", tax: "", city: "", address: "" }); setOpen(false); await loadCos(); setSel(data as Co);
  };
  const saveCo = async () => { if (!sel) return; const { error } = await supabase.from("companies").update({ name: ed.name.trim(), tax_id: ed.tax || null, city: ed.city || null, address: ed.address || null }).eq("id", sel.id); setErr(error?.message ?? ""); void loadCos(); };
  const addPlant = async (e: FormEvent) => { e.preventDefault(); if (!sel) return; const { error } = await supabase.from("plants").insert({ company_id: sel.id, name: np.name.trim(), location: np.loc || null }); setNp({ name: "", loc: "" }); after(error); };
  const togPlant = async (p: Plant) => { const { error } = await supabase.from("plants").update({ active: !p.active }).eq("id", p.id); after(error); };
  const addProduct = async (e: FormEvent) => {
    e.preventDefault(); if (!sel) return;
    let pid = pr.product;
    if (!pid && pr.other.trim()) {
      const { data, error } = await supabase.from("products").insert({ name: pr.other.trim() }).select("id").single();
      if (error) { setErr(error.message.includes("duplicate") ? "Ese producto ya existe: elígelo de la lista." : error.message); return; }
      pid = (data as { id: string }).id; loadCatalogs();
    }
    const { error } = await supabase.from("company_products").insert({ company_id: sel.id, product_id: pid, plant_id: pr.plant || null });
    setPr({ product: "", other: "", plant: "" }); after(error);
  };
  const addService = async (e: FormEvent) => { e.preventDefault(); if (!sel) return; const { error } = await supabase.from("company_services").insert({ company_id: sel.id, service_id: sv.service, plant_id: sv.plant || null, notes: sv.notes || null }); setSv({ service: "", plant: "", notes: "" }); after(error); };
  const del = async (table: "company_products" | "company_services", id: string) => { const { error } = await supabase.from(table).delete().eq("id", id); after(error); };
  const shown = cos.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const plantSel = (v: string, set: (x: string) => void, label: string, none: string) => <select className="in" style={{ maxWidth: 200 }} aria-label={label} value={v} onChange={(e) => set(e.target.value)}><option value="">{none}</option>{plants.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;

  return (<>
    <div style={{ display: "flex", justifyContent: "space-between" }}><h1>Empresas</h1><button className="btn p" onClick={() => setOpen(!open)}><Plus size={14} /> Nueva empresa</button></div>
    {open && <form className="card grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }} onSubmit={(e) => void create(e)}>
      <input className="in" required placeholder="Nombre de la empresa" aria-label="Nombre" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
      <input className="in" placeholder="NIT" aria-label="NIT" value={nc.tax} onChange={(e) => setNc({ ...nc, tax: e.target.value })} />
      <input className="in" placeholder="Ciudad" aria-label="Ciudad" value={nc.city} onChange={(e) => setNc({ ...nc, city: e.target.value })} />
      <input className="in" placeholder="Dirección" aria-label="Dirección" value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} />
      <button className="btn p">Guardar y registrar plantas, productos y servicios</button></form>}
    {err && <p className="err" role="alert">{err}</p>}
    <div className="grid g2">
      <div className="card"><input className="in" style={{ maxWidth: 260, marginBottom: 10 }} placeholder="Buscar empresa" aria-label="Buscar empresa" value={q} onChange={(e) => setQ(e.target.value)} />
        <table><thead><tr><th>Empresa</th><th>NIT</th><th>Ciudad</th></tr></thead><tbody>{shown.map((c) => <tr key={c.id} onClick={() => setSel(c)} style={{ cursor: "pointer", background: sel?.id === c.id ? "var(--bg)" : "none" }}><td>{c.name}</td><td className="mono">{c.tax_id ?? ""}</td><td>{c.city ?? ""}</td></tr>)}</tbody></table>
        {!shown.length && <p className="note">Sin empresas. Registra la primera con «Nueva empresa».</p>}</div>
      {sel && <aside className="card" aria-label="Ficha de la empresa"><h2>{sel.name}</h2>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 6 }}>
          <input className="in" aria-label="Nombre" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /><input className="in" placeholder="NIT" aria-label="NIT" value={ed.tax} onChange={(e) => setEd({ ...ed, tax: e.target.value })} />
          <input className="in" placeholder="Ciudad" aria-label="Ciudad" value={ed.city} onChange={(e) => setEd({ ...ed, city: e.target.value })} /><input className="in" placeholder="Dirección" aria-label="Dirección" value={ed.address} onChange={(e) => setEd({ ...ed, address: e.target.value })} /></div>
        <button className="btn" disabled={!ed.name.trim()} onClick={() => void saveCo()}>Guardar datos</button>

        <h2 style={{ marginTop: 14 }}>Plantas</h2>
        {plants.map((p) => <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 34 }}><span>{p.name}{p.location ? ` · ${p.location}` : ""}</span><span className="note">{p.active ? "✓ Activa" : "○ Inactiva"}</span><button className="btn" onClick={() => void togPlant(p)}>{p.active ? "Desactivar" : "Reactivar"}</button></div>)}
        {!plants.length && <p className="note">Aún sin plantas. Agrégalas para asignar productos y servicios.</p>}
        <form onSubmit={(e) => void addPlant(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}><input className="in" style={{ maxWidth: 150 }} required placeholder="Nombre de planta" aria-label="Nombre de planta" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} /><input className="in" style={{ maxWidth: 150 }} placeholder="Ubicación" aria-label="Ubicación" value={np.loc} onChange={(e) => setNp({ ...np, loc: e.target.value })} /><button className="btn">Agregar planta</button></form>

        <h2 style={{ marginTop: 14 }}>Productos que maneja</h2>
        {cps.map((r) => <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 34 }}><b>{r.products?.name}</b><span className="note">→ {r.plants?.name ?? "planta por definir"}</span><button className="btn d" aria-label="Quitar producto" onClick={() => void del("company_products", r.id)}>Quitar</button></div>)}
        {!cps.length && <p className="note">Sin productos registrados.</p>}
        <form onSubmit={(e) => void addProduct(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <select className="in" style={{ maxWidth: 160 }} aria-label="Producto" value={pr.product} onChange={(e) => setPr({ ...pr, product: e.target.value, other: "" })}><option value="">Producto…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className="in" style={{ maxWidth: 150 }} placeholder="…u otro producto" aria-label="Otro producto" disabled={Boolean(pr.product)} value={pr.other} onChange={(e) => setPr({ ...pr, other: e.target.value })} />
          {plantSel(pr.plant, (x) => setPr({ ...pr, plant: x }), "Planta de llegada", "Planta por definir")}
          <button className="btn" disabled={!pr.product && !pr.other.trim()}>Agregar producto</button></form>

        <h2 style={{ marginTop: 14 }}>Servicios que necesita</h2>
        {css.map((r) => <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 34, flexWrap: "wrap" }}><b>{r.services_catalog?.name}</b><span className="note">→ {r.plants?.name ?? "todas las plantas"}{r.notes ? ` · ${r.notes}` : ""}</span><button className="btn d" aria-label="Quitar servicio" onClick={() => void del("company_services", r.id)}>Quitar</button></div>)}
        {!css.length && <p className="note">Sin servicios registrados.</p>}
        <form onSubmit={(e) => void addService(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <select className="in" style={{ maxWidth: 220 }} required aria-label="Servicio" value={sv.service} onChange={(e) => setSv({ ...sv, service: e.target.value })}><option value="">Servicio…</option>{svcs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          {plantSel(sv.plant, (x) => setSv({ ...sv, plant: x }), "Planta del servicio", "Todas las plantas")}
          <input className="in" style={{ maxWidth: 170 }} placeholder="Nota (opcional)" aria-label="Nota" value={sv.notes} onChange={(e) => setSv({ ...sv, notes: e.target.value })} />
          <button className="btn" disabled={!sv.service}>Agregar servicio</button></form>
        {!svcs.length && <p className="note">El catálogo de servicios está vacío: el administrador lo carga en Configuración → Servicios.</p>}
      </aside>}
    </div>
  </>);
}
