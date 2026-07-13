import 'dart:convert';

import 'package:yks/models/smart_quiz.dart';

String repairSmartQuizJsonForLatex(String input) {
  final buffer = StringBuffer();

  for (var i = 0; i < input.length; i++) {
    final char = input[i];
    if (char != r'\') {
      buffer.write(char);
      continue;
    }

    final hasNext = i + 1 < input.length;
    final next = hasNext ? input[i + 1] : '';
    const validJsonEscapeChars = ['"', r'\', '/', 'b', 'f', 'n', 'r', 't', 'u'];

    if (next == r'\') {
      // Zaten escape edilmiş bir backslash (\\) bulduk, aynen koru
      buffer.write(r'\\');
      i++; // İkinci \ işaretini atla
      continue;
    }

    if (!hasNext || !validJsonEscapeChars.contains(next)) {
      // Geçersiz bir kaçış (örn: \( veya \c), escape ederek düzelt
      buffer.write(r'\\');
      continue;
    }

    buffer.write(char);
  }

  return buffer.toString();
}

(String?, List<SmartQuizQuestion>) parseSmartQuizResponse(
  String raw, {
  required int expectedCount,
  bool allowPartialCount = false,
}) {
  final fenced = RegExp(r'```(?:json)?\s*([\s\S]*?)```', caseSensitive: false)
      .firstMatch(raw);
  final candidate = (fenced?.group(1) ?? raw).trim();

  final objectMatch = RegExp(r'\{[\s\S]*\}').firstMatch(candidate);
  final jsonText = (objectMatch?.group(0) ?? candidate).trim();

  final decoded =
      jsonDecode(repairSmartQuizJsonForLatex(jsonText)) as Map<String, dynamic>;
  final intro = decoded['intro']?.toString();
  final questionsRaw = decoded['questions'] as List<dynamic>? ?? [];
  final parsedQuestions = questionsRaw
      .map((q) => SmartQuizQuestion.fromJson(Map<String, dynamic>.from(q)))
      .where((q) => q.question.isNotEmpty && q.options.length == 4)
      .take(allowPartialCount ? 99 : expectedCount)
      .toList();

  if (parsedQuestions.isEmpty) {
    throw const FormatException('Quiz sorulari bos geldi.');
  }

  if (!allowPartialCount && parsedQuestions.length != expectedCount) {
    throw const FormatException('Quiz sorulari eksik geldi.');
  }

  return (intro, parsedQuestions);
}
