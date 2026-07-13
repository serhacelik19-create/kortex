import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

import 'package:flutter/foundation.dart' show kDebugMode, debugPrint, kIsWeb;
import 'package:yks/models/daily_quest.dart';
import 'package:yks/models/study_note.dart';
import 'package:yks/models/favorite_question.dart';
import 'package:yks/models/chat_session.dart';
import 'package:yks/models/smart_quiz.dart';
import 'package:yks/models/guidance.dart';

class ApiService {
  static Future<List<dynamic>> getNotifications() async {
    try {
      final response = await _secureGet('/notifications');
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get notifications error: $e');
    }
    return [];
  }
  static const FlutterSecureStorage _storage = FlutterSecureStorage();
  static const String _envBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const String _prodBaseUrl =
      'https://backend-727053386162.europe-west3.run.app/api';
  static const String _iosSimulatorBaseUrl = 'http://localhost:8080/api';
  static const String _androidEmulatorBaseUrl = 'http://10.0.2.2:8080/api';
  
  static final http.Client _client = _createClient();

  static http.Client _createClient() {
    if (kIsWeb) return http.Client();
    return IOClient(HttpClient());
  }

  static http.Client createRequestClient() => _createClient();

  static void closeRequestClient(http.Client? client) {
    try {
      client?.close();
    } catch (_) {}
  }

  // Callback for token expiry (set from main.dart)
  static Function? onTokenExpired;
  static Future<void> Function()? onLogoutCleanup;

  static String get baseUrl {
    if (_envBaseUrl.isNotEmpty) return _envBaseUrl;
    if (kDebugMode) {
      if (kIsWeb) return 'http://localhost:8080/api';
      try {
        if (Platform.isAndroid) return _androidEmulatorBaseUrl;
        if (Platform.isIOS) return _iosSimulatorBaseUrl;
      } catch (_) {}
    }
    return _prodBaseUrl;
  }

  // ==================== AUTH HELPERS ====================

  /// Get stored JWT token
  static Future<String?> _getToken() async {
    return await _storage.read(key: 'jwt_token');
  }

  static Future<String?> _getParentToken() async {
    return await _storage.read(key: 'parent_session_token');
  }

  static Future<String?> getAuthToken() async {
    return _getToken();
  }

  /// Build headers with JWT Authorization and HMAC Signature
  static Future<Map<String, String>> _authHeaders() async {
    final token = await _getToken();

    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, String>> _parentAuthHeaders() async {
    final token = await _getParentToken();

    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Map<String, dynamic> _minifyStudentData(Map<String, dynamic> student) {
    Map<String, dynamic>? institution;
    final rawInstitution = student['institution'];
    if (rawInstitution is Map) {
      institution = {
        if (rawInstitution['id'] != null) 'id': rawInstitution['id'],
        if (rawInstitution['name'] != null) 'name': rawInstitution['name'],
        if (rawInstitution['slug'] != null) 'slug': rawInstitution['slug'],
      };
    }

    return {
      if (student['id'] != null) 'id': student['id'],
      if (student['name'] != null) 'name': student['name'],
      if (student['username'] != null) 'username': student['username'],
      if (institution != null) 'institution': institution,
    };
  }

  /// Centralized response handler – catches 401 and triggers logout
  static Future<http.Response> _securePost(
      String endpoint, Map<String, dynamic> body,
      {Duration timeout = const Duration(seconds: 15), http.Client? client}) async {
    final headers = await _authHeaders();
    final response = await (client ?? _client)
        .post(
          Uri.parse('$baseUrl$endpoint'),
          headers: headers,
          body: jsonEncode(body),
        )
        .timeout(timeout);

    if (response.statusCode == 401) {
      final data = jsonDecode(response.body);
      if (data['expired'] == true) {
        await logout();
        onTokenExpired?.call();
      }
    }
    return response;
  }

  static Future<http.Response> _secureGet(String endpoint) async {
    final headers = await _authHeaders();
    final response = await _client
        .get(
          Uri.parse('$baseUrl$endpoint'),
          headers: headers,
        )
        .timeout(const Duration(seconds: 15));

    if (response.statusCode == 401) {
      final data = jsonDecode(response.body);
      if (data['expired'] == true) {
        await logout();
        onTokenExpired?.call();
      }
    }
    return response;
  }

  static Future<http.Response> _secureDelete(String endpoint) async {
    final headers = await _authHeaders();
    final response = await _client
        .delete(
          Uri.parse('$baseUrl$endpoint'),
          headers: headers,
        )
        .timeout(const Duration(seconds: 15));

    if (response.statusCode == 401) {
      final data = jsonDecode(response.body);
      if (data['expired'] == true) {
        await logout();
        onTokenExpired?.call();
      }
    }
    return response;
  }

  // ==================== LOGIN / LOGOUT ====================

  static Future<Map<String, dynamic>> login(
      String username, String password) async {
    final url = '$baseUrl/login';
    try {
      final response = await _client
          .post(
            Uri.parse(url),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'username': username,
              'password': password,
            }),
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true) {
          final studentData = data['student'] is Map<String, dynamic>
              ? Map<String, dynamic>.from(data['student'])
              : <String, dynamic>{};
          // Store JWT token securely
          await _storage.write(key: 'jwt_token', value: data['token']);
          await _storage.write(
            key: 'student_data',
            value: jsonEncode(_minifyStudentData(studentData)),
          );
          return {
            'success': true,
            'message': 'Giriş başarılı',
            'student': data['student']
          };
        }
      } else if (response.statusCode == 401) {
        final data = jsonDecode(response.body);
        return {
          'success': false,
          'message': data['message'] ?? 'Hatalı kullanıcı adı veya şifre'
        };
      } else if (response.statusCode == 429) {
        return {
          'success': false,
          'message': 'Çok fazla deneme yaptınız. Lütfen 1 dakika bekleyin.'
        };
      }
      return {
        'success': false,
        'message': 'Giriş yapılamadı (Sunucu hatası: ${response.statusCode})'
      };
    } catch (e) {
      return {
        'success': false,
        'message': 'Sunucu bağlantı hatası. İnternetinizi kontrol edin.'
      };
    }
  }

  static Future<void> logout() async {
    await _storage.delete(key: 'jwt_token');
    await _storage.delete(key: 'student_data');
    await onLogoutCleanup?.call();
  }

  static Future<bool> isLoggedIn() async {
    final token = await _storage.read(key: 'jwt_token');
    return token != null;
  }

  static Future<Map<String, dynamic>?> getStudentData() async {
    final str = await _storage.read(key: 'student_data');
    if (str != null) {
      return jsonDecode(str);
    }
    return null;
  }

  // ==================== PARENT MODE ====================

  static Future<bool> isParentLoggedIn() async {
    final token = await _storage.read(key: 'parent_session_token');
    return token != null;
  }

  static Future<Map<String, dynamic>?> getParentSessionData() async {
    final str = await _storage.read(key: 'parent_session_data');
    if (str == null) return null;
    return jsonDecode(str);
  }

  static Future<Map<String, dynamic>> consumeParentActivation(
    String token, {
    String? deviceLabel,
  }) async {
    final response = await _client
        .post(
          Uri.parse('$baseUrl/parent-activations/consume'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'token': token,
            if (deviceLabel != null) 'deviceLabel': deviceLabel,
          }),
        )
        .timeout(const Duration(seconds: 15));

    final data = jsonDecode(response.body);
    if (response.statusCode == 200 && data['success'] == true) {
      await _storage.write(
        key: 'parent_session_token',
        value: data['parentSessionToken'],
      );
      await _storage.write(
        key: 'parent_student_id',
        value: data['student']?['id']?.toString(),
      );
      await _storage.write(
        key: 'parent_institution_id',
        value: data['institution']?['id']?.toString(),
      );
      await _storage.write(
        key: 'parent_session_data',
        value: jsonEncode({
          'student': data['student'],
          'institution': data['institution'],
        }),
      );
      return {'success': true, ...data};
    }

    return {
      'success': false,
      'message': data['error'] ?? 'Veli aktivasyonu tamamlanamadı.',
      'statusCode': response.statusCode,
    };
  }

  static Future<void> registerParentPushToken(String pushToken) async {
    final headers = await _parentAuthHeaders();
    await _client
        .post(
          Uri.parse('$baseUrl/parent/session/push-token'),
          headers: headers,
          body: jsonEncode({'pushToken': pushToken}),
        )
        .timeout(const Duration(seconds: 10));
  }

  static Future<List<dynamic>> getParentNotifications() async {
    try {
      final headers = await _parentAuthHeaders();
      final response = await _client
          .get(
            Uri.parse('$baseUrl/parent/notifications'),
            headers: headers,
          )
          .timeout(const Duration(seconds: 15));
      if (response.statusCode == 200) return jsonDecode(response.body);
      if (response.statusCode == 401) await logoutParentLocalOnly();
    } catch (e) {
      if (kDebugMode) debugPrint('Get parent notifications error: $e');
    }
    return [];
  }

  static Future<void> markParentNotificationRead(int id) async {
    final headers = await _parentAuthHeaders();
    await _client
        .post(
          Uri.parse('$baseUrl/parent/notifications/$id/read'),
          headers: headers,
          body: jsonEncode({}),
        )
        .timeout(const Duration(seconds: 10));
  }

  static Future<void> logoutParent() async {
    try {
      final headers = await _parentAuthHeaders();
      await _client
          .post(
            Uri.parse('$baseUrl/parent/logout'),
            headers: headers,
            body: jsonEncode({}),
          )
          .timeout(const Duration(seconds: 10));
    } catch (_) {}
    await logoutParentLocalOnly();
  }

  static Future<void> logoutParentLocalOnly() async {
    await _storage.delete(key: 'parent_session_token');
    await _storage.delete(key: 'parent_student_id');
    await _storage.delete(key: 'parent_institution_id');
    await _storage.delete(key: 'parent_session_data');
  }

  // ==================== SYNC ENDPOINTS (All secured with JWT) ====================

  static Future<void> syncActivity(
      {int? solvedCount,
      int? progress,
      int? streak,
      bool? onboardingComplete}) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      final Map<String, dynamic> body = {};
      if (solvedCount != null) body['solvedCount'] = solvedCount;
      if (progress != null) body['progress'] = progress;
      if (streak != null) body['streak'] = streak;
      if (onboardingComplete != null) {
        body['onboardingComplete'] = onboardingComplete;
      }
      body['lastSeen'] = 'Şimdi';

      await _securePost('/students/$studentId/sync', body);
    } catch (e) {
      if (kDebugMode) debugPrint('Sync error: $e');
    }
  }

  static Future<void> syncAIAnalysis({
    required String course,
    required String topic,
    required String subtopic,
    required String difficulty,
  }) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/ai-analysis', {
        'course': course,
        'topic': topic,
        'subtopic': subtopic,
        'difficulty': difficulty,
      });
    } catch (e) {
      if (kDebugMode) debugPrint('AI Analysis sync error: $e');
    }
  }

  static Future<void> syncDailyQuests(List<DailyQuest> quests) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/daily-quests/sync', {
        'quests': quests.map((q) => q.toJson()).toList(),
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Daily quests sync error: $e');
    }
  }

  static Future<void> syncDailyActivity({
    required String date,
    required int solvedCount,
  }) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/daily-activity', {
        'date': date,
        'solvedCount': solvedCount,
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Daily activity sync error: $e');
    }
  }

  static Future<void> syncStudyPlan(List<Map<String, dynamic>> topics) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/study-plan/sync', {
        'topics': topics,
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Study plan sync error: $e');
    }
  }

  static Future<void> syncNotes(List<StudyNote> notes) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/notes/sync', {
        'notes': notes.map((n) => n.toJson()).toList(),
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Notes sync error: $e');
    }
  }

  static Future<List<StudyNote>> getNotes() async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return [];
      final studentId = student['id'];

      final response = await _secureGet('/students/$studentId/notes');
      if (response.statusCode == 200) {
        final list = List<Map<String, dynamic>>.from(jsonDecode(response.body));
        return list.map((n) => StudyNote.fromJson(n)).toList();
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get notes error: $e');
    }
    return [];
  }

  static Future<void> syncFavorites(List<FavoriteQuestion> favorites) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/favorites/sync', {
        'favorites': favorites.map((f) => f.toJson()).toList(),
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Favorites sync error: $e');
    }
  }

  static Future<List<FavoriteQuestion>> getFavoriteQuestions() async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return [];
      final studentId = student['id'];

      final response = await _secureGet('/students/$studentId/favorites');
      if (response.statusCode == 200) {
        final list = List<Map<String, dynamic>>.from(jsonDecode(response.body));
        return list.map((f) => FavoriteQuestion.fromJson(f)).toList();
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get favorites error: $e');
    }
    return [];
  }

  static Future<void> syncChatSessions(List<ChatSession> sessions) async {
    try {
      for (final session in sessions) {
        await saveChatSession(session);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Chat sessions sync error: $e');
    }
  }

  static Future<List<ChatSession>> getChatSessions({
    String? course,
    String? mode,
  }) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return [];
      final studentId = student['id'];
      final headers = await _authHeaders();

      final query = <String, String>{};
      if (course != null && course.isNotEmpty) query['course'] = course;
      if (mode != null && mode.isNotEmpty) query['mode'] = mode;

      final uri =
          Uri.parse('$baseUrl/students/$studentId/chat-sessions').replace(
        queryParameters: query.isEmpty ? null : query,
      );

      final response =
          await _client.get(uri, headers: headers).timeout(const Duration(seconds: 15));
      if (response.statusCode == 200) {
        final list = List<Map<String, dynamic>>.from(jsonDecode(response.body));
        return list.map((s) => ChatSession.fromJson(s)).toList();
      }
      if (response.statusCode == 401) {
        final data = jsonDecode(response.body);
        if (data['expired'] == true) {
          await logout();
          onTokenExpired?.call();
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get chat sessions error: $e');
    }
    return [];
  }

  static Future<bool> saveChatSession(ChatSession session) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return false;
      final studentId = student['id'];
      final response = await _securePost('/students/$studentId/chat-sessions', {
        'session': session.toJson(),
      });
      return response.statusCode >= 200 && response.statusCode < 300;
    } catch (e) {
      if (kDebugMode) debugPrint('Save chat session error: $e');
      return false;
    }
  }

  static Future<bool> deleteChatSession(String sessionId) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return false;
      final studentId = student['id'];
      final response =
          await _secureDelete('/students/$studentId/chat-sessions/$sessionId');
      return response.statusCode >= 200 && response.statusCode < 300;
    } catch (e) {
      if (kDebugMode) debugPrint('Delete chat session error: $e');
      return false;
    }
  }

  static Future<void> updateSettings({
    String? branch,
    String? goalUniversity,
    String? examDate,
    String? goalScore,
  }) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/update-settings', {
        if (branch != null) 'branch': branch,
        if (goalUniversity != null) 'goalUniversity': goalUniversity,
        if (examDate != null) 'examDate': examDate,
        if (goalScore != null) 'goalScore': goalScore,
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Settings sync error: $e');
    }
  }

  static Future<void> syncAchievements(List<String> achievements) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/sync-achievements', {
        'unlockedAchievements': achievements,
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Achievements sync error: $e');
    }
  }

  static Future<List<dynamic>> getStudentExams() async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return [];
      final studentId = student['id'];

      final response = await _secureGet('/students/$studentId/exams');
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get exams error: $e');
    }
    return [];
  }

  static Future<List<SmartQuizAttempt>> getSmartQuizAttempts() async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return [];
      final studentId = student['id'];

      final response = await _secureGet('/students/$studentId/smart-quiz/attempts');
      if (response.statusCode == 200) {
        final list = List<Map<String, dynamic>>.from(jsonDecode(response.body));
        return list.map((a) => SmartQuizAttempt.fromJson(a)).toList();
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get smart quiz attempts error: $e');
    }
    return [];
  }

  static Future<List<Map<String, dynamic>>> getAssignedContents() async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return [];
      final studentId = student['id'];

      final response = await _secureGet('/students/$studentId/assigned-contents');
      if (response.statusCode == 200) {
        final list = List<Map<String, dynamic>>.from(jsonDecode(response.body));
        return list;
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get assigned contents error: $e');
    }
    return [];
  }

  static Future<String?> downloadAssignedContentPdf(int recipientId) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return null;
      final studentId = student['id'];

      final response =
          await _secureGet('/students/$studentId/assigned-contents/$recipientId/file');
      if (response.statusCode != 200) return null;

      final directory = await getTemporaryDirectory();
      final file = File(
        '${directory.path}/assigned_content_$recipientId.pdf',
      );
      await file.writeAsBytes(response.bodyBytes, flush: true);
      return file.path;
    } catch (e) {
      if (kDebugMode) debugPrint('Download assigned content pdf error: $e');
    }
    return null;
  }

  static Future<void> syncAssignedContentProgress({
    required int recipientId,
    String? status,
    DateTime? openedAt,
    DateTime? completedAt,
    int? activeDurationSeconds,
    int? wallDurationSeconds,
    Map<String, dynamic>? selectedAnswers,
    Map<String, dynamic>? resultSummary,
    Map<String, dynamic>? integrityLog,
  }) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/assigned-contents/$recipientId/progress', {
        if (status != null) 'status': status,
        if (openedAt != null) 'openedAt': openedAt.toIso8601String(),
        if (completedAt != null) 'completedAt': completedAt.toIso8601String(),
        if (activeDurationSeconds != null)
          'activeDurationSeconds': activeDurationSeconds,
        if (wallDurationSeconds != null)
          'wallDurationSeconds': wallDurationSeconds,
        if (selectedAnswers != null) 'selectedAnswers': selectedAnswers,
        if (resultSummary != null) 'resultSummary': resultSummary,
        if (integrityLog != null) 'integrityLog': integrityLog,
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Assigned content progress sync error: $e');
    }
  }

  static Future<SmartQuizAttempt?> getSmartQuizAttempt(String attemptId) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return null;
      final studentId = student['id'];

      final response =
          await _secureGet('/students/$studentId/smart-quiz/attempts/$attemptId');
      if (response.statusCode == 200) {
        return SmartQuizAttempt.fromJson(
          Map<String, dynamic>.from(jsonDecode(response.body)),
        );
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get smart quiz attempt error: $e');
    }
    return null;
  }

  /// Fetch curriculum from DB filtered by branch
  static Future<List<dynamic>> fetchCurriculum(String branch) async {
    try {
      final uri = Uri.parse('$baseUrl/curriculum').replace(
        queryParameters: {'branch': branch},
      );
      final headers = await _authHeaders();
      final response = await _client
          .get(uri, headers: headers)
          .timeout(const Duration(seconds: 15));
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('fetchCurriculum error: $e');
    }
    return [];
  }
  // ==================== CACHE MANAGEMENT ====================

  static Future<Map<String, dynamic>?> checkCache({
    required String course,
    String? questionText,
    String? base64Image,
    String? ocrText,
    String? interactionType,
    bool hasRecentContext = false,
    http.Client? client,
  }) async {
    try {
      final response = await _securePost('/questions/cache/check', {
        'course': course,
        if (questionText != null) 'questionText': questionText,
        if (base64Image != null) 'base64Image': base64Image,
        if (ocrText != null) 'ocrText': ocrText,
        if (interactionType != null) 'interactionType': interactionType,
        'hasRecentContext': hasRecentContext,
      }, client: client);
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (e) {
      if (kDebugMode) debugPrint("Cache check error: $e");
    }
    return null;
  }

  static Future<void> saveCache({
    required String course,
    required String answer,
    String? questionText,
    List<double>? embedding,
    int? cacheRecordId,
    String? cacheVariant,
    String? traditionalHash,
    String? imageHash,
    String? semanticHash,
  }) async {
    try {
      await _securePost('/questions/cache/save', {
        'course': course,
        'answer': answer,
        if (questionText != null) 'questionText': questionText,
        if (embedding != null) 'embedding': embedding,
        if (cacheRecordId != null) 'cacheRecordId': cacheRecordId,
        if (cacheVariant != null) 'cacheVariant': cacheVariant,
        if (traditionalHash != null) 'traditionalHash': traditionalHash,
        if (imageHash != null) 'imageHash': imageHash,
        if (semanticHash != null) 'semanticHash': semanticHash,
      });
    } catch (e) {
      if (kDebugMode) debugPrint("Cache save error: $e");
    }
  }

  static Future<String?> askAi({
    required String prompt,
    required String course,
    String? systemInstruction,
    List<Map<String, String>>? history,
    String? base64Image,
    String? imageMimeType,
    String? feature,
    http.Client? client,
  }) async {
    try {
      // Sohbet geçmişi limitleniyor: AI token aşımlarını önlemek için en fazla son 8 mesaj (4 soru + 4 cevap) gönderilir
      List<Map<String, String>>? limitedHistory;
      if (history != null) {
        limitedHistory = history.length > 8 ? history.sublist(history.length - 8) : history;
      }

      final response = await _securePost('/ai/ask', {
        'prompt': prompt,
        'course': course,
        if (systemInstruction != null) 'systemInstruction': systemInstruction,
        if (limitedHistory != null) 'history': limitedHistory,
        if (base64Image != null) 'base64Image': base64Image,
        if (imageMimeType != null) 'imageMimeType': imageMimeType,
        if (feature != null) 'feature': feature,
      }, timeout: const Duration(seconds: 90), client: client);
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['answer'];
      }
    } catch (e) {
      if (kDebugMode) debugPrint("AI Ask error: $e");
    }
    return null;
  }

  static Future<void> syncSmartQuizPlan(
    SmartQuizPlan plan, {
    String status = 'pending',
  }) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/smart-quiz/plan', {
        'plan': {
          ...plan.toJson(),
          'status': status,
        }
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Smart quiz plan sync error: $e');
    }
  }

  static Future<void> completeSmartQuiz({
    required String attemptId,
    required String course,
    required String topic,
    required int correctCount,
    required int totalCount,
    required double score,
    required String sourceLastActivityAt,
  }) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/smart-quiz/complete', {
        'attemptId': attemptId,
        'course': course,
        'topic': topic,
        'correctCount': correctCount,
        'totalCount': totalCount,
        'score': score,
        'sourceLastActivityAt': sourceLastActivityAt,
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Smart quiz complete sync error: $e');
    }
  }

  static Future<void> syncSmartQuizProgress({
    required SmartQuizPlan plan,
    required SmartQuizProgress progress,
  }) async {
    try {
      final student = await getStudentData();
      if (student == null || student['id'] == null) return;
      final studentId = student['id'];

      await _securePost('/students/$studentId/smart-quiz/progress', {
        'attemptId': plan.id,
        'course': plan.course,
        'topic': plan.topic,
        'sourceLastActivityAt': plan.sourceLastActivityAt.toIso8601String(),
        'progress': progress.toJson(),
      });
    } catch (e) {
      if (kDebugMode) debugPrint('Smart quiz progress sync error: $e');
    }
  }

  static Future<String?> retryAi({
    required String prompt,
    required String course,
    String? systemInstruction,
    List<Map<String, String>>? history,
    String? base64Image,
    String? imageMimeType,
    int? cacheRecordId,
    String? cacheSource,
    double? cacheSimilarity,
    String? traditionalHash,
    String? imageHash,
    String? semanticHash,
    http.Client? client,
  }) async {
    try {
      final studentData = await getStudentData();
      if (studentData == null) return null;
      final studentId = studentData['id'];

      List<Map<String, String>>? limitedHistory;
      if (history != null) {
        limitedHistory = history.length > 8 ? history.sublist(history.length - 8) : history;
      }

      final response = await _securePost('/students/$studentId/ai-retry', {
        'prompt': prompt,
        'course': course,
        if (systemInstruction != null) 'systemInstruction': systemInstruction,
        if (limitedHistory != null) 'history': limitedHistory,
        if (base64Image != null) 'base64Image': base64Image,
        if (imageMimeType != null) 'imageMimeType': imageMimeType,
        if (cacheRecordId != null) 'cacheRecordId': cacheRecordId,
        if (cacheSource != null) 'cacheSource': cacheSource,
        if (cacheSimilarity != null) 'cacheSimilarity': cacheSimilarity,
        if (traditionalHash != null) 'traditionalHash': traditionalHash,
        if (imageHash != null) 'imageHash': imageHash,
        if (semanticHash != null) 'semanticHash': semanticHash,
      }, timeout: const Duration(seconds: 90), client: client);
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['answer'];
      }
    } catch (e) {
      if (kDebugMode) debugPrint("AI Retry error: $e");
    }
    return null;
  }

  // ==================== GUIDANCE & APPOINTMENTS ====================
  static Future<List<Appointment>> getAppointments() async {
    try {
      final response = await _secureGet('/appointments');
      if (response.statusCode == 200) {
        final list = List<Map<String, dynamic>>.from(jsonDecode(response.body));
        return list.map((a) => Appointment.fromJson(a)).toList();
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get appointments error: $e');
    }
    return [];
  }

  static Future<List<GuidanceAssignment>> getMyGuidanceAssignments() async {
    try {
      final response = await _secureGet('/guidance/my-assignments');
      if (response.statusCode == 200) {
        final rawList = jsonDecode(response.body);
        if (rawList is List) {
          return rawList.map((a) => GuidanceAssignment.fromJson(a)).toList();
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get guidance assignments error: $e');
    }
    return [];
  }

  static Future<bool> submitGuidanceResponse(int assignmentId, List<Map<String, dynamic>> answers) async {
    try {
      final response = await _securePost('/guidance/assignments/$assignmentId/submit', {
        'answers': answers,
      });
      return response.statusCode == 200;
    } catch (e) {
      if (kDebugMode) debugPrint('Submit guidance response error: $e');
      return false;
    }
  }

  static Future<WeeklyCurriculum?> getMyCurriculum() async {
    try {
      final response = await _secureGet('/guidance/curriculum');
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data != null) {
          return WeeklyCurriculum.fromJson(data);
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('Get curriculum error: $e');
    }
    return null;
  }

  static Future<bool> updateCurriculumTaskStatus(int taskId, String status) async {
    try {
      final response = await _securePost('/guidance/curriculum/tasks/$taskId/status', {
        'status': status,
      });
      return response.statusCode == 200;
    } catch (e) {
      if (kDebugMode) debugPrint('Update task status error: $e');
      return false;
    }
  }
}
