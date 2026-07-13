import 'dart:convert';
import 'dart:io';

import 'package:yks/services/ai_prompt_service.dart';

Future<void> main() async {
  final rawInput = (await stdin.transform(utf8.decoder).join()).trim();
  if (rawInput.isEmpty) {
    stderr.writeln('Expected JSON payload on stdin.');
    exitCode = 64;
    return;
  }

  final payload = jsonDecode(rawInput);
  if (payload is! Map<String, dynamic>) {
    stderr.writeln('Payload must be a JSON object.');
    exitCode = 64;
    return;
  }

  final mode = (payload['mode'] ?? 'question').toString();
  final course = (payload['course'] ?? '').toString();
  final branch = (payload['branch'] ?? '').toString();
  final goal = (payload['goal'] ?? '').toString();
  final userText = (payload['userText'] ?? '').toString();
  final hasImage = payload['hasImage'] == true;
  final isRetry = payload['isRetry'] == true;
  final forceDetailed = payload['forceDetailed'] == true;

  final wantsDetailed = AIPromptService.wantsDetailedAnswer(
    userText,
    forceDetailed: forceDetailed,
  );

  final systemInstruction = switch (mode) {
    'question' => AIPromptService.buildQuestionSystemInstruction(
        course: course,
        branch: branch,
        goal: goal,
        hasImage: hasImage,
        wantsDetailed: wantsDetailed,
        isRetry: isRetry,
      ),
    'explanation' => AIPromptService.buildExplanationSystemInstruction(
        course: course,
        branch: branch,
        goal: goal,
        wantsDetailed: wantsDetailed,
      ),
    _ => throw ArgumentError('Unsupported mode: $mode'),
  };

  stdout.write(
    jsonEncode({
      'mode': mode,
      'course': course,
      'branch': branch,
      'goal': goal,
      'userText': userText,
      'hasImage': hasImage,
      'isRetry': isRetry,
      'wantsDetailed': wantsDetailed,
      'normalizedCourse': AIPromptService.normalizeCourseForMetadata(course),
      'systemInstruction': systemInstruction,
    }),
  );
}
