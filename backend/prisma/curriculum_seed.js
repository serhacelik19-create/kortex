const curriculumData = [
    {
        id: 'tyt_tur',
        name: 'Türkçe (TYT)',
        icon: '✍️',
        examType: 'TYT',
        branches: 'Sayısal,Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'tt_1', name: 'Anlam Bilgisi', subTopics: [
                    { id: 'tt_1_1', name: 'Sözcükte Anlam' },
                    { id: 'tt_1_2', name: 'Cümlede Anlam' },
                    { id: 'tt_1_3', name: 'Paragrafta Anlam' },
                    { id: 'tt_1_4', name: 'Paragrafta Anlatım Biçimleri' },
                    { id: 'tt_1_5', name: 'Paragrafta Yapı' },
                ]
            },
            {
                id: 'tt_2', name: 'Dil Bilgisi', subTopics: [
                    { id: 'tt_2_1', name: 'Ses Bilgisi' },
                    { id: 'tt_2_2', name: 'Yazım Kuralları' },
                    { id: 'tt_2_3', name: 'Noktalama İşaretleri' },
                    { id: 'tt_2_4', name: 'Sözcükte Yapı / Ekler' },
                    { id: 'tt_2_5', name: 'Sözcük Türleri (İsim, Sıfat, Zamir...)' },
                    { id: 'tt_2_6', name: 'Fiiller (Kip, Kişi, Yapı)' },
                    { id: 'tt_2_7', name: 'Fiilimsiler' },
                    { id: 'tt_2_8', name: 'Fiilde Çatı' },
                    { id: 'tt_2_9', name: 'Cümlenin Ögeleri' },
                    { id: 'tt_2_10', name: 'Cümle Türleri' },
                    { id: 'tt_2_11', name: 'Anlatım Bozuklukları' },
                ]
            },
        ],
    },
    {
        id: 'tyt_mat',
        name: 'Matematik (TYT)',
        icon: '📐',
        examType: 'TYT',
        branches: 'Sayısal,Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'tm_1', name: 'Sayılar', subTopics: [
                    { id: 'tm_1_1', name: 'Temel Kavramlar' },
                    { id: 'tm_1_2', name: 'Sayı Basamakları' },
                    { id: 'tm_1_3', name: 'Bölme ve Bölünebilme' },
                    { id: 'tm_1_4', name: 'EBOB-EKOK' },
                    { id: 'tm_1_5', name: 'Rasyonel Sayılar' },
                    { id: 'tm_1_6', name: 'Basit Eşitsizlikler' },
                    { id: 'tm_1_7', name: 'Mutlak Değer' },
                    { id: 'tm_1_8', name: 'Üslü Sayılar' },
                    { id: 'tm_1_9', name: 'Köklü Sayılar' },
                    { id: 'tm_1_10', name: 'Çarpanlara Ayırma' },
                ]
            },
            {
                id: 'tm_2', name: 'Denklem ve Eşitsizlikler', subTopics: [
                    { id: 'tm_2_1', name: 'Oran-Orantı' },
                    { id: 'tm_2_2', name: 'Denklem Çözme' },
                ]
            },
            {
                id: 'tm_3', name: 'Problemler', subTopics: [
                    { id: 'tm_3_1', name: 'Sayı-Kesir Problemleri' },
                    { id: 'tm_3_2', name: 'Yaş Problemleri' },
                    { id: 'tm_3_3', name: 'Yüzde-Kar-Zarar Problemleri' },
                    { id: 'tm_3_4', name: 'Karışım Problemleri' },
                    { id: 'tm_3_5', name: 'Hareket Problemleri' },
                    { id: 'tm_3_6', name: 'Rutin Olmayan Problemler' },
                ]
            },
            {
                id: 'tm_4', name: 'Diğer Konular', subTopics: [
                    { id: 'tm_4_1', name: 'Mantık' },
                    { id: 'tm_4_2', name: 'Kümeler' },
                    { id: 'tm_4_3', name: 'Fonksiyonlar' },
                    { id: 'tm_4_4', name: 'Polinomlar' },
                    { id: 'tm_4_5', name: '2. Dereceden Denklemler' },
                    { id: 'tm_4_6', name: 'Permütasyon-Kombinasyon' },
                    { id: 'tm_4_7', name: 'Binom-Olasılık' },
                    { id: 'tm_4_8', name: 'İstatistik' },
                ]
            },
        ],
    },
    {
        id: 'tyt_geo',
        name: 'Geometri (TYT)',
        icon: '📏',
        examType: 'TYT',
        branches: 'Sayısal,Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'tg_1', name: 'Üçgenler', subTopics: [
                    { id: 'tg_1_1', name: 'Doğruda ve Üçgende Açılar' },
                    { id: 'tg_1_2', name: 'Özel Üçgenler' },
                    { id: 'tg_1_3', name: 'Açı-Kenar Bağıntıları' },
                    { id: 'tg_1_4', name: 'Açıortay-Kenarortay' },
                    { id: 'tg_1_5', name: 'Eşlik ve Benzerlik' },
                    { id: 'tg_1_6', name: 'Üçgende Alan' },
                ]
            },
            {
                id: 'tg_2', name: 'Dörtgenler ve Çokgenler', subTopics: [
                    { id: 'tg_2_1', name: 'Çokgenler' },
                    { id: 'tg_2_2', name: 'Dörtgenler' },
                    { id: 'tg_2_3', name: 'Yamuk' },
                    { id: 'tg_2_4', name: 'Paralelkenar-Eşkenar Dörtgen' },
                    { id: 'tg_2_5', name: 'Dikdörtgen-Kare-Deltoid' },
                ]
            },
            {
                id: 'tg_3', name: 'Çember ve Daire', subTopics: [
                    { id: 'tg_3_1', name: 'Çemberde Açı-Uzunluk' },
                    { id: 'tg_3_2', name: 'Dairede Alan' },
                ]
            },
            {
                id: 'tg_4', name: 'Katı Cisimler ve Analitik', subTopics: [
                    { id: 'tg_4_1', name: 'Katı Cisimler' },
                    { id: 'tg_4_2', name: 'Analitik Geometri' },
                ]
            },
        ],
    },
    {
        id: 'tyt_fiz',
        name: 'Fizik (TYT)',
        icon: '⚛️',
        examType: 'TYT',
        branches: 'Sayısal,Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'tf_1', name: 'Madde ve Kuvvet', subTopics: [
                    { id: 'tf_1_1', name: 'Fizik Bilimine Giriş' },
                    { id: 'tf_1_2', name: 'Madde ve Özellikleri' },
                    { id: 'tf_1_3', name: 'Hareket ve Kuvvet' },
                    { id: 'tf_1_4', name: 'Dinamik' },
                ]
            },
            {
                id: 'tf_2', name: 'Enerji ve Mekanik', subTopics: [
                    { id: 'tf_2_1', name: 'İş, Güç ve Enerji' },
                    { id: 'tf_2_2', name: 'Basınç' },
                    { id: 'tf_2_3', name: 'Kaldırma Kuvveti' },
                    { id: 'tf_2_4', name: 'Isı, Sıcaklık ve Genleşme' },
                ]
            },
            {
                id: 'tf_3', name: 'Dalga ve Işık', subTopics: [
                    { id: 'tf_3_1', name: 'Elektrostatik' },
                    { id: 'tf_3_2', name: 'Elektrik ve Manyetizma' },
                    { id: 'tf_3_3', name: 'Optik' },
                    { id: 'tf_3_4', name: 'Dalgalar' },
                ]
            },
        ],
    },
    {
        id: 'tyt_kim',
        name: 'Kimya (TYT)',
        icon: '🧪',
        examType: 'TYT',
        branches: 'Sayısal,Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'tk_1', name: 'Kimya Bilimi', subTopics: [
                    { id: 'tk_1_1', name: 'Kimya Bilimi ve Güvenlik' },
                    { id: 'tk_1_2', name: 'Atom ve Periyodik Sistem' },
                    { id: 'tk_1_3', name: 'Kimyasal Türler Arası Etkileşimler' },
                ]
            },
            {
                id: 'tk_2', name: 'Maddenin Halleri ve Doğa', subTopics: [
                    { id: 'tk_2_1', name: 'Maddenin Halleri' },
                    { id: 'tk_2_2', name: 'Doğa ve Kimya' },
                    { id: 'tk_2_3', name: 'Karışımlar' },
                ]
            },
            {
                id: 'tk_3', name: 'Temel Tepkimeler', subTopics: [
                    { id: 'tk_3_1', name: 'Asitler, Bazlar ve Tuzlar' },
                    { id: 'tk_3_2', name: 'Kimya Her Yerde' },
                ]
            },
        ],
    },
    {
        id: 'tyt_biy',
        name: 'Biyoloji (TYT)',
        icon: '🧬',
        examType: 'TYT',
        branches: 'Sayısal,Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'tb_1', name: 'Canlılar Dünyası', subTopics: [
                    { id: 'tb_1_1', name: 'Canlıların Ortak Özellikleri' },
                    { id: 'tb_1_2', name: 'Canlıların Temel Bileşenleri' },
                    { id: 'tb_1_3', name: 'Hücre' },
                    { id: 'tb_1_4', name: 'Canlıların Sınıflandırılması' },
                ]
            },
            {
                id: 'tb_2', name: 'Canlılık Süreçleri', subTopics: [
                    { id: 'tb_2_1', name: 'Hücresel Solunum' },
                    { id: 'tb_2_2', name: 'Fotosentez' },
                    { id: 'tb_2_3', name: 'Mitoz ve Eşeysiz Üreme' },
                    { id: 'tb_2_4', name: 'Mayoz ve Eşeyli Üreme' },
                ]
            },
            {
                id: 'tb_3', name: 'Genetik ve Ekoloji', subTopics: [
                    { id: 'tb_3_1', name: 'Kalıtımın Genel İlkeleri' },
                    { id: 'tb_3_2', name: 'Ekosistem Ekolojisi' },
                    { id: 'tb_3_3', name: 'Güncel Çevre Sorunları' },
                ]
            },
        ],
    },
    {
        id: 'tyt_tar',
        name: 'Tarih (TYT)',
        icon: '🏛️',
        examType: 'TYT',
        branches: 'Sayısal,Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'th_1', name: 'İlk Uygarlıklar ve Eski Çağ', subTopics: [
                    { id: 'th_1_1', name: 'Tarih Bilimine Giriş' },
                    { id: 'th_1_2', name: 'İlk Çağ Uygarlıkları' },
                    { id: 'th_1_3', name: 'İslamiyet Öncesi Türk Tarihi' },
                ]
            },
            {
                id: 'th_2', name: 'İslam ve Türk Devletleri', subTopics: [
                    { id: 'th_2_1', name: 'İslam Tarihi ve Uygarlığı' },
                    { id: 'th_2_2', name: 'İlk Türk İslam Devletleri' },
                    { id: 'th_2_3', name: 'Türkiye Tarihi' },
                ]
            },
            {
                id: 'th_3', name: 'Osmanlı ve İnkılap', subTopics: [
                    { id: 'th_3_1', name: 'Beylikten Devlete Osmanlı' },
                    { id: 'th_3_2', name: 'Dünya Gücü Osmanlı' },
                    { id: 'th_3_3', name: 'Milli Mücadele ve Atatürk İlkeleri' },
                ]
            },
        ],
    },
    {
        id: 'tyt_cog',
        name: 'Coğrafya (TYT)',
        icon: '🌍',
        examType: 'TYT',
        branches: 'Sayısal,Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'tc_1', name: 'Doğal Sistemler', subTopics: [
                    { id: 'tc_1_1', name: 'Doğa ve İnsan' },
                    { id: 'tc_1_2', name: 'Harita Bilgisi' },
                    { id: 'tc_1_3', name: 'Atmosfer ve İklim' },
                    { id: 'tc_1_4', name: 'Yeryüzü Şekilleri' },
                ]
            },
            {
                id: 'tc_2', name: 'Beşeri ve Ekonomik Sistemler', subTopics: [
                    { id: 'tc_2_1', name: 'Nüfus ve Yerleşme' },
                    { id: 'tc_2_2', name: 'Ekonomik Faaliyetler' },
                    { id: 'tc_2_3', name: 'Bölgeler' },
                ]
            },
            {
                id: 'tc_3', name: 'Türkiye Coğrafyası', subTopics: [
                    { id: 'tc_3_1', name: 'Türkiye’nin Yer Şekilleri' },
                    { id: 'tc_3_2', name: 'Türkiye’de Nüfus ve Yerleşme' },
                    { id: 'tc_3_3', name: 'Çevre ve Toplum' },
                ]
            },
        ],
    },
    {
        id: 'tyt_fel',
        name: 'Felsefe (TYT)',
        icon: '💭',
        examType: 'TYT',
        branches: 'Sayısal,Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'tfel_1', name: 'Felsefeye Giriş', subTopics: [
                    { id: 'tfel_1_1', name: 'Felsefenin Konusu ve Problemleri' },
                    { id: 'tfel_1_2', name: 'Bilgi Felsefesi' },
                    { id: 'tfel_1_3', name: 'Varlık Felsefesi' },
                ]
            },
            {
                id: 'tfel_2', name: 'Ahlak ve Siyaset', subTopics: [
                    { id: 'tfel_2_1', name: 'Ahlak Felsefesi' },
                    { id: 'tfel_2_2', name: 'Siyaset Felsefesi' },
                    { id: 'tfel_2_3', name: 'Din Felsefesi' },
                ]
            },
            {
                id: 'tfel_3', name: 'Psikoloji ve Mantık', subTopics: [
                    { id: 'tfel_3_1', name: 'Psikolojinin Temel Süreçleri' },
                    { id: 'tfel_3_2', name: 'Sosyolojinin Temel Kavramları' },
                    { id: 'tfel_3_3', name: 'Mantığa Giriş' },
                ]
            },
        ],
    },
    {
        id: 'tyt_din',
        name: 'Din Kültürü (TYT)',
        icon: '✨',
        examType: 'TYT',
        branches: 'Sayısal,Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'td_1', name: 'İnanç ve İbadet', subTopics: [
                    { id: 'td_1_1', name: 'Bilgi ve İnanç' },
                    { id: 'td_1_2', name: 'İslam’da İbadetler' },
                    { id: 'td_1_3', name: 'Ahlaki Tutum ve Davranışlar' },
                ]
            },
            {
                id: 'td_2', name: 'Hz. Muhammed ve Kur’an', subTopics: [
                    { id: 'td_2_1', name: 'Hz. Muhammed’in Hayatı' },
                    { id: 'td_2_2', name: 'Kur’an-ı Kerim ve Özellikleri' },
                    { id: 'td_2_3', name: 'İslam Düşüncesinde Yorumlar' },
                ]
            },
            {
                id: 'td_3', name: 'Din, Kültür ve Medeniyet', subTopics: [
                    { id: 'td_3_1', name: 'Din ve Laiklik' },
                    { id: 'td_3_2', name: 'Güncel Dini Meseleler' },
                    { id: 'td_3_3', name: 'Hint ve Çin Dinleri' },
                ]
            },
        ],
    },
    {
        id: 'ayt_mat',
        name: 'Matematik (AYT)',
        icon: '📏',
        examType: 'AYT',
        branches: 'Sayısal,Eşit Ağırlık',
        topics: [
            {
                id: 'am_1', name: 'Cebir ve Fonksiyon', subTopics: [
                    { id: 'am_1_1', name: 'Fonksiyonlar (İleri Düzey)' },
                    { id: 'am_1_2', name: 'Polinomlar' },
                    { id: 'am_1_3', name: '2. Dereceden Denklemler' },
                    { id: 'am_1_4', name: 'Eşitsizlikler' },
                    { id: 'am_1_5', name: 'Karmaşık Sayılar' },
                ]
            },
            {
                id: 'am_2', name: 'Trigonometri ve Logaritma', subTopics: [
                    { id: 'am_2_1', name: 'Trigonometri' },
                    { id: 'am_2_2', name: 'Logaritma' },
                    { id: 'am_2_3', name: 'Diziler' },
                ]
            },
            {
                id: 'am_3', name: 'LTİ (Limit-Türev-İntegral)', subTopics: [
                    { id: 'am_3_1', name: 'Limit ve Süreklilik' },
                    { id: 'am_3_2', name: 'Türev ve Uygulamaları' },
                    { id: 'am_3_3', name: 'İntegral ve Uygulamaları' },
                ]
            },
        ],
    },
    {
        id: 'ayt_geo',
        name: 'Geometri (AYT)',
        icon: '📐',
        examType: 'AYT',
        branches: 'Sayısal,Eşit Ağırlık',
        topics: [
            {
                id: 'ag_1', name: 'Analitik Geometri', subTopics: [
                    { id: 'ag_1_1', name: 'Doğrunun Analitiği' },
                    { id: 'ag_1_2', name: 'Nokta-Doğru Uzaklığı' },
                ]
            },
            {
                id: 'ag_2', name: 'Çember ve Daire', subTopics: [
                    { id: 'ag_2_1', name: 'Çemberde Açı ve Uzunluk' },
                    { id: 'ag_2_2', name: 'Dairede Alan' },
                ]
            },
            {
                id: 'ag_3', name: 'Katı Cisimler', subTopics: [
                    { id: 'ag_3_1', name: 'Prizmalar ve Piramitler' },
                    { id: 'ag_3_2', name: 'Silindir, Koni ve Küre' },
                ]
            },
        ],
    },
    {
        id: 'ayt_fizik',
        name: 'Fizik (AYT)',
        icon: '⚡',
        examType: 'AYT',
        branches: 'Sayısal',
        topics: [
            {
                id: 'af_1', name: 'Vektör ve Mekanik', subTopics: [
                    { id: 'af_1_1', name: 'Vektörler ve Bağıl Hareket' },
                    { id: 'af_1_2', name: 'Newton\'un Hareket Yasaları' },
                    { id: 'af_1_5', name: 'Enerji ve Momentum' },
                ]
            },
            {
                id: 'af_2', name: 'Elektrik ve Manyetizma', subTopics: [
                    { id: 'af_2_1', name: 'Elektriksel Kuvvet ve Alan' },
                    { id: 'af_2_3', name: 'Manyetizma ve İndüksiyon' },
                ]
            },
        ],
    },
    {
        id: 'ayt_kimya',
        name: 'Kimya (AYT)',
        icon: '🧪',
        examType: 'AYT',
        branches: 'Sayısal',
        topics: [
            {
                id: 'ak_1', name: 'Fiziksel Kimya', subTopics: [
                    { id: 'ak_1_1', name: 'Modern Atom Teorisi' },
                    { id: 'ak_1_2', name: 'Gazlar' },
                    { id: 'ak_1_3', name: 'Sıvı Çözeltiler' },
                ]
            },
            {
                id: 'ak_2', name: 'Enerji ve Hız', subTopics: [
                    { id: 'ak_2_1', name: 'Kimyasal Tepkimelerde Enerji' },
                    { id: 'ak_2_2', name: 'Kimyasal Tepkimelerde Hız' },
                    { id: 'ak_2_3', name: 'Kimyasal Denge' },
                    { id: 'ak_2_4', name: 'Sulu Çözelti Dengeleri (Asit-Baz)' },
                ]
            },
            {
                id: 'ak_3', name: 'Elektrokimya ve Organik', subTopics: [
                    { id: 'ak_3_1', name: 'Kimya ve Elektrik' },
                    { id: 'ak_3_2', name: 'Organik Kimyaya Giriş' },
                    { id: 'ak_3_3', name: 'Organik Bileşikler' },
                    { id: 'ak_3_4', name: 'Enerji Kaynakları' },
                ]
            },
        ],
    },
    {
        id: 'ayt_biyoloji',
        name: 'Biyoloji (AYT)',
        icon: '🧬',
        examType: 'AYT',
        branches: 'Sayısal',
        topics: [
            {
                id: 'ab_1', name: 'Sistemler', subTopics: [
                    { id: 'ab_1_1', name: 'Denetleyici ve Düzenleyici Sistem' },
                    { id: 'ab_1_2', name: 'Duyu Organları' },
                    { id: 'ab_1_3', name: 'Destek ve Hareket Sistemi' },
                    { id: 'ab_1_4', name: 'Sindirim Sistemi' },
                    { id: 'ab_1_5', name: 'Dolaşım ve Bağışıklık Sistemi' },
                    { id: 'ab_1_6', name: 'Solunum Sistemi' },
                    { id: 'ab_1_7', name: 'Boşaltım Sistemi' },
                    { id: 'ab_1_8', name: 'Üreme Sistemi' },
                ]
            },
            {
                id: 'ab_2', name: 'Genetik ve Enerji', subTopics: [
                    { id: 'ab_2_1', name: 'Genden Proteine' },
                    { id: 'ab_2_2', name: 'Canlılarda Enerji Dönüşümleri' },
                    { id: 'ab_2_3', name: 'Bitki Biyolojisi' },
                    { id: 'ab_2_4', name: 'Komünite ve Popülasyon Ekolojisi' },
                ]
            },
        ],
    },
    {
        id: 'ayt_edebiyat',
        name: 'Edebiyat (AYT)',
        icon: '📚',
        examType: 'AYT',
        branches: 'Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'ae_3', name: 'Edebiyat Tarihi', subTopics: [
                    { id: 'ae_3_1', name: 'İslamiyet Öncesi ve Geçiş Dönemi' },
                    { id: 'ae_3_2', name: 'Halk Edebiyatı' },
                    { id: 'ae_3_3', name: 'Divan Edebiyatı' },
                    { id: 'ae_3_4', name: 'Edebi Akımlar' },
                ]
            },
            {
                id: 'ae_4', name: 'Yeni Dönem Edebiyatı', subTopics: [
                    { id: 'ae_4_3', name: 'Milli Edebiyat' },
                    { id: 'ae_4_4', name: 'Cumhuriyet Dönemi Edebiyatı' },
                ]
            },
        ],
    },
    {
        id: 'ayt_tarih1',
        name: 'Tarih-1 (AYT)',
        icon: '📜',
        examType: 'AYT',
        branches: 'Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'at1_1', name: 'Osmanlı ve Dünya', subTopics: [
                    { id: 'at1_1_1', name: 'Osmanlı Kültür ve Medeniyeti' },
                    { id: 'at1_1_2', name: '17. ve 18. Yüzyılda Osmanlı' },
                    { id: 'at1_1_3', name: '19. Yüzyılda Osmanlı Devleti' },
                ]
            },
            {
                id: 'at1_2', name: 'İnkılap ve Çağdaş Türk Tarihi', subTopics: [
                    { id: 'at1_2_1', name: 'Kurtuluş Savaşı Hazırlık Dönemi' },
                    { id: 'at1_2_2', name: 'Atatürk İlke ve İnkılapları' },
                    { id: 'at1_2_3', name: 'II. Dünya Savaşı ve Sonrası' },
                ]
            },
        ],
    },
    {
        id: 'ayt_cog1',
        name: 'Coğrafya-1 (AYT)',
        icon: '🗺️',
        examType: 'AYT',
        branches: 'Eşit Ağırlık,Sözel',
        topics: [
            {
                id: 'ac1_1', name: 'Doğal Ortam', subTopics: [
                    { id: 'ac1_1_1', name: 'Ekstrem Doğa Olayları' },
                    { id: 'ac1_1_2', name: 'Türkiye’de Doğal Sistemler' },
                    { id: 'ac1_1_3', name: 'Biyoçeşitlilik' },
                ]
            },
            {
                id: 'ac1_2', name: 'Beşeri Ortam', subTopics: [
                    { id: 'ac1_2_1', name: 'Nüfus Politikaları' },
                    { id: 'ac1_2_2', name: 'Yerleşmelerin Özellikleri' },
                    { id: 'ac1_2_3', name: 'Ekonomik Faaliyetler ve Kalkınma' },
                ]
            },
        ],
    },
    {
        id: 'ayt_tarih2',
        name: 'Tarih-2 (AYT)',
        icon: '🏺',
        examType: 'AYT',
        branches: 'Sözel',
        topics: [
            {
                id: 'at2_1', name: 'İlk ve Orta Çağ Tarihi', subTopics: [
                    { id: 'at2_1_1', name: 'İlk Türk Devletleri' },
                    { id: 'at2_1_2', name: 'İslam Tarihi ve Uygarlığı' },
                    { id: 'at2_1_3', name: 'Türk-İslam Devletleri' },
                ]
            },
            {
                id: 'at2_2', name: 'Yeni ve Yakın Çağ', subTopics: [
                    { id: 'at2_2_1', name: 'Beylikten Devlete Osmanlı' },
                    { id: 'at2_2_2', name: 'Değişen Dünya Dengeleri' },
                    { id: 'at2_2_3', name: '20. Yüzyıl Başlarında Dünya' },
                ]
            },
        ],
    },
    {
        id: 'ayt_cog2',
        name: 'Coğrafya-2 (AYT)',
        icon: '🌐',
        examType: 'AYT',
        branches: 'Sözel',
        topics: [
            {
                id: 'ac2_1', name: 'Küresel Ortam', subTopics: [
                    { id: 'ac2_1_1', name: 'Jeopolitik Konum' },
                    { id: 'ac2_1_2', name: 'Uluslararası Ulaşım Hatları' },
                    { id: 'ac2_1_3', name: 'Doğal Kaynaklar ve Çevre' },
                ]
            },
            {
                id: 'ac2_2', name: 'Türkiye ve Bölgeler', subTopics: [
                    { id: 'ac2_2_1', name: 'Türkiye Ekonomisi' },
                    { id: 'ac2_2_2', name: 'Bölgeler ve Ülkeler' },
                    { id: 'ac2_2_3', name: 'Küresel Ticaret' },
                ]
            },
        ],
    },
    {
        id: 'ayt_felsefe',
        name: 'Felsefe Grubu (AYT)',
        icon: '🧠',
        examType: 'AYT',
        branches: 'Sözel',
        topics: [
            {
                id: 'afg_1', name: 'Felsefe', subTopics: [
                    { id: 'afg_1_1', name: 'Bilgi Felsefesi' },
                    { id: 'afg_1_2', name: 'Bilim Felsefesi' },
                    { id: 'afg_1_3', name: 'Sanat Felsefesi' },
                ]
            },
            {
                id: 'afg_2', name: 'Psikoloji ve Sosyoloji', subTopics: [
                    { id: 'afg_2_1', name: 'Psikolojinin Alanı' },
                    { id: 'afg_2_2', name: 'Sosyolojide Toplumsal Yapı' },
                    { id: 'afg_2_3', name: 'Toplumsal Değişme' },
                ]
            },
            {
                id: 'afg_3', name: 'Mantık', subTopics: [
                    { id: 'afg_3_1', name: 'Klasik Mantık' },
                    { id: 'afg_3_2', name: 'Sembolik Mantık' },
                    { id: 'afg_3_3', name: 'Akıl Yürütme' },
                ]
            },
        ],
    },
    {
        id: 'ayt_din',
        name: 'Din Kültürü (AYT)',
        icon: '🕊️',
        examType: 'AYT',
        branches: 'Sözel',
        topics: [
            {
                id: 'ad_1', name: 'Kur’an ve Yorum', subTopics: [
                    { id: 'ad_1_1', name: 'Kur’an’ın Temel Konuları' },
                    { id: 'ad_1_2', name: 'İslam’da Yorum Çeşitleri' },
                    { id: 'ad_1_3', name: 'Tasavvufi Yorumlar' },
                ]
            },
            {
                id: 'ad_2', name: 'Din, Ahlak ve Medeniyet', subTopics: [
                    { id: 'ad_2_1', name: 'İslam ve Bilim' },
                    { id: 'ad_2_2', name: 'Ahlaki Tutumlar' },
                    { id: 'ad_2_3', name: 'Dinler Tarihi' },
                ]
            },
        ],
    },
    // ... (More can be added, but this is enough to demonstrate the dynamic filtering)
];

async function seedCurriculum(prisma) {
    console.log('🚀 Müfredat tohumlanıyor...');

    // Clear existing
    await prisma.curriculumTopic.deleteMany({});
    await prisma.curriculumCourse.deleteMany({});

    for (const course of curriculumData) {
        const createdCourse = await prisma.curriculumCourse.create({
            data: {
                id: course.id,
                name: course.name,
                icon: course.icon,
                examType: course.examType,
                branches: course.branches,
            }
        });

        for (const topic of course.topics) {
            const createdTopic = await prisma.curriculumTopic.create({
                data: {
                    id: topic.id,
                    courseId: createdCourse.id,
                    name: topic.name,
                }
            });

            if (topic.subTopics) {
                for (const sub of topic.subTopics) {
                    await prisma.curriculumTopic.create({
                        data: {
                            id: sub.id,
                            courseId: createdCourse.id,
                            name: sub.name,
                            parentId: createdTopic.id,
                        }
                    });
                }
            }
        }
    }
    console.log('✅ Müfredat başarıyla yüklendi.');
}

module.exports = { seedCurriculum };
