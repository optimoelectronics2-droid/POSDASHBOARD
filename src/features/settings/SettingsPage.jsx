import { useState } from 'react'
import { Building2, Pencil, Plus, Save, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'
import { defaultFiscalSettings, isImageUrl } from '../../lib/tenantEngine'

export function SettingsPage() {
  const toast = useToast()
  const companies = useERPStore((state) => state.companies)
  const activeCompanyId = useERPStore((state) => state.activeCompanyId)
  const company = useERPStore((state) => state.company)
  const branches = useERPStore((state) => state.branches)
  const suppliers = useERPStore((state) => state.suppliers)
  const categories = useERPStore((state) => state.categories)
  const taxSequences = useERPStore((state) => state.taxSequences)
  const auditLogs = useERPStore((state) => state.auditLogs)
  const updateSettings = useERPStore((state) => state.updateSettings)
  const updateFiscalSettings = useERPStore((state) => state.updateFiscalSettings)
  const updateBrandingSettings = useERPStore((state) => state.updateBrandingSettings)
  const createCompany = useERPStore((state) => state.createCompany)
  const updateCompany = useERPStore((state) => state.updateCompany)
  const deleteCompany = useERPStore((state) => state.deleteCompany)
  const switchCompany = useERPStore((state) => state.switchCompany)
  const updateCategories = useERPStore((state) => state.updateCategories)
  const updateExchangeRate = useERPStore((state) => state.updateExchangeRate)
  const upsertBranch = useERPStore((state) => state.upsertBranch)
  const upsertSupplier = useERPStore((state) => state.upsertSupplier)
  const updateTaxSequence = useERPStore((state) => state.updateTaxSequence)
  const [companyDraft, setCompanyDraft] = useState(company)
  const [editingCompanyId, setEditingCompanyId] = useState('')
  const [editingCompanyDraft, setEditingCompanyDraft] = useState({ name: '', rnc: '', phone: '', email: '' })
  const [newCompanyDraft, setNewCompanyDraft] = useState({ name: '', rnc: '', phone: '', email: '' })
  const [fiscalDraft, setFiscalDraft] = useState({ ...defaultFiscalSettings, ...(company.fiscal || {}) })
  const [branchDraft, setBranchDraft] = useState({ name: '', address: '', city: '', province: '', phone: '', warehouse: '', register: '' })
  const [supplierDraft, setSupplierDraft] = useState({ name: '', rnc: '', phone: '', email: '', active: true })
  const [categoryText, setCategoryText] = useState(categories.join(', '))

  function saveCompany() {
    try {
      if (companyDraft.logoUrl && !isImageUrl(companyDraft.logoUrl)) throw new Error('El logo debe ser una URL valida de imagen.')
      updateSettings(companyDraft)
      updateBrandingSettings({
        primaryColor: companyDraft.branding?.primaryColor,
        accentColor: companyDraft.branding?.accentColor,
        invoiceTerms: companyDraft.invoiceTerms,
      })
      updateExchangeRate(companyDraft.exchangeRate || 58.5)
      toast.success('Configuracion de empresa guardada.')
    } catch (error) {
      toast.error(error.message)
    }
  }
  function saveFiscal() {
    try {
      updateFiscalSettings(fiscalDraft)
      toast.success('Configuracion fiscal guardada. DGII y e-CF siguen siendo opcionales.')
    } catch (error) {
      toast.error(error.message)
    }
  }
  function handleCreateCompany() {
    try {
      if (!newCompanyDraft.name.trim()) throw new Error('Escriba el nombre de la empresa.')
      const created = createCompany(newCompanyDraft)
      setNewCompanyDraft({ name: '', rnc: '', phone: '', email: '' })
      toast.success(`Empresa creada: ${created.name}`)
    } catch (error) {
      toast.error(error.message)
    }
  }
  function handleSwitchCompany(companyId) {
    const selected = companies.find((item) => item.id === companyId)
    switchCompany(companyId)
    if (selected) {
      setCompanyDraft(selected)
      setFiscalDraft({ ...defaultFiscalSettings, ...(selected.fiscal || {}) })
      setCategoryText(categories.join(', '))
    }
  }
  function startEditCompany(item) {
    setEditingCompanyId(item.id)
    setEditingCompanyDraft({ name: item.name || '', rnc: item.rnc || '', phone: item.phone || '', email: item.email || '' })
  }
  function handleUpdateCompany() {
    try {
      if (!editingCompanyDraft.name.trim()) throw new Error('Escriba el nombre de la empresa.')
      const updated = updateCompany(editingCompanyId, editingCompanyDraft)
      if (updated.id === activeCompanyId) setCompanyDraft(updated)
      setEditingCompanyId('')
      toast.success(`Empresa actualizada: ${updated.name}`)
    } catch (error) {
      toast.error(error.message)
    }
  }
  function handleDeleteCompany(companyId) {
    try {
      const target = companies.find((item) => item.id === companyId)
      if (!window.confirm(`Eliminar empresa "${target?.name || companyId}"? Esta accion quita su workspace local sincronizable.`)) return
      const deleted = deleteCompany(companyId)
      setCompanyDraft(useERPStore.getState().company)
      setFiscalDraft({ ...defaultFiscalSettings, ...(useERPStore.getState().company.fiscal || {}) })
      toast.success(`Empresa eliminada: ${deleted.name}`)
    } catch (error) {
      toast.error(error.message)
    }
  }
  function saveBranch() {
    try {
      if (!branchDraft.name.trim()) throw new Error('El nombre de la tienda/sucursal es obligatorio.')
      upsertBranch(branchDraft)
      setBranchDraft({ name: '', address: '', city: '', province: '', phone: '', warehouse: '', register: '' })
      toast.success('Tienda registrada correctamente.')
    } catch (error) {
      toast.error(error.message)
    }
  }
  function saveSupplier() {
    try {
      if (!supplierDraft.name.trim()) throw new Error('El nombre del proveedor es obligatorio.')
      upsertSupplier(supplierDraft)
      setSupplierDraft({ name: '', rnc: '', phone: '', email: '', active: true })
      toast.success('Proveedor registrado correctamente.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="panel rounded-lg p-5">
          <div className="mb-4 flex items-center gap-3"><Sparkles className="text-emerald-300" /><div><h2 className="font-display text-2xl font-bold">SaaS multiempresa</h2><p className="text-sm text-white/45">Cada empresa trabaja en su propio workspace local sincronizable sin mezclar inventario, facturas ni reportes.</p></div></div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Empresa activa"><select value={activeCompanyId} onChange={(event) => handleSwitchCompany(event.target.value)} className="input-dark">{companies.map((item) => <option key={item.id} value={item.id}>{item.name || item.legalName || item.id}</option>)}</select></Field>
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-white/60">
              <p className="font-bold text-white">{company.name || 'Empresa sin nombre'}</p>
              <p>{company.rnc || 'Sin RNC'} · {company.email || 'Sin email'}</p>
              <p className="mt-1 text-xs text-white/38">ID tenant: {company.id}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {companies.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                {editingCompanyId === item.id ? (
                  <div className="grid gap-2 md:grid-cols-[1fr_130px_130px_1fr_auto]">
                    <input value={editingCompanyDraft.name} onChange={(event) => setEditingCompanyDraft((state) => ({ ...state, name: event.target.value }))} className="input-dark" placeholder="Nombre" />
                    <input value={editingCompanyDraft.rnc} onChange={(event) => setEditingCompanyDraft((state) => ({ ...state, rnc: event.target.value }))} className="input-dark" placeholder="RNC" />
                    <input value={editingCompanyDraft.phone} onChange={(event) => setEditingCompanyDraft((state) => ({ ...state, phone: event.target.value }))} className="input-dark" placeholder="Telefono" />
                    <input value={editingCompanyDraft.email} onChange={(event) => setEditingCompanyDraft((state) => ({ ...state, email: event.target.value }))} className="input-dark" placeholder="Email" />
                    <div className="flex gap-2"><Button icon={Save} onClick={handleUpdateCompany}>Guardar</Button><Button variant="ghost" onClick={() => setEditingCompanyId('')}>Cancelar</Button></div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div><p className="font-bold text-white">{item.name || item.legalName || item.id}</p><p className="text-sm text-white/45">{item.rnc || 'Sin RNC'} · {item.phone || 'Sin telefono'} · {item.email || 'Sin email'}</p></div>
                    <div className="flex gap-2"><Button variant="ghost" icon={Pencil} onClick={() => startEditCompany(item)}>Editar</Button><Button variant="danger" icon={Trash2} disabled={companies.length <= 1} onClick={() => handleDeleteCompany(item.id)}>Eliminar</Button></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="panel rounded-lg p-5">
          <h3 className="font-display text-xl font-bold">Crear empresa</h3>
          <div className="mt-4 grid gap-3">
            {['name:Nombre empresa', 'rnc:RNC', 'phone:Telefono', 'email:Email'].map((item) => {
              const [key, label] = item.split(':')
              return <Input key={key} label={label} value={newCompanyDraft[key]} onChange={(value) => setNewCompanyDraft((state) => ({ ...state, [key]: value }))} />
            })}
          </div>
          <Button icon={Plus} className="mt-4 w-full" onClick={handleCreateCompany}>Crear y cambiar</Button>
        </div>
      </section>

      <section className="panel rounded-lg p-5">
        <div className="mb-4 flex items-center gap-3"><Building2 className="text-blue-300" /><div><h2 className="font-display text-2xl font-bold">Personalizacion inicial del sistema</h2><p className="text-sm text-white/45">Todo empieza vacio: registra empresa, tienda, secuencias, proveedores y categorias.</p></div></div>
        <div className="grid gap-3 md:grid-cols-4">
          {['name:Nombre empresa', 'legalName:Razon social', 'rnc:RNC', 'address:Direccion', 'city:Ciudad', 'province:Provincia', 'phone:Telefono', 'whatsapp:WhatsApp', 'email:Email', 'logoUrl:Logo URL'].map((item) => {
            const [key, label] = item.split(':')
            return <Input key={key} label={label} value={companyDraft[key]} onChange={(value) => setCompanyDraft((state) => ({ ...state, [key]: value }))} />
          })}
          <Input label="Color primario" value={companyDraft.branding?.primaryColor || '#3b82f6'} onChange={(value) => setCompanyDraft((state) => ({ ...state, branding: { ...(state.branding || {}), primaryColor: value } }))} />
          <Input label="Color acento" value={companyDraft.branding?.accentColor || '#10b981'} onChange={(value) => setCompanyDraft((state) => ({ ...state, branding: { ...(state.branding || {}), accentColor: value } }))} />
          <Input type="number" label="Tasa USD" value={companyDraft.exchangeRate} onChange={(value) => setCompanyDraft((state) => ({ ...state, exchangeRate: Number(value) }))} />
          <Input type="number" label="Descuento max %" value={companyDraft.maxDiscountPercent} onChange={(value) => setCompanyDraft((state) => ({ ...state, maxDiscountPercent: Number(value) }))} />
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={companyDraft.requireOpenRegister} onChange={(e) => setCompanyDraft((state) => ({ ...state, requireOpenRegister: e.target.checked }))} /> Requerir caja abierta</label>
        </div>
        <div className="mt-4 flex justify-end"><Button icon={Save} onClick={saveCompany}>Guardar empresa</Button></div>
        {companyDraft.logoUrl ? <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/30"><img src={companyDraft.logoUrl} alt="Preview logo empresa" className="h-full w-full object-contain" onError={() => toast.error('No se pudo cargar el logo. Revise la URL.')} /></div><p className="text-sm text-white/50">Preview en tiempo real para facturas, POS, dashboard y reportes.</p></div> : null}
      </section>

      <section className="panel rounded-lg p-5">
        <div className="mb-4 flex items-center gap-3"><ShieldCheck className="text-emerald-300" /><div><h2 className="font-display text-2xl font-bold">Facturacion flexible RD</h2><p className="text-sm text-white/45">La factura normal, NCF y e-CF son modos opcionales por empresa.</p></div></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Toggle label="Usar comprobantes fiscales" checked={fiscalDraft.ncfEnabled} onChange={(value) => setFiscalDraft((state) => ({ ...state, ncfEnabled: value, fiscalEnabled: value || state.ecfEnabled }))} />
          <Toggle label="Usar e-CF" checked={fiscalDraft.ecfEnabled} onChange={(value) => setFiscalDraft((state) => ({ ...state, ecfEnabled: value, fiscalEnabled: state.ncfEnabled || value }))} />
          <Toggle label="Conectar DGII" checked={fiscalDraft.dgiiEnabled} onChange={(value) => setFiscalDraft((state) => ({ ...state, dgiiEnabled: value }))} />
          <Toggle label="Secuencia automatica" checked={fiscalDraft.autoSequenceEnabled} onChange={(value) => setFiscalDraft((state) => ({ ...state, autoSequenceEnabled: value }))} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Field label="Modo por defecto"><select value={fiscalDraft.defaultMode} onChange={(event) => setFiscalDraft((state) => ({ ...state, defaultMode: event.target.value }))} className="input-dark"><option value="normal">Normal sin NCF</option><option value="ncf">NCF</option><option value="ecf">e-CF DGII</option></select></Field>
          <Field label="Ambiente e-CF"><select value={fiscalDraft.ecfEnvironment} onChange={(event) => setFiscalDraft((state) => ({ ...state, ecfEnvironment: event.target.value }))} className="input-dark"><option value="certification">Certificacion</option><option value="production">Produccion</option></select></Field>
          <Input type="number" label="Alerta secuencia baja" value={fiscalDraft.alertBeforeSequenceEnds} onChange={(value) => setFiscalDraft((state) => ({ ...state, alertBeforeSequenceEnds: Number(value) }))} />
          <Input type="number" label="Alerta vencimiento dias" value={fiscalDraft.alertBeforeNcfExpirationDays} onChange={(value) => setFiscalDraft((state) => ({ ...state, alertBeforeNcfExpirationDays: Number(value) }))} />
        </div>
        <Button icon={Save} className="mt-4" onClick={saveFiscal}>Guardar fiscal</Button>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="panel rounded-lg p-5">
          <h3 className="font-display text-xl font-bold">Registrar tienda / ubicacion</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {['name:Nombre tienda', 'address:Direccion', 'city:Ciudad', 'province:Provincia', 'phone:Telefono', 'warehouse:Almacen', 'register:Caja'].map((item) => { const [key, label] = item.split(':'); return <Input key={key} label={label} value={branchDraft[key]} onChange={(value) => setBranchDraft((state) => ({ ...state, [key]: value }))} /> })}
          </div>
          <Button className="mt-4" onClick={saveBranch}>Guardar tienda</Button>
          <List items={branches.map((branch) => `${branch.name} · ${branch.city || branch.address}`)} />
        </div>
        <div className="panel rounded-lg p-5">
          <h3 className="font-display text-xl font-bold">Registrar proveedor</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {['name:Nombre', 'rnc:RNC', 'phone:Telefono', 'email:Email'].map((item) => { const [key, label] = item.split(':'); return <Input key={key} label={label} value={supplierDraft[key]} onChange={(value) => setSupplierDraft((state) => ({ ...state, [key]: value }))} /> })}
          </div>
          <Button className="mt-4" onClick={saveSupplier}>Guardar proveedor</Button>
          <List items={suppliers.map((supplier) => supplier.name)} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="panel rounded-lg p-5">
          <h3 className="font-display text-xl font-bold">Categorias editables</h3>
          <textarea value={categoryText} onChange={(e) => setCategoryText(e.target.value)} className="input-dark mt-4 min-h-24" />
          <p className="mt-2 text-sm text-white/45">Separadas por coma. Se aplican en el proximo producto registrado.</p>
          <Button className="mt-4" onClick={() => { try { updateCategories(categoryText.split(',')); toast.success('Categorias guardadas.') } catch (error) { toast.error(error.message) } }}>Guardar categorias</Button>
        </div>
        <div className="panel rounded-lg p-5">
          <h3 className="mb-4 flex items-center gap-2 font-display text-xl font-bold"><ShieldCheck className="text-emerald-300" /> Secuencias fiscales</h3>
          <div className="space-y-2">
            {taxSequences.map((sequence) => (
              <div key={sequence.id} className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-2 md:grid-cols-5">
                <p className="font-bold">{sequence.id}</p>
                <input type="number" value={sequence.next} onChange={(e) => updateTaxSequence({ type: sequence.id, next: Number(e.target.value) })} className="input-dark" />
                <input type="number" value={sequence.limit} onChange={(e) => updateTaxSequence({ type: sequence.id, limit: Number(e.target.value) })} className="input-dark" />
                <input type="date" value={sequence.expiresAt} onChange={(e) => updateTaxSequence({ type: sequence.id, expiresAt: e.target.value })} className="input-dark" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sequence.enabled} onChange={(e) => updateTaxSequence({ type: sequence.id, enabled: e.target.checked })} /> Activa</label>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel rounded-lg p-5">
        <h3 className="font-display text-xl font-bold">Auditoria reciente</h3>
        <div className="mt-3 grid gap-2">{auditLogs.slice(0, 8).map((log) => <div key={log.id} className="rounded-lg bg-white/[0.035] p-3 text-sm"><p className="font-bold">{log.action} · {log.module}</p><p className="text-white/45">{log.user} · {log.date}</p></div>)}</div>
      </section>
    </div>
  )
}

function Field({ label, children }) {
  return <label className="block"><span className="label-dark">{label}</span>{children}</label>
}

function Toggle({ label, checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${checked ? 'border-emerald-400/45 bg-emerald-500/12 text-emerald-100' : 'border-white/10 bg-white/[0.035] text-white/55'}`}>
      <span className="text-sm font-bold">{label}</span>
      <span className={`h-6 w-11 rounded-full p-1 transition ${checked ? 'bg-emerald-400' : 'bg-white/15'}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}

function Input({ label, value, onChange, type = 'text' }) {
  return <label><span className="label-dark">{label}</span><input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} className="input-dark" /></label>
}
function List({ items }) {
  return <div className="mt-4 space-y-2">{items.map((item) => <p key={item} className="rounded-lg bg-white/[0.035] p-2 text-sm text-white/60">{item}</p>)}</div>
}
