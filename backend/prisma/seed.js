const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const { seedCurriculum } = require('./curriculum_seed');

async function main() {
    console.log('🌱 Tohumlama (Seeding) işlemi başlatılıyor...');

    // Load Curriculum first
    await seedCurriculum(prisma);

    // --- Temizlik (Önceki verileri silme - İlişkisel sırayla) ---
    await prisma.chatMessage.deleteMany({});
    await prisma.sessionAnalysis.deleteMany({});
    await prisma.chatSession.deleteMany({});
    await prisma.exam.deleteMany({});
    await prisma.activityLog.deleteMany({});
    await prisma.guidanceAlert.deleteMany({});
    await prisma.dropStudent.deleteMany({});
    await prisma.wrongTopic.deleteMany({});
    await prisma.studyPlanTopic.deleteMany({});
    await prisma.dailyQuest.deleteMany({});
    await prisma.dailyActivity.deleteMany({});
    await prisma.favoriteQuestion.deleteMany({});
    await prisma.studyNote.deleteMany({});
    await prisma.questionAnalysis.deleteMany({});
    await prisma.student.deleteMany({});

    // --- Dashboard İlk Verileri ---
    await prisma.wrongTopic.createMany({
        data: [
            { topic: "Türev Maks-Min Problemleri", count: 42 },
            { topic: "Optik Kırılma", count: 35 },
            { topic: "Paragrafta Anlam Akışı", count: 28 },
            { topic: "Logaritma Eşitsizlikleri", count: 24 }
        ]
    });

    const students = [
        { name: "Ayşe Yılmaz", target: "Hacettepe Tıp", phone: "05321112233", parent: "Mehmet Yılmaz" },
        { name: "Caner Korkmaz", target: "ODTÜ Bilgisayar", phone: "05332223344", parent: "Selma Korkmaz" },
        { name: "Elif Demir", target: "Boğaziçi İşletme", phone: "05343334455", parent: "Ahmet Demir" },
        { name: "Burak Şahin", target: "İTÜ Yapay Zeka", phone: "05354445566", parent: "Zeynep Şahin" },
        { name: "Zehra Kaya", target: "Ankara Hukuk", phone: "05365556677", parent: "Hasan Kaya" }
    ];

    for (let i = 0; i < students.length; i++) {
        const s = students[i];

        // Öğrenciyi Yarat
        const hashedPassword = await bcrypt.hash('1234', 10);
        const student = await prisma.student.create({
            data: {
                studentNumber: `2024${i + 100}`,
                name: s.name,
                class: i % 2 === 0 ? "12-A" : "12-B",
                target: s.target,
                progress: Math.floor(Math.random() * 40) + 30,
                xp: Math.floor(Math.random() * 5000) + 1000,
                solvedCount: Math.floor(Math.random() * 5000) + 2000,
                parentName: s.parent,
                parentPhone: s.phone,
                reportStatus: "pending",
                username: `ogrenci${i + 1}`,
                password: hashedPassword,
                lastActiveAt: new Date(Date.now() - 3600000)
            }
        });

        console.log(`✅ Öğrenci eklendi: ${student.name}`);

        // Denemeleri Yarat (Son 2 ay, 4 deneme)
        const examDates = ['2023-11-01', '2023-11-15', '2023-12-01', '2023-12-15'];
        let baseTyt = Math.floor(Math.random() * 30) + 50; // 50-80 net bandı
        let baseAyt = Math.floor(Math.random() * 20) + 30; // 30-50 net bandı

        for (const date of examDates) {
            // Öğrenci grafiği genelde artsın
            baseTyt += Math.floor(Math.random() * 4) - 1;
            baseAyt += Math.floor(Math.random() * 4) - 1;

            // Yardımcı fonksiyon: Net değerine göre rastgele D-Y türetme
            const generateDY = (net) => {
                const y = Math.floor(Math.random() * 5); // 0-4 arası yanlış
                const d = Math.ceil(net + (y * 0.25));
                return { d, y, n: parseFloat((d - y * 0.25).toFixed(2)) };
            };

            const tytTur = generateDY(baseTyt * 0.3);
            const tytMat = generateDY(baseTyt * 0.4);
            const tytFiz = generateDY(baseTyt * 0.1);
            const tytKim = generateDY(baseTyt * 0.1);
            const tytBiy = generateDY(baseTyt * 0.1);

            const aytMat = generateDY(baseAyt * 0.6);
            const aytFiz = generateDY(baseAyt * 0.2);
            const aytKim = generateDY(baseAyt * 0.1);
            const aytBiy = generateDY(baseAyt * 0.1);

            await prisma.exam.create({
                data: {
                    studentId: student.id,
                    date: date,
                    tytNet: tytTur.n + tytMat.n + tytFiz.n + tytKim.n + tytBiy.n,
                    tytDogru: tytTur.d + tytMat.d + tytFiz.d + tytKim.d + tytBiy.d,
                    tytYanlis: tytTur.y + tytMat.y + tytFiz.y + tytKim.y + tytBiy.y,

                    tytTur: tytTur.n, tytTurD: tytTur.d, tytTurY: tytTur.y,
                    tytMat: tytMat.n, tytMatD: tytMat.d, tytMatY: tytMat.y,
                    tytFiz: tytFiz.n, tytFizD: tytFiz.d, tytFizY: tytFiz.y,
                    tytKim: tytKim.n, tytKimD: tytKim.d, tytKimY: tytKim.y,
                    tytBiy: tytBiy.n, tytBiyD: tytBiy.d, tytBiyY: tytBiy.y,

                    aytNet: aytMat.n + aytFiz.n + aytKim.n + aytBiy.n,
                    aytDogru: aytMat.d + aytFiz.d + aytKim.d + aytBiy.d,
                    aytYanlis: aytMat.y + aytFiz.y + aytKim.y + aytBiy.y,

                    aytMat: aytMat.n, aytMatD: aytMat.d, aytMatY: aytMat.y,
                    aytFiz: aytFiz.n, aytFizD: aytFiz.d, aytFizY: aytFiz.y,
                    aytKim: aytKim.n, aytKimD: aytKim.d, aytKimY: aytKim.y,
                    aytBiy: aytBiy.n, aytBiyD: aytBiy.d, aytBiyY: aytBiy.y
                }
            });
        }

        // Günlük Aktiviteler (Son 1 hafta)
        for (let d = 0; d < 7; d++) {
            const dateObj = new Date();
            dateObj.setDate(dateObj.getDate() - d);

            await prisma.dailyActivity.create({
                data: {
                    studentId: student.id,
                    date: dateObj.toISOString().split('T')[0],
                    solvedCount: Math.floor(Math.random() * 150) + 50,
                    xp: Math.floor(Math.random() * 300) + 50
                }
            });
        }

        // Rehberlik / Düşüş (Sadece son iki öğrenci için yapalım ki panelde alarm versin)
        if (i > 2) {
            await prisma.guidanceAlert.create({
                data: {
                    studentId: student.id,
                    studentName: student.name,
                    issue: i === 3 ? "Son TYT denemesinde 10 net düşüş" : "Art arda 3 gündür platforma giriş yapmadı",
                    priority: i === 3 ? "High" : "Medium"
                }
            });

            await prisma.dropStudent.create({
                data: {
                    studentId: student.id,
                    name: student.name,
                    dropRate: "-25%",
                    type: "Soru Çözümü"
                }
            });
        }
    }

    // Grafik verisi (Aktivite Yoğunluğu)
    for (let i = 10; i <= 22; i++) {
        await prisma.activityLog.create({
            data: {
                hour: `${i}:00`,
                questions: Math.floor(Math.random() * 800) + 200
            }
        });
    }

    console.log('🎉 Tüm test (seed) verileri başarıyla oluşturuldu!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
