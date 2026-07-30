/** Turkish — the primary language (§13). */

export const tr = {
  common: {
    brand: 'JADEITE',
    continue: 'Devam et',
    back: 'Geri dön',
    working: 'İşleniyor…',
    close: 'Kapat',
    delete: 'Kaldır',
    actions: 'İşlemler'
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
      '{{year}} yılı, {{columns}} sütunu ve {{count}} kaydıyla, Ödemeler tablosundaki {{banks}} sütun ve {{cells}} hücreyle birlikte kalıcı olarak silinecek.',
    deleteYearWarningTitle: 'Bu işlem geri alınamaz.',
    deleteYearWarningBody:
      'Bu yıla ait her şey silinir — Ödemeler bölümünün o yıla ait tablosu da dahil. Diğer yıllar etkilenmez.',
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

  // Bölüm 2 — Ödemeler. Başlıklar kaynak çalışma kitabının kendi adlarını
  // korur, böylece sahibi zaten bildiği rakamı zaten kullandığı adla okur.
  section2: {
    month: 'AY',
    groupBanks: 'BANKA / KART',
    groupCounters: 'KARŞI SÜTUNLAR',
    totalDebt: 'TOPLAM BORÇ',
    creditLimit: 'KREDİ LİMİTİ',
    debt: 'BORÇ',
    remainingLimit: 'KALAN LİMİT',
    totalRemainingLimit: 'TOPLAM KALAN LİMİT',
    creditLimitOf: '{{name}} kredi limiti',
    counterPartyOf: '{{name}} — kişi',

    years: 'Yıllar',
    year: 'Yıl',
    addYear: 'Yıl ekle',
    addYearLede: 'Yeni yıl, bir önceki yılın bankalarını devralır; tutarlar boş başlar.',
    createYear: 'Yılı oluştur',
    noBanks: 'Bu yılda henüz sütun yok. Aşağıdan bir banka veya kart ekleyin.',

    newBankName: 'Banka / kart adı',
    bankKind: 'Sütun türü',
    bankKindBank: 'Banka / kart',
    bankKindCounter: 'Karşı sütun',
    newLimit: 'Kredi limiti',
    newParty: 'Kişi (örn. annem)',
    addColumn: 'Sütun ekle',

    rename: 'Yeniden adlandır',
    order: 'Sıra',
    moveLeft: 'Sola',
    moveRight: 'Sağa',
    bankMenu: '{{name}} sütun menüsü',
    bankMenuTitle: '{{name}} — sütun ayarları',

    deleteColumn: 'Sütunu sil',
    deleteColumnDetail: '{{name}} sütununda {{count}} kayıt var ({{total}}).',
    deleteColumnWarningTitle: '{{name}} silinsin mi?',
    deleteColumnWarningBody: 'Yalnızca bu yılın sütunu ve hücreleri silinir; diğer yıllar olduğu gibi kalır.',
    deleteColumnConfirm: 'Sütunu sil',

    archive: {
      frozen: '{{year}} donduruldu — yalnızca okunur.',
      frozenHint: 'Bir düzeltme gerekirse yeniden açabilirsiniz; hiçbir şey kaybolmaz.',
      freeze: 'Yılı dondur',
      freezeTitle: '{{year}} dondurulsun mu?',
      freezeDetail: 'Bu yılın ızgarası salt okunur olur. Hiçbir şey silinmez ve istediğiniz an yeniden açabilirsiniz.',
      freezeConfirm: 'Dondur',
      reopen: 'Yeniden aç'
    },

    parse: {
      NOT_A_NUMBER: 'Bu bir sayı değil.',
      NEGATIVE: 'Tutarlar pozitif girilir; azaltan bir ödeme için karşı sütun kullanın.',
      TOO_MANY_DECIMALS: 'En çok iki ondalık basamak (kuruş).',
      BAD_GROUPING: 'Binlik ayracı hatalı — Türkçe biçim: 1.234,56',
      TOO_LARGE: 'Bu sayı çok büyük.'
    },

    errors: {
      LOCKED: 'Kasa kilitli.',
      NO_SUCH_YEAR: 'Yıl bulunamadı.',
      YEAR_EXISTS: 'Bu yıl zaten var.',
      ARCHIVED: 'Bu yıl dondurulmuş. Değişiklik için yeniden açın.',
      NO_SUCH_BANK: 'Sütun bulunamadı.',
      DUPLICATE_NAME: 'Bu adda bir sütun zaten var.',
      INVALID_NAME: 'Sütun adı geçersiz.',
      INVALID_AMOUNT: 'Tutar geçersiz.',
      INVALID_LIMIT: 'Kredi limiti geçersiz.',
      INVALID_YEAR: 'Yıl geçersiz.',
      INTERNAL: 'Beklenmeyen bir hata oluştu.'
    }
  },

  section3: {
    subsections: 'Alt bölümler',
    views: {
      ledger: 'Defter',
      holdings: 'Mevcut Varlıklar',
      prices: 'Güncel Fiyatlar'
    },

    no: 'No',
    date: 'Tarih',
    datePlaceholder: 'YYYY-AA-GG',
    provisional: 'Tarih incelemede',
    type: 'Tür',
    direction: 'İşlem',
    acquire: 'Alış',
    dispose: 'Elden Çıkarma',
    denomination: 'Gramaj',
    count: 'Adedi',
    unattributed: '{{amount}} artan',
    unattributedHint:
      'Bir çıkış, bir parçayı bölmüş. Kalan ağırlık artık bütün bir parça değil, o yüzden ayrı gösteriliyor.',
    quantity: 'Miktar',
    totalQuantity: 'Toplam Miktar',
    unitPrice: 'Birim Fiyat',
    transactionTotal: 'İşlem Toplamı',
    source: 'Nereden / Nereye',
    person: 'Kişi',
    note: 'Not',
    unassigned: 'Ortak',

    perGram: '/ g',
    perPiece: '/ adet',
    perUnit: '/ birim',

    addRow: 'Ekle',
    deleteRow: '{{seq}} numaralı satırı sil',
    deleteRowConfirm: 'Sil',

    ledgerTotals: '{{count}} kayıt',
    provisionalCount: '{{count}} satırın tarihi incelemede',
    acquiredValue: 'Alış toplamı {{value}}',
    disposedValue: 'Çıkış toplamı {{value}}',

    types: {
      gram: 'Gram',
      ceyrek: 'Çeyrek',
      yarim: 'Yarım',
      tam: 'Tam',
      ata: 'Ata (Cumhuriyet)',
      iki_bucuk: '2,5 (İki Buçuklu)',
      besli: '5 (Beşli)',
      usd: 'Dolar',
      eur: 'Euro',
      gumus: 'Gümüş'
    },

    costBasis: 'Maliyet',
    marketValue: 'Piyasa Değeri',
    liveValue: 'Canlı Değer',
    liveValueHint:
      'Sağlayıcının fiyatıyla hesaplanmıştır. Piyasa değeri girdiğiniz fiyattan hesaplanır; bu sütun onun yerine geçmez.',
    liveSource: 'kaynak: {{provider}}',
    unrealised: 'Gerçekleşmemiş K/Z',
    grandTotal: 'GENEL TOPLAM',
    personTotal: '{{name}} toplamı',
    noHoldings: 'Henüz varlık yok. Deftere bir alış girin.',
    unpriced: 'Fiyat girilmedi',
    oversoldHint: 'Deftere kaydedilenden fazlası elden çıkarılmış.',
    discrepancyTitle: 'Defter kendisiyle uyuşmuyor.',
    discrepancyBody:
      '{{count}} varlıkta, kaydedilen alışlardan fazlası elden çıkarılmış görünüyor. Eksik bir alış satırı olması beklenir; girildiğinde bu uyarı kendiliğinden kalkar.',
    missingPrices: 'Fiyatı girilmemiş türler piyasa değerine katılmadı: {{types}}',

    pricesLede:
      'Girdiğiniz fiyat esastır. Canlı sağlayıcı onun yerine geçmez, yanında durur; ikisi belirgin biçimde ayrılırsa satır bunu söyler.',
    manualPrice: 'Girilen Fiyat',
    updatedAt: 'Güncellendi',
    livePrice: 'Canlı Fiyat',
    noProvider: 'Sağlayıcı yok',
    notQuoted: 'Kaynak vermiyor',
    clearPrice: 'Temizle',
    priceOf: '{{type}} fiyatı',

    refreshLive: 'Canlı fiyatları yenile',
    checkingLive: 'Sağlayıcıya bakılıyor…',
    lastChecked: 'Son bakış: {{when}}',
    neverChecked: 'Sağlayıcıya henüz bakılmadı.',
    lastGood: 'Elde tutulan son geçerli fiyat: {{when}}',
    liveSkipped: 'Sağlayıcıya az önce soruldu; {{seconds}} sn sonra yeniden deneyebilirsiniz.',

    drift: {
      header: 'Sapma',
      none: 'Canlı fiyat yok',
      unpriced: 'Girilen fiyat yok',
      aligned: 'Uyumlu',
      alignedTitle:
        'Canlı fiyat ile girdiğiniz fiyat arasındaki fark {{threshold}} sınırının altında.',
      drifting: 'Sapma var',
      above: 'Canlı fiyat, girdiğiniz fiyatın {{percent}} üzerinde.',
      below: 'Canlı fiyat, girdiğiniz fiyatın {{percent}} altında.'
    },

    liveErrors: {
      OFFLINE: 'Bağlantı yok; sağlayıcıya ulaşılamadı.',
      TIMEOUT: 'Sağlayıcı zamanında yanıt vermedi.',
      MALFORMED: 'Sağlayıcının yanıtı okunamadı.',
      STALE_RANGE: 'Sağlayıcı istenen tarihe kadar getirmedi; gelen veri saklanmadı.',
      NO_DATA: 'Sağlayıcı bu aralık için veri döndürmedi.',
      UNKNOWN: 'Canlı fiyatlar alınamadı.'
    },

    persons: 'Kişiler',
    personName: 'Kişi adı',
    newPersonName: 'Yeni kişi adı',
    addPerson: 'Kişi ekle',
    builtinHint: '— sahibi bilinmeyen satırların yeri',
    chooseColour: '{{name}} için renk seç',
    colourSlot: '{{slot}}. renk',
    moveUp: '{{name}} yukarı',
    moveDown: '{{name}} aşağı',
    deletePersonTitle: '{{name}} kaldırılsın mı?',
    deletePersonDetail:
      '{{count}} defter satırı Ortak’a aktarılacak. Hiçbir satır silinmiyor; sahibi değişiyor.',
    deletePersonEmpty: 'Bu kişiye bağlı defter satırı yok.',
    deletePersonConfirm: 'Kaldır',

    parse: {
      NOT_A_NUMBER: 'Bu bir sayı değil.',
      NEGATIVE: 'Miktarlar pozitif girilir; çıkış için Elden Çıkarma seçin.',
      TOO_MANY_DECIMALS: 'Bu tür için daha az ondalık basamak girilir.',
      BAD_GROUPING: 'Binlik ayracı hatalı — Türkçe biçim: 1.234,56',
      TOO_LARGE: 'Bu sayı çok büyük.',
      ZERO: 'Miktar sıfır olamaz.',
      REQUIRED: 'Bu alan boş bırakılamaz.',
      INVALID_DATE: 'Tarih YYYY-AA-GG biçiminde ve gerçek bir gün olmalı.'
    },

    errors: {
      LOCKED: 'Kasa kilitli.',
      NO_SUCH_TRANSACTION: 'Satır bulunamadı.',
      NO_SUCH_PERSON: 'Kişi bulunamadı.',
      NO_SUCH_TYPE: 'Tür bulunamadı.',
      BUILTIN_PERSON: 'Ortak yeniden adlandırılamaz ve kaldırılamaz.',
      DUPLICATE_NAME: 'Bu adda bir kişi zaten var.',
      INVALID_NAME: 'Ad geçersiz.',
      INVALID_DATE: 'Tarih geçersiz.',
      INVALID_QUANTITY: 'Miktar geçersiz.',
      INVALID_PRICE: 'Fiyat geçersiz.',
      INTERNAL: 'Beklenmeyen bir hata oluştu.'
    }
  },

  section4: {
    total: 'TOPLAM',
    average: 'ORTALAMA',
    median: 'ORTANCA',
    counted: '{{count}} değer',
    none: '—',
    label: 'Etiket',
    value: 'Değer',
    newLabel: 'Yeni etiket',
    newValue: 'Değer',
    addLine: 'Satır ekle',
    moveUp: 'Yukarı taşı',
    moveDown: 'Aşağı taşı',
    deleteLine: 'Satırı sil',
    deleteConfirm: 'Sil',

    parse: {
      NOT_A_NUMBER: 'Bu bir sayı değil.',
      NEGATIVE: 'Değerler pozitif girilir.',
      TOO_MANY_DECIMALS: 'En çok iki ondalık basamak.',
      BAD_GROUPING: 'Binlik ayracı hatalı — Türkçe biçim: 1.234,56',
      TOO_LARGE: 'Bu sayı çok büyük.'
    },

    errors: {
      LOCKED: 'Kasa kilitli.',
      NO_SUCH_LINE: 'Satır bulunamadı.',
      INVALID_LABEL: 'Etiket geçersiz.',
      INVALID_VALUE: 'Değer geçersiz.',
      INTERNAL: 'Beklenmeyen bir hata oluştu.'
    }
  },

  altin: {
    logScale: 'Logaritmik ölçek',
    filterType: 'Tür',
    filterPerson: 'Kişi',
    allTypes: 'Tümü',
    allPersons: 'Herkes',
    spektrum: 'Spektrum — birim fiyat',
    frekans: 'Frekans — alınan miktar',
    marketValue: 'Değer — elde olanın piyasa değeri',
    empty: 'Grafikler Varlıklar defterinden türetilir. Deftere bir alış girin, grafikler kendiliğinden çizilir.',
    crushed:
      'Değerler birkaç kat fark ediyor; doğrusal ölçekte küçükler eziliyor. Logaritmik ölçek her ikisini de okunur kılar.',
    marketStaysLinear:
      'Değer grafiği doğrusal kalır: elde olan sıfır veya eksi olabilir, bunların logaritmik ölçekte yeri yoktur.',
    provisional: 'Tarihi henüz doğrulanmamış {{count}} kayıt var; eğri o noktada yanıltabilir.'
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
    prices: 'Canlı fiyatlar',
    priceRefreshHint:
      'Fiyatları elle yenilemek esastır. Açarsanız uygulama, kasa açıkken bu aralıkla sağlayıcıya kendiliğinden sorar; kapalıyken hiçbir şeye bağlanmaz.',
    priceRefreshOff: 'Kapalı',
    priceRefreshEvery: '{{minutes}} dakikada bir',
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
