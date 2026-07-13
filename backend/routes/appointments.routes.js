function registerAppointmentRoutes(app, deps) {
  const { prisma, authMiddleware, requireRole, studentScopeGuard } = deps;

  // Randevuları listele
  app.get('/api/appointments', authMiddleware, async (req, res) => {
    try {
      // OTOMATİK DEVRETME: İşlem yapılmayan (pending) ve 48 saatten fazla gecikmiş randevuları haftaya aktar (Grace Period)
      const gracePeriodDate = new Date();
      gracePeriodDate.setDate(gracePeriodDate.getDate() - 2);
      gracePeriodDate.setHours(0, 0, 0, 0);

      const expiredPending = await prisma.appointment.findMany({
        where: {
          status: 'pending',
          startTime: { lt: gracePeriodDate },
          institutionId: req.user.role === 'super_admin' ? undefined : req.user.institutionId,
        }
      });

      if (expiredPending.length > 0) {
        console.log(`[AUTO_RESCHEDULE] ${expiredPending.length} adet gecikmiş randevu haftaya kopyalanıyor...`);
        for (const appt of expiredPending) {
          const nextWeekStart = new Date(appt.startTime);
          nextWeekStart.setDate(nextWeekStart.getDate() + 7);
          
          let nextWeekEnd = null;
          if (appt.endTime) {
            nextWeekEnd = new Date(appt.endTime);
            nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
          }

          // 1. Eski randevuyu 'postponed' yap
          await prisma.appointment.update({
            where: { id: appt.id },
            data: {
              status: 'postponed',
              note: (appt.note || '') + `\n[Otomatik Devir: Sonuç girilmediği için ertelendi]`
            }
          });

          // 2. Yeni randevuyu kopyala
          await prisma.appointment.create({
            data: {
              studentId: appt.studentId,
              teacherId: appt.teacherId,
              institutionId: appt.institutionId,
              startTime: nextWeekStart,
              endTime: nextWeekEnd,
              title: appt.title,
              note: `[Otomatik Klon]`,
              status: 'pending'
            }
          });
        }
      }

      const { studentId, teacherId, status, date } = req.query;
      const instId = req.user.institutionId ? Number(req.user.institutionId) : null;
      const where = {
        ...(instId ? { institutionId: instId } : {}),
      };

      if (req.user.role === 'student') {
        where.studentId = req.user.id;
      } else if (studentId) {
        where.studentId = parseInt(studentId, 10);
      }

      if (teacherId) {
        where.teacherId = parseInt(teacherId, 10);
      }

      if (status) {
        where.status = status;
      }

      // Tarih filtresi ekle (Eğer query'de varsa)
      if (date) {
        // 'YYYY-MM-DD' formatını güvenli bir şekilde parçala
        const [year, month, day] = date.split('-').map(Number);
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
        
        where.startTime = {
          gte: startOfDay,
          lte: endOfDay
        };
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: {
          student: { 
            select: { 
              id: true, 
              name: true, 
              class: true,
              parentName: true,
              parentPhone: true
            } 
          },
          teacher: { select: { id: true, name: true } },
        },
        orderBy: { startTime: 'asc' },
      });

      res.json(appointments);
    } catch (err) {
      console.error('APPOINTMENT_GET_ERROR:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  // Yeni randevu oluştur (Hoca/Admin)
  app.post('/api/appointments', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { studentId, startTime, endTime, title, note } = req.body;

    try {
      const appointment = await prisma.appointment.create({
        data: {
          studentId: parseInt(studentId, 10),
          teacherId: req.user.id,
          institutionId: req.user.institutionId,
          startTime: new Date(startTime),
          endTime: endTime ? new Date(endTime) : null,
          title,
          note,
          status: 'pending',
        },
      });

      res.json(appointment);
    } catch (err) {
      console.error('APPOINTMENT_CREATE_ERROR:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  // Randevu güncelle (Durum vs.)
  app.put('/api/appointments/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { status, note, startTime, endTime, title } = req.body;

    try {
      const existing = await prisma.appointment.findUnique({
        where: { id: parseInt(id, 10) },
      });

      if (!existing) return res.status(404).json({ error: 'Randevu bulunamadı.' });

      // Yetki kontrolü
      if (req.user.role !== 'super_admin' && existing.institutionId !== req.user.institutionId) {
        return res.status(403).json({ error: 'Yetkiniz yok.' });
      }

      const appointment = await prisma.appointment.update({
        where: { id: parseInt(id, 10) },
        data: {
          status: status || undefined,
          note: note !== undefined ? note : undefined,
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime ? new Date(endTime) : undefined,
          title: title || undefined,
        },
      });

      // Absent (Gelmedi) seçilirse ve önceden absent değilse, haftaya kopyala!
      if (status === 'absent' && existing.status !== 'absent') {
          const nextWeekStart = new Date(existing.startTime);
          nextWeekStart.setDate(nextWeekStart.getDate() + 7);
          let nextWeekEnd = null;
          if (existing.endTime) {
            nextWeekEnd = new Date(existing.endTime);
            nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
          }
          await prisma.appointment.create({
            data: {
              studentId: existing.studentId,
              teacherId: existing.teacherId,
              institutionId: existing.institutionId,
              startTime: nextWeekStart,
              endTime: nextWeekEnd,
              title: existing.title,
              note: `[Otomatik Klon: Geçen hafta gelmediği için yeniden eklendi]`,
              status: 'pending'
            }
          });
      }

      res.json(appointment);
    } catch (err) {
      console.error('APPOINTMENT_UPDATE_ERROR:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  // Randevu sil
  app.delete('/api/appointments/:id', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { id } = req.params;

    try {
      const existing = await prisma.appointment.findUnique({
        where: { id: parseInt(id, 10) },
      });

      if (!existing) return res.status(404).json({ error: 'Randevu bulunamadı.' });

      if (req.user.role !== 'super_admin' && existing.institutionId !== req.user.institutionId) {
        return res.status(403).json({ error: 'Yetkiniz yok.' });
      }

      await prisma.appointment.delete({
        where: { id: parseInt(id, 10) },
      });

      res.json({ success: true });
    } catch (err) {
      console.error('APPOINTMENT_DELETE_ERROR:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  // Randevu Ertele (Manuel Postpone)
  app.post('/api/appointments/:id/postpone', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { id } = req.params;
    const { newStartTime, newEndTime, note } = req.body;

    try {
      const existing = await prisma.appointment.findUnique({
        where: { id: parseInt(id, 10) }
      });
      
      if (!existing) return res.status(404).json({ error: 'Randevu bulunamadı.' });

      if (req.user.role !== 'super_admin' && existing.institutionId !== req.user.institutionId) {
        return res.status(403).json({ error: 'Yetkiniz yok.' });
      }

      // Eskiyi ertelendi yap
      await prisma.appointment.update({
        where: { id: existing.id },
        data: {
           status: 'postponed',
           note: (existing.note || '') + `\n[Manuel Erteleme Mazereti: ${note || '-'}]`
        }
      });

      // Yeni randevuyu oluştur
      const newAppt = await prisma.appointment.create({
         data: {
              studentId: existing.studentId,
              teacherId: existing.teacherId,
              institutionId: existing.institutionId,
              startTime: new Date(newStartTime),
              endTime: newEndTime ? new Date(newEndTime) : null,
              title: existing.title,
              note: `[Önceki Randevudan Ertelendi]`,
              status: 'pending'
         }
      });

      res.json(newAppt);
    } catch (err) {
      console.error('APPOINTMENT_POSTPONE_ERROR:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });
}

module.exports = { registerAppointmentRoutes };
