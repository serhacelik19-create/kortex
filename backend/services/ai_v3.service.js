require('dotenv').config();
const { OpenAI } = require('openai');
const { GoogleGenAI } = require('@google/genai');
const MATH_SERVICE_URL = process.env.MATH_SERVICE_URL || 'http://127.0.0.1:8000';
const crypto = require('crypto');
const imghash = require('imghash');
const axios = require('axios');

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite-preview';
const DEFAULT_CHAT_MODEL = process.env.AI_CHAT_MODEL || GEMINI_CHAT_MODEL;
const DEFAULT_CHAT_TEMPERATURE = Number.parseFloat(process.env.AI_CHAT_TEMPERATURE || '0.15');
const DEFAULT_CHAT_TOP_P = Number.parseFloat(process.env.AI_CHAT_TOP_P || '0.85');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

const openRouterClient = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: OPENROUTER_API_KEY,
});
const googleGenAiClient = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const clampNumber = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const isGeminiModel = (modelName = '') =>
    String(modelName || '').trim().toLocaleLowerCase('en-US').includes('gemini');

const resolveModelProfile = (modelName = DEFAULT_CHAT_MODEL) => {
    return {
        family: 'generic',
        temperature: DEFAULT_CHAT_TEMPERATURE,
        topP: DEFAULT_CHAT_TOP_P,
        supportsToolCalling: true,
    };
};

const mapToolsToOpenAiFormat = (tools = []) => {
    const normalizeTypes = (obj) => {
        if (Array.isArray(obj)) return obj.map(normalizeTypes);
        if (obj !== null && typeof obj === 'object') {
            const newObj = {};
            for (const key in obj) {
                if (key === 'type' && typeof obj[key] === 'string') {
                    newObj[key] = obj[key].toLowerCase();
                } else {
                    newObj[key] = normalizeTypes(obj[key]);
                }
            }
            return newObj;
        }
        return obj;
    };

    const functionDeclarations = [];
    for (const group of tools || []) {
        for (const declaration of group?.functionDeclarations || []) {
            functionDeclarations.push({
                type: 'function',
                function: {
                    name: declaration.name,
                    description: declaration.description,
                    parameters: normalizeTypes(declaration.parameters),
                },
            });
        }
    }
    return functionDeclarations;
};

const stringifyToolResult = (value) => {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value ?? {});
    } catch (_error) {
        return String(value ?? '');
    }
};

const extractTextParts = (parts = []) =>
    (parts || [])
        .map((part) => part?.text)
        .filter(Boolean)
        .join('\n')
        .trim();

const shouldDisableToolsForQuestion = (scenario = 'generic_math', questionText = '') => {
    const text = normalizeText(questionText);
    if (!text) return false;

    if (scenario === 'combinatorics') return true;
    if (/binom|acilim|katsayi|diskriminant/.test(text)) return true;
    if (/teget dogrusu|teget dogrulari|teget/.test(text) && /g x|g x|g\(|gprime|g /.test(text)) return true;
    if (/bas katsayisi|polinom fonksiyonu|derecesi n/.test(text) && /carpimi kactir|çarpımı kaçtır|kactir/.test(text)) return true;
    if (/abcabc|asal sayi|asal sayilar/.test(text) && /toplami|carpimlari|çarpımları/.test(text)) return true;

    return false;
};

const buildOpenAiMessagesFromContents = (contentsInput = []) => {
    const contents = typeof contentsInput === 'string'
        ? [{ role: 'user', parts: [{ text: contentsInput }] }]
        : Array.isArray(contentsInput)
            ? contentsInput
            : [];

    const messages = [];
    const toolCallIdsByName = new Map();

    for (const msg of contents) {
        const role = msg?.role === 'model' ? 'assistant' : 'user';
        const parts = Array.isArray(msg?.parts) ? msg.parts : [];
        const textParts = parts.filter((part) => part?.text);
        const imageParts = parts.filter((part) => part?.inlineData);
        const functionCallParts = parts.filter((part) => part?.functionCall);
        const functionResponseParts = parts.filter((part) => part?.functionResponse);

        if (functionResponseParts.length > 0) {
            for (const part of functionResponseParts) {
                const name = part.functionResponse?.name || 'tool';
                const queue = toolCallIdsByName.get(name) || [];
                const toolCallId = queue.shift() || `toolcall_${name}_${messages.length}`;
                toolCallIdsByName.set(name, queue);
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    content: stringifyToolResult(part.functionResponse?.response),
                });
            }
            continue;
        }

        if (functionCallParts.length > 0) {
            const toolCalls = functionCallParts.map((part, index) => {
                const name = part.functionCall?.name || `tool_${index}`;
                const id = part.functionCall?.id || `toolcall_${name}_${messages.length}_${index}`;
                const queue = toolCallIdsByName.get(name) || [];
                queue.push(id);
                toolCallIdsByName.set(name, queue);
                return {
                    id,
                    type: 'function',
                    function: {
                        name,
                        arguments: JSON.stringify(part.functionCall?.args || {}),
                    },
                };
            });

            messages.push({
                role: 'assistant',
                content: extractTextParts(textParts) || '',
                tool_calls: toolCalls,
            });
            continue;
        }

        if (imageParts.length > 0) {
            const content = [];
            for (const part of textParts) {
                content.push({ type: 'text', text: part.text });
            }
            for (const part of imageParts) {
                content.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                    },
                });
            }
            messages.push({ role, content });
            continue;
        }

        messages.push({
            role,
            content: extractTextParts(textParts),
        });
    }

    return messages.filter((message) => {
        if (message.role === 'tool') return true;
        if (Array.isArray(message.content)) return message.content.length > 0;
        if (message.tool_calls) return true;
        return typeof message.content === 'string' && message.content.trim().length > 0;
    });
};

const parseAssistantText = (message = {}) => {
    if (typeof message?.content === 'string') return message.content;
    if (Array.isArray(message?.content)) {
        return message.content
            .filter((item) => item?.type === 'text' && item?.text)
            .map((item) => item.text)
            .join('\n')
            .trim();
    }
    return '';
};

const buildGeminiConfig = (config = {}, profile = {}) => {
    const geminiConfig = {};

    if (config?.systemInstruction) {
        geminiConfig.systemInstruction = String(config.systemInstruction);
    }

    if (config?.temperature !== undefined || profile?.temperature !== undefined) {
        geminiConfig.temperature = clampNumber(
            config?.temperature !== undefined ? Number(config.temperature) : profile.temperature,
            profile.temperature
        );
    }

    if (config?.topP !== undefined || profile?.topP !== undefined) {
        geminiConfig.topP = clampNumber(
            config?.topP !== undefined ? Number(config.topP) : profile.topP,
            profile.topP
        );
    }

    if (config?.maxOutputTokens !== undefined) {
        geminiConfig.maxOutputTokens = Number(config.maxOutputTokens);
    }

    if (Array.isArray(config?.tools) && config.tools.length > 0) {
        geminiConfig.tools = config.tools;
    }

    const course = typeof config?.course === 'string' ? config.course.toLocaleLowerCase('tr-TR') : '';
    const isMathOrGeometry = course.includes('matematik') || course.includes('geometri');

    // Thinking modunu sadece kullanıcı bilinçli olarak 'HIGH' isterse veya model profili gerektirirse aç
    /*
    const thinkingLevel = (config?.thinkingLevel || '').toUpperCase();
    if (thinkingLevel === 'HIGH') {
        geminiConfig.thinkingConfig = { thinkingLevel: 'HIGH' };
    } else {
        // Matematik diye otomatik HIGH yapma, bütçeyi koru
        geminiConfig.thinkingConfig = { thinkingLevel: 'MINIMAL' };
    }
    */

    return Object.keys(geminiConfig).length > 0 ? geminiConfig : undefined;
};

const normalizeGeminiFunctionCalls = (response = {}) => {
    const functionCalls = Array.isArray(response?.functionCalls)
        ? response.functionCalls
        : [];

    return functionCalls.map((call, index) => ({
        id: call?.id || `toolcall_${call?.name || 'tool'}_${index}`,
        name: call?.name || `tool_${index}`,
        args: call?.args && typeof call.args === 'object' ? call.args : {},
    }));
};

const buildNormalizedGeminiResponse = (response = {}) => {
    const text = typeof response?.text === 'string' ? response.text : '';
    const functionCalls = normalizeGeminiFunctionCalls(response);
    const candidateParts = [];

    if (text) candidateParts.push({ text });
    for (const call of functionCalls) {
        candidateParts.push({
            functionCall: {
                id: call.id,
                name: call.name,
                args: call.args,
            },
        });
    }

    const usage = (response?.usageMetadata) || (response?.response?.usageMetadata) || {};
    const normalizedCandidates = Array.isArray(response?.candidates) && response.candidates.length > 0
        ? response.candidates
        : [{ content: { parts: candidateParts } }];

    return {
        text,
        functionCalls,
        candidates: normalizedCandidates,
        usageMetadata: {
            promptTokenCount: usage?.promptTokenCount || 0,
            candidatesTokenCount: usage?.candidatesTokenCount || 0,
            totalTokenCount: usage?.totalTokenCount || 0,
        },
    };
};

const mapThinkingLevelToReasoning = (thinkingLevel) => {
    const normalized = String(thinkingLevel || '').trim().toUpperCase();

    // Eğer seviye kapalıysa (NONE/OFF/DISABLED) veya belirtilmemişse düşünmeyi tamamen kapat
    if (!normalized || ['NONE', 'OFF', 'DISABLED'].includes(normalized)) {
        return { enabled: false };
    }

    // Pozitif seviyeler için sadece effort belirle (OpenRouter standardı)
    if (normalized === 'LOW') return { effort: 'low', enabled: true };
    if (normalized === 'MEDIUM') return { effort: 'medium', enabled: true };
    if (normalized === 'HIGH') return { effort: 'high', enabled: true };

    return { enabled: false }; // Varsayılan olarak kapalı tut
};

const ai = {
    models: {
        generateContent: async (opts) => {
            const model = opts?.model || DEFAULT_CHAT_MODEL;
            const profile = resolveModelProfile(model);
            if (isGeminiModel(model)) {
                if (!googleGenAiClient) {
                    throw new Error('Gemini modeli icin GEMINI_API_KEY veya GOOGLE_API_KEY tanimli olmali.');
                }

                const response = await googleGenAiClient.models.generateContent({
                    model,
                    contents: opts?.contents || [],
                    config: buildGeminiConfig(opts?.config, profile),
                });

                return buildNormalizedGeminiResponse(response);
            }

            const messages = [];
            if (opts?.config?.systemInstruction) {
                messages.push({ role: 'system', content: String(opts.config.systemInstruction) });
            }
            messages.push(...buildOpenAiMessagesFromContents(opts?.contents || []));

            console.log(`\n[AI_V3] OpenRouter Çağrısı Başlatılıyor: ${model}`);
            const payload = {
                model,
                messages,
                temperature: clampNumber(
                    opts?.config?.temperature !== undefined ? Number(opts.config.temperature) : profile.temperature,
                    profile.temperature
                ),
                top_p: clampNumber(
                    opts?.config?.topP !== undefined ? Number(opts.config.topP) : profile.topP,
                    profile.topP
                ),
                frequency_penalty: 0.7,
                presence_penalty: 0.5,
            };

            const openAiTools = mapToolsToOpenAiFormat(opts?.config?.tools || []);
            if (profile.supportsToolCalling && openAiTools.length > 0) {
                payload.tools = openAiTools;
                payload.tool_choice = 'auto';
                payload.parallel_tool_calls = false;
            }

            payload.max_tokens = opts?.config?.maxOutputTokens !== undefined
                ? Number(opts.config.maxOutputTokens)
                : 4000;

            const reasoning = opts?.config?.reasoning && typeof opts.config.reasoning === 'object'
                ? opts.config.reasoning
                : mapThinkingLevelToReasoning(opts?.config?.thinkingLevel);

            if (reasoning) {
                payload.reasoning = reasoning;
            }

            console.log(`[AI_V3] OpenRouter Yanıtı Geldi.`);
            const res = await openRouterClient.chat.completions.create(payload);
            console.log(`[AI_V3] Yanıt İşleniyor...`);
            const choice = res?.choices?.[0] || {};
            const message = choice?.message || {};
            const text = parseAssistantText(message);
            const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
            const functionCalls = toolCalls.map((call, index) => {
                let parsedArgs = {};
                try {
                    parsedArgs = JSON.parse(call?.function?.arguments || '{}');
                } catch (_error) {
                    parsedArgs = {};
                }
                return {
                    id: call?.id || `toolcall_${index}`,
                    name: call?.function?.name || `tool_${index}`,
                    args: parsedArgs,
                };
            });

            const candidateParts = [];
            if (text) candidateParts.push({ text });
            for (const call of functionCalls) {
                candidateParts.push({
                    functionCall: {
                        id: call.id,
                        name: call.name,
                        args: call.args,
                    },
                });
            }

            const usage = res?.usageMetadata || res?.usage || {};
            const pTokens = usage?.prompt_tokens || usage?.promptTokenCount || 0;
            const cTokens = usage?.completion_tokens || usage?.candidatesTokenCount || 0;
            const tTokens = usage?.total_tokens || usage?.totalTokenCount || 0;

            console.log(`\n[TOKEN KULLANIMI] 📥 Giriş: ${pTokens} | 📤 Çıkış: ${cTokens} | 📊 Toplam: ${tTokens} (Görsel: ~258-768 token)`);

            return {
                text,
                functionCalls,
                candidates: [
                    {
                        content: {
                            parts: candidateParts,
                        },
                    },
                ],
                usageMetadata: {
                    promptTokenCount: usage?.prompt_tokens || usage?.promptTokenCount || 0,
                    candidatesTokenCount: usage?.completion_tokens || usage?.candidatesTokenCount || 0,
                    totalTokenCount: usage?.total_tokens || usage?.totalTokenCount || 0,
                },
            };
        }
    }
};

const batchIntroCache = new Map();
const BATCH_INTRO_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const normalizeText = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const looksLikeCalculationPrompt = (questionText = '', hasImage = false) => {
    if (hasImage) return true;
    const normalized = normalizeText(questionText);
    if (!normalized) return false;

    const keywords = [
        'kactir', 'kac', 'hesapla', 'bul', 'coz', 'denklem', 'turev', 'integral', 'limit',
        'fonksiyon', 'esitsizlik', 'oran', 'grafik', 'kok', 'logaritma', 'trigonometri',
        'ivme', 'hiz', 'kuvvet', 'enerji', 'tepkime', 'mol', 'derisim', 'asit', 'baz',
        'alani', 'alan', 'uzunlugu', 'uzunluk'
    ];

    return keywords.some((keyword) => normalized.includes(keyword)) ||
        /[\d=+\-/*^%()]/.test(questionText || '');
};

const shouldUseHeavyMathFlow = (course = '', questionText = '', base64Image = null) => {
    // EĞER MOTOR KULLANILMIYORSA HER ŞEYİ BYPASS ET
    return false;
};

const ENABLE_SCENARIO_MATH_PROMPTS = /^true$/i.test(String(process.env.ENABLE_SCENARIO_MATH_PROMPTS || 'true'));
const TEXT_ONLY_MATH_HISTORY_LIMIT = 4;
const COMPACT_TOOL_HISTORY_TURNS = 4;
const APPROX_TOKEN_DIVISOR = 3.9;
const MAX_TOOL_ITERATIONS_COMPACT = 2;
const MAX_TOOL_ITERATIONS_FULL = 2;

// ──────────────────────────────────────────────────────────────────────────────
// CASCADE PERCEPTION: Gemini ile görsel veri çıkarma
// ──────────────────────────────────────────────────────────────────────────────
const PERCEPTION_MODEL = process.env.PERCEPTION_MODEL || GEMINI_CHAT_MODEL;

const EXTRACTION_PROMPT = `
Görseldeki matematik/geometri sorusunu oku ve SADECE aşağıdaki kısa formatta veri çıkar:

Soru metni:
- Soruyu eksiksiz yaz.

Şıklar:
- Yalnız varsa A) ... E) ... biçiminde yaz.

Verilenler:
- Sayısal değerler, değişkenler, fonksiyonlar, koşullar.

Grafik:
- Yalnız grafik varsa kökler, tepe/dip, işaret aralıkları, eksen kesişimleri.

Geometri:
- Yalnız geometri varsa şekil tipi, köşeler, kenarlar, açılar, eşitlik/diklik/paralellik, gölgeli bölge, bilinmeyenler.

Kurallar:
- Grafik yoksa Grafik bölümü yazma.
- Geometri yoksa Geometri bölümü yazma.
- Özet, yorum, çözüm veya tekrar eden açıklama yazma.
`;

// ANTI_LOOP_DIRECTIVE kaldırıldı — Gemini bu davranışı doğal olarak sergiliyor.

const compressExtractionText = (rawText = "") => {
    let text = String(rawText || "").trim();
    if (!text) return "";

    text = text
        .replace(/\r/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\n+---+\n+/g, "\n\n")
        .replace(/^\s*#{1,6}\s*Özet:?[\s\S]*$/im, "")
        .replace(/^\s*\*\*Özet:?\*\*[\s\S]*$/im, "")
        .trim();

    const sections = text.split(/\n(?=(?:Soru metni|Şıklar|Verilenler|Grafik|Geometri)\s*:)/i);
    const keptSections = [];

    for (const section of sections) {
        const normalizedSection = section.trim();
        if (!normalizedSection) continue;
        if (
            /^(Grafik|Geometri)\s*:/i.test(normalizedSection)
            && /(bulunmamaktad[ıi]r|yoktur|boş bırakılmıştır|bos birakilmistir|herhangi bir .* bulunmamaktadır)/i.test(normalizedSection)
        ) {
            continue;
        }
        keptSections.push(normalizedSection);
    }

    return keptSections.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
};

const buildCompactSystemInstruction = (systemInstruction = "", scenario = "generic_math") => {
    if (!systemInstruction || !String(systemInstruction).trim()) return "";
    return "AYT Matematik baglamini koru. Sonucu en sonda net belirt. Coktan secmeli ise sikki yaz.";
};

const buildToolErrorHint = (toolResult = {}) => {
    if (!toolResult || toolResult.status !== "error") return null;
    return toolResult.hint || toolResult.message || "Payload formatini duzelt ve farkli bir cagrı dene.";
};

const getMaxToolIterations = (flowPlan = {}) =>
    (flowPlan.forceFullFlow || flowPlan.scenario === 'geometry' || flowPlan.mixed)
        ? MAX_TOOL_ITERATIONS_FULL
        : MAX_TOOL_ITERATIONS_COMPACT;

/**
 * CASCADE PERCEPTION: Görsel sorularda önce hafif bir vision model ile veri çıkarır.
 * Başarısız olursa null döndürür (fallback için).
 */
const performVisualExtraction = async (course, base64Image) => {
    try {
        console.log(`[CASCADE] 📷 Perception aşaması başlıyor (${PERCEPTION_MODEL})...`);
        const result = await askAiSimple(
            course,
            EXTRACTION_PROMPT,
            [],
            "Sen uzman bir veri çıkarıcı modelsin. Sadece görseldeki matematiksel verileri metne dök.",
            base64Image,
            PERCEPTION_MODEL,
            { returnFullResponse: true }
        );
        const extractedText = compressExtractionText(result?.text || "");
        if (!extractedText || extractedText.length < 20) {
            console.log(`[CASCADE] ⚠️ Perception yetersiz veri döndürdü, fallback aktif.`);
            return null;
        }
        console.log(`[CASCADE] ✅ Perception tamamlandı (${extractedText.length} karakter).`);
        return {
            extractedText,
            usageMetadata: result?.usageMetadata || {},
        };
    } catch (err) {
        console.error(`[CASCADE] ❌ Perception hatası, monolitik fallback:`, err.message);
        return null;
    }
};

const hasRetrySignal = (questionText = '', history = []) => {
    const combined = [
        questionText,
        ...history.map((item) => item?.content || item?.parts || ''),
    ].join(' ');
    const text = String(combined || '').toLocaleLowerCase('tr-TR');
    return /hatali|yanlis|yeniden coz|yeniden çöz|baska yontem|başka yöntem|tekrar dene|tekrar coz|tekrar çöz/.test(text);
};

const classifyEquationSafety = (questionText = '') => {
    const raw = String(questionText || '');
    const text = normalizeText(questionText);

    const riskyPatterns = [
        /sqrt\s*\(/,
        /\|/,
        /\babs\s*\(/,
        /\blog\s*\(/,
        /\bln\s*\(/,
        /koklu|karekök|karekok/,
        /mutlak/,
        /logaritma/,
        /tanim kumesi|tanim disi|tanimsiz/,
        /dogrula|sagliyor mu|sağlıyor mu|kontrol et/,
        /payda|kesirli denklem/,
        /esitsizlik|eşitsizlik/,
    ];

    if (riskyPatterns.some((pattern) => pattern.test(raw) || pattern.test(text))) {
        return 'risky';
    }

    return 'simple';
};

const isAreaBetweenCurvesQuestion = (questionText = '') => {
    const text = String(questionText || '').toLocaleLowerCase('tr-TR');
    const mentionsArea = /alan|arasında kalan alan|arasinda kalan alan|egriler arasindaki alan|egri.*alan/.test(text);
    const mentionsCurveLikeObjects = /eğri|egri|grafik|fonksiyon|parabol|doğru|dogru|y\s*=/.test(text);
    return mentionsArea && mentionsCurveLikeObjects;
};

const hasEnumeratedMathSubtasks = (questionText = '') => {
    const text = String(questionText || '');
    const markers = text.match(/(?:^|\n|\s)(\d+)\./g) || [];
    return markers.length >= 2;
};

const isPolynomialConstructionWordProblem = (questionText = '') => {
    const text = String(questionText || '').toLocaleLowerCase('tr-TR');
    const mentionsFunction = /fonksiyon/.test(text);
    const mentionsPolynomial = /polinom/.test(text);
    const asksConstruction = /fonksiyonunu bulunuz|fonksiyonunu bulun|f\(x\).*(bulunuz|bulun)/.test(text);
    const asksExtrema = /yerel|ekstrem|maksimum|minimum/.test(text);
    const asksArea = /alan/.test(text);
    return mentionsFunction && mentionsPolynomial && (asksConstruction || (hasEnumeratedMathSubtasks(questionText) && asksExtrema && asksArea));
};

const buildMathPlannerDirective = (questionText = '') => {
    if (isPolynomialConstructionWordProblem(questionText) && hasEnumeratedMathSubtasks(questionText)) {
        return `
[PLANLAYICI NOTU - ÇOK PARÇALI SÖZEL SORU]
- Bu soru tek adımda değil, sırayla çözülmeli.
- Önce fonksiyonun katsayılarını explicit denklemler kurarak bul.
- f_0, f_1, f_derivative_1 gibi placeholder semboller kullanma.
- Koşulları açık yaz: örn. f(0)=8 ise a*(0)**3 + b*(0)**2 + c*(0) + d - 8.
- Fonksiyon bulunduktan sonra ayrı adımda find_extrema çağır.
- Alanı en sonda, explicit fonksiyon bilindikten sonra integrate veya area_between_curves ile hesapla.
`;
    }

    return '';
};

const isCircleLineIntersectionQuestion = (questionText = '') => {
    const text = String(questionText || '').toLocaleLowerCase('tr-TR');
    const mentionsCircle = /cember|çember|daire|x\^2\s*\+\s*y\^2/.test(text);
    const mentionsLine = /doğru|dogru|y\s*=|x\s*=/.test(text);
    const mentionsIntersection = /kesişim|kesisim|intersection|ortak nokta/.test(text);
    return mentionsCircle && mentionsLine && mentionsIntersection;
};

const buildScenarioScoreMap = (questionText = '') => {
    const text = String(questionText || '').toLocaleLowerCase('tr-TR');
    const scoreMap = {
        limit: 0,
        equation: 0,
        system: 0,
        derivative_extrema: 0,
        trig: 0,
        integral: 0,
        area_between_curves: 0,
        coordinate_geometry: 0,
        geometry: 0,
        matrix: 0,
        combinatorics: 0,
        generic_math: 0,
    };

    // Klasik geometri tespiti (üçgen, çember, alan, açı, kenar soruları)
    if (/üçgen|ucgen|triangle|dörtgen|dortgen|yamuk|paralelkenar|eşkenar|ikizkenar|ikiz kenar|dik üçgen|dik ucgen/.test(text)) scoreMap.geometry += 5;
    if (/çember|cember|daire|yarıçap|yaricap|teğet|teget|kiriş|kiris|yay|merkez açı|çevre açı/.test(text)) scoreMap.geometry += 5;
    if (/açı|aci|kenar|kenarı|köşegen|kosegen|yükseklik|yukseklik|medyan|açıortay|aciortay/.test(text)) scoreMap.geometry += 3;
    if (/benzerlik|benzer üçgen|eşlik|eslik|kosinüs teoremi|sinüs teoremi|pisagor|öklid/.test(text)) scoreMap.geometry += 4;
    if (/alan|çevre|cevre|hacim|katı cisim|kati cisim|prizma|piramit|silindir|koni|küre/.test(text) && !/fonksiyon|integral|eğri/.test(text)) scoreMap.geometry += 3;

    if (/limit|x\s*(?:->|→)|yakla/.test(text)) scoreMap.limit += 4;
    if (/denklem sistemi|bilinmeyen|ve .*=/i.test(questionText) || (questionText.match(/=/g) || []).length >= 2) scoreMap.system += 4;
    if (/(?:\bsin\b|\bcos\b|\btan\b|\bcot\b|\bsec\b|\bcsc\b|sin\(|cos\(|tan\(|cot\(|sec\(|csc\(|trig|trigonometri|\bpi\b|π)/.test(text)) scoreMap.trig += 4;
    if (/matris|determinant|rref|rank|ozdeger|özdeğer|eigen|inverse/.test(text)) scoreMap.matrix += 4;
    if (/kombinasyon|permütasyon|permutasyon|komite|faktöriyel|faktoriyel|arrangement|factorial|choose/.test(text)) scoreMap.combinatorics += 4;
    if (/turev|türev|f'\(x\)|kritik nokta|ekstrem|maksimum|minimum|yerel/.test(text)) scoreMap.derivative_extrema += 4;
    if (/integral|∫|belirli integral|belirsiz integral|integralini/.test(text) && !isAreaBetweenCurvesQuestion(questionText)) scoreMap.integral += 5;
    if (/\([-\d\s]+,\s*[-\d\s]+\)/.test(questionText) || /dogru|doğru|nokta|orta nokta|uzaklik|uzaklık|cember|çember/.test(text)) scoreMap.coordinate_geometry += 3;
    if (isAreaBetweenCurvesQuestion(questionText)) scoreMap.area_between_curves += 5;
    if (isCircleLineIntersectionQuestion(questionText)) {
        scoreMap.coordinate_geometry += 5;
        scoreMap.system = Math.max(0, scoreMap.system - 2);
    }
    if (/coz|çöz|denklem|esitsizlik|eşitsizlik|kok|kök|log|sqrt|mutlak|abs\(/.test(text)) scoreMap.equation += 2;
    if (/alan|asimptot|eğri|egri|grafik|fonksiyon|hesapla|bul/.test(text) && scoreMap.integral === 0) scoreMap.generic_math += 1;
    if ((questionText.match(/=/g) || []).length === 1 && !/denklem sistemi|bilinmeyen/.test(text)) scoreMap.equation += 2;

    if (scoreMap.coordinate_geometry > 0 && /limit|turev|türev|integral|alan/.test(text)) {
        scoreMap.coordinate_geometry -= 1;
    }

    if (scoreMap.system > 0) scoreMap.equation += 1;

    return scoreMap;
};

const classifyMathScenario = (course = '', questionText = '', history = [], base64Image = null) => {
    if (base64Image) {
        return {
            scenario: 'visual_or_retry',
            confidence: 1,
            needsGeometryValidation: true,
            forceFullFlow: true,
            mixed: false,
            reason: 'image',
            equationMode: null,
        };
    }

    if (hasRetrySignal(questionText, history)) {
        return {
            scenario: 'visual_or_retry',
            confidence: 1,
            needsGeometryValidation: false,
            forceFullFlow: true,
            mixed: false,
            reason: 'retry',
            equationMode: null,
        };
    }

    if (hasEnumeratedMathSubtasks(questionText) && isAreaBetweenCurvesQuestion(questionText)) {
        return {
            scenario: 'generic_math',
            confidence: 0.8,
            needsGeometryValidation: false,
            forceFullFlow: true,
            mixed: true,
            reason: 'enumerated_multi_step',
            equationMode: null,
        };
    }

    const normalizedQuestion = String(questionText || '').toLocaleLowerCase('tr-TR');

    // Geometri erken tespiti: üçgen, çember, alan, açı, kenar soruları
    const normalizedCourseGeo = course ? String(course).toLocaleLowerCase('tr-TR') : '';
    const isGeoCourse = normalizedCourseGeo.includes('geometri');
    const hasGeoKeywords = /üçgen|ucgen|çember|cember|daire|yarıçap|yaricap|kenar|açı|aci|eşkenar|ikizkenar|pisagor|öklid|benzerlik|dikdörtgen|dikdortgen|yamuk|paralelkenar|teğet|teget|kiriş|kiris|açıortay|aciortay|medyan|yükseklik|yukseklik/.test(normalizedQuestion);
    if (isGeoCourse || hasGeoKeywords) {
        return {
            scenario: 'geometry',
            confidence: 0.9,
            needsGeometryValidation: true,
            forceFullFlow: true,
            mixed: false,
            reason: isGeoCourse ? 'geo_course' : 'geo_keywords',
            equationMode: null,
        };
    }

    if (/f'\(x\)|f’\(x\)|türev|turev|kritik nokta|ekstrem|maksimum|minimum|yerel/.test(normalizedQuestion)) {
        return {
            scenario: 'derivative_extrema',
            confidence: 0.85,
            needsGeometryValidation: false,
            forceFullFlow: false,
            mixed: false,
            reason: 'classified_derivative_extrema',
            equationMode: null,
        };
    }

    const inferredGeometryOperation = inferCoordinateGeometryOperation(questionText);
    if (
        inferredGeometryOperation
        && (
            /\([-\d\s]+,\s*[-\d\s]+\)/.test(questionText)
            || /doğru|dogru|nokta|çember|cember/.test(String(questionText || '').toLocaleLowerCase('tr-TR'))
        )
    ) {
        return {
            scenario: 'coordinate_geometry',
            confidence: 0.85,
            needsGeometryValidation: false,
            forceFullFlow: false,
            mixed: false,
            reason: 'classified_coordinate_geometry',
            equationMode: null,
        };
    }

    if (isAreaBetweenCurvesQuestion(questionText) && !hasEnumeratedMathSubtasks(questionText)) {
        return {
            scenario: 'area_between_curves',
            confidence: 0.9,
            needsGeometryValidation: false,
            forceFullFlow: false,
            mixed: false,
            reason: 'classified_area_between_curves',
            equationMode: null,
        };
    }

    const scores = buildScenarioScoreMap(questionText);
    const ranked = Object.entries(scores)
        .filter(([key]) => key !== 'generic_math')
        .sort((left, right) => right[1] - left[1]);

    const [topScenario, topScore] = ranked[0] || ['generic_math', 0];
    const secondScenario = ranked[1]?.[0] || null;
    const secondScore = ranked[1]?.[1] || 0;
    const limitTrigCompound = scores.limit > 0 && scores.trig > 0 && /limit/.test(normalizedQuestion) && !/trigonometri/.test(normalizedQuestion);
    const explicitMultiStep = (
        /ve sonra|ardindan|ardından|ayrica|ayrıca|hem .* hem/.test(normalizedQuestion)
        || hasEnumeratedMathSubtasks(questionText)
    ) && ranked.filter(([, score]) => score > 0).length > 1;
    const compatiblePair = new Set([
        'coordinate_geometry:equation',
        'equation:coordinate_geometry',
        'system:equation',
        'equation:system',
        'area_between_curves:equation',
        'equation:area_between_curves',
        'area_between_curves:coordinate_geometry',
        'coordinate_geometry:area_between_curves',
    ]).has(`${topScenario}:${secondScenario}`);
    const mixed = explicitMultiStep || (topScore > 0 && secondScore > 0 && topScore - secondScore <= 1 && !limitTrigCompound && !compatiblePair);
    const lowConfidence = topScore < 3;

    const scenario = mixed || lowConfidence ? 'generic_math' : topScenario;
    const confidence = topScore <= 0 ? 0.2 : Math.min(1, topScore / 5);
    const needsGeometryValidation = scenario === 'coordinate_geometry' && Boolean(base64Image);
    const equationMode = scenario === 'equation' ? classifyEquationSafety(questionText) : null;

    return {
        scenario,
        confidence,
        needsGeometryValidation,
        forceFullFlow: mixed || lowConfidence,
        mixed,
        reason: mixed ? 'mixed' : lowConfidence ? 'low_confidence' : 'classified',
        equationMode,
    };
};

const FULL_FLOW_ACTION_MAP = {
    limit: ['limit'],
    equation: ['solve', 'simplify', 'factor', 'expand'],
    system: ['solve_system'],
    derivative_extrema: ['analyze_derivative', 'find_extrema'],
    trig: ['trig_general_solution'],
    integral: ['integrate'],
    area_between_curves: ['area_between_curves'],
    coordinate_geometry: ['coordinate_geometry'],
    geometry: ['solve_geometry', 'coordinate_geometry', 'solve', 'solve_system'],
    matrix: ['matrix'],
    combinatorics: ['combinatorics'],
    generic_math: null,
    visual_or_retry: null,
};

const isScenarioActionConsistent = (scenario, action) => {
    const allowedActions = FULL_FLOW_ACTION_MAP[scenario];
    if (!allowedActions || !action) return true;
    return allowedActions.includes(action);
};

const toHistoryParts = (item = {}) => {
    const parts = [{ text: item.content || item.parts || "" }];
    if (item.base64Image) {
        parts.push({
            inlineData: {
                data: item.base64Image.replace(/^data:image\/\w+;base64,/, ""),
                mimeType: "image/jpeg"
            }
        });
    }
    return {
        role: item.role === 'user' ? 'user' : 'model',
        parts,
    };
};

const trimMathHistoryForInitialCall = (history = [], limit = TEXT_ONLY_MATH_HISTORY_LIMIT, preserveFull = false) => {
    const normalizedHistory = history.map(toHistoryParts);
    if (preserveFull || normalizedHistory.length <= limit) return normalizedHistory;
    return normalizedHistory.slice(-limit);
};

const dedupeTurns = (turns = []) => {
    const seen = new Set();
    const unique = [];
    for (const turn of turns) {
        const key = JSON.stringify(turn);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(turn);
    }
    return unique;
};

const buildLoopPayloadContents = (currentHistory = [], initialUserParts = [], flowPlan = {}, iteration = 0) => {
    // OPTİMİZASYON: Iterasyon 1+ ise görseli (inlineData) geçmişten temizle (Token Diyeti - Strateji 2)
    const cleanInitialParts = iteration > 0
        ? initialUserParts.filter(p => !p.inlineData)
        : initialUserParts;

    // İlk iterasyonda history'yi olduğu gibi gönder (görsel hariç)
    if (iteration === 0) {
        return currentHistory;
    }

    // OPTİMİZASYON: Agresif history trimming (Token Diyeti - Strateji 5)
    // Önceki tool call+response çiftlerini tek satırlık özete dönüştür
    // Sadece ilk user mesajı + son 2 turn'ü (son tool response + model cevabı) tut
    const trimmedHistory = [];
    const firstUserTurn = { role: 'user', parts: cleanInitialParts };
    trimmedHistory.push(firstUserTurn);

    // Ara tool çiftlerini özetle
    const middleTurns = currentHistory.slice(1, -2); // İlk user hariç, son 2 turn hariç
    if (middleTurns.length > 0) {
        const toolSummaries = [];
        for (const turn of middleTurns) {
            for (const part of (turn.parts || [])) {
                if (part.functionCall) {
                    toolSummaries.push(`${part.functionCall.name}(${part.functionCall.args?.action || ''})`);
                }
                if (part.functionResponse) {
                    const res = part.functionResponse.response;
                    const status = res?.status === 'error' ? `HATA:${res.code || 'err'}` : (res?.result || 'ok');
                    toolSummaries.push(`→ ${String(status).substring(0, 80)}`);
                }
            }
        }
        if (toolSummaries.length > 0) {
            trimmedHistory.push(
                { role: 'model', parts: [{ text: `Önceki hesaplamalar: ${toolSummaries.join(' | ')}` }] },
                { role: 'user', parts: [{ text: 'Devam et.' }] }
            );
        }
    }

    // Son 2 turn'ü ekle (en güncel tool response + model cevabı)
    const lastTurns = currentHistory.slice(-2).map(turn => ({
        ...turn,
        parts: turn.parts.filter(p => !p.inlineData)
    }));
    trimmedHistory.push(...lastTurns);

    return dedupeTurns(trimmedHistory);
};

const estimateApproxTokens = (value = '') => Math.ceil(String(value || '').length / APPROX_TOKEN_DIVISOR);

const estimateInlineDataTokens = (turns = []) => {
    let total = 0;
    for (const turn of turns) {
        for (const part of turn?.parts || []) {
            if (part?.inlineData?.data) {
                total += 1200;
            }
        }
    }
    return total;
};

const estimateToolBundleTokens = (tools = []) => estimateApproxTokens(JSON.stringify(tools));

const estimateHistoryTokens = (turns = []) => estimateApproxTokens(JSON.stringify(turns)) + estimateInlineDataTokens(turns);

const buildMathFlowMetrics = ({
    promptVariant = 'full',
    toolVariant = 'full',
    scenario = 'generic_math',
    confidence = 0,
    initialHistory = [],
    loopPayload = [],
    promptText = '',
    tools = [],
    questionText = '',
    fallbackApplied = false,
    fallbackReason = null,
}) => ({
    scenario,
    promptVariant,
    toolVariant,
    confidence,
    historyMessageCount: initialHistory.length,
    fallbackApplied,
    fallbackReason,
    estimatedTokens: {
        prompt: estimateApproxTokens(promptText),
        tools: estimateToolBundleTokens(tools),
        history: estimateHistoryTokens(initialHistory),
        question: estimateApproxTokens(questionText),
        initialTotal: estimateApproxTokens(promptText) + estimateToolBundleTokens(tools) + estimateHistoryTokens(initialHistory) + estimateApproxTokens(questionText),
        currentLoopTotal: estimateApproxTokens(promptText) + estimateToolBundleTokens(tools) + estimateHistoryTokens(loopPayload),
    },
});

const mergeTokenBreakdownEntry = (base = {}, extra = {}) => {
    const prompt = (base?.prompt || 0) + (extra?.prompt || 0);
    const completion = (base?.completion || 0) + (extra?.completion || 0);
    const reasoning = (base?.reasoning || 0) + (extra?.reasoning || 0);
    return {
        prompt,
        completion,
        reasoning,
        total: prompt + completion + reasoning,
    };
};

const mergeMathFlowMetrics = (baseFlow = {}, extraFlow = {}) => {
    const merged = {
        ...baseFlow,
        ...extraFlow,
        estimatedTokens: {
            ...(baseFlow?.estimatedTokens || {}),
            ...(extraFlow?.estimatedTokens || {}),
        },
        actualTokens: {
            prompt: (baseFlow?.actualTokens?.prompt || 0) + (extraFlow?.actualTokens?.prompt || 0),
            completion: (baseFlow?.actualTokens?.completion || 0) + (extraFlow?.actualTokens?.completion || 0),
            reasoning: (baseFlow?.actualTokens?.reasoning || 0) + (extraFlow?.actualTokens?.reasoning || 0),
            total: 0,
        },
        tokenBreakdown: {
            perception: mergeTokenBreakdownEntry(baseFlow?.tokenBreakdown?.perception, extraFlow?.tokenBreakdown?.perception),
            initialReasoning: mergeTokenBreakdownEntry(baseFlow?.tokenBreakdown?.initialReasoning, extraFlow?.tokenBreakdown?.initialReasoning),
            followupReasoning: mergeTokenBreakdownEntry(baseFlow?.tokenBreakdown?.followupReasoning, extraFlow?.tokenBreakdown?.followupReasoning),
        },
        toolCallCount: (baseFlow?.toolCallCount || 0) + (extraFlow?.toolCallCount || 0),
        toolErrorCount: (baseFlow?.toolErrorCount || 0) + (extraFlow?.toolErrorCount || 0),
        iterations: (baseFlow?.iterations || 0) + (extraFlow?.iterations || 0),
        truncated: Boolean(baseFlow?.truncated || extraFlow?.truncated),
        fallbackApplied: Boolean(baseFlow?.fallbackApplied || extraFlow?.fallbackApplied),
        fallbackReason: extraFlow?.fallbackReason || baseFlow?.fallbackReason || null,
    };

    merged.actualTokens.total = merged.actualTokens.prompt + merged.actualTokens.completion + merged.actualTokens.reasoning;
    merged.estimatedTokens.initialTotal = (baseFlow?.estimatedTokens?.initialTotal || 0) + (extraFlow?.estimatedTokens?.initialTotal || 0);
    merged.estimatedTokens.currentLoopTotal = (baseFlow?.estimatedTokens?.currentLoopTotal || 0) + (extraFlow?.estimatedTokens?.currentLoopTotal || 0);
    merged.estimatedTokens.maxLoopTotal = Math.max(baseFlow?.estimatedTokens?.maxLoopTotal || 0, extraFlow?.estimatedTokens?.maxLoopTotal || 0);
    merged.historyMessageCount = (baseFlow?.historyMessageCount || 0) + (extraFlow?.historyMessageCount || 0);

    return merged;
};

// ──────────────────────────────────────────────────────────────────────────────
// Gemini-optimize: Senaryo bazlı kısa hint haritası (eski MINI_PROMPT_MAP,
// MINI_PROMPT_SHARED ve SCENARIO_EXAMPLE_MAP birleştirildi)
// ──────────────────────────────────────────────────────────────────────────────
const SCENARIO_HINT_MAP = {
    geometry: '- Geometri: Verileri SymPy denklemine çevir. Pisagor, Kosinüs/Sinüs teoremi, solve_geometry veya coordinate_geometry kullan.',
    area_between_curves: '- Alan: area_between_curves action ile iki eğrinin farkını gönder.',
    equation_risky: '- Log, kök ve mutlak değer sorularında tanım kümesine uymayan kökleri ele.',
};

// ──────────────────────────────────────────────────────────────────────────────
// Gemini-optimize: Budanmış math prompt (eski 9 kural → 3 kural)
// ──────────────────────────────────────────────────────────────────────────────
const buildFullMathPrompt = (systemInstruction = "", scenarioHint = "") => `
${systemInstruction}

[KİMLİĞİN]
Sen AYT Matematik çözücüsün. Gerektiğinde calculate_math tool'unu kullanarak soruları çöz.

[TOOL KURALLARI]
- SymPy formatı kullan: * , ** , sqrt(), Abs(); ^ kullanma.
- Aynı payload hata verdiyse tekrar gönderme; formatı düzelt veya mevcut veriden cevap üret.
- Tool sonucuna güven; gereksiz doğrulama çağrısı yapma.
${scenarioHint ? `\n${scenarioHint}` : ''}

[ÇIKTI FORMATI]
✅ Doğru Cevap: ...
🎯 Çözüm Mantığı: (tek cümle)
📝 Adımlar: (en fazla 4 madde)
Cevap: ...
Doğru cevap X şıkkıdır.

- Formülleri LaTeX ile yaz: satır içi \\( \\), blok \\[ \\].
- Metadata bloğu ekleme.
`;

const resolveMiniPromptScenarioKey = (scenario = 'generic_math', equationMode = null) => {
    if (scenario === 'equation') {
        return equationMode === 'risky' ? 'equation_risky' : 'equation_simple';
    }
    return scenario;
};

const selectMathPromptVariant = ({ scenario = 'generic_math', systemInstruction = "", forceFullFlow = false, equationMode = null } = {}) => {
    const scenarioKey = resolveMiniPromptScenarioKey(scenario, equationMode);
    const scenarioHint = SCENARIO_HINT_MAP[scenarioKey] || '';
    // Gemini-optimize: Tüm senaryolar aynı budanmış prompt'u kullanır, sadece hint değişir
    return {
        promptVariant: scenarioHint ? `${scenarioKey}_prompt` : 'full_math_prompt',
        promptText: buildFullMathPrompt(
            buildCompactSystemInstruction(systemInstruction, scenario),
            scenarioHint
        ),
    };
};

const askAiSimple = async (course, questionText, history = [], systemInstruction = "", base64Image = null, modelOverride = null, options = {}) => {
    const isSozelCourse = ['türkçe', 'turkce', 'edebiyat', 'türk dili'].some(k => (course || '').toLowerCase().includes(k));
    const resolvedMimeType = (options && typeof options.imageMimeType === 'string' && options.imageMimeType) ? options.imageMimeType : 'image/jpeg';
    
    let finalQuestionText = questionText || "Bu soruyu yanitlar misin?";
    let finalBase64Image = base64Image;
    let finalModelName = modelOverride || DEFAULT_CHAT_MODEL;
    let ocrTokens = { prompt: 0, completion: 0, total: 0 };

    if (isSozelCourse && base64Image && !modelOverride) {
        // Türkçe/Edebiyat için 2 Adımlı (OCR -> Çözüm) Yöntemi
        const ocrPrompt = 'Görseldeki tüm metni olduğu gibi yaz. DİKKAT: Eğer bazı kelimelerin altı çiziliyse ve altında I, II, III gibi Romen rakamları (veya numaralar) varsa, metni düz yazıya çevirirken o numarayı kelimenin hemen yanına parantez içinde yaz. Örnek: "olağanüstü (I) gelişmelere..." Hiçbir yorum ekleme.';
        
        try {
            const ocrResponse = await ai.models.generateContent({
                model: GEMINI_CHAT_MODEL,
                contents: [
                    {
                        role: 'user', 
                        parts: [
                            { text: ocrPrompt },
                            {
                                inlineData: {
                                    data: base64Image.replace(/^data:image\/\w+;base64,/, ""),
                                    mimeType: resolvedMimeType
                                }
                            }
                        ]
                    }
                ]
            });
            const extractedText = ocrResponse.text || '';
            finalQuestionText = `${finalQuestionText}\n\nGörseldeki Metin:\n${extractedText}`;
            finalBase64Image = null; // Görseli ikinci modele gönderme, sadece metin gitsin
            finalModelName = process.env.GEMINI_ADVANCED_CHAT_MODEL || 'gemini-3-flash-preview'; // İkinci adım pahalı/zeki model
            ocrTokens = {
                prompt: ocrResponse.usageMetadata?.promptTokenCount || 0,
                completion: ocrResponse.usageMetadata?.candidatesTokenCount || 0,
                total: ocrResponse.usageMetadata?.totalTokenCount || 0
            };
        } catch (ocrError) {
            console.error('OCR aşamasında hata (tek adıma dönülüyor):', ocrError);
            finalModelName = process.env.GEMINI_ADVANCED_CHAT_MODEL || 'gemini-3-flash-preview';
        }
    } else if (isSozelCourse && !modelOverride) {
        finalModelName = process.env.GEMINI_ADVANCED_CHAT_MODEL || 'gemini-3-flash-preview';
    }

    const contents = [];
    for (const item of history) {
        const parts = [{ text: item.content || item.parts || "" }];
        if (item.base64Image) {
            parts.push({
                inlineData: {
                    data: item.base64Image.replace(/^data:image\/\w+;base64,/, ""),
                    mimeType: item.imageMimeType || "image/jpeg"
                }
            });
        }
        contents.push({
            role: item.role === 'user' ? 'user' : 'model',
            parts
        });
    }

    const userParts = [{ text: finalQuestionText }];
    if (finalBase64Image) {
        userParts.push({
            inlineData: {
                data: finalBase64Image.replace(/^data:image\/\w+;base64,/, ""),
                mimeType: resolvedMimeType
            }
        });
    }

    const response = await ai.models.generateContent({
        model: finalModelName,
        contents: [...contents, { role: 'user', parts: userParts }],
        config: {
            systemInstruction: systemInstruction,
            course: course,
            ...options
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
    });

    const answerText = response.text || "Yapay Zeka bu soruya icerik uretemedi.";

    if (options.returnMetadata) {
        return {
            answerText,
            metadata: {
                tokens: {
                    prompt: response.usageMetadata?.promptTokenCount || 0,
                    completion: response.usageMetadata?.candidatesTokenCount || 0,
                    total: response.usageMetadata?.totalTokenCount || 0,
                    ocrPrompt: ocrTokens.prompt,
                    ocrCompletion: ocrTokens.completion,
                    ocrTotal: ocrTokens.total
                },
                model: ocrTokens.total > 0 ? `ocr+${finalModelName}` : finalModelName
            }
        };
    }

    if (options.returnFullResponse) {
        return response;
    }
    return answerText;
};

/**
 * Kurum Geneli (Dashboard) Özeti Çıkaran AI Fonksiyonu
 * Gemini 3.1 Flash-Lite kullanılarak yüksek hızlı analiz yapılır.
 */
const generateDashboardSummary = async (statsData) => {
    const safeNum = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, safeNum(value)));
    const cleanText = (value, fallback = '') => {
        const text = String(value || '').trim();
        return text || fallback;
    };
    const cleanTextArray = (value, fallback = []) => {
        if (!Array.isArray(value)) return fallback;
        const cleaned = value.map((item) => cleanText(item)).filter(Boolean);
        return cleaned.length > 0 ? cleaned.slice(0, 6) : fallback;
    };
    const normalizeInterventionPlan = (value, fallbackValue = null) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return fallbackValue;
        return {
            ...(fallbackValue || {}),
            ...value,
            focusSubject: cleanText(value.focusSubject, fallbackValue?.focusSubject || ''),
            targetGroup: cleanText(value.targetGroup, fallbackValue?.targetGroup || ''),
            recommendedAction: cleanText(value.recommendedAction, fallbackValue?.recommendedAction || ''),
            expectedGain: cleanText(value.expectedGain, fallbackValue?.expectedGain || ''),
            owner: cleanText(value.owner, fallbackValue?.owner || ''),
            targetStudents: Array.isArray(value.targetStudents)
                ? value.targetStudents.slice(0, 8)
                : (fallbackValue?.targetStudents || []),
        };
    };
    const normalizeSegments = (value, fallbackValue = {}) => {
        const parsedSegments = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return Object.keys(fallbackValue || {}).reduce((acc, key) => {
            const fallbackSegment = fallbackValue[key] || {};
            const parsedSegment = parsedSegments[key] && typeof parsedSegments[key] === 'object' ? parsedSegments[key] : {};
            acc[key] = {
                ...fallbackSegment,
                ...parsedSegment,
                name: cleanText(parsedSegment.name, fallbackSegment.name || key),
                description: cleanText(parsedSegment.description, fallbackSegment.description || ''),
                count: Math.max(0, Math.round(safeNum(parsedSegment.count ?? fallbackSegment.count))),
                students: Array.isArray(parsedSegment.students) ? parsedSegment.students.slice(0, 6) : (fallbackSegment.students || []),
            };
            return acc;
        }, {});
    };
    const normalizeDepartmentMap = (value, fallbackValue = {}) => {
        const parsedMap = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return { ...(fallbackValue || {}), ...parsedMap };
    };
    const normalizeFollowUp = (value, fallbackValue) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return fallbackValue;
        return {
            ...fallbackValue,
            ...value,
            hasPrevious: Boolean(value.hasPrevious ?? fallbackValue?.hasPrevious),
            summary: cleanText(value.summary, fallbackValue?.summary || ''),
        };
    };
    const normalizePrincipalBrief = (value, fallbackValue) => {
        const parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return {
            goodThings: cleanTextArray(parsed.goodThings, fallbackValue.goodThings),
            alarms: cleanTextArray(parsed.alarms, fallbackValue.alarms),
            immediateActions: cleanTextArray(parsed.immediateActions, fallbackValue.immediateActions),
            departmentNote: cleanText(parsed.departmentNote, fallbackValue.departmentNote),
        };
    };
    const computedScore = statsData.computedHealthScore || {};
    const fallbackMomentumSource = Array.isArray(statsData.momentum) && statsData.momentum.length > 0
        ? statsData.momentum
        : Array.isArray(statsData.subjectTrends)
            ? [...statsData.subjectTrends]
                .filter((item) => Math.abs(safeNum(item.trendDelta)) >= 0.25)
                .sort((a, b) => Math.abs(safeNum(b.trendDelta)) - Math.abs(safeNum(a.trendDelta)))
            : [];
    const fallbackMomentum = fallbackMomentumSource.slice(0, 6).map((item) => ({
        subject: cleanText(item.subject, 'Ders'),
        direction: ['up', 'down', 'stable'].includes(item.direction) ? item.direction : 'stable',
        intensity: Math.max(1, Math.min(3, Math.round(safeNum(item.intensity) || 1))),
        note: cleanText(item.note, item.direction === 'down' && safeNum(item.intensity) >= 3 ? 'ACIL' : 'İzlenmeli'),
    }));

    const buildFallback = () => {
        const roiLine = cleanText(statsData.roiData).split('|')[0]?.trim();
        const blindSpotLine = cleanText(statsData.blindSpotData).split('|')[0]?.trim();
        const segmentData = normalizeSegments(statsData.studentSegments || {}, statsData.studentSegments || {});
        const interventionPlan = normalizeInterventionPlan(statsData.interventionPlan, null);
        const departmentMap = normalizeDepartmentMap(statsData.departmentMap || {}, statsData.departmentMap || {});
        const postInterventionFollowUp = normalizeFollowUp(statsData.postInterventionData, {
            hasPrevious: false,
            summary: 'İlk operasyon analizi. Bir sonraki analizde bu haftaki müdahalenin etkisi karşılaştırılacak.',
        });
        const goodThings = [];
        if (safeNum(statsData.avgNetChange) > 0) goodThings.push(`Son 3 denemede kurum net değişimi +${safeNum(statsData.avgNetChange)}.`);
        if (safeNum(statsData.examParticipationRate) > 0) goodThings.push(`Deneme katılımı %${safeNum(statsData.examParticipationRate)} seviyesinde.`);
        if (fallbackMomentum.some((item) => item.direction === 'up')) goodThings.push('Bazı derslerde pozitif momentum sinyali var.');
        const alarms = [];
        if (blindSpotLine) alarms.push(blindSpotLine);
        if (safeNum(statsData.sharpDropStudents) > 0) alarms.push(`${safeNum(statsData.sharpDropStudents)} öğrencide sert düşüş sinyali var.`);
        if (interventionPlan?.focusSubject) alarms.push(`${interventionPlan.focusSubject} bu hafta müdahale odağı olmalı.`);
        return {
            healthScore: {
                total: Math.round(clamp(computedScore.total)),
                participation: Math.round(clamp(computedScore.participation)),
                netTrend: Math.round(clamp(computedScore.netTrend)),
                consistency: Math.round(clamp(computedScore.consistency)),
                efficiency: Math.round(clamp(computedScore.efficiency)),
            },
            blindSpot: blindSpotLine
                ? `Ortalamanın arkasında en belirgin kırılma ${blindSpotLine}. Bu ders küçük bir grup tarafından yukarı taşınıyor olabilir.`
                : 'Kör nokta üretmek için yeterli ders dağılımı bulunamadı.',
            efficiencyInsight: cleanText(
                statsData.efficiencyData,
                'Verimlilik yorumu için son 3 deneme ve haftalık soru hacmi birlikte izlenmeli.',
            ),
            highestROI: roiLine
                ? `Bu haftanın odağı ${roiLine}. Bu alandaki küçük bir müdahale kurum ortalamasına en hızlı yansıyacak başlık olarak görünüyor.`
                : 'En yüksek getirili müdahale için yeterli ders kırılımı bulunamadı.',
            momentum: fallbackMomentum,
            interventionPlan,
            studentSegments: segmentData,
            departmentMap,
            postInterventionFollowUp,
            principalWeeklyBrief: {
                goodThings: goodThings.slice(0, 3),
                alarms: alarms.slice(0, 3),
                immediateActions: [
                    interventionPlan?.recommendedAction
                        ? `${interventionPlan.focusSubject} için ${interventionPlan.recommendedAction}.`
                        : 'En yüksek kayıp üreten ders için mini müdahale planı netleştirilmeli.',
                    'Segment listeleri zümrelerle paylaşılmalı.',
                    'Bir sonraki denemede odak dersin yanlış oranı ve net değişimi tekrar ölçülmeli.',
                ],
                departmentNote: interventionPlan?.owner
                    ? `${interventionPlan.owner} bu hafta ${interventionPlan.targetGroup} grubuna odaklanmalı.`
                    : 'Zümre notu için yeterli ders kırılımı bulunamadı.',
            },
        };
    };

    const fallback = buildFallback();
    const dataPackage = {
        period: statsData.periodLabel || 'Son 3 deneme',
        students: {
            total: safeNum(statsData.totalStudents),
            participants: safeNum(statsData.currentParticipants),
            participationRate: safeNum(statsData.examParticipationRate),
        },
        institutionAverages: {
            tytLastThree: statsData.tytAverages || 'veri yok',
            aytLastThree: statsData.aytAverages || 'veri yok',
        },
        healthScore: fallback.healthScore,
        strongestSubjects: statsData.strongestSubjectsText || 'veri yetersiz',
        weakestSubjects: statsData.weakestSubjectsText || 'veri yetersiz',
        blindSpotData: statsData.blindSpotData || 'hesaplanamadi',
        efficiencyData: {
            summary: statsData.efficiencyData || 'hesaplanamadi',
            matrix: statsData.efficiencyMatrix || [],
            avgWeeklySolved: safeNum(statsData.avgWeeklySolved),
            avgNetChange: safeNum(statsData.avgNetChange),
            expectedNetChange: safeNum(statsData.expectedNetChange),
        },
        roiData: statsData.roiData || 'hesaplanamadi',
        consistencyData: statsData.consistencyData || {},
        subjectTrends: Array.isArray(statsData.subjectTrends) ? statsData.subjectTrends : [],
        momentumData: statsData.momentumData || 'hesaplanamadi',
        operationPlan: {
            interventionPlan: fallback.interventionPlan,
            studentSegments: fallback.studentSegments,
            departmentMap: fallback.departmentMap,
            postInterventionFollowUp: fallback.postInterventionFollowUp,
        },
        studentProfiles: Array.isArray(statsData.studentProfiles) ? statsData.studentProfiles : [],
        studentMomentumCounts: {
            risingTyt: safeNum(statsData.risingTytStudents),
            fallingTyt: safeNum(statsData.fallingTytStudents),
            risingAyt: safeNum(statsData.risingAytStudents),
            fallingAyt: safeNum(statsData.fallingAytStudents),
            sharpDrop: safeNum(statsData.sharpDropStudents),
        },
    };

    const prompt = `
Sen kurumsal deneme analisti ve egitim stratejistisin.
Asagidaki son 3 deneme veri paketini analiz edip yonetici karar destek kartlarinda kullanilacak yapilandirilmis bir JSON raporu uret.

KURALLAR:
- Sadece kurum deneme verisine odaklan, quiz/motivasyon/davranis yorumu yapma.
- Sayisal veriyi metnin icine yedir, rakam listesi gibi yazma.
- Her alan 1-3 cumle olsun.
- Veri yetersizse bunu acikca soyle, uydurma.
- healthScore alaninda verilen hesaplanmis skorlari temel al; sadece cok acik celiski varsa kucuk duzeltme yap.
- blindSpot ortalamanin arkasinda gizlenen dagilim sorununu anlatmali.
- efficiencyInsight haftalik soru hacmi ile net artisini karsilastirmali.
- highestROI bu haftanin en yuksek getirili mudahale alanini soylemeli.
- momentum dizisinde en onemli 4-6 dersi ver; dusus siddeti yuksekse note icinde "ACIL" yaz.
- interventionPlan yorum degil, haftalik operasyon karti gibi net ve uygulanabilir olmali.
- studentSegments icindeki sayi ve ogrenci listelerini veri paketinden al; yeni ogrenci adi uydurma.
- departmentMap zümre karar destegi icin ders sinyallerini kisa ve kurum ici dille anlatmali.
- postInterventionFollowUp onceki onerinin izini surmeli; onceki veri yoksa ilk analiz oldugunu soylemeli.
- principalWeeklyBrief sadece kurum ici karar notu olmali; veli/ogrenciye yonelik mesaj yazma.
- Ciktini SADECE gecerli JSON formatinda ver, baska hicbir sey yazma.

VERI PAKETI:
${JSON.stringify(dataPackage, null, 2)}

BEKLENEN JSON FORMATI:
{
  "healthScore": { "total": 72, "participation": 85, "netTrend": 68, "consistency": 63, "efficiency": 71 },
  "blindSpot": "Ortalama arkasinda gizlenen gercegi anlatan 1-2 cumle",
  "efficiencyInsight": "Soru cozme hacmi vs net artis iliskisini analiz eden 1-2 cumle",
  "highestROI": "En yuksek getirili mudahale alanini ve beklenen etkiyi anlatan 1-2 cumle",
  "momentum": [
    { "subject": "Ders Adi", "direction": "up/down/stable", "intensity": 1-3, "note": "Kisa aciklama" }
  ],
  "interventionPlan": {
    "focusSubject": "AYT Matematik",
    "targetGroup": "5 net alti 6 ogrenci",
    "recommendedAction": "2 mini brans denemesi + yanlis cozum etudu",
    "expectedGain": "+4.7 kurum net potansiyeli",
    "owner": "Matematik zumresi"
  },
  "studentSegments": {
    "carriers": { "name": "Tasiyicilar", "count": 4, "description": "Kisa karar notu", "students": [] },
    "hiddenRisk": { "name": "Gizli Risk", "count": 2, "description": "Kisa karar notu", "students": [] },
    "breakoutCandidates": { "name": "Patlama Adayi", "count": 3, "description": "Kisa karar notu", "students": [] },
    "effortLeak": { "name": "Efor Kaybi", "count": 2, "description": "Kisa karar notu", "students": [] },
    "criticalIntervention": { "name": "Kritik Mudahale", "count": 1, "description": "Kisa karar notu", "students": [] }
  },
  "departmentMap": {
    "highestLoss": { "subject": "Ders", "signal": "Kisa sinyal" },
    "fastestRecovery": { "subject": "Ders", "signal": "Kisa sinyal" },
    "unevenDistribution": { "subject": "Ders", "signal": "Kisa sinyal" },
    "lowWrongNoGain": { "subject": "Ders", "signal": "Kisa sinyal" },
    "teachingEfficiency": { "subject": "Ders", "signal": "Kisa sinyal" }
  },
  "postInterventionFollowUp": { "hasPrevious": false, "summary": "Kisa takip notu" },
  "principalWeeklyBrief": {
    "goodThings": ["Iyi giden 1", "Iyi giden 2", "Iyi giden 3"],
    "alarms": ["Alarm 1", "Alarm 2", "Alarm 3"],
    "immediateActions": ["Aksiyon 1", "Aksiyon 2", "Aksiyon 3"],
    "departmentNote": "Zumreye iletilecek karar notu"
  }
}
  `;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_CHAT_MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
            }
        });
        const text = String(response?.text || '').trim();
        if (!text) throw new Error('Bos dashboard ozeti dondu');

        const jsonText = text
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```$/i, '')
            .trim();
        const parsed = JSON.parse(jsonText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Dashboard ozeti JSON nesnesi degil');
        }

        const score = parsed.healthScore || {};
        const normalizedSummary = {
            ...fallback,
            ...parsed,
            healthScore: {
                total: Math.round(clamp(score.total || fallback.healthScore.total)),
                participation: Math.round(clamp(score.participation || fallback.healthScore.participation)),
                netTrend: Math.round(clamp(score.netTrend || fallback.healthScore.netTrend)),
                consistency: Math.round(clamp(score.consistency || fallback.healthScore.consistency)),
                efficiency: Math.round(clamp(score.efficiency || fallback.healthScore.efficiency)),
            },
            momentum: Array.isArray(parsed.momentum) && parsed.momentum.length > 0
                ? parsed.momentum.slice(0, 8).map((item) => ({
                    subject: cleanText(item.subject, 'Ders'),
                    direction: ['up', 'down', 'stable'].includes(item.direction) ? item.direction : 'stable',
                    intensity: Math.max(1, Math.min(3, Math.round(safeNum(item.intensity) || 1))),
                    note: cleanText(item.note, 'İzlenmeli'),
                }))
                : fallback.momentum,
            interventionPlan: normalizeInterventionPlan(parsed.interventionPlan, fallback.interventionPlan),
            studentSegments: normalizeSegments(parsed.studentSegments, fallback.studentSegments),
            departmentMap: normalizeDepartmentMap(parsed.departmentMap, fallback.departmentMap),
            postInterventionFollowUp: normalizeFollowUp(parsed.postInterventionFollowUp, fallback.postInterventionFollowUp),
            principalWeeklyBrief: normalizePrincipalBrief(parsed.principalWeeklyBrief, fallback.principalWeeklyBrief),
        };
        Object.defineProperty(normalizedSummary, '__usageMetadata', {
            value: response?.usageMetadata || response?.response?.usageMetadata || null,
            enumerable: false,
        });
        Object.defineProperty(normalizedSummary, '__model', {
            value: GEMINI_CHAT_MODEL,
            enumerable: false,
        });
        return normalizedSummary;
    } catch (error) {
        console.error("API Error (Dashboard):", error);
        return fallback;
    }
};

/**
 */
// Öğrenci verilerini analiz eden ve farklı karakterlerde (modlarda) sonuç dönen ana fonksiyon
const EXAM_SUBJECT_LABELS = [
    ['tytTur', 'TYT Turkce'],
    ['tytMat', 'TYT Matematik'],
    ['tytTar', 'TYT Tarih'],
    ['tytCog', 'TYT Cografya'],
    ['tytFel', 'TYT Felsefe'],
    ['tytDin', 'TYT Din'],
    ['tytFiz', 'TYT Fizik'],
    ['tytKim', 'TYT Kimya'],
    ['tytBiy', 'TYT Biyoloji'],
    ['aytMat', 'AYT Matematik'],
    ['aytFiz', 'AYT Fizik'],
    ['aytKim', 'AYT Kimya'],
    ['aytBiy', 'AYT Biyoloji'],
    ['aytEdb', 'AYT Edebiyat'],
    ['aytTar1', 'AYT Tarih-1'],
    ['aytCog1', 'AYT Cografya-1'],
    ['aytTar2', 'AYT Tarih-2'],
    ['aytCog2', 'AYT Cografya-2'],
    ['aytFel', 'AYT Felsefe'],
    ['aytDin', 'AYT Din'],
];

const safeNum = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const summarizeExamPerformance = (exams = []) => {
    if (!Array.isArray(exams) || exams.length === 0) {
        return {
            compact: 'Henüz deneme verisi bulunmamaktadır.',
            detailed: 'Henüz deneme verisi bulunmamaktadır.',
            subjectAverages: 'Brans ortalamasi hesaplanamadi.',
            examAxisSummary: 'TYT ve AYT ayri trend verisi hesaplanamadi.',
        };
    }

    const orderedExams = exams
        .slice()
        .sort((left, right) => new Date(left.date || 0).getTime() - new Date(right.date || 0).getTime());

    const compact = orderedExams
        .map((exam) => `Tarih: ${exam.date || 'Tarihsiz'}, TYT: ${safeNum(exam.tytNet)}, AYT: ${safeNum(exam.aytNet)}`)
        .join('\n');

    const detailed = orderedExams
        .map((exam, index) => {
            const tytSos = safeNum(exam.tytTar) + safeNum(exam.tytCog) + safeNum(exam.tytFel) + safeNum(exam.tytDin);
            const tytFen = safeNum(exam.tytFiz) + safeNum(exam.tytKim) + safeNum(exam.tytBiy);
            return `Sınav ${index + 1} (${exam.date || 'Tarihsiz'}): TYT ${safeNum(exam.tytNet).toFixed(1)} (Turkce:${safeNum(exam.tytTur).toFixed(1)} Sos:${tytSos.toFixed(1)} Mat:${safeNum(exam.tytMat).toFixed(1)} Fen:${tytFen.toFixed(1)}) | AYT ${safeNum(exam.aytNet).toFixed(1)} (Mat:${safeNum(exam.aytMat).toFixed(1)} Fiz:${safeNum(exam.aytFiz).toFixed(1)} Kim:${safeNum(exam.aytKim).toFixed(1)} Biy:${safeNum(exam.aytBiy).toFixed(1)})`;
        })
        .join('\n');

    const averages = EXAM_SUBJECT_LABELS
        .map(([key, label]) => {
            const total = orderedExams.reduce((sum, exam) => sum + safeNum(exam[key]), 0);
            return { label, avg: total / orderedExams.length };
        })
        .filter((item) => item.avg > 0)
        .sort((left, right) => right.avg - left.avg);

    const strongest = averages.slice(0, 3).map((item) => `${item.label}: ${item.avg.toFixed(1)}`);
    const weakest = averages.slice(-3).reverse().map((item) => `${item.label}: ${item.avg.toFixed(1)}`);

    const recentThree = orderedExams.slice(-3);
    const recentTytTrend = recentThree.map((exam) => `${exam.date || 'Tarihsiz'} TYT ${safeNum(exam.tytNet).toFixed(1)}`).join(' | ');
    const recentAytTrend = recentThree.map((exam) => `${exam.date || 'Tarihsiz'} AYT ${safeNum(exam.aytNet).toFixed(1)}`).join(' | ');

    const firstExam = orderedExams[0];
    const lastExam = orderedExams[orderedExams.length - 1];
    const tytDelta = safeNum(lastExam?.tytNet) - safeNum(firstExam?.tytNet);
    const aytDelta = safeNum(lastExam?.aytNet) - safeNum(firstExam?.aytNet);
    const tytDirection = tytDelta > 0 ? 'yukseliste' : tytDelta < 0 ? 'dususte' : 'dengede';
    const aytDirection = aytDelta > 0 ? 'yukseliste' : aytDelta < 0 ? 'dususte' : 'dengede';

    return {
        compact,
        detailed,
        subjectAverages: [
            `TYT ekseni: son ${orderedExams.length} denemede ${tytDirection}, degisim ${tytDelta >= 0 ? '+' : ''}${tytDelta.toFixed(1)}`,
            `AYT ekseni: son ${orderedExams.length} denemede ${aytDirection}, degisim ${aytDelta >= 0 ? '+' : ''}${aytDelta.toFixed(1)}`,
            `En guclu branslar: ${strongest.length > 0 ? strongest.join(', ') : 'hesaplanamadi'}`,
            `En cok dikkat isteyen branslar: ${weakest.length > 0 ? weakest.join(', ') : 'hesaplanamadi'}`,
        ].join('\n'),
        examAxisSummary: [
            `Son 3 TYT akisi: ${recentTytTrend || 'yetersiz veri'}`,
            `Son 3 AYT akisi: ${recentAytTrend || 'yetersiz veri'}`,
        ].join('\n'),
    };
};

const summarizeQuestionAnalyses = (questionAnalyses = []) => {
    if (!Array.isArray(questionAnalyses) || questionAnalyses.length === 0) {
        return 'Henüz hatalı soru verisi bulunmamaktadır.';
    }

    const grouped = {};
    for (const qa of questionAnalyses) {
        const course = String(qa?.course || 'Bilinmeyen Ders').trim();
        const topic = String(qa?.topic || 'Genel').trim();
        const subtopic = String(qa?.subtopic || 'Genel').trim();
        const key = `${course}|${topic}|${subtopic}`;
        grouped[key] = grouped[key] || { course, topic, subtopic, count: 0 };
        grouped[key].count += 1;
    }

    return Object.values(grouped)
        .sort((left, right) => right.count - left.count)
        .slice(0, 10)
        .map((item) => `- Ders: ${item.course}, Konu: ${item.topic}, Alt Konu: ${item.subtopic}, Tekrar: ${item.count}`)
        .join('\n');
};

const summarizeDailyActivities = (dailyActivities = []) => {
    if (!Array.isArray(dailyActivities) || dailyActivities.length === 0) {
        return 'Gunluk aktivite verisi bulunmamaktadır.';
    }

    const ordered = dailyActivities
        .slice()
        .sort((left, right) => new Date(left.date || 0).getTime() - new Date(right.date || 0).getTime());
    const last7 = ordered.slice(-7);
    const last30 = ordered.slice(-30);
    const solved7 = last7.reduce((sum, item) => sum + safeNum(item.solvedCount), 0);
    const solved30 = last30.reduce((sum, item) => sum + safeNum(item.solvedCount), 0);
    const active7 = last7.filter((item) => safeNum(item.solvedCount) > 0).length;
    const active30 = last30.filter((item) => safeNum(item.solvedCount) > 0).length;
    const recentDays = last7.map((item) => `${item.date}: ${safeNum(item.solvedCount)} soru`).join(' | ');

    return [
        `Son 7 gun toplam soru: ${solved7}`,
        `Son 30 gun toplam soru: ${solved30}`,
        `Son 7 gun aktif gun sayisi: ${active7}/7`,
        `Son 30 gun aktif gun sayisi: ${active30}/${last30.length}`,
        `Son 7 gun dagilimi: ${recentDays || 'yetersiz veri'}`,
    ].join('\n');
};

const summarizeAttendance = (attendances = []) => {
    if (!Array.isArray(attendances) || attendances.length === 0) {
        return 'Devamlılık verisi bulunmamaktadır.';
    }

    const last30 = attendances
        .slice()
        .sort((left, right) => new Date(left.date || 0).getTime() - new Date(right.date || 0).getTime())
        .slice(-30);

    const counts = last30.reduce((acc, item) => {
        const key = String(item?.status || 'bilinmiyor');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    return [
        `Son ${last30.length} yoklama kaydi: geldi ${counts.geldi || 0}, gelmedi ${counts.gelmedi || 0}, gec_kaldi ${counts.gec_kaldi || 0}`,
        `En son yoklama durumlari: ${last30.slice(-5).map((item) => `${new Date(item.date).toISOString().slice(0, 10)}=${item.status}`).join(' | ') || 'yok'}`,
    ].join('\n');
};

const summarizeSmartQuizAttempts = (smartQuizAttempts = []) => {
    if (!Array.isArray(smartQuizAttempts) || smartQuizAttempts.length === 0) {
        return 'Akilli quiz verisi bulunmamaktadır.';
    }

    const completed = smartQuizAttempts.filter((item) => item?.status === 'completed');
    const pending = smartQuizAttempts.filter((item) => item?.status === 'pending').length;
    const inProgress = smartQuizAttempts.filter((item) => item?.status === 'in_progress').length;
    const averageScore = completed.length > 0
        ? (completed.reduce((sum, item) => sum + safeNum(item.score), 0) / completed.length) * 100
        : 0;

    const supportTopics = completed
        .filter((item) => safeNum(item.score) < 0.67)
        .map((item) => `${item.course} / ${item.topic}`)
        .slice(0, 5);

    const recentItems = smartQuizAttempts
        .slice(0, 6)
        .map((item) => {
            const scoreText = item.status === 'completed'
                ? `%${Math.round(safeNum(item.score) * 100)}`
                : item.status;
            return `${item.course} / ${item.topic}: ${scoreText}`;
        })
        .join(' | ');

    return [
        `Toplam quiz: ${smartQuizAttempts.length}, tamamlanan: ${completed.length}, bekleyen: ${pending}, yarim kalan: ${inProgress}`,
        `Tamamlanan quiz ortalama basari: %${averageScore.toFixed(1)}`,
        `Tekrar ihtimali yuksek konular: ${supportTopics.length > 0 ? supportTopics.join(', ') : 'yok'}`,
        `Son quiz akisi: ${recentItems || 'yok'}`,
    ].join('\n');
};

const summarizeAssignedContentRecipients = (assignedContentRecipients = []) => {
    if (!Array.isArray(assignedContentRecipients) || assignedContentRecipients.length === 0) {
        return 'Ogretmen tarafindan atanmis test/PDF verisi bulunmamaktadır.';
    }

    const completed = assignedContentRecipients.filter((item) => item?.status === 'completed');
    const opened = assignedContentRecipients.filter((item) => item?.openedAt).length;
    const averageScore = completed.length > 0
        ? completed.reduce((sum, item) => sum + safeNum(item?.resultSummary?.scorePct), 0) / completed.length
        : 0;
    const averageNet = completed.length > 0
        ? completed.reduce((sum, item) => sum + safeNum(item?.resultSummary?.net), 0) / completed.length
        : 0;
    const averageDurationMinutes = completed.length > 0
        ? completed.reduce((sum, item) => sum + (safeNum(item?.activeDurationSeconds) / 60), 0) / completed.length
        : 0;

    const recentResults = assignedContentRecipients
        .slice(0, 5)
        .map((item) => {
            const title = item?.assignment?.content?.title || 'Icerik';
            const status = item?.status || 'pending';
            const score = item?.resultSummary?.scorePct;
            const net = item?.resultSummary?.net;
            return `${title}: ${status}${score !== undefined ? `, skor %${safeNum(score).toFixed(1)}` : ''}${net !== undefined ? `, net ${safeNum(net).toFixed(2)}` : ''}`;
        })
        .join(' | ');

    const weakSections = {};
    for (const recipient of completed) {
        const sections = Array.isArray(recipient?.resultSummary?.sections) ? recipient.resultSummary.sections : [];
        for (const section of sections) {
            const title = String(section?.title || section?.course || 'Bolum').trim();
            weakSections[title] = weakSections[title] || { title, totalNet: 0, totalScore: 0, count: 0 };
            weakSections[title].totalNet += safeNum(section?.net);
            weakSections[title].totalScore += safeNum(section?.scorePct);
            weakSections[title].count += 1;
        }
    }

    const weakSectionText = Object.values(weakSections)
        .map((item) => ({
            title: item.title,
            avgNet: item.totalNet / Math.max(item.count, 1),
            avgScore: item.totalScore / Math.max(item.count, 1),
        }))
        .sort((left, right) => left.avgScore - right.avgScore || left.avgNet - right.avgNet)
        .slice(0, 4)
        .map((item) => `${item.title}: skor %${item.avgScore.toFixed(1)}, net ${item.avgNet.toFixed(2)}`)
        .join(', ');

    return [
        `Atanan test/PDF sayisi: ${assignedContentRecipients.length}, acilan: ${opened}, tamamlanan: ${completed.length}`,
        `Tamamlanan iceriklerde ortalama skor: %${averageScore.toFixed(1)}, ortalama net: ${averageNet.toFixed(2)}, ortalama aktif sure: ${averageDurationMinutes.toFixed(1)} dk`,
        `Bolum bazli zayif alanlar: ${weakSectionText || 'yeterli veri yok'}`,
        `Son atama sonuclari: ${recentResults || 'yok'}`,
    ].join('\n');
};

const summarizeRiskSignals = (guidanceAlerts = [], dropAnalyses = []) => {
    const alertLines = Array.isArray(guidanceAlerts)
        ? guidanceAlerts
            .slice(0, 5)
            .map((item) => `${item.priority || 'bilinmiyor'}: ${item.issue || 'isimsiz uyarı'}`)
        : [];
    const dropLines = Array.isArray(dropAnalyses)
        ? dropAnalyses
            .slice(0, 5)
            .map((item) => `${item.type || 'Dusus'} ${item.dropRate ? `(${item.dropRate})` : ''}`.trim())
        : [];

    if (alertLines.length === 0 && dropLines.length === 0) {
        return 'Ek risk veya rehberlik uyarisi kaydi bulunmamaktadır.';
    }

    return [
        `Rehberlik uyarilari: ${alertLines.length > 0 ? alertLines.join(' | ') : 'yok'}`,
        `Dusus sinyalleri: ${dropLines.length > 0 ? dropLines.join(' | ') : 'yok'}`,
    ].join('\n');
};

const summarizeStressExamSignals = (exams = []) => {
    if (!Array.isArray(exams) || exams.length === 0) {
        return 'Sinav dalgalanmasi icin yeterli veri bulunmamaktadır.';
    }

    const orderedExams = exams
        .slice()
        .sort((left, right) => new Date(left.date || 0).getTime() - new Date(right.date || 0).getTime());
    const lastFour = orderedExams.slice(-4);
    const tytValues = lastFour.map((exam) => safeNum(exam.tytNet));
    const aytValues = lastFour.map((exam) => safeNum(exam.aytNet));
    const lastExam = lastFour[lastFour.length - 1];
    const prevExam = lastFour.length >= 2 ? lastFour[lastFour.length - 2] : null;
    const tytDelta = prevExam ? safeNum(lastExam?.tytNet) - safeNum(prevExam?.tytNet) : 0;
    const aytDelta = prevExam ? safeNum(lastExam?.aytNet) - safeNum(prevExam?.aytNet) : 0;
    const tytRange = tytValues.length > 0 ? Math.max(...tytValues) - Math.min(...tytValues) : 0;
    const aytRange = aytValues.length > 0 ? Math.max(...aytValues) - Math.min(...aytValues) : 0;

    return [
        `Son ${lastFour.length} denemede TYT akisi: ${lastFour.map((exam) => `${exam.date || 'Tarihsiz'}=${safeNum(exam.tytNet).toFixed(1)}`).join(' | ')}`,
        `Son ${lastFour.length} denemede AYT akisi: ${lastFour.map((exam) => `${exam.date || 'Tarihsiz'}=${safeNum(exam.aytNet).toFixed(1)}`).join(' | ')}`,
        `TYT dalgalanma araligi: ${tytRange.toFixed(1)} net, AYT dalgalanma araligi: ${aytRange.toFixed(1)} net`,
        `Son sinav degisimi: TYT ${tytDelta >= 0 ? '+' : ''}${tytDelta.toFixed(1)}, AYT ${aytDelta >= 0 ? '+' : ''}${aytDelta.toFixed(1)}`,
    ].join('\n');
};

const summarizeStressTopicPressure = (questionAnalyses = []) => {
    if (!Array.isArray(questionAnalyses) || questionAnalyses.length === 0) {
        return 'Tekrarlayan baski olusturan konu verisi bulunmamaktadır.';
    }

    const grouped = {};
    for (const qa of questionAnalyses) {
        const course = String(qa?.course || 'Bilinmeyen Ders').trim();
        const topic = String(qa?.topic || 'Genel').trim();
        const key = `${course}|${topic}`;
        grouped[key] = grouped[key] || { course, topic, count: 0 };
        grouped[key].count += 1;
    }

    return Object.values(grouped)
        .sort((left, right) => right.count - left.count)
        .slice(0, 5)
        .map((item) => `${item.course} / ${item.topic}: ${item.count} tekrar`)
        .join(' | ');
};

const summarizeAssignedContentForNetAnalysis = (assignedContentRecipients = []) => {
    if (!Array.isArray(assignedContentRecipients) || assignedContentRecipients.length === 0) {
        return 'Ogretmen tarafindan gonderilen test/PDF sonucu bulunmamaktadır.';
    }

    const completed = assignedContentRecipients.filter((item) => item?.status === 'completed');
    if (completed.length === 0) {
        return `Toplam ${assignedContentRecipients.length} atama var ancak henuz tamamlanan sonuc yok.`;
    }

    const averageSuccess = completed.reduce((sum, item) => sum + safeNum(item?.resultSummary?.scorePct), 0) / completed.length;
    const averageNet = completed.reduce((sum, item) => sum + safeNum(item?.resultSummary?.net), 0) / completed.length;

    const weakSections = {};
    for (const recipient of completed) {
        const sections = Array.isArray(recipient?.resultSummary?.sections) ? recipient.resultSummary.sections : [];
        for (const section of sections) {
            const title = String(section?.title || section?.course || 'Bolum').trim();
            weakSections[title] = weakSections[title] || { title, totalNet: 0, totalSuccess: 0, count: 0 };
            weakSections[title].totalNet += safeNum(section?.net);
            weakSections[title].totalSuccess += safeNum(section?.scorePct);
            weakSections[title].count += 1;
        }
    }

    const rankedSections = Object.values(weakSections)
        .map((item) => ({
            title: item.title,
            avgNet: item.totalNet / Math.max(item.count, 1),
            avgSuccess: item.totalSuccess / Math.max(item.count, 1),
        }))
        .sort((left, right) => left.avgSuccess - right.avgSuccess || left.avgNet - right.avgNet)
        .slice(0, 4)
        .map((item) => `${item.title}: basari %${item.avgSuccess.toFixed(1)}, net ${item.avgNet.toFixed(2)}`)
        .join(', ');

    const recent = completed
        .slice(0, 4)
        .map((item) => {
            const title = item?.assignment?.content?.title || 'Icerik';
            return `${title}: basari %${safeNum(item?.resultSummary?.scorePct).toFixed(1)}, net ${safeNum(item?.resultSummary?.net).toFixed(2)}`;
        })
        .join(' | ');

    return [
        `Tamamlanan ogretmen atamasi: ${completed.length}, ortalama basari %${averageSuccess.toFixed(1)}, ortalama net ${averageNet.toFixed(2)}`,
        `En zayif bolumler: ${rankedSections || 'yeterli veri yok'}`,
        `Son sonuclar: ${recent || 'yok'}`,
    ].join('\n');
};

const summarizeNetPressureTopics = (questionAnalyses = []) => {
    if (!Array.isArray(questionAnalyses) || questionAnalyses.length === 0) {
        return 'Net kaybina yol acan tekrarli konu verisi bulunmamaktadır.';
    }

    const grouped = {};
    for (const qa of questionAnalyses) {
        const course = String(qa?.course || 'Bilinmeyen Ders').trim();
        const topic = String(qa?.topic || 'Genel').trim();
        const key = `${course}|${topic}`;
        grouped[key] = grouped[key] || { course, topic, count: 0 };
        grouped[key].count += 1;
    }

    return Object.values(grouped)
        .sort((left, right) => right.count - left.count)
        .slice(0, 6)
        .map((item) => `${item.course} / ${item.topic}: ${item.count} tekrar`)
        .join(' | ');
};

const summarizeNetAnalysisSignals = (exams = []) => {
    if (!Array.isArray(exams) || exams.length === 0) {
        return {
            tytSignal: 'TYT trendi icin veri yok.',
            aytSignal: 'AYT trendi icin veri yok.',
            branchSignal: 'Brans dengesi icin veri yok.',
        };
    }

    const orderedExams = exams
        .slice()
        .sort((left, right) => new Date(left.date || 0).getTime() - new Date(right.date || 0).getTime());

    const firstExam = orderedExams[0];
    const lastExam = orderedExams[orderedExams.length - 1];
    const tytDelta = safeNum(lastExam?.tytNet) - safeNum(firstExam?.tytNet);
    const aytDelta = safeNum(lastExam?.aytNet) - safeNum(firstExam?.aytNet);
    const recentThree = orderedExams.slice(-3);
    const tytFlow = recentThree.map((exam) => `${exam.date || 'Tarihsiz'}=${safeNum(exam.tytNet).toFixed(1)}`).join(' | ');
    const aytFlow = recentThree.map((exam) => `${exam.date || 'Tarihsiz'}=${safeNum(exam.aytNet).toFixed(1)}`).join(' | ');

    const averages = EXAM_SUBJECT_LABELS
        .map(([key, label]) => {
            const total = orderedExams.reduce((sum, exam) => sum + safeNum(exam[key]), 0);
            return { label, avg: total / orderedExams.length };
        })
        .filter((item) => item.avg > 0)
        .sort((left, right) => right.avg - left.avg);

    const strongest = averages.slice(0, 4).map((item) => `${item.label} ${item.avg.toFixed(1)}`);
    const weakest = averages.slice(-4).reverse().map((item) => `${item.label} ${item.avg.toFixed(1)}`);

    return {
        tytSignal: `TYT ilk deneme ${safeNum(firstExam?.tytNet).toFixed(1)}, son deneme ${safeNum(lastExam?.tytNet).toFixed(1)}, degisim ${tytDelta >= 0 ? '+' : ''}${tytDelta.toFixed(1)} net. Son 3 TYT akisi: ${tytFlow || 'yok'}`,
        aytSignal: `AYT ilk deneme ${safeNum(firstExam?.aytNet).toFixed(1)}, son deneme ${safeNum(lastExam?.aytNet).toFixed(1)}, degisim ${aytDelta >= 0 ? '+' : ''}${aytDelta.toFixed(1)} net. Son 3 AYT akisi: ${aytFlow || 'yok'}`,
        branchSignal: `En guclu branslar: ${strongest.join(', ') || 'yok'} | En zayif branslar: ${weakest.join(', ') || 'yok'}`,
    };
};

const buildNetAnalysisEvidence = (exams = [], questionAnalyses = [], assignedContentRecipients = []) => {
    const lines = [];

    if (Array.isArray(exams) && exams.length > 0) {
        const orderedExams = exams
            .slice()
            .sort((left, right) => new Date(left.date || 0).getTime() - new Date(right.date || 0).getTime());
        const firstExam = orderedExams[0];
        const lastExam = orderedExams[orderedExams.length - 1];
        const lastThree = orderedExams.slice(-3);
        const lastThreeTytAvg = lastThree.length > 0
            ? lastThree.reduce((sum, exam) => sum + safeNum(exam.tytNet), 0) / lastThree.length
            : 0;
        const lastThreeAytAvg = lastThree.length > 0
            ? lastThree.reduce((sum, exam) => sum + safeNum(exam.aytNet), 0) / lastThree.length
            : 0;

        const subjectAverages = EXAM_SUBJECT_LABELS
            .map(([key, label]) => ({
                label,
                avg: orderedExams.reduce((sum, exam) => sum + safeNum(exam[key]), 0) / orderedExams.length,
            }))
            .filter((item) => item.avg > 0)
            .sort((left, right) => right.avg - left.avg);

        const strongest = subjectAverages.slice(0, 4).map((item) => `${item.label} ${item.avg.toFixed(1)}`);
        const weakest = subjectAverages.slice(-4).reverse().map((item) => `${item.label} ${item.avg.toFixed(1)}`);

        lines.push(`TYT ilk-son: ${safeNum(firstExam?.tytNet).toFixed(1)} -> ${safeNum(lastExam?.tytNet).toFixed(1)} (degisim ${safeNum(lastExam?.tytNet - safeNum(firstExam?.tytNet)).toFixed(1)})`);
        lines.push(`AYT ilk-son: ${safeNum(firstExam?.aytNet).toFixed(1)} -> ${safeNum(lastExam?.aytNet).toFixed(1)} (degisim ${safeNum(lastExam?.aytNet - safeNum(firstExam?.aytNet)).toFixed(1)})`);
        lines.push(`Son 3 deneme TYT ortalamasi: ${lastThreeTytAvg.toFixed(1)}`);
        lines.push(`Son 3 deneme AYT ortalamasi: ${lastThreeAytAvg.toFixed(1)}`);
        lines.push(`En guclu brans ortalamalari: ${strongest.length > 0 ? strongest.join(', ') : 'hesaplanamadi'}`);
        lines.push(`En zayif brans ortalamalari: ${weakest.length > 0 ? weakest.join(', ') : 'hesaplanamadi'}`);
    } else {
        lines.push('Deneme verisi yetersiz.');
    }

    if (Array.isArray(questionAnalyses) && questionAnalyses.length > 0) {
        const grouped = {};
        for (const qa of questionAnalyses) {
            const course = String(qa?.course || 'Bilinmeyen Ders').trim();
            const topic = String(qa?.topic || 'Genel').trim();
            const key = `${course}|${topic}`;
            grouped[key] = grouped[key] || { course, topic, count: 0 };
            grouped[key].count += 1;
        }
        const topTopics = Object.values(grouped)
            .sort((left, right) => right.count - left.count)
            .slice(0, 6)
            .map((item) => `${item.course} / ${item.topic}: ${item.count}`);
        lines.push(`Neti baskilayan tekrarli konular: ${topTopics.length > 0 ? topTopics.join(', ') : 'yok'}`);
    } else {
        lines.push('Konu tekrar verisi yetersiz.');
    }

    if (Array.isArray(assignedContentRecipients) && assignedContentRecipients.length > 0) {
        const completed = assignedContentRecipients.filter((item) => item?.status === 'completed');
        const avgSuccess = completed.length > 0
            ? completed.reduce((sum, item) => sum + safeNum(item?.resultSummary?.scorePct), 0) / completed.length
            : 0;
        const avgNet = completed.length > 0
            ? completed.reduce((sum, item) => sum + safeNum(item?.resultSummary?.net), 0) / completed.length
            : 0;
        lines.push(`Ogretmen test/PDF tamamlanan sayisi: ${completed.length}, ortalama basari yuzdesi: %${avgSuccess.toFixed(1)}, ortalama net: ${avgNet.toFixed(2)}`);
    } else {
        lines.push('Ogretmen test/PDF sonucu yetersiz.');
    }

    return lines.join('\n');
};

const NET_ANALYSIS_TITLES = [
    'TYT Net Trendi',
    'AYT Net Trendi',
    'Branş Bazlı Taşıyıcılar ve Frenler',
    'Konu Bazlı Net Kaybı ve Öncelik',
];

const formatExamDateLabel = (value) => {
    if (!value) return 'Tarihsiz';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

const getSubjectAverages = (exams = [], prefix = '') => EXAM_SUBJECT_LABELS
    .filter(([key]) => !prefix || key.startsWith(prefix))
    .map(([key, label]) => ({
        label,
        avg: exams.reduce((sum, exam) => sum + safeNum(exam[key]), 0) / Math.max(exams.length, 1),
    }))
    .filter((item) => item.avg > 0)
    .sort((left, right) => right.avg - left.avg);

const getTopTopicBuckets = (questionAnalyses = [], limit = 3) => {
    if (!Array.isArray(questionAnalyses) || questionAnalyses.length === 0) return [];

    const grouped = {};
    for (const qa of questionAnalyses) {
        const course = String(qa?.course || 'Bilinmeyen Ders').trim();
        const topic = String(qa?.topic || 'Genel').trim();
        const key = `${course}|${topic}`;
        grouped[key] = grouped[key] || { course, topic, count: 0 };
        grouped[key].count += 1;
    }

    return Object.values(grouped)
        .sort((left, right) => right.count - left.count)
        .slice(0, limit);
};

const getWeakAssignedSections = (assignedContentRecipients = [], limit = 2) => {
    if (!Array.isArray(assignedContentRecipients) || assignedContentRecipients.length === 0) return [];

    const completed = assignedContentRecipients.filter((item) => item?.status === 'completed');
    if (completed.length === 0) return [];

    const grouped = {};
    for (const recipient of completed) {
        const sections = Array.isArray(recipient?.resultSummary?.sections) ? recipient.resultSummary.sections : [];
        for (const section of sections) {
            const title = String(section?.title || section?.course || 'Bolum').trim();
            grouped[title] = grouped[title] || { title, totalNet: 0, totalSuccess: 0, count: 0 };
            grouped[title].totalNet += safeNum(section?.net);
            grouped[title].totalSuccess += safeNum(section?.scorePct);
            grouped[title].count += 1;
        }
    }

    return Object.values(grouped)
        .map((item) => ({
            title: item.title,
            avgNet: item.totalNet / Math.max(item.count, 1),
            avgSuccess: item.totalSuccess / Math.max(item.count, 1),
        }))
        .sort((left, right) => left.avgSuccess - right.avgSuccess || left.avgNet - right.avgNet)
        .slice(0, limit);
};

const buildNetAnalysisFallback = (exams = [], questionAnalyses = [], assignedContentRecipients = []) => {
    if (!Array.isArray(exams) || exams.length === 0) {
        return [
            'TYT Net Trendi: TYT tarafinda saglikli bir yorum kurmak icin yeterli deneme verisi bulunmuyor. Bu nedenle mevcut tabloyu yukselis ya da dusus olarak etiketlemek yerine once duzenli TYT olcumu biriktirmek daha dogru olur. Net yorumunun guclenmesi icin ilk ihtiyac yeni TYT denemeleridir.',
            'AYT Net Trendi: AYT tarafinda da su an kesin bir ivme analizi kurmaya yetecek veri yok. Bu asamada asil ihtiyac, AYT netlerinin hangi derste tasiyici oldugunu ve hangi derste kirildigini gosterecek yeni sinav verisidir. Yorumdan once olcum guclendirilmelidir.',
            'Branş Bazlı Taşıyıcılar ve Frenler: Branslar arasi dengeyi saglikli okumaya yetecek net dagilimi olusmamis durumda. Bu nedenle hangi alanin netleri tasidigini ya da hangi alanin belirgin bicimde frenledigini kesin olarak soylemek riskli olur. Once brans bazli veri tabani biraz daha genislemelidir.',
            'Konu Bazlı Net Kaybı ve Öncelik: Konu tekrari ile net kaybi arasinda kuvvetli bag kurmak icin veri henuz sinirli. Bu nedenle ilk mudahale alani secilirken yorumdan cok yeni soru ve deneme verisine ihtiyac var. En dogru adim, veri biriktirdikten sonra konu-oncelik siralamasini netlestirmek olur.',
        ];
    }

    const orderedExams = exams
        .slice()
        .sort((left, right) => new Date(left.date || 0).getTime() - new Date(right.date || 0).getTime());
    const firstExam = orderedExams[0];
    const lastExam = orderedExams[orderedExams.length - 1];
    const lastThree = orderedExams.slice(-3);

    const tytDelta = safeNum(lastExam?.tytNet) - safeNum(firstExam?.tytNet);
    const aytDelta = safeNum(lastExam?.aytNet) - safeNum(firstExam?.aytNet);
    const lastThreeTytAvg = lastThree.reduce((sum, exam) => sum + safeNum(exam?.tytNet), 0) / Math.max(lastThree.length, 1);
    const lastThreeAytAvg = lastThree.reduce((sum, exam) => sum + safeNum(exam?.aytNet), 0) / Math.max(lastThree.length, 1);

    const tytSubjects = getSubjectAverages(orderedExams, 'tyt');
    const aytSubjects = getSubjectAverages(orderedExams, 'ayt');
    const allSubjects = getSubjectAverages(orderedExams);
    const topTopics = getTopTopicBuckets(questionAnalyses, 3);
    const weakAssignedSections = getWeakAssignedSections(assignedContentRecipients, 2);

    const bestTyt = tytSubjects[0];
    const weakTyt = tytSubjects[tytSubjects.length - 1];
    const bestAyt = aytSubjects[0];
    const weakAyt = aytSubjects[aytSubjects.length - 1];
    const strongestOverall = allSubjects.slice(0, 2);
    const weakestOverall = allSubjects.slice(-2).reverse();

    const tytFlow = lastThree.map((exam) => `${formatExamDateLabel(exam?.date)} ${safeNum(exam?.tytNet).toFixed(1)}`).join(', ');
    const aytFlow = lastThree.map((exam) => `${formatExamDateLabel(exam?.date)} ${safeNum(exam?.aytNet).toFixed(1)}`).join(', ');
    const topicText = topTopics.length > 0
        ? topTopics.map((item) => `${item.course} ${item.topic} (${item.count} tekrar)`).join(', ')
        : 'tekrar eden konu verisi yok';
    const assignedText = weakAssignedSections.length > 0
        ? weakAssignedSections.map((item) => `${item.title} (%${item.avgSuccess.toFixed(1)}, net ${item.avgNet.toFixed(1)})`).join(', ')
        : 'ogretmen test sonucu sinirli';

    return [
        `TYT Net Trendi: TYT tarafinda ${formatExamDateLabel(firstExam?.date)} tarihli ${safeNum(firstExam?.tytNet).toFixed(1)} netten son denemede ${safeNum(lastExam?.tytNet).toFixed(1)} nete uzanan ${tytDelta >= 0 ? 'olumlu' : 'negatif'} bir hareket goruluyor; toplam degisim ${tytDelta >= 0 ? '+' : ''}${tytDelta.toFixed(1)} net. Son 3 deneme ortalamasinin ${lastThreeTytAvg.toFixed(1)} nete cikmasi, yukselisin yalnizca tek bir sinava bagli olmadigini gosteriyor; ancak bu tablonun kalici guce donusmesi icin ${bestTyt ? `${bestTyt.label} tarafindaki tasiyiciliga` : 'mevcut tasiyici derslere'} ${weakTyt ? `${weakTyt.label} desteğinin eklenmesi` : 'destekleyici brans eklenmesi'} gerekiyor. Bu baslikta ilk mudahale alani ${weakTyt ? weakTyt.label : 'zayif TYT bransi'} tarafini dengelemek olmali.`,
        `AYT Net Trendi: AYT verisi ${formatExamDateLabel(firstExam?.date)} tarihindeki ${safeNum(firstExam?.aytNet).toFixed(1)} netten son denemede ${safeNum(lastExam?.aytNet).toFixed(1)} nete cikarak ${aytDelta >= 0 ? '+' : ''}${aytDelta.toFixed(1)} netlik bir degisim urettigini gosteriyor. Son 3 deneme ortalamasi ${lastThreeAytAvg.toFixed(1)} net bandinda korunurken akis ${aytFlow || 'yetersiz veri'} seklinde ilerliyor; bu da AYT tarafinda belirli bir omurganin olustuguna isaret ediyor. Fakat bu omurganin tek kanalli kalmamasi icin ${bestAyt ? `${bestAyt.label} gucunun yanina` : 'mevcut guclu alanin yanina'} ${weakAyt ? `${weakAyt.label} tarafinda ek destek` : 'ikinci bir tasiyici alan'} eklenmeli.`,
        `Branş Bazlı Taşıyıcılar ve Frenler: Genel tabloda netleri yukari tasiyan alanlar ${strongestOverall.length > 0 ? strongestOverall.map((item) => `${item.label} ${item.avg.toFixed(1)}`).join(' ve ') : 'veri yetersiz'} olarak ayrisiyor. Buna karsilik ${weakestOverall.length > 0 ? weakestOverall.map((item) => `${item.label} ${item.avg.toFixed(1)}`).join(' ve ') : 'zayif halka verisi yok'} seviyesinde kalan branslar toplam ilerlemenin dengeli buyumesini frenliyor. Buradaki asil mesele genel bir basarisizlik degil, netlerin belli derslerde yigilip diger alanlarda destek bulamamasidir; bu nedenle oncelik en guclu dersi daha da buyutmekten cok zayif halkayi kabul edilebilir banda cekmek olmalidir.`,
        `Konu Bazlı Net Kaybı ve Öncelik: Neti baskilayan tekrarli alanlar ${topicText} seklinde birikiyor ve bu tablo, sorunun yalnizca konu gormemek degil, gorulen konularin deneme performansina tam yansimamasindan kaynaklandigini dusunduruyor. Ogretmen tarafindan gonderilen test/PDF sonuclarinda ${assignedText} alanlarinin zayif kalmasi da ayni baskinin farkli olcumlerde tekrar ettigini gosteriyor. Bu nedenle ilk calisma blogunun ${topTopics[0] ? `${topTopics[0].course} ${topTopics[0].topic}` : 'en cok tekrar eden konu'} etrafinda kurulup hemen ardindan ayni eksende brans denemesiyle kontrol edilmesi, en hizli net kazanimi icin en dogru sira olur.`,
    ];
};

const normalizeNetAnalysisItems = (rawItems, fallbackItems) => {
    const ensureArray = Array.isArray(rawItems)
        ? rawItems
        : typeof rawItems === 'string' && rawItems.trim().startsWith('[')
            ? (() => {
                try {
                    const parsed = JSON.parse(rawItems);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (error) {
                    return [];
                }
            })()
            : [];

    return NET_ANALYSIS_TITLES.map((title, index) => {
        const raw = ensureArray[index];
        const fallback = fallbackItems[index];
        if (!raw || typeof raw !== 'string') return `${index + 1}) ${fallback}`;

        let cleaned = raw
            .replace(/^\s*\d+[\)\.]\s*/, '')
            .replace(/^(TYT Net Trendi|AYT Net Trendi|Branş Bazlı Taşıyıcılar ve Frenler|Konu Bazlı Net Kaybı ve Öncelik)\s*:\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim();

        const repeatedTitlePattern = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`, 'i');
        cleaned = cleaned.replace(repeatedTitlePattern, '').trim();

        const normalized = normalizeText(cleaned);
        const hasForbiddenWording = [
            'puan',
            'genel skor',
            'skor',
            'akademik seruven',
            'basari grafigi',
            'konu tamamlama',
            'tamamlama orani',
        ].some((token) => normalized.includes(token));
        const mixesAxes = (index === 0 && normalized.includes('ayt')) || (index === 1 && normalized.includes('tyt'));
        const tooShort = cleaned.length < 120;

        if (hasForbiddenWording || mixesAxes || tooShort) {
            return `${index + 1}) ${fallback}`;
        }

        return `${index + 1}) ${title}: ${cleaned}`;
    });
};

const buildExamReportFallback = (student = {}, exams = [], questionAnalyses = []) => {
    const orderedExams = Array.isArray(exams)
        ? exams
            .slice()
            .sort((left, right) => new Date(left.date || 0).getTime() - new Date(right.date || 0).getTime())
        : [];

    const lastExam = orderedExams[orderedExams.length - 1];
    const previousExam = orderedExams.length >= 2 ? orderedExams[orderedExams.length - 2] : null;
    const tytDelta = previousExam ? safeNum(lastExam?.tytNet) - safeNum(previousExam?.tytNet) : 0;
    const aytDelta = previousExam ? safeNum(lastExam?.aytNet) - safeNum(previousExam?.aytNet) : 0;

    const groupedTopics = {};
    for (const qa of Array.isArray(questionAnalyses) ? questionAnalyses : []) {
        const course = String(qa?.course || 'Bilinmeyen Ders').trim();
        const topic = String(qa?.topic || 'Genel').trim();
        const key = `${course}|${topic}`;
        groupedTopics[key] = groupedTopics[key] || { course, topic, count: 0 };
        groupedTopics[key].count += 1;
    }
    const topTopics = Object.values(groupedTopics)
        .sort((left, right) => right.count - left.count)
        .slice(0, 2)
        .map((item) => `${item.course} / ${item.topic}`)
        .join(', ');

    if (!lastExam) {
        return `Sayın Velimiz, öğrencimizin güncel verileri genel görünümü sağlıklı değerlendirmek için henüz yeterli değil. Düzenli deneme ve konu verisi oluştukça daha net ve yön gösterici bir yorum paylaşabileceğiz. Süreci yakından takip etmeye devam ediyoruz.`;
    }

    const strongestAreas = [
        { label: 'TYT Türkçe', value: safeNum(lastExam?.tytTur) },
        { label: 'TYT Matematik', value: safeNum(lastExam?.tytMat) },
        { label: 'AYT Matematik', value: safeNum(lastExam?.aytMat) },
        { label: 'AYT Fizik', value: safeNum(lastExam?.aytFiz) },
        { label: 'AYT Kimya', value: safeNum(lastExam?.aytKim) },
        { label: 'AYT Biyoloji', value: safeNum(lastExam?.aytBiy) },
    ]
        .filter((item) => item.value > 0)
        .sort((left, right) => right.value - left.value);

    const strongestText = strongestAreas[0]
        ? `${strongestAreas[0].label} tarafındaki ${strongestAreas[0].value.toFixed(1)} net seviyesi`
        : 'güçlü olduğu alanlar';

    const opening = previousExam
        ? `Sayın Velimiz, öğrencimizin son iki deneme verisi genel olarak olumlu bir yön göstermektedir.`
        : `Sayın Velimiz, öğrencimizin güncel deneme verisi genel tabloyu umut veren bir zeminde göstermektedir.`;
    const trend = previousExam
        ? `Son sınavda TYT tarafında ${tytDelta >= 0 ? '+' : ''}${tytDelta.toFixed(1)} net, AYT tarafında ise ${aytDelta >= 0 ? '+' : ''}${aytDelta.toFixed(1)} netlik değişim görülmüştür.`
        : `Mevcut deneme sonucu, özellikle belirleyici derslerde takip edilmesi gereken kıymetli bir referans oluşturmaktadır.`;
    const support = topTopics
        ? `Bununla birlikte ${topTopics} başlıklarında tekrar eden eksikler, yükselişin daha dengeli ilerlemesini sınırlamaktadır.`
        : `Bununla birlikte bazı konu başlıklarında daha planlı bir toparlanma ihtiyacı devam etmektedir.`;

    return `${opening} ${trend} Özellikle ${strongestText}, öğrencimizin güven veren tarafını göstermektedir. ${support} Önümüzdeki süreçte odağımız, güçlü alanları korurken bu eksikleri daha planlı ve kalıcı biçimde toparlamak olacaktır.`;
};

const normalizeExamReportText = (rawText, fallbackText) => {
    let text = String(rawText || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!text) return fallbackText;

    text = text
        .replace(/^["']+|["']+$/g, '')
        .replace(/hazırladığım güncel analiz raporunu aşağıda bilgilerinize sunarım\.?/gi, '')
        .replace(/son 15 günlük performans verileri ve sınav sonuçları ışığında/gi, 'güncel verileri doğrultusunda')
        .replace(/öğrencimiz öğrencimizin/gi, 'öğrencimizin')
        .replace(/\s{2,}/g, ' ')
        .trim();

    const sentenceCount = (text.match(/[.!?]+/g) || []).length;
    const looksTooLong = text.length > 900 || sentenceCount > 6;
    const hasBadPhrases = [
        'aşağıda bilgilerinize sunarım',
        'kritik bir sıkılaşma evresi',
        'kanıtıdır',
        'son 15 günlük',
        'hazırladığım güncel analiz raporu',
    ].some((phrase) => text.toLocaleLowerCase('tr-TR').includes(phrase));

    if (looksTooLong || hasBadPhrases) {
        return fallbackText;
    }

    return text;
};

const generateStudentAnalysis = async (student, exams, field = null, mode = 'batch', questionAnalyses = []) => {
    const analysisExams = field === 'aiExamReport'
        ? (Array.isArray(exams) ? exams.slice(0, 2) : [])
        : exams;
    const examSummary = summarizeExamPerformance(analysisExams);
    const examWindowLabel = field === 'aiExamReport' ? 'Son 2 Deneme' : 'Son 15 Deneme';

    let reportInstructions = "";
    if (field === 'aiExamReport') {
        reportInstructions = `
    Veliye gönderilecek WhatsApp raporunu kısa, premium ve net bir dille yaz.
    Metin 4 veya en fazla 5 cümle olsun.
    İlk cümle kısa bir genel tablo versin.
    İkinci cümle öğrencinin güçlü tarafını veriyle birlikte yorumlasın.
    Üçüncü cümle dikkat isteyen alanı veriyle birlikte yorumlasın.
    Son cümle yön duygusu veren güvenli bir kapanış yapsın.
    Sadece veri söyleme; her önemli verinin ne anlama geldiğini de kısa biçimde açıkla.
    Metinde mutlaka bir güçlü taraf ve bir sınırlayıcı alan bulunsun.
    Deneme verisini ana omurga olarak kullan ama elindeki diğer gerçek verilerden yalnızca yorumu güçlendiren 1 veya 2 kısa destek sinyali ekle.
    Mümkünse son 2 denemeden gelen değişimi kısa bir yorumla bağla.
    Elinde olmayan veri üzerinden yorum yapma; uydurma davranış, hedef veya motivasyon cümlesi kurma.
    Gereksiz giriş, uzun açıklama, tekrar, akademik jargon ve süslü benzetmeler kullanma.
    "aşağıda bilgilerinize sunarım", "kanıtıdır", "kritik evre", "sıkılaşma", "serüven" gibi ifadeleri kullanma.
    Metin WhatsApp'ta tek ekranda rahat okunacak kadar kısa olsun.`;
    } else if (mode === 'individual') {
        reportInstructions = `
    Sen bir eğitim koçusun. Bu öğrenci için SIFIRDAN, tam teşekküllü ve tamamen özgün bir bireysel rapor yaz.
    Herhangi bir şablona veya sabit metne bağlı kalma.
    Giriş, gelişme ve sonuç bölümleri olsun.
    Verileri dürüstçe yorumla, dertleşir gibi değil koçluk yapar gibi ciddi ve yapıcı ol.
    (Toplu üretimdeki kısa analiz notlarından çok daha derin ve kapsamlı olmalı).`;
    } else {
        reportInstructions = `
    Yazacağın analiz her zaman derinlemesine, teknik ve stratejik olmalı.
    Asla yüzeysel veya kısa (hap bilgi) cümleler kurma.
    Öğrencinin deneme netleri ile hatalı soru sayıları arasındaki korelasyonu (bağıntıyı) mutlaka açıkla.`;
    }
    // Prompt Injection koruması — kullanıcı girdilerini sanitize et
    const sanitize = (str) => (str || '').replace(/[<>{}]/g, '').slice(0, 200);
    const safeName = sanitize(student.name);
    const safeTarget = sanitize(student.target);
    const safeClass = sanitize(student.class);
    const safeBranch = sanitize(student.branch);
    const safeGoalUniversity = sanitize(student.goalUniversity);
    const daysToExam = (() => {
        if (!student.examDate) return null;
        const examDate = new Date(student.examDate);
        if (Number.isNaN(examDate.getTime())) return null;
        return Math.ceil((examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    })();

    const topicAnalysisStr = summarizeQuestionAnalyses(questionAnalyses);
    const activitySummaryStr = summarizeDailyActivities(student.dailyActivities || []);
    const attendanceSummaryStr = summarizeAttendance(student.attendances || []);
    const smartQuizSummaryStr = summarizeSmartQuizAttempts(student.smartQuizAttempts || []);
    const assignedContentSummaryStr = summarizeAssignedContentRecipients(student.assignedContentRecipients || []);
    const riskSignalSummaryStr = summarizeRiskSignals(student.guidanceAlerts || [], student.dropAnalyses || []);
    const stressExamSummaryStr = summarizeStressExamSignals(analysisExams);
    const stressTopicPressureStr = summarizeStressTopicPressure(questionAnalyses);
    const netAssignedSummaryStr = summarizeAssignedContentForNetAnalysis(student.assignedContentRecipients || []);
    const netTopicPressureStr = summarizeNetPressureTopics(questionAnalyses);
    const netSignals = summarizeNetAnalysisSignals(analysisExams);
    const netEvidenceStr = buildNetAnalysisEvidence(analysisExams, questionAnalyses, student.assignedContentRecipients || []);
    const parentTopicSummaryStr = (() => {
        if (!Array.isArray(questionAnalyses) || questionAnalyses.length === 0) {
            return 'Belirgin tekrar eden konu verisi yok.';
        }

        const grouped = {};
        for (const qa of questionAnalyses) {
            const course = String(qa?.course || 'Ders').trim();
            const topic = String(qa?.topic || 'Genel').trim();
            const key = `${course}|${topic}`;
            grouped[key] = grouped[key] || { course, topic, count: 0 };
            grouped[key].count += 1;
        }

        return Object.values(grouped)
            .sort((left, right) => right.count - left.count)
            .slice(0, 3)
            .map((item) => `${item.course}/${item.topic}: ${item.count} tekrar`)
            .join(' | ');
    })();
    const parentActivitySignalStr = (() => {
        const activities = Array.isArray(student.dailyActivities) ? student.dailyActivities : [];
        if (activities.length === 0) return 'Calisma ritmi icin veri yok.';
        const ordered = activities
            .slice()
            .sort((left, right) => new Date(left.date || 0).getTime() - new Date(right.date || 0).getTime());
        const last7 = ordered.slice(-7);
        const solved7 = last7.reduce((sum, item) => sum + safeNum(item.solvedCount), 0);
        const active7 = last7.filter((item) => safeNum(item.solvedCount) > 0).length;
        return `Son 7 gun ${solved7} soru, aktif gun ${active7}/${last7.length || 7}`;
    })();
    const parentAssignedSignalStr = (() => {
        const recipients = Array.isArray(student.assignedContentRecipients) ? student.assignedContentRecipients : [];
        const completed = recipients.filter((item) => item?.status === 'completed');
        if (completed.length === 0) {
            return recipients.length > 0
                ? `${recipients.length} atama var, tamamlanan sonuc yok.`
                : 'Ogretmen atamasi sonucu yok.';
        }
        const last = completed[0];
        const title = last?.assignment?.content?.title || 'Son atama';
        const score = last?.resultSummary?.scorePct;
        const net = last?.resultSummary?.net;
        return `${title}: basari %${safeNum(score).toFixed(1)}, net ${safeNum(net).toFixed(2)}`;
    })();

    let jsonFormatStr = "";
    if (field === 'aiComment') {
        jsonFormatStr = `{\n      "ac": ["1) Başlık: En az 300 karakterlik derin analiz", "2) Başlık: En az 300 karakterlik derin analiz", "3) Başlık: En az 300 karakterlik derin analiz", "4) Başlık: En az 300 karakterlik derin analiz"] (Lütfen verileri kullanarak KURUMSAL, ANALİTİK ve HOLİSTİK 4 maddeyi bir dizi olarak yaz. Her madde bir paragraf uzunluğunda ve teknik derinlikte olmalı.)\n    }`;
    } else if (field === 'aiStress') {
        jsonFormatStr = `{\n      "sl": (1 ile 100 arası bir tam sayı. Duygusal dalgalanma veya odaklanma riskini veriyle saptan),\n      "sc": (Öğrencinin bu skorunu etkileyen dış/iç faktörlerin profesyonel bir koçluk perspektifiyle kısa analizi)\n    }`;
    } else if (field === 'aiExamReport') {
        jsonFormatStr = `{\n      "er": (Karakter 2'ye uygun; Veliye gönderilecek, prestijli, kurumsal güven veren ve öğrencinin gelişimine ışık tutan WhatsApp raporu)\n    }`;
    } else if (field === 'aiNetAnalysis') {
        jsonFormatStr = `{\n      "na": [\n        "1) TYT Net Trendi: Yalnızca TYT verisini yorumla; en az 2 sayısal dayanak kullan.",\n        "2) AYT Net Trendi: Yalnızca AYT verisini yorumla; en az 2 sayısal dayanak kullan.",\n        "3) Branş Bazlı Taşıyıcılar ve Frenler: En güçlü ve en zayıf branşları sayısal olarak belirt.",\n        "4) Konu Bazlı Net Kaybı ve Öncelik: Neti aşağı çeken konu tekrarlarını ve ilk çalışma önceliğini yaz."\n      ]\n    }`;
    } else if (field === 'aiTargetAnalysis') {
        jsonFormatStr = `{\n      "ta": ["1) Başlık: Metin", "2) Başlık: Metin", "3) Başlık: Metin"] (Hedef makasını kapatacak 3 stratejik maddeyi dizi olarak yaz.)\n    }`;
    } else if (field === 'aiHardTopics') {
        jsonFormatStr = `{\n      "ht": [{"name": "Konu Adı", "course": "Ders Adı", "count": 12}] (Öğrencinin en çok hata yaptığı 3-5 konuyu, dersini ve hata frekansını dizi olarak yaz.)\n    }`;
    } else {
        jsonFormatStr = `{\n      "sl": (1 ile 100 arası tam sayı),\n      "sc": (Psikolojik odak analizi),\n      "ac": (Karakter 1'e uygun derin stratejik rapor),\n      "er": (Karakter 2'ye uygun kurumsal veli raporu),\n      "na": (4 maddelik derinlemesine net momentum raporu),\n      "ht": [{"name": "Konu Adı", "course": "Ders Adı", "count": 12}],\n      "ta": (Hedef odaklı stratejik yol haritası)\n    }`;
    }

    let characterInstructions = "";
    if (field === 'aiComment' || !field) {
        characterInstructions += `\nKarakter 1 (Holistik Strateji Mentörü): Sen dünya çapında bir "Eğitim Bilimci ve Veri Mühendisi"sin.
    Görevin; öğrencinin deneme sınavlarındaki performans dalgalanmalarını, çözdüğü soru bankalarındaki hata frekanslarıyla, günlük çalışma düzeniyle, devamlılık verileriyle, akıllı quiz sonuçlarıyla ve öğretmen tarafından atanmış test/PDF sonuçlarıyla eşleştirerek derinlemesine, holistik bir analiz sunmaktır.
    Örn: "Öğrencinin Matematik netlerindeki düşüş, TYT Matematik - Fonksiyonlar konusundaki %20'lik hata payıyla doğrudan ilişkilidir" gibi somut ve sayısal korelasyonlar kur.
    Asla genel geçer tavsiyeler verme, doğrudan konulardan, sayılardan ve bu verilerin birbirini nasıl etkilediğinden konuş.
    TYT ve AYT verilerini birbirine toplama; her ikisini ayri eksenler olarak degerlendir ve yorumla.
    Analizlerin 4 ana başlıkta, her biri en az 300 karakterlik, bir makale özeti derinliğinde olmalı.`;
    }
    if (field === 'aiExamReport' || !field) {
        characterInstructions += `\nKarakter 2 (Dürüst Koç): ${reportInstructions} Veliye karşı dürüstlükten ödün verme. (Kişiye özel, veriye dayalı dürüst yorum).`;
    }
    if (field === 'aiExamReport') {
        characterInstructions += ` Veli raporunda son 2 denemeyi merkeze al; daha eski denemeleri merkeze alma. Ancak gerçekten anlamlıysa konu analizi, çalışma düzeni veya öğretmen verisinden en fazla 1-2 destek sinyali ekleyebilirsin. Mesaj 650 karakteri geçmesin. En fazla bir kısa risk alanı söyle; listeleme yapma, tek paragraf yaz. Güçlü alanı söylerken o verinin neden değerli olduğunu, zayıf alanı söylerken de genel tabloyu nasıl sınırladığını mutlaka belirt.`;
    }
    if (field === 'aiNetAnalysis') {
        characterInstructions = `Sen bir "Net ve Deneme Uzmanı"sın. Sadece öğrencinin TYT ve AYT netlerindeki değişimleri, branş bazlı dengesizlikleri ve net artış stratejilerini analiz edersin.
    Tonun premium, kurumsal ve yorum gücü yüksek olsun; mekanik rapor dili kullanma.
    Her maddede en az 2 sayısal dayanak kullan ama sayilari alt alta dizme; sayisal veriyi yorumu guclendiren kanit olarak metnin icine yedir.
    "puan", "genel skor", "skor", "akademik serüven" gibi ifadeleri kullanma.
    Deneme değişimlerini yalnızca "net" diliyle anlat.
    TYT ve AYT maddelerini birbirine karıştırma; biri hakkında yazarken diğerini merkeze koyma.
    "konu tamamlama oranı", "yüzde tamamlandı" gibi net dışı ilerleme anlatıları kurma.
    Her madde tek paragraf olsun ve su akista ilerlesin: once tespit, sonra sebep-sonuc, en sonda ilk mudahale alani.
    Cumleler uzman yorumu gibi aksin; robotik, emir kipli ve tekrarli kaliplardan kacın.`;
    }
    if (field === 'aiStress') {
        characterInstructions = `Sen bir "Eğitim Psikoloğu ve Tercih Danışmanı"sın. Öğrencinin verilerine bakarak sınav stresini, odaklanma risklerini ve psikolojik tırmanış ihtiyacını analiz edersin.
    Stres skorunu esas olarak davranış, devamlılık, aktiflik, yarım bırakma, tekrar eden düşük sonuçlar ve rehberlik/düşüş sinyallerinden üret.
    Deneme verisini sadece ikincil belirti olarak kullan; genel akademik başarı yorumu yazma.
    Öğrenciyi korkutan bir dil kullanma, klinik tespit yapma; yalnızca eğitim koçluğu perspektifinde risk ve destek ihtiyacını yorumla.`;
    }
    if (field === 'aiTargetAnalysis') {
        characterInstructions = `Sen bir "Kariyer Mimarı"sın. Öğrencinin hedefindeki bölüm ile mevcut durumu arasındaki makası kapatacak stratejik adımları belirlersin.`;
    }
    if (field === 'aiHardTopics') {
        characterInstructions = `Sen bir "Soru Bankası Analisti"sin. Öğrencinin çözdüğü sorulardaki hataları, yanlış yaptığı konuları ve kavram yanılgılarını saptarsın. Sadece teknik konu isimlerine ve hata sayılarına odaklan.`;
    }

    const stressPrompt = `
Sen çok üst düzey bir Eğitim Psikoloğu ve Veri Analistisin.

[GÖREVİN VE KARAKTERİN]
${characterInstructions}

[KRİTİK HİTAP KURALI]:
Öğrencilere hitap ederken veya onlardan bahsederken ASLA "Bey" veya "Hanım" gibi ünvanlar kullanma. "Öğrencimiz [İsim]", "[İsim] öğrencimiz" veya sadece "[İsim]" şeklinde hitap et.

[STRES ANALİZİ KURALI]:
Stres skorunu üretirken öncelik sırası şu olsun:
1. Günlük çalışma ritmindeki kırılmalar
2. Devamsızlık ve yoklama bozulmaları
3. Yarım bırakılan veya tekrar gerektiren quiz/test davranışı
4. Rehberlik ve düşüş sinyalleri
5. Son dönemdeki sınav dalgalanması
Akademik başarıyı uzun uzun anlatma; odak davranışsal risk ve psikolojik baskı sinyallerinde olsun.

[Öğrenci Verisi]
<DATA>
- Adı: ${safeName}
- Sinifi: ${safeClass || 'Belirtilmedi'}
- Alanı/Bransı: ${safeBranch || 'Belirtilmedi'}
- Hedef Üniversite/Bölüm: ${safeTarget || 'Belirtilmedi'}
</DATA>
- Konuların Yüzde Kaçı Bitti: %${student.progress || 0}
- Sistemimizde Çözdüğü Toplam Soru: ${student.solvedCount || 0}
- Son Gorulme Bilgisi: ${student.lastSeen || 'Bilinmiyor'}
- Son Aktif Olma Zamanı: ${student.lastActiveAt ? new Date(student.lastActiveAt).toISOString() : 'Bilinmiyor'}
- Sinava Kalan Yaklasik Gun: ${daysToExam !== null ? daysToExam : 'Belirtilmedi'}

[Gunluk Calisma Ritmi]
${activitySummaryStr}

[Devamlilik ve Katilim]
${attendanceSummaryStr}

[Akilli Quiz Davranisi]
${smartQuizSummaryStr}

[Ogretmenin Gonderdigi Test/PDF Disiplini]
${assignedContentSummaryStr}

[Risk ve Rehberlik Sinyalleri]
${riskSignalSummaryStr}

[Son Donem Sinav Dalgalanmasi]
${stressExamSummaryStr}

[Tekrarlayan Baski Alanlari]
${stressTopicPressureStr}

[Kesin JSON Formatı (Çıktıyı süsleme, doğrudan nesne döndür)]
${jsonFormatStr}
  `;

    const netAnalysisPrompt = `
Sen çok üst düzey bir Net ve Deneme Analistisin.

[GÖREVİN VE KARAKTERİN]
${characterInstructions}

[KRİTİK HİTAP KURALI]:
Öğrencilere hitap ederken veya onlardan bahsederken ASLA "Bey" veya "Hanım" gibi ünvanlar kullanma. "Öğrencimiz [İsim]", "[İsim] öğrencimiz" veya sadece "[İsim]" şeklinde hitap et.

[NET ANALİZİ KURALI]:
Bu analizde merkeze sadece sınav netlerini, branş dağılımını, konu kaynaklı net kaybını ve öğretmen tarafından gönderilen test/PDF sonuçlarını koy.
Psikolojik yorum, attendance yorumu, rehberlik yorumu veya genel disiplin yorumu yazma.
TYT ve AYT'yi ayrı ayrı ele al.
Hangi branşın taşıdığını, hangi branşın frenlediğini açık söyle.
Konu tekrarları ile branş netlerini ilişkilendir.
"puan", "genel skor", "skor", "başarı grafiği", "serüven" gibi ifadeleri kullanma.
Deneme değişimlerini yalnızca net cinsinden anlat.
Dört maddeyi tam olarak verilen başlıklarla yaz; başlıkları değiştirme.
Her maddede yorum gücü olsun; sadece sayi okuma yapma.
Ilk cumle salt veri tekrari degil, verinin anlami olsun.
Daha az metrik yig, daha cok neden-sonuc kur.
Her paragraf ogretmen gozunden yazilmis premium uzman yorumu gibi hissedilsin.
Aksiyon cumlesi sert emir kipinde degil, onceliklendirme diliyle bitsin.
Veri yoksa uydurma, "veri yetersiz" de.

[Öğrenci Verisi]
<DATA>
- Adı: ${safeName}
- Sinifi: ${safeClass || 'Belirtilmedi'}
- Alanı/Bransı: ${safeBranch || 'Belirtilmedi'}
</DATA>
- Analize Giren Deneme Sayisi: ${Array.isArray(exams) ? exams.length : 0}

[Net Kanit Paketi]
${netSignals.tytSignal}
${netSignals.aytSignal}
${netSignals.branchSignal}

[Son 15 Deneme Kisa Ozet]
${examSummary.compact}

[Detayli Brans Kirilimi]
${examSummary.detailed}

[Konu Kaynakli Net Baskisi]
${netTopicPressureStr}

[Ogretmen Tarafindan Gonderilen Test/PDF Sonuclari]
${netAssignedSummaryStr}

[Ek Kanit Satirlari]
${netEvidenceStr}

[Kesin JSON Formatı (Çıktıyı süsleme, doğrudan nesne döndür)]
${jsonFormatStr}
  `;

    const generalPrompt = `
Sen çok üst düzey bir Eğitim Stratejisti ve Veri Analistisin.

[GÖREVİN VE KARAKTERİN]
${characterInstructions}

[KRİTİK HİTAP KURALI]:
Öğrencilere hitap ederken veya onlardan bahsederken ASLA "Bey" veya "Hanım" gibi ünvanlar kullanma. "Öğrencimiz [İsim]", "[İsim] öğrencimiz" veya sadece "[İsim]" şeklinde hitap et.

[ÖNEMLİ: HOLİSTİK HARMANLAMA KURALI]:
Analiz yaparken [Derslere Göre Deneme Performansı] tablosu ile [Öğrencinin Hatalı/Zorlandığı Sorular ve Konular] listesini harmanla.
Bir branşta netler düşükse, bunun sebebini hatalı sorular listesindeki ilgili konulardan yola çıkarak teknik bir dille açıkla.
Tahmin yürüten değil, veriyi birbirine bağlayan bir dil kullan.
TYT ve AYT verilerini tek bir toplam net olarak merkeze koyma; her iki sınav eksenini ayri ayri yorumla.

[Öğrenci Verisi]
<DATA>
- Adı: ${safeName}
- Sinifi: ${safeClass || 'Belirtilmedi'}
- Alanı/Bransı: ${safeBranch || 'Belirtilmedi'}
- Hedef Üniversite/Bölüm: ${safeTarget || 'Belirtilmedi'}
- Hedef Universite: ${safeGoalUniversity || 'Belirtilmedi'}
</DATA>
- Konuların Yüzde Kaçı Bitti: %${student.progress || 0}
- Sistemimizde Çözdüğü Toplam Soru: ${student.solvedCount || 0}
- Son Gorulme Bilgisi: ${student.lastSeen || 'Bilinmiyor'}
- Son Aktif Olma Zamanı: ${student.lastActiveAt ? new Date(student.lastActiveAt).toISOString() : 'Bilinmiyor'}
- Hedef Puan: ${student.goalScore || 'Belirtilmedi'}
- Sinava Kalan Yaklasik Gun: ${daysToExam !== null ? daysToExam : 'Belirtilmedi'}

[Deneme Performansi Ozet Verisi]
${examSummary.subjectAverages}
${examSummary.examAxisSummary}

[Derslere Gore Deneme Performansi (${examWindowLabel} Kisa Ozet)]
${examSummary.compact}

[Derslere Gore Deneme Performansi (${examWindowLabel} Detayli Brans Kirilimi)]
${examSummary.detailed}

[Öğrencinin Hatalı/Zorlandığı Sorular ve Konular]
${topicAnalysisStr}

[Gunluk Calisma Duzeni]
${activitySummaryStr}

[Devamlilik ve Katilim]
${attendanceSummaryStr}

[Akilli Quiz Ozeti]
${smartQuizSummaryStr}

[Ogretmenin Gonderdigi Test/PDF Sonuclari]
${assignedContentSummaryStr}

[Risk ve Rehberlik Sinyalleri]
${riskSignalSummaryStr}

[Kesin JSON Formatı (Çıktıyı süsleme, doğrudan nesne döndür)]
${jsonFormatStr}
  `;
    const parentReportPrompt = `
Sen kurumsal ve güven veren bir eğitim koçusun.

GOREV:
- Veliye WhatsApp'ta gidecek kısa öğrenci raporu yaz.
- 4 veya en fazla 5 cümle olsun.
- Tek paragraf yaz, maddeleme yapma.
- İlk cümle genel tabloyu söylesin.
- Bir güçlü tarafı ve bir dikkat isteyen alanı veriye dayanarak belirt.
- Verinin anlamını kısa yorumla; sadece sayı sıralama.
- Elinde olmayan davranış, motivasyon veya hedef uydurma.
- "aşağıda bilgilerinize sunarım", "kanıtıdır", "kritik evre", "sıkılaşma", "serüven" kullanma.
- 650 karakteri geçme.
- Sadece JSON döndür: {"er":"..."}

OGRENCI:
- Ad: ${safeName}
- Sinif: ${safeClass || 'Belirtilmedi'}
- Alan: ${safeBranch || 'Belirtilmedi'}
- Hedef: ${safeTarget || 'Belirtilmedi'}

SON 2 DENEME:
${examSummary.compact}

BRANS KIRILIMI:
${examSummary.detailed}

TEKRAR EDEN KONULAR:
${parentTopicSummaryStr}

DESTEK SINYALLERI:
- Calisma ritmi: ${parentActivitySignalStr}
- Son ogretmen atamasi: ${parentAssignedSignalStr}
`;
    const prompt = field === 'aiStress'
        ? stressPrompt
        : field === 'aiNetAnalysis'
            ? netAnalysisPrompt
            : field === 'aiExamReport'
                ? parentReportPrompt
                : generalPrompt;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_CHAT_MODEL,
            contents: prompt,
            config: {
                responseMimeType: "application/json" // Çıktıyı zorla JSON yapıyoruz
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
            ]
        });

        // Modelden dönen JSON string'ini parse edip nesneye çevirerek döneriz
        let contentText = response.text || "{}";
        console.log("AI_RAW_RESPONSE_BEFORE_CLEAN:", contentText);

        // Markdown bloklarını (```json ... ```) temizleme
        contentText = contentText.replace(/```json/g, '').replace(/```/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(contentText);
        } catch (parseError) {
            console.error("AI_JSON_PARSE_ERROR:", parseError.message);
            // JSON beklenen yerden başlamıyor olabilir, ilk '{' ve son '}' arasını bulmaya çalış
            const firstBrace = contentText.indexOf('{');
            const lastBrace = contentText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                try {
                    const extractedJson = contentText.substring(firstBrace, lastBrace + 1);
                    parsed = JSON.parse(extractedJson);
                } catch (innerError) {
                    console.error("AI_EXTRACTED_JSON_PARSE_ERROR:", innerError.message);
                    throw parseError;
                }
            } else {
                throw parseError;
            }
        }

        // Tasarruf amaçlı kısaltılmış JSON key'lerini veritabanı (Prisma) şemasına geri map ediyoruz
        // AI bazen tam anahtar isimlerini de kullanabiliyor, ikisini de destekleyelim
        const getVal = (short, long) => parsed[short] !== undefined ? parsed[short] : parsed[long];
        const netFallbackItems = buildNetAnalysisFallback(exams, questionAnalyses, student.assignedContentRecipients || []);
        const normalizedNetAnalysis = normalizeNetAnalysisItems(getVal('na', 'aiNetAnalysis'), netFallbackItems);
        const examReportFallback = buildExamReportFallback(student, analysisExams, questionAnalyses);
        const normalizedExamReport = normalizeExamReportText(getVal('er', 'aiExamReport'), examReportFallback);

        return {
            aiStressLevel: getVal('sl', 'aiStressLevel'),
            aiStressComment: getVal('sc', 'aiStressComment'),
            aiComment: Array.isArray(getVal('ac', 'aiComment')) ? JSON.stringify(getVal('ac', 'aiComment')) : getVal('ac', 'aiComment'),
            aiExamReport: normalizedExamReport,
            aiNetAnalysis: JSON.stringify(normalizedNetAnalysis),
            aiHardTopics: getVal('ht', 'aiHardTopics') || [],
            aiTargetAnalysis: Array.isArray(getVal('ta', 'aiTargetAnalysis')) ? JSON.stringify(getVal('ta', 'aiTargetAnalysis')) : getVal('ta', 'aiTargetAnalysis')
        };
    } catch (error) {
        console.error("Gemini API Error (Student Analysis):", error);
        const examReportFallback = buildExamReportFallback(student, analysisExams, questionAnalyses);
        return {
            aiStressLevel: 0,
            aiStressComment: "Duygu durumu analizi geçici olarak sağlanamıyor.",
            aiComment: "Yapay zeka analiz işlemi geçici olarak sağlanamıyor.",
            aiExamReport: examReportFallback,
            aiNetAnalysis: "Deneme netleri analizi oluşturulamadı.",
            aiHardTopics: [],
            aiTargetAnalysis: "Hedef uyum analizine ulaşılamadı."
        };
    }
};

/**
 * Geleneksel Hash (SHA-256) Üretimi
 * Öğrencinin sorusundaki boşlukları ve noktalamaları silip standart bir SHA-256 hash'i alır.
 * Birebir aynı metinleri (kopyala-yapıştır vb) anında yakalamak içindir. ($0 Maliyet)
 */
const generateTraditionalHash = (course, text) => {
    if (!text) return null;

    // Metin temizliği: Tüm boşlukları ve harf/rakam dışı karakterleri kaldır, küçük harfe çevir
    const cleanText = text.toLowerCase().replace(/[\s\W_]+/g, '');

    if (cleanText.length === 0) return null;

    // Temizlenmiş metnin SHA-256 şifresini al (Ders adını da katıyoruz ki karışmasın)
    const rawString = `${course}_${cleanText}`;
    return crypto.createHash('sha256').update(rawString).digest('hex');
};

/**
 * Görseller için pHash (Algısal Özetleme) Üretimi
 * pHash kullanarak görselin matematiksel özetini çıkarır.
 * Ufak kırpma veya ışık farklarında bile aynı/yakın değeri üretir.
 */
const generateImageHash = async (base64Image) => {
    if (!base64Image) return null;
    try {
        // Base64 formatındaki image datasını temizle
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // imghash kullanarak 8 bitlik pHash üret (64 karakter)
        const hash = await imghash.hash(imageBuffer, 8, 'hex');
        return hash;
    } catch (error) {
        console.error("Görsel Hash (pHash) Üretimi Hatası:", error);
        // Hata durumunda (örneğin kütüphane resmi okuyamazsa) düz sha-256'ya gerile (fallback)
        return crypto.createHash('sha256').update(base64Image).digest('hex');
    }
};

const normalizeSemanticText = (value = '') =>
    String(value || '')
        .trim()
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const SEMANTIC_FILLER_WORDS = new Set([
    'nedir', 'ne', 'demek', 'anlama', 'gelir', 'kimdir', 'nelerdir', 'acikla',
    'anlat', 'kisaca', 'kisa', 'ozetle', 'ozeti', 'tanimla', 'tanimi',
    'ozellikleri', 'hakkinda', 'bilgi', 'ver', 'bana', 'lutfen', 'bir',
    'soru', 'sorusu', 'konusu', 'konusunu', 'ile', 'ilgili'
]);

const SEMANTIC_TOPIC_STOP_WORDS = new Set([
    'amac', 'amaci', 'gorev', 'gorevi', 'onem', 'onemi', 'neden', 'sebep',
    'sebebi', 'sonuc', 'sonuclari', 'sonucu', 'evre', 'evreleri', 'asama',
    'asamalari', 'basamak', 'basamaklari', 'adim', 'adimlari', 'fark',
    'farki', 'farklari', 'ornek', 'ornekleri', 'nasil', 'bulunur',
    'hesaplanir', 'hesaplanmasi', 'hesaplama', 'bulma', 'bulunma',
    'ozellik', 'ozellikleri', 'surec', 'yontem', 'gore', 'gorevi'
]);

const SEMANTIC_INTENT_ALIASES = {
    comparison: 'comparison',
    compare: 'comparison',
    differences: 'comparison',
    difference: 'comparison',
    cause_effect: 'cause_effect',
    reason: 'cause_effect',
    reasons: 'cause_effect',
    why: 'cause_effect',
    process: 'process',
    steps: 'process',
    method: 'process',
    how: 'process',
    definition: 'definition',
    define: 'definition',
    concept: 'definition',
    example: 'example',
    examples: 'example',
    general: 'general',
};

const SEMANTIC_SCOPE_ALIASES = {
    general: 'general',
    stages: 'stages',
    stage: 'stages',
    process: 'stages',
    steps: 'stages',
    differences: 'differences',
    difference: 'differences',
    compare: 'differences',
    comparison: 'differences',
    examples: 'examples',
    example: 'examples',
    reasons: 'reasons',
    reason: 'reasons',
    causes: 'reasons',
    cause: 'reasons',
    why: 'reasons',
    purpose: 'purpose',
    goal: 'purpose',
    role: 'purpose',
    mission: 'purpose',
    importance: 'purpose',
    method: 'method',
    how: 'method',
    calculation: 'method',
    solution: 'method',
    properties: 'properties',
    property: 'properties',
    outcomes: 'results',
    outcome: 'results',
    results: 'results',
    result: 'results',
};

const SEMANTIC_PHRASE_SYNONYMS = {
    biyoloji: {
        'mitoz bolunme': 'mitoz',
        'mayoz bolunme': 'mayoz',
    },
    tarih: {
        'tanzimat fermani': 'tanzimat',
    },
    turkce: {
        'ana fikir': 'ana dusunce',
        'paragrafta ana dusunce': 'ana dusunce',
        'paragraf ana dusunce': 'ana dusunce',
        'yardimci fikir': 'yardimci dusunce',
    },
    fizik: {
        'bileske kuvvet': 'net kuvvet',
    },
};

const SEMANTIC_TOKEN_SYNONYMS = {
    biyoloji: {
        bolunme: '',
    },
    turkce: {
        paragrafta: '',
        fikir: 'dusunce',
    },
    fizik: {
        bileske: 'net',
    },
};

const mapCourseSemanticKey = (course = '') => {
    const normalized = normalizeSemanticText(course);
    if (normalized.includes('geometri')) return 'geometri';
    if (normalized.includes('matematik')) return 'matematik';
    if (normalized.includes('fizik')) return 'fizik';
    if (normalized.includes('kimya')) return 'kimya';
    if (normalized.includes('biyoloji')) return 'biyoloji';
    if (normalized.includes('turkce')) return 'turkce';
    if (normalized.includes('tarih')) return 'tarih';
    if (normalized.includes('cografya')) return 'cografya';
    if (normalized.includes('felsefe')) return 'felsefe';
    if (normalized.includes('din')) return 'din';
    if (normalized.includes('edebiyat')) return 'edebiyat';
    return normalized || 'genel';
};

const normalizeSemanticPhrase = (course, value = '') => {
    const courseKey = mapCourseSemanticKey(course);
    let normalized = normalizeSemanticText(value);
    if (!normalized) return '';

    const phraseSynonyms = SEMANTIC_PHRASE_SYNONYMS[courseKey] || {};
    for (const [from, to] of Object.entries(phraseSynonyms)) {
        const pattern = new RegExp(`\\b${from}\\b`, 'g');
        normalized = normalized.replace(pattern, to);
    }

    const tokenSynonyms = SEMANTIC_TOKEN_SYNONYMS[courseKey] || {};
    const tokens = normalized
        .split(' ')
        .map((token) => tokenSynonyms[token] ?? token)
        .filter((token) => token && !SEMANTIC_FILLER_WORDS.has(token));

    return tokens.join('_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
};

const normalizeSemanticTopic = (course, value = '') => {
    const courseKey = mapCourseSemanticKey(course);
    let normalized = normalizeSemanticText(value);
    if (!normalized) return '';

    const phraseSynonyms = SEMANTIC_PHRASE_SYNONYMS[courseKey] || {};
    for (const [from, to] of Object.entries(phraseSynonyms)) {
        const pattern = new RegExp(`\\b${from}\\b`, 'g');
        normalized = normalized.replace(pattern, to);
    }

    const tokenSynonyms = SEMANTIC_TOKEN_SYNONYMS[courseKey] || {};
    const tokens = normalized
        .split(' ')
        .map((token) => tokenSynonyms[token] ?? token)
        .filter((token) =>
            token &&
            !SEMANTIC_FILLER_WORDS.has(token) &&
            !SEMANTIC_TOPIC_STOP_WORDS.has(token)
        );

    return tokens.join('_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
};

const inferSemanticIntent = (text = '') => {
    const normalized = normalizeSemanticText(text);
    if (!normalized) return 'general';
    if (/\b(karsilastir|fark|farki|arasindaki fark)\b/.test(normalized)) return 'comparison';
    if (/\b(ornek|ornekle)\b/.test(normalized)) return 'example';
    if (/\b(neden|sebep|sebebi|sonuc|etki)\b/.test(normalized)) return 'cause_effect';
    if (/\b(amac|amaci|gorev|gorevi|onem|onemi)\b/.test(normalized)) return 'cause_effect';
    if (/\b(evre|asama|basamak|adim|nasil|hesaplanir|bulunur)\b/.test(normalized)) return 'process';
    if (/\b(nedir|ne demek|ne anlama gelir|kimdir|nelerdir|tanimla|acikla|anlat)\b/.test(normalized)) return 'definition';
    return 'general';
};

const inferSemanticScope = (text = '') => {
    const normalized = normalizeSemanticText(text);
    if (!normalized) return 'general';
    if (/\b(evre|evreleri|asama|asamalari|basamak)\b/.test(normalized)) return 'stages';
    if (/\b(fark|farki|karsilastir)\b/.test(normalized)) return 'differences';
    if (/\b(ornek|ornekle)\b/.test(normalized)) return 'examples';
    if (/\b(neden|sebep|sebebi)\b/.test(normalized)) return 'reasons';
    if (/\b(amac|amaci|gorev|gorevi|onem|onemi)\b/.test(normalized)) return 'purpose';
    if (/\b(nasil|hesaplanir|bulunur|hesaplanmasi|cozulur)\b/.test(normalized)) return 'method';
    if (/\b(sonuc|sonuclari|etki|etkileri)\b/.test(normalized)) return 'results';
    if (/\b(ozellik|ozellikleri)\b/.test(normalized)) return 'properties';
    return 'general';
};

const sanitizeSemanticPart = (course, value, fallback = 'general') => {
    const normalized = normalizeSemanticPhrase(course, value);
    return normalized || fallback;
};

const sanitizeSemanticIntent = (course, value, fallback = 'general') => {
    const normalized = sanitizeSemanticPart(course, value, fallback);
    return SEMANTIC_INTENT_ALIASES[normalized] || fallback;
};

const sanitizeSemanticScope = (course, value, fallbackText = '', fallback = 'general') => {
    const normalized = sanitizeSemanticPart(course, value, fallback);
    const mapped = SEMANTIC_SCOPE_ALIASES[normalized];
    if (mapped) return mapped;
    return inferSemanticScope(fallbackText) || fallback;
};

const sanitizeSemanticTopic = (course, value, fallback = 'general') => {
    const normalized = normalizeSemanticTopic(course, value);
    return normalized || fallback;
};

const canonicalIntentFromScope = (scope, fallbackIntent = 'general') => {
    switch (scope) {
        case 'differences':
            return 'comparison';
        case 'examples':
            return 'example';
        case 'stages':
        case 'method':
            return 'process';
        case 'reasons':
        case 'purpose':
        case 'results':
            return 'cause_effect';
        case 'properties':
            return 'definition';
        default:
            return fallbackIntent;
    }
};

const buildSemanticHashV2 = ({ course, intent, topic, scope }) => {
    const courseKey = mapCourseSemanticKey(course);
    const safeIntent = sanitizeSemanticIntent(course, intent, 'general');
    const safeTopic = sanitizeSemanticTopic(course, topic, 'general');
    const safeScope = sanitizeSemanticScope(course, scope, `${topic} ${scope}`, 'general');
    return ['v2', courseKey, safeIntent, safeTopic, safeScope]
        .filter(Boolean)
        .join('_')
        .replace(/_+/g, '_');
};

/**
 * Semantic Hash v2
 * Modelden serbest etiket istemek yerine yapılandırılmış anlam çıkarımı alır,
 * ardından hash'i deterministik olarak backend üretir.
 */
const generateSemanticHash = async (course, questionText, base64Image = null) => {
    const normalizedQuestion = normalizeSemanticText(questionText);
    if (!normalizedQuestion) return null;

    const fallbackIntent = inferSemanticIntent(questionText);
    const fallbackScope = inferSemanticScope(questionText);
    const fallbackTopic = sanitizeSemanticTopic(course, questionText, 'general');

    const prompt = `
Sen bir "Semantic Cache Parser" sistemisin.
Girdi olarak verilen soru için sadece JSON döndür.

GOREV:
- Sorunun ANA KONUSUNU bul.
- Sorunun NIYETINI bul.
- Sorunun KAPSAMINI bul.
- Bu sorunun onceki sohbet baglamina ihtiyac duyup duymadigini belirt.

JSON SEMASI:
{
  "topic": "kisa kanonik konu",
  "intent": "definition|comparison|cause_effect|process|example|general",
  "scope": "general|stages|differences|examples|reasons|purpose|method|results|properties",
  "requires_context": false,
  "confidence": 0.0
}

KURALLAR:
- Sadece JSON döndür.
- "Mitoz nedir?" ve "Mitoz bölünme nedir?" gibi sorularda topic ayni oz kavramda birlessin.
- "Ana dusunce nedir?" ile "Paragrafta ana dusunce ne demek?" gibi sorularda topic ayni kalsin.
- Devam sorusu, zamirli soru veya onceki cevaba bagli soruysa requires_context=true don.
- topic en fazla 2-4 kelimelik kanonik ifade olsun.

Ders: ${course}
Soru: ${questionText}
  `;

    try {
        let contents;
        if (base64Image) {
            contents = [
                { text: prompt },
                { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
            ];
        } else {
            contents = prompt;
        }

        const response = await ai.models.generateContent({
            model: GEMINI_CHAT_MODEL,
            contents,
            config: {
                responseMimeType: "application/json",
            },
        });

        let parsed = {};
        try {
            parsed = JSON.parse(response.text || '{}');
        } catch (parseError) {
            console.error("AI Semantic Hash JSON Parse Error:", parseError);
        }

        const requiresContext = parsed.requires_context === true;
        const confidence = Number(parsed.confidence || 0);
        if (requiresContext || confidence < 0.45) {
            return null;
        }

        const topic = sanitizeSemanticTopic(course, parsed.topic, fallbackTopic);
        const aiIntent = sanitizeSemanticIntent(course, parsed.intent, fallbackIntent);
        const aiScope = sanitizeSemanticScope(course, parsed.scope, questionText, fallbackScope);
        const scope =
            aiIntent === 'definition' && fallbackScope === 'general'
                ? 'general'
                : aiScope;
        const intent = canonicalIntentFromScope(scope, aiIntent);

        return buildSemanticHashV2({
            course,
            intent,
            topic,
            scope,
        });
    } catch (error) {
        console.error("AI Semantic Hash Error:", error);
        return buildSemanticHashV2({
            course,
            intent: canonicalIntentFromScope(fallbackScope, fallbackIntent),
            topic: fallbackTopic,
            scope: fallbackScope,
        });
    }
};

/**
 * Gemini Embedding API ile soruyu matematiksel bir vektöre (768 boyut) dönüştürür.
 * Bu vektör, iki sorunun anlamsal yakınlığını ölçmek için kullanılır.
 */
const generateEmbedding = async (text) => {
    try {
        const response = await ai.models.embedContent({
            model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
            contents: text,
            config: {
                taskType: 'SEMANTIC_SIMILARITY',
            },
        });
        return response.embeddings[0].values;
    } catch (error) {
        console.error("Embedding generation error:", error);
        return null;
    }
};

/**
 * İki vektör arasındaki kosinüs benzerliğini (0 ile 1 arası) hesaplar.
 * 1 = tamamen aynı anlam, 0 = hiç ilgisi yok
 */
const cosineSimilarity = (vecA, vecB) => {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const getSmartQuizSourceMeta = (attempt = {}) => {
    const id = String(attempt?.id || '');
    if (id.startsWith('sq_panel_') || id.startsWith('sq_manual_')) {
        return { key: 'teacher', label: 'Ogretmen Gonderdi' };
    }
    return { key: 'system', label: 'Sistem Onerdi' };
};

const normalizeSmartQuizAttempt = (attempt = {}) => {
    const score = safeNum(attempt?.score);
    const status = String(attempt?.status || 'pending');
    const assignedAt = attempt?.assignedAt || attempt?.createdAt || null;
    const completedAt = attempt?.completedAt || null;
    const updatedAt = attempt?.updatedAt || attempt?.progressUpdatedAt || assignedAt;
    const totalCount = Number.isFinite(Number(attempt?.totalCount))
        ? Number(attempt.totalCount)
        : Number(attempt?.questionCount || 0);
    const correctCount = Number.isFinite(Number(attempt?.correctCount))
        ? Number(attempt.correctCount)
        : null;

    return {
        ...attempt,
        status,
        assignedAt,
        completedAt,
        updatedAt,
        totalCount,
        correctCount,
        score,
        scorePct: Math.round(score * 100),
        source: getSmartQuizSourceMeta(attempt),
        isNeedsSupport: status === 'completed' && score < 0.67,
    };
};

const formatSmartQuizDate = (value) => {
    if (!value) return 'Tarihsiz';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

const buildSmartQuizOverviewMetrics = (attempts = []) => {
    const normalized = Array.isArray(attempts)
        ? attempts.map(normalizeSmartQuizAttempt)
        : [];

    const completed = normalized.filter((item) => item.status === 'completed');
    const pending = normalized.filter((item) => item.status === 'pending');
    const inProgress = normalized.filter((item) => item.status === 'in_progress');
    const teacherAssigned = normalized.filter((item) => item.source.key === 'teacher');
    const systemAssigned = normalized.filter((item) => item.source.key === 'system');
    const averageScore = completed.length > 0
        ? completed.reduce((sum, item) => sum + item.scorePct, 0) / completed.length
        : 0;

    const completedTrend = completed
        .slice()
        .sort((left, right) => new Date(left.completedAt || left.assignedAt || 0).getTime() - new Date(right.completedAt || right.assignedAt || 0).getTime())
        .slice(-5);
    const trendDelta = completedTrend.length >= 2
        ? safeNum(completedTrend[completedTrend.length - 1]?.scorePct) - safeNum(completedTrend[0]?.scorePct)
        : 0;

    const courseStats = {};
    for (const attempt of completed) {
        const course = String(attempt?.course || 'Bilinmeyen Ders').trim();
        courseStats[course] = courseStats[course] || { course, totalScore: 0, count: 0, supportHits: 0 };
        courseStats[course].totalScore += attempt.scorePct;
        courseStats[course].count += 1;
        if (attempt.isNeedsSupport) courseStats[course].supportHits += 1;
    }

    const rankedCourses = Object.values(courseStats)
        .map((item) => ({
            course: item.course,
            avgScore: item.totalScore / Math.max(item.count, 1),
            count: item.count,
            supportHits: item.supportHits,
        }))
        .sort((left, right) => left.avgScore - right.avgScore || right.supportHits - left.supportHits || right.count - left.count);

    const topicClusters = {};
    for (const attempt of completed) {
        const course = String(attempt?.course || 'Bilinmeyen Ders').trim();
        const topic = String(attempt?.topic || 'Genel').trim();
        const key = `${course}|${topic}`;
        topicClusters[key] = topicClusters[key] || { course, topic, attempts: 0, totalScore: 0, supportHits: 0 };
        topicClusters[key].attempts += 1;
        topicClusters[key].totalScore += attempt.scorePct;
        if (attempt.isNeedsSupport) topicClusters[key].supportHits += 1;
    }

    const weakTopics = Object.values(topicClusters)
        .map((item) => ({
            ...item,
            avgScore: item.totalScore / Math.max(item.attempts, 1),
        }))
        .sort((left, right) => left.avgScore - right.avgScore || right.supportHits - left.supportHits || right.attempts - left.attempts)
        .slice(0, 4);

    const recentFlow = normalized
        .slice()
        .sort((left, right) => new Date(right.assignedAt || right.createdAt || 0).getTime() - new Date(left.assignedAt || left.createdAt || 0).getTime())
        .slice(0, 6)
        .map((item) => `${formatSmartQuizDate(item.assignedAt)} ${item.course}/${item.topic} ${item.status === 'completed' ? `%${item.scorePct}` : item.status}`)
        .join(' | ');

    return {
        normalized,
        completed,
        pending,
        inProgress,
        teacherAssigned,
        systemAssigned,
        averageScore,
        completedTrend,
        trendDelta,
        rankedCourses,
        weakTopics,
        recentFlow,
    };
};

const buildSmartQuizOverviewFallback = (student = {}, attempts = []) => {
    const metrics = buildSmartQuizOverviewMetrics(attempts);

    if (metrics.normalized.length === 0) {
        return 'Akıllı quiz tarafında henüz yorum kurulacak veri bulunmuyor. Bu kartın anlamlı hale gelmesi için önce öğrencinin birkaç quiz akışının birikmesi gerekiyor.';
    }

    const weakCourse = metrics.rankedCourses[0];
    const strongCourse = metrics.rankedCourses.length > 0 ? metrics.rankedCourses[metrics.rankedCourses.length - 1] : null;
    const weakTopic = metrics.weakTopics[0];
    const trendText = metrics.completedTrend.length < 2
        ? 'tamamlanan quiz sayısı henüz trend kuracak seviyede değil'
        : metrics.trendDelta >= 10
            ? `son 5 quizte ${metrics.trendDelta >= 0 ? '+' : ''}${metrics.trendDelta.toFixed(0)} puanlik toparlanma var`
            : metrics.trendDelta <= -10
                ? `son 5 quizte ${metrics.trendDelta.toFixed(0)} puanlik gerileme goruluyor`
                : 'son quizlerde belirgin bir toparlanma ya da dusus yerine dengeli bir seyir var';

    return [
        `${student?.name || 'Ogrencimiz'} icin akilli quiz akisi genel olarak ${metrics.completed.length} tamamlanan, ${metrics.pending.length} bekleyen ve ${metrics.inProgress.length} yarim kalan kayit uzerinden okunuyor. Tamamlanan quizlerde ortalama basari %${metrics.averageScore.toFixed(1)} seviyesinde; bu tablo bize tek tek quiz sonucundan cok genel ritmi gosteriyor.`,
        `${trendText.charAt(0).toUpperCase()}${trendText.slice(1)}. ${strongCourse ? `${strongCourse.course} tarafi %${strongCourse.avgScore.toFixed(1)} ortalama ile daha guvenli gorunurken` : 'Guvenli bir tasiyici ders henuz net degil,'} ${weakCourse ? `${weakCourse.course} tarafi %${weakCourse.avgScore.toFixed(1)} ortalama ile daha kirilgan duruyor.` : 'zayif halka tarafinda veri sinirli.'}`,
        `${weakTopic ? `Ozellikle ${weakTopic.course} / ${weakTopic.topic} konusu ${weakTopic.attempts} quiz ve %${weakTopic.avgScore.toFixed(1)} ortalama ile tekrar isteyen ana odak olarak ayrisiyor.` : 'Tekrar isteyen belirgin bir konu kumesi henuz olusmamis.'} Bu kartta ilk oncelik, tekrar isteyen alanlari yeniden quizleyip quiz sonucu ile konu hakimiyetini birlikte takip etmek olmali.`,
    ].join(' ');
};

const buildSmartQuizAttemptFallback = (student = {}, attempt = {}) => {
    const item = normalizeSmartQuizAttempt(attempt);
    const statusText = item.status === 'completed'
        ? `%${item.scorePct} basari ve ${item.correctCount ?? 0}/${item.totalCount || 0} dogru ile tamamlanmis`
        : item.status === 'in_progress'
            ? 'ogrenci tarafindan acilmis ancak henuz tamamlanmamis'
            : 'henuz ogrenci tarafindan acilmamis';
    const supportText = item.status === 'completed'
        ? item.isNeedsSupport
            ? 'Sonuc bu konuda yeniden temas gerektirdigini gosteriyor.'
            : 'Sonuc, bu tur icin konunun guvenli banda yaklastigini gosteriyor.'
        : 'Bu nedenle bu quizin asil degeri, tamamlanma davranisi ile sonucunun birlikte izlenmesinde olacak.';

    return `${student?.name || 'Ogrencimiz'} icin ${item.course || 'Ders'} / ${item.topic || 'Konu'} quizi ${statusText}. ${item.reason ? `Quiz notunda "${item.reason}" vurgusu bulunuyor; bu da gonderimin rastgele degil, belirli bir ihtiyaca bagli kuruldugunu gosteriyor.` : 'Bu quiz belirli bir takip ihtiyacina cevap vermek icin gonderilmis gorunuyor.'} ${supportText} Bu kartta ilk oncelik, ayni konuda bir sonraki sonucu onceki quizle karsilastirarak gercek ilerlemeyi netlestirmek olmali.`;
};

const generateSmartQuizOverviewAnalysis = async (student = {}, attempts = []) => {
    const metrics = buildSmartQuizOverviewMetrics(attempts);
    const fallback = buildSmartQuizOverviewFallback(student, attempts);
    const sanitize = (str) => String(str || '').replace(/[<>{}]/g, '').slice(0, 160);

    const weakCourse = metrics.rankedCourses[0];
    const strongCourse = metrics.rankedCourses.length > 0 ? metrics.rankedCourses[metrics.rankedCourses.length - 1] : null;
    const weakTopicsText = metrics.weakTopics.length > 0
        ? metrics.weakTopics.map((item) => `${item.course}/${item.topic}: %${item.avgScore.toFixed(1)} ortalama, ${item.attempts} quiz`).join(' | ')
        : 'Belirgin tekrar isteyen konu yok';
    const trendFlow = metrics.completedTrend.length > 0
        ? metrics.completedTrend.map((item) => `${formatSmartQuizDate(item.completedAt || item.assignedAt)}=%${item.scorePct}`).join(' | ')
        : 'Trend kuracak tamamlanan quiz yok';

    const prompt = `
Sen ust duzey bir egitim kocu ve quiz performans analistisin.

GOREV:
- Ogrencinin akilli quiz akisini tek paragrafta premium ve dogal bir Turkce ile yorumla.
- Mekanik rapor dili kullanma.
- Sayisal veriyi metnin icine yedir, sadece rakam siralama yapma.
- Once genel tabloyu, sonra belirgin guclu/zayif alanlari, en sonda ilk onceligi soyle.
- "puan", "skor", "seruven", "grafik" gibi ifadeleri kullanma; "basari" ve "quiz sonucu" dili kullan.
- 4 ile 6 cumle arasi yaz.

OGRENCI:
- Ad: ${sanitize(student?.name)}
- Sinif: ${sanitize(student?.class)}
- Alan: ${sanitize(student?.branch)}
- Hedef: ${sanitize(student?.target)}

QUIZ OZETI:
- Toplam quiz: ${metrics.normalized.length}
- Tamamlanan: ${metrics.completed.length}
- Bekleyen: ${metrics.pending.length}
- Yarim kalan: ${metrics.inProgress.length}
- Ogretmen gonderdi: ${metrics.teacherAssigned.length}
- Sistem onerdi: ${metrics.systemAssigned.length}
- Ortalama basari: %${metrics.averageScore.toFixed(1)}
- Son 5 tamamlanan quiz akisi: ${trendFlow}
- Son quiz trend farki: ${metrics.completedTrend.length >= 2 ? `${metrics.trendDelta >= 0 ? '+' : ''}${metrics.trendDelta.toFixed(0)}` : 'veri yetersiz'}
- En kirilgan ders: ${weakCourse ? `${weakCourse.course} (%${weakCourse.avgScore.toFixed(1)})` : 'veri yetersiz'}
- En guvenli ders: ${strongCourse ? `${strongCourse.course} (%${strongCourse.avgScore.toFixed(1)})` : 'veri yetersiz'}
- Tekrar isteyen konu kumeleri: ${weakTopicsText}
- Son quiz akisi: ${metrics.recentFlow || 'yok'}

CIKTI:
- Sadece duz metin don.
- Baslik koyma.
- Tek paragraf yaz.
`;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_CHAT_MODEL,
            contents: prompt,
        });

        const text = String(response?.text || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 180) return fallback;
        return text;
    } catch (error) {
        console.error('SMART_QUIZ_OVERVIEW_AI_ERROR:', error);
        return fallback;
    }
};

const generateSmartQuizAttemptAnalysis = async (student = {}, attempt = {}) => {
    const item = normalizeSmartQuizAttempt(attempt);
    const fallback = buildSmartQuizAttemptFallback(student, attempt);
    const sanitize = (str) => String(str || '').replace(/[<>{}]/g, '').slice(0, 180);
    const answeredCount = Array.isArray(item?.progressSelectedAnswers)
        ? item.progressSelectedAnswers.filter((value) => value !== null && value !== undefined).length
        : 0;
    const questionPreview = Array.isArray(item?.progressQuestions)
        ? item.progressQuestions.slice(0, 2).map((question, index) => `S${index + 1}: ${sanitize(question?.question || '')}`).join(' | ')
        : '';

    const prompt = `
Sen ust duzey bir egitim kocu ve quiz takip uzmansin.

GOREV:
- Tek bir quiz kaydi icin kisa ama guclu bir yorum yaz.
- Dogal Turkce kullan, mekanik rapor dili kullanma.
- Quizin niye gonderildigi, sonucunun ne anlattigi ve bir sonraki en dogru adim uzerine odaklan.
- 3 ile 5 cumle arasi yaz.
- Sadece duz metin don, baslik koyma.

OGRENCI:
- Ad: ${sanitize(student?.name)}
- Hedef: ${sanitize(student?.target)}

QUIZ KAYDI:
- Ders: ${sanitize(item?.course)}
- Konu: ${sanitize(item?.topic)}
- Kaynak: ${sanitize(item?.source?.label)}
- Durum: ${sanitize(item?.status)}
- Gonderilme nedeni: ${sanitize(item?.reason)}
- Oncelik etiketi: ${sanitize(item?.riskLabel)}
- Soru sayisi: ${item?.questionCount || 0}
- Aciklama sayisi: ${item?.explanationCount || 0}
- Dogru sayisi: ${item?.correctCount ?? 'belirsiz'}
- Toplam soru: ${item?.totalCount || item?.questionCount || 0}
- Basari: %${item?.scorePct || 0}
- Gonderilme tarihi: ${formatSmartQuizDate(item?.assignedAt)}
- Tamamlanma tarihi: ${formatSmartQuizDate(item?.completedAt)}
- Yanitlanan soru sayisi: ${answeredCount}
- Koc notu: ${sanitize(item?.progressCoachNote)}
- Ilk soru onizlemi: ${questionPreview || 'yok'}

KURAL:
- Quiz tamamlanmadiysa bunu basarisizlik gibi yazma; davranis ve takip ihtiyaci olarak yorumla.
- Quiz tamamlandiysa sonucu netce yorumla; gerekirse tekrar ihtiyacini acik soyle.
- Sadece quiz verisine dayan, psikolojik tani kurma.
`;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_CHAT_MODEL,
            contents: prompt,
        });

        const text = String(response?.text || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 120) return fallback;
        return text;
    } catch (error) {
        console.error('SMART_QUIZ_ATTEMPT_AI_ERROR:', error);
        return fallback;
    }
};

/**
 * Toplu üretim süreci için AI'dan genel bir giriş metni taslağı ister.
 */
const generateBatchIntroduction = async (institutionName) => {
    const cacheKey = normalizeText(institutionName || 'kurumumuz');
    const cached = batchIntroCache.get(cacheKey);
    if (cached && (Date.now() - cached.createdAt) < BATCH_INTRO_CACHE_TTL_MS) {
        return cached.text;
    }

    const prompt = `
Sen bir eğitim kurumu yöneticisisin. Kurum adı: ${institutionName}.
Haftalık veli raporları için kurumun vizyonunu yansıtan, profesyonel, güven veren ve saygın bir "Giriş Mesajı Taslağı" yaz.
Bu metin her öğrenci için ortak olacak (Altta her öğrenciye özel analiz notları eklenecek).
Lütfen tırnak işareti içinde, doğrudan kullanılabilir bir metin döndür.
(Max 2-3 cümle).
`;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_CHAT_MODEL,
            contents: prompt
        });
        const text = response.text.replace(/"/g, '').trim();
        batchIntroCache.set(cacheKey, { text, createdAt: Date.now() });
        return text;
    } catch (error) {
        console.error("Batch Intro Error:", error);
        return `Değerli velimiz, ${institutionName} olarak öğrencilerimizin haftalık gelişimlerini yakından takip etmeye devam ediyoruz. Bu haftaki akademik süreç ve öğrenciye özel dürüst analiz notumuz aşağıdadır.`;
    }
};

/**
 * Yüklenen excel deneme dosyasının başlıklarını analiz edip standart formata mapler.
 */
const generateExcelMapping = async (sampleRow) => {
    const prompt = `
Sen "Gelişmiş Excel Başlık Eşleştirme Yapay Zekası"sın.
Bir eğitim kurumu YKS (TYT/AYT) deneme sınavı sonuçlarını Excel olarak sisteme yüklüyor.
Aşağıda bu dosyadan örnek bir satır (Anahtar: Değer) olarak veriliyor.
Senden görevim, bu Excel'deki anahtarları benim veritabanı şemamdaki anahtarlara eşleştirmen.

Benim Standart Anahtarlarım (Tam Olarak Bu İsimleri Kullan):
- studentId (Temsil Ettiği: Öğrenci No, Kimlik, Numara vs.)
- studentName (Öğrencinin Adı Soyadı)
- className (Sınıf: Örn 11-A, 12-B, ARŞİMET vs.)
- date (Tarih)
- tytNet (TYT Toplam Net)
- aytNet (AYT Toplam Net)

[TYT Netleri]
- tytTur (Türkçe Net), tytTurD (Türkçe Doğru), tytTurY (Türkçe Yanlış)
- tytMat (Matematik Net), tytMatD (Mat Doğru), tytMatY (Mat Yanlış)
- tytTar (Tarih Net), tytTarD (Tarih Doğru), tytTarY (Tarih Yanlış)
- tytCog (Coğrafya Net), tytCogD (Coğ Doğru), tytCogY (Coğ Yanlış)
- tytFel (Felsefe Net), tytFelD (Fel Doğru), tytFelY (Fel Yanlış)
- tytDin (Din Net), tytDinD (Din Doğru), tytDinY (Din Yanlış)
- tytFiz (Fizik Net), tytFizD (Fizik Doğru), tytFizY (Fizik Yanlış)
- tytKim (Kimya Net), tytKimD (Kimya Doğru), tytKimY (Kimya Yanlış)
- tytBiy (Biyoloji Net), tytBiyD (Biyo Doğru), tytBiyY (Biyo Yanlış)

[AYT Netleri]
- aytMat (AYT Mat Net), aytMatD (AYT Mat Doğru), aytMatY (AYT Mat Yanlış)
- aytFiz (AYT Fizik Net), aytFizD (AYT Fizik D), aytFizY (AYT Fizik Y)
- aytKim (AYT Kimya Net), aytKimD (AYT Kimya D), aytKimY (AYT Kimya Y)
- aytBiy (AYT Biyo Net), aytBiyD (AYT Biyo D), aytBiyY (AYT Biyo Y)
- aytEdb (AYT Edebiyat Net), aytEdbD (AYT Edb D), aytEdbY (AYT Edb Y)
- aytTar1 (AYT Tarih-1 Net), aytTar1D (Tarih-1 D), aytTar1Y (Tarih-1 Y)
- aytCog1 (AYT Coğ-1 Net), aytCog1D (Coğ-1 D), aytCog1Y (Coğ-1 Y)
- aytTar2 (AYT Tarih-2 Net), aytTar2D (Tarih-2 D), aytTar2Y (Tarih-2 Y)
- aytCog2 (AYT Coğ-2 Net), aytCog2D (Coğ-2 D), aytCog2Y (Coğ-2 Y)
- aytFel (AYT Felsefe Net), aytFelD (Felsefe D), aytFelY (Felsefe Y)
- aytDin (AYT Din Net), aytDinD (Din D), aytDinY (Din Y)

[Excel Satırı]
${JSON.stringify(sampleRow).substring(0, 1000)}

[KURALLAR]
- SADECE bulabildiğin ve %80 emin olduğun sütunları döndür.
- Anlayamadığın dersi/alanı JSON'a ekleme. (Örn: "aytDin" Excel'de yoksa es geç)
- SADECE JSON formatında bir nesne oluştur. Anahtarlar benim standartlarım, değerler ise Excel'deki KESİN aynı metinler olmak zorunda.
`;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_CHAT_MODEL,
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });
        const contentText = response.text || "{}";
        return JSON.parse(contentText);
    } catch (error) {
        console.error("Excel Mapping AI Error:", error);
        return null;
    }
};

const evaluateGuidanceAlert = async (student) => {
    const prompt = `
Sen elit bir "Eğitim Koçu ve Triage Yapay Zekası"sın.
Amacın, kurumdaki öğrencilerin genel durumunu analiz etmek ve YALNIZCA acil müdahale (rehberlik) gereken öğrencilere alarm oluşturmaktır.
Eğer öğrencinin durumu stabilse, hedefleriyle paralel ilerliyorsa veya müdahale gerektiren ciddi bir kriz yoksa her şeyi null bırak ("Yok" döndür).

SADECE aşağıdaki durumlardan birini veya birkaçını aynı anda görüyorsan alarm oluştur:
- Öğrenci son 7-10 gündür hiç soru çözmüyor veya sisteme çok nadir giriyor (Motivasyon kaybı / Kayboluş)
- Çözdüğü soru sayısı aniden yarı yarıya veya daha fazla düşmüş (Keskin Kopuş)
- Başarı (net) oranında gözle görülür sürekli bir düşüş veya yerinde sayma var, çok fazla hata yapıyor.
- Sınav stresi seviyesi sistemde yüksek ölçülmüş.

Öğrenci Verisi:
Adı: ${student.name}
Şu Anki Durum: İlerleme: %${student.progress}, Puan/XP: ${student.xp}, Son Aktif: ${student.lastActiveAt}
Hedef Skoru: ${student.goalScore}, Hedef Üniversite: ${student.goalUniversity}
Tarihsel Aktiviteler: ${JSON.stringify(student.dailyActivities?.map(a => ({ tarih: a.date, cozulmusSoru: a.solvedCount })))}
Denemeler: ${JSON.stringify(student.exams?.map(e => ({ tarih: e.date, tyt: e.tytNet, ayt: e.aytNet })))}

ÇIKTI FORMATI:
Eğer MÜDAHALE GEREKMİYORSA, sadece şunu döndür: {"needsAlert": false}
Eğer MÜDAHALE GEREKİYORSA, sadece şunu döndür:
{
   "needsAlert": true,
   "priority": "High", // "High", "Medium" veya "Low"
   "issue": "BİR CÜMLELİK, doğrudan koça yönelik rapor. Örn: 'Son 2 haftadır tamamen sistemi terk etmiş, hedeflerinden tamamen koptuğu görülüyor, acil veli görüşmesi önerilir.'"
}
`;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_CHAT_MODEL,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const contentText = response.text || "{}";
        return JSON.parse(contentText);
    } catch (error) {
        console.error("evaluateGuidanceAlert Error:", error);
        return { needsAlert: false };
    }
};

/**
 * Python Math Service (SymPy v2.0) üzerinden hesaplama yapan fonksiyon
 * Artık adım adım çözüm, grafik ve motor bilgisi de döndürür.
 */
const solveMathProblem = async (expression, action = "solve", variable = null, limitPoint = null, extraPayload = null) => {
    try {
        const payload = { action };
        if (typeof expression === 'string' && expression.trim()) payload.expression = expression.trim();
        if (typeof variable === 'string' && variable.trim()) payload.variable = variable.trim();
        if (limitPoint) payload.limit_point = limitPoint;
        if (extraPayload && typeof extraPayload === 'object') {
            Object.assign(payload, extraPayload);
        }

        const response = await axios.post(`${MATH_SERVICE_URL}/calculate`, payload, { timeout: 30000 });
        if (!response.data || typeof response.data !== 'object') {
            return {
                status: "error",
                code: "INVALID_MATH_SERVICE_RESPONSE",
                message: "Hesaplama servisi beklenmeyen bir yanıt döndürdü."
            };
        }
        if (response.data.status !== "success") {
            console.error("Math Service Error:", response.data.code || response.data.message);
        }
        return response.data;
    } catch (error) {
        console.error("Math Service Connection Error Detayı:");
        console.error(error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error(`-> Python FastAPI sunucusu (${MATH_SERVICE_URL}) çalışmıyor! Lütfen math servisini başlatın.`);
        }
        return {
            status: "error",
            code: error.code === 'ECONNREFUSED' ? "MATH_SERVICE_UNAVAILABLE" : "MATH_SERVICE_REQUEST_FAILED",
            message: "Hesaplama servisine ulaşılamadı.",
            hint: error.code === 'ECONNREFUSED'
                ? "Python FastAPI servisini başlat ve tekrar dene."
                : "Servis bağlantısını veya timeout ayarlarını kontrol et."
        };
    }
};

const splitBalancedComma = (value = "") => {
    const parts = [];
    let depth = 0;
    let current = "";
    const openers = new Set(['(', '[', '{']);
    const closers = new Set([')', ']', '}']);

    for (const char of String(value || "")) {
        if (openers.has(char)) depth += 1;
        if (closers.has(char) && depth > 0) depth -= 1;

        if (char === ',' && depth === 0) {
            if (current.trim()) parts.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
};

const looksLikeAssignmentList = (value = "") => {
    const parts = splitBalancedComma(value);
    return parts.length > 1 && parts.every((part) => /^[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(part));
};

const makeToolError = (code, message, hint = null, details = null) => {
    const payload = { status: "error", code, error: message, message };
    if (hint) payload.hint = hint;
    if (details && Object.keys(details).length > 0) payload.details = details;
    return payload;
};

const inferCoordinateGeometryOperation = (questionText = "") => {
    const text = String(questionText || "").toLocaleLowerCase('tr-TR');
    if (/doğrunun denklemi|dogrunun denklemi|doğru denklemi|line equation/.test(text)) return 'line_equation';
    if (/orta nokta|midpoint/.test(text)) return 'midpoint';
    if (/noktadan doğruya uzaklık|noktadan dogruya uzaklik|point to line distance/.test(text)) return 'point_to_line_distance';
    if (/kesişim|kesisim|intersection/.test(text)) return 'circle_line_intersection';
    if (/uzaklık|uzaklik|distance/.test(text)) return 'distance';
    return null;
};

const GEOMETRY_OPERATION_KEYS = new Set([
    'distance',
    'midpoint',
    'line_equation',
    'circle_line_intersection',
    'point_to_line_distance',
]);

const GEOMETRY_OPERATION_ALIASES = {
    distance_between_points: 'distance',
    two_point_distance: 'distance',
    line_equation_from_two_points: 'line_equation',
    two_point_line_equation: 'line_equation',
    line_from_two_points: 'line_equation',
    circle_and_line_intersection: 'circle_line_intersection',
    line_circle_intersection: 'circle_line_intersection',
};

const normalizeCoordinateGeometryOperation = (value = null) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const normalized = value.trim();
    return GEOMETRY_OPERATION_ALIASES[normalized] || normalized;
};

const sanitizeVerificationSolution = (solution = '') => {
    const raw = String(solution || '').trim();
    if (!raw) return raw;
    if (raw.startsWith('[') || raw.startsWith('{')) return raw;

    const parts = splitBalancedComma(raw);
    if (parts.length < 2) return raw;

    const values = [];
    for (const part of parts) {
        const match = part.match(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.+)$/);
        if (!match) return raw;
        values.push(match[1].trim());
    }

    return `[${values.join(', ')}]`;
};

const inferCombinatoricsOperation = (questionText = "", expression = "") => {
    const text = String(questionText || "").toLocaleLowerCase('tr-TR');
    if (/faktöriyel|faktoriyel|factorial/.test(text)) return 'factorial';
    if (/permütasyon|permutasyon|sirala|sırala|siralama|sıralama|diziliş|dizilis|yerleştir|yerlestir|arrangement/.test(text)) return 'permutation';
    if (/kombinasyon|komite|seç|sec|seçil|secil|choose|committee/.test(text)) return 'combination';

    const parts = splitBalancedComma(expression);
    if (parts.length <= 1) return 'factorial';
    if (parts.length === 2) return 'combination';
    return null;
};

const isFunctionExtremaQuestion = (questionText = "") => {
    const text = String(questionText || "").toLocaleLowerCase('tr-TR');
    const asksExtrema = /\byerel\b|\blokal\b|ekstrem|maksimum|minimum|en büyük|en kucuk|en küçük/.test(text);
    const mentionsFunction = /f\s*\(\s*x\s*\)|fonksiyon/.test(text);
    const mentionsDerivative = /f\s*['’]\s*\(\s*x\s*\)|türev|turev/.test(text);
    return asksExtrema && mentionsFunction && !mentionsDerivative;
};

const AREA_REWRITE_ALLOWED_SYMBOLS = new Set([
    'x',
    'y',
    'pi',
    'e',
    'sin',
    'cos',
    'tan',
    'cot',
    'sec',
    'csc',
    'sqrt',
    'abs',
    'log',
    'ln',
    'exp',
]);

const extractExpressionSymbols = (value = "") => {
    const raw = String(value || "");
    const matches = raw.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    const symbols = [];
    for (const match of matches) {
        const normalized = match.toLocaleLowerCase('tr-TR');
        if (AREA_REWRITE_ALLOWED_SYMBOLS.has(normalized)) continue;
        symbols.push(normalized);
    }
    return [...new Set(symbols)];
};

const hasOnlyAreaSymbols = (value = "") => extractExpressionSymbols(value).every((symbol) => ['x', 'y'].includes(symbol));

const normalizeVariableList = (variable = null, explicitVariables = []) => {
    const values = [];
    if (typeof variable === 'string' && variable.trim()) {
        values.push(...splitBalancedComma(variable));
    }
    if (Array.isArray(explicitVariables) && explicitVariables.length > 0) {
        values.push(...explicitVariables);
    }
    return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
};

const isSafeAreaRewritePayload = ({ requestedAction = "", expression = null, variable = null, equations = [], variables = [] } = {}) => {
    const normalizedVariables = normalizeVariableList(variable, variables);
    const variablesAreSafe = normalizedVariables.length === 0 || normalizedVariables.every((item) => ['x', 'y'].includes(item));
    const normalizedEquations = Array.isArray(equations) && equations.length > 0
        ? equations
        : requestedAction === 'solve_system' && expression
            ? splitBalancedComma(expression)
            : [];

    if (!variablesAreSafe) return false;

    if (requestedAction === 'integrate') {
        return Boolean(expression) && hasOnlyAreaSymbols(expression);
    }

    if (requestedAction === 'solve') {
        return Boolean(expression) && hasOnlyAreaSymbols(expression) && /x|y/.test(String(expression));
    }

    if (requestedAction === 'solve_system') {
        if (!Array.isArray(normalizedEquations) || normalizedEquations.length !== 2) return false;
        return normalizedEquations.every((equation) => hasOnlyAreaSymbols(equation)) && normalizedEquations.some((equation) => /x|y/.test(String(equation)));
    }

    return false;
};

const shouldRewriteToAreaBetweenCurves = ({
    questionText = "",
    requestedAction = "",
    expression = null,
    variable = null,
    equations = [],
    variables = [],
} = {}) => {
    if (!isAreaBetweenCurvesQuestion(questionText)) return false;
    return isSafeAreaRewritePayload({ requestedAction, expression, variable, equations, variables });
};

const parseCircleLineIntersectionParams = (questionText = "") => {
    const raw = String(questionText || '').replace(/\s+/g, '');
    const originCircleMatch = raw.match(/x\^2\+y\^2=([+-]?\d+(?:\.\d+)?)/i);
    const horizontalLineMatch = raw.match(/y=([+-]?\d+(?:\.\d+)?)/i);
    const slopeLineMatch = raw.match(/y=([+-]?\d+(?:\.\d+)?)\*?x([+-]\d+(?:\.\d+)?)?/i);

    if (!originCircleMatch) return null;

    const radiusSquared = Number(originCircleMatch[1]);
    if (!Number.isFinite(radiusSquared) || radiusSquared < 0) return null;

    const r = Math.sqrt(radiusSquared);
    if (!Number.isFinite(r)) return null;

    if (horizontalLineMatch) {
        const n = Number(horizontalLineMatch[1]);
        if (Number.isFinite(n)) {
            return { cx: 0, cy: 0, r, m: 0, n };
        }
    }

    if (slopeLineMatch) {
        const m = Number(slopeLineMatch[1]);
        const n = Number(slopeLineMatch[2] || 0);
        if (Number.isFinite(m) && Number.isFinite(n)) {
            return { cx: 0, cy: 0, r, m, n };
        }
    }

    return null;
};

const parseCircleLineIntersectionFromEquations = (equations = []) => {
    const normalizedEquations = (equations || []).map((eq) => String(eq || '').replace(/\s+/g, ''));
    const circleEquation = normalizedEquations.find((eq) => /^x\*\*2\+y\*\*2[-+]\d+(?:\.\d+)?$/i.test(eq));
    const horizontalLine = normalizedEquations.find((eq) => /^y(?:[-+]\d+(?:\.\d+)?)?$/i.test(eq));
    const slopeLine = normalizedEquations.find((eq) => /^y[-+]\d+(?:\.\d+)?\*x(?:[-+]\d+(?:\.\d+)?)?$/i.test(eq));

    if (!circleEquation) return null;

    const radiusMatch = circleEquation.match(/^x\*\*2\+y\*\*2([+-]\d+(?:\.\d+)?)$/i);
    if (!radiusMatch) return null;
    const radiusSquared = Math.abs(Number(radiusMatch[1]));
    const r = Math.sqrt(radiusSquared);
    if (!Number.isFinite(r)) return null;

    if (horizontalLine) {
        const offsetMatch = horizontalLine.match(/^y([+-]\d+(?:\.\d+)?)?$/i);
        const n = offsetMatch && offsetMatch[1] ? -Number(offsetMatch[1]) : 0;
        return { cx: 0, cy: 0, r, m: 0, n };
    }

    if (slopeLine) {
        const slopeMatch = slopeLine.match(/^y([+-]\d+(?:\.\d+)?)\*x([+-]\d+(?:\.\d+)?)?$/i);
        if (!slopeMatch) return null;
        return {
            cx: 0,
            cy: 0,
            r,
            m: -Number(slopeMatch[1]),
            n: slopeMatch[2] ? -Number(slopeMatch[2]) : 0,
        };
    }

    return null;
};

const normalizeMathToolArgs = (rawArgs = {}, context = {}) => {
    const args = rawArgs || {};
    const requestedAction = typeof args.action === 'string' && args.action.trim() ? args.action.trim() : 'solve';
    let action = isFunctionExtremaQuestion(context.questionText) && ['derivative', 'analyze_derivative'].includes(requestedAction)
        ? 'find_extrema'
        : requestedAction;
    let expression = typeof args.expression === 'string' && args.expression.trim() ? args.expression.trim() : null;
    let variable = typeof args.variable === 'string' && args.variable.trim() ? args.variable.trim() : null;
    if (requestedAction === 'coordinate_geometry') {
        variable = normalizeCoordinateGeometryOperation(variable);
    }
    const limitPoint = typeof args.limit_point === 'string' && args.limit_point.trim() ? args.limit_point.trim() : null;
    const extraPayload = {};

    if (Array.isArray(args.equations) && args.equations.length > 0) {
        extraPayload.equations = args.equations.map((eq) => String(eq || '').trim()).filter(Boolean);
        if (!expression && extraPayload.equations.length > 0) {
            expression = extraPayload.equations.join(', ');
        }
    }

    if (Array.isArray(args.variables) && args.variables.length > 0) {
        extraPayload.variables = args.variables.map((item) => String(item || '').trim()).filter(Boolean);
        if (!variable && extraPayload.variables.length > 0) {
            variable = extraPayload.variables.join(',');
        }
    }

    if (typeof args.matrix_action === 'string' && args.matrix_action.trim()) {
        extraPayload.matrix_action = args.matrix_action.trim();
        if (!variable) variable = extraPayload.matrix_action;
    }

    if (typeof args.matrix === 'string' && args.matrix.trim()) {
        extraPayload.matrix = args.matrix.trim();
        if (!expression) expression = extraPayload.matrix;
    } else if (Array.isArray(args.matrix)) {
        extraPayload.matrix = args.matrix;
        if (!expression) expression = JSON.stringify(args.matrix);
    }

    if (args.params && typeof args.params === 'object' && !Array.isArray(args.params)) {
        let normalizedParams = { ...args.params };

        if (!variable) {
            const nestedGeometryKey = Object.keys(normalizedParams).find((key) => {
                const value = normalizedParams[key];
                return normalizeCoordinateGeometryOperation(key) && value && typeof value === 'object' && !Array.isArray(value);
            });
            if (nestedGeometryKey) {
                variable = normalizeCoordinateGeometryOperation(nestedGeometryKey);
                normalizedParams = { ...normalizedParams[nestedGeometryKey] };
            }
        }

        if (!variable && typeof normalizedParams.type === 'string' && normalizedParams.type.trim()) {
            variable = normalizeCoordinateGeometryOperation(normalizedParams.type.trim());
        }

        if (!variable && typeof normalizedParams.variable === 'string' && normalizedParams.variable.trim()) {
            variable = normalizeCoordinateGeometryOperation(normalizedParams.variable.trim());
        }

        if (Array.isArray(normalizedParams.p1) && normalizedParams.p1.length >= 2) {
            normalizedParams.x1 = normalizedParams.p1[0];
            normalizedParams.y1 = normalizedParams.p1[1];
            delete normalizedParams.p1;
        }

        if (Array.isArray(normalizedParams.point1) && normalizedParams.point1.length >= 2) {
            normalizedParams.x1 = normalizedParams.point1[0];
            normalizedParams.y1 = normalizedParams.point1[1];
            delete normalizedParams.point1;
        }

        if (Array.isArray(normalizedParams.p2) && normalizedParams.p2.length >= 2) {
            normalizedParams.x2 = normalizedParams.p2[0];
            normalizedParams.y2 = normalizedParams.p2[1];
            delete normalizedParams.p2;
        }

        if (Array.isArray(normalizedParams.point2) && normalizedParams.point2.length >= 2) {
            normalizedParams.x2 = normalizedParams.point2[0];
            normalizedParams.y2 = normalizedParams.point2[1];
            delete normalizedParams.point2;
        }

        if (Array.isArray(normalizedParams.point) && normalizedParams.point.length >= 2) {
            normalizedParams.x0 = normalizedParams.point[0];
            normalizedParams.y0 = normalizedParams.point[1];
            delete normalizedParams.point;
        }

        delete normalizedParams.type;
        delete normalizedParams.variable;

        if (!variable) {
            variable = inferCoordinateGeometryOperation(context.questionText);
        }

        if (
            variable === 'point_to_line_distance'
            && (normalizedParams.x0 === undefined || normalizedParams.y0 === undefined)
            && normalizedParams.x1 !== undefined
            && normalizedParams.y1 !== undefined
        ) {
            normalizedParams.x0 = normalizedParams.x1;
            normalizedParams.y0 = normalizedParams.y1;
            delete normalizedParams.x1;
            delete normalizedParams.y1;
        }

        extraPayload.params = normalizedParams;
        if (!expression) expression = JSON.stringify(normalizedParams);
    }

    if (
        isCircleLineIntersectionQuestion(context.questionText)
        && ['solve', 'solve_system'].includes(action)
        && !extraPayload.params
    ) {
        const parsedParams = parseCircleLineIntersectionParams(context.questionText);
        if (parsedParams) {
            action = 'coordinate_geometry';
            variable = 'circle_line_intersection';
            extraPayload.params = parsedParams;
            expression = JSON.stringify(parsedParams);
        }
    }

    if (action === 'solve_system' && extraPayload.equations && !extraPayload.params) {
        const parsedSystemGeometryParams = parseCircleLineIntersectionFromEquations(extraPayload.equations);
        if (parsedSystemGeometryParams) {
            action = 'coordinate_geometry';
            variable = 'circle_line_intersection';
            extraPayload.params = parsedSystemGeometryParams;
            expression = JSON.stringify(parsedSystemGeometryParams);
        }
    }

    if (action === 'combinatorics') {
        const combinatoricsMatch = String(expression || '')
            .trim()
            .match(/^(combination|permutation|factorial)\s*\((.*)\)$/i);

        if (combinatoricsMatch) {
            variable = combinatoricsMatch[1].toLowerCase();
            expression = combinatoricsMatch[2].replace(/\s+/g, '');
        } else if (typeof variable === 'string') {
            const variableMatch = variable.trim().match(/^(combination|permutation|factorial)\s*\((.*)\)$/i);
            if (variableMatch) {
                variable = variableMatch[1].toLowerCase();
                if (!expression) {
                    expression = variableMatch[2].replace(/\s+/g, '');
                }
            }
        }

        if ((!variable || variable === 'x') && expression) {
            variable = inferCombinatoricsOperation(context.questionText, expression) || variable || 'combination';
        }

        if (typeof expression === 'string') {
            expression = expression.trim().replace(/\s+/g, '');
        }
    }

    const placeholderConstraintPattern = /\bf(?:_[A-Za-z0-9-]+|\d+)|f_derivative_|fprime|derivative_/i;
    const coefficientVariables = normalizeVariableList(variable, extraPayload.variables || []);
    const equationsForValidation = extraPayload.equations || splitBalancedComma(expression || '');

    if (
        action === 'solve_system'
        && isPolynomialConstructionWordProblem(context.questionText)
        && equationsForValidation.length > 0
        && equationsForValidation.some((equation) => placeholderConstraintPattern.test(String(equation)))
        && coefficientVariables.every((item) => /^[a-z]$/i.test(item))
    ) {
        return {
            action,
            expression,
            variable,
            limitPoint,
            extraPayload,
            validationError: makeToolError(
                "NON_EXPLICIT_POLYNOMIAL_CONSTRAINTS",
                "Fonksiyon koşulları placeholder sembollerle gönderildi.",
                "f_0, f_1, f_derivative_1 gibi temsilciler kullanma; fonksiyon ve türev koşullarını explicit denklem olarak yaz."
            ),
        };
    }

    if (shouldRewriteToAreaBetweenCurves({
        questionText: context.questionText,
        requestedAction,
        expression,
        variable,
        equations: extraPayload.equations || [],
        variables: extraPayload.variables || [],
    })) {
        action = 'area_between_curves';
    }

    if (action === 'coordinate_geometry') {
        variable = normalizeCoordinateGeometryOperation(variable);
    }

    if (action === 'solve' && typeof expression === 'string') {
        const limitMatch = expression.trim().match(/^lim\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*->\s*([^,]+)\s*,\s*(.+)\)$/i);
        if (limitMatch) {
            action = 'limit';
            variable = variable || limitMatch[1].trim();
            expression = limitMatch[3].trim();
            extraPayload.limit_point = limitMatch[2].trim();
        }
    }

    const normalized = {
        action,
        expression,
        variable,
        limitPoint: extraPayload.limit_point || limitPoint,
        extraPayload
    };

    if (action === 'solve' && expression && looksLikeAssignmentList(expression)) {
        normalized.validationError = makeToolError(
            "INVALID_SOLVE_INPUT",
            "Bu ifade bir denklem değil, değişken atama listesi içeriyor.",
            "solve için çözmek istediğin denklemi gönder; denklem sistemi ise solve_system kullan."
        );
        return normalized;
    }

    if (action === 'solve_system' && !expression && (!extraPayload.equations || extraPayload.equations.length === 0)) {
        normalized.validationError = makeToolError(
            "MISSING_EQUATIONS",
            "solve_system için equations veya expression gerekli.",
            "Denklemleri equations dizisiyle ya da virgülle ayrılmış expression alanıyla gönder."
        );
        return normalized;
    }

    if (action === 'matrix' && !expression && extraPayload.matrix === undefined) {
        normalized.validationError = makeToolError(
            "MISSING_MATRIX",
            "matrix işlemi için matrix veya expression gerekli.",
            "Matrisi matrix alanında ya da expression içinde gönder."
        );
        return normalized;
    }

    if (action === 'coordinate_geometry' && !expression && !extraPayload.params) {
        normalized.validationError = makeToolError(
            "MISSING_GEOMETRY_PARAMS",
            "coordinate_geometry için params veya expression gerekli.",
            "Geometri parametrelerini params nesnesi olarak gönder."
        );
        return normalized;
    }

    if (action === 'coordinate_geometry' && !variable) {
        normalized.validationError = makeToolError(
            "MISSING_GEOMETRY_OPERATION",
            "coordinate_geometry için alt işlem belirlenemedi.",
            "variable veya params.type alanına distance, midpoint, line_equation gibi bir değer gönder."
        );
        return normalized;
    }

    if (!expression && !['solve_system', 'matrix', 'coordinate_geometry'].includes(action)) {
        normalized.validationError = makeToolError(
            "MISSING_EXPRESSION",
            "Bu işlem için expression gerekli.",
            action === 'combinatorics'
                ? "combinatorics icin expression'i 'n,r' veya 'n' formatinda gonder."
                : "İlgili matematiksel ifadeyi SymPy formatında gönder."
        );
    }

    return normalized;
};

const buildToolCallFingerprint = (name, normalizedArgs = {}) => JSON.stringify({
    name,
    action: normalizedArgs.action || '',
    expression: normalizedArgs.expression || '',
    variable: normalizedArgs.variable || '',
    limitPoint: normalizedArgs.limitPoint || '',
    extraPayload: normalizedArgs.extraPayload || {},
});

const extractMultipleChoiceOptions = (questionText = "") => {
    const options = [];
    const regex = /([A-E])\)\s*([\s\S]*?)(?=\s+[A-E]\)|$)/g;
    let match;
    while ((match = regex.exec(questionText)) !== null) {
        options.push({
            letter: match[1],
            text: match[2].replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '')
        });
    }
    return options;
};

const normalizeMathExpression = (expr) => {
    if (!expr || typeof expr !== 'string') return null;
    return expr
        .trim()
        .replace(/^`|`$/g, '')
        .replace(/^\\\(|\\\)$/g, '')
        .replace(/[()[\]]/g, (char) => (char === '[' ? '(' : char === ']' ? ')' : char))
        .replace(/π/g, 'pi')
        .replace(/√/g, 'sqrt')
        .replace(/\^/g, '**')
        .replace(/−/g, '-')
        .replace(/\s+/g, '');
};

const isProbablyMathOption = (text = "") => /[0-9π√+\-*/^=()]/.test(text) || /\b(pi|sin|cos|tan|sqrt)\b/i.test(text);

const extractSingleValueFromResult = (result) => {
    if (typeof result !== 'string') return null;
    const trimmed = result.trim();
    const singleListMatch = trimmed.match(/^\[\s*([^,\]]+)\s*\]$/);
    if (singleListMatch) return singleListMatch[1].trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
    return null;
};

const extractExtremaYValue = (result) => {
    if (typeof result !== 'string') return null;
    const match = result.match(/['"]y['"]:\s*['"]([^'"]+)['"]/);
    return match ? match[1].trim() : null;
};

const deriveScalarCandidate = (traceEntry, questionText = "") => {
    const { action, result } = traceEntry || {};
    if (!action || !result) return null;

    if (action === 'find_extrema' && /\b(en küçük|minimum|en büyük|maksimum)\b/i.test(questionText)) {
        return extractExtremaYValue(result);
    }

    if (['solve', 'simplify', 'integrate', 'limit', 'combinatorics', 'sequences'].includes(action)) {
        return extractSingleValueFromResult(result);
    }

    return null;
};

const expressionsEquivalent = async (left, right) => {
    const normalizedLeft = normalizeMathExpression(left);
    const normalizedRight = normalizeMathExpression(right);
    if (!normalizedLeft || !normalizedRight) return false;

    const comparison = await solveMathProblem(`(${normalizedLeft})-(${normalizedRight})`, "simplify", "x");
    return Boolean(comparison && comparison.status === "success" && String(comparison.result).trim() === "0");
};

const resolveVerifiedMultipleChoice = async (questionText, mathTrace) => {
    const options = extractMultipleChoiceOptions(questionText);
    if (options.length < 2) return null;

    const scalarCandidates = [];
    for (let i = mathTrace.length - 1; i >= 0; i--) {
        const candidate = deriveScalarCandidate(mathTrace[i], questionText);
        if (candidate) scalarCandidates.push(candidate);
    }

    for (const candidate of scalarCandidates) {
        for (const option of options) {
            if (!isProbablyMathOption(option.text)) continue;
            if (await expressionsEquivalent(candidate, option.text)) {
                return { ...option, candidate };
            }
        }
    }

    return null;
};

const getLastMathAction = (mathTrace = []) => {
    for (let i = mathTrace.length - 1; i >= 0; i--) {
        if (mathTrace[i]?.action) return mathTrace[i].action;
    }
    return null;
};

const METADATA_BLOCK_REGEX = /\{(?:xp:\s*\d+\s*,\s*)?educational:\s*(?:true|false)\s*,\s*course:\s*'[^']*'\s*,\s*topic:\s*'[^']*'\s*,\s*subtopic:\s*'[^']*'\s*,\s*difficulty:\s*'[^']*'\s*\}/g;
const DEFAULT_EMPTY_MATH_ANSWER = "Yapay Zeka bu soruya içerik üretemedi.";

const stripMathMetadataBlocks = (text = "") => String(text || "")
    .replace(METADATA_BLOCK_REGEX, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const stripReasoningBlocks = (text = "") => String(text || "")
    .replace(/<muhakeme>[\s\S]*?<\/muhakeme>/gi, "")
    .replace(/<\/?muhakeme>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const cleanSummaryLine = (line = "") => String(line || "")
    .replace(/^#+\s*/g, '')
    .replace(/^\d+\.\s*/g, '')
    .replace(/^[-*]\s*/g, '')
    .replace(/^[✅🎯📝⚠️💡📌📍🧠]+\s*/u, '')
    .replace(/^(doğru cevap|dogru cevap|çözüm mantığı|cozum mantigi|adımlar|adimlar|kritik nokta)\s*:\s*/i, '')
    .replace(/\*+/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const smartTrimSummaryLine = (line = "", maxLength = 135) => {
    const normalized = cleanSummaryLine(line);
    if (normalized.length <= maxLength) return normalized;

    const slice = normalized.slice(0, maxLength + 1);
    const breakpoints = [slice.lastIndexOf('. '), slice.lastIndexOf('; '), slice.lastIndexOf(', '), slice.lastIndexOf(' ')];
    const best = breakpoints.find((index) => index >= Math.floor(maxLength * 0.6));
    const cutoff = best && best > 0 ? best : maxLength;
    return `${normalized.slice(0, cutoff).trim()}...`;
};

const trimTextToWordLimit = (text = "", maxWords = 150) => {
    const normalized = String(text || "").replace(/\s+/g, ' ').trim();
    if (!normalized) return '';

    const words = normalized.split(' ');
    if (words.length <= maxWords) return normalized;
    return `${words.slice(0, maxWords).join(' ').trim()}...`;
};

const formatStudentFacingSummary = (lines = [], { maxItems = 4, maxWords = 150 } = {}) => {
    const normalizedLines = (Array.isArray(lines) ? lines : [])
        .map((line) => smartTrimSummaryLine(line, 180))
        .filter(Boolean)
        .slice(0, maxItems);

    if (normalizedLines.length === 0) return '';

    const wordLimited = trimTextToWordLimit(normalizedLines.join(' '), maxWords);
    const limitedWords = wordLimited.replace(/\.\.\.$/, '').split(' ');

    const rebuilt = [];
    let cursor = 0;
    for (const line of normalizedLines) {
        const words = line.split(' ');
        const take = limitedWords.slice(cursor, cursor + words.length);
        if (take.length === 0) break;
        let rebuiltLine = take.join(' ').trim();
        cursor += take.length;
        if (!rebuiltLine) continue;
        if (!/[.!?…:]$/.test(rebuiltLine) && take.length === words.length) {
            rebuiltLine += '.';
        } else if (cursor >= limitedWords.length && wordLimited.endsWith('...')) {
            rebuiltLine += '...';
        }
        rebuilt.push(`${rebuilt.length + 1}. ${rebuiltLine}`);
        if (cursor >= limitedWords.length) break;
    }

    return rebuilt.join('\n');
};

const parseSummaryItems = (summary = "") => {
    const bannedLinePatterns = [
        /^(hedef|amac|amaç)[:\s]/i,
        /^(görsel\/metin veri ekstraksiyonu|gorsel\/metin veri ekstraksiyonu|görsel veri ekstraksiyonu|gorsel veri ekstraksiyonu)[:\s]/i,
        /^(context analizi|matematiksel formülasyon|matematiksel formulasyon|araç kontrolü|arac kontrolu)[:\s]/i,
        /^(soru|ifade|verilen fonksiyon|verilen ifade)[:\s]/i,
        /^(durum \d+|adım \d+|adim \d+)[:.\s]*$/i,
    ];
    const rawItems = String(summary || "")
        .split(/\n+/)
        .map(cleanSummaryLine)
        .filter(Boolean)
        .filter((line) => !/^[.:-]+$/.test(line))
        .filter((line) => line.replace(/[.:]/g, "").trim().length >= 3)
        .filter((line) => !/^(kisa aciklama|çözüm mantığı|cozum mantigi|çözüm özeti|dogru cevap|doğru cevap)[:\s]*$/i.test(line))
        .filter((line) => !bannedLinePatterns.some((pattern) => pattern.test(line)))
        .filter((line) => !/^\.$/.test(line))
        .filter((line) => !/^(bulunur|elde edilir|sonuç bulunur)\.?$/i.test(line));

    const merged = [];
    for (const line of rawItems) {
        if (/[:：]\s*$/.test(line) && merged.length === 0) continue;

        const lastIndex = merged.length - 1;
        if (
            lastIndex >= 0
            && /[:：]\s*$/.test(merged[lastIndex])
            && !/[:：]\s*$/.test(line)
        ) {
            merged[lastIndex] = `${merged[lastIndex].replace(/[:：]\s*$/, "")}: ${line}`;
            continue;
        }

        merged.push(line);
        if (merged.length >= 4) break;
    }

    return merged.slice(0, 4);
};

const inferCriticalPoint = (questionText = "", items = []) => {
    const text = String(questionText || "").toLocaleLowerCase('tr-TR');
    const joined = items.join(" ").toLocaleLowerCase('tr-TR');

    if (/integral|∫/.test(text) && /(u=|değişken dönüş|degisken donus|sınır|sinir)/.test(joined)) {
        return "Değişken dönüşümünde integral sınırları da birlikte değiştirilmelidir.";
    }
    if (/log|karekök|kok|sqrt|mutlak|abs/.test(text)) {
        return "Bulunan değerlerin tanım kümesine uygunluğu mutlaka kontrol edilmelidir.";
    }
    if (/olasılık|olasilik|kombinasyon|permütasyon|permutasyon|faktöriyel|faktoriyel/.test(text)) {
        return "Sayma sorularında doğrudan isteneni saymak yerine tamamlayanı saymak daha hızlı olabilir.";
    }
    if (/parabol|çember|cember|geometri|üçgen|ucgen|analitik/.test(text) && /(oran|uzunluk|açı|aci|dik|paralel|teğet|teget)/.test(text)) {
        return "Şekilden değil, verilen kesin oran ve uzunluk bilgilerinden ilerlemek gerekir.";
    }
    return "";
};

const buildPedagogicalExplanationBlock = (summary = "", questionText = "") => {
    const items = parseSummaryItems(summary);
    if (items.length === 0) return "";

    const logic = items.find((item) => item.split(/\s+/).filter(Boolean).length >= 4 && !/[:：]\s*$/.test(item)) || "";
    const stepItems = items.filter((item) => item !== logic).slice(0, 3);
    const criticalPoint = inferCriticalPoint(questionText, items);
    const blocks = [];

    if (logic) {
        blocks.push(`🎯 Çözüm Mantığı:\n${logic}`);
    }

    if (stepItems.length > 0) {
        blocks.push(`📝 Adımlar:\n${stepItems.map((item) => `- ${item}`).join("\n")}`);
    }

    if (criticalPoint) {
        blocks.push(`⚠️ Kritik Nokta:\n- ${criticalPoint}`);
    }

    return blocks.join("\n\n");
};

const extractStudentSummaryBlock = (text = "") => {
    const normalized = String(text || "");
    const match = normalized.match(/OGRENCI_OZETI:\s*([\s\S]*?)(?=(?:\n\*\*Cevap:|\nCevap:|\nNihai doğrulanmış seçenek:|$))/i);
    if (!match?.[1]) return '';

    const lines = match[1]
        .split(/\n+/)
        .map(cleanSummaryLine)
        .filter(Boolean)
        .filter((line) => !/^[.:-]+$/.test(line))
        .filter((line) => !/^ogrenci ozeti:?$/i.test(line))
        .slice(0, 4);

    return formatStudentFacingSummary(lines);
};

const buildCompactMathSummary = (rawAnswerText = "", fallbackText = "") => {
    const explicitStudentSummary = extractStudentSummaryBlock(rawAnswerText);
    if (explicitStudentSummary) return explicitStudentSummary;

    const explicitSummaryMatch = String(rawAnswerText || "").match(/###\s*💡\s*Çözüm Özeti([\s\S]*?)(?=(?:\n\*\*Cevap:|\nCevap:|\nNihai doğrulanmış seçenek:|$))/i);
    const summarySource = explicitSummaryMatch ? explicitSummaryMatch[1] : fallbackText;

    if (!summarySource) return '';

    const lines = String(summarySource)
        .replace(/###\s*💡\s*Çözüm Özeti/gi, '')
        .replace(/\r/g, '')
        .split(/\n+/)
        .map(cleanSummaryLine)
        .filter(Boolean)
        .filter((line) => !/^çözüm özeti$/i.test(line))
        .filter((line) => !/^kısa açıklama:?$/i.test(line))
        .filter((line) => !/^çözüm mantığı:?$/i.test(line))
        .filter((line) => !/^doğru cevap[:\s]/i.test(line))
        .filter((line) => !/^cevap[:\s]/i.test(line))
        .filter((line) => !/^nihai doğrulanmış seçenek:/i.test(line))
        .filter((line) => !/^[.:-]+$/.test(line))
        .filter((line) => !/^(hedef|amac|amaç)[:\s]/i.test(line))
        .filter((line) => !/^(görsel\/metin veri ekstraksiyonu|gorsel\/metin veri ekstraksiyonu|görsel veri ekstraksiyonu|gorsel veri ekstraksiyonu)[:\s]/i.test(line))
        .filter((line) => !/^(context analizi|matematiksel formülasyon|matematiksel formulasyon|araç kontrolü|arac kontrolu)[:\s]/i.test(line))
        .filter((line) => !/^(soru|ifade|verilen fonksiyon|verilen ifade)[:\s]/i.test(line))
        .filter((line) => !/^(muhakeme|görsel veri ekstraksiyonu|context analizi|matematiksel formülasyon|araç kontrolü)/i.test(line))
        .filter((line) => !/^(soruda grafik bulunmamaktadır|grafik yok)\.?$/i.test(line))
        .slice(0, 4);

    const selected = lines.map((line) => smartTrimSummaryLine(line, 180));

    return selected.length > 0 ? formatStudentFacingSummary(selected) : '';
};

const extractFinalAnswerValue = (text = "") => {
    const normalized = String(text || '');
    const patterns = [
        /\*\*Doğru Cevap:\*\*\s*([^\n*]+)/i,
        /(?:^|\n)Doğru Cevap:\s*([^\n]+)/i,
        /\*\*Cevap:\*\*\s*([^\n*]+)/i,
        /(?:^|\n)Cevap:\s*([^\n]+)/i,
        /Nihai doğrulanmış seçenek:\s*([A-E]\)\s*[^\n]+)/i,
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match?.[1]) return match[1].trim();
    }

    return null;
};

const extractFinalChoiceLetter = (text = "") => {
    const normalized = String(text || '');
    const patterns = [
        /Doğru Cevap:\s*([A-E])(?:\)|\b)/i,
        /Doğru cevap\s+([A-E])\s+şıkkıdır/i,
        /Nihai doğrulanmış seçenek:\s*([A-E])\)/i,
        /(?:^|\n)Cevap:\s*([A-E])(?:\)|\b)/i,
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match?.[1]) return match[1].toUpperCase();
    }

    return null;
};

const hasBrokenSummaryMarkers = (text = "") => {
    const normalized = String(text || "");
    return /(?:^|\n)\d+\.\s*\.(?:\n|$)/.test(normalized)
        || /###\s*💡\s*Çözüm Özeti\s*[\r\n]+(?:\d+\.\s*)?(?:$|\n)/i.test(normalized);
};

const deriveBestScalarCandidate = (mathTrace = [], questionText = "") => {
    for (let i = mathTrace.length - 1; i >= 0; i--) {
        const candidate = deriveScalarCandidate(mathTrace[i], questionText);
        if (candidate) return candidate;
    }
    return null;
};

const shouldRunFinalizer = ({ answerText = "", verifiedChoice = null, mathTrace = [], questionText = "" } = {}) => {
    const explicitAnswer = extractFinalAnswerValue(answerText);
    const scalarCandidate = deriveBestScalarCandidate(mathTrace, questionText);
    if (verifiedChoice || explicitAnswer || scalarCandidate) {
        return hasBrokenSummaryMarkers(answerText);
    }
    return hasBrokenSummaryMarkers(answerText) || !/Cevap[:\s]/i.test(answerText);
};


const sanitizeMetadataValue = (value, fallback = "Genel") => {
    const cleaned = String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .trim();
    return cleaned || fallback;
};

const getLastSuccessfulMathCall = (toolEvents = []) => {
    for (let i = toolEvents.length - 1; i >= 0; i--) {
        const event = toolEvents[i];
        if (event?.name !== "calculate_math" || event?.status !== "success") continue;
        return {
            action: event?.action || event?.normalized_args?.action || null,
            variable: event?.normalized_args?.variable || event?.args?.variable || null,
            expression: event?.normalized_args?.expression || event?.args?.expression || null,
        };
    }
    return null;
};

const inferMathTopicMetadata = ({ action = null, variable = null, questionText = "" } = {}) => {
    const text = String(questionText || "").toLocaleLowerCase('tr-TR');
    const geometryVariable = variable || inferCoordinateGeometryOperation(questionText);

    if (action === "limit") {
        return {
            topic: "Limit",
            subtopic: /sağdan|sagdan|soldan|tek yön|tek yon/.test(text) ? "Tek Yönlü Limit" : "Limit Hesabı",
        };
    }

    if (action === "analyze_derivative") {
        return { topic: "Türev", subtopic: "Türevde İşaret Analizi" };
    }

    if (action === "find_extrema") {
        return { topic: "Türev", subtopic: "Ekstremum Problemleri" };
    }

    if (action === "trig_general_solution") {
        return { topic: "Trigonometri", subtopic: "Trigonometrik Denklem" };
    }

    if (action === "solve_system") {
        return { topic: "Denklem Sistemleri", subtopic: "İki Bilinmeyenli Sistem" };
    }

    if (action === "matrix") {
        const matrixTopics = {
            determinant: "Determinant",
            inverse: "Matrisin Tersi",
            eigenvalues: "Özdeğer",
            rank: "Matris Rütbesi",
            rref: "Satır İndirgeme",
        };
        return { topic: "Matris", subtopic: matrixTopics[variable] || "Matris İşlemleri" };
    }

    if (action === "coordinate_geometry") {
        const geometryTopics = {
            line_equation: "Doğru Denklemi",
            distance: "İki Nokta Arası Uzaklık",
            midpoint: "Orta Nokta",
            circle_line_intersection: "Doğru-Çember Kesişimi",
            point_to_line_distance: "Noktadan Doğruya Uzaklık",
        };
        return { topic: "Analitik Geometri", subtopic: geometryTopics[geometryVariable] || "Analitik Geometri" };
    }

    if (action === "area_between_curves") {
        return { topic: "İntegral", subtopic: "Eğriler Arası Alan" };
    }

    if (action === "combinatorics") {
        const combinatoricsTopics = {
            combination: "Kombinasyon",
            permutation: "Permütasyon",
            factorial: "Faktöriyel",
        };
        return { topic: "Kombinatorik", subtopic: combinatoricsTopics[variable] || "Sayma" };
    }

    if (action === "solve") {
        if (/log/.test(text)) return { topic: "Denklemler", subtopic: "Logaritmik Denklem" };
        if (/sqrt|karekök|kok/.test(text)) return { topic: "Denklemler", subtopic: "Köklü Denklem" };
        if (/\||mutlak/.test(text)) return { topic: "Denklemler", subtopic: "Mutlak Değer Denklemi" };
        return { topic: "Denklemler", subtopic: "Denklem Çözümü" };
    }

    if (action === "simplify" || action === "factor" || action === "expand") {
        return { topic: "Cebir", subtopic: "Cebirsel İşlemler" };
    }

    if (action === "integrate") {
        return { topic: "İntegral", subtopic: "İntegral Hesabı" };
    }

    return { topic: "Matematik", subtopic: "Genel" };
};

const inferMathDifficulty = ({ action = null, questionText = "", expression = "", variable = null } = {}) => {
    const text = String(questionText || "").toLocaleLowerCase('tr-TR');
    const expr = String(expression || "");

    if (["area_between_curves", "analyze_asymptotes"].includes(action)) return "Zor";
    if (action === "trig_general_solution" && /\[0,\s*2pi\]|aralig/.test(text)) return "Zor";
    if (/log|sqrt|karekök|mutlak|abs\(|tanım kümesi|tanim kumesi/.test(text + " " + expr)) return "Orta";
    if (["solve_system", "find_extrema", "analyze_derivative", "trig_general_solution"].includes(action)) return "Orta";
    if (action === "coordinate_geometry" && ["line_equation", "distance", "midpoint", "point_to_line_distance"].includes(variable)) return "Kolay";
    if (action === "matrix" && variable === "determinant") return "Kolay";
    if (action === "limit" && /sağdan|sagdan|soldan/.test(text)) return "Orta";
    return "Kolay";
};

const buildMathAnswerMetadata = ({ course = "", questionText = "", mathTrace = [], toolEvents = [] } = {}) => {
    const lastSuccessfulCall = getLastSuccessfulMathCall(toolEvents);
    const action = lastSuccessfulCall?.action || getLastMathAction(mathTrace);
    const variable = lastSuccessfulCall?.variable || null;
    const expression = lastSuccessfulCall?.expression || mathTrace?.[mathTrace.length - 1]?.expression || "";
    const topicMetadata = inferMathTopicMetadata({ action, variable, questionText });
    const difficulty = inferMathDifficulty({ action, variable, questionText, expression });

    return {
        educational: true,
        course: sanitizeMetadataValue(course, "Matematik"),
        topic: sanitizeMetadataValue(topicMetadata.topic, "Matematik"),
        subtopic: sanitizeMetadataValue(topicMetadata.subtopic, "Genel"),
        difficulty: sanitizeMetadataValue(difficulty, "Orta"),
    };
};

const formatMathMetadataBlock = (metadata = {}) => `{educational: ${metadata.educational === false ? "false" : "true"}, course: '${sanitizeMetadataValue(metadata.course, "Matematik")}', topic: '${sanitizeMetadataValue(metadata.topic, "Matematik")}', subtopic: '${sanitizeMetadataValue(metadata.subtopic, "Genel")}', difficulty: '${sanitizeMetadataValue(metadata.difficulty, "Orta")}'}`;

const buildMathFallbackAnswer = ({ toolEvents = [], mathTrace = [] } = {}) => {
    const lastMathEvent = [...toolEvents].reverse().find((event) => event?.name === "calculate_math" && event?.status === "success");
    const action = lastMathEvent?.action || lastMathEvent?.normalized_args?.action || null;
    const variable = lastMathEvent?.normalized_args?.variable || null;
    const result = String(
        lastMathEvent?.response?.readable ||
        lastMathEvent?.response?.result ||
        mathTrace?.[mathTrace.length - 1]?.result ||
        ""
    ).trim();

    if (!result) return null;

    if (action === "solve_system") {
        return `Çözüm sonucu ${result} bulunur.`;
    }

    if (action === "coordinate_geometry" && variable === "line_equation") {
        return `Doğrunun denklemi ${result} olur.`;
    }

    if (action === "coordinate_geometry" && variable === "point_to_line_distance") {
        return `Uzaklık ${result} bulunur.`;
    }

    if (action === "matrix" && variable === "determinant") {
        return `Determinant ${result} bulunur.`;
    }

    if (action === "combinatorics") {
        return `Sonuç ${result} bulunur.`;
    }

    if (action === "limit") {
        return `Limit sonucu ${result} bulunur.`;
    }

    return `Hesaplama sonucu ${result} bulunur.`;
};

const completePartialMathAnswer = async ({
    modelName,
    questionText = "",
    rawAnswerText = "",
    mathTrace = [],
    verifiedChoice = null,
}) => {
    const scalarCandidate = deriveBestScalarCandidate(mathTrace, questionText);
    const knownAnswer = verifiedChoice
        ? `${verifiedChoice.letter}) ${verifiedChoice.text}`
        : (scalarCandidate || "");

    const prompt = `
Asagidaki matematik cozumu eksik veya daginik kapanmis olabilir.
Sadece ogrenciye gosterilecek temiz finali uret.

Kurallar:
- Disariya sadece su formatta yaz:
✅ Doğru Cevap: ...
🎯 Çözüm Mantığı:
- Ana fikir tek cümle.
📝 Adımlar:
- ...
- ... (gerekirse)
- ... (gerekirse)
- Gerekirse sona tek maddelik ⚠️ Kritik Nokta ekle.

Cevap: ...
- En fazla 120 kelime kullan.
- Yeni muhakeme uydurma; sadece verilen taslaktan yararlan.
- "Görsel/Metin Veri Ekstraksiyonu", "Hedef", "Context Analizi", "Matematiksel Formülasyon" gibi çalışma etiketlerini ASLA yazma.
- Bos madde, tek nokta veya anlamsiz satir yazma.
- Adimlar bolumunde sadece gercek matematiksel donusum veya net cikarsama yaz.
- Elinde net cevap yoksa "Cevap:" satirini yazma.

Soru:
${questionText}

Bilinen net cevap:
${knownAnswer || "yok"}

Mevcut taslak:
${String(rawAnswerText || "").slice(0, 5000)}
`.trim();

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "Sen kisa ve net final cevap toparlayicisisin.",
                maxOutputTokens: 350,
                // thinkingLevel: "NONE",
            },
        });
        return String(response?.text || "").trim();
    } catch (_error) {
        return "";
    }
};

const finalizeMathAnswerText = (rawAnswerText, { course = "", questionText = "", mathTrace = [], toolEvents = [], plotBase64 = null, verifiedChoice = null } = {}) => {
    let answerText = stripReasoningBlocks(stripMathMetadataBlocks(rawAnswerText));
    if (!answerText || answerText === DEFAULT_EMPTY_MATH_ANSWER) {
        answerText = buildMathFallbackAnswer({ toolEvents, mathTrace }) || DEFAULT_EMPTY_MATH_ANSWER;
    }

    const explicitFinalAnswer = extractFinalAnswerValue(answerText);
    const explicitChoiceLetter = extractFinalChoiceLetter(answerText);
    const scalarCandidate = deriveBestScalarCandidate(mathTrace, questionText);
    const finalChoiceLetter = verifiedChoice?.letter || explicitChoiceLetter || null;
    const finalChoiceText = verifiedChoice?.text || null;

    if (explicitFinalAnswer) {
        // model already produced final answer in desired format
    } else if (finalChoiceLetter && finalChoiceText) {
        answerText = `${answerText.trim()}\n\nCevap: ${finalChoiceLetter}) ${finalChoiceText}`;
    } else if (finalChoiceLetter) {
        answerText = `${answerText.trim()}\n\nCevap: ${finalChoiceLetter}`;
    } else if (scalarCandidate) {
        answerText = `${answerText.trim()}\n\nCevap: ${scalarCandidate}`;
    }

    if (finalChoiceLetter && !/Doğru cevap\s+[A-E]\s+şıkkıdır/i.test(answerText)) {
        answerText = `${answerText.trim()}\n\nDoğru cevap ${finalChoiceLetter} şıkkıdır.`;
    }

    if (plotBase64) {
        answerText += `\n\n[GRAPH_BASE64:${plotBase64}]`;
    }

    if (verifiedChoice && !/Nihai doğrulanmış seçenek:/i.test(answerText)) {
        answerText += `\n\nNihai doğrulanmış seçenek: ${verifiedChoice.letter}) ${verifiedChoice.text}`;
    }

    const metadataBlock = formatMathMetadataBlock(
        buildMathAnswerMetadata({ course, questionText, mathTrace, toolEvents })
    );

    // Fix \cdot incorrectly placed inside parentheses
    // e.g. "4(\cdot 9)" → "4 \cdot 9", ")(·(x-a)²)" → ") \cdot (x-a)²"
    // Safe: only targets \cdot preceded by )digit or followed by digit/variable, not f(\cdot) notation
    answerText = answerText
        .replace(/\)\(\\cdot\s*/g, ') \\cdot ')
        .replace(/(\d)\(\\cdot\s*/g, '$1 \\cdot ')
        .replace(/\\cdot\s*=\s*/g, '\\cdot ')
        .replace(/\(\\cdot\s*(\d)/g, '\\cdot $1');

    return `${answerText}\n\n${metadataBlock}`;
};

const buildSkippedVerificationResponse = (reason, hint = null) => ({
    status: "success",
    skipped: true,
    is_verified: true,
    message: reason,
    ...(hint ? { hint } : {}),
});

const looksLikeSystemEquation = (equation = "") => splitBalancedComma(String(equation || "")).length > 1;

const looksLikeGeneralTrigSolution = (value = "") => {
    const text = String(value || "");
    return /ImageSet|Integers|Union\(/.test(text)
        || /\b(k|n)\s*(?:∈|in)\s*(?:Z|ℤ|\\mathbb\{Z\})/i.test(text)
        || /roots_0_2pi|general_solution/.test(text);
};

const looksLikeCompositeVerificationEquation = (equation = "") => {
    const text = String(equation || "").trim();
    if (!text) return false;
    return /\bAND\b|\bOR\b/i.test(text)
        || /result\s*=|sonuc\s*=|sonuç\s*=/i.test(text)
        || (text.match(/=/g) || []).length > 1;
};

const shouldSkipDerivedValueVerification = (originalProblem = "", equation = "", solution = "") => {
    const problemText = String(originalProblem || "");
    const equationText = String(equation || "");
    const solutionText = String(solution || "").trim();
    if (!solutionText || /[a-zA-Z_]/.test(solutionText)) return false;

    const asksDerivedTrigValue = /\b(cot|tan|sin|cos|sec|csc)\s*x\b/i.test(problemText);
    const equationSolvesForX = /\bx\b/.test(equationText);
    return asksDerivedTrigValue && equationSolvesForX;
};

const resolveVerificationPolicy = (callArgs = {}, mathTrace = []) => {
    const lastMathAction = getLastMathAction(mathTrace);
    const equation = typeof callArgs.equation === 'string' ? callArgs.equation.trim() : '';
    const solution = typeof callArgs.solution === 'string' ? callArgs.solution.trim() : '';
    const originalProblem = typeof callArgs.original_problem === 'string' ? callArgs.original_problem.trim() : '';

    if (['limit', 'analyze_derivative', 'solve_system', 'trig_general_solution', 'coordinate_geometry', 'area_between_curves', 'combinatorics'].includes(lastMathAction)) {
        return {
            skip: buildSkippedVerificationResponse(
                `verify_equation bu işlem için gerekmiyor (${lastMathAction}).`,
                "Bu tür sorularda calculate_math sonucunu doğrudan kullan."
            ),
            reason: `last_action=${lastMathAction}`,
        };
    }

    if (looksLikeSystemEquation(equation)) {
        return {
            skip: buildSkippedVerificationResponse(
                "verify_equation denklem sistemleri için atlandı.",
                "Denklem sistemi doğrulaması calculate_math sonucu içinde zaten yapılıyor."
            ),
            reason: "equation_system",
        };
    }

    if (looksLikeCompositeVerificationEquation(equation)) {
        return {
            skip: buildSkippedVerificationResponse(
                "verify_equation bileşik veya çok parçalı denklem için atlandı.",
                "Tek bir SymPy denklem/fark ifadesi olmadan verify_equation çağırma."
            ),
            reason: "composite_equation",
        };
    }

    if (looksLikeGeneralTrigSolution(equation) || looksLikeGeneralTrigSolution(solution) || looksLikeGeneralTrigSolution(originalProblem)) {
        return {
            skip: buildSkippedVerificationResponse(
                "verify_equation genel trig çözümü için atlandı.",
                "Trigonometrik genel çözüm kümelerinde calculate_math sonucunu kullan."
            ),
            reason: "general_trig_solution",
        };
    }

    if (shouldSkipDerivedValueVerification(originalProblem, equation, solution)) {
        return {
            skip: buildSkippedVerificationResponse(
                "verify_equation turetilmis trigonometrik deger icin atlandi.",
                "Soruda istenen ifade x degilse, nihai degeri cebirsel cozum ve sik esleme ile dogrula."
            ),
            reason: "derived_trig_value",
        };
    }

    return { skip: null, reason: null };
};

/**
 * Ters Doğrulama (Reverse Verification)
 * Sözel problemde kurulmuş denklemin doğru olup olmadığını kontrol eder.
 */
const verifyMathSolution = async (originalProblem, equation, solution) => {
    try {
        const response = await axios.post('http://localhost:8000/verify', {
            original_problem: originalProblem,
            equation,
            solution
        }, { timeout: 10000 });
        return response.data;
    } catch (error) {
        console.error("Verify Service Error:", error.message);
        return null;
    }
};

/**
 * Geometrik Tutarlılık Doğrulama
 * Gemini'nin görselden okuduğu geometrik verilerin tutarlılığını kontrol eder.
 */
const validateGeometry = async (geometryData) => {
    try {
        const response = await axios.post('http://localhost:8000/validate-geometry', geometryData, { timeout: 10000 });
        return response.data;
    } catch (error) {
        console.error("Geometry Validation Error Axios:", error.response ? error.response.data : error.message);
        return null;
    }
};

/**
 * Gemini Tool Definitions v2.0 - Gelişmiş Matematik Araçları
 */
const fullMathTools = [
    {
        functionDeclarations: [
            {
                name: "calculate_math",
                description: `Matematiksel hesaplama ve analiz aracı. İfadeyi SymPy formatında yaz: çarpma *, üs **, karekök sqrt(), mutlak değer Abs(); ^ kullanma.

Temel işlemler: solve, simplify, derivative, integrate, factor, expand, limit, plot.

Gelişmiş işlemler: analyze_roots (kök/işaret analizi), find_extrema (ekstremum), analyze_asymptotes (asimptot), area_between_curves (iki eğri arası alan), trig_general_solution (genel trig çözümü), solve_system (denklem sistemi), matrix (determinant/inverse/eigenvalues/rank/rref), coordinate_geometry (distance/midpoint/line_equation/circle_line_intersection/point_to_line_distance), combinatorics (permutation/combination/factorial).

Action'a uygun alan kullan:
- solve/simplify/... için expression
- solve_system için equations + variables
- matrix için matrix + matrix_action
- coordinate_geometry için params

Bu gelişmiş aksiyonları gerektiğinde TEK ADIMDA çağır; zincirleme basit işlem yapma.`,
                parameters: {
                    type: "OBJECT",
                    properties: {
                        expression: {
                            type: "STRING",
                            description: "Çözülecek matematiksel ifade. MUTLAKA SymPy formatında yaz. Denklem ise eşittirin sağını sola taşı: '3*x + 5 = 14' yerine '3*x + 5 - 14'. Eğriler arası alan için f(x)-g(x) farkını yaz."
                        },
                        equations: {
                            type: "ARRAY",
                            description: "solve_system için denklemler dizisi. Örn: ['x+y-8', 'x-y-2']",
                            items: { type: "STRING" }
                        },
                        variables: {
                            type: "ARRAY",
                            description: "solve_system için bilinmeyenler dizisi. Örn: ['x', 'y']",
                            items: { type: "STRING" }
                        },
                        matrix: {
                            type: "ARRAY",
                            description: "matrix action için matris. Örn: [[1,2],[3,4]]",
                            items: {
                                type: "ARRAY",
                                items: { type: "NUMBER" }
                            }
                        },
                        matrix_action: {
                            type: "STRING",
                            description: "matrix action alt işlemi.",
                            enum: ["determinant", "inverse", "eigenvalues", "rank", "rref"]
                        },
                        params: {
                            type: "OBJECT",
                            description: "coordinate_geometry için parametre nesnesi."
                        },
                        action: {
                            type: "STRING",
                            description: "Yapılacak işlem türü. Geometri soruları için solve_geometry kullanabilirsin.",
                            enum: ["solve", "simplify", "derivative", "integrate", "factor", "expand", "limit", "plot", "analyze_roots", "find_extrema", "analyze_asymptotes", "area_between_curves", "trig_general_solution", "solve_system", "matrix", "coordinate_geometry", "combinatorics", "analyze_derivative", "solve_geometry"]
                        },
                        variable: {
                            type: "STRING",
                            description: "Tek değişkenli işlemlerde kullanılacak değişken. Denklem sistemi için bunun yerine variables dizisini tercih et."
                        },
                        limit_point: {
                            type: "STRING",
                            description: "Sadece action='limit' ise: Limitin hesaplanacağı nokta. Örn: '0', 'oo' (sonsuz), 'pi'."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "verify_equation",
                description: "Bir sözel problemi denkleme çevirdiğinde, kurduğun denklemin ve bulduğun sonucun doğruluğunu kontrol etmek için bu fonksiyonu kullan. Çözümü bulduktan SONRA mutlaka çağır.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        original_problem: {
                            type: "STRING",
                            description: "Öğrencinin sorduğu orijinal sözel problem (ham haliyle)."
                        },
                        equation: {
                            type: "STRING",
                            description: "Problemden türettiğin matematiksel denklem (SymPy formatında, sol taraf - sağ taraf şeklinde)."
                        },
                        solution: {
                            type: "STRING",
                            description: "Hesaplama sonucu bulunan çözüm. YALNIZCA makinece okunabilir sade format kullan: '10', '{x: 10, y: 35}', '[2, 3]' veya 'y = 2*x'. Açıklama cümlesi yazma."
                        }
                    },
                    required: ["original_problem", "equation", "solution"]
                }
            },
            {
                name: "validate_geometry",
                description: "Bir geometri sorusunda görselden veya metinden okuduğun şekil verilerinin (kenarlar, açılar, alan vs.) geometrik olarak tutarlı olup olmadığını kontrol etmek için bu fonksiyonu kullan. Hesaplamaya başlamadan ÖNCE mutlaka çağır.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        shape: {
                            type: "STRING",
                            description: "Şeklin tipi: triangle (üçgen), rectangle (dikdörtgen), circle (daire), parallelogram (paralelkenar).",
                            enum: ["triangle", "rectangle", "circle", "parallelogram"]
                        },
                        sides: {
                            type: "ARRAY",
                            items: { type: "NUMBER" },
                            description: "Kenar uzunlukları dizisi. Örn: [3, 4, 5]"
                        },
                        angles: {
                            type: "ARRAY",
                            items: { type: "NUMBER" },
                            description: "Açı değerleri (derece cinsinden) dizisi. Örn: [60, 60, 60]"
                        },
                        area: {
                            type: "NUMBER",
                            description: "Verilen alan değeri (varsa)."
                        },
                        perimeter: {
                            type: "NUMBER",
                            description: "Verilen çevre değeri (varsa)."
                        },
                        height: {
                            type: "NUMBER",
                            description: "Verilen yükseklik değeri (varsa)."
                        },
                        radius: {
                            type: "NUMBER",
                            description: "Verilen yarıçap değeri (daire/yay için)."
                        },
                        base: {
                            type: "NUMBER",
                            description: "Verilen taban uzunluğu (varsa)."
                        }
                    },
                    required: ["shape"]
                }
            }
        ]
    }
];

const TOOL_DESCRIPTION_OVERRIDES = {
    calculate_math: 'Matematiksel analiz aracı. SymPy formatı kullan.',
    verify_equation: 'Denklem ve çözüm doğruluğunu kontrol et.',
    validate_geometry: 'Geometrik veri tutarlılığını doğrula.',
};

const buildToolBundle = (toolNames = []) => [
    {
        functionDeclarations: fullMathTools[0].functionDeclarations
            .filter((declaration) => toolNames.includes(declaration.name))
            .map((declaration) => ({
                ...declaration,
                description: TOOL_DESCRIPTION_OVERRIDES[declaration.name] || declaration.description,
            })),
    },
];

const coreMathTools = buildToolBundle(["calculate_math", "verify_equation"]);
const geometryMathTools = buildToolBundle(["calculate_math", "verify_equation", "validate_geometry"]);
const minimalMathTools = buildToolBundle(["calculate_math"]);
const noMathTools = [];

const selectMathToolVariant = ({ scenario = 'generic_math', forceFullFlow = false, needsGeometryValidation = false, equationMode = null, questionText = '' } = {}) => {
    if (forceFullFlow || scenario === 'visual_or_retry') {
        return {
            toolVariant: 'full_math_tools',
            tools: fullMathTools,
        };
    }

    if (scenario === 'coordinate_geometry' && needsGeometryValidation) {
        return {
            toolVariant: 'geometry_tools',
            tools: geometryMathTools,
        };
    }

    if (shouldDisableToolsForQuestion(scenario, questionText)) {
        return {
            toolVariant: 'no_math_tools',
            tools: noMathTools,
        };
    }

    if (scenario === 'equation') {
        if (equationMode === 'simple') {
            return {
                toolVariant: 'minimal_math_tools',
                tools: minimalMathTools,
            };
        }

        return {
            toolVariant: 'core_math_tools',
            tools: coreMathTools,
        };
    }

    if ([
        'limit',
        'system',
        'derivative_extrema',
        'trig',
        'area_between_curves',
        'coordinate_geometry',
        'matrix',
        'combinatorics',
    ].includes(scenario)) {
        return {
            toolVariant: 'minimal_math_tools',
            tools: minimalMathTools,
        };
    }

    // ÖNEMLİ: Senaryo ne olursa olsun (forceFullFlow hariç) verify_equation'ı sadece
    // sözel problemlerde veya açıkça ihtiyaç duyulduğunda göndererek token tasarrufu sağla.
    if (scenario === 'generic_math') {
        return {
            toolVariant: 'minimal_math_tools',
            tools: minimalMathTools,
        };
    }

    return {
        toolVariant: 'core_math_tools',
        tools: coreMathTools,
    };
};

/**
 * Gelişmiş AI Soru-Cevap Fonksiyonu v2.0 (Multi-Tool Use + Doğrulama Döngüsü)
 * Gemini birden fazla tool çağırabilir ve sonuçları doğrulama döngüsüne sokabilir.
 */
const askAiWithMath = async (course, questionText, history = [], systemInstruction = "", base64Image = null, options = {}) => {
    try {
        if (!shouldUseHeavyMathFlow(course, questionText, base64Image)) {
            return await askAiSimple(course, questionText, history, systemInstruction, base64Image, options.modelOverride, options);
        }
        const modelName = options.modelOverride || DEFAULT_CHAT_MODEL;

        let visualPreparation = {
            extractedText: null,
            usageMetadata: null,
            usedExtraction: false,
        };

        if (base64Image) {
            // Görsel okutup çözdürme kapatıldı, Gemini doğrudan görseli alıp çözecek
            /*
            const extraction = await performVisualExtraction(course, base64Image);
            if (extraction) {
                visualPreparation = {
                    extractedText: extraction.extractedText,
                    usageMetadata: extraction.usageMetadata || {},
                    usedExtraction: true,
                };
            }
            */
        }

        const scenarioQuestionText = visualPreparation.extractedText
            ? `ÇIKARILAN SORU VERİLERİ:\n${visualPreparation.extractedText}`
            : questionText;
        const scenarioBase64 = visualPreparation.usedExtraction ? null : base64Image;

        const scenarioInfo = ENABLE_SCENARIO_MATH_PROMPTS
            ? classifyMathScenario(course, scenarioQuestionText, history, scenarioBase64)
            : {
                scenario: 'generic_math',
                confidence: 1,
                needsGeometryValidation: Boolean(scenarioBase64),
                forceFullFlow: true,
                mixed: false,
                reason: 'feature_flag_disabled',
                equationMode: null,
            };

        const buildFlowPlan = ({ forceFullFlow = false, fallbackApplied = false, fallbackReason = null } = {}) => {
            const preserveFullHistory = !ENABLE_SCENARIO_MATH_PROMPTS || forceFullFlow || scenarioInfo.forceFullFlow || scenarioInfo.scenario === 'visual_or_retry';
            const scenario = scenarioInfo.scenario;
            const { promptVariant, promptText } = selectMathPromptVariant({
                scenario,
                systemInstruction,
                forceFullFlow: preserveFullHistory,
                equationMode: scenarioInfo.equationMode,
            });
            const { toolVariant, tools } = selectMathToolVariant({
                scenario,
                forceFullFlow: preserveFullHistory,
                needsGeometryValidation: scenarioInfo.needsGeometryValidation,
                equationMode: scenarioInfo.equationMode,
                questionText: scenarioQuestionText,
            });
            const plannerDirective = buildMathPlannerDirective(scenarioQuestionText);

            return {
                ...scenarioInfo,
                scenario,
                forceFullFlow: preserveFullHistory,
                promptVariant,
                promptText: `${promptText}${plannerDirective ? '\n' + plannerDirective.trim() + '\n' : ''}`,
                toolVariant,
                tools,
                initialHistory: trimMathHistoryForInitialCall(history, TEXT_ONLY_MATH_HISTORY_LIMIT, preserveFullHistory),
                fallbackApplied,
                fallbackReason,
                plannerDirective,
                scenarioQuestionText,
            };
        };

        const runMathFlow = async (flowPlan) => {
            const modelConfig = {
                systemInstruction: flowPlan.promptText,
                tools: flowPlan.tools,
                // thinkingLevel: "NONE",
                maxOutputTokens: 2000,
            };

            let currentHistory = flowPlan.initialHistory.map((turn) => ({
                role: turn.role,
                parts: Array.isArray(turn.parts) ? [...turn.parts] : [],
            }));

            const askGemini = async (input, hist, image = null) => {
                const parts = [{ text: input || "Bu soruyu veya görseldeki problemi çözer misin?" }];
                const resolvedMimeType = (options && typeof options.imageMimeType === 'string' && options.imageMimeType)
                    ? options.imageMimeType
                    : 'image/jpeg';

                if (image) {
                    parts.push({
                        inlineData: {
                            data: image.replace(/^data:image\/\w+;base64,/, ""),
                            mimeType: resolvedMimeType
                        }
                    });
                }

                return await ai.models.generateContent({
                    model: modelName,
                    contents: [...hist, { role: "user", parts }],
                    config: modelConfig,
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                    ]
                });
            };

            let cascadePerceptionMeta = visualPreparation.usageMetadata || null;
            let effectiveQuestionText = visualPreparation.usedExtraction
                ? `ÇIKARILAN SORU VERİLERİ:\n${visualPreparation.extractedText}`
                : questionText;
            let effectiveImage = visualPreparation.usedExtraction ? null : base64Image;

            if (base64Image && visualPreparation.usedExtraction) {
                console.log(`[CASCADE] 🧠 Reasoning aşamasına geçiliyor (görsel gönderilmeyecek).`);
            } else if (base64Image) {
                console.log(`[CASCADE] ⚡ Görsel doğrudan Gemini'ye gönderiliyor.`);
                // Geometrik bias kaldırıldı: effectiveQuestionText olduğu gibi kalıyor
            }

            let result = await askGemini(
                effectiveQuestionText,
                currentHistory,
                effectiveImage
            );
            let response = result;

            const perceptionPromptTokens = cascadePerceptionMeta?.promptTokenCount || 0;
            const perceptionCompletionTokens = cascadePerceptionMeta?.candidatesTokenCount || 0;
            let promptTokens = result?.usageMetadata?.promptTokenCount || 0;
            let completionTokens = result?.usageMetadata?.candidatesTokenCount || 0;
            let reasoningTokens = result?.usageMetadata?.reasoning_tokens || 0;
            let initialReasoningPromptTokens = result?.usageMetadata?.promptTokenCount || 0;
            let initialReasoningCompletionTokens = result?.usageMetadata?.candidatesTokenCount || 0;
            let initialReasoningReasoningTokens = result?.usageMetadata?.reasoning_tokens || 0;
            let followupPromptTokens = 0;
            let followupCompletionTokens = 0;
            let followupReasoningTokens = 0;

            if (effectiveImage && (!response.functionCalls || response.functionCalls.length === 0)) {
                const retryResult = await askGemini(
                    `${questionText}\n\nUygun aracı kullanmadan nihai cevap verme. Önce görseldeki verileri çıkar ve gerekli tool çağrısını yap.`,
                    currentHistory,
                    effectiveImage
                );
                response = retryResult;
                promptTokens += (retryResult?.usageMetadata?.promptTokenCount || 0);
                completionTokens += (retryResult?.usageMetadata?.candidatesTokenCount || 0);
                reasoningTokens += (retryResult?.usageMetadata?.reasoning_tokens || 0);
                initialReasoningPromptTokens += (retryResult?.usageMetadata?.promptTokenCount || 0);
                initialReasoningCompletionTokens += (retryResult?.usageMetadata?.candidatesTokenCount || 0);
                initialReasoningReasoningTokens += (retryResult?.usageMetadata?.reasoning_tokens || 0);
            }

            // OPTİMİZASYON: İlk mesajdan sonra sistem promptunu dondur (Token Diyeti - Strateji 1)
            const miniSystemPrompt = "Devam et. Sonucu net belirt. Coktan secmeli ise sikki yaz.";


            const initialUserParts = [{ text: effectiveQuestionText || "Bu soruyu veya görseldeki problemi çözer misin?" }];
            if (effectiveImage) {
                initialUserParts.push({
                    inlineData: {
                        data: effectiveImage.replace(/^data:image\/\w+;base64,/, ""),
                        mimeType: "image/jpeg"
                    }
                });
            }
            currentHistory.push({ role: "user", parts: initialUserParts });

            let mathFlow = buildMathFlowMetrics({
                promptVariant: flowPlan.promptVariant,
                toolVariant: flowPlan.toolVariant,
                scenario: flowPlan.scenario,
                confidence: flowPlan.confidence,
                initialHistory: flowPlan.initialHistory,
                loopPayload: [...flowPlan.initialHistory, { role: "user", parts: initialUserParts }],
                promptText: flowPlan.promptText,
                tools: flowPlan.tools,
                questionText: flowPlan.scenarioQuestionText,
                fallbackApplied: flowPlan.fallbackApplied,
                fallbackReason: flowPlan.fallbackReason,
            });
            mathFlow.actualTokens = {
                prompt: promptTokens,
                completion: completionTokens,
                reasoning: reasoningTokens,
                total: promptTokens + completionTokens + reasoningTokens
            };
            mathFlow.tokenBreakdown = {
                perception: {
                    prompt: perceptionPromptTokens,
                    completion: perceptionCompletionTokens,
                    total: perceptionPromptTokens + perceptionCompletionTokens,
                },
                initialReasoning: {
                    prompt: initialReasoningPromptTokens,
                    completion: initialReasoningCompletionTokens,
                    reasoning: initialReasoningReasoningTokens,
                    total: initialReasoningPromptTokens + initialReasoningCompletionTokens + initialReasoningReasoningTokens,
                },
                followupReasoning: {
                    prompt: followupPromptTokens,
                    completion: followupCompletionTokens,
                    reasoning: followupReasoningTokens,
                    total: 0,
                },
            };
            console.log(`[TOKEN_TRACKER] Başlangıç (Perception + First Reasoning):`, mathFlow.actualTokens);
            mathFlow.estimatedTokens.maxLoopTotal = mathFlow.estimatedTokens.currentLoopTotal;

            const maxIterations = getMaxToolIterations(flowPlan);
            let iteration = 0;
            let plotBase64 = null;
            const mathTrace = [];
            const toolEvents = [];
            const toolCallCounts = new Map();
            let toolCallCount = 0;
            let toolErrorCount = 0;

            while (iteration < maxIterations) {
                const functionCalls = response.functionCalls;
                if (!functionCalls || functionCalls.length === 0) break;

                iteration++;
                const toolResponses = [];

                currentHistory.push({
                    role: "model",
                    parts: response.candidates?.[0]?.content?.parts || []
                });

                for (const call of functionCalls) {
                    console.log(`[Tool Call #${iteration}] ${call.name}:`, JSON.stringify(call.args).substring(0, 200));
                    let toolResult = null;
                    let normalizedArgs = null;
                    toolCallCount++;

                    if (call.name === "calculate_math") {
                        normalizedArgs = normalizeMathToolArgs(call.args, { questionText });

                        if (!flowPlan.forceFullFlow && !isScenarioActionConsistent(flowPlan.scenario, normalizedArgs.action)) {
                            mathFlow.iterations = iteration;
                            mathFlow.toolCallCount = toolCallCount;
                            mathFlow.toolErrorCount = toolErrorCount;
                            return {
                                fallbackRequested: true,
                                fallbackReason: "SCENARIO_ACTION_MISMATCH",
                                mathFlow,
                            };
                        }

                        const fingerprint = buildToolCallFingerprint(call.name, normalizedArgs);
                        const previousAttempts = toolCallCounts.get(fingerprint) || 0;

                        if (previousAttempts >= 1) {
                            toolResult = makeToolError(
                                "REPEATED_TOOL_CALL",
                                "Aynı calculate_math çağrısı tekrarlandı.",
                                "Aynı payload'ı tekrar gönderme; action veya argümanları değiştir."
                            );
                        } else if (normalizedArgs.validationError) {
                            toolCallCounts.set(fingerprint, previousAttempts + 1);
                            toolResult = normalizedArgs.validationError;
                        } else {
                            toolCallCounts.set(fingerprint, previousAttempts + 1);
                            const mathResult = await solveMathProblem(
                                normalizedArgs.expression,
                                normalizedArgs.action,
                                normalizedArgs.variable,
                                normalizedArgs.limitPoint,
                                normalizedArgs.extraPayload
                            );
                            if (mathResult && mathResult.status === "success") {
                                toolResult = {
                                    result: mathResult.result,
                                    readable: mathResult.readable_result,
                                };
                                if (mathResult.plot_base64) {
                                    plotBase64 = mathResult.plot_base64;
                                    toolResult.plot_available = true;
                                }
                                mathTrace.push({
                                    action: normalizedArgs.action,
                                    expression: normalizedArgs.expression,
                                    result: String(mathResult.result || "")
                                });
                            } else {
                                toolResult = mathResult || makeToolError(
                                    "MATH_SERVICE_FAILED",
                                    "Hesaplama servisi anlamlı bir yanıt döndürmedi.",
                                    "Expression veya action formatını düzeltip tekrar dene."
                                );
                            }
                        }
                    } else if (call.name === "verify_equation") {
                        const verificationPolicy = resolveVerificationPolicy(call.args, mathTrace);
                        if (verificationPolicy.skip) {
                            toolResult = verificationPolicy.skip;
                        } else {
                            const sanitizedVerifyArgs = {
                                ...call.args,
                                solution: sanitizeVerificationSolution(call.args?.solution),
                            };
                            const verifyResult = await verifyMathSolution(
                                sanitizedVerifyArgs.original_problem,
                                sanitizedVerifyArgs.equation,
                                sanitizedVerifyArgs.solution
                            );
                            toolResult = verifyResult || makeToolError(
                                "VERIFY_SERVICE_UNAVAILABLE",
                                "Doğrulama motoru yanıt vermedi.",
                                "Gerekirse denklemi sadeleştirip verify_equation ile tekrar dene."
                            );
                        }
                    } else if (call.name === "validate_geometry") {
                        const geoResult = await validateGeometry(call.args);
                        toolResult = geoResult || makeToolError(
                            "GEOMETRY_SERVICE_UNAVAILABLE",
                            "Geometri doğrulama servisi ulaşılamıyor.",
                            "Verileri tekrar okuyup validate_geometry ile yeniden dene."
                        );
                    }

                    toolEvents.push({
                        iteration,
                        name: call.name,
                        action: normalizedArgs?.action || call.args?.action || null,
                        args: call.args || {},
                        normalized_args: normalizedArgs ? {
                            action: normalizedArgs.action,
                            expression: normalizedArgs.expression,
                            variable: normalizedArgs.variable,
                            limitPoint: normalizedArgs.limitPoint,
                            extraPayload: normalizedArgs.extraPayload,
                        } : null,
                        status: toolResult?.status || "success",
                        code: toolResult?.code || null,
                        response: toolResult,
                    });
                    if (toolResult?.status === "error") {
                        toolErrorCount++;
                    }

                    // OPTİMİZASYON: Tool yanıtını sıkıştır (Token Diyeti - Strateji 4)
                    const compressedToolResult = toolResult?.result
                        ? { result: toolResult.result }
                        : (toolResult?.status === "error"
                            ? { status: "error", code: toolResult.code || "TOOL_ERROR", hint: buildToolErrorHint(toolResult) }
                            : (toolResult || { status: "error" }));

                    toolResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: compressedToolResult
                        }
                    });
                }

                console.log(`\n[AI TOOL GÖNDERİLİYOR] AI'a gönderilen Tool Response:`, JSON.stringify(toolResponses, null, 2));

                try {
                    currentHistory.push({ role: "user", parts: toolResponses });
                    const payloadContents = buildLoopPayloadContents(currentHistory, initialUserParts, flowPlan, iteration);

                    const loopMetrics = buildMathFlowMetrics({
                        promptVariant: flowPlan.promptVariant,
                        toolVariant: flowPlan.toolVariant,
                        scenario: flowPlan.scenario,
                        confidence: flowPlan.confidence,
                        initialHistory: flowPlan.initialHistory,
                        loopPayload: payloadContents,
                        promptText: flowPlan.promptText,
                        tools: flowPlan.tools,
                        questionText: flowPlan.scenarioQuestionText,
                        fallbackApplied: flowPlan.fallbackApplied,
                        fallbackReason: flowPlan.fallbackReason,
                    });

                    const debugPayload = JSON.parse(JSON.stringify(payloadContents));
                    debugPayload.forEach(turn => {
                        turn.parts.forEach(p => {
                            if (p.inlineData) p.inlineData.data = "[BASE64_IMAGE_DATA]";
                        });
                    });
                    console.log(`\n[GEMINI'YE GIDEN TAM KONUSMA GECMISI]:\n`, JSON.stringify(debugPayload, null, 2));

                    // OPTİMİZASYON: Iterasyon 1+ ise sistem mesajını dondur (Token Diyeti - Strateji 1)
                    if (iteration > 0 && modelConfig.systemInstruction !== miniSystemPrompt) {
                        modelConfig.systemInstruction = miniSystemPrompt;
                        console.log(`[TOKEN_DIET] Sistem mesajı donduruldu (Iteration ${iteration}).`);
                    }

                    result = await ai.models.generateContent({
                        model: modelName,
                        contents: payloadContents,
                        config: modelConfig
                    });

                    response = result;

                    const apiUsage = response?.usageMetadata || response?.response?.usageMetadata;
                    if (apiUsage) {
                        mathFlow.actualTokens.prompt += (apiUsage.promptTokenCount || 0);
                        mathFlow.actualTokens.completion += (apiUsage.candidatesTokenCount || 0);
                        if (apiUsage.reasoning_tokens) {
                            mathFlow.actualTokens.reasoning = (mathFlow.actualTokens.reasoning || 0) + apiUsage.reasoning_tokens;
                        }

                        followupPromptTokens += (apiUsage.promptTokenCount || 0);
                        followupCompletionTokens += (apiUsage.candidatesTokenCount || 0);
                        followupReasoningTokens += (apiUsage.reasoning_tokens || 0);
                        mathFlow.tokenBreakdown.followupReasoning = {
                            prompt: followupPromptTokens,
                            completion: followupCompletionTokens,
                            reasoning: followupReasoningTokens,
                            total: followupPromptTokens + followupCompletionTokens + followupReasoningTokens,
                        };

                        mathFlow.actualTokens.total = mathFlow.actualTokens.prompt + mathFlow.actualTokens.completion + (mathFlow.actualTokens.reasoning || 0);
                        mathFlow.estimatedTokens.currentLoopTotal = apiUsage.totalTokenCount || loopMetrics.estimatedTokens.currentLoopTotal;

                        console.log(`[TOKEN_TRACKER] Ara Adım Eklendi (Iteration ${iteration}):`, apiUsage);
                        console.log(`[TOKEN_TRACKER] Yeni Güncel Toplam:`, mathFlow.actualTokens);
                    } else {
                        mathFlow.estimatedTokens.currentLoopTotal = loopMetrics.estimatedTokens.currentLoopTotal;
                    }

                    mathFlow.estimatedTokens.maxLoopTotal = Math.max(
                        mathFlow.estimatedTokens.maxLoopTotal || 0,
                        mathFlow.estimatedTokens.currentLoopTotal
                    );

                    if (response.functionCalls && response.functionCalls.length > 0) {
                        console.log(`\n[AI YANITI ALINDI] Model zincirleme olarak yeni araçlar kullanmaya karar verdi.`);
                    } else {
                        console.log(`\n[AI YANITI ALINDI] Model nihai yanıtı üretti.`);
                    }
                } catch (innerErr) {
                    console.error("\n[TOOL RESPONSE HATASI] AI araca cevap verirken patladı:", innerErr);
                    break;
                }
            }

            const truncated = Boolean(iteration >= maxIterations && response.functionCalls && response.functionCalls.length > 0);
            if (truncated) {
                console.log("[LIMIT AŞILDI] Model çok fazla araç kullandı. Son bir toparlama isteniyor...");
                currentHistory.push({
                    role: "model",
                    parts: response.candidates?.[0]?.content?.parts || []
                });
                currentHistory.push({
                    role: "user",
                    parts: [{ text: "Çok fazla işlem adımı geçti. Lütfen şimdiye kadar bulduğun sonuçları kullanarak nihai cevabı açıkla ve sohbeti sonlandır." }]
                });
                response = await ai.models.generateContent({
                    model: modelName,
                    contents: currentHistory,
                    config: modelConfig
                });
                const truncatedUsage = response?.usageMetadata || response?.response?.usageMetadata;
                if (truncatedUsage) {
                    mathFlow.actualTokens.prompt += (truncatedUsage.promptTokenCount || 0);
                    mathFlow.actualTokens.completion += (truncatedUsage.candidatesTokenCount || 0);
                    mathFlow.actualTokens.reasoning += (truncatedUsage.reasoning_tokens || 0);
                    followupPromptTokens += (truncatedUsage.promptTokenCount || 0);
                    followupCompletionTokens += (truncatedUsage.candidatesTokenCount || 0);
                    followupReasoningTokens += (truncatedUsage.reasoning_tokens || 0);
                    mathFlow.tokenBreakdown.followupReasoning = {
                        prompt: followupPromptTokens,
                        completion: followupCompletionTokens,
                        reasoning: followupReasoningTokens,
                        total: followupPromptTokens + followupCompletionTokens + followupReasoningTokens,
                    };
                    mathFlow.actualTokens.total = mathFlow.actualTokens.prompt + mathFlow.actualTokens.completion + mathFlow.actualTokens.reasoning;
                }
            }

            const verifiedChoice = await resolveVerifiedMultipleChoice(questionText, mathTrace);

            let answerText = "Yapay Zeka bu soruya içerik üretemedi.";
            try {
                answerText = response.text || answerText;
            } catch (e) {
                console.error("Text parse error:", e);
            }

            // POST-PROCESSING: Tekrar eden satır bloklarını agresif kırp
            const lines = answerText.split('\n');
            const cleanLines = [];
            const recentWindow = [];
            const WINDOW_SIZE = 4;
            let loopCount = 0;
            for (const line of lines) {
                const norm = line.trim().replace(/\s+/g, ' ');
                if (norm.length > 15 && recentWindow.includes(norm)) {
                    loopCount++;
                    continue; // tekrar eden satırı atla
                }
                cleanLines.push(line);
                recentWindow.push(norm);
                if (recentWindow.length > WINDOW_SIZE * 6) recentWindow.shift();
            }
            if (loopCount > 0) {
                console.log(`[DÖNGÜ FİLTRESİ] ${loopCount} tekrar eden satır kırpıldı.`);
            }
            answerText = cleanLines.join('\n');

            answerText = finalizeMathAnswerText(answerText, {
                course,
                questionText,
                mathTrace,
                toolEvents,
                plotBase64,
                verifiedChoice,
            });

            if (shouldRunFinalizer({ answerText, verifiedChoice, mathTrace, questionText })) {
                const completedAnswer = await completePartialMathAnswer({
                    modelName,
                    questionText,
                    rawAnswerText: answerText,
                    mathTrace,
                    verifiedChoice,
                });
                if (completedAnswer) {
                    answerText = finalizeMathAnswerText(completedAnswer, {
                        course,
                        questionText,
                        mathTrace,
                        toolEvents,
                        plotBase64,
                        verifiedChoice,
                    });
                }
            }

            mathFlow.iterations = iteration;
            mathFlow.truncated = truncated;
            mathFlow.toolCallCount = toolCallCount;
            mathFlow.toolErrorCount = toolErrorCount;

            return {
                answerText,
                mathTrace,
                toolEvents,
                iterations: iteration,
                truncated,
                mathFlow,
            };
        };

        let flowPlan = buildFlowPlan();
        let finalResult = await runMathFlow(flowPlan);
        let preFallbackMathFlow = null;

        if (finalResult?.fallbackRequested && !flowPlan.forceFullFlow) {
            preFallbackMathFlow = finalResult.mathFlow || null;
            flowPlan = buildFlowPlan({
                forceFullFlow: true,
                fallbackApplied: true,
                fallbackReason: finalResult.fallbackReason,
            });
            finalResult = await runMathFlow(flowPlan);
            if (preFallbackMathFlow && finalResult?.mathFlow) {
                finalResult.mathFlow = mergeMathFlowMetrics(preFallbackMathFlow, finalResult.mathFlow);
            }
        }

        if (options && options.returnMetadata) {
            return finalResult;
        }

        return finalResult.answerText;
    } catch (error) {
        console.error("AI Math Request Error:", error);
        const errorMsg = "Üzgünüm, şu an bu problemi çözemedim. Lütfen daha sonra tekrar deneyin.";
        if (options && options.returnMetadata) {
            return {
                answerText: errorMsg,
                isError: true,
                error: error.message,
                mathFlow: { estimatedTokens: { question: 0, prompt: 0, maxLoopTotal: 0 } }
            };
        }
        return errorMsg;
    }
};

const generateCurriculumSuggestions = async (student) => {
    const examSummary = summarizeExamPerformance(student.exams || []);
    const topicAnalysisStr = summarizeQuestionAnalyses(student.questionAnalyses || []);

    const lastPlan = student.weeklyCurriculums?.[0];
    const lastTasksStr = (lastPlan && lastPlan.tasks)
        ? lastPlan.tasks.map(t => `- [${t.status}] ${t.subject}: ${t.topic}`).join('\n')
        : 'Henüz plan yapılmadı.';

    const prompt = `
Sen bir Eğitim Planlama Uzmanısın (Rehberlik Koordinatörü).
Görevin, bir YKS öğrencisi için önümüzdeki haftanın çalışma çizelgesine (haftalık plan) konu önerilerinde bulunmaktır.

[Öğrenci Profili]
- İsim: ${student.name || 'Öğrenci'}
- Branş: ${student.branch || 'Sayısal'}
- Hedef: ${student.target || 'Belirtilmedi'}

[Deneme Performansı]
${examSummary.detailed}

[Eksik Konular ve Hatalar]
${topicAnalysisStr}

[Geçen Haftanın Planı ve Durumu]
${lastTasksStr}

[TALİMATLAR]
1. Öğrencinin denemelerde düşük net çıkardığı derslere ve en çok hata yaptığı konulara öncelik ver.
2. Geçen haftadan kalan (yarım kalan veya yapılamayan) kritik konuları bu haftaya da ekle.
3. Müfredatın genel akışını düşünerek (TYT ve AYT dengeli olacak şekilde) mantıklı bir sonraki adım öner.
4. Toplam 7-10 arası görev öner. Görevleri günlere (dayIndex) dengeli dağıt (Pazartesi:0 ... Pazar:6).
5. Yanıtını SADECE aşağıdaki JSON formatında ver:
{
  "suggestions": [
     {
       "dayIndex": 0,
       "subject": "Matematik",
       "topic": "Türev Alma Kuralları",
       "reason": "Öğrenci geçen hafta bu konuda hata yapmış."
     }
  ],
  "mentorNote": "Öğrenci genel olarak iyi gidiyor ancak Fen derslerinde biraz daha tempo artırmalı."
}
`;

    try {
        const response = await ai.models.generateContent({
            model: DEFAULT_CHAT_MODEL,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        let content = response.text || "{}";
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(content);
    } catch (error) {
        console.error("AI Error (Curriculum Suggestion):", error);
        return { suggestions: [], mentorNote: "Öneri oluşturulurken bir hata oluştu." };
    }
};

module.exports = {
    __ai_instance: ai,
    generateDashboardSummary,
    generateStudentAnalysis,
    generateSmartQuizOverviewAnalysis,
    generateSmartQuizAttemptAnalysis,
    generateCurriculumSuggestions,
    generateTraditionalHash,
    generateImageHash,
    generateSemanticHash,
    generateEmbedding,
    cosineSimilarity,
    generateBatchIntroduction,
    generateExcelMapping,
    evaluateGuidanceAlert,
    askAiSimple,
    solveMathProblem,
    verifyMathSolution,
    validateGeometry,
    askAiWithMath,
    __testHooks: {
        classifyMathScenario,
        buildMathPlannerDirective,
        trimMathHistoryForInitialCall,
        buildLoopPayloadContents,
        selectMathPromptVariant,
        selectMathToolVariant,
        buildMathFlowMetrics,
        normalizeMathToolArgs,
        buildToolCallFingerprint,
        looksLikeAssignmentList,
        makeToolError,
        sanitizeVerificationSolution,
        resolveVerificationPolicy,
        looksLikeSystemEquation,
        looksLikeGeneralTrigSolution,
        getLastMathAction,
        stripMathMetadataBlocks,
        buildMathAnswerMetadata,
        formatMathMetadataBlock,
        finalizeMathAnswerText,
    }
};
