import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:yks/services/api_service.dart';
import 'package:yks/theme/app_theme.dart';

class ParentNotificationsScreen extends StatefulWidget {
  const ParentNotificationsScreen({super.key});

  @override
  State<ParentNotificationsScreen> createState() =>
      _ParentNotificationsScreenState();
}

class _ParentNotificationsScreenState extends State<ParentNotificationsScreen> {
  bool _isLoading = true;
  List<dynamic> _notifications = [];
  Map<String, dynamic>? _sessionData;

  @override
  void initState() {
    super.initState();
    _load();
    _registerPushToken();
  }

  Future<void> _registerPushToken() async {
    try {
      await FirebaseMessaging.instance.requestPermission();
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await ApiService.registerParentPushToken(token);
    } catch (_) {
      // Firebase may not be configured in local/dev builds yet.
    }
  }

  Future<void> _load({bool showSpinner = true}) async {
    if (showSpinner && mounted) {
      setState(() => _isLoading = true);
    }

    try {
      final data = await ApiService.getParentSessionData();
      final notifications = await ApiService.getParentNotifications();
      if (!mounted) return;
      setState(() {
        _sessionData = data;
        _notifications = notifications;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bildirimler yüklenemedi.')),
      );
    }
  }

  Future<void> _openNotification(Map<String, dynamic> notification) async {
    final id = notification['id'];
    if (id is int && notification['readAt'] == null) {
      await ApiService.markParentNotificationRead(id);
      final readAt = DateTime.now().toIso8601String();
      notification['readAt'] = readAt;
      if (mounted) {
        setState(() {
          _notifications = _notifications.map((raw) {
            if (raw is Map && raw['id'] == id) {
              final updated = Map<String, dynamic>.from(raw);
              updated['readAt'] = readAt;
              return updated;
            }
            return raw;
          }).toList();
        });
      }
    }

    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) =>
          _buildNotificationDetailSheet(context, notification),
    );
  }

  String _formatShortDate(dynamic raw) {
    final parsed = _parseDate(raw);
    if (parsed == null) return '';
    final now = DateTime.now();
    final local = parsed.toLocal();
    if (local.year == now.year &&
        local.month == now.month &&
        local.day == now.day) {
      return DateFormat('HH:mm', 'tr_TR').format(local);
    }
    return DateFormat('d MMM', 'tr_TR').format(local);
  }

  String _formatFullDate(dynamic raw) {
    final parsed = _parseDate(raw);
    if (parsed == null) return 'Tarih bilgisi yok';
    return DateFormat('d MMMM yyyy, HH:mm', 'tr_TR').format(parsed.toLocal());
  }

  DateTime? _parseDate(dynamic raw) {
    if (raw == null) return null;
    if (raw is DateTime) return raw;
    return DateTime.tryParse(raw.toString());
  }

  Future<void> _confirmLogoutParent() async {
    final shouldLogout = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Veli erişimi kaldırılsın mı?'),
        content: const Text(
          'Bu cihazdaki veli bilgilendirme ekranı kapanır. Tekrar kullanmak için kurumdan yeni link gerekir.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Vazgeç'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Kaldır'),
          ),
        ],
      ),
    );

    if (shouldLogout == true) await _logoutParent();
  }

  Future<void> _logoutParent() async {
    await ApiService.logoutParent();
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
  }

  Color _screenBackground(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF111318)
        : const Color(0xFFF6F7FB);
  }

  Color _cardBackground(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF1C1F27)
        : Colors.white;
  }

  Color _mutedText(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? Colors.white60
        : const Color(0xFF667085);
  }

  String _notificationType(Map<String, dynamic> notification) {
    return notification['type']?.toString() ?? 'general';
  }

  bool _isUrgent(Map<String, dynamic> notification) {
    return notification['priority'] == 'urgent';
  }

  Color _notificationColor(Map<String, dynamic> notification) {
    if (_isUrgent(notification)) return const Color(0xFFEF4444);

    switch (_notificationType(notification)) {
      case 'attendance':
        return const Color(0xFFEF4444);
      case 'exam':
        return const Color(0xFF2563EB);
      case 'guidance':
        return AppTheme.primaryColor;
      case 'report':
        return const Color(0xFF0F9F6E);
      default:
        return AppTheme.primaryColor;
    }
  }

  IconData _notificationIcon(Map<String, dynamic> notification) {
    if (_isUrgent(notification)) return Icons.priority_high_rounded;

    switch (_notificationType(notification)) {
      case 'attendance':
        return Icons.event_busy_rounded;
      case 'exam':
        return Icons.assignment_rounded;
      case 'guidance':
        return Icons.support_agent_rounded;
      case 'report':
        return Icons.trending_up_rounded;
      default:
        return Icons.notifications_rounded;
    }
  }

  String _notificationLabel(Map<String, dynamic> notification) {
    switch (_notificationType(notification)) {
      case 'attendance':
        return 'Devamsızlık';
      case 'exam':
        return 'Sınav';
      case 'guidance':
        return 'Rehberlik';
      case 'report':
        return 'Gelişim raporu';
      default:
        return 'Bilgilendirme';
    }
  }

  String _stringValue(dynamic value, String fallback) {
    final text = value?.toString().trim();
    if (text == null || text.isEmpty) return fallback;
    return text;
  }

  @override
  Widget build(BuildContext context) {
    final student = _sessionData?['student'] as Map<String, dynamic>?;
    final institution = _sessionData?['institution'] as Map<String, dynamic>?;
    final notifications = _notifications
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final unreadCount =
        notifications.where((item) => item['readAt'] == null).length;

    return Scaffold(
      backgroundColor: _screenBackground(context),
      body: SafeArea(
        child: RefreshIndicator(
          color: AppTheme.primaryColor,
          onRefresh: () => _load(showSpinner: false),
          child: _isLoading
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    SizedBox(height: MediaQuery.of(context).size.height * 0.36),
                    const Center(child: CircularProgressIndicator()),
                  ],
                )
              : ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                  children: [
                    _buildTopBar(context),
                    const SizedBox(height: 18),
                    _buildStudentSummary(
                      context,
                      student: student,
                      institution: institution,
                      unreadCount: unreadCount,
                    ),
                    const SizedBox(height: 24),
                    _buildSectionHeader(context, unreadCount),
                    const SizedBox(height: 12),
                    if (notifications.isEmpty)
                      _buildEmptyState(context)
                    else
                      ...notifications.map(
                        (notification) =>
                            _buildNotificationCard(context, notification),
                      ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildTopBar(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Veli Bilgilendirme',
                style: TextStyle(
                  fontSize: 25,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Kurumdan gelen mesajlarınız',
                style: TextStyle(
                  color: _mutedText(context),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        _buildIconAction(
          context,
          icon: Icons.refresh_rounded,
          tooltip: 'Yenile',
          onTap: () => _load(showSpinner: false),
        ),
        const SizedBox(width: 8),
        _buildIconAction(
          context,
          icon: Icons.logout_rounded,
          tooltip: 'Veli erişimini kaldır',
          onTap: _confirmLogoutParent,
        ),
      ],
    );
  }

  Widget _buildIconAction(
    BuildContext context, {
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: _cardBackground(context),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: Colors.black.withValues(alpha: 0.05),
            ),
          ),
          child: Icon(icon, size: 22, color: _mutedText(context)),
        ),
      ),
    );
  }

  Widget _buildStudentSummary(
    BuildContext context, {
    required Map<String, dynamic>? student,
    required Map<String, dynamic>? institution,
    required int unreadCount,
  }) {
    final studentName = _stringValue(student?['name'], 'Öğrenci');
    final institutionName = _stringValue(institution?['name'], 'Kurum');
    final hasUnread = unreadCount > 0;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: _cardBackground(context),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(
          color: AppTheme.primaryColor.withValues(alpha: 0.12),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(18),
            ),
            child: const Icon(
              Icons.family_restroom_rounded,
              color: AppTheme.primaryColor,
              size: 28,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  studentName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 19,
                    letterSpacing: -0.1,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  institutionName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: _mutedText(context),
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color:
                  hasUnread ? const Color(0xFFFEF2F2) : const Color(0xFFECFDF5),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              hasUnread ? '$unreadCount yeni' : 'Hepsi okundu',
              style: TextStyle(
                color: hasUnread
                    ? const Color(0xFFDC2626)
                    : const Color(0xFF047857),
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(BuildContext context, int unreadCount) {
    return Row(
      children: [
        const Expanded(
          child: Text(
            'Mesajlar',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.1,
            ),
          ),
        ),
        Text(
          unreadCount > 0 ? '$unreadCount yeni mesaj' : 'Güncel',
          style: TextStyle(
            color: _mutedText(context),
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }

  Widget _buildNotificationCard(
    BuildContext context,
    Map<String, dynamic> notification,
  ) {
    final isUnread = notification['readAt'] == null;
    final isUrgent = _isUrgent(notification);
    final color = _notificationColor(notification);
    final title = _stringValue(notification['title'], 'Bildirim');
    final body = _stringValue(notification['body'], '');
    final shortDate = _formatShortDate(notification['createdAt']);

    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: () => _openNotification(notification),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: _cardBackground(context),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: isUnread
                ? color.withValues(alpha: 0.28)
                : Colors.black.withValues(alpha: 0.06),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isUnread ? 0.07 : 0.04),
              blurRadius: isUnread ? 22 : 14,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                _notificationIcon(notification),
                color: color,
                size: 24,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 16.5,
                            height: 1.15,
                            fontWeight:
                                isUnread ? FontWeight.w900 : FontWeight.w700,
                            letterSpacing: -0.1,
                          ),
                        ),
                      ),
                      if (shortDate.isNotEmpty) ...[
                        const SizedBox(width: 10),
                        Text(
                          shortDate,
                          style: TextStyle(
                            color: _mutedText(context),
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (body.isNotEmpty) ...[
                    const SizedBox(height: 7),
                    Text(
                      body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: _mutedText(context),
                        fontSize: 14.5,
                        height: 1.38,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _buildPill(
                        context,
                        text: _notificationLabel(notification),
                        color: color,
                      ),
                      if (isUrgent)
                        _buildPill(
                          context,
                          text: 'Acil',
                          color: const Color(0xFFEF4444),
                        ),
                      if (isUnread)
                        _buildPill(
                          context,
                          text: 'Yeni',
                          color: AppTheme.primaryColor,
                          filled: true,
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPill(
    BuildContext context, {
    required String text,
    required Color color,
    bool filled = false,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: filled ? color : color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: filled ? Colors.white : color,
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 28),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 38),
      decoration: BoxDecoration(
        color: _cardBackground(context),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
      ),
      child: Column(
        children: [
          Container(
            width: 62,
            height: 62,
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(22),
            ),
            child: const Icon(
              Icons.notifications_none_rounded,
              color: AppTheme.primaryColor,
              size: 31,
            ),
          ),
          const SizedBox(height: 18),
          const Text(
            'Henüz mesaj yok',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            'Kurumunuz bilgilendirme gönderdiğinde burada görünecek.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _mutedText(context),
              fontWeight: FontWeight.w600,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationDetailSheet(
    BuildContext context,
    Map<String, dynamic> notification,
  ) {
    final color = _notificationColor(notification);
    final title = _stringValue(notification['title'], 'Bildirim');
    final body = _stringValue(notification['body'], '');

    return SafeArea(
      top: false,
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.84,
        ),
        decoration: BoxDecoration(
          color: _cardBackground(context),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(22, 12, 22, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Icon(
                      _notificationIcon(notification),
                      color: color,
                      size: 28,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildPill(
                          context,
                          text: _notificationLabel(notification),
                          color: color,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 22,
                            height: 1.12,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.2,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _formatFullDate(notification['createdAt']),
                          style: TextStyle(
                            color: _mutedText(context),
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              Text(
                body,
                style: TextStyle(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white.withValues(alpha: 0.88)
                      : const Color(0xFF344054),
                  fontSize: 16,
                  height: 1.55,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                  child: const Text(
                    'Tamam',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
