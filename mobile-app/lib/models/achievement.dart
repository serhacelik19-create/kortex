class Achievement {
  final String id;
  final String title;
  final String description;
  final String emoji;
  final String
      conditionType; // first_question, total_questions, streak, xp, quiz_streak
  final int threshold;

  const Achievement({
    required this.id,
    required this.title,
    required this.description,
    required this.emoji,
    required this.conditionType,
    required this.threshold,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'emoji': emoji,
        'conditionType': conditionType,
        'threshold': threshold,
      };
}
