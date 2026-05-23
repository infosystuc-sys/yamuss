import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../services/api';

interface ChangePasswordModalProps {
    onClose: () => void;
    forced?: boolean;
    onPasswordChanged?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose, forced = false, onPasswordChanged }) => {
    const { user } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas nuevas no coinciden.');
            return;
        }
        if (newPassword.length < 4) {
            setError('La nueva contraseña debe tener al menos 4 caracteres.');
            return;
        }
        if (forced && newPassword === '1234') {
            setError('Debe elegir una contraseña diferente a la predeterminada.');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user?.token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data.error || 'Error al cambiar contraseña.');
            } else {
                setSuccess(true);
                if (forced && onPasswordChanged) {
                    setTimeout(onPasswordChanged, 1500);
                } else {
                    setTimeout(onClose, 2000);
                }
            }
        } catch {
            setError('Error de conexión con el servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="size-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined">lock_reset</span>
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-900 dark:text-white">Cambiar Contraseña</h2>
                            <p className="text-xs text-slate-500">Usuario: {user?.username}</p>
                        </div>
                    </div>
                    {!forced && (
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    )}
                </div>

                {forced && (
                    <div className="mx-6 mt-5 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm font-medium flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] shrink-0">warning</span>
                        Por seguridad, debe cambiar su contraseña antes de continuar.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-sm font-medium flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">check_circle</span>
                            Contraseña actualizada correctamente.
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                            {forced ? 'Contraseña Actual (1234)' : 'Contraseña Actual'}
                        </label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Nueva Contraseña</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Repetir Nueva Contraseña</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        {!forced && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                            >
                                Cancelar
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={loading || success}
                            className={`flex-1 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-primary/20 ${loading || success ? 'bg-slate-400 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark hover:scale-[1.02] active:scale-[0.98]'}`}
                        >
                            {loading ? 'Guardando...' : success ? '✓ Listo' : 'Guardar Contraseña'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
