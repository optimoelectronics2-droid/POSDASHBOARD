import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { memo, useDeferredValue, useEffect, useId, useMemo, useState } from 'react'

export const DataTable = memo(function DataTable({
  data,
  columns,
  emptyText = 'No hay registros para mostrar.',
  pageSizeOptions = [10, 25, 50, 100],
  initialPageSize = 25,
  maxBodyHeight = '68vh',
  searchable = true,
  searchPlaceholder = 'Buscar en tabla...',
}) {
  const tableId = useId()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: '', direction: 'asc', column: null })
  const deferredQuery = useDeferredValue(query)
  const filteredData = useMemo(() => filterRows(data, deferredQuery), [data, deferredQuery])
  const sortedData = useMemo(() => sortRows(filteredData, sort), [filteredData, sort])
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const visibleRows = useMemo(() => sortedData.slice((safePage - 1) * pageSize, safePage * pageSize), [pageSize, safePage, sortedData])

  useEffect(() => {
    setPage(1)
  }, [deferredQuery, pageSize, sort, data])

  const table = useReactTable({ data: visibleRows, columns, getCoreRowModel: getCoreRowModel() })
  const hasToolbar = searchable || sortedData.length > pageSizeOptions[0]
  return (
    <div className="data-table-shell overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)', background: 'rgba(13,15,23,.5)', boxShadow: 'inset 0 1px rgba(255,255,255,.035)' }}>
      {hasToolbar ? (
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 text-xs font-bold" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.035)', color: 'rgba(255,255,255,.5)' }}>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span>{filteredData.length} de {data.length} registro(s) &middot; pagina {safePage} de {totalPages}</span>
            {searchable ? (
              <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 sm:max-w-sm" style={{ border: '1px solid var(--line)', background: 'var(--bg-input)' }}>
                <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
                <input id={`${tableId}-search`} name={`${tableId}-search`} value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-xs font-semibold outline-none placeholder:text-white/30" placeholder={searchPlaceholder} />
              </label>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <select id={`${tableId}-page-size`} name={`${tableId}-page-size`} value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="input-dark max-w-32 py-1.5 text-xs">
              {pageSizeOptions.map((option) => <option key={option} value={option}>{option} por pagina</option>)}
            </select>
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-md border px-2.5 py-1.5 transition hover:bg-white/[0.07]" style={{ borderColor: 'var(--line)' }}>Anterior</button>
            <span className="flex items-center gap-1">
              <span>Ir a</span>
              <input id={`${tableId}-page-jump`} name={`${tableId}-page-jump`} type="number" min={1} max={totalPages} value={safePage} onChange={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= totalPages) setPage(v) }} className="input-dark w-14 py-1 text-center text-xs" />
            </span>
            <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-md border px-2.5 py-1.5 transition hover:bg-white/[0.07]" style={{ borderColor: 'var(--line)' }}>Siguiente</button>
          </div>
        </div>
      ) : null}
      <div className="premium-scroll overflow-auto" style={{ maxHeight: maxBodyHeight }}>
        <table className="responsive-table min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 text-xs uppercase backdrop-blur-xl" style={{ background: 'rgba(21,24,40,.95)', color: 'rgba(255,255,255,.45)' }}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3.5 font-bold">
                    <button type="button" onClick={() => setSort(nextSort(sort, header.column.columnDef))} className="inline-flex items-center gap-1.5 text-left uppercase tracking-wide transition hover:text-white">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sort.key === sortKey(header.column.columnDef) ? (sort.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="transition hover:bg-white/[0.045]" style={{ background: 'rgba(16,17,25,.75)' }}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    data-label={cell.column.columnDef.mobileLabel || cell.column.columnDef.header || ''}
                    className="px-4 py-3.5"
                    style={{ color: 'rgba(255,255,255,.78)' }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            )) : (
              <tr style={{ background: 'rgba(16,17,25,.75)' }}>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm" style={{ color: 'rgba(255,255,255,.45)' }}>{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
})

function filterRows(rows, query) {
  if (!query) return rows
  const term = normalize(query)
  return rows.filter((row) => normalize(row).includes(term))
}

function sortRows(rows, sort) {
  if (!sort.key) return rows
  const direction = sort.direction === 'desc' ? -1 : 1
  return [...rows].sort((left, right) => {
    const fn = sort.column?.sortValueFn
    const leftVal = fn ? fn(left) : valueAt(left, sort.key)
    const rightVal = fn ? fn(right) : valueAt(right, sort.key)
    return compareValues(leftVal, rightVal) * direction
  })
}

function nextSort(current, column) {
  const key = sortKey(column)
  if (!key) return current
  if (current.key !== key) return { key, direction: 'asc', column }
  if (current.direction === 'asc') return { key, direction: 'desc', column }
  return { key: '', direction: 'asc', column: null }
}

function sortKey(column) {
  if (column.sortKey) return column.sortKey
  if (typeof column.accessorKey === 'string') return column.accessorKey
  if (typeof column.header === 'string') return column.header
  return ''
}

function valueAt(row, key) {
  if (!key) return ''
  if (Object.hasOwn(row, key)) return row[key]
  const normalizedKey = normalize(key).replace(/\s+/g, '')
  const match = Object.keys(row).find((field) => normalize(field).replace(/\s+/g, '') === normalizedKey)
  return match ? row[match] : ''
}

function compareValues(left, right) {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) return leftNumber - rightNumber
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' })
}

function normalize(value) {
  return JSON.stringify(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
