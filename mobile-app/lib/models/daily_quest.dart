class DailyQuest {
  final String id;
  final String title;
  final String description;
  final String type; // 'question', 'explanation', 'streak', 'xp'
  final int target;
  int progress;
  final int xpReward;
  final String icon;

  DailyQuest({
    required this.id,
    required this.title,
    required this.description,
    required this.type,
    required this.target,
    this.progress = 0,
    required this.xpReward,
    required this.icon,
  });

  bool get isCompleted => progress >= target;
  double get progressPercent => (progress / target).clamp(0.0, 1.0);

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'type': type,
        'target': target,
        'progress': progress,
        'xpReward': xpReward,
        'icon': icon,
      };

  factory DailyQuest.fromJson(Map<String, dynamic> json) => DailyQuest(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        description: json['description']?.toString() ?? '',
        type: json['type']?.toString() ?? '',
        target: (json['target'] as num?)?.toInt() ?? 0,
        progress: (json['progress'] as num?)?.toInt() ?? 0,
        xpReward: (json['xpReward'] as num?)?.toInt() ?? 0,
        icon: json['icon']?.toString() ?? '',
      );
}
