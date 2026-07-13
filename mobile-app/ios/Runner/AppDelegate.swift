import Flutter
import UIKit
import Vision

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private let ocrChannel = "com.kortex.ai/ocr"
  private var ocrMethodChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    if let controller = window?.rootViewController as? FlutterViewController {
      configureOcrChannel(binaryMessenger: controller.binaryMessenger)
    }
    return result
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    configureOcrChannel(binaryMessenger: engineBridge.applicationRegistrar.messenger())
  }

  private func configureOcrChannel(binaryMessenger: FlutterBinaryMessenger) {
    guard ocrMethodChannel == nil else { return }

    let channel = FlutterMethodChannel(
      name: ocrChannel,
      binaryMessenger: binaryMessenger
    )

    channel.setMethodCallHandler { [weak self] call, flutterResult in
      guard call.method == "extractText" else {
        flutterResult(FlutterMethodNotImplemented)
        return
      }

      guard
        let args = call.arguments as? [String: Any],
        let imagePath = args["imagePath"] as? String,
        !imagePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      else {
        flutterResult(
          FlutterError(code: "INVALID_PATH", message: "imagePath gerekli.", details: nil)
        )
        return
      }

      self?.extractText(from: imagePath, flutterResult: flutterResult)
    }

    ocrMethodChannel = channel
  }

  private func extractText(from imagePath: String, flutterResult: @escaping FlutterResult) {
    let imageUrl = URL(fileURLWithPath: imagePath)
    guard let image = UIImage(contentsOfFile: imageUrl.path), let cgImage = image.cgImage else {
      flutterResult(
        FlutterError(code: "DECODE_FAILED", message: "Gorsel okunamadi.", details: nil)
      )
      return
    }

    let request = VNRecognizeTextRequest { request, error in
      if let error {
        flutterResult(
          FlutterError(code: "OCR_FAILED", message: error.localizedDescription, details: nil)
        )
        return
      }

      let observations = request.results as? [VNRecognizedTextObservation] ?? []
      let text = observations
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
      flutterResult(text)
    }

    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try handler.perform([request])
      } catch {
        flutterResult(
          FlutterError(code: "OCR_EXCEPTION", message: error.localizedDescription, details: nil)
        )
      }
    }
  }
}
