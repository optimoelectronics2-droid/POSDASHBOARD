export function assertOpenCashRegister(cashRegister, settings) {
  if (settings?.requireOpenRegister && cashRegister?.status !== 'open') {
    throw new Error('Caja cerrada: abre una caja antes de facturar.')
  }
}

export function assertUniqueSerials(serials, soldSerials = []) {
  const duplicates = serials.filter((serial, index) => serials.indexOf(serial) !== index)
  if (duplicates.length) throw new Error(`Serial duplicado en la venta: ${duplicates[0]}`)
  const soldSerialSet = new Set(soldSerials.map((entry) => typeof entry === 'string' ? entry : entry?.serial).filter(Boolean))
  const alreadySold = serials.find((serial) => soldSerialSet.has(serial))
  if (alreadySold) throw new Error(`El serial/IMEI ${alreadySold} ya fue vendido.`)
}

export function canVoidInvoice(invoice) {
  return invoice?.status !== 'voided'
}
