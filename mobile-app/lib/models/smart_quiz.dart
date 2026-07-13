class SmartQuizPlan {
  final String id;
  final String course;
  final String topic;
  final String reason;
  final String riskLabel;
  final int cooldownHours;
  final DateTime sourceLastActivityAt;
  final DateTime assignedAt;
  final int questionCount;
  final int explanationCount;

  const SmartQuizPlan({
    required this.id,
    required this.course,
    required this.topic,
    required this.reason,
    required this.riskLabel,
    required this.cooldownHours,
    required this.sourceLastActivityAt,
    required this.assignedAt,
    required this.questionCount,
    required this.explanationCount,
  });

  String get topicKey => '$course|$topic';

  Map<String, dynamic> toJson() => {
        'id': id,
        'course': course,
        'topic': topic,
        'reason': reason,
        'riskLabel': riskLabel,
        'cooldownHours': cooldownHours,
        'sourceLastActivityAt': sourceLastActivityAt.toIso8601String(),
        'assignedAt': assignedAt.toIso8601String(),
        'questionCount': questionCount,
        'explanationCount': explanationCount,
      };

  factory SmartQuizPlan.fromJson(Map<String, dynamic> json) => SmartQuizPlan(
        id: json['id']?.toString() ?? '',
        course: json['course']?.toString() ?? '',
        topic: json['topic']?.toString() ?? '',
        reason: json['reason']?.toString() ?? '',
        riskLabel: json['riskLabel']?.toString() ?? 'Takip',
        cooldownHours: (json['cooldownHours'] as num?)?.toInt() ?? 24,
        sourceLastActivityAt: DateTime.tryParse(
              json['sourceLastActivityAt']?.toString() ?? '',
            ) ??
            DateTime.now(),
        assignedAt:
            DateTime.tryParse(json['assignedAt']?.toString() ?? '') ??
                DateTime.now(),
        questionCount: (json['questionCount'] as num?)?.toInt() ?? 0,
        explanationCount: (json['explanationCount'] as num?)?.toInt() ?? 0,
      );
}

class SmartQuizAttempt {
  final String id;
  final String course;
  final String topic;
  final String reason;
  final String riskLabel;
  final String status;
  final int cooldownHours;
  final DateTime? sourceLastActivityAt;
  final DateTime? assignedAt;
  final DateTime? completedAt;
  final int questionCount;
  final int explanationCount;
  final int? correctCount;
  final int? totalCount;
  final double? score;
  final SmartQuizProgress? progress;

  const SmartQuizAttempt({
    required this.id,
    required this.course,
    required this.topic,
    required this.reason,
    required this.riskLabel,
    required this.status,
    required this.cooldownHours,
    required this.sourceLastActivityAt,
    required this.assignedAt,
    required this.completedAt,
    required this.questionCount,
    required this.explanationCount,
    this.correctCount,
    this.totalCount,
    this.score,
    this.progress,
  });

  bool get hasSavedProgress =>
      progress != null && !progress!.isCompleted && progress!.questions.isNotEmpty;

  factory SmartQuizAttempt.fromJson(Map<String, dynamic> json) {
    SmartQuizProgress? progress;
    try {
      progress = SmartQuizProgress.fromAttemptJson(
        json['id']?.toString() ?? '',
        json,
        isCompleted: (json['status']?.toString() ?? 'pending') == 'completed',
        fallbackCorrectCount: (json['correctCount'] as num?)?.toInt(),
      );
    } catch (_) {
      progress = null;
    }

    return SmartQuizAttempt(
      id: json['id']?.toString() ?? '',
      course: json['course']?.toString() ?? '',
      topic: json['topic']?.toString() ?? '',
      reason: json['reason']?.toString() ?? '',
      riskLabel: json['riskLabel']?.toString() ?? '',
      status: json['status']?.toString() ?? 'pending',
      cooldownHours: (json['cooldownHours'] as num?)?.toInt() ?? 24,
      sourceLastActivityAt:
          DateTime.tryParse(json['sourceLastActivityAt']?.toString() ?? ''),
      assignedAt: DateTime.tryParse(json['assignedAt']?.toString() ?? ''),
      completedAt: DateTime.tryParse(json['completedAt']?.toString() ?? ''),
      questionCount: (json['questionCount'] as num?)?.toInt() ?? 0,
      explanationCount: (json['explanationCount'] as num?)?.toInt() ?? 0,
      correctCount: (json['correctCount'] as num?)?.toInt(),
      totalCount: (json['totalCount'] as num?)?.toInt(),
      score: (json['score'] as num?)?.toDouble(),
      progress: progress,
    );
  }
}

class SmartQuizQuestion {
  final String question;
  final List<String> options;
  final int correctIndex;
  final String explanation;

  const SmartQuizQuestion({
    required this.question,
    required this.options,
    required this.correctIndex,
    required this.explanation,
  });

  factory SmartQuizQuestion.fromJson(Map<String, dynamic> json) {
    final options = (json['options'] as List<dynamic>? ?? [])
        .map((o) => o.toString().trim())
        .where((o) => o.isNotEmpty)
        .toList();

    int correctIndex = (json['correctIndex'] as num?)?.toInt() ?? 0;
    if (correctIndex < 0 || correctIndex >= options.length) {
      correctIndex = 0;
    }

    return SmartQuizQuestion(
      question: json['question']?.toString().trim() ?? '',
      options: options,
      correctIndex: correctIndex,
      explanation: json['explanation']?.toString().trim() ?? '',
    );
  }
}

class SmartQuizProgress {
  final String planId;
  final int currentIndex;
  final int? correctCount;
  final bool isCompleted;
  final String? coachNote;
  final List<int?> selectedAnswers;
  final List<SmartQuizQuestion> questions;
  final DateTime updatedAt;

  const SmartQuizProgress({
    required this.planId,
    required this.currentIndex,
    required this.correctCount,
    required this.isCompleted,
    required this.coachNote,
    required this.selectedAnswers,
    required this.questions,
    required this.updatedAt,
  });

  Map<String, dynamic> toJson() => {
        'planId': planId,
        'currentIndex': currentIndex,
        'correctCount': correctCount,
        'isCompleted': isCompleted,
        'coachNote': coachNote,
        'selectedAnswers': selectedAnswers,
        'questions': questions
            .map(
              (question) => {
                'question': question.question,
                'options': question.options,
                'correctIndex': question.correctIndex,
                'explanation': question.explanation,
              },
            )
            .toList(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  factory SmartQuizProgress.fromJson(Map<String, dynamic> json) {
    final rawAnswers = (json['selectedAnswers'] as List<dynamic>? ?? [])
        .map((value) => value == null ? null : (value as num).toInt())
        .toList();
    final rawQuestions = (json['questions'] as List<dynamic>? ?? [])
        .map((item) => SmartQuizQuestion.fromJson(Map<String, dynamic>.from(item)))
        .toList();

    return SmartQuizProgress(
      planId: json['planId']?.toString() ?? '',
      currentIndex: (json['currentIndex'] as num?)?.toInt() ?? 0,
      correctCount: (json['correctCount'] as num?)?.toInt(),
      isCompleted: json['isCompleted'] == true,
      coachNote: json['coachNote']?.toString(),
      selectedAnswers: rawAnswers,
      questions: rawQuestions,
      updatedAt:
          DateTime.tryParse(json['updatedAt']?.toString() ?? '') ?? DateTime.now(),
    );
  }

  factory SmartQuizProgress.fromAttemptJson(
    String planId,
    Map<String, dynamic> json, {
    required bool isCompleted,
    int? fallbackCorrectCount,
  }) {
    final rawAnswers = (json['selectedAnswers'] as List<dynamic>? ?? [])
        .map((value) => value == null ? null : (value as num).toInt())
        .toList();
    final rawQuestions = (json['questions'] as List<dynamic>? ?? [])
        .map((item) => SmartQuizQuestion.fromJson(Map<String, dynamic>.from(item)))
        .where((item) => item.question.isNotEmpty && item.options.length == 4)
        .toList();

    if (rawQuestions.isEmpty) {
      throw const FormatException('Bos quiz ilerlemesi');
    }

    return SmartQuizProgress(
      planId: planId,
      currentIndex: (json['currentIndex'] as num?)?.toInt() ?? 0,
      correctCount: (json['correctCount'] as num?)?.toInt() ?? fallbackCorrectCount,
      isCompleted: isCompleted,
      coachNote: json['coachNote']?.toString(),
      selectedAnswers: rawAnswers,
      questions: rawQuestions,
      updatedAt:
          DateTime.tryParse(json['progressUpdatedAt']?.toString() ?? '') ??
              DateTime.now(),
    );
  }
}
