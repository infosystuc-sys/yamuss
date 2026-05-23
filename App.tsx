
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, ProtectedRoute } from './contexts/AuthContext';
import { LoginScreen } from './screens/LoginScreen';
import { OrderDetailScreen } from './screens/OrderDetailScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { ValidationScreen } from './screens/ValidationScreen';
import { ProcessingScreen } from './screens/ProcessingScreen';
import { BatchHistoryScreen } from './screens/BatchHistoryScreen';
import { ImportScreen } from './screens/ImportScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { UsersScreen } from './screens/UsersScreen';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { switchCompany } from './services/api';

// ---- ROLE CONSTANTS ----
const ALL_ROLES = ['ADMINISTRADOR', 'OPERADOR'];
const ADMIN_ONLY = ['ADMINISTRADOR'];

const Sidebar = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isActive = (path: string) => location.pathname === path;

  const isAdmin = user?.role === 'ADMINISTRADOR';

  const NavLink = ({ to, icon, label }: { to: string; icon: string; label: string }) => (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${isActive(to)
        ? 'bg-primary/10 text-primary'
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      {label}
    </Link>
  );

  return (
    <aside className="w-64 bg-white dark:bg-surface-dark border-r border-border-light dark:border-border-dark flex flex-col hidden lg:flex">
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
        <div>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Menu Principal</h3>
          <nav className="flex flex-col space-y-1">
            <NavLink to="/dashboard" icon="dashboard" label="Dashboard" />
            <NavLink to="/dashboard" icon="payments" label="Órdenes de Pago" />
          </nav>
        </div>
        <div>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Operaciones</h3>
          <nav className="flex flex-col space-y-1">
            {isAdmin && (
              <NavLink to="/processing" icon="layers" label="Procesar Lote" />
            )}
            {isAdmin && (
              <NavLink to="/batches" icon="history" label="Consultar Lotes" />
            )}
            <NavLink to="/import" icon="cloud_upload" label="Importar Padrón" />
          </nav>
        </div>
        {isAdmin && (
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Administración</h3>
            <nav className="flex flex-col space-y-1">
              <NavLink to="/users" icon="manage_accounts" label="Gestión de Usuarios" />
            </nav>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-border-light dark:border-border-dark">
        {user && (
          <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conectado como</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{user.username}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase
                ${user.role === 'ADMINISTRADOR'
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                  : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                }`}>
                {user.role}
              </span>
              <span className="text-[10px] text-slate-400">{user.database}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

const Header = () => {
  const navigate = useNavigate();
  const { user, logout, login } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const profileRef = React.useRef<HTMLDivElement>(null);

  const VALID_DATABASES = ['CIMSA', 'CENTRAL', 'GALENO', 'GALENORT', 'MITRE', 'AST', 'PRUEBA'];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
    setShowProfile(false);
  };

  const handleSwitchCompany = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDb = e.target.value;
    if (newDb === user?.database) return;

    setIsSwitching(true);
    try {
      const res = await switchCompany(newDb);
      if (res.success && res.user && res.token) {
        login({ ...res.user, token: res.token });
        window.location.reload();
      }
    } catch (err) {
      alert("Error al cambiar empresa");
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <>
      <header className="bg-white dark:bg-surface-dark border-b border-border-light dark:border-border-dark px-6 py-3 shadow-sm shrink-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="size-8 flex items-center justify-center bg-primary rounded-lg text-white">
              <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
            </div>
            <div>
              <h2 className="text-lg font-black leading-tight tracking-tight text-slate-900 dark:text-white">Finance Portal</h2>
            </div>
          </Link>
          {user && (
            <select
              title="Seleccionar Empresa"
              value={user.database}
              onChange={handleSwitchCompany}
              disabled={isSwitching}
              className="ml-2 text-xs font-bold text-slate-700 dark:text-white bg-slate-100 dark:bg-slate-800 border-none px-2 py-1 rounded-md cursor-pointer focus:ring-1 focus:ring-primary outline-none"
            >
              {VALID_DATABASES.map(db => (
                <option key={db} value={db}>{db}</option>
              ))}
            </select>
          )}
        </div>

        {/* Profile Menu */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfile(prev => !prev)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {user?.username?.charAt(0) || 'U'}
            </div>
            {user && (
              <div className="hidden md:block text-left">
                <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{user.username}</p>
                <p className="text-[10px] text-slate-400 leading-tight">{user.role}</p>
              </div>
            )}
            <span className="material-symbols-outlined text-[16px] text-slate-400">expand_more</span>
          </button>

          {showProfile && (
            <div className="absolute right-0 top-12 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-900 dark:text-white">{user?.username}</p>
                <p className="text-[10px] text-slate-500">{user?.role} · {user?.database}</p>
              </div>
              <div className="p-1">
                <button
                  onClick={() => { setShowChangePassword(true); setShowProfile(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-primary">lock_reset</span>
                  Cambiar Contraseña
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Cerrar Sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
};

const DashboardLayout = ({ children }: { children?: React.ReactNode }) => (
  <div className="h-screen flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
    <Header />
    <div className="flex flex-1 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth">
        {children}
      </main>
    </div>
  </div>
);

// Wrapper interno para manejar el primer login forzado
const AppRoutes: React.FC = () => {
  const { user, login } = useAuth();
  const [showForcedChange, setShowForcedChange] = useState(false);

  useEffect(() => {
    if (user?.primerLogin) {
      setShowForcedChange(true);
    }
  }, [user?.primerLogin]);

  const handlePasswordChanged = () => {
    if (user) {
      login({ ...user, primerLogin: false });
    }
    setShowForcedChange(false);
  };

  return (
    <>
      {showForcedChange && (
        <ChangePasswordModal
          forced
          onClose={() => {}}
          onPasswordChanged={handlePasswordChanged}
        />
      )}
      <Routes>
        <Route path="/" element={<LoginScreen />} />
        <Route path="/dashboard" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <DashboardLayout><DashboardScreen /></DashboardLayout>
          </ProtectedRoute>
        } />
        <Route path="/review/:id" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <DashboardLayout><OrderDetailScreen /></DashboardLayout>
          </ProtectedRoute>
        } />
        <Route path="/processing" element={
          <ProtectedRoute roles={ADMIN_ONLY}>
            <DashboardLayout><ProcessingScreen /></DashboardLayout>
          </ProtectedRoute>
        } />
        <Route path="/batches" element={
          <ProtectedRoute roles={ADMIN_ONLY}>
            <DashboardLayout><BatchHistoryScreen /></DashboardLayout>
          </ProtectedRoute>
        } />
        <Route path="/import" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <DashboardLayout><ImportScreen /></DashboardLayout>
          </ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute roles={ADMIN_ONLY}>
            <DashboardLayout><UsersScreen /></DashboardLayout>
          </ProtectedRoute>
        } />
        <Route path="/success" element={<SuccessScreen />} />
      </Routes>
    </>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
};

export default App;
