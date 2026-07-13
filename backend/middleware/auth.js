const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const requireStudentHmac = process.env.REQUIRE_STUDENT_HMAC === 'true';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET ortam değişkeni tanımlı değil! Sunucu başlatılamıyor.');
    process.exit(1);
}

// JWT Token doğrulama middleware'i
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;
    const cookieToken = req.cookies && req.cookies.token ? req.cookies.token : null;

    if ((!authHeader || !authHeader.startsWith('Bearer ')) && !queryToken && !cookieToken) {
        return res.status(401).json({ error: 'Erişim reddedildi. Token bulunamadı.' });
    }

    let token = queryToken || cookieToken;
    let isBearer = false;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
        isBearer = true;
    }

    // CSRF Koruması: Eğer istek Cookie ile geliyorsa (Panel), X-Panel-Request başlığı zorunlu olmalı
    if (!isBearer && cookieToken) {
        if (req.headers['x-panel-request'] !== 'true') {
            return res.status(403).json({ error: 'CSRF Koruma İhlali: X-Panel-Request başlığı bulunamadı.' });
        }
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        // Optional hardening for controlled clients. Disabled by default so the
        // mobile app does not need to embed a reusable shared secret.
        if (decoded.role === 'student' && requireStudentHmac) {
            const signature = req.headers['x-signature'];
            const timestamp = req.headers['x-timestamp'];

            if (!signature || !timestamp) {
                return res.status(403).json({ error: 'Güvenlik Protokolü İhlali (HMAC İmzası Eksik).' });
            }

            // Zaman Aşımı Koruması (Replay Attack - Maksimum 2 Dakika)
            const now = Date.now();
            if (Math.abs(now - parseInt(timestamp)) > 2 * 60 * 1000) {
                return res.status(403).json({ error: 'İstek Zaman Aşımı (Replay Attack Önlemi).' });
            }

            const expectedSignature = require('crypto').createHmac('sha256', process.env.HMAC_SECRET)
                .update(timestamp)
                .digest('hex');

            if (signature !== expectedSignature) {
                return res.status(403).json({ error: 'İstek Bütünlüğü Doğrulanamadı (Veri Değiştirilmiş).' });
            }
        }

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.', expired: true });
        }
        return res.status(401).json({ error: 'Geçersiz token.' });
    }
};

// Rol bazlı yetkilendirme middleware'i
// Kullanım: requireRole('admin') veya requireRole('admin', 'student')
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
    }

    // Super admin her şeye erişebilir
    if (req.user.role === 'super_admin') return next();

    // Sadece belirtilen role sahip olanlar (Örn: admin aranıyorsa ve admin ise)
    if (roles.includes(req.user.role)) return next();

    // ALT HESAP ESNEKLİĞİ: Teacher veya Editor sisteme girebilsin diye 
    // admin isteyen temel API uçlarında onlara yol veriyoruz. 
    // Detaylı sınırlandırmayı (Erişim Yetkileri/Permissions) arayüzde yapıyoruz.
    if (['teacher', 'editor'].includes(req.user.role) && roles.includes('admin')) {
        return next();
    }

    return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
};

// IDOR koruması: Öğrenci sadece kendi verisine erişebilir, admin sadece kendi kurumuna erişebilir.
// Süper admin her yere erişebilir.
const ownershipCheck = (req, res, next) => {
    if (req.user.role === 'super_admin') return next();

    // Kurumsal admin sadece kendi kurumundaki verileri yönetebilir
    if (req.user.role === 'admin') {
        // Eğer bir student ID sorgulanıyorsa, o öğrencinin aynı kurumda olup olmadığı kontrol edilmeli.
        // Bu mantık server.js içinde prisma sorgularında 'where: { institutionId: req.user.institutionId }' ile sağlanacak.
        return next();
    }

    if (req.user.id !== parseInt(req.params.id)) {
        return res.status(403).json({ error: 'Bu kaynağa erişim yetkiniz yok.' });
    }
    next();
};

// Token üretme yardımcısı
const generateToken = (payload, expiresIn = '24h') => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

const hashBearerToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const parentAuthMiddleware = (prisma) => async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Veli oturumu bulunamadı.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Veli oturumu bulunamadı.' });
    }

    try {
        const session = await prisma.parentDeviceSession.findUnique({
            where: { sessionTokenHash: hashBearerToken(token) },
            include: {
                student: {
                    select: {
                        id: true,
                        name: true,
                        class: true,
                        institutionId: true,
                        institution: { select: { id: true, name: true, slug: true } },
                    },
                },
            },
        });

        if (!session || session.revokedAt) {
            return res.status(401).json({ error: 'Veli oturumu geçersiz veya iptal edilmiş.' });
        }

        req.parentSession = session;
        await prisma.parentDeviceSession.update({
            where: { id: session.id },
            data: { lastSeenAt: new Date() },
        });
        next();
    } catch (err) {
        console.error('PARENT_AUTH_ERROR:', err);
        return res.status(500).json({ error: 'Veli oturumu doğrulanamadı.' });
    }
};

module.exports = { authMiddleware, requireRole, ownershipCheck, generateToken, parentAuthMiddleware, hashBearerToken };
