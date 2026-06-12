import { invoiceModes } from './taxEngine.js'

export const REPORT_ENGINE_VERSION = 1

const VALID_INVOICE_STATUSES = new Set(['pagada', 'paid', 'credito', 'credit', 'parcial', 'partial', 'open', 'emitida', 'issued', 'borrador', 'draft', 'pendiente', 'pending', 'vencida', 'overdue', 'entregada', 'delivered'])
const INVALID_INVOICE_STATUSES = new Set(['deleted', 'eliminado', 'cancelled', 'canceled', 'cancelado', 'cancelada', 'voided', 'anulada', 'anulado'])

export function createEmptyReportStats() {
  const generatedAt = new Date().toISOString()
  return {
    version: REPORT_ENGINE_VERSION,
    generatedAt,
    source: {
      fingerprint: '',
      invoiceCount: 0,
      creditNoteCount: 0,
      quoteCount: 0,
      validInvoiceCount: 0,
      voidedInvoiceCount: 0,
      validCreditNoteCount: 0,
      duplicateCount: 0,
      invalidCount: 0,
    },
    periods: {
      daily: [],
      weekly: [],
      monthly: [],
      annual: [],
      historical: emptyMetrics('historical', 'Historico'),
    },
    fiscalBuckets: emptyFiscalBuckets(),
    fiscalGroups: [],
    topProducts: [],
    frequentCustomers: [],
    paymentMethods: [],
    inventoryValuation: {
      totalCost: 0,
      products: [],
    },
    financialHistory: [],
    invalidDocuments: [],
    duplicateDocuments: [],
  }
}

export function buildReportFingerprint({ invoices = [], creditNotes = [], products = [], quotes = [] } = {}) {
  const invoicePart = invoices
    .map((invoice) => [
      invoice?.id,
      invoice?.number,
      invoice?.ncf,
      invoice?.status,
      invoice?.updatedAt,
      invoice?.voidedAt,
      invoice?.issuedAt,
      invoice?.createdAt,
      roundMoney(invoice?.totals?.total || invoice?.total || 0),
    ].join(':'))
    .sort()
    .join('|')
  const notePart = creditNotes
    .map((note) => [
      note?.id,
      note?.number,
      note?.status,
      note?.updatedAt,
      note?.createdAt,
      roundMoney(note?.totals?.total || note?.total || 0),
    ].join(':'))
    .sort()
    .join('|')
  const productPart = products
    .map((product) => [
      product?.id,
      product?.status,
      product?.updatedAt,
      roundMoney(product?.stock || 0),
      roundMoney(product?.cost || 0),
      roundMoney(product?.price || 0),
    ].join(':'))
    .sort()
    .join('|')
  const quotePart = quotes
    .map((quote) => [
      quote?.id,
      quote?.number,
      quote?.status,
      quote?.version || 1,
      quote?.updatedAt,
      roundMoney(quote?.totals?.total || 0),
    ].join(':'))
    .sort()
    .join('|')
  return simpleHash(`${REPORT_ENGINE_VERSION}::${invoicePart}::${notePart}::${productPart}::${quotePart}`)
}

export function buildHistoricalReport({ invoices = [], creditNotes = [], products = [], quotes = [], generatedAt = new Date() } = {}) {
  const stats = createEmptyReportStats()
  stats.generatedAt = generatedAt.toISOString()
  stats.source.invoiceCount = invoices.length
  stats.source.creditNoteCount = creditNotes.length
  stats.source.quoteCount = quotes.length
  stats.source.fingerprint = buildReportFingerprint({ invoices, creditNotes, products, quotes })
  stats.inventoryValuation = buildInventoryValuation(products)

  const periodMaps = {
    daily: new Map(),
    weekly: new Map(),
    monthly: new Map(),
    annual: new Map(),
  }
  const fiscalBuckets = emptyFiscalBuckets()
  const fiscalGroups = emptyFiscalGroups()
  const productsMap = new Map()
  const customersMap = new Map()
  const paymentsMap = new Map()
  const dedupedInvoices = dedupeDocuments(invoices, invoiceDocumentKey)
  const dedupedNotes = dedupeDocuments(creditNotes, creditNoteDocumentKey)

  stats.duplicateDocuments.push(...dedupedInvoices.duplicates, ...dedupedNotes.duplicates)
  stats.source.duplicateCount = stats.duplicateDocuments.length

  dedupedInvoices.documents.forEach((invoice) => {
    const validity = classifyInvoice(invoice)
    if (validity === 'duplicate') return
    if (validity === 'voided') {
      stats.source.voidedInvoiceCount += 1
      addHistory(stats.financialHistory, invoice, 'Anulacion', 0, invoice.voidReason || 'Factura anulada')
      addPeriodMetric(periodMaps, invoiceDate(invoice, 'void'), { voidedDocuments: 1 })
      return
    }
    if (validity !== 'valid') {
      stats.invalidDocuments.push(documentIssue(invoice, validity))
      return
    }

    stats.source.validInvoiceCount += 1
    const metric = invoiceMetric(invoice)
    addToFiscalBucket(fiscalBuckets, invoice, metric)
    addFiscalGroupRows(fiscalGroups, invoice)
    addPeriodMetric(periodMaps, invoiceDate(invoice), metric)
    addMetric(stats.periods.historical, metric)
    addProductLines(productsMap, invoice, 1)
    addCustomer(customersMap, invoice, metric)
    addPayments(paymentsMap, invoice, 1)
    addHistory(stats.financialHistory, invoice, 'Factura', metric.total, 'Venta emitida')
  })

  dedupedNotes.documents.forEach((note) => {
    const validity = classifyCreditNote(note)
    if (validity !== 'valid') {
      stats.invalidDocuments.push(documentIssue(note, validity))
      return
    }

    stats.source.validCreditNoteCount += 1
    const metric = invoiceMetric(note, -1)
    const adjustment = {
      ...metric,
      creditNotes: 1,
      returns: Math.abs(metric.total),
      documents: 0,
    }
    addPeriodMetric(periodMaps, invoiceDate(note), adjustment)
    addMetric(stats.periods.historical, adjustment)
    addProductLines(productsMap, note, -1)
    addCustomer(customersMap, note, adjustment)
    addPayments(paymentsMap, note, -1)
    addHistory(stats.financialHistory, note, 'Nota de credito', metric.total, note.reason || 'Devolucion / credito')
  })

  stats.source.invalidCount = stats.invalidDocuments.length
  stats.periods.daily = periodRows(periodMaps.daily)
  stats.periods.weekly = periodRows(periodMaps.weekly)
  stats.periods.monthly = periodRows(periodMaps.monthly)
  stats.periods.annual = periodRows(periodMaps.annual)
  stats.fiscalBuckets = normalizeFiscalBuckets(fiscalBuckets)
  stats.fiscalGroups = Object.values(fiscalGroups).map((group) => ({
    ...group,
    bucket: stats.fiscalBuckets[group.id],
    customers: new Set(group.invoices.map((invoice) => invoice.customerId || invoice.customerName).filter(Boolean)).size,
  }))
  stats.topProducts = [...productsMap.values()]
    .filter((item) => item.quantity > 0 || item.revenue > 0)
    .map(finalizeProduct)
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 100)
  stats.frequentCustomers = [...customersMap.values()]
    .map(finalizeCustomer)
    .sort((a, b) => b.documents - a.documents || b.netRevenue - a.netRevenue)
    .slice(0, 100)
  stats.paymentMethods = [...paymentsMap.values()]
    .map((item) => ({ ...item, amount: roundMoney(item.amount), refunds: roundMoney(item.refunds), netAmount: roundMoney(item.amount - item.refunds) }))
    .sort((a, b) => b.netAmount - a.netAmount)
  stats.financialHistory.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return stats
}

function dedupeDocuments(documents, keyBuilder) {
  const byKey = new Map()
  const duplicates = []
  documents.forEach((document) => {
    const key = keyBuilder(document)
    if (!key) {
      duplicates.push(documentIssue(document, 'sin identidad documental'))
      return
    }
    const current = byKey.get(key)
    if (!current) {
      byKey.set(key, document)
      return
    }
    duplicates.push(documentIssue(document, `duplicado de ${key}`))
    if (documentTimestamp(document) > documentTimestamp(current)) byKey.set(key, document)
  })
  return { documents: [...byKey.values()], duplicates }
}

function invoiceDocumentKey(invoice) {
  return invoice?.ncf || invoice?.number || invoice?.id || ''
}

function creditNoteDocumentKey(note) {
  return note?.ncf || note?.number || note?.id || ''
}

function classifyInvoice(invoice) {
  const status = String(invoice?.status || '').toLowerCase()
  if (status === 'voided' || status === 'anulada') return 'voided'
  if (INVALID_INVOICE_STATUSES.has(status)) return status || 'invalid'
  if (status && !VALID_INVOICE_STATUSES.has(status)) return `estado no reportable: ${status}`
  if (!invoice?.items?.length) return 'sin productos'
  if (roundMoney(invoice?.totals?.total || invoice?.total || 0) <= 0) return 'monto invalido'
  return 'valid'
}

function classifyCreditNote(note) {
  const status = String(note?.status || '').toLowerCase()
  if (status === 'voided' || status === 'anulada' || status === 'draft' || status === 'deleted') return status || 'invalid'
  if (!note?.items?.length) return 'sin productos'
  if (roundMoney(note?.totals?.total || note?.total || 0) <= 0) return 'monto invalido'
  return 'valid'
}

function invoiceMetric(document, sign = 1) {
  const totals = document?.totals || {}
  const subtotal = sign * roundMoney(totals.subtotal ?? totals.total ?? document.total ?? 0)
  const taxableSubtotal = sign * roundMoney(totals.taxableSubtotal || 0)
  const exemptSubtotal = sign * roundMoney(totals.exemptSubtotal || 0)
  const tax = sign * roundMoney(totals.itbis || totals.tax || 0)
  const total = sign * roundMoney(totals.total ?? document.total ?? subtotal + tax)
  const cost = sign * roundMoney(totals.cost ?? (document.items || []).reduce((sum, item) => sum + toNumber(item.cost) * toNumber(item.quantity), 0))
  const units = sign * roundMoney((document.items || []).reduce((sum, item) => sum + toNumber(item.quantity), 0))
  return {
    documents: sign > 0 ? 1 : 0,
    subtotal,
    taxableSubtotal,
    exemptSubtotal,
    tax,
    total,
    grossSales: sign > 0 ? total : 0,
    netRevenue: total,
    cost,
    utility: subtotal - cost,
    netProfit: subtotal - cost,
    creditNotes: 0,
    returns: 0,
    voidedDocuments: 0,
    unitsSold: units,
  }
}

function addPeriodMetric(periodMaps, date, metric) {
  const safeDate = parseDate(date)
  const keys = {
    daily: dayKey(safeDate),
    weekly: weekKey(safeDate),
    monthly: monthKey(safeDate),
    annual: annualKey(safeDate),
  }
  Object.entries(keys).forEach(([type, key]) => {
    const current = periodMaps[type].get(key) || emptyMetrics(key, periodLabel(type, key))
    addMetric(current, metric)
    periodMaps[type].set(key, current)
  })
}

function addMetric(target, metric) {
  Object.keys(emptyMetricValues()).forEach((key) => {
    target[key] = roundMoney(toNumber(target[key]) + toNumber(metric[key]))
  })
  target.averageTicket = target.documents > 0 ? roundMoney(target.total / target.documents) : 0
  target.margin = target.subtotal > 0 ? roundMoney((target.netProfit / target.subtotal) * 100) : 0
}

function addToFiscalBucket(buckets, invoice, metric) {
  const key = invoice.mode === invoiceModes.NO_TAX ? 'noTax' : invoice.mode === invoiceModes.MIXED ? 'mixed' : 'taxed'
  addMetric(buckets[key], metric)
}

function addFiscalGroupRows(groups, invoice) {
  const key = invoice.mode === invoiceModes.NO_TAX ? 'noTax' : invoice.mode === invoiceModes.MIXED ? 'mixed' : 'taxed'
  groups[key].invoices.push(invoiceReportRow(invoice))
  groups[key].items.push(...invoiceItemRows(invoice))
}

function addProductLines(productsMap, document, sign) {
  ;(document.items || []).forEach((item) => {
    const key = item.productId || item.sku || item.name
    if (!key) return
    const current = productsMap.get(key) || {
      id: key,
      productId: item.productId || '',
      sku: item.sku || '',
      name: item.name || 'Producto',
      quantity: 0,
      revenue: 0,
      tax: 0,
      cost: 0,
      profit: 0,
      frequency: 0,
      returns: 0,
    }
    const quantity = toNumber(item.quantity)
    const subtotal = roundMoney(item.net ?? toNumber(item.price) * quantity)
    const tax = roundMoney(item.tax || 0)
    const cost = roundMoney(toNumber(item.cost) * quantity)
    current.quantity += sign * quantity
    current.revenue += sign * (subtotal + tax)
    current.tax += sign * tax
    current.cost += sign * cost
    current.profit += sign * (subtotal - cost)
    current.frequency += sign > 0 ? 1 : 0
    current.returns += sign < 0 ? quantity : 0
    productsMap.set(key, current)
  })
}

function addCustomer(customersMap, document, metric) {
  const key = document.customerId || document.customerName || 'sin-cliente'
  const current = customersMap.get(key) || {
    id: key,
    name: document.customerName || 'Cliente',
    rnc: document.customerRnc || document.customerDocument || '',
    documents: 0,
    creditNotes: 0,
    netRevenue: 0,
    tax: 0,
    netProfit: 0,
  }
  current.documents += metric.documents || 0
  current.creditNotes += metric.creditNotes || 0
  current.netRevenue += metric.netRevenue || 0
  current.tax += metric.tax || 0
  current.netProfit += metric.netProfit || 0
  customersMap.set(key, current)
}

function addPayments(paymentsMap, document, sign) {
  const total = roundMoney(document?.totals?.total || document?.total || 0)
  const payments = document.payments?.length ? document.payments : [{ method: document.paymentMethod || 'No especificado', amount: total }]
  payments.forEach((payment) => {
    const key = payment.method || 'No especificado'
    const amount = roundMoney(payment.amount || total)
    const current = paymentsMap.get(key) || { method: key, count: 0, amount: 0, refunds: 0 }
    if (sign > 0) {
      current.count += 1
      current.amount += amount
    } else {
      current.refunds += amount
    }
    paymentsMap.set(key, current)
  })
}

function addHistory(history, document, type, amount, description) {
  history.push({
    id: `${type}-${document.id || document.number || document.ncf || history.length}`,
    date: invoiceDate(document),
    type,
    number: document.ncf || document.number || '',
    customer: document.customerName || '',
    subtotal: roundMoney(document.totals?.subtotal || 0),
    tax: roundMoney(document.totals?.itbis || 0),
    total: roundMoney(document.totals?.total || document.total || 0),
    amount: roundMoney(amount),
    status: document.status || '',
    description,
  })
}

function buildInventoryValuation(products) {
  const rows = products
    .filter((product) => product && !product.deletedAt && product.status !== 'Eliminado')
    .map((product) => {
      const stock = toNumber(product.stock)
      const cost = toNumber(product.cost)
      return {
        id: product.id,
        sku: product.sku || '',
        name: product.name || '',
        category: product.category || '',
        stock,
        cost,
        costValue: roundMoney(stock * cost),
      }
    })
    .sort((a, b) => b.costValue - a.costValue)
  return {
    totalCost: roundMoney(rows.reduce((sum, item) => sum + item.costValue, 0)),
    products: rows.slice(0, 250),
  }
}

function periodRows(map) {
  return [...map.values()].map(finalizeMetric).sort((a, b) => String(b.period).localeCompare(String(a.period)))
}

function normalizeFiscalBuckets(buckets) {
  return {
    taxed: finalizeMetric(buckets.taxed),
    noTax: finalizeMetric(buckets.noTax),
    mixed: finalizeMetric(buckets.mixed),
  }
}

function emptyFiscalGroups() {
  return {
    taxed: {
      id: 'taxed',
      mode: invoiceModes.TAXED,
      title: 'VENTAS CON ITBIS',
      sheetName: 'Con ITBIS',
      description: 'Facturas gravadas, ITBIS cobrado, ganancia y detalle de productos.',
      invoices: [],
      items: [],
    },
    noTax: {
      id: 'noTax',
      mode: invoiceModes.NO_TAX,
      title: 'VENTAS SIN ITBIS',
      sheetName: 'Sin ITBIS',
      description: 'Ventas no gravadas con detalle de facturas, productos y ganancia.',
      noTax: true,
      invoices: [],
      items: [],
    },
    mixed: {
      id: 'mixed',
      mode: invoiceModes.MIXED,
      title: 'VENTAS MIXTAS',
      sheetName: 'Mixtas',
      description: 'Facturas con lineas gravadas y exentas separadas para revision fiscal.',
      invoices: [],
      items: [],
    },
  }
}

function invoiceReportRow(invoice) {
  return {
    id: invoice.id,
    number: invoice.number || '',
    ncf: invoice.ncf || '',
    ncfType: invoice.ncfType || '',
    customerId: invoice.customerId || '',
    customerName: invoice.customerName || '',
    customerRnc: invoice.customerRnc || invoice.customerDocument || '',
    date: invoiceDate(invoice),
    issuedAt: invoice.issuedAt || invoice.createdAt || invoice.issueDate || '',
    mode: invoice.mode || '',
    status: invoice.status || '',
    paymentMethod: (invoice.payments || []).map((payment) => payment.method).join(', ') || invoice.paymentMethod || '',
    seller: invoice.seller || '',
    products: (invoice.items || []).length,
    totals: {
      subtotal: roundMoney(invoice.totals?.subtotal || invoice.totals?.total || 0),
      taxableSubtotal: roundMoney(invoice.totals?.taxableSubtotal || 0),
      exemptSubtotal: roundMoney(invoice.totals?.exemptSubtotal || 0),
      itbis: roundMoney(invoice.totals?.itbis || 0),
      total: roundMoney(invoice.totals?.total || invoice.total || 0),
      cost: roundMoney(invoice.totals?.cost ?? (invoice.items?.length ? invoice.items.reduce((s, item) => s + Number(item.cost || 0) * Number(item.quantity || 0), 0) : 0)),
      profit: roundMoney(invoice.items?.length ? invoice.items.reduce((s, item) => s + Number(item.net || 0) - Number(item.cost || 0) * Number(item.quantity || 0), 0) : (invoice.totals?.profit ?? invoice.totals?.subtotal - invoice.totals?.cost ?? 0)),
    },
  }
}

function invoiceItemRows(invoice) {
  return (invoice.items || []).map((item) => {
    const quantity = toNumber(item.quantity)
    const subtotal = roundMoney(item.net ?? toNumber(item.price) * quantity)
    const itbis = roundMoney(item.tax || 0)
    const cost = roundMoney(toNumber(item.cost) * quantity)
    return {
      factura: invoice.ncf || invoice.number || '',
      cliente: invoice.customerName || '',
      fecha: invoiceDate(invoice),
      producto: item.name || '',
      sku: item.sku || '',
      modelo: item.model || '',
      cantidad: quantity,
      precio: roundMoney(item.price || 0),
      descuento: roundMoney(item.discount || 0),
      subtotal,
      itbis,
      total: roundMoney(subtotal + itbis),
      costo: cost,
      ganancia: roundMoney(subtotal - cost),
      seriales: (item.serials || (item.serial ? [item.serial] : [])).join(', '),
      gravado: item.taxable ? 'Si' : 'No',
    }
  })
}

function emptyFiscalBuckets() {
  return {
    taxed: emptyMetrics('taxed', 'Ventas con ITBIS'),
    noTax: emptyMetrics('no_tax', 'Ventas sin ITBIS'),
    mixed: emptyMetrics('mixed', 'Ventas mixtas'),
  }
}

function emptyMetrics(period, label) {
  return {
    period,
    label,
    ...emptyMetricValues(),
  }
}

function emptyMetricValues() {
  return {
    documents: 0,
    subtotal: 0,
    taxableSubtotal: 0,
    exemptSubtotal: 0,
    tax: 0,
    total: 0,
    grossSales: 0,
    netRevenue: 0,
    cost: 0,
    utility: 0,
    netProfit: 0,
    creditNotes: 0,
    returns: 0,
    voidedDocuments: 0,
    unitsSold: 0,
    averageTicket: 0,
    margin: 0,
  }
}

function finalizeMetric(metric) {
  const next = { ...metric }
  Object.keys(emptyMetricValues()).forEach((key) => {
    next[key] = roundMoney(next[key])
  })
  next.averageTicket = next.documents > 0 ? roundMoney(next.total / next.documents) : 0
  next.margin = next.subtotal > 0 ? roundMoney((next.netProfit / next.subtotal) * 100) : 0
  next.count = next.documents
  next.itbis = next.tax
  next.profit = next.netProfit
  return next
}

function finalizeProduct(product) {
  return {
    ...product,
    quantity: roundMoney(product.quantity),
    revenue: roundMoney(product.revenue),
    tax: roundMoney(product.tax),
    cost: roundMoney(product.cost),
    profit: roundMoney(product.profit),
    margin: product.revenue > 0 ? roundMoney((product.profit / Math.max(product.revenue - product.tax, 1)) * 100) : 0,
  }
}

function finalizeCustomer(customer) {
  return {
    ...customer,
    netRevenue: roundMoney(customer.netRevenue),
    tax: roundMoney(customer.tax),
    netProfit: roundMoney(customer.netProfit),
  }
}

function documentIssue(document, reason) {
  return {
    id: document?.id || document?.number || document?.ncf || '',
    number: document?.ncf || document?.number || '',
    status: document?.status || '',
    reason,
    date: invoiceDate(document),
  }
}

function invoiceDate(document, fallback = 'issued') {
  if (fallback === 'void') return document?.voidedAt || document?.updatedAt || document?.issuedAt || document?.createdAt || document?.issueDate || new Date().toISOString()
  return document?.issuedAt || document?.createdAt || document?.issueDate || document?.updatedAt || new Date().toISOString()
}

function documentTimestamp(document) {
  return parseDate(document?.updatedAt || document?.issuedAt || document?.createdAt || document?.issueDate).getTime()
}

function parseDate(value) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

function monthKey(date) {
  return date.toISOString().slice(0, 7)
}

function annualKey(date) {
  return String(date.getFullYear())
}

function weekKey(date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7)
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function periodLabel(type, key) {
  if (type === 'daily') return key
  if (type === 'weekly') return `Semana ${key}`
  if (type === 'monthly') return key
  if (type === 'annual') return key
  return key
}

function toNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100
}

function simpleHash(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return `${REPORT_ENGINE_VERSION}-${Math.abs(hash).toString(36)}-${value.length.toString(36)}`
}
