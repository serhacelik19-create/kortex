import React, { useState, useEffect } from 'react';
import {
    Calendar as CalendarIcon,
    Search,
    CheckCircle2,
    XCircle,
    Clock,
    Filter,
    Users,
    RefreshCcw,
    Coffee,
    AlertTriangle,
    CheckSquare,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    BarChart,
    Bell,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api';
import { usePanelToast } from './components/PanelToastProvider';

interface AttendanceRecord {
    id: number;
    name: string;
    class: string;
    parentName: string | null;
    parentPhone: string | null;
    status: 'geldi' | 'gelmedi' | 'gec_kaldi' | 'izinli' | null;
}

interface RiskyStudent {
    id: number;
    name: string;
    class: string;
    absentCount: number;
}

const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const Attendance: React.FC = () => {
    const { showToast } = usePanelToast();
    const [date, setDate] = useState(getTodayString());
    const [students, setStudents] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClass, setSelectedClass] = useState<string>('Tümü');
    const [classes, setClasses] = useState<string[]>([]);
    const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, excused: 0, total: 0 });
    const [riskyStudents, setRiskyStudents] = useState<RiskyStudent[]>([]);
    const [showRiskModal, setShowRiskModal] = useState(false);
    const [showClassSelector, setShowClassSelector] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [viewMode, setViewMode] = useState<'daily' | 'exams' | 'guidance'>('daily');
    const [exams, setExams] = useState<any[]>([]);
    const [guidanceAppointments, setGuidanceAppointments] = useState<any[]>([]);
    const [selectedExamId, setSelectedExamId] = useState<string>('');
    const [examAttendance, setExamAttendance] = useState<any[]>([]);
    const [calendarViewDate, setCalendarViewDate] = useState(new Date(date));
    const [showBatchSender, setShowBatchSender] = useState(false);
    const [batchQueue, setBatchQueue] = useState<any[]>([]);
    const [currentQueueIndex, setCurrentQueueIndex] = useState(0);

    // Update view date when date changes externally
    useEffect(() => {
        setCalendarViewDate(new Date(date));
    }, [date]);

    const handlePrevDay = () => {
        const d = new Date(date);
        d.setDate(d.getDate() - 1);
        setDate(d.toISOString().split('T')[0]);
    };

    const handleNextDay = () => {
        const d = new Date(date);
        d.setDate(d.getDate() + 1);
        setDate(d.toISOString().split('T')[0]);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [attendanceData, classData, riskData] = await Promise.all([
                api.getAttendance(date),
                api.getClasses(),
                api.getAttendanceRisk()
            ]);
            
            setStudents(attendanceData);
            setClasses(['Tümü', ...classData.map((c: any) => c.name)]);
            setRiskyStudents(riskData);
            
            // Calculate stats
            updateStats(attendanceData);
        } catch (err) {
            console.error('Veri yükleme hatası:', err);
        } finally {
            setLoading(false);
        }
    };

    const updateStats = (data: AttendanceRecord[]) => {
        setStats({
            present: data.filter(a => a.status === 'geldi').length,
            absent: data.filter(a => a.status === 'gelmedi').length,
            late: data.filter(a => a.status === 'gec_kaldi').length,
            excused: data.filter(a => a.status === 'izinli').length,
            total: data.length
        });
    };

    const fetchExams = async () => {
        try {
            const data = await api.getExamAttendanceList();
            setExams(data);
        } catch (err) {
            console.error('Sınavlar yüklenemedi:', err);
        }
    };

    const fetchExamAttendance = async (examId: string) => {
        if (!examId) return;
        setLoading(true);
        try {
            const selectedExam = exams.find(e => e.id === examId);
            if (!selectedExam) return;

            const data = await api.getExamReport(selectedExam.date, selectedExam.type);
            setExamAttendance(data);
        } catch (err) {
            console.error('Sınav yoklaması yüklenemedi:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchGuidanceAppointments = async () => {
        setLoading(true);
        try {
            const data = await api.getAppointments({ date });
            setGuidanceAppointments(data);
        } catch (err) {
            console.error('Rehberlik randevuları yüklenemedi:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (viewMode === 'daily') {
            fetchData();
        } else if (viewMode === 'exams') {
            fetchExams();
        } else if (viewMode === 'guidance') {
            fetchGuidanceAppointments();
        }
    }, [date, viewMode]);

    useEffect(() => {
        if (viewMode === 'exams' && selectedExamId) {
            fetchExamAttendance(selectedExamId);
        }
    }, [selectedExamId, viewMode]);

    const handleUpdateGuidanceStatus = async (appointmentId: number, status: string) => {
        try {
            await api.updateAppointment(appointmentId, { status });
            fetchGuidanceAppointments();
        } catch (err) {
            console.error('Randevu durumu güncellenemedi:', err);
        }
    };

    const handleStatusUpdate = async (studentId: number, status: string) => {
        try {
            await api.updateAttendance({ studentId, date, status });
            setStudents(prev => {
                const updated = prev.map(s => s.id === studentId ? { ...s, status: status as any } : s);
                updateStats(updated);
                return updated;
            });
        } catch (err) {
            console.error('Güncelleme hatası:', err);
        }
    };

    const handleBulkPresence = async () => {
        const studentIds = students
            .filter(s => s.status === null && (selectedClass === 'Tümü' || s.class === selectedClass))
            .map(s => s.id);
        
        if (studentIds.length === 0) return;

        try {
            await api.bulkAttendance({ date, studentIds, status: 'geldi' });
            setStudents(prev => {
                const updated = prev.map(s => studentIds.includes(s.id) ? { ...s, status: 'geldi' as any } : s);
                updateStats(updated);
                return updated;
            });
        } catch (err) {
            console.error('Toplu güncelleme hatası:', err);
        }
    };

    const buildDailyNotification = (student: AttendanceRecord) => {
        const body = student.status === 'gelmedi' 
            ? `Sayın velimiz, öğrencimiz ${student.name} bugün (${new Date(date).toLocaleDateString('tr-TR')}) kurumumuza devamsızlık yapmıştır. Bilginize.`
            : student.status === 'gec_kaldi'
            ? `Sayın velimiz, öğrencimiz ${student.name} bugün (${new Date(date).toLocaleDateString('tr-TR')}) kurumumuza geç kalmıştır. Bilginize.`
            : '';
        return {
            studentId: student.id,
            title: student.status === 'gelmedi' ? 'Devamsızlık Bilgilendirmesi' : 'Geç Kalma Bilgilendirmesi',
            body,
            type: 'attendance',
            priority: 'urgent' as const,
        };
    };

    const buildExamNotification = (student: any) => {
        const selectedExam = exams.find(e => e.id === selectedExamId);
        return {
            studentId: student.id,
            title: 'Sınav Katılım Bilgilendirmesi',
            body: `Sayın velimiz, öğrencimiz ${student.name}, kurumumuzda uygulanan ${selectedExam?.name || 'sınav'} sınavına katılmamıştır. Bilginize.`,
            type: 'exam',
            priority: 'normal' as const,
        };
    };

    const buildGuidanceNotification = (appointment: any) => {
        return {
            studentId: appointment.student?.id,
            title: 'Rehberlik Görüşmesi Bilgilendirmesi',
            body: `Sayın velimiz, öğrencimiz ${appointment.student?.name}, bugün planlanan rehberlik/koçluk görüşmesine katılmamıştır. Bilginize.`,
            type: 'guidance',
            priority: 'normal' as const,
        };
    };

    const sendParentNotificationForItem = async (item: any) => {
        const payload = viewMode === 'exams'
            ? buildExamNotification(item)
            : viewMode === 'guidance'
            ? buildGuidanceNotification(item)
            : buildDailyNotification(item);

        if (!payload.studentId || !payload.body) return;

        try {
            const res = await api.sendParentNotification({
                target: 'student',
                studentId: payload.studentId,
                title: payload.title,
                body: payload.body,
                type: payload.type,
                priority: payload.priority,
            });
            showToast({ type: 'success', title: 'Bildirim Gönderildi', message: `${res.recipientCount || 1} veli cihazına iletildi.` });
        } catch (err: any) {
            showToast({
                type: 'warning',
                title: 'Veli uygulaması aktif değil',
                message: err?.response?.data?.error || 'Bu öğrencinin aktif veli cihazı yok. Önce veli linki oluşturun.',
            });
        }
    };

    const handleOpenBatchSender = () => {
        let toSend: any[] = [];
        if (viewMode === 'exams') {
            toSend = examAttendance.filter(s => s.status === 'girmedi');
        } else if (viewMode === 'guidance') {
            toSend = guidanceAppointments.filter(s => s.status === 'absent');
        } else if (viewMode === 'daily') {
            toSend = students.filter(s => s.status === 'gelmedi' || s.status === 'gec_kaldi');
        }

        if (toSend.length === 0) {
            showToast({ type: 'info', title: 'Öğrenci Yok', message: 'Bildirim gönderilecek öğrenci bulunamadı.' });
            return;
        }
        setBatchQueue(toSend);
        setCurrentQueueIndex(0);
        setShowBatchSender(true);
    };

    const processNextInQueue = async () => {
        if (currentQueueIndex >= batchQueue.length) return;
        
        const item = batchQueue[currentQueueIndex];
        await sendParentNotificationForItem(item);
        setCurrentQueueIndex(prev => prev + 1);
    };

    const getQueueStudentName = (item: any) => viewMode === 'guidance'
        ? item.student?.name || 'Öğrenci'
        : item.name || 'Öğrenci';

    const getQueueStudentClass = (item: any) => viewMode === 'guidance'
        ? item.student?.class || '-'
        : item.class || '-';

    const filteredStudents = viewMode === 'daily' 
        ? students.filter(s => {
            const matchesSearch = s.name.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'));
            const matchesClass = selectedClass === 'Tümü' || s.class === selectedClass;
            return matchesSearch && matchesClass;
        })
        : viewMode === 'exams'
        ? examAttendance.filter(s => {
            const matchesSearch = s.name.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'));
            const matchesClass = selectedClass === 'Tümü' || s.class === selectedClass;
            return matchesSearch && matchesClass;
        })
        : guidanceAppointments.filter(s => {
            const matchesSearch = s.student?.name.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'));
            const matchesClass = selectedClass === 'Tümü' || s.student?.class === selectedClass;
            return matchesSearch && matchesClass;
        });

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="main-content">
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.4rem', background: '#f1f5f9', borderRadius: '16px', marginBottom: '2rem', width: 'fit-content' }}>
                <button
                    onClick={() => setViewMode('daily')}
                    style={{
                        padding: '0.6rem 1.25rem', borderRadius: '12px', border: 'none',
                        background: viewMode === 'daily' ? 'white' : 'transparent',
                        color: viewMode === 'daily' ? 'var(--primary)' : '#64748b',
                        fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
                        boxShadow: viewMode === 'daily' ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                        transition: 'all 0.2s'
                    }}
                >
                    📅 Günlük Yoklama
                </button>
                <button
                    onClick={() => setViewMode('exams')}
                    style={{
                        padding: '0.6rem 1.25rem', borderRadius: '12px', border: 'none',
                        background: viewMode === 'exams' ? 'white' : 'transparent',
                        color: viewMode === 'exams' ? 'var(--primary)' : '#64748b',
                        fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
                        boxShadow: viewMode === 'exams' ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                        transition: 'all 0.2s'
                    }}
                >
                    📝 Deneme Yoklaması
                </button>
                <button
                    onClick={() => setViewMode('guidance')}
                    style={{
                        padding: '0.6rem 1.25rem', borderRadius: '12px', border: 'none',
                        background: viewMode === 'guidance' ? 'white' : 'transparent',
                        color: viewMode === 'guidance' ? 'var(--primary)' : '#64748b',
                        fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
                        boxShadow: viewMode === 'guidance' ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                        transition: 'all 0.2s'
                    }}
                >
                    🤝 Rehberlik Yoklaması
                </button>
            </div>

            <div className="attendance-header">
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem' }}>
                        {viewMode === 'daily' ? 'Günlük Yoklama' : viewMode === 'exams' ? 'Deneme Yoklaması' : 'Rehberlik Yoklaması'}
                    </h1>
                    <p style={{ color: 'var(--text-soft)', marginTop: '0.5rem' }}>
                        {viewMode === 'daily' 
                            ? 'Öğrenci devamsızlık takibi ve veli bilgilendirme.' 
                            : viewMode === 'exams'
                            ? 'Deneme sınavlarına katılım takibi ve sonuç kontrolü.'
                            : 'Rehberlik ve koçluk randevularının katılım takibi.'}
                    </p>
                </div>
                <div className="attendance-toolbar">
                    {viewMode === 'daily' && riskyStudents.length > 0 && (
                        <button 
                            onClick={() => setShowRiskModal(true)}
                            className="attendance-risk-button"
                        >
                            <AlertTriangle size={18} />
                            {riskyStudents.length} Riskli Öğrenci
                        </button>
                    )}
                    {(viewMode === 'daily' || viewMode === 'guidance') ? (
                        <div className="attendance-date-selector">
                        <div className="attendance-date-control">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handlePrevDay(); }} 
                                className="attendance-date-nav-btn"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            
                            <div 
                                onClick={() => setShowCalendar(!showCalendar)}
                                className="attendance-date-display"
                            >
                                <CalendarIcon size={16} className="calendar-icon" />
                                <span className="date-text">
                                    {new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                            </div>

                            <button 
                                onClick={(e) => { e.stopPropagation(); handleNextDay(); }} 
                                className="attendance-date-nav-btn"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        {/* Custom Calendar Popup */}
                        <AnimatePresence>
                            {showCalendar && (
                                <>
                                    <div 
                                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }} 
                                        onClick={() => setShowCalendar(false)} 
                                    />
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 12px)',
                                            right: 0,
                                            width: '320px',
                                            background: 'white',
                                            borderRadius: '24px',
                                            boxShadow: '0 20px 50px -12px rgba(0,0,0,0.15)',
                                            border: '1px solid var(--border-color)',
                                            zIndex: 1001,
                                            padding: '1.5rem',
                                            userSelect: 'none'
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* Calendar Header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                            <button 
                                                onClick={() => {
                                                    const d = new Date(calendarViewDate);
                                                    d.setMonth(d.getMonth() - 1);
                                                    setCalendarViewDate(d);
                                                }}
                                                style={{ background: '#f8fafc', border: 'none', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
                                            >
                                                <ChevronLeft size={16} />
                                            </button>
                                            
                                            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b', textTransform: 'capitalize' }}>
                                                {calendarViewDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                                            </div>

                                            <button 
                                                onClick={() => {
                                                    const d = new Date(calendarViewDate);
                                                    d.setMonth(d.getMonth() + 1);
                                                    setCalendarViewDate(d);
                                                }}
                                                style={{ background: '#f8fafc', border: 'none', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
                                            >
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>

                                        {/* Day Names */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                                            {['Pt', 'Sa', 'Çr', 'Pr', 'Cu', 'Ct', 'Pz'].map(d => (
                                                <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', paddingBottom: '4px' }}>{d}</div>
                                            ))}
                                        </div>

                                        {/* Days Grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                                            {(() => {
                                                const year = calendarViewDate.getFullYear();
                                                const month = calendarViewDate.getMonth();
                                                const firstDay = new Date(year, month, 1).getDay() || 7; // Monday = 1, Sunday = 7
                                                const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                const days = [];

                                                // Empty spaces for previous month
                                                for (let i = 1; i < firstDay; i++) {
                                                    days.push(<div key={`empty-${i}`} />);
                                                }

                                                // Current month days
                                                for (let d = 1; d <= daysInMonth; d++) {
                                                    const currentDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                                    const isSelected = date === currentDayStr;
                                                    const isToday = new Date().toISOString().split('T')[0] === currentDayStr;

                                                    days.push(
                                                        <button
                                                            key={d}
                                                            onClick={() => {
                                                                setDate(currentDayStr);
                                                                setShowCalendar(false);
                                                            }}
                                                            style={{
                                                                aspectRatio: '1',
                                                                border: 'none',
                                                                borderRadius: '12px',
                                                                background: isSelected ? 'var(--primary)' : isToday ? '#f0f4ff' : 'transparent',
                                                                color: isSelected ? 'white' : isToday ? 'var(--primary)' : '#475569',
                                                                fontSize: '0.85rem',
                                                                fontWeight: isSelected || isToday ? 800 : 500,
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                transition: 'all 0.2s',
                                                                position: 'relative'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                if (!isSelected) e.currentTarget.style.background = isToday ? '#f0f4ff' : 'transparent';
                                                            }}
                                                        >
                                                            {d}
                                                            {isToday && !isSelected && <div style={{ position: 'absolute', bottom: '4px', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--primary)' }} />}
                                                        </button>
                                                    );
                                                }
                                                return days;
                                            })()}
                                        </div>

                                        {/* Footer - Go to today */}
                                        <button 
                                            onClick={() => {
                                                const today = new Date().toISOString().split('T')[0];
                                                setDate(today);
                                                setShowCalendar(false);
                                            }}
                                            style={{
                                                marginTop: '1.25rem',
                                                width: '100%',
                                                padding: '0.75rem',
                                                borderRadius: '12px',
                                                border: '1px solid #f1f5f9',
                                                background: '#f8fafc',
                                                color: 'var(--primary)',
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            Bugüne Git
                                        </button>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                    ) : (
                        <div className="attendance-exam-selector" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            {viewMode === 'exams' ? (
                                <>
                                    <select 
                                        value={selectedExamId} 
                                        onChange={(e) => setSelectedExamId(e.target.value)}
                                        className="premium-input"
                                        style={{ minWidth: '280px', height: '42px', borderRadius: '12px' }}
                                    >
                                        <option value="">Sınav Seçiniz...</option>
                                        {exams.map(ex => (
                                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                                        ))}
                                    </select>
                                    <button 
                                        onClick={async () => {
                                            await fetchExams();
                                            if (selectedExamId) await fetchExamAttendance(selectedExamId);
                                            showToast({ type: 'success', title: 'Güncellendi', message: 'Sınav verileri başarıyla yenilendi.' });
                                        }}
                                        className="btn-outline"
                                        style={{ padding: '0.6rem', borderRadius: '12px' }}
                                        title="Verileri Yenile"
                                    >
                                        <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
                                    </button>
                                </>
                            ) : (
                                <button 
                                    onClick={fetchGuidanceAppointments}
                                    className="btn-outline"
                                    style={{ padding: '0.6rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
                                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Randevuları Yenile</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {viewMode === 'daily' ? (
                <div className="attendance-stats-grid">
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--primary)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>TOPLAM</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>{stats.total}</div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>GELDİ</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#10b981' }}>{stats.present}</div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>GELMEDİ</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#ef4444' }}>{stats.absent}</div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #f59e0b' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>GEÇ KALDI</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#f59e0b' }}>{stats.late}</div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #6366f1' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>İZİNLİ</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#6366f1' }}>{stats.excused}</div>
                    </div>
                </div>
            ) : viewMode === 'exams' ? (
                <div className="attendance-stats-grid">
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--primary)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>TOPLAM ÖĞRENCİ</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>{examAttendance.length}</div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>SINAVA GİREN</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#10b981' }}>{examAttendance.filter(a => a.status === 'girdi').length}</div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>GİRMEYEN</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#ef4444' }}>{examAttendance.filter(a => a.status === 'girmedi').length}</div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #6366f1' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>KATILIM ORANI</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#6366f1' }}>
                            {examAttendance.length > 0 ? Math.round((examAttendance.filter(a => a.status === 'girdi').length / examAttendance.length) * 100) : 0}%
                        </div>
                    </div>
                </div>
            ) : (
                <div className="attendance-stats-grid">
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--primary)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>TOPLAM RANDEVU</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>{guidanceAppointments.length}</div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>TAMAMLANDI</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#10b981' }}>{guidanceAppointments.filter(a => a.status === 'completed').length}</div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>GELMEDİ</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#ef4444' }}>{guidanceAppointments.filter(a => a.status === 'absent').length}</div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #6366f1' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>KATILIM ORANI</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#6366f1' }}>
                            {guidanceAppointments.length > 0 ? Math.round((guidanceAppointments.filter(a => a.status === 'completed').length / guidanceAppointments.length) * 100) : 0}%
                        </div>
                    </div>
                </div>
            )}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="attendance-filter-bar">
                    <div className="attendance-filter-group">
                        <div className="attendance-search-wrapper">
                            <Search size={18} className="search-icon" />
                            <input
                                type="text"
                                placeholder="Öğrenci ara..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="attendance-search-input"
                            />
                        </div>
                        <div className="attendance-class-filter">
                            <button
                                onClick={() => setShowClassSelector(!showClassSelector)}
                                className={`attendance-class-btn ${selectedClass !== 'Tümü' ? 'active' : ''}`}
                            >
                                <Filter size={16} />
                                <span>{selectedClass === 'Tümü' ? 'Tüm Sınıflar' : selectedClass}</span>
                                <ChevronDown size={14} className={`chevron-icon ${showClassSelector ? 'open' : ''}`} />
                            </button>
                            
                            {/* Class Selector Popup... (AnimatePresence content remains but we'll wrap it nicely) */}
                            <AnimatePresence>
                                {showClassSelector && (
                                    <>
                                        <div 
                                            className="class-selector-overlay"
                                            onClick={() => setShowClassSelector(false)} 
                                        />
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="class-selector-dropdown"
                                        >
                                            <div className="custom-scrollbar" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                                {classes.map(className => (
                                                    <button
                                                        key={className}
                                                        onClick={() => {
                                                            setSelectedClass(className);
                                                            setShowClassSelector(false);
                                                        }}
                                                        className={`class-option ${selectedClass === className ? 'selected' : ''}`}
                                                    >
                                                        <span>{className === 'Tümü' ? 'Tüm Sınıflar' : className}</span>
                                                        {selectedClass === className && <CheckSquare size={14} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                    {viewMode === 'daily' ? (
                        <div className="attendance-bulk-action" style={{ display: 'flex', gap: '0.75rem' }}>
                            <button 
                                onClick={handleBulkPresence}
                                className="btn-outline bulk-btn"
                            >
                                <CheckSquare size={16} /> Hepsini Geldi İşaretle
                            </button>
                            <button 
                                onClick={handleOpenBatchSender}
                                className="btn-primary bulk-btn"
                                disabled={students.filter(s => s.status === 'gelmedi' || s.status === 'gec_kaldi').length === 0}
                            >
                                <Bell size={16} /> Devamsızlara Bildir
                            </button>
                        </div>
                    ) : (
                        <div className="attendance-bulk-action">
                            <button 
                                onClick={handleOpenBatchSender}
                                className="btn-primary bulk-btn"
                                disabled={
                                    viewMode === 'exams' 
                                        ? examAttendance.filter(s => s.status === 'girmedi').length === 0
                                        : guidanceAppointments.filter(a => a.status === 'absent').length === 0
                                }
                            >
                                <Bell size={16} /> {viewMode === 'exams' ? 'Girmeyenlere Toplu Bildir' : 'Gelmeyenlere Toplu Bildir'}
                            </button>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '5rem' }}>
                        <RefreshCcw className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                        <div style={{ color: 'var(--text-muted)' }}>{viewMode === 'daily' ? 'Yoklama kayıtları yükleniyor...' : 'Deneme verileri analiz ediliyor...'}</div>
                    </div>
                ) : viewMode === 'exams' && !selectedExamId ? (
                    <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
                        <BarChart size={48} style={{ marginBottom: '1.5rem', opacity: 0.2 }} />
                        <h3>Sınav Seçiniz</h3>
                        <p>Yoklama durumunu görmek istediğiniz deneme sınavını yukarıdan seçin.</p>
                    </div>
                ) : filteredStudents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
                        <Users size={48} style={{ marginBottom: '1.5rem', opacity: 0.2 }} />
                        <h3>Sonuç Bulunamadı</h3>
                        <p>Kriterlere uygun kayıtlı öğrenci yok.</p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Öğrenci</th>
                                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sınıf</th>
                                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{viewMode === 'daily' ? 'Yoklama Durumu' : viewMode === 'exams' ? 'Sınav Katılımı' : 'Randevu Saati & Durumu'}</th>
                                <th style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map(student => (
                                <tr key={student.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} className="student-row-hover">
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{viewMode === 'guidance' ? student.student?.name : student.name}</div>
                                        {(viewMode === 'guidance' ? student.student?.parentName : student.parentName) && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Veli: {viewMode === 'guidance' ? student.student?.parentName : student.parentName}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>{viewMode === 'guidance' ? student.student?.class : student.class}</span>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        {viewMode === 'daily' ? (
                                            <div className="attendance-actions">
                                                {[
                                                    { id: 'geldi', label: 'Geldi', icon: CheckCircle2, bg: '#dcfce7', text: '#166534' },
                                                    { id: 'gelmedi', label: 'Gelmedi', icon: XCircle, bg: '#fee2e2', text: '#991b1b' },
                                                    { id: 'gec_kaldi', label: 'Geç Kaldı', icon: Clock, bg: '#ffedd5', text: '#9a3412' },
                                                    { id: 'izinli', label: 'İzinli', icon: Coffee, bg: '#e0e7ff', text: '#3730a3' }
                                                ].map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => handleStatusUpdate(student.id, opt.id)}
                                                        style={{
                                                            padding: '6px 10px',
                                                            borderRadius: '8px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 700,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            transition: 'all 0.2s',
                                                            border: '1px solid transparent',
                                                            background: student.status === opt.id ? opt.bg : '#f8fafc',
                                                            color: student.status === opt.id ? opt.text : '#64748b'
                                                        }}
                                                    >
                                                        <opt.icon size={13} /> {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : viewMode === 'exams' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                {student.status === 'girdi' ? (
                                                    <div style={{ 
                                                        background: '#dcfce7', color: '#166534', padding: '6px 12px', 
                                                        borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800,
                                                        display: 'flex', alignItems: 'center', gap: '6px'
                                                    }}>
                                                        <CheckCircle2 size={14} /> GİRDİ ({student.net?.toFixed(2)} Net)
                                                    </div>
                                                ) : (
                                                    <div style={{ 
                                                        background: '#fee2e2', color: '#991b1b', padding: '6px 12px', 
                                                        borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800,
                                                        display: 'flex', alignItems: 'center', gap: '6px'
                                                    }}>
                                                        <XCircle size={14} /> GİRMEDİ
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={14} /> {new Date(student.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                <div className="attendance-actions">
                                                    {[
                                                        { id: 'completed', label: 'Geldi', icon: CheckCircle2, bg: '#dcfce7', text: '#166534' },
                                                        { id: 'absent', label: 'Gelmedi', icon: XCircle, bg: '#fee2e2', text: '#991b1b' },
                                                        { id: 'pending', label: 'Bekliyor', icon: Clock, bg: '#ffedd5', text: '#9a3412' }
                                                    ].map(opt => (
                                                        <button
                                                            key={opt.id}
                                                            onClick={() => handleUpdateGuidanceStatus(student.id, opt.id)}
                                                            style={{
                                                                padding: '6px 10px',
                                                                borderRadius: '8px',
                                                                fontSize: '0.7rem',
                                                                fontWeight: 700,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                transition: 'all 0.2s',
                                                                border: '1px solid transparent',
                                                                background: student.status === opt.id ? opt.bg : '#f8fafc',
                                                                color: student.status === opt.id ? opt.text : '#64748b'
                                                            }}
                                                        >
                                                            <opt.icon size={13} /> {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                        {viewMode === 'daily' ? (
                                            student.status && (student.status === 'gelmedi' || student.status === 'gec_kaldi') && (
                                                <button
                                                    className="btn-primary"
                                                    onClick={() => sendParentNotificationForItem(student)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        fontSize: '0.7rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <Bell size={13} /> Veliye Bildir
                                                </button>
                                            )
                                        ) : viewMode === 'exams' ? (
                                            student.status === 'girmedi' && (
                                                <button
                                                    className="btn-primary"
                                                    onClick={() => sendParentNotificationForItem(student)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        fontSize: '0.7rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <Bell size={13} /> Veliye Bildir
                                                </button>
                                            )
                                        ) : (
                                            student.status === 'absent' && (
                                                <button
                                                    className="btn-primary"
                                                    onClick={() => sendParentNotificationForItem(student)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        fontSize: '0.7rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <Bell size={13} /> Veliye Bildir
                                                </button>
                                            )
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Risk Modal */}
            <AnimatePresence>
                {showBatchSender && (
                    <div className="modal-overlay" onClick={() => setShowBatchSender(false)}>
                        <motion.div
                            className="modal-content-card"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            style={{ maxWidth: '500px', padding: '2rem' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                    <div style={{ background: 'color-mix(in srgb, var(--primary), transparent 88%)', padding: '0.6rem', borderRadius: '12px' }}>
                                        <Bell size={18} color="var(--primary)" />
                                    </div>
                                    <h2 style={{ margin: 0 }}>Toplu Bildirim Kuyruğu</h2>
                                </div>
                                <button className="modal-close" onClick={() => setShowBatchSender(false)}><X size={18} /></button>
                            </div>
                            <div className="form-body" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                                <div style={{ marginBottom: '2rem' }}>
                                        <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--primary)' }}>
                                        {currentQueueIndex} / {batchQueue.length}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                        Bildirim Gönderildi / Toplam Girmedi
                                    </div>
                                    <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '10px', marginTop: '1.5rem', overflow: 'hidden' }}>
                                        <div style={{ width: `${(currentQueueIndex / batchQueue.length) * 100}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease' }}></div>
                                    </div>
                                </div>

                                {currentQueueIndex < batchQueue.length ? (
                                    <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '15px', marginBottom: '2rem', border: '1px solid var(--border-color)' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Sıradaki Veli</div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{getQueueStudentName(batchQueue[currentQueueIndex])}</div>
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Sınıf: {getQueueStudentClass(batchQueue[currentQueueIndex])}</div>
                                    </div>
                                ) : (
                                    <div style={{ background: '#f0fdf4', padding: '1.5rem', borderRadius: '15px', marginBottom: '2rem', border: '1px solid #bbf7d0' }}>
                                        <CheckCircle2 size={40} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                                        <div style={{ fontWeight: 800, color: '#166534' }}>Tüm Bildirimler Tamamlandı!</div>
                                        <div style={{ fontSize: '0.85rem', color: '#16653490' }}>Kuyruktaki tüm velilere ulaşım sağlandı.</div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button className="btn-outline" style={{ flex: 1, borderRadius: '12px' }} onClick={() => setShowBatchSender(false)}>
                                        {currentQueueIndex < batchQueue.length ? 'Durdur' : 'Kapat'}
                                    </button>
                                    {currentQueueIndex < batchQueue.length && (
                                        <button 
                                            className="btn-primary" 
                                            style={{ flex: 2, borderRadius: '12px', fontWeight: 800 }}
                                            onClick={processNextInQueue}
                                        >
                                            Sıradaki Bildirimi Gönder
                                        </button>
                                    )}
                                </div>
                                {currentQueueIndex < batchQueue.length && (
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1.5rem' }}>
                                        * Butona her bastığınızda bir sonraki veli bildirimi uygulamaya gönderilir.
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showRiskModal && (
                    <div className="modal-overlay" onClick={() => setShowRiskModal(false)}>
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="modal-content-card"
                            style={{ maxWidth: '500px', padding: '2rem' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', color: '#dc2626' }}>
                                <AlertTriangle size={24} />
                                <h2 style={{ margin: 0 }}>Kronik Devamsızlık Alarmı</h2>
                            </div>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Son 30 gün içerisinde 3'ten fazla devamsızlık veya geç kalma yapan öğrenciler:</p>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {riskyStudents.map(rs => (
                                    <div key={rs.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, color: '#991b1b' }}>{rs.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>{rs.class}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>{rs.absentCount}</div>
                                            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>Olay Kaydı</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button onClick={() => setShowRiskModal(false)} className="btn-primary" style={{ width: '100%', marginTop: '2rem' }}>
                                Anladım
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default Attendance;
