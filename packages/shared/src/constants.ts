export const USA_CATEGORIES = ['EXEMPT', 'NON_EXEMPT', 'OTHER'] as const;
export type UsaCategory = (typeof USA_CATEGORIES)[number];

export const CONTRACT_TYPES = [
  'INDETERMINATO',
  'DETERMINATO',
  'CONTRATTO_USA',
  'COLLABORATORE',
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const EMPLOYEE_STATUSES = ['ATTIVO', 'CESSATO', 'DA_ASSUMERE'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'IMPORT_COMMIT'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const ENTITY_TYPES = ['EMPLOYEE', 'DEPARTMENT', 'IMPORT_BATCH'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const IMPORT_ROW_STATUSES = ['PENDING', 'COMMITTED', 'SKIPPED', 'ERROR'] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export const IMPORT_PROPOSED_ACTIONS = ['CREATE', 'UPDATE'] as const;
export type ImportProposedAction = (typeof IMPORT_PROPOSED_ACTIONS)[number];

export const labels = {
  it: {
    usaCategory: {
      EXEMPT: 'Exempt',
      NON_EXEMPT: 'Non Exempt',
      OTHER: 'Other',
    },
    contractType: {
      INDETERMINATO: 'Indeterminato',
      DETERMINATO: 'Determinato',
      CONTRATTO_USA: 'Contratto USA',
      COLLABORATORE: 'Collaboratore',
    },
    status: {
      ATTIVO: 'Attivo',
      CESSATO: 'Cessato',
      DA_ASSUMERE: 'Da Assumere',
    },
  },
  en: {
    usaCategory: {
      EXEMPT: 'Exempt',
      NON_EXEMPT: 'Non Exempt',
      OTHER: 'Other',
    },
    contractType: {
      INDETERMINATO: 'Permanent',
      DETERMINATO: 'Fixed-term',
      CONTRATTO_USA: 'US Contract',
      COLLABORATORE: 'Collaborator',
    },
    status: {
      ATTIVO: 'Active',
      CESSATO: 'Terminated',
      DA_ASSUMERE: 'To Be Hired',
    },
  },
} as const;
