import 'package:flutter/material.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/services/api_service.dart';
import 'package:yks/theme/app_theme.dart';
import 'package:intl/intl.dart';
import 'package:yks/screens/settings_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  int streak = 0;
  Map<String, int> courseStats = {};
  Map<String, int> weeklyActivity = {};
  String studentName = 'Ogrenci';
  String studentUsername = '-';
  String institutionName = 'Kurum bilgisi yok';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final student = await ApiService.getStudentData();

    if (!mounted) return;

    setState(() {
      streak = StorageService.getStreak();
      courseStats = Map<String, int>.from(StorageService.getCourseStats());
      weeklyActivity = StorageService.getWeeklyActivity();
      studentName = (student?['name'] ?? 'Ogrenci').toString();
      studentUsername = (student?['username'] ?? '-').toString();

      final institution = student?['institution'];
      if (institution is Map<String, dynamic>) {
        institutionName = (institution['name'] ?? 'Kurum bilgisi yok').toString();
      } else {
        institutionName = 'Kurum bilgisi yok';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Profilim"),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const SettingsScreen()),
              );
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            _buildProfileHeader(),
            const SizedBox(height: 24),
            _buildStatsGrid(),
            const SizedBox(height: 24),
            _buildWeeklyActivity(),
          ],
        ),
      ),
    );
  }

  Widget _buildProfileHeader() {
    final settings = StorageService.getUserSettings();
    final branch = settings?['branch'] ?? 'Sayısal';
    final goal = settings?['goalUniversity'] ?? 'Hedefsiz';

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: AppTheme.secondaryColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text("🎯", style: TextStyle(fontSize: 16)),
              const SizedBox(width: 8),
              Flexible(
                child: Text("$branch • $goal",
                    style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppTheme.secondaryColor),
                    overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Container(
          width: 110,
          height: 110,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
          ),
          child: const Center(
              child: Text("👨‍🎓", style: TextStyle(fontSize: 50))),
        ),
        const SizedBox(height: 16),
        _buildIdentityCard(branch, goal),
      ],
    );
  }

  Widget _buildIdentityCard(String branch, String goal) {
    final goalText = goal.trim().isEmpty || goal == 'Hedefsiz'
        ? 'Hedef henuz belirlenmedi'
        : goal;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: AppTheme.primaryColor.withValues(alpha: 0.14),
        ),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).shadowColor.withValues(alpha: 0.05),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  gradient: const LinearGradient(
                    colors: [AppTheme.primaryColor, AppTheme.secondaryColor],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Center(
                  child: Text(
                    studentName.isNotEmpty
                        ? studentName.characters.first.toUpperCase()
                        : 'O',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      studentName,
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      institutionName,
                      style: TextStyle(
                        color: AppTheme.adaptiveGrey(context),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _buildInfoPill(Icons.badge_outlined, "Kullanici No", studentUsername),
              _buildInfoPill(Icons.auto_awesome_outlined, "Alan", branch),
              _buildInfoPill(Icons.flag_outlined, "Hedef", goalText),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildInfoPill(IconData icon, String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.primaryColor.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: AppTheme.primaryColor),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  color: AppTheme.adaptiveGreyLight(context),
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatsGrid() {
    int totalQuestions = courseStats.values.fold(0, (sum, val) => sum + val);
    final weeklyComparison = StorageService.getWeeklyComparison();
    final thisWeek = weeklyComparison['thisWeek'] ?? 0;
    final topicStats = StorageService.getTopicStats();
    final completedTopics = topicStats.values.where((value) {
      if (value is! Map<String, dynamic>) return false;
      return (value['questions'] ?? 0) > 0;
    }).length;
    final lastActivity = StorageService.getLastActivityDate();

    final cards = [
      _ProfileStatData(
        icon: Icons.local_fire_department_rounded,
        iconBg: Colors.orange.withValues(alpha: 0.12),
        iconColor: Colors.orange,
        title: 'Seri',
        value: '$streak Gun',
        subtitle: streak > 0 ? 'Devam et, ritim guzel' : 'Bugun acilis yap',
        borderColor: Colors.orange.withValues(alpha: 0.28),
      ),
      _ProfileStatData(
        icon: Icons.bar_chart_rounded,
        iconBg: AppTheme.primaryColor.withValues(alpha: 0.10),
        iconColor: AppTheme.primaryColor,
        title: 'Toplam Soru',
        value: '$totalQuestions',
        subtitle: totalQuestions > 0 ? 'Tum derslerden birikim' : 'Henuz soru yok',
        borderColor: AppTheme.primaryColor.withValues(alpha: 0.24),
      ),
      _ProfileStatData(
        icon: Icons.calendar_view_week_rounded,
        iconBg: Colors.green.withValues(alpha: 0.10),
        iconColor: Colors.green,
        title: 'Bu Hafta',
        value: '$thisWeek Soru',
        subtitle: _buildWeeklyLabel(thisWeek),
        borderColor: Colors.green.withValues(alpha: 0.24),
      ),
      _ProfileStatData(
        icon: Icons.task_alt_rounded,
        iconBg: AppTheme.secondaryColor.withValues(alpha: 0.10),
        iconColor: AppTheme.secondaryColor,
        title: 'Tamamlanan Konu',
        value: '$completedTopics',
        subtitle: lastActivity != null ? 'Son aktivite: $lastActivity' : 'Yeni baslangic',
        borderColor: AppTheme.secondaryColor.withValues(alpha: 0.22),
      ),
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: cards.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 14,
        mainAxisSpacing: 14,
        childAspectRatio: 1.1,
      ),
      itemBuilder: (context, index) {
        return _buildStatCard(cards[index]);
      },
    );
  }

  String _buildWeeklyLabel(int thisWeek) {
    if (thisWeek >= 150) return 'Cok guclu tempo';
    if (thisWeek >= 60) return 'Iyi gidiyorsun';
    if (thisWeek > 0) return 'Biraz daha hizlanabilir';
    return 'Bu hafta hareket yok';
  }

  Widget _buildStatCard(_ProfileStatData data) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: data.borderColor),
        boxShadow: [
          BoxShadow(
            color: data.iconColor.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: data.iconBg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(data.icon, size: 20, color: data.iconColor),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  data.title,
                  style: TextStyle(
                    color: AppTheme.adaptiveGrey(context),
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const Spacer(),
          Text(
            data.value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: data.iconColor,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            data.subtitle,
            style: TextStyle(
              fontSize: 12,
              color: AppTheme.adaptiveGreyLight(context),
              fontWeight: FontWeight.w500,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildWeeklyActivity() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text("Aktivite Grafiği",
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Container(
          height: 140,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                  color: Theme.of(context).shadowColor.withValues(alpha: 0.05), blurRadius: 10)
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: List.generate(7, (index) {
              DateTime date =
                  DateTime.now().subtract(Duration(days: 6 - index));
              String dateStr = date.toIso8601String().split('T')[0];
              int count = weeklyActivity[dateStr] ?? 0;
              double height = (count * 10.0).clamp(10.0, 130.0);

              return Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Container(
                    width: 24,
                    height: height,
                    decoration: BoxDecoration(
                      color: count > 3
                          ? AppTheme.primaryColor
                          : AppTheme.primaryColor.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(DateFormat('E').format(date),
                      style: const TextStyle(fontSize: 10, color: Colors.grey)),
                ],
              );
            }),
          ),
        ),
      ],
    );
  }

}

class _ProfileStatData {
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final Color borderColor;
  final String title;
  final String value;
  final String subtitle;

  const _ProfileStatData({
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    required this.borderColor,
    required this.title,
    required this.value,
    required this.subtitle,
  });
}
