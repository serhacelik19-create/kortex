import React, { useState, useEffect } from 'react';
import {
    Search,
    ChevronRight,
    Users,
    UserPlus,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api';
import { usePanelToast } from './components/PanelToastProvider';
import { usePanelConfirm } from './components/PanelConfirmProvider';

interface Student {
    id: number;
    name: string;
    class: string;
    target: string;
    progress: number;
    trend: 'up' | 'down' | 'stable';
    solved_count: number;
    lastSeen: string;
}

interface StudentListProps {
    onSelectStudent: (id: number) => void;
}

const StudentList: React.FC<StudentListProps> = ({ onSelectStudent }) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [classes, setClasses] = useState<{ name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [newStudent, setNewStudent] = useState({ name: '', class: '', username: '', password: '', parentName: '', parentPhone: '', totalContractAmount: 0, downPayment: 0, discountAmount: 0 });
    const [editingStudent, setEditingStudent] = useState<any>(null);
    const { showToast } = usePanelToast();
    const { confirm } = usePanelConfirm();

    const fetchStudents = async () => {
        setLoading(true);
        try {
            const [studentData, classData] = await Promise.all([
                api.getStudents(),
                api.getClasses()
            ]);
            setStudents(studentData);
            setClasses(classData);
        } catch (err) {
            console.error('Veriler yüklenemedi:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, []);

    const handleAddStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const created = await api.createStudent(newStudent);
            setShowAddModal(false);
            setNewStudent({ name: '', class: '', username: '', password: '', parentName: '', parentPhone: '', totalContractAmount: 0, downPayment: 0, discountAmount: 0 });
            fetchStudents();
            const loginInfo = created?.generatedUsername ? ` Kullanıcı adı: ${created.generatedUsername}` : '';
            showToast({ type: 'success', title: 'Öğrenci Kaydedildi', message: `${newStudent.name} başarıyla veritabanına eklendi.${loginInfo}` });
        } catch (err) {
            showToast({ type: 'error', title: 'İşlem Başarısız', message: 'Öğrenci eklenirken teknik bir hata oluştu.' });
        }
    };

    const handleUpdateStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.updateStudent(editingStudent.id, editingStudent);
            setEditingStudent(null);
            fetchStudents();
            showToast({ type: 'success', title: 'Güncellendi', message: 'Öğrenci bilgileri başarıyla güncellendi.' });
        } catch (err) {
            showToast({ type: 'error', title: 'Hata', message: 'Güncelleme sırasında bir sorun oluştu.' });
        }
    };

    const handleDeleteStudent = async (id: number, name: string) => {
        if (await confirm({
            title: 'Öğrenci silinsin mi?',
            message: `${name} isimli öğrenciyi silmek üzeresin. Bu işlem geri alınamaz.`,
            confirmLabel: 'Sil',
            cancelLabel: 'Vazgeç',
            tone: 'danger',
        })) {
            try {
                await api.deleteStudent(id);
                fetchStudents();
                showToast({ type: 'success', title: 'Silindi', message: 'Öğrenci kaydı başarıyla silindi.' });
            } catch (err) {
                showToast({ type: 'error', title: 'Hata', message: 'Silme işlemi başarısız oldu.' });
            }
        }
    };

    const filteredStudents = students.filter(s =>
        (s.name || '').toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR')) ||
        (s.class || '').toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'))
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="main-content">
            <div className="page-header">
                <div>
                    <h1 style={{ margin: 0 }}>Öğrenci Listesi</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        Kurumdaki toplam {students.length} kayıtlı öğrenci.
                    </p>
                </div>
                <div className="page-header-actions">
                    <div className="search-container">
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Öğrenci veya sınıf ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '42px', padding: '0 1.25rem' }}>
                        <UserPlus size={18} /> Yeni Öğrenci
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: '5rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Öğrenciler yükleniyor...</div>
                </div>
            ) : filteredStudents.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
                    <Users size={48} style={{ marginBottom: '1.5rem', opacity: 0.3 }} />
                    <h3 style={{ color: 'var(--text-main)' }}>Öğrenci Bulunamadı</h3>
                    <p>{searchTerm ? 'Aramanızla eşleşen öğrenci yok.' : 'Henüz hiç öğrenci kaydı yapılmamış.'}</p>
                    {!searchTerm && (
                        <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ marginTop: '1.5rem' }}>
                            İlk Öğrenciyi Ekle
                        </button>
                    )}
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(248, 250, 252, 0.5)' }}>
                                <th style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Öğrenci Bilgisi</th>
                                <th style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sınıf / Hedef</th>
                                <th style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>İlerleme</th>
                                <th style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Soru</th>
                                <th style={{ padding: '1.25rem 1.5rem' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map((student) => (
                                <tr key={student.id} onClick={() => onSelectStudent(student.id)} className="student-row-hover" style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}>
                                    <td style={{ padding: '1.25rem 1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, var(--primary), #a855f7)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '1.1rem' }}>
                                                {(student.name || '?').charAt(0)}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{student.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lise Öğrencisi</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1.25rem 1.5rem' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>{student.class}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{student.target || 'Hedef Belirlenmedi'}</div>
                                    </td>
                                    <td style={{ padding: '1.25rem 1.5rem' }}>
                                        <div style={{ width: '100%', maxWidth: 140 }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px', fontWeight: 600 }}>
                                                <span>%{student.progress}</span>
                                            </div>
                                            <div className="progress-bar" style={{ height: '6px' }}>
                                                <div className="progress-fill" style={{ width: `${student.progress}%` }}></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1.25rem 1.5rem' }}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{student.solved_count}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Toplam</div>
                                    </td>
                                    <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn-outline"
                                                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingStudent({
                                                        id: student.id,
                                                        name: student.name,
                                                        class: student.class,
                                                        username: (student as any).username || '',
                                                        password: (student as any).password || '',
                                                        progress: student.progress,
                                                        target: student.target,
                                                        parentName: (student as any).parentName || '',
                                                        parentPhone: (student as any).parentPhone || '',
                                                        totalContractAmount: (student as any).totalContractAmount || 0,
                                                        downPayment: (student as any).downPayment || 0,
                                                        discountAmount: (student as any).discountAmount || 0
                                                    });
                                                }}
                                            >
                                                Düzenle
                                            </button>
                                            <button
                                                className="btn-outline"
                                                style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteStudent(student.id, student.name);
                                                }}
                                            >
                                                Sil
                                            </button>
                                            <div style={{ background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <ChevronRight size={18} color="var(--text-muted)" />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add Student Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
                        <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="modal-content-card">
                            <div className="modal-header">
                                <h2>Yeni Öğrenci Ekle</h2>
                                <button className="modal-close" onClick={() => setShowAddModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleAddStudent} className="form-body">
                                <div className="form-group">
                                    <label>Ad Soyad</label>
                                    <input
                                        type="text"
                                        required
                                        value={newStudent.name}
                                        onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                                        placeholder="Örn: Caner Şahin"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Sınıf</label>
                                    <div className="form-select-container">
                                        <select
                                            required
                                            value={newStudent.class}
                                            onChange={e => setNewStudent({ ...newStudent, class: e.target.value })}
                                        >
                                            <option value="">Sınıf Seçin...</option>
                                            {classes.map((c, i) => (
                                                <option key={i} value={c.name}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {classes.length === 0 && (
                                        <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.4rem' }}>
                                            * Henüz tanımlanmış bir sınıf yok. Lütfen önce "Sınıflar" sayfasından sınıf ekleyin.
                                        </div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label>Veli Ad Soyad</label>
                                    <input
                                        type="text"
                                        value={newStudent.parentName}
                                        onChange={e => setNewStudent({ ...newStudent, parentName: e.target.value })}
                                        placeholder="Örn: Mehmet Şahin"
                                    />
                                </div>
                                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label>Toplam Sözleşme (TL)</label>
                                        <input
                                            type="number"
                                            value={newStudent.totalContractAmount || ''}
                                            onChange={e => setNewStudent({ ...newStudent, totalContractAmount: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div>
                                        <label>Peşinat (TL)</label>
                                        <input
                                            type="number"
                                            value={newStudent.downPayment || ''}
                                            onChange={e => setNewStudent({ ...newStudent, downPayment: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>İndirim Tutarı (TL)</label>
                                    <input
                                        type="number"
                                        value={newStudent.discountAmount || ''}
                                        onChange={e => setNewStudent({ ...newStudent, discountAmount: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>

                                <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn-outline" onClick={() => setShowAddModal(false)} style={{ flex: 1 }}>
                                        Vazgeç
                                    </button>
                                    <button type="submit" className="btn-primary" style={{ flex: 1.5 }}>
                                        Öğrenciyi Kaydet
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit Student Modal */}
            <AnimatePresence>
                {editingStudent && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
                        <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="modal-content-card">
                            <div className="modal-header">
                                <h2>Öğrenci Düzenle</h2>
                                <button className="modal-close" onClick={() => setEditingStudent(null)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleUpdateStudent} className="form-body">
                                <div className="form-group">
                                    <label>Ad Soyad</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingStudent.name}
                                        onChange={e => setEditingStudent({ ...editingStudent, name: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Sınıf</label>
                                    <div className="form-select-container">
                                        <select
                                            required
                                            value={editingStudent.class}
                                            onChange={e => setEditingStudent({ ...editingStudent, class: e.target.value })}
                                        >
                                            <option value="">Sınıf Seçin...</option>
                                            {classes.map((c, i) => (
                                                <option key={i} value={c.name}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Hedef</label>
                                    <input
                                        type="text"
                                        value={editingStudent.target}
                                        onChange={e => setEditingStudent({ ...editingStudent, target: e.target.value })}
                                        placeholder="Örn: Tıp Fakültesi"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Veli Ad Soyad</label>
                                    <input
                                        type="text"
                                        value={editingStudent.parentName}
                                        onChange={e => setEditingStudent({ ...editingStudent, parentName: e.target.value })}
                                    />
                                </div>
                                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label>Toplam Sözleşme (TL)</label>
                                        <input
                                            type="number"
                                            value={editingStudent.totalContractAmount || ''}
                                            onChange={e => setEditingStudent({ ...editingStudent, totalContractAmount: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div>
                                        <label>Peşinat (TL)</label>
                                        <input
                                            type="number"
                                            value={editingStudent.downPayment || ''}
                                            onChange={e => setEditingStudent({ ...editingStudent, downPayment: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>İndirim Tutarı (TL)</label>
                                    <input
                                        type="number"
                                        value={editingStudent.discountAmount || ''}
                                        onChange={e => setEditingStudent({ ...editingStudent, discountAmount: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn-outline" onClick={() => setEditingStudent(null)} style={{ flex: 1 }}>
                                        Vazgeç
                                    </button>
                                    <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                                        Değişiklikleri Kaydet
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default StudentList;
