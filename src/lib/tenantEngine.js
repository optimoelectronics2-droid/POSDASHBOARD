export const fiscalModes = {
  NORMAL: 'normal',
  NCF: 'ncf',
  ECF: 'ecf',
}

export const ecfTypes = {
  E31: 'Factura de credito fiscal electronica',
  E32: 'Factura de consumo electronica',
  E33: 'Nota de debito electronica',
  E34: 'Nota de credito electronica',
  E41: 'Compras electronicas',
  E43: 'Gastos menores electronicos',
}

export const defaultFiscalSettings = {
  fiscalEnabled: false,
  ncfEnabled: false,
  ecfEnabled: false,
  dgiiEnabled: false,
  autoSequenceEnabled: true,
  defaultMode: fiscalModes.NORMAL,
  ecfEnvironment: 'certification',
  dgiiEndpoint: '',
  certificateAlias: '',
  certificateConfigured: false,
  contingencyEnabled: true,
  resendRejectedAutomatically: false,
  alertBeforeSequenceEnds: 25,
  alertBeforeNcfExpirationDays: 30,
}

export const defaultBranding = {
  primaryColor: '#3b82f6',
  accentColor: '#10b981',
  logoFit: 'contain',
  invoiceFooter: '',
  invoiceTerms: 'Gracias por su compra.',
  currency: 'DOP',
}

export const tenantCollections = [
  'branches',
  'stores',
  'users',
  'products',
  'productEntries',
  'inventoryMovements',
  'customers',
  'suppliers',
  'invoices',
  'quotes',
  'receivables',
  'payments',
  'financialMovements',
  'expenses',
  'conduces',
  'creditNotes',
  'serviceOrders',
  'taxSequences',
  'auditLogs',
]

export const tenantSingletons = [
  'company',
  'settings',
  'cashRegister',
  'categories',
  'selectedBranch',
  'documentCounters',
  'reportStats',
  'inventoryReports',
]

export function buildCompany(input = {}, owner = {}) {
  const companyId = input.id || `company-${crypto.randomUUID()}`
  const createdAt = input.createdAt || new Date().toISOString()
  return {
    id: companyId,
    ownerId: input.ownerId || owner.id || owner.uid || 'local-admin',
    name: input.name || 'Nueva empresa',
    legalName: input.legalName || input.name || 'Nueva empresa',
    rnc: input.rnc || '',
    address: input.address || '',
    city: input.city || '',
    province: input.province || '',
    phone: input.phone || '',
    whatsapp: input.whatsapp || '',
    email: input.email || '',
    logoUrl: input.logoUrl || '',
    signatureUrl: input.signatureUrl || '',
    plan: input.plan || 'starter',
    status: input.status || 'active',
    fiscal: { ...defaultFiscalSettings, ...(input.fiscal || {}) },
    branding: { ...defaultBranding, ...(input.branding || {}) },
    createdAt,
    updatedAt: input.updatedAt || createdAt,
  }
}

export function normalizeCompany(input = {}, owner = {}) {
  const company = buildCompany(input, owner)
  return {
    ...company,
    fiscal: { ...defaultFiscalSettings, ...(input.fiscal || company.fiscal || {}) },
    branding: { ...defaultBranding, ...(input.branding || company.branding || {}) },
  }
}

export function scopeRecord(record, companyId) {
  if (!record || !companyId) return record
  return {
    ...record,
    companyId: record.companyId || companyId,
    tenantId: record.tenantId || companyId,
  }
}

export function isImageUrl(value = '') {
  if (!value) return true
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(url.pathname + url.search)
  } catch {
    return false
  }
}

export function buildEcfEnvelope({ invoice, company, customer }) {
  const now = new Date().toISOString()
  const ecfType = invoice?.ncfType || company?.fiscal?.defaultMode || 'E32'
  return {
    id: `ecf-${crypto.randomUUID()}`,
    companyId: company?.id || invoice?.companyId || '',
    invoiceId: invoice?.id || '',
    type: ecfType,
    status: 'draft',
    trackId: '',
    xml: '',
    signedXml: '',
    attempts: 0,
    errors: [],
    history: [{ status: 'draft', at: now, note: 'Sobre e-CF preparado localmente.' }],
    metadata: {
      companyRnc: company?.rnc || '',
      customerDocument: customer?.rnc || customer?.cedula || '',
      total: invoice?.totals?.total || 0,
      issuedAt: invoice?.issuedAt || now,
    },
  }
}
