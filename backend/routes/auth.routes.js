function registerAuthRoutes(app, deps) {
  const {
    prisma,
    bcrypt,
    loginLimiter,
    validate,
    loginSchema,
    generateToken,
  } = deps;

  app.post('/api/login', loginLimiter, validate(loginSchema), async (req, res) => {
    const { username, password, institutionSlug } = req.body;

    try {
      // Gösterim/Demo Modu Bypass
      if (username === 'demo') {
        const SUPER_ADMIN_NAME = 'Serhat Bey (Gösterim)';
        const token = generateToken({
          id: 0,
          role: 'admin',
          name: SUPER_ADMIN_NAME,
          permissions: ["dashboard", "students", "accounting", "guidance", "settings"],
          assignedClasses: []
        });
        res.cookie('token', token, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        return res.json({
          success: true,
          user: {
            id: 0,
            name: SUPER_ADMIN_NAME,
            role: 'admin',
            username: 'demo',
            email: 'demo@kortex.com',
            avatar: 'S',
            permissions: ["dashboard", "students", "accounting", "guidance", "settings"],
            assignedClasses: []
          },
          token,
        });
      }

      const user = await prisma.user.findFirst({
        where: { username },
        include: { institution: true },
      });

      if (user && user.password) {
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
          const token = generateToken({
            id: user.id,
            role: user.role || 'admin',
            name: user.name,
            institutionId: user.institutionId,
            permissions: user.permissions || [],
            assignedClasses: user.assignedClasses || [],
          });
          const { password: _password, ...safeUser } = user;
          res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 24 * 60 * 60 * 1000
          });
          return res.json({
            success: true,
            user: { ...safeUser, avatar: user.name?.charAt(0) || 'A', permissions: user.permissions || [], assignedClasses: user.assignedClasses || [] },
            token,
          });
        }
      }

      let institutionFilter = {};
      if (institutionSlug) {
        const institution = await prisma.institution.findUnique({
          where: { slug: institutionSlug },
          select: { id: true },
        });
        if (!institution) {
          return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre.' });
        }
        institutionFilter = { institutionId: institution.id };
      }

      const studentCandidates = await prisma.student.findMany({
        where: { username, ...institutionFilter },
        include: {
          institution: true,
          exams: true,
          studyNotes: true,
          favoriteQuestions: true,
          dailyQuests: true,
          studyPlanTopics: true,
          dailyActivities: true,
        },
      });

      const matchedStudents = [];
      for (const student of studentCandidates) {
        if (!student.password) continue;
        const isMatch = await bcrypt.compare(password, student.password);
        if (isMatch) {
          matchedStudents.push(student);
        }
      }

      if (matchedStudents.length > 1) {
        return res.status(409).json({
          success: false,
          message: 'Bu kullanıcı adı birden fazla kurumda kullanılıyor. Lütfen kurum bilgisi ile giriş yapın.',
        });
      }

      if (matchedStudents.length === 1) {
        const student = matchedStudents[0];
        const token = generateToken({
          id: student.id,
          role: 'student',
          name: student.name,
          institutionId: student.institutionId,
        });
        const { password: _password, ...safeStudent } = student;
        return res.json({ success: true, student: safeStudent, token });
      }

      return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre.' });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      return res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });
  app.post('/api/logout', (req, res) => {
    res.clearCookie('token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    });
    return res.json({ success: true, message: 'Çıkış başarılı' });
  });
}

module.exports = { registerAuthRoutes };
