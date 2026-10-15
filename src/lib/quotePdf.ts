import { jsPDF } from "jspdf";
import { supabase } from "./supabase";

interface QItem { description: string; unit: string | null; quantity: number; unit_price: number; discount_pct: number; line_total: number }
interface QVer { version: number; total: number; valid_until: string | null; payment_terms: string | null; created_at: string; quotation_items: QItem[] }
interface Quote { number: string; current_version: number; fiscal: Record<string, string>; opportunities: { title: string; companies: { name: string } | null } | null; quotation_versions: QVer[] }
interface Co { name?: string; tax_id?: string; address?: string; phone?: string; email?: string }
const bs = (v: number): string => "Bs " + v.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fd = (s: string | null): string => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");

export async function downloadQuotePdf(quotationId: string): Promise<void> {
  const { data, error } = await supabase.from("quotations").select("number,current_version,fiscal,opportunities(title,companies(name)),quotation_versions(*,quotation_items(*))").eq("id", quotationId).single();
  if (error || !data) throw new Error(error?.message ?? "Cotización no encontrada");
  const q = data as unknown as Quote;
  const v = q.quotation_versions.find((x) => x.version === q.current_version);
  if (!v) throw new Error("La cotización no tiene versión");
  const { data: s } = await supabase.from("settings").select("value").eq("key", "company").maybeSingle();
  const co = ((s as { value: Co } | null)?.value) ?? {};
  const doc = new jsPDF({ unit: "in", format: "letter" });
  doc.setFillColor("#174A7E"); doc.lines([[0.18, -0.07], [0.18, 0.07], [0, 0.17], [-0.18, 0.2], [-0.18, -0.2], [0, -0.17]], 0.6, 0.6, [1, 1], "F", true);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(co.name || "CM — Control de Operaciones", 1.15, 0.8);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  [co.tax_id ? `NIT: ${co.tax_id}` : "", co.address ?? "", [co.phone, co.email].filter(Boolean).join(" · ")].filter(Boolean).forEach((l, i) => doc.text(l, 1.15, 0.98 + i * 0.15));
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("COTIZACIÓN", 7.9, 0.8, { align: "right" });
  doc.setFontSize(10); doc.text(`${q.number}  ·  v${v.version}`, 7.9, 1.0, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.text(`Cliente: ${q.opportunities?.companies?.name ?? "—"}`, 0.6, 1.6); doc.text(`Asunto: ${q.opportunities?.title ?? ""}`, 0.6, 1.78);
  doc.text(`Fecha: ${fd(v.created_at)}`, 7.9, 1.6, { align: "right" }); doc.text(`Vence: ${fd(v.valid_until)}`, 7.9, 1.78, { align: "right" });
  let y = 2.1; const X = [0.6, 3.9, 4.6, 5.5, 6.3, 7.9];
  doc.setFillColor("#BDD7EE"); doc.rect(0.6, y, 7.3, 0.28, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  ["Descripción", "Cant.", "P. unit.", "Desc.", "Total"].forEach((h, i) => doc.text(h, i === 0 ? X[0] + 0.05 : X[i + 1] - 0.05, y + 0.19, { align: i === 0 ? "left" : "right" }));
  doc.setFont("helvetica", "normal"); y += 0.28;
  v.quotation_items.forEach((it) => {
    const d = doc.splitTextToSize(it.description + (it.unit ? ` (${it.unit})` : ""), 3.2) as string[];
    doc.text(d, X[0] + 0.05, y + 0.18);
    [String(it.quantity), bs(Number(it.unit_price)), `${it.discount_pct} %`, bs(Number(it.line_total))].forEach((t, i) => doc.text(t, X[i + 2] - 0.05, y + 0.18, { align: "right" }));
    y += Math.max(0.28, d.length * 0.16 + 0.1); doc.setDrawColor("#BBBBBB"); doc.line(0.6, y, 7.9, y);
  });
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(`TOTAL: ${bs(Number(v.total))}`, 7.9, y + 0.32, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Condiciones de pago:", 0.6, y + 0.7); (doc.splitTextToSize(v.payment_terms || "A convenir.", 7.2) as string[]).forEach((l, i) => doc.text(l, 0.6, y + 0.88 + i * 0.15));
  Object.entries(q.fiscal ?? {}).forEach(([k, val], i) => doc.text(`${k}: ${val}`, 0.6, 9.9 - (Object.keys(q.fiscal).length - i) * 0.15));
  doc.save(`${q.number}-v${v.version}.pdf`);
}
