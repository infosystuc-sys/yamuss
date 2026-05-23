
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MOCK_ORDERS } from '../constants';
import { analyzeDiscrepancy } from '../services/geminiService';
import { useAuth } from '../contexts/AuthContext';

export const ValidationScreen = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canReview = user?.role !== 'ADMINISTRATIVO';
  const op = MOCK_ORDERS.find(o => o.id === id) || MOCK_ORDERS[0];

  const [geminiAnalysis, setGeminiAnalysis] = useState<string>('');
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  useEffect(() => {
    async function getAnalysis() {
      setLoadingAnalysis(true);
      const analysis = await analyzeDiscrepancy('IIBB CABA (SIRCREB)', 2.0, 3.5);
      setGeminiAnalysis(analysis);
      setLoadingAnalysis(false);
    }
    getAnalysis();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        <Link to="/dashboard" className="hover:text-primary transition-colors">Inicio</Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-white">Revisión OP {op.number}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Validación de OP</h1>
            <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide">En Proceso</span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 max-w-2xl">Confirmación de facturas, deducciones impositivas y consistencia con el padrón fiscal vigente.</p>
        </div>
        <div className="flex gap-2">
          <button className="h-10 px-4 rounded-lg bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-[18px]">print</span>
            Exportar Detalle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-border-light dark:border-border-dark shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Proveedor</p>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-500">{op.initials}</div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white">{op.provider}</p>
              <p className="text-[10px] text-slate-500">{op.cuit}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-border-light dark:border-border-dark shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fecha Emisión</p>
          <p className="text-xl font-black text-slate-900 dark:text-white">24 Oct, 2023</p>
        </div>
        <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-border-light dark:border-border-dark shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Bruto</p>
          <p className="text-xl font-black text-slate-900 dark:text-white">$ {op.grossAmount.toLocaleString()}</p>
        </div>
        <div className="bg-primary p-6 rounded-2xl shadow-lg shadow-primary/20">
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-2">Importe Neto</p>
          <p className="text-2xl font-black text-white">$ {op.netAmount.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border-light dark:border-border-dark">
              <h3 className="font-bold text-slate-800 dark:text-white">Facturas Relacionadas</h3>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-slate-400">
                <tr>
                  <th className="py-4 px-6">Comprobante</th>
                  <th className="py-4 px-6">Tipo</th>
                  <th className="py-4 px-6 text-right">Neto</th>
                  <th className="py-4 px-6 text-right">IVA</th>
                  <th className="py-4 px-6 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[1, 2].map(i => (
                  <tr key={i} className="text-sm">
                    <td className="py-4 px-6 font-mono text-slate-600">FCE-0001-0000{i}23</td>
                    <td className="py-4 px-6 text-slate-500">Factura Electrónica A</td>
                    <td className="py-4 px-6 text-right font-medium">$ 600,000.00</td>
                    <td className="py-4 px-6 text-right text-slate-500">$ 126,000.00</td>
                    <td className="py-4 px-6 text-right font-bold">$ 726,000.00</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-surface-dark border-2 border-red-100 dark:border-red-900/30 rounded-2xl p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
                  IIBB CABA
                  <span className="bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase animate-pulse">Alerta</span>
                </h4>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">Sircereb - Ingresos Brutos</p>
              </div>
              <div className="size-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600">
                <span className="material-symbols-outlined">priority_high</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Aplicado (Tango)</p>
                <p className="text-xl font-black text-slate-900 dark:text-white font-mono">2.00%</p>
              </div>
              <div className="border-l border-slate-200 dark:border-slate-800 pl-4">
                <p className="text-[10px] uppercase font-bold text-red-500 mb-1">Padrón Octubre</p>
                <p className="text-xl font-black text-red-600 font-mono">3.50%</p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[16px] text-primary">auto_awesome</span>
                <span className="text-[10px] font-bold text-primary uppercase">Análisis Financiero AI</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                {loadingAnalysis ? "Analizando discrepancia..." : geminiAnalysis}
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button className="flex-1 h-10 text-xs bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark text-slate-600 font-bold rounded-lg hover:bg-slate-50">Ignorar</button>
              <button className="flex-1 h-10 text-xs bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-md">Actualizar OP</button>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-white/80 dark:bg-surface-dark/80 backdrop-blur-md border border-border-light dark:border-border-dark p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 z-30">
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span className="material-symbols-outlined text-[18px]">history</span>
          Padrón SIRCREB Actualizado: <strong className="text-slate-600 dark:text-slate-300">24/10/2023 08:30</strong>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button onClick={() => navigate('/dashboard')} className="flex-1 sm:flex-none h-11 px-6 rounded-xl border border-border-light dark:border-border-dark font-bold text-xs uppercase tracking-widest hover:bg-slate-50">Cancelar</button>
          {canReview && (
            <button onClick={() => navigate('/dashboard')} className="flex-1 sm:flex-none h-11 px-8 rounded-xl bg-primary text-white font-bold text-xs uppercase tracking-widest hover:bg-primary-dark shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">verified</span>
              Confirmar Revisión
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
