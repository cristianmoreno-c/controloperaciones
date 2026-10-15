import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { signupClient, supabase } from "../lib/supabase";
import { ROLES, useAuth, type Profile, type Role } from "../auth";

export default function Usuarios() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [nu, setNu] = useState({ name: "", email: "", pass: "", role: "vendedor" as Role });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("full_name");
    if (error) setMsg(error.message); else setUsers((data as Profile[] | null) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setUser = async (u: Profile, role: Role, active: boolean) => {
    const { error } = await supabase.rpc("admin_set_user", { p_user: u.id, p_name: u.full_name, p_role: role, p_active: active });
    setMsg(error ? error.message : ""); void load();
  };
  const create = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    const { data, error } = await signupClient().auth.signUp({ email: nu.email, password: nu.pass, options: { data: { full_name: nu.name } } });
    if (error || !data.user) { setBusy(false); setMsg(error?.message ?? "No se pudo crear el usuario."); return; }
    const { error: e2 } = await supabase.rpc("admin_set_user", { p_user: data.user.id, p_name: nu.name, p_role: nu.role, p_active: true });
    setBusy(false);
    if (e2) { setMsg(e2.message); return; }
    setOpen(false); setNu({ name: "", email: "", pass: "", role: "vendedor" }); setMsg("✓ Usuario creado. Si no puede ingresar, apaga «Confirm email» en Supabase (ver LEEME)."); void load();
  };
  const reset = async (u: Profile) => {
    if (!u.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: window.location.origin });
    setMsg(error ? error.message : `Se envió el correo de restablecimiento a ${u.email}.`);
  };

  return (<>
    <div style={{ display: "flex", justifyContent: "space-between" }}><h1>Usuarios</h1><button className="btn p" onClick={() => setOpen(!open)}><Plus size={14} /> Crear usuario</button></div>
    {open && <form className="card grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }} onSubmit={(e) => void create(e)}>
      <input className="in" required placeholder="Nombre" aria-label="Nombre" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
      <input className="in" required type="email" placeholder="Correo" aria-label="Correo" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
      <input className="in" required minLength={8} type="password" placeholder="Contraseña temporal (mín. 8)" aria-label="Contraseña temporal" value={nu.pass} onChange={(e) => setNu({ ...nu, pass: e.target.value })} />
      <select className="in" aria-label="Rol" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}>{(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select>
      <button className="btn p" disabled={busy}>{busy ? "Creando…" : "Crear"}</button></form>}
    {msg && <p role="status" className={msg.startsWith("✓") || msg.startsWith("Se envió") ? "" : "err"}>{msg}</p>}
    <div className="card"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th /></tr></thead><tbody>
      {users.map((u) => <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td>
        <td><select className="in" aria-label={`Rol de ${u.full_name}`} value={u.role} disabled={u.id === me?.id} onChange={(e) => void setUser(u, e.target.value as Role, u.active)}>{(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select></td>
        <td>{u.active ? "✓ Activo" : "○ Desactivado"}</td>
        <td className="n"><button className="btn" onClick={() => void reset(u)}>Restablecer contraseña</button>{" "}
          {u.id !== me?.id && <button className="btn" onClick={() => void setUser(u, u.role, !u.active)}>{u.active ? "Desactivar" : "Reactivar"}</button>}</td></tr>)}</tbody></table>
      <p className="note">Los usuarios se desactivan, no se borran.</p></div>
  </>);
}
