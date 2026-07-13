const fs = require('fs');
const path = require('path');
const { buildAiUsageEvent } = require('../utils/aiUsage');

const SIMILARITY_THRESHOLD = 0.96;
const TELEMETRY_DIR = path.join(__dirname, '..', 'reports', 'ai-telemetry');
const TELEMETRY_FILE = path.join(TELEMETRY_DIR, 'ai-telemetry.ndjson');
const ESTIMATED_TEXT_REQUEST_COST_USD = 0.00068;
const ESTIMATED_IMAGE_EXTRA_COST_USD = 0.00028;

function ensureTelemetryDir() {
  fs.mkdirSync(TELEMETRY_DIR, { recursive: true });
}

function estimateRequestCostUsd({ isImage = false } = {}) {
  return ESTIMATED_TEXT_REQUEST_COST_USD + (isImage ? ESTIMATED_IMAGE_EXTRA_COST_USD : 0);
}

function buildV3DiagnosticSnapshot(result) {
  if (!result || typeof result !== 'object') return null;
  const toolNames = Array.isArray(result.toolEvents)
    ? [...new Set(result.toolEvents.map((item) => item?.action || item?.name).filter(Boolean))]
    : [];

  return {
    scenario: result.mathFlow?.scenario || null,
    promptVariant: result.mathFlow?.promptVariant || null,
    toolVariant: result.mathFlow?.toolVariant || null,
    fallbackReason: result.mathFlow?.fallbackReason || null,
    perceptionSource: result.mathFlow?.perceptionSource || null,
    deterministic: Boolean(result.mathFlow?.deterministic),
    tools: toolNames,
    teacherText: Boolean(result.teacherText),
  };
}

function stringifyV3Diagnostics(result) {
  const snapshot = buildV3DiagnosticSnapshot(result);
  if (!snapshot) return null;
  return JSON.stringify(snapshot).slice(0, 1000);
}

async function writeTelemetry(prisma, payload) {
  let event = buildAiUsageEvent(payload, payload.resultOrUsage || payload.usageMetadata || payload);
  event = {
    ...event,
    ...payload,
    resultOrUsage: undefined,
    usageMetadata: undefined,
    createdAt: new Date().toISOString(),
  };

  if (!event.institutionId && event.userRole === 'student' && event.userId) {
    try {
      const student = await prisma.student.findUnique({
        where: { id: Number(event.userId) },
        select: { institutionId: true },
      });
      event.institutionId = student?.institutionId ?? null;
      event.studentId = event.studentId ?? Number(event.userId);
    } catch (_error) {
      event.studentId = event.studentId ?? Number(event.userId);
    }
  }

  let writtenToDb = false;
  try {
    if (prisma?.aiTelemetryEvent?.create) {
      await prisma.aiTelemetryEvent.create({
        data: {
          institutionId: event.institutionId ?? null,
          studentId: event.studentId ?? null,
          userId: event.userId ?? null,
          userRole: event.userRole ?? null,
          actorType: event.actorType ?? null,
          surface: event.surface ?? null,
          feature: event.feature ?? null,
          requestGroupId: event.requestGroupId ?? null,
          eventType: event.eventType,
          status: event.status ?? null,
          course: event.course ?? null,
          provider: event.provider ?? null,
          model: event.model ?? null,
          promptTokens: Number.isFinite(event.promptTokens) ? event.promptTokens : null,
          completionTokens: Number.isFinite(event.completionTokens) ? event.completionTokens : null,
          reasoningTokens: Number.isFinite(event.reasoningTokens) ? event.reasoningTokens : null,
          totalTokens: Number.isFinite(event.totalTokens) ? event.totalTokens : null,
          inputCostUsd: typeof event.inputCostUsd === 'number' ? event.inputCostUsd : null,
          outputCostUsd: typeof event.outputCostUsd === 'number' ? event.outputCostUsd : null,
          totalCostUsd: typeof event.totalCostUsd === 'number' ? event.totalCostUsd : null,
          isImage: Boolean(event.isImage),
          usedOcr: Boolean(event.usedOcr),
          cacheHit:
            typeof event.cacheHit === 'boolean' ? event.cacheHit : null,
          cacheSource: event.cacheSource ?? null,
          cacheSimilarity:
            typeof event.cacheSimilarity === 'number'
              ? event.cacheSimilarity
              : null,
          retryRequested: Boolean(event.retryRequested),
          estimatedCostUsd:
            typeof event.estimatedCostUsd === 'number'
              ? event.estimatedCostUsd
              : null,
          estimatedSavedUsd:
            typeof event.estimatedSavedUsd === 'number'
              ? event.estimatedSavedUsd
              : null,
          notes: event.notes ?? null,
        },
      });
      writtenToDb = true;
    }
  } catch (error) {
    console.error('[AI TELEMETRY][DB FALLBACK]', error.message || error);
  }

  try {
    ensureTelemetryDir();
    fs.appendFileSync(TELEMETRY_FILE, `${JSON.stringify(event)}\n`);
  } catch (error) {
    if (!writtenToDb) {
      console.error('[AI TELEMETRY][FILE ERROR]', error.message || error);
    }
  }
}

function normalizeCacheVariant(value) {
  return String(value || '').trim().toLowerCase() === 'detailed'
    ? 'detailed'
    : 'short';
}

function getRequestedCacheVariant(interactionType) {
  return normalizeCacheVariant(
    String(interactionType || '').trim().toLowerCase() === 'detail_request'
      ? 'detailed'
      : 'short',
  );
}

function selectCachedAnswer(record, requestedVariant = 'short') {
  if (!record) return null;

  const shortAnswer = String(record.shortAnswer || '').trim();
  const detailedAnswer = String(record.detailedAnswer || '').trim();
  const legacyAnswer = String(record.answer || '').trim();

  if (requestedVariant === 'detailed') {
    return detailedAnswer || null;
  }

  return shortAnswer || legacyAnswer || detailedAnswer || null;
}

function buildCacheResponsePayload(record, requestedVariant, extra = {}) {
  const answer = selectCachedAnswer(record, requestedVariant);
  return {
    hit: Boolean(answer),
    answer: answer || undefined,
    answerVariant: answer
      ? requestedVariant === 'detailed'
        ? 'detailed'
        : record.shortAnswer
          ? 'short'
          : record.answer
            ? 'short'
            : 'detailed'
      : undefined,
    cacheRecordId: record?.id,
    ...extra,
  };
}

function buildCacheUpdateData({
  existing = null,
  cacheVariant = 'short',
  answer,
  embedding = [],
  course,
  traditionalHash,
  imageHash,
  semanticHash,
}) {
  const variant = normalizeCacheVariant(cacheVariant);
  const data = {
    course: course || existing?.course || 'Genel',
  };

  if (Array.isArray(embedding) && embedding.length > 0) {
    data.embedding = embedding;
  } else if (!existing) {
    data.embedding = [];
  }

  if (traditionalHash) data.traditionalHash = traditionalHash;
  if (imageHash) data.imageHash = imageHash;
  if (semanticHash) data.semanticHash = semanticHash;

  if (variant === 'detailed') {
    data.detailedAnswer = answer;
    data.answer =
      String(existing?.shortAnswer || existing?.answer || '').trim() || answer;
  } else {
    data.shortAnswer = answer;
    data.answer = answer;
  }

  return data;
}

function registerAiRoutes(app, deps) {
  const {
    prisma,
    aiService,
    authMiddleware,
    studentScopeGuard,
    extractCacheQueryText,
    shouldUseSemanticCache,
    shouldUseEmbeddingCache,
    buildComparableCacheText = (_course, text) => text,
  } = deps;

  app.post('/api/questions/cache/check', authMiddleware, async (req, res) => {
      const {
      course,
      questionText,
      base64Image,
      imageMimeType,
      ocrText,
      interactionType,
      hasRecentContext,
      requestGroupId,
    } = req.body;
    if (!course) return res.status(400).json({ hit: false });

    try {
      let queryText = questionText || '';
      queryText = extractCacheQueryText(queryText);
      const normalizedOcrText = extractCacheQueryText(ocrText || '');
      const lookupText = normalizedOcrText || queryText;
      if (base64Image && !lookupText) queryText = 'gorsel_icerik';
      else queryText = lookupText;
      const normalizedInteractionType = String(interactionType || '')
        .trim()
        .toLowerCase();
      const hasExplicitInteractionType = [
        'new_question',
        'follow_up',
        'retry',
        'detail_request',
      ].includes(normalizedInteractionType);
      const requestedVariant = getRequestedCacheVariant(normalizedInteractionType);
      const comparableText =
        queryText && queryText !== 'gorsel_icerik'
          ? buildComparableCacheText(course, queryText)
          : queryText;

      const legacyShortFollowUp =
        (!normalizedOcrText && Boolean(hasRecentContext) && queryText.length < 30) ||
        /^(neden|niçin|nasıl|yani|detay|açıkla|örnek|başka|peki)/i.test(
          queryText.trim(),
        ) ||
        queryText.includes('Lütfen yukarıdaki en son tartıştığımız soruyu');
      const isShortFollowUp = hasExplicitInteractionType
        ? normalizedInteractionType === 'follow_up' ||
        normalizedInteractionType === 'retry'
        : legacyShortFollowUp;

      if (isShortFollowUp) {
        console.log(
          '[CACHE BYPASS] Kademeli/Takip sorusu algılandı: Önbellek pas geçiliyor.',
        );
        return res.json({ hit: false });
      }

      let tHash = null;
      let iHash = null;
      let sHash = null;

      if (queryText && queryText !== 'gorsel_icerik') {
        tHash = aiService.generateTraditionalHash(course, queryText);
        if (tHash) {
          const exactMatch = await prisma.cachedQuestion.findUnique({
            where: { traditionalHash: tHash },
          });
          if (exactMatch) {
            const exactPayload = buildCacheResponsePayload(
              exactMatch,
              requestedVariant,
              {
                similarity: 1.0,
                cacheSource: 'traditional',
                traditionalHash: tHash,
              },
            );

            if (!exactPayload.hit) {
              return res.json(exactPayload);
            }

            await prisma.cachedQuestion.update({
              where: { id: exactMatch.id },
              data: { hitCount: { increment: 1 } },
            });
            await writeTelemetry(prisma, {
              institutionId: req.user?.institutionId ?? null,
              userId: req.user?.id ?? null,
              userRole: req.user?.role ?? null,
              eventType: 'cache_check',
              requestGroupId,
              status: 'hit',
              course,
              isImage: Boolean(base64Image),
              usedOcr: Boolean(normalizedOcrText),
              cacheHit: true,
              cacheSource: 'traditional',
              cacheSimilarity: 1.0,
              estimatedSavedUsd: estimateRequestCostUsd({
                isImage: Boolean(base64Image),
              }),
            });
            console.log('[CACHE HIT - TRADITIONAL] Maliyet: $0');
            return res.json(exactPayload);
          }
        }
      }

      if (base64Image) {
        iHash = await aiService.generateImageHash(base64Image);
        if (iHash) {
          const imageMatch = await prisma.cachedQuestion.findUnique({
            where: { imageHash: iHash },
          });
          if (imageMatch) {
            const imagePayload = buildCacheResponsePayload(
              imageMatch,
              requestedVariant,
              {
                similarity: 1.0,
                cacheSource: 'image',
                imageHash: iHash,
              },
            );

            if (!imagePayload.hit) {
              return res.json(imagePayload);
            }

            await prisma.cachedQuestion.update({
              where: { id: imageMatch.id },
              data: { hitCount: { increment: 1 } },
            });
            await writeTelemetry(prisma, {
              institutionId: req.user?.institutionId ?? null,
              userId: req.user?.id ?? null,
              userRole: req.user?.role ?? null,
              eventType: 'cache_check',
              requestGroupId,
              status: 'hit',
              course,
              isImage: Boolean(base64Image),
              usedOcr: Boolean(normalizedOcrText),
              cacheHit: true,
              cacheSource: 'image',
              cacheSimilarity: 1.0,
              estimatedSavedUsd: estimateRequestCostUsd({
                isImage: Boolean(base64Image),
              }),
            });
            console.log('[CACHE HIT - IMAGE pHash] Maliyet: $0');
            return res.json(imagePayload);
          }
        }
      }

      const semanticImageBlocker = normalizedOcrText ? null : base64Image;
      if (shouldUseSemanticCache(course, queryText, semanticImageBlocker)) {
        sHash = await aiService.generateSemanticHash(
          course,
          comparableText,
          normalizedOcrText ? null : base64Image,
          normalizedOcrText ? null : imageMimeType,
        );
        if (sHash) {
          const semanticMatch = await prisma.cachedQuestion.findUnique({
            where: { semanticHash: sHash },
          });
          if (semanticMatch) {
            const semanticPayload = buildCacheResponsePayload(
              semanticMatch,
              requestedVariant,
              {
                similarity: 0.99,
                cacheSource: 'semantic',
                semanticHash: sHash,
              },
            );

            if (!semanticPayload.hit) {
              return res.json(semanticPayload);
            }

            await prisma.cachedQuestion.update({
              where: { id: semanticMatch.id },
              data: { hitCount: { increment: 1 } },
            });
            await writeTelemetry(prisma, {
              institutionId: req.user?.institutionId ?? null,
              userId: req.user?.id ?? null,
              userRole: req.user?.role ?? null,
              eventType: 'cache_check',
              requestGroupId,
              status: 'hit',
              course,
              isImage: Boolean(base64Image),
              usedOcr: Boolean(normalizedOcrText),
              cacheHit: true,
              cacheSource: 'semantic',
              cacheSimilarity: 0.99,
              estimatedSavedUsd: estimateRequestCostUsd({
                isImage: Boolean(base64Image),
              }),
            });
            console.log('[CACHE HIT - SEMANTIC HASH] Maliyet: Düşük');
            return res.json(semanticPayload);
          }
        }
      }

      let queryEmbedding = null;
      const embeddingImageBlocker = normalizedOcrText ? null : base64Image;
      if (shouldUseEmbeddingCache(course, queryText, embeddingImageBlocker)) {
        queryEmbedding = await aiService.generateEmbedding(`${course}: ${comparableText}`);
        if (!queryEmbedding) {
          return res.json({
            hit: false,
            traditionalHash: tHash,
            imageHash: iHash,
            semanticHash: sHash,
          });
        }
      }

      if (queryEmbedding) {
        const allCached = await prisma.cachedQuestion.findMany({
          where: { course },
          select: {
            id: true,
            embedding: true,
            answer: true,
            shortAnswer: true,
            detailedAnswer: true,
            hitCount: true,
          },
        });

        let bestMatch = null;
        let bestScore = 0;

        for (const cached of allCached) {
          if (!cached.embedding || cached.embedding.length === 0) continue;
          const score = aiService.cosineSimilarity(queryEmbedding, cached.embedding);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = cached;
          }
        }

        if (bestMatch && bestScore >= SIMILARITY_THRESHOLD) {
          const embeddingPayload = buildCacheResponsePayload(
            bestMatch,
            requestedVariant,
            {
              similarity: bestScore,
              cacheSource: 'embedding',
            },
          );

          if (!embeddingPayload.hit) {
            return res.json({
              ...embeddingPayload,
              embedding: queryEmbedding,
              traditionalHash: tHash,
              imageHash: iHash,
              semanticHash: sHash,
            });
          }

          await prisma.cachedQuestion.update({
            where: { id: bestMatch.id },
            data: { hitCount: { increment: 1 } },
          });
          await writeTelemetry(prisma, {
            institutionId: req.user?.institutionId ?? null,
            userId: req.user?.id ?? null,
            userRole: req.user?.role ?? null,
            eventType: 'cache_check',
            requestGroupId,
            status: 'hit',
            course,
            isImage: Boolean(base64Image),
            usedOcr: Boolean(normalizedOcrText),
            cacheHit: true,
            cacheSource: 'embedding',
            cacheSimilarity: bestScore,
            estimatedSavedUsd: estimateRequestCostUsd({
              isImage: Boolean(base64Image),
            }),
          });
          console.log(
            `[CACHE HIT - EMBEDDING] Benzerlik: ${(bestScore * 100).toFixed(1)}%`,
          );
          return res.json(embeddingPayload);
        }
      }

      console.log('[CACHE MISS] Yeni Soru. Kaydedilecek...');
      await writeTelemetry(prisma, {
        institutionId: req.user?.institutionId ?? null,
        userId: req.user?.id ?? null,
        userRole: req.user?.role ?? null,
        eventType: 'cache_check',
        requestGroupId,
        status: 'miss',
        course,
        isImage: Boolean(base64Image),
        usedOcr: Boolean(normalizedOcrText),
        cacheHit: false,
      });
      return res.json({
        hit: false,
        embedding: queryEmbedding,
        traditionalHash: tHash,
        imageHash: iHash,
        semanticHash: sHash,
      });
    } catch (err) {
      console.error('Cache check error:', err);
      res.json({ hit: false });
    }
  });

  app.post('/api/ai/ask', authMiddleware, async (req, res) => {
    const { prompt, course, systemInstruction, history, base64Image, imageMimeType, feature } = req.body;

    if (!prompt && !base64Image) {
      return res
        .status(400)
        .json({ error: 'Eksik bilgi: prompt veya base64Image gerekli.' });
    }

    try {
      const result = await aiService.askAiWithMath(
        course,
        prompt,
        history || [],
        systemInstruction || '',
        base64Image,
        { 
          returnMetadata: true, 
          imageMimeType: imageMimeType || 'image/jpeg'
        },
      );
      const answer = result?.answerText || result;
      await writeTelemetry(prisma, {
        institutionId: req.user?.institutionId ?? null,
        studentId: req.user?.role === 'student' ? req.user?.id ?? null : null,
        userId: req.user?.id ?? null,
        userRole: req.user?.role ?? null,
        actorType: req.user?.role ?? null,
        surface: req.user?.role === 'student' ? 'mobile_app' : 'institution_panel',
        feature: feature || 'question_solve',
        requestGroupId: req.body.requestGroupId,
        eventType: 'ai_ask',
        status: 'success',
        course,
        isImage: Boolean(base64Image),
        usedOcr: false,
        resultOrUsage: result,
        notes: stringifyV3Diagnostics(result),
      });
      res.json({
        success: true,
        answer,
        teacherText: result?.teacherText || null,
        diagnostics: buildV3DiagnosticSnapshot(result),
        metadata: {
          tokens: result.mathFlow?.actualTokens || result.metadata?.tokens || null,
          model: result.metadata?.model || null
        }
      });

      // EĞER OCR (3.1 Lite) kullanılmışsa, onu ayrı bir log satırı olarak kaydet
      if (result.metadata?.tokens?.ocrTotal > 0) {
        await writeTelemetry(prisma, {
          institutionId: req.user?.institutionId ?? null,
          studentId: req.user?.role === 'student' ? req.user?.id ?? null : null,
          userId: req.user?.id ?? null,
          userRole: req.user?.role ?? null,
          actorType: req.user?.role ?? null,
          surface: req.user?.role === 'student' ? 'mobile_app' : 'institution_panel',
          feature: 'ocr_preprocessing',
          requestGroupId: req.body.requestGroupId,
          eventType: 'ai_ask',
          status: 'success',
          course,
          isImage: true,
          usedOcr: true,
          model: process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite-preview',
          resultOrUsage: {
            promptTokenCount: result.metadata.tokens.ocrPrompt,
            candidatesTokenCount: result.metadata.tokens.ocrCompletion,
            totalTokenCount: result.metadata.tokens.ocrTotal,
          },
        });
      }
    } catch (error) {
      console.error('AI Ask API Error:', error);
      await writeTelemetry(prisma, {
        institutionId: req.user?.institutionId ?? null,
        studentId: req.user?.role === 'student' ? req.user?.id ?? null : null,
        userId: req.user?.id ?? null,
        userRole: req.user?.role ?? null,
        actorType: req.user?.role ?? null,
        surface: req.user?.role === 'student' ? 'mobile_app' : 'institution_panel',
        feature: feature || 'question_solve',
        requestGroupId: req.body.requestGroupId,
        eventType: 'ai_ask',
        status: 'error',
        course,
        isImage: Boolean(base64Image),
        usedOcr: false,
      });
      res
        .status(500)
        .json({ error: 'Yapay zeka yanıtı oluşturulurken bir hata oluştu.' });
    }
  });

  app.post('/api/students/:id/ai-retry', authMiddleware, studentScopeGuard, async (req, res) => {
    const { id } = req.params;
    const {
      prompt,
      course,
      history,
      base64Image,
      imageMimeType,
      systemInstruction,
      cacheRecordId,
      cacheSource,
      cacheSimilarity,
      traditionalHash,
      imageHash,
      semanticHash,
    } = req.body;

    try {
      if (cacheRecordId || traditionalHash || imageHash || semanticHash) {
        const deleteConditions = [];
        if (cacheRecordId) deleteConditions.push({ id: cacheRecordId });
        if (traditionalHash) deleteConditions.push({ traditionalHash });
        if (imageHash) deleteConditions.push({ imageHash });
        if (semanticHash) deleteConditions.push({ semanticHash });

        if (deleteConditions.length > 0) {
          await prisma.cachedQuestion.deleteMany({
            where: { OR: deleteConditions },
          });
          console.log(
            '[CACHE DELETED] Yanlış çözüm bildirildi, önbellekten kalıcı olarak silindi.',
          );
          if (cacheSource) {
            console.log(
              `[CACHE QUALITY] Reddedilen hit | source=${cacheSource} | similarity=${cacheSimilarity ?? 'n/a'} | course=${course}`,
            );
          }
        }
      }

      const retryInstruction = [
        systemInstruction || '',
        "KRİTİK TALİMAT: Öğrenci bir önceki çözümünü reddetti. Normal kısa cevap formatını koru; detaylı/adım adım çözüm verme. Sadece daha dikkatli yeniden çöz. 'SIFIR MANİPÜLASYON' kuralına uy. Türev ifadesini motora (analyze_derivative) gönderirken Abs() işaretlerini, parantezleri veya çarpanları ASLA SİLME. Bir önceki çözümünde ifadeyi basitleştirdiğin için yanlış sonuç aldın. Her şeyi ham haliyle motora gönder ve motorun 'is_extremum' sonucuna göre adımları baştan kurgula.",
      ]
        .filter(Boolean)
        .join('\n\n');

      const result = await aiService.askAiWithMath(
        course,
        prompt,
        history || [],
        retryInstruction,
        base64Image,
        { 
          returnMetadata: true, 
          imageMimeType: imageMimeType || 'image/jpeg'
        },
      );
      const answer = result?.answerText || result;

      await prisma.student.update({
        where: { id: parseInt(id, 10) },
        data: { lastActiveAt: new Date() },
      });

      await writeTelemetry(prisma, {
        institutionId: req.user?.institutionId ?? null,
        studentId: req.user?.role === 'student' ? req.user?.id ?? null : null,
        userId: req.user?.id ?? null,
        userRole: req.user?.role ?? null,
        actorType: req.user?.role ?? null,
        surface: req.user?.role === 'student' ? 'mobile_app' : 'institution_panel',
        feature: 'question_retry',
        requestGroupId: req.body.requestGroupId,
        eventType: 'ai_retry',
        status: 'success',
        course,
        isImage: Boolean(base64Image),
        usedOcr: false,
        retryRequested: true,
        cacheSource: cacheSource ?? null,
        cacheSimilarity:
          typeof cacheSimilarity === 'number' ? cacheSimilarity : null,
        resultOrUsage: result,
        notes: stringifyV3Diagnostics(result),
      });

      res.json({
        success: true,
        answer,
        teacherText: result?.teacherText || null,
        diagnostics: buildV3DiagnosticSnapshot(result),
      });
    } catch (error) {
      console.error('AI Retry API Error:', error);
      await writeTelemetry(prisma, {
        institutionId: req.user?.institutionId ?? null,
        studentId: req.user?.role === 'student' ? req.user?.id ?? null : null,
        userId: req.user?.id ?? null,
        userRole: req.user?.role ?? null,
        actorType: req.user?.role ?? null,
        surface: req.user?.role === 'student' ? 'mobile_app' : 'institution_panel',
        feature: 'question_retry',
        requestGroupId: req.body.requestGroupId,
        eventType: 'ai_retry',
        status: 'error',
        course,
        isImage: Boolean(base64Image),
        usedOcr: false,
        retryRequested: true,
        cacheSource: cacheSource ?? null,
        cacheSimilarity:
          typeof cacheSimilarity === 'number' ? cacheSimilarity : null,
      });
      res
        .status(500)
        .json({ error: 'Yeniden çözüm üretilirken sunucu hatası oluştu.' });
    }
  });

  app.post('/api/questions/cache/save', authMiddleware, async (req, res) => {
    const {
      embedding,
      course,
      answer,
      questionText,
      traditionalHash,
      imageHash,
      semanticHash,
      cacheRecordId,
      cacheVariant,
    } = req.body;
    if (!answer) return res.status(400).json({ error: 'Missing data' });

    const safeEmbedding = Array.isArray(embedding) ? embedding : [];
    if (typeof answer !== 'string' || answer.length > 10000) {
      return res
        .status(400)
        .json({ error: 'Cevap metni çok uzun veya geçersiz.' });
    }

    try {
      const normalizedVariant = normalizeCacheVariant(cacheVariant);
      const normalizedQuestionText = extractCacheQueryText(questionText || '');
      const comparableText =
        normalizedQuestionText && normalizedQuestionText !== 'gorsel_icerik'
          ? buildComparableCacheText(course, normalizedQuestionText)
          : normalizedQuestionText;

      let resolvedTraditionalHash = traditionalHash || null;
      let resolvedSemanticHash = semanticHash || null;

      if (!resolvedTraditionalHash && normalizedQuestionText) {
        resolvedTraditionalHash = aiService.generateTraditionalHash(
          course,
          normalizedQuestionText,
        );
      }

      if (
        !resolvedSemanticHash &&
        normalizedQuestionText &&
        shouldUseSemanticCache(course, normalizedQuestionText, null)
      ) {
        resolvedSemanticHash = await aiService.generateSemanticHash(
          course,
          comparableText,
          null,
        );
      }

      const lookupConditions = [];
      if (cacheRecordId) lookupConditions.push({ id: cacheRecordId });
      if (resolvedTraditionalHash) {
        lookupConditions.push({ traditionalHash: resolvedTraditionalHash });
      }
      if (imageHash) lookupConditions.push({ imageHash });
      if (resolvedSemanticHash) {
        lookupConditions.push({ semanticHash: resolvedSemanticHash });
      }

      const existing =
        lookupConditions.length > 0
          ? await prisma.cachedQuestion.findFirst({
            where: { OR: lookupConditions },
          })
          : null;

      const data = buildCacheUpdateData({
        existing,
        cacheVariant: normalizedVariant,
        answer,
        embedding: safeEmbedding,
        course,
        traditionalHash: resolvedTraditionalHash,
        imageHash,
        semanticHash: resolvedSemanticHash,
      });

      if (existing) {
        await prisma.cachedQuestion.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.cachedQuestion.create({ data });
      }

      console.log(`[CACHE SAVED] Ders: ${course}`);
      res.json({ success: true });
    } catch (err) {
      console.error('Cache save error:', err);
      console.error('KURUM_HATA:', err);
      res.status(500).json({ error: "Sunucu hatası oluştu." });
    }
  });
}

module.exports = { registerAiRoutes };
