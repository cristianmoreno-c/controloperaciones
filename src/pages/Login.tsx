import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const enter = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) setMsg("No se pudo ingresar: " + error.message);
  };
  const recover = async () => {
    if (!email) { setMsg("Escribe tu correo y vuelve a pulsar «Olvidé mi contraseña»."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setMsg(error ? error.message : "Te enviamos un correo para restablecer la contraseña.");
  };
  return (
    <div className="cm" data-t="dark"><form className="login" onSubmit={(e) => void enter(e)}>
      <h1>CM — Control de Operaciones</h1>
      <label className="f">Correo<input className="in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
      <label className="f">Contraseña<input className="in" type="password" required value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" /></label>
      <button className="btn p" disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}</button>
      <button type="button" className="btn" onClick={() => void recover()}>Olvidé mi contraseña</button>
      {msg && <p className="err" role="alert">{msg}</p>}
    </form></div>
  );
}
