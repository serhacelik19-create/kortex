import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users as UsersIcon,
  GraduationCap,
  Settings,
  Bell,
  LogOut,
  Layers,
  CalendarCheck,
  Menu,
  ShieldCheck,
  BookOpen,
  Wallet
} from 'lucide-react';
import Dashboard from './Dashboard';
import StudentList from './StudentList';
import StudentDetail from './StudentDetail';
import ExamCenter from './ExamCenter';
import ParentCRM from './ParentCRM';
import SettingsPage from './SettingsPage';
import ClassList from './ClassList';
import ClassDetail from './ClassDetail';
import StudentAccounts from './StudentAccounts';
import Attendance from './Attendance';
import Login from './Login';
import GuidanceCenter from './GuidanceCenter';
import ClassProgress from './ClassProgress';
import Accounting from './Accounting';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Clock as ClockIcon, ChevronRight, X as XIcon, Activity, ClipboardList } from 'lucide-react';
import { api } from './api';

const App: React.FC = () => {
  // Initialize state from localStorage if available
  const [activeTab, setActiveTab] = useState<'dashboard' | 'students' | 'accounts' | 'classes' | 'exams' | 'parents' | 'attendance' | 'guidance' | 'settings' | 'progress' | 'accounting'>(() => {
    return (localStorage.getItem('activeTab') as any) || 'dashboard';
  });
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(() => {
    const saved = localStorage.getItem('selectedStudentId');
    return saved ? parseInt(saved) : null;
  });
  const [selectedClassName, setSelectedClassName] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  const toggleSidebarCollapse = () => {
    setIsCollapsed(!isCollapsed);
    localStorage.setItem('sidebarCollapsed', (!isCollapsed).toString());
  };

  // Ekran boyutu değiştiğinde sidebar'ı kapat
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsCollapsed(false);
      }
      if (window.innerWidth > 900) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  const tabPermissionMap: Record<string, string> = {
    parents: 'crm',
    progress: 'classProgress',
  };

  const getRequiredPermission = (tab: string) => tabPermissionMap[tab] || tab;

  const canAccessTab = (tab: string) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'super_admin') return true;
    return (user.permissions || []).includes(getRequiredPermission(tab));
  };

  const getFallbackTab = () => {
    const perms = user?.permissions || [];
    if (perms.includes('dashboard')) return 'dashboard';
    if (perms.includes('crm')) return 'parents';
    if (perms.includes('classProgress')) return 'progress';
    return perms[0] || 'dashboard';
  };

  const fetchNotifications = async () => {
    try {
      const [parents, attendanceRisk, trending] = await Promise.all([
        api.getParents(),
        api.getAttendanceRisk(),
        api.getTrendingStudents()
      ]);

      const newNotifs: any[] = [];

      // 1. Rapor Takibi
      const unsentReports = parents.filter((p: any) => p.status !== 'sent');
      if (unsentReports.length > 0) {
        newNotifs.push({
          id: 'report-unsent',
          type: 'report',
          title: 'Gönderilmemiş Raporlar',
          message: `${unsentReports.length} öğrencinin haftalık raporu henüz velisine iletilmedi.`,
          time: 'Şimdi',
          isRead: false,
          severity: 'warning'
        });
      }

      // 2. Devamsızlık Riski
      if (attendanceRisk && attendanceRisk.length > 0) {
        attendanceRisk.slice(0, 3).forEach((risk: any, idx: number) => {
          newNotifs.push({
            id: `att-risk-${idx}`,
            type: 'attendance',
            title: 'Devamsızlık Alarmı',
            message: `${risk.studentName} son dönemde ${risk.absentCount} gün devamsızlık yaptı.`,
            time: 'Az önce',
            isRead: false,
            severity: risk.riskLevel === 'High' ? 'danger' : 'warning'
          });
        });
      }

      // 3. Performans Düşüşleri
      const droppingStudents = trending.filter((s: any) => s.trend === 'down');
      if (droppingStudents.length > 0) {
        droppingStudents.slice(0, 2).forEach((s: any, idx: number) => {
          newNotifs.push({
            id: `perf-drop-${idx}`,
            type: 'performance',
            title: 'Hız Kaybı Tespiti',
            message: `${s.name} isimli öğrencinin netlerinde düşüş trendi başladı.`,
            time: 'Bugün',
            isRead: false,
            severity: 'danger'
          });
        });
      }

      setNotifications(newNotifs);
    } catch (err) {
      console.error('Bildirim verileri çekilemedi:', err);
    }
  };

  // Verileri periyodik veya açılışta çek
  useEffect(() => {
    if (user && user.role === 'admin') {
      fetchNotifications();
    }
  }, [user]);

  // Yetki Kontrolü ve Güvenli Yönlendirme
  useEffect(() => {
    if (user && user.role !== 'admin') {
      // Eğer kullanıcının bulunduğu sekmeye yetkisi yoksa
      if (!canAccessTab(activeTab)) {
        setActiveTab(getFallbackTab() as any);
      }
    }
  }, [user, activeTab]);

  // Hareketsizlik (Inactivity) Otomatik Çıkışı (15 Dakika)
  useEffect(() => {
    if (!user) return;
    let inactivityTimer: any;
    
    const logoutUser = async () => {
      handleLogout();
      // Sunucudan da çerezi silmek için api.ts içindeki mantığı kopyalıyoruz
      try { await api.logout(); } catch(e){}
      window.location.href = '/login?reason=inactivity';
    };

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(logoutUser, 15 * 60 * 1000); // 15 dakika
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(e => document.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(e => document.removeEventListener(e, resetTimer));
    };
  }, [user]);

  // Dinamik Tema ve Renk Uygulama
  useEffect(() => {
    if (user && user.institution) {
      const primaryColor = user.institution.primaryColor || '#6366f1';
      document.documentElement.style.setProperty('--primary', primaryColor);

      // Hover rengi için ana rengi biraz koyulaştıralım (veya secondary varsa kullanalım)
      const secondaryColor = user.institution.secondaryColor || '#4f46e5';
      document.documentElement.style.setProperty('--primary-hover', secondaryColor);
    } else {
      // Varsayılan renkler
      document.documentElement.style.setProperty('--primary', '#6366f1');
      document.documentElement.style.setProperty('--primary-hover', '#4f46e5');
    }
  }, [user]);

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (selectedStudentId !== null) {
      localStorage.setItem('selectedStudentId', selectedStudentId.toString());
    } else {
      localStorage.removeItem('selectedStudentId');
    }
  }, [selectedStudentId]);

  const handleSelectStudent = (id: number) => {
    setSelectedStudentId(id);
    setActiveTab('students');
  };

  const handleLoginSuccess = (userData: any, token?: string) => {
    // Backend'den dönen userData içinde artık institution da var
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    // Safari Mobil gibi üçüncü taraf cookie engelleyen tarayıcılarda da çalışabilmesi için token'ı localStorage'a kaydediyoruz.
    if (token) {
      localStorage.setItem('token', token);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {}
    
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    // Renkleri sıfırla
    document.documentElement.style.setProperty('--primary', '#6366f1');
    document.documentElement.style.setProperty('--primary-hover', '#4f46e5');
  };

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const renderContent = () => {
    if (!canAccessTab(activeTab)) {
      return <Dashboard />;
    }

    if (activeTab === 'dashboard') {
      return <Dashboard />;
    }

    if (activeTab === 'students') {
      if (selectedStudentId) {
        return <StudentDetail studentId={selectedStudentId} onBack={() => setSelectedStudentId(null)} />;
      }
      return <StudentList onSelectStudent={handleSelectStudent} />;
    }

    if (activeTab === 'accounts') {
      return <StudentAccounts />;
    }

    if (activeTab === 'classes') {
      if (selectedClassName) {
        return (
          <ClassDetail
            className={selectedClassName}
            onBack={() => setSelectedClassName(null)}
            onSelectStudent={(id) => {
              setSelectedStudentId(id);
              setActiveTab('students');
            }}
          />
        );
      }
      return <ClassList onSelectClass={(name) => setSelectedClassName(name)} />;
    }

    if (activeTab === 'exams') {
      return <ExamCenter />;
    }

    if (activeTab === 'parents') {
      return <ParentCRM onSelectStudent={handleSelectStudent} />;
    }

    if (activeTab === 'attendance') {
      return <Attendance />;
    }

    if (activeTab === 'guidance') {
      return <GuidanceCenter />;
    }

    if (activeTab === 'progress') {
      return <ClassProgress />;
    }

    if (activeTab === 'accounting') {
      return <Accounting />;
    }

    if (activeTab === 'settings') {
      return user.role === 'admin' ? <SettingsPage /> : <Dashboard />;
    }

    return <Dashboard />;
  };

  return (
    <div className="app-layout">
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
        <button className="sidebar-toggle-btn desktop-only" onClick={toggleSidebarCollapse}>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronRight style={{ transform: 'rotate(180deg)' }} size={14} />}
        </button>

        <div className="sidebar-logo">
          <div className="logo-icon">K</div>
          {!isCollapsed && <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Kortex</span>}
        </div>

        <nav className="nav-menu">
          {(user.role === 'admin' || (user.permissions || []).includes('dashboard')) && (
            <div
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('dashboard');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <LayoutDashboard size={20} />
              <span>Genel Panel</span>
            </div>
          )}

          {(user.role === 'admin' || (user.permissions || []).includes('students')) && (
            <div
              className={`nav-item ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('students');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <UsersIcon size={20} />
              <span>Öğrenciler</span>
            </div>
          )}

          {(user.role === 'admin' || (user.permissions || []).includes('accounts')) && (
            <div
              className={`nav-item ${activeTab === 'accounts' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('accounts');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <ShieldCheck size={20} />
              <span>Öğrenci Hesapları</span>
            </div>
          )}

          {(user.role === 'admin' || (user.permissions || []).includes('classes')) && (
            <div
              className={`nav-item ${activeTab === 'classes' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('classes');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <Layers size={20} />
              <span>Sınıflar</span>
            </div>
          )}

          {(user.role === 'admin' || (user.permissions || []).includes('crm')) && (
            <div
              className={`nav-item ${activeTab === 'parents' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('parents');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <UsersIcon size={20} />
              <span>Veliler</span>
            </div>
          )}

          {(user.role === 'admin' || (user.permissions || []).includes('attendance')) && (
            <div
              className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('attendance');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <CalendarCheck size={20} />
              <span>Yoklama</span>
            </div>
          )}

          {(user.role === 'admin' || (user.permissions || []).includes('exams')) && (
            <div
              className={`nav-item ${activeTab === 'exams' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('exams');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <GraduationCap size={20} />
              <span>Deneme Merkezi</span>
            </div>
          )}

          {(user.role === 'admin' || (user.permissions || []).includes('guidance')) && (
            <div
              className={`nav-item ${activeTab === 'guidance' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('guidance');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <ClipboardList size={20} />
              <span>Rehberlik & Atama</span>
            </div>
          )}

          {(user.role === 'admin' || (user.permissions || []).includes('classProgress')) && (
            <div
              className={`nav-item ${activeTab === 'progress' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('progress');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <BookOpen size={20} />
              <span>Müfredat Takibi</span>
            </div>
          )}

          {user.role === 'admin' && (
            <div
              className={`nav-item ${activeTab === 'accounting' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('accounting');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <Wallet size={20} />
              <span>Muhasebe</span>
            </div>
          )}

          {user.role === 'admin' && (
            <div
              className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('settings');
                setSelectedStudentId(null);
                setIsSidebarOpen(false);
              }}
            >
              <Settings size={20} />
              <span>Ayarlar</span>
            </div>
          )}
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <div className="nav-item" onClick={handleLogout}>
            <LogOut size={20} />
            <span>Çıkış Yap</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-container">
        {/* Top Header Bar */}
        <header style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-sidebar)',
          backdropFilter: 'var(--glass-effect)',
          WebkitBackdropFilter: 'var(--glass-effect)',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
            <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)} aria-label="Menü">
              <Menu size={24} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexShrink: 0 }} className="header-actions">
            {user.role === 'admin' && (
              <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setIsNotificationsOpen(true)}>
                <Bell size={20} color="var(--text-muted)" />
                {notifications.some(n => !n.isRead) && (
                  <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, background: 'var(--accent-danger)', borderRadius: '50%', border: '2px solid var(--bg-card)' }}></div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, background: 'var(--primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', overflow: 'hidden' }}>
                {user.avatar && !user.avatar.includes('http') ? user.avatar : <UsersIcon size={20} />}
              </div>
              <div className="teacher-info">
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{user.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.institution?.name} • {user.role === 'admin' ? 'Yönetici' : user.role === 'editor' ? 'Rehberlik' : 'Öğretmen'}</div>
              </div>
            </div>
          </div>
        </header>

        {renderContent()}
      </main>

      {/* Notifications Drawer */}
      <AnimatePresence>
        {isNotificationsOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNotificationsOpen(false)}
              className="drawer-overlay"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="drawer-content"
            >
              <div className="drawer-header">
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Bildirim Merkezi</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {notifications.filter(n => !n.isRead).length} okunmamış bildiriminiz var
                    </p>
                    {notifications.length > 0 && (
                      <>
                        <span style={{ color: '#e2e8f0' }}>•</span>
                        <button 
                          onClick={() => setNotifications([])}
                          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-danger)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s' }}
                          onMouseOver={(e) => e.currentTarget.style.opacity = '0.7'}
                          onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                        >
                          Tümünü Temizle
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <button className="modal-close" onClick={() => setIsNotificationsOpen(false)}>
                  <XIcon size={18} />
                </button>
              </div>

              <div className="drawer-body">
                {notifications.length > 0 ? (
                  notifications.map(notif => (
                    <div 
                      key={notif.id} 
                      className={`notification-item ${notif.isRead ? 'read' : 'unread'}`}
                      style={{ position: 'relative' }}
                      onClick={() => {
                        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
                      }}
                    >
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setNotifications(prev => prev.filter(n => n.id !== notif.id));
                        }}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '8px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          opacity: 0.4,
                          transition: 'all 0.2s'
                        }}
                        className="notif-delete-btn"
                      >
                        <XIcon size={14} />
                      </button>
                      <div className={`notif-icon-box ${notif.severity}`}>
                        {notif.type === 'report' && <ClockIcon size={16} />}
                        {notif.type === 'performance' && <AlertTriangle size={16} />}
                        {notif.type === 'attendance' && <Activity size={16} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: '20px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{notif.title}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{notif.time}</span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                          {notif.message}
                        </p>
                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>
                          Detayları Gör <ChevronRight size={12} />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <Bell size={40} color="#e2e8f0" />
                    <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Henüz bildiriminiz yok.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
