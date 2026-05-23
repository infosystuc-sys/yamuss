import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../services/api';

const DATABASES = ['CIMSA', 'CENTRAL', 'GALENO', 'GALENORT', 'MITRE', 'AST', 'PRUEBA'] as const;

export const LoginScreen = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [database, setDatabase] = useState('CENTRAL');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toUpperCase(), password, database })
      });


      const data = await response.json();

      if (response.ok && data.token) {
        login({
          username: data.user.username,
          role: data.user.role,
          database: data.user.database,
          token: data.token
        });
        navigate('/dashboard');
      } else {
        setError(data.error || 'Credenciales inválidas');
      }
    } catch {
      setError('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8 pb-0 text-center">
          <div className="mx-auto size-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary">
            <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900">Finance Portal</h1>
          <p className="text-slate-500 mt-1">Gestión de Tesorería · Sistema Multi-Empresa</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-medium text-center flex items-center gap-2 justify-center">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </div>
          )}

          {/* Selector de Empresa */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary">corporate_fare</span>
              Base de Datos / Empresa
            </label>
            <select
              value={database}
              onChange={e => setDatabase(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary focus:outline-none transition-all font-bold text-slate-700 bg-white appearance-none cursor-pointer"
              required
            >
              {DATABASES.map(db => (
                <option key={db} value={db}>{db}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Usuario</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary focus:outline-none transition-all font-bold text-slate-700"
              placeholder="Ej: SUPERVISOR"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary focus:outline-none transition-all font-bold text-slate-700"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-primary/30 mt-4 transition-all ${loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark hover:scale-[1.02] active:scale-[0.98]'
              }`}
          >
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="bg-slate-50 p-4 text-center text-xs text-slate-400 border-t border-slate-100">
          <div className="font-medium mb-1">Finance Portal · Tango ERP Multi-Empresa</div>
          <div className="text-slate-300">CIMSA · CENTRAL · GALENO · GALENORT · MITRE · AST · PRUEBA</div>
        </div>
      </div>
    </div>
  );
};
