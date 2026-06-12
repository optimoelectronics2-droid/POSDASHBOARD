# Changelog

## 2026-05-20 - Dashboard ejecutivo, caja profesional y contabilidad modular

### Agregado
- Motor ejecutivo `buildExecutiveDashboardModel` para KPIs, tendencias, ventas del dia, top productos/clientes, metodos de pago, alertas y actividad reciente sin alterar los datos fuente.
- Dashboard con cards premium, graficos responsivos, tabla de ventas del dia, busqueda rapida, exportacion Excel/PDF, impresion y widgets reordenables/ocultables por usuario.
- Botones individuales en dashboard para imprimir/exportar por rango de fecha ventas, ganancias, impuestos, caja, cuentas por cobrar, clientes nuevos y stock critico.
- Motor de caja `buildCashCutReport` para corte diario separado por efectivo, tarjeta, transferencia, credito, devoluciones, descuentos, impuestos, gastos y diferencia.
- Caja y arqueo con apertura por sucursal/caja/cajero, movimientos manuales, corte profesional, impresion y PDF.
- Modulo `/contabilidad` con catalogo base, libro diario, mayor general, rango desde/hasta y asientos derivados de facturas, notas de credito, cobros, gastos y cierre de caja.
- Nota de credito reforzada con devolucion parcial/total, metodo y monto de reembolso desde el historial de facturas.

### Cambiado
- `openCashRegister(amount)` sigue siendo compatible, y ahora tambien acepta datos extendidos de sucursal, caja y cajero.
- El cierre de caja guarda `closingSummary` con el corte profesional para auditoria.
- La factura conserva logo y sello; se agrego PDF limpio para evitar URLs del navegador en la salida.

### Validado
- `npm run build`
- `npm run lint`
- Login real en `http://127.0.0.1:5173/dashboard`, render de dashboard autenticado y descarga PDF individual `ventas-detalladas`.

## 2026-05-20 - Fase 1 SaaS Flexible

### Agregado
- Base multiempresa retrocompatible con `companies`, `activeCompanyId`, membresias y workspaces aislados por empresa.
- `CompanyProvider` para exponer el contexto SaaS sin tocar Firebase Auth.
- Creacion y cambio de empresa desde Configuracion.
- Configuracion fiscal flexible por empresa:
  - factura normal sin comprobante
  - NCF opcional
  - e-CF opcional
  - DGII opcional
  - secuencia automatica opcional
- Soporte de secuencias E31, E32, E33, E34, E41 y E43 en el motor fiscal.
- Branding por empresa con logo por URL, colores, preview y terminos de factura.
- Stamping de `companyId`/`tenantId` para nuevos registros criticos.
- Helpers Firestore para colecciones tenant-scoped bajo `companies/{companyId}`.
- Reglas Firestore iniciales para empresas, miembros y subcolecciones tenant.
- Indices Firestore iniciales para consultas por `companyId`.
- Generador base de XML e-CF local en `src/lib/dgiiEcfEngine.js`.
- Documentacion tecnica de arquitectura SaaS en `docs/SAAS_ARCHITECTURE.md`.

### Cambiado
- La facturacion normal ya no obliga NCF ni obliga modo sin ITBIS.
- El formulario de factura inicia en `NO_FISCAL` cuando la empresa no habilita fiscalidad.
- El sidebar muestra logo dinamico y selector de empresa.
- La sincronizacion realtime incluye los datos SaaS y preserva el workspace activo.

### Protegido
- No se modifico el flujo de Firebase Auth: login, registro, recuperacion y sesiones siguen usando el sistema existente.
- No se eliminaron modulos actuales.
- La data legacy se migra automaticamente a la empresa principal.

### Pendiente para fases siguientes
- Firma XML real con certificado autorizado.
- Envio/consulta DGII real y monitor de trackId contra endpoint oficial.
- Roles granulares por pantalla en UI.
- Contabilidad completa y asientos automaticos.
- Dashboard drag and drop y widgets configurables.
