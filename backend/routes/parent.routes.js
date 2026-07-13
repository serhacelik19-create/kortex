const crypto = require('crypto');
const { hashBearerToken } = require('../middleware/auth');
const { sendParentPush } = require('../services/parentPush.service');

const DEFAULT_ACTIVATION_HOURS = 72;
const ACTIVATION_BASE_URL =
  process.env.PARENT_ACTIVATION_BASE_URL || 'yks://parent-activate';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

const sanitizeText = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const buildActivationLink = (token) => {
  const separator = ACTIVATION_BASE_URL.includes('?') ? '&' : '?';
  return `${ACTIVATION_BASE_URL}${separator}token=${encodeURIComponent(token)}`;
};

function registerParentRoutes(app, deps) {
  const { prisma, authMiddleware, requireRole, parentAuthMiddleware } = deps;
  const requireParent = parentAuthMiddleware(prisma);

  const ensureAdminStudentAccess = async (req, studentId) => {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { institution: { select: { id: true, name: true, slug: true } } },
    });

    if (!student) return { ok: false, status: 404, message: 'Öğrenci bulunamadı.' };
    if (req.user.role !== 'super_admin' && student.institutionId !== req.user.institutionId) {
      return { ok: false, status: 403, message: 'Bu öğrenci için işlem yapma yetkiniz yok.' };
    }
    return { ok: true, student };
  };

  const findEligibleParentSessions = async ({ institutionId, target, studentId, className }) => {
    const where = { institutionId, revokedAt: null };
    if (target === 'student') {
      where.studentId = studentId;
    } else if (target === 'class') {
      where.student = { class: className };
    }
    return prisma.parentDeviceSession.findMany({
      where,
      select: { id: true, pushToken: true },
    });
  };

  app.post('/api/parent-activations', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const studentId = Number.parseInt(req.body.studentId, 10);
    const expiresInHours = Number.isFinite(Number(req.body.expiresInHours))
      ? Math.max(1, Math.min(168, Number(req.body.expiresInHours)))
      : DEFAULT_ACTIVATION_HOURS;

    if (!studentId) {
      return res.status(400).json({ error: 'Geçerli bir öğrenci seçilmelidir.' });
    }

    try {
      const access = await ensureAdminStudentAccess(req, studentId);
      if (!access.ok) return res.status(access.status).json({ error: access.message });

      const token = randomToken();
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
      const parentPhone = sanitizeText(req.body.parentPhone, 32) || access.student.parentPhone || null;

      const activation = await prisma.parentActivationToken.create({
        data: {
          tokenHash: sha256(token),
          studentId: access.student.id,
          institutionId: access.student.institutionId,
          parentPhone,
          expiresAt,
          createdByUserId: req.user.id || null,
        },
      });

      return res.json({
        success: true,
        link: buildActivationLink(token),
        expiresAt: activation.expiresAt,
        student: {
          id: access.student.id,
          name: access.student.name,
          class: access.student.class,
        },
      });
    } catch (err) {
      console.error('PARENT_ACTIVATION_CREATE_ERROR:', err);
      return res.status(500).json({ error: 'Veli aktivasyon linki oluşturulamadı.' });
    }
  });

  app.post('/api/parent-activations/consume', async (req, res) => {
    const token = sanitizeText(req.body.token, 256);
    const deviceLabel = sanitizeText(req.body.deviceLabel, 120) || null;
    if (!token) return res.status(400).json({ error: 'Aktivasyon tokenı zorunludur.' });

    try {
      const tokenHash = sha256(token);
      const activation = await prisma.parentActivationToken.findUnique({
        where: { tokenHash },
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

      if (!activation) return res.status(404).json({ error: 'Aktivasyon linki bulunamadı.' });
      if (activation.usedAt) return res.status(409).json({ error: 'Bu aktivasyon linki daha önce kullanılmış.' });
      if (activation.expiresAt.getTime() < Date.now()) {
        return res.status(410).json({ error: 'Aktivasyon linkinin süresi dolmuş.' });
      }

      const sessionToken = randomToken();
      const result = await prisma.$transaction(async (tx) => {
        const fresh = await tx.parentActivationToken.findUnique({ where: { tokenHash } });
        if (!fresh || fresh.usedAt) {
          const error = new Error('USED');
          error.code = 'USED';
          throw error;
        }

        await tx.parentActivationToken.update({
          where: { id: fresh.id },
          data: { usedAt: new Date() },
        });

        const session = await tx.parentDeviceSession.create({
          data: {
            sessionTokenHash: hashBearerToken(sessionToken),
            studentId: activation.studentId,
            institutionId: activation.institutionId,
            parentPhone: activation.parentPhone,
            deviceLabel,
          },
        });

        return session;
      });

      return res.json({
        success: true,
        parentSessionToken: sessionToken,
        parentSessionId: result.id,
        student: {
          id: activation.student.id,
          name: activation.student.name,
          class: activation.student.class,
        },
        institution: activation.student.institution,
      });
    } catch (err) {
      if (err.code === 'USED') {
        return res.status(409).json({ error: 'Bu aktivasyon linki daha önce kullanılmış.' });
      }
      console.error('PARENT_ACTIVATION_CONSUME_ERROR:', err);
      return res.status(500).json({ error: 'Veli aktivasyonu tamamlanamadı.' });
    }
  });

  app.post('/api/parent/session/push-token', requireParent, async (req, res) => {
    const pushToken = sanitizeText(req.body.pushToken, 512);
    await prisma.parentDeviceSession.update({
      where: { id: req.parentSession.id },
      data: { pushToken: pushToken || null },
    });
    return res.json({ success: true });
  });

  app.get('/api/parent/notifications', requireParent, async (req, res) => {
    try {
      const session = req.parentSession;
      const notifications = await prisma.parentNotification.findMany({
        where: {
          institutionId: session.institutionId,
          receipts: {
            some: { parentSessionId: session.id },
          },
        },
        include: {
          receipts: {
            where: { parentSessionId: session.id },
            select: { readAt: true, deliveredAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return res.json(notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        priority: notification.priority,
        createdAt: notification.createdAt,
        readAt: notification.receipts[0]?.readAt || null,
        deliveredAt: notification.receipts[0]?.deliveredAt || null,
      })));
    } catch (err) {
      console.error('PARENT_NOTIFICATIONS_LIST_ERROR:', err);
      return res.status(500).json({ error: 'Veli bildirimleri alınamadı.' });
    }
  });

  app.post('/api/parent/notifications/:id/read', requireParent, async (req, res) => {
    const notificationId = Number.parseInt(req.params.id, 10);
    if (!notificationId) return res.status(400).json({ error: 'Geçersiz bildirim.' });

    try {
      const session = req.parentSession;
      const notification = await prisma.parentNotification.findFirst({
        where: {
          id: notificationId,
          institutionId: session.institutionId,
          receipts: {
            some: { parentSessionId: session.id },
          },
        },
      });
      if (!notification) return res.status(404).json({ error: 'Bildirim bulunamadı.' });

      const receipt = await prisma.parentNotificationReceipt.update({
        where: {
          notificationId_parentSessionId: {
            notificationId,
            parentSessionId: session.id,
          },
        },
        data: { readAt: new Date() },
      });
      return res.json({ success: true, readAt: receipt.readAt });
    } catch (err) {
      console.error('PARENT_NOTIFICATION_READ_ERROR:', err);
      return res.status(500).json({ error: 'Bildirim okundu işaretlenemedi.' });
    }
  });

  app.post('/api/parent/logout', requireParent, async (req, res) => {
    await prisma.parentDeviceSession.update({
      where: { id: req.parentSession.id },
      data: { revokedAt: new Date() },
    });
    return res.json({ success: true });
  });

  app.post('/api/parent-sessions/:id/revoke', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Geçersiz veli oturumu.' });

    try {
      const session = await prisma.parentDeviceSession.findUnique({ where: { id } });
      if (!session || (req.user.role !== 'super_admin' && session.institutionId !== req.user.institutionId)) {
        return res.status(404).json({ error: 'Veli oturumu bulunamadı.' });
      }
      await prisma.parentDeviceSession.update({ where: { id }, data: { revokedAt: new Date() } });
      return res.json({ success: true });
    } catch (err) {
      console.error('PARENT_SESSION_REVOKE_ERROR:', err);
      return res.status(500).json({ error: 'Veli oturumu iptal edilemedi.' });
    }
  });

  app.post('/api/parent-notifications', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const target = sanitizeText(req.body.target, 20) || 'all';
    const title = sanitizeText(req.body.title, 120);
    const body = sanitizeText(req.body.body, 2000);
    const type = sanitizeText(req.body.type, 32) || 'general';
    const priority = sanitizeText(req.body.priority, 20) || 'normal';
    const studentId = req.body.studentId ? Number.parseInt(req.body.studentId, 10) : null;
    const className = sanitizeText(req.body.className, 80) || null;

    if (!title || !body) return res.status(400).json({ error: 'Başlık ve mesaj zorunludur.' });
    if (!['all', 'class', 'student'].includes(target)) return res.status(400).json({ error: 'Geçersiz hedef.' });
    if (target === 'student' && !studentId) return res.status(400).json({ error: 'Öğrenci hedefi seçilmelidir.' });
    if (target === 'class' && !className) return res.status(400).json({ error: 'Sınıf hedefi seçilmelidir.' });

    try {
      let institutionId = req.user.institutionId;
      if (target === 'student') {
        const access = await ensureAdminStudentAccess(req, studentId);
        if (!access.ok) return res.status(access.status).json({ error: access.message });
        institutionId = access.student.institutionId;
      }
      if (!institutionId) return res.status(400).json({ error: 'Kurum bilgisi bulunamadı.' });

      const sessions = await findEligibleParentSessions({ institutionId, target, studentId, className });
      if (sessions.length === 0) {
        return res.status(409).json({
          error: 'Bu hedefte aktif veli cihazı yok. Önce veli linki oluşturun.',
          code: 'NO_ACTIVE_PARENT_SESSION',
        });
      }

      const notification = await prisma.parentNotification.create({
        data: {
          institutionId,
          studentId: target === 'student' ? studentId : null,
          className: target === 'class' ? className : null,
          title,
          body,
          type,
          priority,
          createdByUserId: req.user.id || null,
        },
      });

      await prisma.parentNotificationReceipt.createMany({
        data: sessions.map((session) => ({
          notificationId: notification.id,
          parentSessionId: session.id,
          deliveredAt: null,
        })),
        skipDuplicates: true,
      });

      const pushResult = await sendParentPush({
        tokens: sessions.map((session) => session.pushToken),
        title,
        body,
        notificationId: notification.id,
        priority,
      });

      if (pushResult.successfulTokens?.length) {
        const deliveredAt = new Date();
        const successfulTokenSet = new Set(pushResult.successfulTokens);
        const deliveredSessionIds = sessions
          .filter((session) => successfulTokenSet.has(session.pushToken))
          .map((session) => session.id);
        await prisma.parentNotificationReceipt.updateMany({
          where: {
            notificationId: notification.id,
            parentSessionId: { in: deliveredSessionIds },
          },
          data: { deliveredAt },
        });
      }

      return res.json({
        success: true,
        notification,
        recipientCount: sessions.length,
        pushQueuedCount: sessions.filter((session) => session.pushToken).length,
        pushSuccessCount: pushResult.successCount,
        pushFailureCount: pushResult.failureCount,
        pushDisabled: pushResult.disabled,
      });
    } catch (err) {
      console.error('PARENT_NOTIFICATION_CREATE_ERROR:', err);
      return res.status(500).json({ error: 'Veli bildirimi oluşturulamadı.' });
    }
  });

  app.post('/api/parent-notifications/report', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const studentId = req.body.studentId ? Number.parseInt(req.body.studentId, 10) : null;
    const mode = sanitizeText(req.body.mode, 20) || (studentId ? 'single' : 'ready');

    try {
      const institutionId = req.user.institutionId;
      if (!institutionId && req.user.role !== 'super_admin') {
        return res.status(400).json({ error: 'Kurum bilgisi bulunamadı.' });
      }

      const where = req.user.role === 'super_admin' ? {} : { institutionId };
      if (mode === 'single') {
        if (!studentId) return res.status(400).json({ error: 'Öğrenci seçilmelidir.' });
        where.id = studentId;
      } else {
        where.aiExamReport = { not: null };
        where.reportStatus = { not: 'sent' };
      }

      const students = await prisma.student.findMany({
        where,
        select: {
          id: true,
          name: true,
          class: true,
          institutionId: true,
          aiExamReport: true,
        },
        orderBy: { name: 'asc' },
      });

      const today = new Date().toLocaleDateString('tr-TR');
      const summary = {
        success: true,
        notifiedCount: 0,
        missingParentSessionCount: 0,
        skippedNoReportCount: 0,
        pushSuccessCount: 0,
        pushFailureCount: 0,
        missingStudents: [],
        notifiedStudents: [],
      };

      for (const student of students) {
        if (!student.aiExamReport) {
          summary.skippedNoReportCount += 1;
          continue;
        }

        const sessions = await prisma.parentDeviceSession.findMany({
          where: {
            studentId: student.id,
            institutionId: student.institutionId,
            revokedAt: null,
          },
          select: { id: true, pushToken: true },
        });

        if (sessions.length === 0) {
          summary.missingParentSessionCount += 1;
          summary.missingStudents.push({ id: student.id, name: student.name, class: student.class });
          continue;
        }

        const notification = await prisma.parentNotification.create({
          data: {
            institutionId: student.institutionId,
            studentId: student.id,
            title: 'Haftalık Gelişim Raporu',
            body: student.aiExamReport,
            type: 'report',
            priority: 'normal',
            createdByUserId: req.user.id || null,
          },
        });

        await prisma.parentNotificationReceipt.createMany({
          data: sessions.map((session) => ({
            notificationId: notification.id,
            parentSessionId: session.id,
            deliveredAt: null,
          })),
          skipDuplicates: true,
        });

        const pushResult = await sendParentPush({
          tokens: sessions.map((session) => session.pushToken),
          title: notification.title,
          body: notification.body,
          notificationId: notification.id,
          priority: notification.priority,
        });

        if (pushResult.successfulTokens?.length) {
          const successfulTokenSet = new Set(pushResult.successfulTokens);
          const deliveredSessionIds = sessions
            .filter((session) => successfulTokenSet.has(session.pushToken))
            .map((session) => session.id);
          await prisma.parentNotificationReceipt.updateMany({
            where: {
              notificationId: notification.id,
              parentSessionId: { in: deliveredSessionIds },
            },
            data: { deliveredAt: new Date() },
          });
        }

        await prisma.student.update({
          where: { id: student.id },
          data: { reportStatus: 'sent', lastReport: today },
        });

        summary.notifiedCount += 1;
        summary.notifiedStudents.push({ id: student.id, name: student.name, class: student.class });
        summary.pushSuccessCount += pushResult.successCount || 0;
        summary.pushFailureCount += pushResult.failureCount || 0;
      }

      if (mode === 'single' && summary.notifiedCount === 0 && summary.missingParentSessionCount > 0) {
        return res.status(409).json({
          ...summary,
          error: 'Bu öğrencinin aktif veli cihazı yok. Önce veli linki oluşturun.',
          code: 'NO_ACTIVE_PARENT_SESSION',
        });
      }

      return res.json(summary);
    } catch (err) {
      console.error('PARENT_REPORT_NOTIFICATION_ERROR:', err);
      return res.status(500).json({ error: 'Rapor bildirimi gönderilemedi.' });
    }
  });

  app.get('/api/parent-notifications/history', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const notifications = await prisma.parentNotification.findMany({
        where: req.user.role === 'super_admin' ? {} : { institutionId },
        include: {
          receipts: { select: { readAt: true, deliveredAt: true } },
          student: { select: { id: true, name: true, class: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return res.json(notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        priority: notification.priority,
        student: notification.student,
        className: notification.className,
        target: notification.studentId ? 'student' : notification.className ? 'class' : 'all',
        createdAt: notification.createdAt,
        recipientCount: notification.receipts.length,
        readCount: notification.receipts.filter((receipt) => receipt.readAt).length,
        deliveredCount: notification.receipts.filter((receipt) => receipt.deliveredAt).length,
      })));
    } catch (err) {
      console.error('PARENT_NOTIFICATION_HISTORY_ERROR:', err);
      return res.status(500).json({ error: 'Veli bildirim geçmişi alınamadı.' });
    }
  });

  app.delete('/api/parent-notifications/:id', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Geçersiz bildirim.' });

    try {
      const notification = await prisma.parentNotification.findUnique({
        where: { id },
        select: { id: true, institutionId: true },
      });
      if (!notification) return res.status(404).json({ error: 'Bildirim bulunamadı.' });
      if (req.user.role !== 'super_admin' && notification.institutionId !== req.user.institutionId) {
        return res.status(403).json({ error: 'Bu bildirimi silme yetkiniz yok.' });
      }

      await prisma.parentNotification.delete({ where: { id } });
      return res.json({ success: true });
    } catch (err) {
      console.error('PARENT_NOTIFICATION_DELETE_ERROR:', err);
      return res.status(500).json({ error: 'Veli bildirimi silinemedi.' });
    }
  });
}

module.exports = { registerParentRoutes };
