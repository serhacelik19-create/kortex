const express = require('express');

function registerClassProgressRoutes(app, deps) {
  const { prisma, authMiddleware } = deps;
  const router = express.Router();

  const canUseClassProgress = (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
    }

    if (req.user.role === 'super_admin' || req.user.role === 'admin') return next();

    const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (permissions.includes('classProgress')) return next();

    return res.status(403).json({ error: 'Müfredat takibi için yetkiniz bulunmamaktadır.' });
  };

  const normalizeStatus = (value) => {
    if (value === 'ISLENIYOR') return 'ISLENIYOR';
    if (value === 'TAMAMLANDI' || value === 'COMPLETED') return 'TAMAMLANDI';
    return 'TAMAMLANDI';
  };

  const parseCompletedAt = (value) => {
    if (!value) return new Date();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  };

  const canMutateProgress = (req, record) => {
    if (!record) return false;
    if (req.user.role === 'super_admin') return true;
    if (record.institutionId !== req.user.institutionId) return false;
    if (req.user.role === 'teacher') return record.teacherId === req.user.id;
    return true;
  };

  // Get all progress for an institution
  router.get('/', authMiddleware, canUseClassProgress, async (req, res) => {
    try {
      const { instId, classId, courseId } = req.query;

      const where = {};
      if (req.user.role === 'super_admin') {
        if (instId) where.institutionId = parseInt(instId);
      } else {
        where.institutionId = req.user.institutionId;
      }
      if (req.user.role === 'teacher') {
        where.teacherId = req.user.id;
      }
      if (classId) where.classId = parseInt(classId);
      if (courseId) where.courseId = courseId;

      const progress = await prisma.classProgress.findMany({
        where,
        include: {
          class: true,
          course: true,
          topic: true,
          teacher: {
            select: { name: true }
          }
        },
        orderBy: { completedAt: 'desc' }
      });

      res.json(progress);
    } catch (error) {
      console.error('Error fetching class progress:', error);
      res.status(500).json({ error: 'Failed to fetch class progress' });
    }
  });

  // Add new progress record
  router.post('/', authMiddleware, canUseClassProgress, async (req, res) => {
    try {
      const { institutionId, classId, courseId, topicId, note, status, completedAt } = req.body;
      const resolvedInstitutionId = req.user.role === 'super_admin'
        ? parseInt(institutionId)
        : req.user.institutionId;

      if (!resolvedInstitutionId || !classId || !courseId || !topicId || !req.user.id) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const newProgress = await prisma.classProgress.create({
        data: {
          institutionId: parseInt(resolvedInstitutionId),
          classId: parseInt(classId),
          courseId,
          topicId,
          teacherId: parseInt(req.user.id),
          note,
          status: normalizeStatus(status),
          completedAt: parseCompletedAt(completedAt)
        },
        include: {
          class: true,
          course: true,
          topic: true,
          teacher: {
            select: { name: true }
          }
        }
      });

      res.json(newProgress);
    } catch (error) {
      console.error('Error adding class progress:', error);
      res.status(500).json({ error: 'Failed to add class progress' });
    }
  });

  // Update a progress record
  router.put('/:id', authMiddleware, canUseClassProgress, async (req, res) => {
    try {
      const { id } = req.params;
      const { classId, courseId, topicId, note, status, completedAt } = req.body;

      const existing = await prisma.classProgress.findUnique({
        where: { id: parseInt(id) },
        select: { institutionId: true, teacherId: true }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Progress record not found' });
      }

      if (!canMutateProgress(req, existing)) {
        return res.status(403).json({ error: 'Bu kaydı düzenleme yetkiniz yok.' });
      }

      if (!classId || !courseId || !topicId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const updatedProgress = await prisma.classProgress.update({
        where: { id: parseInt(id) },
        data: {
          classId: parseInt(classId),
          courseId,
          topicId,
          note,
          status: normalizeStatus(status),
          completedAt: parseCompletedAt(completedAt)
        },
        include: {
          class: true,
          course: true,
          topic: true,
          teacher: {
            select: { name: true }
          }
        }
      });

      res.json(updatedProgress);
    } catch (error) {
      console.error('Error updating class progress:', error);
      res.status(500).json({ error: 'Failed to update class progress' });
    }
  });

  // Delete a progress record
  router.delete('/:id', authMiddleware, canUseClassProgress, async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await prisma.classProgress.findUnique({
        where: { id: parseInt(id) },
        select: { institutionId: true, teacherId: true }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Progress record not found' });
      }

      if (!canMutateProgress(req, existing)) {
        return res.status(403).json({ error: 'Bu kaydı silme yetkiniz yok.' });
      }

      await prisma.classProgress.delete({ where: { id: parseInt(id) } });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting class progress:', error);
      res.status(500).json({ error: 'Failed to delete class progress' });
    }
  });

  app.use('/api/class-progress', router);
}

module.exports = { registerClassProgressRoutes };
