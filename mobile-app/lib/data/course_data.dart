class Topic {
  final String id;
  final String name;
  final List<Topic>? subTopics;

  const Topic({required this.id, required this.name, this.subTopics});
}

class CourseTopics {
  final String id;
  final String name;
  final String icon;
  final List<Topic> topics;

  const CourseTopics({
    required this.id,
    required this.name,
    required this.icon,
    required this.topics,
  });
}

const List<CourseTopics> tytCourseTopics = [
  CourseTopics(
    id: 'tyt_tur',
    name: 'Türkçe (TYT)',
    icon: '✍️',
    topics: [
      Topic(id: 'tt_1', name: 'Anlam Bilgisi', subTopics: [
        Topic(id: 'tt_1_1', name: 'Sözcükte Anlam'),
        Topic(id: 'tt_1_2', name: 'Cümlede Anlam'),
        Topic(id: 'tt_1_3', name: 'Paragrafta Anlam'),
        Topic(id: 'tt_1_4', name: 'Paragrafta Anlatım Biçimleri'),
        Topic(id: 'tt_1_5', name: 'Paragrafta Yapı'),
      ]),
      Topic(id: 'tt_2', name: 'Dil Bilgisi', subTopics: [
        Topic(id: 'tt_2_1', name: 'Ses Bilgisi'),
        Topic(id: 'tt_2_2', name: 'Yazım Kuralları'),
        Topic(id: 'tt_2_3', name: 'Noktalama İşaretleri'),
        Topic(id: 'tt_2_4', name: 'Sözcükte Yapı / Ekler'),
        Topic(id: 'tt_2_5', name: 'Sözcük Türleri (İsim, Sıfat, Zamir...)'),
        Topic(id: 'tt_2_6', name: 'Fiiller (Kip, Kişi, Yapı)'),
        Topic(id: 'tt_2_7', name: 'Fiilimsiler'),
        Topic(id: 'tt_2_8', name: 'Fiilde Çatı'),
        Topic(id: 'tt_2_9', name: 'Cümlenin Ögeleri'),
        Topic(id: 'tt_2_10', name: 'Cümle Türleri'),
        Topic(id: 'tt_2_11', name: 'Anlatım Bozuklukları'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'tyt_mat',
    name: 'Matematik (TYT)',
    icon: '📐',
    topics: [
      Topic(id: 'tm_1', name: 'Sayılar', subTopics: [
        Topic(id: 'tm_1_1', name: 'Temel Kavramlar'),
        Topic(id: 'tm_1_2', name: 'Sayı Basamakları'),
        Topic(id: 'tm_1_3', name: 'Bölme ve Bölünebilme'),
        Topic(id: 'tm_1_4', name: 'EBOB-EKOK'),
        Topic(id: 'tm_1_5', name: 'Rasyonel Sayılar'),
        Topic(id: 'tm_1_6', name: 'Basit Eşitsizlikler'),
        Topic(id: 'tm_1_7', name: 'Mutlak Değer'),
        Topic(id: 'tm_1_8', name: 'Üslü Sayılar'),
        Topic(id: 'tm_1_9', name: 'Köklü Sayılar'),
        Topic(id: 'tm_1_10', name: 'Çarpanlara Ayırma'),
      ]),
      Topic(id: 'tm_2', name: 'Denklem ve Eşitsizlikler', subTopics: [
        Topic(id: 'tm_2_1', name: 'Oran-Orantı'),
        Topic(id: 'tm_2_2', name: 'Denklem Çözme'),
      ]),
      Topic(id: 'tm_3', name: 'Problemler', subTopics: [
        Topic(id: 'tm_3_1', name: 'Sayı-Kesir Problemleri'),
        Topic(id: 'tm_3_2', name: 'Yaş Problemleri'),
        Topic(id: 'tm_3_3', name: 'Yüzde-Kar-Zarar Problemleri'),
        Topic(id: 'tm_3_4', name: 'Karışım Problemleri'),
        Topic(id: 'tm_3_5', name: 'Hareket Problemleri'),
        Topic(id: 'tm_3_6', name: 'Rutin Olmayan Problemler'),
      ]),
      Topic(id: 'tm_4', name: 'Diğer Konular', subTopics: [
        Topic(id: 'tm_4_1', name: 'Mantık'),
        Topic(id: 'tm_4_2', name: 'Kümeler'),
        Topic(id: 'tm_4_3', name: 'Fonksiyonlar'),
        Topic(id: 'tm_4_4', name: 'Polinomlar'),
        Topic(id: 'tm_4_5', name: '2. Dereceden Denklemler'),
        Topic(id: 'tm_4_6', name: 'Permütasyon-Kombinasyon'),
        Topic(id: 'tm_4_7', name: 'Binom-Olasılık'),
        Topic(id: 'tm_4_8', name: 'İstatistik'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'tyt_geo',
    name: 'Geometri (TYT)',
    icon: '📏',
    topics: [
      Topic(id: 'tg_1', name: 'Üçgenler', subTopics: [
        Topic(id: 'tg_1_1', name: 'Doğruda ve Üçgende Açılar'),
        Topic(id: 'tg_1_2', name: 'Özel Üçgenler'),
        Topic(id: 'tg_1_3', name: 'Açı-Kenar Bağıntıları'),
        Topic(id: 'tg_1_4', name: 'Açıortay-Kenarortay'),
        Topic(id: 'tg_1_5', name: 'Eşlik ve Benzerlik'),
        Topic(id: 'tg_1_6', name: 'Üçgende Alan'),
      ]),
      Topic(id: 'tg_2', name: 'Dörtgenler ve Çokgenler', subTopics: [
        Topic(id: 'tg_2_1', name: 'Çokgenler'),
        Topic(id: 'tg_2_2', name: 'Dörtgenler'),
        Topic(id: 'tg_2_3', name: 'Yamuk'),
        Topic(id: 'tg_2_4', name: 'Paralelkenar-Eşkenar Dörtgen'),
        Topic(id: 'tg_2_5', name: 'Dikdörtgen-Kare-Deltoid'),
      ]),
      Topic(id: 'tg_3', name: 'Çember ve Daire', subTopics: [
        Topic(id: 'tg_3_1', name: 'Çemberde Açı-Uzunluk'),
        Topic(id: 'tg_3_2', name: 'Dairede Alan'),
      ]),
      Topic(id: 'tg_4', name: 'Katı Cisimler ve Analitik', subTopics: [
        Topic(id: 'tg_4_1', name: 'Katı Cisimler'),
        Topic(id: 'tg_4_2', name: 'Analitik Geometri'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'tyt_fiz',
    name: 'Fizik (TYT)',
    icon: '⚛️',
    topics: [
      Topic(id: 'tf_1', name: 'Madde ve Kuvvet', subTopics: [
        Topic(id: 'tf_1_1', name: 'Fizik Bilimine Giriş'),
        Topic(id: 'tf_1_2', name: 'Madde ve Özellikleri'),
        Topic(id: 'tf_1_3', name: 'Hareket ve Kuvvet'),
        Topic(id: 'tf_1_4', name: 'Dinamik'),
      ]),
      Topic(id: 'tf_2', name: 'Enerji ve Mekanik', subTopics: [
        Topic(id: 'tf_2_1', name: 'İş, Güç ve Enerji'),
        Topic(id: 'tf_2_2', name: 'Basınç'),
        Topic(id: 'tf_2_3', name: 'Kaldırma Kuvveti'),
        Topic(id: 'tf_2_4', name: 'Isı, Sıcaklık ve Genleşme'),
      ]),
      Topic(id: 'tf_3', name: 'Dalga ve Işık', subTopics: [
        Topic(id: 'tf_3_1', name: 'Elektrostatik'),
        Topic(id: 'tf_3_2', name: 'Elektrik ve Manyetizma'),
        Topic(id: 'tf_3_3', name: 'Optik'),
        Topic(id: 'tf_3_4', name: 'Dalgalar'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'tyt_kim',
    name: 'Kimya (TYT)',
    icon: '🧪',
    topics: [
      Topic(id: 'tk_1', name: 'Temel Kimya', subTopics: [
        Topic(id: 'tk_1_1', name: 'Kimya Bilimi'),
        Topic(id: 'tk_1_2', name: 'Atom ve Periyodik Sistem'),
        Topic(id: 'tk_1_3', name: 'Kimyasal Türler Arası Etkileşimler'),
        Topic(id: 'tk_1_4', name: 'Maddenin Halleri'),
      ]),
      Topic(id: 'tk_2', name: 'Hesaplamalı Kimya', subTopics: [
        Topic(id: 'tk_2_1', name: 'Doğa ve Kimya'),
        Topic(id: 'tk_2_2', name: 'Kimyanın Temel Kanunları'),
        Topic(id: 'tk_2_3', name: 'Kimyasal Hesaplamalar'),
      ]),
      Topic(id: 'tk_3', name: 'Günlük Kimya', subTopics: [
        Topic(id: 'tk_3_1', name: 'Karışımlar'),
        Topic(id: 'tk_3_2', name: 'Asitler, Bazlar ve Tuzlar'),
        Topic(id: 'tk_3_3', name: 'Kimya Her Yerde'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'tyt_biyo',
    name: 'Biyoloji (TYT)',
    icon: '🧬',
    topics: [
      Topic(id: 'tb_1', name: 'Temel Biyoloji', subTopics: [
        Topic(id: 'tb_1_1', name: 'Canlıların Ortak Özellikleri'),
        Topic(id: 'tb_1_2', name: 'Canlıların Temel Bileşenleri'),
        Topic(id: 'tb_1_3', name: 'Hücre ve Organelleri'),
        Topic(id: 'tb_1_4', name: 'Madde Geçişleri'),
      ]),
      Topic(id: 'tb_2', name: 'Yaşam ve Çevre', subTopics: [
        Topic(id: 'tb_2_1', name: 'Canlıların Sınıflandırılması'),
        Topic(id: 'tb_2_2', name: 'Hücre Bölünmeleri'),
        Topic(id: 'tb_2_3', name: 'Üreme Sistemleri'),
        Topic(id: 'tb_2_4', name: 'Kalıtım'),
        Topic(id: 'tb_2_5', name: 'Ekosistem Ekolojisi'),
        Topic(id: 'tb_2_6', name: 'Güncel Çevre Sorunları'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'tyt_tar',
    name: 'Tarih (TYT)',
    icon: '🏺',
    topics: [
      Topic(id: 'tr_1', name: 'Eski ve Orta Çağ', subTopics: [
        Topic(id: 'tr_1_1', name: 'Tarih ve Zaman'),
        Topic(id: 'tr_1_2', name: 'İnsanlığın İlk Dönemleri'),
        Topic(id: 'tr_1_3', name: 'Orta Çağ\'da Dünya'),
        Topic(id: 'tr_1_4', name: 'İlk ve Orta Çağlarda Türk Dünyası'),
      ]),
      Topic(id: 'tr_2', name: 'İslam ve Türk-İslam', subTopics: [
        Topic(id: 'tr_2_1', name: 'İslam Medeniyetinin Doğuşu'),
        Topic(id: 'tr_2_2', name: 'Türklerin İslamiyet\'i Kabulü'),
        Topic(id: 'tr_2_3', name: 'Türkiye Selçuklu Devleti'),
      ]),
      Topic(id: 'tr_3', name: 'Osmanlı Tarihi', subTopics: [
        Topic(id: 'tr_3_1', name: 'Osmanlı Kuruluş-Yükselme'),
        Topic(id: 'tr_3_2', name: 'Dünya Gücü Osmanlı'),
        Topic(id: 'tr_3_3', name: 'Yeni ve Yakın Çağda Avrupa'),
        Topic(id: 'tr_3_4', name: 'Değişim Çağında Osmanlı'),
        Topic(id: 'tr_3_5', name: 'En Uzun Yüzyıl'),
      ]),
      Topic(id: 'tr_4', name: 'Milli Mücadele', subTopics: [
        Topic(id: 'tr_4_1', name: '20. Yüzyıl Başında Osmanlı'),
        Topic(id: 'tr_4_2', name: 'Kurtuluş Savaşı Hazırlık'),
        Topic(id: 'tr_4_3', name: 'Milli Mücadele Cepheler'),
        Topic(id: 'tr_4_4', name: 'Atatürkçülük ve İnkılaplar'),
        Topic(id: 'tr_4_5', name: 'Türk Dış Politikası'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'tyt_cog',
    name: 'Coğrafya (TYT)',
    icon: '🌍',
    topics: [
      Topic(id: 'tc_1', name: 'Dünya ve İnsan', subTopics: [
        Topic(id: 'tc_1_1', name: 'Doğa ve İnsan'),
        Topic(id: 'tc_1_2', name: 'Dünya\'nın Şekli ve Hareketleri'),
        Topic(id: 'tc_1_3', name: 'Coğrafi Konum'),
        Topic(id: 'tc_1_4', name: 'Harita Bilgisi'),
      ]),
      Topic(id: 'tc_2', name: 'İklim ve Yer Şekilleri', subTopics: [
        Topic(id: 'tc_2_1', name: 'Atmosfer ve Sıcaklık'),
        Topic(id: 'tc_2_2', name: 'Basınç ve Rüzgarlar'),
        Topic(id: 'tc_2_3', name: 'Nem ve Yağış'),
        Topic(id: 'tc_2_4', name: 'Dünya\'daki İklim Tipleri'),
        Topic(id: 'tc_2_5', name: 'Yer Şekilleri-İç ve Dış Kuvvetler'),
      ]),
      Topic(id: 'tc_3', name: 'Beşeri Coğrafya', subTopics: [
        Topic(id: 'tc_3_1', name: 'Nüfus ve Yerleşme'),
        Topic(id: 'tc_3_2', name: 'Ekonomik Faaliyetler'),
        Topic(id: 'tc_3_3', name: 'Bölgeler'),
        Topic(id: 'tc_3_4', name: 'Ulaşım Hatları'),
        Topic(id: 'tc_3_5', name: 'Afetler ve Çevre'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'tyt_fel',
    name: 'Felsefe (TYT)',
    icon: '🧠',
    topics: [
      Topic(id: 'tfel_1', name: 'Temel Felsefe', subTopics: [
        Topic(id: 'tfel_1_1', name: 'Felsefenin Konusu'),
        Topic(id: 'tfel_1_2', name: 'Bilgi Felsefesi'),
        Topic(id: 'tfel_1_3', name: 'Varlık Felsefesi'),
        Topic(id: 'tfel_1_4', name: 'Ahlak Felsefesi'),
      ]),
      Topic(id: 'tfel_2', name: 'Uygulamalı Felsefe', subTopics: [
        Topic(id: 'tfel_2_1', name: 'Sanat Felsefesi'),
        Topic(id: 'tfel_2_2', name: 'Din Felsefesi'),
        Topic(id: 'tfel_2_3', name: 'Siyaset Felsefesi'),
        Topic(id: 'tfel_2_4', name: 'Bilim Felsefesi'),
      ]),
      Topic(id: 'tfel_3', name: 'Felsefe Tarihi', subTopics: [
        Topic(id: 'tfel_3_1', name: 'MÖ 6. Yüzyıl - MS 2. Yüzyıl'),
        Topic(id: 'tfel_3_2', name: 'MS 2. Yüzyıl - MS 15. Yüzyıl'),
        Topic(id: 'tfel_3_3', name: '15. Yüzyıl - 17. Yüzyıl'),
        Topic(id: 'tfel_3_4', name: '18. Yüzyıl - 19. Yüzyıl'),
        Topic(id: 'tfel_3_5', name: '20. Yüzyıl Felsefesi'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'tyt_din',
    name: 'Din Kültürü (TYT)',
    icon: '🕌',
    topics: [
      Topic(id: 'tdn_1', name: 'İnanç ve İbadet', subTopics: [
        Topic(id: 'tdn_1_1', name: 'Bilgi ve İnanç'),
        Topic(id: 'tdn_1_2', name: 'Allah-İnsan İlişkisi'),
        Topic(id: 'tdn_1_3', name: 'İslam ve İbadet'),
      ]),
      Topic(id: 'tdn_2', name: 'Ahlak ve Değerler', subTopics: [
        Topic(id: 'tdn_2_1', name: 'Gençlik ve Değerler'),
        Topic(id: 'tdn_2_2', name: 'Ahlaki Tutum ve Davranışlar'),
        Topic(id: 'tdn_2_3', name: 'Din ve Hayat'),
      ]),
      Topic(id: 'tdn_3', name: 'İslam ve Hz. Muhammed', subTopics: [
        Topic(id: 'tdn_3_1', name: 'Hz. Muhammed (S.A.V) Hayatı'),
        Topic(id: 'tdn_3_2', name: 'İslam Medeniyeti'),
        Topic(id: 'tdn_3_3', name: 'Mezhepler ve Yorumlar'),
        Topic(id: 'tdn_3_4', name: 'Anadolu\'da İslam'),
      ]),
    ],
  ),
];

const List<CourseTopics> aytCourseTopics = [
  CourseTopics(
    id: 'ayt_mat',
    name: 'Matematik (AYT)',
    icon: '📏',
    topics: [
      Topic(id: 'am_1', name: 'Cebir ve Fonksiyon', subTopics: [
        Topic(id: 'am_1_1', name: 'Fonksiyonlar (İleri Düzey)'),
        Topic(id: 'am_1_2', name: 'Polinomlar'),
        Topic(id: 'am_1_3', name: '2. Dereceden Denklemler'),
        Topic(id: 'am_1_4', name: 'Eşitsizlikler'),
        Topic(id: 'am_1_5', name: 'Karmaşık Sayılar'),
      ]),
      Topic(id: 'am_2', name: 'Trigonometri ve Logaritma', subTopics: [
        Topic(id: 'am_2_1', name: 'Trigonometri'),
        Topic(id: 'am_2_2', name: 'Logaritma'),
        Topic(id: 'am_2_3', name: 'Diziler'),
      ]),
      Topic(id: 'am_3', name: 'LTİ (Limit-Türev-İntegral)', subTopics: [
        Topic(id: 'am_3_1', name: 'Limit ve Süreklilik'),
        Topic(id: 'am_3_2', name: 'Türev ve Uygulamaları'),
        Topic(id: 'am_3_3', name: 'İntegral ve Uygulamaları'),
      ]),
      Topic(id: 'am_4', name: 'Olasılık ve Veri', subTopics: [
        Topic(id: 'am_4_1', name: 'Permütasyon-Kombinasyon-Binom'),
        Topic(id: 'am_4_2', name: 'Olasılık (AYT Seviyesi)'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'ayt_geo',
    name: 'Geometri (AYT)',
    icon: '📐',
    topics: [
      Topic(id: 'ag_1', name: 'Analitik Geometri', subTopics: [
        Topic(id: 'ag_1_1', name: 'Doğrunun Analitiği'),
        Topic(id: 'ag_1_2', name: 'Nokta-Doğru Uzaklığı'),
      ]),
      Topic(id: 'ag_2', name: 'Çember ve Daire', subTopics: [
        Topic(id: 'ag_2_1', name: 'Çemberde Açı ve Uzunluk'),
        Topic(id: 'ag_2_2', name: 'Dairede Alan'),
      ]),
      Topic(id: 'ag_3', name: 'Katı Cisimler', subTopics: [
        Topic(id: 'ag_3_1', name: 'Prizmalar ve Piramitler'),
        Topic(id: 'ag_3_2', name: 'Silindir, Koni ve Küre'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'ayt_edebiyat',
    name: 'Edebiyat (AYT)',
    icon: '📚',
    topics: [
      Topic(id: 'ae_1', name: 'Anlam ve Dil Bilgisi', subTopics: [
        Topic(id: 'ae_1_1', name: 'Sözcük, Cümle, Paragraf Analizi'),
        Topic(id: 'ae_1_2', name: 'Dil Bilgisi Tekrarı'),
      ]),
      Topic(id: 'ae_2', name: 'Şiir ve Sanat', subTopics: [
        Topic(id: 'ae_2_1', name: 'Güzel Sanatlar ve Edebiyat'),
        Topic(id: 'ae_2_2', name: 'Şiir Bilgisi ve Söz Sanatları'),
        Topic(id: 'ae_2_3', name: 'Metinlerin Sınıflandırılması'),
      ]),
      Topic(id: 'ae_3', name: 'Edebiyat Tarihi', subTopics: [
        Topic(id: 'ae_3_1', name: 'İslamiyet Öncesi ve Geçiş Dönemi'),
        Topic(id: 'ae_3_2', name: 'Halk Edebiyatı'),
        Topic(id: 'ae_3_3', name: 'Divan Edebiyatı'),
        Topic(id: 'ae_3_4', name: 'Edebi Akımlar'),
      ]),
      Topic(id: 'ae_4', name: 'Yeni Dönem Edebiyatı', subTopics: [
        Topic(id: 'ae_4_1', name: 'Tanzimat Edebiyatı'),
        Topic(id: 'ae_4_2', name: 'Servet-i Fünun ve Fecr-i Ati'),
        Topic(id: 'ae_4_3', name: 'Milli Edebiyat'),
        Topic(id: 'ae_4_4', name: 'Cumhuriyet Dönemi Edebiyatı'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'ayt_fizik',
    name: 'Fizik (AYT)',
    icon: '⚡',
    topics: [
      Topic(id: 'af_1', name: 'Vektör ve Mekanik', subTopics: [
        Topic(id: 'af_1_1', name: 'Vektörler ve Bağıl Hareket'),
        Topic(id: 'af_1_2', name: 'Newton\'un Hareket Yasaları'),
        Topic(id: 'af_1_3', name: 'Bir Boyutta Sabit İvmeli Hareket'),
        Topic(id: 'af_1_4', name: 'İki Boyutta Hareket (Atışlar)'),
        Topic(id: 'af_1_5', name: 'Enerji ve Momentum'),
        Topic(id: 'af_1_6', name: 'Tork-Denge-Kütle Merkezi'),
        Topic(id: 'af_1_7', name: 'Basit Makineler'),
      ]),
      Topic(id: 'af_2', name: 'Elektrik ve Manyetizma', subTopics: [
        Topic(id: 'af_2_1', name: 'Elektriksel Kuvvet ve Alan'),
        Topic(id: 'af_2_2', name: 'Elektriksel Potansiyel ve Levhalar'),
        Topic(id: 'af_2_3', name: 'Manyetizma ve İndüksiyon'),
        Topic(id: 'af_2_4', name: 'Alternatif Akım ve Transformatörler'),
      ]),
      Topic(id: 'af_3', name: 'Hareket ve Dalga Mekaniği', subTopics: [
        Topic(id: 'af_3_1', name: 'Çembersel Hareket'),
        Topic(id: 'af_3_2', name: 'Basit Harmonik Hareket'),
        Topic(id: 'af_3_3', name: 'Dalga Mekaniği'),
      ]),
      Topic(id: 'af_4', name: 'Modern Fizik', subTopics: [
        Topic(id: 'af_4_1', name: 'Atom Modelleri ve Işıma'),
        Topic(id: 'af_4_2', name: 'Modern Fizik Uygulamaları'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'ayt_kimya',
    name: 'Kimya (AYT)',
    icon: '🧪',
    topics: [
      Topic(id: 'ak_1', name: 'Fiziksel Kimya', subTopics: [
        Topic(id: 'ak_1_1', name: 'Modern Atom Teorisi'),
        Topic(id: 'ak_1_2', name: 'Gazlar'),
        Topic(id: 'ak_1_3', name: 'Sıvı Çözeltiler'),
      ]),
      Topic(id: 'ak_2', name: 'Enerji ve Hız', subTopics: [
        Topic(id: 'ak_2_1', name: 'Kimyasal Tepkimelerde Enerji'),
        Topic(id: 'ak_2_2', name: 'Kimyasal Tepkimelerde Hız'),
        Topic(id: 'ak_2_3', name: 'Kimyasal Denge'),
        Topic(id: 'ak_2_4', name: 'Sulu Çözelti Dengeleri (Asit-Baz)'),
      ]),
      Topic(id: 'ak_3', name: 'Elektrokimya ve Organik', subTopics: [
        Topic(id: 'ak_3_1', name: 'Kimya ve Elektrik'),
        Topic(id: 'ak_3_2', name: 'Organik Kimyaya Giriş'),
        Topic(id: 'ak_3_3', name: 'Organik Bileşikler'),
        Topic(id: 'ak_3_4', name: 'Enerji Kaynakları'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'ayt_biyoloji',
    name: 'Biyoloji (AYT)',
    icon: '🧬',
    topics: [
      Topic(id: 'ab_1', name: 'Sistemler', subTopics: [
        Topic(id: 'ab_1_1', name: 'Denetleyici ve Düzenleyici Sistem'),
        Topic(id: 'ab_1_2', name: 'Duyu Organları'),
        Topic(id: 'ab_1_3', name: 'Destek ve Hareket Sistemi'),
        Topic(id: 'ab_1_4', name: 'Sindirim Sistemi'),
        Topic(id: 'ab_1_5', name: 'Dolaşım ve Bağışıklık Sistemi'),
        Topic(id: 'ab_1_6', name: 'Solunum Sistemi'),
        Topic(id: 'ab_1_7', name: 'Boşaltım Sistemi'),
        Topic(id: 'ab_1_8', name: 'Üreme Sistemi'),
      ]),
      Topic(id: 'ab_2', name: 'Genetik ve Enerji', subTopics: [
        Topic(id: 'ab_2_1', name: 'Genden Proteine'),
        Topic(id: 'ab_2_2', name: 'Canlılarda Enerji Dönüşümleri'),
        Topic(id: 'ab_2_3', name: 'Bitki Biyolojisi'),
        Topic(id: 'ab_2_4', name: 'Komünite ve Popülasyon Ekolojisi'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'ayt_tar',
    name: 'Tarih (AYT)',
    icon: '🏛️',
    topics: [
      Topic(id: 'atr_1', name: 'Tarih ve Zaman - İlk Çağ', subTopics: [
        Topic(id: 'atr_1_1', name: 'Tarih Bilimi ve Uygarlığın Doğuşu'),
        Topic(id: 'atr_1_2', name: 'İlk ve Orta Çağlarda Türk Dünyası'),
      ]),
      Topic(id: 'atr_2', name: 'İslam ve Türk-İslam Tarihi', subTopics: [
        Topic(id: 'atr_2_1', name: 'İslam Medeniyeti'),
        Topic(id: 'atr_2_2', name: 'Türk-İslam Devletleri'),
        Topic(id: 'atr_2_3', name: 'Selçuklu Tarihi'),
      ]),
      Topic(id: 'atr_3', name: 'Osmanlı İmparatorluğu', subTopics: [
        Topic(id: 'atr_3_1', name: 'Beylikten Devlete (1300-1453)'),
        Topic(id: 'atr_3_2', name: 'Dünya Gücü Osmanlı (1453-1600)'),
        Topic(id: 'atr_3_3', name: 'Osmanlı\'da Değişim ve Arayış Yılları'),
        Topic(id: 'atr_3_4', name: '20. Yüzyıl Başında Osmanlı'),
      ]),
      Topic(id: 'atr_4', name: 'T.C. İnkılap Tarihi', subTopics: [
        Topic(id: 'atr_4_1', name: 'Kurtuluş Savaşı Hazırlık ve Cepheler'),
        Topic(id: 'atr_4_2', name: 'Atatürk İlkeleri ve İnkılaplar'),
        Topic(id: 'atr_4_3', name: 'Atatürk Dönemi Türk Dış Politikası'),
      ]),
      Topic(id: 'atr_5', name: 'Çağdaş Türk ve Dünya Tarihi', subTopics: [
        Topic(id: 'atr_5_1', name: 'Soğuk Savaş ve Yumuşama Dönemi'),
        Topic(id: 'atr_5_2', name: 'Küreselleşen Dünya'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'ayt_cog',
    name: 'Coğrafya (AYT)',
    icon: '🗺️',
    topics: [
      Topic(id: 'ac_1', name: 'Ekosistem ve Madde Döngüsü', subTopics: [
        Topic(id: 'ac_1_1', name: 'Biyoçeşitlilik ve Enerji Akışı'),
        Topic(id: 'ac_1_2', name: 'Ekstrem Doğa Olayları'),
      ]),
      Topic(id: 'ac_2', name: 'Beşeri Sistemler', subTopics: [
        Topic(id: 'ac_2_1', name: 'Nüfus Politikaları ve Şehirler'),
        Topic(id: 'ac_2_2', name: 'Ekonomik Faaliyetler ve Doğal Kaynaklar'),
      ]),
      Topic(id: 'ac_3', name: 'Ülkeler ve Bölgeler', subTopics: [
        Topic(id: 'ac_3_1', name: 'Türkiye Ekonomisi ve Sektörler'),
        Topic(id: 'ac_3_2', name: 'Kültür Bölgeleri ve Türk Dünyası'),
        Topic(id: 'ac_3_3', name: 'Küresel ve Bölgesel Örgütler'),
      ]),
      Topic(id: 'ac_4', name: 'Çevre ve Toplum', subTopics: [
        Topic(id: 'ac_4_1', name: 'Çevre Sorunları ve Küresel İklim Değişimi'),
        Topic(id: 'ac_4_2', name: 'Doğal Kaynakların Korunması'),
      ]),
    ],
  ),
  CourseTopics(
    id: 'ayt_fel_grup',
    name: 'Felsefe Grubu (AYT)',
    icon: '🎭',
    topics: [
      Topic(id: 'afg_1', name: 'Psikoloji', subTopics: [
        Topic(id: 'afg_1_1', name: 'Psikolojinin Temel Süreçleri'),
        Topic(id: 'afg_1_2', name: 'Öğrenme, Bellek, Düşünme'),
        Topic(id: 'afg_1_3', name: 'Ruh Sağlığının Temelleri'),
      ]),
      Topic(id: 'afg_2', name: 'Sosyoloji', subTopics: [
        Topic(id: 'afg_2_1', name: 'Birey ve Toplum'),
        Topic(id: 'afg_2_2', name: 'Toplumsal Yapı ve Değişme'),
        Topic(id: 'afg_2_3', name: 'Toplumsal Kurumlar'),
      ]),
      Topic(id: 'afg_3', name: 'Mantık', subTopics: [
        Topic(id: 'afg_3_1', name: 'Klasik Mantık'),
        Topic(id: 'afg_3_2', name: 'Sembolik Mantık'),
      ]),
    ],
  ),
];

List<CourseTopics> getFilteredAytCourseTopics(String branch) {
  List<CourseTopics> filteredAYT = [];

  switch (branch) {
    case 'Sayısal':
      filteredAYT = aytCourseTopics
          .where((c) => ['ayt_mat', 'ayt_geo', 'ayt_fizik', 'ayt_kimya', 'ayt_biyoloji']
              .contains(c.id))
          .toList();
      break;
    case 'Eşit Ağırlık':
      filteredAYT = aytCourseTopics
          .where((c) =>
              ['ayt_mat', 'ayt_geo', 'ayt_edebiyat', 'ayt_tar', 'ayt_cog']
                  .contains(c.id))
          .toList();
      break;
    case 'Sözel':
      filteredAYT = aytCourseTopics
          .where((c) => ['ayt_edebiyat', 'ayt_tar', 'ayt_cog', 'ayt_fel_grup']
              .contains(c.id))
          .toList();
      break;
    default:
      filteredAYT = aytCourseTopics;
  }
  return filteredAYT;
}

List<CourseTopics> getFilteredCourseTopics(String branch) {
  return [...tytCourseTopics, ...getFilteredAytCourseTopics(branch)];
}

const List<CourseTopics> courseTopics = [
  ...tytCourseTopics,
  ...aytCourseTopics
];
