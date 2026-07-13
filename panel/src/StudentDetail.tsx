import React, { useState, useEffect, useRef } from 'react';
import {
    Target,
    Zap,
    Brain,
    AlertTriangle,
    MessageSquareQuote,
    BarChart3,
    TrendingUp,
    TrendingDown,
    ArrowLeft,
    LineChart as LineChartIcon,
    ClipboardList,
    Calculator,
    Book,
    BookOpen,
    Microscope,
    Globe,
    Landmark,
    CheckCircle2,
    Calendar,
    XCircle,
    Clock,
    Coffee,
    FileText,
    Search,
    ArrowUpDown,
    ChevronDown,
    RefreshCw,
    Sparkles,
    Pencil,
    Trash2,
    X,
    Filter,
    Ruler,
    Heart,
    PenTool,
    Globe2,
    BookMarked,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

import {
    ResponsiveContainer,
    PieChart, Pie, Cell, Tooltip as RechartsTooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Tooltip
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api';
import { usePanelToast } from './components/PanelToastProvider';
import { usePanelConfirm } from './components/PanelConfirmProvider';

const isTYT = (c: any) => (typeof c === 'string' ? c.includes('TYT') : c.examType === 'TYT');
const isAYT = (c: any) => (typeof c === 'string' ? c.includes('AYT') : c.examType === 'AYT');

const formatAssignedStatus = (status: string) => {
    switch (status) {
        case 'completed':
            return { label: 'Tamamlandı', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
        case 'opened':
        case 'in_progress':
            return { label: 'Devam Ediyor', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
        case 'pending':
        default:
            return { label: 'Bekliyor', color: '#475569', bg: '#f8fafc', border: '#e2e8f0' };
    }
};

const subjectIcons: Record<string, any> = {
    'Matematik': { icon: Calculator, color: '#3b82f6', bg: '#eff6ff', border: '#dbeafe' },
    'Geometri': { icon: Ruler, color: '#3b82f6', bg: '#eff6ff', border: '#dbeafe' },
    'Fizik': { icon: Zap, color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
    'Kimya': { icon: Microscope, color: '#10b981', bg: '#ecfdf5', border: '#bbf7d0' },
    'Biyoloji': { icon: Heart, color: '#ec4899', bg: '#fdf2f8', border: '#fbcfe8' },
    'Türkçe': { icon: Book, color: '#f59e0b', bg: '#fffbeb', border: '#fef3c7' },
    'Edebiyat': { icon: PenTool, color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
    'Tarih': { icon: Landmark, color: '#78350f', bg: '#fef3c7', border: '#fde68a' },
    'Coğrafya': { icon: Globe2, color: '#0ea5e9', bg: '#f0f9ff', border: '#e0f2fe' },
    'Felsefe': { icon: Brain, color: '#a855f7', bg: '#f3e8ff', border: '#e9d5ff' },
    'Din Kültürü': { icon: BookOpen, color: '#10b981', bg: '#ecfdf5', border: '#bbf7d0' },
};

const YKS_CURRICULUM: Record<string, Record<string, string[]>> = {
    'TYT': {
        'Matematik': ['Temel Kavramlar', 'Sayı Basamakları', 'Bölme ve Bölünebilme', 'EBOB-EKOK', 'Rasyonel Sayılar', 'Basit Eşitsizlikler', 'Mutlak Değer', 'Üslü Sayılar', 'Köklü Sayılar', 'Çarpanlara Ayırma', 'Oran-Orantı', 'Denklem Çözme', 'Problemler', 'Kümeler', 'Fonksiyonlar', 'Permütasyon-Kombinasyon', 'Binom-Olasılık', 'İstatistik', 'Polinomlar', '2. Dereceden Denklemler'],
        'Geometri': ['Doğruda Açılar', 'Üçgende Açılar', 'Dik Üçgen', 'İkizkenar ve Eşkenar Üçgen', 'Üçgende Alan', 'Üçgende Benzerlik', 'Açıortay-Kenarortay', 'Çokgenler', 'Dörtgenler', 'Yamuk', 'Paralelkenar', 'Eşkenar Dörtgen', 'Dikdörtgen-Kare', 'Deltoid', 'Çember ve Daire', 'Analitik Geometri', 'Katı Cisimler'],
        'Türkçe': ['Sözcükte Anlam', 'Cümlede Anlam', 'Paragrafta Anlam', 'Ses Bilgisi', 'Yazım Kuralları', 'Noktalama İşaretleri', 'Sözcükte Yapı', 'İsimler', 'Sıfatlar', 'Zamirler', 'Zarflar', 'Edat-Bağlaç-Ünlem', 'Fiiller', 'Ek Fiil', 'Fiilimsi', 'Cümlenin Öğeleri', 'Cümle Türleri', 'Anlatım Bozuklukları'],
        'Fizik': ['Fizik Bilimine Giriş', 'Madde ve Özellikleri', 'Hareket ve Kuvvet', 'Enerji', 'Isı ve Sıcaklık', 'Elektrostatik', 'Elektrik ve Manyetik', 'Basınç', 'Kaldırma Kuvveti', 'Dalgalar', 'Optik'],
        'Kimya': ['Kimya Bilimi', 'Atom ve Periyodik Sistem', 'Kimyasal Türler Arası Etkileşimler', 'Maddenin Halleri', 'Doğa ve Kimya', 'Kimyanın Temel Kanunları', 'Mol Kavramı', 'Tepkime Türleri', 'Karışımlar', 'Asitler, Bazlar ve Tuzlar', 'Kimya Her Yerde'],
        'Biyoloji': ['Canlıların Ortak Özellikleri', 'Canlıların Yapısında Bulunan Temel Bileşikler', 'Hücre', 'Canlılar Dünyası', 'Hücre Bölünmeleri', 'Kalıtım', 'Ekosistem Ekolojisi', 'Güncel Çevre Sorunları'],
        'Tarih': ['Tarih ve Zaman', 'İnsanlığın İlk Dönemleri', 'Orta Çağ’da Dünya', 'İlk ve Orta Çağlarda Türk Dünyası', 'İslam Medeniyetinin Doğuşu', 'Türklerin İslamiyet’i Kabulü ve İlk Türk İslam Devletleri', 'Yerleşme ve Yapılaşma', 'Beylikten Devlete', 'Dünya Gücü Osmanlı', 'Osmanlı’da Değişim', 'Milli Mücadele'],
        'Coğrafya': ['Doğa ve İnsan', 'Dünya’nın Şekli ve Hareketleri', 'Yer ve Zaman', 'Harita Bilgisi', 'Atmosfer ve İklim', 'Yer’in Şekillenmesi', 'İç ve Dış Kuvvetler', 'Su, Toprak ve Bitki', 'Beşeri Sistemler', 'Bölge Kavramı', 'Afetler'],
        'Felsefe': ['Felsefe’yi Tanıma', 'Felsefe ile Düşünme', 'Varlık Felsefesi', 'Bilgi Felsefesi', 'Bilim Felsefesi', 'Ahlak Felsefesi', 'Din Felsefesi', 'Siyaset Felsefesi', 'Sanat Felsefesi'],
        'Din Kültürü': ['Bilgi ve İnanç', 'İbadet', 'Ahlak ve Değerler', 'Hz. Muhammed ve Gençlik', 'Din ve Hayat', 'İslam ve Bilim']
    },
    'AYT': {
        'Matematik': ['Polinomlar', '2. Dereceden Denklemler', 'Karmaşık Sayılar', 'Eşitsizlikler', 'Parabol', 'Trigonometri', 'Logaritma', 'Diziler', 'Limit', 'Türev', 'İntegral'],
        'Geometri': ['Noktanın Analitiği', 'Doğrunun Analitiği', 'Çemberin Analitiği', 'Dönüşüm Geometrisi', 'Katı Cisimler'],
        'Fizik': ['Vektörler', 'Bağıl Hareket', 'Newton’un Hareket Yasaları', 'Bir Boyutta Sabit İvmeli Hareket', 'İki Boyutta Hareket', 'Enerji ve Hareket', 'İtme ve Çizgisel Momentum', 'Tork ve Denge', 'Basit Makineler', 'Elektriksel Kuvvet ve Alan', 'Elektriksel Potansiyel', 'Düzgün Manyetik Alan', 'Elektromanyetik İndüksiyon', 'Alternatif Akım', 'Transformatörler', 'Çembersel Hareket', 'Basit Harmonik Hareket', 'Dalga Mekaniği', 'Atom Fiziğine Giriş', 'Modern Fizik'],
        'Kimya': ['Modern Atom Teorisi', 'Gazlar', 'Sıvı Çözeltiler ve Çözünürlük', 'Kimyasal Tepkimelerde Enerji', 'Kimyasal Tepkimelerde Hız', 'Kimyasal Tepkimelerde Denge', 'Sulu Çözelti Dengeleri', 'Kimya ve Elektrik', 'Karbon Kimyasına Giriş', 'Organik Bileşikler', 'Enerji Kaynakları ve Bilimsel Gelişmeler'],
        'Biyoloji': ['Denetleyici ve Düzenleyici Sistemler', 'Duyu Organları', 'Destek ve Hareket Sistemi', 'Sindirim Sistemi', 'Dolaşım ve Bağışıklık Sistemi', 'Solunum Sistemi', 'Boşaltım Sistemi', 'Üreme Sistemi ve Embriyonik Gelişim', 'Komünite ve Popülasyon Ekolojisi', 'Nükleik Asitler', 'Genetik Şifre ve Protein Sentezi', 'Canlılarda Enerji Dönüşümleri', 'Bitki Biyolojisi', 'Canlılar ve Çevre'],
        'Edebiyat': ['Güzel Sanatlar ve Edebiyat', 'Coşku ve Heyecanı Dile Getiren Metinler (Şiir)', 'Olay Çevresinde Oluşan Edebi Metinler', 'Batı Tesirindeki Türk Edebiyatı', 'Edebi Sanatlar', 'İslamiyet Öncesi Türk Edebiyatı', 'Geçiş Dönemi Türk Edebiyatı', 'Halk Edebiyatı', 'Divan Edebiyatı', 'Tanzimat Edebiyatı', 'Servet-i Fünun Edebiyatı', 'Fecr-i Ati Edebiyatı', 'Milli Edebiyat', 'Cumhuriyet Dönemi Türk Edebiyatı'],
        'Tarih': ['20. Yüzyıl Başlarında Osmanlı Devleti', 'Milli Mücadele Dönemi', 'Atatürkçülük ve Atatürk İlkeleri', 'İki Savaş Arasındaki Dönem', 'İkinci Dünya Savaşı', 'Soğuk Savaş Dönemi', 'Yumuşama Dönemi ve Sonrası', 'Küreselleşen Dünya'],
        'Coğrafya': ['Ekosistemlerin İşleyişi', 'Beşeri Sistemler', 'Mekansal Bir Sentez: Türkiye', 'Küresel Ortam: Bölgeler ve Ülkeler', 'Çevre ve Toplum', 'Ekonomik Faaliyetler']
    }
};

const getSubjectMeta = (subject: string) => {
    const baseSubject = subject.split('(')[0].trim();
    return subjectIcons[baseSubject] || subjectIcons[subject] || { icon: ClipboardList, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
};

const formatDateTime = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const classProgressWeekDays = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

const getClassProgressWeekStart = (date = new Date()) => {
    const next = new Date(date);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
    next.setHours(0, 0, 0, 0);
    return next;
};

const addClassProgressDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const isSameClassProgressDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

const formatClassProgressDate = (date: Date) =>
    date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

const getClassProgressStatusTone = (status?: string) => {
    const isInProgress = status === 'ISLENIYOR';
    return {
        label: isInProgress ? 'İşleniyor' : 'Bitti',
        bg: isInProgress ? '#fffbeb' : '#ecfdf5',
        color: isInProgress ? '#b45309' : '#047857',
        border: isInProgress ? '#fde68a' : '#a7f3d0'
    };
};

const formatDurationLabel = (seconds?: number | null) => {
    const safe = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    if (hours > 0) return `${hours} sa ${minutes} dk`;
    return `${minutes} dk`;
};

// ==================== MODAL COMPONENT (ZORLANILAN KONULAR) ====================
const HardTopicsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    student: any;
    selectedCourse: string;
    onSelectCourse: (course: string) => void;
}> = ({ isOpen, onClose, student, selectedCourse, onSelectCourse }) => {
    React.useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '2rem'
        }} onClick={onClose}>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.2 }}
                    style={{
                        background: 'white',
                        borderRadius: '24px',
                        width: '100%',
                        maxWidth: '900px',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        overflow: 'hidden'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <style>{`
                        .custom-scrollbar::-webkit-scrollbar {
                            height: 6px;
                        }
                        .custom-scrollbar::-webkit-scrollbar-track {
                            background: #f1f5f9;
                            border-radius: 4px;
                        }
                        .custom-scrollbar::-webkit-scrollbar-thumb {
                            background: #cbd5e1;
                            border-radius: 4px;
                        }
                        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                            background: #94a3b8;
                        }
                    `}</style>
                    <div style={{
                        padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-color)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: '#f8fafc'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: '#fee2e2', padding: '0.6rem', borderRadius: '12px' }}>
                                <AlertTriangle size={22} color="var(--accent-danger)" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>Zorlanılan Tüm Konular (Tam Liste)</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Öğrencinin yapay zekaya en çok sorduğu soruların konu dağılımı</p>
                            </div>
                        </div>
                        <button onClick={onClose} style={{
                            background: 'white', border: '1px solid #e2e8f0', width: 36, height: 36,
                            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: '#64748b', transition: 'all 0.2s'
                        }}>
                            <XCircle size={18} />
                        </button>
                    </div>

                    {/* Filter Bar */}
                    <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                        <div className="custom-scrollbar" style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                            {(() => {
                                const courses = new Set<string>();
                                student.questionAnalyses?.forEach((qa: any) => { if (qa.course) courses.add(qa.course); });
                                const courseList = ['Hepsi', ...Array.from(courses)];

                                return courseList.map(course => {
                                    const isActive = selectedCourse === course;
                                    const count = course === 'Hepsi'
                                        ? new Set(student.questionAnalyses?.map((qa: any) => qa.topic)).size
                                        : new Set(student.questionAnalyses?.filter((qa: any) => qa.course === course).map((qa: any) => qa.topic)).size;

                                    return (
                                        <button
                                            key={course}
                                            onClick={() => onSelectCourse(course)}
                                            style={{
                                                whiteSpace: 'nowrap', padding: '0.5rem 1rem', borderRadius: '30px',
                                                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                                                background: isActive ? 'var(--primary)' : '#f8fafc',
                                                color: isActive ? 'white' : '#64748b',
                                                border: `1px solid ${isActive ? 'var(--primary)' : '#e2e8f0'}`,
                                                display: 'flex', alignItems: 'center', gap: '0.5rem'
                                            }}
                                        >
                                            {course}
                                            <span style={{
                                                background: isActive ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                                                padding: '0.1rem 0.5rem', borderRadius: '10px', fontSize: '0.7rem'
                                            }}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    {/* Content Body */}
                    <div style={{ padding: '2rem', overflowY: 'auto', background: 'white', flex: 1 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                            {(() => {
                                const grouped: Record<string, { topic: string, course: string, count: number }> = {};
                                student.questionAnalyses?.forEach((qa: any) => {
                                    if (qa.topic && (selectedCourse === 'Hepsi' || qa.course === selectedCourse)) {
                                        const key = `${qa.course || 'Genel'}-${qa.topic}`;
                                        if (!grouped[key]) {
                                            grouped[key] = { topic: qa.topic, course: qa.course || 'Genel', count: 0 };
                                        }
                                        grouped[key].count++;
                                    }
                                });
                                const sorted = Object.values(grouped).sort((a, b) => b.count - a.count);

                                if (sorted.length === 0) return <p style={{ gridColumn: 'span 100%', textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>Seçili derse ait soru verisi bulunmuyor.</p>;

                                return sorted.map((item, idx) => (
                                    <div key={idx} style={{
                                        background: '#f8fafc', padding: '1rem', borderRadius: '16px',
                                        border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {item.course}
                                            </span>
                                            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>{item.topic}</span>
                                        </div>
                                        <span style={{
                                            background: '#fee2e2', color: '#dc2626', fontWeight: 800, fontSize: '0.85rem',
                                            padding: '0.4rem 0.8rem', borderRadius: '10px'
                                        }}>{String(item.count)} Soru</span>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

// ==================== CURRICULUM DETAIL COMPONENT ====================
const CurriculumDetail: React.FC<{ curriculum: any }> = ({ curriculum }) => {
    const [openCourses, setOpenCourses] = React.useState<Set<string>>(new Set());

    const toggleCourse = (id: string) => {
        setOpenCourses(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const renderCourseCard = (c: any, accentColor: string) => {
        const isOpen = openCourses.has(c.courseId);
        return (
            <div key={c.courseId} style={{ border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden', marginBottom: '0.75rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                {/* Course Header */}
                <div
                    onClick={() => toggleCourse(c.courseId)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '1rem',
                        padding: '1rem 1.25rem', cursor: 'pointer', background: isOpen ? '#f8fafc' : 'white',
                        transition: 'background 0.2s', userSelect: 'none'
                    }}
                >
                    <span style={{ fontSize: '1.5rem' }}>{c.icon}</span>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>{c.courseName}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.8rem', color: c.progress === 100 ? '#10b981' : 'var(--text-muted)', fontWeight: 700 }}>
                                    {c.completedLeaves}/{c.totalLeaves} konu
                                </span>
                                <span style={{
                                    fontSize: '0.75rem', fontWeight: 800, padding: '0.2rem 0.6rem',
                                    borderRadius: '8px', background: c.progress === 100 ? '#dcfce7' : `${accentColor}15`,
                                    color: c.progress === 100 ? '#16a34a' : accentColor
                                }}>%{c.progress}</span>
                            </div>
                        </div>
                        <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '5px', overflow: 'hidden' }}>
                            <div style={{ width: `${c.progress}%`, height: '100%', background: c.progress === 100 ? '#10b981' : accentColor, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                        </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '1rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                </div>

                {/* Topics (Accordion Body) */}
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            style={{ overflow: 'hidden', borderTop: '1px solid var(--border-color)', background: '#fafbfc' }}
                        >
                            <div style={{ padding: '1rem 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {c.topics?.map((topic: any) => {
                                    // Topic has subtopics
                                    if (topic.subTopics && topic.subTopics.length > 0) {
                                        const done = topic.subTopics.filter((s: any) => s.isCompleted).length;
                                        const total = topic.subTopics.length;
                                        return (
                                            <div key={topic.id}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>{topic.name}</span>
                                                    <span style={{ fontSize: '0.72rem', background: done === total && total > 0 ? '#dcfce7' : '#f1f5f9', color: done === total && total > 0 ? '#16a34a' : '#64748b', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                                                        {done}/{total}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.4rem' }}>
                                                    {topic.subTopics.map((sub: any) => (
                                                        <div key={sub.id} style={{
                                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                            padding: '0.4rem 0.65rem', borderRadius: '8px',
                                                            background: sub.isCompleted ? '#f0fdf4' : 'white',
                                                            border: `1px solid ${sub.isCompleted ? '#bbf7d0' : '#e2e8f0'}`
                                                        }}>
                                                            <span style={{ fontSize: '0.9rem', flexShrink: 0, color: sub.isCompleted ? '#16a34a' : '#cbd5e1' }}>
                                                                {sub.isCompleted ? '✓' : '○'}
                                                            </span>
                                                            <span style={{ fontSize: '0.78rem', color: sub.isCompleted ? '#166534' : '#475569', fontWeight: sub.isCompleted ? 600 : 400 }}>
                                                                {sub.name}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    // Leaf topic (no subtopics)
                                    return (
                                        <div key={topic.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.6rem',
                                            padding: '0.5rem 0.75rem', borderRadius: '8px',
                                            background: topic.isCompleted ? '#f0fdf4' : 'white',
                                            border: `1px solid ${topic.isCompleted ? '#bbf7d0' : '#e2e8f0'}`
                                        }}>
                                            <span style={{ fontSize: '1rem', color: topic.isCompleted ? '#16a34a' : '#cbd5e1' }}>
                                                {topic.isCompleted ? '✓' : '○'}
                                            </span>
                                            <span style={{ fontSize: '0.85rem', color: topic.isCompleted ? '#166534' : '#475569', fontWeight: topic.isCompleted ? 600 : 400 }}>
                                                {topic.name}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    return (
        <div>
            {/* Genel Özet */}
            <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, var(--primary)15, #a855f715)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ minWidth: 80, height: 80, borderRadius: '50%', background: 'white', boxShadow: '0 4px 12px rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>{curriculum.overallProgress}%</span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b' }}>Genel Müfredat İlerlemesi</span>
                            <span style={{ background: 'var(--primary)20', color: 'var(--primary)', padding: '0.2rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>{curriculum.branch}</span>
                        </div>
                        <div style={{ background: '#e2e8f0', borderRadius: '8px', height: '10px', overflow: 'hidden', marginBottom: '0.4rem' }}>
                            <div style={{ width: `${curriculum.overallProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), #a855f7)', borderRadius: '8px', transition: 'width 0.8s ease' }} />
                        </div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {curriculum.completedLeaves} / {curriculum.totalLeaves} konu tamamlandı — Derslere tıklayarak konuları görebilirsiniz
                        </span>
                    </div>
                </div>
            </div>

            {/* TYT */}
            {curriculum.courses?.some((c: any) => isTYT(c)) && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-title" style={{ marginBottom: '1rem', color: 'var(--primary)' }}><BookOpen size={16} /> TYT Dersleri</div>
                    {curriculum.courses.filter(isTYT).map((c: any) => renderCourseCard(c, 'var(--primary)'))}
                </div>
            )}

            {/* AYT */}
            {curriculum.courses?.some((c: any) => isAYT(c)) && (
                <div className="card">
                    <div className="card-title" style={{ marginBottom: '1rem', color: '#a855f7' }}><BookOpen size={16} /> AYT Dersleri ({curriculum.branch})</div>
                    {curriculum.courses.filter(isAYT).map((c: any) => renderCourseCard(c, '#a855f7'))}
                </div>
            )}
        </div>
    );
};

const SubjectCard = ({ label, value, correct, wrong, icon: Icon, color }: any) => (
    <div style={{
        background: 'white',
        border: `1px solid ${color}20`,
        borderRadius: '12px',
        padding: '0.8rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        transition: 'transform 0.2s',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ background: `${color}15`, padding: '0.4rem', borderRadius: '8px', display: 'flex' }}>
                <Icon size={14} color={color} />
            </div>
            <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>{value || 0}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, display: 'flex', gap: '0.3rem', justifyContent: 'flex-end', marginTop: '-2px' }}>
                    <span style={{ color: '#10b981' }}>{correct || 0}D</span>
                    <span style={{ color: '#ef4444' }}>{wrong || 0}Y</span>
                </div>
            </div>
        </div>
        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</span>
    </div>
);

interface StudentDetailProps {
    studentId: number;
    onBack: () => void;
}

type TopicSuggestion = {
    course: string;
    topic: string;
    count: number;
};

type QuizExamType = 'TYT' | 'AYT';
type CourseTopicBucket = {
    course: string;
    examType: QuizExamType;
    topics: TopicSuggestion[];
};

const StudentDetail: React.FC<StudentDetailProps> = ({ studentId, onBack }) => {
    const [subTab, setSubTab] = useState<'analysis' | 'charts' | 'archive' | 'assigned' | 'smartquiz' | 'curriculum' | 'weekly' | 'planner' | 'attendance' | 'guidance' | 'classProgress'>('analysis');
    const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
    const [student, setStudent] = useState<any>(null);
    const [exams, setExams] = useState<any[]>([]);
    const [assignedContents, setAssignedContents] = useState<any[]>([]);
    const [averages, setAverages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingField, setUpdatingField] = useState<string | null>(null);
    const [curriculum, setCurriculum] = useState<any>(null);
    const [curriculumLoading, setCurriculumLoading] = useState(false);
    const [classProgress, setClassProgress] = useState<any[]>([]);
    const [classProgressLoading, setClassProgressLoading] = useState(false);
    const [classProgressWeekStart, setClassProgressWeekStart] = useState<Date>(() => getClassProgressWeekStart());
    const [weeklyData, setWeeklyData] = useState<any>(null);
    const [weeklyLoading, setWeeklyLoading] = useState(false);
    const [expandedWeekId, setExpandedWeekId] = useState<number | null>(null);
    const [isHTExpanded, setIsHTExpanded] = useState(false);
    const [selectedHTCourse, setSelectedHTCourse] = useState('Hepsi');
    const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
    const [guidanceData, setGuidanceData] = useState<{ assignments: any[], appointments: any[] } | null>(null);
    const [guidanceLoading, setGuidanceLoading] = useState(false);
    const [attendanceLoading, setAttendanceLoading] = useState(false);
    const [quizSending, setQuizSending] = useState(false);
    const [manualQuizForm, setManualQuizForm] = useState({
        course: '',
        topic: '',
        reason: '',
        riskLabel: 'Ogretmen Onerisi',
        questionCount: 3,
        explanationCount: 0,
    });
    const [quizExamType, setQuizExamType] = useState<QuizExamType>('TYT');
    const [quizSelectionMode, setQuizSelectionMode] = useState<'suggested' | 'curriculum'>('suggested');
    const [smartQuizSearch, setSmartQuizSearch] = useState('');
    const [smartQuizFilter, setSmartQuizFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed' | 'needs_support' | 'teacher' | 'system'>('all');
    const [smartQuizSort, setSmartQuizSort] = useState<'latest' | 'oldest' | 'score_low' | 'score_high' | 'risk'>('latest');
    const [isSmartQuizSortOpen, setIsSmartQuizSortOpen] = useState(false);
    const [isSmartQuizFilterOpen, setIsSmartQuizFilterOpen] = useState(false);
    const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
    const [smartQuizOverviewAnalysis, setSmartQuizOverviewAnalysis] = useState('');
    const [smartQuizOverviewLoading, setSmartQuizOverviewLoading] = useState(false);
    const [smartQuizCardAnalyses, setSmartQuizCardAnalyses] = useState<Record<string, string>>({});
    const [smartQuizCardLoadingId, setSmartQuizCardLoadingId] = useState<string | null>(null);
    const { showToast } = usePanelToast();
    const { confirm } = usePanelConfirm();
    const [plannerData, setPlannerData] = useState<any[]>([]);
    const [plannerLoading, setPlannerLoading] = useState(false);
    const [plannerSuggestionLoading, setPlannerSuggestionLoading] = useState(false);
    const [isPlannerModalOpen, setIsPlannerModalOpen] = useState(false);
    const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);
    const [selectedDayIndexForTask, setSelectedDayIndexForTask] = useState<number | null>(null);
    const [newPlannerTask, setNewPlannerTask] = useState({ subject: 'Matematik', topic: '', examType: 'TYT' });
    const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
    const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
    const smartQuizSortRef = useRef<HTMLDivElement | null>(null);
    const smartQuizFilterRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (subTab === 'planner' && plannerData.length === 0) {
            setPlannerLoading(true);
            api.getStudentCurriculumPlans(studentId)
                .then(data => setPlannerData(Array.isArray(data) ? data : []))
                .catch(err => console.error('Çizelge yüklenemedi:', err))
                .finally(() => setPlannerLoading(false));
        }
    }, [subTab, studentId, plannerData.length]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (smartQuizSortRef.current && !smartQuizSortRef.current.contains(event.target as Node)) {
                setIsSmartQuizSortOpen(false);
            }
            if (smartQuizFilterRef.current && !smartQuizFilterRef.current.contains(event.target as Node)) {
                setIsSmartQuizFilterOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const resetManualQuizForm = () => {
        setManualQuizForm({
            course: '',
            topic: '',
            reason: '',
            riskLabel: 'Ogretmen Onerisi',
            questionCount: 3,
            explanationCount: 0,
        });
        setEditingQuizId(null);
    };

    const fetchData = async () => {
        try {
            const [studentData, examData, avgData, assignedData] = await Promise.all([
                api.getStudentById(studentId),
                api.getStudentExams(studentId),
                api.getAverages(),
                api.getStudentAssignedContents(studentId)
            ]);
            setStudent(studentData);
            setExams(examData);
            setAverages(avgData);
            setAssignedContents(Array.isArray(assignedData) ? assignedData : []);
        } catch (err) {
            console.error('Öğrenci verileri yüklenemedi:', err);
        } finally {
            setLoading(false);
            setUpdatingField(null);
        }
    };

    useEffect(() => {
        setLoading(true);
        setAssignedContents([]);
        setSmartQuizOverviewAnalysis('');
        setSmartQuizCardAnalyses({});
        fetchData();
    }, [studentId]);

    useEffect(() => {
        if ((subTab === 'curriculum' || subTab === 'smartquiz' || subTab === 'analysis' || subTab === 'classProgress') && !curriculum) {
            setCurriculumLoading(true);
            api.getStudentCurriculum(studentId)
                .then(data => setCurriculum(data))
                .catch(err => console.error('Müfredat yüklenemedi:', err))
                .finally(() => setCurriculumLoading(false));
        }

        if ((subTab === 'curriculum' || subTab === 'analysis' || subTab === 'classProgress') && student?.class && classProgress.length === 0) {
            setClassProgressLoading(true);
            api.getClassProgress({ instId: student.institutionId, classId: undefined })
                .then(data => {
                    const filtered = data.filter((p: any) => p.class.name === student.class);
                    setClassProgress(filtered);
                })
                .catch(err => console.error('Sınıf ilerlemesi yüklenemedi:', err))
                .finally(() => setClassProgressLoading(false));
        }
    }, [subTab, studentId, curriculum, student]);

    useEffect(() => {
        if (subTab === 'weekly' && !weeklyData) {
            setWeeklyLoading(true);
            api.getStudentWeeklyReport(studentId)
                .then(data => setWeeklyData(data))
                .catch(err => console.error('Haftalık veri yüklenemedi:', err))
                .finally(() => setWeeklyLoading(false));
        }
    }, [subTab, studentId, weeklyData]);

    useEffect(() => {
        if (subTab === 'attendance' && attendanceHistory.length === 0) {
            setAttendanceLoading(true);
            api.getStudentAttendance(studentId)
                .then(data => setAttendanceHistory(data))
                .catch(err => console.error('Yoklama geçmişi yüklenemedi:', err))
                .finally(() => setAttendanceLoading(false));
        }
    }, [subTab, studentId]);

    useEffect(() => {
        if (subTab === 'guidance' && !guidanceData) {
            setGuidanceLoading(true);
            api.getStudentGuidanceData(studentId)
                .then(data => setGuidanceData(data))
                .catch(err => console.error('Rehberlik verisi yüklenemedi:', err))
                .finally(() => setGuidanceLoading(false));
        }
    }, [subTab, studentId, guidanceData]);

    useEffect(() => {
        if (editingQuizId) return;

        const topicSuggestionMap = (student?.questionAnalyses || []).reduce(
            (acc: Record<string, TopicSuggestion>, qa: any) => {
                if (!qa?.course || !qa?.topic) return acc;
                const key = `${qa.course}|${qa.topic}`;
                acc[key] = acc[key] || { course: qa.course, topic: qa.topic, count: 0 };
                acc[key].count += 1;
                return acc;
            },
            {} as Record<string, TopicSuggestion>
        );

        const quizCourseBuckets = (Object.values(topicSuggestionMap) as TopicSuggestion[]).reduce(
            (acc: CourseTopicBucket[], item: TopicSuggestion) => {
                const examType: QuizExamType = isAYT(item.course) ? 'AYT' : 'TYT';
                const existing = acc.find((bucket: CourseTopicBucket) => bucket.course === item.course);
                if (existing) {
                    existing.topics.push(item);
                } else {
                    acc.push({
                        course: item.course,
                        examType,
                        topics: [item],
                    });
                }
                return acc;
            },
            [] as CourseTopicBucket[]
        )
            .map((bucket: CourseTopicBucket) => ({
                ...bucket,
                topics: bucket.topics.sort((a: TopicSuggestion, b: TopicSuggestion) => b.count - a.count),
            }))
            .sort((a: CourseTopicBucket, b: CourseTopicBucket) => a.course.localeCompare(b.course, 'tr'));

        const visibleCourses = quizCourseBuckets.filter((bucket: CourseTopicBucket) => bucket.examType === quizExamType);
        const currentCurriculumCourses = Array.isArray(curriculum?.courseProgression)
            ? curriculum.courseProgression
            : Array.isArray(curriculum?.courses)
                ? curriculum.courses
                : [];
        const filteredCourses = currentCurriculumCourses.filter((course: any) =>
            quizExamType === 'AYT' ? isAYT(course) : isTYT(course)
        );
        const availableCourseNames = quizSelectionMode === 'curriculum'
            ? filteredCourses
                .map((course: any) => String(course.courseName || '').trim())
                .filter(Boolean)
            : visibleCourses
                .map((bucket: CourseTopicBucket) => String(bucket.course || '').trim())
                .filter(Boolean);
        const currentCourse = manualQuizForm.course.trim();
        const nextCourse = availableCourseNames.includes(currentCourse)
            ? currentCourse
            : availableCourseNames[0] || '';

        const currentCurriculumCourse = filteredCourses.find((course: any) => String(course.courseName || '').trim() === nextCourse);
        const curriculumTopicNames = ((currentCurriculumCourse?.topics || []) as any[])
            .flatMap((topic: any) =>
                Array.isArray(topic?.subTopics) && topic.subTopics.length > 0
                    ? topic.subTopics
                    : [topic]
            )
            .map((topic: any) => String(topic?.name || '').trim())
            .filter(Boolean);
        const suggestedTopicNames = (visibleCourses.find((bucket: CourseTopicBucket) => bucket.course === nextCourse)?.topics || [])
            .map((topic: TopicSuggestion) => String(topic.topic || '').trim())
            .filter(Boolean);
        const availableTopicNames = quizSelectionMode === 'curriculum' ? curriculumTopicNames : suggestedTopicNames;
        const currentTopic = manualQuizForm.topic.trim();
        const nextTopic = availableTopicNames.includes(currentTopic)
            ? currentTopic
            : availableTopicNames[0] || '';

        if (currentCourse === nextCourse && currentTopic === nextTopic) return;

        setManualQuizForm((prev) => ({
            ...prev,
            course: nextCourse,
            topic: nextTopic,
        }));
    }, [curriculum, editingQuizId, manualQuizForm.course, manualQuizForm.topic, quizExamType, quizSelectionMode, student]);

    const handleRefreshAi = async (field: string) => {
        if (!student) return;
        setUpdatingField(field);
        try {
            await api.updateStudentAi(studentId, field);
            await fetchData();
        } catch (err) {
            console.error('AI güncellenemedi:', err);
            setUpdatingField(null);
            showToast({ type: 'error', title: 'Yenilenemedi', message: 'Yapay zeka analizi güncellenirken bir hata oluştu.' });
        }
    };

    const onDragEnd = (result: any) => {
        const { source, destination } = result;
        if (!destination) return;

        const sourceDay = parseInt(source.droppableId);
        const destDay = parseInt(destination.droppableId);

        const currentPlanner = plannerData[selectedPlanIndex];
        if (!currentPlanner) return;

        const allTasks = [...currentPlanner.tasks];
        const sourceTasks = allTasks.filter(t => t.dayIndex === sourceDay);
        const movedTask = sourceTasks[source.index];

        if (!movedTask) return;

        const globalSourceIndex = allTasks.indexOf(movedTask);
        allTasks.splice(globalSourceIndex, 1);

        movedTask.dayIndex = destDay;

        const destTasks = allTasks.filter(t => t.dayIndex === destDay);

        if (destTasks.length === 0 || destination.index >= destTasks.length) {
            const lastDestTaskIndex = destTasks.length > 0
                ? allTasks.lastIndexOf(destTasks[destTasks.length - 1])
                : -1;

            if (lastDestTaskIndex !== -1) {
                allTasks.splice(lastDestTaskIndex + 1, 0, movedTask);
            } else {
                allTasks.push(movedTask);
            }
        } else {
            const targetTask = destTasks[destination.index];
            const globalDestIndex = allTasks.indexOf(targetTask);
            allTasks.splice(globalDestIndex, 0, movedTask);
        }

        const updatedData = [...plannerData];
        updatedData[selectedPlanIndex] = { ...currentPlanner, tasks: allTasks };
        setPlannerData(updatedData);
    };

    const handlePlannerAiSuggest = async () => {
        setPlannerSuggestionLoading(true);
        try {
            const data = await api.getStudentCurriculumSuggestions(studentId);
            if (data.suggestions && data.suggestions.length > 0) {
                // Get current plan or create new structure
                const currentPlan = plannerData[0] || { studentId, weekStartDate: new Date().toISOString(), tasks: [] };

                // AI suggestions come with dayIndex, subject, topic, reason
                const aiTasks = data.suggestions.map((s: any) => ({
                    dayIndex: s.dayIndex,
                    subject: s.subject,
                    topic: s.topic,
                    status: 'pending',
                    isAiSuggested: true
                }));

                const updatedPlan = {
                    ...currentPlan,
                    tasks: [...currentPlan.tasks, ...aiTasks]
                };

                setPlannerData([updatedPlan]);
                showToast({
                    type: 'success',
                    title: 'Yapay Zeka Önerileri Eklendi',
                    message: data.mentorNote || 'Sistem öğrenci için uygun konuları yerleştirdi.'
                });
            }
        } catch (err) {
            console.error('AI Suggestion Error:', err);
            showToast({ type: 'error', title: 'Hata', message: 'Öneri oluşturulurken bir problem çıktı.' });
        } finally {
            setPlannerSuggestionLoading(false);
        }
    };

    const handleSavePlanner = async () => {
        const currentData = plannerData[selectedPlanIndex] || {
            studentId,
            weekStartDate: new Date().toISOString(),
            tasks: []
        };

        try {
            setPlannerLoading(true);
            await api.updateStudentCurriculumPlan({
                studentId,
                weekStartDate: currentData.weekStartDate,
                tasks: currentData.tasks
            });
            showToast({ type: 'success', title: 'Plan Kaydedildi', message: 'Haftalık çizelge başarıyla güncellendi ve öğrenciye iletildi.' });
        } catch (err) {
            console.error('Save Planner Error:', err);
            showToast({ type: 'error', title: 'Kayıt Hatası', message: 'Çizelge kaydedilirken bir hata oluştu.' });
        } finally {
            setPlannerLoading(false);
        }
    };

    const handleSendManualQuiz = async () => {
        const effectiveCourse = resolvedQuizCourse.trim();
        const effectiveTopic = resolvedQuizTopic.trim();

        if (!effectiveCourse || !effectiveTopic) {
            showToast({ type: 'warning', title: 'Eksik Bilgi', message: 'Quiz göndermek için ders ve konu alanlarını dolduralım.' });
            return;
        }

        setQuizSending(true);
        try {
            const now = new Date();
            const plan = {
                id: editingQuizId || `sq_panel_${studentId}_${Date.now()}`,
                course: effectiveCourse,
                topic: effectiveTopic,
                reason: manualQuizForm.reason.trim() || 'Ogretmen bu konu icin ozel bir quiz gonderdi.',
                riskLabel: manualQuizForm.riskLabel,
                cooldownHours: 24,
                sourceLastActivityAt: now.toISOString(),
                assignedAt: now.toISOString(),
                questionCount: Number(manualQuizForm.questionCount) || 3,
                explanationCount: Number(manualQuizForm.explanationCount) || 0,
                status: 'pending',
            };

            await api.sendSmartQuizPlan(studentId, plan);
            await fetchData();
            setSubTab('smartquiz');
            resetManualQuizForm();
            showToast({
                type: 'success',
                title: editingQuizId ? 'Quiz Güncellendi' : 'Quiz Gönderildi',
                message: editingQuizId ? 'Quiz kaydı öğrenci için güncellendi.' : 'Quiz öğrenci listesine başarıyla eklendi.'
            });
        } catch (err) {
            console.error('Quiz gönderilemedi:', err);
            showToast({ type: 'error', title: 'Gönderilemedi', message: 'Quiz gönderilirken bir hata oluştu.' });
        } finally {
            setQuizSending(false);
        }
    };

    const startEditingQuiz = (attempt: any) => {
        const nextCourse = String(attempt.course || '').trim();
        const currentCurriculumCourses = Array.isArray(curriculum?.courseProgression)
            ? curriculum.courseProgression
            : Array.isArray(curriculum?.courses)
                ? curriculum.courses
                : [];
        const isCourseInSuggested = quizCourseBuckets.some((bucket: CourseTopicBucket) => bucket.course === nextCourse);
        const isCourseInCurriculum = currentCurriculumCourses.some((course: any) => String(course.courseName || '') === nextCourse);

        setEditingQuizId(String(attempt.id));
        setQuizExamType(isAYT(nextCourse) ? 'AYT' : 'TYT');
        setQuizSelectionMode(isCourseInSuggested ? 'suggested' : isCourseInCurriculum ? 'curriculum' : 'suggested');
        setManualQuizForm({
            course: nextCourse,
            topic: String(attempt.topic || ''),
            reason: String(attempt.reason || ''),
            riskLabel: String(attempt.riskLabel || 'Ogretmen Onerisi'),
            questionCount: Number(attempt.questionCount) || 3,
            explanationCount: Number(attempt.explanationCount) || 0,
        });
        setSubTab('smartquiz');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteQuiz = async (attempt: any) => {
        const confirmed = await confirm({
            title: 'Quiz silinsin mi?',
            message: `"${attempt.topic}" quizini panelden silmek üzeresin. Bu kayıt öğrenci listesinden kaldırılacak.`,
            confirmLabel: 'Sil',
            cancelLabel: 'Vazgeç',
            tone: 'danger',
        });
        if (!confirmed) return;

        try {
            setQuizSending(true);
            await api.deleteSmartQuizAttempt(studentId, String(attempt.id));
            if (editingQuizId === String(attempt.id)) {
                resetManualQuizForm();
            }
            await fetchData();
            showToast({ type: 'success', title: 'Quiz Silindi', message: 'Quiz kaydı panelden kaldırıldı.' });
        } catch (err) {
            console.error('Quiz silinemedi:', err);
            showToast({ type: 'error', title: 'Silinemedi', message: 'Quiz silinirken bir hata oluştu.' });
        } finally {
            setQuizSending(false);
        }
    };

    const sendFollowUpQuiz = async (attempt: any, mode: 'followup' | 'retry' = 'followup') => {
        const now = new Date();
        const nextQuestionCount = mode === 'retry'
            ? Math.max(3, Number(attempt.questionCount) || 3)
            : Math.max(3, Math.min(8, (Number(attempt.questionCount) || 3) + 2));
        const plan = {
            id: `sq_panel_${studentId}_${Date.now()}`,
            course: String(attempt.course || '').trim(),
            topic: String(attempt.topic || '').trim(),
            reason: mode === 'retry'
                ? `Ogretmen ayni konu icin benzer bir quiz tekrar atadi. ${attempt.reason || ''}`.trim()
                : `Bu konuda takip quizi planlandi. Onceki sonuc: ${attempt.correctCount ?? 0}/${attempt.totalCount ?? attempt.questionCount ?? 0}. ${attempt.reason || ''}`.trim(),
            riskLabel: mode === 'retry' ? 'Ogretmen Onerisi' : 'Yuksek Oncelik',
            cooldownHours: 24,
            sourceLastActivityAt: (attempt.completedAt || attempt.updatedAt || attempt.assignedAt || now.toISOString()),
            assignedAt: now.toISOString(),
            questionCount: nextQuestionCount,
            explanationCount: Number(attempt.explanationCount) || 0,
            status: 'pending',
        };

        try {
            setQuizSending(true);
            await api.sendSmartQuizPlan(studentId, plan);
            await fetchData();
            showToast({
                type: 'success',
                title: mode === 'retry' ? 'Quiz Yeniden Gönderildi' : 'Takip Quizi Gönderildi',
                message: mode === 'retry' ? 'Benzer quiz tekrar öğrenciye ulaştırıldı.' : 'Takip quizi öğrenci listesine eklendi.'
            });
        } catch (err) {
            console.error('Takip quizi gonderilemedi:', err);
            showToast({ type: 'error', title: 'İşlem Başarısız', message: 'Quiz aksiyonu uygulanırken bir hata oluştu.' });
        } finally {
            setQuizSending(false);
        }
    };

    const handleAnalyzeSmartQuizOverview = async () => {
        try {
            setSmartQuizOverviewLoading(true);
            const result = await api.getSmartQuizAnalysis(studentId);
            setSmartQuizOverviewAnalysis(String(result?.analysis || ''));
        } catch (err) {
            console.error('Genel quiz analizi alınamadı:', err);
            showToast({ type: 'error', title: 'Analiz Üretilemedi', message: 'Akıllı quiz genel analizi hazırlanırken bir hata oluştu.' });
        } finally {
            setSmartQuizOverviewLoading(false);
        }
    };

    const handleAnalyzeSmartQuizAttempt = async (attemptId: string) => {
        try {
            setSmartQuizCardLoadingId(attemptId);
            const result = await api.getSmartQuizAnalysis(studentId, attemptId);
            setSmartQuizCardAnalyses((prev) => ({ ...prev, [attemptId]: String(result?.analysis || '') }));
        } catch (err) {
            console.error('Quiz kart analizi alınamadı:', err);
            showToast({ type: 'error', title: 'Analiz Üretilemedi', message: 'Quiz kartı için AI yorumu hazırlanırken bir hata oluştu.' });
        } finally {
            setSmartQuizCardLoadingId(null);
        }
    };

    if (loading) return <div className="main-content"><div className="card">Yükleniyor...</div></div>;
    if (!student) return <div className="main-content"><div className="card" style={{ textAlign: 'center', padding: '4rem' }}>Öğrenci bulunamadı. <button onClick={onBack} className="btn-outline">Geri Dön</button></div></div>;

    const netProgressData = exams.map(e => ({
        date: new Date(e.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
        tyt: e.tytNet,
        ayt: e.aytNet
    }));

    // Dynamic institutional data
    const effortData = averages.map(avg => ({
        subject: avg.subject,
        A: student.subjectCounts?.[avg.subject] || 0, // Öğrencinin kendi eforu
        B: avg.average_value, // Kurum ortalaması
        fullMark: Math.max(100, (student.subjectCounts?.[avg.subject] || 0), avg.average_value)
    }));

    const ai = student.ai_summary || {};

    // Efor Dağılımı Hesaplama (TYT vs AYT)
    const tytCount = student.questionAnalyses?.filter((qa: any) => !isAYT(qa.course || '')).length || 0;
    const aytCount = student.questionAnalyses?.filter((qa: any) => isAYT(qa.course || '')).length || 0;
    const totalEffort = tytCount + aytCount;

    const getTopCourses = (isAytType: boolean) => {
        const counts: Record<string, number> = {};
        student.questionAnalyses?.forEach((qa: any) => {
            const c = qa.course || 'Genel';
            const match = isAytType ? isAYT(c) : !isAYT(c);
            if (match) counts[c] = (counts[c] || 0) + 1;
        });
        const icons: any = { 'Matematik': '📐', 'Türkçe': '📝', 'Fizik': '⚛️', 'Kimya': '🧪', 'Biyoloji': '🧬', 'Tarih': '📜', 'Coğrafya': '🌍', 'Felsefe': '💭', 'Din Kültürü': '✨', 'Edebiyat': '📚' };
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, count]) => ({
                name: name.split(' ')[0],
                icon: icons[name] || '•',
                count: count
            }));
    };

    const topTyt = getTopCourses(false);
    const topAyt = getTopCourses(true);

    const tytAytEffort = [
        { name: 'TYT', value: totalEffort === 0 ? 50 : (tytCount / totalEffort) * 100, color: '#4f46e5', grad: 'url(#colorTyt)', top: topTyt, bgColor: '#eef2ff', textColor: '#4338ca' },
        { name: 'AYT', value: totalEffort === 0 ? 50 : (aytCount / totalEffort) * 100, color: '#e11d48', grad: 'url(#colorAyt)', top: topAyt, bgColor: '#fff1f2', textColor: '#be123c' },
    ];

    const formatQuizDate = (value?: string | null) => {
        if (!value) return 'Tarih yok';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Tarih yok';
        return date.toLocaleString('tr-TR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    };
    const getQuizSource = (attempt: any) => {
        const id = String(attempt?.id || '');
        if (id.startsWith('sq_panel_') || id.startsWith('sq_manual_')) {
            return { key: 'teacher', label: 'Öğretmen Gönderdi', color: '#7c3aed', bg: '#f5f3ff' };
        }
        return { key: 'system', label: 'Sistem Önerdi', color: '#2563eb', bg: '#eff6ff' };
    };
    const getStatusMeta = (attempt: any) => {
        const score = Number(attempt?.score) || 0;
        if (attempt?.status === 'completed') {
            if (score < 0.67) return { key: 'needs_support', label: 'Tekrar Gerekli', color: '#dc2626', bg: '#fef2f2' };
            return { key: 'completed', label: 'Tamamlandı', color: '#059669', bg: '#ecfdf5' };
        }
        if (attempt?.status === 'in_progress') {
            return { key: 'in_progress', label: 'Açıldı / Yarım Kaldı', color: '#d97706', bg: '#fffbeb' };
        }
        return { key: 'pending', label: 'Bekliyor', color: '#4f46e5', bg: '#eef2ff' };
    };

    const rawSmartQuizAttempts = Array.isArray(student.smartQuizAttempts) ? student.smartQuizAttempts : [];
    const enrichedSmartQuizAttempts = rawSmartQuizAttempts.map((attempt: any) => {
        const score = Number(attempt.score) || 0;
        const source = getQuizSource(attempt);
        const statusMeta = getStatusMeta(attempt);
        const assignedAt = attempt.assignedAt || attempt.createdAt;
        const lastActionAt = attempt.completedAt || attempt.updatedAt || assignedAt;
        return {
            ...attempt,
            source,
            statusMeta,
            scorePct: Math.round(score * 100),
            isNeedsSupport: attempt.status === 'completed' && score < 0.67,
            assignedAt,
            lastActionAt,
        };
    });
    const pendingSmartQuizCount = enrichedSmartQuizAttempts.filter((a: any) => a.status === 'pending').length;
    const inProgressSmartQuizCount = enrichedSmartQuizAttempts.filter((a: any) => a.status === 'in_progress').length;
    const completedSmartQuiz = enrichedSmartQuizAttempts.filter((a: any) => a.status === 'completed');
    const avgSmartQuizScore = completedSmartQuiz.length > 0
        ? Math.round((completedSmartQuiz.reduce((acc: number, item: any) => acc + (Number(item.score) || 0), 0) / completedSmartQuiz.length) * 100)
        : 0;
    const supportNeededCount = completedSmartQuiz.filter((a: any) => a.isNeedsSupport).length;
    const teacherAssignedCount = enrichedSmartQuizAttempts.filter((a: any) => a.source.key === 'teacher').length;
    const systemAssignedCount = enrichedSmartQuizAttempts.filter((a: any) => a.source.key === 'system').length;

    const filteredSmartQuizAttempts = enrichedSmartQuizAttempts
        .filter((attempt: any) => {
            const haystack = `${attempt.course} ${attempt.topic} ${attempt.reason}`.toLocaleLowerCase('tr');
            const query = smartQuizSearch.trim().toLocaleLowerCase('tr');
            if (query && !haystack.includes(query)) return false;

            if (smartQuizFilter === 'all') return true;
            if (smartQuizFilter === 'pending') return attempt.status === 'pending';
            if (smartQuizFilter === 'in_progress') return attempt.status === 'in_progress';
            if (smartQuizFilter === 'completed') return attempt.status === 'completed';
            if (smartQuizFilter === 'needs_support') return attempt.isNeedsSupport;
            if (smartQuizFilter === 'teacher') return attempt.source.key === 'teacher';
            if (smartQuizFilter === 'system') return attempt.source.key === 'system';
            return true;
        })
        .sort((a: any, b: any) => {
            const aAssigned = new Date(a.assignedAt || 0).getTime();
            const bAssigned = new Date(b.assignedAt || 0).getTime();
            const aScore = Number(a.score) || 0;
            const bScore = Number(b.score) || 0;

            switch (smartQuizSort) {
                case 'oldest':
                    return aAssigned - bAssigned;
                case 'score_low':
                    return aScore - bScore;
                case 'score_high':
                    return bScore - aScore;
                case 'risk':
                    return Number(b.isNeedsSupport) - Number(a.isNeedsSupport) || bAssigned - aAssigned;
                case 'latest':
                default:
                    return bAssigned - aAssigned;
            }
        });

    const smartQuizSortOptions = [
        { value: 'latest', label: 'En yeni gönderilen' },
        { value: 'oldest', label: 'En eski gönderilen' },
        { value: 'score_low', label: 'En düşük başarı' },
        { value: 'score_high', label: 'En yüksek başarı' },
        { value: 'risk', label: 'Önce tekrar gerekenler' },
    ] as const;
    const activeSmartQuizSortLabel =
        smartQuizSortOptions.find((item) => item.value === smartQuizSort)?.label ??
        smartQuizSortOptions[0].label;

    const smartQuizFilterOptions = [
        { value: 'all', label: 'Hepsi' },
        { value: 'pending', label: 'Bekleyen' },
        { value: 'in_progress', label: 'Açıldı' },
        { value: 'completed', label: 'Tamamlanan' },
        { value: 'needs_support', label: 'Tekrar' },
        { value: 'teacher', label: 'Öğretmen' },
        { value: 'system', label: 'Sistem' },
    ] as const;
    const activeSmartQuizFilterLabel =
        smartQuizFilterOptions.find((item) => item.value === smartQuizFilter)?.label ??
        'Hepsi';

    const completedTrend = completedSmartQuiz
        .slice()
        .sort((a: any, b: any) => new Date(a.completedAt || a.assignedAt || 0).getTime() - new Date(b.completedAt || b.assignedAt || 0).getTime())
        .slice(-5);
    const trendDelta = completedTrend.length >= 2
        ? ((completedTrend[completedTrend.length - 1]?.scorePct || 0) - (completedTrend[0]?.scorePct || 0))
        : 0;
    const latestCompletedQuiz = completedTrend[completedTrend.length - 1] || null;
    const previousCompletedQuiz = completedTrend.length >= 2 ? completedTrend[completedTrend.length - 2] : null;
    const trendSummary = completedTrend.length === 0
        ? 'Henüz tamamlanan quiz yok.'
        : completedTrend.length === 1
            ? `İlk tamamlanan quiz %{${latestCompletedQuiz?.scorePct || 0}} ile kaydedildi.`
            : trendDelta >= 10
                ? 'Son quizlerde yukarı yönlü net bir toparlanma var.'
                : trendDelta <= -10
                    ? 'Son quizlerde düşüş var, kısa bir takip iyi olur.'
                    : 'Son quizlerde başarı dengeli ilerliyor.';
    const weakTopicClusters = Object.values(
        completedSmartQuiz.reduce((acc: Record<string, any>, attempt: any) => {
            const key = `${attempt.course}|${attempt.topic}`;
            if (!acc[key]) {
                acc[key] = {
                    key,
                    course: attempt.course,
                    topic: attempt.topic,
                    attempts: 0,
                    supportHits: 0,
                    totalScore: 0,
                };
            }
            acc[key].attempts += 1;
            acc[key].totalScore += attempt.scorePct || 0;
            if (attempt.isNeedsSupport) acc[key].supportHits += 1;
            return acc;
        }, {})
    )
        .map((cluster: any) => ({
            ...cluster,
            avgScore: Math.round(cluster.totalScore / Math.max(cluster.attempts, 1)),
        }))
        .sort((a: any, b: any) => a.avgScore - b.avgScore || b.supportHits - a.supportHits || b.attempts - a.attempts)
        .slice(0, 5);
    const topicSuggestionMap = (student.questionAnalyses || []).reduce(
        (acc: Record<string, TopicSuggestion>, qa: any) => {
            if (!qa?.course || !qa?.topic) return acc;
            const key = `${qa.course}|${qa.topic}`;
            acc[key] = acc[key] || { course: qa.course, topic: qa.topic, count: 0 };
            acc[key].count += 1;
            return acc;
        },
        {} as Record<string, TopicSuggestion>
    );
    const quizCourseBuckets: CourseTopicBucket[] = (Object.values(topicSuggestionMap) as TopicSuggestion[]).reduce(
        (acc: CourseTopicBucket[], item: TopicSuggestion) => {
            const examType: QuizExamType = isAYT(item.course) ? 'AYT' : 'TYT';
            const existing = acc.find((bucket: CourseTopicBucket) => bucket.course === item.course);
            if (existing) {
                existing.topics.push(item);
            } else {
                acc.push({
                    course: item.course,
                    examType,
                    topics: [item],
                });
            }
            return acc;
        },
        [] as CourseTopicBucket[]
    )
        .map((bucket: CourseTopicBucket) => ({
            ...bucket,
            topics: bucket.topics.sort((a: TopicSuggestion, b: TopicSuggestion) => b.count - a.count),
        }))
        .sort((a: CourseTopicBucket, b: CourseTopicBucket) => a.course.localeCompare(b.course, 'tr'));
    const visibleQuizCourses = quizCourseBuckets.filter((bucket: CourseTopicBucket) => bucket.examType === quizExamType);
    const curriculumCourses = Array.isArray(curriculum?.courseProgression)
        ? curriculum.courseProgression
        : Array.isArray(curriculum?.courses)
            ? curriculum.courses
            : [];
    const filteredCurriculumCourses = curriculumCourses.filter((course: any) =>
        quizExamType === 'AYT' ? isAYT(course) : isTYT(course)
    );
    const availableQuizCourseNames = quizSelectionMode === 'curriculum'
        ? filteredCurriculumCourses
            .map((course: any) => String(course.courseName || '').trim())
            .filter(Boolean)
        : visibleQuizCourses
            .map((bucket: CourseTopicBucket) => String(bucket.course || '').trim())
            .filter(Boolean);
    const manualCourse = manualQuizForm.course.trim();
    const resolvedQuizCourse = editingQuizId && manualCourse
        ? manualCourse
        : availableQuizCourseNames.includes(manualCourse)
            ? manualCourse
            : availableQuizCourseNames[0] || '';
    const resolvedCurriculumCourse = filteredCurriculumCourses.find((course: any) => String(course.courseName || '').trim() === resolvedQuizCourse);
    const curriculumTopicNames = ((resolvedCurriculumCourse?.topics || []) as any[])
        .flatMap((topic: any) =>
            Array.isArray(topic?.subTopics) && topic.subTopics.length > 0
                ? topic.subTopics
                : [topic]
        )
        .map((topic: any) => String(topic?.name || '').trim())
        .filter(Boolean);
    const suggestedTopicNames = (visibleQuizCourses.find((bucket: CourseTopicBucket) => bucket.course === resolvedQuizCourse)?.topics || [])
        .map((topic: TopicSuggestion) => String(topic.topic || '').trim())
        .filter(Boolean);
    const availableQuizTopicNames = quizSelectionMode === 'curriculum' ? curriculumTopicNames : suggestedTopicNames;
    const manualTopic = manualQuizForm.topic.trim();
    const resolvedQuizTopic = editingQuizId && manualTopic
        ? manualTopic
        : availableQuizTopicNames.includes(manualTopic)
            ? manualTopic
            : availableQuizTopicNames[0] || '';

    // Boş, tırnak veya anlamsız AI sonuçlarını temizle
    const cleanAiText = (text: any): any => {
        if (!text) return '';
        // Eğer veritabanından JSON array string'i geldiyse (["a", "b"] gibi), onu parse etmeyi dene
        if (typeof text === 'string' && text.startsWith('[') && text.endsWith(']')) {
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) return parsed;
            } catch (e) { /* ignore parse error, treat as plain text */ }
        }

        let t = String(text).trim();
        if (/^["'\s]*$/.test(t) || t === '[]' || t === '""' || t === '"' || t.length < 3) return '';
        t = t.replace(/^"+|"+$/g, '').trim();
        return t;
    };

    // AI metnini maddelere böl (Hibrit: Dizi gelirse dizi döner, metin gelirse split yapar)
    const splitAiParts = (input: any): string[] => {
        if (!input) return [];
        if (Array.isArray(input)) return input;

        const text = String(input);
        const parts = text.split(/\n+(?=\d{1,2}[\)\.:]\s)/g).filter(s => s.trim().length > 0);
        if (parts.length <= 1) {
            const altParts = text.split(/(?:^|\n)(?=\d{1,2}[\)\.:]\s)/g).filter(s => s.trim().length > 0);
            if (altParts.length > 1) return altParts;
        }
        return parts;
    };

    const renderAiButton = (field: string) => (
        <button
            onClick={() => handleRefreshAi(field)}
            disabled={updatingField === field}
            style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                background: updatingField === field ? '#f1f5f9' : '#eff6ff',
                color: updatingField === field ? '#94a3b8' : 'var(--primary)',
                border: 'none', padding: '0.25rem 0.75rem', borderRadius: '4px',
                fontSize: '0.75rem', fontWeight: 600, cursor: updatingField === field ? 'not-allowed' : 'pointer',
                marginLeft: 'auto'
            }}
        >
            <Zap size={14} /> {updatingField === field ? 'Analiz...' : 'AI ile Analiz Et'}
        </button>
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="main-content">
            <button
                onClick={onBack}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1.5rem',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    transition: 'color 0.2s'
                }}
                className="back-button"
            >
                <ArrowLeft size={18} /> Geri Dön
            </button>

            {/* Profile Header */}
            <section className="student-profile-header" style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                padding: '1.75rem 2rem',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-md)',
                marginBottom: '2.5rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '1.75rem'
            }}>

                {/* Avatar */}
                <div className="avatar-large" style={{
                    background: 'linear-gradient(135deg, var(--primary) 0%, #818cf8 100%)',
                    color: 'white',
                    fontWeight: 800,
                    flexShrink: 0,
                    boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.4)',
                    border: '4px solid white'
                }}>{student.name.charAt(0)}</div>

                {/* İsim + Sınıf */}
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#1e293b' }}>{student.name}</h2>
                        <span style={{
                            background: student.trend === 'up' ? '#ecfdf5' : '#fef2f2',
                            color: student.trend === 'up' ? '#059669' : '#dc2626',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '10px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            border: `1px solid ${student.trend === 'up' ? '#bbf7d0' : '#fecaca'}`,
                            whiteSpace: 'nowrap'
                        }}>
                            {student.trend === 'up' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                            {student.trend === 'up' ? 'Yükselişte' : 'Düşüşte'}
                        </span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>
                        {student.class} Sınıfı Öğrencisi
                    </p>
                </div>

                {/* Hedef - Sağ */}
                <span style={{
                    background: 'white',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    borderRadius: '16px',
                    padding: '0.75rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    border: '1px solid rgba(99, 102, 241, 0.1)',
                    flexShrink: 0
                }}>
                    <Target size={16} style={{ color: 'var(--primary)' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Hedef:</span>
                    <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.95rem' }}>{student.target || 'Belirlenmedi'}</span>
                </span>
            </section>

            {/* Sub-tabs - Premium Horizontal Scroll */}
            <div className="premium-nav" style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <button onClick={() => setSubTab('analysis')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'analysis' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'analysis' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Genel Analiz</button>
                <button onClick={() => setSubTab('charts')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'charts' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'charts' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Deneme Analiz</button>
                <button onClick={() => setSubTab('archive')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'archive' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'archive' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Sınav Arşivi</button>
                <button onClick={() => setSubTab('assigned')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'assigned' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'assigned' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><ClipboardList size={15} /> Deneme ve Testler</button>
                <button onClick={() => setSubTab('smartquiz')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'smartquiz' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'smartquiz' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Brain size={15} /> Akıllı Quizler</button>
                <button onClick={() => setSubTab('curriculum')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'curriculum' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'curriculum' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><BookOpen size={15} /> Müfredat İlerlemesi</button>
                <button onClick={() => setSubTab('classProgress')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'classProgress' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'classProgress' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><BookMarked size={15} /> Sınıf Müfredatı</button>
                <button onClick={() => setSubTab('weekly')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'weekly' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'weekly' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Calendar size={15} /> Haftalık Performans</button>
                <button onClick={() => setSubTab('attendance')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'attendance' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'attendance' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={15} /> Yoklama Geçmişi</button>
                <button onClick={() => setSubTab('guidance')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'guidance' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'guidance' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Sparkles size={15} /> Rehberlik</button>
                <button onClick={() => setSubTab('planner')} style={{ padding: '1rem 0', background: 'none', border: 'none', borderBottom: subTab === 'planner' ? '2px solid var(--primary)' : '2px solid transparent', color: subTab === 'planner' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><ClipboardList size={15} /> Haftalık Çizelge</button>
            </div>

            {subTab === 'analysis' ? (
                <div className="dashboard-grid">
                    <div className="card" style={{ gridColumn: 'span 4' }}>
                        <div className="card-title"><Zap size={18} /> AI Etkileşim Özet</div>
                        <div className="stats-inner-grid">
                            <div style={{ background: 'rgba(99, 102, 241, 0.04)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
                                <div className="card-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)' }}>
                                    <FileText size={14} /> Toplam Soru
                                </div>
                                <div className="card-value" style={{ fontSize: '1.75rem', marginTop: '0.4rem' }}>
                                    {student.solvedCount || 0}
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '4px', fontWeight: 500 }}>Adet</span>
                                </div>
                            </div>
                            <div style={{ background: 'rgba(245, 158, 11, 0.04)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                                <div className="card-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f59e0b' }}>
                                    <Zap size={14} /> Çalışma Serisi
                                </div>
                                <div className="card-value" style={{ fontSize: '1.75rem', marginTop: '0.4rem' }}>
                                    {ai.streak?.split(' ')[0] || 0}
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '4px', fontWeight: 500 }}>GÜN</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        className="card"
                        style={{
                            gridColumn: 'span 4',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            border: '1px solid var(--border-color)'
                        }}
                        onClick={() => setIsHTExpanded(true)}
                    >
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <AlertTriangle size={18} color="var(--accent-danger)" />
                                AI'ı En Çok Zorladığı Konular
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tümünü Gör</span>
                            </div>
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {(() => {
                                    const grouped: Record<string, { topic: string, course: string, count: number }> = {};
                                    student.questionAnalyses?.forEach((qa: any) => {
                                        if (qa.topic) {
                                            const key = `${qa.course || 'Genel'}-${qa.topic}`;
                                            if (!grouped[key]) {
                                                grouped[key] = { topic: qa.topic, course: qa.course || 'Genel', count: 0 };
                                            }
                                            grouped[key].count++;
                                        }
                                    });
                                    const top5 = Object.values(grouped).sort((a, b) => b.count - a.count).slice(0, 5);

                                    if (top5.length === 0) return (
                                        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                                            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔍</div>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                                                Henüz kayıtlı soru verisi yok.<br />
                                                Veri girişi yapıldığında analiz başlar.
                                            </p>
                                        </div>
                                    );

                                    return top5.map((item, idx) => (
                                        <div key={idx} className="student-list-item">
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                                <span style={{ fontSize: '0.6rem', color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase' }}>
                                                    {item.course}
                                                </span>
                                                <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{item.topic}</span>
                                            </div>
                                            <span className="badge badge-alert" style={{ borderRadius: '6px', fontSize: '0.7rem' }}>{item.count} Soru</span>
                                        </div>
                                    ));
                                })()}
                            </div>

                        </div>
                    </div>

                    <div className="card" style={{ gridColumn: 'span 4', overflow: 'hidden' }}>
                        <div className="card-title"><BarChart3 size={18} /> Efor Dağılımı (TYT/AYT)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '1rem' }}>
                            {/* Grafik Alanı */}
                            <div style={{ width: '100%', height: '120px', display: 'flex', justifyContent: 'center' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <defs>
                                            <linearGradient id="colorTyt" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#4f46e5" />
                                                <stop offset="100%" stopColor="#818cf8" />
                                            </linearGradient>
                                            <linearGradient id="colorAyt" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#e11d48" />
                                                <stop offset="100%" stopColor="#fb7185" />
                                            </linearGradient>
                                        </defs>
                                        <Pie
                                            data={tytAytEffort}
                                            innerRadius={35}
                                            outerRadius={50}
                                            dataKey="value"
                                            stroke="none"
                                            paddingAngle={6}
                                            cornerRadius={6}
                                            cx="50%"
                                            cy="50%"
                                        >
                                            {tytAytEffort.map((entry: any, index) => <Cell key={index} fill={entry.grad} />)}
                                        </Pie>
                                        <RechartsTooltip formatter={(val: any) => `%${Number(val).toFixed(1)}`} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Alt Detaylar (Lejant) */}
                            <div style={{
                                display: 'flex',
                                gap: '1rem',
                                marginTop: '1.25rem',
                                width: '100%',
                                justifyContent: 'center',
                                borderTop: '1px solid #f1f5f9',
                                paddingTop: '1.25rem'
                            }}>
                                {tytAytEffort.map((entry: any, index) => (
                                    <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color }} />
                                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>
                                                {entry.name} <span style={{ color: entry.color }}>%{entry.value.toFixed(0)}</span>
                                            </span>
                                        </div>
                                        {entry.top.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: '140px' }}>
                                                {entry.top.map((t: any, i: number) => (
                                                    <div key={i} style={{
                                                        fontSize: '0.7rem',
                                                        background: entry.bgColor,
                                                        padding: '6px 10px',
                                                        borderRadius: '10px',
                                                        color: entry.textColor,
                                                        fontWeight: 700,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        border: `1px solid ${entry.color}12`,
                                                        transition: 'transform 0.2s ease'
                                                    }}>
                                                        <span style={{ fontSize: '0.9rem' }}>{t.icon}</span>
                                                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                                                        <span style={{
                                                            background: 'white',
                                                            padding: '2px 6px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.65rem',
                                                            minWidth: '22px',
                                                            textAlign: 'center',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                            color: entry.textColor
                                                        }}>
                                                            {t.count}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ gridColumn: 'span 12' }}>
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
                            <Brain size={18} color="var(--primary)" /> Kurumsal Öğrenci Değerlendirmesi
                            {renderAiButton('aiComment')}
                        </div>
                        <div style={{ marginTop: '0.25rem' }}>
                            {(() => {
                                const text = cleanAiText(ai.ai_comment);
                                // Maddelere böl
                                const parts = splitAiParts(text);
                                if (parts.length <= 1) {
                                    // Madde bulunamadıysa düz metin göster
                                    return <p style={{ lineHeight: '1.7', margin: 0, fontStyle: 'italic', color: 'var(--text-main)' }}>{text || 'Henüz analiz yapılmadı. "AI ile Analiz Et" butonuna tıklayarak başlatabilirsiniz.'}</p>;
                                }
                                const colors = ['var(--primary)', '#10b981', '#f59e0b', '#ef4444', '#a855f7'];
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {parts.map((part: string, i: number) => {
                                            // "1) Başlık: Metin" formatından başlık ve içerik ayır
                                            const cleaned = part.replace(/^\d+[\)\.]\s*/, '').trim();
                                            const colonIdx = cleaned.indexOf(':');
                                            const title = colonIdx > -1 ? cleaned.slice(0, colonIdx).trim() : null;
                                            const body = colonIdx > -1 ? cleaned.slice(colonIdx + 1).trim() : cleaned;
                                            const color = colors[i % colors.length];
                                            return (
                                                <div key={i} style={{
                                                    background: `${color}08`,
                                                    borderLeft: `3px solid ${color}`,
                                                    borderRadius: '8px',
                                                    padding: '0.85rem 1rem',
                                                }}>
                                                    {title && (
                                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color, marginBottom: '0.35rem' }}>
                                                            {i + 1}. {title}
                                                        </div>
                                                    )}
                                                    <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: '1.65', color: 'var(--text-main)' }}>{body}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    <div className="card" style={{ gridColumn: 'span 6' }}>
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
                            <MessageSquareQuote size={18} /> Duygu Durumu
                            {renderAiButton('aiStress')}
                        </div>

                        {/* Stres Göstergesi */}
                        {(() => {
                            const stress = ai.stress || 0;
                            const color = stress >= 70 ? '#ef4444' : stress >= 40 ? '#f59e0b' : '#10b981';
                            const label = stress >= 70 ? 'Yüksek Stres' : stress >= 40 ? 'Orta Düzey' : 'Dengeli';
                            const emoji = stress >= 70 ? '😰' : stress >= 40 ? '😐' : '😊';
                            return (
                                <div style={{ marginTop: '1rem' }}>
                                    {/* Üst Satır: Etiket + Yüzde */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '1.4rem' }}>{emoji}</span>
                                            <span style={{
                                                fontSize: '0.78rem', fontWeight: 700, padding: '0.2rem 0.65rem',
                                                borderRadius: '20px', background: `${color}18`, color
                                            }}>{label}</span>
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '1.5rem', color }}>{stress}%</span>
                                    </div>

                                    {/* Gradient Bar */}
                                    <div style={{ position: 'relative', height: '10px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${stress}%`, height: '100%', borderRadius: '99px',
                                            background: 'linear-gradient(90deg, #10b981, #f59e0b, #ef4444)',
                                            transition: 'width 0.8s ease'
                                        }} />
                                    </div>

                                    {/* Skala Etiketleri */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        <span>Düşük</span><span>Orta</span><span>Yüksek</span>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Açıklama Metni */}
                        <div style={{
                            marginTop: '1rem', background: '#f8fafc',
                            borderRadius: '10px', padding: '0.9rem 1rem',
                            borderLeft: '3px solid var(--primary)'
                        }}>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.65' }}>
                                {ai.stress_comment || 'Duygu durumu analizi geçici olarak sağlanamıyor.'}
                            </p>
                        </div>
                    </div>
                    <div className="card" style={{ gridColumn: 'span 6' }}>
                        <div className="card-title"><BarChart3 size={18} /> Akran Kıyaslaması (Soru Çözüm Eforu)</div>
                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {effortData.map((item, index) => (
                                <div key={index}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                                        <span style={{ fontWeight: 600 }}>{item.subject}</span>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>Öğrenci: {item.A}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kurum Ort: {item.B}</span>
                                        </div>
                                    </div>
                                    <div style={{ position: 'relative', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(item.B / item.fullMark) * 100}%`, background: '#e2e8f0' }} />
                                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(item.A / item.fullMark) * 100}%`, background: item.A >= item.B ? 'var(--primary)' : 'var(--accent-warning)', borderRadius: '4px' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : subTab === 'guidance' ? (
                <div className="dashboard-grid">
                    {guidanceLoading ? (
                        <div style={{ gridColumn: 'span 12', textAlign: 'center', padding: '5rem' }}>
                            <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                            <p style={{ color: 'var(--text-muted)' }}>Rehberlik verileri yükleniyor...</p>
                        </div>
                    ) : (
                        <>
                            {/* Randevular Sütunu */}
                            <div className="card" style={{ gridColumn: 'span 5' }}>
                                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: '#fef3c7', padding: '0.5rem', borderRadius: '10px' }}>
                                        <Calendar size={18} color="#d97706" />
                                    </div>
                                    Randevu Geçmişi
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.25rem' }}>
                                    {!guidanceData?.appointments?.length ? (
                                        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Kayıtlı randevu bulunamadı.</div>
                                    ) : (
                                        guidanceData.appointments.map((appt: any) => (
                                            <div key={appt.id} style={{ border: '1px solid #f1f5f9', borderRadius: '14px', padding: '1rem', background: '#f8fafc' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{appt.title}</div>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '100px', background: appt.status === 'completed' ? '#ecfdf5' : '#fff7ed', color: appt.status === 'completed' ? '#10b981' : '#f59e0b' }}>
                                                        {appt.status === 'completed' ? 'TAMAMLANDI' : 'BEKLİYOR'}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.75rem' }}>
                                                    <Clock size={14} />
                                                    {new Date(appt.startTime).toLocaleString('tr-TR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                {appt.note && (
                                                    <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#475569', background: 'white', padding: '0.75rem', borderRadius: '10px', borderLeft: '3px solid #e2e8f0' }}>
                                                        {appt.note}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Anketler Sütunu */}
                            <div className="card" style={{ gridColumn: 'span 7' }}>
                                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: '#e0e7ff', padding: '0.5rem', borderRadius: '10px' }}>
                                        <ClipboardList size={18} color="var(--primary)" />
                                    </div>
                                    Atanan Anketler ve Yanıtlar
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.25rem' }}>
                                    {!guidanceData?.assignments?.length ? (
                                        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Atanmış anket bulunamadı.</div>
                                    ) : (
                                        guidanceData.assignments.map((asgn: any) => {
                                            const isDone = asgn.status === 'completed';
                                            return (
                                                <div key={asgn.id} style={{ border: '1px solid #eef2f6', borderRadius: '16px', overflow: 'hidden' }}>
                                                    <div style={{ background: '#f8fafc', padding: '1rem', borderBottom: '1px solid #eef2f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ fontWeight: 800, color: '#1e293b' }}>{asgn.survey?.title}</div>
                                                        <div style={{ fontSize: '0.7rem', fontWeight: 900, padding: '0.3rem 0.7rem', borderRadius: '100px', background: isDone ? '#ecfdf5' : '#f1f5f9', color: isDone ? '#059669' : '#64748b' }}>
                                                            {isDone ? 'ÇÖZÜLDÜ' : 'BEKLİYOR'}
                                                        </div>
                                                    </div>
                                                    {isDone && asgn.responses?.length > 0 ? (
                                                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                            {asgn.survey?.questions?.map((q: any) => {
                                                                const resp = asgn.responses.find((r: any) => r.questionId === q.id);
                                                                return (
                                                                    <div key={q.id}>
                                                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.3rem' }}>{q.text}</div>
                                                                        <div style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>
                                                                            {resp?.selectedOption || resp?.answerText || 'Yanıtlanmamış'}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                                            Bu anket henüz öğrenci tarafından yanıtlanmamış.
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            ) : subTab === 'charts' ? (
                <div className="dashboard-grid" style={{ alignItems: 'flex-start' }}>
                    <div className="card" style={{ gridColumn: 'span 8', position: 'sticky', top: '2.5rem', alignSelf: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div className="card-title" style={{ margin: 0 }}><LineChartIcon size={18} /> TYT/AYT Net Gelişimi</div>
                            {netProgressData.length > 0 && (() => {
                                const lastExam = netProgressData[netProgressData.length - 1];
                                const prevExam = netProgressData.length > 1 ? netProgressData[netProgressData.length - 2] : null;
                                const tytDiff = prevExam ? (lastExam.tyt - prevExam.tyt).toFixed(1) : null;
                                const aytDiff = prevExam ? (lastExam.ayt - prevExam.ayt).toFixed(1) : null;
                                return (
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <div style={{ textAlign: 'center', background: 'var(--primary)0f', backdropFilter: 'blur(4px)', border: '1px solid var(--primary)15', borderRadius: '12px', padding: '0.4rem 0.85rem' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.02em', opacity: 0.8 }}>Son TYT</div>
                                            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--primary)', lineHeight: '1.2' }}>{lastExam.tyt}</div>
                                            {tytDiff && <div style={{ fontSize: '0.65rem', color: Number(tytDiff) >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>{Number(tytDiff) >= 0 ? '↑' : '↓'} {Math.abs(Number(tytDiff))}</div>}
                                        </div>
                                        <div style={{ textAlign: 'center', background: '#a855f70f', backdropFilter: 'blur(4px)', border: '1px solid #a855f715', borderRadius: '12px', padding: '0.4rem 0.85rem' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.02em', opacity: 0.8 }}>Son AYT</div>
                                            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#a855f7', lineHeight: '1.2' }}>{lastExam.ayt}</div>
                                            {aytDiff && <div style={{ fontSize: '0.65rem', color: Number(aytDiff) >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>{Number(aytDiff) >= 0 ? '↑' : '↓'} {Math.abs(Number(aytDiff))}</div>}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                        <div style={{ height: '320px', overflowX: netProgressData.length > 5 ? 'auto' : 'hidden', paddingBottom: '0.5rem' }}>
                            <div style={{ minWidth: netProgressData.length > 5 ? `${netProgressData.length * 90}px` : '100%', height: '100%' }}>
                                {netProgressData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={netProgressData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} iconType="circle" />
                                            <Bar dataKey="tyt" fill="var(--primary)" name="TYT Net" radius={[6, 6, 0, 0]} maxBarSize={32} />
                                            <Bar dataKey="ayt" fill="#a855f7" name="AYT Net" radius={[6, 6, 0, 0]} maxBarSize={32} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Henüz sınav verisi yok.</div>}
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ gridColumn: 'span 4' }}>
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
                            <Target size={18} /> Hedef Uyum Analizi
                            {renderAiButton('aiTargetAnalysis')}
                        </div>
                        <div style={{ marginTop: '0.5rem' }}>
                            {(() => {
                                const text = cleanAiText(ai.target_analysis);
                                const parts = splitAiParts(text);
                                const colors = ['var(--primary)', '#10b981', '#f59e0b', '#ef4444', '#a855f7'];
                                if (parts.length <= 1) {
                                    return (
                                        <div style={{ background: 'linear-gradient(135deg, var(--primary)08, #a855f708)', border: '1px solid var(--primary)20', borderRadius: '12px', padding: '1rem 1.1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                                                <span style={{ fontSize: '1.1rem' }}>🎯</span>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stratejik Yol Haritası</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: '1.7', color: 'var(--text-main)' }}>{text || 'Analiz bekleniyor...'}</p>
                                        </div>
                                    );
                                }
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {parts.map((part: string, i: number) => {
                                            const cleaned = part.replace(/^\d+[\)\.]\s*/, '').trim();
                                            const colonIdx = cleaned.indexOf(':');
                                            const title = colonIdx > -1 ? cleaned.slice(0, colonIdx).trim() : null;
                                            const body = colonIdx > -1 ? cleaned.slice(colonIdx + 1).trim() : cleaned;
                                            const color = colors[i % colors.length];
                                            return (
                                                <div key={i} style={{ background: `${color}08`, borderLeft: `3px solid ${color}`, borderRadius: '8px', padding: '0.7rem 0.9rem' }}>
                                                    {title && <div style={{ fontWeight: 700, fontSize: '0.78rem', color, marginBottom: '0.3rem' }}>{i + 1}. {title}</div>}
                                                    <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: '1.6', color: 'var(--text-main)' }}>{body}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    <div className="card" style={{ gridColumn: 'span 12' }}>
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
                            <Brain size={18} color="var(--primary)" /> Bireysel Sınav Karnesi & Net Analizi
                            {renderAiButton('aiNetAnalysis')}
                        </div>
                        <div style={{ marginTop: '0.25rem' }}>
                            {(() => {
                                const text = cleanAiText(ai.net_analysis);
                                const parts = splitAiParts(text);
                                const colors = ['var(--primary)', '#10b981', '#f59e0b', '#ef4444', '#a855f7'];
                                if (parts.length <= 1) {
                                    return (
                                        <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', borderLeft: '4px solid var(--primary)' }}>
                                            <p style={{ margin: 0, lineHeight: '1.65', color: 'var(--text-main)', fontSize: '0.9rem' }}>{text || 'Net analiz raporu bekleniyor...'}</p>
                                        </div>
                                    );
                                }
                                return (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '0.75rem' }}>
                                        {parts.map((part: string, i: number) => {
                                            const cleaned = part.replace(/^\d+[\)\.]\s*/, '').trim();
                                            const colonIdx = cleaned.indexOf(':');
                                            const title = colonIdx > -1 ? cleaned.slice(0, colonIdx).trim() : null;
                                            const body = colonIdx > -1 ? cleaned.slice(colonIdx + 1).trim() : cleaned;
                                            const color = colors[i % colors.length];
                                            return (
                                                <div key={i} style={{ background: `${color}08`, borderLeft: `3px solid ${color}`, borderRadius: '10px', padding: '0.9rem 1.1rem' }}>
                                                    {title && <div style={{ fontWeight: 700, fontSize: '0.82rem', color, marginBottom: '0.4rem' }}>{i + 1}. {title}</div>}
                                                    <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: '1.65', color: 'var(--text-main)' }}>{body}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            ) : subTab === 'assigned' ? (
                <div className="dashboard-grid">
                    {(() => {
                        const completedItems = assignedContents.filter((item: any) => item.status === 'completed');
                        const averageScore = completedItems.length > 0
                            ? completedItems.reduce((sum: number, item: any) => sum + (Number(item.resultSummary?.scorePct) || 0), 0) / completedItems.length
                            : 0;

                        return (
                            <>
                                <div className="card" style={{ gridColumn: 'span 4' }}>
                                    <div className="card-title"><ClipboardList size={18} /> Toplam Deneme/Test</div>
                                    <div className="card-value" style={{ fontSize: '2rem' }}>{assignedContents.length}</div>
                                    <div className="card-subtitle">Öğrenciye gönderilen içerik sayısı</div>
                                </div>
                                <div className="card" style={{ gridColumn: 'span 4' }}>
                                    <div className="card-title"><CheckCircle2 size={18} /> Tamamlanan</div>
                                    <div className="card-value" style={{ fontSize: '2rem', color: '#059669' }}>{completedItems.length}</div>
                                    <div className="card-subtitle">Bitirilip sonucu oluşan atama</div>
                                </div>
                                <div className="card" style={{ gridColumn: 'span 4' }}>
                                    <div className="card-title"><BarChart3 size={18} /> Ortalama Başarı</div>
                                    <div className="card-value" style={{ fontSize: '2rem', color: 'var(--primary)' }}>%{averageScore.toFixed(1)}</div>
                                    <div className="card-subtitle">Tamamlanan içeriklerin ortalaması</div>
                                </div>
                            </>
                        );
                    })()}

                    <div className="card" style={{ gridColumn: 'span 12' }}>
                        <div className="card-title"><FileText size={18} /> Deneme ve Test Sonuçları</div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            Öğrencinin panelden gönderilen PDF/test atamalarındaki durum, süre ve sonuç özeti burada görünür.
                        </p>

                        {assignedContents.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {assignedContents.map((item: any) => {
                                    const status = formatAssignedStatus(String(item.status || 'pending'));
                                    const summary = item.resultSummary || null;
                                    const sectionResults = Array.isArray(summary?.sections) ? summary.sections : [];
                                    const totalQuestions = Number(summary?.totalQuestions) || 0;

                                    return (
                                        <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: '18px', padding: '1.25rem', background: '#fff' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>
                                                            {item.content?.title || 'Deneme ve Test'}
                                                        </h3>
                                                        <span style={{ padding: '0.28rem 0.7rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: status.bg, color: status.color, border: `1px solid ${status.border}` }}>
                                                            {status.label}
                                                        </span>
                                                        <span style={{ padding: '0.28rem 0.7rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>
                                                            {(item.content?.type || 'test').toUpperCase()}
                                                        </span>
                                                        {(item.integrityLog?.backgroundSwitchCount || 0) > 0 && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.28rem 0.7rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }} title="Öğrenci sınav esnasında uygulamadan çıkış yapmıştır.">
                                                                <AlertTriangle size={12} /> {item.integrityLog.backgroundSwitchCount} Kere Arka Plana Aldı
                                                            </span>
                                                        )}
                                                        {item.integrityLog?.autoSubmitted && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.28rem 0.7rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }} title="Sınav süresi dolduğu için sistem tarafından otomatik teslim edilmiştir.">
                                                                <Clock size={12} /> Zaman Aşımı (Otomatik Teslim)
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ color: '#64748b', fontSize: '0.88rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                                        <span>{item.content?.course || 'Genel'}</span>
                                                        <span>{item.content?.examScope || 'TYT'}</span>
                                                        <span>{item.content?.sections?.length || 0} bölüm</span>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', minWidth: '320px', flex: 1 }}>
                                                    <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '0.8rem 0.9rem', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Teslim</div>
                                                        <div style={{ marginTop: '0.35rem', fontWeight: 700, color: '#334155' }}>{formatDateTime(item.dueAt)}</div>
                                                    </div>
                                                    <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '0.8rem 0.9rem', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Aktif Süre</div>
                                                        <div style={{ marginTop: '0.35rem', fontWeight: 700, color: '#334155' }}>{formatDurationLabel(item.activeDurationSeconds)}</div>
                                                    </div>
                                                    <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '0.8rem 0.9rem', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Tamamlanma</div>
                                                        <div style={{ marginTop: '0.35rem', fontWeight: 700, color: '#334155' }}>{formatDateTime(item.completedAt)}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {summary ? (
                                                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
                                                        <div style={{ background: '#eef2ff', borderRadius: '16px', padding: '0.9rem 1rem', border: '1px solid #c7d2fe' }}>
                                                            <div style={{ fontSize: '0.72rem', color: '#6366f1', fontWeight: 800, textTransform: 'uppercase' }}>Başarı</div>
                                                            <div style={{ marginTop: '0.35rem', fontWeight: 900, fontSize: '1.4rem', color: '#4338ca' }}>%{Number(summary.scorePct || 0).toFixed(1)}</div>
                                                        </div>
                                                        <div style={{ background: '#ecfdf5', borderRadius: '16px', padding: '0.9rem 1rem', border: '1px solid #a7f3d0' }}>
                                                            <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 800, textTransform: 'uppercase' }}>Doğru</div>
                                                            <div style={{ marginTop: '0.35rem', fontWeight: 900, fontSize: '1.4rem', color: '#047857' }}>{summary.correct || 0}</div>
                                                        </div>
                                                        <div style={{ background: '#fef2f2', borderRadius: '16px', padding: '0.9rem 1rem', border: '1px solid #fecaca' }}>
                                                            <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 800, textTransform: 'uppercase' }}>Yanlış</div>
                                                            <div style={{ marginTop: '0.35rem', fontWeight: 900, fontSize: '1.4rem', color: '#b91c1c' }}>{summary.wrong || 0}</div>
                                                        </div>
                                                        <div style={{ background: '#fff7ed', borderRadius: '16px', padding: '0.9rem 1rem', border: '1px solid #fdba74' }}>
                                                            <div style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 800, textTransform: 'uppercase' }}>Boş</div>
                                                            <div style={{ marginTop: '0.35rem', fontWeight: 900, fontSize: '1.4rem', color: '#c2410c' }}>{summary.blank || 0}</div>
                                                        </div>
                                                        <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '0.9rem 1rem', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Net</div>
                                                            <div style={{ marginTop: '0.35rem', fontWeight: 900, fontSize: '1.4rem', color: '#0f172a' }}>{Number(summary.net || 0).toFixed(2)}</div>
                                                        </div>
                                                        <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '0.9rem 1rem', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Toplam Soru</div>
                                                            <div style={{ marginTop: '0.35rem', fontWeight: 900, fontSize: '1.4rem', color: '#0f172a' }}>{totalQuestions}</div>
                                                        </div>
                                                    </div>

                                                    {sectionResults.length > 0 && (
                                                        <div>
                                                            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.7rem' }}>Ders / Bölüm Sonuçları</div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                                                                {sectionResults.map((section: any) => (
                                                                    <div key={section.id || section.title} style={{ background: '#f8fafc', borderRadius: '16px', padding: '1rem', border: '1px solid #e2e8f0' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.65rem' }}>
                                                                            <div style={{ fontWeight: 800, color: '#1e293b' }}>{section.course || section.title}</div>
                                                                            <span style={{ fontSize: '0.72rem', color: '#6366f1', background: '#eef2ff', borderRadius: '999px', padding: '0.22rem 0.55rem', fontWeight: 800 }}>
                                                                                {section.questionCount || 0} soru
                                                                            </span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>
                                                                            <span>{section.correct || 0}D</span>
                                                                            <span>{section.wrong || 0}Y</span>
                                                                            <span>{section.blank || 0}B</span>
                                                                            <span>{Number(section.net || 0).toFixed(2)} net</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ marginTop: '1rem', background: '#f8fafc', borderRadius: '16px', padding: '1rem', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>
                                                    Bu atama için henüz sonuç oluşmadı. Öğrenci optiği tamamladığında doğru-yanlış-net özeti burada görünecek.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                Bu öğrenciye henüz panelden atanmış PDF/test gönderimi yapılmamış.
                            </div>
                        )}
                    </div>
                </div>
            ) : subTab === 'smartquiz' ? (
                <div className="quiz-studio-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '2rem' }}>
                    {/* Header & Magic Templates */}
                    <div className="quiz-header-row" style={{ gridColumn: 'span 12', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1rem' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 900, background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.03em' }}>
                                Quiz Studio
                            </h1>
                            <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 500 }}>
                                {student.name} için kişiselleştirilmiş öğrenme deneyimi oluşturun.
                            </p>
                        </div>

                    </div>

                    {/* Main Configuration Pad */}
                    <div className="card quiz-config-pad" style={{
                        gridColumn: 'span 8', padding: '2.5rem', borderRadius: '32px',
                        background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'var(--glass-effect)',
                        border: '1px solid rgba(255, 255, 255, 0.5)', position: 'relative', overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '6px', background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)' }} />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                            {/* Segmented Controls Row */}
                            <div className="quiz-segmented-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', display: 'block' }}>SINAV TÜRÜ</label>
                                    <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '20px', padding: '0.5rem', gap: '0.25rem', border: '1px solid #e2e8f0' }}>
                                        {(['TYT', 'AYT'] as QuizExamType[]).map((type) => {
                                            const active = quizExamType === type;
                                            return (
                                                <button key={type} onClick={() => { setQuizExamType(type); setQuizSelectionMode('suggested'); }}
                                                    style={{
                                                        flex: 1, border: 'none', background: active ? 'white' : 'transparent',
                                                        color: active ? '#1e293b' : '#64748b', borderRadius: '14px',
                                                        padding: '0.8rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s ease',
                                                        boxShadow: active ? '0 10px 20px -5px rgba(0,0,0,0.1)' : 'none', scale: active ? '1' : '1'
                                                    }}>{type}</button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', display: 'block' }}>STRATEJİK ÖNCELİK</label>
                                    <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '20px', padding: '0.5rem', gap: '0.5rem', border: '1px solid #e2e8f0' }}>
                                        {[
                                            { value: 'Ogretmen Onerisi', short: 'Standart', color: '#6366f1' },
                                            { value: 'Bugun Cozulmeli', short: 'Acil', color: '#f59e0b' },
                                            { value: 'Yuksek Oncelik', short: 'KRİTİK', color: '#ef4444' },
                                        ].map((opt) => {
                                            const active = manualQuizForm.riskLabel === opt.value;
                                            return (
                                                <button key={opt.value} onClick={() => setManualQuizForm((prev) => ({ ...prev, riskLabel: opt.value }))}
                                                    style={{
                                                        flex: 1, border: 'none', background: active ? opt.color : 'transparent',
                                                        color: active ? 'white' : '#64748b', borderRadius: '14px',
                                                        padding: '0.8rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s ease'
                                                    }}>{opt.short}</button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Intensity Selector */}
                            <div>
                                <label className="quiz-section-label" style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.25rem', display: 'block' }}>QUIZ DERİNLİĞİ</label>
                                <div className="quiz-intensity-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                                    {[
                                        { value: 3, label: 'Hızlı Tarama', desc: '3 Kritik Soru', icon: '⚡' },
                                        { value: 5, label: 'Standart Quiz', desc: '5 Dengeli Soru', icon: '📝' },
                                        { value: 8, label: 'Derin Analiz', desc: '8 Detaylı Soru', icon: '🔬' },
                                    ].map((opt) => {
                                        const active = manualQuizForm.questionCount === opt.value;
                                        return (
                                            <div key={opt.value} onClick={() => setManualQuizForm((prev) => ({ ...prev, questionCount: opt.value }))}
                                                style={{
                                                    padding: '1.25rem', borderRadius: '24px', cursor: 'pointer',
                                                    background: active ? 'white' : '#f8faff', border: '2px solid',
                                                    borderColor: active ? 'var(--primary)' : 'transparent',
                                                    boxShadow: active ? 'var(--shadow-md)' : 'none',
                                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    display: 'flex', gap: '1rem', alignItems: 'center',
                                                    transform: active ? 'scale(1.05)' : 'scale(1)'
                                                }}>
                                                <div style={{ fontSize: '1.5rem', background: active ? 'rgba(99, 102, 241, 0.1)' : 'white', width: '50px', height: '50px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{opt.icon}</div>
                                                <div>
                                                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: active ? 'var(--primary)' : '#475569' }}>{opt.label}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem', fontWeight: 600 }}>{opt.desc}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Course & Topic Studio */}
                            <div style={{ background: '#f8fafc', borderRadius: '32px', padding: '2rem', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>Ders ve Konu Seçimi</h3>
                                    <div style={{ display: 'flex', gap: '0.5rem', background: 'white', padding: '0.35rem', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                        {['suggested', 'curriculum'].map((m) => (
                                            <button key={m} onClick={() => setQuizSelectionMode(m as any)} style={{
                                                padding: '0.5rem 1rem', borderRadius: '12px', border: 'none', cursor: 'pointer',
                                                background: quizSelectionMode === m ? '#1e293b' : 'transparent',
                                                color: quizSelectionMode === m ? 'white' : '#64748b', fontSize: '0.75rem', fontWeight: 800, transition: 'all 0.2s'
                                            }}>{m === 'suggested' ? 'Önerilenler' : 'Müfredat Gezgini'}</button>
                                        ))}
                                    </div>
                                </div>

                                {quizSelectionMode === 'curriculum' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        {curriculumLoading ? (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Müfredat yükleniyor...</div>
                                        ) : !curriculum ? (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>Müfredat verisi alınamadı.</div>
                                        ) : (
                                            <>
                                                <div className="quiz-course-scroll-wrapper" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                                                    {filteredCurriculumCourses.map((c: any) => {
                                                        const active = resolvedQuizCourse === c.courseName;
                                                        return (
                                                            <div key={c.courseId} onClick={() => setManualQuizForm(p => ({ ...p, course: c.courseName, topic: '' }))}
                                                                className="quiz-course-card"
                                                                style={{
                                                                    padding: '0.8rem', borderRadius: '16px', cursor: 'pointer',
                                                                    background: active ? 'white' : 'transparent', border: '2px solid',
                                                                    borderColor: active ? 'var(--primary)' : '#e2e8f0',
                                                                    transition: 'all 0.2s', textAlign: 'center',
                                                                    boxShadow: active ? 'var(--shadow-sm)' : 'none'
                                                                }}>
                                                                <div className="quiz-course-icon" style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>{c.icon}</div>
                                                                <div className="quiz-course-name" style={{ fontWeight: 800, fontSize: '0.75rem', color: active ? 'var(--primary)' : '#1e293b' }}>{c.courseName}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {resolvedQuizCourse && (
                                                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', background: 'white', padding: '1.2rem', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                                                        {(filteredCurriculumCourses.find((c: any) => c.courseName === resolvedQuizCourse)?.topics || []).flatMap((t: any) =>
                                                            t.subTopics ? t.subTopics.map((st: any) => ({ ...st, parentTopic: t.name })) : [{ ...t, parentTopic: t.name }]
                                                        ).map((st: any) => (
                                                            <button key={st.id || st.name} onClick={() => setManualQuizForm(p => ({ ...p, topic: st.name }))}
                                                                style={{
                                                                    padding: '0.5rem 0.9rem', borderRadius: '10px', border: '1.5px solid',
                                                                    borderColor: resolvedQuizTopic === st.name ? '#1e293b' : '#f1f5f9',
                                                                    background: resolvedQuizTopic === st.name ? '#1e293b' : '#f8fafc',
                                                                    color: resolvedQuizTopic === st.name ? 'white' : '#475569',
                                                                    fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                                                                }}>{st.name}</button>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        {visibleQuizCourses.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontWeight: 600 }}>Öğrenci verisi bulunamadı. Müfredat gezginini kullanabilirsiniz.</div>
                                        ) : (
                                            <>
                                                <div className="quiz-course-scroll-wrapper" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                                                    {visibleQuizCourses.map((bucket) => (
                                                        <div key={bucket.course} onClick={() => setManualQuizForm(p => ({ ...p, course: bucket.course, topic: '' }))}
                                                            className="quiz-course-card"
                                                            style={{
                                                                padding: '1.2rem', borderRadius: '24px', cursor: 'pointer', background: resolvedQuizCourse === bucket.course ? 'white' : 'transparent',
                                                                border: '2px solid', borderColor: resolvedQuizCourse === bucket.course ? 'var(--primary)' : '#e2e8f0',
                                                                transition: 'all 0.3s', textAlign: 'center', boxShadow: resolvedQuizCourse === bucket.course ? 'var(--shadow-md)' : 'none'
                                                            }}>
                                                            <div className="quiz-course-name" style={{ fontWeight: 800, fontSize: '0.9rem', color: resolvedQuizCourse === bucket.course ? 'var(--primary)' : '#1e293b' }}>{bucket.course}</div>
                                                            <div className="quiz-course-meta" style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.4rem' }}>{bucket.topics.length} Kritik Konu</div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="quiz-topic-chip-container" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', background: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                                                    {(visibleQuizCourses.find(b => b.course === resolvedQuizCourse)?.topics || []).map(t => (
                                                        <button key={t.topic} onClick={() => setManualQuizForm(p => ({ ...p, topic: t.topic }))}
                                                            style={{
                                                                padding: '0.7rem 1.2rem', borderRadius: '16px', border: '2px solid',
                                                                borderColor: resolvedQuizTopic === t.topic ? '#1e293b' : '#f1f5f9',
                                                                background: resolvedQuizTopic === t.topic ? '#1e293b' : '#f8fafc',
                                                                color: resolvedQuizTopic === t.topic ? 'white' : '#475569',
                                                                fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s'
                                                            }}>{t.topic}</button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Summary "Flight Ticket" Panel */}
                    <div className="quiz-summary-panel" style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div style={{
                            background: 'white', borderRadius: '32px', overflow: 'hidden', boxShadow: 'var(--shadow-xl)',
                            border: '1px solid #e2e8f0', position: 'relative'
                        }}>
                            <div style={{ padding: '2rem', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', color: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem', borderRadius: '12px' }}><ClipboardList size={20} /></div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase' }}>ATANAN DERS</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>{resolvedQuizCourse || 'Ders Seçilmedi'}</div>

                                <div style={{ height: '1px', borderTop: '2px dashed rgba(255,255,255,0.15)', margin: '0 -2rem 1.5rem -2rem' }} />

                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase' }}>HEDEF KONU</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: resolvedQuizTopic ? '#818cf8' : 'rgba(255,255,255,0.15)', marginBottom: '1.5rem' }}>{resolvedQuizTopic || 'Konu Seçilmedi'}</div>
                            </div>

                            <div style={{ padding: '2rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Kapsam</div>
                                        <div style={{ fontWeight: 900, fontSize: '1rem', color: '#1e293b' }}>{quizExamType}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Miktar</div>
                                        <div style={{ fontWeight: 900, fontSize: '1rem', color: '#1e293b' }}>{manualQuizForm.questionCount} Soru</div>
                                    </div>
                                </div>

                                <textarea value={manualQuizForm.reason} onChange={(e) => setManualQuizForm(p => ({ ...p, reason: e.target.value }))}
                                    placeholder="Öğrenciye özel mesajınız..." style={{
                                        width: '100%', padding: '1.2rem', borderRadius: '24px', border: '1px solid #e2e8f0',
                                        background: '#f8fafc', height: '120px', resize: 'none', outline: 'none', fontSize: '0.9rem', font: 'inherit', fontWeight: 600
                                    }} />

                                <div style={{ display: 'flex', gap: '0.9rem', marginTop: '2rem' }}>
                                    <button onClick={handleSendManualQuiz} disabled={quizSending || !resolvedQuizCourse || !resolvedQuizTopic} style={{
                                        flex: 1, padding: '1.25rem', borderRadius: '24px', border: 'none',
                                        background: quizSending || !resolvedQuizCourse || !resolvedQuizTopic ? '#cbd5e1' : 'var(--primary)', color: 'white', fontWeight: 900,
                                        fontSize: '1.1rem', cursor: quizSending || !resolvedQuizCourse || !resolvedQuizTopic ? 'not-allowed' : 'pointer', transition: 'all 0.3s',
                                        boxShadow: quizSending || !resolvedQuizCourse || !resolvedQuizTopic ? 'none' : '0 20px 30px -10px var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem'
                                    }}>{quizSending ? 'Kaydediliyor...' : <><Zap size={22} fill="white" /> {editingQuizId ? 'QUIZI GUNCELLE' : 'QUIZ GONDER'}</>}</button>
                                    {editingQuizId && (
                                        <button
                                            onClick={resetManualQuizForm}
                                            disabled={quizSending}
                                            style={{
                                                padding: '1.25rem 1.1rem',
                                                borderRadius: '24px',
                                                border: '1px solid #cbd5e1',
                                                background: 'white',
                                                color: '#475569',
                                                fontWeight: 900,
                                                cursor: quizSending ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.6rem'
                                            }}
                                        >
                                            <X size={18} /> Vazgeç
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div style={{ position: 'absolute', bottom: '-40px', left: '-40px', width: '200px', height: '200px', background: 'var(--primary)', opacity: 0.05, borderRadius: '50%', pointerEvents: 'none' }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            {[
                                { label: 'Bekleyen', val: pendingSmartQuizCount, color: '#3b82f6' },
                                { label: 'Tamamlanan', val: completedSmartQuiz.length, color: '#10b981' }
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ padding: '1.5rem', textAlign: 'center', borderRadius: '24px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{s.label}</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color }}>{s.val}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="quiz-analysis-grid" style={{ gridColumn: 'span 12', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem' }}>
                        <div className="card" style={{ gridColumn: 'span 4', padding: '1.5rem', borderRadius: '28px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
                                <div style={{ width: 42, height: 42, borderRadius: '14px', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
                                    <TrendingUp size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Başarı Trendi</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>Son 5 quiz akışı</div>
                                </div>
                            </div>
                            {completedTrend.length === 0 ? (
                                <div style={{ color: '#94a3b8', fontWeight: 600, padding: '1rem 0' }}>Trend görmek için tamamlanan quiz gerekiyor.</div>
                            ) : (
                                <>
                                    <div className="quiz-stats-inner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem', marginBottom: '1rem' }}>
                                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '1rem' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Son Quiz</div>
                                            <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 900, color: (latestCompletedQuiz?.scorePct || 0) >= 67 ? '#059669' : '#dc2626' }}>
                                                %{latestCompletedQuiz?.scorePct || 0}
                                            </div>
                                            <div style={{ marginTop: '0.35rem', color: '#475569', fontWeight: 700, fontSize: '0.82rem' }}>
                                                {latestCompletedQuiz?.topic || 'Konu yok'}
                                            </div>
                                        </div>
                                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '1rem' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Değişim</div>
                                            <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 900, color: trendDelta >= 0 ? '#059669' : '#dc2626' }}>
                                                {trendDelta >= 0 ? '+' : ''}{Math.round(trendDelta)}
                                            </div>
                                            <div style={{ marginTop: '0.35rem', color: '#475569', fontWeight: 700, fontSize: '0.82rem' }}>
                                                {previousCompletedQuiz ? `${previousCompletedQuiz.scorePct}% sonrası` : 'İlk kıyas yok'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                        {completedTrend.map((attempt: any, index: number) => (
                                            <div key={attempt.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 62px', gap: '0.8rem', alignItems: 'center' }}>
                                                <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 800 }}>
                                                    Q{index + 1}
                                                </div>
                                                <div style={{ background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', height: '10px' }}>
                                                    <div style={{
                                                        width: `${Math.max(8, attempt.scorePct)}%`,
                                                        height: '100%',
                                                        borderRadius: '999px',
                                                        background: attempt.scorePct >= 67
                                                            ? 'linear-gradient(90deg, #34d399, #10b981)'
                                                            : 'linear-gradient(90deg, #fb7185, #ef4444)'
                                                    }} />
                                                </div>
                                                <div style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 900, color: '#475569' }}>
                                                    %{attempt.scorePct}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ marginTop: '1rem', padding: '0.9rem 1rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                                        <div style={{ color: '#64748b', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.25rem' }}>Yorum</div>
                                        <div style={{ color: '#1e293b', fontWeight: 800, fontSize: '0.9rem', lineHeight: 1.5 }}>
                                            {trendSummary}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="card quiz-analysis-card" style={{ gridColumn: 'span 4', padding: '1.5rem', borderRadius: '28px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
                                <div style={{ width: 42, height: 42, borderRadius: '14px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
                                    <Sparkles size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Kaynak Dağılımı</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>Kim gönderdi, ne durumda</div>
                                </div>
                            </div>
                            <div className="quiz-stats-inner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
                                {[
                                    { label: 'Öğretmen', value: teacherAssignedCount, color: '#7c3aed', bg: '#f5f3ff' },
                                    { label: 'Sistem', value: systemAssignedCount, color: '#2563eb', bg: '#eff6ff' },
                                    { label: 'Açıldı', value: inProgressSmartQuizCount, color: '#d97706', bg: '#fffbeb' },
                                    { label: 'Tekrar', value: supportNeededCount, color: '#dc2626', bg: '#fef2f2' },
                                ].map((item) => (
                                    <div key={item.label} style={{ borderRadius: '18px', padding: '1rem', background: item.bg, border: '1px solid rgba(148,163,184,0.12)' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{item.label}</div>
                                        <div style={{ marginTop: '0.35rem', fontSize: '1.5rem', fontWeight: 900, color: item.color }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card" style={{ gridColumn: 'span 4', padding: '1.5rem', borderRadius: '28px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
                                <div style={{ width: 42, height: 42, borderRadius: '14px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316' }}>
                                    <AlertTriangle size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Zayıf Konu Kümeleri</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>Tekrar isteyen odaklar</div>
                                </div>
                            </div>
                            <div className="quiz-weak-clusters-grid" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {weakTopicClusters.length === 0 ? (
                                    <div style={{ color: '#94a3b8', fontWeight: 600, padding: '0.8rem 0' }}>Henüz kümelenecek tamamlanmış quiz yok.</div>
                                ) : weakTopicClusters.map((cluster: any) => (
                                    <div key={cluster.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', borderRadius: '16px', background: '#fff', border: '1px solid #eef2ff' }}>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase' }}>{cluster.course}</div>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1e293b', marginTop: '0.2rem' }}>{cluster.topic}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1rem', fontWeight: 900, color: cluster.avgScore < 67 ? '#dc2626' : '#059669' }}>%{cluster.avgScore}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>{cluster.attempts} quiz</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ gridColumn: 'span 12', padding: '1.7rem', borderRadius: '30px', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0', boxShadow: '0 22px 50px -28px rgba(15,23,42,0.18)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.45rem' }}>
                                    <div style={{ width: 42, height: 42, borderRadius: '15px', background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)', border: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}>
                                        <Sparkles size={18} color="#4f46e5" />
                                    </div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>Akıllı Quiz Genel Analizi</div>
                                </div>
                                <p style={{ margin: 0, color: '#64748b', fontWeight: 500 }}>
                                    Tamamlanan ve bekleyen quiz akışını tek çatı altında yorumlar.
                                </p>
                            </div>
                            <button
                                onClick={handleAnalyzeSmartQuizOverview}
                                disabled={smartQuizOverviewLoading || enrichedSmartQuizAttempts.length === 0}
                                style={{
                                    border: '1px solid #c7d2fe',
                                    borderRadius: '16px',
                                    padding: '0.9rem 1.1rem',
                                    background: smartQuizOverviewLoading ? '#eef2ff' : 'linear-gradient(180deg, #ffffff 0%, #eef2ff 100%)',
                                    color: smartQuizOverviewLoading ? '#94a3b8' : '#4338ca',
                                    fontWeight: 800,
                                    cursor: smartQuizOverviewLoading || enrichedSmartQuizAttempts.length === 0 ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.55rem',
                                    boxShadow: smartQuizOverviewLoading ? 'none' : '0 14px 28px -18px rgba(79,70,229,0.45)'
                                }}
                            >
                                <Zap size={15} /> {smartQuizOverviewLoading ? 'Analiz...' : 'AI ile Analiz Et'}
                            </button>
                        </div>
                        <div style={{ marginTop: '1.2rem', background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '1.25rem 1.35rem', lineHeight: 1.8, color: '#334155', fontWeight: 500, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)' }}>
                            {smartQuizOverviewAnalysis || 'Henüz genel bir quiz analizi üretilmedi. Butona basınca öğrencinin tüm quiz geçmişi birlikte yorumlanır.'}
                        </div>
                    </div>

                    {/* Timeline Feed */}
                    <div className="card" style={{ gridColumn: 'span 12', padding: '2.5rem', borderRadius: '32px', background: 'white', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>Akıllı Quiz Akışı</h2>
                                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontWeight: 500 }}>
                                    Durum, kaynak, başarı ve tekrar ihtiyacını tek yerden takip edin.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.55rem 0.9rem', borderRadius: '14px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)' }}>
                                    Ortalama Başarı: %{avgSmartQuizScore}
                                </div>
                                {supportNeededCount > 0 && (
                                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.55rem 0.9rem', borderRadius: '14px', fontSize: '0.8rem', fontWeight: 800 }}>
                                        {supportNeededCount} quiz tekrar istiyor
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="quiz-filter-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr', gap: '1rem', marginBottom: '1.25rem' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    value={smartQuizSearch}
                                    onChange={(e) => setSmartQuizSearch(e.target.value)}
                                    placeholder="Ders, konu veya öğretmen notunda ara..."
                                    style={{
                                        width: '100%',
                                        padding: '0.95rem 1rem 0.95rem 2.8rem',
                                        borderRadius: '18px',
                                        border: '1px solid #e2e8f0',
                                        background: '#f8fafc',
                                        fontSize: '0.92rem',
                                        fontWeight: 600,
                                        outline: 'none'
                                    }}
                                />
                            </div>
                            <div style={{ position: 'relative' }} ref={smartQuizFilterRef}>
                                <Filter size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <button
                                    type="button"
                                    onClick={() => setIsSmartQuizFilterOpen((prev) => !prev)}
                                    style={{
                                        width: '100%',
                                        padding: '0.95rem 1rem 0.95rem 2.8rem',
                                        borderRadius: '18px',
                                        border: '1px solid #e2e8f0',
                                        background: '#f8fafc',
                                        fontSize: '0.92rem',
                                        fontWeight: 700,
                                        outline: 'none',
                                        appearance: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '1rem',
                                        color: '#1e293b',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span>{activeSmartQuizFilterLabel}</span>
                                    <ChevronDown
                                        size={18}
                                        style={{
                                            color: '#94a3b8',
                                            transform: isSmartQuizFilterOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                            transition: 'transform 0.2s ease'
                                        }}
                                    />
                                </button>
                                {isSmartQuizFilterOpen && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 0.7rem)',
                                            left: 0,
                                            minWidth: '240px',
                                            padding: '0.65rem',
                                            borderRadius: '24px',
                                            background: 'rgba(255,255,255,0.96)',
                                            border: '1px solid rgba(148,163,184,0.2)',
                                            boxShadow: '0 28px 64px rgba(15,23,42,0.16)',
                                            backdropFilter: 'blur(12px)',
                                            zIndex: 20,
                                        }}
                                    >
                                        {smartQuizFilterOptions.map((item) => {
                                            const isActive = smartQuizFilter === item.value;
                                            return (
                                                <button
                                                    key={item.value}
                                                    type="button"
                                                    onClick={() => {
                                                        setSmartQuizFilter(item.value as any);
                                                        setIsSmartQuizFilterOpen(false);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        border: 'none',
                                                        background: isActive ? '#eef2ff' : 'transparent',
                                                        color: isActive ? '#1e293b' : '#334155',
                                                        borderRadius: '18px',
                                                        padding: '0.95rem 1rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: '1rem',
                                                        fontSize: '0.92rem',
                                                        fontWeight: isActive ? 800 : 700,
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                    }}
                                                >
                                                    <span>{item.label}</span>
                                                    {isActive && <CheckCircle2 size={17} color="#4f46e5" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div style={{ position: 'relative' }} ref={smartQuizSortRef}>
                                <ArrowUpDown size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <button
                                    type="button"
                                    onClick={() => setIsSmartQuizSortOpen((prev) => !prev)}
                                    style={{
                                        width: '100%',
                                        padding: '0.95rem 1rem 0.95rem 2.8rem',
                                        borderRadius: '18px',
                                        border: '1px solid #e2e8f0',
                                        background: '#f8fafc',
                                        fontSize: '0.92rem',
                                        fontWeight: 700,
                                        outline: 'none',
                                        appearance: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '1rem',
                                        color: '#1e293b',
                                        cursor: 'pointer',
                                        minWidth: '320px'
                                    }}
                                >
                                    <span>{activeSmartQuizSortLabel}</span>
                                    <ChevronDown
                                        size={18}
                                        style={{
                                            color: '#94a3b8',
                                            transform: isSmartQuizSortOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                            transition: 'transform 0.2s ease'
                                        }}
                                    />
                                </button>
                                {isSmartQuizSortOpen && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 0.7rem)',
                                            right: 0,
                                            minWidth: '320px',
                                            padding: '0.65rem',
                                            borderRadius: '24px',
                                            background: 'rgba(255,255,255,0.96)',
                                            border: '1px solid rgba(148,163,184,0.2)',
                                            boxShadow: '0 28px 64px rgba(15,23,42,0.16)',
                                            backdropFilter: 'blur(12px)',
                                            zIndex: 20,
                                        }}
                                    >
                                        {smartQuizSortOptions.map((option) => {
                                            const isActive = option.value === smartQuizSort;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => {
                                                        setSmartQuizSort(option.value as any);
                                                        setIsSmartQuizSortOpen(false);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        border: 'none',
                                                        background: isActive ? '#eef2ff' : 'transparent',
                                                        color: isActive ? '#1e293b' : '#334155',
                                                        borderRadius: '18px',
                                                        padding: '0.95rem 1rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: '1rem',
                                                        fontSize: '0.98rem',
                                                        fontWeight: isActive ? 800 : 700,
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                    }}
                                                >
                                                    <span>{option.label}</span>
                                                    {isActive ? (
                                                        <CheckCircle2 size={17} color="#4f46e5" />
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {enrichedSmartQuizAttempts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '4rem', background: '#f8fafc', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                                    <h3 style={{ color: '#94a3b8', fontWeight: 700 }}>Henüz bir iz bırakılmadı.</h3>
                                    <p style={{ color: '#cbd5e1', fontWeight: 500 }}>İlk quizinizi göndererek yolculuğu başlatın.</p>
                                </div>
                            ) : filteredSmartQuizAttempts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '24px', border: '1px dashed #cbd5e1' }}>
                                    <h3 style={{ color: '#64748b', fontWeight: 800 }}>Bu filtreyle eşleşen quiz yok.</h3>
                                    <p style={{ color: '#94a3b8', fontWeight: 500 }}>Arama veya filtreleri gevşetip tekrar bakabiliriz.</p>
                                </div>
                            ) : (
                                filteredSmartQuizAttempts.map((attempt: any) => {
                                    const completed = attempt.status === 'completed';
                                    const tone = completed ? (attempt.isNeedsSupport ? '#dc2626' : '#10b981') : attempt.status === 'in_progress' ? '#d97706' : '#6366f1';
                                    return (
                                        <div key={attempt.id} className="quiz-flow-card" style={{
                                            padding: '1.5rem', borderRadius: '24px', background: '#f8faff', border: '1px solid #e2e8f0',
                                            display: 'grid', gridTemplateColumns: '2.3fr 1fr', gap: '1.5rem', transition: 'transform 0.2s'
                                        }} onMouseOver={e => e.currentTarget.style.transform = 'translateX(8px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateX(0)'}>
                                            <div style={{ display: 'flex', gap: '1.25rem' }}>
                                                <div style={{ width: '12px', minWidth: '12px', borderRadius: '999px', background: tone, boxShadow: `0 0 14px ${tone}44` }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem' }}>
                                                        <span style={{ fontWeight: 900, fontSize: '1.08rem', color: '#1e293b' }}>{attempt.topic}</span>
                                                        <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 800, background: '#eef2ff', padding: '0.35rem 0.7rem', borderRadius: '999px' }}>{attempt.course}</span>
                                                        <span style={{ fontSize: '0.76rem', color: attempt.source.color, background: attempt.source.bg, fontWeight: 800, padding: '0.35rem 0.7rem', borderRadius: '999px' }}>{attempt.source.label}</span>
                                                        <span style={{ fontSize: '0.76rem', color: attempt.statusMeta.color, background: attempt.statusMeta.bg, fontWeight: 800, padding: '0.35rem 0.7rem', borderRadius: '999px' }}>{attempt.statusMeta.label}</span>
                                                    </div>

                                                    <div style={{ color: '#475569', fontWeight: 600, lineHeight: 1.65, marginBottom: '0.9rem' }}>
                                                        {attempt.reason || 'Öğretmen notu bulunmuyor.'}
                                                    </div>

                                                    <div className="quiz-card-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                                                        <div style={{ background: 'white', borderRadius: '16px', padding: '0.8rem 0.9rem', border: '1px solid #eef2ff' }}>
                                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Gönderildi</div>
                                                            <div style={{ marginTop: '0.35rem', fontWeight: 800, color: '#1e293b', fontSize: '0.82rem' }}>{formatQuizDate(attempt.assignedAt)}</div>
                                                        </div>
                                                        <div style={{ background: 'white', borderRadius: '16px', padding: '0.8rem 0.9rem', border: '1px solid #eef2ff' }}>
                                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Son Hareket</div>
                                                            <div style={{ marginTop: '0.35rem', fontWeight: 800, color: '#1e293b', fontSize: '0.82rem' }}>{formatQuizDate(attempt.lastActionAt)}</div>
                                                        </div>
                                                        <div style={{ background: 'white', borderRadius: '16px', padding: '0.8rem 0.9rem', border: '1px solid #eef2ff' }}>
                                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Derinlik</div>
                                                            <div style={{ marginTop: '0.35rem', fontWeight: 800, color: '#1e293b', fontSize: '0.82rem' }}>{attempt.questionCount || 0} soru</div>
                                                        </div>
                                                        <div style={{ background: 'white', borderRadius: '16px', padding: '0.8rem 0.9rem', border: '1px solid #eef2ff' }}>
                                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Öncelik</div>
                                                            <div style={{ marginTop: '0.35rem', fontWeight: 800, color: '#1e293b', fontSize: '0.82rem' }}>{attempt.riskLabel || 'Takip'}</div>
                                                        </div>
                                                    </div>

                                                    <div className="quiz-action-buttons" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                        <button
                                                            onClick={() => handleAnalyzeSmartQuizAttempt(String(attempt.id))}
                                                            disabled={smartQuizCardLoadingId === String(attempt.id)}
                                                            style={{
                                                                border: '1px solid #dbeafe',
                                                                borderRadius: '14px',
                                                                padding: '0.8rem 1rem',
                                                                background: '#f8fbff',
                                                                color: '#2563eb',
                                                                fontWeight: 800,
                                                                cursor: smartQuizCardLoadingId === String(attempt.id) ? 'not-allowed' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.5rem'
                                                            }}
                                                        >
                                                            <Zap size={15} /> {smartQuizCardLoadingId === String(attempt.id) ? 'Analiz...' : 'AI ile Analiz Et'}
                                                        </button>
                                                        <button
                                                            onClick={() => startEditingQuiz(attempt)}
                                                            disabled={quizSending}
                                                            style={{
                                                                border: '1px solid #dbeafe',
                                                                borderRadius: '14px',
                                                                padding: '0.8rem 1rem',
                                                                background: '#eff6ff',
                                                                color: '#2563eb',
                                                                fontWeight: 800,
                                                                cursor: quizSending ? 'not-allowed' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.5rem'
                                                            }}
                                                        >
                                                            <Pencil size={15} /> Düzenle
                                                        </button>
                                                        {attempt.isNeedsSupport && (
                                                            <button
                                                                onClick={() => sendFollowUpQuiz(attempt, 'followup')}
                                                                disabled={quizSending}
                                                                style={{
                                                                    border: 'none',
                                                                    borderRadius: '14px',
                                                                    padding: '0.8rem 1rem',
                                                                    background: '#1e293b',
                                                                    color: 'white',
                                                                    fontWeight: 800,
                                                                    cursor: quizSending ? 'not-allowed' : 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.5rem'
                                                                }}
                                                            >
                                                                <RefreshCw size={15} /> Takip Quizi Oluştur
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => sendFollowUpQuiz(attempt, 'retry')}
                                                            disabled={quizSending}
                                                            style={{
                                                                border: '1px solid #c7d2fe',
                                                                borderRadius: '14px',
                                                                padding: '0.8rem 1rem',
                                                                background: '#eef2ff',
                                                                color: '#4338ca',
                                                                fontWeight: 800,
                                                                cursor: quizSending ? 'not-allowed' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.5rem'
                                                            }}
                                                        >
                                                            <Zap size={15} /> Benzerini Yeniden Gönder
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteQuiz(attempt)}
                                                            disabled={quizSending}
                                                            style={{
                                                                border: '1px solid #fecaca',
                                                                borderRadius: '14px',
                                                                padding: '0.8rem 1rem',
                                                                background: '#fff1f2',
                                                                color: '#dc2626',
                                                                fontWeight: 800,
                                                                cursor: quizSending ? 'not-allowed' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.5rem'
                                                            }}
                                                        >
                                                            <Trash2 size={15} /> Sil
                                                        </button>
                                                    </div>
                                                    {smartQuizCardAnalyses[String(attempt.id)] && (
                                                        <div style={{ marginTop: '1rem', background: '#ffffff', border: '1px solid #dbeafe', borderRadius: '18px', padding: '1rem 1.1rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.45rem' }}>
                                                                <Sparkles size={15} color="#4f46e5" />
                                                                <span style={{ fontSize: '0.78rem', fontWeight: 900, color: '#4f46e5', textTransform: 'uppercase' }}>AI Quiz Yorumu</span>
                                                            </div>
                                                            <div style={{ color: '#475569', fontWeight: 600, lineHeight: 1.75 }}>
                                                                {smartQuizCardAnalyses[String(attempt.id)]}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="quiz-flow-card-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'space-between' }}>
                                                <div className="quiz-status-summary" style={{ background: completed ? (attempt.isNeedsSupport ? '#fff1f2' : '#ecfdf5') : (attempt.status === 'in_progress' ? '#fffbeb' : '#eef2ff'), borderRadius: '22px', padding: '1.1rem', border: `1px solid ${completed ? (attempt.isNeedsSupport ? '#fecdd3' : '#bbf7d0') : (attempt.status === 'in_progress' ? '#fde68a' : '#c7d2fe')}` }}>
                                                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.45rem' }}>Mini Sonuç Özeti</div>
                                                    {completed ? (
                                                        <>
                                                            <div style={{ fontSize: '2rem', fontWeight: 900, color: tone, lineHeight: 1 }}>%{attempt.scorePct}</div>
                                                            <div style={{ marginTop: '0.45rem', fontSize: '0.85rem', color: '#475569', fontWeight: 700 }}>{attempt.correctCount}/{attempt.totalCount} doğru</div>
                                                            <div style={{ marginTop: '0.7rem', fontSize: '0.78rem', color: attempt.isNeedsSupport ? '#dc2626' : '#059669', fontWeight: 800 }}>
                                                                {attempt.isNeedsSupport ? 'Bu konu için yeniden temas öneriliyor.' : 'Konu bu turda güvenli görünüyor.'}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div style={{ fontSize: '1rem', fontWeight: 900, color: tone }}>{attempt.status === 'in_progress' ? 'Öğrenci başladı' : 'Henüz açılmadı'}</div>
                                                            <div style={{ marginTop: '0.55rem', fontSize: '0.82rem', color: '#64748b', fontWeight: 700 }}>
                                                                {attempt.status === 'in_progress'
                                                                    ? 'Quiz açılmış, devamı bekleniyor.'
                                                                    : 'Gönderim hazır, öğrencinin listesinde bekliyor.'}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                <div style={{ background: '#fff', borderRadius: '20px', padding: '1rem 1.1rem', border: '1px solid #eef2ff' }}>
                                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.6rem' }}>Zaman Çizgisi</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', color: '#475569', fontWeight: 700, fontSize: '0.82rem' }}>
                                                        <span>Atandı: {formatQuizDate(attempt.assignedAt)}</span>
                                                        {attempt.status === 'in_progress' && <span>Açıldı: {formatQuizDate(attempt.updatedAt)}</span>}
                                                        {attempt.completedAt && <span>Tamamlandı: {formatQuizDate(attempt.completedAt)}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            ) : subTab === 'archive' ? (
                <div className="card">
                    <div className="card-title"><ClipboardList size={18} /> Tüm Sınav Geçmişi</div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Sınav üzerine tıklayarak ders bazlı detayları görebilirsiniz.</p>
                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {exams.length > 0 ? [...exams].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((ex, idx) => (
                            <div key={idx} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                                <div
                                    onClick={() => setExpandedExamId(expandedExamId === ex.id ? null : ex.id)}
                                    style={{
                                        padding: '1.25rem',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        background: expandedExamId === ex.id ? '#f8fafc' : 'white',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Tarih</div>
                                            <div style={{ fontWeight: 700 }}>{ex.date || '---'}</div>
                                        </div>
                                        <div style={{ height: '30px', width: '1px', background: 'var(--border-color)' }} />
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>TYT NET</div>
                                            <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.1rem' }}>{ex.tytNet || 0}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>AYT NET</div>
                                            <div style={{ fontWeight: 700, color: '#a855f7', fontSize: '1.1rem' }}>{ex.aytNet || 0}</div>
                                        </div>
                                    </div>
                                    <Zap size={18} style={{ transform: expandedExamId === ex.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s', color: 'var(--text-muted)' }} />
                                </div>

                                {expandedExamId === ex.id && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        style={{ padding: '2rem', background: '#f8fafc', borderTop: '1px solid var(--border-color)' }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                                            {/* TYT Section */}
                                            <section>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                                                    <div style={{ height: '32px', width: '4px', background: 'var(--primary)', borderRadius: '2px' }} />
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        TYT DETAYLI KARNE
                                                        <div style={{ display: 'flex', gap: '0.4rem', marginLeft: '0.5rem' }}>
                                                            <span style={{ fontSize: '0.75rem', color: '#10b981', background: '#ecfdf5', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>{ex.tytDogru || 0}D</span>
                                                            <span style={{ fontSize: '0.75rem', color: '#ef4444', background: '#fef2f2', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>{ex.tytYanlis || 0}Y</span>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'rgba(99, 102, 241, 0.12)', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>{ex.tytNet || 0} Net</span>
                                                        </div>
                                                    </h3>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem' }}>
                                                    <SubjectCard label="Türkçe" value={ex.tytTur} correct={ex.tytTurD} wrong={ex.tytTurY} icon={Book} color="#10b981" />
                                                    <SubjectCard label="Matematik" value={ex.tytMat} correct={ex.tytMatD} wrong={ex.tytMatY} icon={Calculator} color="#3b82f6" />
                                                    <SubjectCard label="Tarih" value={ex.tytTar} correct={ex.tytTarD} wrong={ex.tytTarY} icon={Landmark} color="#f59e0b" />
                                                    <SubjectCard label="Coğrafya" value={ex.tytCog} correct={ex.tytCogD} wrong={ex.tytCogY} icon={Globe} color="#3b82f6" />
                                                    <SubjectCard label="Felsefe" value={ex.tytFel} correct={ex.tytFelD} wrong={ex.tytFelY} icon={Brain} color="#a855f7" />
                                                    <SubjectCard label="Din K." value={ex.tytDin} correct={ex.tytDinD} wrong={ex.tytDinY} icon={Book} color="#f59e0b" />
                                                    <SubjectCard label="Fizik" value={ex.tytFiz} correct={ex.tytFizD} wrong={ex.tytFizY} icon={Zap} color="#ef4444" />
                                                    <SubjectCard label="Kimya" value={ex.tytKim} correct={ex.tytKimD} wrong={ex.tytKimY} icon={Microscope} color="#10b981" />
                                                    <SubjectCard label="Biyoloji" value={ex.tytBiy} correct={ex.tytBiyD} wrong={ex.tytBiyY} icon={Microscope} color="#10b981" />
                                                </div>
                                            </section>

                                            {/* AYT Section */}
                                            <section>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                                                    <div style={{ height: '32px', width: '4px', background: '#a855f7', borderRadius: '2px' }} />
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        AYT DETAYLI KARNE
                                                        <div style={{ display: 'flex', gap: '0.4rem', marginLeft: '0.5rem' }}>
                                                            <span style={{ fontSize: '0.75rem', color: '#10b981', background: '#ecfdf5', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>{ex.aytDogru || 0}D</span>
                                                            <span style={{ fontSize: '0.75rem', color: '#ef4444', background: '#fef2f2', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>{ex.aytYanlis || 0}Y</span>
                                                            <span style={{ fontSize: '0.75rem', color: '#a855f7', background: 'rgba(168, 85, 247, 0.12)', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>{ex.aytNet || 0} Net</span>
                                                        </div>
                                                    </h3>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem' }}>
                                                    <SubjectCard label="Matematik" value={ex.aytMat} correct={ex.aytMatD} wrong={ex.aytMatY} icon={Calculator} color="#3b82f6" />
                                                    <SubjectCard label="Fizik" value={ex.aytFiz} correct={ex.aytFizD} wrong={ex.aytFizY} icon={Zap} color="#ef4444" />
                                                    <SubjectCard label="Kimya" value={ex.aytKim} correct={ex.aytKimD} wrong={ex.aytKimY} icon={Microscope} color="#10b981" />
                                                    <SubjectCard label="Biyoloji" value={ex.aytBiy} correct={ex.aytBiyD} wrong={ex.aytBiyY} icon={Microscope} color="#10b981" />
                                                    <SubjectCard label="Edebiyat" value={ex.aytEdb} correct={ex.aytEdbD} wrong={ex.aytEdbY} icon={Book} color="#10b981" />
                                                    <SubjectCard label="Tarih-1" value={ex.aytTar1} correct={ex.aytTar1D} wrong={ex.aytTar1Y} icon={Landmark} color="#f59e0b" />
                                                    <SubjectCard label="Coğ-1" value={ex.aytCog1} correct={ex.aytCog1D} wrong={ex.aytCog1Y} icon={Globe} color="#3b82f6" />
                                                    <SubjectCard label="Tarih-2" value={ex.aytTar2} correct={ex.aytTar2D} wrong={ex.aytTar2Y} icon={Landmark} color="#f59e0b" />
                                                    <SubjectCard label="Coğ-2" value={ex.aytCog2} correct={ex.aytCog2D} wrong={ex.aytCog2Y} icon={Globe} color="#3b82f6" />
                                                    <SubjectCard label="Felsefe" value={ex.aytFel} correct={ex.aytFelD} wrong={ex.aytFelY} icon={Brain} color="#a855f7" />
                                                    <SubjectCard label="Din K." value={ex.aytDin} correct={ex.aytDinD} wrong={ex.aytDinY} icon={Book} color="#f59e0b" />
                                                </div>
                                            </section>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Kayıtlı sınav bulunamadı.</div>
                        )}
                    </div>
                </div>
            ) : null}

            {subTab === 'classProgress' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <div className="card" style={{ padding: '2rem', minHeight: '400px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ background: 'var(--primary)15', padding: '0.75rem', borderRadius: '15px' }}>
                                    <BookMarked size={28} color="var(--primary)" />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#1e293b' }}>Sınıf Müfredat Yol Haritası</h2>
                                    <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '1rem', fontWeight: 500 }}>
                                        {student.class} sınıfının akademik ilerlemesini takip edin.
                                    </p>
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '0.75rem 1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 700 }}>SON GÜNCELLEME</span>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#1e293b' }}>
                                    {classProgress.length > 0 ? new Date(Math.max(...classProgress.map(p => new Date(p.completedAt).getTime()))).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                                </div>
                            </div>
                        </div>

                        {classProgressLoading ? (
                            <div style={{ textAlign: 'center', padding: '5rem' }}>
                                <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                                <p style={{ color: '#94a3b8' }}>Veriler yükleniyor...</p>
                            </div>
                        ) : classProgress.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '5rem', background: '#f8fafc', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                                <h3 style={{ color: '#1e293b', marginBottom: '0.5rem' }}>Henüz Kayıt Yok</h3>
                                <p style={{ color: '#64748b' }}>Bu sınıf için öğretmenler tarafından henüz bir müfredat ilerlemesi girilmemiş.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {(() => {
                                    const latestByCourse: Record<string, any> = {};
                                    classProgress.forEach(p => {
                                        if (!latestByCourse[p.courseId] || new Date(p.completedAt) > new Date(latestByCourse[p.courseId].completedAt)) {
                                            latestByCourse[p.courseId] = p;
                                        }
                                    });
                                    const weekEnd = addClassProgressDays(classProgressWeekStart, 7);
                                    const weeklyEntries = classProgress.filter(item => {
                                        const date = new Date(item.completedAt);
                                        return date >= classProgressWeekStart && date < weekEnd;
                                    });

                                    return (
                                        <>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
                                                {[
                                                    { label: 'Haftalık Giriş', value: weeklyEntries.length, color: '#3b82f6', bg: '#eff6ff' },
                                                    { label: 'Biten Konu', value: weeklyEntries.filter(item => item.status === 'TAMAMLANDI').length, color: '#059669', bg: '#ecfdf5' },
                                                    { label: 'Devam Eden', value: weeklyEntries.filter(item => item.status === 'ISLENIYOR').length, color: '#b45309', bg: '#fffbeb' }
                                                ].map(metric => (
                                                    <div key={metric.label} style={{ padding: '1rem', borderRadius: '18px', border: '1px solid #e2e8f0', background: metric.bg }}>
                                                        <div style={{ color: metric.color, fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase' }}>{metric.label}</div>
                                                        <div style={{ color: '#0f172a', fontSize: '1.55rem', fontWeight: 950, marginTop: '0.2rem' }}>{metric.value}</div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '22px', overflow: 'hidden', background: 'white' }}>
                                                <div style={{ padding: '1rem 1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                                                    <div>
                                                        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>Haftalık Görünüm</div>
                                                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', marginTop: '0.2rem' }}>
                                                            {formatClassProgressDate(classProgressWeekStart)} - {formatClassProgressDate(addClassProgressDays(classProgressWeekStart, 6))}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                                                        <button onClick={() => setClassProgressWeekStart(prev => addClassProgressDays(prev, -7))} style={{ width: 36, height: 36, borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', display: 'grid', placeItems: 'center' }} title="Önceki hafta">
                                                            <ChevronLeft size={18} />
                                                        </button>
                                                        <button onClick={() => setClassProgressWeekStart(getClassProgressWeekStart())} style={{ minHeight: 36, padding: '0 0.9rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#334155', cursor: 'pointer', fontWeight: 800 }}>
                                                            Bu Hafta
                                                        </button>
                                                        <button onClick={() => setClassProgressWeekStart(prev => addClassProgressDays(prev, 7))} style={{ width: 36, height: 36, borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', display: 'grid', placeItems: 'center' }} title="Sonraki hafta">
                                                            <ChevronRight size={18} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="custom-scrollbar" style={{ overflowX: 'auto' }}>
                                                    <div style={{ minWidth: 1040, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(145px, 1fr))' }}>
                                                        {classProgressWeekDays.map((day, idx) => {
                                                            const dayDate = addClassProgressDays(classProgressWeekStart, idx);
                                                            const entries = weeklyEntries
                                                                .filter(item => isSameClassProgressDay(new Date(item.completedAt), dayDate))
                                                                .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());

                                                            return (
                                                                <div key={day} style={{ minHeight: 210, borderLeft: idx === 0 ? 'none' : '1px solid #f1f5f9', background: entries.length ? 'white' : '#fcfcfd' }}>
                                                                    <div style={{ padding: '0.8rem 0.9rem', borderBottom: '1px solid #f1f5f9', background: '#ffffff' }}>
                                                                        <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#334155' }}>{day}</div>
                                                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>{formatClassProgressDate(dayDate)}</div>
                                                                    </div>
                                                                    <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                                                        {entries.length === 0 ? (
                                                                            <div style={{ height: 120, display: 'grid', placeItems: 'center', color: '#cbd5e1', fontSize: '0.78rem', fontWeight: 700 }}>Kayıt yok</div>
                                                                        ) : entries.map(item => {
                                                                            const tone = getClassProgressStatusTone(item.status);
                                                                            return (
                                                                                <div key={item.id} style={{ padding: '0.75rem', borderRadius: '13px', background: tone.bg, border: `1px solid ${tone.border}` }}>
                                                                                    <div style={{ color: '#0f172a', fontSize: '0.78rem', fontWeight: 900, lineHeight: 1.2 }}>{item.course.name}</div>
                                                                                    <div style={{ color: '#334155', fontSize: '0.76rem', fontWeight: 800, lineHeight: 1.3, marginTop: '0.3rem' }}>{item.topic.name}</div>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.55rem' }}>
                                                                                        <span style={{ color: tone.color, fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase' }}>{tone.label}</span>
                                                                                        <span style={{ color: '#64748b', fontSize: '0.68rem', fontWeight: 700 }}>{item.teacher?.name || '—'}</span>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#0f172a' }}>Derslerde Son Durum</h3>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                                                    {Object.values(latestByCourse).sort((a, b) => a.course.name.localeCompare(b.course.name)).map((item) => {
                                                        const meta = getSubjectMeta(item.course.name);
                                                        const SubjectIcon = meta.icon;
                                                        const tone = getClassProgressStatusTone(item.status);

                                                        return (
                                                            <motion.div
                                                                key={item.id}
                                                                whileHover={{ y: -2 }}
                                                                style={{ padding: '1.15rem', background: 'white', borderRadius: '18px', border: `1px solid ${meta.border}`, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
                                                            >
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                                        <div style={{ background: meta.bg, padding: '0.55rem', borderRadius: '12px', display: 'flex' }}>
                                                                            <SubjectIcon size={18} color={meta.color} />
                                                                        </div>
                                                                        <span style={{ fontWeight: 900, fontSize: '0.98rem', color: '#1e293b' }}>{item.course.name}</span>
                                                                    </div>
                                                                    <span style={{ fontSize: '0.68rem', fontWeight: 900, padding: '4px 9px', borderRadius: '8px', background: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}>{tone.label}</span>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 800, textTransform: 'uppercase' }}>Güncel Konu</div>
                                                                    <div style={{ fontWeight: 850, fontSize: '1rem', color: '#334155', lineHeight: 1.3 }}>{item.topic.name}</div>
                                                                </div>
                                                                <div style={{ paddingTop: '0.7rem', borderTop: '1px solid #f1f5f9', fontSize: '0.75rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                                                                    <span style={{ fontWeight: 700 }}>{item.teacher?.name || '—'}</span>
                                                                    <span>{new Date(item.completedAt).toLocaleDateString('tr-TR')}</span>
                                                                </div>
                                                            </motion.div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {subTab === 'curriculum' && (
                <div>
                    {curriculumLoading ? (
                        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📚</div>
                            <p>Müfredat yükleniyor...</p>
                        </div>
                    ) : curriculum ? (
                        <CurriculumDetail curriculum={curriculum} />
                    ) : (
                        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                            <CheckCircle2 size={40} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                            <p>Öğrenci henüz müfredat verisi oluşturmamış.</p>
                        </div>
                    )}
                </div>
            )}

            {subTab === 'attendance' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <div className="card" style={{ padding: '2rem' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem' }}>
                            <FileText color="var(--primary)" size={24} />
                            Yoklama Geçmişi (Tüm Kayıtlar)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                            {attendanceHistory.map((item, idx) => (
                                <div key={idx} style={{
                                    background: '#f8fafc', padding: '1.25rem', borderRadius: '16px',
                                    border: '1px solid #e2e8f0', display: 'flex',
                                    flexDirection: 'column', gap: '0.5rem', alignItems: 'center'
                                }}>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>{item.date}</div>
                                    <div style={{
                                        padding: '0.4rem 1rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 800,
                                        background: item.status === 'present' ? '#dcfce7' : item.status === 'late' ? '#fef9c3' : '#fee2e2',
                                        color: item.status === 'present' ? '#166534' : item.status === 'late' ? '#854d0e' : '#991b1b'
                                    }}>
                                        {item.status === 'present' ? 'Geldi' : item.status === 'late' ? 'Geç Kaldı' : 'Gelmedi'}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {attendanceHistory.length === 0 && <div style={{ padding: '2rem', color: 'var(--text-muted)', textAlign: 'center' }}>Kayıt bulunamadı.</div>}
                    </div>
                </motion.div>
            )}


            {subTab === 'planner' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <div className="card" style={{ padding: '2rem', minHeight: '600px', background: '#ffffff', borderRadius: '30px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div className="guidance-header-group" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div>
                                    <h3 className="guidance-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.75rem', fontWeight: 900, color: '#1e293b' }}>
                                        <div style={{ background: 'var(--primary)15', padding: '0.6rem', borderRadius: '14px' }}>
                                            <ClipboardList color="var(--primary)" size={32} />
                                        </div>
                                        Haftalık Çalışma Çizelgesi
                                    </h3>
                                    <p className="guidance-subtitle" style={{ margin: '0.4rem 0 0 0', color: '#64748b', fontSize: '1rem', fontWeight: 500 }}>
                                        Öğrencinin haftalık yol haritasını yönetin.
                                    </p>
                                </div>

                                {plannerData.length > 0 && (
                                <div className="guidance-date-range-picker" style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    background: '#f8fafc', padding: '0.5rem 1rem',
                                    borderRadius: '16px', border: '1px solid #e2e8f0',
                                    marginLeft: '1rem'
                                }}>
                                        <button
                                            onClick={() => setSelectedPlanIndex(prev => Math.min(plannerData.length - 1, prev + 1))}
                                            disabled={selectedPlanIndex >= plannerData.length - 1}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', opacity: selectedPlanIndex >= plannerData.length - 1 ? 0.3 : 1 }}
                                        >
                                            <ArrowUpDown size={18} style={{ transform: 'rotate(90deg)' }} />
                                        </button>
                                        <div className="guidance-date-text" style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', minWidth: '140px', textAlign: 'center' }}>
                                            {(() => {
                                                const d = new Date(plannerData[selectedPlanIndex]?.weekStartDate || Date.now());
                                                const end = new Date(d);
                                                end.setDate(d.getDate() + 6);
                                                return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`;
                                            })()}
                                        </div>
                                        <button
                                            onClick={() => setSelectedPlanIndex(prev => Math.max(0, prev - 1))}
                                            disabled={selectedPlanIndex <= 0}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', opacity: selectedPlanIndex <= 0 ? 0.3 : 1 }}
                                        >
                                            <ArrowUpDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="guidance-action-buttons" style={{ display: 'flex', gap: '0.8rem' }}>
                                {plannerData.length === 0 && (
                                    <button
                                        onClick={() => {
                                            const newPlan = { studentId, weekStartDate: new Date().toISOString(), tasks: [] };
                                            setPlannerData([newPlan]);
                                            setSelectedPlanIndex(0);
                                        }}
                                        style={{
                                            background: '#f8fafc', color: '#1e293b', padding: '0.85rem 1.5rem',
                                            borderRadius: '16px', border: '1px solid #e2e8f0', fontWeight: 800,
                                            fontSize: '0.95rem', cursor: 'pointer'
                                        }}
                                    >
                                        + Yeni Çizelge Başlat
                                    </button>
                                )}
                                <button
                                    onClick={handlePlannerAiSuggest}
                                    disabled={plannerSuggestionLoading}
                                    style={{
                                        background: 'var(--primary-glow)',
                                        color: 'var(--primary)',
                                        padding: '0.85rem 1.5rem',
                                        borderRadius: '16px',
                                        border: '1px solid var(--primary-glow)',
                                        fontWeight: 800,
                                        fontSize: '0.95rem',
                                        cursor: plannerSuggestionLoading ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.6rem',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Sparkles size={20} />
                                    {plannerSuggestionLoading ? 'Analiz Ediliyor...' : 'AI Önerisi Oluştur'}
                                </button>
                                <button
                                    onClick={handleSavePlanner}
                                    style={{
                                        background: 'var(--primary)',
                                        color: 'white',
                                        padding: '0.85rem 1.5rem',
                                        borderRadius: '16px',
                                        border: 'none',
                                        fontWeight: 800,
                                        fontSize: '0.95rem',
                                        cursor: 'pointer',
                                        boxShadow: 'var(--shadow-md)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Planı Yayınla
                                </button>
                            </div>
                        </div>

                        {plannerLoading ? (
                            <div style={{ textAlign: 'center', padding: '10rem 0' }}>
                                <div className="spinner" style={{ margin: 'auto' }}></div>
                                <p style={{ marginTop: '2rem', color: '#64748b', fontWeight: 600 }}>Haftalık plan hazırlanıyor...</p>
                            </div>
                        ) : (
                            <DragDropContext onDragEnd={onDragEnd}>
                                <div className="guidance-planner-scroll-wrapper" style={{ overflowX: 'auto', paddingBottom: '2rem', margin: '0 -1rem' }}>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(7, 1fr)',
                                        gap: '1.25rem',
                                        minWidth: '1300px',
                                        padding: '0 1rem'
                                    }}>
                                        {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map((day, idx) => (
                                            <Droppable droppableId={String(idx)} key={idx}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.droppableProps}
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '1.25rem',
                                                            background: snapshot.isDraggingOver ? '#f1f5f9' : 'transparent',
                                                            borderRadius: '24px',
                                                            transition: 'background 0.2s ease',
                                                            padding: '4px'
                                                        }}
                                                    >
                                                        <div className="guidance-day-header" style={{
                                                            textAlign: 'center', padding: '1rem', borderRadius: '18px',
                                                            background: idx < 5 ? '#f8fafc' : '#fff7ed',
                                                            color: idx < 5 ? '#1e293b' : '#c2410c',
                                                            border: idx < 5 ? '1px solid #e2e8f0' : '1px solid #ffedd5',
                                                            fontWeight: 900, fontSize: '0.9rem', textTransform: 'uppercase',
                                                            letterSpacing: '0.05em'
                                                        }}>
                                                            {day}
                                                        </div>

                                                        <div style={{
                                                            minHeight: '500px', background: '#f8fafc', borderRadius: '24px',
                                                            border: '1px solid #f1f5f9', padding: '0.85rem',
                                                            display: 'flex', flexDirection: 'column', gap: '0.85rem'
                                                        }}>
                                                            {(plannerData[selectedPlanIndex]?.tasks || []).filter((t: any) => t.dayIndex === idx).map((task: any, tIdx: number) => {
                                                                const meta = getSubjectMeta(task.subject);
                                                                const SubjectIcon = meta.icon;
                                                                return (
                                                                    <Draggable
                                                                        key={task.id || `task-${idx}-${tIdx}`}
                                                                        draggableId={String(task.id || `task-${idx}-${tIdx}`)}
                                                                        index={tIdx}
                                                                    >
                                                                        {(dragProvided, dragSnapshot) => (
                                                                            <div
                                                                                ref={dragProvided.innerRef}
                                                                                {...dragProvided.draggableProps}
                                                                                {...dragProvided.dragHandleProps}
                                                                                style={{
                                                                                    ...dragProvided.draggableProps.style,
                                                                                    background: 'white',
                                                                                    padding: '1.25rem',
                                                                                    borderRadius: '20px',
                                                                                    borderLeft: `5px solid ${meta.color}`,
                                                                                    borderTop: '1px solid #f1f5f9',
                                                                                    borderRight: '1px solid #f1f5f9',
                                                                                    borderBottom: '1px solid #f1f5f9',
                                                                                    boxShadow: dragSnapshot.isDragging ? '0 20px 25px -5px rgba(0,0,0,0.1)' : '0 4px 6px -1px rgba(0,0,0,0.02)',
                                                                                    display: 'flex', flexDirection: 'column', gap: '0.75rem',
                                                                                    position: 'relative',
                                                                                    opacity: task.status === 'completed' ? 0.7 : 1,
                                                                                    transition: 'all 0.2s ease',
                                                                                    transform: dragSnapshot.isDragging ? 'scale(1.02) rotate(1deg)' : 'scale(1)'
                                                                                }}
                                                                            >
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                                    <div style={{
                                                                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                                                        color: meta.color, background: meta.bg,
                                                                                        padding: '0.35rem 0.6rem', borderRadius: '10px',
                                                                                        fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase'
                                                                                    }}>
                                                                                        <SubjectIcon size={14} />
                                                                                        {task.subject} {task.examType ? `(${task.examType})` : ''}
                                                                                    </div>
                                                                                    {task.isAiSuggested && (
                                                                                        <Sparkles size={14} color="#a855f7" />
                                                                                    )}
                                                                                </div>

                                                                                <div style={{
                                                                                    fontSize: '1rem', fontWeight: 800, color: '#1e293b',
                                                                                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                                                                                    lineHeight: 1.4
                                                                                }}>
                                                                                    {task.topic}
                                                                                </div>

                                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #f8fafc' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                                                        <div
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                const newTasks = [...plannerData[selectedPlanIndex].tasks];
                                                                                                const taskIndex = newTasks.indexOf(task);
                                                                                                if (taskIndex !== -1) {
                                                                                                    newTasks[taskIndex] = { ...newTasks[taskIndex], status: newTasks[taskIndex].status === 'completed' ? 'pending' : 'completed' };
                                                                                                }
                                                                                                const updatedData = [...plannerData];
                                                                                                updatedData[selectedPlanIndex] = { ...updatedData[selectedPlanIndex], tasks: newTasks };
                                                                                                setPlannerData(updatedData);
                                                                                            }}
                                                                                            style={{
                                                                                                width: '20px', height: '20px', borderRadius: '6px',
                                                                                                border: `2px solid ${task.status === 'completed' ? '#10b981' : '#cbd5e1'}`,
                                                                                                background: task.status === 'completed' ? '#10b981' : 'transparent',
                                                                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                                transition: 'all 0.2s'
                                                                                            }}
                                                                                        >
                                                                                            {task.status === 'completed' && <CheckCircle2 size={12} color="white" />}
                                                                                        </div>
                                                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: task.status === 'completed' ? '#10b981' : '#64748b' }}>
                                                                                            {task.status === 'completed' ? 'Bitti' : 'Yapılacak'}
                                                                                        </span>
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setSelectedDayIndexForTask(idx);
                                                                                                setNewPlannerTask({ subject: task.subject, topic: task.topic, examType: (task as any).examType || 'TYT' });
                                                                                                setEditingTaskIndex(plannerData[selectedPlanIndex].tasks.indexOf(task));
                                                                                                setIsPlannerModalOpen(true);
                                                                                            }}
                                                                                            style={{ background: '#f8fafc', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.5rem', borderRadius: '8px', display: 'flex', transition: '0.2s' }}
                                                                                        >
                                                                                            <Pencil size={14} />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                const newTasks = (plannerData[selectedPlanIndex].tasks || []).filter((t: any) => t !== task);
                                                                                                const updatedData = [...plannerData];
                                                                                                updatedData[selectedPlanIndex] = { ...updatedData[selectedPlanIndex], tasks: newTasks };
                                                                                                setPlannerData(updatedData);
                                                                                            }}
                                                                                            style={{ background: '#fff1f2', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.5rem', borderRadius: '8px', display: 'flex', transition: '0.2s' }}
                                                                                        >
                                                                                            <Trash2 size={14} />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </Draggable>
                                                                );
                                                            })}
                                                            {provided.placeholder}
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedDayIndexForTask(idx);
                                                                    setNewPlannerTask({ subject: 'Matematik', topic: '', examType: 'TYT' });
                                                                    setEditingTaskIndex(null);
                                                                    setIsPlannerModalOpen(true);
                                                                }}
                                                                style={{
                                                                    marginTop: 'auto', padding: '0.85rem', borderRadius: '16px',
                                                                    border: '2px dashed #e2e8f0', background: 'white',
                                                                    color: '#64748b', fontSize: '0.85rem', fontWeight: 800,
                                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                                                }}
                                                                onMouseOver={(e) => { (e.currentTarget as any).style.borderColor = 'var(--primary)'; (e.currentTarget as any).style.color = 'var(--primary)'; }}
                                                                onMouseOut={(e) => { (e.currentTarget as any).style.borderColor = '#e2e8f0'; (e.currentTarget as any).style.color = '#64748b'; }}
                                                            >
                                                                <Zap size={16} /> Görev Ekle
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </Droppable>
                                        ))}
                                    </div>
                                </div>
                            </DragDropContext>
                        )}
                    </div>
                </motion.div>
            )}

            {subTab === 'weekly' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    {weeklyLoading ? (
                        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                            <div className="spinner" style={{ margin: 'auto', marginBottom: '1rem' }}></div>
                            Performans verileri hesaplanıyor...
                        </div>
                    ) : weeklyData ? (
                        <div className="card" style={{ padding: '2rem' }}>
                            <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem' }}>
                                <Calendar color="var(--primary)" size={24} />
                                Öğrencinin Performans Seyri (Kayıt Tarihinden İtibaren)
                            </h3>

                            {(() => {
                                const weeks: any[] = [];
                                const createdAt = new Date(weeklyData.studentCreatedAt || Date.now());
                                createdAt.setHours(0, 0, 0, 0);

                                const msPerWeek = 7 * 24 * 60 * 60 * 1000;
                                const diffTime = Math.max(0, Date.now() - createdAt.getTime());
                                let weekCount = Math.max(1, Math.ceil(diffTime / msPerWeek));
                                weekCount = Math.min(weekCount, 52); // Max 1 yil geriye git

                                for (let i = 0; i < weekCount; i++) {
                                    const end = new Date();
                                    end.setDate(end.getDate() - i * 7);
                                    end.setHours(23, 59, 59, 999);
                                    const start = new Date(end);
                                    start.setDate(start.getDate() - 6);
                                    start.setHours(0, 0, 0, 0);

                                    // Eğer hesaplanan haftanın bitişi öğrencinin kaydından eskiyse döngüyü kır
                                    if (i > 0 && end < createdAt) break;

                                    const wkActs = (weeklyData.activities || []).filter((a: any) => new Date(a.date) >= start && new Date(a.date) <= end);
                                    const wkAnls = (weeklyData.analyses || []).filter((a: any) => new Date(a.createdAt) >= start && new Date(a.createdAt) <= end);

                                    const solvedActs = wkActs.reduce((acc: number, val: any) => acc + (val.solvedCount || 0), 0);
                                    const solvedAnls = wkAnls.length;
                                    // Activity ile Analizleri dengele
                                    const solved = Math.max(solvedActs, solvedAnls);

                                    const subjects: Record<string, number> = {};
                                    const expandedSubjects: { [key: string]: { total: number, topics: Record<string, number> } } = {};

                                    wkAnls.forEach((anl: any) => {
                                        const c = anl.course || 'Bilinmiyor';
                                        const t = anl.topic || 'Genel';

                                        subjects[c] = (subjects[c] || 0) + 1;

                                        if (!expandedSubjects[c]) expandedSubjects[c] = { total: 0, topics: {} };
                                        expandedSubjects[c].total++;
                                        expandedSubjects[c].topics[t] = (expandedSubjects[c].topics[t] || 0) + 1;
                                    });
                                    const topSubjects = Object.entries(subjects).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3);
                                    const allSubjectsArr = Object.entries(expandedSubjects).sort((a: any, b: any) => b[1].total - a[1].total);

                                    weeks.push({
                                        id: i,
                                        startText: start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
                                        endText: end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
                                        solved,
                                        topSubjects,
                                        allSubjectsArr,
                                        isCurrent: i === 0
                                    });
                                }

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        {weeks.map((w, idx) => {
                                            const prevWk = idx < weeks.length - 1 ? weeks[idx + 1] : null;
                                            const trend = prevWk ? (w.solved > prevWk.solved ? 'up' : w.solved < prevWk.solved ? 'down' : 'same') : null;
                                            const isExpanded = expandedWeekId === w.id;

                                            return (
                                                <div key={w.id} style={{
                                                    background: w.isCurrent ? 'var(--primary)08' : '#f8fafc',
                                                    borderRadius: '16px',
                                                    border: isExpanded ? '2px solid var(--primary)' : w.isCurrent ? '1px solid var(--primary)20' : '1px solid #e2e8f0',
                                                    boxShadow: w.isCurrent || isExpanded ? '0 4px 12px rgba(99, 102, 241, 0.05)' : 'none',
                                                    overflow: 'hidden',
                                                    transition: 'all 0.2s ease-in-out',
                                                    cursor: 'pointer'
                                                }} onClick={() => setExpandedWeekId(isExpanded ? null : w.id)}>
                                                    <div style={{ display: 'flex', alignItems: 'center', padding: '1.5rem', justifyContent: 'space-between' }}>
                                                        <div style={{ flex: '1' }}>
                                                            <div style={{ fontSize: '0.875rem', color: w.isCurrent ? 'var(--primary)' : 'var(--text-muted)', fontWeight: w.isCurrent ? 700 : 500, marginBottom: '0.2rem' }}>
                                                                {w.isCurrent ? 'Bu Hafta' : `${idx}. Hafta Önce`}
                                                            </div>
                                                            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>{w.startText} - {w.endText}</div>
                                                        </div>

                                                        <div style={{ flex: '1', display: 'flex', justifyContent: 'center' }}>
                                                            <div style={{ textAlign: 'center' }}>
                                                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                                                    {w.solved}
                                                                    {trend === 'up' && <TrendingUp size={20} color="#10b981" />}
                                                                    {trend === 'down' && <TrendingDown size={20} color="#ef4444" />}
                                                                </div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Soru Çözüldü</div>
                                                            </div>
                                                        </div>

                                                        <div style={{ flex: '1.5', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>EN ÇOK ODAKLANILAN DERSLER</div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                                {w.topSubjects.length > 0 ? w.topSubjects.map(([subj]: any) => (
                                                                    <span key={subj} style={{
                                                                        background: '#fff', border: '1px solid #cbd5e1',
                                                                        color: '#475569', padding: '0.3rem 0.6rem',
                                                                        borderRadius: '8px', fontSize: '0.75rem',
                                                                        fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                                    }}>
                                                                        {subj}
                                                                    </span>
                                                                )) : <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Kayıtlı veri yok</span>}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <AnimatePresence>
                                                        {isExpanded && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                style={{ overflow: 'hidden', borderTop: '1px solid var(--border-color)', background: '#fff' }}
                                                            >
                                                                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                                    <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>Ders ve Konu Kırılımı</div>
                                                                    {w.allSubjectsArr.length > 0 ? (
                                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                                                            {w.allSubjectsArr.map(([course, stats]: any) => (
                                                                                <div key={course} style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                                                                                        <span style={{ fontWeight: 700, color: '#334155' }}>{course}</span>
                                                                                        <span style={{ fontWeight: 800, color: 'var(--primary)', background: 'var(--primary)10', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.85rem' }}>{stats.total} Soru</span>
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                                                        {Object.entries(stats.topics).sort((a: any, b: any) => b[1] - a[1]).map(([t, tCount]: any) => (
                                                                                            <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#64748b' }}>
                                                                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85%' }}>• {t}</span>
                                                                                                <span style={{ fontWeight: 600 }}>{tCount}</span>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Detaylı konu analizi bulunamadı. Sadece nicel aktivite girişi yapılmış.</div>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                            <CheckCircle2 size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                            <p>Henüz haftalık rapor verisi bulunmuyor.</p>
                        </div>
                    )}
                </motion.div>
            )}

            {subTab === 'attendance' && (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
                    {attendanceLoading ? (
                        <div className="card" style={{ textAlign: 'center', padding: '4rem' }}>Yoklama geçmişi yükleniyor...</div>
                    ) : attendanceHistory.length > 0 ? (
                        <div className="dashboard-grid">
                            <div className="card" style={{ gridColumn: 'span 12' }}>
                                <div className="card-title">Yoklama Kayıtları</div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>TARİH</th>
                                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>DURUM</th>
                                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>AÇIKLAMALAR</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {attendanceHistory.map((att: any) => {
                                                const statusMap: any = {
                                                    'geldi': { label: 'Geldi', color: '#10b981', bg: '#dcfce7', icon: CheckCircle2 },
                                                    'gelmedi': { label: 'Gelmedi', color: '#ef4444', bg: '#fee2e2', icon: XCircle },
                                                    'gec_kaldi': { label: 'Geç Kaldı', color: '#f59e0b', bg: '#ffedd5', icon: Clock },
                                                    'izinli': { label: 'İzinli', color: '#6366f1', bg: '#e0e7ff', icon: Coffee }
                                                };
                                                const s = statusMap[att.status] || { label: att.status, color: '#64748b', bg: '#f1f5f9', icon: CheckCircle2 };
                                                return (
                                                    <tr key={att.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '1rem', fontWeight: 600 }}>{new Date(att.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                                                        <td style={{ padding: '1rem' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: s.bg, color: s.color, padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                                                                <s.icon size={12} /> {s.label}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                            {att.status === 'gelmedi' ? 'Devamsızlık yapıldı.' : att.status === 'gec_kaldi' ? 'Derse geç giriş yapıldı.' : att.status === 'izinli' ? 'Veli bilgisi dahilinde izinli.' : 'Katılım sağlandı.'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                            <FileText size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                            <p>Henüz yoklama kaydı bulunmuyor.</p>
                        </div>
                    )}
                </motion.div>
            )}

            <AnimatePresence>
                {isPlannerModalOpen && (
                    <div
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 10000, padding: '2rem'
                        }}
                        onClick={() => setIsPlannerModalOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: 'white', border: '1px solid #e2e8f0', borderRadius: '30px',
                                width: '100%', maxWidth: '600px', padding: '2.5rem',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                display: 'flex', flexDirection: 'column'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ background: 'var(--primary)15', padding: '0.6rem', borderRadius: '12px' }}>
                                        <ClipboardList size={24} color="var(--primary)" />
                                    </div>
                                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>
                                        {editingTaskIndex !== null ? 'Görevi Düzenle' : 'Yeni Görev Ekle'}
                                    </h2>
                                </div>
                                <button onClick={() => setIsPlannerModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                                {/* TYT / AYT Seçimi */}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 800, color: '#475569' }}>Sınav Tipi</label>
                                    <div style={{ display: 'flex', gap: '0.75rem', background: '#f1f5f9', padding: '0.4rem', borderRadius: '14px' }}>
                                        {['TYT', 'AYT'].map(type => (
                                            <button
                                                key={type}
                                                onClick={() => {
                                                    setIsTopicDropdownOpen(false);
                                                    const availableSubjects = Object.keys(YKS_CURRICULUM[type]);
                                                    setNewPlannerTask({
                                                        ...newPlannerTask,
                                                        examType: type,
                                                        subject: availableSubjects.includes(newPlannerTask.subject) ? newPlannerTask.subject : availableSubjects[0],
                                                        topic: ''
                                                    });
                                                }}
                                                style={{
                                                    flex: 1, padding: '0.6rem', borderRadius: '10px', border: 'none',
                                                    fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
                                                    background: newPlannerTask.examType === type ? 'white' : 'transparent',
                                                    color: newPlannerTask.examType === type ? 'var(--primary)' : '#64748b',
                                                    boxShadow: newPlannerTask.examType === type ? '0 4px 6px -1px rgba(0,0,0,0.05)' : 'none'
                                                }}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Ders Seçimi */}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 800, color: '#475569' }}>Ders Seçin</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                                        {Object.keys(YKS_CURRICULUM[newPlannerTask.examType || 'TYT']).map((subject) => (
                                            <button
                                                key={subject}
                                                onClick={() => {
                                                    setNewPlannerTask({ ...newPlannerTask, subject, topic: '' });
                                                    setIsTopicDropdownOpen(false);
                                                }}
                                                style={{
                                                    padding: '0.75rem 0.5rem', borderRadius: '12px', border: '1px solid',
                                                    borderColor: newPlannerTask.subject === subject ? 'var(--primary)' : '#e2e8f0',
                                                    background: newPlannerTask.subject === subject ? 'var(--primary)05' : 'white',
                                                    color: newPlannerTask.subject === subject ? 'var(--primary)' : '#475569',
                                                    fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                            >
                                                {subject}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Konu Seçimi */}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 800, color: '#475569' }}>Konu Seçin</label>
                                    <div style={{ position: 'relative' }}>
                                        <div
                                            onClick={() => setIsTopicDropdownOpen(!isTopicDropdownOpen)}
                                            style={{
                                                width: '100%', padding: '1rem', borderRadius: '16px', border: `1px solid ${isTopicDropdownOpen ? 'var(--primary)' : '#e2e8f0'}`,
                                                fontSize: '1rem', fontWeight: 600, color: '#1e293b', background: 'white',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                                                transition: 'all 0.2s', boxShadow: isTopicDropdownOpen ? '0 0 0 4px var(--primary-glow)' : 'none'
                                            }}
                                        >
                                            <span style={{ color: newPlannerTask.topic ? '#1e293b' : '#94a3b8' }}>
                                                {newPlannerTask.topic || 'Konu seçiniz...'}
                                            </span>
                                            <ChevronDown size={20} color="#64748b" style={{ transform: isTopicDropdownOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
                                        </div>

                                        <AnimatePresence>
                                            {isTopicDropdownOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    style={{
                                                        position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                                                        background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0',
                                                        boxShadow: '0 15px 30px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '250px', overflowY: 'auto',
                                                        padding: '0.5rem'
                                                    }}
                                                >
                                                    {(YKS_CURRICULUM[newPlannerTask.examType || 'TYT'][newPlannerTask.subject] || []).map(topic => (
                                                        <div
                                                            key={topic}
                                                            onClick={() => {
                                                                setNewPlannerTask({ ...newPlannerTask, topic });
                                                                setIsTopicDropdownOpen(false);
                                                            }}
                                                            style={{
                                                                padding: '0.85rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600,
                                                                color: newPlannerTask.topic === topic ? 'var(--primary)' : '#475569',
                                                                background: newPlannerTask.topic === topic ? 'var(--primary)08' : 'transparent',
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseEnter={(e) => { if (newPlannerTask.topic !== topic) (e.currentTarget as any).style.background = '#f8fafc'; }}
                                                            onMouseLeave={(e) => { if (newPlannerTask.topic !== topic) (e.currentTarget as any).style.background = 'transparent'; }}
                                                        >
                                                            {topic}
                                                        </div>
                                                    ))}
                                                    <div
                                                        onClick={() => {
                                                            setNewPlannerTask({ ...newPlannerTask, topic: 'Diğer' });
                                                            setIsTopicDropdownOpen(false);
                                                        }}
                                                        style={{
                                                            padding: '0.85rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 700,
                                                            color: '#64748b', borderTop: '1px solid #f1f5f9', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                                                        }}
                                                        onMouseEnter={(e) => { (e.currentTarget as any).style.background = '#f8fafc'; }}
                                                        onMouseLeave={(e) => { (e.currentTarget as any).style.background = 'transparent'; }}
                                                    >
                                                        <Pencil size={14} /> Diğer (Elle Yaz)
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {newPlannerTask.topic === 'Diğer' && (
                                        <input
                                            type="text"
                                            placeholder="Konu başlığını buraya yazın..."
                                            onChange={(e) => setNewPlannerTask({ ...newPlannerTask, topic: e.target.value })}
                                            style={{
                                                width: '100%', marginTop: '0.75rem', padding: '1rem', borderRadius: '16px',
                                                border: '1px solid var(--primary)', fontSize: '1rem', outline: 'none'
                                            }}
                                        />
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button
                                        onClick={() => setIsPlannerModalOpen(false)}
                                        style={{
                                            flex: 1, padding: '1rem', borderRadius: '18px', border: '1px solid #e2e8f0',
                                            background: 'white', color: '#64748b', fontWeight: 800, cursor: 'pointer'
                                        }}
                                    >
                                        Vazgeç
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!newPlannerTask.subject || !newPlannerTask.topic) {
                                                showToast({ type: 'warning', title: 'Hata', message: 'Lütfen tüm alanları doldurun.' });
                                                return;
                                            }

                                            const updatedData = [...plannerData];
                                            const currentPlan = updatedData[selectedPlanIndex];
                                            const newTasks = [...currentPlan.tasks];

                                            const taskData: any = {
                                                subject: newPlannerTask.subject,
                                                topic: newPlannerTask.topic,
                                                examType: newPlannerTask.examType,
                                                dayIndex: selectedDayIndexForTask,
                                                status: 'pending',
                                                isAiSuggested: false,
                                                id: `task-${Date.now()}`
                                            };

                                            if (editingTaskIndex !== null) {
                                                newTasks[editingTaskIndex] = { ...newTasks[editingTaskIndex], ...taskData };
                                            } else {
                                                newTasks.push(taskData);
                                            }

                                            updatedData[selectedPlanIndex] = { ...currentPlan, tasks: newTasks };
                                            setPlannerData(updatedData);
                                            setIsPlannerModalOpen(false);
                                            setEditingTaskIndex(null);
                                            showToast({
                                                type: 'success',
                                                title: editingTaskIndex !== null ? 'Görev Güncellendi' : 'Görev Eklendi',
                                                message: editingTaskIndex !== null ? 'Görev başarıyla güncellendi.' : 'Yeni görev çizelgeye yerleştirildi.'
                                            });
                                        }}
                                        style={{
                                            flex: 2, padding: '1rem', borderRadius: '18px', border: 'none',
                                            background: 'linear-gradient(135deg, var(--primary), #a855f7)',
                                            color: 'white', fontWeight: 800,
                                            cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(99,102,241,0.3)'
                                        }}
                                    >
                                        {editingTaskIndex !== null ? 'Görevi Güncelle' : 'Plana Ekle'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <HardTopicsModal
                isOpen={isHTExpanded}
                onClose={() => setIsHTExpanded(false)}
                student={student}
                selectedCourse={selectedHTCourse}
                onSelectCourse={setSelectedHTCourse}
            />
        </motion.div>
    );
};

export default StudentDetail;
