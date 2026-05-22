-- Notificaciones para vendedores generadas por eventos del sistema
-- (orden cobrada, liquidación procesada, etc.)
CREATE TABLE seller_notifications (
  id          SERIAL PRIMARY KEY,
  seller_id   INT          NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  type        TEXT         NOT NULL, -- 'order_paid' | 'commission_paid'
  title       TEXT         NOT NULL,
  body        TEXT         NOT NULL,
  metadata    JSONB        NOT NULL DEFAULT '{}',
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seller_notifications_seller_created
  ON seller_notifications(seller_id, created_at DESC);

CREATE INDEX idx_seller_notifications_unread
  ON seller_notifications(seller_id)
  WHERE read_at IS NULL;
