import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const resources = {
  it: {
    translation: {
      nav: {
        employees: 'Dipendenti',
        departments: 'Dipartimenti',
        import: 'Importa CSV',
        audit: 'Audit',
      },
      actions: {
        createEmployee: 'Nuovo dipendente',
        createDepartment: 'Nuovo dipartimento',
        save: 'Salva',
        cancel: 'Annulla',
        delete: 'Elimina',
        export: 'Esporta CSV',
        preview: 'Anteprima',
        commit: 'Conferma righe selezionate',
        resetRetirement: 'Ricalcola pensionamento',
        signIn: 'Accedi con Auth0',
        signOut: 'Esci',
      },
      fields: {
        firstName: 'Nome',
        lastName: 'Cognome',
        department: 'Dipartimento',
        employeeNumber: 'Numero Matricola',
        birthDate: 'Data di nascita',
        hireDate: 'Data assunzione',
        terminationDate: 'Data cessazione',
        retirementDate: 'Data pensionamento',
        fte: 'FTE',
        usaCategory: 'Categoria USA',
        contractType: 'Tipo contratto',
        status: 'Stato',
        search: 'Cerca',
      },
      status: {
        ATTIVO: 'Attivo',
        CESSATO: 'Cessato',
        DA_ASSUMERE: 'Da Assumere',
      },
      contractType: {
        INDETERMINATO: 'Indeterminato',
        DETERMINATO: 'Determinato',
        CONTRATTO_USA: 'Contratto USA',
        COLLABORATORE: 'Collaboratore',
      },
      usaCategory: {
        EXEMPT: 'Exempt',
        NON_EXEMPT: 'Non Exempt',
        OTHER: 'Other',
      },
      copy: {
        productEyebrow: 'Registro master data',
        subtitle: 'Dipendenti, dipartimenti, importazioni e audit in un unico registro.',
        emptyEmployees: 'Nessun dipendente trovato.',
        emptyDepartments: 'Aggiungi i dipartimenti prima di importare il CSV.',
        importInstructions: 'Carica un CSV con intestazioni italiane o inglesi. I dipartimenti sconosciuti rimangono errori di riga.',
      },
    },
  },
  en: {
    translation: {
      nav: {
        employees: 'Employees',
        departments: 'Departments',
        import: 'CSV Import',
        audit: 'Audit',
      },
      actions: {
        createEmployee: 'New employee',
        createDepartment: 'New department',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        export: 'Export CSV',
        preview: 'Preview',
        commit: 'Commit selected rows',
        resetRetirement: 'Reset retirement date',
        signIn: 'Sign in with Auth0',
        signOut: 'Sign out',
      },
      fields: {
        firstName: 'First Name',
        lastName: 'Last Name',
        department: 'Department',
        employeeNumber: 'Employee Number',
        birthDate: 'Birth Date',
        hireDate: 'Hire Date',
        terminationDate: 'Termination Date',
        retirementDate: 'Retirement Date',
        fte: 'FTE',
        usaCategory: 'USA Category',
        contractType: 'Contract Type',
        status: 'Status',
        search: 'Search',
      },
      status: {
        ATTIVO: 'Active',
        CESSATO: 'Terminated',
        DA_ASSUMERE: 'To Be Hired',
      },
      contractType: {
        INDETERMINATO: 'Permanent',
        DETERMINATO: 'Fixed-term',
        CONTRATTO_USA: 'US Contract',
        COLLABORATORE: 'Collaborator',
      },
      usaCategory: {
        EXEMPT: 'Exempt',
        NON_EXEMPT: 'Non Exempt',
        OTHER: 'Other',
      },
      copy: {
        productEyebrow: 'Master-data register',
        subtitle: 'Employees, departments, imports, and audit history in one register.',
        emptyEmployees: 'No employees found.',
        emptyDepartments: 'Add departments before importing CSV data.',
        importInstructions: 'Upload a CSV with Italian or English headers. Unknown departments remain row errors.',
      },
    },
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'it',
  fallbackLng: 'it',
  interpolation: { escapeValue: false },
});

export default i18n;
