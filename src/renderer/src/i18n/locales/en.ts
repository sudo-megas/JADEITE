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
