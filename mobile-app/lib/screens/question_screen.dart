import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pasteboard/pasteboard.dart';
import 'package:yks/models/message.dart';
import 'package:yks/models/favorite_question.dart';
import 'package:yks/models/chat_session.dart';
import 'package:yks/services/ai_service.dart';
import 'package:yks/services/ai_prompt_service.dart';
import 'package:yks/services/api_service.dart';
import 'package:yks/services/image_crop_service.dart';
import 'package:yks/services/on_device_ocr_service.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/theme/app_theme.dart';
import 'package:yks/widgets/math_markdown_body.dart';
import 'package:yks/widgets/app_toast.dart';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

class QuestionScreen extends StatefulWidget {
  final String initialCourse;
  final String? initialSessionId;

  const QuestionScreen({
    super.key,
    required this.initialCourse,
    this.initialSessionId,
  });

  @override
  State<QuestionScreen> createState() => _QuestionScreenState();
}

class _QuestionScreenState extends State<QuestionScreen>
    with TickerProviderStateMixin {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<Message> _messages = [];
  bool _isLoading = false;
  bool _isCancelled = false;
  XFile? _selectedImage;
  http.Client? _activeRequestClient;

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
    _saveCurrentSession();
    ApiService.closeRequestClient(_activeRequestClient);
    _typingController.dispose();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  String _buildSessionTitle() => "${widget.initialCourse} Soru Sohbeti";

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

  String _findAnchorQuestionText(int anchorIndex) {
    final boundedIndex =
        anchorIndex.clamp(0, _messages.isEmpty ? 0 : _messages.length - 1);

    for (var i = boundedIndex; i >= 0; i--) {
      final msg = _messages[i];
      final originalQuestionText = (msg.originalQuestionText ?? '').trim();
      if (originalQuestionText.isNotEmpty) {
        return originalQuestionText;
      }
      if (msg.sender == MessageSender.user && msg.text.trim().isNotEmpty) {
        return msg.text.trim();
      }
    }

    return "";
  }

  Map<String, dynamic>? _cacheContextFromMessage(Message msg) {
    final questionText = (msg.originalQuestionText ?? '').trim();
    if (!msg.hasCacheBinding && !msg.cacheRequiresApproval && questionText.isEmpty) {
      return null;
    }
    return {
      'course': msg.course ?? widget.initialCourse,
      'requiresApproval': msg.cacheRequiresApproval,
      'cacheRecordId': msg.cacheRecordId,
      'cacheSource': msg.cacheSource,
      'cacheSimilarity': msg.cacheSimilarity,
      'traditionalHash': msg.traditionalHash,
      'imageHash': msg.imageHash,
      'semanticHash': msg.semanticHash,
      'cacheVariant': msg.cacheVariant,
      'answer': msg.cacheAnswer,
      'questionText': questionText,
    };
  }

  Future<void> _saveCurrentSession() async {
    if (_messages.length <= 1) return;

    if (_currentSession == null) {
      // İlk mesajda yeni session oluştur
        _currentSession = ChatSession(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          title: _buildSessionTitle(),
          course: widget.initialCourse,
          mode: 'question',
          lastActivity: DateTime.now(),
          messages: List<Message>.from(_messages),
      );
    } else {
      _currentSession = _currentSession!.copyWith(
        messages: List<Message>.from(_messages),
        lastActivity: DateTime.now(),
      );
    }

    await StorageService.saveSession(_currentSession!);
  }

  void _addInitialMessage() {
    if (_messages.isEmpty) {
      setState(() {
        _messages.add(Message(
          id: '1',
          text:
              "Selam! ${widget.initialCourse} dersinden çözemediğin bir soru varsa fotoğrafını atabilir veya soruyu buraya yazabilirsin. Hemen çözelim! 🚀",
          sender: MessageSender.assistant,
          timestamp: TimeOfDay.now().format(context),
        ));
      });
    }
  }

  Future<void> _handleSession() async {
    await StorageService.refreshChatSessionsFromServer();

    final sessions = StorageService.getAllSessions()
        .where((s) => s.course == widget.initialCourse && s.mode == 'question')
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
            const Text("Soru Ekle",
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
                          color: AppTheme.primaryColor.withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(Icons.paste_rounded,
                            color: AppTheme.primaryColor, size: 30),
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
              color: AppTheme.primaryColor.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: AppTheme.primaryColor, size: 30),
          ),
        ),
        const SizedBox(height: 8),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }

  void _cancelMessage() {
    ApiService.closeRequestClient(_activeRequestClient);
    _activeRequestClient = null;
    setState(() {
      _isCancelled = true;
      _isLoading = false;
      // Remove last user message if AI hasn't responded yet
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
    // scroll to bottom and focus
    _scrollToBottom();
  }

  Future<void> _sendMessage({
    String? overrideText,
    bool isHidden = false,
    int? contextAnchorIndex,
  }) async {
    final rawText = overrideText ?? _controller.text;
    final userText = _normalizeOutgoingMessage(rawText);
    if (userText.isEmpty && _selectedImage == null) return;

    final userImage = _selectedImage;

    // Eğer gizli istek değilse, ekrana kullanıcı mesajını bas:
    if (!isHidden) {
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
    } else {
      // Gizli istek: Listeye mesaj ekleme ama yükleniyor (typing) göster.
      setState(() {
        _isLoading = true;
      });
    }

    _scrollToBottom();

    if (!isHidden) {
      await _saveCurrentSession();
    }

    try {
      _activeRequestClient = ApiService.createRequestClient();
      String? base64Image;
      String? imageMimeType;
      String? ocrText;
      if (userImage != null) {
        final bytes = await userImage.readAsBytes();
        base64Image = base64Encode(bytes);
        imageMimeType = _guessImageMimeType(userImage.path);
        ocrText = await OnDeviceOcrService.extractText(userImage.path);
      }

      final userSettings = StorageService.getUserSettings();
      final branch = userSettings?['branch'] ?? 'Sayısal';
      final goal = userSettings?['goalScore'] ?? 'Hedefsiz';
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
      final hasImage = userImage != null && effectiveBase64Image != null;

      // Eğer isHidden (Detaylı çözümü gör) tıklandıysa, AI'ın son soruyu bağlamdan anlayıp
      // uzun çözmesini garantilemek için mesajı özel forma sokuyoruz:
      String finalPrompt = "";
      String cacheText = userText;
      bool wantsDetailed = false;
      String interactionType = AIService.interactionNewQuestion;
      bool hasRecentContext = false;
      if (isHidden) {
        final contextMessages = _buildContextMessagesUntil(
          contextAnchorIndex ?? (_messages.length - 1),
        );
        final contextHistory = _formatContextHistory(contextMessages);
        final anchorQuestionText = _findAnchorQuestionText(
          contextAnchorIndex ?? (_messages.length - 1),
        );
        hasRecentContext = contextMessages.length > 1;
        wantsDetailed = true;
        interactionType = AIService.classifyInteractionType(
          text: userText,
          hasRecentContext: hasRecentContext,
          isDetailedRequest: true,
        );
        cacheText = anchorQuestionText.isNotEmpty ? anchorQuestionText : userText;
        finalPrompt =
            "$contextHistory\nÖĞRENCİ DİYOR Kİ: Lütfen yukarıdaki en son tartıştığımız soruyu tüm detaylarıyla, adım adım anlatır mısın?";
      } else {
        // Kullanıcı metin girmemiş ama fotoğraf koymuşsa yapay zekanın selamlamaya geçmesini engelle
        String effectiveText = userText;
        if (effectiveText.isEmpty && shouldUseTextOnlyFromOcr && ocrText != null) {
          effectiveText = ocrText;
        }
        cacheText = userText.isNotEmpty ? effectiveText : (ocrText ?? effectiveText);
        wantsDetailed = AIPromptService.wantsDetailedAnswer(effectiveText);
        final contextMessages = _buildContextMessagesUntil(_messages.length - 2);
        final hasRecentContextCandidate = contextMessages.length > 1;
        interactionType = AIService.classifyInteractionType(
          text: cacheText,
          hasRecentContext: hasRecentContextCandidate,
        );
        final contextHistory = interactionType == AIService.interactionFollowUp
            ? _formatContextHistory(contextMessages)
            : "";
        hasRecentContext =
            interactionType == AIService.interactionFollowUp &&
            hasRecentContextCandidate;
        finalPrompt = "$contextHistoryÖğrencinin Yeni Sorusu: $effectiveText";
      }

      final systemInstruction = AIPromptService.buildQuestionSystemInstruction(
        course: widget.initialCourse,
        branch: branch,
        goal: goal.toString(),
        hasImage: hasImage,
        wantsDetailed: wantsDetailed,
      );

      final rawResponse = await AIService.askGemini(
        prompt: finalPrompt,
        course: widget.initialCourse,
        systemInstruction: systemInstruction,
        isImage: !isHidden &&
            effectiveBase64Image != null, // Gizli istese, fotoyu baştan almıyoruz
        base64Image: !isHidden ? effectiveBase64Image : null,
        imageMimeType:
            !isHidden && effectiveBase64Image != null ? imageMimeType : null,
        cacheText: cacheText,
        ocrText: !isHidden ? ocrText : null,
        interactionType: interactionType,
        hasRecentContext: hasRecentContext,
        requestClient: _activeRequestClient,
        isCancelled: () => _isCancelled,
      );

      if (_isCancelled) return;

      final parsedData = AIResponseData.parse(rawResponse);
      final cacheContext = AIService.detachLastCacheContext(
        cacheVariant: AIService.cacheVariantForInteractionType(interactionType),
      );
      final isEducationalMessage =
          parsedData.isEducational || cacheContext?['cacheHit'] == true;

      if (!mounted) return;

      final aiMsg = Message(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: AIPromptService.enrichWithEmojis(parsedData.cleanText),
        sender: MessageSender.assistant,
        timestamp: TimeOfDay.now().format(context),
        originalQuestionText: cacheText,
        isEducational: isEducationalMessage,
        course: widget.initialCourse,
        cacheRequiresApproval: cacheContext?['requiresApproval'] == true,
        cacheAutoSaved: cacheContext?['autoSaved'] == true ||
            cacheContext?['cacheHit'] == true,
        cacheRecordId: cacheContext?['cacheRecordId'] as int?,
        cacheSource: cacheContext?['cacheSource']?.toString(),
        cacheSimilarity: (cacheContext?['cacheSimilarity'] as num?)?.toDouble(),
        traditionalHash: cacheContext?['traditionalHash']?.toString(),
        imageHash: cacheContext?['imageHash']?.toString(),
        semanticHash: cacheContext?['semanticHash']?.toString(),
        cacheVariant: cacheContext?['cacheVariant']?.toString(),
        cacheAnswer: parsedData.cleanText,
        cacheApproved: cacheContext?['autoSaved'] == true,
      );

      setState(() {
        _messages.add(aiMsg);
        _isLoading = false;
      });

      if (isEducationalMessage) {
        await StorageService.saveWeeklyActivity();
        await StorageService.incrementQuestionCourseStat(widget.initialCourse);
        final newAchievements = await StorageService.checkAndUnlockAchievements();
        if (newAchievements.isNotEmpty && mounted) {
          AppToast.show(
              context, "🎉 ${newAchievements.length} Yeni Başarım Açıldı!",
              icon: Icons.emoji_events_rounded, color: Colors.amber);
        }

        String topic = _detectTopic(userText);
        await StorageService.incrementTopicStat(
            widget.initialCourse, topic, 'question');
        final syncCourse = parsedData.course ?? widget.initialCourse;
        final syncTopic = parsedData.topic ?? _detectTopic(userText);

        await ApiService.syncAIAnalysis(
          course: syncCourse,
          topic: syncTopic,
          subtopic: parsedData.subtopic ?? 'Genel',
          difficulty: parsedData.difficulty ?? 'Orta',
        );
      }

      _checkAchievements();

      await _saveCurrentSession();
      _scrollToBottom();
    } catch (e) {
      if (!_isCancelled) setState(() => _isLoading = false);
      debugPrint(e.toString());
    } finally {
      ApiService.closeRequestClient(_activeRequestClient);
      _activeRequestClient = null;
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

  Future<void> _handleSaveFavorite(Message msg) async {
    int idx = _messages.indexOf(msg);
    String? qText;
    String? qImg;
    if (idx > 0) {
      qText = _messages[idx - 1].text;
      qImg = _messages[idx - 1].imageUri;
    }

    final fav = FavoriteQuestion(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      questionText: qText,
      questionImage: qImg,
      answerText: msg.text,
      course: widget.initialCourse,
      timestamp: DateTime.now().toIso8601String(),
    );
    await StorageService.saveFavoriteQuestion(fav);
    if (mounted) {
      AppToast.show(context, "Soru kitaplığa eklendi! ⭐",
          icon: Icons.star_rounded, color: Colors.amber);
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
        .where((s) => s.course == widget.initialCourse && s.mode == 'question')
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
            const Text("Soru Çözümü", style: TextStyle(fontSize: 18)),
            Text(widget.initialCourse,
                style: const TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ),
        actions: [
          Builder(
            builder: (context) => IconButton(
              icon: const Icon(Icons.history_edu, color: Colors.blue),
              tooltip: "Geçmiş Sorular",
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
          boxShadow: [
            BoxShadow(
                color: Theme.of(context).shadowColor.withValues(alpha: 0.1),
                blurRadius: 4)
          ],
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
                        color: AppTheme.primaryColor
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

  /// AI cevabındaki [GRAPH_BASE64:...] etiketini parse edip metin + grafik olarak widget listesi döndürür
  List<Widget> _buildAIContent(Message msg, BuildContext context) {
    final graphRegex = RegExp(r'\[GRAPH_BASE64:(.+?)\]', dotAll: true);
    final match = graphRegex.firstMatch(msg.text);

    String textContent = msg.text;
    String? graphBase64;

    if (match != null) {
      graphBase64 = match.group(1)?.trim();
      textContent = msg.text.replaceAll(match.group(0)!, '').trim();
    }

    return [
      // Metin kısmı (Markdown + LaTeX)
      if (textContent.isNotEmpty)
        SelectionArea(
          child: MathMarkdownBody(
            data: textContent,
            styleSheet: MarkdownStyleSheet(p: const TextStyle(fontSize: 15)),
          ),
        ),
      // Grafik kısmı
      if (graphBase64 != null && graphBase64.isNotEmpty) ...[
        const SizedBox(height: 12),
        GestureDetector(
          onTap: () => _showFullScreenGraph(graphBase64!),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.memory(
              base64Decode(graphBase64),
              width: double.infinity,
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => const Text('Grafik yüklenemedi'),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '📊 Grafiği büyütmek için dokun',
          style: TextStyle(
              fontSize: 11,
              color: Colors.grey[500],
              fontStyle: FontStyle.italic),
        ),
      ],
    ];
  }

  void _showFullScreenGraph(String base64Data) {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(16),
        child: GestureDetector(
          onTap: () => Navigator.pop(ctx),
          child: InteractiveViewer(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child:
                  Image.memory(base64Decode(base64Data), fit: BoxFit.contain),
            ),
          ),
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
            boxShadow: [
              BoxShadow(
                  color: Theme.of(context).shadowColor.withValues(alpha: 0.1),
                  blurRadius: 4)
            ],
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
                ..._buildAIContent(msg, context),
              if (!isUser && msg.id != '1') _buildAssistantActions(msg, index),
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

  Future<void> _handleRetryAnswer(int index) async {
    if (index == 0) return;
    final userMsg = _messages[index - 1];

    // Silinecek eski AI cevabının detay seviyesini belirle
    final oldAiMsg = _messages[index];
    final wasDetailed = oldAiMsg.text.length > 400 ||
        oldAiMsg.text.contains("Adım Adım") ||
        oldAiMsg.text.contains("Adım 1");

    // Geçmişi oluştur (Hatalı cevabı da dahil ediyoruz ki AI hatasını görsün)
    final historyMessages =
        _messages.take(index + 1).where((m) => m.id != '1').toList();
    final historyStringList = historyMessages.map((m) {
      return {
        'role': m.sender == MessageSender.user ? 'user' : 'model',
        'parts': m.text,
      };
    }).toList();

    setState(() {
      _messages.removeAt(index); // UI'dan kaldır
      _isLoading = true;
    });
    _scrollToBottom();

    try {
      String? base64Image;
      String? imageMimeType;
      if (userMsg.imageUri != null) {
        final bytes = await File(userMsg.imageUri!).readAsBytes();
        base64Image = base64Encode(bytes);
        imageMimeType = _guessImageMimeType(userMsg.imageUri!);
      }

      final userSettings = StorageService.getUserSettings();
      final branch = userSettings?['branch'] ?? 'Sayısal';
      final goal = userSettings?['goalScore'] ?? 'Hedefsiz';
      final hasImage = userMsg.imageUri != null || base64Image != null;
      final systemInstruction = AIPromptService.buildQuestionSystemInstruction(
        course: widget.initialCourse,
        branch: branch,
        goal: goal.toString(),
        hasImage: hasImage,
        wantsDetailed: wasDetailed,
        isRetry: true,
      );

      final rawResponse = await AIService.retryLastAnswer(
        prompt: userMsg.text,
        course: widget.initialCourse,
        systemInstruction: systemInstruction,
        history: historyStringList,
        base64Image: base64Image,
        imageMimeType: imageMimeType,
        cacheContext: _cacheContextFromMessage(oldAiMsg),
      );

      final parsedData = AIResponseData.parse(rawResponse);
      final cacheContext = AIService.detachLastCacheContext(
        cacheVariant: oldAiMsg.cacheVariant ??
            (wasDetailed
                ? AIService.cacheVariantDetailed
                : AIService.cacheVariantShort),
      );

      if (!mounted) return;

      final aiMsg = Message(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: AIPromptService.enrichWithEmojis(parsedData.cleanText),
        sender: MessageSender.assistant,
        timestamp: TimeOfDay.now().format(context),
        originalQuestionText:
            oldAiMsg.originalQuestionText ?? userMsg.originalQuestionText ?? userMsg.text,
        isEducational: parsedData.isEducational,
        course: widget.initialCourse,
        cacheRequiresApproval: cacheContext?['requiresApproval'] == true,
        cacheAutoSaved: cacheContext?['autoSaved'] == true,
        cacheRecordId: cacheContext?['cacheRecordId'] as int?,
        cacheSource: cacheContext?['cacheSource']?.toString(),
        cacheSimilarity: (cacheContext?['cacheSimilarity'] as num?)?.toDouble(),
        traditionalHash: cacheContext?['traditionalHash']?.toString(),
        imageHash: cacheContext?['imageHash']?.toString(),
        semanticHash: cacheContext?['semanticHash']?.toString(),
        cacheVariant: cacheContext?['cacheVariant']?.toString(),
        cacheAnswer: parsedData.cleanText,
        cacheApproved: cacheContext?['autoSaved'] == true,
      );

      setState(() {
        if (index <= _messages.length) {
          _messages.insert(index, aiMsg);
        } else {
          _messages.add(aiMsg);
        }
        _isLoading = false;
      });
      await _saveCurrentSession();
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        AppToast.show(context, "Yeniden çözüm yapılamadı.", icon: Icons.error);
      }
    }
  }

  Widget _buildAssistantActions(Message msg, int index) {
    // Mesaj uzunsa veya direkt olarak "Adım Adım" kelimeleri geçiyorsa o butonu GİZLE:
    final bool isDetailed = msg.text.length > 400 ||
        msg.text.contains("Adım Adım") ||
        msg.text.contains("Adım 1");

    return Padding(
      padding: const EdgeInsets.only(top: 8.0),
      child: Wrap(
        spacing: 8,
        runSpacing: 4,
        children: [
          if (msg.isEducational && !msg.cacheApproved && !msg.cacheAutoSaved)
            _miniActionBtn("👍 Çözüm Doğru", () async {
              final result = await AIService.approveAnswer(
                cacheContext: _cacheContextFromMessage(msg),
                answer: msg.cacheAnswer ?? msg.text,
              );
              if (mounted) {
                if (result == 'saved' || result == 'already_saved') {
                  setState(() {
                    msg.cacheApproved = true;
                  });
                }
                final message = switch (result) {
                  'saved' => "Soru önbelleğe eklendi! ✨",
                  'already_saved' => "Bu cevap zaten otomatik kaydedildi.",
                  _ => "Bu cevap için bekleyen bir önbellek kaydı yok.",
                };
                AppToast.show(context, message,
                    icon: Icons.check_circle, color: Colors.green);
              }
            }),
          if (!msg.text.contains("problemi çözemedim"))
            _miniActionBtn(
                "👎 Hatalı/Yeniden Çöz", () => _handleRetryAnswer(index)),
          if (msg.isEducational)
            _miniActionBtn(
                "⭐ Soruyu Kitaplığa Ekle", () => _handleSaveFavorite(msg)),
          if (!isDetailed && msg.isEducational && !msg.hasRequestedDetails)
            _miniActionBtn("🔍 Detaylı Çözümü Gör", () {
              setState(() {
                msg.hasRequestedDetails = true;
              });
              _sendMessage(
                overrideText: "Bu soruyu adım adım, tüm detaylarıyla anlatır mısın?",
                isHidden: true,
                contextAnchorIndex: index,
              );
            }),
        ],
      ),
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
          border: Border(
              top: BorderSide(
                  color:
                      Theme.of(context).dividerColor.withValues(alpha: 0.1)))),
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
                        hintText: "Sorunu yaz veya fotoğrafını at...",
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
                        _isLoading ? Colors.redAccent : AppTheme.primaryColor,
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
