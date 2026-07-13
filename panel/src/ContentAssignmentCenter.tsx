import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    CalendarClock,
    CheckCircle2,
    Clock3,
    Eye,
    FileStack,
    Minus,
    Plus,
    Search,
    Send,
    Target,
    Trash2,
    Upload,
    Users,
    UserRound,
    X,
} from 'lucide-react';
import { Scan, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api';
import { usePanelToast } from './components/PanelToastProvider';
import { usePanelConfirm } from './components/PanelConfirmProvider';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';

type ContentType = 'deneme' | 'test' | 'odev' | 'brans';
type TargetType = 'student' | 'class' | 'all';
type CompletionMode = 'virtual_optic' | 'mark_complete';

type ContentSection = {
    id: string | number;
    title: string;
    startPage: number;
    endPage: number;
    answerKeyPage?: number;
    course?: string;
    questionCount?: number;
    answerKey?: string[];
};

type AssignmentItem = {
    id: string | number;
    targetType: TargetType;
    targetValue: string;
    dueAt: string;
    expectedDurationMinutes: number;
    completionMode: CompletionMode;
    note: string;
    createdAt: string;
    recipientCount?: number;
    content?: {
        id: string | number;
        title: string;
        contentType: ContentType;
        course?: string;
        examScope?: string;
        sections: ContentSection[];
    };
};

type DraftSection = {
    id: string;
    title: string;
    blockLabel: string;
    startPage: string;
    endPage: string;
    answerKeyPage: string;
    course: string;
    questionCount: string;
    answerKey: string[];
};

const contentTypeMeta: Record<ContentType, { label: string; color: string; bg: string }> = {
    deneme: { label: 'Deneme', color: '#7c3aed', bg: '#f5f3ff' },
    test: { label: 'Test', color: '#2563eb', bg: '#eff6ff' },
    odev: { label: 'Odev PDF', color: '#ea580c', bg: '#fff7ed' },
    brans: { label: 'Brans Tarama', color: '#059669', bg: '#ecfdf5' },
};

const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    padding: '1.25rem',
    boxShadow: 'var(--shadow)',
};

const smallLabelStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '0.85rem 0.95rem',
    fontSize: '0.92rem',
    background: 'var(--bg-card)',
    color: 'var(--text-main)',
};

const buttonBase: React.CSSProperties = {
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '0.8rem 1rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
};

const innerCardStyle: React.CSSProperties = {
    border: '1px solid #dbe4f0',
    borderRadius: '18px',
    padding: '1rem',
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
    boxShadow: '0 14px 30px rgba(15, 23, 42, 0.08)',
};

const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
    }

    return window.btoa(binary);
};

GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

const createDraftSection = (index: number): DraftSection => ({
    id: `section_${Date.now()}_${index}`,
    title: '',
    blockLabel: '',
    startPage: index === 0 ? '1' : '',
    endPage: '',
    answerKeyPage: '',
    course: '',
    questionCount: '',
    answerKey: [],
});

const formatDateTimeLocalValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const combineDateAndTime = (dateValue: string, timeValue: string) =>
    dateValue && timeValue ? `${dateValue}T${timeValue}` : '';

const resolveSectionTitle = (section: Pick<DraftSection, 'title'>, index: number) =>
    section.title.trim() || (index === 0 ? 'Ana Paket' : `Parca ${index + 1}`);

const resolveSectionCourse = (section: Pick<DraftSection, 'title'>, index: number) =>
    resolveSectionTitle(section, index) || null;

const formatDueLabel = (value: string) => {
    if (!value) return 'Teslim tarihi seç';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Teslim tarihi seç';
    return date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const calendarMonthFormatter = new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    year: 'numeric',
});

const calendarWeekdayLabels = ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz'];

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1);

const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const buildCalendarDays = (monthDate: Date) => {
    const firstDay = startOfMonth(monthDate);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - firstWeekday);

    return Array.from({ length: 42 }, (_, index) => {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + index);
        return day;
    });
};



const ContentAssignmentCenter: React.FC = () => {
    const [students, setStudents] = useState<any[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [editingContentId, setEditingContentId] = useState<string | number | null>(null);
    const [editingFileMeta, setEditingFileMeta] = useState<{ fileName: string; fileMimeType: string; fileSizeBytes: number } | null>(null);
    const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
    const [assignmentProgress, setAssignmentProgress] = useState(0);
    const [minimumDueAt, setMinimumDueAt] = useState(() => formatDateTimeLocalValue(new Date()));
    const [isDuePickerOpen, setIsDuePickerOpen] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
    const [contentDraft, setContentDraft] = useState({
        title: '',
        description: '',
        contentType: 'deneme' as ContentType,
        course: 'TYT Genel',
        examScope: 'TYT',
        selectedCourses: ['Turkce', 'Sosyal', 'Matematik', 'Fen'] as string[],
        singleCourse: 'Matematik',
        totalPages: '',
        expectedDurationMinutes: '90',
        requiresOptic: true,
    });
    const [sections, setSections] = useState<DraftSection[]>([createDraftSection(0)]);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [currentPreviewPage, setCurrentPreviewPage] = useState(1);
    const [pdfDocument, setPdfDocument] = useState<any | null>(null);
    const [isPdfLoading, setIsPdfLoading] = useState(false);
    const [pdfError, setPdfError] = useState('');
    const [thumbnailUrls, setThumbnailUrls] = useState<string[]>([]);
    const [zoomLevel, setZoomLevel] = useState(1.25);
    const [pageJumpValue, setPageJumpValue] = useState('1');
    const [isTrimmingPdf, setIsTrimmingPdf] = useState(false);
    const [isParsingAnswerKey, setIsParsingAnswerKey] = useState(false);
    const answerKeyFileRef = useRef<HTMLInputElement | null>(null);
    const currentPreviewPageRef = useRef(1);
    const [assignmentDraft, setAssignmentDraft] = useState({
        targetType: 'student' as TargetType,
        targetValue: '',
        dueAt: '',
        expectedDurationMinutes: '90',
        completionMode: 'virtual_optic' as CompletionMode,
        note: '',
    });
    const { showToast } = usePanelToast();
    const { confirm } = usePanelConfirm();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const duePickerRef = useRef<HTMLDivElement | null>(null);
    const targetDropdownRef = useRef<HTMLDivElement | null>(null);

    // Modern Seçim State'leri
    const [isTargetDropdownOpen, setIsTargetDropdownOpen] = useState(false);
    const [targetSearchQuery, setTargetSearchQuery] = useState('');
    const [targetClassFilter, setTargetClassFilter] = useState('');

    const mapAssignmentItem = (item: any): AssignmentItem => ({
        id: item.id,
        targetType: item.targetType,
        targetValue: item.targetValue || '',
        dueAt: item.dueAt,
        expectedDurationMinutes: item.expectedDurationMinutes || 90,
        completionMode: item.completionMode,
        note: item.note || '',
        createdAt: item.createdAt,
        recipientCount: item.recipientCount || 0,
        content: item.content
            ? {
                  id: item.content.id,
                  title: item.content.title,
                  contentType: item.content.contentType,
                  course: item.content.course || '',
                  examScope: item.content.examScope || '',
                  sections: Array.isArray(item.content.sections)
                        ? item.content.sections.map((section: any) => ({
                            id: section.id,
                            title: section.title,
                            blockLabel: section.blockLabel || '',
                            startPage: section.startPage,
                            endPage: section.endPage,
                            answerKeyPage: section.answerKeyPage ? String(section.answerKeyPage) : '',
                            course: section.course || '',
                            questionCount: section.questionCount || 0,
                            answerKey: Array.isArray(section.answerKey) ? section.answerKey : [],
                        }))
                      : [],
              }
            : undefined,
    });

    const fetchAssignedContentData = async () => {
        const assignmentsData = await api.getAssignedContentAssignments().catch(() => []);
        setAssignments((assignmentsData || []).map(mapAssignmentItem));
    };

    useEffect(() => {
        const fetchInitialData = async () => {
            setIsBootstrapping(true);
            try {
                const [studentsData, classesData] = await Promise.all([
                    api.getStudents(),
                    api.getClasses().catch(() => []),
                ]);

                setStudents(studentsData);
                setClasses(classesData);
                await fetchAssignedContentData();
            } catch (error) {
                console.error('Assigned content bootstrap error:', error);
                showToast({
                    type: 'error',
                    title: 'Yuklenemedi',
                    message: 'Atama merkezi verileri backendden cekilirken hata olustu.',
                });
            } finally {
                setIsBootstrapping(false);
            }
        };

        fetchInitialData();
    }, []);

    useEffect(() => {
        if (!isCreatingAssignment) {
            setAssignmentProgress(0);
            return;
        }

        setAssignmentProgress(12);
        const timer = window.setInterval(() => {
            setAssignmentProgress((prev) => {
                if (prev >= 88) return prev;
                return Math.min(prev + Math.max(4, Math.round((92 - prev) / 6)), 88);
            });
        }, 220);

        return () => window.clearInterval(timer);
    }, [isCreatingAssignment]);

    useEffect(() => {
        const refreshMinDate = () => {
            const nextMin = formatDateTimeLocalValue(new Date());
            setMinimumDueAt(nextMin);
            setAssignmentDraft((prev) => {
                if (!prev.dueAt || prev.dueAt >= nextMin) return prev;
                return { ...prev, dueAt: nextMin };
            });
        };

        refreshMinDate();
        const timer = window.setInterval(refreshMinDate, 60_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!isDuePickerOpen) return;
        const selectedDate = assignmentDraft.dueAt ? new Date(assignmentDraft.dueAt) : new Date(minimumDueAt);
        if (!Number.isNaN(selectedDate.getTime())) {
            setCalendarMonth(startOfMonth(selectedDate));
        }
        const handleOutsideClick = (event: MouseEvent) => {
            if (!duePickerRef.current?.contains(event.target as Node)) {
                setIsDuePickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [isDuePickerOpen]);

    useEffect(() => {
        if (!isTargetDropdownOpen) {
            setTargetSearchQuery('');
            setTargetClassFilter('');
            return;
        }
        const handleOutsideClick = (event: MouseEvent) => {
            if (!targetDropdownRef.current?.contains(event.target as Node)) {
                setIsTargetDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [isTargetDropdownOpen]);

    useEffect(() => {
        if (contentDraft.contentType === 'deneme') {
            const selectedCourses = contentDraft.selectedCourses.length > 0
                ? contentDraft.selectedCourses
                : (contentDraft.examScope === 'AYT' ? ['Matematik'] : ['Turkce']);
            const nextCourseLabel = `${contentDraft.examScope} Genel`;
            if (
                contentDraft.course !== nextCourseLabel ||
                contentDraft.selectedCourses.length !== selectedCourses.length ||
                contentDraft.selectedCourses.some((item, index) => item !== selectedCourses[index])
            ) {
                setContentDraft((prev) => ({
                    ...prev,
                    course: `${prev.examScope} Genel`,
                    selectedCourses,
                }));
            }

            setSections((prev) =>
                selectedCourses.map((_, index) => {
                    const existing = prev[index];
                    return existing
                        ? existing
                        : createDraftSection(index);
                }),
            );
            return;
        }

        if (contentDraft.contentType === 'test' || contentDraft.contentType === 'brans') {
            if (contentDraft.course !== contentDraft.singleCourse) {
                setContentDraft((prev) => ({
                    ...prev,
                    course: prev.singleCourse,
                }));
            }
            setSections((prev) => {
                const firstSection = prev[0] || createDraftSection(0);
                return [
                    {
                        ...firstSection,
                        title: firstSection.title || '',
                        course: firstSection.course || '',
                    },
                ];
            });
        }
    }, [contentDraft.contentType, contentDraft.examScope, contentDraft.selectedCourses, contentDraft.singleCourse]);

    useEffect(() => {
        if (!isEditorOpen) return;
        setCurrentPreviewPage(1);
        setZoomLevel(1.25);
        setPageJumpValue('1');
    }, [isEditorOpen]);

    useEffect(() => {
        if (!selectedFile || !isEditorOpen) {
            setPdfDocument(null);
            setPdfError('');
            setThumbnailUrls([]);
            return;
        }

        let isCancelled = false;
        setIsPdfLoading(true);
        setPdfError('');
        let loadingTask: ReturnType<typeof getDocument> | null = null;

        selectedFile
            .arrayBuffer()
            .then((buffer) => {
                if (isCancelled) return;
                loadingTask = getDocument({ data: new Uint8Array(buffer) });
                return loadingTask.promise;
            })
            .then((document) => {
                if (!document || isCancelled) return;
                setPdfDocument(document);
                setCurrentPreviewPage(1);
                setPageJumpValue('1');
                if (!contentDraft.totalPages) {
                    setContentDraft((prev) => ({ ...prev, totalPages: String(document.numPages) }));
                }
            })
            .catch((error) => {
                if (isCancelled) return;
                console.error('PDF load error:', error);
                setPdfError('PDF onizlemesi yuklenemedi.');
                setPdfDocument(null);
            })
            .finally(() => {
                if (!isCancelled) setIsPdfLoading(false);
            });

        return () => {
            isCancelled = true;
            loadingTask?.destroy();
        };
    }, [selectedFile, isEditorOpen]);

    useEffect(() => {
        if (!pdfDocument) {
            setThumbnailUrls([]);
            return;
        }

        let isCancelled = false;
        const buildThumbnails = async () => {
            const total = pdfDocument.numPages;
            const urls = Array.from({ length: total }, () => '');
            setThumbnailUrls(urls);

            for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
                const page = await pdfDocument.getPage(pageNumber);
                const viewport = page.getViewport({ scale: 0.22 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) continue;
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: context, viewport }).promise;
                urls[pageNumber - 1] = canvas.toDataURL('image/jpeg', 0.7);
                if (!isCancelled) {
                    setThumbnailUrls([...urls]);
                }
                if (isCancelled) return;
            }
        };

        buildThumbnails().catch((error) => {
            console.error('Thumbnail render error:', error);
        });

        return () => {
            isCancelled = true;
        };
    }, [pdfDocument]);

    useEffect(() => {
        setPageJumpValue(String(currentPreviewPage));
        currentPreviewPageRef.current = currentPreviewPage;
    }, [currentPreviewPage]);

    useEffect(() => {
        if (!pdfDocument || !canvasRef.current) return;

        let isCancelled = false;
        const renderPage = async () => {
            try {
                setIsPdfLoading(true);
                const page = await pdfDocument.getPage(currentPreviewPage);
                if (isCancelled || !canvasRef.current) return;

                const viewport = page.getViewport({ scale: zoomLevel });
                const canvas = canvasRef.current;
                const context = canvas.getContext('2d');
                if (!context) return;

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({
                    canvasContext: context,
                    viewport,
                }).promise;
            } catch (error) {
                if (!isCancelled) {
                    console.error('PDF render error:', error);
                    setPdfError('Secilen sayfa gosterilemedi.');
                }
            } finally {
                if (!isCancelled) setIsPdfLoading(false);
            }
        };

        renderPage();
        return () => {
            isCancelled = true;
        };
    }, [pdfDocument, currentPreviewPage, zoomLevel]);

    const classOptions = useMemo(() => {
        if (classes.length > 0) return classes.map((item) => item.name);
        return Array.from(new Set(students.map((student) => student.class).filter(Boolean)));
    }, [classes, students]);

    const estimatedRecipients = useMemo(() => {
        if (assignmentDraft.targetType === 'all') return students.length;
        if (assignmentDraft.targetType === 'student') return assignmentDraft.targetValue ? 1 : 0;
        return students.filter((student) => student.class === assignmentDraft.targetValue).length;
    }, [assignmentDraft.targetType, assignmentDraft.targetValue, students]);

    const filteredTargetStudents = useMemo(() => {
        return students.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(targetSearchQuery.toLowerCase());
            const matchesClass = !targetClassFilter || s.class === targetClassFilter;
            return matchesSearch && matchesClass;
        });
    }, [students, targetSearchQuery, targetClassFilter]);

    const filteredTargetClasses = useMemo(() => {
        return classOptions.filter(c => 
            c.toLowerCase().includes(targetSearchQuery.toLowerCase())
        );
    }, [classOptions, targetSearchQuery]);

    const totalPreviewPages = Math.max(1, pdfDocument?.numPages || Number(contentDraft.totalPages) || 1);
    const recentAssignments = useMemo(() => {
        return assignments
            .filter((assignment) => assignment.content?.title)
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 10);
    }, [assignments]);

    const minimumDueDate = minimumDueAt.slice(0, 10);
    const minimumDueTime = minimumDueAt.slice(11, 16);
    const selectedDueDate = assignmentDraft.dueAt ? assignmentDraft.dueAt.slice(0, 10) : minimumDueDate;
    const selectedDueTime = assignmentDraft.dueAt ? assignmentDraft.dueAt.slice(11, 16) : minimumDueTime;
    const minDueDateObject = useMemo(() => new Date(minimumDueAt), [minimumDueAt]);
    const selectedDueDateObject = useMemo(() => new Date(`${selectedDueDate}T00:00`), [selectedDueDate]);
    const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);

    const updateDueAt = (dateValue: string, timeValue: string) => {
        const combined = combineDateAndTime(dateValue, timeValue);
        const safeValue = combined && combined < minimumDueAt ? minimumDueAt : combined;
        setAssignmentDraft((prev) => ({ ...prev, dueAt: safeValue }));
    };

    const applyQuickDueAt = (dayOffset: number, hour: number, minute: number) => {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + dayOffset);
        nextDate.setHours(hour, minute, 0, 0);
        const safeValue = formatDateTimeLocalValue(
            nextDate.getTime() < new Date(minimumDueAt).getTime() ? new Date(minimumDueAt) : nextDate,
        );
        setAssignmentDraft((prev) => ({ ...prev, dueAt: safeValue }));
        setIsDuePickerOpen(false);
    };

    const resetContentDraft = () => {
        setEditingContentId(null);
        setEditingFileMeta(null);
        setSelectedFile(null);
        setContentDraft({
            title: '',
            description: '',
            contentType: 'deneme',
            course: 'TYT Genel',
            examScope: 'TYT',
            selectedCourses: ['Turkce', 'Sosyal', 'Matematik', 'Fen'],
            singleCourse: 'Matematik',
            totalPages: '',
            expectedDurationMinutes: '90',
            requiresOptic: true,
        });
        setSections([createDraftSection(0)]);
        setIsEditorOpen(false);
    };

    const handleAddSection = () => {
        setSections((prev) => [...prev, createDraftSection(prev.length)]);
    };

    const handleSectionChange = (id: string, field: keyof DraftSection, value: string) => {
        setSections((prev) =>
            prev.map((section) => (section.id === id ? { ...section, [field]: value } : section)),
        );
    };

    const handleQuestionCountChange = (id: string, value: string) => {
        setSections((prev) =>
            prev.map((section) => {
                if (section.id !== id) return section;
                const nextCount = Math.max(0, Number(value) || 0);
                const resizedAnswers = Array.from({ length: nextCount }, (_, index) => section.answerKey[index] || '');
                return {
                    ...section,
                    questionCount: value,
                    answerKey: resizedAnswers,
                };
            }),
        );
    };

    const handleAnswerChoiceSelect = (sectionId: string, questionIndex: number, choice: string) => {
        setSections((prev) =>
            prev.map((section) => {
                if (section.id !== sectionId) return section;
                const nextAnswers = [...section.answerKey];
                nextAnswers[questionIndex] = choice === '-' ? '' : choice;
                return {
                    ...section,
                    answerKey: nextAnswers,
                };
            }),
        );
    };

    const handleRemoveSection = (id: string) => {
        setSections((prev) => (prev.length === 1 ? prev : prev.filter((section) => section.id !== id)));
    };

    const handleParseAnswerKey = async (
        source: 'pdf_page' | 'file',
        file?: File,
        pageNumber?: number,
        sectionId?: string,
    ) => {
        let imageBase64 = '';
        let mimeType = 'image/png';
        const targetPage = pageNumber ? Math.max(1, pageNumber) : Math.max(1, currentPreviewPageRef.current || currentPreviewPage);

        if (source === 'pdf_page' && pdfDocument) {
            try {
                const page = await pdfDocument.getPage(targetPage);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) {
                    showToast({ type: 'error', title: 'Hata', message: 'Canvas oluşturulamadı.' });
                    return;
                }
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: context, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/png');
                imageBase64 = dataUrl.split(',')[1] || '';
                mimeType = 'image/png';
            } catch (error) {
                console.error('PDF page capture error:', error);
                showToast({ type: 'error', title: 'Hata', message: 'PDF sayfası yakalanamadı.' });
                return;
            }
        } else if (source === 'file' && file) {
            const buffer = await file.arrayBuffer();
            imageBase64 = arrayBufferToBase64(buffer);
            mimeType = file.type || 'image/jpeg';
        } else {
            showToast({ type: 'warning', title: 'Kaynak Yok', message: 'Lütfen bir PDF sayfası veya görsel seçin.' });
            return;
        }

        setIsParsingAnswerKey(true);
        try {
            const targetSection = sectionId ? sections.find((s) => s.id === sectionId) : null;
            const sectionsMeta = targetSection
                ? [{
                    title: targetSection.title || 'Bölüm',
                    course: targetSection.title || null,
                    blockLabel: targetSection.blockLabel || null,
                    questionCount: Number(targetSection.questionCount) || 0,
                }]
                : sections.map((s) => ({
                    title: s.title || 'Bölüm',
                    course: s.title || null,
                    blockLabel: s.blockLabel || null,
                    questionCount: Number(s.questionCount) || 0,
                }));

            const result = await api.parseAnswerKey({ imageBase64, mimeType, sections: sectionsMeta });

            if (result?.sections && Array.isArray(result.sections)) {
                setSections((prev) => {
                    const updated = [...prev];
                    if (sectionId) {
                        const sectionIndex = updated.findIndex((item) => item.id === sectionId);
                        if (sectionIndex >= 0) {
                            const parsedAnswers: string[] = result.sections[0]?.answers || [];
                            const qCount = Number(updated[sectionIndex].questionCount) || parsedAnswers.length;
                            if (!updated[sectionIndex].questionCount || Number(updated[sectionIndex].questionCount) === 0) {
                                updated[sectionIndex] = { ...updated[sectionIndex], questionCount: String(parsedAnswers.length) };
                            }
                            updated[sectionIndex] = {
                                ...updated[sectionIndex],
                                answerKey: parsedAnswers.slice(0, qCount),
                            };
                        }
                    } else {
                        for (let i = 0; i < Math.min(result.sections.length, updated.length); i++) {
                            const parsedAnswers: string[] = result.sections[i].answers || [];
                            const qCount = Number(updated[i].questionCount) || parsedAnswers.length;
                            if (!updated[i].questionCount || Number(updated[i].questionCount) === 0) {
                                updated[i] = { ...updated[i], questionCount: String(parsedAnswers.length) };
                            }
                            updated[i] = {
                                ...updated[i],
                                answerKey: parsedAnswers.slice(0, qCount),
                            };
                        }
                    }
                    return updated;
                });

                const totalParsed = result.sections.reduce((sum: number, s: any) => sum + (s.answers?.length || 0), 0);
                showToast({
                    type: 'success',
                    title: 'Cevap Anahtarı Okundu',
                    message:
                        source === 'pdf_page'
                            ? `Sy.${targetPage} üzerinden ${totalParsed} cevap tanındı. Lütfen kontrol edin.`
                            : `${totalParsed} cevap başarıyla tanındı. Lütfen kontrol edin.`,
                });
            } else {
                showToast({ type: 'error', title: 'Tanıma Başarısız', message: 'Görselden cevap anahtarı çıkarılamadı.' });
            }
        } catch (error: any) {
            console.error('Answer key parse error:', error);
            showToast({
                type: 'error',
                title: 'Tanıma Hatası',
                message: error?.response?.data?.error || 'Cevap anahtarı tanıma sırasında hata oluştu.',
            });
        } finally {
            setIsParsingAnswerKey(false);
        }
    };

    const handleFinalizePdfSelection = async () => {
        if (!selectedFile) return;

        const sourcePageCount = pdfDocument?.numPages || Number(contentDraft.totalPages) || 1;
        const validSections = sections
            .map((section, index) => ({
                id: section.id,
                title: section.title.trim() || (index === 0 ? 'Ana Paket' : `Parca ${index + 1}`),
                startPage: Math.max(1, Number(section.startPage) || 1),
                endPage: Math.min(sourcePageCount, Math.max(1, Number(section.endPage) || Number(section.startPage) || 1)),
            }))
            .filter((section) => section.endPage >= section.startPage);

        if (validSections.length === 0) {
            showToast({
                type: 'warning',
                title: 'Bolum Yok',
                message: 'PDF\'yi kesmeden once en az bir gecerli sayfa araligi secelim.',
            });
            return;
        }

        try {
            setIsTrimmingPdf(true);
            const existingBytes = await selectedFile.arrayBuffer();
            const sourcePdf = await PDFLibDocument.load(existingBytes);
            const outputPdf = await PDFLibDocument.create();
            const compactedSections: DraftSection[] = [];
            let cursor = 1;

            for (const section of validSections) {
                const pageIndices = Array.from(
                    { length: section.endPage - section.startPage + 1 },
                    (_, idx) => section.startPage - 1 + idx,
                ).filter((pageIndex) => pageIndex >= 0 && pageIndex < sourcePdf.getPageCount());

                const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndices);
                copiedPages.forEach((page) => outputPdf.addPage(page));

                const sectionLength = copiedPages.length;
                const sourceSection = sections.find((item) => item.id === section.id);
                compactedSections.push({
                    id: section.id,
                    title: section.title,
                    startPage: String(cursor),
                    endPage: String(cursor + sectionLength - 1),
                    answerKeyPage:
                        sourceSection?.answerKeyPage &&
                        Number(sourceSection.answerKeyPage) >= section.startPage &&
                        Number(sourceSection.answerKeyPage) <= section.endPage
                            ? String(cursor + (Number(sourceSection.answerKeyPage) - section.startPage))
                            : '',
                    course: sourceSection?.course || '',
                    questionCount: sourceSection?.questionCount || '',
                    blockLabel: sourceSection?.blockLabel || '',
                    answerKey: sourceSection?.answerKey || [],
                });
                cursor += sectionLength;
            }

            const trimmedBytes = await outputPdf.save();
            const trimmedBufferView = Uint8Array.from(trimmedBytes);
            const trimmedFileName = selectedFile.name.replace(/\.pdf$/i, '') + '-secili.pdf';
            const trimmedFile = new File([trimmedBufferView], trimmedFileName, {
                type: 'application/pdf',
            });

            if (editingContentId) {
                const updatedPayload = {
                    title: contentDraft.title.trim(),
                    description: contentDraft.description.trim(),
                    contentType: contentDraft.contentType,
                    course: contentDraft.course.trim() || 'Genel',
                    examScope: contentDraft.examScope.trim() || 'TYT',
                    teacherNote: assignmentDraft.note.trim() || null,
                    expectedDurationMinutes: Number(contentDraft.expectedDurationMinutes) || 90,
                    totalPages: outputPdf.getPageCount(),
                    requiresOptic: contentDraft.requiresOptic,
                    sections: compactedSections.map((section, index) => ({
                        id: section.id,
                        title: resolveSectionTitle(section, index),
                        startPage: Math.max(1, Number(section.startPage) || 1),
                        endPage: Math.max(1, Number(section.endPage) || Number(section.startPage) || outputPdf.getPageCount()),
                        answerKeyPage: Math.max(0, Number(section.answerKeyPage) || 0) || null,
                        course: resolveSectionCourse(section, index),
                        questionCount: Math.max(0, Number(section.questionCount) || 0),
                        answerKey: (section.answerKey || []).slice(0, Math.max(0, Number(section.questionCount) || 0)),
                    })),
                    fileName: trimmedFile.name,
                    fileMimeType: trimmedFile.type || 'application/pdf',
                    fileSizeBytes: trimmedFile.size,
                    fileBase64: arrayBufferToBase64(await trimmedFile.arrayBuffer()),
                };

                const saved = await api.updateAssignedContent(Number(editingContentId), updatedPayload);
                await fetchAssignedContentData();
                setSelectedFile(trimmedFile);
                setEditingFileMeta({
                    fileName: trimmedFile.name,
                    fileMimeType: trimmedFile.type || 'application/pdf',
                    fileSizeBytes: trimmedFile.size,
                });
                setSections(compactedSections);
                setContentDraft((prev) => ({
                    ...prev,
                    totalPages: String(outputPdf.getPageCount()),
                }));
                setCurrentPreviewPage(1);
                setPageJumpValue('1');
                setIsEditorOpen(false);
                showToast({
                    type: 'success',
                    title: 'Düzenleme Kaydedildi',
                    message: `"${saved.title || contentDraft.title}" için yapılan PDF düzenlemesi kaydedildi.`,
                });
                return;
            }

            setSelectedFile(trimmedFile);
            setSections(compactedSections);
            setContentDraft((prev) => ({
                ...prev,
                totalPages: String(outputPdf.getPageCount()),
            }));
            setCurrentPreviewPage(1);
            setPageJumpValue('1');
            setIsEditorOpen(false);
            showToast({
                type: 'success',
                title: 'PDF Kesildi',
                message: `Secilen ${outputPdf.getPageCount()} sayfa yeni pakette birakildi.`,
            });
        } catch (error) {
            console.error('PDF trim error:', error);
            showToast({
                type: 'error',
                title: 'Kesilemedi',
                message: 'Secilen bolumler yeni PDF\'ye donusturulurken bir hata olustu.',
            });
        } finally {
            setIsTrimmingPdf(false);
        }
    };

    const handleDeleteAssignment = async (assignment: AssignmentItem, contentTitle?: string) => {
        const approved = await confirm({
            title: 'Atama silinsin mi?',
            message: `"${contentTitle || 'Bu atama'}" gönderimini silersen, bu atamaya bağlı öğrenci kayıtları da kaldırılacak.`,
            confirmLabel: 'Atamayı Sil',
            cancelLabel: 'Vazgeç',
            tone: 'danger',
        });

        if (!approved) return;

        try {
            await api.deleteAssignedContentAssignment(Number(assignment.id));
            await fetchAssignedContentData();
            showToast({
                type: 'success',
                title: 'Atama Silindi',
                message: 'Gönderilen atama listeden kaldırıldı.',
            });
        } catch (error) {
            console.error('Assigned content assignment delete error:', error);
            showToast({
                type: 'error',
                title: 'Silinemedi',
                message: 'Gönderilen atama silinirken backend hatası oluştu.',
            });
        }
    };

    const handleCreateAssignment = async () => {
        if (!selectedFile) {
            showToast({ type: 'warning', title: 'PDF Secilmedi', message: 'Gonderilecek icerigi once yukleyelim.' });
            return;
        }
        if (!contentDraft.title.trim()) {
            showToast({ type: 'warning', title: 'Baslik Eksik', message: 'PDF gondermeden once bir paket basligi girelim.' });
            return;
        }
        if (assignmentDraft.targetType !== 'all' && !assignmentDraft.targetValue) {
            showToast({ type: 'warning', title: 'Hedef Eksik', message: 'Ogrenci ya da sinif secimi tamamlanmadi.' });
            return;
        }
        if (!assignmentDraft.dueAt) {
            showToast({ type: 'warning', title: 'Teslim Tarihi Eksik', message: 'Takip ekraninda gorebilmek icin teslim tarihini belirleyelim.' });
            return;
        }

        const totalPages = Number(contentDraft.totalPages) || 1;
        const mappedSections = sections
            .map((section, index) => ({
                id: section.id,
                title: resolveSectionTitle(section, index),
                startPage: Math.max(1, Number(section.startPage) || 1),
                endPage: Math.max(1, Number(section.endPage) || Number(section.startPage) || totalPages),
                answerKeyPage: Math.max(0, Number(section.answerKeyPage) || 0) || null,
                course: resolveSectionCourse(section, index),
                questionCount: Math.max(0, Number(section.questionCount) || 0),
                answerKey: (section.answerKey || []).slice(0, Math.max(0, Number(section.questionCount) || 0)),
            }))
            .filter((section) => section.endPage >= section.startPage);

        if (mappedSections.length === 0) {
            showToast({ type: 'warning', title: 'Bolum Eksik', message: 'Gondermeden once en az bir gecerli bolum tanimlayalim.' });
            return;
        }

        const invalidAnswerKeySection = mappedSections.find(
            (section) =>
                (section.questionCount || 0) > 0 &&
                (section.answerKey || []).filter(Boolean).length !== section.questionCount,
        );
        if (invalidAnswerKeySection) {
            showToast({
                type: 'warning',
                title: 'Cevap Anahtari Eksik',
                message: `"${invalidAnswerKeySection.title}" icin soru sayisi ve cevap anahtari uzunlugu eslesmiyor.`,
            });
            return;
        }

        try {
            setIsCreatingAssignment(true);
            const result = await api.sendAssignedContentDirect({
                title: contentDraft.title.trim(),
                description: contentDraft.description.trim(),
                contentType: contentDraft.contentType,
                course: contentDraft.course.trim() || 'Genel',
                examScope: contentDraft.examScope.trim() || 'TYT',
                teacherNote: assignmentDraft.note.trim() || null,
                expectedDurationMinutes: Number(assignmentDraft.expectedDurationMinutes) || Number(contentDraft.expectedDurationMinutes) || 90,
                totalPages: Math.max(totalPages, mappedSections[mappedSections.length - 1]?.endPage || totalPages),
                requiresOptic: contentDraft.requiresOptic,
                fileName: selectedFile.name,
                fileMimeType: selectedFile.type || 'application/pdf',
                fileSizeBytes: selectedFile.size,
                fileBase64: arrayBufferToBase64(await selectedFile.arrayBuffer()),
                sections: mappedSections,
                targetType: assignmentDraft.targetType,
                targetValue: assignmentDraft.targetType === 'all' ? null : assignmentDraft.targetValue,
                dueAt: assignmentDraft.dueAt,
                completionMode: assignmentDraft.completionMode,
                note: assignmentDraft.note.trim(),
            });
            await fetchAssignedContentData();
            setAssignmentDraft((prev) => ({
                ...prev,
                targetValue: '',
                dueAt: '',
                note: '',
            }));
            resetContentDraft();
            showToast({
                type: 'success',
                title: 'Hazirlandi ve Gonderildi',
                message: `${result.recipientCount || estimatedRecipients || 0} ogrenci icin backend atamasi olusturuldu.`,
            });
        } catch (error) {
            console.error('Assigned content assign error:', error);
            showToast({ type: 'error', title: 'Atanemedi', message: 'Icerik ogrencilere atanirken backend hatasi olustu.' });
        } finally {
            setAssignmentProgress(100);
            window.setTimeout(() => {
                setIsCreatingAssignment(false);
                setAssignmentProgress(0);
            }, 250);
        }
    };

    const getTargetLabel = (assignment: AssignmentItem) => {
        if (assignment.targetType === 'all') return 'Tum Ogrenciler';
        if (assignment.targetType === 'class') return `${assignment.targetValue} sinifi`;
        const student = students.find((item) => String(item.id) === assignment.targetValue);
        return student ? student.name : 'Secili Ogrenci';
    };

    const getCompletionLabel = (mode: CompletionMode) =>
        mode === 'virtual_optic' ? 'Sanal Optik' : 'Tamamlandi Isaretle';

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {isBootstrapping && (
                <div style={{ ...cardStyle, marginBottom: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Atama merkezi backend verileri yukleniyor...
                </div>
            )}
            {isDuePickerOpen && (
                <div className="due-picker-overlay">
                    <div className="due-picker-modal" ref={duePickerRef}>
                        <div className="due-picker-popover-title">Teslim Tarihini Ayarla</div>
                        <div className="due-picker-grid">
                            <div className="due-picker-calendar">
                                <div className="due-picker-calendar-head">
                                    <button
                                        type="button"
                                        className="due-picker-nav"
                                        onClick={() => setCalendarMonth((prev) => addMonths(prev, -1))}
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <div className="due-picker-calendar-title">
                                        {calendarMonthFormatter.format(calendarMonth)}
                                    </div>
                                    <button
                                        type="button"
                                        className="due-picker-nav"
                                        onClick={() => setCalendarMonth((prev) => addMonths(prev, 1))}
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                                <div className="due-picker-weekdays">
                                    {calendarWeekdayLabels.map((label) => (
                                        <span key={label}>{label}</span>
                                    ))}
                                </div>
                                <div className="due-picker-days">
                                    {calendarDays.map((day) => {
                                        const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                                        const isDisabled = day < new Date(minDueDateObject.getFullYear(), minDueDateObject.getMonth(), minDueDateObject.getDate());
                                        const isSelected = isSameDay(day, selectedDueDateObject);
                                        return (
                                            <button
                                                key={day.toISOString()}
                                                type="button"
                                                disabled={isDisabled}
                                                className={`due-picker-day ${isSelected ? 'selected' : ''} ${!isCurrentMonth ? 'muted' : ''}`}
                                                onClick={() => updateDueAt(formatDateTimeLocalValue(day).slice(0, 10), selectedDueTime)}
                                            >
                                                {day.getDate()}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="due-picker-side">
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="stat-pill-label">Saat</label>
                                    <input
                                        type="time"
                                        className="premium-input"
                                        min={selectedDueDate === minimumDueDate ? minimumDueTime : undefined}
                                        value={selectedDueTime}
                                        onChange={(e) => updateDueAt(selectedDueDate, e.target.value)}
                                    />
                                </div>

                                <div className="due-picker-quick-list">
                                    <button type="button" className="due-picker-quick" onClick={() => applyQuickDueAt(0, 18, 0)}>Bugün 18:00</button>
                                    <button type="button" className="due-picker-quick" onClick={() => applyQuickDueAt(1, 18, 0)}>Yarın 18:00</button>
                                    <button type="button" className="due-picker-quick" onClick={() => applyQuickDueAt(2, 20, 30)}>2 Gün Sonra 20:30</button>
                                </div>
                            </div>
                        </div>

                        <div className="due-picker-footer">
                            <span>Geçmiş tarih seçilemez.</span>
                            <button
                                type="button"
                                className="premium-button"
                                style={{ padding: '0.65rem 1rem !important' }}
                                onClick={() => setIsDuePickerOpen(false)}
                            >
                                Tamam
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isEditorOpen && (selectedFile || editingContentId) && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.45)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 6000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2rem',
                    }}
                    onClick={() => setIsEditorOpen(false)}
                >
                    <div
                        style={{
                            width: 'min(1200px, 100%)',
                            maxHeight: '90vh',
                            background: 'white',
                            borderRadius: '24px',
                            boxShadow: '0 30px 80px rgba(15, 23, 42, 0.22)',
                            border: '1px solid #dbe4f0',
                            overflow: 'hidden',
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 0.9fr',
                        }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div style={{ background: '#f8fafc', borderRight: '1px solid #dbe4f0', minHeight: '70vh' }}>
                            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #dbe4f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                                        {editingContentId ? 'Icerik Duzenleme' : 'PDF Onizleme'}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                                        {selectedFile?.name || editingFileMeta?.fileName || 'Mevcut PDF korunuyor'}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsEditorOpen(false)}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #dbe4f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', background: '#fff' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPreviewPage((prev) => Math.max(1, prev - 1))}
                                        disabled={currentPreviewPage <= 1}
                                        style={{
                                            ...buttonBase,
                                            padding: '0.55rem 0.75rem',
                                            background: currentPreviewPage <= 1 ? '#f8fafc' : 'white',
                                            color: currentPreviewPage <= 1 ? '#94a3b8' : 'var(--text-main)',
                                            cursor: currentPreviewPage <= 1 ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPreviewPage((prev) => Math.min(totalPreviewPages, prev + 1))}
                                        disabled={currentPreviewPage >= totalPreviewPages}
                                        style={{
                                            ...buttonBase,
                                            padding: '0.55rem 0.75rem',
                                            background: currentPreviewPage >= totalPreviewPages ? '#f8fafc' : 'white',
                                            color: currentPreviewPage >= totalPreviewPages ? '#94a3b8' : 'var(--text-main)',
                                            cursor: currentPreviewPage >= totalPreviewPages ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setZoomLevel((prev) => Math.max(0.7, Number((prev - 0.15).toFixed(2))))}
                                        style={{ ...buttonBase, padding: '0.55rem 0.75rem', background: 'white' }}
                                    >
                                        <Minus size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setZoomLevel((prev) => Math.min(2.4, Number((prev + 0.15).toFixed(2))))}
                                        style={{ ...buttonBase, padding: '0.55rem 0.75rem', background: 'white' }}
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 700 }}>Aktif Sayfa</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max={totalPreviewPages}
                                        value={pageJumpValue}
                                        onChange={(event) => {
                                            setPageJumpValue(event.target.value);
                                        }}
                                        onBlur={() => {
                                            const nextValue = Number(pageJumpValue) || 1;
                                            setCurrentPreviewPage(Math.min(totalPreviewPages, Math.max(1, nextValue)));
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                const nextValue = Number(pageJumpValue) || 1;
                                                setCurrentPreviewPage(Math.min(totalPreviewPages, Math.max(1, nextValue)));
                                            }
                                        }}
                                        style={{
                                            width: '76px',
                                            border: '1px solid #dbe4f0',
                                            borderRadius: '10px',
                                            padding: '0.55rem 0.7rem',
                                            fontWeight: 700,
                                        }}
                                    />
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ {totalPreviewPages}</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                                        Zoom %{Math.round(zoomLevel * 100)}
                                    </span>
                                </div>
                            </div>
                            <div style={{ padding: '1rem', height: 'calc(90vh - 148px)', overflow: 'hidden', display: 'grid', gridTemplateColumns: '116px 1fr', gap: '1rem' }}>
                                <div style={{ overflowY: 'auto', paddingRight: '0.25rem' }}>
                                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                                        {thumbnailUrls.map((thumbnailUrl, index) => {
                                            const pageNumber = index + 1;
                                            const isActive = currentPreviewPage === pageNumber;
                                            return (
                                                <button
                                                    key={pageNumber}
                                                    type="button"
                                                    onClick={() => setCurrentPreviewPage(pageNumber)}
                                                    style={{
                                                        border: isActive ? '2px solid var(--primary)' : '1px solid #dbe4f0',
                                                        background: '#fff',
                                                        borderRadius: '14px',
                                                        padding: '0.35rem',
                                                        cursor: 'pointer',
                                                        boxShadow: isActive ? '0 12px 25px rgba(99, 102, 241, 0.18)' : '0 6px 18px rgba(15, 23, 42, 0.06)',
                                                    }}
                                                >
                                                    {thumbnailUrl ? (
                                                        <img
                                                            src={thumbnailUrl}
                                                            alt={`Sayfa ${pageNumber}`}
                                                            style={{ width: '100%', borderRadius: '10px', display: 'block' }}
                                                        />
                                                    ) : (
                                                        <div
                                                            style={{
                                                                width: '100%',
                                                                aspectRatio: '0.7',
                                                                borderRadius: '10px',
                                                                background: 'linear-gradient(135deg, #e2e8f0 0%, #f8fafc 100%)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: '#94a3b8',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700,
                                                            }}
                                                        >
                                                            Yukleniyor
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: '0.74rem', fontWeight: 800, color: isActive ? 'var(--primary)' : 'var(--text-muted)', marginTop: '0.35rem' }}>
                                                        Sayfa {pageNumber}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                {!selectedFile ? (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'center', padding: '2rem' }}>
                                        Mevcut PDF önizlemesi açılamadı. İçerik bilgilerini düzenleyebilir veya soldan yeni PDF seçebilirsin.
                                    </div>
                                ) : pdfError ? (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontWeight: 700 }}>
                                        {pdfError}
                                    </div>
                                ) : (
                                    <div style={{ minHeight: '100%', overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', position: 'relative' }}>
                                        <canvas
                                            ref={canvasRef}
                                            style={{
                                                width: '100%',
                                                height: 'auto',
                                                borderRadius: '16px',
                                                background: 'white',
                                                boxShadow: '0 18px 40px rgba(15, 23, 42, 0.12)',
                                            }}
                                        />
                                        {isPdfLoading && (
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    inset: 0,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: 'rgba(248, 250, 252, 0.75)',
                                                    color: 'var(--text-muted)',
                                                    fontWeight: 700,
                                                    borderRadius: '16px',
                                                }}
                                            >
                                                PDF yukleniyor...
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ padding: '1.25rem', overflowY: 'auto', maxHeight: '90vh' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                                        {editingContentId ? 'Bolumleri Guncelle' : 'Bolumleme'}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                                        PDF'ye bakip sayfa araliklarini buradan parcala.
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddSection}
                                    style={{ ...buttonBase, background: '#f8fafc', padding: '0.65rem 0.8rem' }}
                                >
                                    <Plus size={16} /> Bolum
                                </button>
                            </div>

                            <div style={{ display: 'grid', gap: '0.9rem' }}>
                                {sections.map((section, index) => (
                                    <div key={section.id} style={{ ...innerCardStyle, padding: '0.9rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 800 }}>Parca {index + 1}</div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveSection(section.id)}
                                                style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                                            <span style={smallLabelStyle}>Ders adi</span>
                                            <input
                                                    style={inputStyle}
                                                    value={section.title}
                                                    onChange={(event) => handleSectionChange(section.id, 'title', event.target.value)}
                                                    placeholder="Orn. Turkce"
                                                />
                                            </div>
                                            <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                <span style={smallLabelStyle}>Deneme / blok</span>
                                                <input
                                                    style={inputStyle}
                                                    value={section.blockLabel}
                                                    onChange={(event) => handleSectionChange(section.id, 'blockLabel', event.target.value)}
                                                    placeholder="Orn. 1. Adim 1. Deneme"
                                                />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <input
                                                    style={{ ...inputStyle, width: '120px' }}
                                                    type="number"
                                                    min="0"
                                                    value={section.questionCount}
                                                    onChange={(event) => handleQuestionCountChange(section.id, event.target.value)}
                                                    placeholder="Soru"
                                                    title="Soru sayisi"
                                                    aria-label="Soru sayisi"
                                                />
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSectionChange(section.id, 'startPage', String(currentPreviewPage))}
                                                    style={{ ...buttonBase, padding: '0.55rem 0.75rem', background: '#eff6ff', borderColor: '#bfdbfe', color: '#2563eb' }}
                                                >
                                                    Bu sayfa baslangic
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSectionChange(section.id, 'endPage', String(currentPreviewPage))}
                                                    style={{ ...buttonBase, padding: '0.55rem 0.75rem', background: '#f5f3ff', borderColor: '#ddd6fe', color: '#7c3aed' }}
                                                >
                                                    Bu sayfa bitis
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSectionChange(section.id, 'answerKeyPage', String(currentPreviewPage))}
                                                    style={{ ...buttonBase, padding: '0.55rem 0.75rem', background: '#fdf4ff', borderColor: '#f0abfc', color: '#c026d3' }}
                                                >
                                                    Bu sayfa cevap anahtari
                                                </button>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.65rem' }}>
                                                <input
                                                    style={inputStyle}
                                                    type="number"
                                                    min="1"
                                                    value={section.startPage}
                                                    onChange={(event) => handleSectionChange(section.id, 'startPage', event.target.value)}
                                                    placeholder="Baslangic"
                                                />
                                                <input
                                                    style={inputStyle}
                                                    type="number"
                                                    min="1"
                                                    value={section.endPage}
                                                    onChange={(event) => handleSectionChange(section.id, 'endPage', event.target.value)}
                                                    placeholder="Bitis"
                                                />
                                                <input
                                                    style={inputStyle}
                                                    type="number"
                                                    min="1"
                                                    value={section.answerKeyPage}
                                                    onChange={(event) => handleSectionChange(section.id, 'answerKeyPage', event.target.value)}
                                                    placeholder="Cevap anahtari"
                                                />
                                            </div>
                                            <div style={{ display: 'grid', gap: '0.45rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                                    <span style={smallLabelStyle}>Cevap Anahtari</span>
                                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                        <input
                                                            ref={answerKeyFileRef}
                                                            type="file"
                                                            accept="image/*,.pdf"
                                                            style={{ display: 'none' }}
                                                            onChange={(event) => {
                                                                const file = event.target.files?.[0];
                                                                if (file) handleParseAnswerKey('file', file, undefined, section.id);
                                                                event.target.value = '';
                                                            }}
                                                        />
                                                        {pdfDocument && (
                                                            <button
                                                                type="button"
                                                                disabled={isParsingAnswerKey}
                                                                onClick={() => {
                                                                    const targetPage = Number(section.answerKeyPage) || 0;
                                                                    if (targetPage <= 0) {
                                                                        showToast({
                                                                            type: 'warning',
                                                                            title: 'Cevap Anahtari Sayfasi Eksik',
                                                                            message: 'Önce bu parça için cevap anahtarı sayfasını seçin.',
                                                                        });
                                                                        return;
                                                                    }
                                                                    handleParseAnswerKey('pdf_page', undefined, targetPage, section.id);
                                                                }}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                                    padding: '0.35rem 0.7rem', borderRadius: '8px',
                                                                    border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#7c3aed',
                                                                    fontSize: '0.72rem', fontWeight: 700, cursor: isParsingAnswerKey ? 'wait' : 'pointer',
                                                                    opacity: isParsingAnswerKey ? 0.6 : 1,
                                                                }}
                                                                title={
                                                                    Number(section.answerKeyPage) > 0
                                                                        ? `PDF sayfa ${section.answerKeyPage} üzerinden cevap anahtarını oku`
                                                                        : 'Önce cevap anahtarı sayfası seçin'
                                                                }
                                                            >
                                                                <Scan size={13} /> {Number(section.answerKeyPage) > 0 ? `Sy.${section.answerKeyPage}'den Oku` : 'Sayfa Sec'}
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            disabled={isParsingAnswerKey}
                                                            onClick={() => answerKeyFileRef.current?.click()}
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                                padding: '0.35rem 0.7rem', borderRadius: '8px',
                                                                border: '1px solid #93c5fd', background: '#eff6ff', color: '#2563eb',
                                                                fontSize: '0.72rem', fontWeight: 700, cursor: isParsingAnswerKey ? 'wait' : 'pointer',
                                                                opacity: isParsingAnswerKey ? 0.6 : 1,
                                                            }}
                                                        >
                                                            <Wand2 size={13} /> {isParsingAnswerKey ? 'Okunuyor...' : 'Fotoğraftan Oku'}
                                                        </button>
                                                    </div>
                                                </div>
                                                {(Number(section.questionCount) || 0) > 0 ? (
                                                    <div
                                                        style={{
                                                            display: 'grid',
                                                            gap: '0.6rem',
                                                            maxHeight: '260px',
                                                            overflowY: 'auto',
                                                            paddingRight: '0.2rem',
                                                        }}
                                                    >
                                                        {Array.from({ length: Number(section.questionCount) || 0 }, (_, questionIndex) => {
                                                            const selectedAnswer = section.answerKey[questionIndex] || '';
                                                            return (
                                                                <div
                                                                    key={`${section.id}_${questionIndex}`}
                                                                    style={{
                                                                        display: 'grid',
                                                                        gridTemplateColumns: '36px 1fr',
                                                                        gap: '0.6rem',
                                                                        alignItems: 'center',
                                                                    }}
                                                                >
                                                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                                                                        {questionIndex + 1}
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                                                        {['A', 'B', 'C', 'D', 'E', '-'].map((choice) => {
                                                                            const isSelected =
                                                                                (choice === '-' && !selectedAnswer) || selectedAnswer === choice;
                                                                            return (
                                                                                <button
                                                                                    key={choice}
                                                                                    type="button"
                                                                                    onClick={() => handleAnswerChoiceSelect(section.id, questionIndex, choice)}
                                                                                    style={{
                                                                                        width: '34px',
                                                                                        height: '34px',
                                                                                        borderRadius: '999px',
                                                                                        border: `1px solid ${isSelected ? '#2563eb' : '#dbe4f0'}`,
                                                                                        background: isSelected ? '#eff6ff' : '#fff',
                                                                                        color: isSelected ? '#2563eb' : 'var(--text-muted)',
                                                                                        fontWeight: 800,
                                                                                        cursor: 'pointer',
                                                                                    }}
                                                                                >
                                                                                    {choice}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div style={{ ...inputStyle, color: 'var(--text-muted)' }}>
                                                        Once soru sayisi girildiginde optik alanlari burada olusur.
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                <span>{(section.answerKey || []).filter(Boolean).length} cevap girildi</span>
                                                <span>
                                                    {(Number(section.questionCount) || 0) > 0
                                                        ? `${Math.min((section.answerKey || []).filter(Boolean).length, Number(section.questionCount) || 0)}/${Number(section.questionCount) || 0} tamam`
                                                        : 'Soru sayisi bekleniyor'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ ...innerCardStyle, marginTop: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.6 }}>
                                    Burada tanimladigin parcalar dogrudan gonderime hazirlanir. Istersen tek parca, istersen birden fazla bolum tanimlayabilirsin.
                                </div>
                                <button
                                    type="button"
                                    onClick={handleFinalizePdfSelection}
                                    disabled={isTrimmingPdf}
                                    style={{ ...buttonBase, background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }}
                                >
                                    {isTrimmingPdf ? 'PDF Hazirlaniyor...' : editingContentId ? 'Duzenlemeyi Uygula' : 'Duzenlemeyi Bitir'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Premium Stat Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
                <div className="stat-pill">
                    <div className="stat-pill-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)' }}>
                        <FileStack size={22} />
                    </div>
                    <div>
                        <div className="stat-pill-label">Hazır Paket</div>
                        <div className="stat-pill-value">{selectedFile || editingFileMeta ? 1 : 0}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>Yüklenen ve düzenlenebilir dosya</div>
                    </div>
                </div>
                <div className="stat-pill">
                    <div className="stat-pill-icon" style={{ background: 'rgba(168, 85, 247, 0.1)', color: 'var(--secondary)' }}>
                        <Send size={22} />
                    </div>
                    <div>
                        <div className="stat-pill-label">Atama Akışı</div>
                        <div className="stat-pill-value">{assignments.length}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>Gönderilen Çalışmalar</div>
                    </div>
                </div>
                <div className="stat-pill">
                    <div className="stat-pill-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-success)' }}>
                        <Target size={22} />
                    </div>
                    <div>
                        <div className="stat-pill-label">Hedef Kitle</div>
                        <div className="stat-pill-value">{estimatedRecipients}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>Aktif Öğrenci Erişimi</div>
                    </div>
                </div>
                <div className="stat-pill">
                    <div className="stat-pill-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                        <Clock3 size={22} />
                    </div>
                    <div>
                        <div className="stat-pill-label">Süre Takibi</div>
                        <div className="stat-pill-value">{assignmentDraft.expectedDurationMinutes}<span style={{ fontSize: '0.9rem', marginLeft: '2px' }}>dk</span></div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>Ortalama Tamamlama</div>
                    </div>
                </div>
            </div>

            {/* Premium Action Hub */}
            <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: '2rem', alignItems: 'start', marginBottom: '3.5rem' }}>
                {/* PDF / Test Yükle Section */}
                <div className="premium-card" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Upload size={22} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 850 }}>PDF / Test Yükle</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                PDF'yi yükle, düzenle ve doğrudan öğrenciye gönder.
                            </p>
                        </div>
                    </div>

                    <div className="form-group">
                        <div className="upload-zone" onClick={() => document.getElementById('pdf-upload-input')?.click()}>
                            <input
                                id="pdf-upload-input"
                                type="file"
                                accept="application/pdf"
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                style={{ display: 'none' }}
                            />
                            <div style={{ width: 64, height: 64, borderRadius: '20px', background: 'white', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                <FileStack size={32} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {selectedFile
                                        ? selectedFile.name
                                        : editingFileMeta?.fileName || 'PDF Dosyasını Seçin'}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                                    {selectedFile
                                        ? `${formatFileSize(selectedFile.size)} - Dosya hazır`
                                        : editingFileMeta
                                            ? `${formatFileSize(editingFileMeta.fileSizeBytes)} - Mevcut dosya korunacak`
                                            : 'Veya buraya sürükleyip bırakın'}
                                </div>
                            </div>
                            {(selectedFile || editingFileMeta) && (
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                                    <button 
                                        className="premium-button"
                                        style={{ background: '#f8fafc !important', color: 'var(--primary) !important', border: '1px solid #e2e8f0 !important', padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                                        onClick={(e) => { e.stopPropagation(); setIsEditorOpen(true); }}
                                    > <Eye size={14} /> Düzenle</button>
                                    <button 
                                        className="premium-button"
                                        style={{ background: '#fff1f2 !important', color: 'var(--accent-danger) !important', border: '1px solid #fecaca !important', padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                                        onClick={(e) => { 
                                            e.stopPropagation();
                                            setSelectedFile(null);
                                            if (!editingContentId) {
                                                setEditingFileMeta(null);
                                                setEditingContentId(null);
                                            }
                                        }}
                                    > <Trash2 size={14} /> {editingContentId ? 'Yeni Dosyayı Kaldır' : 'Kaldır'}</button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginTop: '2rem' }}>
                        <div className="form-group">
                            <label className="stat-pill-label">Paket Başlığı</label>
                            <input
                                className="premium-input"
                                placeholder="Örn: TYT Mart Denemesi"
                                value={contentDraft.title}
                                onChange={(e) => setContentDraft({ ...contentDraft, title: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="stat-pill-label">İçerik Türü</label>
                            <select
                                className="premium-input"
                                value={contentDraft.contentType}
                                onChange={(e) => setContentDraft({ ...contentDraft, contentType: e.target.value as ContentType })}
                            >
                                <option value="deneme">Deneme Sınavı</option>
                                <option value="test">Konu Testi</option>
                                <option value="odev">Ödev / Çalışma</option>
                                <option value="brans">Branş Tarama</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '1.5rem' }}>
                        <label className="stat-pill-label">Açıklama / Notlar</label>
                        <textarea
                            className="premium-input"
                            style={{ minHeight: '90px', resize: 'none' }}
                            placeholder="Öğrenciler için kısa bir yönlendirme veya not..."
                            value={contentDraft.description}
                            onChange={(e) => setContentDraft({ ...contentDraft, description: e.target.value })}
                        />
                    </div>
                </div>

                {/* Atama Oluştur Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="premium-card" style={{ padding: '2rem', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
                            <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Send size={22} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 850 }}>Hazırla ve Gönder</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ayrı kütüphane adımı olmadan hedefe gönderin</p>
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', borderRadius: '24px', padding: '1.5rem', marginTop: '1.75rem', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                {(['student', 'class', 'all'] as TargetType[]).map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => setAssignmentDraft({ ...assignmentDraft, targetType: type, targetValue: '' })}
                                        style={{
                                            flex: 1,
                                            padding: '0.85rem',
                                            borderRadius: '16px',
                                            border: '1px solid',
                                            borderColor: assignmentDraft.targetType === type ? 'var(--primary)' : 'transparent',
                                            background: assignmentDraft.targetType === type ? 'white' : 'transparent',
                                            boxShadow: assignmentDraft.targetType === type ? '0 4px 12px rgba(99, 102, 241, 0.1)' : 'none',
                                            color: assignmentDraft.targetType === type ? 'var(--primary)' : 'var(--text-muted)',
                                            fontWeight: 800,
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.65rem',
                                            transition: 'all 0.25s'
                                        }}
                                    >
                                        {type === 'student' && <UserRound size={18} />}
                                        {type === 'class' && <Users size={18} />}
                                        {type === 'all' && <Target size={18} />}
                                        {type === 'student' ? 'Bireysel' : type === 'class' ? 'Sınıf' : 'Tümüne'}
                                    </button>
                                ))}
                            </div>

                            {assignmentDraft.targetType !== 'all' && (
                                <div className="form-group" style={{ marginTop: '1.5rem', marginBottom: 0, position: 'relative' }} ref={targetDropdownRef}>
                                    <label className="stat-pill-label">{assignmentDraft.targetType === 'student' ? 'Öğrenci Seçimi' : 'Sınıf Seçimi'}</label>
                                    
                                    {/* Custom Dropdown Trigger */}
                                    <button
                                        type="button"
                                        onClick={() => setIsTargetDropdownOpen(!isTargetDropdownOpen)}
                                        style={{
                                            width: '100%',
                                            padding: '0.85rem 1.25rem',
                                            borderRadius: '16px',
                                            border: '1px solid',
                                            borderColor: isTargetDropdownOpen ? 'var(--primary)' : '#e2e8f0',
                                            background: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            boxShadow: isTargetDropdownOpen ? '0 0 0 4px rgba(99, 102, 241, 0.1)' : 'none'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ color: 'var(--primary)', opacity: 0.8 }}>
                                                {assignmentDraft.targetType === 'student' ? <UserRound size={18} /> : <Users size={18} />}
                                            </div>
                                            <span style={{ 
                                                fontSize: '0.92rem', 
                                                fontWeight: 600, 
                                                color: assignmentDraft.targetValue ? 'var(--text-main)' : 'var(--text-muted)' 
                                            }}>
                                                {assignmentDraft.targetValue 
                                                    ? (assignmentDraft.targetType === 'student' 
                                                        ? students.find(s => s.id === assignmentDraft.targetValue)?.name || 'Öğrenci Seçili'
                                                        : assignmentDraft.targetValue)
                                                    : 'Hedef seçimi yapın...'}
                                            </span>
                                        </div>
                                        <div style={{ transform: isTargetDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-muted)' }}>
                                            <ChevronRight size={16} />
                                        </div>
                                    </button>

                                    {/* Dropdown Menu */}
                                    <AnimatePresence>
                                        {isTargetDropdownOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                                                style={{
                                                    position: 'absolute',
                                                    top: 'calc(100% + 8px)',
                                                    left: 0,
                                                    right: 0,
                                                    background: 'white',
                                                    borderRadius: '20px',
                                                    border: '1px solid #e2e8f0',
                                                    boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.15)',
                                                    zIndex: 1000,
                                                    overflow: 'hidden',
                                                    display: 'flex',
                                                    flexDirection: 'column'
                                                }}
                                            >
                                                {/* Search Area */}
                                                <div style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9' }}>
                                                    <div className="search-container" style={{ width: '100%' }}>
                                                        <Search size={16} />
                                                        <input
                                                            type="text"
                                                            placeholder={assignmentDraft.targetType === 'student' ? "Öğrenci ismi ile ara..." : "Sınıf ismi ile ara..."}
                                                            value={targetSearchQuery}
                                                            onChange={(e) => setTargetSearchQuery(e.target.value)}
                                                            autoFocus
                                                            style={{ 
                                                                width: '100%', 
                                                                padding: '0.75rem 1rem 0.75rem 2.85rem', 
                                                                borderRadius: '12px',
                                                                fontSize: '0.85rem'
                                                            }}
                                                        />
                                                    </div>

                                                    {/* Class Filters (Chips) - Only for Student Selection */}
                                                    {assignmentDraft.targetType === 'student' && (
                                                        <div style={{ 
                                                            display: 'flex', 
                                                            gap: '0.5rem', 
                                                            marginTop: '1rem', 
                                                            overflowX: 'auto', 
                                                            paddingBottom: '0.25rem',
                                                            scrollbarWidth: 'none'
                                                        }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setTargetClassFilter('')}
                                                                style={{
                                                                    padding: '0.4rem 0.8rem',
                                                                    borderRadius: '10px',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    whiteSpace: 'nowrap',
                                                                    border: '1px solid',
                                                                    background: targetClassFilter === '' ? 'var(--primary)' : 'white',
                                                                    color: targetClassFilter === '' ? 'white' : 'var(--text-muted)',
                                                                    borderColor: targetClassFilter === '' ? 'var(--primary)' : '#e2e8f0',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >Tümü</button>
                                                            {classOptions.map(cls => (
                                                                <button
                                                                    key={cls}
                                                                    type="button"
                                                                    onClick={() => setTargetClassFilter(cls)}
                                                                    style={{
                                                                        padding: '0.4rem 0.8rem',
                                                                        borderRadius: '10px',
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: 700,
                                                                        whiteSpace: 'nowrap',
                                                                        border: '1px solid',
                                                                        background: targetClassFilter === cls ? 'var(--primary)' : 'white',
                                                                        color: targetClassFilter === cls ? 'white' : 'var(--text-muted)',
                                                                        borderColor: targetClassFilter === cls ? 'var(--primary)' : '#e2e8f0',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >{cls}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Results List */}
                                                <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '0.5rem', overscrollBehavior: 'contain' }}>
                                                    {assignmentDraft.targetType === 'student' ? (
                                                        filteredTargetStudents.length > 0 ? (
                                                            filteredTargetStudents.map(s => (
                                                                <button
                                                                    key={s.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setAssignmentDraft({ ...assignmentDraft, targetValue: s.id });
                                                                        setIsTargetDropdownOpen(false);
                                                                    }}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '0.85rem 1rem',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.85rem',
                                                                        border: 'none',
                                                                        background: assignmentDraft.targetValue === s.id ? '#f5f3ff' : 'transparent',
                                                                        borderRadius: '12px',
                                                                        cursor: 'pointer',
                                                                        textAlign: 'left',
                                                                        transition: 'all 0.15s'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.background = assignmentDraft.targetValue === s.id ? '#f5f3ff' : '#f8fafc'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.background = assignmentDraft.targetValue === s.id ? '#f5f3ff' : 'transparent'}
                                                                >
                                                                    <div style={{ 
                                                                        width: 36, height: 36, borderRadius: '10px', 
                                                                        background: 'color-mix(in srgb, var(--primary), transparent 90%)',
                                                                        color: 'var(--primary)', fontWeight: 800, fontSize: '0.8rem',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                    }}>
                                                                        {s.name.charAt(0)}
                                                                    </div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>{s.name}</div>
                                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{s.class || 'Sınıfsız'}</div>
                                                                    </div>
                                                                    {assignmentDraft.targetValue === s.id && (
                                                                        <CheckCircle2 size={16} color="var(--primary)" />
                                                                    )}
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                                Öğrenci bulunamadı.
                                                            </div>
                                                        )
                                                    ) : (
                                                        filteredTargetClasses.length > 0 ? (
                                                            filteredTargetClasses.map(cls => (
                                                                <button
                                                                    key={cls}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setAssignmentDraft({ ...assignmentDraft, targetValue: cls });
                                                                        setIsTargetDropdownOpen(false);
                                                                    }}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '1rem',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.85rem',
                                                                        border: 'none',
                                                                        background: assignmentDraft.targetValue === cls ? '#f5f3ff' : 'transparent',
                                                                        borderRadius: '12px',
                                                                        cursor: 'pointer',
                                                                        textAlign: 'left',
                                                                        transition: 'all 0.15s'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.background = assignmentDraft.targetValue === cls ? '#f5f3ff' : '#f8fafc'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.background = assignmentDraft.targetValue === cls ? '#f5f3ff' : 'transparent'}
                                                                >
                                                                    <div style={{ 
                                                                        width: 36, height: 36, borderRadius: '10px', 
                                                                        background: 'rgba(168, 85, 247, 0.1)',
                                                                        color: 'var(--secondary)',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                    }}>
                                                                        <Users size={18} />
                                                                    </div>
                                                                    <div style={{ flex: 1, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>{cls}</div>
                                                                    {assignmentDraft.targetValue === cls && (
                                                                        <CheckCircle2 size={16} color="var(--primary)" />
                                                                    )}
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                                Sınıf bulunamadı.
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: '1.25rem', marginTop: '1.75rem' }}>
                            <div className="form-group">
                                <label className="stat-pill-label">Son Teslim</label>
                                <div className="due-picker-shell" ref={duePickerRef}>
                                    <button
                                        type="button"
                                        className={`due-picker-trigger ${isDuePickerOpen ? 'open' : ''}`}
                                        onClick={() => setIsDuePickerOpen((prev) => !prev)}
                                    >
                                        <div className="due-picker-trigger-icon">
                                            <CalendarClock size={18} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                            <span className="due-picker-trigger-label">Teslim Zamanı</span>
                                            <span className="due-picker-trigger-value">
                                                {formatDueLabel(assignmentDraft.dueAt)}
                                            </span>
                                        </div>
                                    </button>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="stat-pill-label">Süre (DK)</label>
                                <input
                                    type="number"
                                    className="premium-input"
                                    placeholder="90"
                                    value={assignmentDraft.expectedDurationMinutes}
                                    onChange={(e) => setAssignmentDraft({ ...assignmentDraft, expectedDurationMinutes: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="stat-pill-label">Tamamlama Türü</label>
                                <select
                                    className="premium-input"
                                    value={assignmentDraft.completionMode}
                                    onChange={(e) => setAssignmentDraft({ ...assignmentDraft, completionMode: e.target.value as CompletionMode })}
                                >
                                    <option value="virtual_optic">Sanal Optik Form</option>
                                    <option value="mark_complete">Sadece Ödev Onayı</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ marginTop: '2.5rem', padding: '1.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '24px', color: 'white', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 10px 20px -10px rgba(99, 102, 241, 0.5)' }}>
                            {isCreatingAssignment && (
                                <div style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', fontSize: '0.74rem', fontWeight: 700, opacity: 0.95 }}>
                                        <span>Atama gönderiliyor...</span>
                                        <span>%{assignmentProgress}</span>
                                    </div>
                                    <div style={{ width: '100%', height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
                                        <div
                                            style={{
                                                width: `${assignmentProgress}%`,
                                                height: '100%',
                                                borderRadius: '999px',
                                                background: 'linear-gradient(90deg, rgba(255,255,255,0.95), rgba(224,231,255,0.95))',
                                                boxShadow: '0 0 16px rgba(255,255,255,0.35)',
                                                transition: 'width 180ms ease',
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: 48, height: 48, borderRadius: '16px', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <CheckCircle2 size={24} />
                                </div>
                                <div style={{ color: 'white' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.8, letterSpacing: '0.1em' }}>Özet Bilgi</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 800 }}>{contentDraft.title.trim() || 'İçerik bekleniyor...'}</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>{estimatedRecipients} öğrenciye gönderilecek</div>
                                </div>
                            </div>
                            <button 
                                className="premium-button" 
                                style={{ background: 'white !important', color: 'var(--primary) !important', height: '48px', padding: '0 1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', opacity: isCreatingAssignment ? 0.75 : 1, cursor: isCreatingAssignment ? 'wait' : 'pointer' }}
                                onClick={handleCreateAssignment}
                                disabled={isCreatingAssignment}
                            >
                                <Send size={18} />
                                {isCreatingAssignment ? 'Gönderiliyor...' : 'Hazırla ve Gönder'}
                            </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Sent Assignments */}
            <div style={{ marginTop: '2rem' }}>
                <div className="premium-card" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                        <div style={{ width: 42, height: 42, borderRadius: '14px', background: 'rgba(168, 85, 247, 0.1)', color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Send size={22} />
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Gönderilen Atamalar</h4>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Son gönderilen çalışmalar</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {recentAssignments.length === 0 ? (
                            <div className="premium-empty-state">
                                <div className="empty-state-icon"><CalendarClock size={32} /></div>
                                <h4>Henüz Atama Yok</h4>
                            </div>
                        ) : (
                            recentAssignments.map((assignment) => {
                                const content = assignment.content;
                                if (!content) return null;
                                
                                const typeMeta = contentTypeMeta[content.contentType];
                                return (
                                    <div key={assignment.id} className="premium-glass" style={{ padding: '1.25rem', background: 'white', border: '1px solid #f1f5f9', borderRadius: '18px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                                                    <span style={{ 
                                                        background: typeMeta.bg, 
                                                        color: typeMeta.color, 
                                                        fontSize: '0.55rem', 
                                                        fontWeight: 900, 
                                                        padding: '0.15rem 0.45rem', 
                                                        borderRadius: '5px',
                                                        textTransform: 'uppercase'
                                                    }}>{typeMeta.label}</span>
                                                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 850, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{content.title}</h4>
                                                </div>
                                                
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.2rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
                                                        <UserRound size={13} style={{ color: 'var(--primary)' }} /> 
                                                        {getTargetLabel(assignment)}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                                        <CalendarClock size={13} /> 
                                                        Teslim: {new Date(assignment.dueAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', gap: '0.5rem', flexShrink: 0 }}>
                                                <div style={{ 
                                                    fontSize: '0.65rem', 
                                                    fontWeight: 800, 
                                                    color: 'white', 
                                                    background: 'var(--primary)', 
                                                    padding: '0.35rem 0.75rem', 
                                                    borderRadius: '10px',
                                                    boxShadow: '0 4px 10px rgba(99, 102, 241, 0.2)'
                                                }}>
                                                    {getCompletionLabel(assignment.completionMode)}
                                                </div>
                                                {assignment.recipientCount ? (
                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>
                                                        {assignment.recipientCount} Öğrenci
                                                    </div>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteAssignment(assignment, content.title)}
                                                    style={{
                                                        border: 'none',
                                                        background: 'transparent',
                                                        color: '#cbd5e1',
                                                        cursor: 'pointer',
                                                        padding: '0.35rem',
                                                        borderRadius: '10px',
                                                        transition: 'all 0.2s',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.color = '#ef4444';
                                                        e.currentTarget.style.background = '#fef2f2';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.color = '#cbd5e1';
                                                        e.currentTarget.style.background = 'transparent';
                                                    }}
                                                    aria-label="Atamayı sil"
                                                    title="Atamayı sil"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default ContentAssignmentCenter;
