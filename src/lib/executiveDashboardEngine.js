import { isActiveCreditNote, isActiveExpense, isActiveProduct, isActiveReceivable, isReportableInvoice, sanitizeCashRegisterWithSources } from './realDataGuards.js'

export function buildExecutiveDashboardModel({
  invoices = [],
  products = [],
  customers = [],
  receivables = [],
  expenses = [],
  creditNotes = [],
  payments = [],
  cashRegister = {},
  reportStats = {},
  inventoryReports = {},
} = {}) {
  const now = new Date()
  const companyId = cashRegister.companyId || ''
  const validInvoices = invoices.filter((invoice) => isReportableInvoice(invoice, companyId))
  const validCreditNotes = creditNotes.filter((note) => isActiveCreditNote(note, companyId))
  const validExpenses = expenses.filter((expense) => isActiveExpense(expense, companyId))
  const validProducts = products.filter((product) => isActiveProduct(product, companyId))
  const cleanCashRegister = sanitizeCashRegisterWithSources(cashRegister, { invoices: validInvoices, creditNotes: validCreditNotes, expenses: validExpenses, receivables, payments }, companyId)
  const todayKeyValue = dayKey(now)
  const monthKeyValue = monthKey(now)
  const weekStart = startOfWeek(now)

  const todayInvoices = validInvoices.filter((invoice) => dayKey(invoiceDate(invoice)) === todayKeyValue)
  const weekInvoices = validInvoices.filter((invoice) => inRange(invoiceDate(invoice), weekStart, now))
  const monthInvoices = validInvoices.filter((invoice) => monthKey(invoiceDate(invoice)) === monthKeyValue)
  const yearInvoices = validInvoices.filter((invoice) => annualKey(invoiceDate(invoice)) === annualKey(now))
  const todayCustomers = customers.filter((customer) => dayKey(customer.createdAt || customer.updatedAt) === todayKeyValue)
  const openReceivables = receivables.filter((item) => isActiveReceivable(item, validInvoices, companyId))
  const pendingPayables = validExpenses.filter((item) => ['pending', 'pendiente', 'open'].includes(String(item.status || '').toLowerCase()))
  const lowStock = inventoryReports?.lowStock?.length || inventoryReports?.outOfStock?.length
    ? [...(inventoryReports.lowStock || []), ...(inventoryReports.outOfStock || [])]
    : validProducts.filter((item) => item.category !== 'Servicios' && Number(item.stock || 0) <= Number(item.stockMin || 0))

  const todaySales = sumInvoices(todayInvoices, 'total')
  const todayTax = sumInvoices(todayInvoices, 'itbis')
  const weekSales = sumInvoices(weekInvoices, 'total')
  const monthSales = reportStats?.periods?.monthly?.find((period) => period.period === monthKeyValue)?.total ?? sumInvoices(monthInvoices, 'total')
  const monthTax = sumInvoices(monthInvoices, 'itbis')
  const monthProfit = sumInvoices(monthInvoices, 'profit')
  const monthCost = sumInvoices(monthInvoices, 'cost')

  const todayCashSales = sumNonCreditPayments(todayInvoices)
  const todayCreditSales = sumCreditPayments(todayInvoices)
  const weekCashSales = sumNonCreditPayments(weekInvoices)
  const weekCreditSales = sumCreditPayments(weekInvoices)
  const monthCashSales = sumNonCreditPayments(monthInvoices)
  const monthCreditSales = sumCreditPayments(monthInvoices)
  const yearCashSales = sumNonCreditPayments(yearInvoices)
  const yearCreditSales = sumCreditPayments(yearInvoices)
  const productsSoldToday = todayInvoices.reduce((sum, invoice) => sum + (invoice.items || []).reduce((inner, item) => inner + Number(item.quantity || 0), 0), 0)
  // Abonos from receivables payments (real money received on credit accounts, by payment date)
  const abonosToday = sumAbonosInPeriod(receivables, todayKeyValue, 'day')
  const abonosWeek = sumAbonosInPeriod(receivables, { start: weekStart, end: now }, 'range')
  const abonosMonth = sumAbonosInPeriod(receivables, monthKeyValue, 'month')
  const abonosYear = sumAbonosInPeriod(receivables, annualKey(now), 'year')

  const receivablesBalance = openReceivables.reduce((sum, item) => sum + Number(item.balance || 0), 0)
  const payablesBalance = pendingPayables.reduce((sum, item) => sum + Number(item.balance || item.amount || item.total || 0), 0)

  const dailySeries = buildDaySeries(validInvoices, 14)
  const monthlySeries = (reportStats?.periods?.monthly?.length ? reportStats.periods.monthly : buildMonthSeries(validInvoices, 8)).slice(0, 8).reverse()
  const topProducts = (reportStats?.topProducts?.length ? reportStats.topProducts : buildTopProducts(validInvoices)).slice(0, 8)
  const topCustomers = (reportStats?.frequentCustomers?.length ? reportStats.frequentCustomers : buildTopCustomers(validInvoices)).slice(0, 8)
  const paymentMethods = buildPaymentMethods(validInvoices, validCreditNotes)
  const cashSummary = summarizeCash(cleanCashRegister)
  const cashPeriods = summarizeCashPeriods(cleanCashRegister.movements || [], now)
  const recentActivity = buildRecentActivity(validInvoices, validCreditNotes, cleanCashRegister.movements)

  return {
    validInvoices,
    todayInvoices,
    weekInvoices,
    monthInvoices,
    yearInvoices,
    lowStock,
    openReceivables,
    pendingPayables,
    dailySeries,
    monthlySeries,
    topProducts,
    topCustomers,
    paymentMethods,
    cashSummary,
    recentActivity,
    alerts: buildAlerts({ lowStock, openReceivables, pendingPayables, cashRegister: cleanCashRegister }),
    totals: {
      todaySales,
      todayTax,
      todayCashSales,
      todayCreditSales,
      weekSales,
      weekCashSales,
      weekCreditSales,
      monthSales,
      monthCashSales,
      monthCreditSales,
      monthProfit,
      monthCost,
      monthTax,
      yearCashSales,
      yearCreditSales,
      abonosToday,
      abonosWeek,
      abonosMonth,
      abonosYear,
      invoicesToday: todayInvoices.length,
      newCustomersToday: todayCustomers.length,
      productsSoldToday,
      receivablesBalance,
      payablesBalance,
      cashToday: cashPeriods.today,
      cashWeek: cashPeriods.week,
      cashMonth: cashPeriods.month,
      creditNotesTotal: validCreditNotes.reduce((sum, note) => sum + Number(note.totals?.total || 0), 0),
    },
  }
}

export function invoiceDate(invoice) {
  return parseDate(invoice?.issuedAt || invoice?.createdAt || invoice?.issueDate || invoice?.updatedAt)
}

export function dayKey(value) {
  return parseDate(value).toISOString().slice(0, 10)
}

function monthKey(value) {
  return parseDate(value).toISOString().slice(0, 7)
}

function annualKey(value) {
  return parseDate(value).toISOString().slice(0, 4)
}

function sumInvoices(invoices, key) {
  return invoices.reduce((sum, invoice) => sum + Number(invoice.totals?.[key] || 0), 0)
}

function sumNonCreditPayments(invoices) {
  return invoices.reduce((total, inv) => {
    const payments = inv.payments?.length ? inv.payments : [{ method: inv.paymentMethod || 'Efectivo', amount: inv.totals?.total || 0 }]
    return total + payments.filter((p) => !isCreditMethod(p.method)).reduce((s, p) => s + Number(p.amount || 0), 0)
  }, 0)
}

function sumCreditPayments(invoices) {
  return invoices.reduce((total, inv) => {
    const payments = inv.payments?.length ? inv.payments : [{ method: inv.paymentMethod || 'Efectivo', amount: inv.totals?.total || 0 }]
    return total + payments.filter((p) => isCreditMethod(p.method)).reduce((s, p) => s + Number(p.amount || 0), 0)
  }, 0)
}

function sumAbonosInPeriod(receivables = [], periodKey, mode) {
  return receivables.reduce((total, recv) => {
    return total + (recv.payments || []).filter((p) => p.status !== 'deleted').reduce((s, p) => {
      const pDate = parseDate(p.date || p.createdAt)
      if (mode === 'day' && dayKey(pDate) === periodKey) return s + Number(p.amount || 0)
      if (mode === 'range' && inRange(pDate, periodKey.start, periodKey.end)) return s + Number(p.amount || 0)
      if (mode === 'month' && monthKey(pDate) === periodKey) return s + Number(p.amount || 0)
      if (mode === 'year' && annualKey(pDate) === periodKey) return s + Number(p.amount || 0)
      return s
    }, 0)
  }, 0)
}

function isCreditMethod(method = '') {
  return String(method || '').toLowerCase().includes('credito') || String(method || '').toLowerCase().includes('crédito')
}

function buildDaySeries(invoices, count) {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(new Date(), index - count + 1)
    const key = dayKey(date)
    const rows = invoices.filter((invoice) => dayKey(invoiceDate(invoice)) === key)
    return {
      period: key,
      label: key.slice(5),
      total: sumInvoices(rows, 'total'),
      profit: sumInvoices(rows, 'profit'),
      tax: sumInvoices(rows, 'itbis'),
      documents: rows.length,
    }
  })
}

function buildMonthSeries(invoices, count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date()
    date.setMonth(date.getMonth() - index)
    const key = monthKey(date)
    const rows = invoices.filter((invoice) => monthKey(invoiceDate(invoice)) === key)
    return {
      period: key,
      label: key,
      total: sumInvoices(rows, 'total'),
      netProfit: sumInvoices(rows, 'profit'),
      tax: sumInvoices(rows, 'itbis'),
      documents: rows.length,
    }
  })
}

function buildTopProducts(invoices) {
  const rows = new Map()
  invoices.forEach((invoice) => {
    ;(invoice.items || []).forEach((item) => {
      const key = item.productId || item.sku || item.name
      const current = rows.get(key) || { id: key, name: item.name || 'Producto', sku: item.sku || '', quantity: 0, revenue: 0, profit: 0 }
      const quantity = Number(item.quantity || 0)
      const subtotal = Number(item.net ?? Number(item.price || 0) * quantity)
      current.quantity += quantity
      current.revenue += subtotal + Number(item.tax || 0)
      current.profit += subtotal - Number(item.cost || 0) * quantity
      rows.set(key, current)
    })
  })
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue)
}

function buildTopCustomers(invoices) {
  const rows = new Map()
  invoices.forEach((invoice) => {
    const key = invoice.customerId || invoice.customerName || 'final'
    const current = rows.get(key) || { id: key, name: invoice.customerName || 'Consumidor final', documents: 0, netRevenue: 0, netProfit: 0 }
    current.documents += 1
    current.netRevenue += Number(invoice.totals?.total || 0)
    current.netProfit += Number(invoice.totals?.profit || 0)
    rows.set(key, current)
  })
  return [...rows.values()].sort((a, b) => b.netRevenue - a.netRevenue)
}

function buildPaymentMethods(invoices, creditNotes) {
  const rows = new Map()
  invoices.forEach((invoice) => {
    const payments = invoice.payments?.length ? invoice.payments : [{ method: invoice.paymentMethod || 'No especificado', amount: invoice.totals?.total || 0 }]
    payments.forEach((payment) => {
      const method = normalizeMethod(payment.method)
      const current = rows.get(method) || { method, count: 0, total: 0, refunds: 0, net: 0 }
      current.count += 1
      current.total += Number(payment.amount || 0)
      rows.set(method, current)
    })
  })
  creditNotes.forEach((note) => {
    const payments = note.payments?.length ? note.payments : [{ method: 'Nota credito', amount: note.totals?.total || 0 }]
    payments.forEach((payment) => {
      const method = normalizeMethod(payment.method)
      const current = rows.get(method) || { method, count: 0, total: 0, refunds: 0, net: 0 }
      current.refunds += Number(payment.amount || 0)
      rows.set(method, current)
    })
  })
  return [...rows.values()]
    .map((item) => ({ ...item, net: item.total - item.refunds }))
    .sort((a, b) => b.net - a.net)
}

function summarizeCash(cashRegister = {}) {
  const movements = cashRegister.movements || []
  const byMethod = new Map()
  movements.forEach((movement) => {
    const method = normalizeMethod(movement.method || movement.type)
    byMethod.set(method, Number(byMethod.get(method) || 0) + signedMovementAmount(movement))
  })
  const expected = roundMoney(movements.reduce((sum, movement) => sum + signedMovementAmount(movement), 0))
  const counted = Number(cashRegister.counted || 0)
  return {
    status: cashRegister.status || 'closed',
    openedAt: cashRegister.openedAt || null,
    closedAt: cashRegister.closedAt || null,
    openingAmount: Number(cashRegister.openingAmount || 0),
    expected,
    counted,
    difference: roundMoney(counted - expected),
    movements: movements.length,
    byMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
  }
}

function summarizeCashPeriods(movements = [], now = new Date()) {
  const todayKeyValue = dayKey(now)
  const monthKeyValue = monthKey(now)
  const weekStart = startOfWeek(now)
  return movements.reduce((summary, movement) => {
    const date = parseDate(movement.createdAt || movement.date)
    const signed = signedMovementAmount(movement)
    if (dayKey(date) === todayKeyValue) summary.today = roundMoney(summary.today + signed)
    if (inRange(date, weekStart, now)) summary.week = roundMoney(summary.week + signed)
    if (monthKey(date) === monthKeyValue) summary.month = roundMoney(summary.month + signed)
    return summary
  }, { today: 0, week: 0, month: 0 })
}

function signedMovementAmount(movement) {
  const amount = Number(movement.amount || 0)
  return ['expense', 'withdrawal', 'retiro', 'credit_note_refund', 'expense_adjustment', 'payable_payment', 'invoice_void_reversal', 'payment_void_reversal'].includes(String(movement.type || '').toLowerCase()) ? -amount : amount
}

function buildRecentActivity(invoices, creditNotes, movements = []) {
  return [
    ...invoices.slice(0, 12).map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: 'Factura',
      title: invoice.number || invoice.ncf || 'Factura',
      detail: invoice.customerName || 'Cliente',
      amount: Number(invoice.totals?.total || 0),
      date: invoiceDate(invoice).toISOString(),
    })),
    ...creditNotes.slice(0, 8).map((note) => ({
      id: `credit-${note.id}`,
      type: 'Nota credito',
      title: note.number || note.ncf || 'Nota credito',
      detail: note.reason || note.invoiceNumber || '',
      amount: -Number(note.totals?.total || 0),
      date: parseDate(note.createdAt || note.updatedAt).toISOString(),
    })),
    ...movements.slice(0, 12).map((movement) => ({
      id: `cash-${movement.id}`,
      type: 'Caja',
      title: movement.concept || movement.note || movement.type,
      detail: movement.method || movement.reference || '',
      amount: signedMovementAmount(movement),
      date: parseDate(movement.createdAt).toISOString(),
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12)
}

function buildAlerts({ lowStock, openReceivables, pendingPayables, cashRegister }) {
  const cashExpected = roundMoney((cashRegister.movements || []).reduce((sum, movement) => sum + signedMovementAmount(movement), 0))
  return [
    lowStock.length ? { id: 'stock', tone: 'red', title: 'Inventario critico', detail: `${lowStock.length} producto(s) requieren reposicion.` } : null,
    openReceivables.length ? { id: 'cxc', tone: 'amber', title: 'Cuentas por cobrar', detail: `${openReceivables.length} balance(s) abiertos.` } : null,
    pendingPayables.length ? { id: 'cxp', tone: 'blue', title: 'Cuentas por pagar', detail: `${pendingPayables.length} compromiso(s) pendientes.` } : null,
    cashRegister.status === 'open' ? { id: 'cash', tone: 'green', title: 'Caja abierta', detail: `Balance calculado: ${cashExpected.toFixed(2)}.` } : { id: 'cash', tone: 'red', title: 'Caja cerrada', detail: 'Abra caja antes de facturar si la empresa lo requiere.' },
  ].filter(Boolean)
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function normalizeMethod(method = '') {
  const value = String(method || 'No especificado').trim()
  const lower = value.toLowerCase()
  if (lower.includes('efectivo')) return 'Efectivo'
  if (lower.includes('tarjeta')) return 'Tarjeta'
  if (lower.includes('transfer')) return 'Transferencia'
  if (lower.includes('credito') || lower.includes('crédito')) return 'Credito'
  return value || 'No especificado'
}

function startOfWeek(value) {
  const date = parseDate(value)
  const day = date.getDay() || 7
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() - day + 1)
  return next
}

function addDays(value, days) {
  const date = parseDate(value)
  date.setDate(date.getDate() + days)
  return date
}

function inRange(value, start, end) {
  const time = parseDate(value).getTime()
  return time >= parseDate(start).getTime() && time <= parseDate(end).getTime()
}

function parseDate(value) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}
