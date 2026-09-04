-- ─────────────────────────────────────────────────────────
-- El "Resumen de horarios" (texto libre a nivel casa) quedó redundante desde
-- que existen los 4 campos estructurados de horario (dinner_show_time_es,
-- dinner_transfer_window_es, show_only_time_es, show_only_transfer_window_es,
-- ver 065_house_schedule_fields.sql): duplicaba la misma info que el admin ya
-- carga en esos campos. El texto que se mostraba antes ahora se arma
-- automáticamente combinando esos 4 campos.
-- ─────────────────────────────────────────────────────────

ALTER TABLE products
  DROP COLUMN IF EXISTS schedule_summary_es,
  DROP COLUMN IF EXISTS schedule_summary_en;
