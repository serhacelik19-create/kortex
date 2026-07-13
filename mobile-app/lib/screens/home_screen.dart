import 'package:flutter/material.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/services/ai_service.dart';
import 'package:yks/data/course_data.dart';
import 'package:yks/theme/app_theme.dart';
import 'package:yks/screens/question_screen.dart';
import 'package:yks/screens/explanation_screen.dart';
import 'package:yks/screens/quiz_screen.dart';

import 'package:yks/screens/curriculum_screen.dart';
import 'package:yks/screens/topic_map_screen.dart';
import 'package:yks/models/chat_session.dart';
import 'package:yks/models/smart_quiz.dart';
import 'package:yks/screens/guidance_screen.dart';
import 'dart:async';
import 'package:yks/services/api_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int streak = 0;
  String selectedCourseId = 'tyt_mat';
  int daysToExam = 0;

  // Parity Analytical States
  Map<String, int> weeklyComp = {'thisWeek': 0, 'lastWeek': 0};
  String? studyPlanMsg;
  String? aiAdvice;
  bool isAdviceLoading = false;

  String _currentWeekKey() {
    final now = DateTime.now();
    final weekStart = now.subtract(Duration(days: now.weekday - 1));
    return weekStart.toIso8601String().split('T')[0];
  }
  bool _isCoursesExpanded = false;
  String userBranch = 'Sayısal';
  bool _isTytExpanded = false;
  bool _isAytExpanded = false;
  bool _isGuidanceExpanded = false;
  SmartQuizPlan? smartQuizPlan;
  List<dynamic> _notifications = [];

  static const String _aiUnavailableMessage = "Sunucudan yanıt alınamadı.";

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    await StorageService.init();
    await StorageService.refreshChatSessionsFromServer();
    final currentStreak = await StorageService.updateStreak();
    final settings = StorageService.getUserSettings();
    final quizPlan = await StorageService.refreshSmartQuizPlan();

    // Countdown
    final savedExamDate = StorageService.getExamDate();
    final examDate = savedExamDate != null
        ? DateTime.parse(savedExamDate)
        : DateTime(2026, 6, 20);
    final today = DateTime.now();
    final diff = examDate.difference(today).inDays;

    final wComp = StorageService.getWeeklyComparison();

    if (mounted) {
      setState(() {
        streak = currentStreak;
        daysToExam = diff;
        userBranch = settings?['branch'] ?? "Sayısal";
        weeklyComp = wComp;
        smartQuizPlan = quizPlan;
      });
      _fetchDailyAdvice();
      _calculateStudyPlan(diff);
      _loadNotifications();

      // Ana sayfadaki ders seçiminde tüm dersler (TYT + AYT) seçilebilir.
      if (!courseTopics.any((c) => c.id == selectedCourseId)) {
        setState(() {
          selectedCourseId = courseTopics.isNotEmpty ? courseTopics[0].id : 'tyt_mat';
        });
      }
    }
  }

  Future<void> _refreshRecentChats() async {
    await StorageService.refreshChatSessionsFromServer();
    if (!mounted) return;
    setState(() {});
  }

  Future<void> _loadNotifications() async {
    try {
      final notifs = await ApiService.getNotifications();
      if (mounted) {
        setState(() {
          _notifications = notifs;
        });
      }
    } catch (e) {
      debugPrint('Load notifications error: $e');
    }
  }

  void _calculateStudyPlan(int daysLeft) {
    if (daysLeft <= 0) return;
    final topicStats = StorageService.getTopicStats();

    int totalTopics = 0;
    int completed = 0;

    void count(String courseId, List<Topic> list) {
      for (var t in list) {
        if (t.subTopics != null && t.subTopics!.isNotEmpty) {
          count(courseId, t.subTopics!);
        } else {
          totalTopics++;
          final key = "$courseId|${t.id}";
          if (topicStats[key] != null &&
              (topicStats[key]['questions'] ?? 0) > 0) {
            completed++;
          }
        }
      }
    }

    final filteredCourses = getFilteredCourseTopics(userBranch);
    for (var c in filteredCourses) {
      count(c.id, c.topics);
    }

    int remaining = totalTopics - completed;

    if (remaining > 0) {
      int dailyTarget = (remaining / daysLeft).ceil();
      setState(() {
        studyPlanMsg =
            "Sınava $daysLeft gün kaldı, tahmini $remaining konun var. Günde en az $dailyTarget konu bitirmelisin!";
      });
    }
  }

  Future<void> _fetchDailyAdvice() async {
    final weekKey = _currentWeekKey();
    final cached = StorageService.getDailyAdvice();
    if (cached != null &&
        cached['week'] == weekKey &&
        _isUsableAiText((cached['advice'] ?? '').toString())) {
      setState(() => aiAdvice = cached['advice']);
      return;
    }

    if (cached != null && cached['week'] == weekKey) {
      await StorageService.clearDailyAdvice();
    }

    setState(() => isAdviceLoading = true);
    try {
      final stats = StorageService.getCourseStats();
      final statsStr =
          stats.entries.map((e) => "${e.key}: ${e.value} soru").join(", ");
      final prompt =
          "Öğrencinin istatistikleri: $statsStr. Tek cümle ile bugün için çok kısa, motive edici bir tavsiye ver. Türkçe, emoji kullan.";
      final advice = await AIService.askGemini(
          prompt: prompt,
          course: "Rehberlik",
          systemInstruction: "Sen bir YKS danışmanısın.");

      if (!_isUsableAiText(advice)) {
        if (mounted) {
          setState(() => aiAdvice = null);
        }
        await StorageService.clearDailyAdvice();
        return;
      }

      if (mounted) {
        setState(() => aiAdvice = advice);
        await StorageService.saveDailyAdvice({'advice': advice, 'week': weekKey});
      }
    } catch (e) {
      debugPrint(e.toString());
      if (mounted) {
        setState(() => aiAdvice = null);
      }
    } finally {
      if (mounted) setState(() => isAdviceLoading = false);
    }
  }

  bool _isUsableAiText(String text) {
    final normalized = text.trim();
    if (normalized.isEmpty) return false;
    if (normalized == _aiUnavailableMessage) return false;
    if (normalized == "Sunucudan yeniden yanıt alınamadı.") return false;
    if (normalized.toLowerCase().contains("sunucu bağlantı hatası")) return false;
    return true;
  }

  void _navigateToMode(String mode) {
    final course = courseTopics.firstWhere((c) => c.id == selectedCourseId,
        orElse: () => courseTopics.first);
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) {
          if (mode == 'question') {
            return QuestionScreen(initialCourse: course.name);
          } else {
            return ExplanationScreen(initialCourse: course.name);
          }
        },
      ),
    ).then((_) => _refreshRecentChats());
  }

  @override
  Widget build(BuildContext context) {
    if (courseTopics.isEmpty) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(),
              if (_notifications.isNotEmpty) ...[
                const SizedBox(height: 20),
                _buildAnnouncementCard(),
              ],
              const SizedBox(height: 20),
              _buildCountdownCard(),
              const SizedBox(height: 20),
              _buildExpandableCourseSelection(),
              const SizedBox(height: 20),
              _buildActionGrid(),
              const SizedBox(height: 20),
              _buildCurriculumProgress(),
              const SizedBox(height: 20),
              if (smartQuizPlan != null) _buildSmartQuizCard(),
              if (smartQuizPlan != null) const SizedBox(height: 20),
              if (aiAdvice != null || isAdviceLoading || studyPlanMsg != null)
                _buildGuidanceCard(),
              const SizedBox(height: 20),
              _buildWeeklyComparisonCard(),
              const SizedBox(height: 20),
              _buildRecentQuestions(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "Bugün neye odaklanalım?",
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
              ),
              Text(
                "Alan: ${StorageService.getUserSettings()?['branch'] ?? 'Belirlenmedi'}",
                style: const TextStyle(color: Colors.grey, fontSize: 13),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.orange.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.orange.withValues(alpha: 0.2)),
          ),
          child: Row(
            children: [
              const Text("🔥", style: TextStyle(fontSize: 16)),
              const SizedBox(width: 4),
              Text(
                "$streak",
                style: const TextStyle(
                    fontWeight: FontWeight.bold, color: Colors.orange),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildAnnouncementCard() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final latest = _notifications.first;
    
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isDark 
            ? [const Color(0xFF1E1B4B), const Color(0xFF312E81)]
            : [const Color(0xFFEEF2FF), const Color(0xFFE0E7FF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark ? const Color(0xFF4338CA).withValues(alpha: 0.5) : const Color(0xFFC7D2FE),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.indigo.withValues(alpha: isDark ? 0.2 : 0.1),
            blurRadius: 15,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.indigo.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.campaign, color: Colors.indigo, size: 20),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  "Yeni Sınav Duyurusu",
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: Colors.indigo,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            "${latest['type']} Deneme Sınavı",
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _buildAnnouncementMeta(Icons.calendar_today, latest['date']),
              const SizedBox(width: 16),
              _buildAnnouncementMeta(Icons.access_time, latest['time']),
            ],
          ),
          if (latest['note'] != null && latest['note'].toString().isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              latest['note'],
              style: TextStyle(
                fontSize: 13,
                color: isDark ? Colors.grey[400] : Colors.grey[700],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAnnouncementMeta(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 14, color: Colors.indigo.withValues(alpha: 0.7)),
        const SizedBox(width: 6),
        Text(
          text,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Colors.indigo,
          ),
        ),
      ],
    );
  }

  Widget _buildCountdownCard() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isDark
              ? [const Color(0xFF2A2215), const Color(0xFF332B18)]
              : [const Color(0xFFFFFCF4), const Color(0xFFF9E7B8)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark ? const Color(0xFF5C4A1E) : const Color(0xFFE2C980),
        ),
        boxShadow: [
          BoxShadow(
            color: isDark
                ? Colors.black.withValues(alpha: 0.3)
                : const Color(0xFFD4B15A).withValues(alpha: 0.14),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                    color: isDark
                        ? Colors.white.withValues(alpha: 0.08)
                        : Colors.white.withValues(alpha: 0.92),
                    borderRadius: BorderRadius.circular(12)),
                child: const Text("⏳", style: TextStyle(fontSize: 20)),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("YKS'ye Kalan Süre",
                      style: TextStyle(
                          color: isDark ? const Color(0xFFD4A843) : const Color(0xFF8D6A16),
                          fontSize: 12)),
                  Text("$daysToExam Gün",
                      style: TextStyle(
                          color: isDark ? const Color(0xFFE8C96A) : const Color(0xFF5E4300),
                          fontSize: 24,
                          fontWeight: FontWeight.bold)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildExamTabCard(
      String title, bool isExpanded, VoidCallback onTap, Widget content) {
    return Column(
      children: [
        GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: 0.1)),
            ),
            child: Row(
              children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.bold)),
                const Spacer(),
                Icon(
                  isExpanded
                      ? Icons.keyboard_arrow_up
                      : Icons.keyboard_arrow_down,
                  color: Colors.grey,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
        AnimatedCrossFade(
          firstChild: Padding(
            padding: const EdgeInsets.only(top: 10, bottom: 10),
            child: content,
          ),
          secondChild: const SizedBox.shrink(),
          crossFadeState:
              isExpanded ? CrossFadeState.showFirst : CrossFadeState.showSecond,
          duration: const Duration(milliseconds: 300),
        ),
      ],
    );
  }

  Widget _buildExamTabsAndGrid() {
    return Column(
      children: [
        _buildExamTabCard(
          "TYT Dersleri",
          _isTytExpanded,
          () => setState(() => _isTytExpanded = !_isTytExpanded),
          _buildSpecificCourseGrid(tytCourseTopics, key: const ValueKey('TYT')),
        ),
        const SizedBox(height: 10),
        _buildExamTabCard(
          "AYT Dersleri",
          _isAytExpanded,
          () => setState(() => _isAytExpanded = !_isAytExpanded),
          _buildSpecificCourseGrid(aytCourseTopics,
              key: const ValueKey('AYT')),
        ),
      ],
    );
  }

  Widget _buildSpecificCourseGrid(List<CourseTopics> courses, {Key? key}) {
    return Wrap(
      key: key,
      spacing: 10,
      runSpacing: 10,
      children: courses.map((course) {
        final isSelected = selectedCourseId == course.id;
        return GestureDetector(
          onTap: () => setState(() => selectedCourseId = course.id),
          onLongPress: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (context) => TopicMapScreen(
                      title: course.name,
                      topics: course.topics,
                      courseId: course.id)),
            );
          },
          child: Container(
            width: (MediaQuery.of(context).size.width - 50) / 2,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppTheme.primaryColor.withValues(alpha: 0.1)
                  : Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color:
                    isSelected ? AppTheme.primaryColor : Theme.of(context).dividerColor.withValues(alpha: 0.1),
                width: 1.5,
              ),
            ),
            child: Row(
              children: [
                Text(course.icon, style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    course.name,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color:
                          isSelected ? AppTheme.primaryColor : Theme.of(context).textTheme.bodyMedium?.color,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildExpandableCourseSelection() {
    return Column(
      children: [
        GestureDetector(
          onTap: () => setState(() => _isCoursesExpanded = !_isCoursesExpanded),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: 0.1)),
            ),
            child: Row(
              children: [
                const Text("📚 ", style: TextStyle(fontSize: 20)),
                const Text(
                  "Ders Seçimi",
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                Icon(
                  _isCoursesExpanded
                      ? Icons.keyboard_arrow_up
                      : Icons.keyboard_arrow_down,
                  color: Colors.grey,
                ),
              ],
            ),
          ),
        ),
        AnimatedCrossFade(
          firstChild: Padding(
            padding: const EdgeInsets.only(top: 15),
            child: _buildExamTabsAndGrid(),
          ),
          secondChild: const SizedBox.shrink(),
          crossFadeState: _isCoursesExpanded
              ? CrossFadeState.showFirst
              : CrossFadeState.showSecond,
          duration: const Duration(milliseconds: 300),
        ),
      ],
    );
  }

  Widget _buildActionGrid() {
    final course = courseTopics.firstWhere((c) => c.id == selectedCourseId,
        orElse: () => courseTopics.first);
    final courseName = course.name;
    return Row(
      children: [
        Expanded(
            child: _buildActionCard("📸", "Soruyu Çözdür", courseName,
                AppTheme.primaryColor, () => _navigateToMode('question'))),
        const SizedBox(width: 12),
        Expanded(
            child: _buildActionCard("📖", "Konu Anlatımı", courseName,
                AppTheme.secondaryColor, () => _navigateToMode('explanation'))),
      ],
    );
  }

  Widget _buildActionCard(String emoji, String title, String subtitle,
      Color color, VoidCallback onTap) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bool isPrimaryCard = color == AppTheme.primaryColor;
    final List<Color> gradientColors = isDark
        ? (isPrimaryCard
            ? [const Color(0xFF2A2215), const Color(0xFF332B18)]
            : [const Color(0xFF2E2512), const Color(0xFF3A2F14)])
        : (isPrimaryCard
            ? [const Color(0xFFFFFAEE), const Color(0xFFF2DEAE)]
            : [const Color(0xFFFFF6E5), const Color(0xFFEBCB8B)]);
    final Color borderColor = isDark
        ? const Color(0xFF5C4A1E)
        : (isPrimaryCard ? const Color(0xFFE6CF92) : const Color(0xFFE0C177));
    final Color cardShadowColor = isDark
        ? Colors.black.withValues(alpha: 0.3)
        : (isPrimaryCard ? const Color(0xFFD5B56C) : const Color(0xFFD0A85A));
    final Color titleColor = isDark ? const Color(0xFFE8C96A) : const Color(0xFF5E4300);
    final Color subtitleColor = isDark ? const Color(0xFFD4A843) : const Color(0xFF8D6A16);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: gradientColors,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: borderColor),
          boxShadow: [
            BoxShadow(
              color: cardShadowColor.withValues(alpha: isDark ? 0.3 : 0.12),
              blurRadius: 16,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.white.withValues(alpha: 0.08)
                    : const Color(0xFFFFFCF4),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(emoji, style: const TextStyle(fontSize: 24)),
            ),
            const SizedBox(height: 10),
            Text(title,
                style: TextStyle(
                    color: titleColor, fontWeight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text(subtitle,
                style: TextStyle(color: subtitleColor, fontSize: 11)),
          ],
        ),
      ),
    );
  }

  Widget _buildAIAdviceCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.primaryColor.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Text("🤖 ", style: TextStyle(fontSize: 20)),
              Text("AI Günlük Tavsiye",
                  style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.primaryColor)),
            ],
          ),
          const SizedBox(height: 8),
          if (isAdviceLoading)
            const LinearProgressIndicator(minHeight: 2)
          else
            Text(aiAdvice ?? "",
                style:
                    const TextStyle(fontSize: 14, fontStyle: FontStyle.italic)),
        ],
      ),
    );
  }

  Widget _buildStudyPlanCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.orange.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.orange.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          const Text("📅 ", style: TextStyle(fontSize: 24)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Akıllı Çalışma Planı",
                    style: TextStyle(
                        fontWeight: FontWeight.bold, color: Colors.orange)),
                Text(studyPlanMsg ?? "", style: const TextStyle(fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInstitutionGuidanceCard() {
    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (context) => const GuidanceScreen()),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF6366F1).withValues(alpha: 0.2),
              blurRadius: 15,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: const Row(
          children: [
            Text("🤝 ", style: TextStyle(fontSize: 28)),
            SizedBox(width: 15),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Kurumsal Rehberlik",
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 18),
                  ),
                  Text(
                    "Randevuların ve anketlerin burada.",
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.white),
          ],
        ),
      ),
    );
  }

  Widget _buildGuidanceCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Theme.of(context).dividerColor.withValues(alpha: 0.1),
        ),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).shadowColor.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () =>
                setState(() => _isGuidanceExpanded = !_isGuidanceExpanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  const Text("🧭 ", style: TextStyle(fontSize: 20)),
                  const Text(
                    "Günlük Rehberlik",
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const Spacer(),
                  Icon(
                    _isGuidanceExpanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    color: Colors.grey,
                  ),
                ],
              ),
            ),
          ),
          AnimatedCrossFade(
            firstChild: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                children: [
                  if (aiAdvice != null || isAdviceLoading) _buildAIAdviceCard(),
                  if (studyPlanMsg != null) _buildStudyPlanCard(),
                ],
              ),
            ),
            secondChild: const SizedBox.shrink(),
            crossFadeState: _isGuidanceExpanded
                ? CrossFadeState.showFirst
                : CrossFadeState.showSecond,
            duration: const Duration(milliseconds: 250),
          ),
        ],
      ),
    );
  }

  Widget _buildCurriculumProgress() {
    final topicStats = StorageService.getTopicStats();
    int totalTopics = 0;
    int completedCount = 0;

    void processTopics(String courseId, List<Topic> list) {
      for (var t in list) {
        if (t.subTopics != null && t.subTopics!.isNotEmpty) {
          processTopics(courseId, t.subTopics!);
        } else {
          totalTopics++;
          final key = "$courseId|${t.id}";
          if (topicStats[key] != null &&
              (topicStats[key]['questions'] ?? 0) > 0) {
            completedCount++;
          }
        }
      }
    }

    final filteredCourses = getFilteredCourseTopics(userBranch);
    for (var course in filteredCourses) {
      processTopics(course.id, course.topics);
    }

    double progress = totalTopics > 0 ? completedCount / totalTopics : 0;
    int percentage = (progress * 100).round();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: 0.1)),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).shadowColor.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Müfredat İlerlemesi",
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  Text(
                    "Tüm dersler bazında bitirme durumu",
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.accentColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  "%$percentage",
                  style: const TextStyle(
                    color: AppTheme.accentColor,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 10,
              backgroundColor: Theme.of(context).brightness == Brightness.dark
                  ? Colors.grey.shade800
                  : Colors.grey.shade100,
              valueColor: AlwaysStoppedAnimation<Color>(AppTheme.accentColor),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                "$completedCount / $totalTopics Konu Tamamlandı",
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.adaptiveGrey(context)),
              ),
              TextButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const CurriculumScreen(),
                    ),
                  );
                },
                child: const Row(
                  children: [
                    Text("Detaylar", style: TextStyle(fontSize: 12)),
                    Icon(Icons.chevron_right, size: 16),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildWeeklyComparisonCard() {
    int change = 0;
    final int thisWeekVal = weeklyComp['thisWeek'] ?? 0;
    final int lastWeekVal = weeklyComp['lastWeek'] ?? 0;

    if (lastWeekVal > 0) {
      change = (((thisWeekVal - lastWeekVal) / lastWeekVal) * 100).round();
    } else if (thisWeekVal > 0) {
      change = 100;
    }

    bool isUp = change >= 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isUp
            ? Colors.green.withValues(alpha: 0.05)
            : Colors.red.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: isUp
                ? Colors.green.withValues(alpha: 0.1)
                : Colors.red.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          Text(isUp ? "📈 " : "📉 ", style: const TextStyle(fontSize: 24)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Haftalık Karşılaştırma",
                    style: TextStyle(fontWeight: FontWeight.bold)),
                Text(
                  "Bu hafta: $thisWeekVal soru | Geçen hafta: $lastWeekVal soru",
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: isUp ? Colors.green : Colors.red,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              "${isUp ? '+' : ''}$change%",
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSmartQuizCard() {
    final plan = smartQuizPlan!;
    final displayRiskLabel = _normalizeRiskLabel(plan.riskLabel);
    final hoursSinceTouch =
        DateTime.now().difference(plan.sourceLastActivityAt).inHours;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isDark
              ? [const Color(0xFF2A2010), const Color(0xFF2E2212)]
              : [const Color(0xFFFFFBEB), const Color(0xFFFFF7ED)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
            color: isDark
                ? Colors.orange.withValues(alpha: 0.25)
                : Colors.orange.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.08)
                      : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  Icons.quiz_rounded,
                  color: Colors.orange.shade700,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Akilli Quiz',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      displayRiskLabel,
                      style: TextStyle(
                        color: Colors.orange.shade800,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            '${plan.topic} konusu icin kisa bir tarama hazirlandi.',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            '${plan.reason} Son temasin uzerinden yaklasik $hoursSinceTouch saat gecti; bu quiz kaliciligi olcmek icin acildi.',
            style: TextStyle(
              color: AppTheme.adaptiveGrey(context),
              height: 1.45,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _buildQuizMetaPill(
                Icons.menu_book_rounded,
                plan.course,
              ),
              const SizedBox(width: 8),
              _buildQuizMetaPill(
                Icons.auto_awesome_rounded,
                '${plan.questionCount} soru • ${plan.explanationCount} konu',
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: () async {
                final completed = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => QuizScreen(plan: plan),
                  ),
                );

                if (completed == true) {
                  final refreshedPlan = await StorageService.refreshSmartQuizPlan();
                  if (!mounted) return;
                  setState(() => smartQuizPlan = refreshedPlan);
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange.shade600,
                foregroundColor: Colors.white,
              ),
              child: const Text('Quizi Baslat'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuizMetaPill(IconData icon, String label) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.10) : Colors.white,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: isDark ? Colors.orange.shade300 : Colors.orange.shade800),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: isDark ? Colors.orange.shade200 : Colors.orange.shade900,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  String _normalizeRiskLabel(String label) {
    final trimmed = label.trim();
    if (trimmed.isEmpty) return '';

    return trimmed
        .replaceAll('Bugun', 'Bugün')
        .replaceAll('Cozulmeli', 'Çözülmeli')
        .replaceAll('Yuksek', 'Yüksek')
        .replaceAll('Oncelik', 'Öncelik');
  }

  Widget _buildRecentQuestions() {
    final allSessions = StorageService.getAllSessions();
    if (allSessions.isEmpty) return const SizedBox.shrink();

    final Map<String, ChatSession> latestByCourse = {};
    for (var s in allSessions) {
      if (!latestByCourse.containsKey(s.course) ||
          s.lastActivity.isAfter(latestByCourse[s.course]!.lastActivity)) {
        latestByCourse[s.course] = s;
      }
    }

    final sortedSessions = latestByCourse.values.toList()
      ..sort((a, b) => b.lastActivity.compareTo(a.lastActivity));
    final displaySessions = sortedSessions.take(5).toList();

    if (displaySessions.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text("🕒 Son Sohbetler",
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 10),
        SizedBox(
          height: 136,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: displaySessions.length,
            itemBuilder: (context, index) {
              final s = displaySessions[index];
              final isQuestion = s.mode == 'question';

              final course = courseTopics.firstWhere(
                  (c) => c.id == s.course || c.name == s.course,
                  orElse: () => courseTopics.first);

              return GestureDetector(
                onTap: () async {
                  if (isQuestion) {
                    await Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (context) =>
                                QuestionScreen(
                                  initialCourse: s.course,
                                  initialSessionId: s.id,
                                )));
                  } else {
                    await Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (context) =>
                                ExplanationScreen(
                                  initialCourse: s.course,
                                  initialSessionId: s.id,
                                )));
                  }
                  await _refreshRecentChats();
                },
                child: Container(
                  width: 240,
                  margin: const EdgeInsets.only(right: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Theme.of(context).cardColor,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: 0.1)),
                    boxShadow: [
                      BoxShadow(
                        color: Theme.of(context).shadowColor.withValues(alpha: 0.05),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      )
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: isQuestion
                                  ? AppTheme.primaryColor.withValues(alpha: 0.1)
                                  : AppTheme.secondaryColor
                                      .withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(isQuestion ? "📸" : "📖",
                                style: const TextStyle(fontSize: 14)),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              course.name,
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                                color: isQuestion
                                    ? AppTheme.primaryColor
                                    : AppTheme.secondaryColor,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const Spacer(),
                      Text(
                        s.threadTitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 13, color: AppTheme.adaptiveGrey(context)),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        s.threadSubtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          color: AppTheme.adaptiveGreySubtle(context),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
