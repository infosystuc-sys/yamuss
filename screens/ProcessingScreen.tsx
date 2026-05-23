import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchOrders, processTreasury } from '../services/api';
import { PaymentOrder } from '../types';

export const ProcessingScreen = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [accountId, setAccountId] = useState('1110'); // Default mock numeric (Banco)
  const [successData, setSuccessData] = useState<any>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const allOrders = await fetchOrders();
      const revisadas = allOrders.filter(o => o.status === 'Revisada');
      setOrders(revisadas);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const downloadBlob = (content: string | ArrayBuffer, filename: string, mimeType: string) => {
    const blob = content instanceof ArrayBuffer
      ? new Blob([content], { type: mimeType })
      : new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleProcessBatch = async () => {
    if (selectedIds.size === 0) return;
    setProcessing(true);

    try {
      const result = await processTreasury(Array.from(selectedIds), accountId);

      setSuccessData(result);

      downloadBlob(result.txtContent, result.fileName, 'text/plain');

      if (result.pdfBase64) {
        setTimeout(() => {
          const byteChars = atob(result.pdfBase64);
          const byteArr = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
          downloadBlob(byteArr.buffer, `LOTE_${result.loteId}.pdf`, 'application/pdf');
        }, 500);
      }

    } catch (e: any) {
      alert("Error procesando lote: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  if (successData) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center animate-fade-in space-y-6">
        <div className="size-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-5xl">task_alt</span>
        </div>
        <h2 className="text-3xl font-black text-slate-800">¡Lote Procesado!</h2>
        <p className="text-slate-600">
          Lote N° <strong>{successData.loteId}</strong> generado y guardado correctamente.
        </p>
        <p className="text-sm text-slate-500">
          Se descargaron el archivo TXT y el PDF de respaldo.
        </p>
        <div className="flex gap-4 justify-center pt-6">
          <button onClick={() => navigate('/dashboard')} className="px-6 py-3 bg-slate-200 hover:bg-slate-300 rounded-lg font-bold text-slate-700">Volver al Dashboard</button>
          <button onClick={() => setSuccessData(null)} className="px-6 py-3 bg-primary text-white hover:bg-primary-dark rounded-lg font-bold">Procesar Otro Lote</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
      <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Procesar Lote de Pago</h1>
      <p className="text-slate-500">Seleccione las órdenes revisadas para generar la transferencia bancaria.</p>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-4">
            <div className="bg-white border px-3 py-2 rounded-lg text-sm">
              <span className="text-slate-400 mr-2 text-xs font-bold uppercase">Cuenta Banco:</span>
              <input
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="font-mono font-bold text-slate-700 outline-none w-32"
              />
            </div>
            <div className="text-sm font-bold text-slate-500">
              {selectedIds.size} seleccionados
            </div>
          </div>
          <button
            onClick={handleProcessBatch}
            disabled={selectedIds.size === 0 || processing}
            className={`px-6 py-2 rounded-lg font-bold text-sm shadow-sm flex items-center gap-2 transition-all ${selectedIds.size === 0 || processing ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
          >
            {processing ? <span className="animate-spin material-symbols-outlined">sync</span> : <span className="material-symbols-outlined">payments</span>}
            {processing ? 'Procesando...' : 'Generar TXT y Pagar'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase font-bold text-slate-400">
              <tr>
                <th className="p-4 w-10">
                  <input type="checkbox" onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(orders.map(o => o.id)));
                    else setSelectedIds(new Set());
                  }} />
                </th>
                <th className="p-4">Orden Pago</th>
                <th className="p-4">Proveedor</th>
                <th className="p-4">Fecha</th>
                <th className="p-4 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center">Cargando órdenes revisadas...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic">No hay órdenes revisadas pendientes de pago.</td></tr>
              ) : (
                orders.map(op => (
                  <tr key={op.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(op.id) ? 'bg-indigo-50 dark:bg-indigo-900/10' : ''}`}>
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(op.id)}
                        onChange={() => toggleSelect(op.id)}
                        className="accent-primary size-4"
                      />
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-600">{op.number}</td>
                    <td className="p-4 font-medium text-slate-800">{op.provider}</td>
                    <td className="p-4 text-slate-500 text-xs">{op.date}</td>
                    <td className="p-4 text-right font-bold text-slate-900">$ {op.netAmount.toLocaleString('es-AR')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
