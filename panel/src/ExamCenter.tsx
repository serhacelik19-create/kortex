import React, { useState, useEffect } from 'react';
import {
    BarChart,
    Upload,
    TrendingUp,
    TrendingDown,
    Target,
    AlertCircle,
    FileSpreadsheet,
    X,
    BookOpen,
    Globe,
    Atom,
    Calculator,
    PenTool,
    Zap,
    Bell,
    Calendar,
    Edit2,
    Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie
} from 'recharts';
import * as XLSX from 'xlsx';
import { api } from './api';
import {
    CustomSelect,
    CustomDatePicker,
    CustomTimePicker
} from './components/PremiumSelectors';
import { usePanelToast } from './components/PanelToastProvider';
import ContentAssignmentCenter from './ContentAssignmentCenter';

const ExamCenter: React.FC = () => {
    const [students, setStudents] = useState<any[]>([]);
    const [workspaceTab, setWorkspaceTab] = useState<'analytics' | 'assignments'>('analytics');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [activeExamTab, setActiveExamTab] = useState<'tyt' | 'ayt'>('tyt');
    const [aiSummary, setAiSummary] = useState<any>(null);
    const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
    const [erroredCourses, setErroredCourses] = useState<any[]>([]);
    const [correlationData, setCorrelationData] = useState<any[]>([]);
    const [trendingData, setTrendingData] = useState<any>({ rising: [], falling: [] });
    const [isCorrelationExpanded, setIsCorrelationExpanded] = useState(false);
    const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
    const [classes, setClasses] = useState<any[]>([]);
    const [notificationHistory, setNotificationHistory] = useState<any[]>([]);
    const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null);
    const { showToast } = usePanelToast();

    // Form state
    // Form state
    const [newExam, setNewExam] = useState<any>({
        student_id: '',
        date: new Date().toISOString().split('T')[0],
        tyt_tur_d: '', tyt_tur_y: '',
        tyt_mat_d: '', tyt_mat_y: '',
        tyt_tar_d: '', tyt_tar_y: '',
        tyt_cog_d: '', tyt_cog_y: '',
        tyt_fel_d: '', tyt_fel_y: '',
        tyt_din_d: '', tyt_din_y: '',
        tyt_fiz_d: '', tyt_fiz_y: '',
        tyt_kim_d: '', tyt_kim_y: '',
        tyt_biy_d: '', tyt_biy_y: '',
        ayt_mat_d: '', ayt_mat_y: '',
        ayt_fiz_d: '', ayt_fiz_y: '',
        ayt_kim_d: '', ayt_kim_y: '',
        ayt_biy_d: '', ayt_biy_y: '',
        ayt_edb_d: '', ayt_edb_y: '',
        ayt_tar1_d: '', ayt_tar1_y: '',
        ayt_cog1_d: '', ayt_cog1_y: '',
        ayt_tar2_d: '', ayt_tar2_y: '',
        ayt_cog2_d: '', ayt_cog2_y: '',
        ayt_fel_d: '', ayt_fel_y: '',
        ayt_din_d: '', ayt_din_y: ''
    });

    const [announcement, setAnnouncement] = useState<any>({
        type: 'TYT',
        date: '',
        time: '10:00',
        target: 'all',
        note: ''
    });

    const [uploadFile, setUploadFile] = useState<File | null>(null);

    const getNet = (dField: string, yField: string) => {
        const d = parseFloat(newExam[dField]) || 0;
        const y = parseFloat(newExam[yField]) || 0;
        const net = d - (y * 0.25);
        return Math.max(-10, net); // Prevent extreme negatives
    };

    const calculateTotalTYT = () => {
        return getNet('tyt_tur_d', 'tyt_tur_y') + getNet('tyt_mat_d', 'tyt_mat_y') +
            getNet('tyt_tar_d', 'tyt_tar_y') + getNet('tyt_cog_d', 'tyt_cog_y') +
            getNet('tyt_fel_d', 'tyt_fel_y') + getNet('tyt_din_d', 'tyt_din_y') +
            getNet('tyt_fiz_d', 'tyt_fiz_y') + getNet('tyt_kim_d', 'tyt_kim_y') +
            getNet('tyt_biy_d', 'tyt_biy_y');
    };

    const calculateTotalAYT = () => {
        return getNet('ayt_mat_d', 'ayt_mat_y') + getNet('ayt_fiz_d', 'ayt_fiz_y') +
            getNet('ayt_kim_d', 'ayt_kim_y') + getNet('ayt_biy_d', 'ayt_biy_y') +
            getNet('ayt_edb_d', 'ayt_edb_y') + getNet('ayt_tar1_d', 'ayt_tar1_y') +
            getNet('ayt_cog1_d', 'ayt_cog1_y') + getNet('ayt_tar2_d', 'ayt_tar2_y') +
            getNet('ayt_cog2_d', 'ayt_cog2_y') + getNet('ayt_fel_d', 'ayt_fel_y') +
            getNet('ayt_din_d', 'ayt_din_y');
    };

    const fetchHistory = () => {
        api.getNotificationHistory().then(setNotificationHistory).catch(console.error);
    };

    const refreshAiSummary = () => {
        setIsAiLoading(true);
        api.getAiWeeklySummary()
            .then(res => setAiSummary(res.summary))
            .catch(() => setAiSummary({ healthScore: { total: 0 }, blindSpot: 'Analiz şu an yenilenemedi.', efficiencyInsight: '', highestROI: '', momentum: [] }))
            .finally(() => setIsAiLoading(false));
    };

    useEffect(() => {
        api.getStudents().then(setStudents).catch(console.error);
        api.getClasses().then(setClasses).catch(console.error);
        api.getErroredTopics().then(setErroredCourses).catch(console.error);
        api.getCorrelationData().then(setCorrelationData).catch(console.error);
        api.getTrendingStudents().then(setTrendingData).catch(console.error);
        fetchHistory();
    }, []);

    const handleCreateExam = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.createExam({
                student_id: parseInt(newExam.student_id),
                date: newExam.date,
                tyt_net: calculateTotalTYT(),
                ayt_net: calculateTotalAYT(),
                tyt_tur: getNet('tyt_tur_d', 'tyt_tur_y'),
                tyt_mat: getNet('tyt_mat_d', 'tyt_mat_y'),
                tyt_tar: getNet('tyt_tar_d', 'tyt_tar_y'),
                tyt_cog: getNet('tyt_cog_d', 'tyt_cog_y'),
                tyt_fel: getNet('tyt_fel_d', 'tyt_fel_y'),
                tyt_din: getNet('tyt_din_d', 'tyt_din_y'),
                tyt_fiz: getNet('tyt_fiz_d', 'tyt_fiz_y'),
                tyt_kim: getNet('tyt_kim_d', 'tyt_kim_y'),
                tyt_biy: getNet('tyt_biy_d', 'tyt_biy_y'),
                ayt_mat: getNet('ayt_mat_d', 'ayt_mat_y'),
                ayt_fiz: getNet('ayt_fiz_d', 'ayt_fiz_y'),
                ayt_kim: getNet('ayt_kim_d', 'ayt_kim_y'),
                ayt_biy: getNet('ayt_biy_d', 'ayt_biy_y'),
                ayt_edb: getNet('ayt_edb_d', 'ayt_edb_y'),
                ayt_tar1: getNet('ayt_tar1_d', 'ayt_tar1_y'),
                ayt_cog1: getNet('ayt_cog1_d', 'ayt_cog1_y'),
                ayt_tar2: getNet('ayt_tar2_d', 'ayt_tar2_y'),
                ayt_cog2: getNet('ayt_cog2_d', 'ayt_cog2_y'),
                ayt_fel: getNet('ayt_fel_d', 'ayt_fel_y'),
                ayt_din: getNet('ayt_din_d', 'ayt_din_y')
            });
            setShowCreateModal(false);
            setNewExam({
                student_id: '',
                date: new Date().toISOString().split('T')[0],
                tyt_tur_d: '', tyt_tur_y: '',
                tyt_mat_d: '', tyt_mat_y: '',
                tyt_tar_d: '', tyt_tar_y: '',
                tyt_cog_d: '', tyt_cog_y: '',
                tyt_fel_d: '', tyt_fel_y: '',
                tyt_din_d: '', tyt_din_y: '',
                tyt_fiz_d: '', tyt_fiz_y: '',
                tyt_kim_d: '', tyt_kim_y: '',
                tyt_biy_d: '', tyt_biy_y: '',
                ayt_mat_d: '', ayt_mat_y: '',
                ayt_fiz_d: '', ayt_fiz_y: '',
                ayt_kim_d: '', ayt_kim_y: '',
                ayt_biy_d: '', ayt_biy_y: '',
                ayt_edb_d: '', ayt_edb_y: '',
                ayt_tar1_d: '', ayt_tar1_y: '',
                ayt_cog1_d: '', ayt_cog1_y: '',
                ayt_tar2_d: '', ayt_tar2_y: '',
                ayt_cog2_d: '', ayt_cog2_y: '',
                ayt_fel_d: '', ayt_fel_y: '',
                ayt_din_d: '', ayt_din_y: ''
            });
            showToast({ type: 'success', title: 'Kayıt Başarılı', message: 'Deneme sonucu hesaplanarak sisteme işlendi.' });
        } catch (err) {
            showToast({ type: 'error', title: 'Hata', message: 'Kayıt sırasında bir sorun oluştu.' });
        }
    };

    const handleFileUpload = async () => {
        if (!uploadFile) return;

        showToast({ type: 'info', title: 'Yükleniyor', message: 'Dosya işleniyor...' });

        try {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });

                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // Çoklu başlıkları (Örn: Üstte TÜRKÇE, Altta D, Y) birleştirmek için raw array alıyoruz
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                    if (rows.length < 2) {
                        showToast({ type: 'error', title: 'Hata', message: 'Yüklenen dosya çok kısa veya geçersiz.' });
                        return;
                    }

                    // Alt başlık satırını (D, Y, N içerdiği an) bulalım
                    let headerRowIndex = 0;
                    for (let i = 0; i < 6; i++) {
                        if (rows[i] && (rows[i].includes("D.") || rows[i].includes("D") || rows[i].includes("Y") || rows[i].includes("SIRA") || rows[i].includes("ADI"))) {
                            headerRowIndex = i;
                            break;
                        }
                    }

                    // Eğer D Y N yapısı yoksa standart tablo formatında oku
                    let json = [];
                    if (headerRowIndex === 0) {
                        json = XLSX.utils.sheet_to_json(worksheet) as any[];
                    } else {
                        // Üst başlık boşluklarını (merged cells) yana doğru doldur
                        const topHeaders = [...(rows[headerRowIndex - 1] || [])];
                        let lastTop = "";
                        for (let i = 0; i < topHeaders.length; i++) {
                            if (topHeaders[i]) {
                                lastTop = String(topHeaders[i]).trim();
                            } else {
                                topHeaders[i] = lastTop;
                            }
                        }

                        // Üst ve Alt başlıkları birleştir
                        const finalHeaders = [];
                        const subHeaders = rows[headerRowIndex] || [];
                        for (let i = 0; i < Math.max(topHeaders.length, subHeaders.length); i++) {
                            const top = topHeaders[i] ? topHeaders[i] + " " : "";
                            const sub = subHeaders[i] ? String(subHeaders[i]).trim() : `Sutun_${i}`;

                            // Tekrarları önlemek (Örn: TÜRKÇE TÜRKÇE yerine sadece TÜRKÇE)
                            if (top.trim() === sub.trim()) finalHeaders.push(top.trim());
                            else finalHeaders.push((top + sub).trim());
                        }

                        // Verileri bu yeni AI-dostu başlıklara göre JSON yapalım
                        for (let i = headerRowIndex + 1; i < rows.length; i++) {
                            const rowArray = rows[i];
                            if (!rowArray || rowArray.length === 0) continue;

                            const isEmpty = rowArray.every(cell => cell === null || cell === undefined || cell === "");
                            if (isEmpty) continue;

                            const obj: any = {};
                            for (let j = 0; j < finalHeaders.length; j++) {
                                obj[finalHeaders[j]] = rowArray[j];
                            }
                            json.push(obj);
                        }
                    }

                    if (json.length === 0) {
                        showToast({ type: 'error', title: 'Hata', message: 'İşlenebilecek geçerli tablo verisi bulunamadı.' });
                        return;
                    }

                    // Basit bir eslestirme-ornek olarak, backend'in beklediği bulk formata map yapılması gerek
                    // CSV/Excel'in sutun isimlerinin tam olarak ne oldugu backend ile uyusmali.
                    // Burada ogrenci_no, tyt_net, ayt_net gibi bir varsayımsal yapı üzerinden gidiyoruz.
                    // Eger gercek format farkliysa bu kisimda ilgili objeye (bulk upload format) cevrilmesi gerekir.

                    await api.bulkUploadExams(json);

                    setShowUploadModal(false);
                    setUploadFile(null);
                    showToast({ type: 'success', title: 'Başarılı', message: `${json.length} öğrencinin verisi yüklendi.` });
                } catch (error) {
                    showToast({ type: 'error', title: 'Hata', message: 'Dosya içeriği okunurken bir hata oluştu veya API hatası.' });
                    console.error("Parse/Upload error", error);
                }
            };

            reader.onerror = () => {
                showToast({ type: 'error', title: 'Hata', message: 'Dosya okunamadı.' });
            };

            reader.readAsBinaryString(uploadFile);

        } catch (err) {
            showToast({ type: 'error', title: 'Hata', message: 'Toplu yükleme başarısız oldu.' });
        }
    };

    const handleSendAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingAnnouncementId) {
                await api.updateNotification(editingAnnouncementId, announcement);
                showToast({ type: 'success', title: 'Başarılı', message: 'Duyuru başarıyla güncellendi.' });
            } else {
                await api.broadcastNotification(announcement);
                showToast({ type: 'success', title: 'Duyuru Gönderildi', message: 'Sınav duyurusu tüm ilgili öğrenci ve velilere iletildi.' });
            }
            setAnnouncement({
                type: 'TYT',
                date: '',
                time: '10:00',
                target: 'all',
                note: ''
            });
            setEditingAnnouncementId(null);
            fetchHistory();
        } catch (err) {
            showToast({ type: 'error', title: 'Hata', message: 'Duyuru işlemi başarısız oldu.' });
        }
    };

    const handleDeleteAnnouncement = async (id: number) => {
        if (!window.confirm('Bu duyuruyu silmek istediğinize emin misiniz?')) return;
        try {
            await api.deleteNotification(id);
            showToast({ type: 'success', title: 'Başarılı', message: 'Duyuru silindi.' });
            fetchHistory();
            if (editingAnnouncementId === id) {
                setEditingAnnouncementId(null);
                setAnnouncement({ type: 'TYT', date: '', time: '10:00', target: 'all', note: '' });
            }
        } catch (err) {
            showToast({ type: 'error', title: 'Hata', message: 'Silinemedi.' });
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return '#10b981';
        if (score >= 60) return '#f59e0b';
        return '#ef4444';
    };

    const renderHealthBar = (label: string, value: number) => {
        const score = Math.max(0, Math.min(100, Number(value) || 0));
        const color = getScoreColor(score);
        return (
            <div style={{ minWidth: 150 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.68rem', opacity: 0.72, fontWeight: 800 }}>{label}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 900, color }}>{score}</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                    <div style={{ width: `${score}%`, height: '100%', borderRadius: 999, background: color }} />
                </div>
            </div>
        );
    };

    const renderMomentumMarks = (direction: string, intensity: number) => {
        const count = Math.max(1, Math.min(3, Number(intensity) || 1));
        if (direction === 'up') return '▲'.repeat(count);
        if (direction === 'down') return '▼'.repeat(count);
        return '━';
    };

    const isUrgentMomentum = (item: any) => {
        const note = String(item?.note || '').toLocaleUpperCase('tr-TR');
        return note.includes('ACİL') || note.includes('ACIL') || (item?.direction === 'down' && Number(item?.intensity || 0) >= 3);
    };

    const renderSubjectMoves = (student: any) => {
        const moves = (student.subjectMomentum || []).slice(0, 3);
        if (moves.length === 0) return null;
        return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                {moves.map((move: any, idx: number) => (
                    <span key={idx} style={{
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: move.change >= 0 ? 'rgba(16,185,129,0.09)' : 'rgba(239,68,68,0.09)',
                        color: move.change >= 0 ? '#059669' : '#dc2626',
                    }}>
                        {move.subject} {move.change >= 0 ? '+' : ''}{move.change}
                    </span>
                ))}
            </div>
        );
    };

    const renderTrendList = (items: any[], type: 'rising' | 'falling') => {
        const isRising = type === 'rising';
        const accent = isRising ? '#10b981' : '#ef4444';
        const emptyText = isRising ? 'Son 3 denemede belirgin yükseliş yok.' : 'Son 3 denemede belirgin düşüş yok.';

        if (!items || items.length === 0) {
            return (
                <div className="premium-empty-state" style={{ padding: '2rem 1rem' }}>
                    {isRising ? <TrendingUp size={24} style={{ opacity: 0.25, marginBottom: '0.5rem' }} /> : <TrendingDown size={24} style={{ opacity: 0.25, marginBottom: '0.5rem' }} />}
                    <p style={{ fontSize: '0.8rem' }}>{emptyText}</p>
                </div>
            );
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {items.map((student: any, i: number) => (
                    <div key={student.id || i} style={{
                        padding: '0.85rem 1rem',
                        background: '#f8fafc',
                        borderRadius: '14px',
                        border: '1px solid #f1f5f9',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.35rem' }}>
                                    <div style={{ width: 26, height: 26, background: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, fontWeight: 900, fontSize: '0.72rem', border: '1px solid #f1f5f9' }}>{i + 1}</div>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{student.name}</div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.66rem', fontWeight: 700 }}>{student.class || 'Sınıf yok'}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gap: '0.2rem', color: '#64748b', fontSize: '0.68rem', fontWeight: 700 }}>
                                    <span>TYT: {student.tytFlow || student.tytNets?.join(' → ') || '-'}</span>
                                    <span>AYT: {student.aytFlow || student.aytNets?.join(' → ') || '-'}</span>
                                </div>
                                {renderSubjectMoves(student)}
                            </div>
                            <div style={{ textAlign: 'right', display: 'grid', gap: '0.35rem', justifyItems: 'end' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '8px', background: `${accent}1a`, color: accent, fontSize: '0.72rem', fontWeight: 900 }}>{student.change}</span>
                                <span style={{ color: accent, fontSize: '0.78rem', fontWeight: 900 }}>{renderMomentumMarks(student.momentumDirection, Math.ceil(Math.abs(Number(student.totalNetChange || 0)) / 3))}</span>
                                <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b' }}>{student.momentumLabel || 'durağan'}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const getSegments = () => {
        const segments = aiSummary?.studentSegments || {};
        return [
            segments.carriers,
            segments.hiddenRisk,
            segments.breakoutCandidates,
            segments.effortLeak,
            segments.criticalIntervention,
        ].filter(Boolean);
    };

    const getDepartmentSignals = () => {
        const map = aiSummary?.departmentMap || {};
        return [
            { label: 'En yüksek kayıp', item: map.highestLoss },
            { label: 'En hızlı toparlanan', item: map.fastestRecovery },
            { label: 'Dağılımı bozuk', item: map.unevenDistribution },
            { label: 'Yanlış düşük, net artmıyor', item: map.lowWrongNoGain },
            { label: 'Öğretim verimi', item: map.teachingEfficiency },
        ].filter(entry => entry.item && (entry.item.subject || entry.item.signal));
    };

    const renderMiniEmpty = (text: string) => (
        <div className="premium-empty-state" style={{ padding: '1.5rem 1rem' }}>
            <p style={{ fontSize: '0.78rem' }}>{text}</p>
        </div>
    );

    const renderBriefList = (items: string[] = [], accent = '#0f172a') => {
        if (!items.length) return renderMiniEmpty('Henüz karar notu üretilemedi.');
        return (
            <div style={{ display: 'grid', gap: '0.45rem' }}>
                {items.slice(0, 3).map((item, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.76rem', lineHeight: 1.45, color: '#475569', fontWeight: 650 }}>
                        <span style={{ width: 20, height: 20, borderRadius: 7, background: `${accent}14`, color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 900, flex: '0 0 auto' }}>{index + 1}</span>
                        <span>{item}</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="main-content">
            <div className="page-header" style={{ alignItems: 'flex-start', marginBottom: '3rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div style={{ width: 42, height: 42, borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px -4px rgba(99, 102, 241, 0.4)' }}>
                            <BarChart size={22} />
                        </div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.02em' }}>Deneme Sınavı Merkezi</h1>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '600px', margin: 0 }}>
                        Kurum geneli başarı takibi, AI destekli performans analizi ve PDF tabanlı ödev yönetimi.
                    </p>
                </div>

                <div className="page-header-actions">
                    <div style={{ display: 'flex', padding: '0.35rem', borderRadius: '14px', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                        <button
                            type="button"
                            onClick={() => setWorkspaceTab('analytics')}
                            style={{
                                border: 'none',
                                background: workspaceTab === 'analytics' ? 'white' : 'transparent',
                                color: workspaceTab === 'analytics' ? 'var(--primary)' : '#64748b',
                                padding: '0.65rem 1.25rem',
                                borderRadius: '10px',
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                boxShadow: workspaceTab === 'analytics' ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            📊 Performans Analizi
                        </button>
                        <button
                            type="button"
                            onClick={() => setWorkspaceTab('assignments')}
                            style={{
                                border: 'none',
                                background: workspaceTab === 'assignments' ? 'white' : 'transparent',
                                color: workspaceTab === 'assignments' ? 'var(--primary)' : '#64748b',
                                padding: '0.65rem 1.25rem',
                                borderRadius: '10px',
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                boxShadow: workspaceTab === 'assignments' ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            📑 Atama Merkezi
                        </button>
                    </div>

                    {workspaceTab === 'analytics' && (
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="premium-button" onClick={() => setShowUploadModal(true)} style={{ background: 'white !important', color: 'var(--text-primary) !important', border: '1px solid #e2e8f0' }}>
                                <Upload size={18} /> Excel Yükle
                            </button>
                            <button className="premium-button" onClick={() => setShowAnnouncementModal(true)} style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 8px 16px -4px rgba(245, 158, 11, 0.4)' }}>
                                <Bell size={18} /> Duyuru Yayınla
                            </button>
                            <button className="premium-button" onClick={() => setShowCreateModal(true)}>
                                <FileSpreadsheet size={18} /> Yeni Kayıt
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {workspaceTab === 'assignments' ? (
                <ContentAssignmentCenter />
            ) : (
                <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>Kurum Performans Analizi</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                            AI Motoru Yayında • Son 3 deneme verisi
                        </div>
                    </div>
                </div>

                {/* Health Score Banner */}
                {aiSummary && aiSummary.healthScore && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="premium-card" style={{
                    marginBottom: '1.5rem', padding: '1.75rem', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white', position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: `conic-gradient(${getScoreColor(aiSummary.healthScore.total || 0)} ${(aiSummary.healthScore.total || 0) * 3.6}deg, rgba(255,255,255,0.1) 0deg)`,
                                fontSize: '1.5rem', fontWeight: 900
                            }}>
                                <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {aiSummary.healthScore.total || 0}
                                </div>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Kurum Sağlık Skoru</h3>
                                <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '4px' }}>Son 3 deneme verisi</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(150px, 1fr))', gap: '0.85rem 1rem', minWidth: 320, flex: '0 1 430px' }}>
                            {[
                                { label: 'Katılım', value: aiSummary.healthScore.participation || 0 },
                                { label: 'Net Trendi', value: aiSummary.healthScore.netTrend || 0 },
                                { label: 'Tutarlılık', value: aiSummary.healthScore.consistency || 0 },
                                { label: 'Verimlilik', value: aiSummary.healthScore.efficiency || 0 },
                            ].map((item) => (
                                <React.Fragment key={item.label}>{renderHealthBar(item.label, item.value)}</React.Fragment>
                            ))}
                        </div>
                    </div>
                    <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '200px', height: '200px', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', borderRadius: '50%' }}></div>
                </motion.div>
                )}

                {/* AI Refresh Button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                    <button
                        onClick={refreshAiSummary}
                        disabled={isAiLoading}
                        className={`ai-refresh-btn ${isAiLoading ? 'loading' : ''}`}
                    >
                        <Zap size={16} fill={isAiLoading ? 'none' : 'currentColor'} />
                        <span>{isAiLoading ? 'Analiz Ediliyor...' : 'Analizi Yenile'}</span>
                    </button>
                </div>

                {/* Operation Cards */}
                <div className="dashboard-grid" style={{ marginBottom: '1.5rem' }}>
                    <div className="premium-card col-span-6" style={{ padding: '1.5rem', borderLeft: '4px solid #2563eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Target size={18} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Müdahale Planı</h4>
                                <div style={{ fontSize: '0.65rem', color: '#2563eb', fontWeight: 800, marginTop: 2 }}>Bu haftanın operasyon odağı</div>
                            </div>
                        </div>
                        {aiSummary?.interventionPlan ? (
                            <div style={{ display: 'grid', gap: '0.65rem' }}>
                                {[
                                    ['Odak ders', aiSummary.interventionPlan.focusSubject],
                                    ['Hedef grup', aiSummary.interventionPlan.targetGroup],
                                    ['Önerilen aksiyon', aiSummary.interventionPlan.recommendedAction],
                                    ['Beklenen kazanım', aiSummary.interventionPlan.expectedGain],
                                    ['Sorumlu', aiSummary.interventionPlan.owner],
                                ].map(([label, value]) => (
                                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.75rem', alignItems: 'baseline' }}>
                                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>{label}</span>
                                        <span style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 750 }}>{value || '-'}</span>
                                    </div>
                                ))}
                            </div>
                        ) : renderMiniEmpty('Müdahale planı için yeterli veri yok.')}
                    </div>

                    <div className="premium-card col-span-6" style={{ padding: '1.5rem', borderLeft: '4px solid #0f766e' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(15, 118, 110, 0.1)', color: '#0f766e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <BarChart size={18} />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Öğrenci Segmentleri</h4>
                        </div>
                        {getSegments().length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.7rem' }}>
                                {getSegments().map((segment: any, index: number) => (
                                    <div key={segment.name || index} style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 8, padding: '0.8rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                                            <span style={{ fontSize: '0.76rem', fontWeight: 900, color: '#0f172a' }}>{segment.name}</span>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 900, color: '#0f766e' }}>{segment.count || 0}</span>
                                        </div>
                                        <p style={{ margin: '0 0 0.55rem', fontSize: '0.68rem', color: '#64748b', lineHeight: 1.45, fontWeight: 600 }}>{segment.description}</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                            {(segment.students || []).slice(0, 3).map((student: any) => (
                                                <span key={student.id || student.name} style={{ fontSize: '0.62rem', padding: '2px 7px', borderRadius: 999, background: 'white', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 750 }}>
                                                    {student.name}
                                                </span>
                                            ))}
                                            {(!segment.students || segment.students.length === 0) && <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 700 }}>Öğrenci yok</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : renderMiniEmpty('Segment üretmek için yeterli son 3 deneme verisi yok.')}
                    </div>

                    <div className="premium-card col-span-6" style={{ padding: '1.5rem', borderLeft: '4px solid #7c3aed' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <BookOpen size={18} />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Zümre Performans Haritası</h4>
                        </div>
                        {getDepartmentSignals().length > 0 ? (
                            <div style={{ display: 'grid', gap: '0.55rem' }}>
                                {getDepartmentSignals().map((entry: any) => (
                                    <div key={entry.label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '0.75rem', padding: '0.65rem 0.75rem', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 8 }}>
                                        <span style={{ fontSize: '0.68rem', color: '#7c3aed', fontWeight: 900 }}>{entry.label}</span>
                                        <span style={{ fontSize: '0.76rem', color: '#334155', fontWeight: 700 }}>{entry.item.subject ? `${entry.item.subject}: ` : ''}{entry.item.signal || '-'}</span>
                                    </div>
                                ))}
                            </div>
                        ) : renderMiniEmpty('Zümre haritası için yeterli ders kırılımı yok.')}
                    </div>

                    <div className="premium-card col-span-6" style={{ padding: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <TrendingUp size={18} />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Müdahale Sonrası Takip</h4>
                        </div>
                        <p style={{ fontSize: '0.82rem', lineHeight: 1.65, color: '#475569', margin: 0, fontWeight: 600 }}>
                            {aiSummary?.postInterventionFollowUp?.summary || 'İlk analizden sonra takip notu oluşacak.'}
                        </p>
                    </div>

                    <div className="premium-card col-span-12" style={{ padding: '1.5rem', borderLeft: '4px solid #0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(15, 23, 42, 0.08)', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileSpreadsheet size={18} />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Müdüre Haftalık Özet</h4>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#10b981', marginBottom: '0.65rem' }}>İyi Giden 3 Şey</div>
                                {renderBriefList(aiSummary?.principalWeeklyBrief?.goodThings || [], '#10b981')}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#ef4444', marginBottom: '0.65rem' }}>Alarm Veren 3 Şey</div>
                                {renderBriefList(aiSummary?.principalWeeklyBrief?.alarms || [], '#ef4444')}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#2563eb', marginBottom: '0.65rem' }}>Hemen Yapılacak 3 Aksiyon</div>
                                {renderBriefList(aiSummary?.principalWeeklyBrief?.immediateActions || [], '#2563eb')}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#0f172a', marginBottom: '0.65rem' }}>Zümre Notu</div>
                                <p style={{ fontSize: '0.78rem', lineHeight: 1.55, color: '#475569', margin: 0, fontWeight: 650 }}>
                                    {aiSummary?.principalWeeklyBrief?.departmentNote || 'Zümreye iletilecek not henüz oluşmadı.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Insight Cards Grid */}
                <div className="dashboard-grid">
                    {/* Kör Nokta */}
                    <div className="premium-card col-span-4" style={{ padding: '1.5rem', borderLeft: '4px solid #ef4444' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertCircle size={18} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Kör Nokta Tespiti</h4>
                                <div style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 800, marginTop: 2 }}>Ortalamanın arkasında gizlenen gerçek</div>
                            </div>
                        </div>
                        {isAiLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '90%' }} className="shimmer"></div>
                                <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '70%' }} className="shimmer"></div>
                            </div>
                        ) : (
                            <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: '#475569', margin: 0, fontWeight: 500 }}>
                                {aiSummary?.blindSpot || 'Analiz bekleniyor...'}
                            </p>
                        )}
                    </div>

                    {/* Verimlilik */}
                    <div className="premium-card col-span-4" style={{ padding: '1.5rem', borderLeft: '4px solid #8b5cf6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Zap size={18} />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Verimlilik Analizi</h4>
                        </div>
                        {isAiLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '85%' }} className="shimmer"></div>
                                <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '65%' }} className="shimmer"></div>
                            </div>
                        ) : (
                            <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: '#475569', margin: 0, fontWeight: 500 }}>
                                {aiSummary?.efficiencyInsight || 'Analiz bekleniyor...'}
                            </p>
                        )}
                    </div>

                    {/* En Yüksek Getirili Müdahale */}
                    <div className="premium-card col-span-4" style={{ padding: '1.5rem', borderLeft: '4px solid #10b981' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Target size={18} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>En Yüksek Getirili Müdahale</h4>
                                <div style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 800, marginTop: 2 }}>Bu haftanın odağı</div>
                            </div>
                        </div>
                        {isAiLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '80%' }} className="shimmer"></div>
                                <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, width: '60%' }} className="shimmer"></div>
                            </div>
                        ) : (
                            <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: '#475569', margin: 0, fontWeight: 500 }}>
                                {aiSummary?.highestROI || 'Analiz bekleniyor...'}
                            </p>
                        )}
                    </div>

                    {/* Momentum Raporu */}
                    <div className="premium-card col-span-6" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <BarChart size={18} />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Momentum Raporu</h4>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {aiSummary?.momentum && aiSummary.momentum.length > 0 ? (
                                aiSummary.momentum.map((item: any, i: number) => (
                                    <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '0.65rem 1rem',
                                        background: isUrgentMomentum(item) ? '#fef2f2' : '#f8fafc',
                                        borderRadius: '12px',
                                        border: isUrgentMomentum(item) ? '1px solid #fecaca' : '1px solid #f1f5f9'
                                    }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{item.subject}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.85rem' }}>
                                                {renderMomentumMarks(item.direction, item.intensity)}
                                            </span>
                                            {isUrgentMomentum(item) && (
                                                <span style={{ padding: '2px 7px', borderRadius: '8px', background: '#ef4444', color: 'white', fontSize: '0.65rem', fontWeight: 900 }}>ACİL</span>
                                            )}
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800,
                                                background: item.direction === 'up' ? 'rgba(16,185,129,0.1)' : item.direction === 'down' ? 'rgba(239,68,68,0.1)' : '#f1f5f9',
                                                color: item.direction === 'up' ? '#10b981' : item.direction === 'down' ? '#ef4444' : '#64748b'
                                            }}>
                                                {item.note}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="premium-empty-state" style={{ padding: '2rem' }}>
                                    <BarChart size={24} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                                    <p style={{ fontSize: '0.8rem' }}>Analizi yenileyin</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Kritik Ders Hataları - Son 3 Deneme */}
                    <div className="premium-card col-span-6" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertCircle size={18} />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Kritik Ders Hataları</h4>
                            <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, color: '#64748b' }}>Son 3 Deneme</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {erroredCourses.length === 0 ? (
                                <div className="premium-empty-state" style={{ padding: '2rem 1rem' }}>
                                    <AlertCircle size={24} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                                    <p style={{ fontSize: '0.8rem' }}>Analiz edilecek veri yok</p>
                                </div>
                            ) : (
                                erroredCourses.map((item: any, i: number) => (
                                    <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '0.65rem 1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{item.course}</span>
                                            {item.affected && <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>{item.affected} öğrenci</span>}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ padding: '2px 8px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.72rem', fontWeight: 800 }}>{item.rate}</span>
                                            {item.trend && item.trend !== 'stable' && (
                                                <span style={{ fontSize: '0.7rem', color: item.trend === 'rising' ? '#ef4444' : '#10b981' }}>
                                                    {item.trend === 'rising' ? '↑ Artıyor' : '↓ Azalıyor'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Verimlilik Matrisi (Pie Chart) */}
                    <div className="premium-card col-span-6" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <BarChart size={18} />
                                </div>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Verimlilik Matrisi</h4>
                            </div>
                            <button onClick={() => setIsCorrelationExpanded(!isCorrelationExpanded)} style={{ background: '#f1f5f9', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800, padding: '0.4rem 0.75rem', borderRadius: '8px' }}>
                                {isCorrelationExpanded ? 'Grafiği Göster' : 'Listeyi Göster'}
                            </button>
                        </div>
                        {correlationData.length === 0 ? (
                            <div className="premium-empty-state" style={{ padding: '3rem' }}>
                                <BarChart size={32} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
                                <p>Yeterli deneme verisi girilmemiş.</p>
                            </div>
                        ) : (
                            <div>
                                {!isCorrelationExpanded ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem', alignItems: 'center' }}>
                                        <div style={{ height: '180px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={correlationData} innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value">
                                                        {correlationData.map((entry: any, index: number) => <Cell key={index} fill={entry.color} />)}
                                                    </Pie>
                                                    <Tooltip />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            {correlationData.map((item: any, i: number) => (
                                                <div key={i} style={{ padding: '0.6rem', background: 'white', border: `1px solid ${item.color}20`, borderRadius: '12px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }}></div>
                                                        <span style={{ fontWeight: 800, fontSize: '0.72rem' }}>%{item.percentage}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e293b' }}>{item.name}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                                        {correlationData.map((category: any, idx: number) => (
                                            <div key={idx} style={{ background: '#f8fafc', borderRadius: '14px', padding: '0.85rem', border: `1px solid ${category.color}20` }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                                    <span style={{ fontWeight: 800, fontSize: '0.72rem', color: category.color }}>{category.name}</span>
                                                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>({category.value})</span>
                                                </div>
                                                <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    {category.students && category.students.length > 0 ? (
                                                        category.students.map((st: any, sIdx: number) => (
                                                            <div key={sIdx} style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.2rem 0.4rem', background: 'white', borderRadius: '6px' }}>{st.name}</div>
                                                        ))
                                                    ) : (
                                                        <div style={{ fontSize: '0.65rem', opacity: 0.5 }}>Öğrenci bulunmuyor</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Yükselen Öğrenciler */}
                    <div className="premium-card col-span-6" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <TrendingUp size={18} />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>En Yüksek Artış</h4>
                            <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, color: '#64748b' }}>Son 3 Deneme</span>
                        </div>
                        {renderTrendList(trendingData.rising || [], 'rising')}
                    </div>

                    {/* Düşen Öğrenciler */}
                    <div className="premium-card col-span-6" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <TrendingDown size={18} />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Takip Edilmesi Gerekenler</h4>
                            <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, color: '#64748b' }}>Son 3 Deneme</span>
                        </div>
                        {renderTrendList(trendingData.falling || [], 'falling')}
                    </div>
                </div>

            {/* Create Exam Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
                        <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="premium-card" style={{ maxWidth: '900px', width: '95%', padding: '2.5rem', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div className="modal-header" style={{ marginBottom: '2rem' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.02em' }}>Yeni Deneme Kaydı</h2>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Öğrenci bazlı detaylı deneme sonuçlarını sisteme girin.</p>
                                </div>
                                <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>

                            <form onSubmit={handleCreateExam} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <div className="modal-scroll-area custom-scrollbar" style={{ flex: 1, paddingRight: '1rem', marginBottom: '2rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2.5rem' }}>
                                        <div className="form-group">
                                            <label style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'block' }}>Öğrenci Seçimi</label>
                                            <div className="form-select-container">
                                                <select
                                                    required
                                                    className="premium-input"
                                                    value={newExam.student_id}
                                                    onChange={e => setNewExam({ ...newExam, student_id: e.target.value })}
                                                >
                                                    <option value="">Öğrenci Seçin...</option>
                                                    {students.map((s) => (
                                                        <option key={s.id} value={s.id}>{s.name} ({s.class})</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'block' }}>Sınav Tarihi</label>
                                            <input
                                                type="date"
                                                required
                                                className="premium-input"
                                                value={newExam.date}
                                                onChange={e => setNewExam({ ...newExam, date: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.5rem', padding: '0.4rem', background: '#f1f5f9', borderRadius: '16px', marginBottom: '2.5rem', width: 'fit-content' }}>
                                        {[
                                            { id: 'tyt', label: 'TYT Denemesi', icon: <BookOpen size={16} /> },
                                            { id: 'ayt', label: 'AYT Denemesi', icon: <Zap size={16} /> }
                                        ].map(tab => (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => setActiveExamTab(tab.id as any)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                                                    border: 'none', padding: '0.75rem 1.5rem', borderRadius: '12px',
                                                    fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    background: activeExamTab === tab.id ? 'white' : 'transparent',
                                                    color: activeExamTab === tab.id ? 'var(--primary)' : '#64748b',
                                                    boxShadow: activeExamTab === tab.id ? '0 4px 12px rgba(0,0,0,0.05)' : 'none'
                                                }}
                                            >
                                                {tab.icon} {tab.label}
                                            </button>
                                        ))}
                                    </div>

                                    {activeExamTab === 'tyt' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                            <div className="premium-glass" style={{ padding: '2rem', borderRadius: '24px', background: 'rgba(248, 250, 252, 0.5)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                                        <BookOpen size={18} color="var(--primary)" />
                                                    </div>
                                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 850 }}>Genel Yetenekler</h3>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                                    {[
                                                        { label: 'Türkçe', d: 'tyt_tur_d', y: 'tyt_tur_y' },
                                                        { label: 'Matematik', d: 'tyt_mat_d', y: 'tyt_mat_y' }
                                                    ].map(subject => (
                                                        <div key={subject.d} style={{ background: 'white', padding: '1.25rem', borderRadius: '16px', border: '1px solid #eef2ff' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                                                                <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{subject.label}</span>
                                                                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 800 }}>{getNet(subject.d, subject.y).toFixed(2)} Net</span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                                <div style={{ flex: 1 }}>
                                                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Doğru</label>
                                                                    <input type="number" min="0" className="premium-input" style={{ height: '42px', padding: '0 0.85rem' }} value={newExam[subject.d] || ''} onChange={e => setNewExam({ ...newExam, [subject.d]: e.target.value })} placeholder="0" />
                                                                </div>
                                                                <div style={{ flex: 1 }}>
                                                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Yanlış</label>
                                                                    <input type="number" min="0" className="premium-input" style={{ height: '42px', padding: '0 0.85rem' }} value={newExam[subject.y] || ''} onChange={e => setNewExam({ ...newExam, [subject.y]: e.target.value })} placeholder="0" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="premium-glass" style={{ padding: '2rem', borderRadius: '24px', background: 'rgba(248, 250, 252, 0.5)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                                        <Globe size={18} color="var(--primary)" />
                                                    </div>
                                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 850 }}>Sosyal Bilimler</h3>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                                    {[
                                                        { label: 'Tarih', d: 'tyt_tar_d', y: 'tyt_tar_y' },
                                                        { label: 'Coğrafya', d: 'tyt_cog_d', y: 'tyt_cog_y' },
                                                        { label: 'Felsefe', d: 'tyt_fel_d', y: 'tyt_fel_y' },
                                                        { label: 'Din', d: 'tyt_din_d', y: 'tyt_din_y' }
                                                    ].map(subject => (
                                                        <div key={subject.d} style={{ background: 'white', padding: '1rem', borderRadius: '16px', border: '1px solid #eef2ff' }}>
                                                            <div style={{ marginBottom: '1rem', fontWeight: 800, fontSize: '0.8rem' }}>{subject.label}</div>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <input type="number" min="0" className="premium-input" style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.8rem' }} value={newExam[subject.d] || ''} onChange={e => setNewExam({ ...newExam, [subject.d]: e.target.value })} placeholder="D" />
                                                                <input type="number" min="0" className="premium-input" style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.8rem' }} value={newExam[subject.y] || ''} onChange={e => setNewExam({ ...newExam, [subject.y]: e.target.value })} placeholder="Y" />
                                                            </div>
                                                            <div style={{ marginTop: '0.75rem', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', color: 'var(--primary)' }}>{getNet(subject.d, subject.y).toFixed(2)} N</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="premium-glass" style={{ padding: '2rem', borderRadius: '24px', background: 'rgba(248, 250, 252, 0.5)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                                        <Atom size={18} color="var(--primary)" />
                                                    </div>
                                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 850 }}>Fen Bilimleri</h3>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                                                    {[
                                                        { label: 'Fizik', d: 'tyt_fiz_d', y: 'tyt_fiz_y' },
                                                        { label: 'Kimya', d: 'tyt_kim_d', y: 'tyt_kim_y' },
                                                        { label: 'Biyoloji', d: 'tyt_biy_d', y: 'tyt_biy_y' }
                                                    ].map(subject => (
                                                        <div key={subject.d} style={{ background: 'white', padding: '1rem', borderRadius: '16px', border: '1px solid #eef2ff' }}>
                                                            <div style={{ marginBottom: '1rem', fontWeight: 800, fontSize: '0.8rem' }}>{subject.label}</div>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <input type="number" min="0" className="premium-input" style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.8rem' }} value={newExam[subject.d] || ''} onChange={e => setNewExam({ ...newExam, [subject.d]: e.target.value })} placeholder="D" />
                                                                <input type="number" min="0" className="premium-input" style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.8rem' }} value={newExam[subject.y] || ''} onChange={e => setNewExam({ ...newExam, [subject.y]: e.target.value })} placeholder="Y" />
                                                            </div>
                                                            <div style={{ marginTop: '0.75rem', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', color: 'var(--primary)' }}>{getNet(subject.d, subject.y).toFixed(2)} N</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div style={{
                                                marginTop: '1rem', padding: '1.5rem', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                                borderRadius: '20px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Toplam TYT Başarısı</div>
                                                    <div style={{ fontSize: '2rem', fontWeight: 900 }}>{calculateTotalTYT().toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>Net</span></div>
                                                </div>
                                                <TrendingUp size={48} style={{ opacity: 0.2 }} />
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                            <div className="premium-glass" style={{ padding: '2rem', borderRadius: '24px', background: 'rgba(248, 250, 252, 0.5)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                                        <Calculator size={18} color="var(--primary)" />
                                                    </div>
                                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 850 }}>Sayısal (SAY)</h3>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                                    {[
                                                        { label: 'Matematik', d: 'ayt_mat_d', y: 'ayt_mat_y' },
                                                        { label: 'Fizik', d: 'ayt_fiz_d', y: 'ayt_fiz_y' },
                                                        { label: 'Kimya', d: 'ayt_kim_d', y: 'ayt_kim_y' },
                                                        { label: 'Biyoloji', d: 'ayt_biy_d', y: 'ayt_biy_y' }
                                                    ].map(subject => (
                                                        <div key={subject.d} style={{ background: 'white', padding: '1rem', borderRadius: '16px', border: '1px solid #eef2ff' }}>
                                                            <div style={{ marginBottom: '1rem', fontWeight: 800, fontSize: '0.8rem' }}>{subject.label}</div>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <input type="number" min="0" className="premium-input" style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.8rem' }} value={newExam[subject.d] || ''} onChange={e => setNewExam({ ...newExam, [subject.d]: e.target.value })} placeholder="D" />
                                                                <input type="number" min="0" className="premium-input" style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.8rem' }} value={newExam[subject.y] || ''} onChange={e => setNewExam({ ...newExam, [subject.y]: e.target.value })} placeholder="Y" />
                                                            </div>
                                                            <div style={{ marginTop: '0.75rem', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', color: 'var(--primary)' }}>{getNet(subject.d, subject.y).toFixed(2)} N</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="premium-glass" style={{ padding: '2rem', borderRadius: '24px', background: 'rgba(248, 250, 252, 0.5)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                                        <PenTool size={18} color="var(--primary)" />
                                                    </div>
                                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 850 }}>Eşit Ağırlık & Sözel</h3>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                                    {[
                                                        { label: 'Edebiyat', d: 'ayt_edb_d', y: 'ayt_edb_y' },
                                                        { label: 'Tarih-1', d: 'ayt_tar1_d', y: 'ayt_tar1_y' },
                                                        { label: 'Coğrafya-1', d: 'ayt_cog1_d', y: 'ayt_cog1_y' },
                                                        { label: 'Tarih-2', d: 'ayt_tar2_d', y: 'ayt_tar2_y' },
                                                        { label: 'Coğrafya-2', d: 'ayt_cog2_d', y: 'ayt_cog2_y' },
                                                        { label: 'Felsefe', d: 'ayt_fel_d', y: 'ayt_fel_y' },
                                                        { label: 'Din Kültürü', d: 'ayt_din_d', y: 'ayt_din_y' }
                                                    ].map(subject => (
                                                        <div key={subject.d} style={{ background: 'white', padding: '1rem', borderRadius: '16px', border: '1px solid #eef2ff' }}>
                                                            <div style={{ marginBottom: '1rem', fontWeight: 800, fontSize: '0.8rem' }}>{subject.label}</div>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <input type="number" min="0" className="premium-input" style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.8rem' }} value={newExam[subject.d] || ''} onChange={e => setNewExam({ ...newExam, [subject.d]: e.target.value })} placeholder="D" />
                                                                <input type="number" min="0" className="premium-input" style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.8rem' }} value={newExam[subject.y] || ''} onChange={e => setNewExam({ ...newExam, [subject.y]: e.target.value })} placeholder="Y" />
                                                            </div>
                                                            <div style={{ marginTop: '0.75rem', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', color: 'var(--primary)' }}>{getNet(subject.d, subject.y).toFixed(2)} N</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div style={{
                                                marginTop: '1rem', padding: '1.5rem', background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                                                borderRadius: '20px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Toplam AYT Başarısı</div>
                                                    <div style={{ fontSize: '2rem', fontWeight: 900 }}>{calculateTotalAYT().toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>Net</span></div>
                                                </div>
                                                <Zap size={48} style={{ opacity: 0.2 }} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                                    <button type="button" className="premium-button-secondary" onClick={() => setShowCreateModal(false)} style={{ flex: 1 }}>
                                        Vazgeç
                                    </button>
                                    <button type="submit" className="premium-button" style={{ flex: 2 }}>
                                        Sonuçları Kaydet ve Hesapla
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Announcement Modal */}
            <AnimatePresence>
                {showAnnouncementModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
                        <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="premium-card announcement-modal-card">
                            <div className="modal-header" style={{ marginBottom: '2rem' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>Sınav Duyurusu Merkezi</h2>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Yeni duyuru yayınlayın veya geçmiş duyuruları yönetin.</p>
                                </div>
                                <button className="modal-close" onClick={() => setShowAnnouncementModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="modal-scroll-area custom-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                                <div className="announcement-grid">
                                    {/* Left Side: Form */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <PenTool size={16} color="var(--primary)" />
                                            </div>
                                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>{editingAnnouncementId ? 'Duyuruyu Düzenle' : 'Yeni Duyuru'}</h4>
                                        </div>

                                        <form onSubmit={handleSendAnnouncement}>
                                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                                <CustomSelect
                                                    label="SINAV TÜRÜ"
                                                    title="Sınav Türü Seçin"
                                                    value={announcement.type}
                                                    onChange={val => setAnnouncement({ ...announcement, type: val })}
                                                    options={[
                                                        { value: 'TYT', label: 'TYT Denemesi' },
                                                        { value: 'AYT', label: 'AYT Denemesi' }
                                                    ]}
                                                />
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                                                <CustomDatePicker
                                                    label="TARİH"
                                                    value={announcement.date}
                                                    onChange={val => setAnnouncement({ ...announcement, date: val })}
                                                />
                                                <CustomTimePicker
                                                    label="SAAT"
                                                    value={announcement.time}
                                                    onChange={val => setAnnouncement({ ...announcement, time: val })}
                                                />
                                            </div>

                                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                                <CustomSelect
                                                    label="HEDEF KİTLE"
                                                    title="Hedef Kitle Seçin"
                                                    value={announcement.target}
                                                    onChange={val => setAnnouncement({ ...announcement, target: val })}
                                                    options={[
                                                        { value: 'all', label: 'Tüm Kurum' },
                                                        ...classes.map(c => ({ value: c.name, label: `${c.name} Sınıfı` }))
                                                    ]}
                                                />
                                            </div>

                                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.5rem', display: 'block' }}>EK NOT (OPSİYONEL)</label>
                                                <textarea
                                                    className="premium-input"
                                                    style={{ height: '70px', paddingTop: '0.75rem', resize: 'none' }}
                                                    placeholder="Örn: Kalem ve silginizi getirmeyi unutmayın."
                                                    value={announcement.note}
                                                    onChange={e => setAnnouncement({ ...announcement, note: e.target.value })}
                                                ></textarea>
                                            </div>

                                            <button type="submit" className="premium-button" style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                                                {editingAnnouncementId ? 'Değişiklikleri Kaydet' : 'Duyuruyu Şimdi Yayınla'}
                                            </button>
                                            {editingAnnouncementId && (
                                                <button type="button" onClick={() => { setEditingAnnouncementId(null); setAnnouncement({ type: 'TYT', date: '', time: '10:00', target: 'all', note: '' }); }} style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>
                                                    Düzenlemeyi İptal Et
                                                </button>
                                            )}
                                        </form>
                                    </div>

                                    {/* Right Side: History */}
                                    <div className="announcement-history-side">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Calendar size={16} color="#64748b" />
                                            </div>
                                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Duyuru Geçmişi</h4>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                            {notificationHistory.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#f8fafc', borderRadius: '20px', color: '#94a3b8' }}>
                                                    <Bell size={32} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Henüz duyuru bulunmuyor.</div>
                                                </div>
                                            ) : (
                                                notificationHistory.map((item, idx) => (
                                                    <motion.div
                                                        initial={{ opacity: 0, x: 10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: idx * 0.05 }}
                                                        key={idx}
                                                        style={{
                                                            padding: '1.25rem', background: '#f8fafc', borderRadius: '18px',
                                                            border: '1px solid #f1f5f9', position: 'relative'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                                            <div>
                                                                <div style={{ fontWeight: 850, fontSize: '0.9rem', color: '#1e293b' }}>{item.type} Denemesi</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>
                                                                    {item.target === 'all' ? 'Tüm Kurum' : `${item.target} Sınıfı`}
                                                                </div>
                                                            </div>
                                                            <div style={{ textAlign: 'right' }}>
                                                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)' }}>{item.date}</div>
                                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>Saat: {item.time}</div>
                                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                                                    <button onClick={() => { setAnnouncement({ type: item.type, date: item.date, time: item.time, target: item.target, note: item.note || '' }); setEditingAnnouncementId(item.id); }} style={{ background: '#f1f5f9', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '0.35rem', borderRadius: '6px' }} title="Düzenle">
                                                                        <Edit2 size={13} />
                                                                    </button>
                                                                    <button onClick={() => handleDeleteAnnouncement(item.id)} style={{ background: '#fef2f2', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.35rem', borderRadius: '6px' }} title="Sil">
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {item.note && (
                                                            <div style={{
                                                                fontSize: '0.75rem', color: '#475569', background: 'white',
                                                                padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #f1f5f9',
                                                                marginTop: '0.5rem', fontStyle: 'italic'
                                                            }}>
                                                                "{item.note}"
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Upload Modal */}
            <AnimatePresence>
                {showUploadModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
                        <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="premium-card" style={{ maxWidth: '500px', width: '90%', padding: '2rem' }}>
                            <div className="modal-header" style={{ marginBottom: '2rem' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 850 }}>Toplu Veri Aktarımı</h2>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Excel veya CSV dosyası ile sonuçları aktarın.</p>
                                </div>
                                <button className="modal-close" onClick={() => setShowUploadModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="upload-zone" style={{ padding: '3rem 2rem', marginBottom: '1.5rem', cursor: 'pointer' }}>
                                <div style={{ position: 'relative', zIndex: 1 }}>
                                    <div style={{ width: 64, height: 64, borderRadius: '20px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', boxShadow: '0 8px 16px rgba(0,0,0,0.05)' }}>
                                        <Upload size={28} color="var(--primary)" />
                                    </div>
                                    <p style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Dosyayı Sürükleyin veya Seçin</p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Maksimum dosya boyutu: 10MB (.xlsx, .csv)</p>
                                </div>
                                <input
                                    type="file"
                                    accept=".csv, .xlsx, .xls"
                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                                    onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                                />
                            </div>

                            {uploadFile && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '16px', marginBottom: '2rem', border: '1px solid #f1f5f9' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                        <FileSpreadsheet size={20} color="var(--primary)" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{uploadFile.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{(uploadFile.size / 1024).toFixed(1)} KB</div>
                                    </div>
                                    <button onClick={() => setUploadFile(null)} style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)', border: 'none', width: 32, height: 32, borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <X size={16} />
                                    </button>
                                </motion.div>
                            )}

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="button" className="premium-button-secondary" onClick={() => setShowUploadModal(false)} style={{ flex: 1 }}>
                                    Vazgeç
                                </button>
                                <button
                                    type="button"
                                    className="premium-button"
                                    disabled={!uploadFile}
                                    onClick={handleFileUpload}
                                    style={{ flex: 1.5, opacity: uploadFile ? 1 : 0.5 }}
                                >
                                    Yüklemeyi Başlat
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
                </>
            )}
        </motion.div>
    );
};

export default ExamCenter;
