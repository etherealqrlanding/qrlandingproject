-- Centraliza el cálculo de "cupo ocupado" (pax de órdenes paid/pending + addons
-- pendientes + checkout_holds vigentes) en una única función SQL, para que el
-- checkout (runAvailabilityCheck) y el buscador de disponibilidad del admin usen
-- exactamente la misma cuenta y nunca se desincronicen.
CREATE OR REPLACE FUNCTION option_booked_pax(p_option_id INT, p_service_date DATE)
RETURNS INT AS $$
  SELECT (
    COALESCE((
      SELECT SUM(oi.adults + oi.children)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
       WHERE oi.option_id = p_option_id AND oi.service_date = p_service_date
         AND o.status IN ('paid', 'pending')
    ), 0)
    + COALESCE((
      SELECT SUM(ad.extra_adults + ad.extra_children)
        FROM order_addons ad
       WHERE ad.option_id = p_option_id AND ad.service_date = p_service_date
         AND ad.status = 'pending'
    ), 0)
    + COALESCE((
      SELECT SUM(h.pax)
        FROM checkout_holds h
       WHERE h.option_id = p_option_id AND h.service_date = p_service_date
         AND h.expires_at > NOW()
    ), 0)
  )::int;
$$ LANGUAGE sql STABLE;
