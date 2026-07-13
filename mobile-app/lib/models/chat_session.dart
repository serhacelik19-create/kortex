import 'package:yks/models/message.dart';

class ChatSession {
  final String id;
  final String title;
  final String course;
  final String mode; // 'question' or 'explanation'
  final DateTime lastActivity;
  final List<Message> messages;

  ChatSession({
    required this.id,
    required this.title,
    required this.course,
    required this.mode,
    required this.lastActivity,
    required this.messages,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'course': course,
        'mode': mode,
        'lastActivity': lastActivity.toIso8601String(),
        'messages': messages.map((m) => m.toJson()).toList(),
      };

  factory ChatSession.fromJson(Map<String, dynamic> json) => ChatSession(
        id: json['id'],
        title: json['title'],
        course: json['course'],
        mode: json['mode'],
        lastActivity: DateTime.parse(json['lastActivity']),
        messages: List<Map<String, dynamic>>.from(json['messages'])
            .map((m) => Message.fromJson(m))
            .toList(growable: true),
      );

  ChatSession copyWith({
    String? title,
    DateTime? lastActivity,
    List<Message>? messages,
  }) =>
      ChatSession(
        id: id,
        title: title ?? this.title,
        course: course,
        mode: mode,
        lastActivity: lastActivity ?? this.lastActivity,
        messages: List<Message>.from(messages ?? this.messages),
      );

  DateTime get startedAt {
    final millis = int.tryParse(id);
    if (millis != null) {
      return DateTime.fromMillisecondsSinceEpoch(millis);
    }
    return lastActivity;
  }

  String get threadTitle =>
      _buildThreadTitle();

  String get threadSubtitle {
    final updatedAt = lastActivity;
    final hour = updatedAt.hour.toString().padLeft(2, '0');
    final minute = updatedAt.minute.toString().padLeft(2, '0');
    final messageCount = messages.where((m) => m.id != '1').length;
    return '${updatedAt.day}/${updatedAt.month} $hour:$minute • $messageCount mesaj';
  }

  String _buildThreadTitle() {
    final firstUserMessage = messages.cast<Message?>().firstWhere(
          (message) => message?.sender == MessageSender.user,
          orElse: () => null,
        );

    final normalized = firstUserMessage?.text.replaceAll(RegExp(r'\s+'), ' ').trim() ?? '';
    if (normalized.isNotEmpty) {
      return normalized;
    }

    return mode == 'question' ? '$course Soru Sohbeti' : '$course Konu Sohbeti';
  }
}
