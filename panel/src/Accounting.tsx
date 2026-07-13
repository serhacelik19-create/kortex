import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  Filter, 
  Calendar, 
  ChevronRight,
  TrendingUp,
  CreditCard,
  Banknote,
  Search,
  Bell,
  Trash2,
  Edit2,
  X,
  Download,
  AlertTriangle,
  Building2,
  DollarSign
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api';

const Accounting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'installments' | 'categories' | 'students'>('overview');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState<any>(null);
  const [installmentConfig, setInstallmentConfig] = useState({ count: 10, startDate: new Date().toISOString().split('T')[0] });
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('income');
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [monthlyReport, setMonthlyReport] = useState<any[]>([]);
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' });
  const [typeFilter, setTypeFilter] = useState('');
  const [addForm, setAddForm] = useState({ description: '', amount: '', categoryId: '', paymentMethod: 'cash', date: new Date().toISOString().split('T')[0] });
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('expense');
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (dateFilter.startDate) filters.startDate = dateFilter.startDate;
      if (dateFilter.endDate) filters.endDate = dateFilter.endDate;
      if (typeFilter) filters.type = typeFilter;

      const [transData, instData, catData, studData, reportData, breakdownData] = await Promise.all([
        api.getAccountingTransactions(filters),
        api.getStudentInstallments(),
        api.getAccountingCategories(),
        api.getStudents(),
        api.getMonthlyReport(),
        api.getCategoryBreakdown()
      ]);
      setTransactions(transData);
      setInstallments(instData);
      setCategories(catData);
      setStudents(studData);
      setMonthlyReport(reportData);
      setCategoryBreakdown(breakdownData);
    } catch (err) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    totalIncome: transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0),
    totalExpense: transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0),
    pendingInstallments: installments.filter(i => i.status === 'pending' || i.status === 'overdue').reduce((acc, i) => acc + (i.amount - i.paidAmount), 0),
    overdueCount: installments.filter(i => i.status === 'overdue' || (i.status === 'pending' && new Date(i.dueDate) < new Date())).length,
    totalContract: students.reduce((a, s) => a + (s.totalContractAmount || 0), 0),
    totalCollected: students.reduce((a, s) => a + (s.downPayment || 0), 0) + installments.filter(i => i.paidAmount > 0).reduce((a, i) => a + i.paidAmount, 0)
  };
  const collectionRate = stats.totalContract > 0 ? Math.round((stats.totalCollected / stats.totalContract) * 100) : 0;

  const monthNames = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const chartData = monthlyReport.map(r => ({
    name: monthNames[parseInt(r.month.split('-')[1]) - 1] || r.month,
    gelir: r.gelir,
    gider: r.gider
  }));

  const generateReceipt = (student: any, inst: any, idx: number) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Makbuz</title><style>body{font-family:Arial;padding:40px;max-width:600px;margin:auto}h1{text-align:center;border-bottom:2px solid #333;padding-bottom:10px}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px;border-bottom:1px solid #eee}.label{color:#666;width:40%}.value{font-weight:bold}.footer{text-align:center;margin-top:40px;color:#999;font-size:12px}</style></head><body>`);
    w.document.write(`<h1>TAHSİLAT MAKBUZU</h1>`);
    w.document.write(`<table><tr><td class='label'>Öğrenci:</td><td class='value'>${student.name}</td></tr>`);
    w.document.write(`<tr><td class='label'>Taksit No:</td><td class='value'>${idx + 1}. Taksit</td></tr>`);
    w.document.write(`<tr><td class='label'>Tutar:</td><td class='value'>₺${inst.amount.toLocaleString()}</td></tr>`);
    w.document.write(`<tr><td class='label'>Ödenen:</td><td class='value'>₺${(inst.paidAmount || 0).toLocaleString()}</td></tr>`);
    w.document.write(`<tr><td class='label'>Vade:</td><td class='value'>${new Date(inst.dueDate).toLocaleDateString('tr-TR')}</td></tr>`);
    w.document.write(`<tr><td class='label'>Durum:</td><td class='value'>${inst.status === 'paid' ? 'Ödendi' : 'Kısmi Ödeme'}</td></tr>`);
    w.document.write(`<tr><td class='label'>Tarih:</td><td class='value'>${new Date().toLocaleDateString('tr-TR')}</td></tr></table>`);
    w.document.write(`<div class='footer'>Bu belge bilgisayar ortamında oluşturulmuştur.</div></body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="page-content" style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0 }}>Muhasebe Yönetimi</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Kurumun finansal durumunu takip edin ve yönetin.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className="btn btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={() => { setTransactionType('expense'); setShowAddModal(true); }}
          >
            <ArrowDownLeft size={18} /> Gider Ekle
          </button>
          <button 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={() => { setTransactionType('income'); setShowAddModal(true); }}
          >
            <Plus size={18} /> Gelir Ekle
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="stats-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%)', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div className="icon-box" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <Wallet size={20} />
            </div>
            <TrendingUp size={20} />
          </div>
          <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Toplam Net Bakiye</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.5rem 0', opacity: (stats.totalIncome - stats.totalExpense) === 0 ? 0.3 : 1 }}>
            ₺{(stats.totalIncome - stats.totalExpense).toLocaleString('tr-TR')}
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Bu ayki karlılık: +12%</div>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div className="icon-box" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              <ArrowUpRight size={20} />
            </div>
            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>+₺{stats.totalIncome.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Toplam Gelir</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.5rem 0', opacity: stats.totalIncome === 0 ? 0.3 : 1 }}>
            ₺{stats.totalIncome.toLocaleString('tr-TR')}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div className="icon-box" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
              <ArrowDownLeft size={20} />
            </div>
            <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>-₺{stats.totalExpense.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Toplam Gider</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.5rem 0', opacity: stats.totalExpense === 0 ? 0.3 : 1 }}>
            ₺{stats.totalExpense.toLocaleString('tr-TR')}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div className="icon-box" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
              <Bell size={20} />
            </div>
            {stats.overdueCount > 0 && (
              <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>{stats.overdueCount} Gecikmiş</span>
            )}
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Bekleyen Taksitler</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.5rem 0', opacity: stats.pendingInstallments === 0 ? 0.3 : 1 }}>
            ₺{stats.pendingInstallments.toLocaleString('tr-TR')}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div className="icon-box" style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5' }}>
              <TrendingUp size={20} />
            </div>
            <span style={{ fontSize: '0.75rem', color: collectionRate >= 50 ? '#10b981' : '#ef4444', fontWeight: 700 }}>%{collectionRate}</span>
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Tahsilat Oranı</div>
          <div style={{ margin: '0.75rem 0' }}>
            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${collectionRate}%`, height: '100%', background: collectionRate >= 50 ? '#10b981' : '#ef4444', borderRadius: 4, transition: 'width 0.5s' }}></div>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>₺{stats.totalCollected.toLocaleString()} / ₺{stats.totalContract.toLocaleString()}</div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="tabs-container" style={{ marginBottom: '2rem' }}>
        <div className="tabs" style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          {[
            { id: 'overview', label: 'Genel Bakış' },
            { id: 'transactions', label: 'Son İşlemler' },
            { id: 'installments', label: 'Taksit Takibi' },
            { id: 'students', label: 'Öğrenci Finans Kartları' },
            { id: 'categories', label: 'Kategoriler' }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '1rem 0.5rem',
                border: 'none',
                background: 'none',
                fontSize: '0.95rem',
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Gelir & Gider Analizi</h3>
            <div style={{ height: 350, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorGelir" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorGider" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={(value) => `₺${value}`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Area type="monotone" dataKey="gelir" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorGelir)" />
                  <Area type="monotone" dataKey="gider" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorGider)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Kategori Dağılımı</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {categoryBreakdown.length > 0 ? categoryBreakdown.slice(0, 6).map((item: any, i: number) => {
                const colors = ['#10b981', '#ef4444', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6'];
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                      <span>{item.name}</span>
                      <span style={{ fontWeight: 700 }}>₺{item.amount.toLocaleString()} (%{item.percentage})</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-sidebar)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${item.percentage}%`, height: '100%', background: colors[i % colors.length] }}></div>
                    </div>
                  </div>
                );
              }) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Henüz işlem yok.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Gecikmiş Taksit Uyarısı */}
      {stats.overdueCount > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{
          background: 'linear-gradient(135deg, #fef2f2, #fff1f2)',
          border: '1px solid #fecaca',
          borderRadius: '16px',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ background: '#ef4444', borderRadius: '12px', padding: '0.75rem', color: 'white' }}>
            <AlertTriangle size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#991b1b' }}>{stats.overdueCount} adet gecikmiş taksit bulunuyor!</div>
            <div style={{ fontSize: '0.85rem', color: '#b91c1c', marginTop: '0.25rem' }}>Toplam gecikmiş tutar: ₺{installments.filter(i => i.status === 'overdue' || (i.status === 'pending' && new Date(i.dueDate) < new Date())).reduce((a, i) => a + (i.amount - i.paidAmount), 0).toLocaleString()}</div>
          </div>
          <button onClick={() => setActiveTab('students')} className="btn btn-outline btn-sm" style={{ borderColor: '#fecaca', color: '#991b1b' }}>Detaylara Git</button>
        </motion.div>
      )}

      {activeTab === 'transactions' && (
        <div>
          {/* Filtre Barı */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Filter size={18} style={{ color: '#94a3b8' }} />
            <input type="date" value={dateFilter.startDate} onChange={e => setDateFilter({ ...dateFilter, startDate: e.target.value })} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }} />
            <span style={{ color: '#94a3b8' }}>—</span>
            <input type="date" value={dateFilter.endDate} onChange={e => setDateFilter({ ...dateFilter, endDate: e.target.value })} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }} />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
              <option value="">Tümü</option>
              <option value="income">Gelirler</option>
              <option value="expense">Giderler</option>
            </select>
            <button onClick={fetchData} className="btn btn-primary btn-sm">Filtrele</button>
            {(dateFilter.startDate || dateFilter.endDate || typeFilter) && (
              <button onClick={() => { setDateFilter({ startDate: '', endDate: '' }); setTypeFilter(''); setTimeout(fetchData, 100); }} className="btn btn-outline btn-sm">Temizle</button>
            )}
          </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Açıklama</th>
                <th>Kategori</th>
                <th>Tarih</th>
                <th>Ödeme Şekli</th>
                <th>Tutar</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length > 0 ? transactions.map(t => (
                <tr key={t.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div className={`icon-box-sm ${t.type === 'income' ? 'success' : 'danger'}`}>
                        {t.type === 'income' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                      </div>
                      <span style={{ fontWeight: 600 }}>{t.description}</span>
                    </div>
                  </td>
                  <td>{t.category?.name || 'Genel'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {new Date(t.date).toLocaleDateString('tr-TR')}
                  </td>
                  <td>
                    <span className="badge badge-secondary">{t.paymentMethod}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: t.type === 'income' ? '#10b981' : '#ef4444' }}>
                      {t.type === 'income' ? '+' : '-'}₺{t.amount.toLocaleString()}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="icon-btn"><Edit2 size={16} /></button>
                    <button className="icon-btn text-danger"><Trash2 size={16} /></button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Henüz bir işlem kaydı bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {activeTab === 'students' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedStudentId ? '350px 1fr' : '1fr', gap: '1.5rem' }}>
          {/* Öğrenci Listesi / Arama */}
          <div className="card" style={{ padding: '1.5rem', alignSelf: 'flex-start' }}>
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text" 
                placeholder="Öğrenci ara..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.75rem', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '600px', overflowY: 'auto' }}>
              {students
                .filter(s => s.name.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR')))
                .map(student => (
                  <motion.div 
                    key={student.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedStudentId(student.id)}
                    style={{ 
                      padding: '1.25rem', 
                      borderRadius: '16px', 
                      cursor: 'pointer',
                      background: selectedStudentId === student.id ? 'var(--primary)' : '#fff',
                      boxShadow: selectedStudentId === student.id ? '0 10px 15px -3px rgba(79, 70, 229, 0.4)' : '0 1px 3px rgba(0,0,0,0.05)',
                      color: selectedStudentId === student.id ? 'white' : '#1e293b',
                      border: '1px solid ' + (selectedStudentId === student.id ? 'var(--primary)' : '#f1f5f9'),
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{student.name}</div>
                      {selectedStudentId === student.id && <ChevronRight size={18} />}
                    </div>
                    <div style={{ 
                      fontSize: '0.8rem', 
                      opacity: selectedStudentId === student.id ? 0.8 : 1,
                      color: selectedStudentId === student.id ? 'white' : '#64748b', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginTop: '0.5rem' 
                    }}>
                      <span>{student.class}</span>
                      <span style={{ fontWeight: 800 }}>
                        ₺{(student.totalContractAmount || 0).toLocaleString()}
                      </span>
                    </div>
                  </motion.div>
                ))}
            </div>
          </div>

          {/* Seçili Öğrenci Detayı */}
          {selectedStudentId ? (() => {
            const student = students.find(s => s.id === selectedStudentId);
            const studentInsts = installments.filter(i => i.studentId === selectedStudentId);
            const totalPaid = studentInsts.reduce((acc, i) => acc + (i.paidAmount || 0), 0) + (student.downPayment || 0);
            const remaining = Math.max(0, (student.totalContractAmount || 0) - (student.discountAmount || 0) - totalPaid);

            return (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
                  {[
                    { label: 'Sözleşme Toplamı', value: student.totalContractAmount, color: '#4f46e5', bg: '#eff6ff', icon: <CreditCard size={20} /> },
                    { label: 'Toplam Tahsilat', value: totalPaid, color: '#10b981', bg: '#ecfdf5', icon: <TrendingUp size={20} /> },
                    { label: 'Kalan Borç', value: remaining, color: '#ef4444', bg: '#fff1f2', icon: <Wallet size={20} /> }
                  ].map((stat, i) => (
                    <div key={i} className="card" style={{ 
                      padding: '1.5rem', 
                      background: stat.bg, 
                      border: `1px solid ${stat.color}10`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <div style={{ color: stat.color, opacity: 0.1, position: 'absolute', right: '-10px', bottom: '-10px', transform: 'scale(2.5)' }}>
                        {stat.icon}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: stat.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#1e293b', opacity: (stat.value || 0) === 0 ? 0.3 : 1 }}>
                        ₺{(stat.value || 0).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="card" style={{ overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                  <div style={{ padding: '1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Taksit Planı & Ödeme Takibi</h4>
                    <button 
                      onClick={() => setShowInstallmentModal(true)} 
                      className="btn btn-primary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '10px' }}
                    >
                      <Calendar size={16} /> Otomatik Taksitlendir
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '1rem 1.5rem' }}>No</th>
                          <th>Vade Tarihi</th>
                          <th>Taksit Tutarı</th>
                          <th>Kalan Borç</th>
                          <th>Durum</th>
                          <th style={{ textAlign: 'right', paddingRight: '1.5rem' }}>İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentInsts.length > 0 ? studentInsts.map((inst, idx) => {
                          const instRemaining = inst.amount - (inst.paidAmount || 0);
                          const isPaid = inst.status === 'paid';
                          const isOverdue = inst.status === 'overdue' || (new Date(inst.dueDate) < new Date() && !isPaid);

                          return (
                            <tr key={inst.id} style={{ transition: 'background 0.2s' }}>
                              <td style={{ padding: '1rem 1.5rem', fontWeight: 600, color: '#64748b' }}>#{idx + 1}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <Calendar size={14} style={{ color: '#94a3b8' }} />
                                  {new Date(inst.dueDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                </div>
                              </td>
                              <td style={{ fontWeight: 800, color: '#1e293b' }}>₺{inst.amount.toLocaleString()}</td>
                              <td style={{ color: instRemaining > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                                {instRemaining > 0 ? `₺${instRemaining.toLocaleString()}` : '—'}
                              </td>
                              <td>
                                <span style={{ 
                                  padding: '0.4rem 0.8rem', 
                                  borderRadius: '20px', 
                                  fontSize: '0.75rem', 
                                  fontWeight: 700,
                                  background: isPaid ? '#ecfdf5' : isOverdue ? '#fff1f2' : '#fef3c7',
                                  color: isPaid ? '#10b981' : isOverdue ? '#ef4444' : '#d97706',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.4rem'
                                }}>
                                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                                  {isPaid ? 'Ödendi' : isOverdue ? 'Gecikti' : 'Bekliyor'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', paddingRight: '1.5rem' }}>
                                {!isPaid ? (
                                  <button 
                                    onClick={() => {
                                      setPaymentAmount(instRemaining.toString());
                                      setPaymentMethod('cash');
                                      setShowPaymentModal({ inst, idx, student });
                                    }}
                                    className="btn btn-primary btn-sm"
                                    style={{ borderRadius: '8px', padding: '0.5rem 1rem' }}
                                  >
                                    Tahsilat Al
                                  </button>
                                ) : (
                                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button 
                                      onClick={async () => {
                                        if (window.confirm('Bu ödemeyi iptal etmek istediğinize emin misiniz?')) {
                                          const lastTrans = transactions.find(t => t.installmentId === inst.id);
                                          if (lastTrans) {
                                            try {
                                              await api.deleteAccountingTransaction(lastTrans.id);
                                              fetchData();
                                            } catch (e) { console.error(e); }
                                          }
                                        }
                                      }}
                                      className="btn btn-outline btn-sm" 
                                      style={{ borderRadius: '8px', color: '#ef4444', borderColor: '#ef444420' }}
                                    >
                                      Ödemeyi İptal Et
                                    </button>
                                    <button onClick={() => generateReceipt(student, inst, idx)} className="btn btn-outline btn-sm" style={{ borderRadius: '8px' }}>
                                      <Download size={14} /> Makbuz
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        }) : (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
                              <Banknote size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                              <div style={{ fontWeight: 500 }}>Henüz taksit planı oluşturulmamış.</div>
                              <button onClick={() => setShowInstallmentModal(true)} className="btn btn-outline btn-sm" style={{ marginTop: '0.5rem' }}>Hemen Plan Oluştur</button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {/* Toplu Taksit Silme */}
                  {studentInsts.filter(i => i.paidAmount === 0).length > 0 && (
                    <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                      <button 
                        onClick={async () => {
                          if (window.confirm(`${student.name} için ödenmemiş tüm taksitleri silmek istediğinize emin misiniz?`)) {
                            try {
                              await api.deleteBulkInstallments(student.id);
                              fetchData();
                            } catch (e) { console.error(e); }
                          }
                        }}
                        className="btn btn-outline btn-sm"
                        style={{ color: '#ef4444', borderColor: '#fecaca', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        <Trash2 size={14} /> Tüm Ödenmemiş Taksitleri Sil
                      </button>
                    </div>
                  )}

                  {/* Ödeme Geçmişi */}
                  {(() => {
                    const studentTransactions = transactions.filter(t => t.studentId === selectedStudentId);
                    if (studentTransactions.length === 0) return null;
                    const methodLabels: any = { cash: 'Nakit', bank_transfer: 'Havale/EFT', credit_card: 'Kredi Kartı' };
                    return (
                      <div className="card" style={{ overflow: 'hidden', border: '1px solid #f1f5f9', marginTop: '1.5rem' }}>
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9' }}>
                          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Ödeme Geçmişi</h4>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                          {studentTransactions.map((t: any) => (
                            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', borderBottom: '1px solid #f8fafc' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ width: 32, height: 32, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.type === 'income' ? '#ecfdf5' : '#fff1f2', color: t.type === 'income' ? '#10b981' : '#ef4444' }}>
                                  {t.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.description}</div>
                                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(t.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })} • {methodLabels[t.paymentMethod] || t.paymentMethod}</div>
                                </div>
                              </div>
                              <span style={{ fontWeight: 700, color: t.type === 'income' ? '#10b981' : '#ef4444' }}>{t.type === 'income' ? '+' : '-'}₺{t.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            );
          })() : (
            <div className="card" style={{ padding: '5rem', textAlign: 'center', color: '#94a3b8' }}>
              <Wallet size={48} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
              <h3>Öğrenci Seçin</h3>
              <p>Finansal detaylarını ve taksitlerini görmek için sol listeden bir öğrenci seçin.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'installments' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Öğrenci</th>
                <th>Vade Tarihi</th>
                <th>Durum</th>
                <th>Toplam Tutar</th>
                <th>Ödenen</th>
                <th>Kalan</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {installments.length > 0 ? installments.map(i => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 600 }}>{i.student?.name}</td>
                  <td>{new Date(i.dueDate).toLocaleDateString('tr-TR')}</td>
                  <td>
                    <span className={`badge badge-${i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'danger' : 'warning'}`}>
                      {i.status === 'paid' ? 'Ödendi' : i.status === 'overdue' ? 'Gecikti' : 'Bekliyor'}
                    </span>
                  </td>
                  <td>₺{i.amount.toLocaleString()}</td>
                  <td style={{ color: '#10b981', opacity: (i.paidAmount || 0) === 0 ? 0.3 : 1 }}>₺{i.paidAmount.toLocaleString()}</td>
                  <td style={{ fontWeight: 700 }}>₺{(i.amount - i.paidAmount).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-primary btn-sm">Tahsil Et</button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Bekleyen veya geçmiş taksit bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'categories' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Mevcut Kategoriler</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {categories.length > 0 ? categories.map((cat: any) => (
                <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{cat.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{cat.type === 'income' ? 'Gelir' : 'Gider'} • {cat._count?.transactions || 0} işlem</div>
                  </div>
                  <button onClick={async () => { if (window.confirm('Kategoriyi silmek istiyor musunuz?')) { await api.deleteAccountingCategory(cat.id); fetchData(); } }} className="icon-btn text-danger"><Trash2 size={16} /></button>
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Henüz kategori eklenmemiş.</div>
              )}
            </div>
          </div>
          <div className="card" style={{ padding: '1.5rem', alignSelf: 'flex-start' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Yeni Kategori Ekle</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Kategori adı" style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
              <select value={newCatType} onChange={e => setNewCatType(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <option value="expense">Gider</option>
                <option value="income">Gelir</option>
              </select>
              <button onClick={async () => { if (!newCatName.trim()) return; await api.createAccountingCategory({ name: newCatName, type: newCatType }); setNewCatName(''); fetchData(); }} className="btn btn-primary">Kategori Ekle</button>
            </div>
          </div>
        </div>
      )}

      {/* Gelir/Gider Ekleme Modalı */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="card" style={{ width: '500px', padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>{transactionType === 'income' ? 'Gelir Ekle' : 'Gider Ekle'}</h2>
                <button onClick={() => setShowAddModal(false)} className="icon-btn"><X size={20} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input type="text" value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} placeholder={transactionType === 'income' ? 'Gelir açıklaması...' : 'Gider açıklaması...'} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <input type="number" value={addForm.amount} onChange={e => setAddForm({ ...addForm, amount: e.target.value })} placeholder="Tutar (₺)" style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontWeight: 700 }} />
                  <input type="date" value={addForm.date} onChange={e => setAddForm({ ...addForm, date: e.target.value })} style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <select value={addForm.categoryId} onChange={e => setAddForm({ ...addForm, categoryId: e.target.value })} style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <option value="">Kategorisiz</option>
                    {categories.filter((c: any) => c.type === transactionType).map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                  <select value={addForm.paymentMethod} onChange={e => setAddForm({ ...addForm, paymentMethod: e.target.value })} style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <option value="cash">Nakit</option>
                    <option value="bank_transfer">Havale/EFT</option>
                    <option value="credit_card">Kredi Kartı</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <button onClick={() => setShowAddModal(false)} className="btn btn-outline" style={{ flex: 1 }}>Vazgeç</button>
                  <button onClick={async () => {
                    if (!addForm.description || !addForm.amount) return;
                    await api.createAccountingTransaction({ ...addForm, amount: parseFloat(addForm.amount), type: transactionType, categoryId: addForm.categoryId || null });
                    setShowAddModal(false); setAddForm({ description: '', amount: '', categoryId: '', paymentMethod: 'cash', date: new Date().toISOString().split('T')[0] }); fetchData();
                  }} className="btn btn-primary" style={{ flex: 2 }}>{transactionType === 'income' ? 'Gelir Kaydet' : 'Gider Kaydet'}</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Taksitlendirme Modalı */}
      <AnimatePresence>
        {showInstallmentModal && selectedStudentId && (() => {
          const student = students.find(s => s.id === selectedStudentId);
          if (!student) return null;
          
          const studentInsts = installments.filter(i => i.studentId === selectedStudentId);
          const totalPaid = studentInsts.reduce((acc, i) => acc + (i.paidAmount || 0), 0) + (student.downPayment || 0);
          const remaining = Math.max(0, (student.totalContractAmount || 0) - (student.discountAmount || 0) - totalPaid);

          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="card" style={{ width: '450px', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <h2 style={{ margin: 0 }}>Taksitlendirme Sihirbazı</h2>
                  <button onClick={() => setShowInstallmentModal(false)} className="icon-btn"><X size={20} /></button>
                </div>

                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '12px', marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Kalan Borç Tutarı</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>₺{remaining.toLocaleString()}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Taksit Sayısı</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="24" 
                      value={installmentConfig.count}
                      onChange={(e) => setInstallmentConfig({ ...installmentConfig, count: parseInt(e.target.value) })}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>İlk Taksit Tarihi</label>
                    <input 
                      type="date" 
                      value={installmentConfig.startDate}
                      onChange={(e) => setInstallmentConfig({ ...installmentConfig, startDate: e.target.value })}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    />
                  </div>

                  <div style={{ background: '#eff6ff', padding: '1rem', borderRadius: '12px', fontSize: '0.9rem', color: '#1e40af' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span>Aylık Taksit Tutarı:</span>
                      <span style={{ fontWeight: 700 }}>₺{Math.floor(remaining / (installmentConfig.count || 1)).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>* Küsüratlar son taksite eklenecektir.</div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button onClick={() => setShowInstallmentModal(false)} className="btn btn-outline" style={{ flex: 1 }}>Vazgeç</button>
                    <button 
                      onClick={async () => {
                        try {
                          await api.createBulkInstallments({
                            studentId: selectedStudentId,
                            count: installmentConfig.count,
                            totalAmount: remaining,
                            startDate: installmentConfig.startDate
                          });
                          setShowInstallmentModal(false);
                          fetchData();
                        } catch (e) {
                          console.error(e);
                          alert('Taksitler oluşturulurken bir hata oluştu.');
                        }
                      }}
                      className="btn btn-primary" 
                      style={{ flex: 2 }}
                    >
                      Taksitleri Oluştur
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Tahsilat Modalı — Ödeme Yöntemi + Kısmi Ödeme */}
      <AnimatePresence>
        {showPaymentModal && (() => {
          const { inst, idx, student } = showPaymentModal;
          const instRemaining = inst.amount - (inst.paidAmount || 0);
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="card" style={{ width: '480px', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <h2 style={{ margin: 0 }}>Tahsilat Al</h2>
                  <button onClick={() => setShowPaymentModal(null)} className="icon-btn"><X size={20} /></button>
                </div>

                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{student.name} — {idx + 1}. Taksit</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                    <div><span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Taksit Tutarı:</span><br/><strong>₺{inst.amount.toLocaleString()}</strong></div>
                    <div><span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Kalan:</span><br/><strong style={{ color: '#ef4444' }}>₺{instRemaining.toLocaleString()}</strong></div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Ödeme Tutarı (₺)</label>
                    <input 
                      type="number" 
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      max={instRemaining}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1.1rem', fontWeight: 700 }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {[instRemaining, Math.floor(instRemaining / 2), Math.floor(instRemaining / 4)].filter(v => v > 0).map(v => (
                        <button key={v} onClick={() => setPaymentAmount(v.toString())} className="btn btn-outline btn-sm" style={{ fontSize: '0.75rem' }}>₺{v.toLocaleString()}</button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Ödeme Yöntemi</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                      {[
                        { id: 'cash', label: 'Nakit', icon: <Banknote size={20} /> },
                        { id: 'bank_transfer', label: 'Havale/EFT', icon: <Building2 size={20} /> },
                        { id: 'credit_card', label: 'Kredi Kartı', icon: <CreditCard size={20} /> }
                      ].map(m => (
                        <button 
                          key={m.id}
                          onClick={() => setPaymentMethod(m.id)}
                          style={{
                            padding: '1rem',
                            borderRadius: '12px',
                            border: `2px solid ${paymentMethod === m.id ? 'var(--primary)' : '#e2e8f0'}`,
                            background: paymentMethod === m.id ? 'var(--primary)08' : 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s',
                            color: paymentMethod === m.id ? 'var(--primary)' : '#64748b'
                          }}
                        >
                          {m.icon}
                          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button onClick={() => setShowPaymentModal(null)} className="btn btn-outline" style={{ flex: 1 }}>Vazgeç</button>
                    <button 
                      onClick={async () => {
                        const amt = parseFloat(paymentAmount);
                        if (!amt || amt <= 0) return;
                        try {
                          await api.createAccountingTransaction({
                            studentId: student.id,
                            installmentId: inst.id,
                            amount: amt,
                            type: 'income',
                            description: `${student.name} - ${idx + 1}. Taksit Ödemesi`,
                            paymentMethod,
                            date: new Date()
                          });
                          setShowPaymentModal(null);
                          fetchData();
                        } catch (e) { console.error(e); }
                      }}
                      className="btn btn-primary" 
                      style={{ flex: 2 }}
                      disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                    >
                      <DollarSign size={18} /> Ödemeyi Kaydet
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

export default Accounting;
