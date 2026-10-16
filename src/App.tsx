import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Building2, FileText, Gauge, ListChecks, LayoutDashboard, Sun as SunIcon, Truck, Moon, Target, Settings, Sun, Users } from "lucide-react";
import { useAuth } from "./auth";
import { configured, supabase } from "./lib/supabase";
import Login from "./pages/Login";
import Certificados from "./pages/Certificados";
import Usuarios from "./pages/Usuarios";
import Contactos from "./pages/Contactos";
import Oportunidades from "./pages/Oportunidades";
import Configuracion from "./pages/Configuracion";
import Servicios from "./pages/Servicios";
import Dashboard from "./pages/Dashboard";
import MiDia from "./pages/MiDia";
import Empresas from "./pages/Empresas";
import Actividades from "./pages/Actividades";
import SearchBox from "./SearchBox";
import Reportes from "./pages/Reportes";
import Volumenes from "./pages/Volumenes";

function Layout() {
  const { profile, signOut, setTheme } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [help, setHelp] = useState(false);
  const g = useRef(0);
  const role = profile?.role;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") setHelp((v) => !v);
      else if (e.key === "Escape") setHelp(false);
      else if (e.key.toLowerCase() === "n" && role && ["admin", "sup_operativo", "inspector"].includes(role)) nav("/certificados");
      else if (e.key.toLowerCase() === "g") g.current = Date.now();
      else if (e.key.toLowerCase() === "d" && Date.now() - g.current < 1500) { g.current = 0; nav("/dashboard"); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [nav, role]);
  useEffect(() => {
    // Automatizaciones: corren al abrir la app (no hay tareas en segundo plano)
    supabase.rpc("run_reassignment").then(() => undefined);
    supabase.rpc("run_notifications").then(() => undefined);
  }, []);
  if (!profile) return null;
  const dark = profile.theme === "dark";
  return (
    <div className="cm" data-t={profile.theme}>
      <nav className="side" aria-label="Principal">
        <b style={{ padding: "4px 8px", display: "block" }}>CM · Control de Operaciones</b>
        <div className="grp">Inicio</div>
        <NavLink to="/mi-dia" className="nav"><SunIcon size={16} />Mi día</NavLink>
        <NavLink to="/dashboard" className="nav"><LayoutDashboard size={16} />Dashboard</NavLink>
        <div className="grp">Comercial</div>
        <NavLink to="/empresas" className="nav"><Building2 size={16} />Empresas</NavLink>
        <NavLink to="/contactos" className="nav"><Users size={16} />Contactos</NavLink>
        <NavLink to="/oportunidades" className="nav"><Target size={16} />Oportunidades</NavLink>
        <div className="grp">Operaciones</div>
        <NavLink to="/servicios" className="nav"><Truck size={16} />Servicios operativos</NavLink>
        <NavLink to="/actividades" className="nav"><ListChecks size={16} />Actividades</NavLink>
        <NavLink to="/volumenes" className="nav"><Gauge size={16} />Volúmenes en vivo</NavLink>
        <NavLink to="/certificados" className="nav"><FileText size={16} />Certificados</NavLink>
        <div className="grp">Análisis</div>
        <NavLink to="/reportes" className="nav"><BarChart3 size={16} />Reportes</NavLink>
        {profile.role === "admin" && (<><div className="grp">Sistema</div><NavLink to="/configuracion" className="nav"><Settings size={16} />Configuración</NavLink><NavLink to="/usuarios" className="nav"><Users size={16} />Usuarios</NavLink></>)}
      </nav>
      <nav className="bnav" aria-label="Acceso rápido">{([["/mi-dia", "Mi día", SunIcon], ["/certificados", "Certificados", FileText], ["/servicios", "Servicios", Truck], ["/contactos", "Contactos", Users]] as const).map(([to, l, I]) => <button key={to} aria-current={loc.pathname === to ? "page" : undefined} onClick={() => nav(to)}><I size={20} />{l}</button>)}</nav>
      <div className="main">
        <header className="top">
          <SearchBox /><span style={{ flex: 1 }} /><span className="note">{profile.full_name}</span>
          <button className="ib" aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} onClick={() => void setTheme(dark ? "light" : "dark")}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="btn" onClick={() => void signOut()}>Salir</button>
        </header>
        <main className="page"><Outlet />{help && <div className="modal" role="dialog" aria-label="Atajos de teclado" onClick={() => setHelp(false)}><div className="card"><h2>Atajos de teclado</h2><p><b className="mono">Ctrl K</b> buscar · <b className="mono">N</b> nuevo certificado · <b className="mono">G</b> luego <b className="mono">D</b> dashboard · <b className="mono">?</b> esta ayuda · <b className="mono">Esc</b> cerrar</p></div></div>}</main>
      </div>
    </div>
  );
}

export default function App() {
  const { session, profile, loading } = useAuth();
  if (!configured) return <div className="cm"><div className="login"><h1>Falta la conexión</h1><p>Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver LEEME.md).</p></div></div>;
  if (loading) return <div className="cm"><div className="login">Cargando…</div></div>;
  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>;
  if (!profile || !profile.active) return <div className="cm"><div className="login"><h1>Cuenta sin acceso</h1><p>Tu usuario aún no está activo. Pide al administrador que lo active.</p><button className="btn" onClick={() => void supabase.auth.signOut()}>Salir</button></div></div>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/mi-dia" replace />} />
        <Route path="/mi-dia" element={<MiDia />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/servicios" element={<Servicios />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/actividades" element={<Actividades />} />
        <Route path="/volumenes" element={<Volumenes />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/contactos" element={<Contactos />} />
        <Route path="/oportunidades" element={<Oportunidades />} />
        <Route path="/configuracion" element={profile.role === "admin" ? <Configuracion /> : <Navigate to="/" replace />} />
        <Route path="/certificados" element={<Certificados />} />
        <Route path="/usuarios" element={profile.role === "admin" ? <Usuarios /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
