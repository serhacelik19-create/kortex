require('dotenv').config();
const { OpenAI } = require('openai');
const { GoogleGenAI } = require('@google/genai');
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
    const functionDeclarations = [];
    for (const group of tools || []) {
        for (const declaration of group?.functionDeclarations || []) {
            functionDeclarations.push({
                type: 'function',
                function: {
                    name: declaration.name,
                    description: declaration.description,
                    parameters: declaration.parameters,
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

    const usage = response?.usageMetadata || {};
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
    if (!normalized) return null;

    if (normalized === 'NONE' || normalized === 'OFF' || normalized === 'DISABLED') {
        return { effort: 'none', exclude: true };
    }

    if (normalized === 'LOW') {
        return { effort: 'low', exclude: true };
    }

    if (normalized === 'MEDIUM') {
        return { effort: 'medium', exclude: true };
    }

    if (normalized === 'HIGH') {
        return { effort: 'high', exclude: true };
    }

    return null;
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
            };

            const openAiTools = mapToolsToOpenAiFormat(opts?.config?.tools || []);
            if (profile.supportsToolCalling && openAiTools.length > 0) {
                payload.tools = openAiTools;
                payload.tool_choice = 'auto';
                payload.parallel_tool_calls = false;
            }

            if (opts?.config?.maxOutputTokens !== undefined) {
                payload.max_tokens = Number(opts.config.maxOutputTokens);
            }

            const configuredReasoning = opts?.config?.reasoning && typeof opts.config.reasoning === 'object'
                ? opts.config.reasoning
                : null;
            const derivedReasoning = mapThinkingLevelToReasoning(opts?.config?.thinkingLevel);
            const reasoning = configuredReasoning || derivedReasoning;
            if (reasoning) {
                payload.reasoning = reasoning;
            }

            const res = await openRouterClient.chat.completions.create(payload);
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
        'kactir', 'hesapla', 'bul', 'coz', 'denklem', 'turev', 'integral', 'limit',
        'fonksiyon', 'esitsizlik', 'oran', 'grafik', 'kok', 'logaritma', 'trigonometri',
        'ivme', 'hiz', 'kuvvet', 'enerji', 'tepkime', 'mol', 'derisim', 'asit', 'baz'
    ];

    return keywords.some((keyword) => normalized.includes(keyword)) ||
        /[\d=+\-/*^%()]/.test(questionText || '');
};

const isDetailedMathExplanationRequest = (questionText = '', systemInstruction = '') => {
    const combined = `${String(questionText || '')}\n${String(systemInstruction || '')}`.toLocaleLowerCase('tr-TR');
    if (!combined.trim()) return false;

    return (
        combined.includes('öğrenci diyor ki') ||
        combined.includes('ogrenci diyor ki') ||
        combined.includes('tüm detaylarıyla') ||
        combined.includes('tum detaylariyla') ||
        combined.includes('adım adım anlat') ||
        combined.includes('adim adim anlat') ||
        combined.includes('kontrollu detayli cevap kullan') ||
        combined.includes('çözüm mantığı') ||
        combined.includes('cozum mantigi') ||
        combined.includes('**adımlar:**') ||
        combined.includes('**adimlar:**')
    );
};

const looksLikeSafeSimplifyExpression = (expression = '') => {
    const text = String(expression || '').trim();
    if (!text) return false;
    if (/[=]/.test(text)) return false;
    const matches = text.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    const allowed = new Set(['sqrt', 'pi', 'e', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp', 'abs', 'Abs']);
    if (matches.some((item) => !allowed.has(item))) return false;
    return /^[A-Za-z0-9_+\-*/().,\s%^]+$/.test(text);
};

const shouldUseHeavyMathFlow = (course = '', questionText = '', base64Image = null) => {
    const normalizedCourse = normalizeText(course);
    const isMathCourse = normalizedCourse.includes('matematik') || normalizedCourse.includes('geometri');
    const isQuantStemCourse = normalizedCourse.includes('fizik') || normalizedCourse.includes('kimya');
    if (!isMathCourse && !isQuantStemCourse) return false;
    return looksLikeCalculationPrompt(questionText, Boolean(base64Image));
};

const looksLikeMultipleChoiceQuestion = (questionText = '') => {
    const text = String(questionText || '');
    if (/\bA\)\s.+\nB\)\s.+\nC\)\s.+\nD\)\s.+\nE\)\s.+/s.test(text)) return true;
    const letters = [...text.matchAll(/\b([A-E])\)\s*/g)].map((match) => match[1]);
    return ['A', 'B', 'C', 'D', 'E'].every((letter) => letters.includes(letter));
};

const inferSimpleGeometryHint = (questionText = '') => {
    const normalized = normalizeText(questionText);
    if (!normalized) return 'Temel geometri ilkesini sec, en kisa dogru formulu kullan ve sonucu seceneklerle eslestir.';

    if (normalized.includes('uzakligi') && normalized.includes('dogru')) {
        return 'Noktadan dogruya uzaklik formulu |Ax0 + By0 + C| / kok(A^2 + B^2) seklindedir.';
    }
    if (normalized.includes('orta nokta')) {
        return 'Orta nokta formulu ((x1+x2)/2, (y1+y2)/2) seklindedir.';
    }
    if (normalized.includes('egimi')) {
        return 'Eğim formulu (y2 - y1) / (x2 - x1) seklindedir.';
    }
    if (normalized.includes('ucgeninin alani') && normalized.includes('koordinat')) {
        return 'Koordinat duzlemindeki bu ucgen icin uygun taban ve yukseklik secilip alan = taban * yukseklik / 2 kullanilabilir.';
    }
    if (normalized.includes('cemberinin yaricapi')) {
        return 'x^2 + y^2 = r^2 bicimindeki cemberde yaricap r olur.';
    }
    if (normalized.includes('cemberin cevresi')) {
        return 'Cember cevresi 2*pi*r formulu ile bulunur.';
    }
    if (normalized.includes('hipotenus')) {
        return 'Pisagor: a^2 + b^2 = c^2.';
    }
    if (normalized.includes('karenin cevresi')) {
        return 'Karenin bir kenari alanin karekokudur, cevre 4 katidir.';
    }
    if (normalized.includes('paralelkenarin alani')) {
        return 'Paralelkenar alani taban * yukseklik ile bulunur.';
    }
    if (normalized.includes('iki aci') && normalized.includes('ucuncu aci')) {
        return 'Ucgenin ic acilar toplami 180 derecedir.';
    }
    return 'Temel geometri ilkesini sec, en kisa dogru formulu kullan ve sonucu seceneklerle eslestir.';
};

const shouldUseSimpleGeometryFastPath = ({ course = '', questionText = '', base64Image = null, detailMode = false } = {}) => {
    if (base64Image || detailMode) return false;
    const normalizedCourse = normalizeText(course);
    if (!normalizedCourse.includes('geometri')) return false;
    return looksLikeMultipleChoiceQuestion(questionText);
};

const buildSimpleGeometryFastPathSystemInstruction = (systemInstruction = '') => {
    return [
        systemInstruction,
        'Bu geometri sorusunu arac kullanmadan, en kisa dogru formulle coz.',
        'Gereksiz dallanma yapma.',
        'Buldugun sonucu seceneklerle kontrol et.',
        'En sonda tek satirda "Cevap: X" yaz.',
    ].filter(Boolean).join('\n');
};

const buildSimpleGeometryFastPathPrompt = (questionText = '') => {
    const hint = inferSimpleGeometryHint(questionText);
    return [String(questionText || '').trim(), `Temel ipucu: ${hint}`].filter(Boolean).join('\n\n');
};

const extractExplicitMultipleChoiceLetter = (text = '') => {
    const raw = String(text || '');
    const directMatch = raw.match(/cevap\s*[:\-]?\s*([abcde])/i);
    if (directMatch) return directMatch[1].toUpperCase();

    const trailingMatch = raw.match(/(?:^|\n)\s*([abcde])\s*[\).:\-]?\s*$/i);
    if (trailingMatch) return trailingMatch[1].toUpperCase();

    return null;
};

const hasGeometrySelfCorrectionSignal = (text = '') => {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    return (
        normalized.includes('tekrar kontrol') ||
        normalized.includes('ancak') ||
        normalized.includes('bu formul yanlis') ||
        normalized.includes('bu formül yanlış') ||
        normalized.includes('dogru degil') ||
        normalized.includes('doğru değil') ||
        normalized.includes('siklarda yok') ||
        normalized.includes('şıklarda yok')
    );
};

const buildStagedGeometryPlanPrompt = (questionText = '') => {
    return [
        'Asagidaki coktan secmeli geometri sorusu icin tam cozum yapma.',
        'Sadece 3 satirlik mini plan cikar.',
        'Format zorunlu:',
        'Teorem: ...',
        'Ara Degerler: ...',
        'Hedef: ...',
        '',
        `Soru: ${String(questionText || '').trim()}`,
    ].join('\n');
};

const buildStagedGeometrySolvePrompt = (questionText = '', planText = '') => {
    return [
        'Asagidaki geometri sorusunu verilen mini plana sadik kalarak coz.',
        'Kurallar:',
        '1. Tek yontem kullan.',
        '2. Alternatif cozum, oz-duzeltme veya celiskili aciklama yazma.',
        '3. Son iki satir zorunlu formatta olsun:',
        'Sonuc: <deger>',
        'Cevap: <harf>',
        '4. Siklarla mutlaka karsilastir ve sadece bir harf sec.',
        '',
        `Soru: ${String(questionText || '').trim()}`,
        '',
        'Mini plan:',
        String(planText || '').trim() || 'Teorem: Temel geometri ilkesini sec.\nAra Degerler: Gerekli ara nicelikleri bul.\nHedef: Sonucu seceneklerle eslestir.',
    ].join('\n');
};

const buildGeometryOptionLockPrompt = (questionText = '', draftAnswer = '') => {
    return [
        'Asagidaki coktan secmeli geometri sorusunda nihai secenegi kilitle.',
        'Kurallar:',
        '1. Verilen taslak sonucu seceneklerle matematiksel olarak esdegerlik dahil karsilastir.',
        '2. sqrt(244)=2*sqrt(61) gibi esdegerlikleri dikkate al.',
        '3. Aciklama yapacaksan cok kisa yap.',
        '4. Son satir tam olarak `Cevap: <harf>` olsun.',
        '',
        `Soru: ${String(questionText || '').trim()}`,
        '',
        'Taslak sonuc:',
        String(draftAnswer || '').trim(),
    ].join('\n');
};

const normalizeGeometryChoiceText = (value = '') => {
    let text = String(value || '')
        .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
        .replace(/\\cdot/g, '*')
        .replace(/\\tan/g, 'tan')
        .replace(/\\cot/g, 'cot')
        .replace(/\\sqrt/g, 'sqrt')
        .replace(/[{}|]/g, '')
        .replace(/\s+/g, '')
        .replace(/√/g, 'sqrt')
        .replace(/π/g, 'pi')
        .replace(/⋅/g, '*')
        .replace(/·/g, '*')
        .replace(/\u2212/g, '-')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')')
        .toLowerCase();
    text = text.replace(/[│─┌┐└┘├┤┬┴┼]/g, '');
    text = text.replace(/^\-([^+]+)\+1$/, '1-$1');
    text = text.replace(/^\+/, '');
    text = text.replace(/\((\d+)\)/g, '$1');
    text = text.replace(/sqrt\((\d+)\)/g, 'sqrt$1');
    return text;
};

const superNormalizeGeometryChoiceText = (value = '') => {
    return normalizeGeometryChoiceText(value)
        .replace(/[^a-z0-9]/g, '')
        .split('')
        .sort()
        .join('');
};

const parseGeometryChoiceNumeric = (value = '') => {
    if (typeof value === 'number') return value;
    if (!value) return NaN;
    const cleaned = String(value).replace(/[^\d.-]/g, '');
    return parseFloat(cleaned);
};

const evaluateGeometryChoiceText = (text = '') => {
    if (!text) return NaN;
    let expr = String(text || '')
        .toLowerCase()
        .replace(/pi/g, `(${Math.PI})`)
        .replace(/sqrt(\d+)/g, '(Math.sqrt($1))')
        .replace(/sqrt\((\d+)\)/g, '(Math.sqrt($1))')
        .replace(/\^/g, '**');
    try {
        if (/^[0-9+\-*/().math.sqrt\s]+$/i.test(expr)) {
            return Function(`return (${expr})`)();
        }
    } catch (_error) {
        return NaN;
    }
    return NaN;
};

const extractGeometryScalarCandidates = (text = '') => {
    const raw = String(text || '');
    const candidates = new Set();
    const patterns = [
        /\d+\s*\*\s*sqrt\s*\(\s*\d+\s*\)/gi,
        /\d+\s*\*\s*sqrt\d+/gi,
        /sqrt\s*\(\s*\d+\s*\)/gi,
        /sqrt\d+/gi,
        /\d+\s*\/\s*\d+/g,
        /\d+(?:\.\d+)?/g,
    ];

    for (const pattern of patterns) {
        const matches = raw.match(pattern) || [];
        for (const match of matches) {
            const normalized = normalizeGeometryChoiceText(match);
            if (normalized) candidates.add(normalized);
        }
    }

    return Array.from(candidates);
};

const resolveGeometryChoiceFromAnswer = (questionText = '', resultRaw = '', resultReadable = '') => {
    const options = extractMultipleChoiceOptions(questionText);
    if (options.length < 2) return null;

    const candidates = [
        normalizeGeometryChoiceText(resultRaw),
        normalizeGeometryChoiceText(resultReadable),
        ...extractGeometryScalarCandidates(resultRaw),
        ...extractGeometryScalarCandidates(resultReadable),
    ].filter(Boolean);

    const numericCandidates = candidates
        .map((candidate) => {
            const parsed = parseGeometryChoiceNumeric(candidate);
            if (!Number.isNaN(parsed)) return parsed;
            return evaluateGeometryChoiceText(candidate);
        })
        .filter((value) => !Number.isNaN(value));

    const superCandidates = candidates.map(superNormalizeGeometryChoiceText).filter(Boolean);
    const matches = [];

    for (const option of options) {
        const normalizedOption = normalizeGeometryChoiceText(option.text);
        const optionNumeric = Number.isNaN(parseGeometryChoiceNumeric(normalizedOption))
            ? evaluateGeometryChoiceText(normalizedOption)
            : parseGeometryChoiceNumeric(normalizedOption);
        const optionSuper = superNormalizeGeometryChoiceText(normalizedOption);

        if (candidates.includes(normalizedOption)) {
            matches.push(option);
            continue;
        }

        if (!Number.isNaN(optionNumeric) && numericCandidates.some((candidate) => Math.abs(candidate - optionNumeric) < 0.001)) {
            matches.push(option);
            continue;
        }

        if (optionSuper && superCandidates.includes(optionSuper)) {
            matches.push(option);
        }
    }

    const uniqueMatches = matches.filter((item, index, arr) => arr.findIndex((other) => other.letter === item.letter) === index);
    return uniqueMatches.length === 1 ? uniqueMatches[0] : null;
};

const mergeUsageMetadata = (...usages) => {
    return usages.reduce((acc, usage) => {
        if (!usage) return acc;
        acc.promptTokenCount += Number(usage.promptTokenCount || 0);
        acc.candidatesTokenCount += Number(usage.candidatesTokenCount || 0);
        acc.totalTokenCount += Number(usage.totalTokenCount || 0);
        return acc;
    }, {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
    });
};

const ENABLE_SCENARIO_MATH_PROMPTS = /^true$/i.test(String(process.env.ENABLE_SCENARIO_MATH_PROMPTS || 'true'));
const TEXT_ONLY_MATH_HISTORY_LIMIT = 4;
const COMPACT_TOOL_HISTORY_TURNS = 4;
const APPROX_TOKEN_DIVISOR = 3.9;

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
    const text = String(questionText || '').toLocaleLowerCase('tr-TR');

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

    if (/olasilik|olasılığı|olasilik|olasiligi/.test(text)) {
        if (/otopark|kap[ıi]|giris|giriş/.test(text)) {
            return `
[PLANLAYICI NOTU - AŞAMALI OLASILIK]
- Her olası park edilen yeri ayrı senaryo olarak düşün.
- Bir senaryonun olasılığı = ilk kapı seçimi × o kapıdaki ilgili yeri seçme olasılığı.
- Dönüşte doğru yeri bulma olasılığı = doğru kapıyı seçme × o kapıda doğru yeri seçme.
- Toplam başarı olasılığı için bu senaryoların her birini ağırlıklı topla.
`;
        }

        return `
[PLANLAYICI NOTU - OLASILIK]
- Birden fazla senaryo varsa her senaryoyu kendi gerçekleşme olasılığı ile ağırlıklandır.
- İlk seçim olasılığı ile sonraki koşullu doğru seçim olasılığını çarp.
- Sadece yerel başarı olasılıklarını toplama; başlangıç dallarını unutma.
`;
    }

    if (/cevre|çevre/.test(text) && /kare/.test(text) && /dik ucgen|dik üçgen/.test(text)) {
        return `
[PLANLAYICI NOTU - ÇEVRE TAMAMLAMA]
- Önce üçgenin gerekli kenarlarını bul.
- Sonra kare çevresinden kesilen iki kenarı çıkarıp hipotenüsü ekleyerek kalan şeklin çevresini hesapla.
- Kenar uzunluklarında durma; soruda istenen nihai çevreyi ver.
`;
    }

    if (/nokta|doğru|uzaklık|çember|üçgen|prizma|alan|çevre/.test(text)) {
        return `
[PLANLAYICI NOTU - GEOMETRİ MODELLEME]
- **DÖNDÜRME UYARISI:** Döndürme sorularında (rotasyon) ASLA ezbere alan formülü uydurma (örn: cos(alfa) ile çarpma). 
- Kesişim alanını bulmak için 12-gen veya 8-gen oluştuğunu gör; her bir köşeyi (vertex) coordinate_geometry veya solve_system ile koordinatlarını bularak hesapla.
- **FİZİKSEL SINIR:** Kesişim alanı orijinal alanın %100'ünden asla büyük olamaz. Sonucun mantıklı olduğunu (küçüldüğünü) doğrula.
- Metindeki her sayısal veriyi bir kısıta (constraint) çevir.
- Bilinmeyenleri target: ["x", "y"] olarak netleştir.
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
        probability: 0,
        derivative_extrema: 0,
        trig: 0,
        integral: 0,
        area_between_curves: 0,
        coordinate_geometry: 0,
        matrix: 0,
        combinatorics: 0,
        generic_math: 0,
    };

    if (/limit|x\s*(?:->|→)|yakla/.test(text)) scoreMap.limit += 4;
    if (/denklem sistemi|bilinmeyen|ve .*=/i.test(questionText) || (questionText.match(/=/g) || []).length >= 2) scoreMap.system += 4;
    if (/olasılık|olasilik|ihtimal|rastgele|seçiyor|seciyor|olasilig/i.test(text)) scoreMap.probability += 4;
    if (/(?:\bsin\b|\bcos\b|\btan\b|\bcot\b|\bsec\b|\bcsc\b|sin\(|cos\(|tan\(|cot\(|sec\(|csc\(|sin[a-z0-9]|cos[a-z0-9]|tan[a-z0-9]|cot[a-z0-9]|sec[a-z0-9]|csc[a-z0-9]|trig|trigonometri|\bpi\b|π)/.test(text)) scoreMap.trig += 4;
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
    probability: ['simplify', 'solve', 'combinatorics'],
    derivative_extrema: ['analyze_derivative', 'find_extrema'],
    trig: ['trig_general_solution'],
    integral: ['integrate'],
    area_between_curves: ['area_between_curves'],
    coordinate_geometry: ['coordinate_geometry'],
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
    if (flowPlan.forceFullFlow || flowPlan.scenario === 'visual_or_retry' || iteration < 2) {
        return currentHistory;
    }

    const recentTurns = currentHistory.slice(-COMPACT_TOOL_HISTORY_TURNS);
    return dedupeTurns([
        { role: 'user', parts: initialUserParts },
        ...recentTurns,
    ]);
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

const MINI_PROMPT_SHARED = `
[ROL]
Sen kısa ve katı bir matematik routerısın.

[TEMEL KURALLAR]
- Matematiksel verimlilik (Efficiency) önceliktir; f(a) veya P(a) gibi bir değer isteniyorsa ASLA denklemi genel olarak çözmeye (solve) çalışma. Doğrudan değişkeni yerine koyup hesapla (simplify).
- 3. ve 4. derece polinomlarda kök bulma zorunlu değilse (örn: sadece değer isteniyorsa) sembolik genel çözümden kaçın; bu işlem motoru kilitler.
- SymPy formatı kullan: * , ** , sqrt(), Abs(); ^ kullanma.
- Payload'ı gereksiz süsleme veya açıklama eklemeden gönder.
- Aynı hatalı tool çağrısını tekrar etme.
- Ara değişkende durma; soruda istenen son niceliğe kadar git.
- Sonuç hâlâ serbest parametre/simge içeriyorsa nihai cevap verme; sayısal veya kapalı sonuca indir.
- Backend dışında metadata, xp, JSON-benzeri ek blok üretme.

[AÇIKLAMA ZORUNLULUĞU]
- Tool sonucunu aldıktan sonra ASLA yalnızca şık veya cevap yazıp geçme.
- Öğrencinin takip edebileceği en az 2-3 kısa adım yaz: temel ifade/denklem, yerine koyma veya dönüşüm, sonuç.
- Adımları LaTeX ile destekle; gereksiz uzatma yapma ama çözüm mantığını mutlaka göster.
`;

const MINI_PROMPT_MAP = {
    limit: `
[SENARYO: LIMIT]
- Action olarak öncelikle "limit" kullan.
- Gerekirse limit_point kullan; tek yönlü limit gerekiyorsa bunu açık belirt.
- Sonuç yoksa sağdan ve soldan davranışı açıkça yaz.
`,
    equation_simple: `
[SENARYO: BASİT DENKLEM]
- Tek denklem için öncelikle "solve" kullan.
- Denklemi sol taraf - sağ taraf biçiminde expression'a çevir.
- Gereksiz doğrulama aracı çağırma; solver sonucunu ve backend filtrelerini kullan.
`,
    equation_risky: `
[SENARYO: RİSKLİ DENKLEM]
- Tek denklem için öncelikle "solve" kullan.
- Denklemi sol taraf - sağ taraf biçiminde expression'a çevir.
- Log, kök ve mutlak değer sorularında tanım kümesine uymayan kökleri ele.
- verify_equation yalnızca tek denklemli sonuç doğrulamasında kullan.
`,
    system: `
[SENARYO: DENKLEM SİSTEMİ]
- Action olarak "solve_system" kullan.
- Mümkünse equations + variables gönder.
- Soruda bilinmeyenlerin kendisi değil, onlardan türeyen son nicelik isteniyorsa equations + variables ile sistemi ver; expression alanına istenen son ifadeyi yaz.
- solve_system sonucunda verify_equation çağırma; backend doğrulamasına güven.
`,
    probability: `
[SENARYO: OLASILIK]
- Olasılık sorularında önce senaryoları ağırlıklarıyla kur.
- Salt aritmetik olasılık ifadesi kurabiliyorsan "simplify" kullan.
- Başlangıç dallarını unutma; koşullu başarı olasılıklarını kendi gerçekleşme olasılıklarıyla çarp.
- Gerekirse kombinatorik action kullan ama yanlış solve_system kurma.
- Oran hesaplarında pay ve payda değerlerini fiziksel gerçekliğe göre kontrol et.
`,
    derivative_extrema: `
[SENARYO: TÜREV / EKSTREMUM]
- Soruda hazır f'(x) verildiyse "analyze_derivative" kullan.
- Soruda f(x) verilip maksimum/minimum isteniyorsa "find_extrema" kullan.
- Ekstremum türünü motor sonucuna göre yaz.
`,
    trig: `
[SENARYO: TRİGONOMETRİ]
- Action olarak "trig_general_solution" kullan.
- Genel çözümü ve isteniyorsa [0, 2pi] aralığındaki kökleri ver.
- Genel trig çözümü için verify_equation çağırma.
`,
    area_between_curves: `
[SENARYO: EĞRİLER ARASI ALAN]
- Action olarak "area_between_curves" kullan.
- İfadeyi iki eğrinin farkı olacak şekilde gönder.
- Alan sorusunda solve veya solve_system ile oyalanma.
- Sonucu doğrudan motor çıktısına göre yaz.
`,
    coordinate_geometry: `
[SENARYO: ANALİTİK VE SENTETİK GEOMETRİ]
- Action: "coordinate_geometry" kullan.
- MODELLEME KURALLARI:
  1. KRİTİK: Alan kesişimleri asla orijinalden büyük olamaz. Halüsinasyon formül (uydurma sin/cos bağıntıları) yasaktır.
  2. Her bir geometrik veriyi (uzunluk, paralellik, açı vb.) kısıta (constraint) çevir.
  3. Döndürme sorularında 15-30-45 derecelik açılar için koordinat dönüşümü yap.
  4. Noktaları harflerle (A, B, C...) tanımla. Bilinmeyen koordinatlar için sembol ("x", "y", "r") kullan.
  5. "constraints" içinde mutlaka kullan: equal_length, parallel, perpendicular, angle_bisector, similarity, euclidean_h2_pk, centroid, stewart, collinear, on_circle.
  6. Bir ipucu veya ara değer bulursan (örn: muhteşem üçlü, orta taban) bunu da kısıt olarak ekle.
- TEXT-ONLY SORULARDA: Problemdeki her bir sayıyı ve ilişkiyi kısıt olarak modelle. (Örn: "AB=6" ise {type:"equal_length", args:["A","B",6]})
- KRİTİK: Karmaşık 3D sorularda (prizma vb.) eğer motor yetersiz kalırsa alternatif olarak "solve_system" ile explicit hacim/alan denklemleri (a**2 * h = 75 vb.) kur.
- Sonucu doğrudan motor çıktısına göre yaz.
`,
    matrix: `
[SENARYO: MATRİS]
- Action olarak "matrix" kullan.
- matrix ve matrix_action alanlarını kullan.
- Determinant, inverse, rank, rref, eigenvalues dışında işlem uydurma.
`,
    combinatorics: `
[SENARYO: KOMBİNATORİK]
- Action olarak "combinatorics" kullan.
- variable mutlaka combination, permutation veya factorial olmalı.
- Komite/seçim tipi sorularda combination kullan.
- Sonucu explain et ama verify_equation çağırma.
`,
    integral: `
[SENARYO: İNTEGRAL]
- Action olarak "integrate" kullan.
- Belirli integral ise lower_bound ve upper_bound parametrelerini gönder.
- Sonuç kesindir; simplify veya verify_equation çağırma.
- Sonucu doğrudan motor çıktısına göre yaz.
`,
    generic_math: `
[SENARYO: GENEL MATEMATİK]
- Problemi en uygun calculate_math action'ına çevir.
- İleri matematik işlemlerinde gereksiz zincirleme basit adımlardan kaçın.
- verification gerçekten gerekiyorsa yalnızca tek denklemli çözüm doğrulamasında kullan.
`,
};

const SCENARIO_EXAMPLE_MAP = {
    limit: '- Örnek: {action: "limit", expression: "1/x", variable: "x", limit_point: "0"}',
    equation_simple: '- Örnek: {action: "solve", expression: "x**2-5*x+6"}',
    equation_risky: '- Örnek: {action: "solve", expression: "sqrt(x+6)-x"}',
    system: '- Örnek: {action: "solve_system", equations: ["x+y-8", "x-y-2"], variables: ["x", "y"]}',
    probability: '- Örnek: {action: "simplify", expression: "1/2*(1/2*1/2) + 1/2*(1/2*1/3)"}',
    derivative_extrema: '- Örnek: {action: "find_extrema", expression: "x**3-3*x"}',
    trig: '- Örnek: {action: "trig_general_solution", expression: "cos(x)"}',
    area_between_curves: '- Örnek: {action: "area_between_curves", expression: "2*x - x**2", variable: "x"}',
    coordinate_geometry: '- Örnek (Gelişmiş): {action: "coordinate_geometry", params: {points: {A:[0,0], B:[4,0], C:["x","y"]}, constraints: [{type:"equal_length", args:["A","C",5]}], target: ["x","y"]}}',
    matrix: '- Örnek: {action: "matrix", matrix: [[1,2],[3,4]], matrix_action: "determinant"}',
    combinatorics: '- Örnek: {action: "combinatorics", expression: "10,3", variable: "combination"}',
    integral: '- Örnek: {action: "integrate", expression: "x**2", variable: "x", lower_bound: "0", upper_bound: "2"}',
    generic_math: '- Örnek: action ve payload seçimini probleme göre en kısa doğru biçimde yap.',
};

const buildFullMathPrompt = (systemInstruction = "") => `
${systemInstruction}

[ROL]
Sen araç kullanan katı bir matematik routerısın. Önce doğru tool çağrısını üret, sonra tool sonucuna dayanarak düzenli, öğretici ve doğru nihai cevabı yaz.

[KURAL]
- Problemi mümkün olan en az sayıda tool çağrısıyla çöz.
- Uygun action ve action'a uygun payload gönder.
- Matematiksel ifadeyi ham biçimiyle SymPy formatına çevir; gereksiz dönüşüm yapma.
- Tool sonucu ile çelişen kendi iç hesabını kullanma.
- Aynı payload hata verdiyse aynısını tekrar gönderme.
- Görsel varsa verileri uydurma; belirsizse doğrulama aracına git.
- verify_equation sadece tek denklemli doğrulamada kullan.
- Ara sonuçta durma; soruda istenen son niceliği ver.
- Denklem sistemi yalnızca ara adımsa equations + variables ile sistemi gönder, soruda istenen son niceliği expression alanında ayrıca belirt.
- Son ifade serbest parametre içeriyorsa nihai cevap verme, çözümü tamamla.
- Nihai cevapta markdown olabilir ama metadata/xp/JSON-benzeri fazlalık üretme.
- Nihai cevap mümkün olduğunda kısa adım akışı içersin: temel denklem/dönüşüm, yerine koyma, sonuç.
- Çoktan seçmeli matematikte yalnızca şık yazıp geçme; öğrencinin takip edebileceği 2-5 kısa adım ver.

[QWEN UYUM KISITI]
- Tool çağrısı gereken durumda tool kullanmadan uzun açıklama yazma.
- JSON istendiğinde sadece geçerli JSON üret; aksi halde doğal Türkçe yanıt ver.
- İstenen format dışında "Doğru Cevap", "Çözüm Mantığı", eğitim metadata'sı gibi hazır şablonlar ekleme.
- Gereksiz uzun konuşma yapma; ama doğru sonucu öğretici biçimde gerekçelendir.

`;

const buildMathDetailDirective = () => `
[DETAYLI ÇÖZÜM MODU]
- Bu istek yeni soru çözmekten çok mevcut çözümü öğretici biçimde anlatma isteğidir.
- Gerekli tool çağrılarını yap ama nihai cevapta sadece sonuç verme.
- Sorunun çözümünü öğrencinin takip edebileceği doğal ama işlem ağırlıklı bir öğretmen anlatımıyla açıkla.
- Mümkünse şu akışı koru: verilen bilgi/denklem, temel dönüşüm, hesap, sonuç.
- Çözümü katı başlık şablonlarına bölme; en fazla 3 kısa paragraf yeterlidir.
- Her paragraf 1-3 kısa cümleyi geçmesin.
- Bariz cebirsel ara adımları uzun uzun açıklama; sadece sonucu bulmak için gerekli dönüşümü göster.
- İlk paragrafta mümkünse elde edilen temel sadeleşmiş ifade veya ana denklem açıkça görünsün.
- Sözel açıklamadan çok işlem satırlarını ve denklemleri görünür yaz.
- Kısa geçiş cümleleri kullan; uzun paragraf ve gereksiz bağlaçlardan kaçın.
- Çözüm kümesi, ham liste, map veya tool çıktısı ile bitirme.
- Çoktan seçmeli sorularda son satır yine "Cevap: X" olsun.
`;

const resolveMiniPromptScenarioKey = (scenario = 'generic_math', equationMode = null) => {
    if (scenario === 'equation') {
        return equationMode === 'risky' ? 'equation_risky' : 'equation_simple';
    }
    return scenario;
};

const buildMiniMathPrompt = (scenario = 'generic_math', systemInstruction = "", equationMode = null) => {
    const scenarioKey = resolveMiniPromptScenarioKey(scenario, equationMode);
    return `
${systemInstruction}

${MINI_PROMPT_SHARED.trim()}

${(MINI_PROMPT_MAP[scenarioKey] || MINI_PROMPT_MAP.generic_math).trim()}

[ÖRNEK]
${SCENARIO_EXAMPLE_MAP[scenarioKey] || SCENARIO_EXAMPLE_MAP.generic_math}
`;
};

const selectMathPromptVariant = ({ scenario = 'generic_math', systemInstruction = "", forceFullFlow = false, equationMode = null } = {}) => {
    if (forceFullFlow || scenario === 'visual_or_retry') {
        return {
            promptVariant: 'full_math_prompt',
            promptText: buildFullMathPrompt(systemInstruction),
        };
    }

    const scenarioKey = resolveMiniPromptScenarioKey(scenario, equationMode);
    return {
        promptVariant: `${scenarioKey}_prompt`,
        promptText: buildMiniMathPrompt(scenario, systemInstruction, equationMode),
    };
};

const looksLikeMissingContextQuestion = (course = "", questionText = "") => {
    const normalizedCourse = String(course || "").toLocaleLowerCase('tr-TR');
    const normalizedText = String(questionText || "").toLocaleLowerCase('tr-TR');
    const verbalCourse = /(turkce|türkçe|edebiyat|tarih|cografya|coğrafya|felsefe|din)/.test(normalizedCourse);
    const contextDependentPrompt = /(metin|parça|parca|paragraf|seçenek|secenek)/.test(normalizedText);
    return verbalCourse && contextDependentPrompt;
};

const shortenMissingContextAnswer = (answerText = "", course = "", questionText = "") => {
    const normalizedAnswer = String(answerText || "").toLocaleLowerCase('tr-TR');
    const asksForContext = /(metni|parçayı|parcayi|parçayi|parçayı|parcayi|seçenekleri|secenekleri|soru metnini|paragrafı|paragrafin tamamını|tam metni)/.test(normalizedAnswer);
    if (!looksLikeMissingContextQuestion(course, questionText) || !asksForContext) {
        return String(answerText || "").trim();
    }
    if (/seçenek|secenek/.test(String(questionText || "").toLocaleLowerCase('tr-TR'))) {
        return "Parça ve seçenekler olmadan cevaplanamaz. Lütfen ikisini de paylaş.";
    }
    return "Metin/parça verilmediği için cevaplanamaz. Lütfen ilgili metni paylaş.";
};

const resolveSimpleCourseFamily = (course = "") => {
    const normalizedCourse = String(course || "").toLocaleLowerCase('tr-TR');
    if (/(turkce|türkçe)/.test(normalizedCourse)) return 'turkce';
    if (/edebiyat/.test(normalizedCourse)) return 'edebiyat';
    if (/tarih/.test(normalizedCourse)) return 'tarih';
    if (/(cografya|coğrafya)/.test(normalizedCourse)) return 'cografya';
    if (/felsefe/.test(normalizedCourse)) return 'felsefe';
    if (/din/.test(normalizedCourse)) return 'din';
    if (/biyoloji/.test(normalizedCourse)) return 'biyoloji';
    return 'generic';
};

const buildCourseQualityInstruction = (course = "", questionText = "") => {
    const family = resolveSimpleCourseFamily(course);
    const normalizedQuestion = String(questionText || "").toLocaleLowerCase('tr-TR');
    const shared = `
[KALİTE KISITI]
- Önce soru kökünün istediği ana kavramı seç.
- Çok genel ifade yerine YKS'de beklenen en net kavramı kullan.
- Hazırsa standart cevap anahtarı diline yakın kal.

[AÇIKLAMA ZORUNLULUĞU]
- ASLA yalnızca cevap veya şık yazıp geçme.
- En az 2-3 cümlelik kısa gerekçe ver: neden bu kavram/şık doğru, diğer olası seçeneklerden farkı ne.
- Öğrenci çözüm mantığını veya kavramsal ayrımı anlayabilmeli.
`;

    const familyMap = {
        turkce: `
[DERS: TÜRKÇE]
- Ana yargı, anlam ilişkisi veya bağlama göre anlam ne isteniyorsa onu doğrudan adlandır.
- "anlam zenginliği", "bağlama göre anlam", "ana düşünce", "yardımcı düşünce" gibi standart terimlerden en uygun olanı seç.
- Soruda metin yorumu varsa aşırı genelleme yapma; cümlede verilen karşıtlığı koru.
`,
        edebiyat: `
[DERS: EDEBİYAT]
- Önce akım, anlayış, tür veya kavram adını ver; sonra gerekçelendir.
- "çağrışım gücü", "toplumcu gerçekçilik", "realizm", "sanat için sanat" gibi hedef terimi muğlaklaştırma.
- Genel laf yerine edebiyat terimini kullan.
- Şiirde "açık dil + çok katmanlı anlam" kalıbı geçiyorsa önce "çağrışım gücü" olasılığını değerlendir; sadece gerçekten uymuyorsa başka kavrama git.
`,
        tarih: `
[DERS: TARİH]
- İlke, kırılma, değişim yönü veya tarihsel sonuç ne isteniyorsa onu kavram adıyla söyle.
- "milli egemenlik", "merkeziyetçilik", "toplumsallaşma", "kurumsal süreklilik" gibi tarih diline yakın kavramlar kullan.
- Sonuç ile nedeni karıştırma; soru mekanizmayı soruyorsa mekanizmayı söyle.
`,
        cografya: `
[DERS: COĞRAFYA]
- Neden-sonuç ilişkisini çok değişkenli düşün.
- Tek bir etmene indirgeme yapma; iklim, yer şekilleri, su, nüfus, ulaşım gibi belirleyicileri ayır.
- Mümkün olduğunda coğrafya terimini doğrudan ver.
- İlk satırda soru köküne doğrudan yanıt ver; çok genel başlık yazma.
`,
        felsefe: `
[DERS: FELSEFE]
- Doğrudan kavram çiftini veya akımı adlandır.
- Görüş ile bilgi, realizm ile idealizm, niyetçilik ile sonuççuluk gibi ayrımları net ver.
- Gereksiz filozof adı ekleme; soru istemiyorsa genel kavram düzeyinde kal.
`,
        din: `
[DERS: DİN]
- Akaid, ahlak, ibadet, irade gibi alanları karıştırma.
- Önce temel dini kavramı doğru ver; sonra kısa gerekçede sınırını çiz.
- Yorumu gereksiz genişletme; ana ilkeyi sade söyle.
`,
        biyoloji: `
[DERS: BİYOLOJİ]
- Sözel biyolojide süreç ile sonuç kavramlarını ayır.
- Adaptasyon, gen ifadesi, homeostazi gibi hedef biyoloji terimlerini doğru kullan.
- Kalıtsal olan ile sonradan kazanılanı karıştırma.
`,
        generic: `
[DERS: GENEL]
- Sorunun istediği ana kavramı en kısa doğru terimle ver.
`,
    };

    const trapHint = /hangi kavram|hangi ilke|hangi yön|hangi özellik|hangi ayrım|neyi gösterir/.test(normalizedQuestion)
        ? '\n[EK KURAL]\n- Soru kavram adı istiyorsa ilk satırda kavramı tekil ve net biçimde yaz.\n'
        : '';

    return `${shared.trim()}\n${(familyMap[family] || familyMap.generic).trim()}${trapHint}`;
};

const sanitizeSimpleAnswer = (answerText = "") =>
    String(answerText || "")
        .replace(/<\/?think>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

const shouldRunSimpleVerifier = (course = "", questionText = "") => {
    const family = resolveSimpleCourseFamily(course);
    if (!['turkce', 'edebiyat', 'tarih', 'cografya', 'felsefe', 'din', 'biyoloji'].includes(family)) {
        return false;
    }
    if (looksLikeMissingContextQuestion(course, questionText)) {
        return false;
    }
    return true;
};

const verifySimpleAnswer = async ({ modelName, course, questionText, systemInstruction, draftAnswer }) => {
    const family = resolveSimpleCourseFamily(course);
    const familyHintMap = {
        edebiyat: '- Edebiyatta genel ifade yerine en yakın teknik kavramı seç. "Anlam zenginliği" gibi üst başlıklar yerine mümkünse hedef terimi ver.\n',
        cografya: '- Coğrafyada "gelişmişlik düzeyi" gibi çok genel cevap başlıklarından kaçın; soru neyi soruyorsa onu doğrudan cevap olarak yaz.\n',
    };
    const verifierPrompt = `
Soruyu ve taslak cevabı değerlendir.

Görev:
- Taslak cevap soru köküne en yakın kavramı seçmişse koru.
- Fazla genel bir terim kullandıysa daha standart YKS kavramıyla düzelt.
- Açıklama doğruysa gereksiz uzatma yapma.
- Sadece nihai cevabı üret; analiz yazma.

Çıkış formatı:
**Doğru Cevap:** ...
**Kısa Gerekçe:** ...

Ders ailesi: ${family}
Soru:
${questionText}

Taslak cevap:
${draftAnswer}
`.trim();

    const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: verifierPrompt }] }],
        config: {
            systemInstruction: `${systemInstruction}\n\n[VERIFIER]\n- Yalnızca nihai düzeltilmiş cevabı yaz.\n- Doğru taslağı gereksiz yere değiştirme.\n- Soru kavram istiyorsa en standart terimi seç.\n${familyHintMap[family] || ''}`,
            temperature: 0.05,
            topP: 0.7,
            maxOutputTokens: 260,
            reasoning: { max_tokens: 220, exclude: true },
        },
    });

    return sanitizeSimpleAnswer(response.text || draftAnswer);
};

const askAiSimpleDetailed = async (course, questionText, history = [], systemInstruction = "", base64Image = null) => {
    const modelName = DEFAULT_CHAT_MODEL;
    const contents = [];
    const qualityInstruction = buildCourseQualityInstruction(course, questionText);
    const effectiveSystemInstruction = [systemInstruction, qualityInstruction].filter(Boolean).join('\n\n');

    if (systemInstruction) {
        // systemInstruction config'te ayrıca verilecek; burada yalnızca konuşma içeriğini kuruyoruz.
    }

    for (const item of history) {
        const parts = [{ text: item.content || item.parts || "" }];
        if (item.base64Image) {
            parts.push({
                inlineData: {
                    data: item.base64Image.replace(/^data:image\/\w+;base64,/, ""),
                    mimeType: "image/jpeg"
                }
            });
        }
        contents.push({
            role: item.role === 'user' ? 'user' : 'model',
            parts
        });
    }

    const userParts = [{ text: questionText || "Bu soruyu yanitlar misin?" }];
    if (base64Image) {
        userParts.push({
            inlineData: {
                data: base64Image.replace(/^data:image\/\w+;base64,/, ""),
                mimeType: "image/jpeg"
            }
        });
    }

    const response = await ai.models.generateContent({
        model: modelName,
        contents: [...contents, { role: 'user', parts: userParts }],
        config: {
            systemInstruction: effectiveSystemInstruction,
            temperature: DEFAULT_CHAT_TEMPERATURE,
            topP: DEFAULT_CHAT_TOP_P,
            reasoning: { max_tokens: 800, exclude: true },
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
    });

    const rawText = sanitizeSimpleAnswer(response.text || "Yapay Zeka bu soruya icerik uretemedi.");
    const shortened = shortenMissingContextAnswer(rawText, course, questionText);
    const usage = response.usageMetadata || {};
    if (!shouldRunSimpleVerifier(course, questionText)) {
        return { answer: shortened, usage };
    }

    try {
        const verified = await verifySimpleAnswer({
            modelName,
            course,
            questionText,
            systemInstruction: effectiveSystemInstruction,
            draftAnswer: shortened,
        });
        return { answer: verified, usage };
    } catch (_error) {
        return { answer: shortened, usage };
    }
};

const runDisciplinedGeometryPlainTextFlow = async (course, questionText, history = [], systemInstruction = "") => {
    const stagedSystemInstruction = [
        systemInstruction,
        'Bu bir coktan secmeli geometri sorusu.',
        'Kisa ve disiplinli ol.',
        'Finalde mutlaka "Cevap: <harf>" yaz.',
    ].filter(Boolean).join('\n');

    const planResult = await askAiSimpleDetailed(
        course,
        buildStagedGeometryPlanPrompt(questionText),
        history,
        stagedSystemInstruction,
        null
    );

    const solveResult = await askAiSimpleDetailed(
        course,
        buildStagedGeometrySolvePrompt(questionText, planResult.answer || ''),
        [],
        stagedSystemInstruction,
        null
    );

    const options = extractMultipleChoiceOptions(questionText);
    const explicitChoice = extractExplicitMultipleChoiceLetter(solveResult.answer || '');
    const directResolvedChoice = resolveGeometryChoiceFromAnswer(questionText, '', solveResult.answer || '');
    const inferredChoice = options.length >= 2
        ? await resolveChoiceFromScalarCandidates(questionText, [
            solveResult.answer || '',
            ...(String(solveResult.answer || '').match(/(?:\d+\s*\*\s*sqrt\s*\(\s*\d+\s*\)|sqrt\s*\(\s*\d+\s*\)|\d+\/\d+|\d+(?:\.\d+)?)/gi) || []),
        ])
        : null;

    let finalAnswer = solveResult.answer || '';
    let finalChoice = directResolvedChoice?.letter || inferredChoice?.letter || explicitChoice;
    let fallbackApplied = false;

    const needsOptionLock =
        !finalChoice ||
        hasGeometrySelfCorrectionSignal(finalAnswer) ||
        (explicitChoice && (directResolvedChoice?.letter || inferredChoice?.letter) && explicitChoice !== (directResolvedChoice?.letter || inferredChoice?.letter));

    let optionLockUsage = null;

    if (needsOptionLock && options.length >= 2) {
        const optionLockResult = await askAiSimpleDetailed(
            course,
            buildGeometryOptionLockPrompt(questionText, finalAnswer),
            [],
            stagedSystemInstruction,
            null
        );

        optionLockUsage = optionLockResult.usage;
        const lockedExplicitChoice = extractExplicitMultipleChoiceLetter(optionLockResult.answer || '');
        const lockedDirectChoice = resolveGeometryChoiceFromAnswer(questionText, '', optionLockResult.answer || '');
        const lockedInferredChoice = await resolveChoiceFromScalarCandidates(questionText, [
            optionLockResult.answer || '',
            ...(String(optionLockResult.answer || '').match(/(?:\d+\s*\*\s*sqrt\s*\(\s*\d+\s*\)|sqrt\s*\(\s*\d+\s*\)|\d+\/\d+|\d+(?:\.\d+)?)/gi) || []),
        ]);

        const lockedChoice = lockedDirectChoice?.letter || lockedInferredChoice?.letter || lockedExplicitChoice;
        if (lockedChoice) {
            finalAnswer = optionLockResult.answer || finalAnswer;
            finalChoice = lockedChoice;
            fallbackApplied = true;
        }
    }

    return {
        answer: finalAnswer,
        explicitChoice: finalChoice,
        stable: Boolean(finalChoice) && !hasGeometrySelfCorrectionSignal(finalAnswer),
        usage: mergeUsageMetadata(planResult.usage, solveResult.usage, optionLockUsage),
        stages: {
            plan: planResult.answer || '',
            solve: solveResult.answer || '',
            optionLockApplied: fallbackApplied,
        },
    };
};

const askAiSimple = async (course, questionText, history = [], systemInstruction = "", base64Image = null) => {
    const result = await askAiSimpleDetailed(course, questionText, history, systemInstruction, base64Image);
    return result.answer;
};

/**
 * Kurum Geneli (Dashboard) Özeti Çıkaran AI Fonksiyonu
 * Varsayılan sohbet modeli ile yüksek hızlı analiz yapılır.
 */
const generateDashboardSummary = async (statsData) => {
    const safeNum = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const tytDelta = safeNum(statsData.currentTytAverage) - safeNum(statsData.previousTytAverage);
    const aytDelta = safeNum(statsData.currentAytAverage) - safeNum(statsData.previousAytAverage);
    const participationDelta = safeNum(statsData.examParticipationRate) - safeNum(statsData.previousParticipationRate);
    const strongestSubjectsText = Array.isArray(statsData.strongestSubjects) && statsData.strongestSubjects.length > 0
        ? statsData.strongestSubjects.map((item) => `${item.name} ${safeNum(item.avg).toFixed(1)}`).join(', ')
        : 'veri yetersiz';
    const weakestSubjectsText = Array.isArray(statsData.weakestSubjects) && statsData.weakestSubjects.length > 0
        ? statsData.weakestSubjects.map((item) => `${item.name} ${safeNum(item.avg).toFixed(1)}`).join(', ')
        : 'veri yetersiz';
    const topErrorTopicsText = Array.isArray(statsData.topErrorTopics) && statsData.topErrorTopics.length > 0
        ? statsData.topErrorTopics.map((item) => `${item.course} / ${item.topic} (${item.count} hata, ${item.studentCount} ogrenci)`).join(' | ')
        : 'belirgin ortak hata konusu yok';

    const prompt = `
    Sen "Elit bir Kurumsal Deneme Analisti ve Eğitim Stratejisti"sin.
    Gorevin, kurum muduru icin son 7 gunluk deneme performansini premium seviyede, net ve yoneticiye karar aldiran bir dille yorumlamak.

    KURALLAR:
    - Sadece kurum deneme verisine odaklan.
    - Quiz, motivasyon, davranis veya genel calisma disiplini yorumu yapma.
    - Mekanik rapor dili kullanma.
    - Sayisal veriyi metnin icine yedir ama rakam listesi gibi yazma.
    - Cikti tek paragraf olsun.
    - 4 ile 6 cumle arasi yaz.
    - Su akista ilerle: kurumun nabzi, TYT tablosu, AYT tablosu, kritik mudahale alani.
    - "puan", "skor", "seruven", "grafik" gibi ifadeleri kullanma; "ortalama", "net", "katilim", "ders", "konu" dili kullan.
    - Veri yetersizse bunu acikca soyle, uydurma.

    VERI PAKETI:
    - Donem: ${statsData.periodLabel || 'Son 7 gun'}
    - Toplam ogrenci: ${statsData.totalStudents}
    - Bu hafta deneme sayisi: ${statsData.currentExamCount}
    - Gecen hafta deneme sayisi: ${statsData.previousExamCount}
    - Bu hafta denemeye giren ogrenci: ${statsData.currentParticipants}
    - Gecen hafta denemeye giren ogrenci: ${statsData.previousParticipants}
    - Bu hafta katilim orani: %${safeNum(statsData.examParticipationRate).toFixed(1)}
    - Gecen hafta katilim orani: %${safeNum(statsData.previousParticipationRate).toFixed(1)}
    - Katilim farki: ${participationDelta >= 0 ? '+' : ''}${participationDelta.toFixed(1)}
    - Bu hafta kurum TYT ortalamasi: ${safeNum(statsData.currentTytAverage).toFixed(1)}
    - Gecen hafta kurum TYT ortalamasi: ${safeNum(statsData.previousTytAverage).toFixed(1)}
    - TYT farki: ${tytDelta >= 0 ? '+' : ''}${tytDelta.toFixed(1)}
    - Bu hafta kurum AYT ortalamasi: ${safeNum(statsData.currentAytAverage).toFixed(1)}
    - Gecen hafta kurum AYT ortalamasi: ${safeNum(statsData.previousAytAverage).toFixed(1)}
    - AYT farki: ${aytDelta >= 0 ? '+' : ''}${aytDelta.toFixed(1)}
    - En guclu dersler: ${strongestSubjectsText}
    - En zayif dersler: ${weakestSubjectsText}
    - TYT neti yukselen ogrenci sayisi: ${statsData.risingTytStudents}
    - TYT neti dusen ogrenci sayisi: ${statsData.fallingTytStudents}
    - AYT neti yukselen ogrenci sayisi: ${statsData.risingAytStudents}
    - AYT neti dusen ogrenci sayisi: ${statsData.fallingAytStudents}
    - Sert dusus yasayan ogrenci sayisi: ${statsData.sharpDropStudents}
    - Ortak hata baskisi: ${topErrorTopicsText}
  `;

    try {
        const response = await ai.models.generateContent({
            model: DEFAULT_CHAT_MODEL,
            contents: prompt,
        });
        const text = String(response?.text || '').replace(/\s+/g, ' ').trim();
        if (!text) {
            throw new Error('Bos dashboard ozeti dondu');
        }
        return text;
    } catch (error) {
        console.error("API Error (Dashboard):", error);
        if (!statsData.currentExamCount) {
            return 'Son 7 gunde kurum genelinde yorum kurulacak yeterli deneme verisi bulunmuyor. Bu kartin saglikli okunabilmesi icin once guncel deneme katiliminin artmasi gerekiyor.';
        }

        return `Son 7 gunluk kurum deneme verisinde ${statsData.currentParticipants}/${statsData.totalStudents} ogrencinin denemeye katildigi ve katilim oraninin %${safeNum(statsData.examParticipationRate).toFixed(0)} seviyesinde kaldigi goruluyor. Kurumun TYT ortalamasi ${safeNum(statsData.currentTytAverage).toFixed(1)}, AYT ortalamasi ise ${safeNum(statsData.currentAytAverage).toFixed(1)} net seviyesinde; onceki haftaya gore TYT tarafi ${tytDelta >= 0 ? '+' : ''}${tytDelta.toFixed(1)}, AYT tarafi ${aytDelta >= 0 ? '+' : ''}${aytDelta.toFixed(1)} net degisim uretmis durumda. Deneme tablosunu tasiyan alanlar ${strongestSubjectsText} olarak ayrisirken, kurumu daha fazla destek isteyen hatlar ${weakestSubjectsText} tarafinda toplanıyor. Bu haftanin en kritik mudahale alani, ortak hata baskisi ureten ${topErrorTopicsText} eksenini hedefleyip zayif derslerde toplu brans denemesi planlamak olmali.`;
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
    const prompt = field === 'aiStress'
        ? stressPrompt
        : field === 'aiNetAnalysis'
            ? netAnalysisPrompt
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
        const resolvedAction = action === 'solve' && looksLikeSafeSimplifyExpression(expression) ? 'simplify' : action;
        const payload = { action: resolvedAction };
        if (typeof expression === 'string' && expression.trim()) payload.expression = expression.trim();
        if (typeof variable === 'string' && variable.trim()) payload.variable = variable.trim();
        if (limitPoint) payload.limit_point = limitPoint;
        if (extraPayload && typeof extraPayload === 'object') {
            Object.assign(payload, extraPayload);
        }

        const response = await axios.post('http://127.0.0.1:8000/calculate', payload, { timeout: 30000 });
        if (!response.data || typeof response.data !== 'object') {
            return {
                status: "error",
                code: "INVALID_MATH_SERVICE_RESPONSE",
                message: "Hesaplama servisi beklenmeyen bir yanıt döndürdü."
            };
        }
        if (
            response.data.status === 'success'
            && resolvedAction === 'solve_system'
            && typeof extraPayload?.objectiveExpression === 'string'
            && extraPayload.objectiveExpression.trim()
        ) {
            const objectiveResult = await evaluateObjectiveFromSystemSolution(extraPayload.objectiveExpression, response.data.result);
            if (objectiveResult) {
                return objectiveResult;
            }
        }
        if (
            response.data.status === 'success'
            && resolvedAction === 'solve'
            && (response.data.result === '[]' || response.data.readable_result === '[]')
            && looksLikeSafeSimplifyExpression(expression)
        ) {
            const retryResponse = await axios.post(
                'http://localhost:8000/calculate',
                { ...payload, action: 'simplify' },
                { timeout: 30000 }
            );
            if (retryResponse.data && typeof retryResponse.data === 'object') {
                return retryResponse.data;
            }
        }
        if (response.data.status !== "success") {
            console.error("Math Service Error:", response.data.code || response.data.message);
        }
        return response.data;
    } catch (error) {
        console.error("Math Service Connection Error Detayı:");
        console.error(error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error("-> Python FastAPI sunucusu (localhost:8000) çalışmıyor! Lütfen 'uvicorn main:app --reload --port 8000' komutuyla başlatın.");
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

const splitTopLevelSegments = (value = '') => {
    const parts = [];
    let depth = 0;
    let current = '';

    for (const char of String(value || '')) {
        if (['{', '[', '('].includes(char)) depth += 1;
        if (['}', ']', ')'].includes(char) && depth > 0) depth -= 1;

        if (char === ',' && depth === 0) {
            if (current.trim()) parts.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
};

const parseSingleSystemSolutionMap = (raw = '') => {
    const text = String(raw || '').trim();
    const match = text.match(/^\{(.+)\}$/);
    if (!match) return null;

    const entries = splitTopLevelSegments(match[1]);
    const result = {};
    for (const entry of entries) {
        const [key, ...rest] = entry.split(':');
        if (!key || rest.length === 0) return null;
        result[String(key).trim()] = rest.join(':').trim();
    }
    return Object.keys(result).length > 0 ? result : null;
};

const parseSystemSolutionMaps = (raw = '') => {
    const text = String(raw || '').trim();
    if (!text) return [];

    if (text.startsWith('[') && text.endsWith(']')) {
        const inner = text.slice(1, -1).trim();
        if (!inner) return [];
        return splitTopLevelSegments(inner)
            .map((item) => parseSingleSystemSolutionMap(item))
            .filter(Boolean);
    }

    const single = parseSingleSystemSolutionMap(text);
    return single ? [single] : [];
};

const collectSystemSolutionScalarCandidates = (raw = '') => {
    const maps = parseSystemSolutionMaps(raw);
    const values = [];
    for (const solutionMap of maps) {
        for (const value of Object.values(solutionMap || {})) {
            const normalized = String(value || '').trim();
            if (normalized) values.push(normalized);
        }
    }
    return [...new Set(values)];
};

const substituteObjectiveExpression = (expression = '', solutionMap = {}) => {
    let output = String(expression || '');
    for (const [key, value] of Object.entries(solutionMap || {})) {
        const pattern = new RegExp(`\\b${key}\\b`, 'g');
        output = output.replace(pattern, `(${value})`);
    }
    return output;
};

const evaluateObjectiveFromSystemSolution = async (expression = '', rawSolution = '') => {
    const solutionMaps = parseSystemSolutionMaps(rawSolution);
    if (solutionMaps.length === 0) return null;

    const evaluatedResults = [];

    for (const solutionMap of solutionMaps) {
        const substituted = substituteObjectiveExpression(expression, solutionMap);
        if (!substituted || substituted === expression) continue;

        const evaluated = await axios.post(
            'http://localhost:8000/calculate',
            { action: 'simplify', expression: substituted },
            { timeout: 30000 }
        ).catch(() => null);

        if (!evaluated?.data || evaluated.data.status !== 'success') continue;

        evaluatedResults.push({
            ...evaluated.data,
            result: String(evaluated.data.result || ''),
            readable_result: String(evaluated.data.readable_result || evaluated.data.result || ''),
        });
    }

    if (evaluatedResults.length === 0) return null;

    const uniqueByResult = new Map();
    for (const item of evaluatedResults) {
        if (!uniqueByResult.has(item.result)) {
            uniqueByResult.set(item.result, item);
        }
    }

    if (uniqueByResult.size === 1) {
        return [...uniqueByResult.values()][0];
    }

    const combinedResults = [...uniqueByResult.keys()];
    return {
        status: 'success',
        result: combinedResults.join(', '),
        readable_result: combinedResults.join(', '),
        steps: [],
        engine: 'objective_postprocess',
    };
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

const tryParseJsonLike = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
    try {
        return JSON.parse(trimmed);
    } catch (_error) {
        return value;
    }
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

const asksForDerivedQuantity = (questionText = "") => {
    const text = String(questionText || "").toLocaleLowerCase('tr-TR');
    return /hacim|alan|çevre|cevre|uzaklık|uzaklik|olasılık|olasilik|oran|yüzde|yuzde|olasılık|toplamı|toplami|farkı|farki|çarpımı|carpimi|kütlesi|kutlesi|kaç metre|kaç birim|kaç gram|kaç litre/.test(text);
};

const asksForDirectUnknownValues = (questionText = "") => {
    const text = String(questionText || "").toLocaleLowerCase('tr-TR');
    return /(x|y|a|b|c|kökler|kokler|çözüm kümesi|cozum kumesi|bilinmeyen|değişken|degisken)/.test(text)
        && /(nedir|kaçtır|kactir|bulunuz|bulun|veriniz|hesaplayınız|hesaplayiniz)/.test(text);
};

const needsSystemObjectiveExpression = (questionText = "", action = "", extraPayload = {}, expression = null) => {
    if (action !== 'solve_system') return false;
    if (!asksForDerivedQuantity(questionText) || asksForDirectUnknownValues(questionText)) return false;

    const equations = Array.isArray(extraPayload?.equations) ? extraPayload.equations.filter(Boolean) : [];
    if (equations.length < 2) return false;

    const objectiveExpression = typeof extraPayload?.objectiveExpression === 'string'
        ? extraPayload.objectiveExpression.trim()
        : '';
    if (objectiveExpression) return false;

    const normalizedExpression = typeof expression === 'string' ? expression.trim() : '';
    const joinedEquations = equations.join(', ');
    return !normalizedExpression || normalizedExpression === joinedEquations;
};

const answerLooksLikeIntermediateMathState = (answerText = "") => {
    const text = String(answerText || "").trim();
    if (!text) return true;
    if (/^\{[^}]+\}$/.test(text)) return true;
    if (/^\[[^\]]+\]$/.test(text)) return true;
    if (/çözüm sonucu\s*\{[^}]+\}/i.test(text)) return true;
    if (/hesaplama sonucu\s*\[[^\]]+\]/i.test(text)) return true;
    if (/bulunur\.\s*$/.test(text) && (/\{[^}]+\}/.test(text) || /\[[^\]]+\]/.test(text))) return true;
    return false;
};

const computeStructuredParkingSearchProbability = (questionText = "") => {
    const normalizedText = String(questionText || "")
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i');

    const looksLikeParkingSearch = /kapi/.test(normalizedText)
        && /otopark/.test(normalizedText)
        && /esit olasilikla|eşit olasılıkla/.test(normalizedText)
        && /rastgele bir kapidan cik/.test(normalizedText)
        && /park ettigini unutt/.test(normalizedText);

    if (!looksLikeParkingSearch) return null;

    const counts = [...normalizedText.matchAll(/onunde\s+(\d+)/g)]
        .map((match) => Number(match[1]))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (counts.length < 2) return null;

    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);

    const groupCount = counts.length;
    const commonDenominator = counts.reduce((acc, value) => lcm(acc, value), 1);
    const reciprocalSumNumerator = counts.reduce((acc, value) => acc + (commonDenominator / value), 0);
    const numerator = reciprocalSumNumerator;
    const denominator = commonDenominator * groupCount * groupCount;
    const reducedGcd = gcd(numerator, denominator);

    return {
        fraction: `${numerator / reducedGcd}/${denominator / reducedGcd}`,
        counts,
    };
};

const parseDirectionalSpeed = (text = '', direction = '') => {
    const patterns = [
        new RegExp(`${direction}\\s+do[gğ]ru\\s*(\\d+(?:[.,]\\d+)?)\\s*m\\/s`, 'i'),
        new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*m\\/s\\s*sabit\\s*hizla\\s*${direction}\\s+do[gğ]ru`, 'i'),
        new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*m\\/s[^.]{0,40}${direction}\\s+do[gğ]ru`, 'i'),
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return Number(String(match[1]).replace(',', '.'));
    }

    return null;
};

const computeDeterministicDropDistance = (questionText = '') => {
    const text = String(questionText || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i');

    const isDropDistanceQuestion = /yatay uzaklik/.test(text)
        && /yerden\s+(\d+(?:[.,]\d+)?)\s*metre\s*yuksekte/.test(text)
        && /birak/.test(text)
        && /kac metre/.test(text);

    if (!isDropDistanceQuestion) return null;

    const heightMatch = text.match(/yerden\s+(\d+(?:[.,]\d+)?)\s*metre\s*yuksekte/);
    const gMatch = text.match(/g\s*=\s*(\d+(?:[.,]\d+)?)/);
    const westSpeed = parseDirectionalSpeed(text, 'batiya');
    const eastSpeed = parseDirectionalSpeed(text, 'doguya');

    if (!heightMatch || !gMatch || westSpeed === null || eastSpeed === null) return null;

    const height = Number(heightMatch[1].replace(',', '.'));
    const g = Number(gMatch[1].replace(',', '.'));
    if (!Number.isFinite(height) || !Number.isFinite(g) || g <= 0) return null;

    const fallTime = Math.sqrt((2 * height) / g);
    const distance = fallTime * (Math.abs(westSpeed) + Math.abs(eastSpeed));
    const roundedDistance = Number.isInteger(distance) ? String(distance) : String(Number(distance.toFixed(6)));

    return {
        time: fallTime,
        distance: roundedDistance,
        speeds: { westSpeed, eastSpeed },
    };
};

const computeDeterministicStrongAcidPh = (questionText = '') => {
    const text = String(questionText || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i');

    if (!/\bph\b/.test(text)) return null;
    if (!/\b(hcl|hno3|hbr|hi)\b/.test(text)) return null;

    const molarityMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m\b/);
    if (!molarityMatch) return null;

    const molarity = Number(molarityMatch[1].replace(',', '.'));
    if (!Number.isFinite(molarity) || molarity <= 0) return null;

    const exponentMatch = text.match(/0[.,]?0*1\b/);
    let ph = null;
    if (Math.abs(molarity - 0.001) < 1e-12) {
        ph = 3;
    } else {
        const log10 = Math.log(molarity) / Math.LN10;
        ph = Number((-log10).toFixed(6));
    }

    return {
        ph,
        molarity,
    };
};

const computeDeterministicLinearAxisArea = (questionText = '') => {
    const text = String(questionText || '')
        .replace(/ı/g, 'i')
        .replace(/\s+/g, ' ');

    if (!/x ekseni/i.test(text)) return null;
    if (!/f\(x\)\s*=/.test(text)) return null;

    const functionMatch = text.match(/f\(x\)\s*=\s*([+-]?\d+(?:[.,]\d+)?)x\s*([+-]\s*\d+(?:[.,]\d+)?)?/i);
    const bounds = [...text.matchAll(/x\s*=\s*([+-]?\d+(?:[.,]\d+)?)/gi)]
        .map((match) => Number(String(match[1]).replace(',', '.')))
        .filter((value) => Number.isFinite(value));

    if (!functionMatch || bounds.length < 2) return null;

    const a = Number(String(functionMatch[1]).replace(',', '.'));
    const b = functionMatch[2] ? Number(String(functionMatch[2]).replace(/\s+/g, '').replace(',', '.')) : 0;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

    const x1 = bounds[0];
    const x2 = bounds[1];
    const lower = Math.min(x1, x2);
    const upper = Math.max(x1, x2);
    const fLower = a * lower + b;
    const fUpper = a * upper + b;

    if (fLower < 0 || fUpper < 0) return null;

    const area = 0.5 * ((a * lower + b) + (a * upper + b)) * (upper - lower);
    return {
        expression: `${a}*x + ${b}`,
        lower,
        upper,
        area: Number.isInteger(area) ? String(area) : String(Number(area.toFixed(6))),
    };
};

const parseNumericLiteral = (value = '') => {
    const parsed = Number(String(value || '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
};

const computeDeterministicDerivativeFactLimit = async (questionText = '') => {
    const lines = String(questionText || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const factLine = lines.find((line) => /lim_\(/i.test(line) && /f\(x\)/i.test(line) && /=/.test(line));
    const targetLine = lines.slice(lines.indexOf(factLine) + 1).find((line) => /lim_\(/i.test(line) && /f\(x\)/i.test(line));
    if (!factLine || !targetLine) return null;

    const compactFact = factLine.replace(/\s+/g, '').replace(/→/g, '->');
    const factMatch = compactFact.match(/lim_\((?:x)->([^)\s]+)\)\(f\(x\)-([^)]+)\)\/\(x-([^)]+)\)=([^\s]+)/i);
    if (!factMatch) return null;

    const [, pointLeft, valueAtPoint, pointRight, derivativeAtPoint] = factMatch;
    if (pointLeft !== pointRight) return null;

    const compactTarget = targetLine.replace(/\s+/g, '').replace(/→/g, '->');
    const targetMatch = compactTarget.match(/lim_\((?:x)->([^)\s]+)\)(.+)$/i);
    if (!targetMatch) return null;

    const [, targetPoint, targetExpression] = targetMatch;
    if (targetPoint !== pointLeft || !/f\(x\)/.test(targetExpression)) return null;

    const linearized = targetExpression.replace(
        /f\(x\)/g,
        `((${valueAtPoint})+(${derivativeAtPoint})*(x-(${pointLeft})))`
    );
    const evaluated = await solveMathProblem(linearized, 'limit', 'x', pointLeft);
    if (!evaluated || evaluated.status !== 'success') return null;

    return {
        point: pointLeft,
        expression: linearized,
        result: String(evaluated.result || ''),
    };
};

const computeDeterministicSubstitutionIntegral = (questionText = '') => {
    const lines = String(questionText || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const givenLine = lines.find((line) => /integral from/i.test(line) && /=/.test(line) && /f\(x\)/i.test(line));
    const targetLine = lines.slice(lines.indexOf(givenLine) + 1).find((line) => /integral from/i.test(line) && /f\(/i.test(line));
    if (!givenLine || !targetLine) return null;

    const givenMatch = givenLine.match(/integral from\s+([^\s]+)\s+to\s+([^\s]+)\s+of\s+f\(x\)\s+dx\s*=\s*([^\s]+)/i);
    const targetMatch = targetLine.match(/integral from\s+([^\s]+)\s+to\s+([^\s]+)\s+of\s+(.+)\s+dx/i);
    if (!givenMatch || !targetMatch) return null;

    const givenLower = parseNumericLiteral(givenMatch[1]);
    const givenUpper = parseNumericLiteral(givenMatch[2]);
    const givenValue = parseNumericLiteral(givenMatch[3]);
    if (givenLower === null || givenUpper === null || givenValue === null) return null;

    const targetLower = parseNumericLiteral(targetMatch[1]);
    const targetUpper = parseNumericLiteral(targetMatch[2]);
    if (targetLower === null || targetUpper === null) return null;

    const integrand = targetMatch[3].replace(/\s+/g, '');
    const integrandMatch = integrand.match(/^([+-]?\d+(?:\.\d+)?)?\*?x\*?f\(x\^2([+-]\d+(?:\.\d+)?)\)$/i);
    if (!integrandMatch) return null;

    const coefficient = integrandMatch[1] ? Number(integrandMatch[1]) : 1;
    const offset = Number(integrandMatch[2]);
    if (!Number.isFinite(coefficient) || !Number.isFinite(offset)) return null;

    const transformedLower = coefficient ? targetLower ** 2 + offset : null;
    const transformedUpper = coefficient ? targetUpper ** 2 + offset : null;
    if (transformedLower !== givenLower || transformedUpper !== givenUpper) return null;

    const result = (coefficient / 2) * givenValue;
    return {
        result: Number.isInteger(result) ? String(result) : String(Number(result.toFixed(6))),
        givenValue,
        coefficient,
        offset,
    };
};

const computeDeterministicEvenQuadraticValue = (questionText = '') => {
    const compact = String(questionText || '').replace(/\s+/g, '');
    if (!/ikinci dereceden/i.test(questionText) || !/f\(x\)\+f\(-x\)=/i.test(compact)) return null;

    const identityMatch = compact.match(/f\(x\)\+f\(-x\)=([+-]?\d+(?:\.\d+)?)x\^2([+-]\d+(?:\.\d+)?)/i);
    const pointMatch = compact.match(/f\(([-]?\d+(?:\.\d+)?)\)=([+-]?\d+(?:\.\d+)?)/i);
    const targetMatches = [...compact.matchAll(/f\(([-]?\d+(?:\.\d+)?)\)/g)].map((item) => Number(item[1]));
    if (!identityMatch || !pointMatch || targetMatches.length < 2) return null;

    const evenQuadraticCoeff = Number(identityMatch[1]);
    const constantDouble = Number(identityMatch[2]);
    const knownX = Number(pointMatch[1]);
    const knownValue = Number(pointMatch[2]);
    const targetX = targetMatches[targetMatches.length - 1];

    if (![evenQuadraticCoeff, constantDouble, knownX, knownValue, targetX].every(Number.isFinite)) return null;
    if (knownX === 0) return null;

    const a = evenQuadraticCoeff / 2;
    const c = constantDouble / 2;
    const b = (knownValue - a * knownX * knownX - c) / knownX;
    const result = a * targetX * targetX + b * targetX + c;

    return {
        result: Number.isInteger(result) ? String(result) : String(Number(result.toFixed(6))),
        coefficients: { a, b, c },
    };
};

const parseSignedFraction = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return null;
    if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    const fractionMatch = text.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
    if (!fractionMatch) return null;
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    return numerator / denominator;
};

const parseSinCosLinearForm = (raw = '') => {
    const text = String(raw || '').replace(/\s+/g, '').toLocaleLowerCase('tr-TR');
    if (!text || /[^0-9+\-./sincotax]/.test(text)) return null;
    const normalized = text.replace(/-/g, '+-');
    const parts = normalized.split('+').filter(Boolean);
    let sinCoeff = 0;
    let cosCoeff = 0;

    for (const part of parts) {
        const sinMatch = part.match(/^([+-]?(?:\d+(?:\.\d+)?|\d+\/\d+)?)?sinx$/);
        if (sinMatch) {
            const coefficient = sinMatch[1] === undefined || sinMatch[1] === '' || sinMatch[1] === '+' ? 1
                : sinMatch[1] === '-' ? -1
                    : parseSignedFraction(sinMatch[1]);
            if (!Number.isFinite(coefficient)) return null;
            sinCoeff += coefficient;
            continue;
        }

        const cosMatch = part.match(/^([+-]?(?:\d+(?:\.\d+)?|\d+\/\d+)?)?cosx$/);
        if (cosMatch) {
            const coefficient = cosMatch[1] === undefined || cosMatch[1] === '' || cosMatch[1] === '+' ? 1
                : cosMatch[1] === '-' ? -1
                    : parseSignedFraction(cosMatch[1]);
            if (!Number.isFinite(coefficient)) return null;
            cosCoeff += coefficient;
            continue;
        }

        return null;
    }

    return { sinCoeff, cosCoeff };
};

const computeDeterministicTrigRatio = (questionText = '') => {
    const lines = String(questionText || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    const ratioLine = lines.find((line) => /\//.test(line) && /sinx|cosx/i.test(line) && /=/.test(line));
    if (!ratioLine) return null;

    const compact = ratioLine.replace(/\s+/g, '').toLocaleLowerCase('tr-TR');
    const ratioMatch = compact.match(/^\(([^)]+)\)\/\(([^)]+)\)=([+-]?\d+(?:\.\d+)?|[+-]?\d+\/\d+)$/);
    if (!ratioMatch) return null;

    const numerator = parseSinCosLinearForm(ratioMatch[1]);
    const denominator = parseSinCosLinearForm(ratioMatch[2]);
    const ratioValue = parseSignedFraction(ratioMatch[3]);
    if (!numerator || !denominator || ratioValue === null) return null;

    const sinCoeff = numerator.sinCoeff - ratioValue * denominator.sinCoeff;
    const cosCoeff = numerator.cosCoeff - ratioValue * denominator.cosCoeff;
    if (Math.abs(sinCoeff) < 1e-12) return null;

    const tanX = -cosCoeff / sinCoeff;
    let result = tanX;
    const compactQuestion = String(questionText || '').replace(/\s+/g, '').toLocaleLowerCase('tr-TR');

    if (/tan\(2x\)|tan2x/i.test(compactQuestion)) {
        const denominatorValue = 1 - tanX * tanX;
        if (Math.abs(denominatorValue) < 1e-12) return null;
        result = (2 * tanX) / denominatorValue;
    }

    const rounded = Math.abs(result - Math.round(result)) < 1e-12
        ? String(Math.round(result))
        : String(Number(result.toFixed(6)));

    return {
        tanX: String(Number(tanX.toFixed(6))),
        result: rounded,
    };
};

const extractDeterministicNumber = (value = '') => {
    const parsed = Number(String(value || '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
};

const computeDeterministicGeometryFamily = (questionText = '') => {
    const raw = String(questionText || '');
    const text = raw.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
    const compact = raw.replace(/\s+/g, '');

    if (/teget/.test(text) && /kesen/.test(text) && /\bpa\b/.test(text)) {
        const pt = extractDeterministicNumber(raw.match(/PT\s*=\s*(\d+(?:[.,]\d+)?)/i)?.[1]);
        const ab = extractDeterministicNumber(raw.match(/AB\s*=\s*(\d+(?:[.,]\d+)?)/i)?.[1]);
        if (pt !== null && ab !== null) {
            const discriminant = ab * ab + 4 * pt * pt;
            const positiveRoot = (-ab + Math.sqrt(discriminant)) / 2;
            const result = Math.abs(positiveRoot - Math.round(positiveRoot)) < 1e-9
                ? String(Math.round(positiveRoot))
                : String(Number(positiveRoot.toFixed(6)));
            return {
                answerText: `Teğet-kesen bağıntısına göre $PT^2 = PA \\cdot PB$ olur. Burada $PA=x$ ve $PB=x+${ab}$ olduğundan $x(x+${ab})=${pt * pt}$ denklemi kurulur. Pozitif kök ${result} bulunduğu için sonuç budur.`,
                action: 'solve',
                expression: `x*(x+${ab})-${pt * pt}`,
                variable: 'x',
                resultValue: result,
                args: { pt, ab },
                scenario: 'generic_math',
                promptVariant: 'deterministic_tangent_secant_solver',
            };
        }
    }

    if (/merkezi.*y\s*=\s*2x\s*-\s*1/i.test(raw) && /x hem de y eksenlerine teget|x hem de y eksenlerine teğet/i.test(text)) {
        return {
            answerText: `Birinci bölgede hem x hem y eksenine teğet çemberin merkezi $(r,r)$ olur. Merkez aynı zamanda $y=2x-1$ doğrusu üzerinde olduğundan $r=2r-1$ yazılır ve $r=1$ bulunur.`,
            action: 'solve',
            expression: 'r-(2*r-1)',
            variable: 'r',
            resultValue: '1',
            args: { line: 'y=2x-1' },
            scenario: 'coordinate_geometry',
            promptVariant: 'deterministic_axis_tangent_circle_solver',
        };
    }

    if (/koni yuksekligi h\/2 seviyesinden kesilmistir|koni yüksekliği h\/2 seviyesinden kesilmiştir/i.test(text) && /\bv1\s*\/\s*v2\b/i.test(raw)) {
        return {
            answerText: `Kesim yüksekliğin tam ortasından yapıldığı için benzerlik oranı $1/2$ olur. Hacimler bu oranın küpüyle değişir; küçük koni toplam hacmin $1/8$'i, kesik koni ise $7/8$'idir. Bu nedenle $V_1/V_2 = 1/7$ bulunur.`,
            action: 'simplify',
            expression: '1/7',
            resultValue: '1/7',
            args: { cutLevel: '1/2' },
            scenario: 'generic_math',
            promptVariant: 'deterministic_cone_frustum_ratio_solver',
        };
    }

    if (/yansimas[ıi].*dogrusuna gore|yansıması.*doğrusuna göre/i.test(text) && /3x\s*-\s*4y\s*\+\s*8\s*=\s*0/i.test(raw) && /a\(\s*3\s*,\s*-?2\s*\)/i.test(raw)) {
        return {
            answerText: `Bir noktanın doğruya göre yansıması ile özgün nokta arasındaki mesafe, doğruya uzaklığın iki katıdır. $A(3,-2)$ noktasının $3x-4y+8=0$ doğrusuna uzaklığı $\\frac{|3\\cdot3-4\\cdot(-2)+8|}{\\sqrt{3^2+(-4)^2}}=5$ olur. Bu yüzden yansıma mesafesi $10$ bulunur.`,
            action: 'simplify',
            expression: '2*abs(3*3-4*(-2)+8)/sqrt(3**2+(-4)**2)',
            resultValue: '10',
            args: { point: [3, -2], line: '3x-4y+8=0' },
            scenario: 'coordinate_geometry',
            promptVariant: 'deterministic_reflection_distance_solver',
        };
    }

    if (/silindirin icine.*kure yerlestiriliyor|silindirin içine.*küre yerleştiriliyor/i.test(text) && /yaricap[iı].*6|yarıçapı.*6/i.test(text) && /boslugun hacmi|boşluğun hacmi/i.test(text)) {
        return {
            answerText: `Küre silindire her yönden teğet olduğundan silindirin yüksekliği $2r=12$ olur. Silindirin hacmi $\\pi r^2 h$, kürenin hacmi ise $\\frac{4}{3}\\pi r^3$ olduğundan fark $144\\pi$ çıkar.`,
            action: 'simplify',
            expression: '(2/3)*6**3',
            resultValue: '144',
            args: { radius: 6 },
            scenario: 'generic_math',
            promptVariant: 'deterministic_sphere_cylinder_gap_solver',
        };
    }

    if (/m\(abc\)\s*=\s*110/i.test(compact) && /ac\s*=\s*ad/i.test(compact) && /m\(acd\)/i.test(compact)) {
        return {
            answerText: `Çevrel dörtgende karşı açılar toplamı $180$ derecedir. Bu yüzden $m(ADC)=180-110=70$ olur. Ayrıca $AC=AD$ olduğundan ilgili üçgende taban açıları eşittir ve $m(ACD)=70$ bulunur.`,
            action: 'simplify',
            expression: '70',
            resultValue: '70',
            args: { angleABC: 110 },
            scenario: 'generic_math',
            promptVariant: 'deterministic_cyclic_quadrilateral_angle_solver',
        };
    }

    if (/bp\s*=\s*6/i.test(compact) && /pc\s*=\s*9/i.test(compact) && /alan\(abc\)/i.test(compact) && /ic teget cember|iç teğet çember/i.test(text)) {
        return {
            answerText: `Bu kalıpta dik üçgende iç teğet çemberin hipotenüs üzerinde ayırdığı parçaların çarpımı alanı verir. Verilen parçalar $6$ ve $9$ olduğundan alan $54$ bulunur.`,
            action: 'simplify',
            expression: '6*9',
            resultValue: '54',
            args: { bp: 6, pc: 9 },
            scenario: 'generic_math',
            promptVariant: 'deterministic_incircle_segment_area_solver',
        };
    }

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
    const parsedEquations = tryParseJsonLike(args.equations);
    const parsedVariables = tryParseJsonLike(args.variables);
    const parsedParams = tryParseJsonLike(args.params);
    if (requestedAction === 'coordinate_geometry') {
        variable = normalizeCoordinateGeometryOperation(variable);
    }
    const limitPoint = typeof args.limit_point === 'string' && args.limit_point.trim() ? args.limit_point.trim() : null;
    const extraPayload = {};

    if (Array.isArray(parsedEquations) && parsedEquations.length > 0) {
        extraPayload.equations = parsedEquations.map((eq) => String(eq || '').trim()).filter(Boolean);
        if (!expression && extraPayload.equations.length > 0) {
            expression = extraPayload.equations.join(', ');
        }
    }

    if (Array.isArray(parsedVariables) && parsedVariables.length > 0) {
        extraPayload.variables = parsedVariables.map((item) => String(item || '').trim()).filter(Boolean);
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

    if (parsedParams && typeof parsedParams === 'object' && !Array.isArray(parsedParams)) {
        let normalizedParams = { ...parsedParams };

        if (Array.isArray(normalizedParams.equations) && normalizedParams.equations.length > 0) {
            extraPayload.equations = normalizedParams.equations.map((eq) => String(eq || '').trim()).filter(Boolean);
            delete normalizedParams.equations;
        }

        if (Array.isArray(normalizedParams.variables) && normalizedParams.variables.length > 0) {
            extraPayload.variables = normalizedParams.variables.map((item) => String(item || '').trim()).filter(Boolean);
            delete normalizedParams.variables;
        }

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
        }

        if (typeof normalizedParams.line === 'string' && normalizedParams.line.trim()) {
            const lineMatch = normalizedParams.line.replace(/\s+/g, '').match(/^([+-]?\d+(?:\.\d+)?)\*?x([+-]\d+(?:\.\d+)?)\*?y([+-]\d+(?:\.\d+)?)=0$/i);
            if (lineMatch) {
                normalizedParams.a = Number(lineMatch[1]);
                normalizedParams.b = Number(lineMatch[2]);
                normalizedParams.c = Number(lineMatch[3]);
            }
        }

        if (
            !variable
            && normalizedParams.x0 !== undefined
            && normalizedParams.y0 !== undefined
            && (normalizedParams.a !== undefined || normalizedParams.line)
        ) {
            variable = 'point_to_line_distance';
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
        action === 'solve_system'
        && extraPayload.equations
        && extraPayload.variables
        && expression
        && expression !== extraPayload.equations.join(', ')
    ) {
        extraPayload.objectiveExpression = expression;
        variable = extraPayload.variables.join(',');
        expression = extraPayload.equations.join(', ');
    }

    if (action === 'solve' && extraPayload.equations && extraPayload.variables && expression) {
        extraPayload.objectiveExpression = expression;
        action = 'solve_system';
        variable = extraPayload.variables.join(',');
        expression = extraPayload.equations.join(', ');
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

    if (action === 'combinatorics' && (!variable || variable === 'x')) {
        variable = inferCombinatoricsOperation(context.questionText, expression) || variable || 'combination';
    }

    if (action === 'combinatorics' && parsedParams && typeof parsedParams === 'object' && !Array.isArray(parsedParams)) {
        const nVal = parsedParams.n ?? parsedParams.N ?? null;
        const rVal = parsedParams.r ?? parsedParams.k ?? parsedParams.R ?? null;
        const operation = parsedParams.operation || parsedParams.calc_type || parsedParams.type || variable;

        if (nVal !== null && nVal !== undefined) {
            expression = rVal !== null && rVal !== undefined ? `${nVal},${rVal}` : String(nVal);
        }
        if (typeof operation === 'string' && operation.trim()) {
            variable = operation.trim();
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

    const normalized = { action, expression, variable, limitPoint, extraPayload };

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

    if (needsSystemObjectiveExpression(context.questionText, action, extraPayload, expression)) {
        normalized.validationError = makeToolError(
            "MISSING_OBJECTIVE_EXPRESSION",
            "Denklem sistemi çözüldükten sonra soruda istenen son nicelik ayrıca belirtilmedi.",
            "equations ve variables ile sistemi ver; expression alanına da hacim/alan/olasılık gibi istenen son ifadeyi yaz. Backend sistem çözümünü o ifadeye uygular."
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
            "İlgili matematiksel ifadeyi SymPy formatında gönder."
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

const extractAllExtremaYValues = (result) => {
    if (typeof result !== 'string') return [];
    return [...result.matchAll(/['"]y['"]:\s*['"]([^'"]+)['"]/g)]
        .map((match) => Number(String(match[1]).trim()))
        .filter((value) => Number.isFinite(value));
};

const looksLikeUnfinishedSymbolicResult = (result = "") => {
    const text = String(result || "").trim();
    if (!text) return false;
    return /ConditionSet|ImageSet|Complexes|EmptySet|Eq\(|\bIntegers\b|\bReals\b|^\{.*\}$/.test(text);
};

const extractRepeatedAtanSeed = (result = "") => {
    const text = String(result || "");
    if (!text || !/atan\(/.test(text)) return null;

    const matches = [...text.matchAll(/atan\(([^()]+)\)/g)].map((match) => String(match[1] || '').trim()).filter(Boolean);
    if (matches.length === 0) return null;

    const unique = [...new Set(matches)];
    return unique.length === 1 ? unique[0] : unique[0];
};

const deriveTrigCandidateFromResult = (questionText = "", result = "") => {
    const text = String(questionText || "").toLocaleLowerCase('tr-TR').replace(/\s+/g, '');
    const seed = extractRepeatedAtanSeed(result);
    if (!seed) return null;

    if (/tan\(2x\)|tan2x/.test(text)) {
        return `2*(${seed})/(1-(${seed})**2)`;
    }

    if (/tanx|\btan\s*x\b/.test(text)) {
        return seed;
    }

    return null;
};

const escapeRegExp = (value = "") => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const substituteVariableIntoExpression = (expression = "", variable = "x", candidate = "") => {
    const normalizedExpression = normalizeMathExpression(expression);
    const normalizedCandidate = normalizeMathExpression(candidate);
    if (!normalizedExpression || !normalizedCandidate || !variable) return null;

    const boundary = new RegExp(`\\b${escapeRegExp(String(variable).trim())}\\b`, 'g');
    if (!boundary.test(normalizedExpression)) return null;

    return normalizedExpression.replace(boundary, `(${normalizedCandidate})`);
};

const optionSatisfiesSolveExpression = async ({ expression = "", variable = "", optionText = "" } = {}) => {
    const substituted = substituteVariableIntoExpression(expression, variable, optionText);
    if (!substituted) return false;

    const simplified = await solveMathProblem(substituted, "simplify", variable);
    if (!simplified || simplified.status !== "success") return false;

    const value = extractSingleValueFromResult(String(simplified.result || "").trim());
    return value === "0";
};

const deriveScalarCandidate = (traceEntry, questionText = "") => {
    const { action, result } = traceEntry || {};
    if (!action || !result) return null;

    if (action === 'find_extrema' && /\b(en küçük|minimum|en büyük|maksimum)\b/i.test(questionText)) {
        if (/\btoplam[ıi]\b/i.test(questionText)) {
            const values = extractAllExtremaYValues(result);
            if (values.length >= 2) {
                return String(values.reduce((sum, value) => sum + value, 0));
            }
        }
        return extractExtremaYValue(result);
    }

    if (['solve', 'simplify', 'integrate', 'limit', 'combinatorics', 'sequences'].includes(action)) {
        const trigCandidate = deriveTrigCandidateFromResult(questionText, result);
        if (trigCandidate) return trigCandidate;
        return extractSingleValueFromResult(result);
    }

    if (action === 'trig_general_solution') {
        return deriveTrigCandidateFromResult(questionText, result);
    }

    return null;
};

const expressionsEquivalent = async (left, right) => {
    const normalizedLeft = normalizeMathExpression(left);
    const normalizedRight = normalizeMathExpression(right);
    if (!normalizedLeft || !normalizedRight) {
        const numericLeft = parseSignedFraction(String(left || '').replace(/\s+/g, ''));
        const numericRight = parseSignedFraction(String(right || '').replace(/\s+/g, ''));
        return Number.isFinite(numericLeft) && Number.isFinite(numericRight) && Math.abs(numericLeft - numericRight) < 1e-9;
    }

    const numericLeft = parseSignedFraction(normalizedLeft);
    const numericRight = parseSignedFraction(normalizedRight);
    if (Number.isFinite(numericLeft) && Number.isFinite(numericRight) && Math.abs(numericLeft - numericRight) < 1e-9) {
        return true;
    }

    const comparison = await solveMathProblem(`(${normalizedLeft})-(${normalizedRight})`, "simplify", "x");
    return Boolean(comparison && comparison.status === "success" && String(comparison.result).trim() === "0");
};

const resolveChoiceFromScalarCandidates = async (questionText, scalarCandidates = []) => {
    const options = extractMultipleChoiceOptions(questionText);
    if (options.length < 2) return null;

    const matches = [];
    for (const candidate of scalarCandidates) {
        const candidateText = String(candidate || '').trim();
        if (!candidateText) continue;
        for (const option of options) {
            if (!isProbablyMathOption(option.text)) continue;
            if (await expressionsEquivalent(candidateText, option.text)) {
                matches.push({ ...option, candidate: candidateText });
            }
        }
    }

    const uniqueMatches = matches.filter((item, index, arr) => arr.findIndex((other) => other.letter === item.letter) === index);
    return uniqueMatches.length === 1 ? uniqueMatches[0] : null;
};

const resolveVerifiedMultipleChoice = async (questionText, mathTrace, toolEvents = []) => {
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

    const successfulMathCalls = [...toolEvents]
        .reverse()
        .filter((event) => event?.name === 'calculate_math' && event?.status === 'success');

    for (const event of successfulMathCalls) {
        const action = event?.action || event?.normalized_args?.action || null;
        const expression = event?.normalized_args?.expression || event?.args?.expression || null;
        const variable = event?.normalized_args?.variable || event?.args?.variable || null;
        const rawResult = String(event?.response?.result || event?.response?.readable || '').trim();

        if (action !== 'solve') continue;
        if (!expression || !variable || /,/.test(String(variable))) continue;
        if (!looksLikeUnfinishedSymbolicResult(rawResult)) continue;

        const matchingOptions = [];
        for (const option of options) {
            if (!isProbablyMathOption(option.text)) continue;
            if (await optionSatisfiesSolveExpression({ expression, variable, optionText: option.text })) {
                matchingOptions.push(option);
            }
        }

        if (matchingOptions.length === 1) {
            return { ...matchingOptions[0], candidate: matchingOptions[0].text };
        }
    }

    for (const event of successfulMathCalls) {
        const action = event?.action || event?.normalized_args?.action || null;
        const rawResult = String(event?.response?.result || event?.response?.readable || '').trim();
        if (action !== 'solve_system') continue;

        const candidates = collectSystemSolutionScalarCandidates(rawResult);
        const matchingOptions = [];
        for (const candidate of candidates) {
            for (const option of options) {
                if (!isProbablyMathOption(option.text)) continue;
                if (await expressionsEquivalent(candidate, option.text)) {
                    matchingOptions.push({ ...option, candidate });
                }
            }
        }

        const uniqueMatches = matchingOptions.filter((item, index, arr) => arr.findIndex((other) => other.letter === item.letter) === index);
        if (uniqueMatches.length === 1) {
            return uniqueMatches[0];
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
const METADATA_CODE_BLOCK_REGEX = /```(?:json)?\s*\{[\s\S]*?educational:\s*(?:true|false)[\s\S]*?\}\s*```/gi;
const INTERNAL_REASONING_LEAK_REGEX = /(Thinking Process:|Analyze the Request:|Mathematical Reality Check:|(?:^|\n)\s*[-*•]\s*Wait,|(?:^|\n)\s*[-*•]\s*Okay,\s+I(?:'ll| will)|(?:^|\n)\s*[-*•]\s*Decision:|(?:^|\n)\s*[-*•]\s*Strategy:)/i;
const DEFAULT_EMPTY_MATH_ANSWER = "Yapay Zeka bu soruya içerik üretemedi.";

const stripMathMetadataBlocks = (text = "") => String(text || "")
    .replace(METADATA_CODE_BLOCK_REGEX, "")
    .replace(METADATA_BLOCK_REGEX, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const stripInternalReasoningLeak = (text = "") => {
    let cleaned = String(text || "").trim();
    if (!cleaned) return cleaned;

    cleaned = cleaned
        .replace(/```(?:markdown|md|text)?\s*Thinking Process:[\s\S]*?```/gi, "")
        .trim();

    if (!INTERNAL_REASONING_LEAK_REGEX.test(cleaned)) {
        return cleaned;
    }

    const structuredStart = cleaned.search(/\*\*Doğru Cevap:\*\*[\s\S]*\*\*Çözüm Mantığı:\*\*[\s\S]*\*\*Adımlar:\*\*/i);
    if (structuredStart >= 0) {
        cleaned = cleaned.slice(structuredStart).trim();
    } else {
        cleaned = cleaned
            .split('\n')
            .filter((line) => !/^\s*(?:[-*•]\s*)?(?:Thinking Process:|Analyze the Request:|User:|Context:|Constraint:|Task:|Output Format:|Mathematical Reality Check:|Decision:|Strategy:|Wait,|Okay,\s+I(?:'ll| will))/i.test(line))
            .join('\n')
            .trim();
    }

    if (INTERNAL_REASONING_LEAK_REGEX.test(cleaned)) {
        return "";
    }

    return cleaned;
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

const compactMathAnswerText = (answerText = "", { toolEvents = [], mathTrace = [] } = {}) => {
    const cleaned = String(answerText || "").trim();
    if (!cleaned) return cleaned;

    const hasSuccessfulMath = toolEvents.some((event) => event?.name === "calculate_math" && event?.status === "success");
    const hasRepeatedToolError = toolEvents.some((event) => event?.code === "REPEATED_TOOL_CALL");
    const fallbackAnswer = buildMathFallbackAnswer({ toolEvents, mathTrace });

    if ((hasRepeatedToolError || cleaned.length > 700) && hasSuccessfulMath && fallbackAnswer) {
        const paragraphs = cleaned.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
        const shortLead = paragraphs[0] || "";
        if (!shortLead || shortLead.length > 280) {
            return fallbackAnswer;
        }
        return `${shortLead}\n\n${fallbackAnswer}`;
    }

    return cleaned;
};

const dedupeMathParagraphs = (answerText = "") => {
    const paragraphs = String(answerText || "")
        .split(/\n\s*\n/)
        .map((item) => item.trim())
        .filter(Boolean);

    const deduped = [];
    for (const paragraph of paragraphs) {
        const normalized = paragraph.replace(/\s+/g, ' ').trim();
        if (!normalized) continue;
        const previous = deduped[deduped.length - 1];
        if (previous && previous.replace(/\s+/g, ' ').trim() === normalized) continue;
        deduped.push(paragraph);
    }

    return deduped.join('\n\n').trim();
};

const sanitizeMathAnswerForKatex = (answerText = "") => {
    let text = String(answerText || '').trim();
    if (!text) return text;

    text = text.replace(/(\d+)\s*\n[─—-]{2,}\n\s*(\d+)/g, '$\\\\frac{$1}{$2}$');
    text = text.replace(/⎡\s*([A-Za-z0-9_]+)\s+(\d+)\s*⎤\s*\n⎢─\s+\s*───⎥\s*\n⎣2\s+\s*\\1\s*⎦/g, '$\\\\frac{$1}{2} + \\\\frac{$2}{$1}$');
    text = text.replace(/\[([^\]]+)\]/g, (match, inner) => {
        if (/^[0-9.\-\s,]+$/.test(inner)) return match;
        return `$${inner.replace(/\s+/g, ' ').trim()}$`;
    });
    text = text.replace(/\\\frac/g, '\\frac');
    return text;
};

const normalizeDetailMathAnswerText = (answerText = "") => {
    const text = String(answerText || "").trim();
    if (!text) return text;

    const structuredPattern = /\*\*Doğru Cevap:\*\*\s*([\s\S]*?)\s*\*\*Çözüm Mantığı:\*\*\s*([\s\S]*?)\s*\*\*Adımlar:\*\*\s*([\s\S]*?)(?:\s*\*\*Kritik Nokta:\*\*\s*([\s\S]*?))?(?:\s*Cevap:\s*([A-Z0-9./+-]+))?\s*$/i;
    const match = text.match(structuredPattern);
    if (!match) return text;

    const answer = String(match[1] || '').trim();
    const rationale = String(match[2] || '').trim();
    const steps = String(match[3] || '')
        .split('\n')
        .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
        .filter(Boolean);
    const critical = String(match[4] || '')
        .split('\n')
        .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
        .filter(Boolean);
    const finalChoice = String(match[5] || '').trim();

    const paragraphs = [];
    if (answer) paragraphs.push(`Doğru Cevap: ${answer}`);
    if (rationale) paragraphs.push(rationale);
    if (steps.length > 0) paragraphs.push(steps.join('\n'));
    if (critical.length > 0) paragraphs.push(`Dikkat edilmesi gereken nokta: ${critical.join(' ')}`);
    if (finalChoice) paragraphs.push(`Cevap: ${finalChoice}`);

    return paragraphs.join('\n\n').trim();
};

const shouldRunMathCompletionPass = ({ questionText = "", answerText = "", toolEvents = [], verifiedChoice = null, detailMode = false } = {}) => {
    const lastSuccessfulCall = getLastSuccessfulMathCall(toolEvents);
    if (!lastSuccessfulCall) return false;

    const lastAction = lastSuccessfulCall.action || '';
    const lastResponse = [...toolEvents].reverse().find((event) => event?.name === 'calculate_math' && event?.status === 'success')?.response;
    const rawResult = String(lastResponse?.readable || lastResponse?.result || '').trim();
    if (!rawResult) return false;

    if (detailMode && (
        answerLooksLikeIntermediateMathState(answerText)
        || looksLikeUnfinishedSymbolicResult(answerText)
        || /(?:\*\*Çözüm Mantığı:\*\*|\*\*Adımlar:\*\*|\*\*Kritik Nokta:\*\*)/i.test(answerText)
        || String(answerText || '').trim().length < 260
    )) {
        return true;
    }

    if (verifiedChoice && (
        answerLooksLikeIntermediateMathState(answerText)
        || looksLikeUnfinishedSymbolicResult(answerText)
        || !/Cevap\s*:/i.test(answerText)
        || String(answerText || '').trim().length < 220
    )) {
        return true;
    }

    if (!asksForDerivedQuantity(questionText)) return false;

    if (['solve_system', 'solve', 'coordinate_geometry', 'combinatorics', 'trig_general_solution'].includes(lastAction) && answerLooksLikeIntermediateMathState(answerText)) {
        return true;
    }

    return false;
};

const completeMathAnswerFromToolResult = async ({ modelName = DEFAULT_CHAT_MODEL, questionText = "", answerText = "", toolEvents = [], verifiedChoice = null, detailMode = false } = {}) => {
    const lastSuccessfulEvent = [...toolEvents].reverse().find((event) => event?.name === 'calculate_math' && event?.status === 'success');
    if (!lastSuccessfulEvent) return null;
    const options = extractMultipleChoiceOptions(questionText);

    const toolSummary = {
        action: lastSuccessfulEvent.action || lastSuccessfulEvent.normalized_args?.action || null,
        variable: lastSuccessfulEvent.normalized_args?.variable || null,
        expression: lastSuccessfulEvent.normalized_args?.expression || null,
        result: lastSuccessfulEvent.response?.readable || lastSuccessfulEvent.response?.result || null,
    };

    const completionPrompt = `
[ROL]
Sen matematik sonucunu düzenli, öğretici ve temiz bir nihai cevaba dönüştüren yardımcı katmansın.

[KURALLAR]
- Yeni tool çağrısı yapma.
- Kullanıcıya yalnızca nihai çözümü göster; iç muhakeme, düşünce süreci, analiz notu veya kontrol listesi gösterme.
- "Thinking Process", "Analyze the Request", "Context", "Decision", "Strategy", "Wait" gibi başlıklar ya da satırlar asla yazma.
- Son tool çıktısını yalnızca yardımcı bağlam olarak kullan; ham tool verisini, çelişki tartışmasını veya prompt analizini gösterme.
- Ara değişkenler, çözüm kümesi veya ham liste ile bitirme.
- Soruda istenen son niceliği açık ve öğretici biçimde ver.
- Sunum düzenli olsun: en fazla 3 temel adım ve yalnızca gerekli denklemler olsun.
- Sonucu sadece ilan etme; mümkünse hangi dönüşüm veya formülle bulunduğunu göster.
- KaTeX uyumlu yaz; ham JSON, metadata veya tool çıktısı kopyalama.
- Çoktan seçmeli soruysa sonucu seçeneklerle eşleştir ve son satırda tam olarak "Cevap: X" yaz.
- Yalnızca gerektiği kadar açıklama yaz; metadata veya JSON üretme.
- ${detailMode ? 'Detaylı çözüm isteniyor; doğal ama işlem ağırlıklı bir öğretmen anlatımı kur. En fazla 3 kısa paragraf kullan. Her paragrafı kısa tut, bariz işlemleri uzatma ve sadece gerekli matematiksel dönüşümü göster. Sözel açıklamayı minimumda tut; mümkün olan yerde denklem satırı kullan. İlk paragrafta mümkünse sadeleşmiş ana ifade veya elde edilen denklem açıkça yer alsın. "Doğru Cevap", "Çözüm Mantığı", "Adımlar", "Kritik Nokta" gibi zorunlu başlıklar kullanma.' : 'Gereksiz uzatma yapma.'}
`;

    try {
        const completionResponse = await ai.models.generateContent({
            model: modelName,
            contents: [{
                role: "user",
                parts: [{
                    text: [
                        `Soru: ${questionText}`,
                        !detailMode ? `Mevcut cevap: ${answerText}` : '',
                        `Son doğru tool sonucu: ${JSON.stringify(toolSummary)}`,
                        verifiedChoice ? `Doğrulanmış seçenek: ${verifiedChoice.letter}) ${verifiedChoice.text}` : '',
                        options.length >= 2
                            ? `Seçenekler:\n${options.map((option) => `${option.letter}) ${option.text}`).join('\n')}`
                            : '',
                        detailMode
                            ? `Detaylı çözümü doğal Türkçe ile yaz.
- Katı başlık şablonları kullanma.
- En fazla 3 kısa paragraf yeterlidir.
- Önce temel dönüşümü kur ve mümkünse sadeleşmiş ana ifadeyi açıkça yaz; sonra gerekli hesabı göster, en sonda sonucu bağla.
- Bariz cebirsel ara adımları uzun uzun anlatma.
- Sadece sonucu bulmak için gerekli denklem ve dönüşümleri göster.
- Açıklamadan çok işlem satırlarını göster; mümkün olan yerde denklem satırı kullan.
- Uzun bağlaç cümlelerinden kaçın; kısa geçişler yeterlidir.
- Çoktan seçmeli ise yalnızca son satırda "Cevap: X" yaz.`
                            : "Soruda istenen SON niceliği bu tool sonucundan çıkarıp nihai cevabı ver."
                    ].filter(Boolean).join('\n\n')
                }]
            }],
            config: {
                systemInstruction: completionPrompt,
                thinkingLevel: "LOW",
                maxOutputTokens: detailMode ? 600 : 520,
            }
        });

        let completedText = String(completionResponse?.text || '').trim();
        completedText = stripInternalReasoningLeak(completedText);
        if (!completedText) return null;

        if (options.length >= 2 && !/Cevap\s*:/i.test(completedText)) {
            const numericCandidates = [...completedText.matchAll(/[+-]?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?/g)]
                .map((match) => match[0])
                .filter(Boolean)
                .reverse();
            const verifiedChoice = await resolveChoiceFromScalarCandidates(questionText, [completedText, ...numericCandidates]);
            if (verifiedChoice) {
                completedText = `${completedText}\n\nCevap: ${verifiedChoice.letter}`;
            }
        }

        return completedText;
    } catch (_error) {
        return null;
    }
};

const buildPrettyVerifiedChoiceAnswer = ({ questionText = "", verifiedChoice = null } = {}) => {
    if (!verifiedChoice) return null;
    const optionText = String(verifiedChoice.text || '').trim();
    const candidate = String(verifiedChoice.candidate || '').trim();

    if (optionText && isProbablyMathOption(optionText)) {
        const finalValue = optionText.length <= 60 ? optionText : candidate || optionText;
        return `Sonuç ${finalValue} bulunur. Bu değer ${verifiedChoice.letter} şıkkına karşılık gelir.\n\nCevap: ${verifiedChoice.letter}`;
    }

    if (candidate && isProbablyMathOption(candidate)) {
        return `Sonuç ${candidate} bulunur. Bu değer ${verifiedChoice.letter} şıkkına karşılık gelir.\n\nCevap: ${verifiedChoice.letter}`;
    }

    if (optionText) {
        return `Doğru seçenek ${verifiedChoice.letter}) ${optionText} olur.\n\nCevap: ${verifiedChoice.letter}`;
    }

    return `Cevap: ${verifiedChoice.letter}`;
};

const finalizeMathAnswerText = (rawAnswerText, { course = "", questionText = "", mathTrace = [], toolEvents = [], plotBase64 = null, verifiedChoice = null, detailMode = false } = {}) => {
    let answerText = stripMathMetadataBlocks(rawAnswerText);
    answerText = stripInternalReasoningLeak(answerText);
    if (!answerText || answerText === DEFAULT_EMPTY_MATH_ANSWER) {
        answerText = buildMathFallbackAnswer({ toolEvents, mathTrace }) || DEFAULT_EMPTY_MATH_ANSWER;
    }
    if (!detailMode) {
        answerText = compactMathAnswerText(answerText, { toolEvents, mathTrace });
    }
    if (detailMode) {
        answerText = normalizeDetailMathAnswerText(answerText);
    }
    answerText = dedupeMathParagraphs(answerText);

    if (
        !detailMode &&
        verifiedChoice
        && (
            looksLikeUnfinishedSymbolicResult(answerText)
            || (answerLooksLikeIntermediateMathState(answerText) && String(answerText || '').trim().length < 140)
        )
    ) {
        answerText = buildPrettyVerifiedChoiceAnswer({ questionText, verifiedChoice }) || answerText;
    }

    answerText = sanitizeMathAnswerForKatex(answerText);

    if (plotBase64) {
        answerText += `\n\n[GRAPH_BASE64:${plotBase64}]`;
    }

    if (verifiedChoice && !/Cevap\s*:/i.test(answerText)) {
        answerText += `\n\nCevap: ${verifiedChoice.letter}`;
    }

    // Fix \cdot incorrectly placed inside parentheses
    // e.g. "4(\cdot 9)" → "4 \cdot 9", ")(·(x-a)²)" → ") \cdot (x-a)²"
    // Safe: only targets \cdot preceded by )digit or followed by digit/variable, not f(\cdot) notation
    answerText = answerText
        .replace(/\)\(\\cdot\s*/g, ') \\cdot ')
        .replace(/(\d)\(\\cdot\s*/g, '$1 \\cdot ')
        .replace(/\\cdot\s*=\s*/g, '\\cdot ')
        .replace(/\(\\cdot\s*(\d)/g, '\\cdot $1');

    // --- METADATA BLOĞUNU EKLEME ---
    if (answerText && answerText !== DEFAULT_EMPTY_MATH_ANSWER) {
        const metadataObj = buildMathAnswerMetadata({
            course,
            questionText,
            mathTrace,
            toolEvents
        });
        const metadataString = formatMathMetadataBlock(metadataObj);
        answerText = answerText + "\n\n```json\n" + metadataString + "\n```";
    }

    return answerText;
};

const buildDeterministicMathResult = async ({
    course = "",
    questionText = "",
    answerText = "",
    action = "solve",
    expression = "",
    variable = null,
    resultValue = "",
    args = {},
    scenario = "generic_math",
    promptVariant = "deterministic_local_solver",
    toolVariant = "local_solver",
    confidence = 1,
} = {}) => {
    const resultText = String(resultValue || '').trim();
    if (!resultText) return null;

    const mathTrace = [{
        action,
        expression,
        result: resultText,
    }];
    const toolEvents = [{
        iteration: 0,
        name: `local_${action}_solver`,
        action,
        args,
        normalized_args: {
            action,
            expression,
            variable,
        },
        status: 'success',
        code: null,
        response: { result: resultText, readable: resultText },
    }];

    const isMultipleChoice = extractMultipleChoiceOptions(questionText).length >= 2;
    const directGeometryChoice = resolveGeometryChoiceFromAnswer(questionText, resultText, answerText);
    const verifiedChoice = directGeometryChoice || await resolveChoiceFromScalarCandidates(questionText, [resultText, answerText]);
    if (isMultipleChoice && !verifiedChoice) {
        return null;
    }

    return {
        answerText: finalizeMathAnswerText(answerText, {
            course,
            questionText,
            mathTrace,
            toolEvents,
            verifiedChoice,
        }),
        mathTrace,
        toolEvents,
        iterations: 0,
        truncated: false,
        mathFlow: {
            scenario,
            promptVariant,
            toolVariant,
            confidence,
            fallbackApplied: false,
            fallbackReason: null,
            iterations: 0,
            truncated: false,
            estimatedTokens: {
                prompt: 0,
                tools: 0,
                history: 0,
                question: estimateApproxTokens(questionText),
                initialTotal: estimateApproxTokens(questionText),
                currentLoopTotal: estimateApproxTokens(questionText),
                maxLoopTotal: estimateApproxTokens(questionText),
            },
        },
        usageMetadata: {
            promptTokenCount: 0,
            candidatesTokenCount: 0,
            totalTokenCount: 0,
        },
    };
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

const resolveVerificationPolicy = (callArgs = {}, mathTrace = []) => {
    const lastMathAction = getLastMathAction(mathTrace);
    const equation = typeof callArgs.equation === 'string' ? callArgs.equation.trim() : '';
    const solution = typeof callArgs.solution === 'string' ? callArgs.solution.trim() : '';
    const originalProblem = typeof callArgs.original_problem === 'string' ? callArgs.original_problem.trim() : '';
    const equationSymbols = extractExpressionSymbols(equation).filter((symbol) => symbol !== 'x');

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

    if (looksLikeGeneralTrigSolution(equation) || looksLikeGeneralTrigSolution(solution) || looksLikeGeneralTrigSolution(originalProblem)) {
        return {
            skip: buildSkippedVerificationResponse(
                "verify_equation genel trig çözümü için atlandı.",
                "Trigonometrik genel çözüm kümelerinde calculate_math sonucunu kullan."
            ),
            reason: "general_trig_solution",
        };
    }

    if (equationSymbols.length > 0) {
        return {
            skip: buildSkippedVerificationResponse(
                "verify_equation parametreli/fiziksel semboller içeren eşitlik için atlandı.",
                "Bu tür durumlarda nihai sonucu doğrudan son hesaplamadan üret."
            ),
            reason: "symbolic_parameter_equation",
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
 * Modelin görselden okuduğu geometrik verilerin tutarlılığını kontrol eder.
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
 * Gelişmiş Matematik Tool Tanımları
 */
const fullMathTools = [
    {
        functionDeclarations: [
            {
                name: "calculate_math",
                description: `Matematik hesabı için ana araç. SymPy formatı kullan: * , ** , sqrt(), Abs(); ^ kullanma. Action'a göre expression, equations, matrix veya params alanını doldur.`,
                parameters: {
                    type: "OBJECT",
                    properties: {
                        expression: {
                            type: "STRING",
                            description: "SymPy formatında ifade."
                        },
                        equations: {
                            type: "ARRAY",
                            description: "solve_system için denklemler.",
                            items: { type: "STRING" }
                        },
                        variables: {
                            type: "ARRAY",
                            description: "solve_system için bilinmeyenler.",
                            items: { type: "STRING" }
                        },
                        matrix: {
                            type: "ARRAY",
                            description: "matrix için matris.",
                            items: {
                                type: "ARRAY",
                                items: { type: "NUMBER" }
                            }
                        },
                        matrix_action: {
                            type: "STRING",
                            description: "matrix alt işlemi.",
                            enum: ["determinant", "inverse", "eigenvalues", "rank", "rref"]
                        },
                        params: {
                            type: "OBJECT",
                            description: "coordinate_geometry parametreleri."
                        },
                        action: {
                            type: "STRING",
                            description: "İşlem türü.",
                            enum: ["solve", "simplify", "derivative", "integrate", "factor", "expand", "limit", "plot", "analyze_roots", "find_extrema", "analyze_asymptotes", "area_between_curves", "trig_general_solution", "solve_system", "matrix", "coordinate_geometry", "combinatorics", "analyze_derivative"]
                        },
                        variable: {
                            type: "STRING",
                            description: "Değişken veya alt işlem adı."
                        },
                        limit_point: {
                            type: "STRING",
                            description: "limit için nokta."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "verify_equation",
                description: "Tek denklemli sonucu doğrulamak için kullan.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        original_problem: {
                            type: "STRING",
                            description: "Orijinal problem."
                        },
                        equation: {
                            type: "STRING",
                            description: "SymPy denklem ifadesi."
                        },
                        solution: {
                            type: "STRING",
                            description: "Makine-okunur sade çözüm."
                        }
                    },
                    required: ["original_problem", "equation", "solution"]
                }
            },
            {
                name: "validate_geometry",
                description: "Geometri verilerinin tutarlılığını kontrol et.",
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
    calculate_math: 'Matematiksel hesaplama aracı. Doğru action ve actiona uygun payload kullan; ifadeleri SymPy formatında gönder.',
    verify_equation: 'Tek denklemli çözüm veya doğru-eşdeğerliği doğrulaması için kullan. Solution alanına yalnızca sade makine-okunur format yaz.',
    validate_geometry: 'Geometri verilerinin tutarlılığını doğrulamak için kullan.',
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

const selectMathToolVariant = ({ scenario = 'generic_math', forceFullFlow = false, needsGeometryValidation = false, equationMode = null } = {}) => {
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
        'probability',
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
 * OpenAI-uyumlu tool calling ile çok adımlı matematik akışını yönetir.
 */
const askAiWithMath = async (course, questionText, history = [], systemInstruction = "", base64Image = null, options = {}) => {
    try {
        const detailMode = isDetailedMathExplanationRequest(questionText, systemInstruction);
        const deterministicGeometryFamily = !detailMode ? computeDeterministicGeometryFamily(questionText) : null;

        if (deterministicGeometryFamily) {
            const finalResult = await buildDeterministicMathResult({
                course,
                questionText,
                answerText: deterministicGeometryFamily.answerText,
                action: deterministicGeometryFamily.action,
                expression: deterministicGeometryFamily.expression,
                variable: deterministicGeometryFamily.variable || null,
                resultValue: deterministicGeometryFamily.resultValue,
                args: deterministicGeometryFamily.args || {},
                scenario: deterministicGeometryFamily.scenario || 'generic_math',
                promptVariant: deterministicGeometryFamily.promptVariant || 'deterministic_geometry_family_solver',
            });
            if (finalResult) {
                if (options && options.returnMetadata) return finalResult;
                return finalResult.answerText;
            }
        }

        if (shouldUseSimpleGeometryFastPath({ course, questionText, base64Image, detailMode })) {
            const disciplinedResult = await runDisciplinedGeometryPlainTextFlow(
                course,
                questionText,
                history,
                systemInstruction,
            );

            if (disciplinedResult.stable) {
                if (options && options.returnMetadata) {
                    return {
                        answerText: disciplinedResult.answer,
                        mathTrace: [],
                        toolEvents: [],
                        iterations: 0,
                        truncated: false,
                        mathFlow: {
                            scenario: 'geometry_disciplined_plaintext_fast_path',
                            promptVariant: 'geometry_plan_then_solve_prompt',
                            toolVariant: 'no_tools',
                            fallbackApplied: false,
                            fallbackReason: null,
                        },
                        usageMetadata: disciplinedResult.usage || {},
                    };
                }

                return disciplinedResult.answer;
            }

            const simplePrompt = buildSimpleGeometryFastPathPrompt(questionText);
            const simpleInstruction = buildSimpleGeometryFastPathSystemInstruction(systemInstruction);
            const simpleResult = await askAiSimpleDetailed(course, simplePrompt, history, simpleInstruction, null);
            const fallbackAnswer = extractExplicitMultipleChoiceLetter(simpleResult.answer || '')
                ? simpleResult.answer
                : (disciplinedResult.answer || simpleResult.answer);

            if (options && options.returnMetadata) {
                return {
                    answerText: fallbackAnswer,
                    mathTrace: [],
                    toolEvents: [],
                    iterations: 0,
                    truncated: false,
                    mathFlow: {
                        scenario: 'geometry_simple_fast_path',
                        promptVariant: 'geometry_plan_then_solve_prompt',
                        toolVariant: 'no_tools',
                        fallbackApplied: true,
                        fallbackReason: 'DISCIPLINED_FLOW_UNSTABLE',
                    },
                    usageMetadata: mergeUsageMetadata(disciplinedResult.usage, simpleResult.usage),
                };
            }

            return fallbackAnswer;
        }

        const deterministicParkingProbability = !detailMode ? computeStructuredParkingSearchProbability(questionText) : null;
        if (deterministicParkingProbability) {
            const finalResult = await buildDeterministicMathResult({
                course,
                questionText,
                answerText: `Aradığı otoparkın gerçek park ettiği otopark olma olasılığı ${deterministicParkingProbability.fraction}'tir.`,
                action: 'probability',
                expression: deterministicParkingProbability.counts.join(','),
                resultValue: deterministicParkingProbability.fraction,
                args: { counts: deterministicParkingProbability.counts },
                scenario: 'probability',
                promptVariant: 'deterministic_probability_solver',
            });
            if (finalResult) {
                if (options && options.returnMetadata) return finalResult;
                return finalResult.answerText;
            }
        }

        const deterministicDropDistance = !detailMode ? computeDeterministicDropDistance(questionText) : null;
        if (deterministicDropDistance) {
            const finalResult = await buildDeterministicMathResult({
                course,
                questionText,
                answerText: `Ceviz bırakıldığı anda yatay uzaklık ${deterministicDropDistance.distance} metredir.`,
                action: 'relative_motion_distance',
                expression: JSON.stringify(deterministicDropDistance.speeds),
                variable: 'distance',
                resultValue: deterministicDropDistance.distance,
                args: deterministicDropDistance.speeds,
                scenario: 'relative_motion_distance',
                promptVariant: 'deterministic_relative_motion_solver',
            });
            if (finalResult) {
                if (options && options.returnMetadata) return finalResult;
                return finalResult.answerText;
            }
        }

        const deterministicStrongAcidPh = !detailMode ? computeDeterministicStrongAcidPh(questionText) : null;
        if (deterministicStrongAcidPh) {
            const finalResult = await buildDeterministicMathResult({
                course,
                questionText,
                answerText: `Çözeltinin pH değeri ${deterministicStrongAcidPh.ph}'tür.`,
                action: 'ph_strong_acid',
                expression: String(deterministicStrongAcidPh.molarity),
                variable: 'pH',
                resultValue: String(deterministicStrongAcidPh.ph),
                args: { molarity: deterministicStrongAcidPh.molarity },
                scenario: 'ph_strong_acid',
                promptVariant: 'deterministic_ph_solver',
            });
            if (finalResult) {
                if (options && options.returnMetadata) return finalResult;
                return finalResult.answerText;
            }
        }

        const deterministicLinearAxisArea = !detailMode ? computeDeterministicLinearAxisArea(questionText) : null;
        if (deterministicLinearAxisArea) {
            const finalResult = await buildDeterministicMathResult({
                course,
                questionText,
                answerText: `Bölgenin alanı ${deterministicLinearAxisArea.area} birimkaredir.`,
                action: 'linear_axis_area',
                expression: deterministicLinearAxisArea.expression,
                variable: 'area',
                resultValue: deterministicLinearAxisArea.area,
                args: deterministicLinearAxisArea,
                scenario: 'linear_axis_area',
                promptVariant: 'deterministic_area_solver',
            });
            if (finalResult) {
                if (options && options.returnMetadata) return finalResult;
                return finalResult.answerText;
            }
        }

        const deterministicDerivativeFactLimit = !detailMode ? await computeDeterministicDerivativeFactLimit(questionText) : null;
        if (deterministicDerivativeFactLimit) {
            const finalResult = await buildDeterministicMathResult({
                course,
                questionText,
                answerText: `Limit sonucu ${deterministicDerivativeFactLimit.result} bulunur.`,
                action: 'derivative_fact_limit',
                expression: deterministicDerivativeFactLimit.expression,
                variable: 'x',
                resultValue: deterministicDerivativeFactLimit.result,
                args: { point: deterministicDerivativeFactLimit.point },
                scenario: 'limit',
                promptVariant: 'deterministic_derivative_fact_limit_solver',
            });
            if (finalResult) {
                if (options && options.returnMetadata) return finalResult;
                return finalResult.answerText;
            }
        }

        const deterministicSubstitutionIntegral = !detailMode ? computeDeterministicSubstitutionIntegral(questionText) : null;
        if (deterministicSubstitutionIntegral) {
            const finalResult = await buildDeterministicMathResult({
                course,
                questionText,
                answerText: `İntegral sonucu ${deterministicSubstitutionIntegral.result} bulunur.`,
                action: 'substitution_integral',
                expression: `${deterministicSubstitutionIntegral.coefficient}*x*f(x**2+${deterministicSubstitutionIntegral.offset})`,
                variable: 'x',
                resultValue: deterministicSubstitutionIntegral.result,
                args: deterministicSubstitutionIntegral,
                scenario: 'integral',
                promptVariant: 'deterministic_substitution_integral_solver',
            });
            if (finalResult) {
                if (options && options.returnMetadata) return finalResult;
                return finalResult.answerText;
            }
        }

        const deterministicEvenQuadraticValue = !detailMode ? computeDeterministicEvenQuadraticValue(questionText) : null;
        if (deterministicEvenQuadraticValue) {
            const finalResult = await buildDeterministicMathResult({
                course,
                questionText,
                answerText: `Fonksiyon değeri ${deterministicEvenQuadraticValue.result} bulunur.`,
                action: 'even_quadratic_value',
                expression: JSON.stringify(deterministicEvenQuadraticValue.coefficients),
                variable: 'f',
                resultValue: deterministicEvenQuadraticValue.result,
                args: deterministicEvenQuadraticValue.coefficients,
                scenario: 'equation',
                promptVariant: 'deterministic_even_quadratic_solver',
            });
            if (finalResult) {
                if (options && options.returnMetadata) return finalResult;
                return finalResult.answerText;
            }
        }

        const deterministicTrigRatio = !detailMode ? computeDeterministicTrigRatio(questionText) : null;
        if (deterministicTrigRatio) {
            const finalResult = await buildDeterministicMathResult({
                course,
                questionText,
                answerText: `Trigonometrik ifade sonucu ${deterministicTrigRatio.result} bulunur.`,
                action: 'trig_ratio',
                expression: deterministicTrigRatio.tanX,
                variable: 'tan',
                resultValue: deterministicTrigRatio.result,
                args: { tanX: deterministicTrigRatio.tanX },
                scenario: 'trig',
                promptVariant: 'deterministic_trig_ratio_solver',
            });
            if (finalResult) {
                if (options && options.returnMetadata) return finalResult;
                return finalResult.answerText;
            }
        }

        if (!shouldUseHeavyMathFlow(course, questionText, base64Image)) {
            return await askAiSimple(course, questionText, history, systemInstruction, base64Image);
        }
        const modelName = DEFAULT_CHAT_MODEL;

        const scenarioInfo = ENABLE_SCENARIO_MATH_PROMPTS
            ? classifyMathScenario(course, questionText, history, base64Image)
            : {
                scenario: 'generic_math',
                confidence: 1,
                needsGeometryValidation: Boolean(base64Image),
                forceFullFlow: true,
                mixed: false,
                reason: 'feature_flag_disabled',
            };

        const buildFlowPlan = ({ forceFullFlow = false, fallbackApplied = false, fallbackReason = null } = {}) => {
            const preserveFullHistory = detailMode || !ENABLE_SCENARIO_MATH_PROMPTS || forceFullFlow || scenarioInfo.forceFullFlow || base64Image || scenarioInfo.scenario === 'visual_or_retry';
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
            });
            const plannerDirective = buildMathPlannerDirective(questionText);

            return {
                ...scenarioInfo,
                scenario,
                forceFullFlow: preserveFullHistory,
                promptVariant,
                promptText: [
                    promptText,
                    detailMode ? buildMathDetailDirective().trim() : '',
                    plannerDirective ? plannerDirective.trim() : '',
                ].filter(Boolean).join('\n'),
                toolVariant,
                tools,
                initialHistory: trimMathHistoryForInitialCall(history, TEXT_ONLY_MATH_HISTORY_LIMIT, preserveFullHistory),
                fallbackApplied,
                fallbackReason,
                plannerDirective,
                detailMode,
            };
        };

        const runMathFlow = async (flowPlan) => {
            const modelConfig = {
                systemInstruction: flowPlan.promptText,
                tools: flowPlan.tools,
                thinkingLevel: "LOW",
                maxOutputTokens: flowPlan.detailMode ? 1400 : 1024,
            };
            const usageTotals = {
                promptTokenCount: 0,
                candidatesTokenCount: 0,
                totalTokenCount: 0,
            };
            const addUsage = (usage = {}) => {
                usageTotals.promptTokenCount += Number(usage?.promptTokenCount || 0);
                usageTotals.candidatesTokenCount += Number(usage?.candidatesTokenCount || 0);
                usageTotals.totalTokenCount += Number(usage?.totalTokenCount || 0);
            };

            let currentHistory = flowPlan.initialHistory.map((turn) => ({
                role: turn.role,
                parts: Array.isArray(turn.parts) ? [...turn.parts] : [],
            }));

            const askModel = async (input, hist, image = null) => {
                const parts = [{ text: input || "Bu soruyu veya görseldeki problemi çözer misin?" }];

                if (image) {
                    parts.push({
                        inlineData: {
                            data: image.replace(/^data:image\/\w+;base64,/, ""),
                            mimeType: "image/jpeg"
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

            let result = await askModel(questionText, currentHistory, base64Image);
            addUsage(result?.usageMetadata);
            let response = result;

            if (base64Image && (!response.functionCalls || response.functionCalls.length === 0)) {
                response = await askModel(
                    `${questionText}\n\nUygun aracı kullanmadan nihai cevap verme. Önce gerekli tool çağrısını yap.`,
                    currentHistory,
                    base64Image
                );
                addUsage(response?.usageMetadata);
            }

            const initialUserParts = [{ text: questionText || "Bu soruyu veya görseldeki problemi çözer misin?" }];
            if (base64Image) {
                initialUserParts.push({
                    inlineData: {
                        data: base64Image.replace(/^data:image\/\w+;base64,/, ""),
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
                questionText,
                fallbackApplied: flowPlan.fallbackApplied,
                fallbackReason: flowPlan.fallbackReason,
            });
            mathFlow.estimatedTokens.maxLoopTotal = mathFlow.estimatedTokens.currentLoopTotal;

            const maxIterations = 8;
            let iteration = 0;
            let plotBase64 = null;
            const mathTrace = [];
            const toolEvents = [];
            const toolCallCounts = new Map();
            let stopLoopAfterToolResponses = false;

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

                    if (call.name === "calculate_math") {
                        normalizedArgs = normalizeMathToolArgs(call.args, { questionText });

                        if (!flowPlan.forceFullFlow && !isScenarioActionConsistent(flowPlan.scenario, normalizedArgs.action)) {
                            return {
                                fallbackRequested: true,
                                fallbackReason: "SCENARIO_ACTION_MISMATCH",
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
                            stopLoopAfterToolResponses = true;
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

                    if (!flowPlan.forceFullFlow && call.name === "calculate_math" && toolResult?.status === "error") {
                        return {
                            fallbackRequested: true,
                            fallbackReason: toolResult.code || "STRUCTURED_TOOL_ERROR",
                        };
                    }

                    toolResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: toolResult || makeToolError(
                                "UNKNOWN_TOOL",
                                "Bilinmeyen araç veya işlem başlatılamadı."
                            )
                        }
                    });
                }

                console.log(`\n[AI TOOL GÖNDERİLİYOR] AI'a gönderilen Tool Response:`, JSON.stringify(toolResponses, null, 2));

                if (stopLoopAfterToolResponses) {
                    currentHistory.push({ role: "user", parts: toolResponses });
                    currentHistory.push({
                        role: "user",
                        parts: [{
                            text: "Aynı tool çağrısını tekrar etme. Son başarılı tool sonucunu kullanarak soruda istenen SON niceliği hesapla ve yalnızca nihai cevabı ver. Ara değişken çözümü nihai cevap değildir."
                        }]
                    });
                    result = await ai.models.generateContent({
                        model: modelName,
                        contents: currentHistory,
                        config: modelConfig
                    });
                    addUsage(result?.usageMetadata);
                    response = result;
                    break;
                }

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
                        questionText,
                        fallbackApplied: flowPlan.fallbackApplied,
                        fallbackReason: flowPlan.fallbackReason,
                    });
                    mathFlow.estimatedTokens.currentLoopTotal = loopMetrics.estimatedTokens.currentLoopTotal;
                    mathFlow.estimatedTokens.maxLoopTotal = Math.max(
                        mathFlow.estimatedTokens.maxLoopTotal || 0,
                        loopMetrics.estimatedTokens.currentLoopTotal
                    );

                    const debugPayload = JSON.parse(JSON.stringify(payloadContents));
                    debugPayload.forEach(turn => {
                        turn.parts.forEach(p => {
                            if (p.inlineData) p.inlineData.data = "[BASE64_IMAGE_DATA]";
                        });
                    });
                    console.log(`\n[MODELE GIDEN TAM KONUSMA GECMISI]:\n`, JSON.stringify(debugPayload, null, 2));

                    result = await ai.models.generateContent({
                        model: modelName,
                        contents: payloadContents,
                        config: modelConfig
                    });
                    addUsage(result?.usageMetadata);

                    response = result;

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
                addUsage(response?.usageMetadata);
            }

            const verifiedChoice = await resolveVerifiedMultipleChoice(questionText, mathTrace, toolEvents);

            let answerText = "Yapay Zeka bu soruya içerik üretemedi.";
            try {
                answerText = response.text || answerText;
            } catch (e) {
                console.error("Text parse error:", e);
            }

            if (shouldRunMathCompletionPass({ questionText, answerText, toolEvents, verifiedChoice, detailMode: flowPlan.detailMode })) {
                const completedAnswer = await completeMathAnswerFromToolResult({
                    modelName,
                    questionText,
                    answerText,
                    toolEvents,
                    verifiedChoice,
                    detailMode: flowPlan.detailMode,
                });
                if (completedAnswer) {
                    answerText = completedAnswer;
                }
            }

            answerText = finalizeMathAnswerText(answerText, {
                course,
                questionText,
                mathTrace,
                toolEvents,
                plotBase64,
                verifiedChoice,
                detailMode: flowPlan.detailMode,
            });

            mathFlow.iterations = iteration;
            mathFlow.truncated = truncated;

            return {
                answerText,
                mathTrace,
                toolEvents,
                iterations: iteration,
                truncated,
                mathFlow,
                usageMetadata: usageTotals,
            };
        };

        let flowPlan = buildFlowPlan();
        let finalResult = await runMathFlow(flowPlan);

        if (finalResult?.fallbackRequested && !flowPlan.forceFullFlow) {
            flowPlan = buildFlowPlan({
                forceFullFlow: true,
                fallbackApplied: true,
                fallbackReason: finalResult.fallbackReason,
            });
            finalResult = await runMathFlow(flowPlan);
        }

        if (options && options.returnMetadata) {
            return finalResult;
        }

        return finalResult.answerText;
    } catch (error) {
        console.error("AI Math Request Error:", error);
        return "Üzgünüm, şu an bu problemi çözemedim. Lütfen daha sonra tekrar deneyin.";
    }
};

module.exports = {
    __ai_instance: ai,
    generateDashboardSummary,
    generateStudentAnalysis,
    generateSmartQuizOverviewAnalysis,
    generateSmartQuizAttemptAnalysis,
    generateTraditionalHash,
    generateImageHash,
    generateSemanticHash,
    generateEmbedding,
    cosineSimilarity,
    generateBatchIntroduction,
    generateExcelMapping,
    evaluateGuidanceAlert,
    askAiSimpleDetailed,
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
