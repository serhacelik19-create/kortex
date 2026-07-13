import React, { useState, useEffect } from 'react';
import {
    Key,
    Search,
    ShieldCheck,
    ShieldAlert,
    RotateCcw,
    Trash2,
    UserPlus,
    Copy,
    CheckCircle,
    UserCircle,
    X,
    Lock,
    User,
    RefreshCw,
    Eye,
    EyeOff,
    CheckCircle2,
    XCircle,
    ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api';
import { usePanelToast } from './components/PanelToastProvider';
import { usePanelConfirm } from './components/PanelConfirmProvider';

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
      {label && <label>{label}</label>}
      <div className="custom-select-trigger" onClick={() => setIsModalOpen(true)} style={{ minWidth: '180px' }}>
        <span>{selectedLabel}</span>
        <ChevronRightIcon size={16} className="chevron" />
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

const StudentAccounts: React.FC = () => {
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [classes, setClasses] = useState<any[]>([]);
    const [selectedClass, setSelectedClass] = useState('all');
    const { showToast } = usePanelToast();
    const { confirm } = usePanelConfirm();

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [formPassword, setFormPassword] = useState('');
    const [showPasswordInModal, setShowPasswordInModal] = useState(false);

    const fetchStudents = async () => {
        setLoading(true);
        try {
            const data = await api.getStudents();
            setStudents(data);
        } catch (err) {
            console.error('Veriler yüklenemedi:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchClasses = async () => {
        try {
            const data = await api.getClasses();
            setClasses(data);
        } catch (err) {
            console.error('Sınıflar yüklenemedi:', err);
        }
    };

    useEffect(() => {
        fetchStudents();
        fetchClasses();
    }, []);

    const openCreateModal = (student: any) => {
        setSelectedStudent(student);
        setFormPassword(''); // Şifreyi boş bırak — kullanıcı yeni şifre girer
        setShowPasswordInModal(false);
        setIsModalOpen(true);
    };

    const handleSaveCredentials = async () => {
        if (!formPassword) {
            showToast({ type: 'warning', title: 'Eksik Şifre', message: 'Şifre boş bırakılamaz.' });
            return;
        }

        try {
            await api.updateStudent(selectedStudent.id, {
                password: formPassword
            });
            fetchStudents();
            setIsModalOpen(false);
            showToast({ type: 'success', title: 'Kaydedildi', message: `${selectedStudent.name} bilgileri başarıyla kaydedildi.` });
        } catch (err) {
            showToast({ type: 'error', title: 'Kaydedilemedi', message: 'Kaydetme işlemi başarısız oldu.' });
        }
    };

    const handleGenerateRandom = () => {
        const pass = Math.random().toString(36).slice(-8);
        setFormPassword(pass);
    };

    const handleDeleteCredentials = async (studentId: number, studentName: string) => {
        if (await confirm({
            title: 'Giriş yetkisi kaldırılsın mı?',
            message: `${studentName} isimli öğrencinin tüm giriş yetkilerini kaldırmak üzeresin.`,
            confirmLabel: 'Kaldır',
            cancelLabel: 'Vazgeç',
            tone: 'danger',
        })) {
            try {
                await api.updateStudent(studentId, { password: '' });
                fetchStudents();
                showToast({ type: 'success', title: 'Silindi', message: 'Giriş bilgileri silindi.' });
            } catch (err) {
                showToast({ type: 'error', title: 'Silinemedi', message: 'Silme işlemi başarısız.' });
            }
        }
    };

    const handleBatchGenerate = async () => {
        const studentsWithoutAccount = students.filter(s => !s.hasPassword);
        if (studentsWithoutAccount.length === 0) {
            showToast({ type: 'info', title: 'Öğrenci Yok', message: 'Hesabı olmayan öğrenci bulunamadı.' });
            return;
        }

        if (await confirm({
            title: 'Toplu hesap oluşturulsun mu?',
            message: `${studentsWithoutAccount.length} öğrenci için otomatik giriş hesabı oluşturulacak.`,
            confirmLabel: 'Oluştur',
            cancelLabel: 'Vazgeç',
            tone: 'warning',
        })) {
            try {
                for (const student of studentsWithoutAccount) {
                    const password = Math.random().toString(36).slice(-8);
                    await api.updateStudent(student.id, { password });
                }
                fetchStudents();
                showToast({ type: 'success', title: 'Tamamlandı', message: 'Toplu hesap oluşturma tamamlandı.' });
            } catch (err) {
                showToast({ type: 'error', title: 'Eksik Tamamlandı', message: 'Bazı hesaplar oluşturulamadı.' });
            }
        }
    };

    const copyToClipboard = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        showToast({ type: 'success', title: 'Kopyalandı', message: 'Bilgi panoya kopyalandı.' });
    };

    const filteredStudents = students.filter(s => {
        const matchesName = (s.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesClass = selectedClass === 'all' || s.class === selectedClass;
        return matchesName && matchesClass;
    });

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="main-content">
            <div className="page-header">
                <div>
                    <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Key size={32} color="var(--primary)" />
                        Erişim ve Hesap Yönetimi
                    </h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Öğrencilerin mobil uygulamaya giriş yetkilerini buradan yönetin.</p>
                </div>
                <button
                    className="btn-primary"
                    onClick={handleBatchGenerate}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.5rem' }}
                >
                    <UserPlus size={18} /> Tümüne Hesap Tanımla
                </button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="search-container" style={{ flex: 1 }}>
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Öğrenci ismine göre ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="filter-group" style={{ display: 'flex', gap: '0.75rem' }}>
                        <CustomSelect
                            label=""
                            title="Sınıf Seçin"
                            placeholder="Tüm Sınıflar"
                            value={selectedClass}
                            options={[
                                { value: 'all', label: 'Tüm Sınıflar' },
                                ...classes.map(c => ({ value: c.name, label: c.name }))
                            ]}
                            onChange={val => setSelectedClass(val)}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.875rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-success)' }}>
                            <ShieldCheck size={16} /> {students.filter(s => s.username && s.hasPassword).length} Aktif Hesap
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                            <ShieldAlert size={16} /> {students.filter(s => !s.hasPassword).length} Yetkisiz
                        </div>
                    </div>
                </div>

                <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', paddingBottom: '1rem' }}>
                    {loading ? (
                        <div style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <RotateCcw className="animate-spin" size={32} style={{ marginBottom: '1rem' }} />
                            <div>Yükleniyor...</div>
                        </div>
                    ) : (
                        <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Öğrenci Adı</th>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Kullanıcı Adı</th>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Şifre</th>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Durum</th>
                                    <th style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map(student => (
                                    <tr key={student.id} style={{ borderBottom: '1px solid var(--border-color)' }} className="student-row-hover">
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <UserCircle size={20} color="var(--text-muted)" />
                                                </div>
                                                <div style={{ fontWeight: 600 }}>{student.name || 'İsimsiz'}</div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            {student.username ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <code style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{student.username}</code>
                                                    <button onClick={() => copyToClipboard(student.username)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Copy size={14} /></button>
                                                </div>
                                            ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>}
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            {student.hasPassword ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <code style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                                                        ••••••••
                                                    </code>
                                                    <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>Şifre Ayarlı</span>
                                                </div>
                                            ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>}
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem' }}>
                                            <span className={`badge ${student.username && student.hasPassword ? 'badge-info' : 'badge-alert'}`} style={{ fontSize: '0.7rem' }}>
                                                {student.username && student.hasPassword ? 'AKTİF ERİŞİM' : 'HESAP YOK'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button
                                                    className={student.hasPassword ? "btn-outline" : "btn-primary"}
                                                    style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                                    onClick={() => openCreateModal(student)}
                                                >
                                                    {student.hasPassword ? <><RotateCcw size={14} /> Şifre Değiştir</> : 'Hesap Oluştur'}
                                                </button>
                                                {student.hasPassword && (
                                                    <button
                                                        className="btn-outline"
                                                        style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.1)' }}
                                                        onClick={() => handleDeleteCredentials(student.id, student.name)}
                                                        title="Erişimi Sil"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Modal for Creating/Editing Credentials */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="modal-overlay" style={{ perspective: '1000px' }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20, rotateX: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20, rotateX: 10 }}
                            className="modal-content-card"
                            style={{ maxWidth: '450px' }}
                        >
                            <div className="modal-header" style={{ background: 'linear-gradient(to right, #f8fafc, #ffffff)', borderBottom: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ width: 40, height: 40, background: 'var(--primary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                        <Lock size={20} />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Erişim Bilgilerini Yönet</h2>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedStudent?.name}</p>
                                    </div>
                                </div>
                                <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="form-body" style={{ padding: '2rem' }}>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <User size={14} color="var(--primary)" /> Kullanıcı Adı
                                    </label>
                                    <input
                                        type="text"
                                        value={selectedStudent?.username || '(şifre kaydedilince otomatik üretilecek)'}
                                        readOnly
                                        style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.75rem 1rem', background: '#f8fafc', color: '#64748b' }}
                                    />
                                </div>

                                <div className="form-group" style={{ marginBottom: '2rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Lock size={14} color="var(--primary)" /> Şifre
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showPasswordInModal ? "text" : "password"}
                                            value={formPassword}
                                            onChange={(e) => setFormPassword(e.target.value)}
                                            placeholder="Örn: xY72pL9"
                                            style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.75rem 5.5rem 0.75rem 1rem', width: '100%' }}
                                        />
                                        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '4px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setShowPasswordInModal(!showPasswordInModal)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--text-muted)',
                                                    cursor: 'pointer',
                                                    padding: '5px'
                                                }}
                                                title={showPasswordInModal ? "Gizle" : "Göster"}
                                            >
                                                {showPasswordInModal ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleGenerateRandom}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--primary)',
                                                    cursor: 'pointer',
                                                    padding: '5px'
                                                }}
                                                title="Rastgele Şifre Oluştur"
                                            >
                                                <RefreshCw size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button
                                        className="btn-outline"
                                        onClick={() => setIsModalOpen(false)}
                                        style={{ flex: 1, padding: '0.75rem' }}
                                    >
                                        Vazgeç
                                    </button>
                                    <button
                                        className="btn-primary"
                                        onClick={handleSaveCredentials}
                                        style={{ flex: 2, padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                    >
                                        <CheckCircle size={18} /> Bilgileri Kaydet
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </motion.div>
    );
};

export default StudentAccounts;
