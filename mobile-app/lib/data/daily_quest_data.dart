import 'dart:math';
import 'package:yks/models/daily_quest.dart';

/// Günlük görev havuzu — her gün rastgele 3 görev seçilecek
final List<DailyQuest> questPool = [
  // Soru çözme görevleri
  DailyQuest(
    id: 'q_3',
    title: '3 Soru Çöz',
    description: 'Herhangi bir dersten 3 soru çöz',
    type: 'question',
    target: 3,
    xpReward: 30,
    icon: '📝',
  ),
  DailyQuest(
    id: 'q_5',
    title: '5 Soru Çöz',
    description: 'Herhangi bir dersten 5 soru çöz',
    type: 'question',
    target: 5,
    xpReward: 50,
    icon: '🔥',
  ),
  DailyQuest(
    id: 'q_10',
    title: '10 Soru Çöz',
    description: 'Bugün toplam 10 soru çöz',
    type: 'question',
    target: 10,
    xpReward: 100,
    icon: '💪',
  ),

  // Konu anlatımı görevleri
  DailyQuest(
    id: 'e_1',
    title: 'Konu Öğren',
    description: 'Bir konu anlatımı oku',
    type: 'explanation',
    target: 1,
    xpReward: 25,
    icon: '📖',
  ),
  DailyQuest(
    id: 'e_3',
    title: '3 Konu İncele',
    description: '3 farklı konu anlatımı oku',
    type: 'explanation',
    target: 3,
    xpReward: 60,
    icon: '🧠',
  ),

  // Streak görevleri
  DailyQuest(
    id: 's_keep',
    title: 'Seriyi Koru',
    description: 'Bugün uygulamayı açarak serini koru',
    type: 'streak',
    target: 1,
    xpReward: 20,
    icon: '🔥',
  ),

  // XP görevleri
  DailyQuest(
    id: 'xp_50',
    title: '50 XP Kazan',
    description: 'Bugün toplam 50 XP kazan',
    type: 'xp',
    target: 50,
    xpReward: 30,
    icon: '⭐',
  ),
  DailyQuest(
    id: 'xp_100',
    title: '100 XP Kazan',
    description: 'Bugün toplam 100 XP kazan',
    type: 'xp',
    target: 100,
    xpReward: 50,
    icon: '🌟',
  ),
];

/// Her gün için rastgele 3 görev seçer (günün seed'i ile tutarlı)
List<DailyQuest> generateDailyQuests() {
  final today = DateTime.now();
  final seed = today.year * 10000 + today.month * 100 + today.day;
  final random = Random(seed);

  // Havuzdan karıştır ve 3 tane seç
  final shuffled = List<DailyQuest>.from(questPool)..shuffle(random);
  return shuffled
      .take(3)
      .map((q) => DailyQuest(
            id: q.id,
            title: q.title,
            description: q.description,
            type: q.type,
            target: q.target,
            progress: 0,
            xpReward: q.xpReward,
            icon: q.icon,
          ))
      .toList();
}
