import 'package:flutter/material.dart';
import 'dart:async';
import 'package:yks/theme/app_theme.dart';
import 'package:yks/components/app_toast.dart';

class TimerScreen extends StatefulWidget {
  const TimerScreen({super.key});

  @override
  State<TimerScreen> createState() => _TimerScreenState();
}

class _TimerScreenState extends State<TimerScreen>
    with TickerProviderStateMixin {
  // Pomodoro settings
  static const int _workMinutes = 25;
  static const int _breakMinutes = 5;

  late int _totalSeconds;
  Timer? _timer;
  bool _isRunning = false;
  bool _isBreak = false;
  int _completedPomodoros = 0;

  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _totalSeconds = _workMinutes * 60;
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_totalSeconds > 0) {
        setState(() => _totalSeconds--);
      } else {
        _timer?.cancel();
        _onTimerComplete();
      }
    });
    setState(() => _isRunning = true);
    _pulseController.repeat(reverse: true);
  }

  void _pauseTimer() {
    _timer?.cancel();
    _pulseController.stop();
    setState(() => _isRunning = false);
  }

  void _resetTimer() {
    _timer?.cancel();
    _pulseController.stop();
    setState(() {
      _isRunning = false;
      _isBreak = false;
      _totalSeconds = _workMinutes * 60;
    });
  }

  Future<void> _onTimerComplete() async {
    _pulseController.stop();
    if (!_isBreak) {
      // Çalışma bitti → Mola başla
      setState(() {
        _completedPomodoros++;
        _isBreak = true;
        _totalSeconds = _breakMinutes * 60;
        _isRunning = false;
      });
      if (mounted) {
        AppToast.show(
            context: context, message: "Pomodoro tamamlandı! 🎉");
      }
    } else {
      // Mola bitti → Çalışma başla
      setState(() {
        _isBreak = false;
        _totalSeconds = _workMinutes * 60;
        _isRunning = false;
      });
      if (mounted) {
        AppToast.show(context: context, message: "Mola bitti! Haydi devam 💪");
      }
    }
  }

  String get _timerDisplay {
    int minutes = _totalSeconds ~/ 60;
    int seconds = _totalSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  double get _progress {
    int total = _isBreak ? _breakMinutes * 60 : _workMinutes * 60;
    return 1.0 - (_totalSeconds / total);
  }

  @override
  Widget build(BuildContext context) {
    final baseColor =
        _isBreak ? const Color(0xFF4CAF50) : AppTheme.primaryColor;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text("Pomodoro Zamanlayıcı",
            style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: SafeArea(
        child: Column(
          children: [
            const Spacer(flex: 1),

            // Status chip
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              decoration: BoxDecoration(
                color: baseColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                _isBreak ? "☕ Mola Zamanı" : "📚 Çalışma Zamanı",
                style: TextStyle(
                  color: baseColor,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(height: 40),

            // Timer Circle
            AnimatedBuilder(
              animation: _pulseController,
              builder: (context, child) {
                double scale =
                    _isRunning ? 1.0 + (_pulseController.value * 0.03) : 1.0;
                return Transform.scale(scale: scale, child: child);
              },
              child: SizedBox(
                width: 260,
                height: 260,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // Background circle
                    SizedBox(
                      width: 260,
                      height: 260,
                      child: CircularProgressIndicator(
                        value: 1.0,
                        strokeWidth: 12,
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.grey.shade800
                            : Colors.grey.shade200,
                        strokeCap: StrokeCap.round,
                      ),
                    ),
                    // Progress circle
                    SizedBox(
                      width: 260,
                      height: 260,
                      child: CircularProgressIndicator(
                        value: _progress,
                        strokeWidth: 12,
                        color: baseColor,
                        strokeCap: StrokeCap.round,
                      ),
                    ),
                    // Timer text
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _timerDisplay,
                          style: TextStyle(
                            fontSize: 56,
                            fontWeight: FontWeight.w300,
                            color: baseColor,
                            letterSpacing: 4,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _isBreak ? "Mola" : "Odaklan",
                          style: TextStyle(
                            fontSize: 14,
                            color: AppTheme.adaptiveGreyLight(context),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 50),

            // Controls
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Reset
                _buildControlBtn(
                  icon: Icons.refresh_rounded,
                  color: Colors.grey,
                  onTap: _resetTimer,
                ),
                const SizedBox(width: 24),
                // Play/Pause
                GestureDetector(
                  onTap: _isRunning ? _pauseTimer : _startTimer,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: baseColor,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: baseColor.withValues(alpha: 0.4),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Icon(
                      _isRunning
                          ? Icons.pause_rounded
                          : Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 40,
                    ),
                  ),
                ),
                const SizedBox(width: 24),
                // Skip
                _buildControlBtn(
                  icon: Icons.skip_next_rounded,
                  color: Colors.grey,
                  onTap: () {
                    _timer?.cancel();
                    _onTimerComplete();
                  },
                ),
              ],
            ),

            const Spacer(flex: 1),

            // Stats bar
            Container(
              margin: const EdgeInsets.all(20),
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: Theme.of(context).shadowColor.withValues(alpha: 0.05),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _buildStat("Tamamlanan", "$_completedPomodoros", "🎯"),
                  Container(height: 30, width: 1, color: Theme.of(context).dividerColor),
                  _buildStat(
                      "Toplam Süre", "${_completedPomodoros * 25} dk", "⏱️"),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildControlBtn({
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Theme.of(context).shadowColor.withValues(alpha: 0.08),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Icon(icon, color: color, size: 26),
      ),
    );
  }

  Widget _buildStat(String label, String value, String emoji) {
    return Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 18)),
        const SizedBox(height: 4),
        Text(value,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        Text(label,
            style: TextStyle(fontSize: 10, color: AppTheme.adaptiveGreyLight(context))),
      ],
    );
  }
}
