class MathUtils {
  static String _normalizeBoldMathLabels(String line) {
    final pattern = RegExp(
      r'\*\*([^*\n()]+?)\s*\(([^)]*\\[A-Za-z][^)]*)\)(:?)\*\*',
      caseSensitive: false,
    );

    return line.replaceAllMapped(pattern, (match) {
      final title = (match.group(1) ?? '').trim();
      final expr = (match.group(2) ?? '').trim();
      final colon = match.group(3) ?? '';
      if (title.isEmpty || expr.isEmpty) return match.group(0) ?? '';
      return '**$title** \\($expr\\)$colon';
    });
  }

  static String _wrapLooseInlineMath(String line) {
    if (line.contains(r'\(') || line.contains(r'\[')) {
      return line;
    }

    const latexCommands =
        r'(?:frac|sqrt|to|neq|leq|geq|lim|sin|cos|tan|log|ln|cdot|times|pm|alpha|beta|gamma|pi|theta)';
    final looseMath = RegExp(
      '(^|\\s)(\\\\$latexCommands(?:\\s*\\{[^{}]*\\}|\\s*\\[[^\\]]*\\]|\\s*[A-Za-z0-9^_{}()+\\-*/=<>|.,])+)',
      caseSensitive: false,
    );

    return line.replaceAllMapped(looseMath, (match) {
      final prefix = match.group(1) ?? '';
      final expr = (match.group(2) ?? '').trimRight();
      if (expr.contains(r'\(') ||
          expr.contains(r'\)') ||
          expr.contains(r'\[') ||
          expr.contains(r'\]')) {
        return match.group(0) ?? '';
      }
      return '$prefix\\(${expr.trim()}\\)';
    });
  }

  static String _normalizeLooseLatexLines(String text) {
    final normalizedLines = <String>[];
    var inBlockMath = false;

    for (final line in text.split('\n')) {
      var current = _normalizeBoldMathLabels(line);
      final trimmed = current.trim();

      if (!inBlockMath) {
        current = _wrapLooseInlineMath(current);
      }

      current = current.replaceAllMapped(
        RegExp(r'\(\((.+?\\[A-Za-z].+?)\)\)'),
        (match) => '\\(${(match.group(1) ?? '').trim()}\\)',
      );

      normalizedLines.add(current);

      if (trimmed == r'\[') {
        inBlockMath = true;
      } else if (trimmed == r'\]') {
        inBlockMath = false;
      }
    }

    return normalizedLines.join('\n');
  }

  static String _mergeSplitInlineMath(String input) {
    var repaired = input;

    // Some model outputs split a single inline equation into two consecutive
    // inline-math groups right at a comparison/arrow operator:
    // \(a =\)\(b\)  ->  \(a = b\)
    repaired = repaired.replaceAllMapped(
      RegExp(
        r'\\\(([^\n]*?(?:=|<|>|\\neq|\\leq|\\geq|\\to|\\Rightarrow|\\implies))\s*\\\)\s*\\\(([^\n]*?)\\\)',
      ),
      (match) => '\\(${match.group(1)!.trim()} ${match.group(2)!.trim()}\\)',
    );

    // Another common malformed case is a second inline group that starts with
    // a comparison operator:
    // \(f(-3)\)\(\neq -5\) -> \(f(-3) \neq -5\)
    repaired = repaired.replaceAllMapped(
      RegExp(
        r'\\\(([^\n]*?)\\\)\s*\\\(((?:\\(?:neq|leq|geq|to|approx|pm)|[=<>]).*?)\\\)',
      ),
      (match) => '\\(${match.group(1)!.trim()} ${match.group(2)!.trim()}\\)',
    );

    return repaired;
  }

  static String _balanceDelimiters(
    String input, {
    required String open,
    required String close,
    required String openFallback,
    required String closeFallback,
  }) {
    final openMatches = RegExp(RegExp.escape(open)).allMatches(input).toList();
    final closeMatches =
        RegExp(RegExp.escape(close)).allMatches(input).toList();

    if (openMatches.isEmpty && closeMatches.isEmpty) return input;

    final chars = input.split('');
    final opens = openMatches.map((m) => m.start).toList();
    final closes = closeMatches.map((m) => m.start).toList();
    final matchedOpenStarts = <int>{};

    for (final closeStart in closes) {
      int? candidate;
      for (final openStart in opens) {
        if (openStart < closeStart && !matchedOpenStarts.contains(openStart)) {
          candidate = openStart;
        }
      }

      if (candidate != null) {
        matchedOpenStarts.add(candidate);
      } else {
        // Orphan close delimiter -> plain text close.
        chars[closeStart] = closeFallback;
        if (close.length > 1) {
          for (var i = 1; i < close.length; i++) {
            chars[closeStart + i] = '';
          }
        }
      }
    }

    for (final openStart in opens) {
      if (!matchedOpenStarts.contains(openStart)) {
        // Orphan open delimiter -> plain text open.
        chars[openStart] = openFallback;
        if (open.length > 1) {
          for (var i = 1; i < open.length; i++) {
            chars[openStart + i] = '';
          }
        }
      }
    }

    return chars.join();
  }

  static String _normalizeInlineMathContent(String content) {
    return content
        .replaceAll(RegExp(r'\\\('), '(')
        .replaceAll(RegExp(r'\\\)'), ')')
        .replaceAll(RegExp(r'\\\['), '[')
        .replaceAll(RegExp(r'\\\]'), ']')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  static String _normalizeBlockMathContent(String content) {
    return content
        .replaceAll(RegExp(r'\\\('), '(')
        .replaceAll(RegExp(r'\\\)'), ')')
        .replaceAll(RegExp(r'\\\['), '[')
        .replaceAll(RegExp(r'\\\]'), ']')
        .trim();
  }

  static String fallbackMathText(String text) {
    return text
        .replaceAllMapped(
          RegExp(r'\\([()\[\]])'),
          (match) => match.group(1) ?? '',
        )
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  /// Sanitizes text for consistent LaTeX rendering in Markdown.
  /// Converts common delimiters to a single format and separates Turkish suffixes
  /// from closing delimiters so the markdown latex parser can match them.
  static String sanitizeMath(String text) {
    var sanitized = text
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .replaceAll('\u200b', '');

    // Normalize over-escaped model outputs without touching valid TeX commands
    // such as matrix/aligned row breaks (\\).
    sanitized = sanitized.replaceAll(r'\*\*', '**');

    // Some responses arrive with double-escaped latex delimiters. Normalize only
    // the delimiters themselves and leave inner TeX intact.
    sanitized = sanitized
        .replaceAll(r'\\(', r'\(')
        .replaceAll(r'\\)', r'\)')
        .replaceAll(r'\\[', r'\[')
        .replaceAll(r'\\]', r'\]');

    sanitized = _normalizeLooseLatexLines(sanitized);

    sanitized = sanitized.replaceAllMapped(
      RegExp(r'(?<!\$)\$\$([\s\S]+?)\$\$(?!\$)'),
      (match) => '\\[\n${_normalizeBlockMathContent(match.group(1)!)}\n\\]',
    );

    sanitized = sanitized.replaceAllMapped(
      RegExp(r'(?<!\$)\$([^$\n]+?)\$(?!\$)'),
      (match) => '\\(${_normalizeInlineMathContent(match.group(1)!)}\\)',
    );

    sanitized = _mergeSplitInlineMath(sanitized);

    // Common malformed delimiter duplicates from model output.
    sanitized = sanitized
        .replaceAll(RegExp(r'\\\)\s*\\\)'), r'\)')
        .replaceAll(RegExp(r'\\\(\s*\\\('), r'\(')
        .replaceAll(RegExp(r'\\\]\s*\\\]'), r'\]')
        .replaceAll(RegExp(r'\\\[\s*\\\['), r'\[');

    // Some model outputs contain orphan LaTeX delimiters (e.g. "\)" without "\(").
    // Convert unmatched delimiters to plain characters to avoid red parse fallbacks.
    sanitized = _balanceDelimiters(
      sanitized,
      open: r'\(',
      close: r'\)',
      openFallback: '(',
      closeFallback: ')',
    );
    sanitized = _balanceDelimiters(
      sanitized,
      open: r'\[',
      close: r'\]',
      openFallback: '[',
      closeFallback: ']',
    );

    // flutter_markdown_latex expects punctuation or whitespace right after
    // the closing delimiter. Turkish apostrophe suffixes break that match.
    sanitized = sanitized.replaceAllMapped(
      RegExp(r"(\\\)|\\\]|(?:\$\$)|\$)(['’][A-Za-zÇĞİÖŞÜçğıöşü]+)"),
      (match) => '${match.group(1)} ${match.group(2)}',
    );

    sanitized = sanitized.replaceAllMapped(
      RegExp(r'(\\\)|\\\])([A-Za-zÇĞİÖŞÜçğıöşü]{2,})'),
      (match) => '${match.group(1)} ${match.group(2)}',
    );

    return sanitized;
  }
}
