-- ─────────────────────────────────────────────────────────
-- Segunda categoría dentro de "Mi equipo" (además de encendido/apagado con
-- team_enabled): si el equipo de esta cuenta opera CON PIN (identidad verificada en
-- cada acción, como hoy) o SIN PIN (modo abierto -- cualquiera del equipo puede
-- tomar/reasignar/modificar/cancelar una orden sin pedir ni recordar nada, pensado
-- para clientes tipo hotel donde el "robo" real no está en juego, solo la prolijidad
-- interna). Solo lo prende/apaga el admin de la plataforma, nunca la cuenta -- mismo
-- criterio que is_permanent/card_enabled/team_enabled. Default TRUE: no cambia el
-- comportamiento de ninguna cuenta que ya usa equipo con PIN.
-- ─────────────────────────────────────────────────────────

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS team_pin_required BOOLEAN NOT NULL DEFAULT TRUE;
