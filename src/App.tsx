import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import QRCodes from "./pages/QRCodes";
import Publicacao from "./pages/Publicacao";
import Pendentes from "./pages/Pendentes";
import Usuarios from "./pages/Usuarios";
import Configuracoes from "./pages/Configuracoes";
import PubViewer from "./pages/PubViewer";

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    setAuthed(false);
  }

  if (loading) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/4c7913fce5eb"
          element={authed ? <Navigate to="/dashboard" replace /> : <Login onLogin={() => setAuthed(true)} />}
        />
        <Route
          path="/"
          element={authed ? <Layout onLogout={logout} /> : <Navigate to="/4c7913fce5eb" replace />}
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="qrcodes" element={<QRCodes />} />
          <Route path="qrcodes/publicacao" element={<Publicacao />} />
          <Route path="pendentes" element={<Pendentes />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="configuracoes" element={<Configuracoes />} />
        </Route>
        <Route path="/pub/:id" element={<PubViewer />} />
        <Route path="*" element={<Navigate to={authed ? "/dashboard" : "/4c7913fce5eb"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
