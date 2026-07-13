const fs = require('fs');
const path = require('path');
const { calculateCost } = require('../utils/aiUsage');

const SYSTEM_SETTINGS_DIR = path.join(__dirname, '..', 'data');
const SYSTEM_SETTINGS_FILE = path.join(SYSTEM_SETTINGS_DIR, 'system-settings.json');
const INSTITUTION_SETTINGS_FILE = path.join(SYSTEM_SETTINGS_DIR, 'institution-settings.json');
const TELEMETRY_FILE = path.join(__dirname, '..', 'reports', 'ai-telemetry', 'ai-telemetry.ndjson');

const DEFAULT_SYSTEM_SETTINGS = {
  appMaintenance: false,
  panelMaintenance: false,
  appMaintenanceMessage: '',
  panelMaintenanceMessage: '',
  updatedAt: null,
};

const DEFAULT_INSTITUTION_SETTINGS = {
  panelAccess: true,
  maintenanceMode: false,
  maintenanceMessage: '',
  internalNote: '',
  updatedAt: null,
};

function readSystemSettings() {
  try {
    if (!fs.existsSync(SYSTEM_SETTINGS_FILE)) {
      return { ...DEFAULT_SYSTEM_SETTINGS };
    }
    const raw = fs.readFileSync(SYSTEM_SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...parsed,
    };
  } catch (_error) {
    return { ...DEFAULT_SYSTEM_SETTINGS };
  }
}

function writeSystemSettings(nextSettings) {
  fs.mkdirSync(SYSTEM_SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(
    SYSTEM_SETTINGS_FILE,
    JSON.stringify(
      {
        ...DEFAULT_SYSTEM_SETTINGS,
        ...nextSettings,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
  return readSystemSettings();
}

function readInstitutionSettingsStore() {
  try {
    if (!fs.existsSync(INSTITUTION_SETTINGS_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(INSTITUTION_SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function getInstitutionSettings(institutionId) {
  const store = readInstitutionSettingsStore();
  return {
    ...DEFAULT_INSTITUTION_SETTINGS,
    ...(store[String(institutionId)] || {}),
  };
}

function writeInstitutionSettings(institutionId, nextSettings) {
  const store = readInstitutionSettingsStore();
  const current = getInstitutionSettings(institutionId);
  const normalized = {
    ...current,
    ...nextSettings,
    panelAccess: nextSettings.panelAccess !== undefined
      ? Boolean(nextSettings.panelAccess)
      : current.panelAccess,
    maintenanceMode: nextSettings.maintenanceMode !== undefined
      ? Boolean(nextSettings.maintenanceMode)
      : current.maintenanceMode,
    maintenanceMessage:
      typeof nextSettings.maintenanceMessage === 'string'
        ? nextSettings.maintenanceMessage.trim()
        : current.maintenanceMessage,
    internalNote:
      typeof nextSettings.internalNote === 'string'
        ? nextSettings.internalNote.trim()
        : current.internalNote,
    updatedAt: new Date().toISOString(),
  };

  store[String(institutionId)] = normalized;
  fs.mkdirSync(SYSTEM_SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(INSTITUTION_SETTINGS_FILE, JSON.stringify(store, null, 2), 'utf8');
  return normalized;
}

function deleteInstitutionSettings(institutionId) {
  const store = readInstitutionSettingsStore();
  if (!store[String(institutionId)]) {
    return;
  }

  delete store[String(institutionId)];
  fs.mkdirSync(SYSTEM_SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(INSTITUTION_SETTINGS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

const numberOrZero = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const clampUsageDays = (value) => Math.max(1, Math.min(365, parseInt(value, 10) || 30));

const calculateCurrentUsageCosts = (event) => {
  const tokens = {
    promptTokens: numberOrZero(event.promptTokens),
    completionTokens: numberOrZero(event.completionTokens),
    reasoningTokens: numberOrZero(event.reasoningTokens),
    totalTokens: numberOrZero(event.totalTokens),
  };
  const hasTokenData = tokens.promptTokens || tokens.completionTokens || tokens.reasoningTokens || tokens.totalTokens;
  if (!hasTokenData) {
    return {
      inputCostUsd: numberOrZero(event.inputCostUsd),
      outputCostUsd: numberOrZero(event.outputCostUsd),
      totalCostUsd: numberOrZero(event.totalCostUsd ?? event.estimatedCostUsd),
    };
  }

  return calculateCost(tokens, event.model);
};

const normalizeUsageEventCosts = (event) => {
  const costs = calculateCurrentUsageCosts(event);
  const totalCostUsd = numberOrZero(costs.totalCostUsd ?? event.totalCostUsd ?? event.estimatedCostUsd);
  return {
    ...event,
    inputCostUsd: numberOrZero(costs.inputCostUsd ?? event.inputCostUsd),
    outputCostUsd: numberOrZero(costs.outputCostUsd ?? event.outputCostUsd),
    totalCostUsd,
    estimatedCostUsd: totalCostUsd,
  };
};

const buildUsageTotals = (events) => events.reduce((acc, event) => {
  const costs = calculateCurrentUsageCosts(event);
  acc.callCount += 1;
  acc.promptTokens += numberOrZero(event.promptTokens);
  acc.completionTokens += numberOrZero(event.completionTokens);
  acc.reasoningTokens += numberOrZero(event.reasoningTokens);
  acc.totalTokens += numberOrZero(event.totalTokens);
  acc.totalCostUsd += numberOrZero(costs.totalCostUsd ?? event.totalCostUsd ?? event.estimatedCostUsd);
  return acc;
}, {
  callCount: 0,
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  totalCostUsd: 0,
});

const groupUsage = (events, keyPicker) => {
  const groups = new Map();
  events.forEach((event) => {
    const key = keyPicker(event) || 'unknown';
    const current = groups.get(key) || [];
    current.push(event);
    groups.set(key, current);
  });
  return [...groups.entries()]
    .map(([key, rows]) => ({ key, ...buildUsageTotals(rows) }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
};

const buildDailyUsage = (events) => {
  const groups = new Map();
  events.forEach((event) => {
    const key = event.createdAt.toISOString().slice(0, 10);
    const current = groups.get(key) || [];
    current.push(event);
    groups.set(key, current);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({ date, ...buildUsageTotals(rows) }));
};

const readTelemetryFileEvents = (windowStart, institutionId = null) => {
  if (!fs.existsSync(TELEMETRY_FILE)) return [];
  return fs.readFileSync(TELEMETRY_FILE, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        const createdAt = parsed.createdAt ? new Date(parsed.createdAt) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime()) || createdAt < windowStart) return null;
        if (institutionId != null && Number(parsed.institutionId) !== Number(institutionId)) return null;
        return {
          ...parsed,
          id: parsed.id || `file-${createdAt.getTime()}-${Math.random().toString(36).slice(2)}`,
          createdAt,
          studentId: parsed.studentId ?? (parsed.userRole === 'student' ? parsed.userId : null),
          actorType: parsed.actorType || parsed.userRole || null,
          surface: parsed.surface || (parsed.userRole === 'student' ? 'mobile_app' : null),
          feature: parsed.feature || parsed.eventType || null,
          totalCostUsd: parsed.totalCostUsd ?? parsed.estimatedCostUsd ?? 0,
        };
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
};

async function buildInstitutionAiUsage(prisma, institutionId, days) {
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let events = [];
  try {
    events = await prisma.aiTelemetryEvent.findMany({
      where: {
        institutionId,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  } catch (error) {
    console.error('[AI_USAGE][DB FALLBACK]', error.message || error);
    events = readTelemetryFileEvents(windowStart, institutionId).slice(0, 500);
  }
  events = events.map(normalizeUsageEventCosts);

  const studentIds = [...new Set(events.map((event) => event.studentId).filter(Boolean))];
  const students = studentIds.length > 0
    ? await prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, class: true },
      })
    : [];
  const studentMap = new Map(students.map((student) => [student.id, student]));

  const topStudents = groupUsage(
    events.filter((event) => event.studentId),
    (event) => String(event.studentId),
  ).slice(0, 10).map((entry) => {
    const student = studentMap.get(Number(entry.key));
    return {
      studentId: Number(entry.key),
      name: student?.name || `Öğrenci #${entry.key}`,
      class: student?.class || null,
      ...entry,
    };
  });

  return {
    days,
    totals: buildUsageTotals(events),
    bySurface: groupUsage(events, (event) => event.surface),
    byFeature: groupUsage(events, (event) => event.feature || event.eventType),
    byModel: groupUsage(events, (event) => event.model),
    topStudents,
    daily: buildDailyUsage(events),
    events: events.slice(0, 80).map((event) => ({
      id: event.id,
      createdAt: event.createdAt,
      studentId: event.studentId,
      studentName: event.studentId ? studentMap.get(event.studentId)?.name || null : null,
      userId: event.userId,
      actorType: event.actorType || event.userRole,
      surface: event.surface,
      feature: event.feature || event.eventType,
      requestGroupId: event.requestGroupId,
      model: event.model,
      provider: event.provider,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      reasoningTokens: event.reasoningTokens,
      totalTokens: event.totalTokens,
      inputCostUsd: event.inputCostUsd,
      outputCostUsd: event.outputCostUsd,
      totalCostUsd: event.totalCostUsd ?? event.estimatedCostUsd,
      status: event.status,
      cacheHit: event.cacheHit,
      isImage: event.isImage,
    })),
  };
}

function registerAdminRoutes(app, deps) {
  const {
    prisma,
    bcrypt,
    authMiddleware,
    requireRole,
    findNextInstitutionCode,
  } = deps;

  app.get('/api/admin/institutions', authMiddleware, requireRole('super_admin'), async (_req, res) => {
    try {
      const institutions = await prisma.institution.findMany({
        include: {
          _count: {
            select: { students: true, users: true },
          },
          subscriptions: {
            orderBy: { endDate: 'desc' },
            take: 1,
          },
          users: {
            where: { role: 'admin' },
            select: {
              id: true,
              username: true,
              email: true,
            },
            orderBy: { id: 'asc' },
            take: 1,
          },
        },
      });
      res.json(institutions.map((institution) => {
        const { users, ...rest } = institution;
        return {
          ...rest,
          adminUser: users?.[0] || null,
          controls: getInstitutionSettings(institution.id),
        };
      }));
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/admin/institutions/:id/ai-usage', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const institutionId = parseInt(req.params.id, 10);
      const days = clampUsageDays(req.query.days);
      if (!Number.isInteger(institutionId)) {
        return res.status(400).json({ error: 'Geçersiz kurum id.' });
      }

      const institution = await prisma.institution.findUnique({
        where: { id: institutionId },
        select: { id: true, name: true },
      });
      if (!institution) return res.status(404).json({ error: 'Kurum bulunamadı.' });

      const usage = await buildInstitutionAiUsage(prisma, institutionId, days);
      res.json({ institution, ...usage });
    } catch (err) {
      console.error('AI_USAGE_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/admin/ai-usage/summary', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const days = clampUsageDays(req.query.days);
      const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const institutions = await prisma.institution.findMany({ select: { id: true, name: true, status: true } });
      let events = [];
      try {
        events = await prisma.aiTelemetryEvent.findMany({
          where: { createdAt: { gte: windowStart } },
          orderBy: { createdAt: 'desc' },
          take: 5000,
        });
      } catch (error) {
        console.error('[AI_USAGE_SUMMARY][DB FALLBACK]', error.message || error);
        events = readTelemetryFileEvents(windowStart).slice(0, 5000);
      }
      events = events.map(normalizeUsageEventCosts);

      const eventGroups = new Map();
      events.forEach((event) => {
        const key = event.institutionId || 0;
        const current = eventGroups.get(key) || [];
        current.push(event);
        eventGroups.set(key, current);
      });

      const institutionsSummary = institutions.map((institution) => {
        const rows = eventGroups.get(institution.id) || [];
        const studentRows = rows.filter((event) => event.surface === 'mobile_app');
        const panelRows = rows.filter((event) => event.surface === 'institution_panel');
        return {
          institutionId: institution.id,
          institutionName: institution.name,
          status: institution.status,
          totals: buildUsageTotals(rows),
          studentUsage: buildUsageTotals(studentRows),
          panelUsage: buildUsageTotals(panelRows),
        };
      }).sort((a, b) => b.totals.totalTokens - a.totals.totalTokens);

      res.json({
        days,
        totals: buildUsageTotals(events),
        bySurface: groupUsage(events, (event) => event.surface),
        byFeature: groupUsage(events, (event) => event.feature || event.eventType),
        byModel: groupUsage(events, (event) => event.model),
        daily: buildDailyUsage(events),
        institutions: institutionsSummary,
      });
    } catch (err) {
      console.error('AI_USAGE_SUMMARY_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/admin/subscriptions', authMiddleware, requireRole('super_admin'), async (_req, res) => {
    try {
      const subscriptions = await prisma.subscription.findMany({
        include: { institution: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json(subscriptions);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/admin/subscriptions', authMiddleware, requireRole('super_admin'), async (req, res) => {
    const { institutionId, planName, amount, endDate } = req.body;
    try {
      const subscription = await prisma.subscription.create({
        data: {
          institutionId: parseInt(institutionId, 10),
          planName,
          amount: parseFloat(amount),
          endDate: new Date(endDate),
          status: 'active',
        },
      });
      await prisma.institution.update({
        where: { id: parseInt(institutionId, 10) },
        data: { status: 'active' },
      });
      res.json(subscription);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/admin/payments', authMiddleware, requireRole('super_admin'), async (_req, res) => {
    try {
      const payments = await prisma.payment.findMany({
        include: { institution: true },
        orderBy: { paidAt: 'desc' },
      });
      res.json(payments);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/admin/payments', authMiddleware, requireRole('super_admin'), async (req, res) => {
    const { institutionId, amount, paymentMethod, transactionId } = req.body;
    try {
      const payment = await prisma.payment.create({
        data: {
          institutionId: parseInt(institutionId, 10),
          amount: parseFloat(amount),
          paymentMethod,
          transactionId,
          status: 'completed',
        },
      });
      res.json(payment);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/admin/institutions', authMiddleware, requireRole('super_admin'), async (req, res) => {
    const { name, slug, logo, primaryColor, secondaryColor, adminUser } = req.body;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const institutionCode = await findNextInstitutionCode(tx);
        if (!institutionCode) {
          throw new Error('Kurum kodu üretilemedi.');
        }

        const institution = await tx.institution.create({
          data: {
            name,
            slug: slug || name.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, ''),
            logo,
            primaryColor,
            secondaryColor,
            code: institutionCode,
            studentCounter: 0,
          },
        });

        if (adminUser && adminUser.username && adminUser.password) {
          const hashedPassword = await bcrypt.hash(adminUser.password, 10);
          await tx.user.create({
            data: {
              name: adminUser.name || `${name} Admin`,
              username: adminUser.username,
              email: adminUser.email,
              password: hashedPassword,
              role: 'admin',
              institutionId: institution.id,
            },
          });
        }

        return institution;
      });

      res.json(result);
    } catch (err) {
      console.error('KURUM_HATA:', err);

      if (err.code === 'P2002') {
        const target = err.meta?.target || [];
        if (target.includes('name')) return res.status(400).json({ error: 'Bu isimde bir kurum zaten mevcut.' });
        if (target.includes('slug')) return res.status(400).json({ error: 'Bu kurum takma adı (slug) zaten kullanımda.' });
        if (target.includes('code')) return res.status(400).json({ error: 'Kurum kodu çakışması oluştu, lütfen tekrar deneyin.' });
        if (target.includes('username')) return res.status(400).json({ error: 'Bu yönetici kullanıcı adı zaten alınmış.' });
        if (target.includes('email')) return res.status(400).json({ error: 'Bu admin e-posta adresi zaten kayıtlı.' });
        return res.status(400).json({ error: 'Bu bilgilerle daha önce bir kayıt oluşturulmuş.' });
      }

      res.status(500).json({ error: 'Kurum oluşturulurken bir hata oluştu.' });
    }
  });

  app.put('/api/admin/institutions/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
    const { name, slug, logo, status, primaryColor, secondaryColor, adminUser } = req.body;
    const institutionId = parseInt(req.params.id, 10);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const institution = await tx.institution.update({
          where: { id: institutionId },
          data: { name, slug, logo, status, primaryColor, secondaryColor },
        });

        if (adminUser) {
          const admin = await tx.user.findFirst({
            where: { institutionId, role: 'admin' },
          });

          if (admin) {
            const userData = {};
            if (adminUser.username) userData.username = adminUser.username;
            if (adminUser.password) {
              userData.password = await bcrypt.hash(adminUser.password, 10);
            }

            if (Object.keys(userData).length > 0) {
              await tx.user.update({
                where: { id: admin.id },
                data: userData,
              });
            }
          }
        }

        return institution;
      });

      res.json(result);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.delete('/api/admin/institutions/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
    const institutionId = parseInt(req.params.id, 10);
    try {
      await prisma.$transaction([
        prisma.user.deleteMany({ where: { institutionId } }),
        prisma.student.deleteMany({ where: { institutionId } }),
        prisma.class.deleteMany({ where: { institutionId } }),
        prisma.exam.deleteMany({ where: { institutionId } }),
        prisma.institution.delete({ where: { id: institutionId } }),
      ]);
      deleteInstitutionSettings(institutionId);
      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_SILME_HATA:', err);
      res.status(500).json({ error: 'Kurum silinirken bir hata oluştu.' });
    }
  });

  app.get('/api/admin/institutions/:id/settings', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const institutionId = parseInt(req.params.id, 10);
      res.json(getInstitutionSettings(institutionId));
    } catch (err) {
      console.error('KURUM_AYAR_HATA:', err);
      res.status(500).json({ error: 'Kurum ayarlari okunamadi.' });
    }
  });

  app.put('/api/admin/institutions/:id/settings', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const institutionId = parseInt(req.params.id, 10);
      const updated = writeInstitutionSettings(institutionId, req.body || {});
      res.json(updated);
    } catch (err) {
      console.error('KURUM_AYAR_HATA:', err);
      res.status(500).json({ error: 'Kurum ayarlari guncellenemedi.' });
    }
  });

  app.post('/api/admin/institutions/:id/reset-admin-password', authMiddleware, requireRole('super_admin'), async (req, res) => {
    const institutionId = parseInt(req.params.id, 10);
    const nextPassword = typeof req.body?.password === 'string' ? req.body.password.trim() : '';

    if (!nextPassword) {
      return res.status(400).json({ error: 'Yeni sifre zorunludur.' });
    }

    try {
      const admin = await prisma.user.findFirst({
        where: { institutionId, role: 'admin' },
        orderBy: { id: 'asc' },
      });

      if (!admin) {
        return res.status(404).json({ error: 'Bu kuruma ait admin kullanicisi bulunamadi.' });
      }

      const hashedPassword = await bcrypt.hash(nextPassword, 10);
      await prisma.user.update({
        where: { id: admin.id },
        data: { password: hashedPassword },
      });

      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_ADMIN_SIFRE_HATA:', err);
      res.status(500).json({ error: 'Admin sifresi sifirlanamadi.' });
    }
  });

  app.get('/api/active-students-details', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const institutionId = req.user.institutionId ? Number(req.user.institutionId) : null;
      const institutionWhere = req.user.role === 'super_admin' ? {} : { institutionId };

      const activeStudents = await prisma.student.findMany({
        where: {
          ...institutionWhere,
          lastActiveAt: { gt: fiveMinutesAgo },
        },
        select: {
          id: true,
          name: true,
          class: true,
          lastActiveAt: true,
          institutionId: true,
          institution: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
        },
      });

      if (!activeStudents || activeStudents.length === 0) {
        return res.json([]);
      }

      const detailedList = await Promise.all(activeStudents.map(async (st) => {
        try {
          const [lastAnalysis, lastSession] = await Promise.all([
            prisma.questionAnalysis.findFirst({
              where: { studentId: st.id },
              orderBy: { createdAt: 'desc' },
            }),
            prisma.chatSession.findFirst({
              where: { studentId: st.id },
              orderBy: { lastActivity: 'desc' },
            }),
          ]);

          let activity = 'Uygulamada geziniyor';
          let activityTime = st.lastActiveAt;

          const analysisTime = lastAnalysis?.createdAt || new Date(0);
          const sessionTime = lastSession?.lastActivity || new Date(0);

          if (analysisTime > sessionTime && analysisTime > new Date(Date.now() - 15 * 60 * 1000)) {
            activity = `${lastAnalysis.course} dersinde soru çözüyor`;
            activityTime = analysisTime;
          } else if (sessionTime > analysisTime && sessionTime > new Date(Date.now() - 15 * 60 * 1000)) {
            activity = `${lastSession.course || 'Asistan'} ile çalışıyor`;
            activityTime = sessionTime;
          }

          return {
            id: st.id,
            name: st.name,
            class: st.class,
            institutionId: st.institutionId,
            institution: st.institution,
            activity,
            lastActiveAt: activityTime,
          };
        } catch (innerErr) {
          console.error(`Student detail error for ${st.id}:`, innerErr);
          return {
            id: st.id,
            name: st.name,
            class: st.class,
            institutionId: st.institutionId,
            institution: st.institution,
            activity: 'Aktif',
            lastActiveAt: st.lastActiveAt,
          };
        }
      }));

      res.json(detailedList.sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt)));
    } catch (err) {
      console.error('LIVE_ACTIVITY_HATA:', err);
      res.status(500).json({ error: 'Aktif öğrenciler yüklenirken bir sorun oluştu.' });
    }
  });

  app.get('/api/admin/stats', authMiddleware, requireRole('super_admin'), async (_req, res) => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const fourteenDaysAhead = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const [
        instCount,
        studentCount,
        activeInst,
        userCount,
        activeSubscriptionCount,
        expiringSubscriptionCount,
        paymentsLastThirtyDays,
      ] = await Promise.all([
        prisma.institution.count(),
        prisma.student.count(),
        prisma.institution.count({ where: { status: 'active' } }),
        prisma.user.count(),
        prisma.subscription.count({
          where: {
            status: 'active',
            endDate: { gte: new Date() },
          },
        }),
        prisma.subscription.count({
          where: {
            status: 'active',
            endDate: {
              gte: new Date(),
              lte: fourteenDaysAhead,
            },
          },
        }),
        prisma.payment.aggregate({
          _sum: { amount: true },
          where: { paidAt: { gte: thirtyDaysAgo } },
        }),
      ]);
      res.json({
        totalInstitutions: instCount,
        totalStudents: studentCount,
        activeInstitutions: activeInst,
        totalUsers: userCount,
        activeSubscriptions: activeSubscriptionCount,
        expiringSubscriptions: expiringSubscriptionCount,
        recentCollections: paymentsLastThirtyDays._sum.amount || 0,
      });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/admin/system-settings', authMiddleware, requireRole('super_admin'), async (_req, res) => {
    try {
      res.json(readSystemSettings());
    } catch (err) {
      console.error('SYSTEM_SETTINGS_HATA:', err);
      res.status(500).json({ error: 'Sistem ayarlari okunamadi.' });
    }
  });

  app.put('/api/admin/system-settings', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      const {
        appMaintenance,
        panelMaintenance,
        appMaintenanceMessage,
        panelMaintenanceMessage,
      } = req.body;

      const updated = writeSystemSettings({
        appMaintenance: Boolean(appMaintenance),
        panelMaintenance: Boolean(panelMaintenance),
        appMaintenanceMessage:
          typeof appMaintenanceMessage === 'string' ? appMaintenanceMessage.trim() : '',
        panelMaintenanceMessage:
          typeof panelMaintenanceMessage === 'string' ? panelMaintenanceMessage.trim() : '',
      });

      res.json(updated);
    } catch (err) {
      console.error('SYSTEM_SETTINGS_HATA:', err);
      res.status(500).json({ error: 'Sistem ayarlari guncellenemedi.' });
    }
  });
}

module.exports = { registerAdminRoutes };
