
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getStatusStyle } from '../constants';
import { PaymentOrder } from '../types';
import { fetchOrders, fetchOrderComprobante, bulkUpdateStatus, fetchServerTime } from '../services/api';
import { useAuth } from '../contexts/AuthContext';


export const DashboardScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMINISTRADOR';
  const canReview = user?.role !== 'ADMINISTRATIVO';
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || 'ALL';
  const setStatusFilter = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === 'ALL') next.delete('status'); else next.set('status', value);
      return next;
    }, { replace: true });
  };
  const [loadingPdf, setLoadingPdf] = useState<string | null>(null);

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  const handleViewComprobante = async (opId: string) => {
    if (loadingPdf) return;
    setLoadingPdf(opId);
    try {
      const pdfBase64 = await fetchOrderComprobante(opId);
      const byteChars = atob(pdfBase64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      alert(`Error al generar comprobante: ${err.message}`);
    } finally {
      setLoadingPdf(null);
    }
  };

  const loadOrders = async () => {
    try {
      const data = await fetchOrders(statusFilter);
      setOrders(data);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(`Error al cargar las órdenes de pago: ${err.message || 'Desconocido'}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const [serverDate, setServerDate] = useState<Date>(() => new Date());
  useEffect(() => {
    fetchServerTime().then(setServerDate).catch(() => {});
  }, []);

  const [showFilters, setShowFilters] = useState(() => !!searchParams.get('q'));
  const searchTerm = searchParams.get('q') || '';
  const setSearchTerm = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('q', value); else next.delete('q');
      return next;
    }, { replace: true });
  };

  const fmtDate = (d: string) => {
    if (!d) return '-';
    const [y, m, day] = d.split('-');
    return (y && m && day) ? `${day}/${m}/${y}` : d;
  };

  const filteredOrders = orders.filter(op =>
    op.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
    op.number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const allSelected = filteredOrders.length > 0 && filteredOrders.every(o => selectedIds.has(o.id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map(o => o.id)));
    }
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
      setBulkFeedback(`${result.updated} OP${result.updated !== 1 ? 's' : ''} marcadas como ${status}.`);
      await loadOrders();
    } catch (err: any) {
      setBulkFeedback(`Error: ${err.message}`);
    } finally {
      setBulkLoading(false);
    }
  };

  const stats = {
    pending: filteredOrders.filter(o => o.status === 'Pendiente' || (o.status as string)?.toUpperCase?.() === 'PENDIENTE').length,
    revised: filteredOrders.filter(o => (o.status as string)?.toUpperCase?.() === 'REVISADA').length,
    transferred: filteredOrders.filter(o => (o.status as string)?.toUpperCase?.() === 'TRANSFERIDA').length,
    totalAmount: filteredOrders.reduce((sum, o) => sum + o.netAmount, 0)
  };

  const today = serverDate.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  if (loading) {
    return (
      <div className="flex bg-background-light dark:bg-background-dark justify-center items-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-ink-soft font-bold">Cargando pagos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
        <p className="font-bold">Error de Conexión</p>
        <p>{error}</p>
      </div>
    );
  }

  const statCards = [
    { key: 'pending',     label: 'Pendientes',  value: stats.pending,     caption: 'por revisar',     accent: 'bg-amber-500',   valueColor: 'text-amber-600' },
    { key: 'revised',     label: 'Revisadas',   value: stats.revised,     caption: 'para transferir', accent: 'bg-sky-500',     valueColor: 'text-sky-600' },
    { key: 'transferred', label: 'Transferidas',value: stats.transferred, caption: 'completadas',     accent: 'bg-emerald-500', valueColor: 'text-emerald-600' },
    { key: 'total',       label: 'Monto Total', value: `$ ${(stats.totalAmount / 1_000_000).toFixed(1).replace('.', ',')}M`, caption: 'en listado', accent: 'bg-ink-muted', valueColor: 'text-ink' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink dark:text-white">Panel de control</h1>
          <p className="text-ink-soft dark:text-slate-400 mt-1 text-sm">
            {user?.database ?? '—'} <span className="mx-1">—</span> {today}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-lg border border-border-light text-xs font-bold bg-surface-light dark:bg-surface-dark text-ink dark:text-white focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="ALL">TODOS</option>
            <option value="PENDING">PENDIENTES</option>
            <option value="REVISED">REVISADAS</option>
            <option value="PROCESSED">TRANSFERIDAS</option>
          </select>

          <div className="relative">
            {showFilters && (
              <input
                type="text"
                placeholder="Buscar proveedor o nro..."
                className="absolute right-0 bottom-12 w-64 p-2 bg-surface-light border border-border-light rounded shadow-lg text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`h-10 px-4 rounded-lg border text-xs font-bold flex items-center gap-2 transition-colors shadow-sm ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark text-ink-soft'}`}
            >
              <span className="material-symbols-outlined text-[18px]">{showFilters ? 'close' : 'filter_alt'}</span>
              {showFilters ? 'Cerrar Filtros' : 'Filtros Avanzados'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((s) => (
          <div
            key={s.key}
            className="relative bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden"
          >
            <div className={`absolute top-0 left-0 h-1 w-full ${s.accent}`} />
            <div className="px-6 pt-6 pb-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-soft dark:text-slate-400">
                {s.label}
              </p>
              <p className={`mt-3 font-serif text-4xl font-semibold leading-none ${s.valueColor}`}>
                {s.value}
              </p>
              <p className="mt-3 text-xs text-ink-muted dark:text-slate-500">{s.caption}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-6 py-5 border-b border-border-light dark:border-border-dark flex items-center justify-between">
            <h3 className="font-serif text-xl font-semibold text-ink dark:text-white">Órdenes de pago</h3>
            <button className="text-primary text-xs font-bold hover:underline">Ver todo →</button>
          </div>

          {/* Barra de acciones masivas */}
          {isAdmin && someSelected && (
            <div className="px-6 py-3 bg-primary/5 border-b border-primary/20 flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-primary">
                {selectedIds.size} OP{selectedIds.size !== 1 ? 's' : ''} seleccionada{selectedIds.size !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {bulkFeedback && (
                  <span className="text-xs font-medium text-ink-soft">{bulkFeedback}</span>
                )}
                <button
                  onClick={() => handleBulkStatus('Revisada')}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-100 border border-sky-300 text-sky-700 text-xs font-bold hover:bg-sky-200 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[15px]">rate_review</span>
                  Marcar Revisada{selectedIds.size > 1 ? 's' : ''}
                </button>
                <button
                  onClick={() => handleBulkStatus('Transferida')}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-700 text-xs font-bold hover:bg-emerald-200 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[15px]">move_to_inbox</span>
                  Marcar Transferida{selectedIds.size > 1 ? 's' : ''}
                </button>
                <button
                  onClick={() => { setSelectedIds(new Set()); setBulkFeedback(null); }}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border-light text-ink-soft text-xs font-medium hover:bg-slate-100 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                  Cancelar
                </button>
              </div>
              {bulkLoading && (
                <span className="material-symbols-outlined text-[18px] animate-spin text-primary">progress_activity</span>
              )}
            </div>
          )}

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-background-light dark:bg-slate-800/50 text-[10px] uppercase font-bold text-ink-muted tracking-[0.15em] border-b border-border-light">
                  {isAdmin && (
                    <th className="py-4 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        title="Seleccionar todo"
                      />
                    </th>
                  )}
                  <th className="py-4 px-6">N° OP</th>
                  <th className="py-4 px-6">Proveedor</th>
                  <th className="py-4 px-6">CUIT</th>
                  <th className="py-4 px-6">Fecha</th>
                  <th className="py-4 px-6 text-right">Monto Neto</th>
                  <th className="py-4 px-6">Estado</th>
                  <th className="py-4 px-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light/60 dark:divide-slate-800">
                {filteredOrders.map((op) => {
                  const st = getStatusStyle(op.status as any);
                  const isSelected = selectedIds.has(op.id);
                  return (
                    <tr
                      key={op.id}
                      className={`hover:bg-background-light/70 dark:hover:bg-slate-800/30 transition-colors group ${isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
                    >
                      {isAdmin && (
                        <td className="py-4 px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(op.id)}
                            className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-code font-semibold text-ink-soft dark:text-slate-400">{op.number}</span>
                          {op.emailEnviado && (
                            <span title="Comprobante enviado por email" className="text-emerald-500">
                              <span className="material-symbols-outlined text-[16px]">mark_email_read</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-sm font-semibold text-ink dark:text-white line-clamp-1">{op.provider}</p>
                        {op.cbu && <p className="text-[11px] text-ink-muted font-code">CBU: {op.cbu}</p>}
                        {op.email && <p className="text-[11px] text-ink-muted">✉ {op.email}</p>}
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className="text-base font-code font-bold text-ink dark:text-white">{op.cuit || '—'}</span>
                      </td>
                      <td className="py-4 px-6 text-xs text-ink-soft">{fmtDate(op.date)}</td>
                      <td className="py-4 px-6 text-right text-sm font-semibold font-mono text-ink dark:text-white">
                        $ {op.netAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
                          style={{ backgroundColor: st.bg, borderColor: st.border, color: st.main }}
                        >
                          <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: st.main }} />
                          {st.label}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewComprobante(op.id)}
                            disabled={loadingPdf === op.id}
                            title="Ver comprobante PDF"
                            className="inline-flex items-center gap-1 border border-border-light text-ink-soft hover:border-ink-soft hover:text-ink text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                          >
                            {loadingPdf === op.id
                              ? <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                              : <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                            }
                            <span className="hidden sm:inline">Ver PDF</span>
                          </button>
                          {canReview ? (
                            <button
                              onClick={() => navigate(`/review/${op.id}`)}
                              className="border border-primary/40 text-primary hover:bg-primary hover:text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-all"
                            >
                              Revisar
                            </button>
                          ) : (
                            <span className="text-[10px] text-ink-muted font-medium">Solo lectura</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
