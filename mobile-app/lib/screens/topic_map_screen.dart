import 'package:flutter/material.dart';
import 'package:yks/data/course_data.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/theme/app_theme.dart';

class TopicMapScreen extends StatefulWidget {
  final String title;
  final List<Topic> topics;
  final String courseId;

  const TopicMapScreen({
    super.key,
    required this.title,
    required this.topics,
    required this.courseId,
  });

  @override
  State<TopicMapScreen> createState() => _TopicMapScreenState();
}

class _TopicMapScreenState extends State<TopicMapScreen> {
  Map<String, dynamic> topicStats = {};

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  void _loadStats() {
    setState(() {
      topicStats = StorageService.getTopicStats();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: ListView.builder(
        padding: const EdgeInsets.all(20),
        itemCount: widget.topics.length,
        itemBuilder: (context, index) {
          final topic = widget.topics[index];
          final hasSubTopics =
              topic.subTopics != null && topic.subTopics!.isNotEmpty;

          final statKey = "${widget.courseId}|${topic.id}";
          final stat = topicStats[statKey];
          final bool isCompleted = stat != null && stat['questions'] > 0;

          return GestureDetector(
            onTap: () async {
              if (hasSubTopics) {
                // Navigate to sub-topics
                await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => TopicMapScreen(
                      title: topic.name,
                      topics: topic.subTopics!,
                      courseId: widget.courseId,
                    ),
                  ),
                );
                _loadStats();
              } else {
                // Toggle completion
                final newStatus = !isCompleted;
                await StorageService.setTopicCompletion(
                    widget.courseId, topic.id, newStatus);
                _loadStats();
              }
            },
            child: _buildTopicNode(topic, isCompleted,
                index == widget.topics.length - 1, hasSubTopics),
          );
        },
      ),
    );
  }

  Widget _buildTopicNode(
      Topic topic, bool isCompleted, bool isLast, bool hasSubTopics) {
    return Column(
      children: [
        Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: isCompleted || hasSubTopics
                    ? AppTheme.accentColor
                    : Colors.grey.shade200,
                shape: BoxShape.circle,
              ),
              child: Icon(
                hasSubTopics
                    ? Icons.folder_open
                    : (isCompleted ? Icons.check : Icons.lock_outline),
                color: isCompleted || hasSubTopics ? Colors.white : Colors.grey,
                size: 20,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isCompleted
                      ? AppTheme.accentColor.withValues(alpha: 0.05)
                      : Theme.of(context).cardColor,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                      color: isCompleted || (hasSubTopics && !isCompleted)
                          ? AppTheme.accentColor
                          : Colors.grey.shade200),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(topic.name,
                          style: TextStyle(
                              fontWeight: isCompleted
                                  ? FontWeight.bold
                                  : FontWeight.normal)),
                    ),
                    if (hasSubTopics)
                      const Icon(Icons.chevron_right,
                          size: 18, color: AppTheme.accentColor),
                  ],
                ),
              ),
            ),
          ],
        ),
        if (!isLast)
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              margin: const EdgeInsets.only(left: 19),
              width: 2,
              height: 30,
              color: isCompleted || hasSubTopics
                  ? AppTheme.accentColor
                  : Colors.grey.shade200,
            ),
          ),
      ],
    );
  }
}
