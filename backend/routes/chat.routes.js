const CHAT_MESSAGE_META_PREFIX = '__CHAT_MESSAGE_META__';

function encodeChatMessageContent(message) {
  const payload = {
    text: message?.text || '',
    imageUri: message?.imageUri || null,
    originalQuestionText: message?.originalQuestionText || null,
    originalQuestionImage: message?.originalQuestionImage || null,
    course: message?.course || null,
    isEducational: message?.isEducational === true,
    timestamp: message?.timestamp || null,
  };

  return `${CHAT_MESSAGE_META_PREFIX}${JSON.stringify(payload)}`;
}

function decodeChatMessageContent(rawContent) {
  const content = String(rawContent || '');
  if (!content.startsWith(CHAT_MESSAGE_META_PREFIX)) {
    return { text: content };
  }

  try {
    return JSON.parse(content.slice(CHAT_MESSAGE_META_PREFIX.length));
  } catch (_) {
    return { text: content.slice(CHAT_MESSAGE_META_PREFIX.length) };
  }
}

function mapChatSessionForClient(session) {
  return {
    id: session.id,
    title: session.title || '',
    course: session.course || '',
    mode: session.mode || 'question',
    lastActivity: session.lastActivity,
    messages: (session.messages || []).map((message) => {
      const decoded = decodeChatMessageContent(message.content);
      return {
        id: String(message.id),
        text: decoded.text || '',
        sender: message.role === 'assistant' ? 'assistant' : 'user',
        timestamp:
          decoded.timestamp ||
          (message.createdAt ? message.createdAt.toISOString() : new Date().toISOString()),
        imageUri: decoded.imageUri || null,
        originalQuestionText: decoded.originalQuestionText || null,
        originalQuestionImage: decoded.originalQuestionImage || null,
        course: decoded.course || null,
        isEducational: decoded.isEducational === true,
      };
    }),
  };
}

function buildChatMessageRows(sessionId, messages) {
  const fallbackBaseTime = Date.now();

  return messages.map((message, index) => {
    const parsedTimestamp =
      typeof message?.timestamp === 'string' ? Date.parse(message.timestamp) : NaN;
    const createdAt = Number.isFinite(parsedTimestamp)
      ? new Date(parsedTimestamp)
      : new Date(fallbackBaseTime + index);

    return {
      sessionId: String(sessionId),
      role: message?.sender === 'assistant' ? 'assistant' : 'user',
      content: encodeChatMessageContent(message),
      createdAt,
    };
  });
}

function registerChatRoutes(app, deps) {
  const {
    prisma,
    authMiddleware,
    studentScopeGuard,
    ensureStudentScope,
  } = deps;

  app.get('/api/students/:id/chat-sessions', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { course, mode } = req.query;

    try {
      const studentId = parseInt(id, 10);
      const sessions = await prisma.chatSession.findMany({
        where: {
          studentId,
          ...(course ? { course: String(course) } : {}),
          ...(mode ? { mode: String(mode) } : {}),
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { lastActivity: 'desc' },
      });

      res.json(sessions.map(mapChatSessionForClient));
    } catch (err) {
      console.error('Chat list error:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/chat-sessions', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { session } = req.body || {};
    if (!session || !session.id) {
      return res.status(400).json({ error: 'Session data is required.' });
    }

    try {
      const studentId = parseInt(id, 10);
      const existing = await prisma.chatSession.findUnique({
        where: { id: String(session.id) },
        select: { studentId: true },
      });

      if (existing && existing.studentId !== studentId) {
        return res.status(403).json({ error: 'Bu oturum başka bir öğrenciye ait.' });
      }

      // SADECE sohbet ve mesajları transaction içine alıyoruz.
      await prisma.$transaction(async (tx) => {
        await tx.chatSession.upsert({
          where: { id: String(session.id) },
          update: {
            title: session.title || '',
            course: session.course || '',
            mode: session.mode || 'question',
            lastActivity: session.lastActivity
              ? new Date(session.lastActivity)
              : new Date(),
          },
          create: {
            id: String(session.id),
            studentId,
            title: session.title || '',
            course: session.course || '',
            mode: session.mode || 'question',
            lastActivity: session.lastActivity
              ? new Date(session.lastActivity)
              : new Date(),
          },
        });

        await tx.chatMessage.deleteMany({
          where: { sessionId: String(session.id) },
        });

        if (Array.isArray(session.messages) && session.messages.length > 0) {
          await tx.chatMessage.createMany({
            data: buildChatMessageRows(session.id, session.messages),
          });
        }
      });

      // Öğrenci son aktivite saatini transaction DIŞINDA güncelliyoruz (Deadlock'u engeller)
      await prisma.student.update({
        where: { id: studentId },
        data: { lastActiveAt: new Date() },
      }).catch(err => console.error("Öğrenci lastActiveAt güncellenirken hata (önemsiz):", err));

      const saved = await prisma.chatSession.findUnique({
        where: { id: String(session.id) },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      res.json({
        success: true,
        session: saved ? mapChatSessionForClient(saved) : null,
      });
    } catch (err) {
      console.error('Chat save error:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.delete('/api/students/:id/chat-sessions/:sessionId', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id, sessionId } = req.params;

    try {
      const studentId = parseInt(id, 10);
      const existing = await prisma.chatSession.findUnique({
        where: { id: String(sessionId) },
        select: { studentId: true },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Oturum bulunamadı.' });
      }

      if (existing.studentId !== studentId) {
        return res.status(403).json({ error: 'Bu oturumu silme yetkiniz yok.' });
      }

      await prisma.chatSession.delete({
        where: { id: String(sessionId) },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('Chat delete error:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/students/:id/chat-sessions/sync', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const { sessions } = req.body;

    try {
      const studentId = parseInt(id, 10);
      
      // PARALEL (Promise.all) yerine SIRALI (for...of) döngü kullanarak 
      // veritabanı "Max Connection" hatalarını önlüyoruz.
      for (const session of sessions) {
        const existing = await prisma.chatSession.findUnique({
          where: { id: session.id },
          select: { studentId: true },
        });
        if (existing && existing.studentId !== studentId) {
          throw new Error(`Session ownership mismatch: ${session.id}`);
        }

        // Senkronizasyon için ayrı bir transaction
        await prisma.$transaction(async (tx) => {
          await tx.chatSession.upsert({
            where: { id: session.id },
            update: {
              title: session.title,
              course: session.course,
              mode: session.mode,
              lastActivity: new Date(session.lastActivity),
            },
            create: {
              id: session.id,
              studentId,
              title: session.title,
              course: session.course,
              mode: session.mode,
              lastActivity: new Date(session.lastActivity),
            },
          });

          await tx.chatMessage.deleteMany({
            where: { sessionId: session.id },
          });

          if (session.messages && session.messages.length > 0) {
            await tx.chatMessage.createMany({
              data: buildChatMessageRows(session.id, session.messages),
            });
          }
        });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Chat sync error: ', err);
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/chat/sessions', authMiddleware, async (req, res) => {
    const { studentId, topic, course } = req.body;
    try {
      const sid = parseInt(studentId, 10);
      const access = await ensureStudentScope(req, sid);
      if (!access.ok) {
        return res.status(access.status).json({ error: access.message });
      }

      const session = await prisma.chatSession.create({
        data: { studentId: sid, topic, course },
      });
      res.json(session);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });

  app.post('/api/chat/messages', authMiddleware, async (req, res) => {
    const { sessionId, role, content } = req.body;
    try {
      const session = await prisma.chatSession.findUnique({
        where: { id: String(sessionId) },
        select: { studentId: true },
      });
      if (!session) {
        return res.status(404).json({ error: 'Oturum bulunamadı.' });
      }

      const access = await ensureStudentScope(req, session.studentId);
      if (!access.ok) {
        return res.status(access.status).json({ error: access.message });
      }

      const [message] = await prisma.$transaction([
        prisma.chatMessage.create({
          data: { sessionId, role, content },
        }),
        prisma.chatSession.update({
          where: { id: sessionId },
          data: { lastActivity: new Date() },
        }),
        prisma.chatSession.findUnique({ where: { id: sessionId } }).then((saved) => {
          if (saved) {
            return prisma.student.update({
              where: { id: saved.studentId },
              data: { lastActiveAt: new Date() },
            });
          }
          return null;
        }),
      ]);
      res.json(message);
    } catch (err) {
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });
}

async function performAutoAnalysis(prisma) {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const expiredSessions = await prisma.chatSession.findMany({
    where: {
      lastActivity: { lt: twoHoursAgo },
      isAnalyzed: false,
    },
    include: { messages: true },
  });

  for (const session of expiredSessions) {
    if (session.messages.length === 0) continue;

    console.log(`[ANALYSIS] Analizing session: ${session.id}`);
    const analysisSummary =
      'Öğrenci konuyu temel düzeyde anladı ancak X noktasında yardıma ihtiyacı var.';

    await prisma.$transaction([
      prisma.sessionAnalysis.create({
        data: {
          sessionId: session.id,
          summary: analysisSummary,
          understanding: 85,
          stressLevel: 20,
          keyTakeaways: 'Konu pekiştirilmeli.',
        },
      }),
      prisma.chatSession.update({
        where: { id: session.id },
        data: { isAnalyzed: true },
      }),
      prisma.chatMessage.deleteMany({
        where: { sessionId: session.id },
      }),
    ]);

    console.log(
      `[ANALYSIS DONE] Session rewarded with summary. Messages deleted.`,
    );
  }
}

function startChatAutoAnalysis(prisma) {
  return setInterval(() => {
    performAutoAnalysis(prisma).catch((error) => {
      console.error('CHAT_AUTO_ANALYSIS_ERROR:', error);
    });
  }, 15 * 60 * 1000);
}

module.exports = {
  registerChatRoutes,
  startChatAutoAnalysis,
  mapChatSessionForClient,
  buildChatMessageRows,
};
