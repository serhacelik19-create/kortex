import React, { useState, useEffect } from 'react';
import {
    UserPlus,
    Shield,
    Trash2,
    Edit,
    X,
    Lock,
    User as UserIcon,
    Search,
    RefreshCcw,
    AtSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './api';
import { usePanelToast } from './components/PanelToastProvider';
import { usePanelConfirm } from './components/PanelConfirmProvider';

interface User {
    id: number;
    name: string;
    email?: string;
    username: string;
    role: 'admin' | 'teacher' | 'editor';
    permissions?: string[];
    assignedClasses?: string[];
}

const SettingsPage: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [institution, setInstitution] = useState<any>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [newUser, setNewUser] = useState({ name: '', username: '', password: '', role: 'teacher' as const, permissions: ['dashboard', 'students', 'exams', 'guidance', 'classProgress'], assignedClasses: [] as string[] });
    const [editUser, setEditUser] = useState<User & { password?: string } | null>(null);
    const [classes, setClasses] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [userSearchTerm, setUserSearchTerm] = useState('');

    const { showToast } = usePanelToast();
    const { confirm } = usePanelConfirm();

    // Modal açıkken arka planın kaymasını engelle
    useEffect(() => {
        if (isAdding) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isAdding]);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [usersResult, instResult, classesResult] = await Promise.allSettled([
                    api.getUsers(),
                    api.getInstitutionSettings(),
                    api.getClasses()
                ]);

                if (usersResult.status === 'fulfilled') {
                    setUsers(usersResult.value);
                } else {
                    console.error('Kullanıcılar yüklenemedi:', usersResult.reason);
                    setUsers([]);
                }

                if (classesResult.status === 'fulfilled') {
                    setClasses(classesResult.value);
                } else {
                    console.error('Sınıflar yüklenemedi:', classesResult.reason);
                }

                if (instResult.status === 'fulfilled') {
                    setInstitution(instResult.value || { name: 'Kayıtlı Kurum Yok' });
                } else {
                    console.error('Kurum ayarları yüklenemedi:', instResult.reason);
                    setInstitution({ name: 'Sistem Yöneticisi (Yetkisiz/Kurumsuz)' });
                }
            } catch (error) {
                console.error('Veriler yüklenemedi:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    const handleUpdateInstitution = async () => {
        setIsSaving(true);
        try {
            await api.updateInstitutionSettings({
                logo: institution.logo,
                primaryColor: institution.primaryColor,
                secondaryColor: institution.secondaryColor
            });
            showToast({ type: 'success', title: 'Kaydedildi', message: 'Kurum bilgileri güncellendi.' });
        } catch (error) {
            showToast({ type: 'error', title: 'Kaydedilemedi', message: 'Kurum bilgileri güncellenemedi.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddUser = async () => {
        if (newUser.name && newUser.username && newUser.password) {
            try {
                const addedUser = await api.createUser({
                    ...newUser,
                    institutionId: institution?.id
                });
                setUsers([...users, addedUser]);
                setNewUser({ name: '', username: '', password: '', role: 'teacher', permissions: ['dashboard', 'students', 'exams', 'guidance', 'classProgress'], assignedClasses: [] });
                setIsAdding(false);
            } catch (error: any) {
                showToast({ type: 'error', title: 'Kullanıcı Eklenemedi', message: 'Kullanıcı eklenirken bir hata oluştu: ' + (error.response?.data?.error || error.message) });
            }
        } else {
            showToast({ type: 'warning', title: 'Eksik Alanlar', message: 'Lütfen tüm zorunlu alanları doldurun.' });
        }
    };

    const handleUpdateUser = async () => {
        if (editUser) {
            try {
                const updated = await api.updateUser(editUser.id, {
                    name: editUser.name,
                    username: editUser.username,
                    role: editUser.role,
                    password: editUser.password,
                    permissions: editUser.permissions || [],
                    assignedClasses: editUser.assignedClasses || [],
                });
                setUsers(users.map(u => u.id === editUser.id ? updated : u));
                setEditingId(null);
                setEditUser(null);
                setIsAdding(false);
            } catch (error: any) {
                showToast({ type: 'error', title: 'Güncellenemedi', message: 'Güncelleme işlemi başarısız: ' + (error.response?.data?.error || error.message) });
            }
        }
    };

    const handleDeleteUser = async (id: number) => {
        if (await confirm({
            title: 'Kullanıcı silinsin mi?',
            message: 'Bu kullanıcıyı panelden silmek üzeresin.',
            confirmLabel: 'Sil',
            cancelLabel: 'Vazgeç',
            tone: 'danger',
        })) {
            try {
                await api.deleteUser(id);
                setUsers(users.filter(u => u.id !== id));
            } catch (error) {
                showToast({ type: 'error', title: 'Silinemedi', message: 'Kullanıcı silme işlemi başarısız.' });
            }
        }
    };

    const startEdit = (user: User) => {
        setEditingId(user.id);
        setEditUser({ ...user, permissions: user.permissions || ['dashboard', 'students', 'exams', 'guidance', 'classProgress'], assignedClasses: user.assignedClasses || [] });
        setIsAdding(true); // Edit modunu modal üzerinden açıyoruz
    };

    const togglePermission = (permId: string, isEditing: boolean) => {
        if (isEditing && editUser) {
            const perms = editUser.permissions || [];
            if (perms.includes(permId)) {
                setEditUser({ ...editUser, permissions: perms.filter(p => p !== permId) });
            } else {
                setEditUser({ ...editUser, permissions: [...perms, permId] });
            }
        } else {
            const perms = newUser.permissions || [];
            if (perms.includes(permId)) {
                setNewUser({ ...newUser, permissions: perms.filter(p => p !== permId) });
            } else {
                setNewUser({ ...newUser, permissions: [...perms, permId] });
            }
        }
    };

    const toggleAssignedClass = (className: string, isEditing: boolean) => {
        if (isEditing && editUser) {
            const classes = editUser.assignedClasses || [];
            if (classes.includes(className)) {
                setEditUser({ ...editUser, assignedClasses: classes.filter(c => c !== className) });
            } else {
                setEditUser({ ...editUser, assignedClasses: [...classes, className] });
            }
        } else {
            const classes = newUser.assignedClasses || [];
            if (classes.includes(className)) {
                setNewUser({ ...newUser, assignedClasses: classes.filter(c => c !== className) });
            } else {
                setNewUser({ ...newUser, assignedClasses: [...classes, className] });
            }
        }
    };

    const filteredUsers = users.filter(u => 
        u.name.toLocaleLowerCase('tr-TR').includes(userSearchTerm.toLocaleLowerCase('tr-TR')) || 
        (u.username || '').toLocaleLowerCase('tr-TR').includes(userSearchTerm.toLocaleLowerCase('tr-TR'))
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="main-content">
            <div style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ margin: 0 }}>Ayarlar</h1>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Sistem ayarları ve kullanıcı yönetimi.</p>
            </div>

            <div className="dashboard-grid">
                {/* Institution Profile Section */}
                <div className="card" style={{ gridColumn: 'span 12' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div className="card-title" style={{ margin: 0 }}><Shield size={20} /> Kurum Ayarları</div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                className="btn-primary"
                                onClick={handleUpdateInstitution}
                                disabled={isSaving}
                                style={{ fontSize: '0.85rem' }}
                            >
                                {isSaving ? 'Kaydediliyor...' : 'Genel Ayarları Kaydet'}
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr)', gap: '2rem' }}>
                        {/* Kurum Bilgileri (Kompakt) */}
                        <div>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Kurum Adı</label>
                                <div style={{ fontWeight: 600, fontSize: '1.1rem', marginTop: '0.25rem' }}>{institution?.name || 'Yükleniyor...'}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* User Management Section */}
                <div className="card" style={{ gridColumn: 'span 12', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <div className="card-title" style={{ margin: 0, fontSize: '1.25rem' }}><Shield size={22} color="var(--primary)" /> Panel Erişim Yönetimi</div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>Sistem yetkilerini ve erişim izinlerini buradan yönetebilirsiniz.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', flex: 1, justifyContent: 'flex-end', minWidth: '300px' }}>
                            <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input 
                                    type="text" 
                                    placeholder="Kullanıcı ara..." 
                                    value={userSearchTerm}
                                    onChange={(e) => setUserSearchTerm(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.5rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: '#f8fafc' }}
                                />
                            </div>
                            <button
                                className="btn-primary"
                                onClick={() => {
                                    setEditingId(null);
                                    setEditUser(null);
                                    setNewUser({ name: '', username: '', password: '', role: 'teacher', permissions: ['dashboard', 'students', 'exams', 'guidance', 'classProgress'], assignedClasses: [] });
                                    setIsAdding(true);
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
                            >
                                <UserPlus size={18} /> Yeni Kullanıcı
                            </button>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.75rem' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <th style={{ padding: '0.5rem 1rem' }}>Kullanıcı Bilgisi</th>
                                    <th style={{ padding: '0.5rem 1rem' }}>Sistem Rolü</th>
                                    <th style={{ padding: '0.5rem 1rem' }}>Kullanıcı Adı</th>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>Aksiyonlar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '3rem', textAlign: 'center' }}>
                                            <div className="animate-spin" style={{ display: 'inline-block' }}><RefreshCcw size={24} color="var(--primary)" /></div>
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Kullanıcı bulunamadı.</td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(user => (
                                        <motion.tr 
                                            key={user.id} 
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="user-row"
                                            style={{ background: 'white', borderRadius: '12px' }}
                                        >
                                            <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <div style={{ 
                                                        width: 40, height: 40, borderRadius: '12px', 
                                                        background: user.role === 'admin' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#f1f5f9', 
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                        fontWeight: 700, color: user.role === 'admin' ? 'white' : 'var(--primary)',
                                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                                    }}>
                                                        {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{user.name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: #{user.id}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                                                <span style={{
                                                    padding: '0.35rem 0.75rem',
                                                    borderRadius: '8px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    background: user.role === 'admin' ? '#eef2ff' : user.role === 'teacher' ? '#f0fdf4' : '#f8fafc',
                                                    color: user.role === 'admin' ? '#4338ca' : user.role === 'teacher' ? '#166534' : '#475569',
                                                    border: `1px solid ${user.role === 'admin' ? '#c7d2fe' : user.role === 'teacher' ? '#bbf7d0' : '#e2e8f0'}`
                                                }}>
                                                    {user.role === 'admin' ? 'Yönetici' : user.role === 'editor' ? 'Rehberlik' : 'Öğretmen'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <UserIcon size={14} /> @{user.username || 'yok'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                    <button 
                                                        onClick={() => startEdit(user)} 
                                                        style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}
                                                        className="hover-action"
                                                    ><Edit size={16} /></button>
                                                    {user.id !== 1 && (
                                                        <button 
                                                            onClick={() => handleDeleteUser(user.id)} 
                                                            style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #fee2e2', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-danger)', cursor: 'pointer', transition: 'all 0.2s' }}
                                                            className="hover-action-danger"
                                                        ><Trash2 size={16} /></button>
                                                    )}
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Kullanıcı Ekleme/Düzenleme Modalı */}
                <AnimatePresence>
                    {isAdding && (
                        <div className="modal-overlay" onClick={() => setIsAdding(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                            <motion.div 
                                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                                className="modal-content-card" 
                                style={{ 
                                    maxWidth: '480px', 
                                    width: '100%', 
                                    maxHeight: '90vh', 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    borderRadius: '20px',
                                    overflow: 'hidden'
                                }}
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="modal-header" style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #f1f5f9', background: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{editingId ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı Ekle'}</h2>
                                    <button className="modal-close" onClick={() => setIsAdding(false)} style={{ background: '#f8fafc', borderRadius: '50%', padding: '8px' }}><X size={18} /></button>
                                </div>
                                
                                <div className="form-body custom-scrollbar" style={{ padding: '2rem', overflowY: 'auto', flex: 1 }}>
                                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', display: 'block' }}>Tam İsim</label>
                                        <div style={{ position: 'relative' }}>
                                            <UserIcon size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                            <input 
                                                type="text" 
                                                placeholder="Örn: Ahmet Yılmaz"
                                                value={editingId ? editUser?.name : newUser.name}
                                                onChange={(e) => editingId ? setEditUser({...editUser!, name: e.target.value}) : setNewUser({...newUser, name: e.target.value})}
                                                style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.75rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', fontSize: '0.95rem', transition: 'all 0.2s' }}
                                                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', display: 'block' }}>Kullanıcı Adı</label>
                                        <div style={{ position: 'relative' }}>
                                            <AtSign size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                            <input 
                                                type="text" 
                                                placeholder="Örn: ahmet123"
                                                value={editingId ? editUser?.username : newUser.username}
                                                onChange={(e) => editingId ? setEditUser({...editUser!, username: e.target.value}) : setNewUser({...newUser, username: e.target.value})}
                                                style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.75rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', fontSize: '0.95rem', transition: 'all 0.2s' }}
                                                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', display: 'block' }}>Sistem Rolü</label>
                                        <div className="form-select-container">
                                            <select 
                                                value={editingId ? editUser?.role : newUser.role}
                                                onChange={(e) => editingId ? setEditUser({...editUser!, role: e.target.value as any}) : setNewUser({...newUser, role: e.target.value as any})}
                                                style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', background: 'white', fontSize: '0.95rem', cursor: 'pointer' }}
                                            >
                                                <option value="admin">Yönetici</option>
                                                <option value="editor">Rehberlik</option>
                                                <option value="teacher">Öğretmen</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', display: 'block' }}>Sayfa Erişim İzinleri</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                            {[
                                                { id: 'dashboard', label: 'Genel Panel' },
                                                { id: 'students', label: 'Öğrenci Yönetimi' },
                                                { id: 'classes', label: 'Sınıf Yönetimi' },
                                                { id: 'crm', label: 'Veli Takibi (CRM)' },
                                                { id: 'attendance', label: 'Yoklama & Devamsızlık' },
                                                { id: 'exams', label: 'Sınav Merkezi' },
                                                { id: 'guidance', label: 'Rehberlik & Atama' },
                                                { id: 'classProgress', label: 'Müfredat Takibi' }
                                            ].map(perm => {
                                                const isChecked = editingId 
                                                    ? (editUser?.permissions || []).includes(perm.id)
                                                    : (newUser.permissions || []).includes(perm.id);
                                                return (
                                                    <label key={perm.id} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', fontSize: '0.85rem', color: '#1e293b', userSelect: 'none', fontWeight: 500 }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isChecked} 
                                                            onChange={() => togglePermission(perm.id, !!editingId)} 
                                                            style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer', borderRadius: '6px' }}
                                                        />
                                                        {perm.label}
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {((editingId ? editUser?.role : newUser.role) === 'teacher' || (editingId ? editUser?.role : newUser.role) === 'editor') && (
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', display: 'block' }}>Atanan Sınıflar (Sadece bu sınıfların verilerini görür)</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', maxHeight: '180px', overflowY: 'auto' }}>
                                                {classes.map(cls => {
                                                    const isChecked = editingId 
                                                        ? (editUser?.assignedClasses || []).includes(cls.name)
                                                        : (newUser.assignedClasses || []).includes(cls.name);
                                                    return (
                                                        <label key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', fontSize: '0.85rem', color: '#1e293b', userSelect: 'none', fontWeight: 500 }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={isChecked} 
                                                                onChange={() => toggleAssignedClass(cls.name, !!editingId)} 
                                                                style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer', borderRadius: '6px' }}
                                                            />
                                                            {cls.name}
                                                        </label>
                                                    )
                                                })}
                                                {classes.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sistemde kayıtlı sınıf bulunmuyor.</div>}
                                            </div>
                                        </div>
                                    )}

                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', display: 'block' }}>{editingId ? 'Yeni Şifre' : 'Şifre'}</label>
                                        <div style={{ position: 'relative' }}>
                                            <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                            <input 
                                                type="password" 
                                                placeholder="••••••••"
                                                value={editingId ? editUser?.password || '' : newUser.password}
                                                onChange={(e) => editingId ? setEditUser({...editUser!, password: e.target.value}) : setNewUser({...newUser, password: e.target.value})}
                                                style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.75rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', fontSize: '0.95rem' }}
                                            />
                                        </div>
                                        {editingId && <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px', display: 'block' }}>Boş bırakılırsa eski şifre korunur.</span>}
                                    </div>
                                </div>

                                <div className="modal-footer" style={{ padding: '1.5rem 2rem', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', gap: '1rem', position: 'sticky', bottom: 0 }}>
                                    <button className="btn-outline" style={{ flex: 1, padding: '0.85rem', borderRadius: '12px', fontWeight: 700 }} onClick={() => setIsAdding(false)}>Vazgeç</button>
                                    <button 
                                        className="btn-primary" 
                                        style={{ flex: 1.5, padding: '0.85rem', borderRadius: '12px', fontWeight: 700 }} 
                                        onClick={editingId ? handleUpdateUser : handleAddUser}
                                    >
                                        {editingId ? 'Değişiklikleri Kaydet' : 'Kullanıcıyı Oluştur'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

export default SettingsPage;
