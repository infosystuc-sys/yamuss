
import React, { useEffect, useState, useCallback } from 'react';
import { fetchSettings, updateSettings, fetchOrders, bulkUpdateStatus } from '../services/api';
import { PaymentOrder } from '../types';
import { getStatusStyle } from '../constants';

export const SettingsScreen = () => {
  // ── Email config ──────────────────────────────────────────────────────────
  const [emailFrom, setEmailFrom] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    fetchSettings()
      .then(data => {
        setEmailFrom(data['EMAIL_FROM']?.valor ?? '');
        setSmtpUser(data['SMTP_USER']?.valor ?? '');
        setSmtpPass(data['SMTP_PASS']?.valor ?? '');
      })
      .catch(e => setEmailFeedback({ type: 'error', msg: e.message }))
      .finally(() => setLoadingSettings(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setEmailFeedback(null);
    try {
      await updateSettings({ EMAIL_FROM: emailFrom, SMTP_USER: smtpUser, SMTP_PASS: smtpPass });
      setEmailFeedback({ type: 'ok', msg: 'Configuración guardada correctamente.' });
    } catch (err: any) {
      setEmailFeedback({ type: 'error', msg: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Cambio masivo de estado ───────────────────────────────────────────────
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const data = await fetchOrders(statusFilter);
      setOrders(data);
      setSelectedIds(new Set());
      setBulkFeedback(null);
    } catch (err: any) {
      setBulkFeedback({ type: 'error', msg: `Error al cargar OPs: ${err.message}` });
    } finally {
      setLoadingOrders(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const filtered = orders.filter(op =>
    op.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
    op.number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const allSelected = filtered.length > 0 && filtered.every(o => selectedIds.has(o.id));

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(filtered.map(o => o.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkStatus = async (status: 'Revisada' | 'Transferida') => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    setBulkFeedback(null);
    try {
      const result = await bulkUpdateStatus(Array.from(selectedIds), status);
      setBulkFeedback({ type: 'ok', msg: `${result.updated} OP${result.updated !== 1 ? 's' : ''} marcadas como ${status}.` });
      await loadOrders();
    } catch (err: any) {
      setBulkFeedback({ type: 'error', msg: err.message });
    } finally {
      setBulkLoading(false);
    }
  };

  const someSelected = selectedIds.size > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink dark:text-white">Parámetros Iniciales</h1>
        <p className="text-ink-soft dark:text-slate-400 mt-1 text-sm">Configuración general del sistema</p>
      </div>

      {/* ── Sección Email ────────────────────────────────────────────────── */}
      {loadingSettings ? (
        <div className="flex items-center gap-3 text-ink-soft">
          <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
          <span className="text-sm font-medium">Cargando configuración...</span>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-border-light dark:border-border-dark">
              <span className="material-symbols-outlined text-primary text-[22px]">mail</span>
              <h2 className="font-semibold text-ink dark:text-white text-base">Configuración de Email</h2>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Cuenta Gmail (usuario SMTP)</label>
              <input
                type="email"
                value={smtpUser}
                onChange={e => setSmtpUser(e.target.value)}
                placeholder="Ej: tesoreria@empresa.com.ar"
                className="w-full px-4 py-3 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-slate-800 text-ink dark:text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all text-sm font-medium"
              />
              <p className="text-xs text-ink-muted dark:text-slate-500">
                La cuenta de Gmail desde la que se envían los comprobantes. Si se deja vacío se usa el valor del servidor.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Contraseña de aplicación SMTP</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={smtpPass}
                  onChange={e => setSmtpPass(e.target.value)}
                  placeholder="Contraseña de aplicación de Google"
                  className="w-full px-4 py-3 pr-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-slate-800 text-ink dark:text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
                  title={showPass ? 'Ocultar' : 'Mostrar'}
                >
                  <span className="material-symbols-outlined text-[20px]">{showPass ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
              <p className="text-xs text-ink-muted dark:text-slate-500">
                Usá una <strong>contraseña de aplicación</strong> de Google (no tu contraseña de Gmail).
                Generala en: Cuenta de Google → Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Dirección remitente (From)</label>
              <input
                type="email"
                value={emailFrom}
                onChange={e => setEmailFrom(e.target.value)}
                placeholder="Ej: pagos@empresa.com.ar (puede diferir del usuario SMTP)"
                className="w-full px-4 py-3 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-slate-800 text-ink dark:text-white focus:ring-2 focus:ring-primary focus:outline-none transition-all text-sm font-medium"
              />
              <p className="text-xs text-ink-muted dark:text-slate-500">
                Opcional. Si se deja vacío, el remitente visible será la misma cuenta Gmail de arriba.
              </p>
            </div>
          </div>

          {emailFeedback && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
              emailFeedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-200'
                : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200'
            }`}>
              <span className="material-symbols-outlined text-xl mt-0.5">{emailFeedback.type === 'ok' ? 'check_circle' : 'error'}</span>
              <p>{emailFeedback.msg}</p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-sm shadow-sm shadow-primary/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving
                ? <><span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>Guardando...</>
                : <><span className="material-symbols-outlined text-[18px]">save</span>Guardar cambios</>}
            </button>
          </div>
        </form>
      )}

      {/* ── Sección Cambio Masivo de Estado ──────────────────────────────── */}
      <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-border-light dark:border-border-dark flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="material-symbols-outlined text-primary text-[22px]">checklist</span>
            <h2 className="font-semibold text-ink dark:text-white text-base">Cambio Masivo de Estado de OPs</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border-light text-xs font-bold bg-white dark:bg-slate-800 text-ink dark:text-white focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="ALL">TODOS</option>
              <option value="PENDING">PENDIENTES</option>
              <option value="REVISED">REVISADAS</option>
              <option value="PROCESSED">TRANSFERIDAS</option>
            </select>
            <input
              type="text"
              placeholder="Buscar proveedor o N° OP..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border-light text-xs bg-white dark:bg-slate-800 text-ink dark:text-white focus:outline-none focus:border-primary w-44"
            />
          </div>
        </div>

        {/* Barra de acciones */}
        {someSelected && (
          <div className="px-6 py-3 bg-primary/5 border-b border-primary/20 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-primary">
              {selectedIds.size} OP{selectedIds.size !== 1 ? 's' : ''} seleccionada{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {bulkFeedback && (
                <span className={`text-xs font-medium ${bulkFeedback.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {bulkFeedback.msg}
                </span>
              )}
              <button
                onClick={() => handleBulkStatus('Revisada')}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-100 border border-sky-300 text-sky-700 text-xs font-bold hover:bg-sky-200 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[15px]">rate_review</span>
                Marcar como Revisada{selectedIds.size > 1 ? 's' : ''}
              </button>
              <button
                onClick={() => handleBulkStatus('Transferida')}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-700 text-xs font-bold hover:bg-emerald-200 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[15px]">move_to_inbox</span>
                Marcar como Transferida{selectedIds.size > 1 ? 's' : ''}
              </button>
              <button
                onClick={() => { setSelectedIds(new Set()); setBulkFeedback(null); }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border-light text-ink-soft text-xs font-medium hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
                Cancelar
              </button>
              {bulkLoading && <span className="material-symbols-outlined text-[18px] animate-spin text-primary">progress_activity</span>}
            </div>
          </div>
        )}

        {/* Tabla de OPs */}
        {loadingOrders ? (
          <div className="flex justify-center items-center py-12 gap-3 text-ink-soft">
            <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
            <span className="text-sm font-medium">Cargando órdenes...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-ink-muted text-sm">No hay órdenes de pago para mostrar.</div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-background-light dark:bg-slate-800/50 text-[10px] uppercase font-bold text-ink-muted tracking-[0.15em] border-b border-border-light">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                      title="Seleccionar todo"
                    />
                  </th>
                  <th className="py-3 px-4">N° OP</th>
                  <th className="py-3 px-4">Proveedor</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4 text-right">Monto Neto</th>
                  <th className="py-3 px-4">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light/60 dark:divide-slate-800">
                {filtered.map(op => {
                  const st = getStatusStyle(op.status as any);
                  const isSelected = selectedIds.has(op.id);
                  return (
                    <tr
                      key={op.id}
                      onClick={() => toggleOne(op.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/5 dark:bg-primary/10' : 'hover:bg-background-light/70 dark:hover:bg-slate-800/30'}`}
                    >
                      <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(op.id)}
                          className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 text-sm font-mono font-semibold text-ink-soft dark:text-slate-400">{op.number}</td>
                      <td className="py-3 px-4 text-sm font-semibold text-ink dark:text-white line-clamp-1">{op.provider}</td>
                      <td className="py-3 px-4 text-xs text-ink-soft">{op.date}</td>
                      <td className="py-3 px-4 text-right text-sm font-semibold font-mono text-ink dark:text-white">
                        $ {op.netAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
                          style={{ backgroundColor: st.bg, borderColor: st.border, color: st.main }}
                        >
                          <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: st.main }} />
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
