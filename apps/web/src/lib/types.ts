export type Role = 'SUPER_ADMIN' | 'MANAGER' | 'FINANCE' | 'STAFF' | 'OWNER' | 'TENANT';
export type UnitStatus = 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';
export type RentStatus = 'PENDING' | 'PAID' | 'OVERDUE';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Me {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  company: string;
  permissions: string[];
  propertyIds: string[];
  tenant: { id: string; fullName: string } | null;
  owner: { id: string; name: string } | null;
}

export interface Ref {
  id: string;
  name: string;
}

export interface PropertyStats {
  units: Record<UnitStatus, number> & { total: number };
  dues: number;
  openTickets: number;
}

export interface Property {
  id: string;
  code: string;
  name: string;
  type: string;
  addressLine1: string;
  addressLine2: string | null;
  area: string | null;
  city: string;
  state: string;
  pincode: string;
  status: string;
  notes: string | null;
  ownerId: string;
  owner: { id: string; name: string; phone?: string; email?: string | null };
  stats: PropertyStats;
}

export interface GridUnit {
  id: string;
  unitNo: string;
  floor: number | null;
  block: string | null;
  unitType: string;
  areaSqft: number | null;
  expectedRent: number;
  securityDeposit: number;
  status: UnitStatus;
  vacantSince: string | null;
  vacantDays: number | null;
  lease: { id: string; endDate: string; monthlyRent: number; tenant: { id: string; fullName: string; phone: string } } | null;
  rentThisMonth: { status: RentStatus; amount: number } | null;
  overdue: boolean;
  expiringSoon: boolean;
  openTickets: number;
}

export interface Owner {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  properties: Ref[];
  hasLogin: boolean;
  collectedThisMonth: number;
}

export interface TenantRow {
  id: string;
  fullName: string;
  type: string;
  phone: string;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'PREVIOUS';
  portal: string | null;
  unit: { id: string; unitNo: string; property: Ref } | null;
  leaseEnd: string | null;
  monthlyRent: number | null;
  dues: number;
  overdue: number;
}

export interface Lease {
  id: string;
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'RENEWED' | 'TERMINATED';
  startDate: string;
  endDate: string;
  daysLeft: number;
  monthlyRent: number;
  securityDeposit: number;
  dueDay: number;
  noticeDays: number;
  escalationPct: number;
  renewalTerms: string | null;
  previousLeaseId: string | null;
  terminatedOn: string | null;
  terminationReason: string | null;
  unit: { id: string; unitNo: string; unitType: string; property: Ref };
  tenant: { id: string; fullName: string; phone: string; email: string | null };
}

export interface RentRow {
  leaseId: string;
  entryId: string | null;
  unit: { id: string; unitNo: string; floor: number | null; property: Ref };
  tenant: { id: string; fullName: string; phone: string };
  monthlyRent: number;
  amount: number;
  dueDate: string;
  status: RentStatus | 'NOT_ENTERED';
  paidOn: string | null;
  mode: string | null;
  reference: string | null;
  notes: string | null;
  enteredBy: string | null;
}

export interface Ticket {
  id: string;
  ticketNo: number;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  property: Ref;
  unit: { id: string; unitNo: string } | null;
  tenant: { id: string; fullName: string } | null;
  assignedTo: Ref | null;
  vendorName: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  slaDueAt: string;
  slaBreached: boolean;
  raisedBy: { id: string; name: string; role: Role };
  createdAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface TicketDetail extends Ticket {
  allowedNext: TicketStatus[];
  comments: { id: string; comment: string; oldStatus: TicketStatus | null; newStatus: TicketStatus | null; createdAt: string; by: string; role: Role }[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  status: 'UNREAD' | 'READ';
  createdAt: string;
}

export interface ReportData {
  key: string;
  title: string;
  question: string;
  tiles: { label: string; value: number | string; format?: 'money' | 'pct'; tone?: 'good' | 'warn' | 'bad' }[];
  columns: { key: string; label: string; align?: 'right'; format?: 'money' | 'pct' | 'date' }[];
  rows: Record<string, string | number | null>[];
  total?: Record<string, string | number | null>;
  bar?: string;
  note: string;
}
