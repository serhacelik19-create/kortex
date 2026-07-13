class Appointment {
  final int id;
  final String title;
  final String? note;
  final DateTime startTime;
  final DateTime? endTime;
  final String status;
  final String teacherName;

  Appointment({
    required this.id,
    required this.title,
    this.note,
    required this.startTime,
    this.endTime,
    required this.status,
    required this.teacherName,
  });

  factory Appointment.fromJson(Map<String, dynamic> json) {
    return Appointment(
      id: json['id'],
      title: json['title'],
      note: json['note'],
      startTime: DateTime.parse(json['startTime']),
      endTime: json['endTime'] != null ? DateTime.parse(json['endTime']) : null,
      status: json['status'],
      teacherName: json['teacher']?['name'] ?? 'Hoca',
    );
  }
}

class GuidanceSurvey {
  final int id;
  final String title;
  final String? description;
  final List<GuidanceQuestion> questions;

  GuidanceSurvey({
    required this.id,
    required this.title,
    this.description,
    required this.questions,
  });

  factory GuidanceSurvey.fromJson(Map<String, dynamic> json) {
    var qs = json['questions'] as List? ?? [];
    return GuidanceSurvey(
      id: json['id'],
      title: json['title'],
      description: json['description'],
      questions: qs.map((q) => GuidanceQuestion.fromJson(q)).toList(),
    );
  }
}

class GuidanceQuestion {
  final int id;
  final String text;
  final String type; // 'multiple_choice', 'text'
  final List<String>? options;
  final bool required;

  GuidanceQuestion({
    required this.id,
    required this.text,
    required this.type,
    this.options,
    required this.required,
  });

  factory GuidanceQuestion.fromJson(Map<String, dynamic> json) {
    return GuidanceQuestion(
      id: json['id'],
      text: json['text'],
      type: json['type'],
      options: json['options'] != null ? List<String>.from(json['options']) : null,
      required: json['required'] ?? true,
    );
  }
}

class GuidanceAssignment {
  final int id;
  final int surveyId;
  final String status; // 'pending', 'completed'
  final GuidanceSurvey? survey;
  final DateTime? completedAt;

  GuidanceAssignment({
    required this.id,
    required this.surveyId,
    required this.status,
    this.survey,
    this.completedAt,
  });

  factory GuidanceAssignment.fromJson(Map<String, dynamic> json) {
    return GuidanceAssignment(
      id: json['id'],
      surveyId: json['surveyId'],
      status: json['status'],
      survey: json['survey'] != null ? GuidanceSurvey.fromJson(json['survey']) : null,
      completedAt: json['completedAt'] != null ? DateTime.parse(json['completedAt']) : null,
    );
  }
}

class WeeklyCurriculum {
  final int id;
  final DateTime weekStartDate;
  final String status;
  final List<WeeklyCurriculumTask> tasks;

  WeeklyCurriculum({
    required this.id,
    required this.weekStartDate,
    required this.status,
    required this.tasks,
  });

  factory WeeklyCurriculum.fromJson(Map<String, dynamic> json) {
    var ts = json['tasks'] as List? ?? [];
    return WeeklyCurriculum(
      id: json['id'],
      weekStartDate: DateTime.parse(json['weekStartDate']),
      status: json['status'],
      tasks: ts.map((t) => WeeklyCurriculumTask.fromJson(t)).toList(),
    );
  }
}

class WeeklyCurriculumTask {
  final int id;
  final int dayIndex;
  final String subject;
  final String topic;
  String status;
  final bool isAiSuggested;

  WeeklyCurriculumTask({
    required this.id,
    required this.dayIndex,
    required this.subject,
    required this.topic,
    required this.status,
    required this.isAiSuggested,
  });

  factory WeeklyCurriculumTask.fromJson(Map<String, dynamic> json) {
    return WeeklyCurriculumTask(
      id: json['id'],
      dayIndex: json['dayIndex'],
      subject: json['subject'],
      topic: json['topic'],
      status: json['status'],
      isAiSuggested: json['isAiSuggested'] ?? false,
    );
  }
}
