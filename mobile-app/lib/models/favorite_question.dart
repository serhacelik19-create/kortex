class FavoriteQuestion {
  final String id;
  final String? questionText;
  final String? questionImage;
  final String answerText;
  final String? course;
  final String timestamp;

  const FavoriteQuestion({
    required this.id,
    this.questionText,
    this.questionImage,
    required this.answerText,
    this.course,
    required this.timestamp,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'questionText': questionText,
        'questionImage': questionImage,
        'answerText': answerText,
        'course': course,
        'timestamp': timestamp,
      };

  factory FavoriteQuestion.fromJson(Map<String, dynamic> json) =>
      FavoriteQuestion(
        id: json['id'],
        questionText: json['questionText'],
        questionImage: json['questionImage'],
        answerText: json['answerText'],
        course: json['course'],
        timestamp: json['timestamp'],
      );
}
