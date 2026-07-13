const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

async function seedSerhat() {
    console.log('🚀 Serhat için demo verisi yükleniyor...');
    const client = await pool.connect();

    try {
        // 1. Serhat öğrencisini bul veya oluştur
        let studentId = 82; // Daha önce bulduğumuz ID
        const checkRes = await client.query("SELECT id FROM students WHERE id = $1", [studentId]);
        
        if (checkRes.rows.length === 0) {
            console.log('Serhat bulunamadı, yeni oluşturuluyor...');
            const hashedPassword = await bcrypt.hash('1234', 10);
            const insertStudent = await client.query(
                `INSERT INTO students (name, username, password, institution_id, class, target, branch, progress, xp, solved_count, student_number)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
                ['Serhat', 'serhat_demo', hashedPassword, 1, '12-A', 'Koç Bilgisayar', 'Sayısal', 65, 4500, 3200, '2024999']
            );
            studentId = insertStudent.rows[0].id;
        }

        // 2. Mevcut denemeleri temizle (Sadece Serhat için)
        await client.query("DELETE FROM exams WHERE student_id = $1", [studentId]);
        await client.query("DELETE FROM daily_activities WHERE student_id = $1", [studentId]);

        // 3. Denemeleri Yarat (Son 2 ay, 5 deneme)
        const examDates = ['2024-02-15', '2024-03-01', '2024-03-15', '2024-04-01', '2024-04-15'];
        
        // Serhat başarılı bir öğrenci olsun, netleri artsın
        let baseTyt = 75; 
        let baseAyt = 50;

        for (const date of examDates) {
            baseTyt += Math.floor(Math.random() * 3) + 1;
            baseAyt += Math.floor(Math.random() * 3) + 1;

            const generateDY = (net, max) => {
                const d = Math.min(max, Math.round(net + (Math.random() * 2)));
                const y = Math.floor(Math.random() * 3);
                const n = parseFloat((d - y * 0.25).toFixed(2));
                return { d, y, n };
            };

            const tytTur = generateDY(baseTyt * 0.35, 40);
            const tytMat = generateDY(baseTyt * 0.38, 40);
            const tytFiz = generateDY(baseTyt * 0.08, 7);
            const tytKim = generateDY(baseTyt * 0.08, 7);
            const tytBiy = generateDY(baseTyt * 0.07, 6);
            const tytSos = generateDY(baseTyt * 0.1, 20);

            const aytMat = generateDY(baseAyt * 0.65, 40);
            const aytFiz = generateDY(baseAyt * 0.2, 14);
            const aytKim = generateDY(baseAyt * 0.1, 13);
            const aytBiy = generateDY(baseAyt * 0.1, 13);

            await client.query(
                `INSERT INTO exams (
                    student_id, institution_id, date, 
                    tyt_net, tyt_dogru, tyt_yanlis,
                    tyt_tur, tyt_tur_d, tyt_tur_y,
                    tyt_mat, tyt_mat_d, tyt_mat_y,
                    tyt_fiz, tyt_fiz_d, tyt_fiz_y,
                    tyt_kim, tyt_kim_d, tyt_kim_y,
                    tyt_biy, tyt_biy_d, tyt_biy_y,
                    ayt_net, ayt_dogru, ayt_yanlis,
                    ayt_mat, ayt_mat_d, ayt_mat_y,
                    ayt_fiz, ayt_fiz_d, ayt_fiz_y,
                    ayt_kim, ayt_kim_d, ayt_kim_y,
                    ayt_biy, ayt_biy_d, ayt_biy_y
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)`,
                [
                    studentId, 1, date,
                    (tytTur.n + tytMat.n + tytFiz.n + tytKim.n + tytBiy.n + tytSos.n).toFixed(2),
                    (tytTur.d + tytMat.d + tytFiz.d + tytKim.d + tytBiy.d + tytSos.d),
                    (tytTur.y + tytMat.y + tytFiz.y + tytKim.y + tytBiy.y + tytSos.y),
                    tytTur.n, tytTur.d, tytTur.y,
                    tytMat.n, tytMat.d, tytMat.y,
                    tytFiz.n, tytFiz.d, tytFiz.y,
                    tytKim.n, tytKim.d, tytKim.y,
                    tytBiy.n, tytBiy.d, tytBiy.y,
                    (aytMat.n + aytFiz.n + aytKim.n + aytBiy.n).toFixed(2),
                    (aytMat.d + aytFiz.d + aytKim.d + aytBiy.d),
                    (aytMat.y + aytFiz.y + aytKim.y + aytBiy.y),
                    aytMat.n, aytMat.d, aytMat.y,
                    aytFiz.n, aytFiz.d, aytFiz.y,
                    aytKim.n, aytKim.d, aytKim.y,
                    aytBiy.n, aytBiy.d, aytBiy.y
                ]
            );
        }

        // 4. Günlük Aktivite (Grafik için)
        for (let d = 0; d < 10; d++) {
            const dateObj = new Date();
            dateObj.setDate(dateObj.getDate() - d);
            const dateStr = dateObj.toISOString().split('T')[0];

            await client.query(
                `INSERT INTO daily_activities (student_id, date, solved_count, xp)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (student_id, date) DO UPDATE SET solved_count = EXCLUDED.solved_count, xp = EXCLUDED.xp`,
                [studentId, dateStr, Math.floor(Math.random() * 200) + 100, Math.floor(Math.random() * 500) + 200]
            );
        }

        console.log('✅ Serhat için deneme ve aktivite verileri başarıyla yüklendi!');

    } catch (e) {
        console.error('❌ Hata:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

seedSerhat();
