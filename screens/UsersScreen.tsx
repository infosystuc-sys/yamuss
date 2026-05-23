import React, { useEffect, useState } from 'react';
import { AppUser, Role } from '../types';
import { fetchUsers, fetchRoles, createUser, updateUser, resetUserPassword, deleteUser } from '../services/api';

type ModalMode = 'create' | 'edit' | null;

interface UserFormState {
    usuario: string;
    rolId: number;
    activo: boolean;
}

export const UsersScreen = () => {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const [editingUser, setEditingUser] = useState<AppUser | null>(null);
    const [form, setForm] = useState<UserFormState>({ usuario: '', rolId: 0, activo: true });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersData, rolesData] = await Promise.all([fetchUsers(), fetchRoles()]);
            setUsers(usersData);
            setRoles(rolesData);
            if (rolesData.length > 0 && form.rolId === 0) {
                setForm(f => ({ ...f, rolId: rolesData[0].ID }));
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 3000);
    };

    const openCreate = () => {
        setForm({ usuario: '', rolId: roles[0]?.ID ?? 0, activo: true });
        setFormError('');
        setEditingUser(null);
        setModalMode('create');
    };

    const openEdit = (u: AppUser) => {
        setForm({ usuario: u.Usuario, rolId: u.RolId, activo: u.Activo });
        setFormError('');
        setEditingUser(u);
        setModalMode('edit');
    };

    const closeModal = () => {
        setModalMode(null);
        setEditingUser(null);
        setFormError('');
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setSaving(true);
        try {
            if (modalMode === 'create') {
                await createUser(form.usuario, form.rolId);
                showSuccess(`Usuario '${form.usuario.toUpperCase()}' creado con contraseña por defecto 1234.`);
            } else if (modalMode === 'edit' && editingUser) {
                await updateUser(editingUser.ID, { rolId: form.rolId, activo: form.activo });
                showSuccess('Usuario actualizado correctamente.');
            }
            closeModal();
            await loadData();
        } catch (e: any) {
            setFormError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleResetPassword = async (u: AppUser) => {
        if (!window.confirm(`¿Resetear la contraseña de '${u.Usuario}' a 1234?`)) return;
        try {
            await resetUserPassword(u.ID);
            showSuccess(`Contraseña de '${u.Usuario}' restablecida a 1234.`);
            await loadData();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await deleteUser(id);
            setConfirmDeleteId(null);
            showSuccess('Usuario eliminado.');
            await loadData();
        } catch (e: any) {
            alert(e.message);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-slate-500">
                <span className="material-symbols-outlined animate-spin text-primary">sync</span>
                Cargando usuarios...
            </div>
        </div>
    );

    if (error) return (
        <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-600 font-medium">
            Error: {error}
        </div>
    );

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">Gestión de Usuarios</h1>
                    <p className="text-sm text-slate-500 mt-1">{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-all shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                >
                    <span className="material-symbols-outlined text-[20px]">person_add</span>
                    Nuevo Usuario
                </button>
            </div>

            {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm font-medium flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    {successMsg}
                </div>
            )}

            {/* Tabla de usuarios */}
            <div className="bg-white dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                            <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Usuario</th>
                            <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Rol</th>
                            <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                            <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">1er Login</th>
                            <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {users.map(u => (
                            <tr key={u.ID} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-2.5">
                                        <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                            {u.Usuario.charAt(0)}
                                        </div>
                                        <span className="font-semibold text-slate-900 dark:text-white text-sm">{u.Usuario}</span>
                                    </div>
                                </td>
                                <td className="px-5 py-3.5">
                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide
                                        ${u.Rol === 'ADMINISTRADOR'
                                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                                            : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                                        }`}>
                                        {u.Rol}
                                    </span>
                                </td>
                                <td className="px-5 py-3.5">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold
                                        ${u.Activo
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                        <span className={`size-1.5 rounded-full ${u.Activo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                        {u.Activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>
                                <td className="px-5 py-3.5">
                                    {u.PrimerLogin ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                                            <span className="material-symbols-outlined text-[14px]">warning</span>
                                            Pendiente
                                        </span>
                                    ) : (
                                        <span className="text-xs text-slate-400">—</span>
                                    )}
                                </td>
                                <td className="px-5 py-3.5">
                                    <div className="flex items-center justify-end gap-1">
                                        <button
                                            onClick={() => openEdit(u)}
                                            title="Editar"
                                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                        </button>
                                        <button
                                            onClick={() => handleResetPassword(u)}
                                            title="Resetear contraseña a 1234"
                                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                                        </button>
                                        <button
                                            onClick={() => setConfirmDeleteId(u.ID)}
                                            title="Eliminar usuario"
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">
                                    No hay usuarios registrados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Información de roles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roles.map(r => (
                    <div key={r.ID} className="p-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="material-symbols-outlined text-[18px] text-primary">badge</span>
                            <span className="font-bold text-sm text-slate-900 dark:text-white">{r.Nombre}</span>
                        </div>
                        <p className="text-xs text-slate-500">{r.Descripcion}</p>
                    </div>
                ))}
            </div>

            {/* Modal Crear / Editar */}
            {modalMode && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="size-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-[20px]">
                                        {modalMode === 'create' ? 'person_add' : 'manage_accounts'}
                                    </span>
                                </div>
                                <h2 className="font-bold text-slate-900 dark:text-white">
                                    {modalMode === 'create' ? 'Nuevo Usuario' : `Editar: ${editingUser?.Usuario}`}
                                </h2>
                            </div>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-5 space-y-4">
                            {formError && (
                                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-medium">
                                    {formError}
                                </div>
                            )}

                            {modalMode === 'create' && (
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                                        Nombre de Usuario
                                    </label>
                                    <input
                                        type="text"
                                        value={form.usuario}
                                        onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))}
                                        className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none uppercase"
                                        placeholder="NOMBRE_USUARIO"
                                        required
                                        minLength={3}
                                    />
                                    <p className="text-[11px] text-slate-400">Contraseña inicial: <strong>1234</strong></p>
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Rol</label>
                                <select
                                    value={form.rolId}
                                    onChange={e => setForm(f => ({ ...f, rolId: parseInt(e.target.value, 10) }))}
                                    className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
                                    required
                                >
                                    {roles.map(r => (
                                        <option key={r.ID} value={r.ID}>{r.Nombre} — {r.Descripcion}</option>
                                    ))}
                                </select>
                            </div>

                            {modalMode === 'edit' && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                                    <input
                                        type="checkbox"
                                        id="activo-toggle"
                                        checked={form.activo}
                                        onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                                        className="size-4 rounded accent-primary cursor-pointer"
                                    />
                                    <label htmlFor="activo-toggle" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                                        Usuario activo
                                    </label>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="flex-1 py-3 rounded-xl font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className={`flex-1 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-primary/20 ${saving ? 'bg-slate-400 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark hover:scale-[1.02] active:scale-[0.98]'}`}
                                >
                                    {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal confirmar eliminación */}
            {confirmDeleteId !== null && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="size-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-600">
                                <span className="material-symbols-outlined">delete_forever</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white">Eliminar usuario</h3>
                                <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            ¿Está seguro que desea eliminar el usuario <strong>{users.find(u => u.ID === confirmDeleteId)?.Usuario}</strong>?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="flex-1 py-2.5 rounded-xl font-bold border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(confirmDeleteId)}
                                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-all"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
