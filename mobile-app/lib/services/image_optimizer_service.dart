import 'dart:io';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

/// Görselleri AI motoruna göndermeden önce orantılı olarak küçülten servis.
///
/// En uzun kenarı [maxLongEdge] piksele düşürür, diğer kenarı
/// en-boy oranını koruyarak otomatik hesaplar.
/// Eğer görsel zaten eşik değerin altındaysa dokunmaz.
class ImageOptimizerService {
  /// AI motoru için optimize edilmiş maksimum kenar uzunluğu (piksel).
  static const int maxLongEdge = 1024;

  /// JPEG sıkıştırma kalitesi (0-100).
  static const int jpegQuality = 85;

  /// Verilen [imagePath] dosyasını okur, gerekirse orantılı küçültür
  /// ve optimize edilmiş dosyayı [XFile] olarak döndürür.
  ///
  /// Eğer görselin her iki kenarı da [maxLongEdge] değerinin altındaysa,
  /// orijinal dosyaya dokunmadan aynı yolu döndürür.
  static Future<XFile> optimizeForAI(String imagePath) async {
    final file = File(imagePath);
    final bytes = await file.readAsBytes();

    final decoded = img.decodeImage(bytes);
    if (decoded == null) {
      // Decode edilemezse orijinali döndür
      return XFile(imagePath);
    }

    final int originalWidth = decoded.width;
    final int originalHeight = decoded.height;

    // En uzun kenarı bul
    final int longestEdge =
        originalWidth > originalHeight ? originalWidth : originalHeight;

    // Eşik değerin altındaysa dokunma
    if (longestEdge <= maxLongEdge) {
      return XFile(imagePath);
    }

    // Orantılı küçültme oranını hesapla
    final double ratio = maxLongEdge / longestEdge;
    final int newWidth = (originalWidth * ratio).round();
    final int newHeight = (originalHeight * ratio).round();

    // Orantılı boyutlandırma (Lanczos3 interpolasyon - en kaliteli)
    final resized = img.copyResize(
      decoded,
      width: newWidth,
      height: newHeight,
      interpolation: img.Interpolation.linear,
    );

    // JPEG olarak encode et
    final optimizedBytes = img.encodeJpg(resized, quality: jpegQuality);

    // Geçici dizine yaz
    final tempDir = await getTemporaryDirectory();
    final optimizedFile = File(
      '${tempDir.path}/optimized_${DateTime.now().millisecondsSinceEpoch}.jpg',
    );
    await optimizedFile.writeAsBytes(optimizedBytes);

    return XFile(optimizedFile.path);
  }
}
