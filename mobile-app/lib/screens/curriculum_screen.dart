import 'package:flutter/material.dart';
import 'package:yks/data/course_data.dart';
import 'package:yks/screens/topic_map_screen.dart';
import 'package:yks/theme/app_theme.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/services/api_service.dart';

class CurriculumScreen extends StatefulWidget {
  const CurriculumScreen({super.key});

  @override
  State<CurriculumScreen> createState() => _CurriculumScreenState();
}

class _CurriculumScreenState extends State<CurriculumScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  Map<String, dynamic> topicStats = {};
  String userBranch = 'Sayısal';

  // DB'den gelen dersler (null ise local fallback kullan)
  List<CourseTopics>? _dbTytCourses;
  List<CourseTopics>? _dbAytCourses;
  bool _isLoadingDb = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadStats();
  }

  void _loadStats() {
    final settings = StorageService.getUserSettings();
    final branch = settings?['branch'] ?? 'Sayısal';
    setState(() {
      topicStats = StorageService.getTopicStats();
      userBranch = branch;
    });
    _loadFromDb(branch);
  }

  Future<void> _loadFromDb(String branch) async {
    setState(() => _isLoadingDb = true);
    try {
      final raw = await ApiService.fetchCurriculum(branch);
      if (raw.isEmpty) return;

      final tyt = <CourseTopics>[];
      final ayt = <CourseTopics>[];

      for (final c in raw) {
        final topics = _parseTopics(c['topics'] as List<dynamic>? ?? []);
        final course = CourseTopics(
          id: c['id'] as String,
          name: c['name'] as String,
          icon: c['icon'] as String,
          topics: topics,
        );
        if ((c['examType'] as String?) == 'TYT') {
          tyt.add(course);
        } else {
          ayt.add(course);
        }
      }

      if (mounted) {
        setState(() {
          _dbTytCourses = tyt;
          _dbAytCourses = ayt;
        });
      }
    } catch (e) {
      debugPrint('DB curriculum load error: $e');
    } finally {
      if (mounted) setState(() => _isLoadingDb = false);
    }
  }

  List<Topic> _parseTopics(List<dynamic> raw) {
    return raw.map((t) {
      final subRaw = t['subTopics'] as List<dynamic>? ?? [];
      return Topic(
        id: t['id'] as String,
        name: t['name'] as String,
        subTopics: subRaw.isEmpty ? null : _parseTopics(subRaw),
      );
    }).toList();
  }

  List<CourseTopics> get _tytList {
    if (_dbTytCourses != null) return _dbTytCourses!;
    return tytCourseTopics;
  }

  List<CourseTopics> get _aytList {
    if (_dbAytCourses != null) return _dbAytCourses!;
    // local fallback
    return aytCourseTopics.where((c) {
      if (userBranch == 'Sayısal') {
        return ['ayt_mat', 'ayt_geo', 'ayt_fizik', 'ayt_kimya', 'ayt_biyoloji']
            .contains(c.id);
      } else if (userBranch == 'Eşit Ağırlık') {
        return ['ayt_mat', 'ayt_geo', 'ayt_edebiyat', 'ayt_tar', 'ayt_cog']
            .contains(c.id);
      } else if (userBranch == 'Sözel') {
        return ['ayt_edebiyat', 'ayt_tar', 'ayt_cog', 'ayt_fel_grup']
            .contains(c.id);
      }
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Text("Müfredat İlerlemesi"),
            if (_isLoadingDb) ...[
              const SizedBox(width: 10),
              const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ],
          ],
        ),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppTheme.primaryColor,
          labelColor: AppTheme.primaryColor,
          tabs: const [
            Tab(text: "TYT"),
            Tab(text: "AYT"),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildCourseList(_tytList),
          _buildCourseList(_aytList),
        ],
      ),
    );
  }

  Widget _buildCourseList(List<CourseTopics> courses) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: courses.length,
      itemBuilder: (context, index) {
        final course = courses[index];

        int totalLeaves = 0;
        int completedLeaves = 0;

        void countStats(List<Topic> topicsList) {
          for (var t in topicsList) {
            if (t.subTopics != null && t.subTopics!.isNotEmpty) {
              countStats(t.subTopics!);
            } else {
              totalLeaves++;
              final key = "${course.id}|${t.id}";
              if (topicStats[key] != null && topicStats[key]['questions'] > 0) {
                completedLeaves++;
              }
            }
          }
        }

        countStats(course.topics);
        double progress = totalLeaves == 0 ? 0 : completedLeaves / totalLeaves;

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: ListTile(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            leading: Text(course.icon, style: const TextStyle(fontSize: 24)),
            title: Text(course.name,
                style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: progress,
                    backgroundColor: Theme.of(context).dividerColor.withValues(alpha: 0.1),
                    color: AppTheme.accentColor,
                    minHeight: 6,
                  ),
                ),
                const SizedBox(height: 4),
                Text("$completedLeaves / $totalLeaves Konu Tamamlandı",
                    style: const TextStyle(fontSize: 11)),
              ],
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => TopicMapScreen(
                    title: course.name,
                    topics: course.topics,
                    courseId: course.id,
                  ),
                ),
              );
              _loadStats();
            },
          ),
        );
      },
    );
  }
}
