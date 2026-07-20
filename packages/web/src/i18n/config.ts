import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const resources = {
  it: {
    translation: {
      nav: {
        employees: 'Dipendenti',
        departments: 'Dipartimenti',
        import: 'Importa Excel',
        audit: 'Audit',
        settings: 'Impostazioni',
        primary: 'Navigazione principale',
      },
      actions: {
        createEmployee: 'Nuovo dipendente',
        createDepartment: 'Nuovo dipartimento',
        save: 'Salva',
        cancel: 'Annulla',
        close: 'Chiudi',
        edit: 'Modifica',
        delete: 'Elimina',
        export: 'Esporta Excel',
        preview: 'Anteprima',
        commit: 'Conferma righe selezionate',
        confirmRetirementDate: 'Data pensionamento confermata',
        signIn: 'Accedi con Auth0',
        signOut: 'Esci',
        addApprover: 'Aggiungi responsabile',
        remove: 'Rimuovi',
        retry: 'Riprova',
        language: 'Lingua',
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
        retirementDateOverridden: 'Data pensionamento confermata',
        datePlaceholder: 'gg/mm/aaaa',
        dateInvalid: 'Inserisci una data valida nel formato gg/mm/aaaa.',
        fte: 'FTE',
        usaCategory: 'Categoria USA',
        contractType: 'Tipo contratto',
        tfr: 'TFR',
        status: 'Stato',
        search: 'Cerca',
        canBeSubstituteResponsible: 'Può essere Sostituto-Responsabile',
        preApprovers: 'Responsabile pre-approvatore',
        responsabili: 'Responsabile',
        substituteResponsabili: 'Sostituto-Responsabile',
        weeklyTotal: 'Totale orario',
        approvalWorkflow: 'Workflow',
        actions: 'Azioni',
        select: 'Seleziona',
        updated: 'Aggiornato',
        row: 'Riga',
        action: 'Azione',
        errors: 'Errori',
      },
      weekday: {
        monday: 'LU',
        tuesday: 'MA',
        wednesday: 'ME',
        thursday: 'GIO',
        friday: 'VE',
      },
      sections: {
        identity: 'Anagrafica',
        employment: 'Rapporto di lavoro',
        classification: 'Inquadramento',
        approvalWorkflow: 'Workflow approvazione',
        weeklySchedule: 'Orario settimanale',
      },
      settings: {
        title: 'Età pensionabile',
        description:
          'Età anagrafica usata per calcolare la data di pensionamento prevista. Aggiornala quando cambia la legge italiana.',
        years: 'Anni',
        months: 'Mesi',
        neverUpdated: 'Mai modificato (valore predefinito)',
        lastUpdated: 'Ultimo aggiornamento',
        recalcNote:
          'Salvando, la data di pensionamento prevista verrà ricalcolata per tutti i dipendenti. Le date confermate non vengono toccate.',
        recalcDone: 'Aggiornato. Ricalcolati {{count}} dipendenti.',
        confirmRecalc:
          'Questo ricalcola la data di pensionamento prevista per tutti i dipendenti non confermati. Continuare?',
        corruptWarning:
          'Il valore salvato non è valido; viene mostrato il valore predefinito di legge. Salva per ripristinarlo.',
      },
      audit: {
        title: 'Cronologia modifiche',
        time: 'Ora',
        user: 'Utente',
        employee: 'Dipendente',
        entity: 'Entità',
        action: 'Azione',
        changes: 'Modifiche',
        oldValue: 'Valore precedente',
        newValue: 'Nuovo valore',
        noFieldChanges: 'Nessuna modifica ai campi',
      },
      auditAction: {
        CREATE: 'Creazione',
        UPDATE: 'Aggiornamento',
        DELETE: 'Eliminazione',
        IMPORT_COMMIT: 'Conferma importazione',
      },
      entityType: {
        EMPLOYEE: 'Dipendente',
        DEPARTMENT: 'Dipartimento',
        IMPORT_BATCH: 'Importazione',
        SETTING: 'Impostazione',
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
      tfr: {
        I_TATTI: 'I Tatti',
        FONDO_PENSIONE: 'Fondo Pensione',
      },
      copy: {
        productEyebrow: 'Anagrafica',
        subtitle: 'Lista dei dipendenti.',
        departmentsSubtitle: 'Gestisci i dipartimenti.',
        discardChanges: 'Ci sono modifiche non salvate. Vuoi chiudere senza salvare?',
        emptyEmployees: 'Nessun dipendente trovato.',
        emptyDepartments: 'Aggiungi i dipartimenti prima di importare il file Excel.',
        importInstructions: 'Carica un file Excel con intestazioni italiane o inglesi. I dipartimenti sconosciuti rimangono errori di riga.',
        signInError: 'Accesso non riuscito. Riprova ad accedere.',
        signInUnavailable: 'Impossibile avviare l’accesso. Controlla la connessione e riprova.',
        incompleteApproval: 'Incompleto',
        ineligibleApprover: 'Approvatore non più idoneo (rimuovere)',
        invalidWeeklySchedule: 'Inserisci l’orario nel formato 7,30.',
        weeklyScheduleTotal: 'Totale settimanale: {{total}}.',
        weeklyScheduleMismatch: 'Totale settimanale {{total}}; atteso da FTE {{expected}}.',
        error: 'Errore',
        loadError: 'Impossibile caricare i dati. Riprova.',
        confirmDeleteEmployee: 'Eliminare definitivamente questo dipendente? L’operazione non è reversibile.',
        confirmDeleteDepartment: 'Eliminare definitivamente questo dipartimento? L’operazione non è reversibile.',
        confirmUnconfirmRetirement:
          'La data di pensionamento confermata verrà ricalcolata dai dati anagrafici al salvataggio. Continuare?',
        excelFileRequired: 'Seleziona un file Excel.',
        previewRequired: 'Genera prima l’anteprima.',
        rowsCount: '{{count}} righe',
        rowsCommitted: '{{count}} righe importate',
        saved: 'Salvato',
        deleted: 'Eliminato',
      },
    },
  },
  en: {
    translation: {
      nav: {
        employees: 'Employees',
        departments: 'Departments',
        import: 'Excel Import',
        audit: 'Audit',
        settings: 'Settings',
        primary: 'Primary navigation',
      },
      actions: {
        createEmployee: 'New employee',
        createDepartment: 'New department',
        save: 'Save',
        cancel: 'Cancel',
        close: 'Close',
        edit: 'Edit',
        delete: 'Delete',
        export: 'Export Excel',
        preview: 'Preview',
        commit: 'Commit selected rows',
        confirmRetirementDate: 'Confirmed retirement date',
        signIn: 'Sign in with Auth0',
        signOut: 'Sign out',
        addApprover: 'Add approver',
        remove: 'Remove',
        retry: 'Retry',
        language: 'Language',
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
        retirementDateOverridden: 'Confirmed Retirement Date',
        datePlaceholder: 'dd/mm/yyyy',
        dateInvalid: 'Enter a valid date in dd/mm/yyyy format.',
        fte: 'FTE',
        usaCategory: 'USA Category',
        contractType: 'Contract Type',
        tfr: 'TFR',
        status: 'Status',
        search: 'Search',
        canBeSubstituteResponsible: 'Can be Substitute-Responsible',
        preApprovers: 'Pre-approver responsible',
        responsabili: 'Responsible',
        substituteResponsabili: 'Substitute-Responsible',
        weeklyTotal: 'Weekly Hours',
        approvalWorkflow: 'Workflow',
        actions: 'Actions',
        select: 'Select',
        updated: 'Updated',
        row: 'Row',
        action: 'Action',
        errors: 'Errors',
      },
      weekday: {
        monday: 'Mon',
        tuesday: 'Tue',
        wednesday: 'Wed',
        thursday: 'Thu',
        friday: 'Fri',
      },
      sections: {
        identity: 'Identity',
        employment: 'Employment',
        classification: 'Classification',
        approvalWorkflow: 'Approval Workflow',
        weeklySchedule: 'Weekly Schedule',
      },
      settings: {
        title: 'Retirement age',
        description:
          'The age used to calculate each employee’s projected retirement date. Update it when the Italian law changes.',
        years: 'Years',
        months: 'Months',
        neverUpdated: 'Never changed (default value)',
        lastUpdated: 'Last updated',
        recalcNote:
          'On save, the projected retirement date is recalculated for all employees. Confirmed dates are left untouched.',
        recalcDone: 'Updated. Recalculated {{count}} employees.',
        confirmRecalc:
          'This recalculates the projected retirement date for all non-confirmed employees. Continue?',
        corruptWarning:
          'The saved value is invalid; the statutory default is shown. Save to reset it.',
      },
      audit: {
        title: 'Change history',
        time: 'Time',
        user: 'User',
        employee: 'Employee',
        entity: 'Entity',
        action: 'Action',
        changes: 'Changes',
        oldValue: 'Old value',
        newValue: 'New value',
        noFieldChanges: 'No field changes',
      },
      auditAction: {
        CREATE: 'Created',
        UPDATE: 'Updated',
        DELETE: 'Deleted',
        IMPORT_COMMIT: 'Import committed',
      },
      entityType: {
        EMPLOYEE: 'Employee',
        DEPARTMENT: 'Department',
        IMPORT_BATCH: 'Import',
        SETTING: 'Setting',
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
      tfr: {
        I_TATTI: 'I Tatti',
        FONDO_PENSIONE: 'Fondo Pensione',
      },
      copy: {
        productEyebrow: '',
        subtitle: 'Employee list.',
        departmentsSubtitle: 'Manage departments.',
        discardChanges: 'You have unsaved changes. Close without saving?',
        emptyEmployees: 'No employees found.',
        emptyDepartments: 'Add departments before importing Excel data.',
        importInstructions: 'Upload an Excel file with Italian or English headers. Unknown departments remain row errors.',
        signInError: 'Sign-in failed. Please try signing in again.',
        signInUnavailable: 'Could not start sign-in. Check your connection and try again.',
        incompleteApproval: 'Incomplete',
        ineligibleApprover: 'Approver no longer eligible (remove)',
        invalidWeeklySchedule: 'Enter hours in 7,30 format.',
        weeklyScheduleTotal: 'Weekly total: {{total}}.',
        weeklyScheduleMismatch: 'Weekly total {{total}}; expected from FTE {{expected}}.',
        error: 'Error',
        loadError: 'Could not load data. Try again.',
        confirmDeleteEmployee: 'Permanently delete this employee? This cannot be undone.',
        confirmDeleteDepartment: 'Permanently delete this department? This cannot be undone.',
        confirmUnconfirmRetirement:
          'The confirmed retirement date will be recalculated from the birth date on save. Continue?',
        excelFileRequired: 'Select an Excel file.',
        previewRequired: 'Generate the preview first.',
        rowsCount: '{{count}} rows',
        rowsCommitted: '{{count}} rows committed',
        saved: 'Saved',
        deleted: 'Deleted',
      },
    },
  },
} as const;

const LANGUAGE_STORAGE_KEY = 'ed:lang';

function storedLanguage(): 'it' | 'en' {
  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (value === 'en' || value === 'it') return value;
  } catch {
    // localStorage can throw in private modes / sandboxed iframes.
  }
  return 'it';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage(),
  fallbackLng: 'it',
  interpolation: { escapeValue: false },
});

// Persist the choice so a reload keeps the selected language rather than
// snapping back to Italian.
i18n.on('languageChanged', (language) => {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore storage failures — persistence is best-effort.
  }
});

export default i18n;
