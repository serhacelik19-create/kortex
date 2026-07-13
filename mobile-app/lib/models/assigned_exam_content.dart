class AssignedExamSection {
  final String id;
  final String title;
  final String course;
  final int questionCount;
  final List<String?> answerKey;
  final int startPage;
  final int endPage;

  const AssignedExamSection({
    required this.id,
    required this.title,
    required this.course,
    required this.questionCount,
    required this.answerKey,
    required this.startPage,
    required this.endPage,
  });
}

class AssignedExamContent {
  final String id;
  final int recipientId;
  final String title;
  final String type;
  final String course;
  final String examScope;
  final String teacherNote;
  final String targetLabel;
  final int expectedDurationMinutes;
  final int totalPages;
  final bool requiresOptic;
  final String dueText;
  final String status;
  final String rawStatus;
  final DateTime? openedAt;
  final DateTime? completedAt;
  final int activeDurationSeconds;
  final int wallDurationSeconds;
  final Map<String, dynamic>? selectedAnswers;
  final Map<String, dynamic>? resultSummary;
  final Map<String, dynamic>? integrityLog;
  final List<AssignedExamSection> sections;

  const AssignedExamContent({
    required this.id,
    required this.recipientId,
    required this.title,
    required this.type,
    required this.course,
    required this.examScope,
    required this.teacherNote,
    required this.targetLabel,
    required this.expectedDurationMinutes,
    required this.totalPages,
    required this.requiresOptic,
    required this.dueText,
    required this.status,
    required this.rawStatus,
    required this.openedAt,
    required this.completedAt,
    required this.activeDurationSeconds,
    required this.wallDurationSeconds,
    required this.selectedAnswers,
    required this.resultSummary,
    this.integrityLog,
    required this.sections,
  });
}
