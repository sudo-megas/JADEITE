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
    section3: 'Varlıklar',
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
    section3: 'Varlık defteri, mevcut varlıklar ve güncel fiyatlar.',
    section4: 'Serbest hesap alanı: toplam, ortalama, medyan.',
    overview: 'Tüm yılların özeti ve genel toplamlar.',
    altinEgrisi: 'Varlık defterinden türetilen grafikler.'
  },

  section1: {
    // The two computed headers keep the source workbook's own names, so the
    // owner reads the figure they already know by the name they already use.
    month: 'Ay',
    groupIncome: 'GELİR',
    groupExpense: 'GİDER',
    groupTotal: 'TOPLAM',
    incomeSubtotal: 'GELİR TOPLAM',
    netTotal: 'GENEL TOPLAM',
    yearTotal: 'Yıl toplamı',
    selection: 'Seçim · {{count}} ay',
    noRowsMatch: 'Filtreye uyan ay yok.',

    years: 'Yıllar',
    year: 'Yıl',
    addYear: 'Yıl ekle',
    addYearLede:
      'Yeni yıl, kendisinden önceki yılın sütunlarını devralır. Hiçbir tutar kopyalanmaz.',
    createYear: 'Yılı oluştur',
    noColumns: 'Bu yılın henüz sütunu yok. Aşağıdan ilk sütunu ekleyin.',

    yearMenu: '{{year}} yıl menüsü',
    yearMenuTitle: '{{year}} — yıl ayarları',
    accent: 'Yıl rengi',
    accentChoice: '{{index}}. renk',
    accentUseSequence: 'Palet sırasını kullan',
    deleteYear: 'Yılı sil',
    deleteYearDetail:
      '{{year}} yılı, {{columns}} sütunu ve {{count}} kaydıyla birlikte kalıcı olarak silinecek.',
    deleteYearWarningTitle: 'Bu işlem geri alınamaz.',
    deleteYearWarningBody:
      'Bu yıla ait her şey silinir — ileride Ödemeler bölümünün o yıla ait tablosu da dahil. Diğer yıllar etkilenmez.',
    deleteYearConfirm: 'Yılı kalıcı olarak sil',
    lastYearKept: 'Tek kalan yıl silinemez.',

    newColumnName: 'Sütun adı',
    group: 'Grup',
    valueType: 'Değer türü',
    typePlain: 'Sayı',
    addColumn: 'Sütun ekle',
    rename: 'Yeniden adlandır',
    moveLeft: 'Sola',
    moveRight: 'Sağa',
    columnMenu: '{{name}} sütun menüsü',
    columnMenuTitle: 'Sütun ayarları',
    sortState: {
      none: 'sıralanmamış',
      ascending: 'artan sırada',
      descending: 'azalan sırada'
    },
    sortHint: 'Sıralamak için tıklayın',
    clearSort: 'Sıralamayı temizle',
    clearFilters: 'Filtreleri temizle',

    filter: 'Filtre',
    filterThreshold: 'Filtre değeri',
    filterMode: {
      all: 'Tümü',
      filled: 'Dolu',
      empty: 'Boş',
      refund: 'Yalnızca iadeler',
      atLeast: 'En az',
      atMost: 'En çok'
    },

    refund: 'İade',
    note: 'Not',
    cellDetails: '{{cell}} — ayrıntılar',
    cellDetailsTitle: 'Hücre ayrıntıları',
    detailsNeedAmount: 'Önce bir tutar girin: not ve iade işareti bir tutara aittir.',

    deleteColumn: 'Sütunu sil',
    deleteColumnDetail:
      '{{name}} sütunu ve bu yıldaki {{count}} kaydı ({{total}}) kalıcı olarak silinecek.',
    deleteColumnWarningTitle: 'Bu işlem geri alınamaz.',
    deleteColumnWarningBody:
      'Önceki yıllar etkilenmez — her yıl kendi sütun takımına sahiptir.',
    deleteColumnConfirm: 'Kalıcı olarak sil',

    parse: {
      NOT_A_NUMBER: 'Bu bir sayı değil.',
      NEGATIVE: 'Tutarlar pozitif girilir; geri ödeme için İade işaretini kullanın.',
      TOO_MANY_DECIMALS: 'En çok iki ondalık basamak (kuruş).',
      BAD_GROUPING: 'Binlik ayracı hatalı — Türkçe biçim: 1.234,56',
      TOO_LARGE: 'Bu sayı çok büyük.'
    },

    errors: {
      LOCKED: 'Kasa kilitli.',
      NO_SUCH_YEAR: 'Yıl bulunamadı.',
      YEAR_EXISTS: 'Bu yıl zaten var.',
      LAST_YEAR: 'Tek kalan yıl silinemez.',
      NO_SUCH_CATEGORY: 'Sütun bulunamadı.',
      DUPLICATE_NAME: 'Bu adda bir sütun zaten var.',
      INVALID_NAME: 'Sütun adı geçersiz.',
      INVALID_AMOUNT: 'Tutar geçersiz.',
      INVALID_YEAR: 'Yıl geçersiz.',
      INTERNAL: 'Beklenmeyen bir hata oluştu.'
    }
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
    performance: 'Performans',
    noSwitchYet: 'Henüz yıl değiştirilmedi. Bir yıla geçin, ölçüm burada görünür.',
    switchDisplay: 'Ekran',
    switchFrames: 'kare',
    switchMedian: 'Ortanca kare süresi',
    switchWorst: 'En kötü kare',
    switchDropped: 'Düşen kare',
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
