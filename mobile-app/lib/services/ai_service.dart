import 'package:yks/services/api_service.dart';
import 'package:http/http.dart' as http;

class AIService {
  // Son sorgunun önbellek (hash) bilgilerini tutar
  static Map<String, dynamic>? lastCacheContext;
  static const String interactionNewQuestion = 'new_question';
  static const String interactionFollowUp = 'follow_up';
  static const String interactionRetry = 'retry';
  static const String interactionDetailRequest = 'detail_request';
  static const String cacheVariantShort = 'short';
  static const String cacheVariantDetailed = 'detailed';

  static bool _isRequestCancelled(bool Function()? checker) =>
      checker?.call() == true;

  static bool _isMathOrGeometryCourse(String course) {
    final normalized = course.toLowerCase();
    return normalized.contains('matematik') || normalized.contains('geometri');
  }

  static bool _isPhysicsOrChemistryCourse(String course) {
    final normalized = course.toLowerCase();
    return normalized.contains('fizik') || normalized.contains('kimya');
  }

  static bool _isSafeVerbalCourse(String course) {
    final normalized = course.toLowerCase();
    return normalized.contains('türkçe') ||
        normalized.contains('turkce') ||
        normalized.contains('tarih') ||
        normalized.contains('coğrafya') ||
        normalized.contains('cografya') ||
        normalized.contains('felsefe') ||
        normalized.contains('din') ||
        normalized.contains('edebiyat');
  }

  static bool _looksLikeRiskyOcrContent(String text) {
    final normalized = text.toLowerCase();
    if (RegExp(r'[\d=+\-/*^%√∑∫<>[\]{}|]').hasMatch(normalized)) {
      return true;
    }

    final riskyKeywords = [
      'grafik',
      'tablo',
      'şekil',
      'sekil',
      'denklem',
      'eşitsizlik',
      'esitsizlik',
      'fonksiyon',
      'türev',
      'turev',
      'integral',
      'logaritma',
      'trigonometri',
      'çarpan',
      'carpan',
      'kök',
      'kok',
      'oran',
      'olasılık',
      'olasilik',
      'hız',
      'hiz',
      'ivme',
      'kuvvet',
      'enerji',
      'mol',
      'ph',
      'tepkime',
      'reaksiyon',
    ];

    return riskyKeywords.any(normalized.contains);
  }

  static bool _looksLikeCleanOcrText(String text) {
    final normalized = text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (normalized.length < 24) return false;

    final tokens = normalized
        .split(RegExp(r'\s+'))
        .where((token) => token.trim().isNotEmpty)
        .toList();
    if (tokens.length < 5) return false;

    final letterCount = RegExp(r'[A-Za-zÇĞİIÖŞÜçğıiöşü]').allMatches(normalized).length;
    final validCharCount = RegExp(
      "[A-Za-zÇĞİIÖŞÜçğıiöşü0-9\\s,.;:!?()'\"-]",
    ).allMatches(normalized).length;
    final letterRatio = normalized.isEmpty ? 0 : letterCount / normalized.length;
    final validRatio = normalized.isEmpty ? 0 : validCharCount / normalized.length;

    return letterRatio >= 0.45 && validRatio >= 0.85;
  }

  static bool shouldUseOcrTextOnly({
    required String course,
    required String ocrText,
    required bool hasUserText,
  }) {
    if (hasUserText) return false;
    if (!_isSafeVerbalCourse(course)) return false;
    if (!_looksLikeCleanOcrText(ocrText)) return false;
    if (_looksLikeRiskyOcrContent(ocrText)) return false;
    return true;
  }

  static bool _looksLikeCalculationPrompt(String prompt, {bool hasImage = false}) {
    if (hasImage) return true;

    final normalized = prompt.toLowerCase();
    final operationKeywords = [
      'kaçtır',
      'hesapla',
      'bul',
      'çöz',
      'coz',
      'denklem',
      'formül',
      'formul',
      'eşit',
      'esit',
      'sonuç',
      'sonuc',
      'kaç',
      'oran',
      'ivme',
      'hız',
      'hiz',
      'kuvvet',
      'enerji',
      'iş',
      'is',
      'güç',
      'guc',
      'mol',
      'derişim',
      'derisim',
      'ph',
      'tepkime',
      'reaksiyon',
      'basınç',
      'basinc',
      'sıcaklık',
      'sicaklik',
    ];

    final hasKeyword = operationKeywords.any(normalized.contains);
    final hasMathPattern = RegExp(r'[\d=+\-/*^%()]').hasMatch(normalized);

    return hasKeyword || hasMathPattern;
  }

  static bool _requiresManualCacheApproval({
    required String course,
    required String prompt,
    required bool isImage,
  }) {
    // Sözel dahil TÜM DERSLERDE otomatik cache kaydını kapattık.
    // Artık sadece kullanıcı 'Çözüm Doğru' butonuna basınca cache tablosuna yazılacak.
    return true;
  }

  static bool lastAnswerNeedsApproval() {
    return lastCacheContext?['requiresApproval'] == true;
  }

  static String cacheVariantForInteractionType(String interactionType) {
    return interactionType == interactionDetailRequest
        ? cacheVariantDetailed
        : cacheVariantShort;
  }

  static Map<String, dynamic>? detachLastCacheContext({
    required String cacheVariant,
  }) {
    if (lastCacheContext == null) return null;
    final snapshot = Map<String, dynamic>.from(lastCacheContext!);
    snapshot['cacheVariant'] = cacheVariant;
    lastCacheContext = null;
    return snapshot;
  }

  static bool _looksLikeStandaloneQuestion(String text) {
    final normalized = text.trim().toLowerCase();
    if (normalized.isEmpty) return false;

    final standalonePatterns = [
      RegExp(r'\bnedir\b'),
      RegExp(r'\bnelerdir\b'),
      RegExp(r'\bne demek\b'),
      RegExp(r'\bne anlama gelir\b'),
      RegExp(r'\bkimdir\b'),
      RegExp(r'\bhangisidir\b'),
      RegExp(r'\bhangileridir\b'),
      RegExp(r'\bkaçtır\b'),
      RegExp(r'\bkaç olur\b'),
      RegExp(r'\bamacı nedir\b'),
      RegExp(r'\bönemi nedir\b'),
      RegExp(r'\bozellikleri\b'),
    ];

    if (standalonePatterns.any((pattern) => pattern.hasMatch(normalized))) {
      return true;
    }

    final tokenCount = normalized
        .split(RegExp(r'\s+'))
        .where((token) => token.trim().isNotEmpty)
        .length;
    return tokenCount >= 3;
  }

  static bool _looksLikeExplicitFollowUp(String text) {
    final normalized = text.trim().toLowerCase();
    if (normalized.isEmpty) return false;

    final followUpPatterns = [
      RegExp(r'^(neden|neden\?|niçin|niçin\?)$'),
      RegExp(r'^(nasıl yani|yani|peki|peki\?)$'),
      RegExp(r'^(tekrar|tekrar anlat|bir daha anlat)$'),
      RegExp(r'^(detay|detay ver|detaylı anlat)$'),
      RegExp(r'^(örnek ver|bir örnek ver)$'),
      RegExp(r'^(devam et|sürdür)$'),
      RegExp(r'^(evreleri\??|aşamaları\??)$'),
    ];

    if (followUpPatterns.any((pattern) => pattern.hasMatch(normalized))) {
      return true;
    }

    return normalized.length < 16 && !_looksLikeStandaloneQuestion(normalized);
  }

  static String classifyInteractionType({
    required String text,
    required bool hasRecentContext,
    bool isDetailedRequest = false,
    bool isRetry = false,
  }) {
    if (isRetry) return interactionRetry;
    if (isDetailedRequest) return interactionDetailRequest;
    if (!hasRecentContext) return interactionNewQuestion;
    if (_looksLikeExplicitFollowUp(text)) return interactionFollowUp;
    return interactionNewQuestion;
  }

  static Future<String> askGemini({
    required String prompt,
    required String course,
    required String systemInstruction,
    List<Map<String, String>> history = const [],
    bool isImage = false,
    bool useCache = true,
    String? base64Image,
    String? imageMimeType,
    String? cacheText,
    String? ocrText,
    String interactionType = interactionNewQuestion,
    bool hasRecentContext = false,
    String feature = 'question_solve',
    http.Client? requestClient,
    bool Function()? isCancelled,
  }) async {
    final cacheVariant = cacheVariantForInteractionType(interactionType);

    // 1. Önce Önbellek Kontrolü (Backend üzerinden)
    lastCacheContext = null;
    final cacheRes = useCache
        ? await ApiService.checkCache(
            course: course,
            questionText: cacheText ?? prompt,
            base64Image: isImage ? base64Image : null,
            ocrText: isImage ? ocrText : null,
            interactionType: interactionType,
            hasRecentContext: hasRecentContext,
            client: requestClient,
          )
        : null;

    if (_isRequestCancelled(isCancelled)) {
      throw Exception('AI request cancelled');
    }

    if (cacheRes != null && cacheRes['hit'] == true) {
      lastCacheContext = {
        'course': course,
        'questionText': cacheText ?? prompt,
        'answer': cacheRes['answer'],
        'cacheHit': true,
        'cacheRecordId': cacheRes['cacheRecordId'],
        'cacheSource': cacheRes['cacheSource'],
        'cacheSimilarity': cacheRes['similarity'],
        'traditionalHash': cacheRes['traditionalHash'],
        'imageHash': cacheRes['imageHash'],
        'semanticHash': cacheRes['semanticHash'],
        'cacheVariant': cacheRes['answerVariant'] ?? cacheVariant,
        'requiresApproval': false,
      };
      return cacheRes['answer'];
    }

    // 2. Yeni Backend AI Endpoint'ini Çağır (Matematik Motoru Buraya Bağlı)
    final answer = await ApiService.askAi(
      prompt: prompt,
      course: course,
      systemInstruction: systemInstruction,
      history: history,
      base64Image: isImage ? base64Image : null,
      imageMimeType: isImage ? imageMimeType : null,
      feature: feature,
      client: requestClient,
    );

    final responseText = answer ?? "Sunucudan yanıt alınamadı.";

    if (_isRequestCancelled(isCancelled)) {
      throw Exception('AI request cancelled');
    }

    // 3. Önbelleğe ALMAYA HAZIRLAN (Otomatik kaydetme, onay bekle)
    if (useCache && cacheRes != null && cacheRes['hit'] == false) {
      final List? embeddingRaw = cacheRes['embedding'];
      final List<double>? embedding = embeddingRaw is List && embeddingRaw.isNotEmpty
          ? embeddingRaw.map((e) => (e as num).toDouble()).toList()
          : null;
      final traditionalHash = cacheRes['traditionalHash'];
      final imageHash = cacheRes['imageHash'];
      final semanticHash = cacheRes['semanticHash'];

      if (embedding != null ||
          traditionalHash != null ||
          imageHash != null ||
          semanticHash != null) {
        final requiresApproval = _requiresManualCacheApproval(
          course: course,
          prompt: cacheText ?? prompt,
          isImage: isImage,
        );

        lastCacheContext = {
          'embedding': embedding,
          'course': course,
          'questionText': cacheText ?? prompt,
          'answer': responseText,
          'cacheRecordId': cacheRes['cacheRecordId'],
          'cacheSource': cacheRes['cacheSource'],
          'cacheSimilarity': cacheRes['similarity'],
          'traditionalHash': traditionalHash,
          'imageHash': imageHash,
          'semanticHash': semanticHash,
          'cacheVariant': cacheVariant,
          'requiresApproval': requiresApproval,
        };

        if (!requiresApproval) {
          if (_isRequestCancelled(isCancelled)) {
            throw Exception('AI request cancelled');
          }
          await ApiService.saveCache(
            questionText: lastCacheContext!['questionText'],
            embedding: lastCacheContext!['embedding'],
            cacheRecordId: lastCacheContext!['cacheRecordId'],
            cacheVariant: lastCacheContext!['cacheVariant'],
            course: lastCacheContext!['course'],
            answer: lastCacheContext!['answer'],
            traditionalHash: lastCacheContext!['traditionalHash'],
            imageHash: lastCacheContext!['imageHash'],
            semanticHash: lastCacheContext!['semanticHash'],
          );
          lastCacheContext!['autoSaved'] = true;
        }
      }
    }

    return responseText;
  }

  // Öğrenci 👍 butonuna bastığında çağrılır
  static Future<String> approveAnswer({
    required Map<String, dynamic>? cacheContext,
    required String answer,
  }) async {
    if (cacheContext != null) {
      if (cacheContext['requiresApproval'] != true &&
          cacheContext['cacheRecordId'] == null &&
          cacheContext['traditionalHash'] == null &&
          cacheContext['imageHash'] == null &&
          cacheContext['semanticHash'] == null &&
          (cacheContext['questionText'] == null ||
              cacheContext['questionText'].toString().trim().isEmpty)) {
        return 'already_saved';
      }
      await ApiService.saveCache(
        questionText: cacheContext['questionText'],
        embedding: cacheContext['embedding'],
        cacheRecordId: cacheContext['cacheRecordId'],
        cacheVariant: cacheContext['cacheVariant'],
        course: cacheContext['course'],
        answer: answer,
        traditionalHash: cacheContext['traditionalHash'],
        imageHash: cacheContext['imageHash'],
        semanticHash: cacheContext['semanticHash'],
      );
      return 'saved';
    }
    return 'no_context';
  }

  // Öğrenci 👎 butonuna bastığında çağrılır (Backend'e retry atar)
  static Future<String> retryLastAnswer({
    required String prompt,
    required String course,
    String? systemInstruction,
    List<Map<String, String>> history = const [],
    String? base64Image,
    String? imageMimeType,
    Map<String, dynamic>? cacheContext,
  }) async {
    final answer = await ApiService.retryAi(
      prompt: prompt,
      course: course,
      systemInstruction: systemInstruction,
      history: history,
      base64Image: base64Image,
      imageMimeType: imageMimeType,
      cacheRecordId: cacheContext?['cacheRecordId'],
      cacheSource: cacheContext?['cacheSource'],
      cacheSimilarity: (cacheContext?['cacheSimilarity'] as num?)?.toDouble(),
      traditionalHash: cacheContext?['traditionalHash'],
      imageHash: cacheContext?['imageHash'],
      semanticHash: cacheContext?['semanticHash'],
    );
    lastCacheContext = null; // Yeni cevap gelecek, eskiyi unut
    return answer ?? "Sunucudan yeniden yanıt alınamadı.";
  }
}

class AIResponseData {
  final bool isEducational;
  final String cleanText;
  final String? course;
  final String? topic;
  final String? subtopic;
  final String? difficulty;

  AIResponseData({
    required this.isEducational,
    required this.cleanText,
    this.course,
    this.topic,
    this.subtopic,
    this.difficulty,
  });

  factory AIResponseData.parse(String rawResponse) {
    bool isEducational = false;
    String cleanText = rawResponse;
    String? course;
    String? topic;
    String? subtopic;
    String? difficulty;

    String? readMetaString(String source, String key) {
      final quotedDouble = RegExp(
        '"?$key"?\\s*:\\s*"([^"]+)"',
        caseSensitive: false,
      ).firstMatch(source);
      if (quotedDouble != null) return quotedDouble.group(1)?.trim();

      final quotedSingle = RegExp(
        '"?$key"?\\s*:\\s*\'([^\']+)\'',
        caseSensitive: false,
      ).firstMatch(source);
      if (quotedSingle != null) return quotedSingle.group(1)?.trim();

      final bare = RegExp(
        '"?$key"?\\s*:\\s*([^,}\\n]+)',
        caseSensitive: false,
      ).firstMatch(source);
      return bare?.group(1)?.replaceAll('"', '').replaceAll('\'', '').trim();
    }

    // Esnek metadata yakalama:
    // - {educational: true, ...}
    // - json { "educational": true, ... }
    // - ```json { ... } ```
    final metadataBlock = RegExp(
      // Sadece mesaj SONUNDAKİ metadata bloğunu yakala.
      // LaTeX içindeki { ... } parçalarına dokunma.
      r'(?:\n|^)\s*(?:```(?:json)?\s*)?(?:json\s*)?(\{[\s\S]*?"?educational"?\s*:\s*(?:true|false)[\s\S]*?\})(?:\s*```)?\s*$',
      caseSensitive: false,
      dotAll: true,
    );

    final metadataMatches = metadataBlock.allMatches(rawResponse).toList();
    if (metadataMatches.isNotEmpty) {
      final m = metadataMatches.last;
      final metaText = m.group(1) ?? '';

      final eduMatch = RegExp(
        r'"?educational"?\s*:\s*(true|false)',
        caseSensitive: false,
      ).firstMatch(metaText);
      if (eduMatch != null) {
        isEducational = (eduMatch.group(1) ?? '').toLowerCase() == 'true';
      }

      course = readMetaString(metaText, 'course');
      topic = readMetaString(metaText, 'topic');
      subtopic = readMetaString(metaText, 'subtopic');
      difficulty = readMetaString(metaText, 'difficulty');

      cleanText = rawResponse.replaceRange(m.start, m.end, '').trim();
    }

    cleanText = cleanText
        .replaceAll(RegExp(r'^\s*json\s*$', multiLine: true, caseSensitive: false), '')
        .replaceAll(RegExp(r'^\s*```(?:json)?\s*$', multiLine: true, caseSensitive: false), '')
        .replaceAll(RegExp(r'^\s*```\s*$', multiLine: true), '')
        .trim();

    return AIResponseData(
      isEducational: isEducational,
      cleanText: cleanText,
      course: course,
      topic: topic,
      subtopic: subtopic,
      difficulty: difficulty,
    );
  }
}
