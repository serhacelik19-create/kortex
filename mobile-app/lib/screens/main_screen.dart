import 'package:flutter/material.dart';
import 'package:yks/screens/home_screen.dart';
import 'package:yks/screens/library_screen.dart';
import 'package:yks/screens/timer_screen.dart';
import 'package:yks/screens/profile_screen.dart';
import 'package:yks/screens/exams_screen.dart';
import 'package:yks/screens/guidance_screen.dart';
import 'package:yks/services/api_service.dart';
import 'package:yks/models/guidance.dart';
import 'package:yks/theme/app_theme.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _selectedIndex = 0;

  final List<Widget> _screens = [
    const HomeScreen(),
    const TimerScreen(),
    const LibraryScreen(),
    const ExamsScreen(),
    const GuidanceScreen(),
    const ProfileScreen(),
  ];

  bool _hasGuidanceNotification = false;

  @override
  void initState() {
    super.initState();
    _checkGuidanceNotifications();
  }

  Future<void> _checkGuidanceNotifications() async {
    try {
      final results = await Future.wait([
        ApiService.getAppointments(),
        ApiService.getMyGuidanceAssignments(),
      ]);
      final appointments = results[0] as List<Appointment>;
      final assignments = results[1] as List<GuidanceAssignment>;

      final hasPendingAppointments = appointments.any((a) => 
          a.status != 'completed' && a.status != 'cancelled' && a.status != 'absent' &&
          (a.endTime == null ? a.startTime.isAfter(DateTime.now().subtract(const Duration(hours: 1))) : a.endTime!.isAfter(DateTime.now()))
      );
      final hasPendingAssignments = assignments.any((a) => a.status == 'pending');

      if (hasPendingAppointments || hasPendingAssignments) {
        if (mounted) setState(() => _hasGuidanceNotification = true);
      }
    } catch (e) {
      // Background check error ignored
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _selectedIndex,
        children: _screens,
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
                color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)
          ],
        ),
        child: BottomNavigationBar(
          currentIndex: _selectedIndex,
          onTap: (index) => setState(() => _selectedIndex = index),
          type: BottomNavigationBarType.fixed,
          backgroundColor: Theme.of(context).bottomNavigationBarTheme.backgroundColor,
          selectedItemColor: AppTheme.primaryColor,
          unselectedItemColor: Theme.of(context).brightness == Brightness.dark
              ? Colors.grey.shade500
              : Colors.grey,
          showUnselectedLabels: true,
          items: [
            BottomNavigationBarItem(
                icon: Icon(Icons.home_outlined),
                activeIcon: Icon(Icons.home),
                label: "Ana Sayfa"),
            BottomNavigationBarItem(
                icon: Icon(Icons.timer_outlined),
                activeIcon: Icon(Icons.timer),
                label: "Zamanlayıcı"),
            BottomNavigationBarItem(
                icon: Icon(Icons.library_books_outlined),
                activeIcon: Icon(Icons.library_books),
                label: "Kitaplık"),
            BottomNavigationBarItem(
                icon: Icon(Icons.assignment_outlined),
                activeIcon: Icon(Icons.assignment),
                label: "Denemeler"),
            BottomNavigationBarItem(
                icon: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    const Icon(Icons.explore_outlined),
                    if (_hasGuidanceNotification)
                      Positioned(
                        top: -2,
                        right: -2,
                        child: Container(
                          width: 10,
                          height: 10,
                          decoration: const BoxDecoration(
                            color: Colors.red,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                  ],
                ),
                activeIcon: const Icon(Icons.explore),
                label: "Rehberlik"),
            BottomNavigationBarItem(
                icon: Icon(Icons.person_outline),
                activeIcon: Icon(Icons.person),
                label: "Profil"),
          ],
        ),
      ),
    );
  }
}
