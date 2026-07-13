import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { motion } from 'framer-motion';
import {
    CheckCircle2,
    History,
    ChevronRight,
    Plus,
    Trash2,
    Pencil,
    MessageSquare,
    Search,
    BookMarked,
    Calendar,
    Target,
    XCircle,
    ChevronLeft,
    Layers3,
    AlertTriangle
} from 'lucide-react';
import { usePanelToast } from './components/PanelToastProvider';
import { usePanelConfirm } from './components/PanelConfirmProvider';

interface CurriculumTopic {
    id: string;
    name: string;
    subTopics?: CurriculumTopic[];
}

interface CurriculumCourse {
    id: string;
    name: string;
    icon: string;
    topics: CurriculumTopic[];
}

const weekDays = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

const getWeekStart = (date = new Date()) => {
    const next = new Date(date);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
    next.setHours(0, 0, 0, 0);
    return next;
};

const addDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

const formatShortDate = (date: Date) =>
    date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

const getDateInputValue = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const toLocalNoonIso = (dateValue: string) => {
    if (!dateValue) return new Date().toISOString();
    return new Date(`${dateValue}T12:00:00`).toISOString();
};

const getStatusTone = (status?: string) => {
    const isInProgress = status === 'ISLENIYOR';
    return {
        label: isInProgress ? 'İşleniyor' : 'Bitti',
        bg: isInProgress ? '#fffbeb' : '#ecfdf5',
        color: isInProgress ? '#b45309' : '#047857',
        border: isInProgress ? '#fde68a' : '#a7f3d0'
    };
};

const SelectionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: { value: string | number; label: string }[];
  onSelect: (val: string) => void;
  selectedValue: string;
}> = ({ isOpen, onClose, title, options, onSelect, selectedValue }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const filtered = options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()));

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay-premium" style={{ zIndex: 999999 }} onClick={onClose}>
       <motion.div
         initial={{ opacity: 0, scale: 0.9, y: 20 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         exit={{ opacity: 0, scale: 0.9, y: 20 }}
         className="modal-luxury selection-sub-modal"
         onClick={e => e.stopPropagation()}
       >
          <div className="modal-top">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.4rem' }}>{title}</h2>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><XCircle size={24}/></button>
            </div>
          </div>

          <div className="search-box-wrapper" style={{ position: 'relative', marginBottom: '1.25rem', display: 'flex', alignItems: 'center' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              autoFocus
              className="selection-search-input"
              placeholder="Ara..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="selection-list scrollbar-hidden" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {filtered.length > 0 ? filtered.map(opt => (
              <div
                key={opt.value}
                className={`custom-option-premium ${String(opt.value) === String(selectedValue) ? 'active' : ''}`}
                onClick={() => { onSelect(String(opt.value)); onClose(); }}
              >
                <span>{opt.label}</span>
                {String(opt.value) === String(selectedValue) && <CheckCircle2 size={16} />}
              </div>
            )) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Sonuç bulunamadı.</div>
            )}
          </div>
       </motion.div>
    </div>,
    document.body
  );
};

const CustomSelect: React.FC<{
  label: string;
  value: string;
  options: { value: string | number; label: string }[];
  onChange: (val: string) => void;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
}> = ({ label, value, options, onChange, placeholder, title, disabled }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const selectedLabel = options.find(o => String(o.value) === String(value))?.label || placeholder || 'Seçiniz...';

  return (
    <div className={`custom-select-container ${disabled ? 'disabled' : ''}`} style={{ opacity: disabled ? 0.6 : 1 }}>
      {label && <label>{label}</label>}
      <div className="custom-select-trigger" onClick={() => !disabled && setIsModalOpen(true)}>
        <span>{selectedLabel}</span>
        <ChevronRight size={16} className="chevron" />
      </div>

      <SelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={title || label || 'Seçim Yapın'}
        options={options}
        selectedValue={value}
        onSelect={onChange}
      />
    </div>
  );
};

const ClassProgress: React.FC = () => {
    const { showToast } = usePanelToast();
    const { confirm } = usePanelConfirm();
    const [classes, setClasses] = useState<any[]>([]);
    const [courses, setCourses] = useState<CurriculumCourse[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart());
    const [filterClassId, setFilterClassId] = useState<string>('all');
    const [filterCourseId, setFilterCourseId] = useState<string>('all');
    const [selectedMobileDayIndex, setSelectedMobileDayIndex] = useState(0);

    // Form states
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [selectedTopicId, setSelectedTopicId] = useState<string>('');
    const [status, setStatus] = useState<'ISLENIYOR' | 'TAMAMLANDI'>('TAMAMLANDI');
    const [note, setNote] = useState('');
    const [progressDate, setProgressDate] = useState(getDateInputValue());
    const [isProgressDatePickerOpen, setIsProgressDatePickerOpen] = useState(false);
    const [progressDatePickerMonth, setProgressDatePickerMonth] = useState<Date>(() => new Date());
    const [editingId, setEditingId] = useState<number | null>(null);

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const datePickerWeekdays = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

    const parseProgressDate = (value: string) => {
        const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    };

    const formatProgressDateDisplay = (value: string) => {
        const parsed = parseProgressDate(value);
        return parsed.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    const openProgressDatePicker = () => {
        setProgressDatePickerMonth(parseProgressDate(progressDate));
        setIsProgressDatePickerOpen(prev => !prev);
    };

    const selectProgressDate = (day: number) => {
        const year = progressDatePickerMonth.getFullYear();
        const month = String(progressDatePickerMonth.getMonth() + 1).padStart(2, '0');
        const selectedDay = String(day).padStart(2, '0');
        setProgressDate(`${year}-${month}-${selectedDay}`);
        setIsProgressDatePickerOpen(false);
    };

    const renderProgressDateDays = () => {
        const year = progressDatePickerMonth.getFullYear();
        const month = progressDatePickerMonth.getMonth();
        const totalDays = new Date(year, month + 1, 0).getDate();
        const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
        const selected = parseProgressDate(progressDate);
        const today = new Date();
        const days = [];

        for (let i = 0; i < firstDay; i += 1) {
            days.push(<div key={`empty-${i}`} />);
        }

        for (let day = 1; day <= totalDays; day += 1) {
            const isSelected = selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day;
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
            days.push(
                <button
                    key={day}
                    type="button"
                    onClick={() => selectProgressDate(day)}
                    style={{
                        width: 34,
                        height: 34,
                        border: `1px solid ${isSelected ? 'var(--primary)' : isToday ? '#c7d2fe' : 'transparent'}`,
                        borderRadius: 10,
                        background: isSelected ? 'var(--primary)' : isToday ? '#eef2ff' : 'transparent',
                        color: isSelected ? '#fff' : '#0f172a',
                        fontWeight: isSelected || isToday ? 900 : 700,
                        cursor: 'pointer',
                    }}
                >
                    {day}
                </button>
            );
        }

        return days;
    };

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            const [classesData, curriculumData, historyData] = await Promise.all([
                api.getClasses(),
                api.getCurriculum(),
                api.getClassProgress({ instId: user.institutionId })
            ]);
            setClasses(classesData);
            setCourses(curriculumData);
            setHistory(historyData);
        } catch (error) {
            console.error('Data load error:', error);
            showToast({ type: 'error', title: 'Hata', message: 'Veriler yüklenirken bir sorun oluştu.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!selectedClassId || !selectedCourseId || !selectedTopicId) {
            showToast({ type: 'error', title: 'Uyarı', message: 'Lütfen sınıf, ders ve konu seçiniz.' });
            return;
        }

        try {
            setSubmitting(true);
            const payload = {
                institutionId: user.institutionId,
                classId: parseInt(selectedClassId),
                courseId: selectedCourseId,
                topicId: selectedTopicId,
                teacherId: user.id,
                note: note.trim() || undefined,
                status: status,
                completedAt: toLocalNoonIso(progressDate)
            };

            if (editingId) {
                await api.updateClassProgress(editingId, {
                    classId: payload.classId,
                    courseId: payload.courseId,
                    topicId: payload.topicId,
                    note: payload.note,
                    status: payload.status,
                    completedAt: payload.completedAt
                });
                showToast({ type: 'success', title: 'Güncellendi', message: 'Müfredat girişi güncellendi.' });
            } else {
                await api.createClassProgress(payload);
                showToast({ type: 'success', title: 'Başarılı', message: 'Konu ilerlemesi kaydedildi.' });
            }

            // Reset form and reload history
            setSelectedTopicId('');
            setNote('');
            setEditingId(null);
            setProgressDate(getDateInputValue());
            const updatedHistory = await api.getClassProgress({ instId: user.institutionId });
            setHistory(updatedHistory);
        } catch (error) {
            console.error('Submit error:', error);
            showToast({ type: 'error', title: 'Hata', message: 'Kaydetme sırasında bir sorun oluştu.' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (item: any) => {
        setEditingId(item.id);
        setSelectedClassId(String(item.classId || item.class?.id || ''));
        setSelectedCourseId(String(item.courseId || ''));
        setSelectedTopicId(String(item.topicId || ''));
        setStatus(item.status === 'ISLENIYOR' ? 'ISLENIYOR' : 'TAMAMLANDI');
        setNote(item.note || '');
        setProgressDate(getDateInputValue(new Date(item.completedAt)));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setSelectedTopicId('');
        setNote('');
        setProgressDate(getDateInputValue());
        setStatus('TAMAMLANDI');
    };

    const handleDelete = async (id: number) => {
        const approved = await confirm({
            title: 'Kayıt silinsin mi?',
            message: 'Bu müfredat girişi haftalık takipten kaldırılacak. Bu işlem geri alınamaz.',
            confirmLabel: 'Sil',
            cancelLabel: 'Vazgeç',
            tone: 'danger',
        });

        if (!approved) return;

        try {
            await api.deleteClassProgress(id);
            setHistory(history.filter(h => h.id !== id));
            showToast({ type: 'success', title: 'Silindi', message: 'Kayıt başarıyla kaldırıldı.' });
        } catch (error) {
            showToast({ type: 'error', title: 'Hata', message: 'Silme işlemi başarısız.' });
        }
    };

    const selectedCourse = courses.find(c => c.id === selectedCourseId);
    const scopedHistory = user.role === 'teacher'
        ? history.filter(item => Number(item.teacherId) === Number(user.id))
        : history;
    const visibleClasses = filterClassId === 'all'
        ? classes
        : classes.filter(c => String(c.id) === filterClassId);
    const visibleHistory = scopedHistory.filter(item => {
        const date = new Date(item.completedAt);
        const weekEnd = addDays(weekStart, 7);
        const inWeek = date >= weekStart && date < weekEnd;
        const classMatch = filterClassId === 'all' || String(item.classId) === filterClassId || String(item.class?.id) === filterClassId;
        const courseMatch = filterCourseId === 'all' || item.courseId === filterCourseId;
        return inWeek && classMatch && courseMatch;
    });
    const completedCount = visibleHistory.filter(item => item.status === 'TAMAMLANDI').length;
    const inProgressCount = visibleHistory.filter(item => item.status === 'ISLENIYOR').length;
    const activeClassCount = new Set(visibleHistory.map(item => item.classId || item.class?.id)).size;
    const weekEndLabel = formatShortDate(addDays(weekStart, 6));
    const selectedMobileDate = addDays(weekStart, selectedMobileDayIndex);
    const mobileDayEntries = visibleHistory
        .filter(item => isSameDay(new Date(item.completedAt), selectedMobileDate))
        .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
    const weeklyClassIds = new Set(visibleHistory.map(item => String(item.classId || item.class?.id)));
    const missingClassNames = visibleClasses
        .filter(classItem => !weeklyClassIds.has(String(classItem.id)))
        .map(classItem => classItem.name);
    const staleClassNames = visibleClasses
        .filter(classItem => {
            const entries = scopedHistory
                .filter(item => String(item.classId || item.class?.id) === String(classItem.id))
                .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
            if (entries.length === 0) return false;
            const lastDate = new Date(entries[0].completedAt);
            return addDays(lastDate, 7) < new Date();
        })
        .map(classItem => classItem.name);

    return (
        <div className="main-content">
            <div className="attendance-header">
                <div className="header-text-group">
                    <h1 className="premium-title">Müfredat İlerleme Takibi</h1>
                    <p className="premium-subtitle">Haftalık sınıf-ders akışını tek ekrandan takip edin.</p>
                </div>
            </div>

            <div className="class-progress-layout">
                {/* Entry Form */}
                <div className="card class-progress-entry-card" style={{ padding: '2rem', height: 'fit-content' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                        <div style={{ background: 'var(--primary-light)', padding: '0.6rem', borderRadius: '12px' }}>
                            <Plus size={20} color="var(--primary)" />
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{editingId ? 'İlerleme Girişini Düzenle' : 'Yeni İlerleme Girişi'}</h2>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Class Selection */}
                        <CustomSelect
                            label="Sınıf Seçin"
                            title="Sınıf Seçiniz"
                            placeholder="Sınıf Seçiniz..."
                            value={selectedClassId}
                            options={classes.map(c => ({ value: c.id, label: c.name }))}
                            onChange={setSelectedClassId}
                        />

                        {/* Course Selection */}
                        <CustomSelect
                            label="Ders Seçin"
                            title="Ders Seçiniz"
                            placeholder="Ders Seçiniz..."
                            value={selectedCourseId}
                            options={courses.map(c => ({ value: c.id, label: c.name }))}
                            onChange={(val) => {
                                setSelectedCourseId(val);
                                setSelectedTopicId('');
                            }}
                        />

                        {/* Topic Selection */}
                        <CustomSelect
                            label="Kalınan Konu"
                            title="Konu Seçiniz"
                            placeholder="Konu Seçiniz..."
                            value={selectedTopicId}
                            disabled={!selectedCourseId}
                            options={(() => {
                                const opts: any[] = [];
                                selectedCourse?.topics.forEach(topic => {
                                    opts.push({ value: topic.id, label: `📌 ${topic.name}` });
                                    topic.subTopics?.forEach(sub => {
                                        opts.push({ value: sub.id, label: `   ↳ ${sub.name}` });
                                    });
                                });
                                return opts;
                            })()}
                            onChange={setSelectedTopicId}
                        />

                        <div
                            className="input-group"
                            style={{ position: 'relative' }}
                            onBlur={(event) => {
                                const nextFocus = event.relatedTarget as Node | null;
                                if (!nextFocus || !event.currentTarget.contains(nextFocus)) {
                                    setIsProgressDatePickerOpen(false);
                                }
                            }}
                        >
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem', color: '#64748b' }}>
                                <Calendar size={14} style={{ marginRight: '4px' }} /> İşlenme Tarihi
                            </label>
                            <button
                                type="button"
                                onClick={openProgressDatePicker}
                                className="premium-input"
                                style={{ width: '100%', borderRadius: '12px', height: '46px', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', cursor: 'pointer', textAlign: 'left' }}
                            >
                                <span style={{ color: '#0f172a', fontWeight: 800 }}>{formatProgressDateDisplay(progressDate)}</span>
                                <Calendar size={17} color="#64748b" />
                            </button>
                            {isProgressDatePickerOpen && (
                                <div style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 'calc(100% + 8px)',
                                    zIndex: 60,
                                    width: 306,
                                    padding: '0.9rem',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 18,
                                    background: '#fff',
                                    boxShadow: '0 24px 50px rgba(15, 23, 42, 0.18)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setProgressDatePickerMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>
                                            {monthNames[progressDatePickerMonth.getMonth()]} {progressDatePickerMonth.getFullYear()}
                                        </strong>
                                        <button
                                            type="button"
                                            onClick={() => setProgressDatePickerMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 34px)', gap: 5, marginBottom: 5 }}>
                                        {datePickerWeekdays.map(day => (
                                            <div key={day} style={{ height: 24, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 900 }}>
                                                {day}
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 34px)', gap: 5 }}>
                                        {renderProgressDateDays()}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Status Selection */}
                        <div className="input-group">
                            <label style={{ display: 'block', marginBottom: '0.8rem', fontWeight: 600, fontSize: '0.85rem', color: '#64748b' }}>
                                <Target size={14} style={{ marginRight: '4px' }} /> Konu Durumu
                            </label>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '0.75rem',
                                background: '#f8fafc',
                                padding: '0.5rem',
                                borderRadius: '14px'
                            }}>
                                <button
                                    onClick={() => setStatus('ISLENIYOR')}
                                    style={{
                                        padding: '0.75rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        background: status === 'ISLENIYOR' ? '#fffbeb' : 'transparent',
                                        color: status === 'ISLENIYOR' ? '#d97706' : '#94a3b8',
                                        boxShadow: status === 'ISLENIYOR' ? '0 2px 4px rgba(217, 119, 6, 0.1)' : 'none'
                                    }}
                                >
                                    📖 İşleniyor
                                </button>
                                <button
                                    onClick={() => setStatus('TAMAMLANDI')}
                                    style={{
                                        padding: '0.75rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        background: status === 'TAMAMLANDI' ? '#ecfdf5' : 'transparent',
                                        color: status === 'TAMAMLANDI' ? '#059669' : '#94a3b8',
                                        boxShadow: status === 'TAMAMLANDI' ? '0 2px 4px rgba(5, 150, 105, 0.1)' : 'none'
                                    }}
                                >
                                    ✅ Bitti
                                </button>
                            </div>
                        </div>

                        {/* Note */}
                        <div className="input-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem', color: '#64748b' }}>
                                <MessageSquare size={14} style={{ marginRight: '4px' }} /> Ek Not (Opsiyonel)
                            </label>
                            <textarea
                                className="premium-input"
                                placeholder="Örn: Bu konuda zorlandılar, tekrar gerekebilir."
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                style={{ width: '100%', borderRadius: '12px', height: '80px', padding: '12px' }}
                            />
                        </div>

                        <button
                            className="btn-primary"
                            onClick={handleSubmit}
                            disabled={submitting}
                            style={{ width: '100%', padding: '1rem', borderRadius: '14px', fontSize: '1rem', fontWeight: 700 }}
                        >
                            {submitting ? 'Kaydediliyor...' : editingId ? 'Girişi Güncelle' : 'İlerlemeyi Kaydet'}
                        </button>
                        {editingId && (
                            <button
                                type="button"
                                onClick={handleCancelEdit}
                                style={{ width: '100%', padding: '0.9rem', borderRadius: '14px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 800, cursor: 'pointer' }}
                            >
                                Düzenlemeyi İptal Et
                            </button>
                        )}
                    </div>
                </div>

                <div className="class-progress-main-panel">
                    {(missingClassNames.length > 0 || staleClassNames.length > 0) && (
                        <div className="class-progress-alert">
                            <div className="class-progress-alert-icon">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <strong>Takip edilmesi gereken sınıflar</strong>
                                {missingClassNames.length > 0 && (
                                    <p>Bu hafta giriş yapılmayan: {missingClassNames.slice(0, 5).join(', ')}{missingClassNames.length > 5 ? ` +${missingClassNames.length - 5}` : ''}</p>
                                )}
                                {staleClassNames.length > 0 && (
                                    <p>7+ gündür güncellenmeyen: {staleClassNames.slice(0, 5).join(', ')}{staleClassNames.length > 5 ? ` +${staleClassNames.length - 5}` : ''}</p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="class-progress-metrics">
                        {[
                            { label: 'Bu Hafta Giriş', value: visibleHistory.length, icon: Calendar, color: '#3b82f6', bg: '#eff6ff' },
                            { label: 'Aktif Sınıf', value: activeClassCount, icon: Layers3, color: '#7c3aed', bg: '#f5f3ff' },
                            { label: 'Biten / İşlenen', value: `${completedCount}/${inProgressCount}`, icon: CheckCircle2, color: '#059669', bg: '#ecfdf5' }
                        ].map((metric) => {
                            const Icon = metric.icon;
                            return (
                                <div key={metric.label} className="card" style={{ padding: '1rem', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                                    <div style={{ width: 38, height: 38, borderRadius: '12px', background: metric.bg, color: metric.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Icon size={18} />
                                    </div>
                                    <div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>{metric.label}</div>
                                        <div style={{ color: '#0f172a', fontSize: '1.25rem', fontWeight: 900 }}>{metric.value}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="card class-progress-week-card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div className="class-progress-week-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <History size={20} color="#64748b" />
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Haftalık Müfredat Akışı</h2>
                                    <p style={{ margin: '0.25rem 0 0', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
                                        {formatShortDate(weekStart)} - {weekEndLabel}
                                    </p>
                                </div>
                            </div>
                            <div className="class-progress-week-actions">
                                <button
                                    onClick={() => setWeekStart(prev => addDays(prev, -7))}
                                    style={{ width: 36, height: 36, borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                                    title="Önceki hafta"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    onClick={() => setWeekStart(getWeekStart())}
                                    style={{ minHeight: 36, padding: '0 0.9rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#334155', cursor: 'pointer', fontWeight: 800 }}
                                >
                                    Bu Hafta
                                </button>
                                <button
                                    onClick={() => setWeekStart(prev => addDays(prev, 7))}
                                    style={{ width: 36, height: 36, borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                                    title="Sonraki hafta"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="class-progress-filter-grid">
                            <CustomSelect
                                label=""
                                title="Sınıf Filtresi"
                                placeholder="Tüm sınıflar"
                                value={filterClassId}
                                options={[
                                    { value: 'all', label: 'Tüm sınıflar' },
                                    ...classes.map(c => ({ value: c.id, label: c.name }))
                                ]}
                                onChange={setFilterClassId}
                            />
                            <CustomSelect
                                label=""
                                title="Ders Filtresi"
                                placeholder="Tüm dersler"
                                value={filterCourseId}
                                options={[
                                    { value: 'all', label: 'Tüm dersler' },
                                    ...courses.map(c => ({ value: c.id, label: c.name }))
                                ]}
                                onChange={setFilterCourseId}
                            />
                        </div>

                        <div className="class-progress-desktop-table custom-scrollbar" style={{ overflowX: 'auto' }}>
                            <div style={{ minWidth: 1120 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '150px repeat(7, minmax(135px, 1fr))', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ padding: '0.9rem 1rem', fontSize: '0.75rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Sınıf</div>
                                    {weekDays.map((day, idx) => (
                                        <div key={day} style={{ padding: '0.9rem 1rem', borderLeft: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#334155' }}>{day}</div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>{formatShortDate(addDays(weekStart, idx))}</div>
                                        </div>
                                    ))}
                                </div>

                                {loading ? (
                                    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8' }}>Veriler yükleniyor...</div>
                                ) : visibleClasses.length === 0 ? (
                                    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8' }}>Gösterilecek sınıf bulunamadı.</div>
                                ) : (
                                    visibleClasses.map((classItem) => (
                                        <div key={classItem.id} style={{ display: 'grid', gridTemplateColumns: '150px repeat(7, minmax(135px, 1fr))', borderBottom: '1px solid #f1f5f9' }}>
                                            <div style={{ padding: '1rem', background: 'white', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #e2e8f0' }}>
                                                <div style={{ fontWeight: 900, color: '#0f172a' }}>{classItem.name}</div>
                                                <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700 }}>
                                                    {visibleHistory.filter(item => String(item.classId || item.class?.id) === String(classItem.id)).length} giriş
                                                </div>
                                            </div>
                                            {weekDays.map((day, idx) => {
                                                const dayDate = addDays(weekStart, idx);
                                                const entries = visibleHistory
                                                    .filter(item => String(item.classId || item.class?.id) === String(classItem.id) && isSameDay(new Date(item.completedAt), dayDate))
                                                    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());

                                                return (
                                                    <div key={`${classItem.id}-${day}`} style={{ minHeight: 122, padding: '0.75rem', borderLeft: '1px solid #f1f5f9', background: entries.length ? 'white' : '#fcfcfd' }}>
                                                        {entries.length === 0 ? (
                                                            <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#cbd5e1', fontSize: '0.78rem', fontWeight: 700 }}>Kayıt yok</div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                                                {entries.map(item => {
                                                                    const tone = getStatusTone(item.status);
                                                                    return (
                                                                        <motion.div
                                                                            key={item.id}
                                                                            initial={{ opacity: 0, y: 6 }}
                                                                            animate={{ opacity: 1, y: 0 }}
                                                                            style={{ padding: '0.7rem', borderRadius: '12px', background: tone.bg, border: `1px solid ${tone.border}` }}
                                                                        >
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                                                                <span style={{ color: '#0f172a', fontSize: '0.78rem', fontWeight: 900, lineHeight: 1.2 }}>{item.course.name}</span>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                                    <button
                                                                                        onClick={() => handleEdit(item)}
                                                                                        style={{ border: 'none', background: 'transparent', color: '#64748b', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, opacity: 0.65 }}
                                                                                        title="Kaydı düzenle"
                                                                                    >
                                                                                        <Pencil size={13} />
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => handleDelete(item.id)}
                                                                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, opacity: 0.55 }}
                                                                                        title="Kaydı sil"
                                                                                    >
                                                                                        <Trash2 size={13} />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ color: '#334155', fontSize: '0.76rem', fontWeight: 800, lineHeight: 1.25 }}>{item.topic.name}</div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginTop: '0.5rem' }}>
                                                                                <span style={{ color: tone.color, fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase' }}>{tone.label}</span>
                                                                                <span style={{ color: '#64748b', fontSize: '0.68rem', fontWeight: 700 }}>{item.teacher?.name || '—'}</span>
                                                                            </div>
                                                                            {item.note && (
                                                                                <div style={{ marginTop: '0.45rem', color: '#64748b', fontSize: '0.68rem', lineHeight: 1.35 }}>
                                                                                    {item.note.length > 42 ? `${item.note.slice(0, 42)}...` : item.note}
                                                                                </div>
                                                                            )}
                                                                        </motion.div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="class-progress-mobile-flow">
                            <div className="class-progress-mobile-days scrollbar-hidden">
                                {weekDays.map((day, idx) => {
                                    const dayEntries = visibleHistory.filter(item => isSameDay(new Date(item.completedAt), addDays(weekStart, idx)));
                                    const isActive = selectedMobileDayIndex === idx;
                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            className={`class-progress-day-tab ${isActive ? 'active' : ''}`}
                                            onClick={() => setSelectedMobileDayIndex(idx)}
                                        >
                                            <span>{day.slice(0, 3)}</span>
                                            <strong>{addDays(weekStart, idx).getDate()}</strong>
                                            {dayEntries.length > 0 && <em>{dayEntries.length}</em>}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="class-progress-mobile-date">
                                <div>
                                    <span>{weekDays[selectedMobileDayIndex]}</span>
                                    <strong>{selectedMobileDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</strong>
                                </div>
                                <small>{mobileDayEntries.length} giriş</small>
                            </div>

                            {loading ? (
                                <div className="class-progress-mobile-empty">Veriler yükleniyor...</div>
                            ) : mobileDayEntries.length === 0 ? (
                                <div className="class-progress-mobile-empty">
                                    <History size={28} />
                                    <span>Bu gün için müfredat girişi yok.</span>
                                </div>
                            ) : (
                                <div className="class-progress-mobile-list">
                                    {mobileDayEntries.map(item => {
                                        const tone = getStatusTone(item.status);
                                        return (
                                            <motion.div
                                                key={item.id}
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="class-progress-mobile-card"
                                                style={{ background: tone.bg, borderColor: tone.border }}
                                            >
                                                <div className="class-progress-mobile-card-top">
                                                    <span>{item.class?.name || 'Sınıf'}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                        <button
                                                            onClick={() => handleEdit(item)}
                                                            title="Kaydı düzenle"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(item.id)}
                                                            title="Kaydı sil"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="class-progress-mobile-course">{item.course.name}</div>
                                                <div className="class-progress-mobile-topic">{item.topic.name}</div>
                                                <div className="class-progress-mobile-meta">
                                                    <strong style={{ color: tone.color }}>{tone.label}</strong>
                                                    <span>{item.teacher?.name || '—'}</span>
                                                </div>
                                                {item.note && <p>{item.note}</p>}
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', color: '#64748b', fontSize: '0.78rem', fontWeight: 800 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#ecfdf5', border: '1px solid #a7f3d0' }} /> Bitti</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#fffbeb', border: '1px solid #fde68a' }} /> İşleniyor</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#fcfcfd', border: '1px solid #e2e8f0' }} /> Kayıt yok</span>
                            </div>
                        </div>
                    </div>

                    <div className="card class-progress-recent-card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '1rem 1.5rem', background: '#fff', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <BookMarked size={18} color="#64748b" />
                            <h2 style={{ margin: 0, fontSize: '1rem' }}>Son Girişler</h2>
                        </div>
                        <div className="custom-scrollbar" style={{ maxHeight: 260, overflowY: 'auto', padding: '0.75rem' }}>
                            {scopedHistory.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Henüz bir ilerleme girişi yapılmamış.</div>
                            ) : (
                                scopedHistory.slice(0, 8).map(item => {
                                    const tone = getStatusTone(item.status);
                                    return (
                                        <div key={item.id} style={{ padding: '0.9rem', borderRadius: '12px', border: '1px solid #f1f5f9', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                            <div>
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                                                    <span style={{ color: '#0f172a', fontWeight: 900, fontSize: '0.86rem' }}>{item.class.name}</span>
                                                    <span style={{ color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 999, padding: '0.1rem 0.45rem', fontSize: '0.65rem', fontWeight: 900 }}>{tone.label}</span>
                                                </div>
                                                <div style={{ color: '#334155', fontSize: '0.82rem', fontWeight: 700 }}>{item.course.name} - {item.topic.name}</div>
                                            </div>
                                            <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                {new Date(item.completedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                            </div>
                                            <button
                                                onClick={() => handleEdit(item)}
                                                style={{ border: 'none', background: '#f8fafc', color: '#64748b', borderRadius: '9px', width: 30, height: 30, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
                                                title="Kaydı düzenle"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClassProgress;
