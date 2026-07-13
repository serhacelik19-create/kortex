function registerStudyDataRoutes(app, deps) {
  const {
    prisma,
    authMiddleware,
    studentScopeGuard,
    matchesBranch,
  } = deps;

  app.post('/api/students/:id/daily-quests/sync', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { quests } = req.body;
    const today = new Date().toISOString().split('T')[0];

    try {
      const syncPromises = quests.map((quest) =>
        prisma.dailyQuest.upsert({
          where: {
            studentId_questId_date: {
              studentId: parseInt(id, 10),
              questId: quest.id,
              date: today,
            },
          },
          update: {
            progress: quest.progress,
            isCompleted: quest.progress >= quest.target,
          },
          create: {
            studentId: parseInt(id, 10),
            questId: quest.id,
            title: quest.title,
            type: quest.type,
            target: quest.target,
            progress: quest.progress,
            isCompleted: quest.progress >= quest.target,
            date: today,
          },
        }),
      );

      await Promise.all(syncPromises);
      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/daily-activity', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { solvedCount, date } = req.body;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const maxDailySolved = 500;
    const safeSolvedCount = Math.min(
      Math.max(0, parseInt(solvedCount, 10) || 0),
      maxDailySolved,
    );

    try {
      await prisma.dailyActivity.upsert({
        where: {
          studentId_date: {
            studentId: parseInt(id, 10),
            date: targetDate,
          },
        },
        update: {
          solvedCount: safeSolvedCount,
        },
        create: {
          studentId: parseInt(id, 10),
          date: targetDate,
          solvedCount: safeSolvedCount,
        },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/study-plan/sync', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { topics } = req.body;

    try {
      const syncPromises = topics.map((topic) =>
        prisma.studyPlanTopic.upsert({
          where: {
            studentId_course_topic: {
              studentId: parseInt(id, 10),
              course: topic.course,
              topic: topic.topic,
            },
          },
          update: {
            isCompleted: topic.isCompleted,
            completedAt: topic.isCompleted ? new Date() : null,
          },
          create: {
            studentId: parseInt(id, 10),
            course: topic.course,
            topic: topic.topic,
            isCompleted: topic.isCompleted,
            completedAt: topic.isCompleted ? new Date() : null,
          },
        }),
      );

      await Promise.all(syncPromises);
      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/students/:id/study-plan', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    try {
      const [topicsDb, student, curriculum] = await Promise.all([
        prisma.studyPlanTopic.findMany({ where: { studentId: parseInt(id, 10) } }),
        prisma.student.findUnique({
          where: { id: parseInt(id, 10) },
          select: { branch: true },
        }),
        prisma.curriculumCourse.findMany({
          include: {
            topics: { where: { parentId: null }, include: { subTopics: true } },
          },
        }),
      ]);

      const branch = student?.branch || 'Sayısal';
      const filtered = curriculum.filter((course) =>
        matchesBranch(course.branches, branch),
      );

      const completedSet = new Set(
        topicsDb
          .filter((topic) => topic.isCompleted)
          .map((topic) => `${topic.course}|${topic.topic}`),
      );

      let totalLeaves = 0;
      let completedLeaves = 0;

      const courses = filtered.map((course) => {
        let courseTotal = 0;
        let courseCompleted = 0;

        const mapTopic = (topic) => {
          if (topic.subTopics && topic.subTopics.length > 0) {
            const subTopics = topic.subTopics.map((subTopic) => {
              const done = completedSet.has(`${course.id}|${subTopic.id}`);
              courseTotal += 1;
              totalLeaves += 1;
              if (done) {
                courseCompleted += 1;
                completedLeaves += 1;
              }
              return { id: subTopic.id, name: subTopic.name, isCompleted: done };
            });
            return { id: topic.id, name: topic.name, subTopics };
          }

          const done = completedSet.has(`${course.id}|${topic.id}`);
          courseTotal += 1;
          totalLeaves += 1;
          if (done) {
            courseCompleted += 1;
            completedLeaves += 1;
          }
          return { id: topic.id, name: topic.name, isCompleted: done };
        };

        const topics = course.topics.map(mapTopic);

        return {
          courseId: course.id,
          courseName: course.name,
          icon: course.icon,
          examType: course.examType,
          totalLeaves: courseTotal,
          completedLeaves: courseCompleted,
          progress: courseTotal > 0 ? Math.round((courseCompleted / courseTotal) * 100) : 0,
          topics,
        };
      });

      res.json({
        branch,
        totalLeaves,
        completedLeaves,
        overallProgress:
          totalLeaves > 0 ? Math.round((completedLeaves / totalLeaves) * 100) : 0,
        courses,
      });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/notes/sync', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;

    try {
      const ids = notes.map((note) => note.id);
      const syncPromises = notes.map((note) =>
        prisma.studyNote.upsert({
          where: { id: note.id },
          update: {
            course: note.course,
            content: note.content,
            date: note.date,
          },
          create: {
            id: note.id,
            studentId: parseInt(id, 10),
            course: note.course,
            content: note.content,
            date: note.date,
          },
        }),
      );
      await Promise.all(syncPromises);

      await prisma.studyNote.deleteMany({
        where: {
          studentId: parseInt(id, 10),
          id: { notIn: ids },
        },
      });

      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/students/:id/notes', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;

    try {
      const notes = await prisma.studyNote.findMany({
        where: { studentId: parseInt(id, 10) },
        orderBy: { createdAt: 'desc' },
      });
      res.json(notes);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/favorites/sync', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { favorites } = req.body;

    try {
      const ids = favorites.map((favorite) => favorite.id);
      const syncPromises = favorites.map((favorite) =>
        prisma.favoriteQuestion.upsert({
          where: { id: favorite.id },
          update: {
            questionText: favorite.questionText,
            questionImage: favorite.questionImage,
            answerText: favorite.answerText,
            course: favorite.course,
            timestamp: favorite.timestamp,
          },
          create: {
            id: favorite.id,
            studentId: parseInt(id, 10),
            questionText: favorite.questionText,
            questionImage: favorite.questionImage,
            answerText: favorite.answerText,
            course: favorite.course,
            timestamp: favorite.timestamp,
          },
        }),
      );
      await Promise.all(syncPromises);

      await prisma.favoriteQuestion.deleteMany({
        where: {
          studentId: parseInt(id, 10),
          id: { notIn: ids },
        },
      });

      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/students/:id/favorites', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;

    try {
      const favorites = await prisma.favoriteQuestion.findMany({
        where: { studentId: parseInt(id, 10) },
        orderBy: { createdAt: 'desc' },
      });
      res.json(favorites);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/update-settings', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { branch, goalUniversity, examDate, goalScore } = req.body;

    try {
      await prisma.student.update({
        where: { id: parseInt(id, 10) },
        data: {
          branch,
          goalUniversity,
          examDate: examDate ? new Date(examDate) : undefined,
          goalScore,
        },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/curriculum', authMiddleware, async (req, res) => {
    const { branch } = req.query;

    try {
      const courses = await prisma.curriculumCourse.findMany({
        include: {
          topics: {
            where: { parentId: null },
            include: {
              subTopics: true,
            },
          },
        },
      });

      const filtered = branch
        ? courses.filter((course) => matchesBranch(course.branches, branch))
        : courses;

      res.json(filtered);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/sync-achievements', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { unlockedAchievements } = req.body;

    try {
      await prisma.student.update({
        where: { id: parseInt(id, 10) },
        data: {
          unlockedAchievements: Array.isArray(unlockedAchievements)
            ? unlockedAchievements.join(',')
            : unlockedAchievements,
        },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });
}

module.exports = { registerStudyDataRoutes };
