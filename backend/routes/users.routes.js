const { sendError } = require('../utils/errorHandler');

function registerUserRoutes(app, deps) {
  const { prisma, bcrypt, authMiddleware, requireRole } = deps;

  app.get('/api/admin/users', authMiddleware, requireRole('super_admin'), async (_req, res) => {
    try {
      const users = await prisma.user.findMany({
        include: { institution: true },
      });
      res.json(users);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/admin/users', authMiddleware, requireRole('super_admin'), async (req, res) => {
    const { name, username, email, password, role, institutionId } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password || '123456', 10);
      const user = await prisma.user.create({
        data: {
          name,
          username,
          email,
          password: hashedPassword,
          role: role || 'admin',
          institutionId: institutionId ? parseInt(institutionId, 10) : null,
        },
      });
      res.json(user);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.delete('/api/admin/users/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
    try {
      await prisma.user.delete({
        where: { id: parseInt(req.params.id, 10) },
      });
      res.sendStatus(200);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put('/api/admin/users/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
    const { name, email, role, institutionId, password } = req.body;
    try {
      const data = {
        name,
        email,
        role,
        institutionId: institutionId ? parseInt(institutionId, 10) : null,
      };
      if (password) {
        data.password = await bcrypt.hash(password, 10);
      }
      const updatedUser = await prisma.user.update({
        where: { id: parseInt(req.params.id, 10) },
        data,
      });
      res.json(updatedUser);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/users', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
      const where =
        req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };
      const users = await prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, role: true, permissions: true, assignedClasses: true },
      });
      res.json(users);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
    const { name, email, username, role, password, permissions, assignedClasses } = req.body;
    try {
      const hashedPassword = password
        ? await bcrypt.hash(password, 10)
        : await bcrypt.hash('123456', 10);
      const newUser = await prisma.user.create({
        data: {
          name,
          email: email || null,
          username: username || null,
          role: role || 'teacher',
          permissions: permissions || ['dashboard', 'students'],
          assignedClasses: assignedClasses || [],
          password: hashedPassword,
          institutionId: req.user.institutionId,
        },
      });
      res.json({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        permissions: newUser.permissions,
        assignedClasses: newUser.assignedClasses,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put('/api/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    const { name, email, username, role, password, permissions, assignedClasses } = req.body;
    try {
      const existingUser = await prisma.user.findUnique({
        where: { id: parseInt(req.params.id, 10) },
      });
      if (!existingUser || existingUser.institutionId !== req.user.institutionId) {
        return res.status(403).json({ error: 'Bu kullanıcıyı güncelleme yetkiniz yok.' });
      }

      const data = {
        name,
        email: email !== undefined ? email : existingUser.email,
        username: username !== undefined ? username : existingUser.username,
        role: role || existingUser.role,
        permissions: permissions !== undefined ? permissions : existingUser.permissions,
        assignedClasses: assignedClasses !== undefined ? assignedClasses : existingUser.assignedClasses,
      };
      if (password) {
        data.password = await bcrypt.hash(password, 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id: parseInt(req.params.id, 10) },
        data,
      });
      res.json({
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        username: updatedUser.username,
        role: updatedUser.role,
        permissions: updatedUser.permissions,
        assignedClasses: updatedUser.assignedClasses,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.delete('/api/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { id: parseInt(req.params.id, 10) },
      });
      if (!existingUser || existingUser.institutionId !== req.user.institutionId) {
        return res.status(403).json({ error: 'Bu kullanıcıyı silme yetkiniz yok.' });
      }
      await prisma.user.delete({ where: { id: parseInt(req.params.id, 10) } });
      res.sendStatus(200);
    } catch (err) {
      sendError(res, err);
    }
  });
}

module.exports = { registerUserRoutes };
