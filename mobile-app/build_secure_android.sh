#!/bin/bash
# Askeri Sınıf Android Derleme Betiği
# Bu betik, Dart kodunu tamamen anlamsız hale getirir (Obfuscation) 
# ve tersine mühendisliği neredeyse imkansızlaştırır.

echo "🔒 YKS Asistan - Askeri Düzey Android Derlemesi Başlıyor..."
flutter build apk --release --obfuscate --split-debug-info=./obfuscated_debug_info
echo "✅ Derleme Tamamlandı. Çıktı: build/app/outputs/flutter-apk/app-release.apk"
