/**
 * Realisation I strings, Turkish only.
 *
 * §13 makes Turkish primary and forbids reading the OS locale. i18next and the
 * English catalogue arrive at Realisation II; these keys move into it wholesale
 * rather than being retyped.
 */

import type { VaultErrorCode } from '@shared/ipc-contract'

export const T = {
  brand: 'JADEITE',

  firstRunTitle: 'Ana parolanızı oluşturun',
  firstRunLede:
    'Bu parola kasanızı açan tek şeydir. Kasa bu makinede şifreli olarak saklanır ve dışarı hiçbir şey çıkmaz.',
  password: 'Ana parola',
  passwordConfirm: 'Ana parolayı doğrulayın',
  createVault: 'Kasayı oluştur',

  recoveryTitle: 'Kurtarma anahtarınız',
  recoveryLede: 'Bunu kâğıda yazın ve güvenli bir yerde saklayın.',
  recoveryWarningTitle: 'Bu anahtar bir daha asla gösterilmeyecek.',
  recoveryWarningBody:
    'Parolanızı unutur ve bu anahtarı da kaybederseniz kasa kalıcı olarak açılamaz. Üçüncü bir kopya, arka kapı veya destek kanalı yoktur.',
  recoveryAck: 'Kurtarma anahtarını yazdım ve güvenli bir yerde sakladım.',
  recoveryContinue: 'Devam et',

  lockTitle: 'Kasa kilitli',
  lockLedeIdle: 'Hareketsizlik nedeniyle kilitlendi.',
  lockLedeReset: 'Parola değiştirildi. Yeni parolanızla girin.',
  unlock: 'Kilidi aç',
  forgotPassword: 'Parolamı unuttum',

  resetTitle: 'Kurtarma anahtarı ile sıfırla',
  resetLede:
    'Mevcut kurtarma anahtarınız kullanıldığında kalıcı olarak geçersiz olur ve yerine yenisi verilir.',
  recoveryKeyLabel: 'Kurtarma anahtarı',
  newPassword: 'Yeni ana parola',
  newPasswordConfirm: 'Yeni ana parolayı doğrulayın',
  resetSubmit: 'Parolayı sıfırla',
  backToUnlock: 'Geri dön',

  unlockedTitle: 'Kasa açık',
  unlockedLede: 'Realisation I yalnızca kasayı içerir. Bölümler Realisation III ile gelir.',
  lockNow: 'Şimdi kilitle',
  statusVault: 'Kasa',
  statusVaultOpen: 'açık',
  statusSchema: 'Şema',
  statusAutoLock: 'Otomatik kilit',
  minutesShort: 'dk',

  passwordsDoNotMatch: 'Parolalar eşleşmiyor.',
  passwordTooShort: (n: number): string => `Parola en az ${n} karakter olmalı.`,
  working: 'İşleniyor…'
} as const

export function errorMessage(code: VaultErrorCode): string {
  switch (code) {
    case 'WRONG_CREDENTIAL':
      return 'Kimlik bilgisi hatalı.'
    case 'MALFORMED_RECOVERY_KEY':
      return 'Kurtarma anahtarı geçersiz — yazımı kontrol edin.'
    case 'WEAK_PASSWORD':
      return 'Parola çok kısa.'
    case 'VAULT_EXISTS':
      return 'Bu makinede zaten bir kasa var.'
    case 'NO_VAULT':
      return 'Kasa bulunamadı.'
    case 'ENVELOPE_CORRUPT':
      return 'Anahtar dosyası okunamıyor.'
    case 'LOCKED':
      return 'Kasa kilitli.'
    case 'INTERNAL':
      return 'Beklenmeyen bir hata oluştu.'
  }
}
