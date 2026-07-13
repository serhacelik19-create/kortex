import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show debugPrint, kReleaseMode;
import 'package:flutter/material.dart';
import 'package:yks/screens/main_screen.dart';
import 'package:yks/screens/onboarding_screen.dart';
import 'package:yks/screens/login_screen.dart';
import 'package:yks/screens/parent_notifications_screen.dart';
import 'package:safe_device/safe_device.dart';

import 'package:yks/theme/app_theme.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/services/api_service.dart';
import 'package:intl/date_symbol_data_local.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Olası widget (gri ekran) hatalarını ekrana açıkça yazdırmak için hata yakalayıcı:
  ErrorWidget.builder = (FlutterErrorDetails details) {
    final message = kReleaseMode
        ? 'Beklenmeyen bir hata oluştu. Uygulamayı yeniden açıp tekrar deneyin.'
        : "${details.exceptionAsString()}\n\n${details.stack}";

    return Material(
      color: Colors.red,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Text(
            message,
            style: const TextStyle(color: Colors.white, fontSize: 12),
          ),
        ),
      ),
    );
  };

  bool isDeviceSafe = true;
  bool isLoggedIn = false;
  bool isParentLoggedIn = false;
  bool isOnboardingComplete = false;
  String? startupError;

  try {
    await initializeDateFormatting('tr_TR', null);
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Firebase initialization skipped: $e');
    }
    await StorageService.init();
    ApiService.onLogoutCleanup = StorageService.clearSessionData;

    if (kReleaseMode) {
      try {
        if (await SafeDevice.isJailBroken) isDeviceSafe = false;
        // İsteğe bağlı eklenebilir: if (!await SafeDevice.isRealDevice) isDeviceSafe = false;
      } catch (_) {}
    }

    isLoggedIn = await ApiService.isLoggedIn();
    isParentLoggedIn = !isLoggedIn && await ApiService.isParentLoggedIn();
    isOnboardingComplete = StorageService.getOnboardingComplete();
  } catch (e, stack) {
    debugPrint('App startup failed: $e');
    debugPrintStack(stackTrace: stack);
    startupError = kReleaseMode
        ? 'Uygulama baslatilirken bir hata olustu. Lutfen uygulamayi yeniden acin.'
        : '$e\n\n$stack';
  }

  // Token süresi dolunca login ekranına yönlendir
  ApiService.onTokenExpired = () {
    navigatorKey.currentState
        ?.pushNamedAndRemoveUntil('/login', (route) => false);
  };

  runApp(
    MyApp(
      isLoggedIn: isLoggedIn,
      isParentLoggedIn: isParentLoggedIn,
      isDeviceSafe: isDeviceSafe,
      isOnboardingComplete: isOnboardingComplete,
      startupError: startupError,
    ),
  );
}

class MyApp extends StatefulWidget {
  final bool isLoggedIn;
  final bool isParentLoggedIn;
  final bool isDeviceSafe;
  final bool isOnboardingComplete;
  final String? startupError;

  const MyApp({
    super.key,
    required this.isLoggedIn,
    required this.isParentLoggedIn,
    required this.isDeviceSafe,
    required this.isOnboardingComplete,
    this.startupError,
  });

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _linkSubscription;

  @override
  void initState() {
    super.initState();
    _initDeepLinks();
  }

  Future<void> _initDeepLinks() async {
    try {
      final initialLink = await _appLinks.getInitialLink();
      if (initialLink != null) await _handleDeepLink(initialLink);
    } catch (e) {
      debugPrint('Initial deep link error: $e');
    }

    _linkSubscription = _appLinks.uriLinkStream.listen(
      _handleDeepLink,
      onError: (error) => debugPrint('Deep link stream error: $error'),
    );
  }

  Future<void> _handleDeepLink(Uri uri) async {
    if (uri.scheme != 'yks' || uri.host != 'parent-activate') return;
    final token = uri.queryParameters['token'];
    if (token == null || token.isEmpty) {
      _showMessage('Veli aktivasyon linki geçersiz.');
      return;
    }

    final hasStudentToken = await ApiService.isLoggedIn();
    final hasStudentData = await ApiService.getStudentData() != null;
    final hasStudentSession = hasStudentToken || hasStudentData;
    if (hasStudentSession) {
      _showMessage(
        'Bu cihazda öğrenci oturumu açık olduğu için veli bağlantısı etkinleştirilemez.',
      );
      return;
    }

    if (await ApiService.isParentLoggedIn()) {
      _showMessage('Bu cihaz zaten veli bilgilendirme modunda.');
      navigatorKey.currentState
          ?.pushNamedAndRemoveUntil('/parent', (route) => false);
      return;
    }

    final result = await ApiService.consumeParentActivation(
      token,
      deviceLabel: 'Mobil Uygulama',
    );
    if (result['success'] == true) {
      navigatorKey.currentState
          ?.pushNamedAndRemoveUntil('/parent', (route) => false);
      _showMessage('Veli bilgilendirme modu etkinleştirildi.');
    } else {
      _showMessage(result['message']?.toString() ??
          'Veli aktivasyonu tamamlanamadı.');
    }
  }

  void _showMessage(String message) {
    final context = navigatorKey.currentContext;
    if (context == null) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.startupError != null) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Center(
                child: SingleChildScrollView(
                  child: Text(
                    widget.startupError!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.red,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    if (!widget.isDeviceSafe) {
      return const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Text(
              'Güvenlik ihlali tespit edildi.\n(Jailbreak/Root algılandı)',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
            ),
          ),
        ),
      );
    }

    String initial = '/login';
    if (widget.isLoggedIn) {
      initial = widget.isOnboardingComplete ? '/' : '/onboarding';
    } else if (widget.isParentLoggedIn) {
      initial = '/parent';
    }

    return MaterialApp(
      title: 'YKS Asistan',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.system,
      initialRoute: initial,
      routes: {
        '/': (context) => const MainScreen(),
        '/login': (context) => const LoginScreen(),
        '/onboarding': (context) => const OnboardingScreen(),
        '/parent': (context) => const ParentNotificationsScreen(),
      },
    );
  }
}
