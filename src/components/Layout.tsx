import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import "./Layout.css";
import { supabase } from "../lib/supabase";

const navBase = [
  {
    to: "/dashboard", label: "Dashboard",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>,
  },
  {
    to: "/clientes", label: "Controle",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><rect x="9" y="7" width="6" height="4" rx="1"/><line x1="12" y1="7" x2="12" y2="4"/><circle cx="12" cy="3" r="1"/><circle cx="8.5" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="16" r="1.5" fill="currentColor" stroke="none"/><line x1="9" y1="19" x2="15" y2="19"/></svg>,
  },
  {
    to: "/qrcodes", label: "QRCodes",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>,
  },
  {
    to: "/pendentes", label: "Pendentes",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    pendente: true,
  },
  {
    to: "/usuarios", label: "Usuários",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  },
  {
    to: "/configuracoes", label: "Configurações",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  },
];

export default function Layout({ onLogout, perfil }: { onLogout?: () => void; perfil?: string | null }) {
  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [pendentes,   setPendentes]   = useState(0);
  const navigate  = useNavigate();
  const location  = useLocation();

  // Fecha drawer ao trocar de rota
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Fecha drawer ao expandir para desktop
  useEffect(() => {
    const handler = () => { if (window.innerWidth > 768) setMobileOpen(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    async function buscarPendentes() {
      const { count } = await supabase
        .from("publicacoes")
        .select("*", { count: "exact", head: true })
        .eq("pagamento_status", "pendente");
      setPendentes(count ?? 0);
    }
    buscarPendentes();
    const interval = setInterval(buscarPendentes, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`layout ${collapsed ? "layout--collapsed" : ""} ${mobileOpen ? "layout--mobile-open" : ""}`}>

      {/* Overlay backdrop (mobile) */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7v5c0 5.25 4.2 10.15 10 11.35C17.8 22.15 22 17.25 22 12V7L12 2z" fill="currentColor"/>
              </svg>
            </div>
            {!collapsed && <span className="sidebar-title">e-mec.com.br</span>}
          </div>
          <button className="sidebar-toggle" onClick={() => setCollapsed(v => !v)} aria-label="Recolher menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? <path d="M9 18l6-6-6-6"/> : <path d="M15 18l-6-6 6-6"/>}
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          {navBase.filter(item => item.to !== "/usuarios" || perfil === "Administrador").map(item => {
            const badge = item.pendente ? pendentes : 0;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}>
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
                {!collapsed && badge > 0 ? <span className="nav-badge">{badge}</span> : null}
                {collapsed  && badge > 0 ? <span className="nav-badge nav-badge--dot" /> : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">IT</div>
            {!collapsed && (
              <div className="user-meta">
                <span className="user-name">Italo</span>
                <span className="user-role">Administrador</span>
              </div>
            )}
          </div>
          {!collapsed && (
            <button className="btn-logout" onClick={() => { onLogout?.(); navigate("/4c7913fce5eb"); }} title="Sair">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>
              </svg>
            </button>
          )}
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-left">
            {/* Hamburguer — visível apenas no mobile */}
            <button className="topbar-hamburger" onClick={() => setMobileOpen(v => !v)} aria-label="Abrir menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6"  x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div className="breadcrumb" id="page-title">Painel de controle</div>
          </div>
          <div className="topbar-right">
            <button className="topbar-btn" title="Notificações">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
              </svg>
              {pendentes > 0 && <span className="topbar-badge">{pendentes}</span>}
            </button>
            <button className="topbar-btn" title="Perfil">
              <div className="topbar-avatar">IT</div>
            </button>
          </div>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
