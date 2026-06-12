import React, { useEffect, useState } from 'react';
import { fetchBatches, fetchBatchDetail, sendBatchEmails, Batch, BatchDetailItem, BatchEmailResult } from '../services/api';

export const BatchHistoryScreen = () => {
  const [batches, setBatches]           = useState<Batch[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [expandedId, setExpandedId]     = useState<number | null>(null);
  const [detail, setDetail]             = useState<Record<number, BatchDetailItem[]>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);

  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [sendingId, setSendingId]       = useState<number | null>(null);
  const [confirmState, setConfirmState] = useState<{ batchId: number; opNumbers: string[] | null } | null>(null);
  const [emailResult, setEmailResult]   = useState<BatchEmailResult | null>(null);
  const [emailError, setEmailError]     = useState<string | null>(null);

  useEffect(() => { loadBatches(); }, []);

  useEffect(() => {
    if (expandedId !== null && !detail[expandedId]) loadDetail(expandedId);
    setSelected(new Set());
  }, [expandedId]);

  const loadBatches = async () => {
    try {
      setLoading(true); setError(null);
      setBatches(await fetchBatches() || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const loadDetail = async (id: number) => {
    try {
      setDetailLoading(id);
      const data = await fetchBatchDetail(id) || [];
      setDetail(prev => ({ ...prev, [id]: data }));
    } catch { setDetail(prev => ({ ...prev, [id]: [] })); }
    finally { setDetailLoading(null); }
  };

  const toggleExpand = (id: number) =>
    setExpandedId(prev => (prev === id ? null : id));

  const toggleSelect = (num: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  const toggleSelectAll = (items: BatchDetailItem[]) => {
    const nums = items.map(i => i.number);
    const allSelected = nums.every(n => selected.has(n));
    setSelected(allSelected ? new Set() : new Set(nums));
  };

  const handleSend = async (batchId: number, opNumbers: string[] | null) => {
    if (sendingId !== null) return;
    setSendingId(batchId);
    setConfirmState(null);
    setEmailResult(null);
    setEmailError(null);
    try {
      const result = await sendBatchEmails(batchId, opNumbers ?? undefined);
      setEmailResult(result);
    } catch (e: any) { setEmailError(e.message); }
    finally { setSendingId(null); }
  };

  const fmtDate = (d: string) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return String(d); }
  };
  const fmt = (n?: number) => (n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });

  const getBatch = (b: Batch) => ({
    id:       b.ID ?? (b as any).id,
    fecha:    b.FECHA_CREACION ?? (b as any).fecha_creacion,
    cantidad: b.CANTIDAD_OPS ?? (b as any).cantidad_ops ?? 0,
    monto:    b.MONTO_TOTAL ?? (b as any).monto_total ?? 0,
    archivo:  b.NOMBRE_ARCHIVO ?? (b as any).nombre_archivo ?? '-',
  });

  if (loading) return <div className="p-8 text-center text-ink-soft">Cargando lotes...</div>;
  if (error) return (
    <div className="p-8 text-center text-red-500">
      Error: {error}
      <button onClick={loadBatches} className="ml-4 px-4 py-2 bg-background-light rounded-lg text-sm font-bold text-ink">Reintentar</button>
    </div>
  );

  const currentDetail = expandedId !== null ? (detail[expandedId] || []) : [];
  const selectedList  = Array.from(selected);
  const allSelected   = currentDetail.length > 0 && currentDetail.every(i => selected.has(i.number));

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">

      <div>
        <h1 className="font-serif text-4xl font-semibold text-ink dark:text-white">Consultar Lotes</h1>
        <p className="text-ink-soft mt-1 text-sm">Historial de lotes de transferencia generados.</p>
      </div>

      {/* Modal de confirmación */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmState(null)}>
          <div className="bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-border-light" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-2xl">mail</span>
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold text-ink dark:text-white">Enviar Comprobantes</h3>
                <p className="text-sm text-ink-soft">Lote #{confirmState.batchId}</p>
              </div>
            </div>
            <p className="text-ink-soft text-sm">
              {confirmState.opNumbers
                ? <>Se enviarán los comprobantes de las <strong className="text-ink">{confirmState.opNumbers.length} OP{confirmState.opNumbers.length > 1 ? 's' : ''} seleccionadas</strong>.</>
                : <>Se enviarán los comprobantes de <strong className="text-ink">todas las OPs</strong> del lote.</>}
            </p>
            <p className="text-xs text-amber-600 flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px]">info</span>
              Esta operación puede tardar unos segundos.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setConfirmState(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-ink-soft hover:bg-background-light transition-colors">Cancelar</button>
              <button
                onClick={() => handleSend(confirmState.batchId, confirmState.opNumbers)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-confirm text-white hover:bg-confirm-dark transition-all flex items-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                Confirmar Envío
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner resultado */}
      {emailResult && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${emailResult.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <span className="material-symbols-outlined text-xl mt-0.5" style={{ color: emailResult.failed > 0 ? '#d97706' : '#10b981' }}>
            {emailResult.failed > 0 ? 'warning' : 'check_circle'}
          </span>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-ink">
              Envío completado: {emailResult.sent} de {emailResult.totalOps} comprobantes enviados
              {emailResult.failed > 0 && ` (${emailResult.failed} fallido${emailResult.failed > 1 ? 's' : ''})`}.
            </p>
            {emailResult.details && (
              <div className="mt-2 space-y-1">
                {emailResult.details.map((d, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs ${d.sent ? 'text-emerald-700' : 'text-red-600'}`}>
                    <span className="material-symbols-outlined text-[13px]">{d.sent ? 'check' : 'close'}</span>
                    <span className="font-mono">{d.opNumber.trim()}</span>
                    {d.sent && d.recipient && <span className="text-ink-muted">→ {d.recipient}</span>}
                    {!d.sent && d.reason && <span className="italic">({d.reason})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setEmailResult(null)} className="text-ink-muted hover:text-ink-soft p-1">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {emailError && (
        <div className="p-4 rounded-xl border bg-red-50 border-red-200 flex items-center gap-3">
          <span className="material-symbols-outlined text-red-500">error</span>
          <p className="text-red-700 text-sm flex-1">{emailError}</p>
          <button onClick={() => setEmailError(null)} className="text-ink-muted p-1"><span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>
      )}

      {/* Tabla de lotes */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
          <h3 className="font-serif text-xl font-semibold text-ink dark:text-white">Listado de Lotes</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-background-light text-[10px] uppercase font-bold text-ink-muted tracking-[0.15em] border-b border-border-light">
              <th className="py-3 px-6">ID</th>
              <th className="py-3 px-6">Fecha</th>
              <th className="py-3 px-6 text-center">Cant. OPs</th>
              <th className="py-3 px-6 text-right">Monto Total</th>
              <th className="py-3 px-6">Archivo</th>
              <th className="py-3 px-6"></th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-ink-muted italic">No hay lotes registrados.</td></tr>
            ) : batches.map((b) => {
              const row = getBatch(b);
              const isExpanded = expandedId === row.id;
              const rowDetail  = detail[row.id] || [];
              const isLoading  = detailLoading === row.id;
              const isSending  = sendingId === row.id;

              return (
                <React.Fragment key={row.id}>
                  {/* Fila del lote */}
                  <tr
                    onClick={() => toggleExpand(row.id)}
                    className={`cursor-pointer transition-colors border-b border-border-light/60 ${isExpanded ? 'bg-primary/5' : 'hover:bg-background-light/70'}`}
                  >
                    <td className="py-4 px-6 font-mono font-semibold text-ink-soft">{row.id}</td>
                    <td className="py-4 px-6 text-ink-soft">{fmtDate(row.fecha)}</td>
                    <td className="py-4 px-6 text-center font-semibold text-ink">{row.cantidad}</td>
                    <td className="py-4 px-6 text-right font-semibold font-mono text-ink">$ {fmt(row.monto)}</td>
                    <td className="py-4 px-6 text-ink-soft text-xs truncate max-w-[160px]" title={row.archivo}>{row.archivo}</td>
                    <td className="py-4 px-6 text-right">
                      <span className={`material-symbols-outlined text-ink-muted text-[20px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </td>
                  </tr>

                  {/* Panel de detalle (acordeón) */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="bg-background-light/50 border-b border-border-light">
                        <div className="px-6 py-5">

                          {/* Barra de acciones */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <span className="font-serif text-base font-semibold text-ink">
                                Detalle — Lote #{row.id}
                              </span>
                              {isLoading && (
                                <span className="text-xs text-ink-muted flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                                  Cargando...
                                </span>
                              )}
                              {!isLoading && rowDetail.length > 0 && (
                                <span className="text-xs text-ink-muted">{rowDetail.length} OP{rowDetail.length > 1 ? 's' : ''}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {selectedList.length > 0 && (
                                <button
                                  onClick={() => setConfirmState({ batchId: row.id, opNumbers: selectedList })}
                                  disabled={isSending}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-confirm text-white hover:bg-confirm-dark transition-all shadow-sm disabled:opacity-50"
                                >
                                  <span className="material-symbols-outlined text-[16px]">send</span>
                                  Enviar {selectedList.length} seleccionadas
                                </button>
                              )}
                              <button
                                onClick={() => setConfirmState({ batchId: row.id, opNumbers: null })}
                                disabled={isSending || rowDetail.length === 0}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border border-primary/40 text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isSending
                                  ? <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Enviando...</>
                                  : <><span className="material-symbols-outlined text-[16px]">mail</span> Enviar todas</>
                                }
                              </button>
                            </div>
                          </div>

                          {/* Tabla de OPs */}
                          {isLoading ? (
                            <div className="py-8 text-center text-ink-muted text-sm">Cargando detalle...</div>
                          ) : rowDetail.length === 0 ? (
                            <div className="py-8 text-center text-ink-muted text-sm italic">Sin detalle disponible.</div>
                          ) : (
                            <div className="rounded-xl border border-border-light overflow-hidden">
                              <table className="w-full text-left text-sm">
                                <thead>
                                  <tr className="bg-background-light text-[10px] uppercase font-bold text-ink-muted tracking-[0.15em] border-b border-border-light">
                                    <th className="py-3 px-4">
                                      <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={() => toggleSelectAll(rowDetail)}
                                        className="rounded"
                                        title="Seleccionar todas"
                                      />
                                    </th>
                                    <th className="py-3 px-4">N° OP</th>
                                    <th className="py-3 px-4">Proveedor</th>
                                    <th className="py-3 px-4 text-right">Importe</th>
                                    <th className="py-3 px-4 text-center" title="Email enviado">
                                      <span className="material-symbols-outlined text-[16px]">mail</span>
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border-light/60">
                                  {rowDetail.map((item, idx) => {
                                    const num = (item as any).number ?? item.number ?? '';
                                    const isChecked = selected.has(num);
                                    return (
                                      <tr
                                        key={idx}
                                        onClick={() => toggleSelect(num)}
                                        className={`cursor-pointer transition-colors ${isChecked ? 'bg-primary/5' : 'hover:bg-background-light/60'}`}
                                      >
                                        <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleSelect(num)}
                                            className="rounded"
                                          />
                                        </td>
                                        <td className="py-3 px-4 font-mono text-sm text-ink-soft">{num}</td>
                                        <td className="py-3 px-4 text-ink">{(item as any).providerName ?? item.providerName ?? '-'}</td>
                                        <td className="py-3 px-4 text-right font-semibold font-mono text-ink">
                                          $ {fmt((item as any).amount ?? item.amount)}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          {(item as any).emailEnviado
                                            ? <span title="Comprobante enviado por email" className="material-symbols-outlined text-[18px] text-emerald-500">mark_email_read</span>
                                            : <span title="No enviado" className="material-symbols-outlined text-[18px] text-slate-300">mail</span>
                                          }
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
