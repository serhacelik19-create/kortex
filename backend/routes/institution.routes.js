function registerInstitutionRoutes(app, deps) {
  const { prisma, xss, aiService, authMiddleware, requireRole } = deps;

  app.get('/api/parents', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const where =
        req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };
      const students = await prisma.student.findMany({
        where,
        include: {
          exams: {
            orderBy: { date: 'desc' },
            take: 1,
          },
          parentDeviceSessions: {
            where: { revokedAt: null },
            select: { id: true },
          },
        },
      });

      const parents = students.map((student) => {
        const lastExam = student.exams[0];
        let currentStatus = student.reportStatus || (student.aiExamReport ? 'ready' : 'pending');
        if (currentStatus === 'sent' && student.lastReport) {
          try {
            const [day, month, year] = student.lastReport.split('.').map(Number);
            const reportDate = new Date(year, month - 1, day);
            const now = new Date();
            const diffDays = Math.ceil(
              Math.abs(now - reportDate) / (1000 * 60 * 60 * 24),
            );
            if (diffDays >= 6) currentStatus = 'pending';
          } catch (error) {
            console.error('Tarih ayrıştırma hatası:', error);
          }
        }

        return {
          id: student.id,
          student: student.name || 'İsimsiz Öğrenci',
          class: student.class || '',
          parent: student.parentName || 'Veli Bilgisi Yok',
          phone: student.parentPhone || '',
          lastReport: student.lastReport || 'Rapor oluşturulmadı',
          status: currentStatus,
          progress: student.progress || 0,
          solvedCount: student.solvedCount || 0,
          lastTyt: lastExam?.tytNet || 0,
          lastAyt: lastExam?.aytNet || 0,
          aiExamReport: student.aiExamReport || '',
          isIndividualReport: student.isIndividualReport || false,
          activeParentDeviceCount: student.parentDeviceSessions?.length || 0,
        };
      });
      res.json(parents);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/crm/stats', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const where =
        req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };
      const students = await prisma.student.findMany({ where });

      if (students.length === 0) {
        return res.json({
          sentCount: 0,
          pendingCount: 0,
          readRate: 0,
          interestRate: 0,
          topTopic: 'Veri Yok',
        });
      }

      const sentCount = students.filter((student) => student.reportStatus === 'sent').length;
      const pendingCount = students.length - sentCount;
      const hasExams = students.some((student) => student.solvedCount > 0);
      const readRate = sentCount > 0 ? (sentCount / students.length) * 100 : 0;
      const interestRate = hasExams ? 75 : 0;
      const topTopic = hasExams ? 'Deneme Analizi' : 'Veri Bekleniyor';

      res.json({
        sentCount,
        pendingCount,
        readRate: parseInt(readRate.toFixed(0), 10),
        interestRate,
        topTopic,
      });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/crm/report-sample', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const { refresh } = req.query;
      const institutionId = req.user.institutionId;

      const institution = await prisma.institution.findUnique({
        where: { id: institutionId },
        select: { aiReportSample: true },
      });

      if (institution?.aiReportSample && refresh !== 'true') {
        return res.json({ report: institution.aiReportSample });
      }

      const where =
        req.user.role === 'super_admin'
          ? { parentName: { not: null } }
          : { parentName: { not: null }, institutionId };
      const student = await prisma.student.findFirst({
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

      if (!student || !student.parentName) {
        return res.json({
          report: 'Sistemde örnek rapor oluşturulabilecek veli iletişim kaydı bulunmuyor.',
        });
      }

      const aiResult = await aiService.generateStudentAnalysis(
        student,
        student.exams,
        'aiExamReport',
        'individual',
        student.questionAnalyses || [],
      );
      const newSample = aiResult.aiExamReport;

      await prisma.institution.update({
        where: { id: institutionId },
        data: { aiReportSample: newSample },
      });

      res.json({ report: newSample });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/institution/whatsapp-numbers', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const numbers = await prisma.institutionWhatsApp.findMany({
        where: { institutionId: req.user.institutionId },
        orderBy: { createdAt: 'asc' },
      });
      res.json(numbers);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/institution/whatsapp-numbers', authMiddleware, requireRole('admin'), async (req, res) => {
    const { number, label, isDefault } = req.body;
    try {
      if (isDefault) {
        await prisma.institutionWhatsApp.updateMany({
          where: { institutionId: req.user.institutionId },
          data: { isDefault: false },
        });
      }

      const newNumber = await prisma.institutionWhatsApp.create({
        data: {
          number,
          label,
          isDefault: isDefault || false,
          institutionId: req.user.institutionId,
        },
      });
      res.json(newNumber);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.put('/api/institution/whatsapp-numbers/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { number, label, isDefault } = req.body;
    try {
      if (isDefault) {
        await prisma.institutionWhatsApp.updateMany({
          where: { institutionId: req.user.institutionId },
          data: { isDefault: false },
        });
      }

      const updated = await prisma.institutionWhatsApp.update({
        where: { id: parseInt(id, 10), institutionId: req.user.institutionId },
        data: { number, label, isDefault },
      });
      res.json(updated);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.delete('/api/institution/whatsapp-numbers/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
      await prisma.institutionWhatsApp.delete({
        where: { id: parseInt(id, 10), institutionId: req.user.institutionId },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/institution/settings', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
      if (!req.user.institutionId) {
        if (req.user.role === 'super_admin') {
          return res.json({ name: 'Sistem Yöneticisi', whatsappNumbers: [] });
        }
        return res.status(404).json({ error: 'Kurum bulunamadı' });
      }
      const institution = await prisma.institution.findUnique({
        where: { id: req.user.institutionId },
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          primaryColor: true,
          secondaryColor: true,
          whatsappNumber: true,
          whatsappNumbers: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      res.json(institution);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.put('/api/institution/settings', authMiddleware, requireRole('admin'), async (req, res) => {
    const { whatsappNumber, logo, primaryColor, secondaryColor, aiReportSample } =
      req.body;
    try {
      const updated = await prisma.institution.update({
        where: { id: req.user.institutionId },
        data: {
          whatsappNumber: whatsappNumber ? xss(whatsappNumber) : null,
          logo: logo ? xss(logo) : null,
          primaryColor: primaryColor ? xss(primaryColor) : null,
          secondaryColor: secondaryColor ? xss(secondaryColor) : null,
          aiReportSample: aiReportSample ? xss(aiReportSample) : null,
        },
      });
      res.json(updated);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/subject-averages', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const where =
        req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };

      const [studentsCount, allAnalyses] = await Promise.all([
        prisma.student.count({ where }),
        prisma.questionAnalysis.findMany({
          where:
            req.user.role === 'super_admin'
              ? {}
              : { student: { institutionId: req.user.institutionId } },
        }),
      ]);

      const subjects = [
        'Matematik',
        'Fizik',
        'Kimya',
        'Biyoloji',
        'Türkçe',
        'Tarih',
        'Coğrafya',
        'Felsefe',
        'Din Kültürü',
      ];

      const totals = {};
      subjects.forEach((subject) => {
        totals[subject] = 0;
      });

      allAnalyses.forEach((analysis) => {
        const match = subjects.find((subject) => (analysis.course || '').includes(subject));
        if (match) totals[match] += 1;
      });

      const averages = subjects.map((subject) => ({
        subject,
        average_value: studentsCount > 0 ? Math.round(totals[subject] / studentsCount) : 0,
      }));

      res.json(averages);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });
}

module.exports = { registerInstitutionRoutes };
