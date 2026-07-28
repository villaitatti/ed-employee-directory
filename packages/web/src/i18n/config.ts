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
        workEmail: 'Email di lavoro',
        preferredLanguage: 'Lingua preferita',
        department: 'Dipartimento',
        employeeNumber: 'Numero Matricola',
        birthDate: 'Data di nascita',
        hireDate: 'Data assunzione',
        terminationDate: 'Data cessazione',
        retirementDate: 'Data pensionamento',
        retirementDateOverridden: 'Data pensionamento confermata',
        datePlaceholder: 'Seleziona una data',
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
        recalcDone: 'Età pensionabile aggiornata',
        recalcDoneBody_one:
          'Ricalcolata la data di pensionamento prevista di 1 dipendente. Le date confermate non sono state toccate.',
        recalcDoneBody_other:
          'Ricalcolate le date di pensionamento previste di {{count}} dipendenti. Le date confermate non sono state toccate.',
        recalcDoneNone:
          'Nessuna data da ricalcolare: nessun dipendente ha una data di pensionamento prevista.',
        confirmRecalc:
          'Salvando {{years}} anni e {{months}} mesi, la data di pensionamento prevista viene ricalcolata per tutti i dipendenti che non hanno una data confermata. Continuare?',
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
      language: {
        IT: 'Italiano',
        EN: 'Inglese',
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
        responsabileHint:
          'Obbligatorio per un dipendente Attivo: indica chi approva le sue richieste di ferie.',
        substituteRequired: 'Seleziona almeno un Sostituto-Responsabile per questo dipendente.',
        substituteHint:
          'Obbligatorio per un dipendente Attivo: indica chi approva quando il Responsabile è assente.',
        weeklySectionHint: 'Ore giornaliere in formato sessantesimi, per esempio 7,30 per sette ore e trenta minuti.',
        requiredFields: 'Campi obbligatori',
        noOptionsFound: 'Nessun risultato',
        confirmationTitle: 'Conferma richiesta',
        departmentsSubtitle: 'Gestisci i dipartimenti.',
        discardChanges:
          'Ci sono modifiche non salvate in questa scheda. Chiudendo ora andranno perse. Vuoi chiudere senza salvare?',
        emptyEmployees: 'Nessun dipendente corrisponde ai filtri. Svuota la ricerca o crea un nuovo dipendente.',
        emptyDepartments: 'Aggiungi i dipartimenti prima di importare il file Excel.',
        importInstructions: 'Carica un file Excel con intestazioni italiane o inglesi. I dipartimenti sconosciuti rimangono errori di riga.',
        signInError: 'Accesso non riuscito. Riprova ad accedere.',
        signInUnavailable: 'Impossibile avviare l’accesso. Controlla la connessione e riprova.',
        incompleteApproval: 'Incompleto',
        ineligibleApprover:
          'Non più idoneo a questo ruolo: rimuovilo, oppure riabilitalo nella sua scheda (Ruoli e abilitazioni)',
        invalidWeeklySchedule: 'Inserisci l’orario nel formato 7,30.',
        weeklyScheduleTotal: 'Totale settimanale: {{total}}.',
        weeklyScheduleMismatch: 'Totale settimanale {{total}}; atteso da FTE {{expected}}.',
        loadErrorHint: 'Premi Riprova. Se l’errore si ripete, ricarica la pagina.',
        confirmDeleteEmployee:
          'Stai per eliminare definitivamente {{name}} (matricola {{employeeNumber}}) e il suo storico di approvazioni. L’operazione non è reversibile.',
        confirmDeleteDepartment:
          'Stai per eliminare definitivamente il dipartimento {{name}}. L’operazione non è reversibile e riesce solo se nessun dipendente è assegnato a questo dipartimento.',
        confirmUnconfirmRetirement:
          'Al salvataggio la data confermata ({{date}}) sarà sostituita da quella calcolata dalla data di nascita. Continuare?',
        workEmailHint:
          'Indirizzo di lavoro ufficiale, univoco per dipendente. Usato dal portale Ferie per le notifiche.',
        preferredLanguageHint:
          'Lingua con cui il portale Ferie si presenta al dipendente. Il dipendente può cambiarla dal portale.',
        hireDateHint: 'Obbligatoria quando lo stato è Attivo.',
        terminationDateHint:
          'Obbligatoria quando lo stato è Cessato; non può precedere la data assunzione.',
        retirementDateHint:
          'Calcolata automaticamente dalla data di nascita in base all’età pensionabile ({{years}} anni e {{months}} mesi). Conferma solo se la data deve essere diversa.',
        fteHint:
          '1 = tempo pieno; un valore tra 0 e 1 (es. 0,5) = part-time. Sono accettati sia 0,5 sia 0.5; massimo 3 decimali.',
        excelFileLabel: 'File Excel da importare',
        excelFilePlaceholder: 'Scegli un file .xlsx…',
        excelFileRequired: 'Nessun file selezionato',
        excelFileRequiredBody: 'Scegli un file Excel (.xlsx) prima di generare l’anteprima.',
        previewRequired: 'Anteprima mancante',
        previewRequiredBody: 'Genera prima l’anteprima, poi conferma le righe da importare.',
        rowsCount: '{{count}} righe',
        importCommitted: 'Importazione completata',
        importCommittedBody_one: '1 riga importata. Trovi il dipendente nella lista Dipendenti.',
        importCommittedBody_other:
          '{{count}} righe importate. Trovi i dipendenti nella lista Dipendenti.',
        importCommittedNone:
          'Nessuna riga importata: nessuna delle righe selezionate era importabile. Genera di nuovo l’anteprima.',
        employeeCreated: 'Dipendente creato',
        employeeCreatedBody: '{{name}} è stato aggiunto alla lista dei dipendenti.',
        employeeUpdated: 'Modifiche salvate',
        employeeUpdatedBody: 'La scheda di {{name}} è aggiornata.',
        employeeDeleted: 'Dipendente eliminato',
        employeeDeletedBody: '{{name}} non è più nella lista dei dipendenti.',
        departmentCreated: 'Dipartimento creato',
        departmentCreatedBody: '{{name}} è ora selezionabile nelle schede dei dipendenti.',
        departmentUpdated: 'Modifiche salvate',
        departmentUpdatedBody: 'Il dipartimento si chiama ora {{name}}.',
        departmentDeleted: 'Dipartimento eliminato',
        departmentDeletedBody: '{{name}} non è più selezionabile nelle schede dei dipendenti.',
        exportStarted: 'Esportazione avviata',
        exportStartedBody:
          'Il file Excel contiene i dipendenti attualmente filtrati. Controlla i download del browser.',
      },
      validation: {
        summaryTitle: 'Controlla i campi evidenziati',
        summaryBody_one: 'Manca o non è valido 1 campo: {{fields}}.',
        summaryBody_other: 'Mancano o non sono validi {{count}} campi: {{fields}}.',
        summaryHeading_one: 'C’è 1 campo da correggere prima di salvare:',
        summaryHeading_other: 'Ci sono {{count}} campi da correggere prima di salvare:',
        jumpToField: 'Vai al campo {{field}}',
        sectionErrors_one: '1 da correggere',
        sectionErrors_other: '{{count}} da correggere',
        required: 'Campo obbligatorio.',
        requiredSelect: 'Seleziona un’opzione.',
        range: 'Inserisci un numero intero tra {{min}} e {{max}}.',
        requiredDate: 'Seleziona una data.',
        invalidDate: 'Data non valida. Usa il formato gg/mm/aaaa.',
        employeeNumber: 'Inserisci un numero intero maggiore di zero.',
        workEmail: 'Inserisci un indirizzo valido, per esempio nome.cognome@itatti.harvard.edu.',
        fte: 'Inserisci un valore tra 0 e 1, con al massimo 3 decimali — per esempio 0,5.',
        retirementDateConfirmed:
          'Hai attivato "Data pensionamento confermata": inserisci la data oppure disattiva l’interruttore.',
        weeklyHours: 'Usa il formato H,MM — per esempio 7,30 per sette ore e trenta minuti.',
        HIRE_DATE_REQUIRED: 'Obbligatoria quando lo stato è Attivo.',
        TERMINATION_DATE_REQUIRED: 'Obbligatoria quando lo stato è Cessato.',
        TERMINATION_BEFORE_HIRE: 'Non può precedere la data di assunzione.',
      },
      errors: {
        fieldRejected: 'Il server ha rifiutato questo valore. Correggilo e salva di nuovo.',
        // Prepended when the failure leaves it unclear whether anything was
        // written — the first thing an operator wants to know after a red toast.
        nothingSaved: 'Nessuna modifica è stata salvata.',
        NETWORK: {
          title: 'Nessuna connessione al server',
          body: 'Controlla la connessione a internet e riprova.',
        },
        UNKNOWN: {
          title: 'Operazione non riuscita',
          body: 'Riprova. Se l’errore si ripete, segnalalo all’assistenza IT.',
        },
        SERVER: {
          body: 'Riprova tra qualche istante. Se l’errore si ripete, segnalalo all’assistenza IT.',
        },
        UNAUTHORIZED: {
          title: 'Sessione scaduta',
          body: 'Esci e accedi di nuovo per continuare. Le modifiche non salvate andranno perse.',
        },
        VALIDATION_ERROR: {
          title: 'Alcuni campi non sono validi',
          body: 'Controlla i campi evidenziati nel modulo e salva di nuovo.',
          bodyWithFields: 'Controlla e correggi: {{fields}}.',
        },
        DUPLICATE_VALUE: {
          title: 'Valore già presente',
          body: 'Un altro record usa già questi dati. Cambia i valori duplicati e riprova.',
          employeeNumber: {
            title: 'Numero Matricola già in uso',
            body: 'Un altro dipendente ha già questo Numero Matricola. Inseriscine uno diverso.',
            field: 'Già assegnato a un altro dipendente.',
          },
          workEmail: {
            title: 'Email di lavoro già in uso',
            body: 'Un altro dipendente ha già questo indirizzo. Inseriscine uno diverso.',
            field: 'Già assegnata a un altro dipendente.',
          },
          departmentName: {
            title: 'Dipartimento già esistente',
            body: 'Esiste già un dipartimento con questo nome. Scegline uno diverso.',
            field: 'Nome già usato da un altro dipartimento.',
          },
        },
        NOT_FOUND: {
          title: 'Record non trovato',
          body: 'È stato eliminato o modificato da un altro utente. Ricarica la pagina per vedere i dati aggiornati.',
        },
        FOREIGN_KEY_CONSTRAINT: {
          title: 'Operazione bloccata da un collegamento',
          body: 'Altri dati fanno riferimento a questo record. Rimuovi i collegamenti e riprova.',
        },
        INTERNAL_SERVER_ERROR: {
          title: 'Errore del server',
          body: 'Riprova tra qualche istante. Se l’errore si ripete, segnalalo all’assistenza IT.',
        },
        FILE_TOO_LARGE: {
          title: 'File troppo grande (massimo {{maxMb}} MB)',
          body: 'Dividi il file in più parti e importale una alla volta.',
        },
        UPLOAD_ERROR: {
          title: 'Caricamento del file non riuscito',
          body: 'Riprova. Se l’errore si ripete, riesporta il file da Excel in formato .xlsx.',
        },
        EMPLOYEE_FILE_REQUIRED: {
          title: 'File non valido',
          body: 'Carica un file Excel in formato .xlsx.',
        },
        EMPTY_WORKBOOK: {
          title: 'Il file Excel non contiene fogli',
          body: 'Apri il file, verifica che ci sia un foglio con i dati e riesportalo.',
        },
        MISSING_HEADERS: {
          title: 'Intestazioni mancanti nel file Excel',
          body: 'La prima riga deve contenere i nomi delle colonne, in italiano o in inglese.',
        },
        DEPARTMENT_NOT_FOUND: {
          title: 'Dipartimento non trovato',
          body: 'È stato eliminato da un altro utente. Ricarica la pagina.',
        },
        DEPARTMENT_IN_USE: {
          title: 'Il dipartimento ha dei dipendenti',
          body: 'Sposta i dipendenti in un altro dipartimento, poi elimina questo.',
        },
        EMPLOYEE_NOT_FOUND: {
          title: 'Dipendente non trovato',
          body: 'La scheda è stata eliminata da un altro utente. Ricarica la pagina.',
        },
        IMPORT_TOO_MANY_ROWS: {
          title: 'Il file contiene troppe righe ({{rows}})',
          body: 'Il massimo è {{max}} righe per file. Dividi il file e importalo in più parti.',
        },
        IMPORT_ROWS_NOT_COMMITTABLE: {
          title: 'Righe non importabili',
          body: 'Puoi confermare solo le righe senza errori e non ancora importate. Genera di nuovo l’anteprima.',
        },
        DUPLICATE_IMPORT_EMPLOYEE_NUMBER: {
          title: 'Numero Matricola {{employeeNumber}} duplicato',
          body: 'Compare nelle righe {{rowNumbers}}. Deseleziona i duplicati oppure correggi il file e rigenera l’anteprima.',
        },
        IMPORT_ACTION_DRIFT: {
          title: 'Il dipendente {{employeeNumber}} è cambiato dopo l’anteprima',
          body: 'Nel frattempo qualcun altro lo ha creato o eliminato. Nessuna riga è stata importata: genera di nuovo l’anteprima.',
        },
        IMPORT_COMMIT_FAILED: {
          title: 'Importazione non riuscita',
          body: 'Nessuna riga è stata importata. Genera di nuovo l’anteprima e riprova.',
        },
        IMPORT_ROW_ALREADY_COMMITTED: {
          title: 'Righe già importate',
          body: 'Alcune righe selezionate erano già state importate. Genera di nuovo l’anteprima per vedere lo stato attuale.',
        },
        IMPORT_APPROVER_NOT_FOUND: {
          title: 'Responsabile {{employeeNumber}} non trovato',
          body: 'Questo Numero Matricola non esiste in ED e non è tra le righe selezionate. Importa prima quel dipendente oppure correggi il file.',
        },
        APPROVER_NOT_FOUND: {
          title: 'Uno dei responsabili selezionati non esiste più',
          body: 'È stato eliminato da un altro utente. Ricarica la pagina e riseleziona i responsabili.',
        },
        SELF_APPROVER_NOT_ALLOWED: {
          title: 'Un dipendente non può approvare sé stesso',
          body: 'Rimuovilo dai campi Responsabile, Sostituto-Responsabile e Pre-approvatore della sua stessa scheda.',
        },
        APPROVER_MUST_BE_ACTIVE: {
          title: '{{approverName}} non è un dipendente attivo',
          body: 'Solo i dipendenti Attivi possono essere responsabili. Scegli un’altra persona oppure riporta {{approverName}} allo stato Attivo.',
        },
        APPROVER_NOT_RESPONSABILE_ELIGIBLE: {
          title: '{{approverName}} non è abilitato come Responsabile',
          body: 'Apri la scheda di {{approverName}} e attiva "Può essere Responsabile" nella sezione Ruoli e abilitazioni, oppure scegli un’altra persona.',
        },
        APPROVER_NOT_SUBSTITUTE_ELIGIBLE: {
          title: '{{approverName}} non è abilitato come Sostituto-Responsabile',
          body: 'Apri la scheda di {{approverName}} e attiva "Può essere Sostituto-Responsabile" nella sezione Ruoli e abilitazioni, oppure scegli un’altra persona.',
        },
        APPROVER_IN_USE: {
          title: 'Questo dipendente è responsabile di altre persone',
          body: 'Compare nel workflow dei Numeri Matricola {{employeeNumbers}}. Rimuovi quegli incarichi, poi riprova.',
        },
        RESPONSABILE_APPROVER_IN_USE: {
          title: 'Questo dipendente è Responsabile di altre persone',
          body: 'È Responsabile dei Numeri Matricola {{employeeNumbers}}. Rimuovi quegli incarichi prima di disattivare "Può essere Responsabile".',
        },
        SUBSTITUTE_APPROVER_IN_USE: {
          title: 'Questo dipendente è Sostituto-Responsabile di altre persone',
          body: 'È Sostituto-Responsabile dei Numeri Matricola {{employeeNumbers}}. Rimuovi quegli incarichi prima di disattivare "Può essere Sostituto-Responsabile".',
        },
        RESPONSABILE_REQUIRED: {
          title: 'Manca il Responsabile',
          body: 'Un dipendente Attivo deve avere almeno un Responsabile. Selezionalo nella sezione "Responsabili del dipendente".',
        },
        SOSTITUTO_RESPONSABILE_REQUIRED: {
          title: 'Manca il Sostituto-Responsabile',
          body: 'Un dipendente Attivo deve avere almeno un Sostituto-Responsabile. Selezionalo nella sezione "Responsabili del dipendente".',
        },
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
        workEmail: 'Work Email',
        preferredLanguage: 'Preferred Language',
        department: 'Department',
        employeeNumber: 'Employee Number',
        birthDate: 'Birth Date',
        hireDate: 'Hire Date',
        terminationDate: 'Termination Date',
        retirementDate: 'Retirement Date',
        retirementDateOverridden: 'Confirmed Retirement Date',
        datePlaceholder: 'Select a date',
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
        recalcDone: 'Retirement age updated',
        recalcDoneBody_one:
          'Recalculated the projected retirement date for 1 employee. Confirmed dates were left untouched.',
        recalcDoneBody_other:
          'Recalculated the projected retirement date for {{count}} employees. Confirmed dates were left untouched.',
        recalcDoneNone: 'Nothing to recalculate: no employee has a projected retirement date.',
        confirmRecalc:
          'Saving {{years}} years and {{months}} months recalculates the projected retirement date for every employee without a confirmed date. Continue?',
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
      language: {
        IT: 'Italian',
        EN: 'English',
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
        responsabileHint:
          'Required for an Active employee: set who approves their time-off requests.',
        substituteRequired: 'Select at least one Substitute-Responsible for this employee.',
        substituteHint:
          'Required for an Active employee: set who approves while the Responsible is away.',
        weeklySectionHint: 'Daily hours in payroll sixtieths format, for example 7,30 for seven hours and thirty minutes.',
        requiredFields: 'Required fields',
        noOptionsFound: 'No results found',
        confirmationTitle: 'Confirmation required',
        departmentsSubtitle: 'Manage departments.',
        discardChanges:
          'This record has unsaved changes. Closing now discards them. Close without saving?',
        emptyEmployees: 'No employee matches the filters. Clear the search or create a new employee.',
        emptyDepartments: 'Add departments before importing Excel data.',
        importInstructions: 'Upload an Excel file with Italian or English headers. Unknown departments remain row errors.',
        signInError: 'Sign-in failed. Please try signing in again.',
        signInUnavailable: 'Could not start sign-in. Check your connection and try again.',
        incompleteApproval: 'Incomplete',
        ineligibleApprover:
          'No longer eligible for this role: remove them, or re-enable the role on their own record (Roles & Capabilities)',
        invalidWeeklySchedule: 'Enter hours in 7,30 format.',
        weeklyScheduleTotal: 'Weekly total: {{total}}.',
        weeklyScheduleMismatch: 'Weekly total {{total}}; expected from FTE {{expected}}.',
        loadErrorHint: 'Press Retry. If the error keeps happening, reload the page.',
        confirmDeleteEmployee:
          'You are about to permanently delete {{name}} (employee number {{employeeNumber}}) and their approval history. This cannot be undone.',
        confirmDeleteDepartment:
          'You are about to permanently delete the {{name}} department. This cannot be undone, and only works if no employee is assigned to it.',
        confirmUnconfirmRetirement:
          'On save, the confirmed date ({{date}}) will be replaced by the one calculated from the birth date. Continue?',
        workEmailHint:
          'Official work address, unique per employee. The Ferie portal uses it for notifications.',
        preferredLanguageHint:
          'Language the Ferie portal greets this employee in. The employee can change it from the portal.',
        hireDateHint: 'Required when status is Active.',
        terminationDateHint: 'Required when status is Terminated; it cannot be before the hire date.',
        retirementDateHint:
          'Calculated automatically from the birth date using the retirement age ({{years}} years and {{months}} months). Confirm only if the date must differ.',
        fteHint:
          '1 = full time; a value between 0 and 1 (e.g. 0.5) = part time. Both 0,5 and 0.5 are accepted; up to 3 decimals.',
        excelFileLabel: 'Excel file to import',
        excelFilePlaceholder: 'Choose an .xlsx file…',
        excelFileRequired: 'No file selected',
        excelFileRequiredBody: 'Choose an Excel (.xlsx) file before generating the preview.',
        previewRequired: 'Preview missing',
        previewRequiredBody: 'Generate the preview first, then commit the rows you want to import.',
        rowsCount: '{{count}} rows',
        importCommitted: 'Import complete',
        importCommittedBody_one: '1 row imported. You will find the employee in the Employees list.',
        importCommittedBody_other:
          '{{count}} rows imported. You will find the employees in the Employees list.',
        importCommittedNone:
          'No rows imported: none of the selected rows could be committed. Generate the preview again.',
        employeeCreated: 'Employee created',
        employeeCreatedBody: '{{name}} has been added to the employee list.',
        employeeUpdated: 'Changes saved',
        employeeUpdatedBody: '{{name}}’s record is up to date.',
        employeeDeleted: 'Employee deleted',
        employeeDeletedBody: '{{name}} is no longer in the employee list.',
        departmentCreated: 'Department created',
        departmentCreatedBody: '{{name}} can now be selected on employee records.',
        departmentUpdated: 'Changes saved',
        departmentUpdatedBody: 'The department is now called {{name}}.',
        departmentDeleted: 'Department deleted',
        departmentDeletedBody: '{{name}} can no longer be selected on employee records.',
        exportStarted: 'Export started',
        exportStartedBody:
          'The Excel file contains the currently filtered employees. Check your browser downloads.',
      },
      validation: {
        summaryTitle: 'Check the highlighted fields',
        summaryBody_one: '1 field is missing or invalid: {{fields}}.',
        summaryBody_other: '{{count}} fields are missing or invalid: {{fields}}.',
        summaryHeading_one: 'There is 1 field to fix before saving:',
        summaryHeading_other: 'There are {{count}} fields to fix before saving:',
        jumpToField: 'Go to the {{field}} field',
        sectionErrors_one: '1 to fix',
        sectionErrors_other: '{{count}} to fix',
        required: 'This field is required.',
        requiredSelect: 'Select an option.',
        range: 'Enter a whole number between {{min}} and {{max}}.',
        requiredDate: 'Select a date.',
        invalidDate: 'Invalid date. Use the dd/mm/yyyy format.',
        employeeNumber: 'Enter a whole number greater than zero.',
        workEmail: 'Enter a valid address, for example name.surname@itatti.harvard.edu.',
        fte: 'Enter a value between 0 and 1, with at most 3 decimals — for example 0.5.',
        retirementDateConfirmed:
          'You switched "Confirmed retirement date" on: enter the date, or switch it back off.',
        weeklyHours: 'Use the H,MM format — for example 7,30 for seven hours and thirty minutes.',
        HIRE_DATE_REQUIRED: 'Required when the status is Active.',
        TERMINATION_DATE_REQUIRED: 'Required when the status is Terminated.',
        TERMINATION_BEFORE_HIRE: 'It cannot be before the hire date.',
      },
      errors: {
        fieldRejected: 'The server rejected this value. Correct it and save again.',
        nothingSaved: 'No changes were saved.',
        NETWORK: {
          title: 'No connection to the server',
          body: 'Check your internet connection and try again.',
        },
        UNKNOWN: {
          title: 'The operation failed',
          body: 'Try again. If the error keeps happening, report it to IT support.',
        },
        SERVER: {
          body: 'Try again in a moment. If the error keeps happening, report it to IT support.',
        },
        UNAUTHORIZED: {
          title: 'Session expired',
          body: 'Sign out and sign in again to continue. Unsaved changes will be lost.',
        },
        VALIDATION_ERROR: {
          title: 'Some fields are not valid',
          body: 'Check the highlighted fields in the form and save again.',
          bodyWithFields: 'Check and correct: {{fields}}.',
        },
        DUPLICATE_VALUE: {
          title: 'Value already exists',
          body: 'Another record already uses this data. Change the duplicated values and try again.',
          employeeNumber: {
            title: 'Employee Number already in use',
            body: 'Another employee already has this Employee Number. Enter a different one.',
            field: 'Already assigned to another employee.',
          },
          workEmail: {
            title: 'Work Email already in use',
            body: 'Another employee already has this address. Enter a different one.',
            field: 'Already assigned to another employee.',
          },
          departmentName: {
            title: 'Department already exists',
            body: 'A department with this name already exists. Choose a different one.',
            field: 'Name already used by another department.',
          },
        },
        NOT_FOUND: {
          title: 'Record not found',
          body: 'It was deleted or changed by another user. Reload the page to see the current data.',
        },
        FOREIGN_KEY_CONSTRAINT: {
          title: 'A linked record blocks this operation',
          body: 'Other data references this record. Remove those links and try again.',
        },
        INTERNAL_SERVER_ERROR: {
          title: 'Server error',
          body: 'Try again in a moment. If the error keeps happening, report it to IT support.',
        },
        FILE_TOO_LARGE: {
          title: 'File too large (max {{maxMb}} MB)',
          body: 'Split the file into smaller parts and import them one at a time.',
        },
        UPLOAD_ERROR: {
          title: 'The file upload failed',
          body: 'Try again. If the error keeps happening, re-export the file from Excel as .xlsx.',
        },
        EMPLOYEE_FILE_REQUIRED: {
          title: 'Invalid file',
          body: 'Upload an Excel file in .xlsx format.',
        },
        EMPTY_WORKBOOK: {
          title: 'The Excel file has no worksheet',
          body: 'Open the file, make sure it has a sheet with the data, and export it again.',
        },
        MISSING_HEADERS: {
          title: 'Missing headers in the Excel file',
          body: 'The first row must contain the column names, in Italian or in English.',
        },
        DEPARTMENT_NOT_FOUND: {
          title: 'Department not found',
          body: 'It was deleted by another user. Reload the page.',
        },
        DEPARTMENT_IN_USE: {
          title: 'The department still has employees',
          body: 'Move the employees to another department, then delete this one.',
        },
        EMPLOYEE_NOT_FOUND: {
          title: 'Employee not found',
          body: 'The record was deleted by another user. Reload the page.',
        },
        IMPORT_TOO_MANY_ROWS: {
          title: 'The file has too many rows ({{rows}})',
          body: 'The maximum is {{max}} rows per file. Split the file and import it in several parts.',
        },
        IMPORT_ROWS_NOT_COMMITTABLE: {
          title: 'Rows cannot be imported',
          body: 'Only error-free rows that have not been imported yet can be committed. Generate the preview again.',
        },
        DUPLICATE_IMPORT_EMPLOYEE_NUMBER: {
          title: 'Employee Number {{employeeNumber}} is duplicated',
          body: 'It appears in rows {{rowNumbers}}. Deselect the duplicates, or fix the file and generate the preview again.',
        },
        IMPORT_ACTION_DRIFT: {
          title: 'Employee {{employeeNumber}} changed after the preview',
          body: 'Someone created or deleted them in the meantime. No row was imported: generate the preview again.',
        },
        IMPORT_COMMIT_FAILED: {
          title: 'The import failed',
          body: 'No row was imported. Generate the preview again and retry.',
        },
        IMPORT_ROW_ALREADY_COMMITTED: {
          title: 'Rows already imported',
          body: 'Some of the selected rows had already been imported. Generate the preview again to see the current state.',
        },
        IMPORT_APPROVER_NOT_FOUND: {
          title: 'Approver {{employeeNumber}} not found',
          body: 'This Employee Number is neither in ED nor among the selected rows. Import that employee first, or fix the file.',
        },
        APPROVER_NOT_FOUND: {
          title: 'One of the selected approvers no longer exists',
          body: 'They were deleted by another user. Reload the page and pick the approvers again.',
        },
        SELF_APPROVER_NOT_ALLOWED: {
          title: 'An employee cannot approve themselves',
          body: 'Remove them from the Responsible, Substitute-Responsible, and Pre-approver fields on their own record.',
        },
        APPROVER_MUST_BE_ACTIVE: {
          title: '{{approverName}} is not an active employee',
          body: 'Only Active employees can be approvers. Pick someone else, or set {{approverName}} back to Active.',
        },
        APPROVER_NOT_RESPONSABILE_ELIGIBLE: {
          title: '{{approverName}} is not enabled as Responsible',
          body: 'Open {{approverName}}’s record and switch on "Can be Responsible" under Roles & Capabilities, or pick someone else.',
        },
        APPROVER_NOT_SUBSTITUTE_ELIGIBLE: {
          title: '{{approverName}} is not enabled as Substitute-Responsible',
          body: 'Open {{approverName}}’s record and switch on "Can be Substitute-Responsible" under Roles & Capabilities, or pick someone else.',
        },
        APPROVER_IN_USE: {
          title: 'This employee is an approver for other people',
          body: 'They appear in the workflow of employee numbers {{employeeNumbers}}. Remove those assignments, then try again.',
        },
        RESPONSABILE_APPROVER_IN_USE: {
          title: 'This employee is Responsible for other people',
          body: 'They are Responsible for employee numbers {{employeeNumbers}}. Remove those assignments before switching "Can be Responsible" off.',
        },
        SUBSTITUTE_APPROVER_IN_USE: {
          title: 'This employee is Substitute-Responsible for other people',
          body: 'They are Substitute-Responsible for employee numbers {{employeeNumbers}}. Remove those assignments before switching "Can be Substitute-Responsible" off.',
        },
        RESPONSABILE_REQUIRED: {
          title: 'Responsible is missing',
          body: 'An Active employee needs at least one Responsible. Pick one under "Employee’s Line Managers".',
        },
        SOSTITUTO_RESPONSABILE_REQUIRED: {
          title: 'Substitute-Responsible is missing',
          body: 'An Active employee needs at least one Substitute-Responsible. Pick one under "Employee’s Line Managers".',
        },
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
