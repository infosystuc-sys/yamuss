
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders, API_URL, consultarPadron, PadronConsultaResult } from '../services/api';

const currentPeriod = () => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${mm}/${yyyy}`;
};

interface ImportSectionProps {
  title: string;
  description: string;
  endpoint: string;
  accept?: string;
}

const ImportSection: React.FC<ImportSectionProps> = ({ title, description, endpoint, accept = '.txt,.csv' }) => {
  const [file, setFile] = useState<File | null>(null);
  const [periodo, setPeriodo] = useState<string>(currentPeriod());
  const [periodoError, setPeriodoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatus(null);
    }
  };

  const handlePeriodoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPeriodo(val);
    if (!/^\d{2}\/\d{4}$/.test(val)) {
      setPeriodoError('Formato requerido: MM/YYYY (ej: 05/2026)');
    } else {
      setPeriodoError(null);
    }
  };

  const handleProcess = async () => {
    if (!file) {
      setStatus({ type: 'error', message: 'Por favor seleccione un archivo primero.' });
      return;
    }
    if (!/^\d{2}\/\d{4}$/.test(periodo)) {
      setPeriodoError('Formato requerido: MM/YYYY (ej: 05/2026)');
      return;
    }

    setUploading(true);
    setStatus({ type: 'info', message: 'Procesando archivo...' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('periodo', periodo);

    try {
      const response = await fetch(`${API_URL}/${endpoint}`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setStatus({ type: 'success', message: `Importación exitosa — Período ${data.periodo || periodo}. ${data.rowsProcessed || 0} filas procesadas.` });
        setFile(null);
      } else {
        setStatus({ type: 'error', message: data.error || 'Error al procesar la importación' });
      }
    } catch (error) {
      setStatus({ type: 'error', message: 'Error de conexión con el servidor.' });
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-surface-light dark:bg-surface-dark rounded-3xl border border-border-light dark:border-border-dark px-8 py-4 shadow-sm space-y-3">

      <div className="space-y-1">
        <label className="block text-xs font-bold uppercase tracking-[0.15em] text-ink-soft">
          Período del padrón
        </label>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={periodo}
            onChange={handlePeriodoChange}
            placeholder="MM/YYYY"
            maxLength={7}
            disabled={uploading}
            className={`w-40 h-11 px-4 rounded-xl border text-sm font-mono font-semibold text-ink focus:outline-none transition-colors ${
              periodoError
                ? 'border-red-400 bg-red-50 focus:border-red-500'
                : 'border-border-light bg-background-light focus:border-primary'
            }`}
          />
          <span className="text-xs text-ink-muted">Formato: MM/YYYY &nbsp;—&nbsp; ej: 05/2026</span>
        </div>
        {periodoError && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">error</span>
            {periodoError}
          </p>
        )}
      </div>

      <div className="relative group">
        <div className={`border-2 border-dashed ${file ? 'border-primary bg-primary/5' : 'border-border-light dark:border-slate-800 bg-background-light/50 dark:bg-slate-950/30'} rounded-3xl px-9 py-5 flex flex-col items-center justify-center text-center gap-2 group-hover:border-primary group-hover:bg-primary/5 transition-all cursor-pointer`}>
          <div className={`size-12 rounded-2xl ${file ? 'bg-primary text-white' : 'bg-white dark:bg-slate-900 text-primary'} shadow-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
            <span className="material-symbols-outlined text-2xl">{file ? 'description' : 'cloud_upload'}</span>
          </div>
          <div>
            <p className="text-lg font-black text-slate-900 dark:text-white">
              {file ? file.name : `Arrastre el archivo ${accept.split(',')[0].toUpperCase()}`}
            </p>
            <p className="text-sm text-slate-500">
              {file ? `${(file.size / 1024).toFixed(2)} KB` : 'O haga clic para explorar sus archivos'}
            </p>
          </div>
          <input
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
            disabled={uploading}
          />
        </div>
      </div>

      {status && (
        <div className={`flex items-center gap-4 px-4 py-2 rounded-2xl border ${status.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
          status.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
            'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
          <span className="material-symbols-outlined">
            {status.type === 'error' ? 'error' : status.type === 'success' ? 'check_circle' : 'info'}
          </span>
          <p className="text-sm font-medium">{status.message}</p>
        </div>
      )}

      <div className="flex items-center gap-4 px-4 py-2 bg-primary/5 rounded-2xl border border-primary/10">
        <span className="material-symbols-outlined text-primary">info</span>
        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
          {description}
        </p>
      </div>

      <div className="flex justify-end pb-1">
        <button
          onClick={handleProcess}
          disabled={!file || uploading || !/^\d{2}\/\d{4}$/.test(periodo)}
          className={`h-12 px-10 rounded-xl bg-primary text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20 flex items-center gap-2 transition-all
            ${(!file || uploading) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-dark'}
          `}
        >
          {uploading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              Procesando...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[20px]">play_arrow</span>
              Procesar Importación
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const PadronConsulta: React.FC = () => {
  const [cuit, setCuit] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PadronConsultaResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConsultar = async () => {
    const digits = cuit.replace(/\D/g, '');
    if (digits.length !== 11) {
      setError('Ingrese un CUIT de 11 dígitos.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await consultarPadron(digits);
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConsultar();
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('es-AR');

  return (
    <div className="bg-surface-light dark:bg-surface-dark rounded-3xl border border-border-light dark:border-border-dark px-8 py-4 shadow-sm space-y-3">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[22px]">search</span>
          Consultar por CUIT
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Verifique si un contribuyente figura en los padrones importados.</p>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={cuit}
          onChange={e => { setCuit(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="Ej: 20265318305"
          maxLength={13}
          className="h-11 px-4 rounded-xl border border-border-light bg-background-light text-sm font-mono font-semibold text-ink focus:outline-none focus:border-primary transition-colors w-52"
        />
        <button
          onClick={handleConsultar}
          disabled={loading}
          className="h-11 px-6 rounded-xl bg-primary text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {loading
            ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
            : <span className="material-symbols-outlined text-[18px]">search</span>
          }
          Consultar
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {error}
        </p>
      )}

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          <div className={`rounded-2xl border px-5 py-3 space-y-2 ${result.rentas ? 'border-emerald-200 bg-emerald-50' : 'border-border-light bg-background-light/60'}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-soft flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">account_balance</span>
              Padrón Rentas (IIBB)
            </p>
            {result.rentas ? (
              <div className="space-y-1 text-sm">
                <Row label="Denominación" value={result.rentas.DENOMINACION} />
                <Row label="Convenio" value={result.rentas.CONVENIO} />
                <Row label="Exento" value={result.rentas.EXENTO ?? '—'} />
                <Row label="Alícuota" value={result.rentas.PORCENTAJE !== null ? `${result.rentas.PORCENTAJE}%` : '—'} highlight />
                <Row label="Período" value={result.rentas.PERIODO ?? '—'} />
                <Row label="Importado" value={fmt(result.rentas.FECHA_IMPORTACION)} />
              </div>
            ) : (
              <p className="text-sm text-ink-muted italic">No figura en Padrón Rentas.</p>
            )}
          </div>

          <div className={`rounded-2xl border px-5 py-3 space-y-2 ${result.tem ? 'border-sky-200 bg-sky-50' : 'border-border-light bg-background-light/60'}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-soft flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">local_hospital</span>
              Padrón TEM
            </p>
            {result.tem ? (
              <div className="space-y-1 text-sm">
                <Row label="Nombre" value={result.tem.NOMBRE} />
                <Row label="Período" value={result.tem.PERIODO ?? '—'} />
                <Row label="Importado" value={fmt(result.tem.FECHA_IMPORTACION)} />
              </div>
            ) : (
              <p className="text-sm text-ink-muted italic">No figura en Padrón TEM.</p>
            )}
          </div>

        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className="flex justify-between gap-2">
    <span className="text-ink-muted">{label}</span>
    <span className={`font-semibold text-right ${highlight ? 'text-emerald-700' : 'text-ink'}`}>{value}</span>
  </div>
);

export const ImportScreen = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-7xl mx-auto space-y-4 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Padrones</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Consulte e importe los padrones de contribuyentes.</p>
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-ink-muted">upload_file</span>
          Importar Padrones
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          <div className="space-y-2">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">account_balance</span>
                Padrón de Rentas (IIBB)
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Archivo .TXT con alícuotas de Ingresos Brutos.</p>
            </div>
            <ImportSection
              title="Padrón Rentas"
              description="El sistema procesará el archivo reemplazando todo el contenido actual de la tabla PADRON_RENTAS. Asegúrese de subir el padrón completo."
              endpoint="padron/import"
              accept=".txt,.csv"
            />
          </div>

          <div className="space-y-2">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">local_hospital</span>
                Padrón TEM
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Archivo CSV con formato CUIT;APELLIDO Y NOMBRE.</p>
            </div>
            <ImportSection
              title="Padrón TEM"
              description="El sistema procesará el archivo reemplazando todo el contenido actual de la tabla PADRON_TEM. El separador de columnas debe ser punto y coma (;)."
              endpoint="padron-tem/import"
              accept=".csv,.txt"
            />
          </div>

        </div>
      </div>

      <PadronConsulta />

      <div className="flex justify-start">
        <button
          onClick={() => navigate('/dashboard')}
          className="h-12 px-8 rounded-xl font-bold text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-colors"
        >
          Volver al Panel
        </button>
      </div>
    </div>
  );
};
