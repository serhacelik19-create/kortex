import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pasteboard/pasteboard.dart';
import 'package:yks/models/message.dart';
import 'package:yks/models/study_note.dart';
import 'package:yks/models/chat_session.dart';
import 'package:yks/services/ai_service.dart';
import 'package:yks/services/ai_prompt_service.dart';
import 'package:yks/services/image_crop_service.dart';
import 'package:yks/services/on_device_ocr_service.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/theme/app_theme.dart';
import 'package:yks/widgets/app_toast.dart';
import 'package:yks/widgets/math_markdown_body.dart';
import 'dart:convert';
import 'dart:io';

class ExplanationScreen extends StatefulWidget {
  final String initialCourse;
  final String? initialSessionId;

  const ExplanationScreen({
    super.key,
    required this.initialCourse,
    this.initialSessionId,
  });

  @override
  State<ExplanationScreen> createState() => _ExplanationScreenState();
}

class _ExplanationScreenState extends State<ExplanationScreen>
    with TickerProviderStateMixin {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<Message> _messages = [];
  bool _isLoading = false;
  bool _isCancelled = false;
  XFile? _selectedImage;

  // Typing animation
  late AnimationController _typingController;

  // Editing
  int? _editingIndex;

  ChatSession? _currentSession;

  String _guessImageMimeType(String path) {
    final normalized = path.toLowerCase();
    if (normalized.endsWith('.png')) return 'image/png';
    if (normalized.endsWith('.webp')) return 'image/webp';
    if (normalized.endsWith('.gif')) return 'image/gif';
    if (normalized.endsWith('.heic')) return 'image/heic';
    if (normalized.endsWith('.heif')) return 'image/heif';
    return 'image/jpeg';
  }

  String _normalizeOutgoingMessage(String text) {
    return text.replaceAll(RegExp(r'[\t ]+\n'), '\n').trimRight();
  }

  @override
  void initState() {
    super.initState();
    _typingController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _handleSession();
    });
  }

  @override
  void dispose() {
    _typingController.dispose();
    _saveCurrentSession();
    super.dispose();
  }

  Future<void> _saveCurrentSession() async {
    if (_messages.length <= 1) return;

    final session = _currentSession ??
        ChatSession(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          title: "${widget.initialCourse} Konu Sohbeti",
          course: widget.initialCourse,
          mode: 'explanation',
          lastActivity: DateTime.now(),
          messages: List<Message>.from(_messages),
        );

    _currentSession = session;

    await StorageService.saveSession(session.copyWith(
      messages: List<Message>.from(_messages),
      lastActivity: DateTime.now(),
    ));
  }

  List<Message> _buildContextMessagesUntil(int endIndex) {
    if (endIndex < 0 || _messages.isEmpty) return [];

    final boundedEndIndex =
        endIndex >= _messages.length ? _messages.length - 1 : endIndex;
    final historyMessages = _messages
        .take(boundedEndIndex + 1)
        .where((m) => m.id != '1')
        .toList();
    if (historyMessages.isEmpty) return [];

    for (var i = historyMessages.length - 1; i >= 0; i--) {
      if (historyMessages[i].sender == MessageSender.user) {
        return historyMessages.sublist(i);
      }
    }

    return [];
  }

  String _formatContextHistory(List<Message> messages) {
    if (messages.length <= 1) return "";

    return """
--- SON KONUŞMALAR ---
${messages.map((m) {
      final role = m.sender == MessageSender.user ? "Öğrenci" : "Asistan";
      return "$role: ${m.text}";
    }).join("\n")}
----------------------
""";
  }

  void _addInitialMessage() {
    if (_messages.isEmpty) {
      setState(() {
        _messages.add(Message(
          id: '1',
          text:
              "Selam! ${widget.initialCourse} dersinden hangi konuyu anlatmamı istersin? Takıldığın yeri yaz, hemen özet geçeyim. 📖",
          sender: MessageSender.assistant,
          timestamp: TimeOfDay.now().format(context),
        ));
      });
    }
  }

  Future<void> _handleSession() async {
    await StorageService.refreshChatSessionsFromServer();

    final sessions = StorageService.getAllSessions()
        .where(
            (s) => s.course == widget.initialCourse && s.mode == 'explanation')
        .toList();

    if (sessions.isNotEmpty) {
      final target = widget.initialSessionId != null
          ? sessions.cast<ChatSession?>().firstWhere(
                (session) => session?.id == widget.initialSessionId,
                orElse: () => null,
              ) ??
              sessions.first
          : sessions.first;
      setState(() {
        _currentSession = target;
        _messages.clear();
        _messages.addAll(target.messages);
      });
    } else {
      _addInitialMessage();
    }
  }

  Future<void> _pickImage() async {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text("Konu veya Görsel Ekle",
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildSourceBtn(Icons.photo_library_outlined, "Galeri",
                    ImageSource.gallery),
                _buildSourceBtn(
                    Icons.camera_alt_outlined, "Kamera", ImageSource.camera),
                Column(
                  children: [
                    InkWell(
                      onTap: () async {
                        Navigator.pop(context);
                        final pasted = await _tryPasteImageFromClipboard();
                        if (!pasted && context.mounted) {
                          if (context.mounted) {
                            AppToast.show(context, "Panoda görsel bulunamadı!",
                                icon: Icons.error_outline,
                                color: Colors.orange);
                          }
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color:
                              AppTheme.secondaryColor.withValues(alpha: 0.15),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(Icons.paste_rounded,
                            color: AppTheme.secondaryColor, size: 30),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text("Panodan", style: TextStyle(fontSize: 12)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Future<void> _setSelectedImageWithCrop(XFile image) async {
    final cropped = await ImageCropService.cropQuestionImage(context, image);
    if (!mounted) return;
    if (cropped != null) {
      setState(() => _selectedImage = cropped);
    }
  }

  Future<bool> _tryPasteImageFromClipboard() async {
    final bytes = await Pasteboard.image;
    if (bytes == null || bytes.isEmpty) {
      return false;
    }

    final directory = await getTemporaryDirectory();
    final file = File(
      '${directory.path}/pasted_image_${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(bytes);
    await _setSelectedImageWithCrop(XFile(file.path));
    return true;
  }

  Widget _buildSourceBtn(IconData icon, String label, ImageSource source) {
    return Column(
      children: [
        InkWell(
          onTap: () async {
            Navigator.pop(context);
            final picker = ImagePicker();
            final image = await picker.pickImage(
              source: source,
              imageQuality: 85,
            );
            if (image != null) {
              await _setSelectedImageWithCrop(image);
            }
          },
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.secondaryColor.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: AppTheme.secondaryColor, size: 30),
          ),
        ),
        const SizedBox(height: 8),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }

  void _cancelMessage() {
    setState(() {
      _isCancelled = true;
      _isLoading = false;
      if (_messages.isNotEmpty && _messages.last.sender == MessageSender.user) {
        final lastMsg = _messages.removeLast();
        _controller.text = lastMsg.text;
        if (lastMsg.imageUri != null) {
          _selectedImage = XFile(lastMsg.imageUri!);
        }
      }
    });
  }

  void _startEditMessage(int index) {
    setState(() {
      _editingIndex = index;
      _controller.text = _messages[index].text;
    });
    _scrollToBottom();
  }

  Future<void> _sendMessage() async {
    final userText = _normalizeOutgoingMessage(_controller.text);
    if (userText.isEmpty && _selectedImage == null) return;
    final userImage = _selectedImage;

    if (_editingIndex != null) {
      final idx = _editingIndex!;
      setState(() {
        _messages[idx] = Message(
          id: _messages[idx].id,
          text: userText,
          sender: MessageSender.user,
          timestamp: TimeOfDay.now().format(context),
        );
        _messages.removeRange(idx + 1, _messages.length);
        _editingIndex = null;
        _isLoading = true;
        _isCancelled = false;
        _controller.clear();
        _selectedImage = null;
      });
    } else {
      setState(() {
        _messages.add(Message(
          id: DateTime.now().toString(),
          text: userText,
          sender: MessageSender.user,
          timestamp: TimeOfDay.now().format(context),
          imageUri: userImage?.path,
        ));
        _isLoading = true;
        _isCancelled = false;
        _controller.clear();
        _selectedImage = null;
      });
    }

    _scrollToBottom();

    await _saveCurrentSession();

    try {
      String? base64Image;
      String? imageMimeType;
      String? ocrText;
      if (userImage != null) {
        final bytes = await userImage.readAsBytes();
        base64Image = base64Encode(bytes);
        imageMimeType = _guessImageMimeType(userImage.path);
        ocrText = await OnDeviceOcrService.extractText(userImage.path);
      }

      final shouldUseTextOnlyFromOcr =
          userImage != null &&
          ocrText != null &&
          AIService.shouldUseOcrTextOnly(
            course: widget.initialCourse,
            ocrText: ocrText,
            hasUserText: userText.isNotEmpty,
          );
      final effectiveBase64Image =
          shouldUseTextOnlyFromOcr ? null : base64Image;
      final effectiveUserText = userText.isNotEmpty ? userText : (ocrText ?? '');

      final userSettings = StorageService.getUserSettings();
      final branch = userSettings?['branch'] ?? 'Sayısal';
      final goal = userSettings?['goalScore'] ?? 'Hedefsiz';
      final wantsDetailed = AIPromptService.wantsDetailedAnswer(effectiveUserText);
      final systemInstruction = AIPromptService.buildExplanationSystemInstruction(
        course: widget.initialCourse,
        branch: branch,
        goal: goal.toString(),
        wantsDetailed: wantsDetailed,
      );

      final contextMessages = _buildContextMessagesUntil(_messages.length - 2);
      final hasRecentContextCandidate = contextMessages.length > 1;

      final interactionType = AIService.classifyInteractionType(
        text: effectiveUserText,
        hasRecentContext: hasRecentContextCandidate,
      );
      final contextHistory = interactionType == AIService.interactionFollowUp
          ? _formatContextHistory(contextMessages)
          : "";
      final hasRecentContext =
          interactionType == AIService.interactionFollowUp &&
          hasRecentContextCandidate;

      final rawResponse = await AIService.askGemini(
        prompt: "$contextHistoryÖğrencinin Yeni Sorusu: $effectiveUserText",
        course: widget.initialCourse,
        systemInstruction: systemInstruction,
        isImage: effectiveBase64Image != null,
        base64Image: effectiveBase64Image,
        imageMimeType: effectiveBase64Image != null ? imageMimeType : null,
        cacheText: effectiveUserText,
        ocrText: ocrText,
        interactionType: interactionType,
        hasRecentContext: hasRecentContext,
        feature: 'topic_explain',
      );

      if (_isCancelled) return;

      final parsedData = AIResponseData.parse(rawResponse);

      if (!mounted) return;

      final aiMsg = Message(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: AIPromptService.enrichWithEmojis(parsedData.cleanText),
        sender: MessageSender.assistant,
        timestamp: TimeOfDay.now().format(context),
        isEducational: parsedData.isEducational,
        course: widget.initialCourse,
      );

      setState(() {
        _messages.add(aiMsg);
        _isLoading = false;
      });

      if (parsedData.isEducational) {
        await StorageService.incrementExplanationCourseStat(widget.initialCourse);
        final newAchievements = await StorageService.checkAndUnlockAchievements();
        if (newAchievements.isNotEmpty && mounted) {
          AppToast.show(
              context, "🎉 ${newAchievements.length} Yeni Başarım Açıldı!",
              icon: Icons.emoji_events_rounded, color: Colors.amber);
        }

        String topic = _detectTopic(userText);
        await StorageService.incrementTopicStat(
            widget.initialCourse, topic, 'explanation');
      }

      _checkAchievements();

      await _saveCurrentSession();
      _scrollToBottom();
    } catch (e) {
      if (!_isCancelled) setState(() => _isLoading = false);
      debugPrint(e.toString());
    }
  }


  String _detectTopic(String text) {
    if (text.toLowerCase().contains("türev")) return "Türev";
    if (text.toLowerCase().contains("limit")) return "Limit";
    if (text.toLowerCase().contains("integral")) return "İntegral";
    return "Genel";
  }

  Future<void> _checkAchievements() async {
    final newlyUnlocked = await StorageService.checkAndUnlockAchievements();
    for (var id in newlyUnlocked) {
      _showAchievementToast(id);
    }
  }

  void _showAchievementToast(String id) {
    if (!mounted) return;
    AppToast.show(context, "🏆 Başarım Açıldı!",
        icon: Icons.military_tech_rounded, color: Colors.orange);
  }

  Future<void> _handleSaveNote(Message msg, int index) async {
    String? questionText;
    if (index > 0 && _messages[index - 1].sender == MessageSender.user) {
      questionText = _messages[index - 1].text;
    }

    final note = StudyNote(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      course: widget.initialCourse,
      content: msg.text,
      date: DateTime.now().toIso8601String(),
      questionText: questionText,
    );
    await StorageService.saveNote(note);
    if (mounted) {
      AppToast.show(context, "Nota eklendi! 📝",
          icon: Icons.note_alt_rounded, color: AppTheme.secondaryColor);
    }
  }

  Future<void> _clearChat() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Sohbeti Sil"),
        content: const Text("Tüm konuşma geçmişi silinecek. Emin misin?"),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("Vazgeç")),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text("Sil", style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirmed == true) {
      if (_currentSession != null) {
        await StorageService.deleteSession(_currentSession!.id);
      }
      _resetToFreshChat();
    }
  }

  void _resetToFreshChat() {
    setState(() {
      _currentSession = null;
      _messages.clear();
      _addInitialMessage();
    });
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _startNewChat() async {
    await _saveCurrentSession();
    _resetToFreshChat();
  }

  Future<void> _loadSession(ChatSession session) async {
    if (_currentSession?.id != session.id) {
      await _saveCurrentSession();
    }
    setState(() {
      _currentSession = session;
      _messages.clear();
      _messages.addAll(session.messages);
      _isLoading = false;
      _isCancelled = false;
    });
    _scrollToBottom();
  }

  Widget _buildDrawer() {
    final sessions = StorageService.getAllSessions()
        .where(
            (s) => s.course == widget.initialCourse && s.mode == 'explanation')
        .toList();

    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: ElevatedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  _startNewChat();
                },
                icon: const Icon(Icons.add),
                label: const Text("Yeni Sohbet"),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 48),
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: Colors.white,
                ),
              ),
            ),
            const Divider(),
            Expanded(
              child: ListView.builder(
                itemCount: sessions.length,
                itemBuilder: (context, index) {
                  final session = sessions[index];
                  final isCurrent = _currentSession?.id == session.id;

                  return ListTile(
                    leading: const Icon(Icons.chat_bubble_outline),
                    title: Text(
                      session.threadTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontWeight:
                              isCurrent ? FontWeight.bold : FontWeight.normal),
                    ),
                    subtitle: Text(
                      session.threadSubtitle,
                      style: const TextStyle(fontSize: 12),
                    ),
                    selected: isCurrent,
                    tileColor: isCurrent
                        ? AppTheme.primaryColor.withValues(alpha: 0.1)
                        : null,
                    onTap: () {
                      Navigator.pop(context);
                      _loadSession(session);
                    },
                    trailing: isCurrent
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.delete_outline,
                                size: 20, color: Colors.redAccent),
                            onPressed: () async {
                              await StorageService.deleteSession(session.id);
                              if (_currentSession?.id == session.id) {
                                _resetToFreshChat();
                              } else {
                                setState(() {}); // Drawer'ı güncelle
                              }
                            },
                          ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Konu Anlatımı", style: TextStyle(fontSize: 18)),
            Text(widget.initialCourse,
                style: const TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ),
        actions: [
          Builder(
            builder: (context) => IconButton(
              icon: const Icon(Icons.history_edu, color: Colors.blue),
              tooltip: "Geçmiş Sohbetler",
              onPressed: () => Scaffold.of(context).openEndDrawer(),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
            tooltip: "Sohbeti Sil",
            onPressed: _clearChat,
          ),
        ],
      ),
      endDrawer: _buildDrawer(),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final msg = _messages[index];
                return _buildMessageBubble(msg, index);
              },
            ),
          ),
          if (_isLoading) _buildTypingIndicator(),
          _buildInputArea(),
        ],
      ),
    );
  }

  Widget _buildTypingIndicator() {
    return Padding(
      padding: const EdgeInsets.only(left: 16, bottom: 4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(20).copyWith(
            bottomLeft: const Radius.circular(4),
          ),
          boxShadow: [BoxShadow(color: Theme.of(context).shadowColor.withValues(alpha: 0.12), blurRadius: 4)],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            return AnimatedBuilder(
              animation: _typingController,
              builder: (context, child) {
                final delay = i * 0.3;
                final progress =
                    (_typingController.value - delay).clamp(0.0, 1.0);
                final bounce =
                    (progress < 0.5) ? progress * 2 : (1.0 - progress) * 2;
                return Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  child: Transform.translate(
                    offset: Offset(0, -6 * bounce),
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: AppTheme.secondaryColor
                            .withValues(alpha: 0.4 + bounce * 0.6),
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                );
              },
            );
          }),
        ),
      ),
    );
  }

  Widget _buildMessageBubble(Message msg, int index) {
    bool isUser = msg.sender == MessageSender.user;
    final screenWidth = MediaQuery.of(context).size.width;
    final maxBubbleWidth = isUser
        ? (screenWidth * 0.8).clamp(280.0, 520.0)
        : (screenWidth * 0.9).clamp(320.0, 680.0);
    return GestureDetector(
      onLongPress: isUser ? () => _showUserMessageOptions(index) : null,
      child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.all(12),
          constraints: BoxConstraints(maxWidth: maxBubbleWidth),
          decoration: BoxDecoration(
            color: isUser ? AppTheme.primaryColor : Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(20).copyWith(
              bottomRight:
                  isUser ? const Radius.circular(0) : const Radius.circular(20),
              bottomLeft:
                  isUser ? const Radius.circular(20) : const Radius.circular(0),
            ),
            boxShadow: [BoxShadow(color: Theme.of(context).shadowColor.withValues(alpha: 0.1), blurRadius: 4)],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (msg.imageUri != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.file(File(msg.imageUri!),
                      height: 200, width: double.infinity, fit: BoxFit.cover),
                ),
              if (isUser)
                SelectionArea(
                  child: Text(msg.text,
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w500)),
                )
              else
                SelectionArea(
                  child: MathMarkdownBody(
                      data: msg.text,
                      styleSheet:
                          MarkdownStyleSheet(p: const TextStyle(fontSize: 15))),
                ),
              if (msg.isEducational && !isUser)
                _buildAssistantActions(msg, index),
              Align(
                alignment: Alignment.bottomRight,
                child: Text(msg.timestamp,
                    style: TextStyle(
                        fontSize: 10,
                        color: isUser ? Colors.white70 : Colors.grey)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showUserMessageOptions(int index) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.edit_outlined, color: Colors.blue),
              title: const Text("Mesajı Düzenle"),
              onTap: () {
                Navigator.pop(ctx);
                _startEditMessage(index);
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.red),
              title: const Text("Mesajı Sil"),
              onTap: () {
                Navigator.pop(ctx);
                setState(() {
                  _messages.removeRange(index, _messages.length);
                });
                _saveCurrentSession();
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildAssistantActions(Message msg, int index) {
    return Padding(
      padding: const EdgeInsets.only(top: 8.0),
      child: _miniActionBtn("📝 Nota Ekle", () => _handleSaveNote(msg, index)),
    );
  }

  Widget _miniActionBtn(String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
            color: Theme.of(context).brightness == Brightness.dark 
                ? Colors.white.withValues(alpha: 0.1) 
                : Colors.black.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(8)),
        child: Text(label,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          border: Border(top: BorderSide(color: Theme.of(context).dividerColor.withValues(alpha: 0.1)))),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_editingIndex != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  const Icon(Icons.edit, size: 14, color: Colors.blue),
                  const SizedBox(width: 6),
                  const Expanded(
                      child: Text("Mesaj düzenleniyor...",
                          style: TextStyle(fontSize: 12, color: Colors.blue))),
                  GestureDetector(
                    onTap: () => setState(() {
                      _editingIndex = null;
                      _controller.clear();
                    }),
                    child:
                        const Icon(Icons.close, size: 16, color: Colors.blue),
                  ),
                ],
              ),
            ),
          if (_selectedImage != null)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              height: 60,
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(File(_selectedImage!.path),
                        height: 60, width: 60, fit: BoxFit.cover),
                  ),
                  Positioned(
                    top: 0,
                    right: 0,
                    child: GestureDetector(
                      onTap: () => setState(() => _selectedImage = null),
                      child: Container(
                        decoration: const BoxDecoration(
                            color: Colors.red, shape: BoxShape.circle),
                        child: const Icon(Icons.close,
                            size: 14, color: Colors.white),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          Row(
            children: [
              IconButton(
                  icon: const Icon(Icons.add_a_photo_outlined),
                  onPressed: _pickImage),
              Expanded(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: Theme.of(context).brightness == Brightness.dark 
                        ? Colors.grey.shade900 
                        : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: TextField(
                    controller: _controller,
                    decoration: const InputDecoration(
                        hintText: "Hangi konuyu anlatmamı istersin?",
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.zero),
                    maxLines: null,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: _isLoading ? _cancelMessage : _sendMessage,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color:
                        _isLoading ? Colors.redAccent : AppTheme.secondaryColor,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    _isLoading ? Icons.stop_rounded : Icons.send_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
