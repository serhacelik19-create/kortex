const { z } = require('zod');

// Şifre Politikası - Güçlü şifre zorunluluğu
const passwordPolicy = z.string()
    .min(8, 'Şifre en az 8 karakter olmalıdır.')
    .max(100, 'Şifre çok uzun.')
    .regex(/[A-Z]/, 'Şifre en az bir büyük harf içermelidir.')
    .regex(/[0-9]/, 'Şifre en az bir rakam içermelidir.');

// Login şeması (mevcut şifrelerle uyumsuzluk olmaması için politika burada uygulanmaz)
const loginSchema = z.object({
    username: z.string()
        .min(1, 'Kullanıcı adı boş olamaz.')
        .max(50, 'Kullanıcı adı çok uzun.')
        .trim(),
    password: z.string()
        .min(1, 'Şifre boş olamaz.')
        .max(100, 'Şifre çok uzun.'),
    institutionSlug: z.string()
        .min(1, 'Kurum slug boş olamaz.')
        .max(100, 'Kurum slug çok uzun.')
        .trim()
        .optional(),
});

// Öğrenci oluşturma şeması (şifre politikası uygulanır)
const createStudentSchema = z.object({
    name: z.string().min(1).max(100).trim(),
    class: z.string().max(20).optional(),
    target: z.string().max(200).optional(),
    studentNumber: z.string().max(20).optional(),
    username: z.string().max(50).optional(),
    password: passwordPolicy.optional(),
    parentName: z.string().max(100).optional(),
    parentPhone: z.string().max(20).optional()
});

// Şifre değiştirme şeması
const changePasswordSchema = z.object({
    newPassword: passwordPolicy
});

// Sınav ekleme şeması
const createExamSchema = z.object({
    student_id: z.number().int().positive(),
    date: z.string(),
    tyt_net: z.number().min(0).max(120).optional(),
    ayt_net: z.number().min(0).max(80).optional()
}).passthrough();

// Genel doğrulama middleware üretici
const validate = (schema) => (req, res, next) => {
    try {
        req.body = schema.parse(req.body);
        next();
    } catch (err) {
        const errors = err.errors?.map(e => e.message).join(', ') || 'Geçersiz veri.';
        res.status(400).json({ error: `Doğrulama hatası: ${errors}` });
    }
};

module.exports = { loginSchema, createStudentSchema, createExamSchema, changePasswordSchema, passwordPolicy, validate };
