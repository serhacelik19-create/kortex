import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, TrendingUp, Search, ChevronRight, Layers, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from './api';

interface Student {
    id: number;
    name: string;
    class: string;
    progress: number;
    solvedCount: number;
}

interface ClassDetailProps {
    className: string;
    onBack: () => void;
    onSelectStudent: (id: number) => void;
}

const ClassDetail: React.FC<ClassDetailProps> = ({ className, onBack, onSelectStudent }) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const data = await api.getClassStudents(className);
                setStudents(data);
            } catch (err) {
                console.error('Sınıf öğrencileri yüklenemedi:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [className]);

    const filteredStudents = students.filter(s =>
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const avgProgress = students.length > 0
        ? Math.round(students.reduce((acc, s) => acc + s.progress, 0) / students.length)
        : 0;

    const totalSolved = students.reduce((acc, s) => acc + (s.solvedCount || 0), 0);

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="main-content"
        >
            <div style={{ marginBottom: '2.5rem' }}>
                <button onClick={onBack} className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', border: 'none', padding: 0, background: 'none', color: 'var(--text-muted)' }}>
                    <ArrowLeft size={18} /> Sınıf Listesine Dön
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                            <div style={{ width: 44, height: 44, background: 'color-mix(in srgb, var(--primary), transparent 90%)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                <Layers size={24} />
                            </div>
                            <h1 style={{ margin: 0, fontSize: '2.25rem', fontWeight: 800 }}>{className} Grubu</h1>
                        </div>
                        <p style={{ color: 'var(--text-muted)' }}>{className} sınıfına ait genel performans ve öğrenci listesi.</p>
                    </div>
                </div>
            </div>

            <div className="dashboard-grid" style={{ marginBottom: '2.5rem' }}>
                <div className="card" style={{ gridColumn: 'span 4' }}>
                    <div className="card-title"><Users size={16} /> Öğrenci Sayısı</div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, margin: '1rem 0 0.5rem' }}>{students.length}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Aktif Kayıtlı</div>
                </div>
                <div className="card" style={{ gridColumn: 'span 4' }}>
                    <div className="card-title"><TrendingUp size={16} /> Başarı Ortalaması</div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, margin: '1rem 0 0.5rem', color: 'var(--primary)' }}>%{avgProgress}</div>
                    <div className="progress-bar" style={{ height: '6px' }}>
                        <div className="progress-fill" style={{ width: `${avgProgress}%` }}></div>
                    </div>
                </div>
                <div className="card" style={{ gridColumn: 'span 4' }}>
                    <div className="card-title"><Award size={16} /> Toplam Çözülen</div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, margin: '1rem 0 0.5rem' }}>{totalSolved}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Soru Sayısı</div>
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>Sınıf Öğrencileri</h3>
                    <div className="search-container" style={{ width: '300px' }}>
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Öğrenci ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Yükleniyor...</div>
                ) : filteredStudents.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Öğrenci bulunamadı.</div>
                ) : (
                    <div className="table-responsive-wrapper" style={{ paddingBottom: '1rem' }}>
                        <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Öğrenci</th>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>İlerleme</th>
                                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Soru</th>
                                    <th style={{ padding: '1rem 1.5rem' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map((student) => (
                                    <tr key={student.id} onClick={() => onSelectStudent(student.id)} className="student-row-hover" style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: 36, height: 36, background: 'var(--primary)', color: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                                                    {(student.name || '?').charAt(0)}
                                                </div>
                                                <span style={{ fontWeight: 600 }}>{student.name}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <div style={{ width: '120px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                                                    <span>%{student.progress}</span>
                                                </div>
                                                <div className="progress-bar" style={{ height: '4px' }}>
                                                    <div className="progress-fill" style={{ width: `${student.progress}%` }}></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>{student.solvedCount || 0}</td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <ChevronRight size={18} color="var(--text-muted)" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default ClassDetail;
