
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const SuccessScreen = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden border border-border-light dark:border-border-dark">
        <div className="p-12 text-center space-y-6">
           <div className="inline-flex items-center justify-center size-24 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full mb-4">
             <span className="material-symbols-outlined text-5xl">check_circle</span>
           </div>
           <div className="space-y-2">
             <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">¡Procesamiento Exitoso!</h1>
             <p className="text-slate-500 max-w-md mx-auto">El lote de órdenes de pago ha sido procesado correctamente y el archivo de exportación está listo para su banco.</p>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-8">
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total OPs</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">12</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Monto Lote</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">$ 4.5M</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">ID Tango</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">#4892</p>
              </div>
           </div>

           <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-2xl text-left">
             <span className="material-symbols-outlined text-amber-600">warning</span>
             <p className="text-xs text-amber-800 dark:text-amber-200 font-medium leading-relaxed">Importante: Recuerde que el archivo generado tiene validez únicamente para el día de la fecha. Deberá subirlo a la plataforma bancaria antes del cierre de operaciones.</p>
           </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 p-8 flex flex-col sm:flex-row justify-between gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="h-12 px-6 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-slate-900 transition-colors"
          >
            Volver al Inicio
          </button>
          <div className="flex flex-col sm:flex-row gap-3">
             <button className="h-12 px-6 rounded-xl bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm">
                <span className="material-symbols-outlined text-[20px]">print</span>
                Imprimir Comprobante
             </button>
             <button className="h-12 px-8 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-primary/30 hover:bg-primary-dark transition-all group">
                <span className="material-symbols-outlined text-[20px] group-hover:animate-bounce">download</span>
                Descargar TXT
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};
