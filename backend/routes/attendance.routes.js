const { sendError } = require('../utils/errorHandler');

function registerAttendanceRoutes(app, deps) {
  const {
    prisma,
    authMiddleware,
    requireRole,
    studentScopeGuard,
  } = deps;

  app.get('/api/attendance', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { date } = req.query;
    try {
      const targetDate = date ? new Date(date) : new Date();
      targetDate.setHours(0, 0, 0, 0);

      let studentWhere = { institutionId: req.user.institutionId };
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
        studentWhere.class = { in: req.user.assignedClasses };
      }

      const students = await prisma.student.findMany({
        where: studentWhere,
        select: {
          id: true,
          name: true,
          class: true,
          parentName: true,
          parentPhone: true,
        },
      });

      const attendances = await prisma.attendance.findMany({
        where: {
          institutionId: req.user.institutionId,
          date: targetDate,
        },
      });

      const result = students.map((student) => {
        const attendance = attendances.find((item) => item.studentId === student.id);
        return {
          ...student,
          status: attendance ? attendance.status : null,
        };
      });

      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/attendance', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { studentId, date, status } = req.body;
    try {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);

      const attendance = await prisma.attendance.upsert({
        where: {
          studentId_date: {
            studentId: parseInt(studentId, 10),
            date: targetDate,
          },
        },
        update: { status },
        create: {
          studentId: parseInt(studentId, 10),
          date: targetDate,
          status,
          institutionId: req.user.institutionId,
        },
      });

      res.json(attendance);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/attendance/bulk', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { date, studentIds, status } = req.body;
    try {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);

      const operations = studentIds.map((id) =>
        prisma.attendance.upsert({
          where: { studentId_date: { studentId: parseInt(id, 10), date: targetDate } },
          update: { status },
          create: { studentId: parseInt(id, 10), date: targetDate, status, institutionId: req.user.institutionId },
        }),
      );

      await Promise.all(operations);
      res.json({ success: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/students/:id/attendance', authMiddleware, requireRole('admin', 'teacher', 'student', 'super_admin'), studentScopeGuard, async (req, res) => {
    try {
      const studentId = parseInt(req.params.id, 10);
      const attendanceWhere = req.user.role === 'super_admin'
        ? { studentId }
        : { studentId, institutionId: req.targetStudent.institutionId };

      const history = await prisma.attendance.findMany({
        where: attendanceWhere,
        orderBy: { date: 'desc' },
      });
      res.json(history);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/attendance/risk-analysis', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let riskWhere = {
        institutionId: req.user.institutionId,
        date: { gte: thirtyDaysAgo },
        status: { in: ['gelmedi', 'gec_kaldi'] },
      };

      const riskyStudents = await prisma.attendance.groupBy({
        by: ['studentId'],
        where: riskWhere,
        _count: { status: true },
        having: { status: { _count: { gt: 3 } } },
      });

      let riskyDetailsWhere = { id: { in: riskyStudents.map((item) => item.studentId) } };
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
        riskyDetailsWhere.class = { in: req.user.assignedClasses };
      }

      const studentDetails = await prisma.student.findMany({
        where: riskyDetailsWhere,
        select: { id: true, name: true, class: true },
      });

      // Filter riskyStudents to only those whose details we fetched (in case of class filter)
      const validRiskyStudentIds = studentDetails.map(d => d.id);
      const filteredRiskyStudents = riskyStudents.filter(r => validRiskyStudentIds.includes(r.studentId));

      const result = filteredRiskyStudents.map((item) => {
        const student = studentDetails.find((detail) => detail.id === item.studentId);
        const absentCount = item._count.status;
        return {
          ...student,
          studentName: student?.name || 'Bilinmeyen Öğrenci',
          absentCount,
          riskLevel: absentCount >= 6 ? 'High' : 'Medium',
        };
      });

      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Yeni: Deneme Sınavlarını Listele
  app.get('/api/attendance/exams', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    try {
      console.log('DEBUG: User info:', req.user);
      const instId = req.user.institutionId ? Number(req.user.institutionId) : null;
      console.log('DEBUG: Fetching exams for instId:', instId);
      
      const exams = await prisma.exam.findMany({
        where: instId ? { institutionId: instId } : {},
        select: { date: true, tytNet: true, aytNet: true },
      });
      console.log('DEBUG: Found exams count:', exams.length);

      // Benzersiz sınavları grupla (Tarih + Tür bazlı)
      const uniqueExams = [];
      const keys = new Set();

      exams.forEach(ex => {
        const type = ex.tytNet !== null ? 'TYT' : 'AYT';
        const key = `${ex.date}-${type}`;
        if (!keys.has(key)) {
          keys.add(key);
          uniqueExams.push({
            id: key,
            date: ex.date,
            type: type,
            name: `${new Date(ex.date).toLocaleDateString('tr-TR')} - ${type} Denemesi`
          });
        }
      });

      res.json(uniqueExams.sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (err) {
      sendError(res, err);
    }
  });

  // Yeni: Belirli bir sınav için tüm öğrencilerin katılım durumunu getir
  app.get('/api/attendance/exam-report', authMiddleware, requireRole('admin', 'teacher'), async (req, res) => {
    const { date, type } = req.query;
    try {
      const instId = req.user.institutionId ? Number(req.user.institutionId) : null;
      let studentWhere = instId ? { institutionId: instId } : {};
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
        studentWhere.class = { in: req.user.assignedClasses };
      }

      const students = await prisma.student.findMany({
        where: studentWhere,
        select: {
          id: true,
          name: true,
          class: true,
          parentName: true,
          parentPhone: true,
        },
      });

      const [year, month, day] = date.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      const examResults = await prisma.exam.findMany({
        where: {
          ...(instId ? { institutionId: instId } : {}),
          date: {
            gte: startOfDay,
            lte: endOfDay
          },
          [type === 'TYT' ? 'tytNet' : 'aytNet']: { not: null }
        }
      });

      const result = students.map(student => {
        const examRecord = examResults.find(er => er.studentId === student.id);
        return {
          ...student,
          status: examRecord ? 'girdi' : 'girmedi',
          net: examRecord ? (type === 'TYT' ? examRecord.tytNet : examRecord.aytNet) : null
        };
      });

      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });
}

module.exports = { registerAttendanceRoutes };
