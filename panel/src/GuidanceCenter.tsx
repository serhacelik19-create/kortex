import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ClipboardList, 
  Plus, 
  User as UserIcon, 
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  BookOpen,
  Sparkles,
  Target,
  ArrowRight,
  Calendar,
  Search,
  CalendarDays,
  Trash2,
  Users as UsersIcon,
  Send
} from 'lucide-react';

const CalendarIcon = Calendar;
import { api } from './api';
import { motion, AnimatePresence } from 'framer-motion';

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

          <div className="selection-list scrollbar-hidden" style={{ maxHeight: '300px', overflowY: 'auto' }}>
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
}> = ({ label, value, options, onChange, placeholder, title }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const selectedLabel = options.find(o => String(o.value) === String(value))?.label || placeholder || 'Seçiniz...';

  return (
    <div className="custom-select-container">
      <label>{label}</label>
      <div className="custom-select-trigger" onClick={() => setIsModalOpen(true)}>
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

const CustomDatePicker: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
}> = ({ label, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  
  const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const weekdays = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

  const handlePrevMonth = (e: any) => { e.stopPropagation(); setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)); };
  const handleNextMonth = (e: any) => { e.stopPropagation(); setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)); };

  const handleDateSelect = (day: number) => {
    const year = currentMonth.getFullYear();
    const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${year}-${month}-${d}`);
    setIsOpen(false);
  };

  const renderDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const totalDays = daysInMonth(year, month);
    const firstDay = (firstDayOfMonth(year, month) + 6) % 7;
    const days = [];
    
    // Today's date for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    for (let d = 1; d <= totalDays; d++) {
      const dateToCheck = new Date(year, month, d);
      const isPast = dateToCheck < today;
      const isSelected = value === `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      days.push(
        <div 
          key={d} 
          className={`calendar-day ${isSelected ? 'active' : ''} ${isPast ? 'disabled' : ''}`} 
          onClick={() => !isPast && handleDateSelect(d)}
        >
          {d}
        </div>
      );
    }
    return days;
  };

  return (
    <div className="custom-datepicker-container">
      <label>{label}</label>
      <div className={`custom-input-trigger ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <CalendarIcon size={16} />
        <span>{value || 'Tarih Seçin'}</span>
      </div>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="custom-select-overlay" onClick={() => setIsOpen(false)} />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="calendar-popover">
              <div className="calendar-header">
                <button type="button" onClick={handlePrevMonth}><ChevronRight style={{ transform: 'rotate(180deg)' }} size={16} /></button>
                <span>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
                <button type="button" onClick={handleNextMonth}><ChevronRight size={16} /></button>
              </div>
              <div className="calendar-weekdays">
                {weekdays.map(w => <div key={w}>{w}</div>)}
              </div>
              <div className="calendar-grid">
                {renderDays()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const CustomTimePicker: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
}> = ({ label, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = ["00", "15", "30", "45"];

  return (
    <div className="custom-datepicker-container">
      <label>{label}</label>
      <div className={`custom-input-trigger ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <Clock size={16} />
        <span>{value || '00:00'}</span>
      </div>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="custom-select-overlay" onClick={() => setIsOpen(false)} />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="time-popover">
              <div className="time-scroll-container">
                <div className="time-column">
                  {hours.map(h => (
                    <div key={h} className={`time-item ${value.startsWith(h) ? 'active' : ''}`} onClick={() => onChange(`${h}:${value.split(':')[1] || '00'}`)}>
                      {h}
                    </div>
                  ))}
                </div>
                <div className="time-column">
                  {minutes.map(m => (
                    <div key={m} className={`time-item ${value.endsWith(m) ? 'active' : ''}`} onClick={() => onChange(`${value.split(':')[0] || '00'}:${m}`)}>
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const GuidanceCenter: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'appointments' | 'surveys'>('appointments');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ classId: '', date: '', time: '', title: 'Haftalık Koçluk Görüşmesi', note: '' });

  // Modal states
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isSurveyModalOpen, setIsSurveyModalOpen] = useState(false);
  const [postponeApptId, setPostponeApptId] = useState<number | null>(null);
  const [postponeDate, setPostponeDate] = useState('');
  const [postponeTime, setPostponeTime] = useState('10:00');
  const [selectedSurveyResults, setSelectedSurveyResults] = useState<any>(null);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [appointmentClass, setAppointmentClass] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [nameSearch, setNameSearch] = useState('');
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null);

  // Survey Wizard States
  const [surveyStep, setSurveyStep] = useState(1);
  const [surveyAudience, setSurveyAudience] = useState({ type: 'none', value: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void | Promise<void>, type: 'danger' | 'warning' }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'danger'
  });

  // New Appointment Form
  const [newAppointment, setNewAppointment] = useState({
    studentId: '',
    date: '',
    time: '',
    title: 'Haftalık Koçluk Görüşmesi',
    note: ''
  });

  // New Survey Form
  const [newSurvey, setNewSurvey] = useState({
    title: '',
    description: '',
    questions: [
      { text: '', type: 'multiple_choice', options: [''], required: true }
    ]
  });

  // Week Navigation State
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const goToPrevWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() - 7);
    setCurrentWeekStart(next);
  };

  const goToNextWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(next);
  };

  const goToToday = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  const getWeekRangeLabel = () => {
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);
    return `${currentWeekStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Body scroll lock effect
  useEffect(() => {
    if (isAppointmentModalOpen || isSurveyModalOpen || isAssignModalOpen || isResultsModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isAppointmentModalOpen, isSurveyModalOpen, isAssignModalOpen, isResultsModalOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [appts, survs, studs, cls] = await Promise.all([
        api.getAppointments(),
        api.getGuidanceSurveys(),
        api.getStudents(),
        api.getClasses()
      ]);
      setAppointments(appts);
      setSurveys(survs);
      setStudents(studs);
      setClasses(cls);
    } catch (err) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const startTime = new Date(`${newAppointment.date}T${newAppointment.time}`);
      await api.createAppointment({
        studentId: parseInt(newAppointment.studentId),
        startTime: startTime.toISOString(),
        title: newAppointment.title,
        note: newAppointment.note
      });
      setIsAppointmentModalOpen(false);
      fetchData();
      setNewAppointment({ studentId: '', date: '', time: '', title: 'Haftalık Koçluk Görüşmesi', note: '' });
    } catch (err) {
      alert('Randevu oluşturulamadı.');
    }
  };

  const handleCreateSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (surveyStep < 3) {
      setSurveyStep(s => s + 1);
      return;
    }
    try {
      const payload = {
        title: newSurvey.title,
        description: newSurvey.description,
        questions: newSurvey.questions.map(q => ({
          ...q,
          options: q.type === 'multiple_choice' ? q.options.filter(o => o.trim() !== '') : null
        }))
      };
      
      const created = await api.createGuidanceSurvey(payload);
      
      // Handle immediate assignment if selected in Step 3
      if (surveyAudience.type !== 'none') {
        const assignmentPayload: any = {};
        if (surveyAudience.type === 'all') assignmentPayload.allInstitution = true;
        if (surveyAudience.type === 'class' && surveyAudience.value) assignmentPayload.className = surveyAudience.value;
        if (surveyAudience.type === 'student' && surveyAudience.value) assignmentPayload.studentId = parseInt(surveyAudience.value);
        
        if (Object.keys(assignmentPayload).length > 0) {
          await api.assignGuidanceSurvey(created.id, assignmentPayload);
        }
      }

      setIsSurveyModalOpen(false);
      setSurveyStep(1); // Reset wizard
      setSurveyAudience({ type: 'none', value: '' });
      fetchData();
      setNewSurvey({ title: '', description: '', questions: [{ text: '', type: 'multiple_choice', options: [''], required: true }] });
    } catch (err) {
      alert('Anket oluşturulamadı veya atanamadı.');
    }
  };

  const handlePostpone = async () => {
    if (!postponeApptId || !postponeDate || !postponeTime) return;
    try {
      await api.postponeAppointment(postponeApptId, {
        newStartTime: `${postponeDate}T${postponeTime}:00`,
        note: 'Kullanıcı tarafından panelden ertelendi.'
      });
      alert('Randevu başarıyla ertelendi.');
      setPostponeApptId(null);
      fetchData();
    } catch (err) {
      alert('Randevu ertelenemedi.');
    }
  };

  const handleUpdateAppointmentStatus = async (id: number, status: string) => {
    try {
      await api.updateAppointment(id, { status });
      fetchData();
    } catch (err) {
      alert('Durum güncellenemedi.');
    }
  };

  const handleViewResults = async (id: number) => {
    try {
      const results = await api.getSurveyResults(id);
      setSelectedSurveyResults(results);
      setIsResultsModalOpen(true);
    } catch (err) {
      alert('Sonuçlar yüklenemedi.');
    }
  };

  const handleDeleteAppointment = async (id: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Randevuyu Sil',
      message: 'Bu randevuyu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await api.deleteAppointment(id);
          fetchData();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          alert('Randevu silinemedi.');
        }
      }
    });
  };

  const handleDeleteSurvey = async (id: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Anketi Sil',
      message: 'Bu anketi ve ilgili tüm öğrenci yanıtlarını kalıcı olarak silmek istediğinize emin misiniz?',
      type: 'danger',
      onConfirm: async () => {
        try {
          await api.deleteGuidanceSurvey(id);
          fetchData();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          const errMsg = err.response?.data?.error || err.message || 'Anket silinemedi.';
          alert(`Hata: ${errMsg}`);
        }
      }
    });
  };

  const addQuestion = () => {
    setNewSurvey({
      ...newSurvey,
      questions: [...newSurvey.questions, { text: '', type: 'multiple_choice', options: [''], required: true }]
    });
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    const updated = [...newSurvey.questions];
    updated[index] = { ...updated[index], [field]: value };
    setNewSurvey({ ...newSurvey, questions: updated });
  };

  const addOption = (qIndex: number) => {
    const updated = [...newSurvey.questions];
    updated[qIndex].options = [...updated[qIndex].options, ''];
    setNewSurvey({ ...newSurvey, questions: updated });
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const updated = [...newSurvey.questions];
    updated[qIndex].options[oIndex] = value;
    setNewSurvey({ ...newSurvey, questions: updated });
  };

  const handleExportCSV = () => {
    const headers = ['Ad Soyad', 'Sınıf', 'Tarih', 'Saat', 'Başlık', 'Durum'];
    const rows = appointments.map(a => [
      a.student.name,
      a.student.class,
      new Date(a.startTime).toLocaleDateString('tr-TR'),
      new Date(a.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      a.title,
      a.status === 'pending' ? 'Bekliyor' : a.status === 'completed' ? 'Tamamlandı' : a.status === 'absent' ? 'Gelmedi' : a.status === 'postponed' ? 'Ertelendi' : 'İptal'
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `randevular_${new Date().toLocaleDateString('tr-TR')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleCreateBulkAppointments = async () => {
    if (!bulkForm.classId || !bulkForm.date || !bulkForm.time) { alert('Lütfen sınıf, tarih ve saat seçin.'); return; }
    const studentsInClass = students.filter(s => String(s.classId) === String(bulkForm.classId));
    if (studentsInClass.length === 0) { alert('Bu sınıfta öğrenci bulunamadı.'); return; }
    const startTime = new Date(`${bulkForm.date}T${bulkForm.time}`).toISOString();
    try {
      await Promise.all(studentsInClass.map(s => api.createAppointment({
        studentId: s.id, startTime, title: bulkForm.title, note: bulkForm.note
      })));
      setIsBulkModalOpen(false);
      fetchData();
      setBulkForm({ classId: '', date: '', time: '', title: 'Haftalık Koçluk Görüşmesi', note: '' });
    } catch { alert('Toplu randevu oluşturulamadı.'); }
  };

  return (
    <div className="guidance-premium-container">
      {/* Subtle, Minimal Background */}
      <div className="guidance-overlay-content">
        <header className="premium-header">
          <div className="header-text-group">
            <h1 className="premium-title">Rehberlik & Görüşmeler</h1>
            <p className="premium-subtitle">Kurumsal rehberlik takibini ve öğrenci randevularını yönetin.</p>
          </div>
          
          <div className="header-actions">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="glass-btn primary" 
              onClick={() => activeSubTab === 'appointments' ? setIsAppointmentModalOpen(true) : setIsSurveyModalOpen(true)}
            >
              <Plus size={18} />
              <span>{activeSubTab === 'appointments' ? 'Yeni Randevu' : 'Yeni Anket'}</span>
            </motion.button>
          </div>
        </header>

        {/* İstatistik Şeridi */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '2rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Toplam Randevu', value: appointments.length, color: '#6366f1', bg: '#eef2ff' },
            { label: 'Bekliyor', value: appointments.filter(a => a.status === 'pending').length, color: '#f59e0b', bg: '#fffbeb' },
            { label: 'Tamamlandı', value: appointments.filter(a => a.status === 'completed').length, color: '#10b981', bg: '#f0fdf4' },
            { label: 'Ertelendi', value: appointments.filter(a => a.status === 'postponed').length, color: '#3b82f6', bg: '#eff6ff' },
            { label: 'Toplam Anket', value: surveys.length, color: '#3b82f6', bg: '#eff6ff' },
          ].map(stat => (
            <div key={stat.label} style={{ flex: 1, minWidth: '140px', background: stat.bg, border: `1px solid ${stat.color}22`, borderRadius: '16px', padding: '16px 20px' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b', marginTop: '2px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Premium Tab Navigation */}
        <nav className="premium-nav">
          <button 
            className={`nav-btn ${activeSubTab === 'appointments' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('appointments')}
          >
            <CalendarDays size={20} />
            <span>Mevcut Takvim</span>
            {activeSubTab === 'appointments' && <motion.div layoutId="tab-active" className="active-indicator" />}
          </button>
          <button 
            className={`nav-btn ${activeSubTab === 'surveys' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('surveys')}
          >
            <ClipboardList size={20} />
            <span>Hazır Anketler</span>
            {activeSubTab === 'surveys' && <motion.div layoutId="tab-active" className="active-indicator" />}
          </button>
        </nav>

        <main className="content-viewport">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div 
                key="loading-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '5rem', flexDirection: 'column', gap: '1rem' }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  style={{ color: '#6366f1' }}
                >
                  <Sparkles size={48} />
                </motion.div>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#94a3b8' }}>Veriler yükleniyor...</span>
              </motion.div>
            ) : activeSubTab === 'appointments' ? (
              <motion.div 
                key="appointments-view"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="appointment-grid-container"
              >
                {/* Haftalık Çizelge Kontrolleri */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="week-nav-group" style={{ display: 'flex', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '4px' }}>
                      <button onClick={goToPrevWeek} className="icon-btn-subtle" style={{ padding: '8px' }}><ChevronRight style={{ transform: 'rotate(180deg)' }} size={18} /></button>
                      <button onClick={goToToday} style={{ border: 'none', background: 'none', padding: '0 12px', fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', cursor: 'pointer', borderLeft: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' }}>Bugün</button>
                      <button onClick={goToNextWeek} className="icon-btn-subtle" style={{ padding: '8px' }}><ChevronRight size={18} /></button>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{getWeekRangeLabel()}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleExportCSV} className="glass-btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700 }}>
                      <Send size={14} /> CSV
                    </button>
                    <button onClick={() => setIsBulkModalOpen(true)} className="glass-btn-sm" style={{ background: '#0f172a', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700 }}>
                      Toplu Randevu
                    </button>
                  </div>
                </div>

                <div className="center-filters-bar" style={{ display: 'flex', gap: '15px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  <div className="premium-search-input-wrapper" style={{ 
                    flex: 1, 
                    minWidth: '250px', 
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <Search 
                      size={18} 
                      style={{ 
                        position: 'absolute', 
                        left: '16px', 
                        color: '#94a3b8',
                        pointerEvents: 'none',
                        zIndex: 1
                      }} 
                    />
                    <input 
                      type="text" 
                      placeholder="Öğrenci adı ile ara..." 
                      className="premium-filter-search"
                      value={nameSearch}
                      onChange={(e) => setNameSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 16px 12px 48px',
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        outline: 'none',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                      }}
                    />
                  </div>

                  <div style={{ minWidth: '200px' }}>
                    <CustomSelect
                      label=""
                      title="Sınıf Filtrele"
                      placeholder="Tüm Sınıflar"
                      value={selectedClassFilter === 'all' ? '' : selectedClassFilter}
                      options={[
                        { value: '', label: '🏫 Tüm Sınıflar' },
                        ...(classes || []).map(c => ({ value: c.name, label: c.name }))
                      ]}
                      onChange={val => setSelectedClassFilter(val === '' ? 'all' : val)}
                    />
                  </div>
                </div>

                <div className="status-filter-row" style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  {(() => {
                    // Filter counts based on search and class filter
                    const filteredBase = (appointments || []).filter(a => {
                      const matchesClass = selectedClassFilter === 'all' || a.student?.class === selectedClassFilter;
                      const matchesName = a.student?.name?.toLocaleLowerCase('tr-TR').includes(nameSearch.toLocaleLowerCase('tr-TR'));
                      return matchesClass && matchesName;
                    });

                    return [
                      { id: 'all', label: 'Tümü', count: filteredBase.length },
                      { id: 'pending', label: 'Bekliyor', count: filteredBase.filter(a => a.status === 'pending').length },
                      { id: 'completed', label: 'Bitti', count: filteredBase.filter(a => a.status === 'completed').length },
                      { id: 'absent', label: 'Gelmedi', count: filteredBase.filter(a => a.status === 'absent').length },
                      { id: 'postponed', label: 'Ertelendi', count: filteredBase.filter(a => a.status === 'postponed').length }
                    ].map(f => (
                      <button 
                        key={f.id}
                        className={`filter-tag ${f.id} ${statusFilter === f.id ? 'active' : ''}`}
                        onClick={() => setStatusFilter(f.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          background: statusFilter === f.id ? '#0f172a' : 'white',
                          color: statusFilter === f.id ? 'white' : '#64748b',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s'
                        }}
                      >
                        {f.label}
                        <span style={{ 
                          background: statusFilter === f.id ? 'rgba(255,255,255,0.2)' : '#f1f5f9', 
                          padding: '2px 6px', 
                          borderRadius: '6px',
                          fontSize: '0.7rem'
                        }}>
                          {f.count}
                        </span>
                      </button>
                    ));
                  })()}
                </div>

                {/* Haftalık Görünüm Grid */}
                <div className="appointment-grid-container" style={{ width: '100%', overflowX: 'auto' }}>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(7, 1fr)', 
                    gap: '12px', 
                    minWidth: '1200px', 
                    paddingBottom: '2rem' 
                  }}>
                    {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map((dayName, dayIdx) => {
                      const dayDate = new Date(currentWeekStart);
                      dayDate.setDate(dayDate.getDate() + dayIdx);
                      const isToday = new Date().toDateString() === dayDate.toDateString();
                      
                      const dayAppointments = (appointments || []).filter(a => {
                        const aDate = new Date(a.startTime);
                        const matchesDay = aDate.toDateString() === dayDate.toDateString();
                        const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
                        const matchesClass = selectedClassFilter === 'all' || a.student?.class === selectedClassFilter;
                        const matchesName = a.student?.name?.toLocaleLowerCase('tr-TR').includes(nameSearch.toLocaleLowerCase('tr-TR'));
                        return matchesDay && matchesStatus && matchesClass && matchesName;
                      }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

                    return (
                      <div key={dayIdx} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ 
                          padding: '12px', 
                          background: isToday ? 'var(--primary)' : 'white', 
                          borderRadius: '16px', 
                          border: '1px solid #e2e8f0',
                          textAlign: 'center',
                          boxShadow: isToday ? '0 8px 16px -4px var(--primary-glow)' : 'none'
                        }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: isToday ? 'rgba(255,255,255,0.8)' : '#64748b', textTransform: 'uppercase' }}>{dayName}</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: isToday ? 'white' : '#1e293b' }}>{dayDate.getDate()}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {dayAppointments.length === 0 ? (
                            <div style={{ 
                              padding: '20px 10px', 
                              textAlign: 'center', 
                              color: '#94a3b8', 
                              fontSize: '0.75rem', 
                              fontStyle: 'italic',
                              border: '2px dashed #f1f5f9',
                              borderRadius: '16px'
                            }}>Randevu yok</div>
                          ) : (
                            dayAppointments.map((appt) => (
                              <motion.div 
                                key={appt.id}
                                layoutId={String(appt.id)}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={`compact-appt-card ${appt.status}`}
                                style={{
                                  padding: '12px',
                                  background: 'white',
                                  borderRadius: '14px',
                                  border: '1px solid #e2e8f0',
                                  borderLeft: `4px solid ${
                                    appt.status === 'pending' ? '#f59e0b' : 
                                    appt.status === 'completed' ? '#10b981' : 
                                    appt.status === 'absent' ? '#ef4444' : appt.status === 'postponed' ? '#3b82f6' : '#94a3b8'
                                  }`,
                                  position: 'relative',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                }}
                              >
                                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                                  <Clock size={10} />
                                  {new Date(appt.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', marginBottom: '4px', lineBreak: 'anywhere' }}>{appt.student?.name || 'Bilinmeyen Öğrenci'}</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{appt.title}</div>
                                
                                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                                  {appt.status === 'pending' ? (
                                    <>
                                      <button title="Geldi" onClick={() => handleUpdateAppointmentStatus(appt.id, 'completed')} style={{ flex: 1, padding: '4px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><CheckCircle2 size={12}/></button>
                                      <button title="Gelmedi" onClick={() => handleUpdateAppointmentStatus(appt.id, 'absent')} style={{ flex: 1, padding: '4px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><XCircle size={12}/></button>
                                      <button title="Ertele" onClick={() => setPostponeApptId(appt.id)} style={{ flex: 1, padding: '4px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#1d4ed8', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><Clock size={12}/></button>
                                    </>
                                  ) : (
                                    <button onClick={() => handleUpdateAppointmentStatus(appt.id, 'pending')} style={{ width: '100%', padding: '4px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#64748b', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>Geri Al</button>
                                  )}
                                </div>
                                <button 
                                  onClick={() => handleDeleteAppointment(appt.id)}
                                  style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '2px' }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </motion.div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
            </motion.div>
            ) : (
              <motion.div 
                key="surveys-view"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="survey-grid"
              >
                {(surveys || []).length === 0 ? (
                  <div className="premium-empty-state">
                    <div className="icon-wrapper">
                      <ClipboardList size={48} />
                    </div>
                    <h2>Henüz eklenmiş bir anket bulunamadı</h2>
                    <p style={{ color: '#64748b', marginTop: '8px' }}>Yeni bir anket oluşturarak başlayabilirsiniz.</p>
                  </div>
                ) : (
                  (surveys || []).map((survey, idx) => (
                    <motion.div 
                      key={survey.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="premium-card survey-card-interactive"
                    >
                      <div className="card-top">
                        <div className="survey-icon-box" style={{ background: '#f1f5f9', color: '#1e293b', padding: '8px', borderRadius: '10px' }}>
                          <Target size={20} />
                        </div>
                        <div className="context-menu-wrapper">
                          <button className="icon-btn-subtle" title="Sil" onClick={() => handleDeleteSurvey(survey.id)}>
                              <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <h3 className="survey-title" style={{ marginTop: '0.5rem' }}>{survey.title}</h3>
                      <p className="survey-desc">{survey.description || 'Açıklama yok.'}</p>
                      
                      <div className="survey-meta">
                        <div className="meta-item">
                          <BookOpen size={14} />
                          <span>{survey.questions?.length || 0} Soru</span>
                        </div>
                        <div className="meta-item">
                          <UsersIcon size={14} />
                          <span>{survey.assignments?.length || 0} Atama</span>
                        </div>
                      </div>

                      <div className="survey-footer" style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="glass-btn-sm" 
                          style={{ flex: 1, justifyContent: 'center' }}
                          onClick={() => { setSelectedSurvey(survey); setIsAssignModalOpen(true); }}
                        >
                          Ata
                        </button>
                        <button 
                          className="glass-btn-sm primary-filled" 
                          style={{ flex: 1, justifyContent: 'center' }}
                          onClick={() => handleViewResults(survey.id)}
                        >
                          Sonuçlar
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Toplu Randevu Modalı */}
        {isBulkModalOpen && createPortal(
          <div className="modal-overlay-premium" style={{ zIndex: 999999 }} onClick={() => setIsBulkModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="modal-luxury"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '480px' }}
            >
              <div className="modal-top">
                <h2>📅 Toplu Randevu Oluştur</h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>Seçilen sınıftaki tüm öğrencilere aynı anda randevu oluşturulur.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '0 2rem 1.5rem' }}>
                
                <CustomSelect
                  label="Sınıf"
                  title="Sınıf Seçin"
                  placeholder="Sınıf Seçin..."
                  value={bulkForm.classId}
                  options={classes.map(c => ({ value: c.id, label: c.name }))}
                  onChange={val => setBulkForm({ ...bulkForm, classId: val })}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <CustomDatePicker
                    label="Tarih"
                    value={bulkForm.date}
                    onChange={val => setBulkForm({ ...bulkForm, date: val })}
                  />
                  <CustomTimePicker
                    label="Saat"
                    value={bulkForm.time}
                    onChange={val => setBulkForm({ ...bulkForm, time: val })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', color: '#475569', marginBottom: '6px' }}>Başlık</label>
                  <input type="text" value={bulkForm.title} onChange={e => setBulkForm({ ...bulkForm, title: e.target.value })}
                    style={{ width: '100%', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '12px', fontWeight: 600, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', background: 'white' }} />
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button onClick={() => setIsBulkModalOpen(false)}
                    style={{ flex: 1, padding: '14px', background: '#f1f5f9', border: 'none', borderRadius: '12px', fontWeight: 700, cursor: 'pointer' }}>
                    İptal
                  </button>
                  <button onClick={handleCreateBulkAppointments}
                    style={{ flex: 1, padding: '14px', background: '#334155', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 700, cursor: 'pointer' }}>
                    {bulkForm.classId ? `${students.filter(s => String(s.classId) === String(bulkForm.classId)).length} Öğrenciye Oluştur` : 'Oluştur'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}

      <style>{`
        .guidance-premium-container {
          position: relative;
          min-height: calc(100vh - 100px);
          padding: 2.5rem;
          background: #fbfbfb;
        }

        .guidance-overlay-content { position: relative; z-index: 1; }

        .premium-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 2px solid #efefef;
        }
        .premium-title { font-size: 2rem; font-weight: 900; color: #1e293b; margin: 0; }
        .premium-subtitle { color: #64748b; font-size: 1rem; margin-top: 4px; }

        .glass-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 700;
          transition: all 0.2s;
          cursor: pointer;
          border: none;
        }
        .glass-btn.primary { background: #334155; color: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .glass-btn.primary:hover { background: #1e293b; transform: translateY(-1px); }

        .premium-nav { display: flex; gap: 2.5rem; margin-bottom: 2.5rem; }
        .survey-card-interactive:hover .survey-icon-box { background: #334155; color: white; transform: rotate(10deg); }

        /* Wizard Styles */
        .wizard-progress-bar { display: flex; justify-content: space-between; margin-bottom: 2.5rem; padding: 0 1rem; position: relative; }
        .wizard-step { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; z-index: 1; flex: 1; }
        .step-number { 
          width: 32px; height: 32px; border-radius: 50%; background: #f1f5f9; color: #94a3b8; 
          display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem;
          border: 2px solid #e2e8f0; transition: 0.3s;
        }
        .wizard-step span { font-size: 0.75rem; font-weight: 700; color: #94a3b8; transition: 0.3s; }
        .wizard-step.active .step-number { background: #6366f1; color: white; border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
        .wizard-step.active span { color: #1e293b; }
        .step-line { 
          position: absolute; top: 16px; left: calc(50% + 20px); width: calc(100% - 40px); 
          height: 2px; background: #e2e8f0; z-index: -1; 
        }
        .wizard-step.active .step-line { background: #6366f1; }

        .wizard-content { min-height: 350px; }

        .dist-card { 
          border: 2px solid #f1f5f9; border-radius: 16px; padding: 1.25rem; cursor: pointer; transition: 0.3s;
          display: flex; flex-direction: row; align-items: center; gap: 1rem; position: relative;
        }
        .dist-card:hover { border-color: #cbd5e1; background: #fafafa; }
        .dist-card.active { border-color: #6366f1; background: #f5f3ff; box-shadow: 0 10px 20px -5px rgba(99, 102, 241, 0.1); }
        .dist-icon { 
          width: 44px; height: 44px; border-radius: 12px; background: white; border: 1px solid #e2e8f0;
          display: flex; align-items: center; justify-content: center; color: #64748b; transition: 0.2s;
        }
        .dist-card.active .dist-icon { background: #6366f1; color: white; border-color: #6366f1; }
        .dist-info h4 { font-size: 1rem; font-weight: 800; color: #1e293b; margin: 0; }
        .dist-info p { font-size: 0.8rem; color: #64748b; margin: 4px 0 0 0; }
        
        /* Ensure dropdown is above card content */
        .dist-card .custom-datepicker-container,
        .dist-card .custom-select-container { position: relative; z-index: 10; width: 100%; }
        
        .nav-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 10px;
          background: none;
          border: none;
          color: #94a3b8;
          font-weight: 700;
          font-size: 1.05rem;
          cursor: pointer;
        }
        .nav-btn.active { color: #334155; }
        .active-indicator {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: #334155;
          border-radius: 3px;
        }

        .status-filter-row { display: flex; gap: 10px; margin-bottom: 2rem; }
        .filter-tag { 
          padding: 8px 16px; border-radius: 100px; border: 1px solid #e2e8f0; 
          background: white; color: #64748b; font-size: 0.85rem; font-weight: 700; 
          cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px;
        }
        .filter-tag:hover { background: #f8fafc; border-color: #cbd5e1; }
        .filter-tag.active.all { background: #334155; color: white; border-color: #334155; }
        .filter-tag.active.pending { background: #64748b; color: white; border-color: #64748b; }
        .filter-tag.active.completed { background: #10b981; color: white; border-color: #10b981; }
        .filter-tag.active.absent { background: #f59e0b; color: white; border-color: #f59e0b; }
        .tag-count { opacity: 0.6; font-size: 0.75rem; }

        .appointment-grid, .survey-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
          gap: 1.5rem;
        }

        .premium-card {
          background: white;
          border-radius: 16px;
          padding: 1.5rem;
          border: 1px solid #eef2f6;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
        }
        .premium-card:hover { transform: translateY(-4px); box-shadow: 0 12px 20px -8px rgba(0,0,0,0.08); border-color: #cbd5e1; }

        .appt-card.completed { border-top: 5px solid #10b981; }
        .appt-card.cancelled { border-top: 5px solid #ef4444; opacity: 0.7; }
        .appt-card.absent { border-top: 5px solid #f59e0b; }
        .appt-card.pending { border-top: 5px solid #64748b; }

        .card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
        .appt-status-chip { 
          font-size: 0.7rem; 
          font-weight: 800; 
          padding: 4px 10px; 
          border-radius: 6px; 
          text-transform: uppercase;
          background: #f1f5f9;
          color: #64748b;
        }
        .pending .appt-status-chip { background: #334155; color: white; }
        .absent .appt-status-chip { background: #fff7ed; color: #f59e0b; }
        .completed .appt-status-chip { background: #f0fdf4; color: #10b981; }

        .premium-filter-search:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1) !important;
        }

        .premium-filter-select:hover {
          border-color: #6366f1 !important;
        }
        
        @media (max-width: 768px) {
          .center-filters-bar { flex-direction: column; }
          .premium-search-input-wrapper, .premium-select-wrapper { width: 100% !important; }
        }

        .time-badge { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #94a3b8; font-weight: 600; margin-bottom: 0.5rem; }
        .appt-title { font-size: 1.2rem; font-weight: 800; color: #1e293b; margin-bottom: 1.5rem; }

        .student-profile-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f8fafc;
          border-radius: 12px;
          margin-top: auto;
        }
        .profile-avatar { width: 34px; height: 34px; border-radius: 10px; background: #e2e8f0; color: #475569; display: flex; align-items: center; justify-content: center; font-weight: 800; }
        .profile-info { flex: 1; display: flex; flex-direction: column; }
        .profile-name { font-size: 0.9rem; font-weight: 700; color: #1e293b; }
        .profile-class { font-size: 0.75rem; color: #64748b; }

        .card-actions-row { display: flex; gap: 6px; margin-top: 1.25rem; }
        .action-btn { 
          flex: 1; 
          padding: 10px; 
          border-radius: 12px; 
          border: 1px solid #e2e8f0; 
          font-weight: 700; 
          cursor: pointer; 
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
          font-size: 0.75rem; 
          background: white; 
          color: #64748b; 
          box-shadow: 0 4px 0 #e2e8f0;
          position: relative;
          top: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .action-btn:hover { 
          transform: translateY(-1px);
          box-shadow: 0 5px 0 #e2e8f0;
          filter: brightness(0.98);
        }
        .action-btn:active { 
          transform: translateY(3px);
          box-shadow: 0 1px 0 #e2e8f0;
        }

        .action-btn.complete { 
          background: #f0fdf4; 
          color: #166534; 
          border-color: #bbf7d0; 
          box-shadow: 0 4px 0 #86efac;
        }
        .action-btn.complete:hover { box-shadow: 0 5px 0 #86efac; }
        .action-btn.complete:active { box-shadow: 0 1px 0 #86efac; }

        .action-btn.absent-btn { 
          background: #fff7ed; 
          color: #9a3412; 
          border-color: #ffedd5; 
          box-shadow: 0 4px 0 #fdba74;
        }
        .action-btn.absent-btn:hover { box-shadow: 0 5px 0 #fdba74; }
        .action-btn.absent-btn:active { box-shadow: 0 1px 0 #fdba74; }

        .action-btn.cancel {
          background: #fef2f2;
          color: #991b1b;
          border-color: #fee2e2;
          box-shadow: 0 4px 0 #fca5a5;
        }
        .action-btn.cancel:hover { box-shadow: 0 5px 0 #fca5a5; }
        .action-btn.cancel:active { box-shadow: 0 1px 0 #fca5a5; }

        .action-btn.undo { width: 100%; border: 1px dashed #cbd5e1; color: #475569; box-shadow: none; }
        .action-btn.undo:active { transform: scale(0.98); }

        .survey-icon-box { width: 44px; height: 44px; background: #334155; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; margin-bottom: 1rem; }
        .survey-title { font-size: 1.25rem; font-weight: 800; color: #1e293b; margin-bottom: 0.5rem; }
        .survey-desc { color: #64748b; line-height: 1.5; font-size: 0.95rem; margin-bottom: 1.25rem; flex: 1; }
        .survey-meta { display: flex; gap: 1.25rem; margin-bottom: 1.5rem; padding-top: 1rem; border-top: 1px solid #f1f5f9; }
        .meta-item { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #94a3b8; font-weight: 600; }
        
        .survey-footer { display: flex; gap: 8px; }
        .glass-btn-sm { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid #e2e8f0; font-weight: 700; cursor: pointer; font-size: 0.8rem; background: #fff; color: #475569; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .glass-btn-sm.primary-filled { background: #334155; color: #fff; border: none; }

        .icon-btn-subtle { background: none; border: none; color: #cbd5e1; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; transition: 0.2s; }
        .icon-btn-subtle:hover { color: #f43f5e; background: #fff1f2; }

        .premium-empty-state { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6rem 2rem; border: 2px dashed #e2e8f0; border-radius: 20px; opacity: 0.6; }


        .modal-body-scrollable { overflow-y: auto; max-height: 65vh; padding-right: 12px; }
        .modal-body-scrollable::-webkit-scrollbar { width: 6px; }
        .modal-body-scrollable::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .modal-luxury { overflow: visible !important; }
        .modal-luxury .modal-body-scrollable { overflow: visible; max-height: none; }
      `}</style>
      
      {/* ... keeping the modals but they will be styled in a similar high-end fashion if added back ... */}
      {/* Existing modals like AppointmentModal should be triggered correctly */}
      {isAppointmentModalOpen && createPortal(
        <div className="modal-overlay-premium" onClick={() => setIsAppointmentModalOpen(false)}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="modal-luxury"
            onClick={e => e.stopPropagation()}
          >
             <div className="modal-top">
                <h2>Yeni Görüşme Planla</h2>
                <p>Öğrencinize rehberlik etmek için bir zaman dilimi seçin.</p>
             </div>
             <form onSubmit={handleCreateAppointment}>
                <div className="modal-body-scrollable">
                  <div className="grid-2">
                    <CustomSelect 
                      label="Sınıf Seçin"
                      value={appointmentClass}
                      options={classes.map(c => ({ value: c.name, label: c.name }))}
                      onChange={setAppointmentClass}
                      placeholder="Tüm Sınıflar"
                    />
                    <CustomSelect 
                      label="Öğrenci"
                      value={newAppointment.studentId}
                      options={students
                        .filter(s => !appointmentClass || s.class === appointmentClass)
                        .map(s => ({ value: s.id, label: s.name }))}
                      onChange={(val) => setNewAppointment({...newAppointment, studentId: val})}
                      placeholder="Öğrenci seçin..."
                    />
                  </div>
                  <div className="grid-2">
                    <CustomDatePicker 
                      label="Tarih"
                      value={newAppointment.date}
                      onChange={(val) => setNewAppointment({...newAppointment, date: val})}
                    />
                    <CustomTimePicker 
                      label="Saat"
                      value={newAppointment.time}
                      onChange={(val) => setNewAppointment({...newAppointment, time: val})}
                    />
                  </div>
                  <div className="luxury-input-group">
                    <label>Konu</label>
                    <input type="text" value={newAppointment.title} onChange={e => setNewAppointment({...newAppointment, title: e.target.value})} />
                  </div>
                </div>
                <div className="modal-bottom">
                  <button type="button" className=" luxury-btn-ghost" onClick={() => setIsAppointmentModalOpen(false)}>Vazgeç</button>
                  <button type="submit" className="luxury-btn-primary">Randevuyu Kaydet</button>
                </div>
             </form>
          </motion.div>
        </div>,
        document.body
      )}

      {postponeApptId && createPortal(
        <div className="modal-overlay-premium" onClick={() => setPostponeApptId(null)}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="modal-luxury"
            onClick={e => e.stopPropagation()}
          >
             <div className="modal-top">
                <h2>Randevuyu Ertele</h2>
                <p>Yeni bir tarih ve saat seçin.</p>
             </div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="grid-2">
                  <CustomDatePicker 
                    label="Yeni Tarih"
                    value={postponeDate}
                    onChange={setPostponeDate}
                  />
                  <CustomTimePicker 
                    label="Yeni Saat"
                    value={postponeTime}
                    onChange={setPostponeTime}
                  />
                </div>
                <div className="modal-bottom">
                  <button type="button" className="luxury-btn-ghost" onClick={() => setPostponeApptId(null)}>Vazgeç</button>
                  <button type="button" className="luxury-btn-primary" onClick={handlePostpone}>Ertelemeyi Onayla</button>
                </div>
             </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Adding more luxury modal CSS */}
      <style>{`
        .modal-overlay-premium {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(8px);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        .modal-luxury {
          background: white;
          width: 500px;
          border-radius: 30px;
          padding: 2.5rem;
          box-shadow: 0 40px 100px -20px rgba(0,0,0,0.3);
        }
        .modal-top h2 { font-size: 1.8rem; font-weight: 800; color: #0f172a; margin: 0; }
        .modal-top p { color: #64748b; margin: 8px 0 2rem 0; }
        .luxury-input-group { margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 8px; }
        .luxury-input-group label { font-size: 0.85rem; font-weight: 700; color: #0f172a; }
        .luxury-input-group select, .luxury-input-group input {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 14px;
          border-radius: 12px;
          font-size: 1rem;
          transition: 0.2s;
        }
        .luxury-input-group select:focus, .luxury-input-group input:focus {
          border-color: #6366f1;
          outline: none;
          background: white;
        }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .modal-bottom { display: flex; gap: 1rem; margin-top: 1rem; }
        .luxury-btn-primary { 
          flex: 2; background: #0f172a; color: white; border: none; padding: 16px; border-radius: 16px; 
          font-weight: 700; cursor: pointer; transition: 0.2s;
        }
        .luxury-btn-ghost { 
          flex: 1; background: #f1f5f9; color: #64748b; border: none; padding: 16px; border-radius: 16px; 
          font-weight: 700; cursor: pointer;
        }
      `}</style>

      {/* Add Survey Modal logic similarly if needed, or simply let the styles apply */}
      {isSurveyModalOpen && createPortal(
        <div className="modal-overlay-premium" onClick={() => { setIsSurveyModalOpen(false); setSurveyStep(1); }}>
           <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="modal-luxury wizard-modal"
            style={{ width: '700px', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
             {/* Wizard Header / Step Indicator */}
             <div className="wizard-progress-bar">
                {[
                  { s: 1, l: 'Detaylar' },
                  { s: 2, l: 'Sorular' },
                  { s: 3, l: 'Dağıtım' }
                ].map(step => (
                  <div key={step.s} className={`wizard-step ${surveyStep >= step.s ? 'active' : ''}`}>
                    <div className="step-number">{step.s}</div>
                    <span>{step.l}</span>
                    {step.s < 3 && <div className="step-line" />}
                  </div>
                ))}
             </div>

             <form onSubmit={handleCreateSurvey}>
                <AnimatePresence mode="wait">
                  {surveyStep === 1 && (
                    <motion.div 
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="wizard-content"
                    >
                      <div className="modal-top">
                        <h2>Anket Detayları</h2>
                        <p>Anketin amacını ve başlığını belirleyin.</p>
                      </div>
                      <div className="luxury-input-group">
                        <label>Anket Başlığı</label>
                        <input type="text" value={newSurvey.title} onChange={e => setNewSurvey({...newSurvey, title: e.target.value})} required placeholder="Örn: Hafta Sonu Deneme Analizi" />
                      </div>
                      <div className="luxury-input-group">
                        <label>Açıklama (Opsiyonel)</label>
                        <textarea 
                          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '12px', minHeight: '100px', fontFamily: 'inherit', resize: 'none' }}
                          value={newSurvey.description} 
                          onChange={e => setNewSurvey({...newSurvey, description: e.target.value})} 
                          placeholder="Öğrenciler için kısa bir not..."
                        />
                      </div>
                    </motion.div>
                  )}

                  {surveyStep === 2 && (
                    <motion.div 
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="wizard-content"
                    >
                      <div className="modal-top">
                        <h2>Anket Soruları</h2>
                        <p>Öğrencilere sorulacak soruları hazırlayın.</p>
                      </div>
                      <div className="modal-body-scrollable" style={{ maxHeight: '45vh' }}>
                        {newSurvey.questions.map((q, qIdx) => (
                          <div key={qIdx} className="luxury-question-block" style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '16px', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
                             <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                  <textarea 
                                     style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', minHeight: '45px', fontFamily: 'inherit', resize: 'vertical' }}
                                     placeholder="Soru metni..."
                                     value={q.text}
                                     onChange={e => updateQuestion(qIdx, 'text', e.target.value)}
                                     required
                                  />
                                </div>
                                <div style={{ width: '150px' }}>
                                  <CustomSelect 
                                    label=""
                                    value={q.type}
                                    options={[
                                      { value: 'multiple_choice', label: 'Seçmeli' },
                                      { value: 'text', label: 'Açık Uçlu' }
                                    ]}
                                    onChange={(val) => updateQuestion(qIdx, 'type', val)}
                                  />
                                </div>
                                <button type="button" onClick={() => {
                                   const up = [...newSurvey.questions];
                                   up.splice(qIdx, 1);
                                   setNewSurvey({...newSurvey, questions: up});
                                }} className="icon-btn-danger" style={{ background: '#fee2e2', color: '#ef4444', border: 'none', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', flexShrink: 0 }}><Trash2 size={18} /></button>
                             </div>
                             
                             {q.type === 'multiple_choice' && (
                               <div className="options-input-group" style={{ paddingLeft: '1rem', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {q.options.map((opt, oIdx) => (
                                    <input key={oIdx} style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px', borderRadius: '8px' }} placeholder={`Seçenek ${oIdx+1}`} value={opt} onChange={e => updateOption(qIdx, oIdx, e.target.value)} />
                                  ))}
                                  <button type="button" style={{ color: '#6366f1', background: 'none', border: 'none', textAlign: 'left', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => addOption(qIdx)}>+ Seçenek Ekle</button>
                               </div>
                             )}
                          </div>
                        ))}
                        <button type="button" className="glass-btn secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: '1rem' }} onClick={addQuestion}>+ Yeni Soru Ekle</button>
                      </div>
                    </motion.div>
                  )}

                  {surveyStep === 3 && (
                    <motion.div 
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="wizard-content"
                    >
                      <div className="modal-top">
                        <h2>Dağıtım Ayarları</h2>
                        <p>Anketi kime göndermek istediğinizi seçin.</p>
                      </div>
                      
                      <div className="distribution-options" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                         <div 
                           className={`dist-card ${surveyAudience.type === 'all' ? 'active' : ''}`}
                           onClick={() => setSurveyAudience({ type: 'all', value: 'institution' })}
                         >
                            <div className="dist-icon" style={{ background: surveyAudience.type === 'all' ? '#6366f1' : '#f8fafc', color: surveyAudience.type === 'all' ? 'white' : '#64748b' }}>
                               <Sparkles size={20} />
                            </div>
                            <div className="dist-info">
                               <h4>Tüm Kurum (Genel Dağıtım)</h4>
                               <p>Anketi kurumdaki tüm öğrencilere anında gönderir.</p>
                            </div>
                         </div>

                         <div 
                           className={`dist-card ${surveyAudience.type === 'class' ? 'active' : ''}`}
                           onClick={() => setSurveyAudience({ type: 'class', value: '' })}
                         >
                            <div className="dist-icon"><UsersIcon size={20} /></div>
                            <div className="dist-info">
                               <h4>Sınıf Bazlı Dağıtım</h4>
                               <p>Anketi seçilen sınıfın tüm öğrencilerine gönderir.</p>
                            </div>
                         </div>

                         <div 
                           className={`dist-card ${surveyAudience.type === 'student' ? 'active' : ''}`}
                           onClick={() => setSurveyAudience({ type: 'student', value: '' })}
                         >
                            <div className="dist-icon"><UserIcon size={20} /></div>
                            <div className="dist-info">
                               <h4>Öğrenci Bazlı Dağıtım</h4>
                               <p>Anketi tek bir spesifik öğrenciye gönderir.</p>
                            </div>
                         </div>
                      </div>

                      {/* Selection UI based on active card */}
                      <AnimatePresence mode="wait">
                        {surveyAudience.type === 'class' && (
                          <motion.div 
                            key="select-class"
                            initial={{ opacity: 0, y: -10 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0, y: -10 }} 
                            style={{ marginTop: '1.5rem' }}
                          >
                            <CustomSelect 
                              label="Hedef Sınıfı Seçin"
                              value={surveyAudience.value}
                              options={classes.map(c => ({ value: c.name, label: c.name }))}
                              placeholder="Bir sınıf seçin..."
                              onChange={(val) => setSurveyAudience({...surveyAudience, value: val})}
                            />
                          </motion.div>
                        )}
                        {surveyAudience.type === 'student' && (
                          <motion.div 
                            key="select-student"
                            initial={{ opacity: 0, y: -10 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0, y: -10 }} 
                            style={{ marginTop: '1.5rem' }}
                          >
                            <CustomSelect 
                              label="Hedef Öğrenciyi Seçin"
                              value={surveyAudience.value}
                              options={students.map(s => ({ value: s.id, label: s.name }))}
                              placeholder="Bir öğrenci seçin..."
                              onChange={(val) => setSurveyAudience({...surveyAudience, value: val})}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="modal-bottom" style={{ borderTop: '1px solid #f1f5f9', marginTop: '20px', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                    {surveyStep > 1 && (
                      <button type="button" key="back-btn" className="luxury-btn-ghost" onClick={() => setSurveyStep(s => s - 1)}>Geri</button>
                    )}
                    <button type="button" key="cancel-btn" className="luxury-btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => { setIsSurveyModalOpen(false); setSurveyStep(1); }}>İptal</button>
                    
                    {surveyStep < 3 ? (
                      <button 
                        key="next-btn"
                        type="button" 
                        className="luxury-btn-primary" 
                        disabled={surveyStep === 1 && !newSurvey.title}
                        onClick={(e) => { e.preventDefault(); setSurveyStep(s => s + 1); }}
                      >
                        Devam Et <ArrowRight size={18} />
                      </button>
                    ) : (
                      <button 
                        key="save-btn"
                        type="submit" 
                        className="luxury-btn-primary" 
                        style={{ background: '#10b981' }}
                      >
                        Kaydet ve Yayınla <Send size={18} />
                      </button>
                    )}
                  </div>
                </div>
             </form>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Assign Modal logic */}
      {isAssignModalOpen && selectedSurvey && createPortal(
         <div className="modal-overlay-premium" onClick={() => setIsAssignModalOpen(false)}>
           <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="modal-luxury"
            onClick={e => e.stopPropagation()}
          >
             <div className="modal-top">
                <h2>Anket Ataması Yap</h2>
                <p>{selectedSurvey.title} projesini kime göndermek istersiniz?</p>
             </div>
             
              <CustomSelect 
                label="Sınıf Bazlı Gönderim"
                value=""
                options={classes.map(c => ({ value: c.name, label: c.name }))}
                placeholder="Bir sınıf seçin..."
                onChange={async (val) => {
                  if (val) {
                    await api.assignGuidanceSurvey(selectedSurvey.id, { className: val });
                    setIsAssignModalOpen(false);
                    fetchData();
                  }
                }}
              />

              <div style={{ textAlign: 'center', margin: '1rem', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>VE YA</div>

              <CustomSelect 
                label="Öğrenci Bazlı Gönderim"
                value=""
                options={students.map(s => ({ value: s.id, label: s.name }))}
                placeholder="Bir öğrenci seçin..."
                onChange={async (val) => {
                  if (val) {
                    await api.assignGuidanceSurvey(selectedSurvey.id, { studentId: parseInt(val) });
                    setIsAssignModalOpen(false);
                    fetchData();
                  }
                }}
              />
          </motion.div>
         </div>,
         document.body
      )}
      {isResultsModalOpen && selectedSurveyResults && createPortal(
        <div className="modal-overlay-premium" onClick={() => setIsResultsModalOpen(false)}>
           <motion.div 
             initial={{ opacity: 0, y: 30, scale: 0.95 }}
             animate={{ opacity: 1, y: 0, scale: 1 }}
             className="modal-luxury"
             style={{ width: '800px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
             onClick={e => e.stopPropagation()}
           >
              <div className="modal-top">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2>{(selectedSurveyResults?.title) || 'İsimsiz Anket'} - Sonuçlar</h2>
                    <p>{(selectedSurveyResults?.assignments || []).filter((a: any) => a.status === 'completed').length} / {(selectedSurveyResults?.assignments || []).length} Tamamlanma</p>
                  </div>
                  <button onClick={() => setIsResultsModalOpen(false)} className="icon-btn-subtle"><XCircle size={24} /></button>
                </div>
              </div>

              <div className="results-content" style={{ marginTop: '1rem' }}>
                 {(selectedSurveyResults?.assignments || []).length === 0 ? (
                   <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Henüz bir atama yapılmamış.</div>
                 ) : (
                   <div className="results-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {(selectedSurveyResults?.assignments || []).map((assignment: any) => {
                         const isDone = assignment.status === 'completed';
                         const studentName = assignment.student?.name || 'İsimsiz Öğrenci';
                         return (
                           <div key={assignment.id} style={{ border: '1px solid #eef2f6', borderRadius: '16px', padding: '1.5rem', background: isDone ? '#fff' : '#f8fafc' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '40px', height: '40px', background: '#e2e8f0', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                       {studentName.charAt(0)}
                                    </div>
                                    <div>
                                       <div style={{ fontWeight: '700', color: '#1e293b' }}>{studentName}</div>
                                       <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{assignment.student?.class || 'Sınıf Belirtilmemiş'}</div>
                                    </div>
                                 </div>
                                 <div style={{ 
                                    padding: '6px 12px', 
                                    borderRadius: '100px', 
                                    fontSize: '0.75rem', 
                                    fontWeight: '800',
                                    background: isDone ? '#f0fdf4' : '#fff7ed',
                                    color: isDone ? '#10b981' : '#f59e0b'
                                 }}>
                                    {isDone ? 'TAMAMLANDI' : 'BEKLEMEDE'}
                                 </div>
                              </div>

                              {isDone && assignment.responses && (
                                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                   {(selectedSurveyResults?.questions || []).map((q: any) => {
                                      const resp = (assignment.responses || []).find((r: any) => r.questionId === q.id);
                                      return (
                                        <div key={q.id}>
                                           <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b', marginBottom: '4px' }}>{q.text}</div>
                                           <div style={{ fontSize: '0.95rem', color: '#1e293b' }}>{resp?.selectedOption || resp?.answerText || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Cevap yok</span>}</div>
                                        </div>
                                      );
                                   })}
                                </div>
                              )}
                           </div>
                         );
                      })}
                   </div>
                 )}
              </div>
           </motion.div>
        </div>,
        document.body
      )}
      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && createPortal(
        <div className="modal-overlay-premium" style={{ zIndex: 200000 }} onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="modal-luxury confirm-modal"
            style={{ width: '400px', textAlign: 'center', padding: '2rem' }}
            onClick={e => e.stopPropagation()}
          >
            <div className={`confirm-icon-box ${confirmModal.type}`} style={{ 
              width: '60px', height: '60px', borderRadius: '50%', margin: '0 auto 1.5rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: confirmModal.type === 'danger' ? '#fef2f2' : '#fffbeb',
              color: confirmModal.type === 'danger' ? '#ef4444' : '#f59e0b'
            }}>
              <Trash2 size={28} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.5rem', color: '#1e293b' }}>{confirmModal.title}</h2>
            <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem' }}>{confirmModal.message}</p>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="luxury-btn-ghost" 
                style={{ flex: 1 }}
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              >
                Vazgeç
              </button>
              <button 
                className="luxury-btn-primary" 
                style={{ flex: 1, background: confirmModal.type === 'danger' ? '#ef4444' : '#f59e0b' }}
                onClick={confirmModal.onConfirm}
              >
                Evet, Sil
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
      </div>
    </div>
  );
};

export default GuidanceCenter;
