-- Tokens de un solo uso para que el vendedor confirme o cancele desde el email
CREATE TABLE IF NOT EXISTS order_action_tokens (
  id          SERIAL      PRIMARY KEY,
  token       UUID        NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  order_id    INT         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_id   INT         NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL CHECK (action IN ('collect', 'cancel')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_tokens_lookup
  ON order_action_tokens(token)
  WHERE used_at IS NULL;
