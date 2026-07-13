import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class OnDeviceOcrService {
  static const MethodChannel _channel = MethodChannel('com.serhat.yks/ocr');

  static Future<String?> extractText(String imagePath) async {
    if (imagePath.trim().isEmpty) return null;
    if (kIsWeb) return null;
    try {
      final result = await _channel.invokeMethod<String>(
        'extractText',
        {'imagePath': imagePath},
      );
      final normalized = (result ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();
      if (normalized.length < 3) return null;
      return normalized;
    } catch (_) {
      return null;
    }
  }
}
