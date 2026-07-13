import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:yks/models/study_note.dart';
import 'package:yks/models/favorite_question.dart';
import 'package:yks/models/chat_session.dart';
import 'package:yks/models/daily_quest.dart';
import 'package:yks/models/smart_quiz.dart';
import 'package:yks/data/daily_quest_data.dart';
import 'package:yks/data/achievement_data.dart';
import 'package:yks/services/api_service.dart';

class StorageService {
  static late SharedPreferences _prefs;
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  static Map<String, String> _secureCache = {};
  static List<ChatSession> _chatSessionsCache = [];
  static List<StudyNote> _notesCache = [];
  static List<FavoriteQuestion> _favoriteQuestionsCache = [];
  static const String _activeStudentIdKey = 'active_student_id';
  static String _deletedChatSessionsKey() => _studentScopedKey('deleted_chat_session_ids');
  static String _onboardingCompleteFallbackKey() => _studentScopedKey('onboarding_complete_local');

  static const Set<String> _sensitiveExactKeys = {
    'last_logged_in_username',
    'deleted_accounts',
  };

  static const List<String> _sensitivePrefixes = [
    'assigned_content_drafts',
    'chat_history_',
    'user_settings',
    'favorite_questions',
    'study_notes',
    'daily_quote',
    'daily_advice',
    'smart_quiz_plan',
    'smart_quiz_progress_',
    'daily_quests',
    'streak_count',
    'last_visit_date',
    'question_course_stats',
    'explanation_course_stats',
    'weekly_activity',
    'topic_stats',
    'unlocked_achievements',
    'exam_date',
    'daily_quests_date',
    'onboarding_complete',
    'user_xp',
    'deleted_chat_session_ids',
    'smart_quiz_attempts',
    'last_chat_exit_',
  ];

  static const List<String> _sessionPreferencePrefixes = [
    // Migrated to _sensitivePrefixes for security
  ];

  static bool _isSensitiveKey(String key) {
    if (_sensitiveExactKeys.contains(key)) return true;
    return _sensitivePrefixes.any(key.startsWith);
  }

  static bool _isSessionPreferenceKey(String key) {
    if (key == _activeStudentIdKey) return true;
    return _sessionPreferencePrefixes.any(key.startsWith);
  }

  static String? _readString(String key, {bool sensitive = false}) {
    if (!sensitive) return _prefs.getString(key);
    return _secureCache[key];
  }

  static Future<void> _writeString(
    String key,
    String value, {
    bool sensitive = false,
  }) async {
    if (!sensitive) {
      await _prefs.setString(key, value);
      return;
    }

    _secureCache[key] = value;
    await _secureStorage.write(key: key, value: value);
    await _prefs.remove(key);
  }

  static List<String>? _readStringList(String key, {bool sensitive = false}) {
    if (!sensitive) return _prefs.getStringList(key);
    final raw = _secureCache[key];
    if (raw == null) return null;

    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded.map((item) => item.toString()).toList();
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  static Future<void> _writeStringList(
    String key,
    List<String> value, {
    bool sensitive = false,
  }) async {
    if (!sensitive) {
      await _prefs.setStringList(key, value);
      return;
    }
    await _writeString(key, jsonEncode(value), sensitive: true);
  }

  static Future<void> _removeStoredKey(
    String key, {
    bool sensitive = false,
  }) async {
    if (!sensitive) {
      await _prefs.remove(key);
      return;
    }
    _secureCache.remove(key);
    await _secureStorage.delete(key: key);
  }

  static Future<void> _migrateLegacySensitivePrefs() async {
    final keys = _prefs.getKeys().where(_isSensitiveKey).toList();
    for (final key in keys) {
      final value = _prefs.get(key);
      if (value == null) continue;

      if (value is String) {
        await _writeString(key, value, sensitive: true);
        continue;
      }

      if (value is List<String>) {
        await _writeStringList(key, value, sensitive: true);
        continue;
      }

      if (value is List) {
        await _writeStringList(
          key,
          value.map((item) => item.toString()).toList(),
          sensitive: true,
        );
        continue;
      }

      if (value is bool || value is int || value is double) {
        await _writeString(key, value.toString(), sensitive: true);
      }
    }
  }

  static bool _isDisplayableChatSession(ChatSession session) {
    return session.messages.any(
      (message) => message.id != '1' && message.text.trim().isNotEmpty,
    );
  }

  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    try {
      _secureCache = Map<String, String>.from(await _secureStorage.readAll());
    } catch (_) {
      _secureCache = {};
    }
    await _migrateLegacySensitivePrefs();
    // Legacy local chat cache removed: chat is now DB-authoritative.
    await _prefs.remove('chat_sessions_v2');
    _chatSessionsCache = [];
    _notesCache = [];
    _favoriteQuestionsCache = [];
  }

  static int? getActiveStudentId() => _prefs.getInt(_activeStudentIdKey);

  static Future<void> setActiveStudentId(int? studentId) async {
    if (studentId == null) {
      await _prefs.remove(_activeStudentIdKey);
      return;
    }
    await _prefs.setInt(_activeStudentIdKey, studentId);
  }

  static String _studentScopedKey(String baseKey) {
    final studentId = getActiveStudentId();
    if (studentId == null) return baseKey;
    return '${baseKey}_$studentId';
  }

  static Map<String, dynamic> _getScopedMap(String baseKey) {
    final key = _studentScopedKey(baseKey);
    final data = _readString(key, sensitive: _isSensitiveKey(key));
    if (data == null) return {};
    return Map<String, dynamic>.from(json.decode(data));
  }

  static Future<void> _setScopedMap(
      String baseKey, Map<String, dynamic> data) async {
    final key = _studentScopedKey(baseKey);
    await _writeString(
      key,
      json.encode(data),
      sensitive: _isSensitiveKey(key),
    );
  }

  static Future<void> saveAssignedContentDraft(
    int recipientId,
    Map<String, dynamic> data,
  ) async {
    final drafts = _getScopedMap('assigned_content_drafts');
    drafts['$recipientId'] = data;
    await _setScopedMap('assigned_content_drafts', drafts);
  }

  static Map<String, dynamic>? getAssignedContentDraft(int recipientId) {
    final drafts = _getScopedMap('assigned_content_drafts');
    final draft = drafts['$recipientId'];
    if (draft is Map<String, dynamic>) return draft;
    if (draft is Map) {
      return Map<String, dynamic>.from(draft);
    }
    return null;
  }

  static Future<void> clearAssignedContentDraft(int recipientId) async {
    final drafts = _getScopedMap('assigned_content_drafts');
    drafts.remove('$recipientId');
    await _setScopedMap('assigned_content_drafts', drafts);
  }

  static String _scopedKey(String baseKey) => _studentScopedKey(baseKey);

  static int getStreak() {
    final str = _readString(_scopedKey('streak_count'), sensitive: true);
    return str != null ? (int.tryParse(str) ?? 0) : 0;
  }

  static Future<int> updateStreak() async {
    String today = DateTime.now().toIso8601String().split('T')[0];
    String? lastVisit = _readString(_scopedKey('last_visit_date'), sensitive: true);
    int currentStreak = getStreak();

    if (lastVisit == today) return currentStreak;

    if (lastVisit != null) {
      DateTime lastDate = DateTime.parse(lastVisit);
      DateTime todayDate = DateTime.parse(today);
      int diffDays = todayDate.difference(lastDate).inDays;

      if (diffDays == 1) {
        currentStreak += 1;
      } else if (diffDays > 1) {
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }

    await _writeString(_scopedKey('last_visit_date'), today, sensitive: true);
    await _writeString(_scopedKey('streak_count'), currentStreak.toString(), sensitive: true);

    // Sync to backend
    ApiService.syncActivity(streak: currentStreak);

    return currentStreak;
  }

  // --- CHAT SESSIONS & HISTORY ---
  static List<ChatSession> getAllSessions() {
    return List<ChatSession>.from(
      _chatSessionsCache.where(_isDisplayableChatSession),
    )
      ..sort((a, b) => b.lastActivity.compareTo(a.lastActivity));
  }

  static Future<void> refreshChatSessionsFromServer() async {
    final deletedIds = _readStringList(_deletedChatSessionsKey()) ?? [];
    final sessions = await ApiService.getChatSessions();
    _chatSessionsCache = List<ChatSession>.from(
      sessions.where(
        (session) =>
            !deletedIds.contains(session.id) && _isDisplayableChatSession(session),
      ),
    )
      ..sort((a, b) => b.lastActivity.compareTo(a.lastActivity));
  }

  static Future<void> saveSession(ChatSession session) async {
    final deletedIds = _readStringList(_deletedChatSessionsKey()) ?? [];
    if (deletedIds.contains(session.id)) {
      deletedIds.remove(session.id);
      await _writeStringList(_deletedChatSessionsKey(), deletedIds);
    }

    final saved = await ApiService.saveChatSession(session);
    if (!saved) return;

    final sessions = getAllSessions();
    final index = sessions.indexWhere((s) => s.id == session.id);
    if (index != -1) {
      sessions[index] = session;
    } else {
      sessions.insert(0, session);
    }
    _chatSessionsCache = sessions;
  }

  static Future<void> deleteSession(String id) async {
    final deletedIds = _readStringList(_deletedChatSessionsKey()) ?? [];
    if (!deletedIds.contains(id)) {
      deletedIds.add(id);
      await _writeStringList(_deletedChatSessionsKey(), deletedIds);
    }

    final sessions = getAllSessions();
    sessions.removeWhere((s) => s.id == id);
    _chatSessionsCache = sessions;

    final deleted = await ApiService.deleteChatSession(id);
    if (!deleted) return;
  }

  static Future<void> cleanupSessions({String? activeSessionId}) async {
    // DB-authoritative flow: no local cleanup is needed.
    return;
  }

  static void clearChatSessionCache() {
    _chatSessionsCache = [];
  }

  // Legacy support for older one-course-one-history (to be phased out)
  static List<Map<String, dynamic>> getHistory(String mode) {
    final key = 'chat_history_$mode';
    String? data = _readString(key, sensitive: true);
    if (data == null) return [];
    return List<Map<String, dynamic>>.from(json.decode(data));
  }

  static Future<void> saveHistory(
      String mode, List<Map<String, dynamic>> history) async {
    await _writeString(
      'chat_history_$mode',
      json.encode(history.take(50).toList()),
      sensitive: true,
    );
  }

  static Future<void> clearHistory(String mode) async {
    await _removeStoredKey('chat_history_$mode', sensitive: true);
  }

  static Future<void> saveLastChatExit(String mode) async {
    await _writeString(
        'last_chat_exit_$mode', DateTime.now().millisecondsSinceEpoch.toString(), sensitive: true);
  }

  static int getLastChatExit(String mode) {
      final str = _readString('last_chat_exit_$mode', sensitive: true);
      return str != null ? (int.tryParse(str) ?? 0) : 0;
  }

  // --- SETTINGS ---
  static Future<void> saveUserSettings(Map<String, dynamic> settings) async {
    await _writeString(
      _scopedKey('user_settings'),
      json.encode(settings),
      sensitive: true,
    );

    // Sync to backend
    ApiService.updateSettings(
      branch: settings['branch'],
      goalUniversity: settings['goalUniversity'],
      examDate: settings['examDate'],
      goalScore: settings['goalScore'], // Yeni alan eklendi
    );
  }

  static Map<String, dynamic>? getUserSettings() {
    String? data = _readString(_scopedKey('user_settings'), sensitive: true);
    if (data == null) return null;
    return json.decode(data);
  }

  // --- FAVORITE QUESTIONS ---
  static Future<void> saveFavoriteQuestion(FavoriteQuestion question) async {
    List<FavoriteQuestion> favorites = getFavoriteQuestions();
    if (!favorites.any((q) => q.id == question.id)) {
      favorites.insert(0, question);
      _favoriteQuestionsCache = favorites;
      await _writeString(
        _studentScopedKey('favorite_questions'),
        json.encode(favorites.map((q) => q.toJson()).toList()),
        sensitive: true,
      );

      // Sync to backend
      await ApiService.syncFavorites(favorites);
    }
  }

  static List<FavoriteQuestion> getFavoriteQuestions() {
    if (_favoriteQuestionsCache.isNotEmpty) {
      return List<FavoriteQuestion>.from(_favoriteQuestionsCache);
    }
    String? data = _readString(
      _studentScopedKey('favorite_questions'),
      sensitive: true,
    );
    if (data == null) return [];
    final favorites = List<Map<String, dynamic>>.from(json.decode(data))
        .map((m) => FavoriteQuestion.fromJson(m))
        .toList();
    _favoriteQuestionsCache = favorites;
    return List<FavoriteQuestion>.from(favorites);
  }

  static Future<void> deleteFavoriteQuestion(String id) async {
    List<FavoriteQuestion> favorites = getFavoriteQuestions();
    favorites.removeWhere((q) => q.id == id);
    _favoriteQuestionsCache = favorites;
    await _writeString(
      _studentScopedKey('favorite_questions'),
      json.encode(favorites.map((q) => q.toJson()).toList()),
      sensitive: true,
    );

    // Sync to backend
    await ApiService.syncFavorites(favorites);
  }

  static Future<void> refreshFavoriteQuestionsFromServer() async {
    final favorites = await ApiService.getFavoriteQuestions();
    _favoriteQuestionsCache = List<FavoriteQuestion>.from(favorites);
    await _writeString(
      _studentScopedKey('favorite_questions'),
      json.encode(favorites.map((f) => f.toJson()).toList()),
      sensitive: true,
    );
  }

  // --- STUDY NOTES ---
  static Future<void> saveNote(StudyNote note) async {
    List<StudyNote> notes = getNotes();
    notes.insert(0, note);
    _notesCache = notes;
    await _writeString(
      _studentScopedKey('study_notes'),
      json.encode(notes.map((n) => n.toJson()).toList()),
      sensitive: true,
    );

    // Sync to backend
    await ApiService.syncNotes(notes);
  }

  static List<StudyNote> getNotes() {
    if (_notesCache.isNotEmpty) {
      return List<StudyNote>.from(_notesCache);
    }
    String? data = _readString(
      _studentScopedKey('study_notes'),
      sensitive: true,
    );
    if (data == null) return [];
    final notes = List<Map<String, dynamic>>.from(json.decode(data))
        .map((m) => StudyNote.fromJson(m))
        .toList();
    _notesCache = notes;
    return List<StudyNote>.from(notes);
  }

  static Future<void> deleteNote(String id) async {
    List<StudyNote> notes = getNotes();
    notes.removeWhere((n) => n.id == id);
    _notesCache = notes;
    await _writeString(
      _studentScopedKey('study_notes'),
      json.encode(notes.map((n) => n.toJson()).toList()),
      sensitive: true,
    );

    // Sync to backend
    await ApiService.syncNotes(notes);
  }

  static Future<void> refreshNotesFromServer() async {
    final notes = await ApiService.getNotes();
    _notesCache = List<StudyNote>.from(notes);
    await _writeString(
      _studentScopedKey('study_notes'),
      json.encode(notes.map((n) => n.toJson()).toList()),
      sensitive: true,
    );
  }

  // --- ANALYTICS & STATS ---
  static Future<void> incrementQuestionCourseStat(String courseName) async {
    Map<String, dynamic> stats = getCourseStats();
    stats[courseName] = (stats[courseName] ?? 0) + 1;
    await _setScopedMap('question_course_stats', stats);

    int totalQuestions = stats.values.fold(0, (sum, val) => sum + (val as int));
    ApiService.syncActivity(solvedCount: totalQuestions);
  }

  static Map<String, dynamic> getCourseStats() {
    return _getScopedMap('question_course_stats');
  }

  static Future<void> incrementExplanationCourseStat(String courseName) async {
    Map<String, dynamic> stats = getExplanationCourseStats();
    stats[courseName] = (stats[courseName] ?? 0) + 1;
    await _setScopedMap('explanation_course_stats', stats);
  }

  static Map<String, dynamic> getExplanationCourseStats() {
    return _getScopedMap('explanation_course_stats');
  }

  static Future<void> saveWeeklyActivity() async {
    String today = DateTime.now().toIso8601String().split('T')[0];
    Map<String, int> activity =
        Map<String, int>.from(_getScopedMap('weekly_activity'));

    activity[today] = (activity[today] ?? 0) + 1;

    // Clean old activity (> 30 days)
    DateTime cutoff = DateTime.now().subtract(const Duration(days: 30));
    String cutoffStr = cutoff.toIso8601String().split('T')[0];
    activity.removeWhere((date, count) => date.compareTo(cutoffStr) < 0);

    await _setScopedMap('weekly_activity', activity);

    // Sync daily activity to backend
    ApiService.syncDailyActivity(
      date: today,
      solvedCount: activity[today] ?? 0,
    );
  }

  static Map<String, int> getWeeklyActivity() {
    return Map<String, int>.from(_getScopedMap('weekly_activity'));
  }

  static Future<void> incrementTopicStat(
      String course, String topic, String type) async {
    Map<String, dynamic> stats = getTopicStats();

    String key = "$course|$topic";
    if (!stats.containsKey(key)) {
      stats[key] = {
        'questions': 0,
        'explanations': 0,
        'last': DateTime.now().toIso8601String()
      };
    }

    if (type == 'question') {
      stats[key]['questions'] += 1;
    } else {
      stats[key]['explanations'] += 1;
    }
    stats[key]['last'] = DateTime.now().toIso8601String();

    await _setScopedMap('topic_stats', stats);
  }

  static Future<void> setTopicCompletion(
      String course, String topic, bool isCompleted) async {
    Map<String, dynamic> stats = getTopicStats();

    String key = "$course|$topic";
    if (!stats.containsKey(key)) {
      stats[key] = {
        'questions': 0,
        'explanations': 0,
        'last': DateTime.now().toIso8601String()
      };
    }

    // Mark as completed by setting a flag or ensuring questions > 0
    stats[key]['questions'] = isCompleted ? 1 : 0;
    stats[key]['last'] = DateTime.now().toIso8601String();

    await _setScopedMap('topic_stats', stats);

    // Sync to backend immediately
    syncAllTopicStats();
  }

  static Future<void> syncAllTopicStats() async {
    final stats = getTopicStats();
    List<Map<String, dynamic>> syncList = [];

    stats.forEach((key, value) {
      final parts = key.split('|');
      if (parts.length >= 2) {
        syncList.add({
          'course': parts[0],
          'topic': parts[1],
          'isCompleted': (value['questions'] ?? 0) > 0,
        });
      }
    });

    if (syncList.isNotEmpty) {
      ApiService.syncStudyPlan(syncList);
    }
  }

  static Map<String, dynamic> getTopicStats() {
    return _getScopedMap('topic_stats');
  }

  // --- ACHIEVEMENTS ---
  static List<String> getUnlockedAchievements() {
    return _readStringList(_scopedKey('unlocked_achievements'), sensitive: true) ?? [];
  }

  static Future<List<String>> checkAndUnlockAchievements() async {
    List<String> unlocked = getUnlockedAchievements();
    List<String> newlyUnlocked = [];

    int totalQuestions =
        getCourseStats().values.fold(0, (sum, val) => sum + (val as int));
    int currentStreak = getStreak();

    for (var ach in achievements) {
      if (unlocked.contains(ach.id)) continue;

      bool shouldUnlock = false;
      if (ach.conditionType == 'total_questions') {
        shouldUnlock = totalQuestions >= ach.threshold;
      } else if (ach.conditionType == 'streak') {
        shouldUnlock = currentStreak >= ach.threshold;
      } else if (ach.conditionType == 'first_question') {
        shouldUnlock = totalQuestions >= 1;
      }

      if (shouldUnlock) {
        unlocked.add(ach.id);
        newlyUnlocked.add(ach.id);
      }
    }

    if (newlyUnlocked.isNotEmpty) {
      await _writeStringList(_scopedKey('unlocked_achievements'), unlocked, sensitive: true);
      // Sync to backend
      ApiService.syncAchievements(unlocked);
    }
    return newlyUnlocked;
  }

  // --- Analytical Features Parity ---

  static Future<void> setExamDate(String date) async {
    await _writeString(_scopedKey('exam_date'), date, sensitive: true);
  }

  static String? getExamDate() {
    return _readString(_scopedKey('exam_date'), sensitive: true);
  }

  static Future<void> saveDailyQuote(Map<String, String> quoteData) async {
    await _writeString(
      _studentScopedKey('daily_quote'),
      jsonEncode(quoteData),
      sensitive: true,
    );
  }

  static Map<String, dynamic>? getDailyQuote() {
    final str = _readString(_studentScopedKey('daily_quote'), sensitive: true);
    return str != null ? jsonDecode(str) : null;
  }

  static Future<void> saveDailyAdvice(Map<String, String> adviceData) async {
    await _writeString(
      _studentScopedKey('daily_advice'),
      jsonEncode(adviceData),
      sensitive: true,
    );
  }

  static Map<String, dynamic>? getDailyAdvice() {
    final str = _readString(_studentScopedKey('daily_advice'), sensitive: true);
    return str != null ? jsonDecode(str) : null;
  }

  static Future<void> clearDailyAdvice() async {
    await _removeStoredKey(_studentScopedKey('daily_advice'), sensitive: true);
  }

  static SmartQuizPlan? getSmartQuizPlan() {
    final raw = _readString(_studentScopedKey('smart_quiz_plan'), sensitive: true);
    if (raw == null) return null;
    try {
      return SmartQuizPlan.fromJson(
        Map<String, dynamic>.from(jsonDecode(raw)),
      );
    } catch (_) {
      return null;
    }
  }

  static Future<void> saveSmartQuizPlan(SmartQuizPlan? plan) async {
    final key = _studentScopedKey('smart_quiz_plan');
    if (plan == null) {
      await _removeStoredKey(key, sensitive: true);
      return;
    }
    await _writeString(key, jsonEncode(plan.toJson()), sensitive: true);
  }

  static SmartQuizProgress? getSmartQuizProgress(String planId) {
    final raw = _readString(
      _studentScopedKey('smart_quiz_progress_$planId'),
      sensitive: true,
    );
    if (raw == null) return null;
    try {
      return SmartQuizProgress.fromJson(
        Map<String, dynamic>.from(jsonDecode(raw)),
      );
    } catch (_) {
      return null;
    }
  }

  static Future<void> saveSmartQuizProgress(SmartQuizProgress progress) async {
    await _writeString(
      _studentScopedKey('smart_quiz_progress_${progress.planId}'),
      jsonEncode(progress.toJson()),
      sensitive: true,
    );
  }

  static Future<void> clearSmartQuizProgress(String planId) async {
    await _removeStoredKey(
      _studentScopedKey('smart_quiz_progress_$planId'),
      sensitive: true,
    );
  }

  static Map<String, dynamic> _getSmartQuizAttemptMap() {
    return _getScopedMap('smart_quiz_attempts');
  }

  static Future<void> _setSmartQuizAttemptMap(Map<String, dynamic> data) async {
    await _setScopedMap('smart_quiz_attempts', data);
  }

  static Future<SmartQuizPlan?> refreshSmartQuizPlan() async {
    try {
      final remoteAttempts = await ApiService.getSmartQuizAttempts();
      SmartQuizAttempt? activeAttempt;
      for (final attempt in remoteAttempts) {
        if (attempt.status == 'pending' || attempt.status == 'in_progress') {
          activeAttempt = attempt;
          break;
        }
      }

      if (activeAttempt != null) {
        final remotePlan = SmartQuizPlan(
          id: activeAttempt.id,
          course: activeAttempt.course,
          topic: activeAttempt.topic,
          reason: activeAttempt.reason,
          riskLabel: activeAttempt.riskLabel.isNotEmpty
              ? activeAttempt.riskLabel
              : 'Quiz',
          cooldownHours: activeAttempt.cooldownHours,
          sourceLastActivityAt:
              activeAttempt.sourceLastActivityAt ?? DateTime.now(),
          assignedAt: activeAttempt.assignedAt ?? DateTime.now(),
          questionCount: activeAttempt.questionCount,
          explanationCount: activeAttempt.explanationCount,
        );
        await saveSmartQuizPlan(remotePlan);
        return remotePlan;
      }
    } catch (_) {
      final activePlan = getSmartQuizPlan();
      if (activePlan != null) {
        return activePlan;
      }
    }

    final topicStats = getTopicStats();
    final attempts = _getSmartQuizAttemptMap();
    final now = DateTime.now();
    SmartQuizPlan? bestPlan;
    int bestScore = -1;

    topicStats.forEach((key, rawValue) {
      if (rawValue is! Map<String, dynamic>) return;

      final questions = (rawValue['questions'] as num?)?.toInt() ?? 0;
      final explanations = (rawValue['explanations'] as num?)?.toInt() ?? 0;
      final totalTouches = questions + explanations;
      if (totalTouches == 0) return;

      final lastAt = DateTime.tryParse(rawValue['last']?.toString() ?? '');
      if (lastAt == null) return;

      final parts = key.split('|');
      if (parts.length < 2) return;
      final course = parts[0];
      final topic = parts.sublist(1).join('|');

      final imbalance = explanations - questions;
      final struggleScore =
          (explanations * 3) + (imbalance > 0 ? imbalance * 4 : 0) + (questions == 0 ? 2 : 0);

      if (struggleScore < 4) return;

      final cooldownHours = struggleScore >= 10 ? 24 : 72;
      final dueAt = lastAt.add(Duration(hours: cooldownHours));
      if (now.isBefore(dueAt)) return;

      final attempt =
          attempts[key] is Map<String, dynamic> ? Map<String, dynamic>.from(attempts[key]) : null;
      final lastCompletedAt = DateTime.tryParse(
        attempt?['lastCompletedAt']?.toString() ?? '',
      );
      final lastAssignedForActivity = DateTime.tryParse(
        attempt?['sourceLastActivityAt']?.toString() ?? '',
      );
      final lastScore = (attempt?['lastScore'] as num?)?.toDouble() ?? 0;

      final alreadyHandledThisActivity =
          lastAssignedForActivity != null && !lastAssignedForActivity.isBefore(lastAt);
      final passedThisActivity =
          alreadyHandledThisActivity && lastCompletedAt != null && lastScore >= 0.67;

      if (passedThisActivity) return;

      final riskLabel =
          struggleScore >= 10 ? 'Yuksek Oncelik' : 'Takip Quizi';
      final reason = explanations > questions
          ? 'Bu konuda soru cozmeye gore daha fazla konu anlatimi istemissin.'
          : 'Bu konuya tekrar donme ihtiyacin olusmus.';

      if (struggleScore > bestScore) {
        bestScore = struggleScore;
        bestPlan = SmartQuizPlan(
          id:
              'sq_${course.replaceAll(' ', '_')}_${topic.replaceAll(' ', '_')}_${lastAt.millisecondsSinceEpoch}',
          course: course,
          topic: topic,
          reason: reason,
          riskLabel: riskLabel,
          cooldownHours: cooldownHours,
          sourceLastActivityAt: lastAt,
          assignedAt: now,
          questionCount: questions,
          explanationCount: explanations,
        );
      }
    });

    if (bestPlan != null) {
      final updatedAttempts = _getSmartQuizAttemptMap();
      updatedAttempts[bestPlan!.topicKey] = {
        ...(updatedAttempts[bestPlan!.topicKey] is Map<String, dynamic>
            ? Map<String, dynamic>.from(updatedAttempts[bestPlan!.topicKey])
            : <String, dynamic>{}),
        'sourceLastActivityAt': bestPlan!.sourceLastActivityAt.toIso8601String(),
        'lastAssignedAt': bestPlan!.assignedAt.toIso8601String(),
      };
      await _setSmartQuizAttemptMap(updatedAttempts);
      await saveSmartQuizPlan(bestPlan);
      await ApiService.syncSmartQuizPlan(bestPlan!);
    }

    return bestPlan;
  }

  static Future<void> completeSmartQuiz({
    required SmartQuizPlan plan,
    required int correctCount,
    required int totalCount,
  }) async {
    final attempts = _getSmartQuizAttemptMap();
    final previous =
        attempts[plan.topicKey] is Map<String, dynamic> ? Map<String, dynamic>.from(attempts[plan.topicKey]) : {};
    final score = totalCount == 0 ? 0.0 : correctCount / totalCount;

    attempts[plan.topicKey] = {
      ...previous,
      'sourceLastActivityAt': plan.sourceLastActivityAt.toIso8601String(),
      'lastAssignedAt': plan.assignedAt.toIso8601String(),
      'lastCompletedAt': DateTime.now().toIso8601String(),
      'lastScore': score,
      'lastCorrectCount': correctCount,
      'totalCount': totalCount,
      'attemptCount': ((previous['attemptCount'] as num?)?.toInt() ?? 0) + 1,
      'successCount': ((previous['successCount'] as num?)?.toInt() ?? 0) +
          (score >= 0.67 ? 1 : 0),
    };

    await _setSmartQuizAttemptMap(attempts);
    await saveSmartQuizPlan(null);
    await clearSmartQuizProgress(plan.id);
    await ApiService.completeSmartQuiz(
      attemptId: plan.id,
      course: plan.course,
      topic: plan.topic,
      correctCount: correctCount,
      totalCount: totalCount,
      score: score,
      sourceLastActivityAt: plan.sourceLastActivityAt.toIso8601String(),
    );
  }

  static Future<void> setOnboardingComplete() async {
    await _writeString(_scopedKey('onboarding_complete'), 'true', sensitive: true);
    await _prefs.setBool(_onboardingCompleteFallbackKey(), true);
    ApiService.syncActivity(onboardingComplete: true);
  }

  static bool getOnboardingComplete() {
    final secureValue =
        _readString(_scopedKey('onboarding_complete'), sensitive: true);
    if (secureValue != null) return secureValue == 'true';
    return _prefs.getBool(_onboardingCompleteFallbackKey()) ?? false;
  }

  static Map<String, int> getWeeklyComparison() {
    final activity = getWeeklyActivity();
    final today = DateTime.now();
    final thisMonday = today.subtract(Duration(days: today.weekday - 1));
    final lastMonday = thisMonday.subtract(const Duration(days: 7));

    final thisMondayStr =
        "${thisMonday.year}-${thisMonday.month.toString().padLeft(2, '0')}-${thisMonday.day.toString().padLeft(2, '0')}";
    final lastMondayStr =
        "${lastMonday.year}-${lastMonday.month.toString().padLeft(2, '0')}-${lastMonday.day.toString().padLeft(2, '0')}";

    int thisWeek = 0;
    int lastWeek = 0;

    activity.forEach((date, count) {
      if (date.compareTo(thisMondayStr) >= 0) {
        thisWeek += count;
      } else if (date.compareTo(lastMondayStr) >= 0 &&
          date.compareTo(thisMondayStr) < 0) {
        lastWeek += count;
      }
    });

    return {'thisWeek': thisWeek, 'lastWeek': lastWeek};
  }

  static String? getLastActivityDate() {
    // Return the latest from either question or explanation history
    final qHistory = getHistory('question');
    final eHistory = getHistory('explanation');

    String? lastQ = qHistory.isNotEmpty ? qHistory.last['timestamp'] : null;
    String? lastE = eHistory.isNotEmpty ? eHistory.last['timestamp'] : null;

    if (lastQ != null && lastE != null) {
      if (lastQ.compareTo(lastE) > 0) return lastQ;
      return lastE;
    }
    return lastQ ?? lastE;
  }

  // --- DAILY QUESTS ---
  static List<DailyQuest> getDailyQuests() {
    String today = DateTime.now().toIso8601String().split('T')[0];
    String? savedDate = _readString(_scopedKey('daily_quests_date'), sensitive: true);

    // Eğer bugünün görevleri yoksa yeni görevler üret
    if (savedDate != today) {
      final quests = generateDailyQuests();
      _writeString(_scopedKey('daily_quests_date'), today, sensitive: true);
      _writeString(
        _scopedKey('daily_quests'),
        json.encode(quests.map((q) => q.toJson()).toList()),
        sensitive: true,
      );

      // Sync new quests for today
      ApiService.syncDailyQuests(quests);
      return quests;
    }

    String? data = _readString(_scopedKey('daily_quests'), sensitive: true);
    if (data == null) return generateDailyQuests();
    return List<Map<String, dynamic>>.from(json.decode(data))
        .map((m) => DailyQuest.fromJson(m))
        .toList();
  }

  static Future<void> updateQuestProgress(String type, int amount) async {
    List<DailyQuest> quests = getDailyQuests();
    for (var quest in quests) {
      if (quest.type == type && !quest.isCompleted) {
        quest.progress += amount;
      }
    }
    await _writeString(
      _scopedKey('daily_quests'),
      json.encode(quests.map((q) => q.toJson()).toList()),
      sensitive: true,
    );

    // Sync to backend
    ApiService.syncDailyQuests(quests);
  }

  // --- ACCOUNT DELETION MOCK ---
  static Future<void> setLastLoggedInUsername(String username) async {
    await _writeString('last_logged_in_username', username, sensitive: true);
  }

  static String? getLastLoggedInUsername() {
    return _readString('last_logged_in_username', sensitive: true);
  }

  static Future<void> addDeletedAccount(String username) async {
    List<String> deleted = getDeletedAccounts();
    if (!deleted.contains(username)) {
      deleted.add(username);
      await _writeStringList('deleted_accounts', deleted, sensitive: true);
    }
  }

  static List<String> getDeletedAccounts() {
    return _readStringList('deleted_accounts', sensitive: true) ?? [];
  }

  static bool isAccountDeleted(String username) {
    return getDeletedAccounts().contains(username);
  }

  static Future<void> hydrate(Map<String, dynamic> student) async {
    final rawStudentId = student['id'];
    final studentId = rawStudentId is int
        ? rawStudentId
        : int.tryParse(rawStudentId?.toString() ?? '');
    await setActiveStudentId(studentId);
    _notesCache = [];
    _favoriteQuestionsCache = [];

    // 1. XP & Stats
    if (student['xp'] != null) {
      await _writeString(_scopedKey('user_xp'), student['xp'].toString(), sensitive: true);
    }
    if (student['streak'] != null) {
      await _writeString(_scopedKey('streak_count'), student['streak'].toString(), sensitive: true);
    }

    // 2. Study Notes
    if (student['studyNotes'] != null) {
      final List notes = student['studyNotes'];
      await _writeString(
        _studentScopedKey('study_notes'),
        json.encode(notes),
        sensitive: true,
      );
      _notesCache = notes
          .map((n) => StudyNote.fromJson(Map<String, dynamic>.from(n)))
          .toList();
    }

    // 3. Favorite Questions
    if (student['favoriteQuestions'] != null) {
      final List favorites = student['favoriteQuestions'];
      await _writeString(
        _studentScopedKey('favorite_questions'),
        json.encode(favorites),
        sensitive: true,
      );
      _favoriteQuestionsCache = favorites
          .map((f) => FavoriteQuestion.fromJson(Map<String, dynamic>.from(f)))
          .toList();
    }

    // 4. Daily Quests
    if (student['dailyQuests'] != null) {
      final List quests = student['dailyQuests'];
      // Only keep today's or the most recent (server already sends them if updated correctly)
      await _writeString(
        _scopedKey('daily_quests'),
        json.encode(quests),
        sensitive: true,
      );
    }

    // 5. Weekly Activity (from DailyActivities)
    if (student['dailyActivities'] != null) {
      final List activities = student['dailyActivities'];
      Map<String, int> weeklyMap = {};
      for (var act in activities) {
        String date = act['date'];
        int count = act['solvedCount'] ?? 0;
        weeklyMap[date] = count;
      }
      await _setScopedMap('weekly_activity', weeklyMap);
    }

    // 6. User Settings (Basic stuff)
    Map<String, dynamic> settings = {
      'branch': student['branch'] ?? 'Sayısal',
      'goalUniversity': student['goalUniversity'] ?? 'Hedefsiz',
      'examDate': student['examDate'],
      'goalScore': student['goalScore'],
    };
    await _writeString(
      _scopedKey('user_settings'),
      json.encode(settings),
      sensitive: true,
    );

    if (student['onboardingComplete'] != null) {
      final val = student['onboardingComplete'].toString() == 'true' ? 'true' : 'false';
      await _writeString(_scopedKey('onboarding_complete'), val, sensitive: true);
    }

    // 7. Study Plan Topics (Müfredat İlerlemesi)
    if (student['studyPlanTopics'] != null) {
      final List topics = student['studyPlanTopics'];
      Map<String, dynamic> localStats = getTopicStats();
      for (var t in topics) {
        if (t['isCompleted'] == true) {
          String key = "${t['course']}|${t['topic']}";
          final existing = localStats[key] is Map<String, dynamic>
              ? Map<String, dynamic>.from(localStats[key])
              : <String, dynamic>{};
          localStats[key] = {
            'questions': (existing['questions'] ?? 0) > 0
                ? existing['questions']
                : 1,
            'explanations': existing['explanations'] ?? 0,
            'last': existing['last'] ??
                t['completedAt'] ??
                DateTime.now().toIso8601String()
          };
        }
      }
      await _setScopedMap('topic_stats', localStats);
    }
  }

  static Future<void> clearSessionData() async {
    final keysToRemove = _prefs.getKeys().where(_isSessionPreferenceKey).toList();
    for (final key in keysToRemove) {
      await _prefs.remove(key);
    }

    final secureKeysToRemove = _secureCache.keys
        .where((key) => key != 'deleted_accounts')
        .toList();
    for (final key in secureKeysToRemove) {
      await _removeStoredKey(key, sensitive: true);
    }

    _chatSessionsCache = [];
    _notesCache = [];
    _favoriteQuestionsCache = [];
  }

  static Future<void> clearAllData({bool preserveDeletedAccounts = false}) async {
    final deletedAccounts = preserveDeletedAccounts ? getDeletedAccounts() : <String>[];
    await _prefs.clear();
    final secureKeys = _secureCache.keys.toList();
    for (final key in secureKeys) {
      await _removeStoredKey(key, sensitive: true);
    }
    if (preserveDeletedAccounts && deletedAccounts.isNotEmpty) {
      await _writeStringList(
        'deleted_accounts',
        deletedAccounts,
        sensitive: true,
      );
    }
    _chatSessionsCache = [];
    _notesCache = [];
    _favoriteQuestionsCache = [];
  }
}
