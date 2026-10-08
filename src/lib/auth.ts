import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Determina se o usuário logado é administrador-mestre.
 *
 * Regra:
 *  - O admin principal entra com e-mail real (não termina em "@emec.app") → admin.
 *  - Usuários gerenciados entram com "<matricula>@emec.app"; só são admin se o
 *    perfil deles na tabela `usuarios` for "Administrador".
 *
 * Retorna `null` enquanto carrega (trate como "sem permissão" até resolver).
 */
export function useIsAdmin(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email ?? "";

      // Admin-mestre: login com e-mail real.
      if (user && !email.endsWith("@emec.app")) {
        if (active) setIsAdmin(true);
        return;
      }

      // Usuário gerenciado: só é admin se o perfil for Administrador.
      if (user) {
        const { data } = await supabase
          .from("usuarios")
          .select("perfil")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (active) setIsAdmin(data?.perfil === "Administrador");
        return;
      }

      if (active) setIsAdmin(false);
    })();

    return () => { active = false; };
  }, []);

  return isAdmin;
}
