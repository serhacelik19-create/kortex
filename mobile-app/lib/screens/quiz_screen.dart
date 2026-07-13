import 'package:flutter/material.dart';
import 'package:yks/models/smart_quiz.dart';
import 'package:yks/services/ai_service.dart';
import 'package:yks/services/api_service.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/theme/app_theme.dart';
import 'package:yks/utils/smart_quiz_parser.dart';
import 'package:yks/widgets/math_markdown_body.dart';

class QuizScreen extends StatefulWidget {
  final SmartQuizPlan plan;

  const QuizScreen({super.key, required this.plan});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  bool isLoading = false;
  bool isSubmitting = false;
  bool isCompleted = false;
  bool _hasRetriedGeneration = false;
  String? errorMessage;
  int currentIndex = 0;
  int correctCount = 0;
  List<int?> selectedAnswers = [];
  List<SmartQuizQuestion> questions = [];
  String? coachNote;

  @override
  void initState() {
    super.initState();
    _restoreOrGenerateQuiz();
  }

  Future<void> _markAttemptInProgress() async {
    await ApiService.syncSmartQuizPlan(widget.plan, status: 'in_progress');
  }

  Future<void> _restoreOrGenerateQuiz() async {
    final savedAttempt = await ApiService.getSmartQuizAttempt(widget.plan.id);
    final savedProgress = savedAttempt?.progress;
    if (savedProgress != null &&
        savedProgress.planId == widget.plan.id &&
        savedProgress.questions.isNotEmpty) {
      final savedAnswers = List<int?>.from(savedProgress.selectedAnswers);
      final normalizedAnswers = List<int?>.generate(
        savedProgress.questions.length,
        (index) => index < savedAnswers.length ? savedAnswers[index] : null,
      );

      setState(() {
        questions = savedProgress.questions;
        selectedAnswers = normalizedAnswers;
        currentIndex = savedProgress.currentIndex.clamp(
          0,
          savedProgress.questions.length - 1,
        );
        correctCount = savedProgress.correctCount ?? 0;
        coachNote = savedProgress.coachNote;
        isCompleted = savedProgress.isCompleted;
      });
      if (!savedProgress.isCompleted) {
        await _markAttemptInProgress();
      }
      return;
    }

    await _generateQuiz();
  }

  Future<void> _generateQuiz() async {
    setState(() => isLoading = true);
    try {
      final prompt = _buildQuizPrompt(strictJson: true);

      final response = await AIService.askGemini(
        prompt: prompt,
        course: widget.plan.course,
        systemInstruction:
            'Sen olcme-degerlendirme odakli bir YKS ogretmenisin. JSON disina cikma.',
        useCache: false,
      );

      final parsed = parseSmartQuizResponse(
        response,
        expectedCount: widget.plan.questionCount > 0 ? widget.plan.questionCount : 3,
      );
      if (!mounted) return;

      setState(() {
        coachNote = parsed.$1;
        questions = parsed.$2;
        selectedAnswers = List<int?>.filled(questions.length, null);
        isLoading = false;
        _hasRetriedGeneration = false;
        errorMessage = null;
      });
      await _markAttemptInProgress();
      await _persistProgress();
    } catch (error) {
      if (_hasRetriedGeneration) {
        if (!mounted) return;
        setState(() {
          isLoading = false;
        });
        debugPrint('Smart quiz generation failed: $error');
        return;
      }

      _hasRetriedGeneration = true;
      await _retryGenerateQuiz();
    }
  }

  Future<void> _retryGenerateQuiz() async {
    try {
      final retryPrompt = _buildQuizPrompt(strictJson: false);

      final response = await AIService.askGemini(
        prompt: retryPrompt,
        course: widget.plan.course,
        systemInstruction:
            'Sen olcme-degerlendirme odakli bir YKS ogretmenisin. Sadece gecerli JSON ver.',
        useCache: false,
      );

      final parsed = parseSmartQuizResponse(
        response,
        expectedCount: widget.plan.questionCount > 0 ? widget.plan.questionCount : 3,
        allowPartialCount: true,
      );
      if (!mounted) return;

      setState(() {
        coachNote = parsed.$1;
        questions = parsed.$2;
        selectedAnswers = List<int?>.filled(questions.length, null);
        isLoading = false;
        errorMessage = null;
      });
      await _markAttemptInProgress();
      await _persistProgress();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        isLoading = false;
        errorMessage = _formatQuizError(error);
      });
      debugPrint('Smart quiz retry failed: $error');
    }
  }

  String _formatQuizError(Object error) {
    final text = error.toString();
    if (text.contains('Quiz sorulari bos geldi')) {
      return 'Sistem soru uretti ama gecerli quiz listesi donmedi.';
    }
    if (text.contains('Quiz sorulari eksik geldi')) {
      return 'Beklenen sayida soru donmedi. Quiz yarim geldi.';
    }
    if (text.contains('FormatException')) {
      return 'Yapay zeka yaniti quiz formatina uymadi.';
    }
    return 'Quiz olusturulurken beklenmeyen bir hata oldu.';
  }

  String _buildQuizPrompt({required bool strictJson}) {
    final mathHeavyCourses = {
      'matematik',
      'matematik (tyt)',
      'geometri',
      'fizik',
      'kimya',
    };
    final isMathHeavy = mathHeavyCourses.contains(
      widget.plan.course.trim().toLowerCase(),
    );

    return '''
Bir YKS ogrencisi icin "Akilli Quiz" hazirla.

Ders: ${widget.plan.course}
Konu: ${widget.plan.topic}
Neden bu quiz aciliyor: ${widget.plan.reason}

Kurallar:
- Tam olarak ${widget.plan.questionCount > 0 ? widget.plan.questionCount : 3} adet coktan secmeli soru uret.
- Sorular kolay -> orta -> orta-zor siralamasinda olsun.
- Sadece bu konuya odaklan.
- Her soruda 4 secenek olsun.
- Tek dogru cevap olsun.
- Sorular YKS duzeyinde olsun.
- Aciklamalar kisa, net ve ogretici olsun.
- ${isMathHeavy ? 'Matematiksel ifadeleri \\( ... \\) veya \\[ ... \\] içine al. LaTeX kullanırken backslash (\\) işaretlerini JSON formatına uygun şekilde çiftleyerek (\\\\) gönder.' : 'Bu ders matematik odaklı değil. LaTeX kullanma; derece ve birim ifadelerini düz metinle yaz. Örnek: 10°C, 200 metre, %25.'}
- Yanıtını SADECE geçerli JSON olarak ver. JSON nesnesi içinde "question", "options" ve "explanation" alanlarında backslash kaçışlarına çok dikkat et.
${strictJson ? '- Soru sayısı eksik olmasın; tam beklenen sayıda soru dön.' : '- JSON bozulmasın; soru sayısı beklenenden azsa eldeki soruları yine geçerli JSON olarak dön.'}

JSON formati:
{
  "intro": "1 cumlelik kisa motivasyon",
  "questions": [
    {
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "..."
    }
  ]
}
''';
  }

  Future<void> _goNext() async {
    if (selectedAnswers[currentIndex] == null) return;

    if (currentIndex < questions.length - 1) {
      setState(() => currentIndex += 1);
      await _persistProgress();
      return;
    }

    await _finishQuiz();
  }

  Future<void> _finishQuiz() async {
    setState(() => isSubmitting = true);

    int totalCorrect = 0;
    for (int i = 0; i < questions.length; i++) {
      if (selectedAnswers[i] == questions[i].correctIndex) {
        totalCorrect++;
      }
    }

    await StorageService.completeSmartQuiz(
      plan: widget.plan,
      correctCount: totalCorrect,
      totalCount: questions.length,
    );

    if (!mounted) return;
    setState(() {
      correctCount = totalCorrect;
      isCompleted = true;
      isSubmitting = false;
    });
  }

  Future<void> _persistProgress() async {
    if (questions.isEmpty || isCompleted) return;
    await ApiService.syncSmartQuizProgress(
      plan: widget.plan,
      progress: SmartQuizProgress(
        planId: widget.plan.id,
        currentIndex: currentIndex,
        correctCount: isCompleted ? correctCount : null,
        isCompleted: isCompleted,
        coachNote: coachNote,
        selectedAnswers: List<int?>.from(selectedAnswers),
        questions: List<SmartQuizQuestion>.from(questions),
        updatedAt: DateTime.now(),
      ),
    );
  }

  Future<bool> _handleBackPress() async {
    if (isSubmitting || isLoading) return false;
    if (questions.isEmpty || isCompleted) return true;

    await _persistProgress();
    if (!mounted) return false;
    final shouldLeave = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Quiz kaydedilsin mi?'),
            content: const Text(
              'Simdi cikarsan quiz kaldigi yerden devam eder. '
              'Istersen kaydedip cikabilir veya quizde kalabilirsin.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Quizde Kal'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Kaydedip Cik'),
              ),
            ],
          ),
        ) ??
        false;
    return shouldLeave;
  }

  Future<void> _selectAnswer(int index) async {
    setState(() => selectedAnswers[currentIndex] = index);
    await _persistProgress();
  }

  String _resultTitle() {
    if (correctCount == questions.length) return 'Konu oturuyor';
    if (correctCount >= 2) return 'Temel iyi, biraz daha pekistir';
    return 'Bu konuya tekrar dokunalim';
  }

  String _resultBody() {
    if (correctCount == questions.length) {
      return 'Harika. Bu konuyu hatirlayabiliyorsun. Sistem bu konuyu simdilik guvenli kabul edecek.';
    }
    if (correctCount >= 2) {
      return 'Fena degil. Bilgi var ama tam oturmamis. Kisa bir tekrar ve 2-3 soru daha iyi gelir.';
    }
    return 'Bu konuda kalicilik henuz olusmamis gorunuyor. Konu anlatimi + kisa soru tekrarini one alalim.';
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        final shouldLeave = await _handleBackPress();
        if (shouldLeave && navigator.mounted) {
          navigator.pop(true);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Akilli Quiz'),
          actions: [
            if (!isLoading && questions.isNotEmpty && !isCompleted)
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Center(
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryColor.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text(
                      'Otomatik kaydediliyor',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        body: isLoading
            ? const Center(child: CircularProgressIndicator())
            : questions.isEmpty
                ? _buildErrorState()
                : SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
                    child: isCompleted ? _buildResultView() : _buildQuizView(),
                  ),
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.quiz_outlined, size: 48, color: Colors.grey),
            const SizedBox(height: 12),
            const Text(
              'Quiz hazirlanamadi',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Birkac saniye sonra tekrar deneyebiliriz.',
              textAlign: TextAlign.center,
            ),
            if (errorMessage != null) ...[
              const SizedBox(height: 10),
              Text(
                errorMessage!,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppTheme.adaptiveGreyLight(context),
                  fontSize: 13,
                ),
              ),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _generateQuiz,
              child: const Text('Tekrar Dene'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuizView() {
    final question = questions[currentIndex];
    final selected = selectedAnswers[currentIndex];
    final answeredCount =
        selectedAnswers.where((answer) => answer != null).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: Theme.of(context).brightness == Brightness.dark
                  ? [const Color(0xFF1A1A2E), const Color(0xFF1E1E30), const Color(0xFF2A2010)]
                  : [const Color(0xFFEEF4FF), const Color(0xFFF8F2FF), const Color(0xFFFFF7ED)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(24),
            border:
                Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.12)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? Colors.white.withValues(alpha: 0.10)
                          : Colors.white,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      widget.plan.riskLabel,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? Colors.white.withValues(alpha: 0.10)
                          : Colors.white.withValues(alpha: 0.92),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${currentIndex + 1}/${questions.length}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                widget.plan.topic,
                style:
                    const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                coachNote ?? widget.plan.reason,
                style: TextStyle(
                  color: AppTheme.adaptiveGrey(context),
                  fontSize: 14,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: _StatMiniCard(
                      icon: Icons.track_changes_rounded,
                      label: 'Alan',
                      value: widget.plan.course,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _StatMiniCard(
                      icon: Icons.bolt_rounded,
                      label: 'Hazirlik',
                      value: '$answeredCount cevap',
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Row(
          children: List.generate(questions.length, (index) {
            final isActive = index == currentIndex;
            final isDone = selectedAnswers[index] != null;
            return Expanded(
              child: Container(
                height: 6,
                margin:
                    EdgeInsets.only(right: index == questions.length - 1 ? 0 : 8),
                decoration: BoxDecoration(
                  color: isDone
                      ? AppTheme.primaryColor
                      : isActive
                          ? AppTheme.primaryColor.withValues(alpha: 0.35)
                          : Theme.of(context).brightness == Brightness.dark
                              ? Colors.grey.shade800
                              : Colors.grey.shade200,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Theme.of(context).shadowColor.withValues(alpha: 0.05),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Soru ${currentIndex + 1}',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primaryColor,
                ),
              ),
              const SizedBox(height: 12),
              MathMarkdownBody(data: question.question),
              const SizedBox(height: 20),
              ...List.generate(question.options.length, (index) {
                final optionLetter = String.fromCharCode(65 + index);
                final isSelected = selected == index;
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: () => _selectAnswer(index),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? AppTheme.primaryColor.withValues(alpha: 0.08)
                            : Theme.of(context).cardColor,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: isSelected
                              ? AppTheme.primaryColor
                              : Theme.of(context).brightness == Brightness.dark
                                  ? Colors.grey.shade700
                                  : Colors.grey.shade300,
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppTheme.primaryColor
                                  : Theme.of(context).brightness == Brightness.dark
                                      ? Colors.grey.shade800
                                      : Colors.grey.shade100,
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Text(
                                optionLetter,
                                style: TextStyle(
                                  color: isSelected
                                      ? Colors.white
                                      : AppTheme.adaptiveGrey(context),
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: MathMarkdownBody(data: question.options[index]),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
        const SizedBox(height: 18),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: selected == null || isSubmitting ? null : _goNext,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.white,
            ),
            child: isSubmitting
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    currentIndex == questions.length - 1
                        ? 'Quizi Bitir'
                        : 'Siradaki Soru',
                  ),
          ),
        ),
        const SizedBox(height: 10),
        Center(
          child: Text(
            'Yanlislikla kapatsan bile quiz kaldigi yerden devam eder.',
            style: TextStyle(
              color: AppTheme.adaptiveGreyLight(context),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildResultView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: Theme.of(context).brightness == Brightness.dark
                  ? (correctCount >= 2
                      ? [const Color(0xFF0A2A1A), const Color(0xFF0F2E1E)]
                      : [const Color(0xFF2A2010), const Color(0xFF2E2518)])
                  : (correctCount >= 2
                      ? [const Color(0xFFECFDF5), const Color(0xFFF0FDF4)]
                      : [const Color(0xFFFFF7ED), const Color(0xFFFFFBEB)]),
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: correctCount >= 2
                  ? Colors.green.withValues(alpha: 0.2)
                  : Colors.orange.withValues(alpha: 0.2),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _resultTitle(),
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: correctCount >= 2
                      ? Colors.green.shade700
                      : Colors.orange.shade800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '$correctCount/${questions.length} dogru',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _resultBody(),
                style: TextStyle(color: AppTheme.adaptiveGrey(context), height: 1.45),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        ...List.generate(questions.length, (index) {
          final question = questions[index];
          final selectedIndex = selectedAnswers[index];
          final isCorrect = selectedIndex == question.correctIndex;
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: isCorrect
                    ? Colors.green.withValues(alpha: 0.25)
                    : Colors.red.withValues(alpha: 0.18),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Soru ${index + 1} • ${isCorrect ? 'Dogru' : 'Tekrar Gerekli'}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color:
                        isCorrect ? Colors.green.shade700 : Colors.red.shade700,
                  ),
                ),
                const SizedBox(height: 8),
                MathMarkdownBody(data: question.question),
                const SizedBox(height: 10),
                Text(
                  'Dogru secenek: ${String.fromCharCode(65 + question.correctIndex)}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                MathMarkdownBody(data: question.explanation),
              ],
            ),
          );
        }),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.white,
            ),
            child: const Text('Ana Sayfaya Don'),
          ),
        ),
      ],
    );
  }
}

class _StatMiniCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _StatMiniCard({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).brightness == Brightness.dark
            ? Colors.white.withValues(alpha: 0.06)
            : Colors.white.withValues(alpha: 0.78),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: AppTheme.primaryColor, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: AppTheme.adaptiveGreyLight(context),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
