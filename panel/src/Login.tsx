import React, { useState } from 'react';
import { LogIn, Key, User, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from './api';

interface LoginProps {
    onLoginSuccess: (user: any, token?: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('demo');
    const [password, setPassword] = useState('demo');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const data = await api.login({ username, password });
            if (data.success) {
                onLoginSuccess(data.user, data.token);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Giriş yapılamadı. Bilgilerinizi kontrol edin.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Background Decorations */}
            <div style={{
                position: 'absolute',
                top: '-10%',
                right: '-10%',
                width: '400px',
                height: '400px',
                background: 'radial-gradient(circle, color-mix(in srgb, var(--primary), transparent 90%) 0%, transparent 70%)',
                borderRadius: '50%'
            }}></div>
            <div style={{
                position: 'absolute',
                bottom: '-5%',
                left: '-5%',
                width: '300px',
                height: '300px',
                background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)',
                borderRadius: '50%'
            }}></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                style={{
                    width: '100%',
                    maxWidth: '420px',
                    padding: '2.5rem',
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    borderRadius: '24px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)',
                    position: 'relative',
                    zIndex: 1
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        background: 'var(--primary)',
                        borderRadius: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                        boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--primary), transparent 70%)'
                    }}>
                        <ShieldCheck color="white" size={32} />
                    </div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>YKS Mentor Panel</h2>
                </div>

                {/* Gösterim Modu Bilgilendirmesi */}
                <div style={{
                    padding: '0.875rem 1rem',
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1.5px dashed rgba(59, 130, 246, 0.3)',
                    borderRadius: '16px',
                    color: '#1d4ed8',
                    fontSize: '0.825rem',
                    lineHeight: '1.4',
                    textAlign: 'center',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        ✨ Gösterim Modu Aktif
                    </span>
                    <span>Bilgiler otomatik doldurulmuştur. Doğrudan <strong>Giriş Yap</strong> butonuna tıklayarak tam yetkiyle bağlanabilirsiniz.</span>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginLeft: '0.25rem' }}>Kullanıcı Adı</label>
                        <div style={{ position: 'relative' }}>
                            <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Kullanıcı adınız"
                                required
                                style={{
                                    width: '100%',
                                    padding: '0.875rem 1rem 0.875rem 2.75rem',
                                    background: 'white',
                                    border: '1.5px solid #e2e8f0',
                                    borderRadius: '12px',
                                    fontSize: '0.95rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s, box-shadow 0.2s'
                                }}
                                className="login-input"
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginLeft: '0.25rem' }}>Şifre</label>
                        <div style={{ position: 'relative' }}>
                            <Key size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                style={{
                                    width: '100%',
                                    padding: '0.875rem 1rem 0.875rem 2.75rem',
                                    background: 'white',
                                    border: '1.5px solid #e2e8f0',
                                    borderRadius: '12px',
                                    fontSize: '0.95rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s, box-shadow 0.2s'
                                }}
                                className="login-input"
                            />
                        </div>
                    </div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            style={{
                                color: '#ef4444',
                                fontSize: '0.825rem',
                                textAlign: 'center',
                                padding: '0.5rem',
                                background: '#fef2f2',
                                borderRadius: '8px',
                                border: '1px solid #fee2e2'
                            }}
                        >
                            {error}
                        </motion.div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '1rem',
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '1rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            marginTop: '0.5rem',
                            boxShadow: '0 4px 6px -1px color-mix(in srgb, var(--primary), transparent 80%)',
                            transition: 'transform 0.2s, background 0.2s'
                        }}
                        className="btn-primary"
                    >
                        {loading ? 'Giriş Yapılıyor...' : (
                            <>
                                <span>Giriş Yap</span>
                                <LogIn size={18} />
                            </>
                        )}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>© 2024 YKS Asistanım Kurumsal Panel</p>
                </div>
            </motion.div>

            <style>{`
                .login-input:focus {
                    border-color: var(--primary) !important;
                    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary), transparent 90%) !important;
                }
                .btn-primary:hover:not(:disabled) {
                    transform: translateY(-2px);
                    background: #4f46e5 !important;
                }
            `}</style>
        </div>
    );
};

export default Login;
