import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:yks/services/storage_service.dart';
import 'package:yks/models/study_note.dart';
import 'package:yks/models/favorite_question.dart';
import 'package:yks/theme/app_theme.dart';
import 'package:yks/widgets/math_markdown_body.dart';

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key});

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<StudyNote> notes = [];
  List<FavoriteQuestion> favorites = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      notes = StorageService.getNotes();
      favorites = StorageService.getFavoriteQuestions();
    });

    await Future.wait([
      StorageService.refreshNotesFromServer(),
      StorageService.refreshFavoriteQuestionsFromServer(),
    ]);

    if (!mounted) return;
    setState(() {
      notes = StorageService.getNotes();
      favorites = StorageService.getFavoriteQuestions();
    });
  }

  Future<void> _handleRefresh() async {
    await _loadData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Kütüphanem"),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppTheme.primaryColor,
          labelColor: AppTheme.primaryColor,
          tabs: const [
            Tab(text: "Notlarım", icon: Icon(Icons.note_alt_outlined)),
            Tab(text: "Favori Sorular", icon: Icon(Icons.star_outline)),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildNotesList(),
          _buildFavoritesList(),
        ],
      ),
    );
  }

  Widget _buildNotesList() {
    if (notes.isEmpty) {
      return RefreshIndicator(
        onRefresh: _handleRefresh,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: SizedBox(
            height: MediaQuery.of(context).size.height - 200,
            child: _buildEmptyState(
                "Henüz hiç notun yok. Konu anlatımından not alabilirsin."),
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _handleRefresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        itemCount: notes.length,
        itemBuilder: (context, index) {
          final note = notes[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: ExpansionTile(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
              title: Text(note.course,
                  style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: AppTheme.primaryColor)),
              subtitle: Text(note.questionText ?? "Genel Konu Anlatımı Notu",
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Colors.grey)),
              trailing: IconButton(
                icon: const Icon(Icons.delete_outline,
                    color: Colors.grey, size: 20),
                onPressed: () async {
                  await StorageService.deleteNote(note.id);
                  _loadData();
                },
              ),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (note.questionText != null) ...[
                        const Text("Soru / Bağlam:",
                            style: TextStyle(
                                fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 4),
                        SelectionArea(
                          child: MathMarkdownBody(
                            data: note.questionText!,
                            styleSheet: MarkdownStyleSheet(
                                p: const TextStyle(fontSize: 14)),
                          ),
                        ),
                        const Divider(height: 20),
                      ],
                      const Text("Not:",
                          style: TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 13)),
                      const SizedBox(height: 4),
                      SelectionArea(
                        child: MathMarkdownBody(
                          data: note.content,
                          styleSheet: MarkdownStyleSheet(
                              p: const TextStyle(fontSize: 14)),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildFavoritesList() {
    if (favorites.isEmpty) {
      return RefreshIndicator(
        onRefresh: _handleRefresh,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: SizedBox(
            height: MediaQuery.of(context).size.height - 200,
            child: _buildEmptyState("Henüz hiç favori sorunun yok."),
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _handleRefresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        itemCount: favorites.length,
        itemBuilder: (context, index) {
          final fav = favorites[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: ExpansionTile(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
              title: Text(fav.course ?? "Genel",
                  style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: AppTheme.primaryColor)),
              subtitle: Text(fav.questionText ?? "Görsel Soru",
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12)),
              trailing: IconButton(
                icon: const Icon(Icons.delete_outline,
                    color: Colors.grey, size: 20),
                onPressed: () async {
                  await StorageService.deleteFavoriteQuestion(fav.id);
                  _loadData(); // Listeyi yenile
                },
              ),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (fav.questionText != null) ...[
                        const Text("Soru:",
                            style: TextStyle(
                                fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 4),
                        SelectionArea(
                          child: MathMarkdownBody(
                            data: fav.questionText!,
                            styleSheet: MarkdownStyleSheet(
                                p: const TextStyle(fontSize: 14)),
                          ),
                        ),
                        const Divider(height: 20),
                      ],
                      const Text("Cevap:",
                          style: TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 13)),
                      const SizedBox(height: 4),
                      SelectionArea(
                        child: MathMarkdownBody(
                          data: fav.answerText,
                          styleSheet: MarkdownStyleSheet(
                              p: const TextStyle(fontSize: 14)),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text("📚", style: TextStyle(fontSize: 60)),
            const SizedBox(height: 20),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
