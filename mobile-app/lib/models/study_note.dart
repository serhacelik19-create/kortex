class StudyNote {
  final String id;
  final String course;
  final String content;
  final String date;
  final String? questionText;

  const StudyNote({
    required this.id,
    required this.course,
    required this.content,
    required this.date,
    this.questionText,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'course': course,
        'content': content,
        'date': date,
        'questionText': questionText,
      };

  factory StudyNote.fromJson(Map<String, dynamic> json) => StudyNote(
        id: json['id'],
        course: json['course'],
        content: json['content'],
        date: json['date'],
        questionText: json['questionText'],
      );
}
