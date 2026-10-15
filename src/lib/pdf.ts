import { jsPDF } from "jspdf";
import { supabase } from "./supabase";

interface Meas { kind: "inicial" | "final"; measured_date: string | null; measured_time: string | null; product_level: number | null; water_level: number | null; api_gravity: number | null; temp_f: number | null; avg_temp_f: number | null; api_60f: number | null; tov: number | null; free_water: number | null; vcf: number | null; gsv: number | null }
interface Full {
  number: string; operation: "recepcion" | "entrega"; cert_date: string; measurement_type: string | null; product: string | null; tank_no: string | null; ticket_no: string | null;
  from_dispatcher: string | null; from_delivery_point: string | null; to_receiver: string | null; to_reception_point: string | null;
  total_volume: number | null; remito_volume: number | null; difference: number | null;
  driver: string | null; driver_id_card: string | null; plate: string | null; transport_company: string | null; observations: string | null;
  sig_inspector_name: string | null; sig_carrier_name: string | null; sig_storage_name: string | null; status: "emitido" | "anulado";
  certificate_measurements: Meas[]; certificate_seals: { seal_no: string; sort: number }[];
  companies: { name: string } | null; plants: { name: string } | null;
}
const n = (v: number | null | undefined, d = 2): string => (v === null || v === undefined ? "" : v.toLocaleString("es-BO", { maximumFractionDigits: d }));
const fd = (s: string | null): string => (s ? s.split("-").reverse().join("/") : "");

export async function downloadCertificatePdf(id: string): Promise<void> {
  const { data, error } = await supabase.from("certificates")
    .select("*, certificate_measurements(*), certificate_seals(*), companies(name), plants(name)").eq("id", id).single();
  if (error || !data) throw new Error(error?.message ?? "Certificado no encontrado");
  const c = data as unknown as Full;
  const doc = new jsPDF({ orientation: "landscape", unit: "in", format: "letter" });
  const thin = 0.008;
  doc.setLineWidth(0.035); doc.rect(0.3, 0.3, 10.4, 7.9); doc.setLineWidth(thin);

  if (c.status === "anulado") {
    doc.setFont("helvetica", "bold"); doc.setFontSize(90); doc.setTextColor("#EBC4C0");
    doc.text("ANULADO", 5.5, 4.6, { align: "center", angle: 25 }); doc.setTextColor("#000000");
  }
  const box = (x: number, y: number, w: number, h: number, fill?: string) => { if (fill) { doc.setFillColor(fill); doc.rect(x, y, w, h, "FD"); } else doc.rect(x, y, w, h); };
  // texto que se achica hasta caber en la casilla (nunca mueve los bloques)
  const t = (s: string, x: number, y: number, w: number, h: number, size = 8, bold = false, align: "left" | "center" = "left") => {
    let sz = size; doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(sz);
    while (sz > 4.5 && doc.getTextWidth(s) > w - 0.08) { sz -= 0.5; doc.setFontSize(sz); }
    doc.text(s, align === "center" ? x + w / 2 : x + 0.04, y + h / 2, { align, baseline: "middle" });
  };
  const lv = (label: string, value: string, x: number, y: number, w: number, h: number, lw: number) => { box(x, y, w, h); t(label, x, y, lw, h, 7.5, true); t(value, x + lw, y, w - lw, h, 9); };

  // Encabezado: logo, N° y título
  doc.setFillColor("#174A7E"); doc.lines([[0.22, -0.08], [0.22, 0.08], [0, 0.2], [-0.22, 0.24], [-0.22, -0.24], [0, -0.2]], 0.5, 0.55, [1, 1], "F", true);
  doc.setDrawColor("#FFFFFF"); doc.setLineWidth(0.03); doc.lines([[0.07, 0.07], [0.13, -0.15]], 0.6, 0.78, [1, 1], "S"); doc.setDrawColor("#000000"); doc.setLineWidth(thin);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("CM", 1.05, 0.72);
  box(9.0, 0.42, 1.5, 0.5); t("N°", 9.0, 0.42, 0.4, 0.5, 9, true); t(c.number, 9.4, 0.42, 1.1, 0.5, 10, true, "center");
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("CERTIFICADO DE RECEPCIÓN / ENTREGA DE PRODUCTO", 5.5, 0.72, { align: "center" });
  t([c.companies?.name, c.plants?.name].filter(Boolean).join(" — "), 2.5, 0.82, 6.0, 0.2, 8, false, "center");

  // Tres bloques de dos casillas
  const bw = 5.0;
  lv("FECHA", fd(c.cert_date), 0.5, 1.15, bw, 0.27, 0.9); lv("TIPO DE MEDICIÓN", c.measurement_type ?? "", 5.5, 1.15, bw, 0.27, 1.5);
  lv("PRODUCTO", c.product ?? "", 0.5, 1.42, bw, 0.27, 0.9); lv("TANQUE #", c.tank_no ?? "", 5.5, 1.42, bw, 0.27, 1.5);
  lv("RECEPCIÓN", c.operation === "recepcion" ? "X" : "", 0.5, 1.69, bw, 0.27, 1.2); lv("ENTREGA", c.operation === "entrega" ? "X" : "", 5.5, 1.69, bw, 0.27, 1.2);

  // DE: / A:
  lv("DE: Expedido", c.from_dispatcher ?? "", 0.5, 2.02, bw, 0.27, 1.2); lv("A: Receptor", c.to_receiver ?? "", 5.5, 2.02, bw, 0.27, 1.2);
  lv("Punto de entrega", c.from_delivery_point ?? "", 0.5, 2.29, bw, 0.27, 1.2); lv("Punto de Recepción", c.to_reception_point ?? "", 5.5, 2.29, bw, 0.27, 1.2);

  // Tabla de mediciones
  const cols: { w: number; t: string; g?: string }[] = [
    { w: 0.75, t: "MEDICIÓN" }, { w: 0.75, t: "FECHA" }, { w: 0.55, t: "HORA" }, { w: 0.6, t: "Producto", g: "NIVEL" }, { w: 0.6, t: "Agua", g: "NIVEL" },
    { w: 0.65, t: "Grav. API", g: "MUESTRA" }, { w: 0.65, t: "Temp. °F", g: "MUESTRA" }, { w: 0.8, t: "TEMP. PROMEDIO" },
    { w: 1.0, t: "GRAVEDAD API A 60°F (Tabla 5B)" }, { w: 0.9, t: "VOLUMEN TOTAL OBSERVADO (TOV)" }, { w: 0.8, t: "AGUA LIBRE (FW)" },
    { w: 0.8, t: "FACTOR DE CORRECCIÓN DE VOLUMEN (VCF, Tabla 6B)" }, { w: 1.15, t: "VOLUMEN BRUTO ESTÁNDAR A 60°F (GSV)" }];
  const wrap = (s: string, x: number, y: number, w: number, h: number) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.5);
    const lines = doc.splitTextToSize(s, w - 0.06) as string[];
    lines.forEach((l, i) => doc.text(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * 0.085, { align: "center", baseline: "middle" }));
  };
  const ty = 2.64; let x = 0.5;
  cols.forEach((k, i) => {
    if (k.g) {
      const first = cols[i - 1]?.g !== k.g;
      if (first) { const gw = cols.filter((z) => z.g === k.g).reduce((a, z) => a + z.w, 0); box(x, ty, gw, 0.25, "#BDD7EE"); wrap(k.g, x, ty, gw, 0.25); }
      box(x, ty + 0.25, k.w, 0.25, "#BDD7EE"); wrap(k.t, x, ty + 0.25, k.w, 0.25);
    } else { box(x, ty, k.w, 0.5, "#BDD7EE"); wrap(k.t, x, ty, k.w, 0.5); }
    x += k.w;
  });
  (["inicial", "final"] as const).forEach((kd, r) => {
    const m = c.certificate_measurements.find((z) => z.kind === kd);
    const vals = [kd.toUpperCase(), fd(m?.measured_date ?? null), (m?.measured_time ?? "").slice(0, 5), n(m?.product_level, 3), n(m?.water_level, 3), n(m?.api_gravity, 2), n(m?.temp_f, 1), n(m?.avg_temp_f, 1), n(m?.api_60f, 2), n(m?.tov), n(m?.free_water), n(m?.vcf, 6), n(m?.gsv)];
    let cx = 0.5; cols.forEach((k, i) => { box(cx, ty + 0.5 + r * 0.28, k.w, 0.28); t(vals[i], cx, ty + 0.5 + r * 0.28, k.w, 0.28, 8, i === 0, "center"); cx += k.w; });
  });

  // Ticket y volúmenes
  lv("TICKET DE MEDICIÓN N°", c.ticket_no ?? "", 0.5, 3.78, 4.2, 0.27, 1.9);
  lv("VOLUMEN TOTAL RECIBIDO/ENTREGADO (Litros)", n(c.total_volume), 5.2, 3.78, 5.3, 0.27, 3.7);
  lv("VOLUMEN REMITO (Litros)", n(c.remito_volume), 5.2, 4.05, 5.3, 0.27, 3.7);
  lv("DIFERENCIA (Litros)", n(c.difference), 5.2, 4.32, 5.3, 0.27, 3.7);

  // Cisterna y precintos
  box(0.5, 4.67, 5.0, 0.25, "#BDD7EE"); t("DATOS DE CISTERNA", 0.5, 4.67, 5.0, 0.25, 8, true, "center");
  ([["Conductor", c.driver], ["Carnet de identidad", c.driver_id_card], ["Placa", c.plate], ["Empresa de transporte", c.transport_company]] as const)
    .forEach(([l, v], i) => lv(l, v ?? "", 0.5, 4.92 + i * 0.27, 5.0, 0.27, 1.6));
  box(5.7, 4.67, 4.8, 0.25, "#BDD7EE"); t("PRECINTOS", 5.7, 4.67, 4.8, 0.25, 8, true, "center");
  const seals = [...c.certificate_seals].sort((a, b) => a.sort - b.sort).map((s) => s.seal_no);
  const ncol = Math.max(6, Math.ceil(seals.length / 4)); const cw = 4.8 / ncol;
  for (let r = 0; r < 4; r++) for (let k = 0; k < ncol; k++) { box(5.7 + k * cw, 4.92 + r * 0.27, cw, 0.27); t(seals[r * ncol + k] ?? "", 5.7 + k * cw, 4.92 + r * 0.27, cw, 0.27, 8, false, "center"); }

  // Observaciones (4 líneas)
  box(0.5, 6.08, 10.0, 0.24, "#BDD7EE"); t("OBSERVACIONES:", 0.5, 6.08, 10.0, 0.24, 8, true);
  box(0.5, 6.32, 10.0, 0.88); [1, 2, 3].forEach((i) => doc.line(0.5, 6.32 + i * 0.22, 10.5, 6.32 + i * 0.22));
  let sz = 8; let ol: string[] = []; doc.setFont("helvetica", "normal");
  for (; sz >= 5; sz -= 0.5) { doc.setFontSize(sz); ol = doc.splitTextToSize(c.observations ?? "", 9.8) as string[]; if (ol.length <= 4) break; }
  ol.slice(0, 4).forEach((l, i) => doc.text(l, 0.56, 6.32 + i * 0.22 + 0.11, { baseline: "middle" }));

  // Firmas (línea punteada, sin firma digital)
  ([["INSPECTOR", c.sig_inspector_name], ["REPRESENTANTE TRANSPORTISTA", c.sig_carrier_name], ["REPRESENTANTE ALMACENADOR", c.sig_storage_name]] as const).forEach(([role, name], i) => {
    const sx = 0.7 + i * 3.3;
    doc.setLineDashPattern([0.02, 0.04], 0); doc.line(sx, 7.5, sx + 3.0, 7.5); doc.setLineDashPattern([], 0);
    t(`Nombre: ${name ?? ""}`, sx, 7.55, 3.0, 0.2, 8); t(role, sx, 7.77, 3.0, 0.2, 8, true, "center");
  });
  doc.save(`${c.number}.pdf`);
}
