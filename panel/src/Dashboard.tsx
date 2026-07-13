import React, { useEffect, useState } from 'react';
import {
    Users,
    TrendingUp,
    MessageSquare,
    Award,
    BookOpen,
    AlertCircle,
    Activity,
    Clock,
    PieChart as PieChartIcon,
    X,
    ChevronRight,
    CheckCircle
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api';

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeDetail, setActiveDetail] = useState<{ type: string, title: string, data: any[] } | null>(null);
    const [isGuidanceExpanded, setIsGuidanceExpanded] = useState(false);
    const [showActiveStudents, setShowActiveStudents] = useState(false);
    const [activeStudentsList, setActiveStudentsList] = useState<any[]>([]);
    const [isLoadingActive, setIsLoadingActive] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await api.getDashboardStats();
                setStats(data);
            } catch (error) {
                console.error('Stats loading error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();

        // 30 saniyede bir istatistikleri yenile (Canlılık hissi için)
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchActiveStudentsDetails = async () => {
        setShowActiveStudents(true); // Pencereyi beklemeden anında aç
        setIsLoadingActive(true);
        try {
            const data = await api.getActiveStudentsDetails();
            setActiveStudentsList(data);
        } catch (error) {
            console.error('Active students loading error:', error);
            // Hata durumunda boş liste veya uyarı gösterilebilir
            setActiveStudentsList([]);
        } finally {
            setIsLoadingActive(false);
        }
    };

    if (loading || !stats) {
        return (
            <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
                <div className="loading-spinner">Yükleniyor...</div>
            </div>
        );
    }

    return (
        <div className="main-content">
            <header className="page-header" style={{ marginBottom: '3.5rem', position: 'relative', zIndex: 100 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.04em' }}>Akademi Genel Paneli</h1>
                    <p style={{ color: 'var(--text-soft)', marginTop: '0.5rem', fontWeight: 500 }}>İstatistikler anlık olarak analiz edilmektedir.</p>
                </div>
                <div 
                    className="card interactive-card" 
                    style={{ 
                        padding: '0.85rem 1.75rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '1rem', 
                        cursor: 'pointer',
                        borderRadius: '16px',
                        background: 'white',
                        border: '1px solid var(--border-color)',
                        boxShadow: 'var(--shadow-md)'
                    }}
                    onClick={fetchActiveStudentsDetails}
                >
                    <div className="active-status"></div>
                    <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>{stats.active_students || 0} Öğrenci Aktif</span>

                    {/* Active Students Popover */}
                    <AnimatePresence>
                        {showActiveStudents && (
                            <>
                                {/* Click Outside To Close Overlay */}
                                <div 
                                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 8999 }} 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowActiveStudents(false);
                                    }}
                                />
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 15px)',
                                        right: 0,
                                        width: '340px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.85)',
                                        backdropFilter: 'blur(16px) saturate(180%)',
                                        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                                        borderRadius: '24px',
                                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                                        border: '1px solid rgba(255, 255, 255, 0.5)',
                                        zIndex: 9000,
                                        padding: '1.25rem',
                                        transformOrigin: 'top right'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div className="active-status" style={{ width: 8, height: 8 }}></div>
                                        Şu An Aktif Olanlar
                                    </div>
                                    <button 
                                        onClick={() => setShowActiveStudents(false)}
                                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className="custom-scrollbar" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                    {isLoadingActive ? (
                                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Veriler güncelleniyor...</div>
                                    ) : activeStudentsList.length > 0 ? (
                                        activeStudentsList.map((st) => (
                                            <div key={st.id} style={{ 
                                                padding: '0.75rem', 
                                                borderRadius: '12px', 
                                                marginBottom: '0.5rem', 
                                                background: '#f8fafc',
                                                border: '1px solid #f1f5f9'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{st.name}</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600, background: 'color-mix(in srgb, var(--primary), transparent 90%)', padding: '2px 6px', borderRadius: '4px' }}>
                                                        {st.class}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                    <Activity size={12} />
                                                    {st.activity}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Şu an aktif öğrenci yok.</div>
                                    )}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>
            </header>

            <div className="dashboard-grid">
                {/* Row 1: KPI Cards */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card premium-card col-span-3">
                    <div className="card-title"><Users size={16} /> Toplam Öğrenci</div>
                    <div className="card-value">{stats.total_students || 0}</div>
                    {stats.student_growth !== undefined && (
                        <div className={`card-trend ${stats.student_growth >= 0 ? 'trend-up' : 'trend-down'}`}>
                            {stats.student_growth >= 0 ? '+' : ''}{stats.student_growth}% geçen aydan
                        </div>
                    )}
                </motion.div>

                <motion.div 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} 
                    className="card premium-card interactive-card col-span-3"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveDetail({ type: 'trend', title: 'Trend Çözülen Dersler (Son 24s)', data: stats.trend_list || [] })}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="card-title"><TrendingUp size={16} /> Trend Çözülen</div>
                        <ChevronRight size={14} color="var(--text-soft)" />
                    </div>
                    <div className="card-value" style={{ fontSize: '1.75rem' }}>{stats.trend_subject || 'Yükleniyor'}</div>
                    <div className="card-subtitle">Son 24 saatte <strong style={{color: 'var(--text-main)'}}>{stats.trend_count || '0'}</strong> soru</div>
                </motion.div>

                <motion.div 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} 
                    className="card premium-card interactive-card col-span-3"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveDetail({ type: 'asked', title: 'En Çok Sorulan Konular (Son 30g)', data: stats.most_asked_list || [] })}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="card-title"><MessageSquare size={16} /> En Çok Sorulan</div>
                        <ChevronRight size={14} color="var(--text-soft)" />
                    </div>
                    <div className="card-value" style={{ fontSize: '1.75rem' }}>{stats.most_asked_subject || 'Yükleniyor'}</div>
                    <div className="card-subtitle">Asistana gelen en yoğun talepler</div>
                </motion.div>

                <motion.div 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} 
                    className="card premium-card interactive-card col-span-3"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveDetail({ type: 'champ', title: 'Haftalık Liderlik Tablosu', data: stats.weekly_champ_list || [] })}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="card-title"><Award size={16} /> Haftanın Şampiyonu</div>
                        <ChevronRight size={14} color="var(--text-soft)" />
                    </div>
                    <div className="card-value" style={{ fontSize: '1.5rem' }}>{stats.weekly_champ || 'Belirlenmedi'}</div>
                    <div className="card-subtitle"><strong style={{color: 'var(--text-main)'}}>{stats.weekly_champ_count || 0}</strong> Soru Çözüldü</div>
                </motion.div>

                {/* Row 2: Charts & Progress */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="card premium-card col-span-8">
                    <div className="card-title"><Activity size={16} /> Soru Çözme Yoğunluğu (Saatlik)</div>
                    <div style={{ width: '100%', height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorWave" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis 
                                    dataKey="hour" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--text-soft)', fontSize: 11, fontWeight: 600 }} 
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--text-soft)', fontSize: 11, fontWeight: 600 }}
                                />
                                <Tooltip
                                    contentStyle={{ 
                                        backgroundColor: 'rgba(255, 255, 255, 0.96)', 
                                        backdropFilter: 'blur(12px)',
                                        borderColor: 'var(--border-color)', 
                                        borderRadius: '16px',
                                        boxShadow: 'var(--shadow-premium)',
                                        border: '1px solid var(--border-color)',
                                        padding: '12px 16px'
                                    }}
                                    itemStyle={{ color: 'var(--text-main)', fontWeight: 800, fontSize: '0.95rem' }}
                                    labelStyle={{ color: 'var(--text-soft)', fontWeight: 600, marginBottom: '4px' }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="questions" 
                                    name="Soru" 
                                    stroke="var(--primary)" 
                                    strokeWidth={4} 
                                    fillOpacity={1} 
                                    fill="url(#colorWave)"
                                    activeDot={{ r: 6, stroke: 'white', strokeWidth: 2 }}
                                    animationDuration={1500}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="card premium-card col-span-4">
                    <div className="card-title"><PieChartIcon size={16} /> TYT / AYT Dağılımı</div>
                    <div style={{ width: '100%', height: 260, position: 'relative' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.tytAytData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={100}
                                    paddingAngle={6}
                                    cornerRadius={10}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {stats.tytAytData.map((_entry: any, index: number) => (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            fill={index === 0 ? 'var(--primary)' : '#f43f5e'} 
                                        />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
                                />
                                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                                    <tspan x="50%" dy="-0.2em" fontSize="0.75rem" fontWeight="600" fill="var(--text-soft)">TOPLAM</tspan>
                                    <tspan x="50%" dy="1.4em" fontSize="1.8rem" fontWeight="800" fill="var(--text-main)">
                                        {stats.tytAytData.reduce((acc: number, item: any) => acc + item.value, 0)}
                                    </tspan>
                                </text>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                        {stats.tytAytData.map((item: any, i: number) => (
                            <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                                    <div style={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: i === 0 ? 'var(--primary)' : '#f43f5e' }}></div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>{item.name}</span>
                                </div>
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>{item.value} Soru</span>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Row 3: Lists & Specific Insights */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="card premium-card col-span-4">
                    <div className="card-title"><BookOpen size={18} /> Genel Müfredat İlerleme</div>
                    <div className="card-value">{stats.curriculum_progress || 0}%</div>
                    <div className="progress-container">
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${stats.curriculum_progress}%` }}></div>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                        Kurumdaki tüm öğrencilerin ortalama konu tamamlama oranı.
                    </p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="card col-span-4">
                    <div className="card-title"><AlertCircle size={18} /> En Çok Yanlış Yapılan Dersler</div>
                    <div style={{ marginTop: '1rem' }}>
                        {stats.wrongTopicsData.map((item: any) => (
                            <div key={item.course} className="student-list-item">
                                <span style={{ fontSize: '0.875rem' }}>{item.course}</span>
                                <span style={{ fontWeight: 600, color: 'var(--accent-danger)' }}>{item.count} Hata</span>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="card col-span-4">
                    <div className="card-title"><AlertCircle size={18} /> Düşüş Yaşayanlar (-%30+)</div>
                    <div style={{ marginTop: '1rem' }}>
                        {stats.dropStudents && stats.dropStudents.length > 0 ? (
                            stats.dropStudents.map((item: any) => (
                                <div key={item.name} className="student-list-item">
                                    <div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{item.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.type}</div>
                                    </div>
                                    <span style={{ color: 'var(--accent-danger)', fontWeight: 700 }}>{item.drop}</span>
                                </div>
                            ))
                        ) : (
                            <div className="student-list-item" style={{ borderBottom: 'none', opacity: 0.8 }}>
                                <div>
                                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)' }}>Sistem İzleniyor</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Yeterli düşüş saptanmadı</div>
                                </div>
                                <span style={{ color: 'var(--accent-danger)', fontWeight: 700, fontSize: '1.2rem' }}>-</span>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Row 4: Guidance & Heatmap */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0 }} className="card col-span-6">
                    <div className="card-title" style={{ color: 'var(--accent-warning)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={18} /> Rehberlik Müdahale Gerekenler</span>
                        {stats.guidanceAlerts && stats.guidanceAlerts.length > 2 && (
                            <button 
                                onClick={() => setIsGuidanceExpanded(!isGuidanceExpanded)} 
                                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '4px 8px', borderRadius: '6px' }}
                                className="student-row-hover"
                            >
                                {isGuidanceExpanded ? 'Pencereyi Daralt' : 'Tümünü Gör (' + stats.guidanceAlerts.length + ')'}
                            </button>
                        )}
                    </div>
                    <div className="custom-scrollbar" style={{ marginTop: '1rem', maxHeight: isGuidanceExpanded ? '400px' : 'none', overflowY: isGuidanceExpanded ? 'auto' : 'visible', paddingRight: isGuidanceExpanded ? '0.5rem' : '0' }}>
                        {stats.guidanceAlerts && stats.guidanceAlerts.length > 0 ? (
                            (isGuidanceExpanded ? stats.guidanceAlerts : stats.guidanceAlerts.slice(0, 2)).map((item: any) => (
                                <div key={item.student} className="card" style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.05)', marginBottom: '0.75rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700 }}>{item.student}</span>
                                        <span className={`badge ${item.priority === 'High' ? 'badge-alert' : 'badge-info'}`}>{item.priority}</span>
                                    </div>
                                    <p style={{ fontSize: '0.875rem', margin: '0.5rem 0 0', color: 'var(--text-muted)' }}>{item.issue}</p>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                                <CheckCircle size={40} color="#10b981" style={{ opacity: 0.8, marginBottom: '1rem' }} />
                                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>Harika Haber!</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>Şu an hiçbir öğrenci için acil rehberlik müdahalesi gerekmiyor. Öğrencilerin ilerlemesi stabil.</div>
                            </div>
                        )}
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }} className="card col-span-6">
                    <div className="card-title"><Clock size={18} /> Sistem Yoğunluk Haritası (Haftalık)</div>

                    <div className="heatmap-hours">
                        <div></div>
                        {Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className="heatmap-hour-label">{i}</div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((day, dayIndex) => (
                            <div key={day} className="heatmap-grid" style={{ marginTop: 0 }}>
                                <div className="heatmap-day-label">{day}</div>
                                {Array.from({ length: 24 }).map((_, hourIndex) => {
                                    const intensity = stats.heatmapData?.[dayIndex]?.[hourIndex] || 0.05;
                                    return (
                                        <div
                                            key={hourIndex}
                                            className="heatmap-box"
                                            style={{
                                                backgroundColor: 'var(--primary)',
                                                opacity: intensity < 0.1 ? 0.05 : intensity
                                            }}
                                            title={`${day} Saat ${hourIndex}:00 - Yoğunluk: %${Math.round(intensity * 100)}`}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Düşük</span>
                        <div style={{ display: 'flex', gap: '2px' }}>
                            {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => (
                                <div key={i} style={{ width: 10, height: 10, borderRadius: '1px', backgroundColor: 'var(--primary)', opacity: i }}></div>
                            ))}
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Yüksek</span>
                    </div>
                </motion.div>
            </div>

            {/* Detail Modal */}
            {activeDetail && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, padding: '2rem'
                }} onClick={() => setActiveDetail(null)}>
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        style={{
                            background: 'var(--bg-card)', borderRadius: '24px', width: '100%', maxWidth: '500px',
                            padding: '2rem', boxShadow: 'var(--shadow-lg)',
                            position: 'relative',
                            border: '1px solid var(--border-color)'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button 
                            onClick={() => setActiveDetail(null)}
                            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'var(--bg-main)', border: 'none', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}
                        >
                            <X size={20} color="var(--text-muted)" />
                        </button>

                        <h2 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem' }}>
                            {activeDetail.type === 'trend' && <TrendingUp size={24} color="var(--primary)" />}
                            {activeDetail.type === 'asked' && <MessageSquare size={24} color="var(--primary)" />}
                            {activeDetail.type === 'champ' && <Award size={24} color="var(--primary)" />}
                            {activeDetail.title}
                        </h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {activeDetail.data.length > 0 ? activeDetail.data.map((item, idx) => (
                                <div key={idx} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '1rem 1.25rem', background: idx === 0 ? 'var(--primary)08' : '#f8fafc',
                                    borderRadius: '16px', border: idx === 0 ? '1px solid var(--primary)20' : '1px solid #f1f5f9'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ 
                                            width: '28px', height: '28px', borderRadius: '50%', 
                                            background: idx === 0 ? 'var(--primary)' : '#e2e8f0',
                                            color: idx === 0 ? 'white' : '#64748b',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.8rem', fontWeight: 800
                                        }}>
                                            {idx + 1}
                                        </div>
                                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.name}</span>
                                    </div>
                                    <span style={{ 
                                        fontWeight: 800, color: idx === 0 ? 'var(--primary)' : '#64748b',
                                        fontSize: '0.9rem'
                                    }}>
                                        {item.count} Soru
                                    </span>
                                </div>
                            )) : (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>Henüz yeterli veri saptanmadı.</p>
                            )}
                        </div>

                        <button 
                            className="btn-primary" 
                            style={{ width: '100%', marginTop: '2rem', padding: '1rem' }}
                            onClick={() => setActiveDetail(null)}
                        >
                            Anladım
                        </button>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;

