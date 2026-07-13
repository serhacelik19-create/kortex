import React, { useState, useEffect } from 'react';
import { Layers, Users, TrendingUp, ChevronRight, Search, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api';
import { usePanelToast } from './components/PanelToastProvider';
import { usePanelConfirm } from './components/PanelConfirmProvider';

interface ClassData {
    name: string;
    studentCount: number;
    averageProgress: number;
    averageSolved: number;
}

interface ClassListProps {
    onSelectClass: (name: string) => void;
}

const ClassList: React.FC<ClassListProps> = ({ onSelectClass }) => {
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const [editingClass, setEditingClass] = useState<ClassData | null>(null);
    const [editedName, setEditedName] = useState('');
    const { showToast } = usePanelToast();
    const { confirm } = usePanelConfirm();

    const fetchClasses = async () => {
        setLoading(true);
        try {
            const data = await api.getClasses();
            setClasses(data);
        } catch (err) {
            console.error('Sınıf listesi yüklenemedi:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClasses();
    }, []);

    const handleAddClass = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClassName.trim()) return;
        try {
            await api.createClass({ name: newClassName });
            setShowAddModal(false);
            setNewClassName('');
            fetchClasses();
            showToast({ type: 'success', title: 'Sınıf Oluşturuldu', message: `${newClassName} grubu başarıyla eklendi.` });
        } catch (err) {
            showToast({ type: 'error', title: 'Hata', message: 'Sınıf eklenirken bir sorun oluştu. Bu sınıf zaten olabilir.' });
        }
    };

    const handleUpdateClass = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editedName.trim() || !editingClass) return;
        try {
            await api.updateClass(editingClass.name, { newName: editedName });
            setEditingClass(null);
            fetchClasses();
            showToast({ type: 'success', title: 'Güncellendi', message: 'Sınıf adı başarıyla değiştirildi.' });
        } catch (err) {
            showToast({ type: 'error', title: 'Hata', message: 'Sınıf güncellenemedi veya bu isimde başka bir sınıf var.' });
        }
    };

    const handleDeleteClass = async (className: string) => {
        if (await confirm({
            title: 'Sınıf silinsin mi?',
            message: `${className} grubunu silersen bu sınıftaki öğrencilerin sınıf bilgisi temizlenecek.`,
            confirmLabel: 'Sil',
            cancelLabel: 'Vazgeç',
            tone: 'danger',
        })) {
            try {
                await api.deleteClass(className);
                fetchClasses();
                showToast({ type: 'success', title: 'Silindi', message: 'Sınıf başarıyla kaldırıldı.' });
            } catch (err) {
                showToast({ type: 'error', title: 'Hata', message: 'Silme işlemi başarısız oldu.' });
            }
        }
    };

    const filteredClasses = classes.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="main-content">
            <div className="page-header">
                <div>
                    <h1 style={{ margin: 0 }}>Sınıf Yönetimi</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        Kurumdaki toplam {classes.length} aktif sınıf grubu.
                    </p>
                </div>
                <div className="page-header-actions">
                    <div className="search-container">
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Sınıf ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '42px', padding: '0 1.25rem' }}>
                        <Plus size={18} /> Sınıf Ekle
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: '5rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Sınıflar yükleniyor...</div>
                </div>
            ) : filteredClasses.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
                    <Layers size={48} style={{ marginBottom: '1.5rem', opacity: 0.3 }} />
                    <h3 style={{ color: 'var(--text-main)' }}>Sınıf Bulunmuyor</h3>
                    <p>Henüz herhangi bir sınıf grubu mevcut değil.</p>
                    <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ marginTop: '1.5rem' }}>
                        İlk Sınıfı Oluştur
                    </button>
                </div>
            ) : (
                <div className="dashboard-grid">
                    {filteredClasses.map((classItem, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="card card-hover"
                            style={{ gridColumn: 'span 4', cursor: 'pointer' }}
                            onClick={() => onSelectClass(classItem.name)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <div style={{ width: 48, height: 48, background: 'color-mix(in srgb, var(--primary), transparent 90%)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                    <Layers size={24} />
                                </div>
                                <div className="badge badge-info" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>Aktif</div>
                            </div>

                            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.4rem', fontWeight: 700 }}>{classItem.name}</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '10px' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Öğrenci Sayısı</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 600 }}>
                                        <Users size={16} color="var(--primary)" /> {classItem.studentCount}
                                    </div>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '10px' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Ort. Soru</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 600 }}>
                                        <TrendingUp size={16} color="var(--accent-success)" /> {Math.round(classItem.averageSolved)}
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Sınıf Başarı Ortalaması</span>
                                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>%{Math.round(classItem.averageProgress)}</span>
                                </div>
                                <div className="progress-container">
                                    <div className="progress-bar" style={{ height: '8px' }}>
                                        <div className="progress-fill" style={{ width: `${classItem.averageProgress}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                <button
                                    className="btn-outline"
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '10px' }}
                                    onClick={(e) => { e.stopPropagation(); onSelectClass(classItem.name); }}
                                >
                                    Detay <ChevronRight size={16} />
                                </button>
                                <button
                                    className="btn-outline"
                                    style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingClass(classItem);
                                        setEditedName(classItem.name);
                                    }}
                                >
                                    Düzenle
                                </button>
                                <button
                                    className="btn-outline"
                                    style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                    onClick={(e) => { e.stopPropagation(); handleDeleteClass(classItem.name); }}
                                >
                                    Sil
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Add Class Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
                        <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="modal-content-card">
                            <div className="modal-header">
                                <h2>Yeni Sınıf Oluştur</h2>
                                <button className="modal-close" onClick={() => setShowAddModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleAddClass} className="form-body">
                                <div className="form-group">
                                    <label>Sınıf Adı</label>
                                    <input
                                        type="text"
                                        required
                                        value={newClassName}
                                        onChange={e => setNewClassName(e.target.value)}
                                        placeholder="Örn: 12-B, Mezun Sayısal vb."
                                        autoFocus
                                    />
                                </div>
                                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn-outline" onClick={() => setShowAddModal(false)} style={{ flex: 1 }}>
                                        Vazgeç
                                    </button>
                                    <button type="submit" className="btn-primary" style={{ flex: 1.5 }}>
                                        Sınıfı Kaydet
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Edit Class Modal */}
            <AnimatePresence>
                {editingClass && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
                        <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="modal-content-card">
                            <div className="modal-header">
                                <h2>Sınıf Düzenle</h2>
                                <button className="modal-close" onClick={() => setEditingClass(null)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleUpdateClass} className="form-body">
                                <div className="form-group">
                                    <label>Yeni Sınıf Adı</label>
                                    <input
                                        type="text"
                                        required
                                        value={editedName}
                                        onChange={e => setEditedName(e.target.value)}
                                        autoFocus
                                    />
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                        Not: Sınıf adını değiştirmek bu sınıfa kayıtlı tüm öğrencileri de otomatik olarak günceller.
                                    </p>
                                </div>
                                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn-outline" onClick={() => setEditingClass(null)} style={{ flex: 1 }}>
                                        Vazgeç
                                    </button>
                                    <button type="submit" className="btn-primary" style={{ flex: 1.5 }}>
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

export default ClassList;
