enum MessageSender { user, assistant }

class Message {
  final String id;
  final String text;
  final MessageSender sender;
  final String timestamp;
  final String? imageUri;
  final String? originalQuestionText;
  final String? originalQuestionImage;
  final String? course;
  final bool isEducational;
  bool hasRequestedDetails;
  final bool cacheRequiresApproval;
  final bool cacheAutoSaved;
  final int? cacheRecordId;
  final String? cacheSource;
  final double? cacheSimilarity;
  final String? traditionalHash;
  final String? imageHash;
  final String? semanticHash;
  final String? cacheVariant;
  final String? cacheAnswer;
  bool cacheApproved;

  Message({
    required this.id,
    required this.text,
    required this.sender,
    required this.timestamp,
    this.imageUri,
    this.originalQuestionText,
    this.originalQuestionImage,
    this.course,
    this.isEducational = false,
    this.hasRequestedDetails = false,
    this.cacheRequiresApproval = false,
    this.cacheAutoSaved = false,
    this.cacheRecordId,
    this.cacheSource,
    this.cacheSimilarity,
    this.traditionalHash,
    this.imageHash,
    this.semanticHash,
    this.cacheVariant,
    this.cacheAnswer,
    this.cacheApproved = false,
  });

  bool get hasCacheBinding =>
      cacheRecordId != null ||
      traditionalHash != null ||
      imageHash != null ||
      semanticHash != null;

  Map<String, dynamic> toJson() => {
        'id': id,
        'text': text,
        'sender': sender == MessageSender.user ? 'user' : 'assistant',
        'timestamp': timestamp,
        'imageUri': imageUri,
        'originalQuestionText': originalQuestionText,
        'originalQuestionImage': originalQuestionImage,
        'course': course,
        'isEducational': isEducational,
        'hasRequestedDetails': hasRequestedDetails,
        'cacheRequiresApproval': cacheRequiresApproval,
        'cacheAutoSaved': cacheAutoSaved,
        'cacheRecordId': cacheRecordId,
        'cacheSource': cacheSource,
        'cacheSimilarity': cacheSimilarity,
        'traditionalHash': traditionalHash,
        'imageHash': imageHash,
        'semanticHash': semanticHash,
        'cacheVariant': cacheVariant,
        'cacheAnswer': cacheAnswer,
        'cacheApproved': cacheApproved,
      };

  factory Message.fromJson(Map<String, dynamic> json) => Message(
        id: json['id'],
        text: json['text'],
        sender: json['sender'] == 'user'
            ? MessageSender.user
            : MessageSender.assistant,
        timestamp: json['timestamp'],
        imageUri: json['imageUri'],
        originalQuestionText: json['originalQuestionText'],
        originalQuestionImage: json['originalQuestionImage'],
        course: json['course'],
        isEducational: json['isEducational'] ?? false,
        hasRequestedDetails: json['hasRequestedDetails'] ?? false,
        cacheRequiresApproval: json['cacheRequiresApproval'] ?? false,
        cacheAutoSaved: json['cacheAutoSaved'] ?? false,
        cacheRecordId: json['cacheRecordId'],
        cacheSource: json['cacheSource'],
        cacheSimilarity: (json['cacheSimilarity'] as num?)?.toDouble(),
        traditionalHash: json['traditionalHash'],
        imageHash: json['imageHash'],
        semanticHash: json['semanticHash'],
        cacheVariant: json['cacheVariant'],
        cacheAnswer: json['cacheAnswer'],
        cacheApproved: json['cacheApproved'] ?? false,
      );
}
