import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { supabase } from "./lib/supabase";

interface Hit { kind: string; id: string; title: string; subtitle: string | null }
const ROUTE: Record<string, string> = { certificado: "/certificados", precinto: "/certificados", orden: "/servicios", cliente: "/empresas", contacto: "/contactos" };
const LABEL: Record<string, string> = { certificado: "Certificados", precinto: "Precintos", orden: "Órdenes", cliente: "Clientes", contacto: "Contactos" };

export default function SearchBox() {
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [i, setI] = useState(0);
  const [kind, setKind] = useState("");
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => { supabase.rpc("global_search", { q }).then(({ data }) => { setHits((data as Hit[] | null) ?? []); setI(0); }); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const shown = hits.filter((h) => !kind || h.kind === kind);
  const go = (h: Hit) => { nav(ROUTE[h.kind] ?? "/"); setQ(""); setHits([]); ref.current?.blur(); };
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(i + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && shown[i]) go(shown[i]);
    else if (e.key === "Escape") { setQ(""); setHits([]); ref.current?.blur(); }
  };
  const kinds = Array.from(new Set(hits.map((h) => h.kind)));
  return (
    <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
      <label className="search"><Search size={14} /><input ref={ref} placeholder="Buscar placa, certificado, precinto, cliente…" aria-label="Búsqueda global" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} /><span className="mono note">Ctrl K</span></label>
      {q.trim().length >= 2 && <div className="card" role="listbox" style={{ position: "absolute", top: 40, left: 0, right: 0, zIndex: 20, maxHeight: 360, overflow: "auto" }}>
        {kinds.length > 1 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}><button className="btn" aria-pressed={!kind} onClick={() => setKind("")}>Todo</button>{kinds.map((k) => <button key={k} className="btn" aria-pressed={kind === k} onClick={() => setKind(k)}>{LABEL[k] ?? k}</button>)}</div>}
        {shown.map((h, n) => <div key={h.kind + h.id + n}>{(n === 0 || shown[n - 1].kind !== h.kind) && <div className="grp" style={{ margin: "6px 0 2px" }}>{LABEL[h.kind] ?? h.kind}</div>}
          <button role="option" aria-selected={n === i} className="nav" style={{ background: n === i ? "var(--bg)" : "none" }} onMouseEnter={() => setI(n)} onClick={() => go(h)}><span className="mono">{h.title}</span><span className="note">{h.subtitle}</span></button></div>)}
        {!shown.length && <p className="note">Sin resultados para «{q}».</p>}<p className="note">↑↓ para moverte · Enter para abrir · Esc para cerrar</p></div>}
    </div>
  );
}
