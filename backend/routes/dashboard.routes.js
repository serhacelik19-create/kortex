const { buildAiUsageEvent } = require('../utils/aiUsage');

function registerDashboardRoutes(app, deps) {
  const { prisma, aiService, authMiddleware, requireRole } = deps;

  app.get('/api/dashboard-stats', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      const institutionWhere =
        req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };
      const analysisWhere =
        req.user.role === 'super_admin'
          ? {}
          : { student: { institutionId: req.user.institutionId } };

      const [
        totalCount,
        activeCount,
        avgProgressData,
        topWeeklyStats,
        tytCount,
        totalAnalyses,
        guidanceAlerts,
        dropStudentsDB,
        wrongTopicsData,
        hourlyData,
        heatmapRaw,
      ] = await Promise.all([
        prisma.student.count({ where: institutionWhere }),
        prisma.student.count({
          where: { ...institutionWhere, lastActiveAt: { gt: fiveMinutesAgo } },
        }),
        prisma.student.aggregate({ where: institutionWhere, _avg: { progress: true } }),
        prisma.dailyActivity.groupBy({
          by: ['studentId'],
          where: {
            date: { gte: sevenDaysAgoStr },
            student: institutionWhere,
          },
          _sum: { solvedCount: true },
          orderBy: { _sum: { solvedCount: 'desc' } },
          take: 1,
        }),
        prisma.questionAnalysis.count({
          where: {
            ...analysisWhere,
            OR: [
              { course: { contains: 'TYT', mode: 'insensitive' } },
              { course: { contains: 'tyt_', mode: 'insensitive' } },
              { course: { contains: 'Temel', mode: 'insensitive' } },
              { course: { contains: 'Türkçe', mode: 'insensitive' } },
              { course: { contains: 'Matematik', mode: 'insensitive' } },
              { course: { contains: 'Geometri', mode: 'insensitive' } },
              { course: { contains: 'Fizik', mode: 'insensitive' } },
              { course: { contains: 'Kimya', mode: 'insensitive' } },
              { course: { contains: 'Biyoloji', mode: 'insensitive' } },
              { course: { contains: 'Tarih', mode: 'insensitive' } },
              { course: { contains: 'Coğrafya', mode: 'insensitive' } },
              { course: { contains: 'Felsefe', mode: 'insensitive' } },
              { course: { contains: 'Din', mode: 'insensitive' } },
            ],
          },
        }),
        prisma.questionAnalysis.count({ where: analysisWhere }),
        prisma.guidanceAlert.findMany({
          where: { student: institutionWhere },
          include: { student: true },
          take: 20,
        }),
        prisma.dropStudent.findMany({
          where: { student: institutionWhere },
          include: { student: true },
          take: 10,
        }),
        prisma.questionAnalysis.groupBy({
          by: ['course'],
          where: analysisWhere,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        }),
        prisma.activityLog.findMany({ where: institutionWhere }),
        req.user.role === 'super_admin'
          ? prisma.$queryRaw`
              SELECT
                CAST(EXTRACT(DOW FROM created_at + interval '6 days') AS INTEGER) % 7 as day,
                CAST(EXTRACT(HOUR FROM created_at) AS INTEGER) as hour,
                CAST(COUNT(*) AS INTEGER) as count
              FROM question_analyses
              GROUP BY day, hour
            `
          : prisma.$queryRaw`
              SELECT
                CAST(EXTRACT(DOW FROM qa.created_at + interval '6 days') AS INTEGER) % 7 as day,
                CAST(EXTRACT(HOUR FROM qa.created_at) AS INTEGER) as hour,
                CAST(COUNT(*) AS INTEGER) as count
              FROM question_analyses qa
              JOIN students s ON qa.student_id = s.id
              WHERE s.institution_id = ${Number(req.user.institutionId)}
              GROUP BY day, hour
            `,
      ]);

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [trendData, mostAskedData] = await Promise.all([
        prisma.questionAnalysis.groupBy({
          by: ['course'],
          where: { ...analysisWhere, createdAt: { gte: twentyFourHoursAgo } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
        prisma.questionAnalysis.groupBy({
          by: ['topic'],
          where: { ...analysisWhere, createdAt: { gte: thirtyDaysAgo } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
      ]);

      const trendSubject = trendData.length > 0 ? trendData[0].course : 'Veri Yok';
      const trendCount = trendData.length > 0 ? trendData[0]._count.id : 0;
      const mostAskedSubject = mostAskedData.length > 0 ? mostAskedData[0].topic : 'Veri Yok';

      let weeklyChampList = [];
      if (topWeeklyStats.length > 0) {
        const top5 = topWeeklyStats.slice(0, 5);
        weeklyChampList = await Promise.all(
          top5.map(async (stat) => {
            const student = await prisma.student.findUnique({
              where: { id: stat.studentId },
              select: { name: true },
            });
            return {
              name: student ? student.name : 'Bilinmeyen Öğrenci',
              count: stat._sum.solvedCount || 0,
            };
          }),
        );
      }

      if (weeklyChampList.length === 0) {
        const weeklyTopQA = await prisma.questionAnalysis.groupBy({
          by: ['studentId'],
          where: { ...analysisWhere, createdAt: { gte: sevenDaysAgo } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        });

        weeklyChampList = await Promise.all(
          weeklyTopQA.map(async (stat) => {
            const student = await prisma.student.findUnique({
              where: { id: stat.studentId },
              select: { name: true },
            });
            return {
              name: student ? student.name : 'Bilinmeyen Öğrenci',
              count: stat._count.id || 0,
            };
          }),
        );
      }

      const weeklyChamp = weeklyChampList.length > 0 ? weeklyChampList[0].name : 'Henüz Yok';
      const weeklyChampCount =
        weeklyChampList.length > 0 ? weeklyChampList[0].count.toString() : '0';

      let aytTotal = totalAnalyses - tytCount;
      let tytAytData;
      if (totalAnalyses === 0) {
        aytTotal = 35;
        tytAytData = [
          { name: 'TYT Soruları', value: 65, color: '#6366f1' },
          { name: 'AYT Soruları', value: aytTotal, color: '#a855f7' },
        ];
      } else {
        tytAytData = [
          { name: 'TYT Soruları', value: tytCount, color: '#6366f1' },
          { name: 'AYT Soruları', value: aytTotal, color: '#a855f7' },
        ];
      }

      const heatmapGrid = Array.from({ length: 7 }, () => Array(24).fill(0));
      let maxCount = 0;
      heatmapRaw.forEach((item) => {
        heatmapGrid[item.day][item.hour] = item.count;
        if (item.count > maxCount) maxCount = item.count;
      });
      const normalizedHeatmap = heatmapGrid.map((day) =>
        day.map((count) => (maxCount > 0 ? (count / maxCount) * 0.9 + 0.1 : 0.05)),
      );

      let finalDropStudents = [];
      if (dropStudentsDB && dropStudentsDB.length > 0) {
        finalDropStudents = dropStudentsDB.map((dropStudent) => ({
          name: dropStudent.student?.name || dropStudent.name,
          drop: dropStudent.dropRate,
          type: dropStudent.type,
        }));
      } else {
        const fourteenDaysAgoStr = new Date(
          Date.now() - 14 * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split('T')[0];
        const last14DaysActivity = await prisma.dailyActivity.groupBy({
          by: ['studentId', 'date'],
          where: { student: institutionWhere, date: { gte: fourteenDaysAgoStr } },
          _sum: { solvedCount: true },
        });

        const studentStats = {};
        last14DaysActivity.forEach((activity) => {
          if (!studentStats[activity.studentId]) {
            studentStats[activity.studentId] = { curr: 0, prev: 0 };
          }
          if (activity.date >= sevenDaysAgoStr) {
            studentStats[activity.studentId].curr += activity._sum.solvedCount || 0;
          } else {
            studentStats[activity.studentId].prev += activity._sum.solvedCount || 0;
          }
        });

        let dynamicDrops = [];
        for (const [studentId, stats] of Object.entries(studentStats)) {
          if (stats.prev > 10) {
            const dropRate = ((stats.prev - stats.curr) / stats.prev) * 100;
            if (dropRate >= 30) {
              dynamicDrops.push({ id: parseInt(studentId, 10), drop: Math.round(dropRate) });
            }
          }
        }

        dynamicDrops.sort((a, b) => b.drop - a.drop);
        dynamicDrops = dynamicDrops.slice(0, 5);

        finalDropStudents = await Promise.all(
          dynamicDrops.map(async (dropStudent) => {
            const student = await prisma.student.findUnique({
              where: { id: dropStudent.id },
              select: { name: true },
            });
            return {
              name: student ? student.name : 'Bilinmeyen',
              drop: `-%${dropStudent.drop}`,
              type: 'Aktivite Düşüşü',
            };
          }),
        );

        if (finalDropStudents.length === 0) {
          finalDropStudents = [
            { name: 'Sistem İzleniyor', drop: '-', type: 'Yeterli düşüş saptanmadı' },
          ];
        }
      }

      res.json({
        total_students: totalCount.toString(),
        active_students: activeCount.toString(),
        trend_subject: trendSubject,
        trend_count: trendCount.toString(),
        trend_list: trendData.map((item) => ({ name: item.course, count: item._count.id })),
        most_asked_subject: mostAskedSubject,
        most_asked_list: mostAskedData.map((item) => ({
          name: item.topic,
          count: item._count.id,
        })),
        weekly_champ: weeklyChamp,
        weekly_champ_count: weeklyChampCount,
        weekly_champ_list: weeklyChampList,
        curriculum_progress: Math.round(avgProgressData._avg.progress || 0).toString(),
        hourlyData:
          hourlyData.length > 0
            ? hourlyData
            : [
                { hour: '08:00', questions: 12 },
                { hour: '12:00', questions: 45 },
                { hour: '16:00', questions: 32 },
                { hour: '20:00', questions: 68 },
                { hour: '00:00', questions: 15 },
              ],
        tytAytData,
        wrongTopicsData: wrongTopicsData.map((item) => ({
          course: item.course || 'Bilinmiyor',
          count: item._count.id || 0,
        })),
        heatmapData: normalizedHeatmap,
        dropStudents: finalDropStudents,
        guidanceAlerts: guidanceAlerts.map((alert) => ({
          student: alert.student?.name || alert.studentName,
          issue: alert.issue,
          priority: alert.priority,
        })),
      });
    } catch (err) {
      console.error('Dashboard Stats Error:', err);
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  const sn = (v) => {
    const p = Number(v);
    return Number.isFinite(p) ? p : 0;
  };

  const round = (value, digits = 1) => {
    const factor = 10 ** digits;
    return Math.round(sn(value) * factor) / factor;
  };

  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, sn(value)));

  const subjectDefs = [
    { key: 'tytTur', dKey: 'tytTurD', yKey: 'tytTurY', label: 'TYT Türkçe', group: 'TYT', max: 40 },
    { key: 'tytMat', dKey: 'tytMatD', yKey: 'tytMatY', label: 'TYT Matematik', group: 'TYT', max: 40 },
    { key: 'tytTar', dKey: 'tytTarD', yKey: 'tytTarY', label: 'TYT Tarih', group: 'TYT', max: 5 },
    { key: 'tytCog', dKey: 'tytCogD', yKey: 'tytCogY', label: 'TYT Coğrafya', group: 'TYT', max: 5 },
    { key: 'tytFel', dKey: 'tytFelD', yKey: 'tytFelY', label: 'TYT Felsefe', group: 'TYT', max: 5 },
    { key: 'tytDin', dKey: 'tytDinD', yKey: 'tytDinY', label: 'TYT Din', group: 'TYT', max: 5 },
    { key: 'tytFiz', dKey: 'tytFizD', yKey: 'tytFizY', label: 'TYT Fizik', group: 'TYT', max: 7 },
    { key: 'tytKim', dKey: 'tytKimD', yKey: 'tytKimY', label: 'TYT Kimya', group: 'TYT', max: 7 },
    { key: 'tytBiy', dKey: 'tytBiyD', yKey: 'tytBiyY', label: 'TYT Biyoloji', group: 'TYT', max: 6 },
    { key: 'aytMat', dKey: 'aytMatD', yKey: 'aytMatY', label: 'AYT Matematik', group: 'AYT', max: 40 },
    { key: 'aytFiz', dKey: 'aytFizD', yKey: 'aytFizY', label: 'AYT Fizik', group: 'AYT', max: 14 },
    { key: 'aytKim', dKey: 'aytKimD', yKey: 'aytKimY', label: 'AYT Kimya', group: 'AYT', max: 13 },
    { key: 'aytBiy', dKey: 'aytBiyD', yKey: 'aytBiyY', label: 'AYT Biyoloji', group: 'AYT', max: 13 },
    { key: 'aytEdb', dKey: 'aytEdbD', yKey: 'aytEdbY', label: 'AYT Edebiyat', group: 'AYT', max: 24 },
    { key: 'aytTar1', dKey: 'aytTar1D', yKey: 'aytTar1Y', label: 'AYT Tarih-1', group: 'AYT', max: 10 },
    { key: 'aytCog1', dKey: 'aytCog1D', yKey: 'aytCog1Y', label: 'AYT Coğrafya-1', group: 'AYT', max: 6 },
    { key: 'aytTar2', dKey: 'aytTar2D', yKey: 'aytTar2Y', label: 'AYT Tarih-2', group: 'AYT', max: 11 },
    { key: 'aytCog2', dKey: 'aytCog2D', yKey: 'aytCog2Y', label: 'AYT Coğrafya-2', group: 'AYT', max: 11 },
    { key: 'aytFel', dKey: 'aytFelD', yKey: 'aytFelY', label: 'AYT Felsefe', group: 'AYT', max: 12 },
    { key: 'aytDin', dKey: 'aytDinD', yKey: 'aytDinY', label: 'AYT Din', group: 'AYT', max: 6 },
  ];

  const chronologicalLastThree = (exams = []) => exams.slice(0, 3).reverse();
  const totalNet = (exam) => sn(exam?.tytNet) + sn(exam?.aytNet);
  const average = (values) => values.length ? values.reduce((sum, value) => sum + sn(value), 0) / values.length : 0;
  const stdDev = (values) => {
    if (values.length < 2) return 0;
    const avg = average(values);
    return Math.sqrt(average(values.map((value) => (sn(value) - avg) ** 2)));
  };

  const formatFlow = (values) => values.map((value) => round(value, 1)).join(' → ');

  const getMomentum = (values, threshold = 0.5) => {
    const cleaned = values.map(sn);
    if (cleaned.length < 2) {
      return { code: 'stable', label: 'durağan', direction: 'stable', delta: 0, intensity: 1 };
    }

    const totalDelta = cleaned[cleaned.length - 1] - cleaned[0];
    const absDelta = Math.abs(totalDelta);
    const intensity = Math.max(1, Math.min(3, Math.ceil(absDelta / 2)));

    if (absDelta < threshold) {
      return { code: 'stable', label: 'durağan', direction: 'stable', delta: round(totalDelta, 1), intensity: 1 };
    }

    if (cleaned.length >= 3) {
      const delta1 = cleaned[1] - cleaned[0];
      const delta2 = cleaned[2] - cleaned[1];
      if (totalDelta > 0 && delta2 > delta1 + threshold) {
        return { code: 'accelerating_up', label: 'hızlanarak artış', direction: 'up', delta: round(totalDelta, 1), intensity };
      }
      if (totalDelta > 0 && delta2 < delta1 - threshold) {
        return { code: 'slowing_up', label: 'yavaşlayan artış', direction: 'up', delta: round(totalDelta, 1), intensity };
      }
      if (totalDelta < 0 && delta2 < delta1 - threshold) {
        return { code: 'accelerating_down', label: 'hızlanarak düşüş', direction: 'down', delta: round(totalDelta, 1), intensity };
      }
      if (totalDelta < 0 && delta2 > delta1 + threshold) {
        return { code: 'slowing_down', label: 'yavaşlayan düşüş', direction: 'down', delta: round(totalDelta, 1), intensity };
      }
    }

    return totalDelta > 0
      ? { code: 'up', label: 'artış', direction: 'up', delta: round(totalDelta, 1), intensity }
      : { code: 'down', label: 'düşüş', direction: 'down', delta: round(totalDelta, 1), intensity };
  };

  const summarizeEfficiency = (students) => {
    const candidates = students.filter((student) => student.exams && student.exams.length >= 2);
    if (candidates.length === 0) {
      return { data: [], avgWeeklySolved: 0, avgNetChange: 0 };
    }

    const weeklyTotals = candidates.map((student) =>
      (student.dailyActivities || []).reduce((acc, activity) => acc + sn(activity.solvedCount), 0),
    );
    const avgWeeklySolved = average(weeklyTotals);
    const highEffortFloor = avgWeeklySolved > 0 ? avgWeeklySolved : 1;

    const buckets = {
      efficient: [],
      inefficient: [],
      talented: [],
      risk: [],
    };

    const netChanges = [];
    candidates.forEach((student, index) => {
      const exams = chronologicalLastThree(student.exams);
      const netChange = totalNet(exams[exams.length - 1]) - totalNet(exams[0]);
      const weeklySolved = weeklyTotals[index] || 0;
      const isHighEffort = weeklySolved >= highEffortFloor;
      const isNetRising = netChange > 0.5;
      netChanges.push(netChange);

      const entry = {
        id: student.id,
        name: student.name,
        class: student.class,
        weeklySolved,
        netChange: round(netChange, 1),
        tytFlow: formatFlow(exams.map((exam) => sn(exam.tytNet))),
        aytFlow: formatFlow(exams.map((exam) => sn(exam.aytNet))),
      };

      if (isHighEffort && isNetRising) buckets.efficient.push(entry);
      else if (isHighEffort && !isNetRising) buckets.inefficient.push(entry);
      else if (!isHighEffort && isNetRising) buckets.talented.push(entry);
      else buckets.risk.push(entry);
    });

    const data = [
      { name: 'Verimli Çalışan', value: buckets.efficient.length, color: '#10b981', desc: 'Hem soru çözüyor hem net artıyor', students: buckets.efficient },
      { name: 'Çok Çalışıp Az Kazanan', value: buckets.inefficient.length, color: '#f59e0b', desc: 'Soru çözüyor ama net artmıyor', students: buckets.inefficient },
      { name: 'Az Çalışıp İyi Giden', value: buckets.talented.length, color: '#6366f1', desc: 'Az soru ama net artıyor', students: buckets.talented },
      { name: 'Risk Grubu', value: buckets.risk.length, color: '#ef4444', desc: 'Ne soru çözüyor ne net artıyor', students: buckets.risk },
    ].filter((item) => item.value > 0);

    const totalValue = data.reduce((sum, item) => sum + item.value, 0);
    return {
      data: totalValue > 0 ? data.map((item) => ({ ...item, percentage: Math.round((item.value / totalValue) * 100) })) : [],
      avgWeeklySolved: round(avgWeeklySolved, 0),
      avgNetChange: round(average(netChanges), 1),
    };
  };

  const getDashboardMemoryKey = (req) => (
    req.user.role === 'super_admin'
      ? 'ai-summary:super-admin:global'
      : `ai-summary:institution:${req.user.institutionId}`
  );

  const parseDashboardMemory = (meta) => {
    if (!meta?.value) return null;
    try {
      return JSON.parse(meta.value);
    } catch (error) {
      console.warn('AI_SUMMARY_MEMORY_PARSE_ERROR:', error.message);
      return null;
    }
  };

  const getDepartmentOwner = (subject = '') => {
    const normalized = String(subject).replace(/^(TYT|AYT)\s+/i, '').trim();
    const root = normalized.split(/[\s-]/)[0] || 'İlgili';
    return `${root} zümresi`;
  };

  const buildSegment = (name, description, students, sortFn) => {
    const sorted = [...students].sort(sortFn);
    return {
      name,
      count: sorted.length,
      description,
      students: sorted.slice(0, 6).map((student) => ({
        id: student.id,
        name: student.name,
        class: student.class,
        latestTotalNet: student.latestTotalNet,
        netChange: student.netChange,
        weeklySolved: student.weeklySolved,
      })),
    };
  };

  app.get('/api/topics/errored', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const where = req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };
      const students = await prisma.student.findMany({
        where,
        include: { exams: { orderBy: { date: 'desc' }, take: 3 } },
      });

      const subjectStats = {};
      for (const def of subjectDefs) {
        subjectStats[def.key] = {
          label: def.label,
          totalWrong: 0,
          totalAnswered: 0,
          affectedStudents: 0,
          slots: [0, 1, 2].map(() => ({ wrong: 0, answered: 0 })),
        };
      }

      for (const student of students) {
        if (!student.exams || student.exams.length === 0) continue;
        const exams = chronologicalLastThree(student.exams);
        for (const def of subjectDefs) {
          let studentWrong = 0;
          let studentAnswered = 0;
          exams.forEach((exam, index) => {
            const wrong = sn(exam[def.yKey]);
            const answered = sn(exam[def.dKey]) + wrong;
            if (answered <= 0) return;
            studentWrong += wrong;
            studentAnswered += answered;
            subjectStats[def.key].totalWrong += wrong;
            subjectStats[def.key].totalAnswered += answered;
            subjectStats[def.key].slots[index].wrong += wrong;
            subjectStats[def.key].slots[index].answered += answered;
          });
          if (studentAnswered > 0 && studentWrong > 0) {
            subjectStats[def.key].affectedStudents += 1;
          }
        }
      }

      const result = Object.values(subjectStats)
        .filter((subject) => subject.totalAnswered > 0)
        .map((subject) => {
          const wrongRate = Math.round((subject.totalWrong / subject.totalAnswered) * 100);
          const trendValues = subject.slots
            .filter((slot) => slot.answered > 0)
            .map((slot) => round((slot.wrong / slot.answered) * 100, 1));
          let trend = 'stable';
          if (trendValues.length >= 2) {
            const delta = trendValues[trendValues.length - 1] - trendValues[0];
            if (delta > 1) trend = 'rising';
            else if (delta < -1) trend = 'falling';
          }
          return {
            course: subject.label,
            rate: `%${wrongRate}`,
            wrongRate,
            affected: subject.affectedStudents,
            trend,
            trendValues,
          };
        })
        .sort((a, b) => b.wrongRate - a.wrongRate)
        .slice(0, 8);

      res.json(result);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/correlation/intelligence', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const where = req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      const students = await prisma.student.findMany({
        where,
        include: {
          exams: { orderBy: { date: 'desc' }, take: 3 },
          dailyActivities: { where: { date: { gte: sevenDaysAgoStr } } },
        },
      });

      res.json(summarizeEfficiency(students).data);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/students/trending', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const where = req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };
      const students = await prisma.student.findMany({
        where,
        include: { exams: { orderBy: { date: 'desc' }, take: 3 } },
      });

      const allTrends = students
        .filter((student) => student.exams && student.exams.length >= 3)
        .map((student) => {
          const exams = chronologicalLastThree(student.exams);
          const tytNets = exams.map((exam) => round(exam.tytNet, 1));
          const aytNets = exams.map((exam) => round(exam.aytNet, 1));
          const totalNets = exams.map((exam) => round(totalNet(exam), 1));

          const first = totalNets[0];
          const last = totalNets[totalNets.length - 1];
          const diff = last - first;
          const momentumInfo = getMomentum(totalNets, 0.5);

          const subjectMomentum = subjectDefs
            .map((def) => {
              const flow = exams.map((exam) => round(exam[def.key], 1));
              const subjectDiff = flow[flow.length - 1] - flow[0];
              const subjectMomentumInfo = getMomentum(flow, 0.25);
              return {
                subject: def.label,
                group: def.group,
                flow,
                change: round(subjectDiff, 1),
                direction: subjectMomentumInfo.direction,
              };
            })
            .filter((item) => Math.abs(item.change) >= 0.25)
            .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

          return {
            id: student.id,
            name: student.name,
            class: student.class,
            tytNets,
            aytNets,
            totalNets,
            tytFlow: formatFlow(tytNets),
            aytFlow: formatFlow(aytNets),
            totalFlow: formatFlow(totalNets),
            lastNet: round(last, 1),
            diff: round(diff, 1),
            totalNetChange: round(diff, 1),
            momentum: momentumInfo.code,
            momentumDirection: momentumInfo.direction,
            momentumLabel: momentumInfo.label,
            subjectMomentum: subjectMomentum.slice(0, 4),
            tytSubjects: subjectMomentum.filter((item) => item.group === 'TYT').slice(0, 4),
            aytSubjects: subjectMomentum.filter((item) => item.group === 'AYT').slice(0, 4),
            change: `${diff >= 0 ? '+' : ''}${round(diff, 1).toFixed(1)}`,
          };
        })
        .sort((a, b) => b.totalNetChange - a.totalNetChange);

      res.json({
        rising: allTrends.filter((student) => student.totalNetChange > 0).slice(0, 5),
        falling: allTrends.filter((student) => student.totalNetChange < 0).sort((a, b) => a.totalNetChange - b.totalNetChange).slice(0, 5),
      });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.get('/api/ai-summary', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const where = req.user.role === 'super_admin' ? {} : { institutionId: req.user.institutionId };

      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      const [studentIds, allStudents] = await Promise.all([
        prisma.student.findMany({ where, select: { id: true } }),
        prisma.student.findMany({
          where,
          include: {
            exams: { orderBy: { date: 'desc' }, take: 3 },
            dailyActivities: { where: { date: { gte: sevenDaysAgoStr } } },
          },
        }),
      ]);

      if (studentIds.length === 0) {
        return res.json({
          summary: {
            healthScore: { total: 0, participation: 0, netTrend: 0, consistency: 0, efficiency: 0 },
            blindSpot: 'Henüz öğrenci verisi bulunmuyor.',
            efficiencyInsight: '',
            highestROI: '',
            momentum: [],
            interventionPlan: null,
            studentSegments: {},
            departmentMap: {},
            postInterventionFollowUp: {
              hasPrevious: false,
              summary: 'İlk operasyon analizi için yeterli deneme verisi bulunmuyor.',
            },
            principalWeeklyBrief: {
              goodThings: [],
              alarms: ['Henüz öğrenci verisi bulunmuyor.'],
              immediateActions: ['Deneme ve günlük aktivite verisi girilmeli.'],
              departmentNote: '',
            },
          },
        });
      }

      const studentsWithExams = allStudents.filter((student) => student.exams && student.exams.length > 0);
      const trendStudents = allStudents.filter((student) => student.exams && student.exams.length >= 2);
      const participantCount = studentsWithExams.length;

      const averageRoundFlow = (picker) => [0, 1, 2].map((index) => {
        const vals = studentsWithExams
          .map((student) => chronologicalLastThree(student.exams)[index])
          .filter(Boolean)
          .map(picker);
        return vals.length > 0 ? round(average(vals), 1) : null;
      }).filter((value) => value !== null);

      const tytPerRound = averageRoundFlow((exam) => sn(exam.tytNet));
      const aytPerRound = averageRoundFlow((exam) => sn(exam.aytNet));

      const subjectMetrics = subjectDefs.map((def) => {
        const roundAverages = [0, 1, 2].map((index) => {
          const vals = studentsWithExams
            .map((student) => chronologicalLastThree(student.exams)[index])
            .filter(Boolean)
            .map((exam) => sn(exam[def.key]));
          return vals.length > 0 ? round(average(vals), 1) : null;
        }).filter((value) => value !== null);

        const latestValues = studentsWithExams
          .map((student) => {
            const exams = chronologicalLastThree(student.exams);
            return exams[exams.length - 1];
          })
          .filter(Boolean)
          .map((exam) => sn(exam[def.key]));
        const latestAverage = latestValues.length > 0 ? average(latestValues) : 0;
        const belowAverageCount = latestValues.filter((value) => value < latestAverage).length;
        const latestStdDev = stdDev(latestValues);
        const potentialGain = latestValues.length > 0
          ? latestValues.reduce((sum, value) => sum + Math.max(0, latestAverage - value), 0) / latestValues.length
          : 0;

        const wrongTotals = studentsWithExams.reduce((acc, student) => {
          chronologicalLastThree(student.exams).forEach((exam) => {
            const wrong = sn(exam[def.yKey]);
            const answered = sn(exam[def.dKey]) + wrong;
            acc.wrong += wrong;
            acc.answered += answered;
          });
          return acc;
        }, { wrong: 0, answered: 0 });

        const momentum = getMomentum(roundAverages, 0.25);
        const trendDelta = roundAverages.length >= 2 ? round(roundAverages[roundAverages.length - 1] - roundAverages[0], 1) : 0;
        const belowAverageRate = latestValues.length > 0 ? Math.round((belowAverageCount / latestValues.length) * 100) : 0;

        return {
          subject: def.label,
          group: def.group,
          averages: roundAverages,
          latestAverage: round(latestAverage, 1),
          latestStdDev: round(latestStdDev, 1),
          trendDelta,
          momentum: momentum.code,
          direction: momentum.direction,
          intensity: momentum.intensity,
          note: momentum.label,
          belowAverageCount,
          belowAverageRate,
          wrongRate: wrongTotals.answered > 0 ? Math.round((wrongTotals.wrong / wrongTotals.answered) * 100) : 0,
          potentialGain: round(potentialGain, 1),
          roiScore: round(potentialGain * (belowAverageRate / 100), 2),
        };
      }).filter((metric) => metric.averages.length > 0);

      const subjectAvgs = [...subjectMetrics].sort((a, b) => b.latestAverage - a.latestAverage);
      const strongestText = subjectAvgs.slice(0, 3).map((item) => `${item.subject}: ${item.latestAverage}`).join(', ');
      const weakestText = subjectAvgs.slice(-3).reverse().map((item) => `${item.subject}: ${item.latestAverage}`).join(', ');

      const blindSpotItems = [...subjectMetrics]
        .filter((item) => item.latestAverage > 0)
        .sort((a, b) => b.belowAverageRate - a.belowAverageRate);
      const blindSpotText = blindSpotItems.slice(0, 5)
        .map((item) => `${item.subject}: %${item.belowAverageRate} ortalamanın altında (${item.belowAverageCount} öğrenci), yanlış oranı %${item.wrongRate}`)
        .join(' | ');

      const totalWeeklySolved = allStudents.reduce((sum, s) => sum + (s.dailyActivities || []).reduce((acc, d) => acc + sn(d.solvedCount), 0), 0);
      const avgWeeklySolved = Math.round(totalWeeklySolved / Math.max(allStudents.length, 1));
      const netChanges = trendStudents.map((student) => {
        const exams = chronologicalLastThree(student.exams);
        return totalNet(exams[exams.length - 1]) - totalNet(exams[0]);
      });
      const latestTotalNets = studentsWithExams.map((student) => {
        const exams = chronologicalLastThree(student.exams);
        return totalNet(exams[exams.length - 1]);
      });
      const avgNetChange = round(average(netChanges), 1);
      const expectedNetChange = round(avgWeeklySolved / 170, 1);
      const efficiencySummary = summarizeEfficiency(allStudents);
      const efficiencyText = `Haftalık ortalama ${avgWeeklySolved} soru, son 3 denemede ortalama net değişimi ${avgNetChange >= 0 ? '+' : ''}${avgNetChange}. Bu hacimde beklenen artış yaklaşık +${expectedNetChange}.`;

      const roiItems = [...subjectMetrics]
        .filter((item) => item.potentialGain > 0)
        .sort((a, b) => b.roiScore - a.roiScore);
      const roiText = roiItems.slice(0, 5)
        .map((item) => `${item.subject}: +${item.potentialGain} net potansiyel, %${item.belowAverageRate} öğrenci ortalamanın altında`)
        .join(' | ');

      const momentumItems = subjectMetrics
        .filter((item) => item.averages.length >= 2)
        .sort((a, b) => Math.abs(b.trendDelta) - Math.abs(a.trendDelta))
        .map((item) => ({
          subject: item.subject,
          direction: item.direction,
          intensity: item.intensity,
          note: item.note,
          trendDelta: item.trendDelta,
          averages: item.averages,
        }));
      const momentumText = momentumItems
        .slice(0, 10)
        .map((item) => `${item.subject}: ${item.direction} ${item.trendDelta >= 0 ? '+' : ''}${item.trendDelta} (${item.note})`)
        .join(' | ');

      const subjectMetricByLabel = new Map(subjectMetrics.map((item) => [item.subject, item]));
      const studentProfiles = trendStudents.map((student) => {
        const exams = chronologicalLastThree(student.exams);
        const firstExam = exams[0];
        const latestExam = exams[exams.length - 1];
        const totalNets = exams.map((exam) => round(totalNet(exam), 1));
        const firstTotalNet = totalNets[0] || 0;
        const latestTotalNet = totalNets[totalNets.length - 1] || 0;
        const weeklySolved = (student.dailyActivities || []).reduce((acc, activity) => acc + sn(activity.solvedCount), 0);
        const subjects = subjectDefs.map((def) => {
          const metric = subjectMetricByLabel.get(def.label) || {};
          const latestNet = round(latestExam?.[def.key], 1);
          const firstNet = round(firstExam?.[def.key], 1);
          return {
            subject: def.label,
            latestNet,
            change: round(latestNet - firstNet, 1),
            belowAverage: latestNet < sn(metric.latestAverage),
          };
        });

        return {
          id: student.id,
          name: student.name,
          class: student.class,
          weeklySolved,
          totalNets,
          tytFlow: formatFlow(exams.map((exam) => sn(exam.tytNet))),
          aytFlow: formatFlow(exams.map((exam) => sn(exam.aytNet))),
          firstTotalNet: round(firstTotalNet, 1),
          latestTotalNet: round(latestTotalNet, 1),
          netChange: round(latestTotalNet - firstTotalNet, 1),
          subjects,
        };
      });

      const latestTotalAverage = round(average(studentProfiles.map((student) => student.latestTotalNet)), 1);
      const avgWeeklySolvedForProfiles = round(average(studentProfiles.map((student) => student.weeklySolved)), 0);
      const studentSegments = {
        carriers: buildSegment(
          'Taşıyıcılar',
          'Kurum ortalamasını yukarı taşıyan ve düşüş sinyali vermeyen öğrenciler.',
          studentProfiles.filter((student) => student.latestTotalNet >= latestTotalAverage && student.netChange >= 0),
          (a, b) => b.latestTotalNet - a.latestTotalNet,
        ),
        hiddenRisk: buildSegment(
          'Gizli Risk',
          'Ortalamanın üstünde olmasına rağmen son 3 denemede belirgin düşen öğrenciler.',
          studentProfiles.filter((student) => student.latestTotalNet >= latestTotalAverage && student.netChange <= -3),
          (a, b) => a.netChange - b.netChange,
        ),
        breakoutCandidates: buildSegment(
          'Patlama Adayı',
          'Düşük eforla net artıran, doğru yönlendirmeyle hızlı sıçrama potansiyeli olan öğrenciler.',
          studentProfiles.filter((student) => student.weeklySolved < avgWeeklySolvedForProfiles && student.netChange >= 2),
          (a, b) => b.netChange - a.netChange,
        ),
        effortLeak: buildSegment(
          'Efor Kaybı',
          'Soru hacmi yüksek olduğu halde net karşılığı alamayan öğrenciler.',
          studentProfiles.filter((student) => student.weeklySolved >= avgWeeklySolvedForProfiles && student.netChange < 0.5),
          (a, b) => b.weeklySolved - a.weeklySolved,
        ),
        criticalIntervention: buildSegment(
          'Kritik Müdahale',
          'Hem ortalamanın altında kalan hem de düşüş trendindeki öğrenciler.',
          studentProfiles.filter((student) => student.latestTotalNet < latestTotalAverage && student.netChange <= -2),
          (a, b) => a.netChange - b.netChange,
        ),
      };

      const focusSubject = roiItems[0] || subjectMetrics[0] || null;
      const interventionTargets = focusSubject
        ? studentProfiles
          .map((student) => {
            const subject = student.subjects.find((item) => item.subject === focusSubject.subject);
            const gap = Math.max(0, sn(focusSubject.latestAverage) - sn(subject?.latestNet));
            return { ...student, subjectNet: sn(subject?.latestNet), subjectGap: round(gap, 1) };
          })
          .filter((student) => student.subjectGap > 0)
          .sort((a, b) => b.subjectGap - a.subjectGap)
        : [];
      const expectedGain = round(interventionTargets.reduce((sum, student) => sum + student.subjectGap, 0), 1);
      const interventionPlan = focusSubject ? {
        focusSubject: focusSubject.subject,
        targetGroup: `${round(focusSubject.latestAverage, 1)} net altı ${interventionTargets.length} öğrenci`,
        targetThreshold: round(focusSubject.latestAverage, 1),
        targetStudents: interventionTargets.slice(0, 8).map((student) => ({
          id: student.id,
          name: student.name,
          class: student.class,
          subjectNet: student.subjectNet,
          gap: student.subjectGap,
        })),
        recommendedAction: '2 mini branş denemesi + yanlış çözüm etüdü',
        expectedGain: `+${expectedGain} kurum net potansiyeli`,
        expectedGainValue: expectedGain,
        owner: getDepartmentOwner(focusSubject.subject),
      } : null;

      const fastestRecovery = [...subjectMetrics].sort((a, b) => b.trendDelta - a.trendDelta)[0] || null;
      const highestLoss = [...subjectMetrics].sort((a, b) => b.roiScore - a.roiScore)[0] || null;
      const brokenDistribution = [...subjectMetrics].sort((a, b) => b.latestStdDev - a.latestStdDev)[0] || null;
      const lowWrongNoGain = [...subjectMetrics]
        .filter((item) => item.wrongRate <= 25 && item.trendDelta <= 0.25)
        .sort((a, b) => a.wrongRate - b.wrongRate || a.trendDelta - b.trendDelta)[0] || null;
      const teachingEfficiencySignal = [...subjectMetrics]
        .sort((a, b) => (b.trendDelta - b.wrongRate / 25) - (a.trendDelta - a.wrongRate / 25))[0] || null;
      const departmentMap = {
        highestLoss: highestLoss ? {
          subject: highestLoss.subject,
          signal: `${highestLoss.belowAverageCount} öğrenci ortalamanın altında, +${highestLoss.potentialGain} net ortalama potansiyel.`,
          score: highestLoss.roiScore,
        } : null,
        fastestRecovery: fastestRecovery ? {
          subject: fastestRecovery.subject,
          signal: `Son 3 denemede ${fastestRecovery.trendDelta >= 0 ? '+' : ''}${fastestRecovery.trendDelta} net hareket.`,
          trendDelta: fastestRecovery.trendDelta,
        } : null,
        unevenDistribution: brokenDistribution ? {
          subject: brokenDistribution.subject,
          signal: `Ortalama ${brokenDistribution.latestAverage}, dağılım sapması ${brokenDistribution.latestStdDev}.`,
          latestStdDev: brokenDistribution.latestStdDev,
        } : null,
        lowWrongNoGain: lowWrongNoGain ? {
          subject: lowWrongNoGain.subject,
          signal: `Yanlış oranı %${lowWrongNoGain.wrongRate}, net trendi ${lowWrongNoGain.trendDelta >= 0 ? '+' : ''}${lowWrongNoGain.trendDelta}.`,
          wrongRate: lowWrongNoGain.wrongRate,
          trendDelta: lowWrongNoGain.trendDelta,
        } : null,
        teachingEfficiency: teachingEfficiencySignal ? {
          subject: teachingEfficiencySignal.subject,
          signal: `Yanlış oranı %${teachingEfficiencySignal.wrongRate}, trend ${teachingEfficiencySignal.trendDelta >= 0 ? '+' : ''}${teachingEfficiencySignal.trendDelta}.`,
          wrongRate: teachingEfficiencySignal.wrongRate,
          trendDelta: teachingEfficiencySignal.trendDelta,
        } : null,
      };

      const previousMemory = parseDashboardMemory(await prisma.dashboardMeta.findUnique({
        where: { key: getDashboardMemoryKey(req) },
      }));
      const previousPlan = previousMemory?.summary?.interventionPlan || previousMemory?.interventionPlan || null;
      const previousFocusSnapshot = previousMemory?.sourceStats?.focusMetric || null;
      const previousFocusMetric = previousPlan?.focusSubject
        ? subjectMetrics.find((item) => item.subject === previousPlan.focusSubject)
        : null;
      const postInterventionData = previousPlan && previousFocusMetric ? {
        hasPrevious: true,
        previousFocusSubject: previousPlan.focusSubject,
        previousAction: previousPlan.recommendedAction,
        previousWrongRate: previousFocusSnapshot?.wrongRate ?? null,
        previousAverage: previousFocusSnapshot?.latestAverage ?? null,
        currentWrongRate: previousFocusMetric.wrongRate,
        currentAverage: previousFocusMetric.latestAverage,
        currentTrendDelta: previousFocusMetric.trendDelta,
        wrongRateDelta: previousFocusSnapshot?.wrongRate != null ? round(previousFocusMetric.wrongRate - previousFocusSnapshot.wrongRate, 1) : null,
        averageDelta: previousFocusSnapshot?.latestAverage != null ? round(previousFocusMetric.latestAverage - previousFocusSnapshot.latestAverage, 1) : null,
        targetStudentCount: Array.isArray(previousPlan.targetStudents) ? previousPlan.targetStudents.length : 0,
        summary: previousFocusSnapshot
          ? `Geçen analizde ${previousPlan.focusSubject} odak önerilmişti. Yanlış oranı %${previousFocusSnapshot.wrongRate} seviyesinden %${previousFocusMetric.wrongRate} seviyesine geldi, ders ortalaması ${previousFocusSnapshot.latestAverage} netten ${previousFocusMetric.latestAverage} nete taşındı.`
          : `Geçen analizde ${previousPlan.focusSubject} odak önerilmişti. Bu derste son trend ${previousFocusMetric.trendDelta >= 0 ? '+' : ''}${previousFocusMetric.trendDelta} net, güncel yanlış oranı %${previousFocusMetric.wrongRate}.`,
      } : {
        hasPrevious: false,
        summary: 'İlk operasyon analizi. Bir sonraki analizde bu haftaki müdahalenin etkisi karşılaştırılacak.',
      };

      let risingTyt = 0, fallingTyt = 0, risingAyt = 0, fallingAyt = 0, sharpDrop = 0;
      trendStudents.forEach((student) => {
        const exams = chronologicalLastThree(student.exams);
        const tD = sn(exams[exams.length - 1].tytNet) - sn(exams[0].tytNet);
        const aD = sn(exams[exams.length - 1].aytNet) - sn(exams[0].aytNet);
        if (tD >= 3) risingTyt++; if (tD <= -3) fallingTyt++;
        if (aD >= 3) risingAyt++; if (aD <= -3) fallingAyt++;
        if (tD <= -8 || aD <= -8) sharpDrop++;
      });

      const participationRate = studentIds.length > 0 ? Math.round((participantCount / studentIds.length) * 100) : 0;
      const consistencyDeviation = round(stdDev(netChanges), 1);
      const latestNetDeviation = round(stdDev(latestTotalNets), 1);
      const consistencyScore = trendStudents.length >= 2 ? Math.round(clamp(100 - (consistencyDeviation * 6))) : 45;
      const netTrendScore = Math.round(clamp(50 + (avgNetChange * 8)));
      const efficiencyScore = Math.round(clamp(50 + ((avgNetChange - expectedNetChange) * 12) + (avgWeeklySolved > 0 ? 12 : -12)));
      const computedHealthScore = {
        participation: Math.round(clamp(participationRate)),
        netTrend: netTrendScore,
        consistency: consistencyScore,
        efficiency: efficiencyScore,
      };
      computedHealthScore.total = Math.round(
        (computedHealthScore.participation * 0.25)
        + (computedHealthScore.netTrend * 0.30)
        + (computedHealthScore.consistency * 0.20)
        + (computedHealthScore.efficiency * 0.25),
      );

      const summary = await aiService.generateDashboardSummary({
        periodLabel: 'Son 3 deneme',
        totalStudents: studentIds.length,
        currentParticipants: participantCount,
        examParticipationRate: participationRate,
        previousParticipationRate: participationRate,
        tytAverages: formatFlow(tytPerRound),
        aytAverages: formatFlow(aytPerRound),
        strongestSubjectsText: strongestText,
        weakestSubjectsText: weakestText,
        risingTytStudents: risingTyt,
        fallingTytStudents: fallingTyt,
        risingAytStudents: risingAyt,
        fallingAytStudents: fallingAyt,
        sharpDropStudents: sharpDrop,
        blindSpotData: blindSpotText,
        efficiencyData: efficiencyText,
        efficiencyMatrix: efficiencySummary.data.map((item) => ({ name: item.name, value: item.value, percentage: item.percentage })),
        roiData: roiText,
        momentumData: momentumText,
        subjectTrends: subjectMetrics,
        momentum: momentumItems,
        studentProfiles: studentProfiles.slice(0, 80),
        studentSegments,
        interventionPlan,
        departmentMap,
        postInterventionData,
        consistencyData: {
          netChangeStdDev: consistencyDeviation,
          latestTotalNetStdDev: latestNetDeviation,
          consistencyScore,
        },
        computedHealthScore,
        avgWeeklySolved,
        avgNetChange,
        expectedNetChange,
      });

      if (prisma.aiTelemetryEvent?.create) {
        const usageEvent = buildAiUsageEvent({
          institutionId: req.user.role === 'super_admin' ? null : req.user.institutionId,
          userId: req.user?.id ?? null,
          userRole: req.user?.role ?? null,
          actorType: req.user?.role ?? null,
          surface: 'institution_panel',
          feature: 'dashboard_summary',
          eventType: 'dashboard_summary',
          status: 'success',
          model: summary?.__model,
        }, {
          usageMetadata: summary?.__usageMetadata,
          model: summary?.__model,
        });
        await prisma.aiTelemetryEvent.create({
          data: {
            institutionId: usageEvent.institutionId,
            userId: usageEvent.userId,
            userRole: usageEvent.userRole,
            actorType: usageEvent.actorType,
            surface: usageEvent.surface,
            feature: usageEvent.feature,
            requestGroupId: usageEvent.requestGroupId,
            eventType: usageEvent.eventType,
            status: usageEvent.status,
            provider: usageEvent.provider,
            model: usageEvent.model,
            promptTokens: usageEvent.promptTokens,
            completionTokens: usageEvent.completionTokens,
            reasoningTokens: usageEvent.reasoningTokens,
            totalTokens: usageEvent.totalTokens,
            inputCostUsd: usageEvent.inputCostUsd,
            outputCostUsd: usageEvent.outputCostUsd,
            totalCostUsd: usageEvent.totalCostUsd,
            estimatedCostUsd: usageEvent.estimatedCostUsd,
          },
        });
      }

      await prisma.dashboardMeta.upsert({
        where: { key: getDashboardMemoryKey(req) },
        update: {
          value: JSON.stringify({
            generatedAt: new Date().toISOString(),
            summary,
          sourceStats: {
            totalStudents: studentIds.length,
            participants: participantCount,
            focusSubject: summary?.interventionPlan?.focusSubject || interventionPlan?.focusSubject || null,
            focusMetric: focusSubject ? {
              subject: focusSubject.subject,
              wrongRate: focusSubject.wrongRate,
              latestAverage: focusSubject.latestAverage,
              trendDelta: focusSubject.trendDelta,
            } : null,
          },
        }),
      },
        create: {
          key: getDashboardMemoryKey(req),
          value: JSON.stringify({
            generatedAt: new Date().toISOString(),
            summary,
          sourceStats: {
            totalStudents: studentIds.length,
            participants: participantCount,
            focusSubject: summary?.interventionPlan?.focusSubject || interventionPlan?.focusSubject || null,
            focusMetric: focusSubject ? {
              subject: focusSubject.subject,
              wrongRate: focusSubject.wrongRate,
              latestAverage: focusSubject.latestAverage,
              trendDelta: focusSubject.trendDelta,
            } : null,
          },
        }),
      },
      });

      res.json({ summary });
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });
}

module.exports = { registerDashboardRoutes };
