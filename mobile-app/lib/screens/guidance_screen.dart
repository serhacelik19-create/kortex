import 'package:flutter/material.dart';
import 'package:yks/models/guidance.dart';
import 'package:yks/services/api_service.dart';
import 'package:yks/theme/app_theme.dart';
import 'package:intl/intl.dart';

class GuidanceScreen extends StatefulWidget {
  const GuidanceScreen({super.key});

  @override
  State<GuidanceScreen> createState() => _GuidanceScreenState();
}

class _GuidanceScreenState extends State<GuidanceScreen>
    with SingleTickerProviderStateMixin {
  List<Appointment> appointments = [];
  List<GuidanceAssignment> assignments = [];
  WeeklyCurriculum? currentCurriculum;
  bool isLoading = true;
  late TabController _tabController;
  int _selectedDayIndex = DateTime.now().weekday - 1; // 0-6 index for Mon-Sun

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _fetchData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _fetchData() async {
    setState(() => isLoading = true);
    try {
      final results = await Future.wait([
        ApiService.getAppointments(),
        ApiService.getMyGuidanceAssignments(),
        ApiService.getMyCurriculum(),
      ]);
      setState(() {
        var appts = results[0] as List<Appointment>;
        var assigns = results[1] as List<GuidanceAssignment>;
        currentCurriculum = results[2] as WeeklyCurriculum?;
        
        appts.sort((a, b) => b.startTime.compareTo(a.startTime));
        assigns.sort((a, b) => b.id.compareTo(a.id));
        appointments = appts;
        assignments = assigns;
        isLoading = false;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Veriler yüklenirken hata oluştu.')),
        );
      }
      setState(() => isLoading = false);
    }
  }

  List<Appointment> get _upcomingAppointments => appointments
      .where((a) =>
          a.status == 'pending' &&
          a.startTime.isAfter(DateTime.now().subtract(const Duration(hours: 2))))
      .toList();

  List<Appointment> get _pastAppointments => appointments
      .where((a) =>
          a.status != 'pending' ||
          a.startTime.isBefore(DateTime.now().subtract(const Duration(hours: 2))))
      .toList();

  String _getCountdown(DateTime startTime) {
    final now = DateTime.now();
    final diff = startTime.difference(now);
    if (diff.isNegative) return 'Geçti';
    if (diff.inDays > 0) return '${diff.inDays} gün kaldı';
    if (diff.inHours > 0) return '${diff.inHours} saat kaldı';
    if (diff.inMinutes > 0) return '${diff.inMinutes} dakika kaldı';
    return 'Şimdi!';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : NestedScrollView(
              headerSliverBuilder: (context, innerBoxIsScrolled) => [
                SliverAppBar(
                  floating: true,
                  snap: true,
                  elevation: 0,
                  backgroundColor: Theme.of(context).scaffoldBackgroundColor,
                  title: const Text(
                    'Rehberlik Ekranı',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20),
                  ),
                  bottom: TabBar(
                    controller: _tabController,
                    isScrollable: true,
                    indicatorColor: AppTheme.primaryColor,
                    indicatorWeight: 3,
                    labelColor: AppTheme.primaryColor,
                    unselectedLabelColor: Colors.grey,
                    labelStyle: const TextStyle(fontWeight: FontWeight.bold),
                    tabs: [
                      Tab(text: 'Planım ${currentCurriculum != null ? '✨' : ''}'),
                      Tab(text: 'Randevular (${_upcomingAppointments.length})'),
                      Tab(text: 'Geçmiş & Anketler'),
                    ],
                  ),
                ),
              ],
              body: TabBarView(
                controller: _tabController,
                children: [
                   // === TAB 1: Haftalık Plan ===
                  RefreshIndicator(
                    onRefresh: _fetchData,
                    child: _buildPlannerTab(),
                  ),
                  // === TAB 2: Yaklaşan Randevular ===
                  RefreshIndicator(
                    onRefresh: _fetchData,
                    child: _upcomingAppointments.isEmpty
                        ? SingleChildScrollView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            child: SizedBox(
                              height: MediaQuery.of(context).size.height * 0.6,
                              child: _buildMotivationalEmpty('Randevun Yok', 'Hocanla bağlantı bekleniyor.'),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(20),
                            physics: const AlwaysScrollableScrollPhysics(),
                            itemCount: _upcomingAppointments.length,
                            itemBuilder: (context, i) =>
                                _buildAppointmentCard(_upcomingAppointments[i], showCountdown: true),
                          ),
                  ),
                  // === TAB 3: Geçmiş + Anketler ===
                  RefreshIndicator(
                    onRefresh: _fetchData,
                    child: ListView(
                      padding: const EdgeInsets.all(20),
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        _buildSectionHeader('📅 Geçmiş Randevular', _pastAppointments.isEmpty),
                        if (_pastAppointments.isEmpty)
                          _buildEmptyState('Geçmiş randevun bulunmuyor.')
                        else
                          ..._pastAppointments.map((a) => _buildAppointmentCard(a, showCountdown: false)),
                        const SizedBox(height: 24),
                        _buildSectionHeader('📝 Rehberlik Anketleri', assignments.isEmpty),
                        if (assignments.isEmpty)
                          _buildEmptyState('Sana atanmış anket bulunmuyor.')
                        else
                          ...assignments.map((a) => _buildSurveyCard(a)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildPlannerTab() {
    if (currentCurriculum == null || currentCurriculum!.tasks.isEmpty) {
      return SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.6,
          child: _buildMotivationalEmpty('Planın Hazırlanıyor', 'Hocan senin için haftalık çalışma programını hazırladığında burada görünecek.'),
        ),
      );
    }

    final days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    final dayTasks = currentCurriculum!.tasks.where((t) => t.dayIndex == _selectedDayIndex).toList();
    final completedCount = dayTasks.where((t) => t.status == 'completed').length;
    final progress = dayTasks.isEmpty ? 0.0 : completedCount / dayTasks.length;

    return Column(
      children: [
        // --- Yatay Gün Seçici ---
        Container(
          height: 100,
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: 7,
            itemBuilder: (context, idx) {
              final isSelected = _selectedDayIndex == idx;
              final isToday = (DateTime.now().weekday - 1) == idx;
              return GestureDetector(
                onTap: () => setState(() => _selectedDayIndex = idx),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  width: 65,
                  margin: const EdgeInsets.only(right: 12),
                  decoration: BoxDecoration(
                    color: isSelected ? AppTheme.primaryColor : Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      if (isSelected)
                        BoxShadow(
                          color: AppTheme.primaryColor.withValues(alpha: 0.3),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                    ],
                    border: Border.all(
                      color: isSelected ? AppTheme.primaryColor : Colors.grey.withValues(alpha: 0.1),
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        days[idx].substring(0, 3).toUpperCase(),
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          color: isSelected ? Colors.white70 : Colors.grey[400],
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        (idx + 1).toString(),
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: isSelected ? Colors.white : Colors.black87,
                        ),
                      ),
                      if (isToday && !isSelected)
                        Container(
                          margin: const EdgeInsets.only(top: 4),
                          width: 4,
                          height: 4,
                          decoration: const BoxDecoration(
                            color: AppTheme.primaryColor,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),

        // --- Günlük Özet & Liste ---
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(20),
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              // Özet Kartı
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppTheme.primaryColor, AppTheme.primaryColor.withValues(alpha: 0.8)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.primaryColor.withValues(alpha: 0.2),
                      blurRadius: 15,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Stack(
                      alignment: Alignment.center,
                      children: [
                        SizedBox(
                          width: 60,
                          height: 60,
                          child: CircularProgressIndicator(
                            value: progress,
                            strokeWidth: 6,
                            backgroundColor: Colors.white.withValues(alpha: 0.2),
                            valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
                            strokeCap: StrokeCap.round,
                          ),
                        ),
                        Text(
                          '${(progress * 100).toInt()}%',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                        ),
                      ],
                    ),
                    const SizedBox(width: 20),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            days[_selectedDayIndex],
                            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            dayTasks.isEmpty 
                              ? 'Dinlenme günü ✨' 
                              : '$completedCount/${dayTasks.length} görev tamamlandı',
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13, fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('GÜNLÜK GÖREVLER', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: Colors.grey, letterSpacing: 1)),
                  if (dayTasks.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.grey.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text('${dayTasks.length} Görev', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey)),
                    ),
                ],
              ),
              const SizedBox(height: 16),

              if (dayTasks.isEmpty)
                _buildMotivationalEmpty('Bugün Boşsun!', 'Harika bir dinlenme günü veya kendi çalışmaların için vakit ayırabilirsin.')
              else
                ...dayTasks.map((task) => _buildTaskItem(task)),
              
              const SizedBox(height: 100), // Alt boşluk
            ],
          ),
        ),
      ],
    );
  }

  Map<String, dynamic> _getSubjectTheme(String subject) {
    final baseSubject = subject.split('(')[0].trim();
    switch (baseSubject) {
      case 'Matematik': return {'icon': Icons.calculate, 'color': Colors.blue};
      case 'Geometri': return {'icon': Icons.architecture, 'color': Colors.blueAccent};
      case 'Fizik': return {'icon': Icons.bolt, 'color': Colors.red};
      case 'Kimya': return {'icon': Icons.science, 'color': Colors.green};
      case 'Biyoloji': return {'icon': Icons.favorite, 'color': Colors.pink};
      case 'Türkçe': return {'icon': Icons.book, 'color': Colors.orange};
      case 'Edebiyat': return {'icon': Icons.edit_note, 'color': Colors.purple};
      case 'Tarih': return {'icon': Icons.account_balance, 'color': Colors.brown};
      case 'Coğrafya': return {'icon': Icons.public, 'color': Colors.cyan};
      case 'Felsefe': return {'icon': Icons.psychology, 'color': Colors.deepPurple};
      case 'Din Kültürü': return {'icon': Icons.menu_book, 'color': Colors.teal};
      default: return {'icon': Icons.assignment, 'color': Colors.grey};
    }
  }

  Widget _buildTaskItem(WeeklyCurriculumTask task) {
    final bool isCompleted = task.status == 'completed';
    final theme = _getSubjectTheme(task.subject);
    final Color subjectColor = theme['color'];
    final IconData subjectIcon = theme['icon'];
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          )
        ],
        border: Border.all(
          color: isCompleted ? Colors.green.withValues(alpha: 0.1) : Colors.grey.withValues(alpha: 0.05),
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          leading: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: subjectColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(subjectIcon, color: subjectColor, size: 22),
          ),
          title: Text(
            task.topic,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: isCompleted ? Colors.grey : Colors.black87,
              decoration: isCompleted ? TextDecoration.lineThrough : null,
              height: 1.3
            ),
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(
              children: [
                Text(
                  task.subject.toUpperCase(),
                  style: TextStyle(
                    fontSize: 10,
                    color: subjectColor,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5
                  ),
                ),
                if (task.isAiSuggested) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.purple.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.auto_awesome, color: Colors.purple, size: 10),
                        SizedBox(width: 2),
                        Text('AI', style: TextStyle(color: Colors.purple, fontSize: 8, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                ]
              ],
            ),
          ),
          trailing: GestureDetector(
            onTap: () async {
              final newStatus = isCompleted ? 'pending' : 'completed';
              setState(() => task.status = newStatus);
              final success = await ApiService.updateCurriculumTaskStatus(task.id, newStatus);
              if (!success && mounted) {
                 setState(() => task.status = isCompleted ? 'completed' : 'pending');
                 ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Durum güncellenirken hata oluştu.')));
              }
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: isCompleted ? Colors.green : Colors.transparent,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isCompleted ? Colors.green : Colors.grey.withValues(alpha: 0.2),
                  width: 2,
                ),
              ),
              child: isCompleted 
                ? const Icon(Icons.check, color: Colors.white, size: 20) 
                : null,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMotivationalEmpty(String title, String desc) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppTheme.primaryColor.withValues(alpha: 0.1),
                    AppTheme.primaryColor.withValues(alpha: 0.05),
                  ],
                ),
                shape: BoxShape.circle,
              ),
              child: const Text('🧭', style: TextStyle(fontSize: 48)),
            ),
            const SizedBox(height: 20),
            Text(
              title,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              desc,
              style: TextStyle(fontSize: 14, color: Colors.grey[500], height: 1.5),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, bool isEmpty) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        title,
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
      ),
    );
  }

  Widget _buildEmptyState(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(30),
      decoration: BoxDecoration(
        color: Colors.grey.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.grey.withValues(alpha: 0.1)),
      ),
      child: Column(
        children: [
          const Icon(Icons.info_outline, color: Colors.grey, size: 30),
          const SizedBox(height: 10),
          Text(message, style: const TextStyle(color: Colors.grey, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildAppointmentCard(Appointment appt, {required bool showCountdown}) {
    final dateFormat = DateFormat('d MMMM EEEE, HH:mm', 'tr_TR');
    final isPending = appt.status == 'pending';
    final countdown = _getCountdown(appt.startTime);
    final isUrgent = appt.startTime.difference(DateTime.now()).inHours < 24 &&
        appt.startTime.isAfter(DateTime.now());

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          )
        ],
        border: Border.all(
          color: isPending ? AppTheme.primaryColor.withValues(alpha: 0.2) : Colors.transparent,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: (isPending ? AppTheme.primaryColor : Colors.grey).withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.calendar_today,
                  color: isPending ? AppTheme.primaryColor : Colors.grey,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      appt.title,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      dateFormat.format(appt.startTime),
                      style: const TextStyle(color: Colors.grey, fontSize: 12),
                    ),
                    Text(
                      'Öğretmen: ${appt.teacherName}',
                      style: TextStyle(
                          color: AppTheme.primaryColor.withValues(alpha: 0.7),
                          fontSize: 12,
                          fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              if (appt.status == 'completed')
                const Icon(Icons.check_circle, color: Colors.green, size: 22)
              else if (appt.status == 'absent')
                const Icon(Icons.cancel, color: Colors.orange, size: 22)
              else if (appt.status == 'cancelled')
                const Icon(Icons.cancel, color: Colors.red, size: 22),
            ],
          ),
          if (showCountdown && isPending) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: isUrgent
                    ? Colors.orange.withValues(alpha: 0.1)
                    : AppTheme.primaryColor.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.timer_outlined,
                    size: 14,
                    color: isUrgent ? Colors.orange : AppTheme.primaryColor,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    countdown,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: isUrgent ? Colors.orange : AppTheme.primaryColor,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (appt.note != null && appt.note!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Not: ${appt.note}',
                style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: Colors.grey),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSurveyCard(GuidanceAssignment assignment) {
    final isCompleted = assignment.status == 'completed';
    final survey = assignment.survey;
    if (survey == null) return const SizedBox.shrink();

    return GestureDetector(
      onTap: isCompleted ? null : () => _openSurvey(assignment),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: isCompleted
              ? null
              : LinearGradient(
                  colors: [
                    AppTheme.primaryColor.withValues(alpha: 0.05),
                    AppTheme.primaryColor.withValues(alpha: 0.1)
                  ],
                ),
          color: isCompleted ? Theme.of(context).cardColor.withValues(alpha: 0.5) : null,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isCompleted ? Colors.transparent : AppTheme.primaryColor.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    survey.title,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: isCompleted ? Colors.grey : null,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    survey.description ?? 'Rehberlik anketi',
                    style: TextStyle(color: isCompleted ? Colors.grey : Colors.grey[600], fontSize: 13),
                  ),
                  if (isCompleted)
                    const Padding(
                      padding: EdgeInsets.only(top: 10),
                      child: Row(
                        children: [
                          Icon(Icons.check_circle_outline, color: Colors.green, size: 14),
                          SizedBox(width: 4),
                          Text('Tamamlandı',
                              style: TextStyle(color: Colors.green, fontSize: 12, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            if (!isCompleted)
              const Icon(Icons.chevron_right, color: AppTheme.primaryColor),
          ],
        ),
      ),
    );
  }

  void _openSurvey(GuidanceAssignment assignment) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => SurveyDetailScreen(assignment: assignment),
      ),
    ).then((_) => _fetchData());
  }
}

class SurveyDetailScreen extends StatefulWidget {
  final GuidanceAssignment assignment;
  const SurveyDetailScreen({super.key, required this.assignment});

  @override
  State<SurveyDetailScreen> createState() => _SurveyDetailScreenState();
}

class _SurveyDetailScreenState extends State<SurveyDetailScreen> {
  final Map<int, dynamic> _answers = {};
  bool isSubmitting = false;

  @override
  Widget build(BuildContext context) {
    final survey = widget.assignment.survey!;
    
    return Scaffold(
      appBar: AppBar(title: Text(survey.title)),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(20),
              itemCount: survey.questions.length,
              itemBuilder: (context, index) {
                final q = survey.questions[index];
                return _buildQuestionItem(q);
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: SizedBox(
              width: double.infinity,
              height: 55,
              child: ElevatedButton(
                onPressed: isSubmitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                ),
                child: isSubmitting 
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text('Anketi Tamamla', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuestionItem(GuidanceQuestion q) {
    return Container(
      margin: const EdgeInsets.only(bottom: 25),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            q.text,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
          ),
          const SizedBox(height: 15),
          if (q.type == 'multiple_choice')
            ...q.options!.map((opt) => RadioListTile<String>(
                  title: Text(opt),
                  value: opt,
                  groupValue: _answers[q.id],
                  contentPadding: EdgeInsets.zero,
                  activeColor: AppTheme.primaryColor,
                  onChanged: (val) => setState(() => _answers[q.id] = val),
                ))
          else
            TextField(
              decoration: InputDecoration(
                hintText: 'Cevabınızı buraya yazın...',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
                fillColor: Colors.grey.withValues(alpha: 0.05),
              ),
              maxLines: 3,
              onChanged: (val) => _answers[q.id] = val,
            ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    final survey = widget.assignment.survey!;
    for (var q in survey.questions) {
      if (q.required && (_answers[q.id] == null || _answers[q.id].toString().trim().isEmpty)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('"${q.text}" sorusunu cevaplamanız gerekiyor.')),
        );
        return;
      }
    }

    setState(() => isSubmitting = true);
    final answersPayload = _answers.entries.map((e) {
      final q = survey.questions.firstWhere((question) => question.id == e.key);
      return {
        'questionId': e.key,
        if (q.type == 'multiple_choice') 'selectedOption': e.value else 'answerText': e.value,
      };
    }).toList();

    final success = await ApiService.submitGuidanceResponse(widget.assignment.id, answersPayload);
    
    if (mounted) {
      if (success) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const SurveySuccessScreen()),
        );
      } else {
        setState(() => isSubmitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Bir hata oluştu. Lütfen tekrar deneyin.')),
        );
      }
    }
  }
}

class SurveySuccessScreen extends StatefulWidget {
  const SurveySuccessScreen({super.key});

  @override
  State<SurveySuccessScreen> createState() => _SurveySuccessScreenState();
}

class _SurveySuccessScreenState extends State<SurveySuccessScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _scaleAnim;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
    _scaleAnim = CurvedAnimation(parent: _ctrl, curve: Curves.elasticOut);
    _fadeAnim = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: SafeArea(
        child: FadeTransition(
          opacity: _fadeAnim,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(40),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ScaleTransition(
                    scale: _scaleAnim,
                    child: Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFF10b981), Color(0xFF059669)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF10b981).withValues(alpha: 0.3),
                            blurRadius: 30,
                            offset: const Offset(0, 10),
                          )
                        ],
                      ),
                      child: const Icon(Icons.check_rounded, color: Colors.white, size: 60),
                    ),
                  ),
                  const SizedBox(height: 32),
                  const Text(
                    'Harika!',
                    style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Yanıtların hocanla paylaşıldı.\nTeşekkürler, iyi çalışmalar! 🌟',
                    style: TextStyle(fontSize: 16, color: Colors.grey[500], height: 1.6),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 40),
                  SizedBox(
                    width: double.infinity,
                    height: 55,
                    child: ElevatedButton(
                      onPressed: () => Navigator.of(context)
                          .popUntil((route) => route.isFirst),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryColor,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18)),
                        elevation: 0,
                      ),
                      child: const Text(
                        'Tamam, Anasayfaya Dön',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 16),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
