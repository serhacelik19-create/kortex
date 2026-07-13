import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:pdfx/pdfx.dart';
import 'package:yks/models/assigned_exam_content.dart';
import 'package:yks/models/smart_quiz.dart';
import 'package:yks/components/app_toast.dart';
import 'package:yks/screens/quiz_screen.dart';
import 'package:yks/services/api_service.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/theme/app_theme.dart';

class ExamsScreen extends StatefulWidget {
  const ExamsScreen({super.key});

  @override
  State<ExamsScreen> createState() => _ExamsScreenState();
}

class _ExamsScreenState extends State<ExamsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isLoading = true;
  List<dynamic> _exams = [];
  List<AssignedExamContent> _assignedContents = [];
  List<SmartQuizAttempt> _smartQuizAttempts = [];
  String _quizFilter = 'all';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _fetchData();
  }

  Future<void> _fetchData() async {
    setState(() => _isLoading = true);

    final results = await Future.wait([
      ApiService.getStudentExams(),
      ApiService.getSmartQuizAttempts(),
      ApiService.getAssignedContents(),
    ]);

    if (!mounted) return;
    setState(() {
      _exams = results[0];
      _smartQuizAttempts = List<SmartQuizAttempt>.from(results[1]);
      _assignedContents = List<Map<String, dynamic>>.from(results[2])
          .map(_mapAssignedContent)
          .toList();
      _isLoading = false;
    });
  }

  AssignedExamContent _mapAssignedContent(Map<String, dynamic> json) {
    final content = Map<String, dynamic>.from(json['content'] ?? {});
    final sections = List<Map<String, dynamic>>.from(content['sections'] ?? []);

    return AssignedExamContent(
      id: '${json['id']}',
      recipientId: (json['id'] as num?)?.toInt() ?? 0,
      title: '${content['title'] ?? 'Deneme ve Test'}',
      type: _formatContentType('${content['type'] ?? 'test'}'),
      course: '${content['course'] ?? 'Genel'}',
      examScope: '${content['examScope'] ?? 'TYT'}',
      teacherNote: '${json['note'] ?? ''}',
      targetLabel: 'Ogretmen atamasi',
      expectedDurationMinutes:
          (json['expectedDurationMinutes'] as num?)?.toInt() ?? 90,
      totalPages: (content['totalPages'] as num?)?.toInt() ?? 1,
      requiresOptic: content['requiresOptic'] == true,
      dueText: _formatDueText(json['dueAt']?.toString()),
      status: _formatAssignedStatus('${json['status'] ?? 'pending'}'),
      rawStatus: '${json['status'] ?? 'pending'}',
      openedAt: DateTime.tryParse('${json['openedAt'] ?? ''}')?.toLocal(),
      completedAt:
          DateTime.tryParse('${json['completedAt'] ?? ''}')?.toLocal(),
      activeDurationSeconds:
          (json['activeDurationSeconds'] as num?)?.toInt() ?? 0,
      wallDurationSeconds: (json['wallDurationSeconds'] as num?)?.toInt() ?? 0,
      selectedAnswers: json['selectedAnswers'] is Map
          ? Map<String, dynamic>.from(json['selectedAnswers'] as Map)
          : null,
      resultSummary: json['resultSummary'] is Map
          ? Map<String, dynamic>.from(json['resultSummary'] as Map)
          : null,
      integrityLog: json['integrityLog'] is Map
          ? Map<String, dynamic>.from(json['integrityLog'] as Map)
          : null,
      sections: sections
          .map(
            (section) => AssignedExamSection(
              id: '${section['id']}',
              title: '${section['title'] ?? 'Bolum'}',
              course: '${section['course'] ?? section['title'] ?? 'Bolum'}',
              questionCount: (section['questionCount'] as num?)?.toInt() ?? 0,
              answerKey: List<dynamic>.from(section['answerKey'] ?? [])
                  .map((item) => item?.toString())
                  .toList(),
              startPage: (section['startPage'] as num?)?.toInt() ?? 1,
              endPage: (section['endPage'] as num?)?.toInt() ?? 1,
            ),
          )
          .toList(),
    );
  }

  String _formatContentType(String value) {
    switch (value) {
      case 'deneme':
        return 'Deneme';
      case 'odev':
        return 'Odev';
      case 'brans':
        return 'Brans Tarama';
      default:
        return 'Test';
    }
  }

  String _formatAssignedStatus(String value) {
    switch (value) {
      case 'completed':
        return 'Tamamlandi';
      case 'opened':
      case 'in_progress':
        return 'Devam Ediyor';
      default:
        return 'Bekliyor';
    }
  }

  String _formatDueText(String? rawValue) {
    if (rawValue == null || rawValue.isEmpty) return 'Teslim tarihi yok';

    final dueAt = DateTime.tryParse(rawValue)?.toLocal();
    if (dueAt == null) return rawValue;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final dueDay = DateTime(dueAt.year, dueAt.month, dueAt.day);
    final dayDiff = dueDay.difference(today).inDays;
    final timeText =
        '${dueAt.hour.toString().padLeft(2, '0')}:${dueAt.minute.toString().padLeft(2, '0')}';

    if (dayDiff == 0) return 'Bugun $timeText';
    if (dayDiff == 1) return 'Yarin $timeText';

    return '${dueAt.day.toString().padLeft(2, '0')}.${dueAt.month.toString().padLeft(2, '0')}.${dueAt.year} $timeText';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text("Olcme Merkezi",
            style: TextStyle(fontWeight: FontWeight.bold)),
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchData,
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppTheme.primaryColor,
          labelColor: AppTheme.primaryColor,
          tabs: const [
            Tab(text: "Denemeler"),
            Tab(text: "Deneme ve Testler"),
            Tab(text: "Akilli Quizler"),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildExamList(),
                _buildAssignedContentList(),
                _buildSmartQuizList(),
              ],
            ),
    );
  }

  Widget _buildExamList() {
    if (_exams.isEmpty) {
      return _buildEmptyState(
        icon: Icons.assignment_outlined,
        title: "Henuz kayitli deneme yok",
        subtitle: "Denemelerin panel uzerinden eklendiginde burada gorunecek.",
      );
    }

    return RefreshIndicator(
      onRefresh: _fetchData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _exams.length,
        itemBuilder: (context, index) {
          final exam = _exams[index];
          return ExamCard(exam: exam);
        },
      ),
    );
  }

  Widget _buildSmartQuizList() {
    if (_smartQuizAttempts.isEmpty) {
      return _buildEmptyState(
        icon: Icons.quiz_outlined,
        title: "Henuz akilli quiz yok",
        subtitle:
            "Sistem zorlandigin konulari takip edip zamani geldiginde burada quiz acacak.",
      );
    }

    final filteredAttempts = _smartQuizAttempts.where((attempt) {
      final hasDraft = attempt.hasSavedProgress;
      final isOpened = attempt.status == 'in_progress' || hasDraft;

      switch (_quizFilter) {
        case 'pending':
          return attempt.status == 'pending' && !isOpened;
        case 'draft':
          return isOpened;
        case 'completed':
          return attempt.status == 'completed';
        default:
          return true;
      }
    }).toList();

    return RefreshIndicator(
      onRefresh: _fetchData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildQuizFilterBar(),
          const SizedBox(height: 12),
          if (filteredAttempts.isEmpty)
            _buildInlineEmptyFilterState()
          else
            ...filteredAttempts.map((attempt) => SmartQuizAttemptCard(
                  attempt: attempt,
                  onRefresh: _fetchData,
                )),
        ],
      ),
    );
  }

  Widget _buildAssignedContentList() {
    if (_assignedContents.isEmpty) {
      return _buildEmptyState(
        icon: CupertinoIcons.doc_text_search,
        title: "Henuz atanan PDF yok",
        subtitle:
            "Ogretmenin panelden deneme veya test gonderdiginde burada goreceksin.",
      );
    }

    return RefreshIndicator(
      onRefresh: _fetchData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Builder(
            builder: (context) {
              final isDark = Theme.of(context).brightness == Brightness.dark;
              return Container(
                margin: const EdgeInsets.only(bottom: 14),
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: isDark ? Theme.of(context).cardColor : const Color(0xFFF6F8FF),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(
                      color: isDark ? Theme.of(context).dividerColor : const Color(0xFFD8E1FF)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(
                        color: isDark
                            ? AppTheme.primaryColor.withValues(alpha: 0.12)
                            : Colors.white,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(
                        CupertinoIcons.folder_badge_person_crop,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Ogretmenden Gelen Paketler',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'PDF deneme, test ve odev paketlerini burada acip sure takibiyle cozeceksin.',
                            style: TextStyle(
                              color: AppTheme.adaptiveGrey(context),
                              height: 1.35,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          ..._assignedContents.map(
            (content) => AssignedContentCard(
              content: content,
              onChanged: _fetchData,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuizFilterBar() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          _buildFilterChip('all', 'Hepsi'),
          const SizedBox(width: 10),
          _buildFilterChip('pending', 'Bekleyen'),
          const SizedBox(width: 10),
          _buildFilterChip('draft', 'Açıldı'),
          const SizedBox(width: 10),
          _buildFilterChip('completed', 'Tamamlandı'),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String value, String label) {
    final isSelected = _quizFilter == value;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => setState(() => _quizFilter = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        decoration: BoxDecoration(
          color: isSelected
              ? (isDark ? Colors.white : const Color(0xFF1F2A44))
              : (isDark ? Theme.of(context).cardColor : Colors.white),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: isSelected
                ? (isDark ? Colors.white : const Color(0xFF1F2A44))
                : (isDark ? Colors.grey.shade700 : Colors.grey.shade300),
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: (isDark ? Colors.white : const Color(0xFF1F2A44))
                        .withValues(alpha: 0.12),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: isSelected
                ? (isDark ? Colors.black : Colors.white)
                : AppTheme.adaptiveGrey(context),
          ),
        ),
      ),
    );
  }

  Widget _buildInlineEmptyFilterState() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        children: [
          Icon(Icons.filter_alt_off_rounded,
              color: Colors.grey.shade400, size: 28),
          const SizedBox(height: 10),
          Text(
            'Bu filtrede quiz yok',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: AppTheme.adaptiveGrey(context),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 80, color: Colors.grey.shade500),
            const SizedBox(height: 16),
            Text(
              title,
              style: TextStyle(
                fontSize: 18,
                color: AppTheme.adaptiveGrey(context),
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppTheme.adaptiveGreySubtle(context)),
            ),
          ],
        ),
      ),
    );
  }
}

class SmartQuizAttemptCard extends StatelessWidget {
  final SmartQuizAttempt attempt;
  final Future<void> Function() onRefresh;

  const SmartQuizAttemptCard({
    super.key,
    required this.attempt,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final pending = attempt.status == 'pending';
    final inProgress = attempt.status == 'in_progress';
    final completed = attempt.status == 'completed';
    final hasDraft = attempt.hasSavedProgress;
    final canOpenAgain = completed && attempt.progress != null;
    final isOpened = inProgress || hasDraft || canOpenAgain;
    final scoreText = attempt.score == null
        ? null
        : '%${((attempt.score ?? 0) * 100).round()}';
    final assignedText = attempt.assignedAt == null
        ? ''
        : _formatAssignedAt(attempt.assignedAt!);
    final displayRiskLabel = _normalizeRiskLabel(attempt.riskLabel);
    final hasRiskLabel = displayRiskLabel.isNotEmpty;
    final riskAccent = _riskAccentColor(displayRiskLabel);

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: attempt.status == 'completed'
              ? Colors.green.withValues(alpha: 0.18)
              : isOpened
                  ? Colors.deepOrange.withValues(alpha: 0.2)
                  : Colors.orange.withValues(alpha: 0.22),
        ),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).shadowColor.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: attempt.status == 'completed'
                            ? Colors.green.withValues(alpha: 0.1)
                            : isOpened
                                ? Colors.deepOrange.withValues(alpha: 0.1)
                                : Colors.orange.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        attempt.status == 'completed'
                            ? 'Tamamlandi'
                            : isOpened
                                ? 'Devam Eden Quiz'
                                : 'Bekleyen Quiz',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: attempt.status == 'completed'
                              ? Colors.green.shade700
                              : isOpened
                                  ? Colors.deepOrange.shade700
                                  : Colors.orange.shade800,
                        ),
                      ),
                    ),
                    if (hasRiskLabel)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: riskAccent.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          displayRiskLabel,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: riskAccent,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (scoreText != null)
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Text(
                    scoreText,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppTheme.primaryColor,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            attempt.topic,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            attempt.course,
            style: TextStyle(
              color: AppTheme.adaptiveGrey(context),
              fontWeight: FontWeight.w600,
            ),
          ),
          if (attempt.reason.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              attempt.reason,
              style: TextStyle(color: AppTheme.adaptiveGrey(context), height: 1.4),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _MetaPill(
                icon: Icons.schedule_rounded,
                label: assignedText.isEmpty ? 'Planlandi' : assignedText,
              ),
              if (hasDraft)
                const _MetaPill(
                  icon: Icons.save_outlined,
                  label: 'Kaldigin yer kayitli',
                ),
              _MetaPill(
                icon: Icons.stacked_bar_chart_rounded,
                label:
                    '${attempt.questionCount} soru • ${attempt.explanationCount} konu',
              ),
              if (attempt.correctCount != null && attempt.totalCount != null)
                _MetaPill(
                  icon: Icons.done_all_rounded,
                  label: '${attempt.correctCount}/${attempt.totalCount} dogru',
                ),
            ],
          ),
          if (pending || isOpened || completed) ...[
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () async {
                  final navigator = Navigator.of(context);
                  final plan = SmartQuizPlan(
                    id: attempt.id,
                    course: attempt.course,
                    topic: attempt.topic,
                    reason: attempt.reason.isNotEmpty
                        ? attempt.reason
                        : 'Bu konu icin sistem kisa bir quiz hazirladi.',
                    riskLabel:
                        attempt.riskLabel.isNotEmpty ? attempt.riskLabel : 'Quiz',
                    cooldownHours: attempt.cooldownHours,
                    sourceLastActivityAt:
                        attempt.sourceLastActivityAt ?? DateTime.now(),
                    assignedAt: attempt.assignedAt ?? DateTime.now(),
                    questionCount: attempt.questionCount,
                    explanationCount: attempt.explanationCount,
                  );
                  await StorageService.saveSmartQuizPlan(plan);

                  await navigator.push(
                    MaterialPageRoute(builder: (_) => QuizScreen(plan: plan)),
                  );
                  await onRefresh();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: isOpened
                      ? AppTheme.primaryColor
                          : Colors.orange.shade600,
                  foregroundColor: Colors.white,
                ),
                child: Text(
                  completed
                      ? 'Sonucu Gor'
                      : isOpened
                          ? 'Kaldigin Yerden Devam Et'
                          : 'Quizi Ac',
                ),
              ),
            ),
          ]
        ],
      ),
    );
  }

  String _formatAssignedAt(DateTime value) {
    const months = [
      'Oca',
      'Sub',
      'Mar',
      'Nis',
      'May',
      'Haz',
      'Tem',
      'Agu',
      'Eyl',
      'Eki',
      'Kas',
      'Ara',
    ];
    final day = value.day.toString();
    final month = months[value.month - 1];
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');
    return '$day $month, $hour:$minute';
  }

  String _normalizeRiskLabel(String label) {
    final trimmed = label.trim();
    if (trimmed.isEmpty) return '';

    const directMap = {
      'Bugun Cozulmeli': 'Bugün Çözülmeli',
      'Bugün Cozulmeli': 'Bugün Çözülmeli',
      'Bugun Çözülmeli': 'Bugün Çözülmeli',
      'Yuksek Oncelik': 'Yüksek Öncelik',
      'Takip Quizi': 'Takip Quizi',
      'Acil': 'Acil',
      'Orta Risk': 'Orta Risk',
    };

    if (directMap.containsKey(trimmed)) {
      return directMap[trimmed]!;
    }

    return trimmed
        .replaceAll('Bugun', 'Bugün')
        .replaceAll('Cozulmeli', 'Çözülmeli')
        .replaceAll('Yuksek', 'Yüksek')
        .replaceAll('Oncelik', 'Öncelik');
  }

  Color _riskAccentColor(String label) {
    final normalized = label.toLowerCase();
    if (normalized.contains('acil') || normalized.contains('yuksek')) {
      return Colors.redAccent;
    }
    if (normalized.contains('orta')) {
      return Colors.orange.shade700;
    }
    return AppTheme.primaryColor;
  }
}

class _MetaPill extends StatelessWidget {
  final IconData icon;
  final String label;

  const _MetaPill({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: AppTheme.adaptiveGrey(context)),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: AppTheme.adaptiveGrey(context),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class AssignedContentCard extends StatelessWidget {
  final AssignedExamContent content;
  final Future<void> Function() onChanged;

  const AssignedContentCard({
    super.key,
    required this.content,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final accent = content.type == 'Deneme'
        ? Colors.indigo
        : content.requiresOptic
            ? Colors.deepOrange
            : Colors.teal;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: accent.withValues(alpha: 0.14)),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).shadowColor.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: () async {
          final changed = await Navigator.of(context).push<bool>(
            MaterialPageRoute(
              builder: (_) => AssignedContentDetailScreen(content: content),
            ),
          );
          if (changed == true) {
            await onChanged();
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Icon(
                      content.type == 'Deneme'
                          ? CupertinoIcons.doc_richtext
                          : CupertinoIcons.doc_text,
                      color: accent,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _StatusChip(
                              label: content.status,
                              color: accent,
                            ),
                            _StatusChip(
                              label: content.examScope,
                              color: Colors.black87,
                              solid: false,
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          content.title,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          content.course,
                          style: TextStyle(
                            color: Colors.grey.shade700,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    CupertinoIcons.chevron_right,
                    size: 18,
                    color: Colors.grey.shade500,
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _MetaPill(
                    icon: Icons.schedule_rounded,
                    label: 'Teslim ${content.dueText}',
                  ),
                  _MetaPill(
                    icon: Icons.timer_outlined,
                    label: '${content.expectedDurationMinutes} dk',
                  ),
                  _MetaPill(
                    icon: Icons.picture_as_pdf_outlined,
                    label: '${content.totalPages} sayfa',
                  ),
                  _MetaPill(
                    icon: content.requiresOptic
                        ? Icons.fact_check_outlined
                        : Icons.check_circle_outline,
                    label: content.requiresOptic
                        ? 'Sanal optik var'
                        : 'Tamamlandi isaretle',
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                content.teacherNote,
                style: TextStyle(
                  color: AppTheme.adaptiveGrey(context),
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AssignedContentDetailScreen extends StatelessWidget {
  final AssignedExamContent content;

  const AssignedContentDetailScreen({super.key, required this.content});

  @override
  Widget build(BuildContext context) {
    final accent = content.type == 'Deneme' ? Colors.indigo : Colors.teal;
    final resultSummary = content.resultSummary;
    final sectionResults =
        List<Map<String, dynamic>>.from(resultSummary?['sections'] ?? const []);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Deneme ve Test',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: accent.withValues(alpha: 0.12)),
              boxShadow: [
                BoxShadow(
                  color: Theme.of(context).shadowColor.withValues(alpha: 0.08),
                  blurRadius: 14,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _StatusChip(label: content.type, color: accent),
                    _StatusChip(
                      label: content.status,
                      color: Colors.black87,
                      solid: false,
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  content.title,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  content.course,
                  style: TextStyle(
                    color: AppTheme.adaptiveGrey(context),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _MetaPill(
                      icon: Icons.schedule_rounded,
                      label: 'Teslim ${content.dueText}',
                    ),
                    _MetaPill(
                      icon: Icons.timer_outlined,
                      label: '${content.expectedDurationMinutes} dk',
                    ),
                    _MetaPill(
                      icon: Icons.picture_as_pdf_outlined,
                      label: '${content.totalPages} sayfa',
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (resultSummary != null) ...[
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Sonuc Ozeti',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      _buildResultPill(
                        label: 'Basari',
                        value: '%${(resultSummary['scorePct'] ?? 0).toString()}',
                        color: Colors.indigo,
                        bg: const Color(0xFFEEF2FF),
                      ),
                      _buildResultPill(
                        label: 'Dogru',
                        value: '${resultSummary['correct'] ?? 0}',
                        color: Colors.green.shade700,
                        bg: const Color(0xFFECFDF5),
                      ),
                      _buildResultPill(
                        label: 'Yanlis',
                        value: '${resultSummary['wrong'] ?? 0}',
                        color: Colors.red.shade700,
                        bg: const Color(0xFFFEF2F2),
                      ),
                      _buildResultPill(
                        label: 'Bos',
                        value: '${resultSummary['blank'] ?? 0}',
                        color: Colors.orange.shade700,
                        bg: const Color(0xFFFFF7ED),
                      ),
                      _buildResultPill(
                        label: 'Net',
                        value: '${resultSummary['net'] ?? 0}',
                        color: Colors.blueGrey.shade800,
                        bg: const Color(0xFFF8FAFC),
                      ),
                    ],
                  ),
                  if (sectionResults.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    const Text(
                      'Ders Sonuclari',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Column(
                      children: sectionResults.map((section) {
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Theme.of(context).brightness == Brightness.dark
                                ? Colors.white.withValues(alpha: 0.04)
                                : const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: Theme.of(context).dividerColor),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${section['course'] ?? section['title'] ?? 'Bolum'}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${section['questionCount'] ?? 0} soru',
                                      style: TextStyle(
                                        color: AppTheme.adaptiveGreyLight(context),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                '${section['correct'] ?? 0}D  ${section['wrong'] ?? 0}Y  ${section['blank'] ?? 0}B  ${section['net'] ?? 0} net',
                                style: TextStyle(
                                  color: AppTheme.adaptiveGrey(context),
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: Theme.of(context).dividerColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Oturum Akisi',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  content.requiresOptic
                      ? 'Deneme ayni sayfada acilacak. Ustte sayaç ve Optik butonu, altta ise istedigin an acilip kapanan sanal optik paneli olacak.'
                      : 'PDF uygulama icinde acilacak ve sure takibi ayni sayfada devam edecek.',
                  style: TextStyle(
                    color: AppTheme.adaptiveGrey(context),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: Theme.of(context).dividerColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Ogretmen Notu',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  content.teacherNote.isEmpty
                      ? 'Bu icerik icin ogretmen notu birakilmamis.'
                      : content.teacherNote,
                  style: TextStyle(
                    color: AppTheme.adaptiveGrey(context),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          SizedBox(
            height: 56,
            child: ElevatedButton.icon(
              onPressed: () async {
                final changed = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(
                    builder: (_) => AssignedExamSessionScreen(content: content),
                  ),
                );
                if (context.mounted && changed == true) {
                  Navigator.of(context).pop(true);
                }
              },
              icon: const Icon(CupertinoIcons.play_arrow_solid),
              label: Text(
                content.rawStatus == 'completed'
                    ? 'Cozumu Goruntule'
                    : 'Denemeyi Baslat',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Widget _buildResultPill({
  required String label,
  required String value,
  required Color color,
  required Color bg,
}) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    decoration: BoxDecoration(
      color: bg,
      borderRadius: BorderRadius.circular(18),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    ),
  );
}

class _OpticSectionSpec {
  final String id;
  final String title;
  final int questionCount;

  const _OpticSectionSpec({
    required this.id,
    required this.title,
    required this.questionCount,
  });
}

class AssignedExamSessionScreen extends StatefulWidget {
  final AssignedExamContent content;

  const AssignedExamSessionScreen({super.key, required this.content});

  @override
  State<AssignedExamSessionScreen> createState() =>
      _AssignedExamSessionScreenState();
}

class _AssignedExamSessionScreenState extends State<AssignedExamSessionScreen>
    with WidgetsBindingObserver {
  Timer? _ticker;
  PdfControllerPinch? _pdfController;
  bool _isLoadingPdf = true;
  bool _isBusy = false;
  bool _opticOpen = false;
  bool _isInForeground = true;
  int _currentPage = 1;
  int _totalPages = 1;
  int _selectedOpticSectionIndex = 0;
  late String _rawStatus;
  late int _activeDurationSeconds;
  late int _wallDurationSeconds;
  DateTime? _openedAt;
  late final List<_OpticSectionSpec> _opticSections;
  late Map<String, List<String?>> _answersBySection;
  int _backgroundSwitchCount = 0;
  List<String> _switchTimestamps = [];
  bool _isAutoSubmitted = false;

  AssignedExamContent get content => widget.content;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _rawStatus = content.rawStatus;
    _activeDurationSeconds = content.activeDurationSeconds;
    _wallDurationSeconds = content.wallDurationSeconds;
    _openedAt = content.openedAt;
    _opticSections = _buildOpticSections(content);
    _answersBySection = {
      for (final section in _opticSections)
        section.id: List<String?>.filled(section.questionCount, null),
    };

    if (content.integrityLog != null) {
      _backgroundSwitchCount =
          (content.integrityLog!['backgroundSwitchCount'] as num?)?.toInt() ?? 0;
      final rawTimestamps = content.integrityLog!['switchTimestamps'];
      if (rawTimestamps is List) {
        _switchTimestamps =
            List<String>.from(rawTimestamps.map((e) => e.toString()));
      }
      _isAutoSubmitted = content.integrityLog!['autoSubmitted'] == true;
    }

    _restoreBackendAnswers();
    _restoreDraft();
    unawaited(_startSession());
    unawaited(_loadPdf());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker?.cancel();
    _pdfController?.dispose();
    unawaited(_persistDraft());
    unawaited(_syncProgress());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _isInForeground = true;
      if (_rawStatus != 'completed' &&
          !_isAutoSubmitted &&
          _backgroundSwitchCount > 0) {
        AppToast.show(
          context: context,
          message:
              'Uyari: Sinav ekranindan ciktiginiz tespit edildi. Bu durum ogretmeninize raporlanacaktir!',
          backgroundColor: Colors.red.shade700,
          duration: const Duration(seconds: 4),
        );
      }
    } else if (state == AppLifecycleState.paused) {
      _isInForeground = false;
      if (_rawStatus != 'completed' && !_isAutoSubmitted) {
        _backgroundSwitchCount++;
        _switchTimestamps.add(DateTime.now().toIso8601String());
        unawaited(_syncProgress());
      }
    }
  }

  Future<void> _restoreDraft() async {
    final draft = StorageService.getAssignedContentDraft(content.recipientId);
    if (draft == null) return;

    final rawAnswers = draft['answersBySection'];
    if (rawAnswers is Map) {
      for (final entry in rawAnswers.entries) {
        final sectionAnswers = _answersBySection['${entry.key}'];
        if (sectionAnswers == null || entry.value is! List) continue;
        final values = List<dynamic>.from(entry.value as List);
        for (var i = 0; i < math.min(values.length, sectionAnswers.length); i++) {
          sectionAnswers[i] = values[i]?.toString();
        }
      }
    }

    setState(() {
      _currentPage = (draft['currentPage'] as num?)?.toInt() ?? _currentPage;
      _selectedOpticSectionIndex =
          (draft['selectedOpticSectionIndex'] as num?)?.toInt() ?? 0;
    });
  }

  Future<void> _persistDraft() async {
    await StorageService.saveAssignedContentDraft(content.recipientId, {
      'currentPage': _currentPage,
      'selectedOpticSectionIndex': _selectedOpticSectionIndex,
      'answersBySection': {
        for (final entry in _answersBySection.entries) entry.key: entry.value,
      },
    });
  }

  void _restoreBackendAnswers() {
    final rawAnswers = content.selectedAnswers;
    if (rawAnswers == null) return;

    for (final entry in rawAnswers.entries) {
      final sectionAnswers = _answersBySection[entry.key];
      if (sectionAnswers == null || entry.value is! List) continue;
      final values = List<dynamic>.from(entry.value as List);
      for (var i = 0; i < math.min(values.length, sectionAnswers.length); i++) {
        final value = values[i]?.toString();
        sectionAnswers[i] = (value == null || value.isEmpty || value == '-')
            ? null
            : value;
      }
    }
  }

  Future<void> _syncProgress({String? status, DateTime? completedAt}) async {
    await ApiService.syncAssignedContentProgress(
      recipientId: content.recipientId,
      status: status,
      openedAt: _openedAt,
      completedAt: completedAt,
      activeDurationSeconds: _activeDurationSeconds,
      wallDurationSeconds: _wallDurationSeconds,
      integrityLog: {
        'backgroundSwitchCount': _backgroundSwitchCount,
        'switchTimestamps': _switchTimestamps,
        'autoSubmitted': _isAutoSubmitted,
      },
    );
  }

  Map<String, dynamic> _buildResultSummary() {
    int totalCorrect = 0;
    int totalWrong = 0;
    int totalBlank = 0;
    int totalQuestions = 0;
    double totalNet = 0;
    final sections = <Map<String, dynamic>>[];

    for (final section in content.sections.where((item) => item.questionCount > 0)) {
      final answers = _answersBySection[section.id] ?? const <String?>[];
      final answerKey = section.answerKey;
      int correct = 0;
      int wrong = 0;
      int blank = 0;

      for (var i = 0; i < section.questionCount; i++) {
        final selected = i < answers.length ? answers[i] : null;
        final expected = i < answerKey.length ? answerKey[i] : null;

        if (selected == null || selected.isEmpty) {
          blank += 1;
        } else if (expected != null && expected.isNotEmpty) {
          if (selected == expected) {
            correct += 1;
          } else {
            wrong += 1;
          }
        } else {
          blank += 1;
        }
      }

      final net = correct - (wrong / 4);
      totalCorrect += correct;
      totalWrong += wrong;
      totalBlank += blank;
      totalQuestions += section.questionCount;
      totalNet += net;

      sections.add({
        'id': section.id,
        'title': section.title,
        'course': section.course,
        'questionCount': section.questionCount,
        'correct': correct,
        'wrong': wrong,
        'blank': blank,
        'net': double.parse(net.toStringAsFixed(2)),
      });
    }

    final scorePct = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0.0;

    return {
      'totalQuestions': totalQuestions,
      'correct': totalCorrect,
      'wrong': totalWrong,
      'blank': totalBlank,
      'net': double.parse(totalNet.toStringAsFixed(2)),
      'scorePct': double.parse(scorePct.toStringAsFixed(1)),
      'sections': sections,
    };
  }

  Future<void> _startSession() async {
    if (_openedAt == null) {
      _openedAt = DateTime.now();
      _rawStatus = 'opened';
      await _syncProgress(status: 'opened');
    }
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _rawStatus == 'completed' || _openedAt == null) return;
      setState(() {
        _wallDurationSeconds += 1;
        if (_isInForeground) _activeDurationSeconds += 1;
      });

      if (content.expectedDurationMinutes > 0 &&
          _wallDurationSeconds >= (content.expectedDurationMinutes * 60) &&
          _rawStatus != 'completed' &&
          !_isAutoSubmitted) {
        _isAutoSubmitted = true;
        _completeSession();
      }
    });
  }

  Future<void> _loadPdf() async {
    try {
      final path =
          await ApiService.downloadAssignedContentPdf(content.recipientId);
      if (!mounted) return;
      if (path == null) {
        setState(() => _isLoadingPdf = false);
        AppToast.show(
          context: context,
          message: 'PDF indirilemedi.',
          backgroundColor: Colors.red.shade600,
        );
        return;
      }

      setState(() {
        _pdfController = PdfControllerPinch(
          document: PdfDocument.openFile(path),
          initialPage: math.max(1, _currentPage),
        );
        _isLoadingPdf = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoadingPdf = false);
      AppToast.show(
        context: context,
        message: 'PDF yuklenirken hata olustu.',
        backgroundColor: Colors.red.shade600,
      );
    }
  }

  Future<void> _completeSession() async {
    if (_isBusy || _rawStatus == 'completed') return;
    setState(() => _isBusy = true);
    try {
      final completedAt = DateTime.now();
      await ApiService.syncAssignedContentProgress(
        recipientId: content.recipientId,
        status: 'completed',
        openedAt: _openedAt,
        completedAt: completedAt,
        activeDurationSeconds: _activeDurationSeconds,
        wallDurationSeconds: _wallDurationSeconds,
        selectedAnswers: {
          for (final entry in _answersBySection.entries) entry.key: entry.value,
        },
        resultSummary: _buildResultSummary(),
      );
      await StorageService.clearAssignedContentDraft(content.recipientId);
      _ticker?.cancel();
      if (!mounted) return;
      AppToast.show(
        context: context,
        message: 'Deneme tamamlandi olarak kaydedildi.',
        backgroundColor: Colors.green.shade600,
      );
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      AppToast.show(
        context: context,
        message: 'Deneme tamamlanamadi.',
        backgroundColor: Colors.red.shade600,
      );
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accent = content.type == 'Deneme' ? Colors.indigo : Colors.teal;
    final currentOpticSection = _opticSections[_selectedOpticSectionIndex];
    final answers = _answersBySection[currentOpticSection.id]!;

    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      appBar: AppBar(
        backgroundColor: const Color(0xFF111827),
        foregroundColor: Colors.white,
        titleSpacing: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                _formatSessionDuration(Duration(seconds: _activeDurationSeconds)),
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              'Sayfa $_currentPage/$_totalPages',
              style: TextStyle(
                fontSize: 13,
                color: Colors.white.withValues(alpha: 0.82),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        actions: [
          TextButton.icon(
            onPressed: () => setState(() => _opticOpen = !_opticOpen),
            icon: const Icon(CupertinoIcons.square_grid_2x2, color: Colors.white),
            label: const Text(
              'Optik',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton.tonal(
              onPressed: _isBusy ? null : _completeSession,
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white.withValues(alpha: 0.12),
                foregroundColor: Colors.white,
              ),
              child: const Text('Bitir'),
            ),
          ),
        ],
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: _isLoadingPdf
                ? const Center(child: CircularProgressIndicator(color: Colors.white))
                : _pdfController == null
                    ? Center(
                        child: Text(
                          'PDF gosterilemedi.',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.82)),
                        ),
                      )
                    : PdfViewPinch(
                        controller: _pdfController!,
                        onDocumentLoaded: (document) {
                          if (!mounted) return;
                          setState(() => _totalPages = document.pagesCount);
                        },
                        onPageChanged: (page) {
                          setState(() => _currentPage = page);
                          unawaited(_persistDraft());
                        },
                      ),
          ),
          AnimatedPositioned(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            left: 0,
            right: 0,
            bottom: _opticOpen
                ? 0
                : -MediaQuery.of(context).size.height * 0.60,
            height: MediaQuery.of(context).size.height * 0.60,
            child: Material(
              color: Colors.transparent,
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                ),
                child: SafeArea(
                  top: false,
                  child: Column(
                    children: [
                      const SizedBox(height: 10),
                      Container(
                        width: 50,
                        height: 5,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 16, 18, 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Sanal Optik',
                                    style: TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    currentOpticSection.title,
                                    style: TextStyle(
                                      color: Colors.grey.shade700,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              onPressed: () => setState(() => _opticOpen = false),
                              icon: const Icon(CupertinoIcons.xmark),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(
                        height: 44,
                        child: ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 18),
                          scrollDirection: Axis.horizontal,
                          itemCount: _opticSections.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 8),
                          itemBuilder: (context, index) {
                            final section = _opticSections[index];
                            return ChoiceChip(
                              label: Text(section.title),
                              selected: _selectedOpticSectionIndex == index,
                              onSelected: (_) {
                                setState(() => _selectedOpticSectionIndex = index);
                                unawaited(_persistDraft());
                              },
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 12),
                      Expanded(
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
                          itemCount: answers.length,
                          itemBuilder: (context, index) {
                            final selected = answers[index];
                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 12,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF8FAFF),
                                borderRadius: BorderRadius.circular(18),
                                border: Border.all(color: const Color(0xFFDCE4F8)),
                              ),
                              child: Row(
                                children: [
                                  SizedBox(
                                    width: 26,
                                    child: Text(
                                      '${index + 1}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  Expanded(
                                    child: Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: ['A', 'B', 'C', 'D', 'E', '-']
                                          .map(
                                            (choice) => _AnswerBubble(
                                              label: choice,
                                              selected: selected == choice,
                                              accent: accent,
                                              onTap: () {
                                                setState(() {
                                                  answers[index] =
                                                      choice == '-' ? null : choice;
                                                });
                                                unawaited(_persistDraft());
                                              },
                                            ),
                                          )
                                          .toList(),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

List<_OpticSectionSpec> _buildOpticSections(AssignedExamContent content) {
  final dynamicSections = content.sections
      .where((section) => section.questionCount > 0)
      .map(
        (section) => _OpticSectionSpec(
          id: section.id,
          title: section.course.isNotEmpty ? section.course : section.title,
          questionCount: section.questionCount,
        ),
      )
      .toList();

  if (dynamicSections.isNotEmpty) {
    return dynamicSections;
  }

  final course = content.course.toLowerCase();
  final scope = content.examScope.toLowerCase();

  if (scope.contains('tyt') && course.contains('genel')) {
    return const [
      _OpticSectionSpec(id: 'turkce', title: 'Turkce', questionCount: 40),
      _OpticSectionSpec(id: 'sosyal', title: 'Sosyal', questionCount: 20),
      _OpticSectionSpec(id: 'matematik', title: 'Matematik', questionCount: 40),
      _OpticSectionSpec(id: 'fen', title: 'Fen', questionCount: 20),
    ];
  }
  if (course.contains('turkce')) {
    return const [
      _OpticSectionSpec(id: 'turkce', title: 'Turkce', questionCount: 40),
    ];
  }
  if (course.contains('sosyal')) {
    return const [
      _OpticSectionSpec(id: 'sosyal', title: 'Sosyal', questionCount: 20),
    ];
  }
  if (course.contains('fen')) {
    return const [
      _OpticSectionSpec(id: 'fen', title: 'Fen', questionCount: 20),
    ];
  }
  return const [
    _OpticSectionSpec(id: 'genel', title: 'Optik', questionCount: 40),
  ];
}

String _formatSessionDuration(Duration duration) {
  final totalMinutes = duration.inMinutes;
  final hours = totalMinutes ~/ 60;
  final minutes = totalMinutes % 60;
  final seconds = duration.inSeconds % 60;

  if (hours > 0) {
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
  return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
}

class _AnswerBubble extends StatelessWidget {
  final String label;
  final bool selected;
  final Color accent;
  final VoidCallback onTap;

  const _AnswerBubble({
    required this.label,
    required this.selected,
    required this.accent,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isClear = label == '-';
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: selected
              ? (isClear ? Colors.grey.shade800 : accent)
              : (isDark ? Theme.of(context).cardColor : Colors.white),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected
                ? (isClear ? Colors.grey.shade800 : accent)
                : (isDark ? Colors.grey.shade600 : Colors.grey.shade300),
          ),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: selected ? Colors.white : AppTheme.adaptiveGrey(context),
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;
  final bool solid;

  const _StatusChip({
    required this.label,
    required this.color,
    this.solid = true,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: solid
            ? color.withValues(alpha: 0.10)
            : (isDark ? Colors.white.withValues(alpha: 0.08) : Colors.grey.shade100),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: solid ? color : AppTheme.adaptiveGrey(context),
        ),
      ),
    );
  }
}

class ExamCard extends StatefulWidget {
  final Map<String, dynamic> exam;
  const ExamCard({super.key, required this.exam});

  @override
  State<ExamCard> createState() => _ExamCardState();
}

class _ExamCardState extends State<ExamCard> {
  Widget _buildSubjectLine(
      String name, String? d, String? y, String? n, Color color) {
    if (n == null || n == "0" || n == "0.0") return const SizedBox();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(name,
              style:
                  const TextStyle(fontWeight: FontWeight.w500, fontSize: 13)),
          Row(
            children: [
              if (d != null)
                Text("$d D",
                    style: const TextStyle(
                        color: Colors.green,
                        fontSize: 12,
                        fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              if (y != null)
                Text("$y Y",
                    style: const TextStyle(
                        color: Colors.red,
                        fontSize: 12,
                        fontWeight: FontWeight.bold)),
              const SizedBox(width: 12),
              SizedBox(
                width: 40,
                child: Text("$n N",
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        color: color,
                        fontSize: 13,
                        fontWeight: FontWeight.bold)),
              )
            ],
          )
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final date = widget.exam['date'] ?? 'Bilinmeyen Tarih';
    final tytNet = widget.exam['tytNet']?.toString() ?? '0';
    final aytNet = widget.exam['aytNet']?.toString() ?? '0';
    final totalNet = (double.tryParse(tytNet) ?? 0) + (double.tryParse(aytNet) ?? 0);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).shadowColor.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          title: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Genel Deneme",
                    style: TextStyle(
                        color: AppTheme.adaptiveGreySubtle(context),
                        fontSize: 12,
                        fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    date,
                    style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                        color: Theme.of(context).textTheme.bodyLarge?.color),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  "Net: $totalNet",
                  style: const TextStyle(
                      color: AppTheme.primaryColor,
                      fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          children: [
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text("TYT Toplam Net",
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      Text(tytNet,
                          style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.blue,
                              fontSize: 16)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _buildSubjectLine("Türkçe", widget.exam['tytTurD']?.toString(),
                      widget.exam['tytTurY']?.toString(), widget.exam['tytTur']?.toString(), Colors.blue),
                  _buildSubjectLine("Matematik", widget.exam['tytMatD']?.toString(),
                      widget.exam['tytMatY']?.toString(), widget.exam['tytMat']?.toString(), Colors.blue),
                  _buildSubjectLine("Tarih", widget.exam['tytTarD']?.toString(),
                      widget.exam['tytTarY']?.toString(), widget.exam['tytTar']?.toString(), Colors.blue),
                  _buildSubjectLine("Coğrafya", widget.exam['tytCogD']?.toString(),
                      widget.exam['tytCogY']?.toString(), widget.exam['tytCog']?.toString(), Colors.blue),
                  _buildSubjectLine("Felsefe", widget.exam['tytFelD']?.toString(),
                      widget.exam['tytFelY']?.toString(), widget.exam['tytFel']?.toString(), Colors.blue),
                  _buildSubjectLine("Din K.", widget.exam['tytDinD']?.toString(),
                      widget.exam['tytDinY']?.toString(), widget.exam['tytDin']?.toString(), Colors.blue),
                  _buildSubjectLine("Fizik", widget.exam['tytFizD']?.toString(),
                      widget.exam['tytFizY']?.toString(), widget.exam['tytFiz']?.toString(), Colors.blue),
                  _buildSubjectLine("Kimya", widget.exam['tytKimD']?.toString(),
                      widget.exam['tytKimY']?.toString(), widget.exam['tytKim']?.toString(), Colors.blue),
                  _buildSubjectLine("Biyoloji", widget.exam['tytBiyD']?.toString(),
                      widget.exam['tytBiyY']?.toString(), widget.exam['tytBiy']?.toString(), Colors.blue),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text("AYT Toplam Net",
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      Text(aytNet,
                          style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.orange,
                              fontSize: 16)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
