function registerAssignedContentRoutes(app, deps) {
  const { prisma, authMiddleware, requireRole, studentScopeGuard } = deps;
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const resolveInstitutionId = (req, explicitInstitutionId) => {
    if (req.user.role === 'super_admin') {
      const parsed = Number(explicitInstitutionId);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return Number(req.user.institutionId);
  };

  const buildInstitutionWhere = (req) =>
    req.user.role === 'super_admin'
      ? {}
      : { institutionId: Number(req.user.institutionId) };

  const ensureContentAccess = async (req, contentId) => {
    const content = await prisma.assignedContent.findUnique({
      where: { id: contentId },
      select: { id: true, institutionId: true },
    });

    if (!content) {
      return { ok: false, status: 404, message: 'İçerik bulunamadı.' };
    }

    if (req.user.role === 'super_admin') {
      return { ok: true, content };
    }

    if (content.institutionId !== Number(req.user.institutionId)) {
      return { ok: false, status: 403, message: 'Bu içeriğe erişim yetkiniz yok.' };
    }

    return { ok: true, content };
  };

  const ensureAssignmentAccess = async (req, assignmentId) => {
    const assignment = await prisma.assignedContentAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, institutionId: true },
    });

    if (!assignment) {
      return { ok: false, status: 404, message: 'Atama bulunamadı.' };
    }

    if (req.user.role === 'super_admin') {
      return { ok: true, assignment };
    }

    if (assignment.institutionId !== Number(req.user.institutionId)) {
      return { ok: false, status: 403, message: 'Bu atamaya erişim yetkiniz yok.' };
    }

    return { ok: true, assignment };
  };

  const buildRecipientPayload = (recipient) => ({
    id: recipient.id,
    status: recipient.status,
    openedAt: recipient.openedAt,
    completedAt: recipient.completedAt,
    activeDurationSeconds: recipient.activeDurationSeconds,
    wallDurationSeconds: recipient.wallDurationSeconds,
    selectedAnswers: recipient.selectedAnswers,
    resultSummary: recipient.resultSummary,
    dueAt: recipient.assignment.dueAt,
    expectedDurationMinutes: recipient.assignment.expectedDurationMinutes,
    completionMode: recipient.assignment.completionMode,
    note: recipient.assignment.note || recipient.assignment.content.teacherNote || '',
    integrityLog: recipient.integrityLog || null,
    content: {
      id: recipient.assignment.content.id,
      title: recipient.assignment.content.title,
      description: recipient.assignment.content.description,
      type: recipient.assignment.content.contentType,
      course: recipient.assignment.content.course,
      examScope: recipient.assignment.content.examScope,
      totalPages: recipient.assignment.content.totalPages,
      requiresOptic: recipient.assignment.content.requiresOptic,
      fileName: recipient.assignment.content.fileName,
      sections: recipient.assignment.content.sections.map((section) => ({
        id: section.id,
        title: section.title,
        course: section.course,
        questionCount: section.questionCount,
        answerKey: section.answerKey,
        startPage: section.startPage,
        endPage: section.endPage,
      })),
    },
  });

  const normalizeSections = (sections, title, totalPages) =>
    Array.isArray(sections) && sections.length > 0
      ? sections
          .map((section, index) => ({
            title: String(section.title || `Parça ${index + 1}`),
            course: section.course ? String(section.course) : null,
            questionCount:
              section.questionCount !== undefined && section.questionCount !== null
                ? Math.max(0, Number(section.questionCount) || 0)
                : null,
            answerKey: Array.isArray(section.answerKey)
              ? section.answerKey.map((answer) => {
                  const value = String(answer || '').trim().toUpperCase();
                  return ['A', 'B', 'C', 'D', 'E'].includes(value) ? value : null;
                })
              : null,
            startPage: Math.max(1, Number(section.startPage) || 1),
            endPage: Math.max(1, Number(section.endPage) || Number(section.startPage) || 1),
            orderIndex: index,
          }))
          .filter((section) => section.endPage >= section.startPage)
      : [
          {
            title: title,
            course: null,
            questionCount: null,
            answerKey: null,
            startPage: 1,
            endPage: Math.max(1, Number(totalPages) || 1),
            orderIndex: 0,
          },
        ];

  const resolveTargetStudents = async ({
    prismaClient,
    req,
    institutionId,
    targetType,
    targetValue,
  }) => {
    if (!targetType) {
      return { ok: false, status: 400, message: 'Hedef tipi zorunludur.' };
    }

    let students = [];
    if (targetType === 'all') {
      students = await prismaClient.student.findMany({
        where: { institutionId },
        select: { id: true },
      });
    } else if (targetType === 'class') {
      if (!targetValue) {
        return { ok: false, status: 400, message: 'Sınıf ataması için hedef değeri zorunludur.' };
      }
      students = await prismaClient.student.findMany({
        where: { institutionId, class: String(targetValue) },
        select: { id: true },
      });
    } else if (targetType === 'student') {
      const studentId = Number(targetValue);
      if (Number.isNaN(studentId)) {
        return { ok: false, status: 400, message: 'Öğrenci ataması için geçerli öğrenci ID gereklidir.' };
      }
      const student = await prismaClient.student.findFirst({
        where: { id: studentId, institutionId },
        select: { id: true },
      });
      if (!student) {
        return { ok: false, status: 404, message: 'Atanacak öğrenci bulunamadı.' };
      }
      students = [student];
    } else {
      return { ok: false, status: 400, message: 'Desteklenmeyen hedef tipi.' };
    }

    if (students.length === 0) {
      return { ok: false, status: 400, message: 'Seçilen hedef için öğrenci bulunamadı.' };
    }

    return { ok: true, students };
  };

  // ───── Gemini Vision: Cevap Anahtarı Otomatik Tanıma ─────
  app.post(
    '/api/assigned-contents/parse-answer-key',
    authMiddleware,
    requireRole('admin', 'teacher', 'super_admin'),
    async (req, res) => {
      try {
        const { imageBase64, mimeType, sections } = req.body;

        if (!imageBase64) {
          return res.status(400).json({ error: 'Görsel verisi (imageBase64) zorunludur.' });
        }

        const sectionsInfo = Array.isArray(sections) && sections.length > 0
          ? sections.map((s, i) => {
            const title = s.title || `Bölüm ${i + 1}`;
            const course = s.course ? `Ders: ${s.course}` : null;
            const blockLabel = s.blockLabel ? `Blok: ${s.blockLabel}` : null;
            const questionCount = `${s.questionCount || '?'} soru`;
            return `Bölüm ${i + 1}: "${title}" — ${[course, blockLabel, questionCount].filter(Boolean).join(' — ')}`;
          }).join('\n')
          : 'Tek bölüm, soru sayısı bilinmiyor.';

        const prompt = `Bu görsel bir cevap anahtarı içeriyor. Görselden soru numaralarını ve doğru cevap şıklarını (A, B, C, D veya E) çıkar.

Bölüm bilgisi:
${sectionsInfo}

Kurallar:
- Verilen bölüm bilgisindeki ders, blok ve soru sayısına sıkı şekilde uy.
- Aynı sayfada birden fazla ders veya deneme varsa yalnızca eşleşen bloğu oku.
- Beklenen soru sayısından fazla cevap döndürme.
- Her sorunun cevabını sırasıyla ver.
- Cevaplar yalnızca A, B, C, D veya E olabilir.
- Eğer bir cevap okunamıyorsa null yaz.
- Birden fazla bölüm varsa her bölümü ayrı döndür.
- Yanıtını YALNIZCA geçerli JSON olarak ver, başka metin ekleme.

JSON formatı:
{
  "sections": [
    {
      "title": "Bölüm adı",
      "answers": ["A", "B", "C", "D", ...]
    }
  ]
}`;

        const cleanedBase64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
        const resolvedMime = mimeType || 'image/jpeg';

        const response = await ai.models.generateContent({
          model: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    data: cleanedBase64,
                    mimeType: resolvedMime,
                  },
                },
              ],
            },
          ],
        });

        const rawText = String(response?.text || '').trim();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return res.status(422).json({ error: 'Gemini yanıtından JSON ayrıştırılamadı.', raw: rawText });
        }

        const parsed = JSON.parse(jsonMatch[0]);

        if (!parsed.sections || !Array.isArray(parsed.sections)) {
          return res.status(422).json({ error: 'Gemini yanıtında "sections" bulunamadı.', raw: rawText });
        }

        // Cevapları normalize et
        const validChoices = new Set(['A', 'B', 'C', 'D', 'E']);
        for (const section of parsed.sections) {
          section.answers = (section.answers || []).map((answer) => {
            const normalized = String(answer || '').trim().toUpperCase();
            return validChoices.has(normalized) ? normalized : null;
          });
        }

        res.json(parsed);
      } catch (err) {
        console.error('ANSWER_KEY_PARSE_ERROR:', err);
        res.status(500).json({ error: 'İçerik işleme sırasında bir hata oluştu.' });
      }
    },
  );

  app.get(
    '/api/assigned-contents',
    authMiddleware,
    requireRole('admin', 'teacher', 'super_admin'),
    async (req, res) => {
      try {
        const contents = await prisma.assignedContent.findMany({
          where: buildInstitutionWhere(req),
          include: {
            sections: { orderBy: { orderIndex: 'asc' } },
            assignments: {
              include: { recipients: true },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        res.json(
          contents.map((content) => ({
            id: content.id,
            title: content.title,
            description: content.description,
            contentType: content.contentType,
            course: content.course,
            examScope: content.examScope,
            teacherNote: content.teacherNote,
            expectedDurationMinutes: content.expectedDurationMinutes,
            totalPages: content.totalPages,
            requiresOptic: content.requiresOptic,
            fileName: content.fileName,
            fileMimeType: content.fileMimeType,
            fileSizeBytes: content.fileSizeBytes,
            createdAt: content.createdAt,
            sections: content.sections,
            assignmentCount: content.assignments.length,
            recipientCount: content.assignments.reduce(
              (sum, assignment) => sum + assignment.recipients.length,
              0,
            ),
          })),
        );
      } catch (err) {
        console.error('ASSIGNED_CONTENT_LIST_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.get(
    '/api/assigned-content-assignments',
    authMiddleware,
    requireRole('admin', 'teacher', 'super_admin'),
    async (req, res) => {
      try {
        const assignments = await prisma.assignedContentAssignment.findMany({
          where: buildInstitutionWhere(req),
          include: {
            content: {
              include: {
                sections: { orderBy: { orderIndex: 'asc' } },
              },
            },
            recipients: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        res.json(
          assignments.map((assignment) => ({
            id: assignment.id,
            contentId: assignment.contentId,
            targetType: assignment.targetType,
            targetValue: assignment.targetValue,
            dueAt: assignment.dueAt,
            expectedDurationMinutes: assignment.expectedDurationMinutes,
            completionMode: assignment.completionMode,
            note: assignment.note,
            createdAt: assignment.createdAt,
            recipientCount: assignment.recipients.length,
            content: {
              id: assignment.content.id,
              title: assignment.content.title,
              contentType: assignment.content.contentType,
              course: assignment.content.course,
              examScope: assignment.content.examScope,
              sections: assignment.content.sections.map((section) => ({
                id: section.id,
                title: section.title,
                course: section.course,
                questionCount: section.questionCount,
                answerKey: section.answerKey,
                startPage: section.startPage,
                endPage: section.endPage,
              })),
            },
          })),
        );
      } catch (err) {
        console.error('ASSIGNED_CONTENT_ASSIGNMENT_LIST_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.post(
    '/api/assigned-contents/send',
    authMiddleware,
    requireRole('admin', 'teacher', 'super_admin'),
    async (req, res) => {
      try {
        const {
          institutionId: explicitInstitutionId,
          title,
          description,
          contentType,
          course,
          examScope,
          teacherNote,
          expectedDurationMinutes,
          totalPages,
          requiresOptic,
          fileName,
          fileMimeType,
          fileBase64,
          fileSizeBytes,
          sections,
          targetType,
          targetValue,
          dueAt,
          completionMode,
          note,
        } = req.body;

        if (!title || !contentType || !fileName || !fileBase64) {
          return res.status(400).json({ error: 'Başlık, içerik tipi ve PDF verisi zorunludur.' });
        }

        if (!dueAt) {
          return res.status(400).json({ error: 'Teslim tarihi zorunludur.' });
        }

        const institutionId = resolveInstitutionId(req, explicitInstitutionId);
        if (!institutionId) {
          return res.status(400).json({ error: 'İçerik için kurum bilgisi zorunludur.' });
        }

        const normalizedSections = normalizeSections(sections, title, totalPages);

        const result = await prisma.$transaction(async (tx) => {
          const target = await resolveTargetStudents({
            prismaClient: tx,
            req,
            institutionId,
            targetType,
            targetValue,
          });

          if (!target.ok) {
            const error = new Error(target.message);
            error.status = target.status;
            throw error;
          }

          const createdContent = await tx.assignedContent.create({
            data: {
              institutionId,
              title: String(title),
              description: description ? String(description) : null,
              contentType: String(contentType),
              course: course ? String(course) : null,
              examScope: examScope ? String(examScope) : null,
              teacherNote: teacherNote ? String(teacherNote) : null,
              expectedDurationMinutes: Math.max(1, Number(expectedDurationMinutes) || 90),
              totalPages: Math.max(1, Number(totalPages) || normalizedSections[normalizedSections.length - 1].endPage),
              requiresOptic: Boolean(requiresOptic),
              fileName: String(fileName),
              fileMimeType: fileMimeType ? String(fileMimeType) : 'application/pdf',
              fileSizeBytes: fileSizeBytes ? Number(fileSizeBytes) : null,
              fileData: Buffer.from(String(fileBase64), 'base64'),
              createdByUserId: req.user.id ? Number(req.user.id) : null,
              sections: {
                create: normalizedSections,
              },
            },
            include: {
              sections: { orderBy: { orderIndex: 'asc' } },
            },
          });

          const assignment = await tx.assignedContentAssignment.create({
            data: {
              contentId: createdContent.id,
              institutionId,
              targetType: String(targetType),
              targetValue: targetValue !== undefined && targetValue !== null ? String(targetValue) : null,
              dueAt: new Date(dueAt),
              expectedDurationMinutes: Math.max(1, Number(expectedDurationMinutes) || 90),
              completionMode: completionMode ? String(completionMode) : 'virtual_optic',
              note: note ? String(note) : null,
              assignedByUserId: req.user.id ? Number(req.user.id) : null,
              recipients: {
                create: target.students.map((student) => ({
                  studentId: student.id,
                })),
              },
            },
            include: {
              recipients: true,
            },
          });

          return {
            content: createdContent,
            assignmentId: assignment.id,
            recipientCount: assignment.recipients.length,
          };
        });

        res.status(201).json({
          success: true,
          content: result.content,
          assignmentId: result.assignmentId,
          recipientCount: result.recipientCount,
        });
      } catch (err) {
        console.error('ASSIGNED_CONTENT_SEND_ERROR:', err);
        res.status(err.status || 500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.post(
    '/api/assigned-contents',
    authMiddleware,
    requireRole('admin', 'teacher', 'super_admin'),
    async (req, res) => {
      try {
        const {
          institutionId: explicitInstitutionId,
          title,
          description,
          contentType,
          course,
          examScope,
          teacherNote,
          expectedDurationMinutes,
          totalPages,
          requiresOptic,
          fileName,
          fileMimeType,
          fileBase64,
          fileSizeBytes,
          sections,
        } = req.body;

        if (!title || !contentType || !fileName || !fileBase64) {
          return res.status(400).json({ error: 'Başlık, içerik tipi ve PDF verisi zorunludur.' });
        }

        const institutionId = resolveInstitutionId(req, explicitInstitutionId);
        if (!institutionId) {
          return res.status(400).json({ error: 'İçerik için kurum bilgisi zorunludur.' });
        }

        const normalizedSections = normalizeSections(sections, title, totalPages);

        const created = await prisma.assignedContent.create({
          data: {
            institutionId,
            title: String(title),
            description: description ? String(description) : null,
            contentType: String(contentType),
            course: course ? String(course) : null,
            examScope: examScope ? String(examScope) : null,
            teacherNote: teacherNote ? String(teacherNote) : null,
            expectedDurationMinutes: Math.max(1, Number(expectedDurationMinutes) || 90),
            totalPages: Math.max(1, Number(totalPages) || normalizedSections[normalizedSections.length - 1].endPage),
            requiresOptic: Boolean(requiresOptic),
            fileName: String(fileName),
            fileMimeType: fileMimeType ? String(fileMimeType) : 'application/pdf',
            fileSizeBytes: fileSizeBytes ? Number(fileSizeBytes) : null,
            fileData: Buffer.from(String(fileBase64), 'base64'),
            createdByUserId: req.user.id ? Number(req.user.id) : null,
            sections: {
              create: normalizedSections,
            },
          },
          include: {
            sections: { orderBy: { orderIndex: 'asc' } },
          },
        });

        res.status(201).json(created);
      } catch (err) {
        console.error('ASSIGNED_CONTENT_CREATE_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.put(
    '/api/assigned-contents/:id',
    authMiddleware,
    requireRole('admin', 'teacher', 'super_admin'),
    async (req, res) => {
      try {
        const contentId = parseInt(req.params.id, 10);
        const access = await ensureContentAccess(req, contentId);
        if (!access.ok) {
          return res.status(access.status).json({ error: access.message });
        }

        const {
          title,
          description,
          contentType,
          course,
          examScope,
          teacherNote,
          expectedDurationMinutes,
          totalPages,
          requiresOptic,
          fileName,
          fileMimeType,
          fileBase64,
          fileSizeBytes,
          sections,
        } = req.body;

        if (!title || !contentType) {
          return res.status(400).json({ error: 'Başlık ve içerik tipi zorunludur.' });
        }

        const normalizedSections = normalizeSections(sections, title, totalPages);

        const updated = await prisma.assignedContent.update({
          where: { id: contentId },
          data: {
            title: String(title),
            description: description ? String(description) : null,
            contentType: String(contentType),
            course: course ? String(course) : null,
            examScope: examScope ? String(examScope) : null,
            teacherNote: teacherNote ? String(teacherNote) : null,
            expectedDurationMinutes: Math.max(1, Number(expectedDurationMinutes) || 90),
            totalPages: Math.max(1, Number(totalPages) || normalizedSections[normalizedSections.length - 1].endPage),
            requiresOptic: Boolean(requiresOptic),
            ...(fileBase64
              ? {
                  fileName: fileName ? String(fileName) : `content-${contentId}.pdf`,
                  fileMimeType: fileMimeType ? String(fileMimeType) : 'application/pdf',
                  fileSizeBytes: fileSizeBytes ? Number(fileSizeBytes) : null,
                  fileData: Buffer.from(String(fileBase64), 'base64'),
                }
              : {}),
            sections: {
              deleteMany: {},
              create: normalizedSections,
            },
          },
          include: {
            sections: { orderBy: { orderIndex: 'asc' } },
          },
        });

        res.json(updated);
      } catch (err) {
        console.error('ASSIGNED_CONTENT_UPDATE_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.get(
    '/api/assigned-contents/:id/file',
    authMiddleware,
    requireRole('admin', 'teacher', 'super_admin'),
    async (req, res) => {
      try {
        const contentId = parseInt(req.params.id, 10);
        const access = await ensureContentAccess(req, contentId);
        if (!access.ok) {
          return res.status(access.status).json({ error: access.message });
        }

        const content = await prisma.assignedContent.findUnique({
          where: { id: contentId },
          select: { fileData: true, fileMimeType: true, fileName: true },
        });

        res.setHeader('Content-Type', content.fileMimeType || 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${content.fileName || `content-${contentId}.pdf`}"`,
        );
        res.send(Buffer.from(content.fileData));
      } catch (err) {
        console.error('ASSIGNED_CONTENT_FILE_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.delete(
    '/api/assigned-contents/:id',
    authMiddleware,
    requireRole('admin', 'teacher', 'super_admin'),
    async (req, res) => {
      try {
        const contentId = parseInt(req.params.id, 10);
        const access = await ensureContentAccess(req, contentId);
        if (!access.ok) {
          return res.status(access.status).json({ error: access.message });
        }

        await prisma.assignedContent.delete({ where: { id: contentId } });
        res.json({ success: true });
      } catch (err) {
        console.error('ASSIGNED_CONTENT_DELETE_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.post(
    '/api/assigned-contents/:id/assign',
    authMiddleware,
    requireRole('admin', 'teacher', 'super_admin'),
    async (req, res) => {
      try {
        const contentId = parseInt(req.params.id, 10);
        const access = await ensureContentAccess(req, contentId);
        if (!access.ok) {
          return res.status(access.status).json({ error: access.message });
        }

        const {
          targetType,
          targetValue,
          dueAt,
          expectedDurationMinutes,
          completionMode,
          note,
        } = req.body;

        if (!targetType || !dueAt) {
          return res.status(400).json({ error: 'Hedef tipi ve teslim tarihi zorunludur.' });
        }

        const target = await resolveTargetStudents({
          prismaClient: prisma,
          req,
          institutionId: access.content.institutionId,
          targetType,
          targetValue,
        });
        if (!target.ok) {
          return res.status(target.status).json({ error: target.message });
        }

        const assignment = await prisma.assignedContentAssignment.create({
          data: {
            contentId,
            institutionId: access.content.institutionId,
            targetType: String(targetType),
            targetValue: targetValue !== undefined && targetValue !== null ? String(targetValue) : null,
            dueAt: new Date(dueAt),
            expectedDurationMinutes: Math.max(1, Number(expectedDurationMinutes) || 90),
            completionMode: completionMode ? String(completionMode) : 'virtual_optic',
            note: note ? String(note) : null,
            assignedByUserId: req.user.id ? Number(req.user.id) : null,
            recipients: {
              create: target.students.map((student) => ({
                studentId: student.id,
              })),
            },
          },
          include: {
            recipients: true,
          },
        });

        res.status(201).json({
          success: true,
          assignmentId: assignment.id,
          recipientCount: assignment.recipients.length,
        });
      } catch (err) {
        console.error('ASSIGNED_CONTENT_ASSIGN_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.delete(
    '/api/assigned-content-assignments/:id',
    authMiddleware,
    requireRole('admin', 'teacher', 'super_admin'),
    async (req, res) => {
      try {
        const assignmentId = parseInt(req.params.id, 10);
        const access = await ensureAssignmentAccess(req, assignmentId);
        if (!access.ok) {
          return res.status(access.status).json({ error: access.message });
        }

        await prisma.assignedContentAssignment.delete({ where: { id: assignmentId } });
        res.json({ success: true });
      } catch (err) {
        console.error('ASSIGNED_CONTENT_ASSIGNMENT_DELETE_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.get(
    '/api/students/:id/assigned-contents',
    authMiddleware,
    studentScopeGuard,
    async (req, res) => {
      try {
        const studentId = parseInt(req.params.id, 10);
        const recipients = await prisma.assignedContentRecipient.findMany({
          where: { studentId },
          include: {
            assignment: {
              include: {
                content: {
                  include: {
                    sections: {
                      orderBy: { orderIndex: 'asc' },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        res.json(recipients.map(buildRecipientPayload));
      } catch (err) {
        console.error('ASSIGNED_CONTENT_STUDENT_FEED_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.get(
    '/api/students/:id/assigned-contents/:recipientId/file',
    authMiddleware,
    studentScopeGuard,
    async (req, res) => {
      try {
        const studentId = parseInt(req.params.id, 10);
        const recipientId = parseInt(req.params.recipientId, 10);
        const recipient = await prisma.assignedContentRecipient.findFirst({
          where: { id: recipientId, studentId },
          include: {
            assignment: {
              include: {
                content: {
                  select: { fileData: true, fileMimeType: true, fileName: true },
                },
              },
            },
          },
        });

        if (!recipient) {
          return res.status(404).json({ error: 'Atanmış içerik bulunamadı.' });
        }

        res.setHeader(
          'Content-Type',
          recipient.assignment.content.fileMimeType || 'application/pdf',
        );
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${recipient.assignment.content.fileName}"`,
        );
        res.send(Buffer.from(recipient.assignment.content.fileData));
      } catch (err) {
        console.error('ASSIGNED_CONTENT_STUDENT_FILE_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );

  app.post(
    '/api/students/:id/assigned-contents/:recipientId/progress',
    authMiddleware,
    studentScopeGuard,
    async (req, res) => {
      try {
        const studentId = parseInt(req.params.id, 10);
        const recipientId = parseInt(req.params.recipientId, 10);
        const {
          status,
          openedAt,
          completedAt,
          activeDurationSeconds,
          wallDurationSeconds,
          selectedAnswers,
          resultSummary,
        } =
          req.body;

        const updated = await prisma.assignedContentRecipient.updateMany({
          where: { id: recipientId, studentId },
          data: {
            status: status ? String(status) : undefined,
            openedAt: openedAt ? new Date(openedAt) : undefined,
            completedAt: completedAt ? new Date(completedAt) : undefined,
            activeDurationSeconds:
              activeDurationSeconds !== undefined
                ? Math.max(0, Number(activeDurationSeconds) || 0)
                : undefined,
            wallDurationSeconds:
              wallDurationSeconds !== undefined
                ? Math.max(0, Number(wallDurationSeconds) || 0)
                : undefined,
            selectedAnswers:
              selectedAnswers && typeof selectedAnswers === 'object'
                ? selectedAnswers
                : undefined,
            resultSummary:
              resultSummary && typeof resultSummary === 'object'
                ? resultSummary
                : undefined,
            integrityLog:
              req.body.integrityLog && typeof req.body.integrityLog === 'object'
                ? req.body.integrityLog
                : undefined,
          },
        });

        if (updated.count === 0) {
          return res.status(404).json({ error: 'Güncellenecek atanmış içerik bulunamadı.' });
        }

        res.json({ success: true });
      } catch (err) {
        console.error('ASSIGNED_CONTENT_PROGRESS_ERROR:', err);
        res.status(500).json({ error: "Sunucu hatası oluştu." });
      }
    },
  );
}

module.exports = { registerAssignedContentRoutes };
