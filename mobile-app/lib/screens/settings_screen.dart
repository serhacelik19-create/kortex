import 'package:flutter/material.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/services/api_service.dart';
import 'package:yks/theme/app_theme.dart';
import 'package:yks/components/app_toast.dart';
import 'package:yks/screens/onboarding_screen.dart';
import 'package:yks/screens/login_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final TextEditingController _universityController = TextEditingController();
  final FocusNode _universityFocus = FocusNode();

  String selectedBranch = 'Sayısal';
  String selectedGoal = '50.000';

  final List<Map<String, String>> branches = [
    {'name': 'Sayısal', 'icon': '📐'},
    {'name': 'Sözel', 'icon': '📚'},
    {'name': 'Eşit Ağırlık', 'icon': '⚖️'},
    {'name': 'Dil', 'icon': '🌍'},
    {'name': 'YDT', 'icon': '🗣️'},
  ];

  final List<String> goals = [
    '1.000',
    '5.000',
    '10.000',
    '50.000',
    '100.000',
    'Baraj'
  ];

  @override
  void initState() {
    super.initState();
    _loadSettings();
    _universityFocus.addListener(() {
      if (!_universityFocus.hasFocus) {
        _autoSave();
      }
    });
  }

  @override
  void dispose() {
    _universityController.dispose();
    _universityFocus.dispose();
    super.dispose();
  }

  void _loadSettings() {
    final settings = StorageService.getUserSettings();
    if (settings != null) {
      final String branch = (settings['branch'] ?? 'Sayısal').toString();
      final String goal = (settings['goalScore'] ?? '50.000').toString();

      setState(() {
        selectedBranch = branches.any((b) => b['name'] == branch)
            ? branch
            : branches.first['name']!;
        selectedGoal = goals.contains(goal) ? goal : goals.last;
        _universityController.text =
            (settings['goalUniversity'] ?? '').toString();
      });
    }
  }

  Future<void> _autoSave() async {
    await StorageService.saveUserSettings({
      'branch': selectedBranch,
      'goalScore': selectedGoal,
      'goalUniversity': _universityController.text,
      'darkMode': false,
    });
    if (!mounted) return;
    AppToast.show(context: context, message: "Değişiklikler Kaydedildi ✅");
  }

  Future<void> _resetData() async {
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text("Tüm Verileri Sıfırla",
                  style: TextStyle(
                      color: Colors.red, fontWeight: FontWeight.bold)),
              content: const Text(
                  "Bu işlem XP, Seri (Streak) ve tüm Chat geçmişini kalıcı olarak siler. Emin misin?"),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text("İptal")),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text("Sıfırla",
                      style: TextStyle(color: Colors.white)),
                ),
              ],
            ));

    if (confirmed == true && mounted) {
      await StorageService.clearAllData();
      if (!mounted) return;
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (context) => const OnboardingScreen()),
        (route) => false,
      );
      AppToast.show(context: context, message: "Tüm Veriler Sıfırlandı! 🔄");
    }
  }

  void _showBranchPicker() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16.0),
              child: Text("Alan Seçimi",
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ),
            ...branches.map((b) => ListTile(
                  leading:
                      Text(b['icon']!, style: const TextStyle(fontSize: 24)),
                  title: Text(b['name']!,
                      style: const TextStyle(fontWeight: FontWeight.w500)),
                  trailing: selectedBranch == b['name']
                      ? const Icon(Icons.check_circle,
                          color: AppTheme.primaryColor)
                      : null,
                  onTap: () {
                    setState(() => selectedBranch = b['name']!);
                    Navigator.pop(context);
                    _autoSave();
                  },
                )),
          ],
        ),
      ),
    );
  }

  void _showGoalPicker() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16.0),
              child: Text("Hedef Sıralama",
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ),
            ...goals.map((g) => ListTile(
                  title: Text(g,
                      style: const TextStyle(fontWeight: FontWeight.w500)),
                  trailing: selectedGoal == g
                      ? const Icon(Icons.check_circle,
                          color: AppTheme.primaryColor)
                      : null,
                  onTap: () {
                    setState(() => selectedGoal = g);
                    Navigator.pop(context);
                    _autoSave();
                  },
                )),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text("Ayarlar",
            style: TextStyle(fontWeight: FontWeight.bold)),
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(left: 8, bottom: 8),
              child: Text("ÖĞRENCİ PROFİLİ",
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey)),
            ),
            Container(
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                      color: Theme.of(context).shadowColor.withValues(alpha: 0.03),
                      blurRadius: 10,
                      offset: const Offset(0, 4))
                ],
              ),
              child: Column(
                children: [
                  _buildSettingsTile(
                    title: "Alanım",
                    subtitle: selectedBranch,
                    icon: Icons.school,
                    color: AppTheme.primaryColor,
                    onTap: _showBranchPicker,
                  ),
                  Divider(height: 1, indent: 56, color: Theme.of(context).dividerColor),
                  _buildSettingsTile(
                    title: "Hedef Sıralama",
                    subtitle: selectedGoal,
                    icon: Icons.track_changes,
                    color: Colors.orange,
                    onTap: _showGoalPicker,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),
            const Padding(
              padding: EdgeInsets.only(left: 8, bottom: 8),
              child: Text("HEDEF ÜNİVERSİTE",
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey)),
            ),
            Container(
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                      color: Theme.of(context).shadowColor.withValues(alpha: 0.03),
                      blurRadius: 10,
                      offset: const Offset(0, 4))
                ],
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: TextFormField(
                controller: _universityController,
                focusNode: _universityFocus,
                decoration: const InputDecoration(
                  icon: Text("🏫", style: TextStyle(fontSize: 24)),
                  hintText: "Örn: Boğaziçi Üniversitesi",
                  border: InputBorder.none,
                ),
                style: const TextStyle(fontWeight: FontWeight.w500),
                onFieldSubmitted: (_) => _autoSave(),
              ),
            ),
            const SizedBox(height: 32),
            const Padding(
              padding: EdgeInsets.only(left: 8, bottom: 8),
              child: Text("UYGULAMA YÖNETİMİ",
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey)),
            ),
            Container(
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                      color: Theme.of(context).shadowColor.withValues(alpha: 0.03),
                      blurRadius: 10,
                      offset: const Offset(0, 4))
                ],
              ),
              child: Column(
                children: [
                  _buildLogoutTile(),
                  Divider(height: 1, indent: 56, color: Theme.of(context).dividerColor),
                  _buildDangerTile(),
                  Divider(height: 1, indent: 56, color: Theme.of(context).dividerColor),
                  _buildDeleteAccountTile(),
                ],
              ),
            ),
            const SizedBox(height: 48),
            Center(
              child: Column(
                children: [
                  Text("YKS Asistan v1.0.0",
                      style: TextStyle(
                          color: AppTheme.adaptiveGreySubtle(context),
                          fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text("Made with ❤️ for Students",
                      style:
                          TextStyle(color: AppTheme.adaptiveGreySubtle(context), fontSize: 12)),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingsTile(
      {required String title,
      required String subtitle,
      required IconData icon,
      required Color color,
      required VoidCallback onTap}) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(title,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(subtitle,
              style: const TextStyle(color: Colors.grey, fontSize: 14)),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right, color: Colors.grey, size: 20),
        ],
      ),
      onTap: onTap,
    );
  }

  Widget _buildDangerTile() {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
            color: Colors.red.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10)),
        child: const Icon(Icons.delete_forever, color: Colors.red, size: 20),
      ),
      title: const Text("Uygulamayı Sıfırla",
          style: TextStyle(
              fontWeight: FontWeight.w600, fontSize: 15, color: Colors.red)),
      onTap: _resetData,
    );
  }

  Widget _buildDeleteAccountTile() {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
            color: Colors.red.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10)),
        child: const Icon(Icons.person_remove_rounded, color: Colors.red, size: 20),
      ),
      title: const Text("Hesabımı Sil",
          style: TextStyle(
              fontWeight: FontWeight.w600, fontSize: 15, color: Colors.red)),
      onTap: () async {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text("Hesabı Sil",
                style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
            content: const Text(
                "Hesabınızı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz."),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text("İptal")),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                onPressed: () => Navigator.pop(context, true),
                child: const Text("Sil", style: TextStyle(color: Colors.white)),
              ),
            ],
          ),
        );

        if (confirmed == true && mounted) {
          final username = StorageService.getLastLoggedInUsername();
          if (username != null) {
            await StorageService.addDeletedAccount(username);
          }
          await StorageService.clearAllData(preserveDeletedAccounts: true);
          await ApiService.logout();

          if (!mounted) return;
          Navigator.pushAndRemoveUntil(
            context,
            MaterialPageRoute(builder: (context) => const LoginScreen()),
            (route) => false,
          );
          AppToast.show(context: context, message: "Hesabınız başarıyla silindi.");
        }
      },
    );
  }

  Widget _buildLogoutTile() {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
            color: Colors.orange.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10)),
        child: const Icon(Icons.logout_rounded, color: Colors.orange, size: 20),
      ),
      title: const Text("Çıkış Yap",
          style: TextStyle(
              fontWeight: FontWeight.w600, fontSize: 15, color: Colors.orange)),
      onTap: () async {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text("Çıkış Yap",
                style: TextStyle(fontWeight: FontWeight.bold)),
            content:
                const Text("Oturumunuzu kapatmak istediğinize emin misiniz?"),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text("İptal")),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
                onPressed: () => Navigator.pop(context, true),
                child: const Text("Çıkış Yap",
                    style: TextStyle(color: Colors.white)),
              ),
            ],
          ),
        );

        if (confirmed == true && mounted) {
          StorageService.clearChatSessionCache();
          await ApiService.logout();
          if (!mounted) return;
          Navigator.pushAndRemoveUntil(
            context,
            MaterialPageRoute(builder: (context) => const LoginScreen()),
            (route) => false,
          );
        }
      },
    );
  }
}
