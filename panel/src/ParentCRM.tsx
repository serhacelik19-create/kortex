import React, { useState, useEffect } from 'react';
import {
    Users,
    FileText,
    Send,
    Search,
    CheckCircle2,
    Clock,
    ExternalLink,
    X,
    Activity,
    RefreshCcw,
    Sparkles,
    Bell,
    Link2,
    Copy,
    ChevronDown,
    Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api';
import { usePanelToast } from './components/PanelToastProvider';
import { usePanelConfirm } from './components/PanelConfirmProvider';

interface ParentCRMProps {
    onSelectStudent: (id: number) => void;
}

const ParentCRM: React.FC<ParentCRMProps> = ({ onSelectStudent }) => {
    const { showToast } = usePanelToast();
    const { confirm } = usePanelConfirm();
    const [isGenerating, setIsGenerating] = useState(false);
    const [parents, setParents] = useState<any[]>([]);
    const [, setStats] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [crmStatusFilter, setCrmStatusFilter] = useState<'all' | 'sent' | 'ready' | 'pending'>('all');
    const [crmClassFilter, setCrmClassFilter] = useState('all');
    const [aiReportSample, setAiReportSample] = useState<string>('');
    const [generatingSpecific, setGeneratingSpecific] = useState<Record<number, boolean>>({});
    const [sendingReportNotification, setSendingReportNotification] = useState<Record<number, boolean>>({});
    const [selectedParentForPreview, setSelectedParentForPreview] = useState<any>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [batchDraftIntro, setBatchDraftIntro] = useState('');
    const [isDraftLoading, setIsDraftLoading] = useState(false);
    const [activationLinks, setActivationLinks] = useState<Record<number, string>>({});
    const [parentNotificationHistory, setParentNotificationHistory] = useState<any[]>([]);
    const [parentNotificationClassFilter, setParentNotificationClassFilter] = useState('all');
    const [selectedParentNotification, setSelectedParentNotification] = useState<any>(null);
    const [notificationStudentSearch, setNotificationStudentSearch] = useState('');
    const [notificationClassSearch, setNotificationClassSearch] = useState('');
    const [parentNotificationDraft, setParentNotificationDraft] = useState({
        target: 'all' as 'all' | 'class' | 'student',
        className: '',
        studentId: '',
        title: '',
        body: '',
        priority: 'normal' as 'normal' | 'urgent',
    });
    const [isSendingParentNotification, setIsSendingParentNotification] = useState(false);
    const [notificationPickerOpen, setNotificationPickerOpen] = useState<'class' | 'student' | null>(null);
    const [crmClassFilterOpen, setCrmClassFilterOpen] = useState(false);
    const [parentNotificationClassFilterOpen, setParentNotificationClassFilterOpen] = useState(false);

    const fetchData = async () => {
        try {
            const [parentsRes, statsRes, sampleRes] = await Promise.all([
                api.getParents(),
                api.getCrmStats(),
                api.getReportSample()
            ]);
            setParents(parentsRes);
            setStats(statsRes);
            if (sampleRes?.report) {
                setAiReportSample(sampleRes.report);
            }
        } catch (err) {
            console.error('Data fetch error:', err);
        }
    };

    const fetchParentNotificationHistory = async () => {
        try {
            const history = await api.getParentNotificationHistory();
            setParentNotificationHistory(history);
        } catch (err) {
            console.error('Parent notification history error:', err);
        }
    };

    const handleSendSingleReportNotification = async (item: any) => {
        if (!item.aiExamReport) {
            showToast({ type: 'warning', title: 'Rapor Yok', message: 'Önce AI raporu oluşturun.' });
            return;
        }

        setSendingReportNotification(prev => ({ ...prev, [item.id]: true }));
        try {
            const res = await api.sendParentReportNotification({ mode: 'single', studentId: item.id });
            setParents(prev => prev.map(p => p.id === item.id ? { ...p, status: 'sent', lastReport: 'Bugün' } : p));
            if (selectedParentForPreview?.id === item.id) {
                setSelectedParentForPreview((prev: any) => ({ ...prev, status: 'sent', lastReport: 'Bugün' }));
            }
            showToast({
                type: 'success',
                title: 'Bildirim Gönderildi',
                message: `${res.notifiedCount || 1} veli bildirimi oluşturuldu.`,
            });
            fetchParentNotificationHistory();
        } catch (err: any) {
            const message = err?.response?.data?.error || 'Rapor bildirimi gönderilemedi.';
            showToast({ type: 'warning', title: 'Veli uygulaması aktif değil', message });
        } finally {
            setSendingReportNotification(prev => ({ ...prev, [item.id]: false }));
        }
    };

    const handleSendReadyReports = async () => {
        setIsSendingParentNotification(true);
        try {
            const res = await api.sendParentReportNotification({ mode: 'ready' });
            if (res.notifiedCount > 0) {
                const notifiedIds = new Set((res.notifiedStudents || []).map((student: any) => student.id));
                setParents(prev => prev.map(p => (
                    notifiedIds.has(p.id)
                        ? { ...p, status: 'sent', lastReport: 'Bugün' }
                        : p
                )));
            }
            showToast({
                type: res.notifiedCount > 0 ? 'success' : 'info',
                title: 'Toplu Bildirim Özeti',
                message: `${res.notifiedCount || 0} gönderildi, ${res.missingParentSessionCount || 0} veli uygulaması aktif değil, ${res.skippedNoReportCount || 0} raporsuz öğrenci atlandı.`,
            });
            fetchParentNotificationHistory();
        } catch (err: any) {
            showToast({ type: 'error', title: 'Toplu bildirim gönderilemedi', message: err?.response?.data?.error || 'Lütfen tekrar deneyin.' });
        } finally {
            setIsSendingParentNotification(false);
        }
    };

    const handleCreateParentActivation = async (item: any) => {
        try {
            const res = await api.createParentActivation({
                studentId: item.id,
                parentPhone: item.phone,
                expiresInHours: 72,
            });
            setActivationLinks(prev => ({ ...prev, [item.id]: res.link }));
            await navigator.clipboard?.writeText(res.link);
            showToast({ type: 'success', title: 'Veli linki hazır', message: 'Link panoya kopyalandı. 72 saat içinde tek kez kullanılabilir.' });
        } catch (err: any) {
            console.error('Parent activation error:', err);
            showToast({ type: 'error', title: 'Link oluşturulamadı', message: err?.response?.data?.error || 'Lütfen tekrar deneyin.' });
        }
    };

    const handleCopyActivationLink = async (studentId: number) => {
        const link = activationLinks[studentId];
        if (!link) return;
        await navigator.clipboard?.writeText(link);
        showToast({ type: 'success', title: 'Kopyalandı', message: 'Veli aktivasyon linki panoya kopyalandı.' });
    };

    const handleSendParentNotification = async () => {
        const title = parentNotificationDraft.title.trim();
        const body = parentNotificationDraft.body.trim();
        if (!title || !body) {
            showToast({ type: 'error', title: 'Eksik bilgi', message: 'Başlık ve mesaj zorunludur.' });
            return;
        }
        if (parentNotificationDraft.target === 'class' && !parentNotificationDraft.className) {
            showToast({ type: 'error', title: 'Sınıf seçin', message: 'Sınıf hedefi için bir sınıf seçilmelidir.' });
            return;
        }
        if (parentNotificationDraft.target === 'student' && !parentNotificationDraft.studentId) {
            showToast({ type: 'error', title: 'Öğrenci seçin', message: 'Tek öğrenci hedefi için bir öğrenci seçilmelidir.' });
            return;
        }

        setIsSendingParentNotification(true);
        try {
            const res = await api.sendParentNotification({
                target: parentNotificationDraft.target,
                title,
                body,
                priority: parentNotificationDraft.priority,
                type: 'general',
                className: parentNotificationDraft.target === 'class' ? parentNotificationDraft.className : undefined,
                studentId: parentNotificationDraft.target === 'student' ? Number(parentNotificationDraft.studentId) : undefined,
            });
            showToast({ type: 'success', title: 'Bildirim kaydedildi', message: `${res.recipientCount || 0} aktif veli cihazına hazırlandı.` });
            setParentNotificationDraft(prev => ({ ...prev, title: '', body: '' }));
            fetchParentNotificationHistory();
        } catch (err: any) {
            console.error('Parent notification send error:', err);
            showToast({ type: 'error', title: 'Bildirim gönderilemedi', message: err?.response?.data?.error || 'Lütfen tekrar deneyin.' });
        } finally {
            setIsSendingParentNotification(false);
        }
    };

    const handleDeleteParentNotification = async (notification: any) => {
        const ok = await confirm({
            title: 'Bildirim silinsin mi?',
            message: 'Bu bildirim panelden ve veli uygulamasından kaldırılır. Bu işlem geri alınamaz.',
            confirmLabel: 'Sil',
            cancelLabel: 'Vazgeç',
            tone: 'danger',
        });
        if (!ok) return;

        setSelectedParentNotification(null);
        try {
            await api.deleteParentNotification(notification.id);
            setParentNotificationHistory(prev => prev.filter(item => item.id !== notification.id));
            showToast({ type: 'success', title: 'Bildirim silindi', message: 'Bildirim veli uygulamasından da kaldırıldı.' });
        } catch (err: any) {
            showToast({ type: 'error', title: 'Silinemedi', message: err?.response?.data?.error || 'Bildirim silinirken bir hata oluştu.' });
        }
    };

    const handleGenerateStudentReport = async (studentId: number) => {
        const student = parents.find(p => p.id === studentId);
        if (student?.aiExamReport) {
            const confirmGenerate = await confirm({
                title: 'Rapor yenilensin mi?',
                message: 'Mevcut rapor yeniden üretilecek. Devam etmek istiyor musunuz?',
                confirmLabel: 'Devam et',
                cancelLabel: 'Vazgeç',
                tone: 'warning',
            });
            if (!confirmGenerate) return;
        }

        setGeneratingSpecific(prev => ({ ...prev, [studentId]: true }));
        try {
            const res = await api.updateStudentAi(studentId, 'aiExamReport');
            if (res.success) {
                const updatedStudent = res.ai_data;
                setParents((prev: any[]) => prev.map(p => p.id === studentId ? { ...p, aiExamReport: updatedStudent.aiExamReport, isIndividualReport: true, status: 'ready', lastReport: 'Bugün' } : p));
                if (selectedParentForPreview?.id === studentId) {
                    setSelectedParentForPreview((prev: any) => ({ ...prev, aiExamReport: updatedStudent.aiExamReport, isIndividualReport: true, status: 'ready', lastReport: 'Bugün' }));
                }
            }
        } catch (err) {
            console.error('Student report generation error:', err);
        } finally {
            setGeneratingSpecific(prev => ({ ...prev, [studentId]: false }));
        }
    };

    useEffect(() => {
        fetchData();
        fetchParentNotificationHistory();
    }, []);

    useEffect(() => {
        const isAnyModalOpen = showBatchModal || showPreviewModal;
        if (!isAnyModalOpen) return undefined;

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        const previousBodyTouchAction = document.body.style.touchAction;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
            document.body.style.touchAction = previousBodyTouchAction;
        };
    }, [showBatchModal, showPreviewModal]);

    const handleStartBatchProcess = async () => {
        setIsDraftLoading(true);
        setShowBatchModal(true);
        try {
            const res = await api.getBatchSuggestIntro();
            setBatchDraftIntro(res.suggestion);
        } catch (err) {
            console.error('Draft suggestion error:', err);
            // Statik metin yerine veritabanındaki mevcut şablonu fallback olarak kullanıyoruz.
            setBatchDraftIntro(aiReportSample || "Merhaba değerli velimiz, haftalık gelişim raporumuz aşağıda sunulmuştur.");
        } finally {
            setIsDraftLoading(false);
        }
    };

    const handleConfirmBatchGenerate = async () => {
        setIsGenerating(true);
        setShowBatchModal(false);
        try {
            const res = await api.batchGenerateReports(batchDraftIntro);
            if (res.success) {
                showToast({ type: 'success', title: 'İşlem Tamamlandı', message: res.message });
                fetchData();
            }
        } catch (err) {
            console.error('Batch generation error:', err);
            showToast({ type: 'error', title: 'Toplu Üretim Hatası', message: 'Toplu üretim sırasında bir hata oluştu.' });
        } finally {
            setIsGenerating(false);
        }
    };

    const classOptions = Array.from(new Set(parents.map(p => p.class).filter(Boolean))).sort();
    const filteredParents = parents.filter(p => {
        const matchesSearch =
            (p.parent?.toLocaleLowerCase('tr-TR') || '').includes(searchTerm.toLocaleLowerCase('tr-TR')) ||
            (p.student?.toLocaleLowerCase('tr-TR') || '').includes(searchTerm.toLocaleLowerCase('tr-TR')) ||
            (p.class?.toLocaleLowerCase('tr-TR') || '').includes(searchTerm.toLocaleLowerCase('tr-TR'));
        const matchesStatus = crmStatusFilter === 'all' || p.status === crmStatusFilter;
        const matchesClass = crmClassFilter === 'all' || p.class === crmClassFilter;
        return matchesSearch && matchesStatus && matchesClass;
    });
    const crmStatusOptions = [
        { id: 'all', label: 'Tüm durumlar' },
        { id: 'sent', label: 'Gönderildi' },
        { id: 'ready', label: 'Rapor Oluşturuldu' },
        { id: 'pending', label: 'Analiz Bekliyor' },
    ] as const;
    const normalizedNotificationClassSearch = notificationClassSearch.trim().toLocaleLowerCase('tr-TR');
    const filteredClassOptions = normalizedNotificationClassSearch
        ? classOptions.filter(className => className.toLocaleLowerCase('tr-TR').includes(normalizedNotificationClassSearch))
        : classOptions;
    const studentsForNotification = [...parents].sort((a, b) =>
        (a.student || '').localeCompare(b.student || '', 'tr-TR')
    );
    const normalizedNotificationStudentSearch = notificationStudentSearch.trim().toLocaleLowerCase('tr-TR');
    const filteredStudentsForNotification = normalizedNotificationStudentSearch
        ? studentsForNotification.filter(item =>
            (item.student || '').toLocaleLowerCase('tr-TR').includes(normalizedNotificationStudentSearch) ||
            (item.class || '').toLocaleLowerCase('tr-TR').includes(normalizedNotificationStudentSearch) ||
            (item.parent || '').toLocaleLowerCase('tr-TR').includes(normalizedNotificationStudentSearch)
        )
        : studentsForNotification;
    const targetOptions = [
        { id: 'all', label: 'Tüm Veliler', icon: Users },
        { id: 'class', label: 'Sınıf', icon: Bell },
        { id: 'student', label: 'Öğrenci', icon: CheckCircle2 },
    ] as const;
    const priorityOptions = [
        { id: 'normal', label: 'Normal', color: 'var(--primary)' },
        { id: 'urgent', label: 'Acil', color: '#b91c1c' },
    ] as const;
    const fieldLabelStyle: React.CSSProperties = {
        fontSize: '0.72rem',
        color: 'var(--text-muted)',
        fontWeight: 800,
        textTransform: 'uppercase',
        marginBottom: '0.45rem',
    };
    const pickerButtonStyle: React.CSSProperties = {
        width: '100%',
        minHeight: 44,
        padding: '0 2.45rem 0 0.9rem',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        background: '#fff',
        color: 'var(--text-main)',
        fontSize: '0.88rem',
        fontWeight: 700,
        outline: 'none',
        display: 'flex',
        alignItems: 'center',
        textAlign: 'left',
        cursor: 'pointer',
    };
    const pickerMenuStyle: React.CSSProperties = {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 'calc(100% + 6px)',
        zIndex: 30,
        maxHeight: 240,
        overflowY: 'auto',
        padding: 6,
        border: '1px solid var(--border-color)',
        borderRadius: 14,
        background: '#fff',
        boxShadow: '0 18px 36px rgba(15, 23, 42, 0.16)',
    };
    const selectedStudentForNotification = studentsForNotification.find(item => String(item.id) === parentNotificationDraft.studentId);
    const formatParentNotificationDate = (date?: string) => {
        if (!date) return '';
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return '';
        return parsed.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    };
    const getNotificationClassName = (item: any) => item.className || item.student?.class || '';
    const getNotificationTargetLabel = (item: any) => {
        if (item.target === 'all') return 'Tüm veliler';
        if (item.target === 'class') return `${item.className || 'Sınıf'} sınıfı`;
        return item.student?.name || 'Öğrenci';
    };
    const getNotificationTypeLabel = (type?: string) => {
        switch (type) {
            case 'attendance':
                return 'Devamsızlık';
            case 'exam':
                return 'Sınav';
            case 'guidance':
                return 'Rehberlik';
            case 'report':
                return 'Rapor';
            default:
                return 'Genel';
        }
    };
    const filteredParentNotificationHistory = parentNotificationHistory.filter(item => {
        if (parentNotificationClassFilter === 'all') return true;
        if (item.target === 'all') return true;
        return getNotificationClassName(item) === parentNotificationClassFilter;
    });
    const todayNotificationCount = filteredParentNotificationHistory.filter(item => {
        if (!item.createdAt) return false;
        const created = new Date(item.createdAt);
        const now = new Date();
        return !Number.isNaN(created.getTime()) &&
            created.getFullYear() === now.getFullYear() &&
            created.getMonth() === now.getMonth() &&
            created.getDate() === now.getDate();
    }).length;
    const filteredRecipientCount = filteredParentNotificationHistory.reduce((sum, item) => sum + (item.recipientCount || 0), 0);
    const filteredReadCount = filteredParentNotificationHistory.reduce((sum, item) => sum + (item.readCount || 0), 0);
    const filteredReadRate = filteredRecipientCount > 0 ? Math.round((filteredReadCount / filteredRecipientCount) * 100) : 0;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="main-content">
            <div className="page-header">
                <div className="crm-header-text">
                    <h1 className="crm-page-title" style={{ margin: 0 }}>Veli İletişim Merkezi</h1>
                    <p className="crm-page-subtitle" style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Velilere yönelik haftalık raporlar ve iletişim yönetimi.</p>
                </div>
                <div className="page-header-actions">
                    <button
                        onClick={handleStartBatchProcess}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem 1.5rem', background: 'var(--primary)' }}
                        disabled={isGenerating}
                    >
                        {isGenerating ? <Clock size={18} className="animate-spin" /> : <Sparkles size={18} />}
                        {isGenerating ? 'Üretiliyor...' : 'Toplu Rapor Üret (AI)'}
                    </button>
                    <button
                        onClick={handleSendReadyReports}
                        className="btn-primary"
                        disabled={isSendingParentNotification}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem 1.5rem' }}
                    >
                        {isSendingParentNotification ? <RefreshCcw size={18} className="animate-spin" /> : <Send size={18} />}
                        {'Hazır Raporları Bildirimle Gönder'}
                    </button>
                </div>
            </div>

            <div className="dashboard-grid">
                <div className="card col-span-12" style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 0.8fr)', gap: '1.5rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Bell size={20} />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Veli Bildirimi Gönder</h2>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>Aktif veli cihazlarına uygulama içi bildirim kaydı oluşturur.</p>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(160px, 220px)', gap: '0.85rem', marginBottom: '0.85rem', alignItems: 'end' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={fieldLabelStyle}>Alıcı</div>
                                <div style={{ display: 'inline-flex', padding: 3, border: '1px solid var(--border-color)', borderRadius: 12, background: '#f8fafc', maxWidth: '100%' }}>
                                    {targetOptions.map(option => {
                                        const Icon = option.icon;
                                        const isActive = parentNotificationDraft.target === option.id;
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                aria-pressed={isActive}
                                                onClick={() => setParentNotificationDraft(prev => ({
                                                    ...prev,
                                                    target: option.id,
                                                    className: option.id === 'class' ? prev.className : '',
                                                    studentId: option.id === 'student' ? prev.studentId : '',
                                                }))}
                                                onMouseDown={() => setNotificationPickerOpen(null)}
                                                style={{
                                                    height: 38,
                                                    padding: '0 0.72rem',
                                                    borderRadius: 9,
                                                    border: 'none',
                                                    background: isActive ? 'white' : 'transparent',
                                                    color: isActive ? 'var(--primary)' : 'var(--text-main)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.38rem',
                                                    cursor: 'pointer',
                                                    boxShadow: isActive ? '0 4px 10px rgba(15, 23, 42, 0.08)' : 'none',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                <Icon size={16} />
                                                <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{option.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={fieldLabelStyle}>Öncelik</div>
                                <div style={{ display: 'inline-flex', padding: 3, border: '1px solid var(--border-color)', borderRadius: 12, background: '#f8fafc', width: '100%' }}>
                                    {priorityOptions.map(option => {
                                        const isActive = parentNotificationDraft.priority === option.id;
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                aria-pressed={isActive}
                                                onClick={() => setParentNotificationDraft(prev => ({ ...prev, priority: option.id }))}
                                                style={{
                                                    flex: 1,
                                                    height: 38,
                                                    padding: '0 0.75rem',
                                                    borderRadius: 9,
                                                    border: 'none',
                                                    background: isActive ? 'white' : 'transparent',
                                                    color: isActive ? option.color : 'var(--text-main)',
                                                    cursor: 'pointer',
                                                    fontWeight: 800,
                                                    fontSize: '0.82rem',
                                                    boxShadow: isActive ? '0 4px 10px rgba(15, 23, 42, 0.08)' : 'none',
                                                }}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {parentNotificationDraft.target === 'all' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minHeight: 38, marginBottom: '0.85rem', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 650 }}>
                                <Users size={15} />
                                Aktif veli cihazı olan tüm velilere gönderilir.
                            </div>
                        ) : (
                            <div style={{ marginBottom: '0.85rem' }}>
                                <div style={fieldLabelStyle}>
                                    {parentNotificationDraft.target === 'class' ? 'Sınıf Seçimi' : 'Öğrenci Seçimi'}
                                </div>
                                <div
                                    style={{ position: 'relative', maxWidth: parentNotificationDraft.target === 'student' ? 520 : 320 }}
                                    onBlur={(event) => {
                                        const nextFocus = event.relatedTarget as Node | null;
                                        if (!nextFocus || !event.currentTarget.contains(nextFocus)) {
                                            setNotificationPickerOpen(null);
                                        }
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const pickerTarget = parentNotificationDraft.target === 'class' ? 'class' : 'student';
                                            if (pickerTarget === 'class') setNotificationClassSearch('');
                                            if (pickerTarget === 'student') setNotificationStudentSearch('');
                                            setNotificationPickerOpen(prev => (prev === pickerTarget ? null : pickerTarget));
                                        }}
                                        disabled={parentNotificationDraft.target === 'class' ? classOptions.length === 0 : studentsForNotification.length === 0}
                                        style={{
                                            ...pickerButtonStyle,
                                            opacity: parentNotificationDraft.target === 'class' && classOptions.length === 0 ? 0.65 : 1,
                                        }}
                                    >
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {parentNotificationDraft.target === 'class'
                                                ? parentNotificationDraft.className || (classOptions.length === 0 ? 'Sınıf bulunamadı' : 'Sınıf seç')
                                                : selectedStudentForNotification
                                                    ? `${selectedStudentForNotification.student}${selectedStudentForNotification.class ? ` - ${selectedStudentForNotification.class}` : ''}`
                                                    : 'Öğrenci seç'}
                                        </span>
                                    </button>
                                    <ChevronDown
                                        size={18}
                                        style={{
                                            position: 'absolute',
                                            right: 12,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: 'var(--text-muted)',
                                            pointerEvents: 'none',
                                        }}
                                    />
                                    {notificationPickerOpen === parentNotificationDraft.target && (
                                        <div style={pickerMenuStyle}>
                                            {parentNotificationDraft.target === 'class' ? (
                                                <>
                                                    <div style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fff', padding: '0.25rem 0.25rem 0.55rem' }}>
                                                        <div style={{ position: 'relative' }}>
                                                            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                                            <input
                                                                autoFocus
                                                                value={notificationClassSearch}
                                                                onChange={(e) => setNotificationClassSearch(e.target.value)}
                                                                onKeyDown={(e) => e.stopPropagation()}
                                                                placeholder="Sınıf ara..."
                                                                style={{
                                                                    width: '100%',
                                                                    height: 38,
                                                                    border: '1px solid var(--border-color)',
                                                                    borderRadius: 10,
                                                                    padding: '0 0.75rem 0 2rem',
                                                                    outline: 'none',
                                                                    fontSize: '0.82rem',
                                                                    fontWeight: 700,
                                                                    color: 'var(--text-main)',
                                                                    background: '#f8fafc',
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    {filteredClassOptions.length === 0 ? (
                                                        <div style={{ padding: '0.8rem', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
                                                            Aramaya uygun sınıf bulunamadı.
                                                        </div>
                                                    ) : filteredClassOptions.map(className => {
                                                    const isActive = parentNotificationDraft.className === className;
                                                    return (
                                                        <button
                                                            key={className}
                                                            type="button"
                                                            onClick={() => {
                                                                setParentNotificationDraft(prev => ({ ...prev, className }));
                                                                setNotificationClassSearch('');
                                                                setNotificationPickerOpen(null);
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                minHeight: 38,
                                                                padding: '0.55rem 0.7rem',
                                                                border: 'none',
                                                                borderRadius: 10,
                                                                background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                                                color: isActive ? 'var(--primary)' : 'var(--text-main)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                gap: '0.75rem',
                                                                cursor: 'pointer',
                                                                fontWeight: 750,
                                                                textAlign: 'left',
                                                            }}
                                                        >
                                                            <span>{className}</span>
                                                            {isActive && <CheckCircle2 size={15} />}
                                                        </button>
                                                    );
                                                })}
                                                </>
                                            ) : (
                                                <>
                                                    <div style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fff', padding: '0.25rem 0.25rem 0.55rem' }}>
                                                        <div style={{ position: 'relative' }}>
                                                            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                                            <input
                                                                autoFocus
                                                                value={notificationStudentSearch}
                                                                onChange={(e) => setNotificationStudentSearch(e.target.value)}
                                                                onKeyDown={(e) => e.stopPropagation()}
                                                                placeholder="Öğrenci, veli veya sınıf ara..."
                                                                style={{
                                                                    width: '100%',
                                                                    height: 38,
                                                                    border: '1px solid var(--border-color)',
                                                                    borderRadius: 10,
                                                                    padding: '0 0.75rem 0 2rem',
                                                                    outline: 'none',
                                                                    fontSize: '0.82rem',
                                                                    fontWeight: 700,
                                                                    color: 'var(--text-main)',
                                                                    background: '#f8fafc',
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    {filteredStudentsForNotification.length === 0 ? (
                                                        <div style={{ padding: '0.8rem', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
                                                            Aramaya uygun öğrenci bulunamadı.
                                                        </div>
                                                    ) : filteredStudentsForNotification.map(item => {
                                                    const isActive = parentNotificationDraft.studentId === String(item.id);
                                                    return (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setParentNotificationDraft(prev => ({ ...prev, studentId: String(item.id) }));
                                                                setNotificationStudentSearch('');
                                                                setNotificationPickerOpen(null);
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                minHeight: 40,
                                                                padding: '0.55rem 0.7rem',
                                                                border: 'none',
                                                                borderRadius: 10,
                                                                background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                                                color: isActive ? 'var(--primary)' : 'var(--text-main)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                gap: '0.75rem',
                                                                cursor: 'pointer',
                                                                textAlign: 'left',
                                                            }}
                                                        >
                                                            <span style={{ minWidth: 0 }}>
                                                                <span style={{ display: 'block', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.student}</span>
                                                                <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 650 }}>{item.class || 'Sınıf yok'}</span>
                                                            </span>
                                                            {isActive && <CheckCircle2 size={15} />}
                                                        </button>
                                                    );
                                                })}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                            <input
                                value={parentNotificationDraft.title}
                                onChange={(e) => setParentNotificationDraft(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="Bildirim başlığı"
                                style={{ width: '100%', padding: '0.9rem 1rem', border: '1px solid var(--border-color)', borderRadius: 14, fontSize: '0.95rem', outline: 'none' }}
                            />
                            <textarea
                                value={parentNotificationDraft.body}
                                onChange={(e) => setParentNotificationDraft(prev => ({ ...prev, body: e.target.value }))}
                                placeholder="Velilere gösterilecek mesaj"
                                rows={4}
                                style={{ width: '100%', padding: '0.9rem 1rem', border: '1px solid var(--border-color)', borderRadius: 14, resize: 'vertical', fontSize: '0.95rem', lineHeight: 1.5, outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                            <button
                                className="btn-primary"
                                onClick={handleSendParentNotification}
                                disabled={isSendingParentNotification}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                {isSendingParentNotification ? <RefreshCcw size={16} className="animate-spin" /> : <Send size={16} />}
                                Gönder
                            </button>
                        </div>
                    </div>
                    <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '1.5rem', minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.8rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900 }}>Bildirim Takibi</h3>
                                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.76rem', fontWeight: 650 }}>Gönderim ve okunma özeti</p>
                            </div>
                            <button
                                type="button"
                                onClick={fetchParentNotificationHistory}
                                style={{ border: '1px solid var(--border-color)', background: '#fff', color: 'var(--text-muted)', borderRadius: 10, width: 34, height: 34, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                                title="Bildirim geçmişini yenile"
                            >
                                <RefreshCcw size={14} />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.55rem', marginBottom: '0.85rem' }}>
                            {[
                                { label: 'Bugün gönderilen', value: todayNotificationCount },
                                { label: 'Okunma oranı', value: `%${filteredReadRate}` },
                            ].map(stat => (
                                <div key={stat.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: '#f8fafc', padding: '0.65rem 0.7rem' }}>
                                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>{stat.label}</div>
                                    <div style={{ marginTop: 2, fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)' }}>{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        <div
                            style={{ position: 'relative', display: 'inline-block', marginBottom: '0.75rem' }}
                            onBlur={(event) => {
                                const nextFocus = event.relatedTarget as Node | null;
                                if (!nextFocus || !event.currentTarget.contains(nextFocus)) {
                                    setParentNotificationClassFilterOpen(false);
                                }
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setParentNotificationClassFilterOpen(prev => !prev)}
                                style={{
                                    border: `1px solid ${parentNotificationClassFilter !== 'all' ? 'var(--primary)' : 'var(--border-color)'}`,
                                    background: parentNotificationClassFilter !== 'all' ? 'rgba(99, 102, 241, 0.1)' : '#fff',
                                    color: parentNotificationClassFilter !== 'all' ? 'var(--primary)' : 'var(--text-muted)',
                                    borderRadius: 999,
                                    padding: '0.45rem 0.75rem',
                                    fontSize: '0.74rem',
                                    fontWeight: 850,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                }}
                            >
                                {parentNotificationClassFilter === 'all' ? 'Sınıflar' : parentNotificationClassFilter}
                                <ChevronDown size={14} />
                            </button>
                            {parentNotificationClassFilterOpen && (
                                <div style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 'calc(100% + 8px)',
                                    zIndex: 45,
                                    minWidth: 190,
                                    padding: 6,
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 14,
                                    background: '#fff',
                                    boxShadow: '0 18px 36px rgba(15, 23, 42, 0.16)',
                                }}>
                                    {['all', ...classOptions].map(className => {
                                        const isActive = parentNotificationClassFilter === className;
                                        return (
                                            <button
                                                key={className}
                                                type="button"
                                                onClick={() => {
                                                    setParentNotificationClassFilter(className);
                                                    setParentNotificationClassFilterOpen(false);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    minHeight: 38,
                                                    padding: '0.55rem 0.7rem',
                                                    border: 'none',
                                                    borderRadius: 10,
                                                    background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                                    color: isActive ? 'var(--primary)' : 'var(--text-main)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '0.75rem',
                                                    cursor: 'pointer',
                                                    fontWeight: 800,
                                                    textAlign: 'left',
                                                }}
                                            >
                                                <span>{className === 'all' ? 'Tüm sınıflar' : className}</span>
                                                {isActive && <CheckCircle2 size={15} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: 318, overflowY: 'auto', paddingRight: 2 }}>
                            {filteredParentNotificationHistory.length === 0 ? (
                                <div style={{ border: '1px dashed var(--border-color)', borderRadius: 16, background: '#f8fafc', padding: '1.1rem', color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', color: 'var(--text-main)', fontSize: '0.88rem', fontWeight: 900 }}>
                                        <Bell size={16} color="var(--primary)" />
                                        Henüz bildirim gönderilmedi
                                    </div>
                                    <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', lineHeight: 1.45, fontWeight: 650 }}>
                                        Sol taraftan ilk veli bildiriminizi oluşturabilirsiniz.
                                    </p>
                                </div>
                            ) : filteredParentNotificationHistory.slice(0, 10).map(item => {
                                const isUrgent = item.priority === 'urgent';
                                const recipientCount = item.recipientCount || 0;
                                const readCount = item.readCount || 0;
                                const readPercent = recipientCount > 0 ? Math.round((readCount / recipientCount) * 100) : 0;
                                const typeLabel = getNotificationTypeLabel(item.type);
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setSelectedParentNotification(item)}
                                        style={{ width: '100%', border: '1px solid var(--border-color)', borderLeft: `4px solid ${isUrgent ? '#dc2626' : 'var(--primary)'}`, borderRadius: 12, padding: '0.78rem 0.85rem', background: '#fff', cursor: 'pointer', textAlign: 'left' }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.3rem' }}>
                                                    <span style={{ background: isUrgent ? '#fef2f2' : 'rgba(99, 102, 241, 0.08)', color: isUrgent ? '#b91c1c' : 'var(--primary)', borderRadius: 999, padding: '0.22rem 0.5rem', fontSize: '0.65rem', fontWeight: 900 }}>
                                                        {typeLabel}
                                                    </span>
                                                </div>
                                                <strong style={{ display: 'block', fontSize: '0.84rem', lineHeight: 1.28, minWidth: 0 }}>{item.title}</strong>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ background: isUrgent ? '#fef2f2' : '#f8fafc', color: isUrgent ? '#b91c1c' : 'var(--text-muted)', borderRadius: 999, padding: '0.22rem 0.5rem', fontSize: '0.66rem', fontWeight: 900 }}>
                                                    {isUrgent ? 'Acil' : 'Normal'}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.45rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getNotificationTargetLabel(item)}</span>
                                            <span style={{ flexShrink: 0 }}>
                                                {readCount}/{recipientCount} okundu
                                                {formatParentNotificationDate(item.createdAt) ? ` · ${formatParentNotificationDate(item.createdAt)}` : ''}
                                            </span>
                                        </div>
                                        <div style={{ height: 5, background: '#eef2f7', borderRadius: 999, marginTop: '0.55rem', overflow: 'hidden' }}>
                                            <div style={{ width: `${readPercent}%`, height: '100%', background: isUrgent ? '#ef4444' : 'var(--primary)', borderRadius: 999 }} />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="card col-span-12 crm-main-card" style={{ padding: 0 }}>
                    <div className="crm-filter-stats-row" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) auto', gap: '1rem', alignItems: 'start' }}>
                        <div style={{ minWidth: 0 }}>
                            <div className="crm-search-wrapper" style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Veli, öğrenci veya sınıf ara..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.5rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '10px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
                                {crmStatusOptions.map(option => {
                                    const isActive = crmStatusFilter === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => setCrmStatusFilter(option.id)}
                                            style={{
                                                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border-color)'}`,
                                                background: isActive ? 'rgba(99, 102, 241, 0.1)' : '#fff',
                                                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                                                borderRadius: 999,
                                                padding: '0.42rem 0.7rem',
                                                fontSize: '0.74rem',
                                                fontWeight: 850,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                                <div
                                    style={{ position: 'relative' }}
                                    onBlur={(event) => {
                                        const nextFocus = event.relatedTarget as Node | null;
                                        if (!nextFocus || !event.currentTarget.contains(nextFocus)) {
                                            setCrmClassFilterOpen(false);
                                        }
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setCrmClassFilterOpen(prev => !prev)}
                                        style={{
                                            border: `1px solid ${crmClassFilter !== 'all' ? 'var(--accent-success)' : 'var(--border-color)'}`,
                                            background: crmClassFilter !== 'all' ? 'rgba(16, 185, 129, 0.1)' : '#fff',
                                            color: crmClassFilter !== 'all' ? 'var(--accent-success)' : 'var(--text-muted)',
                                            borderRadius: 999,
                                            padding: '0.42rem 0.7rem',
                                            fontSize: '0.74rem',
                                            fontWeight: 850,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                        }}
                                    >
                                        {crmClassFilter === 'all' ? 'Sınıflar' : crmClassFilter}
                                        <ChevronDown size={14} />
                                    </button>
                                    {crmClassFilterOpen && (
                                        <div style={{
                                            position: 'absolute',
                                            left: 0,
                                            top: 'calc(100% + 8px)',
                                            zIndex: 40,
                                            minWidth: 190,
                                            padding: 6,
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 14,
                                            background: '#fff',
                                            boxShadow: '0 18px 36px rgba(15, 23, 42, 0.16)',
                                        }}>
                                            {['all', ...classOptions].map(className => {
                                                const isActive = crmClassFilter === className;
                                                return (
                                                    <button
                                                        key={className}
                                                        type="button"
                                                        onClick={() => {
                                                            setCrmClassFilter(className);
                                                            setCrmClassFilterOpen(false);
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            minHeight: 38,
                                                            padding: '0.55rem 0.7rem',
                                                            border: 'none',
                                                            borderRadius: 10,
                                                            background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                                                            color: isActive ? 'var(--accent-success)' : 'var(--text-main)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            gap: '0.75rem',
                                                            cursor: 'pointer',
                                                            fontWeight: 800,
                                                            textAlign: 'left',
                                                        }}
                                                    >
                                                        <span>{className === 'all' ? 'Tüm sınıflar' : className}</span>
                                                        {isActive && <CheckCircle2 size={15} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="crm-stats-badges" style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-success)', fontWeight: 600 }}>
                                <CheckCircle2 size={16} /> {parents.filter(p => p.status === 'sent').length} Gönderildi
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary)', fontWeight: 600 }}>
                                <Sparkles size={16} /> {parents.filter(p => p.status === 'ready').length} Rapor Oluşturuldu
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-warning)', fontWeight: 600 }}>
                                <Clock size={16} /> {parents.filter(p => p.status === 'pending').length} Analiz Bekliyor
                            </span>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Veli / Öğrenci</th>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>İletişim</th>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Son Rapor</th>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Durum</th>
                                    <th style={{ padding: '1rem 1.5rem' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                    {filteredParents.map(item => (
                                        <tr 
                                            key={item.id} 
                                            onClick={() => onSelectStudent(item.id)}
                                            style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s', cursor: 'pointer' }} 
                                            className="student-row-hover"
                                        >
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.parent || 'Belirtilmedi'}</div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Öğrenci: {item.student}</div>
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontWeight: 500 }}>
                                                <Bell size={16} color="var(--primary)" />
                                                <span>{item.phone || '-'}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{item.lastReport || 'Rapor yok'}</span>
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            <span
                                                className="badge"
                                                style={
                                                    item.status === 'sent'
                                                        ? { background: '#dcfce7', color: '#166534' }
                                                        : item.status === 'ready'
                                                            ? { background: '#e0e7ff', color: '#3730a3' }
                                                            : { background: '#fef9c3', color: '#854d0e' }
                                                }
                                            >
                                                {item.status === 'sent' ? 'Gönderildi' : item.status === 'ready' ? 'Rapor Oluşturuldu' : 'Rapor Bekliyor'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <button
                                                    className="btn-outline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCreateParentActivation(item);
                                                    }}
                                                    style={{ padding: '0.6rem 0.8rem', color: 'var(--primary)', borderColor: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}
                                                    title="Veli aktivasyon linki oluştur"
                                                >
                                                    <Link2 size={14} />
                                                    Veli Linki
                                                </button>
                                                {activationLinks[item.id] && (
                                                    <button
                                                        className="btn-outline"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCopyActivationLink(item.id);
                                                        }}
                                                        style={{ padding: '0.6rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}
                                                        title="Son oluşturulan veli linkini kopyala"
                                                    >
                                                        <Copy size={14} />
                                                    </button>
                                                )}
                                                <button
                                                    className="btn-outline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleGenerateStudentReport(item.id);
                                                    }}
                                                    disabled={generatingSpecific[item.id]}
                                                    style={{
                                                        padding: '0.6rem 0.8rem',
                                                        color: item.aiExamReport ? 'var(--accent-success)' : 'var(--primary)',
                                                        borderColor: item.aiExamReport ? 'var(--accent-success)' : 'var(--primary)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.4rem',
                                                        fontSize: '0.75rem',
                                                        background: item.aiExamReport ? 'rgba(34, 197, 94, 0.05)' : 'transparent'
                                                    }}
                                                    title={item.aiExamReport ? "Raporu Yenile (AI)" : "AI Raporu Oluştur"}
                                                >
                                                    {generatingSpecific[item.id] ? <RefreshCcw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                    <span>{item.aiExamReport ? 'Yenile' : 'AI Analiz'}</span>
                                                </button>
                                                <button
                                                    className="btn-outline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedParentForPreview(item);
                                                        setShowPreviewModal(true);
                                                    }}
                                                    style={{ padding: '0.6rem 1.2rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                                                >
                                                    <ExternalLink size={14} /> Detay
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    title="Raporu veli uygulamasına bildirim olarak gönder"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSendSingleReportNotification(item);
                                                    }}
                                                    disabled={sendingReportNotification[item.id]}
                                                    style={{ padding: '0.6rem 1.2rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                                                >
                                                    {sendingReportNotification[item.id] ? <RefreshCcw size={14} className="animate-spin" /> : <Send size={14} />}
                                                    Bildirim Gönder
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <AnimatePresence>
                    {selectedParentNotification && (
                        <div className="modal-overlay" onClick={() => setSelectedParentNotification(null)}>
                            <motion.div
                                className="modal-content-card"
                                initial={{ opacity: 0, scale: 0.96, y: 24 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.96, y: 24 }}
                                style={{ maxWidth: '620px', borderRadius: 24, overflow: 'hidden' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="modal-header" style={{ padding: '1.35rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
                                            <span style={{
                                                background: selectedParentNotification.priority === 'urgent' ? '#fef2f2' : 'rgba(99, 102, 241, 0.08)',
                                                color: selectedParentNotification.priority === 'urgent' ? '#b91c1c' : 'var(--primary)',
                                                borderRadius: 999,
                                                padding: '0.25rem 0.6rem',
                                                fontSize: '0.7rem',
                                                fontWeight: 900,
                                            }}>
                                                {getNotificationTypeLabel(selectedParentNotification.type)}
                                            </span>
                                            <span style={{
                                                background: selectedParentNotification.priority === 'urgent' ? '#fef2f2' : '#f8fafc',
                                                color: selectedParentNotification.priority === 'urgent' ? '#b91c1c' : 'var(--text-muted)',
                                                borderRadius: 999,
                                                padding: '0.25rem 0.6rem',
                                                fontSize: '0.7rem',
                                                fontWeight: 900,
                                            }}>
                                                {selectedParentNotification.priority === 'urgent' ? 'Acil' : 'Normal'}
                                            </span>
                                        </div>
                                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, lineHeight: 1.2 }}>{selectedParentNotification.title}</h2>
                                    </div>
                                    <button className="modal-close" onClick={() => setSelectedParentNotification(null)}><X size={20} /></button>
                                </div>

                                <div style={{ padding: '1.5rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                                        {[
                                            { label: 'Hedef', value: getNotificationTargetLabel(selectedParentNotification) },
                                            { label: 'Gönderim', value: formatParentNotificationDate(selectedParentNotification.createdAt) || '-' },
                                            { label: 'Okunma', value: `${selectedParentNotification.readCount || 0}/${selectedParentNotification.recipientCount || 0}` },
                                        ].map(item => (
                                            <div key={item.label} style={{ border: '1px solid var(--border-color)', borderRadius: 14, background: '#f8fafc', padding: '0.85rem' }}>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.25rem' }}>{item.label}</div>
                                                <div style={{ color: 'var(--text-main)', fontSize: '0.86rem', fontWeight: 850, lineHeight: 1.3 }}>{item.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ border: '1px solid var(--border-color)', borderRadius: 16, padding: '1rem', marginBottom: '1rem' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.6rem' }}>Mesaj gövdesi</div>
                                        <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-main)', lineHeight: 1.6, fontSize: '0.92rem' }}>
                                            {selectedParentNotification.body || 'Mesaj içeriği yok.'}
                                        </p>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                                        {[
                                            { label: 'Alıcı', value: selectedParentNotification.recipientCount || 0 },
                                            { label: 'Push ulaştı', value: selectedParentNotification.deliveredCount || 0 },
                                            { label: 'Okundu', value: selectedParentNotification.readCount || 0 },
                                        ].map(item => (
                                            <div key={item.label} style={{ border: '1px solid var(--border-color)', borderRadius: 14, padding: '0.8rem', background: '#fff' }}>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 850 }}>{item.label}</div>
                                                <div style={{ marginTop: 2, fontSize: '1.15rem', fontWeight: 950 }}>{item.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', paddingTop: '0.25rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteParentNotification(selectedParentNotification)}
                                            style={{
                                                border: '1px solid #fecaca',
                                                background: '#fef2f2',
                                                color: '#b91c1c',
                                                borderRadius: 14,
                                                padding: '0.78rem 1rem',
                                                fontWeight: 900,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.45rem',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <Trash2 size={16} />
                                            Bildirimi Sil
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-outline"
                                            onClick={() => setSelectedParentNotification(null)}
                                            style={{ padding: '0.78rem 1.1rem', borderRadius: 14, fontWeight: 850 }}
                                        >
                                            Kapat
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Toplu Üretim Taslak Onay Modalı */}
                <AnimatePresence>
                    {showBatchModal && (
                        <div className="modal-overlay" onClick={() => setShowBatchModal(false)}>
                            <motion.div
                                className="modal-content-card"
                                initial={{ opacity: 0, scale: 0.95, y: 30 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 30 }}
                                style={{ 
                                    maxWidth: '650px', 
                                    borderRadius: '28px', 
                                    boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.3)',
                                    background: 'rgba(255, 255, 255, 0.98)',
                                    backdropFilter: 'blur(15px)',
                                    border: '1px solid rgba(255, 255, 255, 0.3)'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="modal-header" style={{ padding: '1.75rem 2rem', background: 'linear-gradient(to right, #f8fafc, #ffffff)', borderBottom: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ 
                                            background: 'linear-gradient(135deg, var(--primary), #a855f7)', 
                                            padding: '0.75rem', 
                                            borderRadius: '14px',
                                            boxShadow: '0 4px 12px var(--primary-glow)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <Sparkles size={22} color="white" />
                                        </div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.01em' }}>Toplu Rapor Taslağını Onayla</h2>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Tüm veliler için kullanılacak ortak giriş metni</p>
                                        </div>
                                    </div>
                                    <button className="modal-close" onClick={() => setShowBatchModal(false)}><X size={20} /></button>
                                </div>
                                <div className="form-body" style={{ padding: '2rem' }}>
                                    <div style={{ 
                                        background: 'rgba(99, 102, 241, 0.03)', 
                                        padding: '1.25rem', 
                                        borderRadius: '18px', 
                                        border: '1px solid rgba(99, 102, 241, 0.1)',
                                        marginBottom: '2rem',
                                        display: 'flex',
                                        gap: '0.75rem',
                                        alignItems: 'flex-start'
                                    }}>
                                        <FileText size={18} color="var(--primary)" style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
                                            Aşağıdaki giriş metni tüm öğrenciler için <b>ortak</b> olarak kullanılacaktır. Bu metnin altına her öğrenciye özel dürüst analiz notu ve kurum imzanız eklenecektir.
                                        </p>
                                    </div>
                                    
                                    <div className="report-performance-section" style={{ 
                                    padding: '1.5rem', 
                                    background: 'linear-gradient(135deg, #ffffff 0%, #f8faff 100%)', 
                                    borderRadius: '24px', 
                                    border: '1px solid color-mix(in srgb, var(--primary), transparent 85%)',
                                    boxShadow: '0 10px 30px -10px var(--primary-glow)'
                                }}>
                                        {isDraftLoading ? (
                                            <div style={{ textAlign: 'center', padding: '3rem' }}>
                                                <RefreshCcw size={32} className="animate-spin" color="#25D366" />
                                                <p style={{ marginTop: '1rem', fontSize: '0.9rem', fontWeight: 600, color: '#166534' }}>AI taslak önerisi hazırlanıyor...</p>
                                            </div>
                                        ) : (
                                            <>
                                                <textarea
                                                    value={batchDraftIntro}
                                                    onChange={(e) => setBatchDraftIntro(e.target.value)}
                                                    style={{ 
                                                        width: '100%', 
                                                        minHeight: '180px', 
                                                        background: 'transparent', 
                                                        border: 'none', 
                                                        outline: 'none', 
                                                        fontSize: '1.05rem', 
                                                        fontFamily: '"Outfit", sans-serif',
                                                        fontStyle: 'italic', 
                                                        lineHeight: '1.7', 
                                                        color: '#166534', 
                                                        resize: 'none',
                                                        padding: '0'
                                                    }}
                                                    placeholder="Ortak giriş metninizi buraya yazın..."
                                                />
                                                <div style={{ position: 'absolute', bottom: '1rem', right: '1.5rem', opacity: 0.15, pointerEvents: 'none' }}>
                                                    <FileText size={60} color="var(--primary)" />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    
                                    <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem' }}>
                                        <button 
                                            className="btn-outline" 
                                            style={{ flex: 1, padding: '1rem', borderRadius: '16px', fontWeight: 700, fontSize: '1rem' }} 
                                            onClick={() => setShowBatchModal(false)}
                                        >
                                            Vazgeç
                                        </button>
                                        <button
                                            className="btn-primary"
                                            style={{ 
                                                flex: 2, 
                                                background: '#25D366', 
                                                borderColor: '#25D366', 
                                                padding: '1rem', 
                                                borderRadius: '16px', 
                                                fontWeight: 800,
                                                fontSize: '1.05rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.75rem',
                                                boxShadow: '0 8px 25px -5px rgba(37, 211, 102, 0.4)'
                                            }}
                                            disabled={isDraftLoading}
                                            onClick={handleConfirmBatchGenerate}
                                        >
                                            <Sparkles size={20} /> Onayla ve Tümünü Üret
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

            </div>

            <AnimatePresence>
                {showPreviewModal && selectedParentForPreview && (
                    <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
                        <motion.div
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="modal-content-card report-preview-modal-content"
                            style={{ 
                                width: 'min(1000px, calc(100vw - 40px))', 
                                maxWidth: '1000px', 
                                maxHeight: '92vh', 
                                display: 'flex', 
                                flexDirection: 'column',
                                border: '1px solid rgba(255,255,255,0.2)',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                background: 'rgba(255, 255, 255, 0.95)',
                                backdropFilter: 'blur(20px)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header report-preview-header" style={{ padding: '1.5rem 2rem', background: 'linear-gradient(to right, #f8fafc, #ffffff)', borderBottom: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ 
                                        width: '42px', 
                                        height: '42px', 
                                        background: 'linear-gradient(135deg, var(--primary), var(--secondary))', 
                                        borderRadius: '12px', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        boxShadow: '0 4px 12px var(--primary-glow)'
                                    }}>
                                        <FileText size={22} color="white" />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.01em' }}>Veli Rapor Önizleme</h2>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>AI Destekli Gelişim ve Analiz Raporu</p>
                                    </div>
                                </div>
                                <button className="modal-close" onClick={() => setShowPreviewModal(false)}><X size={20} /></button>
                            </div>

                            <div className="form-body report-preview-body" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2rem' }}>
                                <div className="report-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                    <div style={{ 
                                        padding: '1.25rem', 
                                        background: 'white', 
                                        borderRadius: '20px', 
                                        border: '1px solid var(--border-color)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem'
                                    }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                            <Users size={20} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>VELİ</div>
                                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedParentForPreview.parent}</div>
                                        </div>
                                    </div>
                                    <div style={{ 
                                        padding: '1.25rem', 
                                        background: 'white', 
                                        borderRadius: '20px', 
                                        border: '1px solid var(--border-color)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem'
                                    }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary)' }}>
                                            <Users size={20} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ÖĞRENCİ</div>
                                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedParentForPreview.student}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="report-performance-section" style={{ 
                                    padding: '1.5rem', 
                                    background: 'linear-gradient(135deg, #ffffff 0%, #f8faff 100%)', 
                                    borderRadius: '24px', 
                                    border: '1px solid color-mix(in srgb, var(--primary), transparent 85%)',
                                    boxShadow: '0 10px 30px -10px var(--primary-glow)'
                                }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '1.25rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Activity size={16} />
                                        </div>
                                        HAFTALIK PERFORMANS VERİLERİ
                                    </div>
                                    
                                    <div className="report-performance-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                                        <div style={{ textAlign: 'center', padding: '1.25rem', background: 'white', borderRadius: '18px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>TYT Net Ort.</div>
                                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{selectedParentForPreview.lastTyt || 0}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--accent-success)', fontWeight: 700, marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
                                                <Sparkles size={10} /> +2.4 yükseliş
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '1.25rem', background: 'white', borderRadius: '18px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>AYT Net Ort.</div>
                                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{selectedParentForPreview.lastAyt || 0}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '0.25rem' }}>
                                                Sabit seyrediyor
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '1.25rem', background: 'white', borderRadius: '18px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>Toplam Soru</div>
                                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{selectedParentForPreview.solvedCount || 0}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700, marginTop: '0.25rem' }}>
                                                Hedefin %112'si
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '1.5rem', background: 'white', padding: '1.25rem', borderRadius: '18px', border: '1px solid #f1f5f9' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.6rem', fontWeight: 700 }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Müfredat Tamamlama İlerlemesi</span>
                                            <span style={{ color: 'var(--primary)' }}>%{selectedParentForPreview.progress || 0}</span>
                                        </div>
                                        <div style={{ width: '100%', height: '10px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${selectedParentForPreview.progress || 0}%` }}
                                                transition={{ duration: 1, ease: "easeOut" }}
                                                style={{ height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--secondary))', borderRadius: '10px' }} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Bell size={18} color="var(--primary)" /> Veli Bildirimi Önizleme
                                        </label>
                                        {selectedParentForPreview.aiExamReport && (
                                            <button
                                                onClick={() => handleGenerateStudentReport(selectedParentForPreview.id)}
                                                disabled={generatingSpecific[selectedParentForPreview.id]}
                                                className="btn-outline"
                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                            >
                                                <RefreshCcw size={14} className={generatingSpecific[selectedParentForPreview.id] ? 'animate-spin' : ''} />
                                                Yeniden Analiz Et
                                            </button>
                                        )}
                                    </div>

                                    <div style={{
                                        background: 'linear-gradient(135deg, #ffffff 0%, #f8faff 100%)',
                                        padding: '1.5rem',
                                        borderRadius: '20px',
                                        border: '1px solid var(--border-color)',
                                        maxHeight: '360px',
                                        overflowY: 'auto'
                                    }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.5rem' }}>
                                            Haftalık Gelişim Raporu
                                        </div>
                                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: 'var(--text-main)' }}>
                                            {selectedParentForPreview.aiExamReport || 'Henüz rapor oluşturulmadı.'}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                    <button 
                                        className="btn-outline" 
                                        style={{ flex: 1, padding: '1rem', borderRadius: '16px', fontWeight: 700 }} 
                                        onClick={() => setShowPreviewModal(false)}
                                    >
                                        Vazgeç
                                    </button>
                                    <button
                                        className="btn-primary"
                                        style={{ 
                                            flex: 2, 
                                            padding: '1rem', 
                                            borderRadius: '16px', 
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.75rem',
                                        }}
                                        disabled={sendingReportNotification[selectedParentForPreview.id]}
                                        onClick={async () => {
                                            await handleSendSingleReportNotification(selectedParentForPreview);
                                            setShowPreviewModal(false);
                                        }}
                                    >
                                        {sendingReportNotification[selectedParentForPreview.id] ? <RefreshCcw size={20} className="animate-spin" /> : <Send size={20} />}
                                        Raporu Bildirimle Gönder
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div >
    );
};

export default ParentCRM;
