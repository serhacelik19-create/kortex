import 'package:flutter/material.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/theme/app_theme.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentStep = 0;

  String _branch = '';
  String _goalUniversity = '';
  String _goalScore = '';

  final List<String> _branches = ['Sayısal', 'Eşit Ağırlık', 'Sözel', 'YDT'];

  void _nextStep() {
    if (_currentStep < 2) {
      _pageController.nextPage(
          duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    } else {
      _finishOnboarding();
    }
  }

  void _prevStep() {
    if (_currentStep > 0) {
      _pageController.previousPage(
          duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    }
  }

  Future<void> _finishOnboarding() async {
    await StorageService.saveUserSettings({
      'branch': _branch.isEmpty ? 'Sayısal' : _branch,
      'goalScore': _goalScore,
      'goalUniversity': _goalUniversity,
      'darkMode': false,
    });
    // Default exam date (2026 YKS)
    await StorageService.setExamDate('2026-06-20');
    await StorageService.setOnboardingComplete();

    if (mounted) {
      Navigator.of(context).pushNamedAndRemoveUntil('/', (route) => false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            _buildProgressDots(),
            Expanded(
              child: PageView(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                onPageChanged: (idx) => setState(() => _currentStep = idx),
                children: [
                  _buildStep1(),
                  _buildStep2(),
                  _buildStep3(),
                ],
              ),
            ),
            _buildNavigationButtons(),
          ],
        ),
      ),
    );
  }

  Widget _buildProgressDots() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(3, (index) {
          bool isActive = index == _currentStep;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            margin: const EdgeInsets.symmetric(horizontal: 4),
            height: 10,
            width: isActive ? 28 : 10,
            decoration: BoxDecoration(
              color: isActive ? AppTheme.primaryColor : Colors.grey.shade300,
              borderRadius: BorderRadius.circular(5),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildStep1() {
    return Padding(
      padding: const EdgeInsets.all(30),
      child: Column(
        children: [
          const Text("🎯", style: TextStyle(fontSize: 64)),
          const SizedBox(height: 16),
          const Text("Hedefini Belirle",
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text("Hangi alanda sınava gireceksin?",
              style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 40),
          Expanded(
            child: GridView.count(
              crossAxisCount: 1,
              childAspectRatio: 4,
              mainAxisSpacing: 12,
              children: _branches.map((b) => _buildBranchCard(b)).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBranchCard(String b) {
    bool isSelected = _branch == b;
    return GestureDetector(
      onTap: () => setState(() => _branch = b),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        decoration: BoxDecoration(
          color: isSelected
              ? AppTheme.primaryColor.withValues(alpha: 0.05)
              : Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppTheme.primaryColor : Colors.grey.shade200,
            width: 2,
          ),
        ),
        child: Row(
          children: [
            Text(_getBranchEmoji(b), style: const TextStyle(fontSize: 24)),
            const SizedBox(width: 14),
            Text(b,
                style:
                    const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
            const Spacer(),
            if (isSelected)
              const Icon(Icons.check_circle, color: AppTheme.primaryColor),
          ],
        ),
      ),
    );
  }

  String _getBranchEmoji(String b) {
    switch (b) {
      case 'Sayısal':
        return '🔬';
      case 'Eşit Ağırlık':
        return '⚖️';
      case 'Sözel':
        return '📖';
      default:
        return '🌐';
    }
  }

  Widget _buildStep2() {
    return _buildInputStep(
      emoji: "🏫",
      title: "Hayalin Ne?",
      subtitle: "Hedef üniversite ve bölümünü yaz!",
      label: "Hedef Üniversite / Bölüm",
      hint: "Örn: Boğaziçi Bilgisayar Müh.",
      value: _goalUniversity,
      onChanged: (v) => setState(() => _goalUniversity = v),
    );
  }

  Widget _buildStep3() {
    return _buildInputStep(
      emoji: "⏰",
      title: "Son Hazırlık",
      subtitle: "Sınav tarihini ve hedef puanını gir.",
      label: "Hedef Puan / Sıralama",
      hint: "Örn: İlk 10.000 veya 480 Puan",
      value: _goalScore,
      onChanged: (v) => setState(() => _goalScore = v),
      extra: Container(
        margin: const EdgeInsets.only(top: 20),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.primaryColor.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            const Text("📅", style: TextStyle(fontSize: 28)),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("2026 YKS Tarihi",
                    style: TextStyle(color: Colors.grey, fontSize: 13)),
                Text("20 Haziran 2026",
                    style: TextStyle(
                        color: AppTheme.primaryColor,
                        fontWeight: FontWeight.bold,
                        fontSize: 17)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInputStep({
    required String emoji,
    required String title,
    required String subtitle,
    required String label,
    required String hint,
    required String value,
    required Function(String) onChanged,
    Widget? extra,
  }) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(30),
      child: Column(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 64)),
          const SizedBox(height: 16),
          Text(title,
              style:
                  const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(subtitle, style: const TextStyle(color: Colors.grey)),
          const SizedBox(height: 40),
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: 0.1)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                TextField(
                  onChanged: onChanged,
                  decoration: InputDecoration(
                    hintText: hint,
                    fillColor: Theme.of(context).scaffoldBackgroundColor,
                    filled: true,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: Colors.grey.shade200)),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                    "💡 Bu bilgi, AI asistanının sana özel tavsiyelerinde kullanılacak.",
                    style: TextStyle(color: Colors.grey, fontSize: 13)),
                if (extra != null) extra,
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNavigationButtons() {
    return Padding(
      padding: const EdgeInsets.all(30),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          if (_currentStep > 0)
            TextButton(
                onPressed: _prevStep,
                child: const Text("← Geri",
                    style: TextStyle(color: Colors.grey, fontSize: 16)))
          else
            const SizedBox(width: 80),
          ElevatedButton(
            onPressed:
                (_currentStep == 0 && _branch.isEmpty) ? null : _nextStep,
            style: ElevatedButton.styleFrom(
              backgroundColor:
                  _currentStep == 2 ? Colors.green : AppTheme.primaryColor,
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
            ),
            child: Text(
              _currentStep == 2 ? "Başlayalım! 🚀" : "Devam →",
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}
