const aiService = require('../services/ai.service');

function mapSmartQuizAttemptForClient(attempt) {
  return {
    id: attempt.id,
    course: attempt.course,
    topic: attempt.topic,
    reason: attempt.reason || '',
    riskLabel: attempt.riskLabel || '',
    cooldownHours: attempt.cooldownHours || 24,
    sourceLastActivityAt: attempt.sourceLastActivityAt,
    assignedAt: attempt.assignedAt,
    completedAt: attempt.completedAt,
    status: attempt.status || 'pending',
    questionCount: attempt.questionCount || 0,
    explanationCount: attempt.explanationCount || 0,
    correctCount: attempt.correctCount,
    totalCount: attempt.totalCount,
    score: attempt.score,
    currentIndex:
      typeof attempt.progressCurrentIndex === 'number'
        ? attempt.progressCurrentIndex
        : null,
    coachNote: attempt.progressCoachNote || null,
    selectedAnswers: Array.isArray(attempt.progressSelectedAnswers)
      ? attempt.progressSelectedAnswers
      : [],
    questions: Array.isArray(attempt.progressQuestions)
      ? attempt.progressQuestions
      : [],
    progressUpdatedAt: attempt.progressUpdatedAt,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  };
}

function registerSmartQuizRoutes(app, deps) {
  const { prisma, authMiddleware, studentScopeGuard } = deps;

  app.get('/api/students/:id/smart-quiz/attempts', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;

    try {
      const attempts = await prisma.smartQuizAttempt.findMany({
        where: { studentId: parseInt(id, 10) },
        orderBy: [{ status: 'asc' }, { assignedAt: 'desc' }],
        take: 50,
      });

      res.json(attempts.map(mapSmartQuizAttemptForClient));
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/students/:id/smart-quiz/attempts/:attemptId', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id, attemptId } = req.params;

    try {
      const attempt = await prisma.smartQuizAttempt.findFirst({
        where: {
          id: String(attemptId),
          studentId: parseInt(id, 10),
        },
      });

      if (!attempt) {
        return res.status(404).json({ error: 'Quiz bulunamadi.' });
      }

      res.json(mapSmartQuizAttemptForClient(attempt));
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/smart-quiz/analysis', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { attemptId } = req.body || {};

    try {
      const student = await prisma.student.findUnique({
        where: { id: parseInt(id, 10) },
        select: {
          id: true,
          name: true,
          target: true,
          class: true,
          branch: true,
        },
      });

      if (!student) {
        return res.status(404).json({ error: 'Ogrenci bulunamadi.' });
      }

      const attempts = await prisma.smartQuizAttempt.findMany({
        where: { studentId: parseInt(id, 10) },
        orderBy: [{ assignedAt: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      });

      if (attemptId) {
        const attempt = attempts.find((item) => String(item.id) === String(attemptId));
        if (!attempt) {
          return res.status(404).json({ error: 'Quiz bulunamadi.' });
        }

        const analysis = await aiService.generateSmartQuizAttemptAnalysis(student, attempt);
        return res.json({ success: true, scope: 'attempt', attemptId: String(attemptId), analysis });
      }

      const analysis = await aiService.generateSmartQuizOverviewAnalysis(student, attempts);
      return res.json({ success: true, scope: 'overview', analysis });
    } catch (err) {
      console.error('SMART_QUIZ_AI_ERROR:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/smart-quiz/plan', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { plan } = req.body || {};

    if (!plan || !plan.id || !plan.course || !plan.topic || !plan.sourceLastActivityAt) {
      return res.status(400).json({ error: 'Geçersiz quiz planı.' });
    }

    try {
      const attempt = await prisma.smartQuizAttempt.upsert({
        where: { id: String(plan.id) },
        update: {
          course: String(plan.course),
          topic: String(plan.topic),
          reason: plan.reason || null,
          riskLabel: plan.riskLabel || null,
          cooldownHours: parseInt(plan.cooldownHours, 10) || 24,
          sourceLastActivityAt: new Date(plan.sourceLastActivityAt),
          assignedAt: plan.assignedAt ? new Date(plan.assignedAt) : new Date(),
          questionCount: parseInt(plan.questionCount, 10) || 0,
          explanationCount: parseInt(plan.explanationCount, 10) || 0,
          status: plan.status || 'pending',
        },
        create: {
          id: String(plan.id),
          studentId: parseInt(id, 10),
          course: String(plan.course),
          topic: String(plan.topic),
          reason: plan.reason || null,
          riskLabel: plan.riskLabel || null,
          cooldownHours: parseInt(plan.cooldownHours, 10) || 24,
          sourceLastActivityAt: new Date(plan.sourceLastActivityAt),
          assignedAt: plan.assignedAt ? new Date(plan.assignedAt) : new Date(),
          questionCount: parseInt(plan.questionCount, 10) || 0,
          explanationCount: parseInt(plan.explanationCount, 10) || 0,
          status: plan.status || 'pending',
        },
      });

      res.json({ success: true, attempt: mapSmartQuizAttemptForClient(attempt) });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/smart-quiz/progress', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { attemptId, course, topic, sourceLastActivityAt, progress } = req.body || {};

    if (!attemptId || !course || !topic || !progress || !Array.isArray(progress.questions)) {
      return res.status(400).json({ error: 'Eksik quiz ilerleme verisi.' });
    }

    const questions = progress.questions
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        question: String(item.question || ''),
        options: Array.isArray(item.options)
          ? item.options.map((option) => String(option || ''))
          : [],
        correctIndex: Number.isFinite(Number(item.correctIndex))
          ? Number(item.correctIndex)
          : 0,
        explanation: String(item.explanation || ''),
      }))
      .filter((item) => item.question && item.options.length === 4);

    if (questions.length === 0) {
      return res.status(400).json({ error: 'Quiz sorulari gecersiz.' });
    }

    const selectedAnswers = Array.isArray(progress.selectedAnswers)
      ? progress.selectedAnswers.map((value) => {
          if (value === null || value === undefined) return null;
          const parsed = parseInt(value, 10);
          return Number.isNaN(parsed) ? null : parsed;
        })
      : [];

    const normalizedCurrentIndex = Math.max(
      0,
      Math.min(parseInt(progress.currentIndex, 10) || 0, questions.length - 1),
    );

    try {
      const attempt = await prisma.smartQuizAttempt.upsert({
        where: { id: String(attemptId) },
        update: {
          studentId: parseInt(id, 10),
          course: String(course),
          topic: String(topic),
          sourceLastActivityAt: sourceLastActivityAt
            ? new Date(sourceLastActivityAt)
            : new Date(),
          status: progress.isCompleted ? 'completed' : 'in_progress',
          correctCount:
            progress.correctCount === null || progress.correctCount === undefined
              ? null
              : Math.max(0, parseInt(progress.correctCount, 10) || 0),
          totalCount: questions.length,
          progressCurrentIndex: normalizedCurrentIndex,
          progressCoachNote: progress.coachNote || null,
          progressSelectedAnswers: selectedAnswers,
          progressQuestions: questions,
          progressUpdatedAt: progress.updatedAt
            ? new Date(progress.updatedAt)
            : new Date(),
        },
        create: {
          id: String(attemptId),
          studentId: parseInt(id, 10),
          course: String(course),
          topic: String(topic),
          sourceLastActivityAt: sourceLastActivityAt
            ? new Date(sourceLastActivityAt)
            : new Date(),
          status: progress.isCompleted ? 'completed' : 'in_progress',
          totalCount: questions.length,
          progressCurrentIndex: normalizedCurrentIndex,
          progressCoachNote: progress.coachNote || null,
          progressSelectedAnswers: selectedAnswers,
          progressQuestions: questions,
          progressUpdatedAt: progress.updatedAt
            ? new Date(progress.updatedAt)
            : new Date(),
        },
      });

      res.json({ success: true, attempt: mapSmartQuizAttemptForClient(attempt) });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/smart-quiz/complete', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const {
      attemptId,
      course,
      topic,
      correctCount,
      totalCount,
      score,
      sourceLastActivityAt,
    } = req.body || {};

    if (!attemptId || !course || !topic || totalCount === undefined) {
      return res.status(400).json({ error: 'Eksik quiz tamamlama verisi.' });
    }

    try {
      const safeCorrectCount = Math.max(0, parseInt(correctCount, 10) || 0);
      const safeTotalCount = Math.max(1, parseInt(totalCount, 10) || 1);
      const safeScore = Math.max(
        0,
        Math.min(1, Number(score) || safeCorrectCount / safeTotalCount),
      );

      const attempt = await prisma.smartQuizAttempt.upsert({
        where: { id: String(attemptId) },
        update: {
          studentId: parseInt(id, 10),
          course: String(course),
          topic: String(topic),
          sourceLastActivityAt: sourceLastActivityAt
            ? new Date(sourceLastActivityAt)
            : new Date(),
          correctCount: safeCorrectCount,
          totalCount: safeTotalCount,
          score: safeScore,
          status: 'completed',
          completedAt: new Date(),
          progressUpdatedAt: new Date(),
        },
        create: {
          id: String(attemptId),
          studentId: parseInt(id, 10),
          course: String(course),
          topic: String(topic),
          sourceLastActivityAt: sourceLastActivityAt
            ? new Date(sourceLastActivityAt)
            : new Date(),
          correctCount: safeCorrectCount,
          totalCount: safeTotalCount,
          score: safeScore,
          status: 'completed',
          completedAt: new Date(),
          progressUpdatedAt: new Date(),
        },
      });

      await prisma.student.update({
        where: { id: parseInt(id, 10) },
        data: { lastActiveAt: new Date() },
      });

      res.json({ success: true, attempt: mapSmartQuizAttemptForClient(attempt) });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.delete('/api/students/:id/smart-quiz/attempts/:attemptId', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id, attemptId } = req.params;

    if (!attemptId) {
      return res.status(400).json({ error: 'Eksik quiz kaydi.' });
    }

    try {
      const deleted = await prisma.smartQuizAttempt.deleteMany({
        where: {
          id: String(attemptId),
          studentId: parseInt(id, 10),
        },
      });

      if (!deleted.count) {
        return res.status(404).json({ error: 'Quiz kaydi bulunamadi.' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });
}

module.exports = { registerSmartQuizRoutes, mapSmartQuizAttemptForClient };
