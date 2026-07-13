function registerStudentRoutes(app, deps) {
  const {
    prisma,
    bcrypt,
    authMiddleware,
    requireRole,
    studentScopeGuard,
    generateStudentUsername,
  } = deps;

  app.get('/api/students', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
      const where =
        req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };
        
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
        where.class = { in: req.user.assignedClasses };
      }

      const studentsRaw = await prisma.student.findMany({
        where,
        select: {
          id: true,
          name: true,
          class: true,
          target: true,
          progress: true,
          solvedCount: true,
          lastSeen: true,
          lastActiveAt: true,
          trend: true,
          username: true,
          studentNumber: true,
          branch: true,
          reportStatus: true,
          lastReport: true,
          parentName: true,
          parentPhone: true,
          onboardingComplete: true,
          aiStressLevel: true,
          aiStressComment: true,
          aiComment: true,
          aiStreak: true,
          aiHardTopics: true,
          aiExamReport: true,
          aiTargetAnalysis: true,
          aiNetAnalysis: true,
          goalUniversity: true,
          goalScore: true,
          examDate: true,
          unlockedAchievements: true,
          institutionId: true,
          institution: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
          password: true,
          totalContractAmount: true,
          downPayment: true,
          discountAmount: true,
        },
      });

      const students = studentsRaw.map(({ password, ...student }) => ({
        ...student,
        hasPassword: Boolean(password),
      }));
      res.json(students);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/sync', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { solvedCount, progress, lastSeen, onboardingComplete, streak } = req.body;

    try {
      await prisma.student.update({
        where: { id: parseInt(id, 10) },
        data: {
          solvedCount: solvedCount !== undefined ? solvedCount : undefined,
          aiStreak: streak !== undefined ? streak : undefined,
          lastSeen: lastSeen !== undefined ? lastSeen : 'Şimdi',
          onboardingComplete:
            onboardingComplete !== undefined ? onboardingComplete : undefined,
          lastActiveAt: new Date(),
        },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/ai-analysis', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { course, topic, subtopic, difficulty } = req.body;

    try {
      const analysis = await prisma.questionAnalysis.create({
        data: {
          studentId: parseInt(id, 10),
          course,
          topic,
          subtopic,
          difficulty,
        },
      });

      await prisma.student.update({
        where: { id: parseInt(id, 10) },
        data: { lastActiveAt: new Date() },
      });

      res.json({ success: true, analysis });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/students/:id/exams', authMiddleware, studentScopeGuard, async (req, res) => {
    const exams = await prisma.exam.findMany({
      where: { studentId: parseInt(req.params.id, 10) },
    });
    res.json(exams);
  });

  app.post('/api/students', authMiddleware, requireRole('admin'), async (req, res) => {
    const {
      name,
      class: studentClass,
      target,
      progress,
      password,
      parentName,
      parentPhone,
      totalContractAmount,
      downPayment,
      discountAmount,
    } = req.body;

    try {
      const institutionIdRaw =
        req.user.role === 'super_admin'
          ? req.body.institutionId
          : req.user.institutionId;
      const institutionId = parseInt(institutionIdRaw, 10);
      if (!institutionIdRaw || Number.isNaN(institutionId)) {
        return res
          .status(400)
          .json({ error: 'Öğrenci oluşturmak için kurum bilgisi zorunludur.' });
      }

      const student = await prisma.$transaction(async (tx) => {
        const generatedUsername = await generateStudentUsername(tx, institutionId);
        const hashedPassword = password ? await bcrypt.hash(password, 10) : '';

        return tx.student.create({
          data: {
            name,
            studentNumber: req.body.studentNumber || null,
            class: studentClass,
            target: target || '',
            progress: progress || 0,
            xp: 0,
            username: generatedUsername,
            password: hashedPassword,
            parentName: parentName || null,
            parentPhone: parentPhone || null,
            totalContractAmount: totalContractAmount ? Number(totalContractAmount) : 0,
            downPayment: downPayment ? Number(downPayment) : 0,
            discountAmount: discountAmount ? Number(discountAmount) : 0,
            institutionId,
          },
        });
      });

      const { password: _password, ...safeStudent } = student;
      res.json({ ...safeStudent, generatedUsername: student.username });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.put('/api/students/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    const {
      name,
      class: studentClass,
      target,
      progress,
      username,
      password,
      parentName,
      parentPhone,
      totalContractAmount,
      downPayment,
      discountAmount,
    } = req.body;
    const studentId = parseInt(req.params.id, 10);

    try {
      const existingStudent = await prisma.student.findUnique({ where: { id: studentId } });
      if (
        !existingStudent ||
        (req.user.role !== 'super_admin' &&
          existingStudent.institutionId !== req.user.institutionId)
      ) {
        return res.status(403).json({ error: 'Bu öğrenciyi güncelleme yetkiniz yok.' });
      }
      if (username !== undefined && username !== existingStudent.username) {
        return res.status(400).json({
          error: 'Kullanıcı adı manuel değiştirilemez. Sistem tarafından otomatik üretilir.',
        });
      }

      const updateFields = {
        name,
        studentNumber: req.body.studentNumber || undefined,
        class: studentClass,
        target: target || '',
        progress: progress || 0,
        parentName: parentName !== undefined ? parentName : undefined,
        parentPhone: parentPhone !== undefined ? parentPhone : undefined,
        totalContractAmount: totalContractAmount !== undefined ? Number(totalContractAmount) : undefined,
        downPayment: downPayment !== undefined ? Number(downPayment) : undefined,
        discountAmount: discountAmount !== undefined ? Number(discountAmount) : undefined,
      };

      if (typeof password === 'string' && password.length > 0) {
        updateFields.password = await bcrypt.hash(password, 10);
        if (!existingStudent.username) {
          if (!existingStudent.institutionId) {
            return res.status(400).json({
              error: 'Öğrenciye bağlı kurum bilgisi eksik. Kullanıcı adı üretilemedi.',
            });
          }
          const generatedUsername = await prisma.$transaction((tx) =>
            generateStudentUsername(tx, existingStudent.institutionId),
          );
          updateFields.username = generatedUsername;
        }
      } else if (password === '') {
        updateFields.password = '';
      }

      await prisma.student.update({
        where: { id: studentId },
        data: updateFields,
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.delete('/api/students/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    const studentId = parseInt(req.params.id, 10);
    try {
      const existingStudent = await prisma.student.findUnique({ where: { id: studentId } });
      if (
        !existingStudent ||
        (req.user.role !== 'super_admin' &&
          existingStudent.institutionId !== req.user.institutionId)
      ) {
        return res.status(403).json({ error: 'Bu öğrenciyi silme yetkiniz yok.' });
      }

      await prisma.exam.deleteMany({ where: { studentId } });
      await prisma.student.delete({ where: { id: studentId } });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/notifications/broadcast', authMiddleware, requireRole('admin'), async (req, res) => {
    const { type, date, time, target, note } = req.body;
    try {
      // Duyuruyu veritabanına kaydet
      await prisma.examAnnouncement.create({
        data: {
          institutionId: req.user.institutionId,
          type,
          date,
          time,
          target,
          note: note || null,
        },
      });

      console.log(`[BROADCAST] Kurum ID: ${req.user.institutionId} - ${type} sınavı kaydedildi.`);
      
      res.json({ 
        success: true, 
        message: 'Sınav duyurusu başarıyla kaydedildi ve öğrencilere iletildi.' 
      });
    } catch (err) {
      console.error('BROADCAST_ERROR:', err);
      res.status(500).json({ error: 'Duyuru kaydedilirken bir hata oluştu.' });
    }
  });

  app.get('/api/notifications/history', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const announcements = await prisma.examAnnouncement.findMany({
        where: { institutionId: req.user.institutionId },
        orderBy: { createdAt: 'desc' },
      });
      res.json(announcements);
    } catch (err) {
      console.error('HISTORY_ERROR:', err);
      res.status(500).json({ error: 'Duyuru geçmişi alınırken hata oluştu.' });
    }
  });

  app.put('/api/notifications/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { type, date, time, target, note } = req.body;
      
      const existing = await prisma.examAnnouncement.findUnique({ where: { id: parseInt(id) } });
      if (!existing || existing.institutionId !== req.user.institutionId) {
        return res.status(404).json({ error: 'Duyuru bulunamadı veya yetkiniz yok.' });
      }

      const updated = await prisma.examAnnouncement.update({
        where: { id: parseInt(id) },
        data: { type, date, time, target, note: note || null }
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      console.error('UPDATE_ANNOUNCEMENT_ERROR:', err);
      res.status(500).json({ error: 'Duyuru güncellenirken hata oluştu.' });
    }
  });

  app.delete('/api/notifications/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      
      const existing = await prisma.examAnnouncement.findUnique({ where: { id: parseInt(id) } });
      if (!existing || existing.institutionId !== req.user.institutionId) {
        return res.status(404).json({ error: 'Duyuru bulunamadı veya yetkiniz yok.' });
      }

      await prisma.examAnnouncement.delete({ where: { id: parseInt(id) } });
      res.json({ success: true, message: 'Duyuru silindi.' });
    } catch (err) {
      console.error('DELETE_ANNOUNCEMENT_ERROR:', err);
      res.status(500).json({ error: 'Duyuru silinirken hata oluştu.' });
    }
  });

  app.get('/api/notifications', authMiddleware, requireRole('student', 'admin', 'super_admin'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      let studentClass = 'all';

      if (req.user.role === 'student') {
        const student = await prisma.student.findUnique({
          where: { id: req.user.id },
          select: { class: true }
        });
        studentClass = student?.class || 'all';
      }

      const announcements = await prisma.examAnnouncement.findMany({
        where: {
          institutionId,
          OR: [
            { target: 'all' },
            { target: studentClass }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      });

      const now = new Date();
      const validAnnouncements = announcements.filter(a => {
        try {
          if (!a.date || !a.time) return true;
          const [year, month, day] = a.date.split('-');
          const [hour, minute] = a.time.split(':');
          const examDate = new Date(year, month - 1, day, hour, minute);
          
          // Sınav saatinden 1 saat sonrasına kadar göster (60 dakika * 60 saniye * 1000 ms)
          const expiryTime = examDate.getTime() + (60 * 60 * 1000);
          
          return expiryTime > now.getTime();
        } catch (e) {
          return true; // Hata olursa riske girmeyip göster
        }
      });

      res.json(validAnnouncements);
    } catch (err) {
      console.error('NOTIF_FETCH_ERROR:', err);
      res.status(500).json({ error: 'Duyurular yüklenemedi.' });
    }
  });
}

module.exports = { registerStudentRoutes };
