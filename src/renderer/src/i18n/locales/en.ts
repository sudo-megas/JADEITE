/** English — complete for every shell string, per the Realisation II acceptance. */

export const en = {
  common: {
    brand: 'JADEITE',
    continue: 'Continue',
    back: 'Go back',
    working: 'Working…',
    close: 'Close',
    delete: 'Remove',
    actions: 'Actions'
  },

  firstRun: {
    title: 'Create your master password',
    lede: 'This password is the only thing that opens your vault. The vault is stored encrypted on this machine, and nothing legible ever leaves it.',
    password: 'Master password',
    passwordConfirm: 'Confirm master password',
    submit: 'Create the vault'
  },

  recovery: {
    title: 'Your recovery key',
    lede: 'Write this on paper and keep it somewhere safe.',
    warningTitle: 'This key will never be shown again.',
    warningBody:
      'If you forget your password and lose this key, the vault cannot be opened, permanently. There is no third copy, no back door and no support channel.',
    ack: 'I have written the recovery key down and stored it safely.'
  },

  lock: {
    title: 'Vault locked',
    ledeIdle: 'Locked after a period of inactivity.',
    ledeReset: 'The password was changed. Sign in with the new one.',
    password: 'Master password',
    submit: 'Unlock',
    forgot: 'I forgot my password'
  },

  reset: {
    title: 'Reset with a recovery key',
    lede: 'Using your current recovery key retires it permanently and issues a fresh one in its place.',
    keyLabel: 'Recovery key',
    newPassword: 'New master password',
    newPasswordConfirm: 'Confirm new master password',
    submit: 'Reset the password'
  },

  nav: {
    section1: 'Income & Expenses',
    section2: 'Payments',
    section3: 'Valuables',
    section4: 'Calculation Zone',
    overview: 'Overview',
    altinEgrisi: 'Altın Eğrisi',
    backup: 'Backup',
    settings: 'Settings',
    about: 'About',
    lock: 'Lock'
  },

  sections: {
    comingIn: 'Arrives with Realisation {{roman}}.',
    section1: 'Year workspaces, income and expense columns.',
    section2: 'The forward-looking payment tracker, bank columns and limits.',
    section3: 'The valuables ledger, holdings and current prices.',
    section4: 'A freeform scratchpad: total, average, median.',
    overview: 'Every year at a glance, with grand totals.',
    altinEgrisi: 'Charts derived from the valuables ledger.'
  },

  section1: {
    month: 'Month',
    groupIncome: 'INCOME',
    groupExpense: 'EXPENSES',
    groupTotal: 'TOTAL',
    incomeSubtotal: 'INCOME SUBTOTAL',
    netTotal: 'NET TOTAL',
    yearTotal: 'Year total',
    selection: 'Selection · {{count}} months',
    noRowsMatch: 'No month matches the filter.',

    years: 'Years',
    year: 'Year',
    addYear: 'Add a year',
    addYearLede:
      'A new year inherits the columns of the year before it. No amount is copied.',
    createYear: 'Create the year',
    noColumns: 'This year has no columns yet. Add the first one below.',

    yearMenu: '{{year}} year menu',
    yearMenuTitle: '{{year}} — year settings',
    accent: 'Year colour',
    accentChoice: 'Colour {{index}}',
    accentUseSequence: 'Use the palette sequence',
    deleteYear: 'Delete year',
    deleteYearDetail:
      'The year {{year}}, with its {{columns}} columns and {{count}} entries, will be permanently deleted.',
    deleteYearWarningTitle: 'This cannot be undone.',
    deleteYearWarningBody:
      'Everything belonging to this year goes. Other years and the Payments section are unaffected.',
    deleteYearConfirm: 'Delete the year permanently',
    lastYearKept: 'The last remaining year cannot be deleted.',

    newColumnName: 'Column name',
    group: 'Group',
    valueType: 'Value type',
    typePlain: 'Number',
    addColumn: 'Add column',
    rename: 'Rename',
    moveLeft: 'Left',
    moveRight: 'Right',
    columnMenu: '{{name}} column menu',
    columnMenuTitle: 'Column settings',
    sortState: {
      none: 'not sorted',
      ascending: 'sorted ascending',
      descending: 'sorted descending'
    },
    sortHint: 'Click to sort',
    clearSort: 'Clear sorting',
    clearFilters: 'Clear filters',

    filter: 'Filter',
    filterThreshold: 'Filter value',
    filterMode: {
      all: 'All',
      filled: 'Filled',
      empty: 'Empty',
      refund: 'Refunds only',
      atLeast: 'At least',
      atMost: 'At most'
    },

    refund: 'Refund',
    note: 'Note',
    cellDetails: '{{cell}} — details',
    cellDetailsTitle: 'Cell details',
    detailsNeedAmount: 'Enter an amount first: a note and a refund mark belong to an amount.',

    deleteColumn: 'Delete column',
    deleteColumnDetail:
      'The {{name}} column and its {{count}} entries ({{total}}) in this year will be permanently deleted.',
    deleteColumnWarningTitle: 'This cannot be undone.',
    deleteColumnWarningBody:
      'Earlier years are unaffected — each year owns its own column set.',
    deleteColumnConfirm: 'Delete permanently',

    parse: {
      NOT_A_NUMBER: 'That is not a number.',
      NEGATIVE: 'Amounts are entered positive; use the Refund mark for money returned.',
      TOO_MANY_DECIMALS: 'At most two decimal places.',
      BAD_GROUPING: 'Check the thousands separator — English format: 1,234.56',
      TOO_LARGE: 'That number is too large.'
    },

    errors: {
      LOCKED: 'The vault is locked.',
      NO_SUCH_YEAR: 'That year was not found.',
      YEAR_EXISTS: 'That year already exists.',
      LAST_YEAR: 'The last remaining year cannot be deleted.',
      NO_SUCH_CATEGORY: 'That column was not found.',
      DUPLICATE_NAME: 'A column with that name already exists.',
      INVALID_NAME: 'That column name is not valid.',
      INVALID_AMOUNT: 'That amount is not valid.',
      INVALID_YEAR: 'That year is not valid.',
      INTERNAL: 'Something unexpected went wrong.'
    }
  },

  section2: {
    month: 'MONTH',
    groupBanks: 'BANK / CARD',
    groupCounters: 'COUNTER COLUMNS',
    totalDebt: 'TOTAL DEBT',
    creditLimit: 'CREDIT LIMIT',
    debt: 'DEBT',
    remainingLimit: 'REMAINING LIMIT',
    totalRemainingLimit: 'TOTAL REMAINING LIMIT',
    creditLimitOf: '{{name}} credit limit',
    counterPartyOf: '{{name}} — person',

    noBanks: 'No columns yet. Add a bank or card below.',

    newBankName: 'Bank / card name',
    bankKind: 'Column type',
    bankKindBank: 'Bank / card',
    bankKindCounter: 'Counter column',
    newLimit: 'Credit limit',
    newParty: 'Person (e.g. mother)',
    addColumn: 'Add column',

    rename: 'Rename',
    order: 'Order',
    moveLeft: 'Left',
    moveRight: 'Right',
    bankMenu: '{{name}} column menu',
    bankMenuTitle: '{{name}} — column settings',

    deleteColumn: 'Delete column',
    deleteColumnDetail: '{{name}} holds {{count}} entries ({{total}}).',
    deleteColumnWarningTitle: 'Delete {{name}}?',
    deleteColumnWarningBody: 'The column and its cells go; the other columns are untouched.',
    deleteColumnConfirm: 'Delete column',

    parse: {
      NOT_A_NUMBER: 'That is not a number.',
      NEGATIVE: 'Amounts are entered positive; use a counter column for money coming back.',
      TOO_MANY_DECIMALS: 'At most two decimal places.',
      BAD_GROUPING: 'Check the thousands separator — English format: 1,234.56',
      TOO_LARGE: 'That number is too large.'
    },

    errors: {
      LOCKED: 'The vault is locked.',
      NO_SUCH_BANK: 'No such column.',
      DUPLICATE_NAME: 'A column with that name already exists.',
      INVALID_NAME: 'That column name is not valid.',
      INVALID_AMOUNT: 'That amount is not valid.',
      INVALID_LIMIT: 'That credit limit is not valid.',
      INVALID_MONTH: 'That month is not valid.',
      INTERNAL: 'Something unexpected went wrong.'
    }
  },

  section3: {
    subsections: 'Sub-sections',
    views: {
      ledger: 'Ledger',
      holdings: 'Holdings',
      prices: 'Current Prices'
    },

    no: 'No',
    date: 'Date',
    datePlaceholder: 'DD/MM/YYYY',
    provisional: 'Date under review',
    type: 'Type',
    direction: 'Direction',
    acquire: 'Acquire',
    dispose: 'Dispose',
    denomination: 'Size',
    count: 'Count',
    unattributed: '{{amount}} loose',
    unattributedHint:
      'A disposal cut into a piece. What is left is no longer a whole piece, so it is shown apart from them.',
    quantity: 'Quantity',
    totalQuantity: 'Total Quantity',
    unitPrice: 'Unit Price',
    transactionTotal: 'Transaction Total',
    source: 'Obtained where / gone where',
    person: 'Person',
    note: 'Note',
    unassigned: 'Ortak',

    perGram: '/ g',
    perPiece: '/ each',
    perUnit: '/ unit',

    addRow: 'Add',
    deleteRow: 'Delete row {{seq}}',
    deleteRowConfirm: 'Delete',

    ledgerTotals: '{{count}} entries',
    provisionalCount: '{{count}} row(s) awaiting a date check',
    acquiredValue: 'Acquired {{value}}',
    disposedValue: 'Disposed {{value}}',

    types: {
      gram: 'Gram',
      ceyrek: 'Çeyrek',
      yarim: 'Yarım',
      tam: 'Tam',
      ata: 'Ata (Cumhuriyet)',
      iki_bucuk: '2.5 (İki Buçuklu)',
      besli: '5 (Beşli)',
      usd: 'Dollar',
      eur: 'Euro',
      gumus: 'Silver'
    },

    costBasis: 'Cost basis',
    marketValue: 'Market value',
    liveValue: 'Live value',
    liveValueHint:
      'Computed at the provider’s figure. Market value is computed from the price you typed, and this column never stands in for it.',
    liveSource: 'via {{provider}}',
    unrealised: 'Unrealised G/L',
    grandTotal: 'GRAND TOTAL',
    personTotal: '{{name}} total',
    noHoldings: 'Nothing held yet. Enter an acquisition in the ledger.',
    unpriced: 'No price typed',
    oversoldHint: 'More has been disposed of than the ledger records acquiring.',
    discrepancyTitle: 'The ledger disagrees with itself.',
    discrepancyBody:
      '{{count}} holding(s) dispose of more than was ever recorded as acquired. An acquisition row is most likely still missing; entering it clears this on its own.',
    missingPrices: 'Types with no price typed are left out of market value: {{types}}',

    pricesLede:
      'The price you type is the authority. The live provider sits beside that figure and never over it, and the row says so when the two part company.',
    manualPrice: 'Your price',
    updatedAt: 'Updated',
    livePrice: 'Live price',
    noProvider: 'No provider yet',
    notQuoted: 'Not quoted',
    clearPrice: 'Clear',
    priceOf: 'Price of {{type}}',

    refreshLive: 'Refresh live prices',
    checkingLive: 'Asking the provider…',
    lastChecked: 'Last checked {{when}}',
    neverChecked: 'The provider has not been asked yet.',
    refreshTooSoon:
      'Just checked — the provider can be asked again in {{seconds}} seconds. The prices on screen are the last ones received.',
    lastGood: 'Last good figure held from {{when}}',
    livePartial:
      'The provider answered, but only {{quoted}} of {{expected}} prices could be read. The ones that arrived are current; the rest keep the manual figures on screen.',
    lastPartial: 'The last answer was incomplete: some prices could not be read.',

    drift: {
      header: 'Drift',
      none: 'No live figure',
      unpriced: 'No price typed',
      aligned: 'In line',
      alignedTitle: 'The live figure is within {{threshold}} of the price you typed.',
      drifting: 'Drifting',
      above: 'The live figure is {{percent}} above the price you typed.',
      below: 'The live figure is {{percent}} below the price you typed.'
    },

    liveErrors: {
      OFFLINE: 'No connection; the provider could not be reached.',
      TIMEOUT: 'The provider did not answer in time.',
      MALFORMED: 'The provider’s answer could not be read.',
      STALE_RANGE: 'The provider stopped short of the dates asked for; nothing was stored.',
      NO_DATA: 'The provider returned no data for that range.',
      UNKNOWN: 'The live prices could not be fetched.'
    },

    persons: 'People',
    personName: 'Person’s name',
    newPersonName: 'New person’s name',
    addPerson: 'Add person',
    builtinHint: '— where rows of unknown ownership live',
    chooseColour: 'Choose a colour for {{name}}',
    colourSlot: 'Colour {{slot}}',
    moveUp: 'Move {{name}} up',
    moveDown: 'Move {{name}} down',
    deletePersonTitle: 'Remove {{name}}?',
    deletePersonDetail:
      '{{count}} ledger row(s) will move to Ortak. Not one is deleted; only their owner changes.',
    deletePersonEmpty: 'No ledger row belongs to this person.',
    deletePersonConfirm: 'Remove',

    parse: {
      NOT_A_NUMBER: 'That is not a number.',
      NEGATIVE: 'Quantities are entered positive; choose Dispose for something going out.',
      TOO_MANY_DECIMALS: 'That is more decimal places than this type takes.',
      BAD_GROUPING: 'Check the thousands separator — English format: 1,234.56',
      TOO_LARGE: 'That number is too large.',
      ZERO: 'A quantity cannot be zero.',
      REQUIRED: 'This field cannot be left empty.',
      INVALID_DATE: 'The date must read DD/MM/YYYY and be a real day.'
    },

    errors: {
      LOCKED: 'The vault is locked.',
      NO_SUCH_TRANSACTION: 'That row was not found.',
      NO_SUCH_PERSON: 'That person was not found.',
      NO_SUCH_TYPE: 'That type was not found.',
      BUILTIN_PERSON: 'Ortak cannot be renamed or removed.',
      DUPLICATE_NAME: 'Someone of that name already exists.',
      INVALID_NAME: 'That name is not valid.',
      INVALID_DATE: 'That date is not valid.',
      INVALID_QUANTITY: 'That quantity is not valid.',
      INVALID_PRICE: 'That price is not valid.',
      INTERNAL: 'Something unexpected went wrong.'
    }
  },

  section4: {
    total: 'TOTAL',
    average: 'AVERAGE',
    median: 'MEDIAN',
    counted: '{{count}} value(s)',
    none: '—',
    box: 'Box {{number}}',
    clearAll: 'Clear all',
    clearConfirm: 'Clear',

    parse: {
      NOT_A_NUMBER: 'That is not a number.',
      NEGATIVE: 'Values are entered positive.',
      TOO_MANY_DECIMALS: 'At most two decimal places.',
      BAD_GROUPING: 'Check the thousands separator — English format: 1,234.56',
      TOO_LARGE: 'That number is too large.'
    },

    errors: {
      LOCKED: 'The vault is locked.',
      INVALID_SLOT: 'That box number is not valid.',
      INVALID_VALUE: 'That value is not valid.',
      INTERNAL: 'Something unexpected went wrong.'
    }
  },

  altin: {
    logScale: 'Logarithmic scale',
    filterType: 'Type',
    filterPerson: 'Person',
    allTypes: 'All',
    allPersons: 'Everyone',
    spektrum: 'Spektrum — unit price',
    frekans: 'Frekans — quantity acquired',
    marketValue: 'Value — market value of what is held',
    empty: 'These charts derive from the Valuables ledger. Enter an acquisition there and they draw themselves.',
    crushed:
      'These values span orders of magnitude, so the linear scale crushes the small ones. The logarithmic scale makes both readable.',
    marketStaysLinear:
      'The value chart stays linear: a holding can be zero or negative, and neither belongs on a logarithmic scale.',
    provisional: '{{count}} row(s) still carry an unconfirmed date, so the curve may mislead there.'
  },

  overview: {
    lede: 'Everything on one screen. Not one figure here is computed here — each comes from the section that owns it, and clicking it takes you there.',
    loading: 'Reading the years…',
    empty: 'No years yet. Open one from Income & Expenses.',
    partial: 'These years could not be read and joined no total: {{years}}',
    partialSections: 'Some sections could not be read and joined no total.',

    years: 'Years',
    yearOther: 'Also holds {{types}} columns',
    yearNoTry: 'No TRY column this year',
    yearEmpty: 'No columns this year yet',
    yearUnreadable: 'This year could not be read',
    openYear: 'Open {{year}}',

    tiles: {
      debt: 'Current debt',
      debtNow: 'the total across the twelve months',
      remaining: 'Remaining limit',
      market: 'Valuables market value',
      unrealised: 'Unrealised G/L'
    },

    notes: {
      noBanks: 'No card columns this year',
      noHoldings: 'Nothing held',
      noPricedHoldings: 'No holding has a price typed',
      unpriced: '{{count}} types unpriced — left out of market value',
      gridUnreadable: 'The Payments grid could not be read'
    },

    charts: {
      netByMonth: 'Net by month',
      netByMonthLede: 'Only years that have a TRY column.',
      yoy: 'Year over year',
      value: 'Valuables value over time',
      valueLede: 'Computed at the prices the ledger’s own rows recorded, and ending at the last transaction — which is why it differs from the tile above, computed at today’s price.',
      excluded: 'Years left out: {{years}}'
    }
  },

  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    palette: 'Colour palette',
    language: 'Language',
    languageTurkish: 'Turkish',
    languageEnglish: 'English',
    security: 'Security',
    autoLock: 'Auto-lock',
    autoLockUnit: 'minutes',
    prices: 'Live prices',
    priceRefreshHint:
      'Refreshing prices by hand is the primary way. Switched on, the app asks the provider on its own at this interval while the vault is open; switched off, it connects to nothing.',
    priceRefreshOff: 'Off',
    priceRefreshEvery: 'Every {{minutes}} min',
    paletteModeLight: 'light',
    paletteModeDark: 'dark',
    performance: 'Performance',
    noSwitchYet: 'No year switched yet. Switch to a year and the measurement appears here.',
    switchDisplay: 'Display',
    switchFrames: 'frames',
    switchMedian: 'Median frame',
    switchWorst: 'Worst frame',
    switchDropped: 'Dropped frames',
    formattingPreview: 'Formatting sample'
  },

  backup: {
    title: 'Backup',
    lede: 'A backup is one sealed file. Nothing in it is readable without JADEITE and a credential.',
    lastBackup: 'Last backup',
    never: 'Never',
    count: 'Backups taken',
    overdueTitle: 'A backup is due.',
    overdue: 'More time has passed than the interval you chose.',
    create: 'Take a backup',
    saved: 'Backup written.',

    reminder: 'Remind me',
    reminderOff: 'Off',
    reminderDays: 'Every {{days}} days',

    restoreTitle: 'Restore from a backup',
    restore: 'Choose a backup file',
    restoreEntry: 'Restore from a backup',
    restoreLede:
      'This replaces everything on this machine with what is in the file. Choose one to see what it holds.',
    back: 'Go back',

    candidateCreatedAt: 'Taken on',
    candidateApp: 'JADEITE version that wrote it',
    candidateOrigin: 'Origin',
    originSame: 'This vault',
    originOther: 'Another vault',
    candidateGeneration: 'Recovery key number',
    candidateSections: 'Last edited',
    sectionUnknown: 'Not recorded',

    confirmWarningTitle: 'Everything here will be replaced.',
    confirmWarning:
      'The vault on this machine is copied aside first, beside the database, so nothing is destroyed — but this application will stop using it.',

    credentialLabel: 'Password or recovery key from when this backup was taken',
    credentialHint: 'Either one opens it. Using the recovery key here does not use it up.',
    noCredentialNeeded:
      'This is a backup of the vault that is open, so no credential is needed — whatever password was in force when it was taken.',
    confirm: 'Replace this vault',
    cancel: 'Never mind',

    promptTitle: 'Take a backup now',
    promptLede: 'Your credentials have changed, so every backup you already hold is out of date.',
    promptWarningTitle: 'Older backups need the old credentials.',
    promptWarning:
      'A backup carries the password and recovery key that were current when it was taken. The recovery key you just replaced no longer exists.',
    promptSkip: 'Not now',

    truthTitle: 'Credentials & backup',
    truthLede: 'What opens what, and when nothing does.',
    truthColCase: 'Situation',
    truthColOutcome: 'Outcome',
    truthCase1: 'The vault on this machine is healthy and you know its password.',
    truthOutcome1:
      'Every backup you have ever made is openable. JADEITE holds the key and can open any backup of this vault, whatever password was in force when it was taken. Old passwords do not matter.',
    truthCase2: 'The vault is gone — a dead disk — and you are restoring from a backup.',
    truthOutcome2:
      'You need the password or the recovery key that was current at the moment that backup was made.',
    truthCase3: 'The vault is gone, the backup’s password is forgotten, and its recovery key is lost.',
    truthOutcome3: 'There is no way in. No bypass exists, and none can be added.',
    truthMandatedTitle: 'After every password change, JADEITE asks for a backup.',
    truthMandated: 'That is what keeps the newest backup matched to the newest credentials.',
    truthLimitation:
      'One honest limitation: the key that seals this vault never changes, so a stolen old backup plus its old password stays readable forever. Changing a password does not reach copies someone already holds. That is true of any encrypted file, and it is accepted here — the danger this guards against is a dead disk and a bad memory, not a thief.',
    truthGeneration: 'The recovery key in force now is number {{generation}}.'
  },

  about: {
    tagline: 'Economy Journal',
    creator: 'Created by',
    version: 'Version',
    released: 'Released',
    repository: 'Source',
    readme: 'Documentation',
    linksAreText:
      'These addresses are not links. JADEITE opens no external address; copy one and paste it into your browser.',
    licence: 'Licence',
    licenceRead: 'Read the full licence',
    licenceTitle: 'GNU General Public License, version 3',
    licenceBack: '← Back to About',
    motto: 'Built with Reason and Passion'
  },

  errors: {
    WRONG_CREDENTIAL: 'That credential is not correct.',
    MALFORMED_RECOVERY_KEY: 'That recovery key is not valid — check what you typed.',
    WEAK_PASSWORD: 'That password is too short.',
    VAULT_EXISTS: 'A vault already exists on this machine.',
    NO_VAULT: 'No vault was found.',
    ENVELOPE_CORRUPT: 'The key file cannot be read.',
    LOCKED: 'The vault is locked.',
    CANCELLED: 'Nothing was chosen.',
    NO_CANDIDATE: 'No backup is selected any more. Choose one again.',
    IO: 'That file could not be read or written.',
    NOT_A_BACKUP: 'That is not a JADEITE backup.',
    DAMAGED: 'That backup is damaged and cannot be trusted. Try another copy.',
    FUTURE_FORMAT: 'That backup was written by a newer JADEITE. Update this one first.',
    FUTURE_SCHEMA: 'That backup holds data from a newer JADEITE. Update this one first.',
    CREDENTIAL_REQUIRED: 'This backup needs the password or recovery key it was taken with.',
    PAYLOAD_UNREADABLE: 'That credential opened the file, and the data inside it will not open.',
    INTERNAL: 'Something unexpected went wrong.'
  },

  validation: {
    passwordsDoNotMatch: 'The passwords do not match.',
    passwordTooShort: 'The password must be at least {{count}} characters.'
  }
} as const
