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
        confirm: 'Conferma',
        discard: 'Scarta modifiche',
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
        datePlaceholder: 'Seleziona una data',
        dateInvalid: 'Seleziona una data valida.',
        fte: 'FTE',
        usaCategory: 'Categoria USA',
        contractType: 'Tipo contratto',
        tfr: 'TFR',
        status: 'Stato',
        search: 'Cerca',
        canBeResponsible: 'Può essere Responsabile',
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
        approvalWorkflow: 'Responsabili del dipendente',
        roleCapabilities: 'Ruoli e abilitazioni',
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
        employeeRecord: 'Scheda dipendente',
        employeeFormSubtitle: 'Dati anagrafici, rapporto di lavoro e workflow in un’unica scheda.',
        identitySectionHint: 'Informazioni personali e assegnazione al dipartimento.',
        employmentSectionHint: 'Date, stato e impegno contrattuale.',
        classificationSectionHint: 'Inquadramento amministrativo e trattamento di fine rapporto.',
        approvalSectionHint:
          'Chi approva e gestisce questo dipendente. Nei menu Responsabile e Sostituto-Responsabile compaiono solo le persone abilitate a quel ruolo nella loro scheda (sezione Ruoli e abilitazioni).',
        roleCapabilitiesSectionHint:
          'Definisce se QUESTO dipendente può essere scelto come Responsabile o Sostituto-Responsabile di altri. Attiva un ruolo per farlo comparire nei relativi menu delle altre schede.',
        responsabileRequired: 'Seleziona almeno un Responsabile per questo dipendente.',
        weeklySectionHint: 'Ore giornaliere in formato sessantesimi, per esempio 7,30 per sette ore e trenta minuti.',
        requiredFields: 'Campi obbligatori',
        noOptionsFound: 'Nessun risultato',
        confirmationTitle: 'Conferma richiesta',
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
        hireDateHint: 'Obbligatoria quando lo stato è Attivo.',
        terminationDateHint:
          'Obbligatoria quando lo stato è Cessato; non può precedere la data assunzione.',
        retirementDateHint:
          'Calcolata automaticamente dalla data di nascita in base all’età pensionabile ({{years}} anni e {{months}} mesi). Conferma solo se la data deve essere diversa.',
        fteHint:
          '1 = tempo pieno; un valore tra 0 e 1 (es. 0,5) = part-time. Sono accettati sia 0,5 sia 0.5; massimo 3 decimali.',
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
        confirm: 'Confirm',
        discard: 'Discard changes',
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
        datePlaceholder: 'Select a date',
        dateInvalid: 'Select a valid date.',
        fte: 'FTE',
        usaCategory: 'USA Category',
        contractType: 'Contract Type',
        tfr: 'TFR',
        status: 'Status',
        search: 'Search',
        canBeResponsible: 'Can be Responsible',
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
        approvalWorkflow: 'Employee’s Line Managers',
        roleCapabilities: 'Roles & Capabilities',
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
        employeeRecord: 'Employee record',
        employeeFormSubtitle: 'Identity, employment details, and approval workflow in one place.',
        identitySectionHint: 'Personal information and department assignment.',
        employmentSectionHint: 'Dates, status, and contractual workload.',
        classificationSectionHint: 'Administrative classification and severance treatment.',
        approvalSectionHint:
          'Who approves and manages this employee. The Responsible and Substitute-Responsible menus only list people enabled for that role on their own card (Roles & Capabilities section).',
        roleCapabilitiesSectionHint:
          'Controls whether THIS employee can be chosen as a Responsible or Substitute-Responsible for others. Enable a role to make this person appear in those menus on other cards.',
        responsabileRequired: 'Select at least one Responsible for this employee.',
        weeklySectionHint: 'Daily hours in payroll sixtieths format, for example 7,30 for seven hours and thirty minutes.',
        requiredFields: 'Required fields',
        noOptionsFound: 'No results found',
        confirmationTitle: 'Confirmation required',
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
        hireDateHint: 'Required when status is Active.',
        terminationDateHint: 'Required when status is Terminated; it cannot be before the hire date.',
        retirementDateHint:
          'Calculated automatically from the birth date using the retirement age ({{years}} years and {{months}} months). Confirm only if the date must differ.',
        fteHint:
          '1 = full time; a value between 0 and 1 (e.g. 0.5) = part time. Both 0,5 and 0.5 are accepted; up to 3 decimals.',
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
