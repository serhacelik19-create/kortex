const fs = require('fs');
const path = require('path');

const TELEMETRY_FILE = path.join(
  __dirname,
  '..',
  'reports',
  'ai-telemetry',
  'ai-telemetry.ndjson',
);

function readTelemetryEvents() {
  if (!fs.existsSync(TELEMETRY_FILE)) return [];
  const raw = fs.readFileSync(TELEMETRY_FILE, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function registerReportRoutes(app, deps) {
  const {
    prisma,
    bcrypt,
    aiService,
    authMiddleware,
    requireRole,
    studentScopeGuard,
    batchIntroSuggestionCache,
    batchIntroRouteCacheTtlMs,
  } = deps;

  app.post('/api/reports/batch-generate', authMiddleware, requireRole('admin'), async (req, res) => {
    const { template } = req.body;
    try {
      const today = new Date().toLocaleDateString('tr-TR');
      if (template) {
        await prisma.institution.update({
          where: { id: req.user.institutionId },
          data: { aiReportSample: template },
        });
      }

      const where =
        req.user.role === 'super_admin'
          ? { parentName: { not: null } }
          : { parentName: { not: null }, institutionId: req.user.institutionId };

      const students = await prisma.student.findMany({
        where,
        include: {
          exams: { orderBy: { date: 'desc' }, take: 15 },
          questionAnalyses: true,
          dailyActivities: { orderBy: { date: 'desc' }, take: 30 },
          attendances: { orderBy: { date: 'desc' }, take: 30 },
          smartQuizAttempts: { orderBy: [{ assignedAt: 'desc' }, { createdAt: 'desc' }], take: 20 },
          guidanceAlerts: { orderBy: { createdAt: 'desc' }, take: 10 },
          dropAnalyses: { orderBy: { createdAt: 'desc' }, take: 10 },
          assignedContentRecipients: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
              assignment: {
                select: {
                  dueAt: true,
                  expectedDurationMinutes: true,
                  note: true,
                  content: {
                    select: {
                      title: true,
                      course: true,
                      examScope: true,
                      teacherNote: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      let successCount = 0;
      let failCount = 0;

      for (const student of students) {
        try {
          const aiResult = await aiService.generateStudentAnalysis(
            student,
            student.exams,
            'aiExamReport',
            'batch',
            student.questionAnalyses,
          );

          await prisma.student.update({
            where: { id: student.id },
            data: {
              aiExamReport: aiResult.aiExamReport || 'Rapor oluşturulamadı.',
              isIndividualReport: false,
              reportStatus: 'ready',
              lastReport: today,
            },
          });
          successCount += 1;
        } catch (studentError) {
          console.error(`[BATCH] Error generating for student ${student.id}:`, studentError);
          failCount += 1;
        }
      }

      res.json({
        success: true,
        message: `${successCount} rapor başarıyla oluşturuldu. ${failCount} hata oluştu.`,
        successCount,
        failCount,
      });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/reports/batch-suggest-intro', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institution = await prisma.institution.findUnique({
        where: { id: req.user.institutionId },
        select: { name: true },
      });
      const cacheKey = `${req.user.institutionId}:${institution?.name || 'kurumumuz'}`;
      const cached = batchIntroSuggestionCache.get(cacheKey);
      if (cached && Date.now() - cached.createdAt < batchIntroRouteCacheTtlMs) {
        return res.json({ suggestion: cached.value });
      }

      const suggestion = await aiService.generateBatchIntroduction(
        institution?.name || 'Kurumumuz',
      );
      batchIntroSuggestionCache.set(cacheKey, {
        value: suggestion,
        createdAt: Date.now(),
      });
      res.json({ suggestion });
    } catch (err) {
      console.error('INTRO_SUGGEST_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/students/:id/weekly-report', authMiddleware, studentScopeGuard, async (req, res) => {
    try {
      const studentId = parseInt(req.params.id, 10);

      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true },
      });

      if (!student) return res.status(404).json({ error: 'Öğrenci bulunamadı' });

      const activities = await prisma.dailyActivity.findMany({
        where: { studentId },
        orderBy: { date: 'asc' },
        select: { date: true, solvedCount: true },
      });

      const analyses = await prisma.questionAnalysis.findMany({
        where: { studentId },
        select: { course: true, topic: true, difficulty: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      let startDate = new Date();
      if (activities.length > 0) startDate = new Date(activities[0].date);
      if (analyses.length > 0) {
        const firstAnalysisDate = new Date(analyses[0].createdAt);
        if (firstAnalysisDate < startDate) startDate = firstAnalysisDate;
      }

      activities.reverse();
      analyses.reverse();

      res.json({ activities, analyses, studentCreatedAt: startDate });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/reports/ai-telemetry-summary', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
      const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
      const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const institutionId =
        req.user.role === 'super_admin' ? null : req.user.institutionId;

      const events = readTelemetryEvents().filter((event) => {
        if (!event?.createdAt) return false;
        const createdAt = new Date(event.createdAt);
        if (Number.isNaN(createdAt.getTime()) || createdAt < windowStart) return false;
        if (institutionId == null) return true;
        return event.institutionId === institutionId;
      });

      const cacheChecks = events.filter((event) => event.eventType === 'cache_check');
      const cacheHits = cacheChecks.filter((event) => event.cacheHit === true);
      const imageRequests = events.filter((event) => event.isImage === true);
      const imageHits = cacheHits.filter((event) => event.isImage === true);
      const askEvents = events.filter(
        (event) =>
          event.eventType === 'ai_ask' &&
          event.status === 'success' &&
          typeof event.estimatedCostUsd === 'number',
      );
      const totalEstimatedCostUsd = askEvents.reduce(
        (sum, event) => sum + (event.estimatedCostUsd || 0),
        0,
      );
      const totalEstimatedSavedUsd = cacheHits.reduce(
        (sum, event) => sum + (event.estimatedSavedUsd || 0),
        0,
      );
      const retries = events.filter(
        (event) => event.eventType === 'ai_retry' && event.retryRequested,
      );
      const sourceBreakdown = ['traditional', 'image', 'semantic', 'embedding'].map(
        (source) => ({
          source,
          hits: cacheHits.filter((event) => event.cacheSource === source).length,
        }),
      );

      const uniqueUsers = new Set(
        events.map((event) => event.userId).filter((value) => Number.isInteger(value)),
      );
      const monthlyProjectedPerStudentUsd =
        uniqueUsers.size > 0 ? totalEstimatedCostUsd / uniqueUsers.size : null;

      res.json({
        days,
        totalEvents: events.length,
        totalRequests: askEvents.length,
        cacheChecks: cacheChecks.length,
        cacheHits: cacheHits.length,
        cacheHitRate: cacheChecks.length > 0 ? cacheHits.length / cacheChecks.length : 0,
        imageRequestCount: imageRequests.length,
        imageCacheHitRate:
          imageRequests.length > 0 ? imageHits.length / imageRequests.length : 0,
        retryCount: retries.length,
        sourceBreakdown,
        totalEstimatedCostUsd,
        totalEstimatedSavedUsd,
        uniqueUserCount: uniqueUsers.size,
        monthlyProjectedPerStudentUsd,
      });
    } catch (err) {
      console.error('AI_TELEMETRY_SUMMARY_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/ai-update', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const studentId = parseInt(req.params.id, 10);
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        include: {
          exams: { orderBy: { date: 'desc' }, take: 15 },
          questionAnalyses: true,
          dailyActivities: { orderBy: { date: 'desc' }, take: 30 },
          attendances: { orderBy: { date: 'desc' }, take: 30 },
          smartQuizAttempts: { orderBy: [{ assignedAt: 'desc' }, { createdAt: 'desc' }], take: 20 },
          guidanceAlerts: { orderBy: { createdAt: 'desc' }, take: 10 },
          dropAnalyses: { orderBy: { createdAt: 'desc' }, take: 10 },
          assignedContentRecipients: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
              assignment: {
                select: {
                  dueAt: true,
                  expectedDurationMinutes: true,
                  note: true,
                  content: {
                    select: {
                      title: true,
                      course: true,
                      examScope: true,
                      teacherNote: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!student) return res.status(404).send('Öğrenci bulunamadı.');

      const { field } = req.body;
      const aiResult = await aiService.generateStudentAnalysis(
        student,
        student.exams,
        field,
        'individual',
        student.questionAnalyses,
      );

      const data = {};
      if (field === 'aiComment') {
        data.aiComment =
          typeof aiResult.aiComment === 'string'
            ? aiResult.aiComment
            : JSON.stringify(aiResult.aiComment || '');
      } else if (field === 'aiStress') {
        data.aiStressLevel = parseInt(aiResult.aiStressLevel, 10) || 0;
        data.aiStressComment =
          typeof aiResult.aiStressComment === 'string'
            ? aiResult.aiStressComment
            : JSON.stringify(aiResult.aiStressComment || '');
      } else if (field === 'aiExamReport') {
        data.aiExamReport = aiResult.aiExamReport || 'Rapor oluşturulamadı.';
        data.isIndividualReport = true;
        data.reportStatus = 'ready';
      } else if (field === 'aiNetAnalysis') {
        data.aiNetAnalysis =
          typeof aiResult.aiNetAnalysis === 'string'
            ? aiResult.aiNetAnalysis
            : JSON.stringify(aiResult.aiNetAnalysis || []);
      } else if (field === 'aiTargetAnalysis') {
        data.aiTargetAnalysis =
          typeof aiResult.aiTargetAnalysis === 'string'
            ? aiResult.aiTargetAnalysis
            : JSON.stringify(aiResult.aiTargetAnalysis || '');
      } else if (field === 'aiHardTopics') {
        data.aiHardTopics = JSON.stringify(aiResult.aiHardTopics || []);
      } else if (!field) {
        data.aiStressLevel = parseInt(aiResult.aiStressLevel, 10) || 0;
        data.aiStressComment =
          typeof aiResult.aiStressComment === 'string'
            ? aiResult.aiStressComment
            : JSON.stringify(aiResult.aiStressComment || '');
        data.aiComment =
          typeof aiResult.aiComment === 'string'
            ? aiResult.aiComment
            : JSON.stringify(aiResult.aiComment || '');
        data.aiExamReport = aiResult.aiExamReport || 'Rapor oluşturulamadı.';
        data.isIndividualReport = true;
        data.reportStatus = 'ready';
        data.aiNetAnalysis =
          typeof aiResult.aiNetAnalysis === 'string'
            ? aiResult.aiNetAnalysis
            : JSON.stringify(aiResult.aiNetAnalysis || []);
        data.aiHardTopics = JSON.stringify(aiResult.aiHardTopics || []);
        data.aiTargetAnalysis =
          typeof aiResult.aiTargetAnalysis === 'string'
            ? aiResult.aiTargetAnalysis
            : JSON.stringify(aiResult.aiTargetAnalysis || '');
      }

      const updatedStudent = await prisma.student.update({
        where: { id: studentId },
        data,
      });

      res.json({ success: true, ai_data: updatedStudent });
    } catch (err) {
      console.error('AI Update Error:', err);
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.put('/api/students/:id/access', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const studentId = parseInt(req.params.id, 10);
      const updateData = req.body;

      const fields = {};
      if (updateData.username !== undefined) fields.username = updateData.username;
      if (updateData.password !== undefined && updateData.password !== '') {
        fields.password = await bcrypt.hash(updateData.password, 10);
      }

      const student = await prisma.student.update({
        where: { id: studentId },
        data: fields,
      });

      res.json(student);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/reports/batch-mark-sent', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const today = new Date().toLocaleDateString('tr-TR');

      const result = await prisma.student.updateMany({
        where: {
          institutionId,
          aiExamReport: { not: null },
          reportStatus: { not: 'sent' },
        },
        data: {
          reportStatus: 'sent',
          lastReport: today,
        },
      });

      res.json({
        success: true,
        count: result.count,
        message: `${result.count} rapor başarıyla gönderildi olarak işaretlendi.`,
      });
    } catch (err) {
      console.error('Batch Mark Sent Error:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/mark-sent', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const studentId = parseInt(req.params.id, 10);
      const today = new Date().toLocaleDateString('tr-TR');

      await prisma.student.update({
        where: { id: studentId },
        data: {
          reportStatus: 'sent',
          lastReport: today,
        },
      });

      res.json({ success: true, message: 'Rapor başarıyla gönderildi olarak işaretlendi.' });
    } catch (err) {
      console.error('Mark Sent Error:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });
}

module.exports = { registerReportRoutes };
