package com.kortex.ai

import android.graphics.BitmapFactory
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val ocrChannel = "com.kortex.ai/ocr"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, ocrChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "extractText" -> {
                        val imagePath = call.argument<String>("imagePath")
                        if (imagePath.isNullOrBlank()) {
                            result.error("INVALID_PATH", "imagePath gerekli.", null)
                            return@setMethodCallHandler
                        }
                        extractText(imagePath, result)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun extractText(imagePath: String, result: MethodChannel.Result) {
        try {
            val bitmap = BitmapFactory.decodeFile(imagePath)
            if (bitmap == null) {
                result.error("DECODE_FAILED", "Gorsel okunamadi.", null)
                return
            }

            val inputImage = InputImage.fromBitmap(bitmap, 0)
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            recognizer.process(inputImage)
                .addOnSuccessListener { visionText ->
                    result.success(visionText.text)
                    recognizer.close()
                }
                .addOnFailureListener { error ->
                    result.error("OCR_FAILED", error.localizedMessage, null)
                    recognizer.close()
                }
        } catch (error: Exception) {
            result.error("OCR_EXCEPTION", error.localizedMessage, null)
        }
    }
}
