const { z } = require('zod');
const { sendError } = require('../utils/errorHandler');

// Giriş doğrulama şemaları
const createSurveySchema = z.object({
  title: z.string().min(1, 'Başlık boş olamaz.').max(200),
  description: z.string().max(1000).optional(),
  questions: z.array(z.object({
    text: z.string().min(1).max(1000),
    type: z.enum(['multiple_choice', 'text']),
    options: z.array(z.string().max(500)).optional().nullable(),
    required: z.boolean().optional(),
  })).min(1, 'En az bir soru gerekli.'),
});

const submitAnswersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.number().int().positive(),
    answerText: z.string().max(2000).optional().nullable(),
    selectedOption: z.string().max(500).optional().nullable(),
  })).min(1, 'En az bir yanıt gerekli.'),
});

function registerGuidanceRoutes(app, deps) {
  const { prisma, authMiddleware, requireRole } = deps;

  // Anket oluştur (Hoca/Admin)
  app.post('/api/guidance/surveys', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const parsed = createSurveySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors.map(e => e.message).join(', ') });
    }
    const { title, description, questions } = parsed.data;

    try {
      const survey = await prisma.$transaction(async (tx) => {
        return tx.guidanceSurvey.create({
          data: {
            title,
            description,
            institutionId: req.user.institutionId,
            createdByUserId: req.user.id,
            questions: {
              create: questions.map((q, index) => ({
                text: q.text,
                type: q.type,
                options: q.options || null,
                required: q.required !== undefined ? q.required : true,
                orderIndex: index,
              })),
            },
          },
        });
      });
      res.json(survey);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Anketleri listele (Tüm hoca/adminlar kendi kurumundakileri görür)
  app.get('/api/guidance/surveys', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      const surveys = await prisma.guidanceSurvey.findMany({
        where: { institutionId: req.user.institutionId },
        include: {
          questions: { orderBy: { orderIndex: 'asc' } },
          assignments: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json(surveys);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Anketi bir öğrenciye veya sınıfa ata
  app.post('/api/guidance/surveys/:id/assign', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { id } = req.params;
    const { studentId, className, allInstitution } = req.body;

    try {
      const surveyId = parseInt(id, 10);
      if (isNaN(surveyId)) return res.status(400).json({ error: 'Geçersiz anket ID.' });

      const survey = await prisma.guidanceSurvey.findUnique({ where: { id: surveyId } });

      if (!survey || survey.institutionId !== req.user.institutionId) {
        return res.status(404).json({ error: 'Anket bulunamadı.' });
      }

      if (allInstitution) {
        const students = await prisma.student.findMany({
          where: { institutionId: req.user.institutionId },
          select: { id: true },
        });
        const assignments = await prisma.guidanceSurveyAssignment.createMany({
          data: students.map((s) => ({ surveyId, studentId: s.id, status: 'pending' })),
          skipDuplicates: true,
        });
        return res.json({ success: true, count: assignments.count, target: 'all' });
      }

      if (className) {
        const students = await prisma.student.findMany({
          where: { class: className, institutionId: req.user.institutionId },
          select: { id: true },
        });
        const assignments = await prisma.guidanceSurveyAssignment.createMany({
          data: students.map((s) => ({ surveyId, studentId: s.id, status: 'pending' })),
          skipDuplicates: true,
        });
        return res.json({ success: true, count: assignments.count, target: 'class' });
      }

      if (studentId) {
        // IDOR koruması: öğrencinin aynı kurumda olduğunu doğrula
        const student = await prisma.student.findUnique({ where: { id: parseInt(studentId, 10) } });
        if (!student || student.institutionId !== req.user.institutionId) {
          return res.status(403).json({ error: 'Bu öğrenciye atama yetkiniz yok.' });
        }
        const assignment = await prisma.guidanceSurveyAssignment.create({
          data: { surveyId, studentId: parseInt(studentId, 10), status: 'pending' },
        });
        return res.json({ success: true, assignment, target: 'student' });
      }

      res.status(400).json({ error: 'studentId, className veya allInstitution gereklidir.' });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Öğrencinin kendine atanan anketleri listelemesi (Mobilde kullanacak)
  app.get('/api/guidance/my-assignments', authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({ error: 'Sadece öğrenciler bu kaynağa erişebilir.' });
      }
      const assignments = await prisma.guidanceSurveyAssignment.findMany({
        where: { studentId: req.user.id },
        include: {
          survey: { include: { questions: { orderBy: { orderIndex: 'asc' } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json(assignments);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Anket yanıtlarını gönder (Öğrenci)
  app.post('/api/guidance/assignments/:id/submit', authMiddleware, async (req, res) => {
    const parsed = submitAnswersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors.map(e => e.message).join(', ') });
    }

    const { id } = req.params;
    const { answers } = parsed.data;

    try {
      const assignmentId = parseInt(id, 10);
      if (isNaN(assignmentId)) return res.status(400).json({ error: 'Geçersiz atama ID.' });

      const assignment = await prisma.guidanceSurveyAssignment.findUnique({
        where: { id: assignmentId },
      });

      // IDOR koruması: öğrenci sadece kendi atamasını görebilir
      if (!assignment || (req.user.role === 'student' && assignment.studentId !== req.user.id)) {
        return res.status(403).json({ error: 'Erişim yetkiniz yok.' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.guidanceSurveyResponse.deleteMany({ where: { assignmentId } });
        await tx.guidanceSurveyResponse.createMany({
          data: answers.map((ans) => ({
            assignmentId,
            questionId: ans.questionId,
            answerText: ans.answerText || null,
            selectedOption: ans.selectedOption || null,
          })),
        });
        await tx.guidanceSurveyAssignment.update({
          where: { id: assignmentId },
          data: { status: 'completed', completedAt: new Date() },
        });
      });

      res.json({ success: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Anket sonuçlarını listele (Hoca/Admin)
  app.get('/api/guidance/surveys/:id/results', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { id } = req.params;

    try {
      const surveyId = parseInt(id, 10);
      if (isNaN(surveyId)) return res.status(400).json({ error: 'Geçersiz anket ID.' });

      const survey = await prisma.guidanceSurvey.findUnique({
        where: { id: surveyId },
        include: {
          questions: true,
          assignments: {
            include: {
              student: { select: { id: true, name: true, class: true } },
              responses: true,
            },
          },
        },
      });

      if (!survey) return res.status(404).json({ error: 'Anket bulunamadı.' });

      // IDOR koruması: sadece kendi kurumunun anketine erişebilir
      if (req.user.role !== 'super_admin' && survey.institutionId !== req.user.institutionId) {
        return res.status(403).json({ error: 'Bu ankete erişim yetkiniz yok.' });
      }

      res.json(survey);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Anketi sil (Hoca/Admin)
  app.delete('/api/guidance/surveys/:id', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { id } = req.params;
    try {
      const surveyId = parseInt(id, 10);
      if (isNaN(surveyId)) return res.status(400).json({ error: 'Geçersiz ID formatı.' });

      const survey = await prisma.guidanceSurvey.findUnique({ where: { id: surveyId } });

      if (!survey) return res.status(404).json({ error: 'Anket bulunamadı.' });

      if (req.user.role !== 'super_admin' && survey.institutionId !== req.user.institutionId) {
        return res.status(403).json({ error: 'Bu anketi silme yetkiniz yok.' });
      }

      await prisma.guidanceSurvey.delete({ where: { id: surveyId } });
      res.json({ success: true, message: 'Anket ve ilgili tüm veriler silindi.' });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Belirli bir öğrencinin tüm rehberlik geçmişini getir — IDOR korumalı
  app.get('/api/guidance/student/:id', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { id } = req.params;
    try {
      const studentId = parseInt(id, 10);
      if (isNaN(studentId)) return res.status(400).json({ error: 'Geçersiz öğrenci ID.' });

      // IDOR düzeltmesi: öğrencinin aynı kurumda olduğunu doğrula
      if (req.user.role !== 'super_admin') {
        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student || student.institutionId !== req.user.institutionId) {
          return res.status(403).json({ error: 'Bu öğrencinin verilerine erişim yetkiniz yok.' });
        }
      }

      const [assignments, appointments] = await Promise.all([
        prisma.guidanceSurveyAssignment.findMany({
          where: { studentId },
          include: {
            survey: { include: { questions: { orderBy: { orderIndex: 'asc' } } } },
            responses: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.appointment.findMany({
          where: { studentId },
          orderBy: { startTime: 'desc' },
        }),
      ]);

      res.json({ assignments, appointments });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Öğrencinin kendi güncel haftalık planını getir (Mobil Uygulama için)
  app.get('/api/guidance/curriculum', authMiddleware, async (req, res) => {
    try {
      const studentId = req.user.id;
      // En güncel planı getir
      const plan = await prisma.weeklyCurriculum.findFirst({
        where: { studentId },
        include: { tasks: { orderBy: { dayIndex: 'asc' } } },
        orderBy: { weekStartDate: 'desc' }
      });
      
      res.json(plan);
    } catch (err) {
      console.error('PLANNER_DEBUG_ERROR (Fetch My):', err);
      sendError(res, err);
    }
  });

  // ==================== HAFTALIK ÇİZELGE (WEEKLY CURRICULUM) ====================

  // Haftalık planları listele
  app.get('/api/guidance/curriculum/:studentId', authMiddleware, async (req, res) => {
    const { studentId } = req.params;
    try {
      const id = parseInt(studentId, 10);
      const access = await prisma.student.findUnique({
        where: { id },
        select: { institutionId: true }
      });

      if (!access || (req.user.role !== 'super_admin' && access.institutionId !== req.user.institutionId)) {
        return res.status(403).json({ error: 'Bu öğrencinin verilerine erişim yetkiniz yok.' });
      }

      const plans = await prisma.weeklyCurriculum.findMany({
        where: { studentId: id },
        include: { tasks: { orderBy: { dayIndex: 'asc' } } },
        orderBy: { weekStartDate: 'desc' },
      });
      res.json(plans);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Haftalık plan oluştur veya güncelle
  app.post('/api/guidance/curriculum', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { studentId, weekStartDate, tasks } = req.body;
    console.log('PLANNER_DEBUG: Save request received:', { studentId, weekStartDate, tasksCount: tasks?.length });
    try {
      const id = parseInt(studentId, 10);
      if (isNaN(id)) throw new Error('Geçersiz öğrenci ID');

      const start = weekStartDate ? new Date(weekStartDate) : new Date();
      if (isNaN(start.getTime())) throw new Error('Geçersiz tarih formatı');

      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      const normalizedStart = new Date(start.setDate(diff));
      normalizedStart.setHours(0, 0, 0, 0);

      console.log('PLANNER_DEBUG: Normalized Date:', normalizedStart);

      const plan = await prisma.weeklyCurriculum.upsert({
        where: { studentId_weekStartDate: { studentId: id, weekStartDate: normalizedStart } },
        update: { status: 'active', updatedAt: new Date() },
        create: { studentId: id, weekStartDate: normalizedStart, status: 'active' },
      });

      console.log('PLANNER_DEBUG: Plan upserted, ID:', plan.id);

      await prisma.weeklyCurriculumTask.deleteMany({ where: { curriculumId: plan.id } });
      
      if (tasks && Array.isArray(tasks)) {
        await prisma.weeklyCurriculumTask.createMany({
          data: tasks.map(t => ({
            curriculumId: plan.id,
            dayIndex: parseInt(t.dayIndex, 10) || 0,
            subject: t.subject,
            topic: t.topic,
            status: t.status || 'pending',
            isAiSuggested: t.isAiSuggested || false,
          }))
        });
      }

      const updatedPlan = await prisma.weeklyCurriculum.findUnique({
        where: { id: plan.id },
        include: { tasks: { orderBy: { dayIndex: 'asc' } } }
      });

      res.json(updatedPlan);
    } catch (err) {
      console.error('PLANNER_DEBUG_ERROR (Save):', err);
      sendError(res, err);
    }
  });

  // Görev durumunu güncelle (Örn: Öğrenci veya Hoca tik attığında)
  app.post('/api/guidance/curriculum/tasks/:taskId/status', authMiddleware, requireRole('admin', 'teacher', 'student'), async (req, res) => {
    const { taskId } = req.params;
    const { status } = req.body; // 'pending', 'completed', 'missed'

    try {
      const id = parseInt(taskId, 10);
      const task = await prisma.weeklyCurriculumTask.update({
        where: { id },
        data: { 
          status,
          completedAt: status === 'completed' ? new Date() : null
        },
      });
      res.json(task);
    } catch (err) {
      sendError(res, err);
    }
  });

  // AI Önerileri Al (Hoca için taslak oluşturur)
  app.post('/api/guidance/curriculum/suggest', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { studentId } = req.body;
    console.log('PLANNER_DEBUG: Suggest request received for student:', studentId);
    try {
      const id = parseInt(studentId, 10);
      
      const student = await prisma.student.findUnique({
        where: { id },
        include: {
          exams: { take: 15, orderBy: { date: 'desc' } },
          questionAnalyses: { take: 100, orderBy: { createdAt: 'desc' } },
          dailyActivities: { take: 30, orderBy: { date: 'desc' } },
          chatSessions: { 
            include: { analysis: true },
            take: 10,
            orderBy: { lastActivity: 'desc' }
          },
          weeklyCurriculums: {
            take: 1,
            orderBy: { weekStartDate: 'desc' },
            include: { tasks: true }
          }
        }
      });

      if (!student) {
        console.error('PLANNER_DEBUG: Student not found:', id);
        return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
      }

      console.log('PLANNER_DEBUG: Fetching AI suggestions...');
      const suggestions = await deps.aiService.generateCurriculumSuggestions(student);
      console.log('PLANNER_DEBUG: Suggestions received:', suggestions?.suggestions?.length || 0);
      res.json(suggestions);
    } catch (err) {
      console.error('PLANNER_DEBUG_ERROR (Suggest):', err);
      sendError(res, err);
    }
  });
}

module.exports = { registerGuidanceRoutes };
