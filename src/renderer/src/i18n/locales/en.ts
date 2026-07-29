/** English — complete for every shell string, per the Realisation II acceptance. */

export const en = {
  common: {
    brand: 'JADEITE',
    continue: 'Continue',
    back: 'Go back',
    working: 'Working…',
    close: 'Close'
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
    settings: 'Settings',
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
      'The year {{year}}, its {{columns}} columns and its {{count}} entries will be permanently deleted.',
    deleteYearWarningTitle: 'This cannot be undone.',
    deleteYearWarningBody:
      'Everything belonging to this year goes — including its Payments grid once that section exists. Other years are unaffected.',
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

  errors: {
    WRONG_CREDENTIAL: 'That credential is not correct.',
    MALFORMED_RECOVERY_KEY: 'That recovery key is not valid — check what you typed.',
    WEAK_PASSWORD: 'That password is too short.',
    VAULT_EXISTS: 'A vault already exists on this machine.',
    NO_VAULT: 'No vault was found.',
    ENVELOPE_CORRUPT: 'The key file cannot be read.',
    LOCKED: 'The vault is locked.',
    INTERNAL: 'Something unexpected went wrong.'
  },

  validation: {
    passwordsDoNotMatch: 'The passwords do not match.',
    passwordTooShort: 'The password must be at least {{count}} characters.'
  }
} as const
