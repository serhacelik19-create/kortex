require("node:dns").setDefaultResultOrder("ipv4first");
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const xss = require('xss');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
const { PrismaClient } = require('@prisma/client');
const aiService = require('./services/ai_v3.service');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { authMiddleware, requireRole, generateToken, parentAuthMiddleware } = require('./middleware/auth');
const { loginSchema, validate } = require('./middleware/validators');
const { registerAuthRoutes } = require('./routes/auth.routes');
const { registerAdminRoutes } = require('./routes/admin.routes');
const { registerAttendanceRoutes } = require('./routes/attendance.routes');
const { registerStudentRoutes } = require('./routes/students.routes');
const { registerSmartQuizRoutes, mapSmartQuizAttemptForClient } = require('./routes/smartQuiz.routes');
const { registerAiRoutes } = require('./routes/ai.routes');
const { registerChatRoutes, startChatAutoAnalysis } = require('./routes/chat.routes');
const { registerDashboardRoutes } = require('./routes/dashboard.routes');
const { registerReportRoutes } = require('./routes/reports.routes');
const { registerStudyDataRoutes } = require('./routes/studyData.routes');
const { registerUserRoutes } = require('./routes/users.routes');
const { registerInstitutionRoutes } = require('./routes/institution.routes');
const { registerAssignedContentRoutes } = require('./routes/assignedContent.routes');
const { registerAppointmentRoutes } = require('./routes/appointments.routes');
const { registerGuidanceRoutes } = require('./routes/guidance.routes');
const { registerClassProgressRoutes } = require('./routes/class-progress.routes');
const { registerParentRoutes } = require('./routes/parent.routes');
const { registerAccountingRoutes } = require('./routes/accounting.routes');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Cloud Run gibi proxy arkasında çalışan sistemler için (express-rate-limit hatalarını giderir)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  max: 20, // Maksimum bağlantı sınırı
  idleTimeoutMillis: 30000, // Boşta kalan bağlantıları kapat
  connectionTimeoutMillis: 10000, // Bağlantı zaman aşımı
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter,
  errorFormat: 'minimal'
});
const PORT = process.env.PORT || 8080;

// ==================== GÜVENLİK KATMANLARI ====================

// 1. Helmet - HTTP güvenlik başlıkları (XSS, Clickjacking, MIME-sniffing koruması)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Panel (React) için gerekli
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Google Fonts uyumsuz
}));

// 2. CORS Sıkılaştırması - Bulut (Cloud) ve Mobil uyumlu esneklik
app.use(cors({
  origin(origin, callback) {
    const configuredOrigins = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const defaultOrigins = [
      'http://localhost:3000',
      'http://localhost:4173',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:4173',
      'http://127.0.0.1:5173',
    ];
    const allowedOrigins = configuredOrigins.length > 0
      ? configuredOrigins
      : defaultOrigins;

    // Native/mobile clients may send no Origin header.
    if (!origin || allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
      return;
    }

    console.error(`[ERROR] CORS origin not allowed: ${origin}`);
    callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Panel-Request', 'Accept', 'Origin', 'X-Requested-With'],
}));

app.use(express.json({ limit: '50mb' })); // PDF base64 yuklemeleri icin daha genis limit
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// 3. Rate Limiting - Genel API koruması (DDoS) Geçici olarak kapalı (Cloud Run hataları)
const generalLimiter = rateLimit({
  windowMs: Number(process.env.GENERAL_RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.GENERAL_RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.' },
});
app.use('/api/', generalLimiter);

// 4. Login Rate Limiting - Brute-force koruması Geçici olarak kapalı
const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Çok fazla deneme yaptınız. Lütfen 1 dakika bekleyin.' },
});

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Yuklenen PDF cok buyuk. Lutfen dosyayi kucultup tekrar deneyin.',
    });
  }
  next(error);
});

const normalizeBranchKey = (value) =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');

const matchesBranch = (courseBranches, branch) => {
  if (!courseBranches) return true;
  const branchKey = normalizeBranchKey(branch);
  if (!branchKey) return true;
  return courseBranches
    .split(',')
    .map((b) => normalizeBranchKey(b))
    .includes(branchKey);
};

const INSTITUTION_CODE_START = 10;
const INSTITUTION_CODE_END = 99;
const STUDENT_COUNTER_MAX = 9999;
const batchIntroSuggestionCache = new Map();
const BATCH_INTRO_ROUTE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const normalizeLooseText = (value = '') =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const extractCacheQueryText = (rawText = '') => {
  const text = String(rawText || '');
  if (!text.trim()) return '';

  const latestQuestionMatch = text.match(/Öğrencinin Yeni Sorusu:\s*([\s\S]*)$/i);
  if (latestQuestionMatch) return latestQuestionMatch[1].trim();

  const retryQuestionMatch = text.match(/ÖĞRENCİ DİYOR Kİ:\s*([\s\S]*)$/i);
  if (retryQuestionMatch) return retryQuestionMatch[1].trim();

  return text.trim();
};

const looksLikeCalculationText = (text = '', hasImage = false) => {
  if (hasImage) return true;
  const normalized = normalizeLooseText(text);
  if (!normalized) return false;
  const keywords = [
    'kactir', 'hesapla', 'bul', 'coz', 'denklem', 'turev', 'integral', 'limit',
    'fonksiyon', 'grafik', 'esitsizlik', 'oran', 'hiz', 'ivme', 'kuvvet',
    'enerji', 'mol', 'derisim', 'tepkime', 'ph'
  ];
  return keywords.some((keyword) => normalized.includes(keyword)) || /[\d=+\-/*^%()]/.test(text);
};

const isMathOrGeometryCourse = (course = '') => {
  const normalizedCourse = normalizeLooseText(course);
  return normalizedCourse.includes('matematik') || normalizedCourse.includes('geometri');
};

const isConceptHeavyCourse = (course = '') => {
  const normalizedCourse = normalizeLooseText(course);
  return [
    'turkce',
    'tarih',
    'cografya',
    'felsefe',
    'din',
    'edebiyat',
    'biyoloji',
  ].some((keyword) => normalizedCourse.includes(keyword));
};

const looksLikeConceptQuestion = (text = '') => {
  const normalized = normalizeLooseText(text);
  if (!normalized || looksLikeCalculationText(text)) return false;

  const conceptPatterns = [
    /\bnedir\b/,
    /\bne demek\b/,
    /\bne anlama gelir\b/,
    /\bkimdir\b/,
    /\bnelerdir\b/,
    /\btanimi\b/,
    /\btanimla\b/,
    /\bozeti\b/,
    /\bozetle\b/,
    /\bozellikleri\b/,
    /\bacikla\b/,
    /\banlat\b/,
  ];

  if (conceptPatterns.some((pattern) => pattern.test(normalized))) return true;

  const tokens = normalized.split(' ').filter(Boolean);
  return tokens.length >= 2 && tokens.length <= 4;
};

const buildComparableCacheText = (_course, queryText = '') => {
  const normalized = normalizeLooseText(queryText);
  if (!normalized) return '';

  const stripped = normalized
    .replace(/\b(lutfen|bana|kisaca|kisa|ozetle|ozeti|acikla|anlat|anlatir misin|anlatabilir misin|tanimla|tanimi|ozellikleri|hakkinda bilgi ver|hakkinda bilgi|bilgi ver)\b/g, ' ')
    .replace(/\b(nedir|ne demek|ne anlama gelir|kimdir|nelerdir)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped || normalized;
};

const shouldUseSemanticCache = (course, queryText, base64Image = null) => {
  if (base64Image) return false;
  const normalizedText = normalizeLooseText(queryText);
  if (!normalizedText) return false;
  if (isMathOrGeometryCourse(course)) return false;
  if (looksLikeCalculationText(queryText)) return false;
  if (isConceptHeavyCourse(course) && looksLikeConceptQuestion(queryText)) {
    return normalizedText.length >= 8;
  }
  if (normalizedText.length < 18) return false;
  return true;
};

const shouldUseEmbeddingCache = (course, queryText, base64Image = null) => {
  if (base64Image) return false;
  const normalizedText = normalizeLooseText(queryText);
  if (!normalizedText) return false;
  if (isMathOrGeometryCourse(course)) return false;
  if (looksLikeCalculationText(queryText)) return false;
  if (isConceptHeavyCourse(course) && looksLikeConceptQuestion(queryText)) {
    return normalizedText.length >= 8;
  }
  if (normalizedText.length < 24) return false;
  return true;
};

const tokenizeColumn = (value = '') => {
  const normalized = normalizeLooseText(value);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
};

const buildRuleBasedExamMapping = (sampleRow = {}) => {
  const entries = Object.keys(sampleRow || {}).map((rawKey) => ({
    rawKey,
    normalized: normalizeLooseText(rawKey),
    tokens: tokenizeColumn(rawKey),
  }));

  const matchers = {
    studentId: [
      ['ogrenci', 'no'],
      ['ogrenci', 'numara'],
      ['ogrenci', 'id'],
      ['student', 'id'],
      ['okul', 'no'],
      ['okulno'],
      ['numara'],
      ['no'],
    ],
    studentName: [
      ['ogrenci', 'adi'],
      ['ogrenci', 'soyadi'],
      ['ogrenci', 'ad', 'soyad'],
      ['ad', 'soyad'],
      ['student', 'name'],
      ['isim', 'soyisim'],
    ],
    className: [
      ['sinif'],
      ['sube'],
      ['class'],
    ],
    date: [
      ['tarih'],
      ['sinav', 'tarih'],
      ['date'],
    ],
    tytNet: [
      ['tyt', 'toplam', 'net'],
      ['toplam', 'tyt', 'net'],
      ['tyt', 'net'],
    ],
    aytNet: [
      ['ayt', 'toplam', 'net'],
      ['toplam', 'ayt', 'net'],
      ['ayt', 'net'],
    ],
    tytTur: [['tyt', 'turkce', 'net'], ['turkce', 'net']],
    tytTurD: [['tyt', 'turkce', 'dogru'], ['turkce', 'dogru']],
    tytTurY: [['tyt', 'turkce', 'yanlis'], ['turkce', 'yanlis']],
    tytMat: [['tyt', 'matematik', 'net'], ['tyt', 'mat', 'net']],
    tytMatD: [['tyt', 'matematik', 'dogru'], ['tyt', 'mat', 'dogru']],
    tytMatY: [['tyt', 'matematik', 'yanlis'], ['tyt', 'mat', 'yanlis']],
    tytTar: [['tyt', 'tarih', 'net']],
    tytTarD: [['tyt', 'tarih', 'dogru']],
    tytTarY: [['tyt', 'tarih', 'yanlis']],
    tytCog: [['tyt', 'cografya', 'net'], ['tyt', 'cog', 'net']],
    tytCogD: [['tyt', 'cografya', 'dogru'], ['tyt', 'cog', 'dogru']],
    tytCogY: [['tyt', 'cografya', 'yanlis'], ['tyt', 'cog', 'yanlis']],
    tytFel: [['tyt', 'felsefe', 'net'], ['tyt', 'fel', 'net']],
    tytFelD: [['tyt', 'felsefe', 'dogru'], ['tyt', 'fel', 'dogru']],
    tytFelY: [['tyt', 'felsefe', 'yanlis'], ['tyt', 'fel', 'yanlis']],
    tytDin: [['tyt', 'din', 'net']],
    tytDinD: [['tyt', 'din', 'dogru']],
    tytDinY: [['tyt', 'din', 'yanlis']],
    tytFiz: [['tyt', 'fizik', 'net'], ['tyt', 'fiz', 'net']],
    tytFizD: [['tyt', 'fizik', 'dogru'], ['tyt', 'fiz', 'dogru']],
    tytFizY: [['tyt', 'fizik', 'yanlis'], ['tyt', 'fiz', 'yanlis']],
    tytKim: [['tyt', 'kimya', 'net'], ['tyt', 'kim', 'net']],
    tytKimD: [['tyt', 'kimya', 'dogru'], ['tyt', 'kim', 'dogru']],
    tytKimY: [['tyt', 'kimya', 'yanlis'], ['tyt', 'kim', 'yanlis']],
    tytBiy: [['tyt', 'biyoloji', 'net'], ['tyt', 'biy', 'net']],
    tytBiyD: [['tyt', 'biyoloji', 'dogru'], ['tyt', 'biy', 'dogru']],
    tytBiyY: [['tyt', 'biyoloji', 'yanlis'], ['tyt', 'biy', 'yanlis']],
    aytMat: [['ayt', 'matematik', 'net'], ['ayt', 'mat', 'net']],
    aytMatD: [['ayt', 'matematik', 'dogru'], ['ayt', 'mat', 'dogru']],
    aytMatY: [['ayt', 'matematik', 'yanlis'], ['ayt', 'mat', 'yanlis']],
    aytFiz: [['ayt', 'fizik', 'net'], ['ayt', 'fiz', 'net']],
    aytFizD: [['ayt', 'fizik', 'dogru'], ['ayt', 'fiz', 'dogru']],
    aytFizY: [['ayt', 'fizik', 'yanlis'], ['ayt', 'fiz', 'yanlis']],
    aytKim: [['ayt', 'kimya', 'net'], ['ayt', 'kim', 'net']],
    aytKimD: [['ayt', 'kimya', 'dogru'], ['ayt', 'kim', 'dogru']],
    aytKimY: [['ayt', 'kimya', 'yanlis'], ['ayt', 'kim', 'yanlis']],
    aytBiy: [['ayt', 'biyoloji', 'net'], ['ayt', 'biy', 'net']],
    aytBiyD: [['ayt', 'biyoloji', 'dogru'], ['ayt', 'biy', 'dogru']],
    aytBiyY: [['ayt', 'biyoloji', 'yanlis'], ['ayt', 'biy', 'yanlis']],
    aytEdb: [['ayt', 'edebiyat', 'net'], ['ayt', 'edb', 'net']],
    aytEdbD: [['ayt', 'edebiyat', 'dogru'], ['ayt', 'edb', 'dogru']],
    aytEdbY: [['ayt', 'edebiyat', 'yanlis'], ['ayt', 'edb', 'yanlis']],
    aytTar1: [['ayt', 'tarih', '1', 'net']],
    aytTar1D: [['ayt', 'tarih', '1', 'dogru']],
    aytTar1Y: [['ayt', 'tarih', '1', 'yanlis']],
    aytCog1: [['ayt', 'cografya', '1', 'net'], ['ayt', 'cog', '1', 'net']],
    aytCog1D: [['ayt', 'cografya', '1', 'dogru'], ['ayt', 'cog', '1', 'dogru']],
    aytCog1Y: [['ayt', 'cografya', '1', 'yanlis'], ['ayt', 'cog', '1', 'yanlis']],
    aytTar2: [['ayt', 'tarih', '2', 'net']],
    aytTar2D: [['ayt', 'tarih', '2', 'dogru']],
    aytTar2Y: [['ayt', 'tarih', '2', 'yanlis']],
    aytCog2: [['ayt', 'cografya', '2', 'net'], ['ayt', 'cog', '2', 'net']],
    aytCog2D: [['ayt', 'cografya', '2', 'dogru'], ['ayt', 'cog', '2', 'dogru']],
    aytCog2Y: [['ayt', 'cografya', '2', 'yanlis'], ['ayt', 'cog', '2', 'yanlis']],
    aytFel: [['ayt', 'felsefe', 'net'], ['ayt', 'fel', 'net']],
    aytFelD: [['ayt', 'felsefe', 'dogru'], ['ayt', 'fel', 'dogru']],
    aytFelY: [['ayt', 'felsefe', 'yanlis'], ['ayt', 'fel', 'yanlis']],
    aytDin: [['ayt', 'din', 'net']],
    aytDinD: [['ayt', 'din', 'dogru']],
    aytDinY: [['ayt', 'din', 'yanlis']],
  };

  const usedKeys = new Set();
  const mapping = {};

  const scoreEntry = (entry, patternTokens) => {
    const tokens = new Set(entry.tokens);
    if (patternTokens.every((token) => tokens.has(token))) {
      return patternTokens.length * 10 + (entry.tokens.length === patternTokens.length ? 5 : 0);
    }
    if (patternTokens.length === 1 && entry.normalized.includes(patternTokens[0])) {
      return 6;
    }
    return -1;
  };

  for (const [targetKey, patterns] of Object.entries(matchers)) {
    let best = null;
    let bestScore = -1;

    for (const entry of entries) {
      if (usedKeys.has(entry.rawKey)) continue;
      for (const pattern of patterns) {
        const score = scoreEntry(entry, pattern);
        if (score > bestScore) {
          best = entry;
          bestScore = score;
        }
      }
    }

    if (best && bestScore >= 10) {
      mapping[targetKey] = best.rawKey;
      usedKeys.add(best.rawKey);
    }
  }

  return mapping;
};

const daysSinceDate = (dateLike) => {
  if (!dateLike) return null;
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
};

const computeGuidanceRiskProfile = (student) => {
  const activities = (student.dailyActivities || [])
    .map((item) => ({
      date: item.date,
      solvedCount: Number(item.solvedCount) || 0,
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const exams = (student.exams || [])
    .map((item) => ({
      total: (Number(item.tytNet) || 0) + (Number(item.aytNet) || 0),
      date: item.date,
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const recent7 = activities.slice(0, 7).reduce((sum, item) => sum + item.solvedCount, 0);
  const previous7 = activities.slice(7, 14).reduce((sum, item) => sum + item.solvedCount, 0);
  const activeRecentDays = activities.slice(0, 7).filter((item) => item.solvedCount > 0).length;
  const inactiveDays = daysSinceDate(student.lastActiveAt) ?? 0;
  const latestExam = exams[0]?.total ?? null;
  const previousExamAvg = exams.slice(1, 3).length > 0
    ? exams.slice(1, 3).reduce((sum, item) => sum + item.total, 0) / exams.slice(1, 3).length
    : null;
  const examDrop = latestExam != null && previousExamAvg != null ? latestExam - previousExamAvg : 0;

  let score = 0;
  const reasons = [];

  if (inactiveDays >= 10) {
    score += 35;
    reasons.push(`Son ${inactiveDays} gündür aktif değil`);
  } else if (inactiveDays >= 5) {
    score += 20;
    reasons.push(`Son ${inactiveDays} gündür belirgin şekilde pasif`);
  }

  if (previous7 > 0 && recent7 === 0) {
    score += 28;
    reasons.push('Son 7 günde soru çözümü tamamen durmuş');
  } else if (previous7 > 0 && recent7 <= previous7 * 0.5) {
    score += 18;
    reasons.push('Soru çözümünde yarıdan fazla düşüş var');
  } else if (previous7 > 0 && recent7 <= previous7 * 0.75) {
    score += 10;
    reasons.push('Soru çözüm temposunda hissedilir düşüş var');
  }

  if (activeRecentDays <= 1) {
    score += 12;
    reasons.push('Haftalık çalışma düzeni çok zayıf');
  }

  if (examDrop <= -15) {
    score += 20;
    reasons.push(`Deneme netinde ciddi düşüş var (${examDrop.toFixed(1)})`);
  } else if (examDrop <= -7) {
    score += 12;
    reasons.push(`Deneme netinde düşüş var (${examDrop.toFixed(1)})`);
  }

  if ((student.aiStressLevel || 0) >= 75) {
    score += 12;
    reasons.push(`AI stres seviyesi yüksek (${student.aiStressLevel})`);
  } else if ((student.aiStressLevel || 0) >= 60) {
    score += 6;
    reasons.push(`AI stres seviyesi yükseliyor (${student.aiStressLevel})`);
  }

  return {
    score,
    reasons,
    shouldReview: score >= 20,
    shouldCreateDirectAlert: score >= 45,
    directIssue: reasons.length > 0
      ? `${reasons.slice(0, 2).join(', ')}. Koç görüşmesi önerilir.`
      : null,
    priority: score >= 60 ? 'High' : score >= 35 ? 'Medium' : 'Low',
  };
};

const formatInstitutionCode = (value) => String(value).padStart(2, '0');

const findNextInstitutionCode = async (tx) => {
  const used = await tx.institution.findMany({
    select: { code: true },
  });
  const usedCodes = new Set(used.map((i) => i.code).filter(Boolean));

  for (let code = INSTITUTION_CODE_START; code <= INSTITUTION_CODE_END; code++) {
    const formatted = formatInstitutionCode(code);
    if (!usedCodes.has(formatted)) return formatted;
  }
  throw new Error('Yeni kurum kodu için boş aralık kalmadı (10-99).');
};

const ensureInstitutionCode = async (tx, institutionId) => {
  const institution = await tx.institution.findUnique({
    where: { id: institutionId },
    select: { id: true, code: true, studentCounter: true },
  });
  if (!institution) {
    throw new Error('Kurum bulunamadı.');
  }

  if (institution.code) return institution;

  const generatedCode = await findNextInstitutionCode(tx);
  return tx.institution.update({
    where: { id: institutionId },
    data: { code: generatedCode },
    select: { id: true, code: true, studentCounter: true },
  });
};

const generateStudentUsername = async (tx, institutionId) => {
  const institution = await ensureInstitutionCode(tx, institutionId);

  for (let attempt = 0; attempt < 15; attempt++) {
    // 1000 ile 9999 arasında rastgele bir sayı üret
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const username = `${institution.code}${randomSuffix}`;

    const [existingStudent, existingUser] = await Promise.all([
      tx.student.findFirst({ where: { username }, select: { id: true } }),
      tx.user.findFirst({ where: { username }, select: { id: true } }),
    ]);

    if (!existingStudent && !existingUser) {
      // Sayaç bilgisini istatistiksel amaçla artırmaya devam ediyoruz
      await tx.institution.update({
        where: { id: institutionId },
        data: { studentCounter: { increment: 1 } },
      });
      return username;
    }
  }

  throw new Error('Benzersiz öğrenci kullanıcı adı üretilemedi, lütfen tekrar deneyin.');
};

// ==================== GÜVENLİK KATMANLARI SONU ====================

// Admin şifre kontrolü artık veritabanı üzerinden yapılıyor.

// ==================== LOGIN ====================
registerAuthRoutes(app, {
  prisma,
  bcrypt,
  loginLimiter,
  validate,
  loginSchema,
  generateToken,
});

async function seedDefaults(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Pool hazır olmadan ilk sorguya yüklenmemek için küçük gecikme.
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const count = await prisma.subjectAverage.count();
      if (count === 0) {
        await prisma.subjectAverage.createMany({
          data: [
            { subject: 'Matematik', averageValue: 0 },
            { subject: 'Fizik', averageValue: 0 },
            { subject: 'Kimya', averageValue: 0 },
            { subject: 'Biyoloji', averageValue: 0 },
            { subject: 'Türkçe', averageValue: 0 },
            { subject: 'Tarih', averageValue: 0 },
            { subject: 'Coğrafya', averageValue: 0 },
            { subject: 'Felsefe', averageValue: 0 },
            { subject: 'Din Kültürü', averageValue: 0 },
          ],
          skipDuplicates: true,
        });
        console.log('✅ Varsayılan ders ortalamaları oluşturuldu.');
      }
      return;
    } catch (error) {
      const remaining = maxRetries - attempt;
      const errorCode = error?.code || 'UNKNOWN';
      const errorMessage = error?.message || String(error);

      if (remaining > 0) {
        console.warn(
          `⚠️ Varsayılan veriler yüklenemedi (kod: ${errorCode}). Yeniden denenecek... (Kalan Hak: ${remaining})`,
        );
        continue;
      }

      console.warn(
        `⚠️ Varsayılan veriler atlandı. Backend çalışmaya devam edecek. Son hata (${errorCode}): ${errorMessage}`,
      );
    }
  }
}

seedDefaults().catch((error) => {
  console.warn('⚠️ Varsayılan veriler beklenmeyen bir hatayla atlandı:', error?.message || error);
});

// ==================== SUPER ADMIN ENDPOINTS ====================
registerAdminRoutes(app, {
  prisma,
  bcrypt,
  authMiddleware,
  requireRole,
  findNextInstitutionCode,
});

// ==================== ROUTES ====================
registerUserRoutes(app, {
  prisma,
  bcrypt,
  authMiddleware,
  requireRole,
});

const ensureStudentScope = async (req, studentId) => {
  if (Number.isNaN(studentId)) {
    return { ok: false, status: 400, message: 'Geçersiz öğrenci ID.' };
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, institutionId: true },
  });
  if (!student) {
    return { ok: false, status: 404, message: 'Öğrenci bulunamadı.' };
  }

  if (req.user.role === 'super_admin') {
    return { ok: true, student };
  }

  if (req.user.role === 'student') {
    if (req.user.id !== studentId) {
      return { ok: false, status: 403, message: 'Bu kaynağa erişim yetkiniz yok.' };
    }
    return { ok: true, student };
  }

  if (req.user.role === 'admin' || req.user.role === 'teacher') {
    const requesterInstitutionId = Number(req.user.institutionId);
    if (!requesterInstitutionId || requesterInstitutionId !== student.institutionId) {
      return { ok: false, status: 403, message: 'Bu kaynağa erişim yetkiniz yok.' };
    }
    return { ok: true, student };
  }

  return { ok: false, status: 403, message: 'Bu işlem için yetkiniz bulunmamaktadır.' };
};

const studentScopeGuard = async (req, res, next) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    const access = await ensureStudentScope(req, studentId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.message });
    }
    req.targetStudent = access.student;
    next();
  } catch (err) {
    console.error("STUDENT_SCOPE_ERROR:", err);
    res.status(500).json({ error: 'Erişim kontrolü sırasında hata oluştu.' });
  }
};

registerStudentRoutes(app, {
  prisma,
  bcrypt,
  authMiddleware,
  requireRole,
  studentScopeGuard,
  generateStudentUsername,
});

registerSmartQuizRoutes(app, {
  prisma,
  authMiddleware,
  studentScopeGuard,
});

registerChatRoutes(app, {
  prisma,
  authMiddleware,
  studentScopeGuard,
  ensureStudentScope,
});

registerAiRoutes(app, {
  prisma,
  aiService,
  authMiddleware,
  studentScopeGuard,
  extractCacheQueryText,
  buildComparableCacheText,
  shouldUseSemanticCache,
  shouldUseEmbeddingCache,
});

registerDashboardRoutes(app, {
  prisma,
  aiService,
  authMiddleware,
  requireRole,
});

registerReportRoutes(app, {
  prisma,
  bcrypt,
  aiService,
  authMiddleware,
  requireRole,
  studentScopeGuard,
  batchIntroSuggestionCache,
  batchIntroRouteCacheTtlMs: BATCH_INTRO_ROUTE_CACHE_TTL_MS,
});

registerStudyDataRoutes(app, {
  prisma,
  authMiddleware,
  studentScopeGuard,
  matchesBranch,
});

registerInstitutionRoutes(app, {
  prisma,
  xss,
  aiService,
  authMiddleware,
  requireRole,
});

registerAssignedContentRoutes(app, {
  prisma,
  authMiddleware,
  requireRole,
  studentScopeGuard,
});

registerAppointmentRoutes(app, {
  prisma,
  authMiddleware,
  requireRole,
  studentScopeGuard,
});

registerGuidanceRoutes(app, {
  prisma,
  aiService,
  authMiddleware,
  requireRole,
  studentScopeGuard,
});

registerClassProgressRoutes(app, {
  prisma,
  authMiddleware,
});

registerParentRoutes(app, {
  prisma,
  authMiddleware,
  requireRole,
  parentAuthMiddleware,
});

registerAccountingRoutes(app, {
  prisma,
  authMiddleware,
  requireRole,
});

// Chat Endpoints
startChatAutoAnalysis(prisma);

app.get('/api/classes/:className/students', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const where = req.user.role === 'super_admin' ? { class: req.params.className } : { class: req.params.className, institutionId: req.user.institutionId };
    const students = await prisma.student.findMany({
      where
    });
    res.json(students);
  } catch (err) {
    console.error("KURUM_HATA:", err); res.status(500).json({ error: err.message });
  }
});

app.get('/api/classes', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const where = req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };

    const [classesData, students] = await Promise.all([
      prisma.class.findMany({ where }),
      prisma.student.findMany({ where })
    ]);

    const result = classesData.map(c => {
      const classStudents = students.filter(s => s.class === c.name);
      const totalProgress = classStudents.reduce((acc, s) => acc + (s.progress || 0), 0);
      const totalSolved = classStudents.reduce((acc, s) => acc + (s.solvedCount || 0), 0);

      return {
        id: c.id,
        name: c.name,
        studentCount: classStudents.length,
        averageProgress: classStudents.length > 0 ? totalProgress / classStudents.length : 0,
        averageSolved: classStudents.length > 0 ? totalSolved / classStudents.length : 0
      };
    });
    res.json(result);
  } catch (err) {
    console.error("KURUM_HATA:", err); res.status(500).json({ error: err.message });
  }
});

app.post('/api/classes', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  try {
    let institutionId = req.user.role === 'super_admin' ? (req.body.institutionId || null) : req.user.institutionId;

    // Eğer Super Admin panele kurum seçmeden sınıf eklerse hata vermemesi için sistemdeki ilk kurumu bulup ona bağlayalım
    if (req.user.role === 'super_admin' && !institutionId) {
      const firstInst = await prisma.institution.findFirst();
      if (firstInst) {
        institutionId = firstInst.id;
      } else {
        return res.status(400).send('Sınıf eklemek için önce bir Kurum eklemelisiniz. Öğrencinin bağlanacağı bir kurum yok.');
      }
    }

    const newClass = await prisma.class.create({
      data: {
        name,
        institutionId: institutionId ? parseInt(institutionId) : null
      }
    });
    res.json(newClass);
  } catch (err) {
    console.error("SINIF_EKLEME_HATA:", err.message);
    res.status(400).send(`Sınıf oluşturulamadı veya zaten mevcut. Hata: ${err.message}`);
  }
});

app.put('/api/classes/:oldName', authMiddleware, requireRole('admin'), async (req, res) => {
  const { newName } = req.body;
  const { oldName } = req.params;
  try {
    const where = req.user.role === 'super_admin' ? { name: oldName } : { name_institutionId: { name: oldName, institutionId: req.user.institutionId } };

    await prisma.class.update({
      where,
      data: { name: newName }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).send('Güncelleme başarısız: ' + err.message);
  }
});

app.delete('/api/classes/:name', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name } = req.params;
  try {
    const whereClass = req.user.role === 'super_admin' ? { name } : { name_institutionId: { name, institutionId: req.user.institutionId } };
    const whereStudent = req.user.role === 'super_admin' ? { class: name } : { class: name, institutionId: req.user.institutionId };

    await prisma.$transaction([
      prisma.student.updateMany({
        where: whereStudent,
        data: { class: '' }
      }),
      prisma.class.delete({ where: whereClass })
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/averages', authMiddleware, requireRole('admin'), async (req, res) => {
  const averages = await prisma.subjectAverage.findMany();
  res.json(averages);
});

app.post('/api/exams', authMiddleware, requireRole('admin'), async (req, res) => {
  const data = req.body;
  const studentId = parseInt(data.student_id);

  try {
    // Güvenlik: Admin sadece kendi kurumundaki öğrenciye sınav ekleyebilir
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || (req.user.role !== 'super_admin' && student.institutionId !== req.user.institutionId)) {
      return res.status(403).json({ error: 'Bu öğrenciye sınav ekleme yetkiniz yok.' });
    }

    const result = await prisma.exam.create({
      data: {
        studentId,
        institutionId: student.institutionId,
        date: data.date,
        tytNet: data.tyt_net,
        aytNet: data.ayt_net,
        tytTur: data.tyt_tur || 0,
        tytMat: data.tyt_mat || 0,
        tytTar: data.tyt_tar || 0,
        tytCog: data.tyt_cog || 0,
        tytFel: data.tyt_fel || 0,
        tytDin: data.tyt_din || 0,
        tytFiz: data.tyt_fiz || 0,
        tytKim: data.tyt_kim || 0,
        tytBiy: data.tyt_biy || 0,
        aytMat: data.ayt_mat || 0,
        aytFiz: data.ayt_fiz || 0,
        aytKim: data.ayt_kim || 0,
        aytBiy: data.ayt_biy || 0,
        aytEdb: data.ayt_edb || 0,
        aytTar1: data.ayt_tar1 || 0,
        aytCog1: data.ayt_cog1 || 0,
        aytTar2: data.ayt_tar2 || 0,
        aytCog2: data.ayt_cog2 || 0,
        aytFel: data.ayt_fel || 0,
        aytDin: data.ayt_din || 0
      }
    });
    res.json({ id: result.id, success: true });
  } catch (err) {
    res.status(500).send('Sunucu hatası: ' + err.message);
  }
});

// (Duplicate route silindi — detaylı versiyon aşağıda)


app.post('/api/exams/bulk', authMiddleware, requireRole('admin'), async (req, res) => {
  const { exams } = req.body;
  if (!exams || exams.length === 0) return res.status(400).json({ error: "Boş veri" });

  try {
    let mapping = null;

    // Standart formattan gelip gelmediğini anlamak için student_id kontrolü
    if (exams[0].student_id === undefined && exams[0].studentId === undefined) {
      // Orijinal excel formatıysa AI'ye eşleştirme sor
      const ruleBasedMapping = buildRuleBasedExamMapping(exams[0]);
      mapping = ruleBasedMapping;

      if (!mapping.studentId || Object.keys(mapping).length < 5) {
        const aiMapping = await aiService.generateExcelMapping(exams[0]);
        mapping = { ...(aiMapping || {}), ...ruleBasedMapping };
      }

      if (!mapping || !mapping.studentId) {
        return res.status(400).json({ error: "Sistem, yüklenen dosya formatını çözümleyemedi. Lütfen geçerli bir deneme dosyası veya farklı şablon yükleyin." });
      }
    }

    const studentsInInst = await prisma.student.findMany({
      where: { institutionId: req.user.institutionId },
      select: { id: true, studentNumber: true }
    });

    const studentMap = new Map();
    studentsInInst.forEach(s => {
      studentMap.set(String(s.id), s.id);
      if (s.studentNumber) {
        studentMap.set(String(s.studentNumber).trim(), s.id);
        studentMap.set(String(parseInt(s.studentNumber, 10)), s.id);
      }
    });

    // === TEK SEFERLİK TEST İÇİN: Kayıtsız öğrencileri otomatik oluştur ===
    const AUTO_CREATE_STUDENTS = false; // Test bittikten sonra false yap!

    if (AUTO_CREATE_STUDENTS) {
      const classCache = new Map(); // Sınıf isminden DB id'sine cache

      for (const exam of exams) {
        const sIdRaw = mapping ? exam[mapping.studentId] : (exam.student_id || exam.studentId || exam["Öğrenci No"]);
        if (sIdRaw === undefined || sIdRaw === null) continue;

        const parsedRaw = String(sIdRaw).trim();
        const parsedIntStr = String(parseInt(parsedRaw, 10));

        // Zaten varsa atla
        if (studentMap.has(parsedRaw) || studentMap.has(parsedIntStr)) continue;

        // İsim ve sınıf bilgisini çek
        const studentName = mapping && mapping.studentName ? exam[mapping.studentName] : (exam.name || exam['ADI SOYADI'] || exam['Adı Soyadı'] || `Öğrenci ${parsedRaw}`);
        const className = mapping && mapping.className ? exam[mapping.className] : (exam.class || exam['SINIF'] || exam['Sınıf'] || null);

        // Sınıf varsa oluştur veya cache'den al
        if (className && !classCache.has(String(className).trim())) {
          const classStr = String(className).trim();
          const existing = await prisma.class.findFirst({ where: { name: classStr, institutionId: req.user.institutionId } });
          if (existing) {
            classCache.set(classStr, existing.id);
          } else {
            const created = await prisma.class.create({ data: { name: classStr, institutionId: req.user.institutionId } });
            classCache.set(classStr, created.id);
          }
        }

        // Öğrenciyi oluştur
        const newStudent = await prisma.student.create({
          data: {
            name: String(studentName).trim(),
            studentNumber: parsedRaw,
            class: className ? String(className).trim() : null,
            username: parsedRaw,
            password: await bcrypt.hash('123456', 10),
            institutionId: req.user.institutionId
          }
        });

        // Map'e ekle
        studentMap.set(parsedRaw, newStudent.id);
        studentMap.set(parsedIntStr, newStudent.id);
        studentMap.set(String(newStudent.id), newStudent.id);
      }
    }
    // === TEK SEFERLİK TEST SONU ===

    const data = exams.map((exam) => {
      // Değer okuma ve temizleme yardımcıları (Net için ondalıklı, Doğru/Yanlış için tamsayı)
      const getVal = (stdKey) => {
        if (mapping && mapping[stdKey] && exam[mapping[stdKey]] !== undefined) {
          return parseFloat(exam[mapping[stdKey]]) || 0;
        }
        return exam[stdKey] ? parseFloat(exam[stdKey]) : 0;
      };

      const getInt = (stdKey) => {
        if (mapping && mapping[stdKey] && exam[mapping[stdKey]] !== undefined) {
          return parseInt(parseFloat(exam[mapping[stdKey]]), 10) || 0;
        }
        return exam[stdKey] ? parseInt(parseFloat(exam[stdKey]), 10) : 0;
      };

      const getString = (stdKey) => {
        if (mapping && mapping[stdKey] && exam[mapping[stdKey]] !== undefined) {
          return String(exam[mapping[stdKey]]).trim();
        }
        return exam[stdKey] ? String(exam[stdKey]).trim() : null;
      };

      const sIdRaw = mapping ? exam[mapping.studentId] : (exam.student_id || exam.studentId || exam["Öğrenci No"]);
      if (sIdRaw === undefined || sIdRaw === null) return null;

      const parsedRaw = String(sIdRaw).trim();
      const parsedIntStr = String(parseInt(parsedRaw, 10));

      const sId = studentMap.get(parsedRaw) || studentMap.get(parsedIntStr);

      if (!sId) {
        return null; // Kuruma ait böyle bir id veya öğrenci numarası bulunamadı
      }

      let examDate = getString('date');
      if (!examDate || typeof examDate !== 'string') examDate = new Date().toISOString().split('T')[0];

      return {
        institutionId: req.user.institutionId,
        studentId: sId,
        date: examDate,
        tytNet: getVal('tytNet'),
        aytNet: getVal('aytNet'),
        tytTur: getVal('tytTur'),
        tytTurD: getInt('tytTurD'),
        tytTurY: getInt('tytTurY'),
        tytMat: getVal('tytMat'),
        tytMatD: getInt('tytMatD'),
        tytMatY: getInt('tytMatY'),
        tytTar: getVal('tytTar'),
        tytTarD: getInt('tytTarD'),
        tytTarY: getInt('tytTarY'),
        tytCog: getVal('tytCog'),
        tytCogD: getInt('tytCogD'),
        tytCogY: getInt('tytCogY'),
        tytFel: getVal('tytFel'),
        tytFelD: getInt('tytFelD'),
        tytFelY: getInt('tytFelY'),
        tytDin: getVal('tytDin'),
        tytDinD: getInt('tytDinD'),
        tytDinY: getInt('tytDinY'),
        tytFiz: getVal('tytFiz'),
        tytFizD: getInt('tytFizD'),
        tytFizY: getInt('tytFizY'),
        tytKim: getVal('tytKim'),
        tytKimD: getInt('tytKimD'),
        tytKimY: getInt('tytKimY'),
        tytBiy: getVal('tytBiy'),
        tytBiyD: getInt('tytBiyD'),
        tytBiyY: getInt('tytBiyY'),
        // AYT Net, D, Y
        aytMat: getVal('aytMat'),
        aytMatD: getInt('aytMatD'),
        aytMatY: getInt('aytMatY'),
        aytFiz: getVal('aytFiz'),
        aytFizD: getInt('aytFizD'),
        aytFizY: getInt('aytFizY'),
        aytKim: getVal('aytKim'),
        aytKimD: getInt('aytKimD'),
        aytKimY: getInt('aytKimY'),
        aytBiy: getVal('aytBiy'),
        aytBiyD: getInt('aytBiyD'),
        aytBiyY: getInt('aytBiyY'),
        aytEdb: getVal('aytEdb'),
        aytEdbD: getInt('aytEdbD'),
        aytEdbY: getInt('aytEdbY'),
        aytTar1: getVal('aytTar1'),
        aytTar1D: getInt('aytTar1D'),
        aytTar1Y: getInt('aytTar1Y'),
        aytCog1: getVal('aytCog1'),
        aytCog1D: getInt('aytCog1D'),
        aytCog1Y: getInt('aytCog1Y'),
        aytTar2: getVal('aytTar2'),
        aytTar2D: getInt('aytTar2D'),
        aytTar2Y: getInt('aytTar2Y'),
        aytCog2: getVal('aytCog2'),
        aytCog2D: getInt('aytCog2D'),
        aytCog2Y: getInt('aytCog2Y'),
        aytFel: getVal('aytFel'),
        aytFelD: getInt('aytFelD'),
        aytFelY: getInt('aytFelY'),
        aytDin: getVal('aytDin'),
        aytDinD: getInt('aytDinD'),
        aytDinY: getInt('aytDinY')
      };
    }).filter(e => e !== null);

    if (data.length === 0) return res.status(400).json({ error: "Geçerli öğrenci satırı (Öğrenci No içeren satır) bulunamadı." });

    await prisma.exam.createMany({ data });
    res.json({ success: true, count: data.length });
  } catch (err) {
    console.error("Bulk Upload Error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/students/:id', authMiddleware, studentScopeGuard, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        exams: true, // Arşiv için sınavlar gerekiyor
        questionAnalyses: true, // Akran kıyaslaması için analizler gerekiyor
        smartQuizAttempts: {
          orderBy: { assignedAt: 'desc' },
          take: 20,
        },
        installments: {
          orderBy: { dueDate: 'asc' }
        }
      }
    });
    if (!student) return res.status(404).send('Not Found');

    // Branş bazlı soru sayılarını hesapla
    const subjects = ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Türkçe', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü'];
    const subjectCounts = {};
    subjects.forEach(s => subjectCounts[s] = 0);

    student.questionAnalyses?.forEach(qa => {
      const match = subjects.find(s => (qa.course || '').includes(s));
      if (match) subjectCounts[match]++;
    });

    // AI analiz alanlarını hazırla
    let aiHardTopicsParsed = [];
    if (student.aiHardTopics) {
      try {
        aiHardTopicsParsed = JSON.parse(student.aiHardTopics);
      } catch (e) {
        aiHardTopicsParsed = [];
      }
    }

    // Password alanını yanıttan çıkar
    const { password: _, ...safeStudent } = student;

    res.json({
      ...safeStudent,
      subjectCounts,
      ai_summary: {
        total_questions: student.solvedCount || 0,
        streak: `${student.aiStreak || 0} Gün`,
        stress: student.aiStressLevel || 0,
        stress_comment: student.aiStressComment || "Duygu durumu analizi henüz yapılmamış.",
        ai_comment: student.aiComment || "Öğrenci verileri henüz analiz için yeterli değil.",
        badges: [],
        hard_topics: aiHardTopicsParsed,
        exam_report: student.aiExamReport || "Henüz yeterli deneme sınavı verisi bulunmamaktadır.",
        net_analysis: student.aiNetAnalysis || "Net analizi henüz yapılmamış.",
        target_analysis: student.aiTargetAnalysis || "Sınav verileri ve çözülen sorular yüklendiğinde analiz edilecektir."
      },
      smartQuizAttempts: (student.smartQuizAttempts || []).map(mapSmartQuizAttemptForClient),
    });
  } catch (err) {
    console.error("KURUM_HATA:", err); res.status(500).json({ error: err.message });
  }
});


// ==================== ATTENDANCE ROUTES ====================
registerAttendanceRoutes(app, {
  prisma,
  authMiddleware,
  requireRole,
  studentScopeGuard,
});

// ==================== GLOBAL ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Sunucu hatası oluştu.'
    : err.message;
  res.status(statusCode).json({ error: message });
});

// ==================== CRON JOBS ====================
// Haftalık AI Rehberlik Triage Motoru
const evaluateAllStudentsGuidance = async () => {
  console.log('🔄 [CRON] Tüm aktif öğrenciler için AI Rehberlik Analizi başlatılıyor...');
  try {
    const students = await prisma.student.findMany({
      include: {
        dailyActivities: { orderBy: { date: 'desc' }, take: 21 }, // Son 3 hafta aktivitesi
        exams: { orderBy: { date: 'desc' }, take: 5 }
      }
    });
    
    // Eski alarmları temizle ki sürekli birikmesin
    await prisma.guidanceAlert.deleteMany({});
    
    let alertCount = 0;
    for (const student of students) {
      if (student.progress === 0 && student.solvedCount === 0) continue; // Yepyeni öğrenciyi analiz etme

      const riskProfile = computeGuidanceRiskProfile(student);
      if (!riskProfile.shouldReview) continue;

      if (riskProfile.shouldCreateDirectAlert) {
        await prisma.guidanceAlert.create({
          data: {
             studentId: student.id,
             issue: riskProfile.directIssue || "Kural tabanlı risk tespit edildi, yakın takip önerilir.",
             priority: riskProfile.priority
          }
        });
        alertCount++;
        continue;
      }

      const result = await aiService.evaluateGuidanceAlert(student);
      
      if (result && result.needsAlert) {
        await prisma.guidanceAlert.create({
          data: {
             studentId: student.id,
             issue: result.issue || "Tespiti tam alınamadı ama risk tespit edildi.",
             priority: result.priority || riskProfile.priority || "Medium"
          }
        });
        alertCount++;
      }
    }
    console.log(`✅ [CRON] Rehberlik Analizi tamamlandı! ${alertCount} yeni alarm oluşturuldu.`);
  } catch (error) {
    console.error("❌ [CRON] Rehberlik Analizi Hatası:", error);
  }
};

// Pazar günleri akşam saat 20:00'da çalışır (0 20 * * 0)
cron.schedule('0 20 * * 0', evaluateAllStudentsGuidance);

// Manuel tetikleme (Adminler veya manuel çalıştırma isteyenler için)
app.post('/api/admin/force-guidance', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
  // İşlem uzun sürebileceğinden beklemeden 200 dönüyoruz (Arkada çalışsın)
  res.json({ message: 'Rehberlik AI analizi arka planda başlatıldı. Tamamlanması kurum büyüklüğüne göre 1-5 dk sürebilir.' });
  evaluateAllStudentsGuidance();
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend Server is running on http://localhost:${PORT}`);
  });
}

module.exports = { app };
