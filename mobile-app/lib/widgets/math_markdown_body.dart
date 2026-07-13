import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_math_fork/flutter_math.dart';
import 'package:yks/utils/math_utils.dart';

enum _MathSegmentType { text, inlineMath, blockMath }

class _MathSegment {
  final _MathSegmentType type;
  final String value;

  const _MathSegment(this.type, this.value);
}

class MathMarkdownBody extends StatelessWidget {
  static const String _inlineMathStart = '<<<MATH_INLINE_START>>>';
  static const String _inlineMathEnd = '<<<MATH_INLINE_END>>>';
  static const String _blockMathStart = '<<<MATH_BLOCK_START>>>';
  static const String _blockMathEnd = '<<<MATH_BLOCK_END>>>';

  final String data;
  final MarkdownStyleSheet? styleSheet;

  const MathMarkdownBody({
    super.key,
    required this.data,
    this.styleSheet,
  });

  @override
  Widget build(BuildContext context) {
    final normalized = MathUtils.sanitizeMath(data);
    final baseStyle =
        styleSheet?.p ?? Theme.of(context).textTheme.bodyMedium ?? const TextStyle();
    final lines = _coalesceDisplayBlocks(normalized.split('\n'));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: lines.map((line) => _buildLine(context, line, baseStyle)).toList(),
    );
  }

  List<String> _coalesceDisplayBlocks(List<String> lines) {
    final result = <String>[];
    var i = 0;

    while (i < lines.length) {
      final line = lines[i];
      if (line.trim() == r'\[') {
        final buffer = StringBuffer();
        i++;
        while (i < lines.length && lines[i].trim() != r'\]') {
          if (buffer.isNotEmpty) buffer.writeln();
          buffer.write(lines[i]);
          i++;
        }
        result.add('\\[${buffer.toString()}\\]');
        if (i < lines.length && lines[i].trim() == r'\]') {
          i++;
        }
        continue;
      }

      result.add(line);
      i++;
    }

    return result;
  }

  Widget _buildLine(BuildContext context, String rawLine, TextStyle baseStyle) {
    if (rawLine.trim().isEmpty) {
      return const SizedBox(height: 10);
    }

    var line = rawLine;
    var isBullet = false;
    final bulletMatch = RegExp(r'^\s*[-*•]\s+').firstMatch(line);
    if (bulletMatch != null) {
      isBullet = true;
      line = line.substring(bulletMatch.end);
    }

    final trimmed = line.trim();
    if (trimmed.startsWith(r'\[') && trimmed.endsWith(r'\]')) {
      final expression =
          trimmed.substring(2, trimmed.length - 2).trim();
      final formula = Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: _buildMathContentWidget(
          expression,
          baseStyle,
          MathStyle.display,
        ),
      );

      if (!isBullet) return formula;
      return Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2, right: 8),
              child: Text('•', style: baseStyle),
            ),
            Expanded(child: formula),
          ],
        ),
      );
    }

    final content = Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      runSpacing: 4,
      children: _parseInlineWidgets(line, baseStyle),
    );

    if (!isBullet) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: content,
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2, right: 8),
            child: Text('•', style: baseStyle),
          ),
          Expanded(child: content),
        ],
      ),
    );
  }

  List<Widget> _parseInlineWidgets(String text, TextStyle baseStyle) {
    final widgets = <Widget>[];
    for (final segment in _tokenizeSegments(text)) {
      switch (segment.type) {
        case _MathSegmentType.text:
          widgets.addAll(_parseTextFormatting(segment.value, baseStyle));
          break;
        case _MathSegmentType.inlineMath:
          widgets.add(_mathWidget(segment.value, baseStyle, MathStyle.text));
          break;
        case _MathSegmentType.blockMath:
          widgets.add(_mathWidget(segment.value, baseStyle, MathStyle.display));
          break;
      }
    }

    return widgets;
  }

  List<Widget> _parseTextFormatting(String text, TextStyle baseStyle) {
    final widgets = <Widget>[];
    var index = 0;

    while (index < text.length) {
      if (text.startsWith('**', index)) {
        final end = text.indexOf('**', index + 2);
        if (end != -1) {
          final boldText = text.substring(index + 2, end);
          widgets.add(
            Text(
              boldText,
              style: baseStyle.copyWith(fontWeight: FontWeight.bold),
            ),
          );
          index = end + 2;
          continue;
        }
      }

      final nextBold = text.indexOf('**', index);
      final nextIndex = nextBold == -1 ? text.length : nextBold;
      if (nextIndex == index) {
        widgets.add(_textWidget('**', baseStyle));
        index += 2;
        continue;
      }
      widgets.add(_textWidget(text.substring(index, nextIndex), baseStyle));
      index = nextIndex;
    }

    return widgets;
  }

  List<_MathSegment> _tokenizeSegments(String text) {
    final tokenized = _tokenizeMathDelimiters(text);
    final segments = <_MathSegment>[];
    final buffer = StringBuffer();
    var index = 0;

    void flushText() {
      if (buffer.isEmpty) return;
      segments.add(_MathSegment(_MathSegmentType.text, buffer.toString()));
      buffer.clear();
    }

    while (index < tokenized.length) {
      if (tokenized.startsWith(_blockMathStart, index)) {
        final end = tokenized.indexOf(_blockMathEnd, index + _blockMathStart.length);
        if (end != -1) {
          flushText();
          final expr =
              tokenized.substring(index + _blockMathStart.length, end).trim();
          segments.add(_MathSegment(_MathSegmentType.blockMath, expr));
          index = end + _blockMathEnd.length;
          continue;
        }
      }

      if (tokenized.startsWith(_inlineMathStart, index)) {
        final end =
            tokenized.indexOf(_inlineMathEnd, index + _inlineMathStart.length);
        if (end != -1) {
          flushText();
          final expr =
              tokenized.substring(index + _inlineMathStart.length, end).trim();
          segments.add(_MathSegment(_MathSegmentType.inlineMath, expr));
          index = end + _inlineMathEnd.length;
          final spacing = _consumeEscapedPunctuation(tokenized, index);
          if (spacing != null) {
            buffer.write(spacing.$1);
            index = spacing.$2;
          }
          continue;
        }
      }

      final environmentMatch = _matchLatexEnvironment(tokenized, index);
      if (environmentMatch != null && environmentMatch.start == index) {
        flushText();
        segments.add(
          _MathSegment(
            _MathSegmentType.blockMath,
            tokenized.substring(environmentMatch.start, environmentMatch.end).trim(),
          ),
        );
        index = environmentMatch.end;
        continue;
      }

      final looseMatch = _matchLooseLatex(tokenized, index);
      if (looseMatch != null && looseMatch.start == index) {
        flushText();
        segments.add(
          _MathSegment(
            _MathSegmentType.inlineMath,
            tokenized.substring(looseMatch.start, looseMatch.end).trim(),
          ),
        );
        index = looseMatch.end;
        final spacing = _consumeEscapedPunctuation(tokenized, index);
        if (spacing != null) {
          buffer.write(spacing.$1);
          index = spacing.$2;
        }
        continue;
      }

      buffer.write(tokenized[index]);
      index++;
    }

    flushText();
    return segments;
  }

  Match? _matchLooseLatex(String text, int start) {
    final pattern = RegExp(
      r'\\(?:to|neq|leq|geq|sin|cos|tan|log|ln|lim|sqrt)\b(?:\s*\{[^{}]*\}|\s*\[[^\]]*\]|\s*[A-Za-z0-9^_{}()+\-*/=<>|.,])+|\\frac\s*\{[^{}]+\}\s*\{[^{}]+\}(?:\s*\\(?:neq|leq|geq|to)\s*-?\\frac\s*\{[^{}]+\}\s*\{[^{}]+\})?',
      caseSensitive: false,
    );

    final matches = pattern.allMatches(text, start);
    if (matches.isEmpty) return null;
    return matches.first;
  }

  Match? _matchLatexEnvironment(String text, int start) {
    final pattern = RegExp(
      r'\\begin\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}[\s\S]+?\\end\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}',
      caseSensitive: false,
    );
    final matches = pattern.allMatches(text, start);
    if (matches.isEmpty) return null;
    return matches.first;
  }

  String _tokenizeMathDelimiters(String text) {
    return text
        .replaceAll(r'\\(', _inlineMathStart)
        .replaceAll(r'\\)', _inlineMathEnd)
        .replaceAll(r'\\[', _blockMathStart)
        .replaceAll(r'\\]', _blockMathEnd)
        .replaceAll(r'\(', _inlineMathStart)
        .replaceAll(r'\)', _inlineMathEnd)
        .replaceAll(r'\[', _blockMathStart)
        .replaceAll(r'\]', _blockMathEnd);
  }

  (String, int)? _consumeEscapedPunctuation(String text, int index) {
    if (index + 1 >= text.length) return null;
    if (text[index] != r'\') return null;

    final next = text[index + 1];
    if (next == ':' || next == ';' || next == ',' || next == '.') {
      return (next, index + 2);
    }

    return null;
  }

  Widget _mathWidget(String expression, TextStyle baseStyle, MathStyle style) {
    final normalizedExpression = expression
        .replaceAll(r'\:', ':')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    return _buildMathContentWidget(normalizedExpression, baseStyle, style);
  }

  Widget _buildMathContentWidget(
    String expression,
    TextStyle baseStyle,
    MathStyle style,
  ) {
    final alignedRows = _extractAlignedRows(expression);
    if (alignedRows != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: alignedRows
            .map(
              (row) => SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Math.tex(
                  row,
                  mathStyle: style,
                  textStyle: baseStyle,
                  onErrorFallback: (error) => SelectableText(
                    MathUtils.fallbackMathText(row),
                    style: baseStyle,
                  ),
                ),
              ),
            )
            .toList(),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Math.tex(
        expression,
        mathStyle: style,
        textStyle: baseStyle,
        onErrorFallback: (error) => SelectableText(
          MathUtils.fallbackMathText(expression),
          style: baseStyle,
        ),
      ),
    );
  }

  List<String>? _extractAlignedRows(String expression) {
    final match = RegExp(
      r'^\\begin\{aligned\}([\s\S]+)\\end\{aligned\}$',
      caseSensitive: false,
    ).firstMatch(expression);
    if (match == null) return null;

    final body = (match.group(1) ?? '').trim();
    if (body.isEmpty) return null;

    return body
        .split(RegExp(r'(?<!\\)\\\\'))
        .map((row) => row.replaceAll('&', '').trim())
        .where((row) => row.isNotEmpty)
        .toList();
  }

  Widget _textWidget(String text, TextStyle baseStyle) {
    final cleaned = _stripSentinels(text);
    if (cleaned.isEmpty) {
      return const SizedBox.shrink();
    }
    return Text(cleaned, style: baseStyle);
  }

  String _stripSentinels(String text) {
    return text
        .replaceAll(_inlineMathStart, '')
        .replaceAll(_inlineMathEnd, '')
        .replaceAll(_blockMathStart, '')
        .replaceAll(_blockMathEnd, '');
  }
}
