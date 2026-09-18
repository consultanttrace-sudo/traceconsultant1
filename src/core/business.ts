export type EntityStatus = 'active' | 'inactive' | 'archived';

export interface Client {
  id: string;
  name: string;
  status: EntityStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Company {
  id: string;
  clientId: string;
  name: string;
  status: EntityStatus;
}

export interface Brand {
  id: string;
  companyId: string;
  name: string;
  status: EntityStatus;
}

export interface Outlet {
  id: string;
  brandId: string;
  name: string;
  address?: string;
  city?: string;
  status: EntityStatus;
}

export interface BusinessHierarchy {
  clients: Client[];
  companies: Company[];
  brands: Brand[];
  outlets: Outlet[];
}

export interface BusinessTwinSummary {
  client: Client;
  companies: Company[];
  brands: Brand[];
  outlets: Outlet[];
  counts: { companies: number; brands: number; outlets: number };
}

export function validateHierarchy(data: BusinessHierarchy): string[] {
  const errors: string[] = [];
  const clientIds = new Set(data.clients.map(x => x.id));
  const companyIds = new Set(data.companies.map(x => x.id));
  const brandIds = new Set(data.brands.map(x => x.id));
  for (const company of data.companies) if (!clientIds.has(company.clientId)) errors.push(`Company ${company.id} references missing client ${company.clientId}`);
  for (const brand of data.brands) if (!companyIds.has(brand.companyId)) errors.push(`Brand ${brand.id} references missing company ${brand.companyId}`);
  for (const outlet of data.outlets) if (!brandIds.has(outlet.brandId)) errors.push(`Outlet ${outlet.id} references missing brand ${outlet.brandId}`);
  return errors;
}

export function buildBusinessTwin(data: BusinessHierarchy, clientId: string): BusinessTwinSummary | null {
  const client = data.clients.find(x => x.id === clientId);
  if (!client) return null;
  const companies = data.companies.filter(x => x.clientId === clientId);
  const companyIds = new Set(companies.map(x => x.id));
  const brands = data.brands.filter(x => companyIds.has(x.companyId));
  const brandIds = new Set(brands.map(x => x.id));
  const outlets = data.outlets.filter(x => brandIds.has(x.brandId));
  return { client, companies, brands, outlets, counts: { companies: companies.length, brands: brands.length, outlets: outlets.length } };
}
