import { useMemo, useState } from 'react'
import { Activity, AlertTriangle, Barcode, Boxes, CheckCircle2, Download, Eye, ImagePlus, Layers3, Loader2, PackagePlus, Pencil, Plus, Printer, RotateCcw, Search, SlidersHorizontal, TrendingUp, Trash2, Truck } from 'lucide-react'
import { Bar } from 'react-chartjs-2'
import { DataTable } from '../../components/ui/DataTable'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useConfirm } from '../../hooks/useConfirm'
import { useToast } from '../../hooks/useToast'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useERPStore } from '../../store/useERPStore'
import { downloadCsv } from '../../lib/csvExport'
import { currency, formatDate } from '../../lib/formatters'
import { buildCode128Bars } from '../../lib/barcodeEngine'

const emptyProduct = {
  name: '',
  sku: '',
  barcode: '',
  category: 'Celulares',
  brand: '',
  model: '',
  color: '',
  capacity: '',
  cost: 0,
  price: 0,
  wholesalePrice: 0,
  technicianPrice: 0,
  specialPrice: 0,
  usdPrice: 0,
  taxStatus: 'no_tax',
  unit: 'Unidad',
  stock: 0,
  initialStock: 0,
  stockMin: 1,
  stockMax: 0,
  location: '',
  supplierId: 'no-supplier',
  warrantyMonths: 0,
  requiresSerial: false,
  serialsText: '',
  description: '',
  status: 'Activo',
  image: '',
}

export function Inventory() {
  const toast = useToast()
  const { confirmState, ask, close } = useConfirm()
  const products = useERPStore((state) => state.products)
  const categories = useERPStore((state) => state.categories)
  const suppliers = useERPStore((state) => state.suppliers)
  const movements = useERPStore((state) => state.inventoryMovements)
  const upsertProduct = useERPStore((state) => state.upsertProduct)
  const deleteProduct = useERPStore((state) => state.deleteProduct)
  const restoreProduct = useERPStore((state) => state.restoreProduct)
  const adjustInventory = useERPStore((state) => state.adjustInventory)
  const updateCategories = useERPStore((state) => state.updateCategories)
  const [filters, setFilters] = useState({ query: '', category: 'all', brand: 'all', tax: 'all', status: 'active', low: false })
  const debouncedQuery = useDebouncedValue(filters.query, 220)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [adjusting, setAdjusting] = useState(null)
  const [labeling, setLabeling] = useState(null)
  const [saving, setSaving] = useState(false)
  const [adjust, setAdjust] = useState({ type: 'incremento', quantity: 1, reason: 'Conteo fisico', note: '', serialText: '' })
  const [inventorySort, setInventorySort] = useState('category')
  const brands = useMemo(() => [...new Set(products.map((item) => item.brand).filter(Boolean))], [products])
  const activeProducts = useMemo(() => products.filter((item) => !item.deletedAt && item.status !== 'Eliminado'), [products])
  const deletedProducts = useMemo(() => products.filter((item) => item.deletedAt || item.status === 'Eliminado'), [products])
  const inventoryValue = useMemo(() => activeProducts.reduce((sum, item) => sum + Number(item.cost || 0) * Number(item.stock || 0), 0), [activeProducts])
  const lowStock = useMemo(() => activeProducts.filter((item) => Number(item.stock || 0) <= Number(item.stockMin || 0)), [activeProducts])

  const filtered = useMemo(() => products.filter((item) => {
    const q = normalize(debouncedQuery)
    const isDeleted = Boolean(item.deletedAt) || item.status === 'Eliminado'
    return (!q || scoreInventoryProduct(item, q) > 0)
      && (filters.category === 'all' || item.category === filters.category)
      && (filters.brand === 'all' || item.brand === filters.brand)
      && (filters.tax === 'all' || item.taxStatus === filters.tax)
      && (filters.status === 'all' || (filters.status === 'active' ? !isDeleted : isDeleted))
      && (!filters.low || Number(item.stock || 0) <= Number(item.stockMin || 0))
  }).sort((left, right) => scoreInventoryProduct(right, normalize(debouncedQuery)) - scoreInventoryProduct(left, normalize(debouncedQuery))), [debouncedQuery, filters.brand, filters.category, filters.low, filters.status, filters.tax, products])
  const sortedInventory = useMemo(() => sortInventory(filtered, inventorySort), [filtered, inventorySort])

  async function saveProduct(product) {
    const validation = validateProduct(product)
    if (validation) {
      toast.error(validation)
      return
    }
    setSaving(true)
    try {
      if (product.category && !categories.includes(product.category)) updateCategories([...categories, product.category])
      const saved = upsertProduct(product)
      toast.success(saved.id === product.id ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.')
      setEditing(null)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeProduct(product) {
    const ok = await ask({
      title: `Eliminar producto ${product.sku || ''}`,
      description: 'El producto se ocultara del inventario activo, pero queda en auditoria para recuperar historial.',
      body: `${product.name} quedara marcado como eliminado. Las facturas y movimientos asociados no se destruyen.`,
      danger: true,
    })
    if (!ok) return
    try {
      deleteProduct(product.id, 'Soft delete desde inventario')
      toast.success('Producto eliminado del inventario activo.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function restore(product) {
    try {
      restoreProduct(product.id)
      toast.success('Producto restaurado correctamente.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function saveAdjust() {
    try {
      adjustInventory({
        productId: adjusting.id,
        ...adjust,
        serials: adjust.serialText.split(/[\n,]+/).map((serial) => serial.trim()).filter(Boolean),
        reason: `${adjust.reason}: ${adjust.note || adjust.reason}`,
      })
      toast.success('Ajuste registrado correctamente.')
      setAdjusting(null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function openAdjust(product) {
    setAdjust({ type: 'incremento', quantity: 1, reason: 'Conteo fisico', note: '', serialText: '' })
    setAdjusting(product)
  }

  function exportInventory() {
    downloadCsv('trifusion-inventario.csv', buildInventoryRows(sortedInventory))
  }

  async function exportInventoryPdf() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Inventario completo', 12, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Productos: ${sortedInventory.length} | Valor costo: ${currency.format(sortedInventory.reduce((sum, item) => sum + Number(item.cost || 0) * Number(item.stock || 0), 0))}`, 12, 21)
    autoTable(doc, {
      startY: 28,
      head: [['Categoria', 'Producto', 'SKU', 'Stock', 'Costo', 'Precio', 'Valor inventario', 'Seriales']],
      body: buildInventoryRows(sortedInventory).map((row) => [row.categoria, row.producto, row.sku, row.stock, currency.format(row.costo), currency.format(row.precio), currency.format(row.valorInventario), row.seriales]),
      styles: { fontSize: 7, cellPadding: 1.6, overflow: 'linebreak' },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      columnStyles: { 1: { cellWidth: 48 }, 8: { cellWidth: 52 } },
    })
    doc.save('inventario-completo-trifusion.pdf')
  }

  const columns = [
    { header: 'Producto', cell: ({ row }) => <ProductIdentity product={row.original} /> },
    { header: 'Categoria', accessorKey: 'category' },
    { header: 'Marca / Modelo', cell: ({ row }) => `${row.original.brand || '-'} ${row.original.model || ''}` },
    { header: 'Precio', cell: ({ row }) => currency.format(row.original.price) },
    { header: 'Stock', cell: ({ row }) => <StockIndicator product={row.original} /> },
    { header: 'ITBIS', cell: ({ row }) => row.original.taxStatus === 'taxed' ? '18%' : row.original.taxStatus },
    { header: 'Estado', cell: ({ row }) => <StatusBadge product={row.original} /> },
    { header: 'Acciones', cell: ({ row }) => <ProductActions product={row.original} onView={setViewing} onEdit={setEditing} onAdjust={openAdjust} onLabel={setLabeling} onDelete={removeProduct} onRestore={restore} /> },
  ]

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InventoryMetric title="Productos activos" value={activeProducts.length} detail={`${deletedProducts.length} eliminados recuperables`} />
        <InventoryMetric title="Valor inventario" value={currency.format(inventoryValue)} detail="Costo x stock disponible" />
        <InventoryMetric title="Stock bajo" value={lowStock.length} detail="Productos que requieren reposicion" tone="danger" />
        <InventoryMetric title="Serializados" value={activeProducts.filter((item) => item.requiresSerial).length} detail="IMEI / serial controlado" />
      </section>

      <section className="module-surface p-4 sm:p-5">
        <div className="mb-5 flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase" style={{ color: 'rgb(191,219,254)' }}><Boxes size={14} /> Inventario avanzado</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Productos, stock, seriales e IMEI</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Crear, editar, eliminar, restaurar y auditar productos sin romper ventas ni movimientos existentes.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--line)', background: 'var(--bg-input)' }}>
            <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
            <input id="inv-query" name="inv-query" value={filters.query} onChange={(e) => setFilters((s) => ({ ...s, query: e.target.value }))} placeholder="Nombre, SKU, codigo, IMEI, serial, marca" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </div>
          <select id="inv-category" name="inv-category" value={filters.category} onChange={(e) => setFilters((s) => ({ ...s, category: e.target.value }))} className="input-dark max-w-44"><option value="all">Todas las categorias</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <select id="inv-brand" name="inv-brand" value={filters.brand} onChange={(e) => setFilters((s) => ({ ...s, brand: e.target.value }))} className="input-dark max-w-40"><option value="all">Todas las marcas</option>{brands.map((b) => <option key={b}>{b}</option>)}</select>
          <select id="inv-tax" name="inv-tax" value={filters.tax} onChange={(e) => setFilters((s) => ({ ...s, tax: e.target.value }))} className="input-dark max-w-32"><option value="all">ITBIS todos</option><option value="taxed">Con ITBIS</option><option value="no_tax">Sin ITBIS</option><option value="exempt">Exento</option></select>
          <select id="inv-status" name="inv-status" value={filters.status} onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))} className="input-dark max-w-32"><option value="active">Activos</option><option value="deleted">Eliminados</option><option value="all">Todos</option></select>
          <select id="inv-sort" name="inv-sort" value={inventorySort} onChange={(e) => setInventorySort(e.target.value)} className="input-dark max-w-44"><option value="category">Orden: categoria</option><option value="stock">Stock</option><option value="quantity">Cantidad</option><option value="value">Valor inventario</option></select>
          <Button variant={filters.low ? 'danger' : 'ghost'} onClick={() => setFilters((s) => ({ ...s, low: !s.low }))}>Stock bajo</Button>
          <Button icon={Download} variant="ghost" onClick={exportInventory}>Excel</Button>
          <Button icon={Printer} variant="ghost" onClick={exportInventoryPdf}>PDF</Button>
          <Button icon={Plus} onClick={() => setEditing({ ...emptyProduct })}>Nuevo producto</Button>
        </div>
        <div className="mt-4">
          <DataTable data={sortedInventory} columns={columns} emptyText="No hay productos con esos filtros." initialPageSize={25} maxBodyHeight="70vh" />
        </div>
      </section>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Editar producto' : 'Crear producto'} description="Formulario organizado por secciones, con validacion visible y stock inicial." size="full">
        {editing ? <ProductForm product={editing} categories={categories} suppliers={suppliers} onSave={saveProduct} saving={saving} /> : null}
      </Modal>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="Detalle de producto" size="xl">
        {viewing ? <ProductDetail product={viewing} movements={movements.filter((item) => item.productId === viewing.id)} /> : null}
      </Modal>

      <Modal open={Boolean(adjusting)} onClose={() => setAdjusting(null)} title={`Ajustar stock: ${adjusting?.name || ''}`} size="md" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAdjusting(null)}>Cancelar</Button><Button variant="success" onClick={saveAdjust}>Guardar ajuste</Button></div>}>
        <div className="grid gap-3 md:grid-cols-2">
          <label><span className="label-dark">Tipo</span><select id="inv-adjust-type" name="inv-adjust-type" value={adjust.type} onChange={(e) => setAdjust((s) => ({ ...s, type: e.target.value }))} className="input-dark"><option value="incremento">Incremento</option><option value="decremento">Decremento</option></select></label>
          <label><span className="label-dark">Cantidad</span><input id="inv-adjust-quantity" name="inv-adjust-quantity" type="number" min="1" value={adjust.quantity} onChange={(e) => setAdjust((s) => ({ ...s, quantity: Number(e.target.value) }))} className="input-dark" /></label>
          <label><span className="label-dark">Motivo</span><select id="inv-adjust-reason" name="inv-adjust-reason" value={adjust.reason} onChange={(e) => setAdjust((s) => ({ ...s, reason: e.target.value }))} className="input-dark"><option>Conteo fisico</option><option>Merma</option><option>Daño</option><option>Robo</option><option>Error administrativo</option><option>Otro</option></select></label>
          <label><span className="label-dark">Nota</span><input id="inv-adjust-note" name="inv-adjust-note" value={adjust.note} onChange={(e) => setAdjust((s) => ({ ...s, note: e.target.value }))} className="input-dark" /></label>
          {adjusting?.requiresSerial ? <label className="md:col-span-2"><span className="label-dark">Seriales / IMEI del ajuste</span><textarea id="inv-adjust-serials" name="inv-adjust-serials" value={adjust.serialText} onChange={(e) => setAdjust((s) => ({ ...s, serialText: e.target.value }))} className="input-dark min-h-24" placeholder="Uno por linea o coma" /><span className="mt-1 block text-xs" style={{ color: 'rgba(255,255,255,.4)' }}>Para decrementos deben existir como disponibles; para incrementos no pueden existir en otro historial.</span></label> : null}
        </div>
      </Modal>
      <Modal open={Boolean(labeling)} onClose={() => setLabeling(null)} title="Imprimir etiquetas" size="lg">
        {labeling ? <BarcodeLabelPrinter product={labeling} /> : null}
      </Modal>
      <ConfirmDialog state={confirmState} onClose={close} />
    </div>
  )
}

export function InventoryCenter() {
  const products = useERPStore((state) => state.products)
  const movements = useERPStore((state) => state.inventoryMovements)
  const invoices = useERPStore((state) => state.invoices)
  const entries = useERPStore((state) => state.productEntries)
  const suppliers = useERPStore((state) => state.suppliers)
  const activeProducts = useMemo(() => products.filter((item) => !item.deletedAt && item.status !== 'Eliminado'), [products])
  const inventoryInsights = useMemo(() => buildInventoryInsights({ products: activeProducts, movements, invoices, entries, suppliers }), [activeProducts, entries, invoices, movements, suppliers])
  return (
    <div className="space-y-5">
      <InventoryEnterpriseCenter insights={inventoryInsights} movements={movements} entries={entries} />
    </div>
  )
}

function StockIndicator({ product }) {
  const stock = Number(product.stock || 0)
  const min = Number(product.stockMin || 0)
  const max = Math.max(Number(product.stockMax || 0), min * 3)
  const pct = Math.min((stock / max) * 100, 100)
  const empty = stock <= 0
  const low = stock > 0 && stock <= min
  const ok = stock > min
  const barColor = empty ? 'var(--color-alert)' : low ? 'var(--color-pending)' : 'var(--color-income)'
  return (
    <div className="min-w-[100px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold" style={{ color: empty ? 'var(--color-alert)' : low ? 'var(--color-pending)' : 'var(--color-income)' }}>{stock}</span>
        {empty ? <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-alert)' }}>Agotado</span> : low ? <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-pending)' }}>Minimo</span> : null}
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, empty ? 4 : 4)}%`, background: barColor }} />
      </div>
    </div>
  )
}

function ProductForm({ product, categories, suppliers, onSave, saving }) {
  const [draft, setDraft] = useState(() => ({
    ...emptyProduct,
    ...product,
    initialStock: product.id ? Number(product.stock || 0) : Number(product.initialStock || product.stock || 0),
    serialsText: product.serialsText || (product.serials || []).join('\n'),
  }))
  const [touched, setTouched] = useState(false)
  const errors = getProductErrors(draft)
  const margin = Number(draft.price) ? ((Number(draft.price) - Number(draft.cost || 0)) / Number(draft.price)) * 100 : 0
  const set = (key, value) => setDraft((state) => ({ ...state, [key]: value }))
  const submit = () => {
    setTouched(true)
    if (Object.keys(errors).length) return
    onSave({ ...draft, stock: draft.id ? draft.stock : draft.initialStock })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <FormSection title="Informacion basica" detail="Nombre, descripcion, categoria y marca del producto.">
          <Field label="Nombre *" error={touched && errors.name}><input id="inv-draft-name" name="inv-draft-name" value={draft.name} onChange={(e) => set('name', e.target.value)} className="input-dark" placeholder="Ej. iPhone 15 Pro 256GB" /></Field>
          <Field label="Categoria *" error={touched && errors.category}>
            <input id="inv-draft-category" name="inv-draft-category" list="category-options" value={draft.category} onChange={(e) => set('category', e.target.value)} className="input-dark" placeholder="Categoria" />
            <datalist id="category-options">{categories.map((item) => <option key={item} value={item} />)}</datalist>
          </Field>
          <Field label="Marca"><input id="inv-draft-brand" name="inv-draft-brand" value={draft.brand} onChange={(e) => set('brand', e.target.value)} className="input-dark" placeholder="Apple, Samsung, Lenovo..." /></Field>
          <Field label="Modelo"><input id="inv-draft-model" name="inv-draft-model" value={draft.model} onChange={(e) => set('model', e.target.value)} className="input-dark" /></Field>
          <Field label="Descripcion" wide><textarea id="inv-draft-description" name="inv-draft-description" value={draft.description} onChange={(e) => set('description', e.target.value)} className="input-dark min-h-24" /></Field>
        </FormSection>

        <FormSection title="Codigos e identificacion" detail="SKU, codigo de barra, variantes y ubicacion fisica.">
          <Field label="SKU / Codigo interno"><input id="inv-draft-sku" name="inv-draft-sku" value={draft.sku} onChange={(e) => set('sku', e.target.value)} className="input-dark" placeholder="Autogenerado si lo dejas vacio" /></Field>
          <Field label="Codigo de barras"><input id="inv-draft-barcode" name="inv-draft-barcode" value={draft.barcode} onChange={(e) => set('barcode', e.target.value)} className="input-dark" /></Field>
          <Field label="Color"><input id="inv-draft-color" name="inv-draft-color" value={draft.color} onChange={(e) => set('color', e.target.value)} className="input-dark" /></Field>
          <Field label="Capacidad / talla"><input id="inv-draft-capacity" name="inv-draft-capacity" value={draft.capacity} onChange={(e) => set('capacity', e.target.value)} className="input-dark" /></Field>
          <Field label="Ubicacion"><input id="inv-draft-location" name="inv-draft-location" value={draft.location} onChange={(e) => set('location', e.target.value)} className="input-dark" placeholder="A1, vitrina, almacen..." /></Field>
          <div className="rounded-lg p-3" style={{ border: '1px solid var(--line)', background: 'rgba(0,0,0,.2)' }}>
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase" style={{ color: 'rgba(255,255,255,.45)' }}><Barcode size={14} /> Vista codigo</p>
            <p className="mt-2 rounded bg-white px-3 py-2 font-mono text-sm font-bold tracking-wide text-black">{draft.barcode || draft.sku || 'SIN-CODIGO'}</p>
          </div>
        </FormSection>

        <FormSection title={`Precios y margen ${Number.isFinite(margin) ? margin.toFixed(1) : '0.0'}%`} detail="Costo, precio de venta y listas comerciales.">
          <Field label="Costo compra *" error={touched && errors.cost}><NumberInput id="inv-draft-cost" name="inv-draft-cost" value={draft.cost} onChange={(value) => set('cost', value)} /></Field>
          <Field label="Precio venta *" error={touched && errors.price}><NumberInput id="inv-draft-price" name="inv-draft-price" value={draft.price} onChange={(value) => set('price', value)} /></Field>
          <Field label="Precio mayor"><NumberInput id="inv-draft-wholesale-price" name="inv-draft-wholesale-price" value={draft.wholesalePrice} onChange={(value) => set('wholesalePrice', value)} /></Field>
          <Field label="Precio tecnico"><NumberInput id="inv-draft-technician-price" name="inv-draft-technician-price" value={draft.technicianPrice} onChange={(value) => set('technicianPrice', value)} /></Field>
          <Field label="Precio especial"><NumberInput id="inv-draft-special-price" name="inv-draft-special-price" value={draft.specialPrice} onChange={(value) => set('specialPrice', value)} /></Field>
          <Field label="Precio USD"><NumberInput id="inv-draft-usd-price" name="inv-draft-usd-price" value={draft.usdPrice} onChange={(value) => set('usdPrice', value)} /></Field>
        </FormSection>

        <FormSection title="Inventario, seriales e IMEI" detail="Stock inicial, alertas, unidad y control serializado.">
          <Field label={draft.id ? 'Stock actual' : 'Stock inicial'}><NumberInput id="inv-draft-stock" name="inv-draft-stock" value={draft.id ? draft.stock : draft.initialStock} onChange={(value) => draft.id ? set('stock', value) : set('initialStock', value)} /></Field>
          <Field label="Stock minimo"><NumberInput id="inv-draft-stock-min" name="inv-draft-stock-min" value={draft.stockMin} onChange={(value) => set('stockMin', value)} /></Field>
          <Field label="Stock maximo"><NumberInput id="inv-draft-stock-max" name="inv-draft-stock-max" value={draft.stockMax} onChange={(value) => set('stockMax', value)} /></Field>
          <Field label="Unidad"><select id="inv-draft-unit" name="inv-draft-unit" value={draft.unit} onChange={(e) => set('unit', e.target.value)} className="input-dark"><option>Unidad</option><option>Caja</option><option>Kit</option><option>Par</option><option>Yarda</option><option>Metro</option></select></Field>
          <Field label="Configuracion ITBIS"><select id="inv-draft-tax-status" name="inv-draft-tax-status" value={draft.taxStatus} onChange={(e) => set('taxStatus', e.target.value)} className="input-dark" style={{ borderColor: 'rgba(52,211,153,.3)', background: 'rgba(16,185,129,.1)' }}><option value="no_tax">Sin ITBIS</option><option value="taxed">Con ITBIS</option><option value="exempt">Exento</option></select><span className="mt-1 block text-xs font-bold" style={{ color: 'rgb(110,231,183)' }}>Predeterminado: sin impuestos. Active ITBIS solo cuando aplique.</span></Field>
          <Field label="Proveedor"><select id="inv-draft-supplier" name="inv-draft-supplier" value={draft.supplierId} onChange={(e) => set('supplierId', e.target.value)} className="input-dark">{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-bold transition" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.035)', color: 'rgba(255,255,255,.7)' }}>
            <input id="inv-draft-requires-serial" name="inv-draft-requires-serial" type="checkbox" checked={draft.requiresSerial} onChange={(e) => set('requiresSerial', e.target.checked)} />
            Maneja serial / IMEI
          </label>
          <Field label="Seriales / IMEI" wide error={touched && errors.serialsText}><textarea id="inv-draft-serials" name="inv-draft-serials" value={draft.serialsText} onChange={(e) => set('serialsText', e.target.value)} className="input-dark min-h-28" placeholder="Uno por linea o separado por coma" /></Field>
        </FormSection>
      </div>

      <aside className="panel h-fit rounded-lg p-4 xl:sticky xl:top-24">
        <div className="grid h-36 place-items-center rounded-lg border border-dashed text-center" style={{ borderColor: 'rgba(255,255,255,.15)', background: 'rgba(255,255,255,.025)', color: 'rgba(255,255,255,.45)' }}>
          <div>
            <ImagePlus className="mx-auto mb-2" />
            <p className="text-sm font-bold">Foto del producto</p>
            <p className="text-xs">Campo preparado para imagen/URL</p>
          </div>
        </div>
        <Field label="URL imagen"><input id="inv-draft-image" name="inv-draft-image" value={draft.image || ''} onChange={(e) => set('image', e.target.value)} className="input-dark" /></Field>
        <div className="mt-4 space-y-2 rounded-lg p-3 text-sm" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}>
          <PreviewLine label="SKU" value={draft.sku || 'Autogenerado'} />
          <PreviewLine label="Precio" value={currency.format(Number(draft.price || 0))} />
          <PreviewLine label="Costo" value={currency.format(Number(draft.cost || 0))} />
          <PreviewLine label="Stock" value={draft.id ? draft.stock : draft.initialStock} />
          <PreviewLine label="Margen" value={`${Number.isFinite(margin) ? margin.toFixed(1) : '0.0'}%`} />
        </div>
        {touched && Object.keys(errors).length ? (
          <div className="mt-4 rounded-lg p-3 text-sm" style={{ border: '1px solid rgba(248,113,113,.25)', background: 'rgba(239,68,68,.1)', color: 'rgb(254,202,202)' }}>
            {Object.values(errors).map((error) => <p key={error}>{error}</p>)}
          </div>
        ) : (
          <div className="mt-4 flex gap-2 rounded-lg p-3 text-sm" style={{ border: '1px solid rgba(52,211,153,.2)', background: 'rgba(16,185,129,.1)', color: 'rgb(167,243,208)' }}>
            <CheckCircle2 size={18} className="shrink-0" />
            <p>Completa nombre y precio de venta para guardar. El SKU puede autogenerarse.</p>
          </div>
        )}
        <Button className="mt-4 w-full py-3" icon={saving ? Loader2 : PackagePlus} disabled={saving} onClick={submit}>
          {saving ? 'Guardando...' : draft.id ? 'Actualizar producto' : 'Crear producto'}
        </Button>
      </aside>
    </div>
  )
}

function ProductDetail({ product, movements }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <div className="space-y-3 text-sm">
        <ProductIdentity product={product} large />
        <p className={product.stock <= product.stockMin ? 'rounded-lg p-3' : 'rounded-lg p-3'} style={product.stock <= product.stockMin ? { background: 'rgba(239,68,68,.1)', color: 'rgb(254,202,202)' } : { background: 'rgba(16,185,129,.1)', color: 'rgb(167,243,208)' }}>Stock actual: {product.stock}</p>
        {['sku', 'barcode', 'category', 'brand', 'model', 'location', 'unit', 'taxStatus', 'status'].map((key) => <p key={key} className="rounded-lg bg-white/[0.035] p-2"><b>{key}:</b> {String(product[key] || '-')}</p>)}
      </div>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SerialBox title="Disponibles" items={product.serials || []} />
          <SerialBox title="Vendidos" items={(product.soldSerials || []).map((s) => s.serial || s)} />
          <SerialBox title="Dañados" items={product.damagedSerials || []} />
        </div>
        <div className="h-52 rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
          <Bar data={{ labels: movements.slice(0, 12).map((m) => m.date), datasets: [{ label: 'Movimientos', data: movements.slice(0, 12).map((m) => m.quantity), backgroundColor: '#3B82F6' }] }} options={{ maintainAspectRatio: false, plugins: { legend: { labels: { color: '#cbd5e1' } } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }} />
        </div>
      </div>
    </div>
  )
}

function ProductIdentity({ product, large }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`${large ? 'h-16 w-16' : 'h-11 w-11'} grid shrink-0 place-items-center rounded-lg`} style={{ background: 'rgba(59,130,246,.15)', color: 'rgb(191,219,254)' }}>
        {product.image ? <img src={product.image} alt="" className="h-full w-full rounded-lg object-cover" /> : <Boxes size={large ? 28 : 20} />}
      </div>
      <div className="min-w-0">
        <p className="truncate font-bold text-white">{product.name}</p>
        <p className="truncate text-xs" style={{ color: 'rgba(255,255,255,.45)' }}>{product.sku || 'Sin SKU'} · {product.barcode || 'Sin barcode'}</p>
      </div>
    </div>
  )
}

function ProductActions({ product, onView, onEdit, onAdjust, onLabel, onDelete, onRestore }) {
  const deleted = Boolean(product.deletedAt) || product.status === 'Eliminado'
  return (
    <div className="action-cluster">
      <Icon icon={Eye} label="Ver" onClick={() => onView(product)} />
      {!deleted ? <Icon icon={Pencil} label="Editar" onClick={() => onEdit(product)} /> : null}
      {!deleted ? <Icon icon={SlidersHorizontal} label="Stock" onClick={() => onAdjust(product)} /> : null}
      {!deleted ? <Icon icon={Barcode} label="Etiquetas" onClick={() => onLabel(product)} /> : null}
      {deleted ? <Icon icon={RotateCcw} label="Restaurar" onClick={() => onRestore(product)} /> : <Icon icon={Trash2} label="Eliminar" danger onClick={() => onDelete(product)} />}
    </div>
  )
}

function BarcodeLabelPrinter({ product }) {
  const [quantity, setQuantity] = useState(1)
  const [source, setSource] = useState(product.barcode ? 'barcode' : product.sku ? 'sku' : 'id')
  const code = source === 'barcode' ? product.barcode : source === 'sku' ? product.sku : product.id
  const labels = Array.from({ length: Math.max(1, Math.min(Number(quantity || 1), 60)) })
  return (
    <div className="space-y-4">
      <div className="no-print grid gap-3 md:grid-cols-[1fr_160px_auto]">
        <label><span className="label-dark">Codigo a imprimir</span><select id="inv-label-source" name="inv-label-source" value={source} onChange={(event) => setSource(event.target.value)} className="input-dark"><option value="barcode">Codigo de barras</option><option value="sku">SKU</option><option value="id">ID interno</option></select></label>
        <label><span className="label-dark">Cantidad</span><input id="inv-label-quantity" name="inv-label-quantity" type="number" min="1" max="60" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="input-dark" /></label>
        <Button icon={Printer} variant="primary" className="self-end" onClick={() => window.print()}>Imprimir</Button>
      </div>
      <div className="printable-report grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {labels.map((_, index) => (
          <div key={index} className="rounded-lg border border-slate-300 bg-white p-3 text-center text-slate-950">
            <p className="truncate text-sm font-black">{product.name}</p>
            <p className="mb-2 truncate text-xs font-bold">{product.sku || 'Sin SKU'} | Stock {product.stock || 0}</p>
            <BarcodeSvg value={code} />
            <p className="mt-1 font-mono text-xs font-black tracking-wide">{code || 'SIN-CODIGO'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarcodeSvg({ value }) {
  const barcode = buildCode128Bars(value)
  return (
    <svg viewBox={`0 0 ${barcode.width} 42`} role="img" aria-label={`Codigo ${barcode.text}`} className="mx-auto h-16 w-full max-w-[260px] bg-white">
      {barcode.bars.map((bar, index) => <rect key={`${bar.x}-${index}`} x={bar.x} y="3" width={bar.width} height="34" fill="#111827" />)}
    </svg>
  )
}

function InventoryEnterpriseCenter({ insights, movements, entries }) {
  const [tab, setTab] = useState('alerts')
  const tabs = [
    ['alerts', 'Alertas', AlertTriangle],
    ['kardex', 'Kardex', Activity],
    ['valuation', 'Valorizacion', Layers3],
    ['rotation', 'Rotacion', TrendingUp],
    ['purchases', 'Compras', Truck],
  ]
  return (
    <section className="module-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase" style={{ color: 'rgb(191,219,254)' }}><Layers3 size={15} /> Inventario empresarial</p>
          <h2 className="mt-1 font-display text-2xl font-bold">Centro de control de stock, kardex y reposicion</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Valorizacion, alertas, entradas, salidas y productos sin rotacion con tablas accionables y carga ligera.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[560px]">
          <InventoryMetric title="Costo promedio" value={currency.format(insights.averageCost)} detail="Promedio activos" />
          <InventoryMetric title="Valor al costo" value={currency.format(insights.totalCost)} detail="Inventario activo registrado" />
          <InventoryMetric title="Sin rotacion" value={insights.noRotation.length} detail="Sin venta o movimiento reciente" tone={insights.noRotation.length ? 'danger' : ''} />
        </div>
      </div>
      <div className="no-print mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-extrabold transition ${tab === id ? 'border-blue-300/40 bg-blue-500/20 text-white shadow-lg shadow-blue-950/20' : 'border-white/10 bg-white/[0.035] text-white/55 hover:bg-white/[0.07] hover:text-white'}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'alerts' ? <InventoryAlertPanel insights={insights} /> : null}
        {tab === 'kardex' ? <DataTable data={movements} columns={kardexColumns} initialPageSize={25} maxBodyHeight="58vh" emptyText="Sin movimientos de inventario." searchPlaceholder="Buscar producto, serial, documento o tipo..." /> : null}
        {tab === 'valuation' ? <DataTable data={insights.valuationRows} columns={valuationColumns} initialPageSize={25} maxBodyHeight="58vh" emptyText="No hay productos valorizados." searchPlaceholder="Buscar producto, categoria o SKU..." /> : null}
        {tab === 'rotation' ? <InventoryRotationPanel insights={insights} /> : null}
        {tab === 'purchases' ? <DataTable data={entries} columns={purchaseColumns} initialPageSize={15} maxBodyHeight="58vh" emptyText="Sin entradas o compras registradas." searchPlaceholder="Buscar proveedor, referencia o producto..." /> : null}
      </div>
    </section>
  )
}

function InventoryAlertPanel({ insights }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <div className="space-y-3">
        {insights.smartAlerts.length ? insights.smartAlerts.map((alert) => (
          <div key={alert.id} className={`rounded-xl border p-4 ${alert.tone === 'danger' ? 'border-red-400/25 bg-red-500/10 text-red-100' : 'border-amber-400/25 bg-amber-500/10 text-amber-100'}`}>
            <p className="flex items-center gap-2 font-bold"><AlertTriangle size={17} /> {alert.title}</p>
            <p className="mt-1 text-sm opacity-75">{alert.detail}</p>
          </div>
        )) : <p className="rounded-xl border p-4 text-sm font-bold" style={{ borderColor: 'rgba(52,211,153,.2)', background: 'rgba(16,185,129,.1)', color: 'rgb(167,243,208)' }}>Inventario sin alertas criticas.</p>}
      </div>
      <DataTable data={insights.reorderRows} columns={reorderColumns} initialPageSize={12} maxBodyHeight="420px" emptyText="Sin productos para reponer." searchPlaceholder="Buscar reposicion..." />
    </div>
  )
}

function InventoryRotationPanel({ insights }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="panel rounded-xl p-4">
        <h3 className="mb-3 font-display text-xl font-bold">Productos top</h3>
        <DataTable data={insights.topProducts} columns={rotationColumns} initialPageSize={10} maxBodyHeight="380px" emptyText="Aun no hay ventas para ranking." />
      </section>
      <section className="panel rounded-xl p-4">
        <h3 className="mb-3 font-display text-xl font-bold">Sin rotacion</h3>
        <DataTable data={insights.noRotation} columns={noRotationColumns} initialPageSize={10} maxBodyHeight="380px" emptyText="Todos los productos tienen movimiento reciente." />
      </section>
    </div>
  )
}

function InventoryMetric({ title, value, detail, tone }) {
  return <div className={`rounded-lg border p-4 ${tone === 'danger' ? 'border-red-400/20 bg-red-500/10' : 'border-white/10 bg-white/[0.04]'}`}><p className="text-xs font-extrabold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>{title}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p><p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,.45)' }}>{detail}</p></div>
}

function StatusBadge({ product }) {
  const deleted = Boolean(product.deletedAt) || product.status === 'Eliminado'
  return <span className={deleted ? 'rounded px-2 py-1 text-xs font-bold' : 'rounded px-2 py-1 text-xs font-bold'} style={deleted ? { background: 'rgba(239,68,68,.15)', color: 'rgb(254,202,202)' } : { background: 'rgba(16,185,129,.15)', color: 'rgb(110,231,183)' }}>{deleted ? 'Eliminado' : product.status || 'Activo'}</span>
}
function FormSection({ title, detail, children }) {
  return <section className="rounded-lg p-4" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.025)' }}><div className="mb-4"><h3 className="font-display text-lg font-bold">{title}</h3><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{detail}</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div></section>
}
function Field({ label, children, error, wide }) {
  return <label className={wide ? 'md:col-span-2 xl:col-span-3' : ''}><span className="label-dark">{label}</span>{children}{error ? <span className="mt-1 block text-xs font-bold" style={{ color: 'rgb(252,165,165)' }}>{error}</span> : null}</label>
}
function NumberInput({ value, onChange, id, name }) {
  return <input type="number" min="0" step="0.01" value={value ?? 0} onChange={(event) => onChange(Number(event.target.value))} className="input-dark" id={id} name={name} />
}
function PreviewLine({ label, value }) {
  return <div className="flex justify-between gap-3"><span style={{ color: 'rgba(255,255,255,.45)' }}>{label}</span><b className="text-white">{value}</b></div>
}
function Icon({ icon: IconSvg, onClick, label, danger }) {
  return <button type="button" title={label} onClick={onClick} className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border p-2 ${danger ? 'border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/20' : 'border-white/10 bg-white/[0.035] text-white/65 hover:bg-white/[0.08]'}`}><IconSvg size={15} /></button>
}
function SerialBox({ title, items }) {
  return <div className="rounded-lg p-3" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}><p className="font-bold">{title}</p><div className="premium-scroll mt-2 max-h-32 overflow-auto text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>{items.length ? items.map((item, index) => <p key={`${item}-${index}`}>{item}</p>) : 'Sin registros'}</div></div>
}
function validateProduct(product) {
  const errors = getProductErrors(product)
  return Object.values(errors)[0] || ''
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function scoreInventoryProduct(product, query) {
  if (!query) return 1
  const fields = [
    product.name,
    product.sku,
    product.barcode,
    product.model,
    product.brand,
    product.category,
    product.description,
    ...(product.serials || []),
  ].map(normalize)
  return fields.reduce((score, field) => {
    if (!field) return score
    if (field === query) return score + 100
    if (field.startsWith(query)) return score + 70
    if (field.includes(query)) return score + 40
    if (query.split(/\s+/).every((part) => field.includes(part))) return score + 25
    return score
  }, 0)
}
function getProductErrors(product) {
  const errors = {}
  const stock = Number(product.id ? product.stock : product.initialStock)
  const serials = String(product.serialsText || '').split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
  if (!product.name?.trim() || product.name.trim().length < 2) errors.name = 'El nombre debe tener minimo 2 caracteres.'
  if (!product.category?.trim()) errors.category = 'La categoria es obligatoria.'
  if (Number(product.cost || 0) < 0) errors.cost = 'El costo no puede ser negativo.'
  if (Number(product.price || 0) <= 0) errors.price = 'El precio de venta debe ser mayor que cero.'
  if (product.requiresSerial && stock > 0 && serials.length !== stock) errors.serialsText = `Registra ${stock} serial(es)/IMEI o cambia el stock.`
  return errors
}

function buildInventoryRows(products) {
  return products.map((product) => {
    const stock = Number(product.stock || 0)
    const cost = Number(product.cost || 0)
    const price = Number(product.price || 0)
    return {
      categoria: product.category || '',
      producto: product.name || '',
      sku: product.sku || '',
      stock,
      costo: cost,
      precio: price,
      valorInventario: cost * stock,
      seriales: product.requiresSerial ? (product.serials || []).join(', ') : '',
    }
  })
}

function buildInventoryInsights({ products, movements, invoices, entries, suppliers }) {
  const now = Date.now()
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]))
  const sold = new Map()
  invoices
    .filter((invoice) => !['draft', 'voided', 'anulada', 'deleted', 'cancelled'].includes(String(invoice.status || '').toLowerCase()))
    .forEach((invoice) => {
      ;(invoice.items || []).forEach((item) => {
        const current = sold.get(item.productId) || { productId: item.productId, Producto: item.name || '', SKU: item.sku || '', Cantidad: 0, Ingresos: 0, Ganancia: 0 }
        const quantity = Number(item.quantity || 0)
        const revenue = Number(item.net || 0) + Number(item.tax || 0)
        current.Cantidad += quantity
        current.Ingresos += revenue
        current.Ganancia += Number(item.net || 0) - Number(item.cost || 0) * quantity
        sold.set(item.productId, current)
      })
    })
  const movementByProduct = new Map()
  movements.forEach((movement) => {
    const date = parseDate(movement.createdAt || movement.date)
    const current = movementByProduct.get(movement.productId) || { count: 0, last: 0 }
    current.count += 1
    current.last = Math.max(current.last, date.getTime())
    movementByProduct.set(movement.productId, current)
  })
  const valuationRows = products.map((product) => {
    const stock = Number(product.stock || 0)
    const cost = Number(product.cost || 0)
    const relatedEntries = entries.filter((entry) => (entry.items || []).some((item) => item.productId === product.id))
    const lastEntry = relatedEntries[0]
    return {
      Producto: product.name || '',
      SKU: product.sku || '',
      Categoria: product.category || '',
      Stock: stock,
      Minimo: Number(product.stockMin || 0),
      Costo: cost,
      ValorCosto: cost * stock,
      Proveedor: supplierMap.get(product.supplierId) || lastEntry?.supplierName || 'Sin proveedor',
    }
  })
  const reorderRows = products
    .filter((product) => Number(product.stock || 0) <= Number(product.stockMin || 0))
    .map((product) => {
      const max = Number(product.stockMax || 0)
      const min = Number(product.stockMin || 0)
      const stock = Number(product.stock || 0)
      const suggested = Math.max(max ? max - stock : min * 2 - stock, 1)
      return {
        Producto: product.name || '',
        SKU: product.sku || '',
        Stock: stock,
        Minimo: min,
        FaltanteMinimo: Math.max(min - stock, 0),
        ReposicionMaxima: suggested,
        Proveedor: supplierMap.get(product.supplierId) || 'Sin proveedor',
      }
    })
  const noRotation = products
    .map((product) => {
      const movement = movementByProduct.get(product.id)
      const days = movement?.last ? Math.floor((now - movement.last) / 86400000) : 999
      return {
        Producto: product.name || '',
        SKU: product.sku || '',
        Categoria: product.category || '',
        Stock: Number(product.stock || 0),
        DiasSinMovimiento: days,
        ValorCosto: Number(product.cost || 0) * Number(product.stock || 0),
      }
    })
    .filter((row) => row.Stock > 0 && row.DiasSinMovimiento >= 30)
    .sort((left, right) => right.DiasSinMovimiento - left.DiasSinMovimiento)
  const topProducts = [...sold.values()].sort((left, right) => right.Ingresos - left.Ingresos).slice(0, 50)
  const totalCost = valuationRows.reduce((sum, row) => sum + row.ValorCosto, 0)
  const critical = reorderRows.filter((row) => row.Stock <= 0).length
  const smartAlerts = [
    critical ? { id: 'out', tone: 'danger', title: 'Productos agotados', detail: `${critical} producto(s) sin disponibilidad requieren reposicion inmediata.` } : null,
    reorderRows.length ? { id: 'low', tone: 'warning', title: 'Stock critico', detail: `${reorderRows.length} producto(s) estan por debajo del minimo configurado.` } : null,
    noRotation.length ? { id: 'rotation', tone: 'warning', title: 'Capital inmovilizado', detail: `${noRotation.length} producto(s) tienen mas de 30 dias sin movimiento.` } : null,
  ].filter(Boolean)
  return {
    averageCost: products.length ? totalCost / products.length : 0,
    totalCost,
    valuationRows,
    reorderRows,
    noRotation,
    topProducts,
    smartAlerts,
  }
}

function sortInventory(products, sortBy) {
  const sorted = [...products]
  if (sortBy === 'stock' || sortBy === 'quantity') return sorted.sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0))
  if (sortBy === 'value') return sorted.sort((a, b) => (Number(b.cost || 0) * Number(b.stock || 0)) - (Number(a.cost || 0) * Number(a.stock || 0)))
  return sorted.sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')) || String(a.name || '').localeCompare(String(b.name || '')))
}

function parseDate(value) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

const kardexColumns = [
  { header: 'Fecha', cell: ({ row }) => formatDate(row.original.createdAt || row.original.date) },
  { header: 'Tipo', accessorKey: 'type' },
  { header: 'Producto', accessorKey: 'productName' },
  { header: 'Documento', accessorKey: 'documentNumber' },
  { header: 'Antes', accessorKey: 'quantityBefore' },
  { header: 'Despues', accessorKey: 'quantityAfter' },
  { header: 'Cantidad', cell: ({ row }) => row.original.signedQuantity ?? row.original.quantity },
  { header: 'Costo', cell: ({ row }) => currency.format(row.original.cost || 0) },
  { header: 'Seriales', cell: ({ row }) => (row.original.serials || []).join(', ') },
]

const valuationColumns = [
  { header: 'Producto', accessorKey: 'Producto' },
  { header: 'SKU', accessorKey: 'SKU' },
  { header: 'Categoria', accessorKey: 'Categoria' },
  { header: 'Stock', accessorKey: 'Stock' },
  { header: 'Costo', cell: ({ row }) => currency.format(row.original.Costo || 0) },
  { header: 'Valor costo', cell: ({ row }) => currency.format(row.original.ValorCosto || 0) },
  { header: 'Proveedor', accessorKey: 'Proveedor' },
]

const reorderColumns = [
  { header: 'Producto', accessorKey: 'Producto' },
  { header: 'SKU', accessorKey: 'SKU' },
  { header: 'Stock', accessorKey: 'Stock' },
  { header: 'Minimo', accessorKey: 'Minimo' },
  { header: 'Faltante minimo', accessorKey: 'FaltanteMinimo' },
  { header: 'Reposicion maxima', accessorKey: 'ReposicionMaxima' },
  { header: 'Proveedor', accessorKey: 'Proveedor' },
]

const rotationColumns = [
  { header: 'Producto', accessorKey: 'Producto' },
  { header: 'SKU', accessorKey: 'SKU' },
  { header: 'Cantidad', accessorKey: 'Cantidad' },
  { header: 'Ingresos', cell: ({ row }) => currency.format(row.original.Ingresos || 0) },
  { header: 'Ganancia', cell: ({ row }) => currency.format(row.original.Ganancia || 0) },
]

const noRotationColumns = [
  { header: 'Producto', accessorKey: 'Producto' },
  { header: 'SKU', accessorKey: 'SKU' },
  { header: 'Categoria', accessorKey: 'Categoria' },
  { header: 'Stock', accessorKey: 'Stock' },
  { header: 'Dias sin mov.', accessorKey: 'DiasSinMovimiento' },
  { header: 'Valor costo', cell: ({ row }) => currency.format(row.original.ValorCosto || 0) },
]

const purchaseColumns = [
  { header: 'Fecha', cell: ({ row }) => formatDate(row.original.date || row.original.createdAt) },
  { header: 'Proveedor', accessorKey: 'supplierName' },
  { header: 'Factura prov.', accessorKey: 'supplierInvoice' },
  { header: 'Referencia', accessorKey: 'reference' },
  { header: 'Productos', cell: ({ row }) => (row.original.items || []).map((item) => `${item.productName} x${item.quantity}`).join(', ') },
  { header: 'Total', cell: ({ row }) => currency.format(row.original.total || 0) },
]
