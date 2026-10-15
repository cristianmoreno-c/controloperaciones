# CM — Control de Operaciones (avance 1)

## Qué funciona hoy
Ingreso con recuperación de contraseña, certificados de recepción/entrega (guardado con número CRE-AAAA-NNNN, PDF en hoja carta horizontal, registro con búsqueda y totales, exportar CSV, anular con motivo), contactos (búsqueda, filtros, paginación, ficha con WhatsApp/llamar/correo, paso a lead, exportar CSV), pipeline Kanban (arrastrar o selector, totales ponderados, motivo de pérdida), oportunidades (líneas de negociación con descuento, monto automático, historial, cotizaciones con versiones y PDF), configuración (empresas, plantas, orígenes, servicios con precio, motivos de pérdida), Mi día, Dashboard (filtros globales, indicadores, ventas por mes, embudo, volúmenes por día/mes/año/cliente/planta), Servicios operativos (tablero con semáforo, cisternas, muestras, pagos parciales, anular con motivo), empresas (plantas, productos que maneja y en qué planta llegan, servicios que necesita), actividades, buscador global (Ctrl K) y atajos (N, G+D, ?), reportes (conversión, ventas por vendedor y origen, pérdidas, forecast, negociación, operativos, con CSV), importación de contactos Excel/CSV con revisión de duplicados, volúmenes en vivo, configuración completa (datos de empresa, campos fiscales, metas, etapas del pipeline, plazos de automatización), barra inferior en celular, campos personalizados (contactos y oportunidades), calendario de actividades, reasignación manual de leads, usuarios (crear, cambiar rol, desactivar, restablecer contraseña), modo claro/oscuro y automatizaciones al abrir la app.
**Todavía no existe:** nada de lo pedido en tu prompt original queda sin pantalla; lo que falta es probarlo con tus datos reales.

## Pasos (sin conocimientos técnicos)
1. En supabase.com crea un proyecto.
2. Settings → API: copia **Project URL** y la clave **anon public**.
3. Authentication → Users → Add user: crea TU usuario (correo y contraseña).
4. SQL Editor → pega `supabase/01_base_de_datos.sql` completo → Run.
5. SQL Editor → pega `supabase/02_hacer_administrador.sql`, cambia SOLO tu correo → Run. Debe mostrar tu correo con rol admin.
6. Authentication → Sign In / Providers → Email: apaga **Confirm email** (una sola vez; necesario para «Crear usuario»).
7. Storage: verifica los buckets `logos` (público) y `documentos` (privado). Si faltan, créalos con esos nombres.
8. En Netlify: sube esta carpeta (o conecta el repositorio). Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Publica.
9. Entra con tu usuario y crea al resto desde Usuarios.
10. (Opcional) Ejecuta `supabase/03_pruebas.sql` en SQL Editor: verifica numeración, volumen, conversión a cliente, montos, versiones y permisos. Debe decir «✓ PRUEBAS OK».
11. En Configuración carga tus tarifas reales (Servicios) y registra tus clientes y sus plantas.

## Probar en tu computadora (opcional)
`npm install`, copia `.env.example` a `.env`, rellena las dos variables, `npm run dev`. Para publicar: `npm run build`.
