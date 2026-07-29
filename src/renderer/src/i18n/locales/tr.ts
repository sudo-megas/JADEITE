/** Turkish — the primary language (§13). */

export const tr = {
  common: {
    brand: 'JADEITE',
    continue: 'Devam et',
    back: 'Geri dön',
    working: 'İşleniyor…',
    close: 'Kapat'
  },

  firstRun: {
    title: 'Ana parolanızı oluşturun',
    lede: 'Bu parola kasanızı açan tek şeydir. Kasa bu makinede şifreli olarak saklanır ve dışarı hiçbir şey çıkmaz.',
    password: 'Ana parola',
    passwordConfirm: 'Ana parolayı doğrulayın',
    submit: 'Kasayı oluştur'
  },

  recovery: {
    title: 'Kurtarma anahtarınız',
    lede: 'Bunu kâğıda yazın ve güvenli bir yerde saklayın.',
    warningTitle: 'Bu anahtar bir daha asla gösterilmeyecek.',
    warningBody:
      'Parolanızı unutur ve bu anahtarı da kaybederseniz kasa kalıcı olarak açılamaz. Üçüncü bir kopya, arka kapı veya destek kanalı yoktur.',
    ack: 'Kurtarma anahtarını yazdım ve güvenli bir yerde sakladım.'
  },

  lock: {
    title: 'Kasa kilitli',
    ledeIdle: 'Hareketsizlik nedeniyle kilitlendi.',
    ledeReset: 'Parola değiştirildi. Yeni parolanızla girin.',
    password: 'Ana parola',
    submit: 'Kilidi aç',
    forgot: 'Parolamı unuttum'
  },

  reset: {
    title: 'Kurtarma anahtarı ile sıfırla',
    lede: 'Mevcut kurtarma anahtarınız kullanıldığında kalıcı olarak geçersiz olur ve yerine yenisi verilir.',
    keyLabel: 'Kurtarma anahtarı',
    newPassword: 'Yeni ana parola',
    newPasswordConfirm: 'Yeni ana parolayı doğrulayın',
    submit: 'Parolayı sıfırla'
  },

  nav: {
    section1: 'Gelir & Gider',
    section2: 'Ödemeler',
    section3: 'Kıymetler',
    section4: 'Hesap Alanı',
    overview: 'Genel Bakış',
    altinEgrisi: 'Altın Eğrisi',
    settings: 'Ayarlar',
    lock: 'Kilitle'
  },

  sections: {
    comingIn: 'Realisation {{roman}} ile gelecek.',
    section1: 'Yıl çalışma alanları, gelir ve gider sütunları.',
    section2: 'İleriye dönük ödeme takibi, banka sütunları ve limitler.',
    section3: 'Kıymet defteri, varlıklar ve güncel fiyatlar.',
    section4: 'Serbest hesap alanı: toplam, ortalama, medyan.',
    overview: 'Tüm yılların özeti ve genel toplamlar.',
    altinEgrisi: 'Kıymet defterinden türetilen grafikler.'
  },

  settings: {
    title: 'Ayarlar',
    appearance: 'Görünüm',
    palette: 'Renk paleti',
    language: 'Dil',
    languageTurkish: 'Türkçe',
    languageEnglish: 'İngilizce',
    security: 'Güvenlik',
    autoLock: 'Otomatik kilit',
    autoLockUnit: 'dakika',
    paletteModeLight: 'açık',
    paletteModeDark: 'koyu',
    formattingPreview: 'Biçim örneği'
  },

  errors: {
    WRONG_CREDENTIAL: 'Kimlik bilgisi hatalı.',
    MALFORMED_RECOVERY_KEY: 'Kurtarma anahtarı geçersiz — yazımı kontrol edin.',
    WEAK_PASSWORD: 'Parola çok kısa.',
    VAULT_EXISTS: 'Bu makinede zaten bir kasa var.',
    NO_VAULT: 'Kasa bulunamadı.',
    ENVELOPE_CORRUPT: 'Anahtar dosyası okunamıyor.',
    LOCKED: 'Kasa kilitli.',
    INTERNAL: 'Beklenmeyen bir hata oluştu.'
  },

  validation: {
    passwordsDoNotMatch: 'Parolalar eşleşmiyor.',
    passwordTooShort: 'Parola en az {{count}} karakter olmalı.'
  }
} as const
