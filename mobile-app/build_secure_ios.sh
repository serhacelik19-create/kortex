#!/bin/bash
# Askeri Sınıf iOS Derleme Betiği
# Bu betik, Dart kodunu tamamen anlamsız hale getirir (Obfuscation) 
# ve tersine mühendisliği neredeyse imkansızlaştırır.

echo "🔒 YKS Asistan - Askeri Düzey iOS Derlemesi Başlıyor..."
flutter build ipa --release --obfuscate --split-debug-info=./obfuscated_debug_info
echo "✅ Derleme Tamamlandı. Çıktı: build/ios/ipa/yks.ipa"
