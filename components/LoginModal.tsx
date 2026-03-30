import React, { useState } from 'react';
import { LogIn, X, Loader2, UserPlus, KeyRound } from 'lucide-react';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { assignUserRoleByEmail, getProjectCode } from '../services/cx'; 

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogin: (email: string) => void; 
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null); 

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);
        
        try {
            const auth = getAuth();
            
            if (mode === 'reset') {
                await sendPasswordResetEmail(auth, email);
                setMessage('A password reset link has been sent to your email.');
                setLoading(false);
                return; 
            }

            if (mode === 'signup') {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }

            // 🚀 AHORA EL PROJECT CODE VIENE DE LA BASE DE DATOS (VIA CACHÉ)
            const activeProjectCode = getProjectCode();

            try {
                const response = await fetch('https://us-central1-eba-digital-permits.cloudfunctions.net/cxLogin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: email, 
                        password: password, 
                        projectCode: activeProjectCode 
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Fallo de conexión con iTwoCX.');
                }

                if (data.IsSuccess && data.Key) {
                    localStorage.setItem('cxSessionKey', data.Key);
                } else {
                    throw new Error(data.ErrorMessages?.join(', ') || 'Credenciales de CX inválidas.');
                }

            } catch (cxErr: any) {
                console.error("⚠️ Error en la conexión invisible con CX:", cxErr);
            }

            // 🚀 FIX: AHORA ESPERAMOS (AWAIT) A QUE LA BASE DE DATOS NOS DIGA EL ROL
            const roleAssigned = await assignUserRoleByEmail(email);
            console.log(`Usuario autenticado en la plataforma como: ${roleAssigned}`);
            
            onLogin(email);
            onClose();
            
        } catch (err: any) {
            console.error("Auth Error:", err);
            
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError('Invalid email or password.');
            } else if (err.code === 'auth/email-already-in-use') {
                setError('This email is already registered. Please login.');
                setMode('login');
            } else if (err.code === 'auth/weak-password') {
                setError('Password should be at least 6 characters.');
            } else if (err.code === 'auth/invalid-email') {
                setError('Please enter a valid email address.');
            } else {
                setError(err.message || 'Authentication failed. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                
                {mode !== 'reset' && (
                    <div className="flex border-b border-slate-800">
                        <button 
                            onClick={() => { setMode('login'); setError(null); setMessage(null); }} 
                            className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${mode === 'login' ? 'text-blue-500 border-b-2 border-blue-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Sign In
                        </button>
                        <button 
                            onClick={() => { setMode('signup'); setError(null); setMessage(null); }} 
                            className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${mode === 'signup' ? 'text-blue-500 border-b-2 border-blue-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Register
                        </button>
                    </div>
                )}

                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                                {mode === 'login' ? <LogIn className="w-5 h-5 text-blue-500" /> : 
                                 mode === 'signup' ? <UserPlus className="w-5 h-5 text-blue-500" /> :
                                 <KeyRound className="w-5 h-5 text-blue-500" />}
                            </div>
                            <h2 className="text-xl font-bold text-white">
                                {mode === 'login' ? 'EBA Digital Permits' : 
                                 mode === 'signup' ? 'Create Account' : 
                                 'Reset Password'}
                            </h2>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1.5">
                                Work Email Address
                            </label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                placeholder="yours@easternbusway.nz"
                            />
                        </div>

                        {mode !== 'reset' && (
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1.5">
                                    Password {mode === 'signup' && '(Min. 6 characters)'}
                                </label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    placeholder="••••••••"
                                />
                                {mode === 'login' && (
                                    <div className="flex justify-end mt-2">
                                        <button 
                                            type="button" 
                                            onClick={() => { setMode('reset'); setError(null); setMessage(null); }} 
                                            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                        >
                                            Forgot your password?
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm leading-relaxed">
                                {error}
                            </div>
                        )}
                        {message && (
                            <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-xl text-sm leading-relaxed font-bold">
                                {message}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {mode === 'login' ? 'Authenticating with CX...' : 
                                     mode === 'signup' ? 'Creating Profile...' : 
                                     'Sending link...'}
                                </>
                            ) : (
                                mode === 'login' ? 'Login securely' : 
                                mode === 'signup' ? 'Register & Continue' :
                                'Send Reset Link'
                            )}
                        </button>
                        
                        {mode === 'reset' && (
                            <button 
                                type="button" 
                                onClick={() => { setMode('login'); setError(null); setMessage(null); }} 
                                className="w-full mt-2 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                            >
                                Back to Login
                            </button>
                        )}
                    </form>

                    <p className="mt-6 text-center text-xs text-slate-500">
                        Your account is managed securely via <strong>Firebase Auth</strong>. <br/>
                        Roles are automatically assigned based on the EBA Access Control List.
                    </p>
                </div>
            </div>
        </div>
    );
};