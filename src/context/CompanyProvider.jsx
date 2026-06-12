import { createContext, useMemo } from 'react'
import { useERPStore } from '../store/useERPStore'

const CompanyContext = createContext(null)

export function CompanyProvider({ children }) {
  const companies = useERPStore((state) => state.companies)
  const activeCompanyId = useERPStore((state) => state.activeCompanyId)
  const company = useERPStore((state) => state.company)
  const switchCompany = useERPStore((state) => state.switchCompany)
  const createCompany = useERPStore((state) => state.createCompany)
  const value = useMemo(() => ({
    companies,
    activeCompanyId,
    company,
    switchCompany,
    createCompany,
  }), [activeCompanyId, companies, company, createCompany, switchCompany])

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}
