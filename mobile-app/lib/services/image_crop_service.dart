import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:yks/services/image_optimizer_service.dart';

class ImageCropService {
  static Future<XFile?> cropQuestionImage(
    BuildContext context,
    XFile image,
  ) async {
    final cropped = await ImageCropper().cropImage(
      sourcePath: image.path,
      compressFormat: ImageCompressFormat.jpg,
      compressQuality: 85,
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: 'Soruyu Kirp',
          toolbarColor: const Color(0xFF4F46E5),
          statusBarLight: true,
          toolbarWidgetColor: Colors.white,
          activeControlsWidgetColor: const Color(0xFF4F46E5),
          lockAspectRatio: false,
          hideBottomControls: false,
          initAspectRatio: CropAspectRatioPreset.original,
        ),
        IOSUiSettings(
          title: 'Soruyu Kirp',
          aspectRatioLockEnabled: false,
          resetAspectRatioEnabled: true,
          rotateButtonsHidden: false,
          rotateClockwiseButtonHidden: false,
        ),
      ],
    );

    if (cropped == null) return null;

    // Kırpma sonrası orantılı küçültme (Token Diyeti)
    final optimized = await ImageOptimizerService.optimizeForAI(cropped.path);
    return optimized;
  }
}
