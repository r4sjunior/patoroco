// Migrações aplicadas em ordem, uma única vez. Para mudar o banco, acrescente um item novo.
// Dinheiro é sempre em centavos (inteiro). Quantidade de estoque é numeric para aceitar 0,5 etc.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (
    id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    store_open boolean NOT NULL DEFAULT true,
    whatsapp text NOT NULL DEFAULT '',
    pix_key text NOT NULL DEFAULT '',
    address text NOT NULL DEFAULT '',
    notice text NOT NULL DEFAULT ''
  );

  CREATE TABLE delivery_zones (
    id serial PRIMARY KEY,
    name text NOT NULL,
    fee_cents int NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
    active boolean NOT NULL DEFAULT true
  );

  CREATE TABLE stock_items (
    id serial PRIMARY KEY,
    name text NOT NULL,
    unit text NOT NULL DEFAULT 'un',
    quantity numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_quantity numeric(12,3) NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
  );

  CREATE TABLE products (
    id serial PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    price_cents int NOT NULL CHECK (price_cents >= 0),
    image text NOT NULL DEFAULT '',
    highlight boolean NOT NULL DEFAULT false,
    active boolean NOT NULL DEFAULT true,
    sort int NOT NULL DEFAULT 0
  );

  CREATE TABLE product_recipe (
    product_id int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stock_item_id int NOT NULL REFERENCES stock_items(id),
    quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (product_id, stock_item_id)
  );

  CREATE TABLE cash_sessions (
    id serial PRIMARY KEY,
    opened_at timestamptz NOT NULL DEFAULT now(),
    opening_cents int NOT NULL DEFAULT 0,
    closed_at timestamptz,
    expected_cents int,
    counted_cents int,
    notes text NOT NULL DEFAULT ''
  );
  CREATE UNIQUE INDEX one_open_cash_session ON cash_sessions ((true)) WHERE closed_at IS NULL;

  CREATE TABLE orders (
    id serial PRIMARY KEY,
    token text NOT NULL UNIQUE,
    channel text NOT NULL CHECK (channel IN ('online', 'balcao')),
    status text NOT NULL CHECK (status IN ('novo', 'preparando', 'pronto', 'concluido', 'cancelado')),
    customer_name text NOT NULL DEFAULT '',
    customer_phone text NOT NULL DEFAULT '',
    fulfillment text NOT NULL CHECK (fulfillment IN ('entrega', 'retirada', 'balcao')),
    zone_name text NOT NULL DEFAULT '',
    delivery_fee_cents int NOT NULL DEFAULT 0,
    address text NOT NULL DEFAULT '',
    reference text NOT NULL DEFAULT '',
    payment_method text NOT NULL CHECK (payment_method IN ('pix', 'dinheiro', 'cartao')),
    change_for_cents int,
    notes text NOT NULL DEFAULT '',
    subtotal_cents int NOT NULL,
    discount_cents int NOT NULL DEFAULT 0,
    total_cents int NOT NULL,
    paid_at timestamptz,
    cancel_reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX orders_status_idx ON orders (status, created_at);
  CREATE INDEX orders_paid_idx ON orders (paid_at);

  CREATE TABLE order_items (
    id serial PRIMARY KEY,
    order_id int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id int REFERENCES products(id),
    product_name text NOT NULL,
    unit_price_cents int NOT NULL,
    quantity int NOT NULL CHECK (quantity > 0)
  );
  CREATE INDEX order_items_order_idx ON order_items (order_id);

  CREATE TABLE stock_movements (
    id serial PRIMARY KEY,
    stock_item_id int NOT NULL REFERENCES stock_items(id),
    type text NOT NULL CHECK (type IN ('entrada', 'saida', 'ajuste', 'venda', 'estorno')),
    delta numeric(12,3) NOT NULL,
    balance_after numeric(12,3) NOT NULL,
    note text NOT NULL DEFAULT '',
    order_id int REFERENCES orders(id),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX stock_movements_order_idx ON stock_movements (order_id);

  CREATE TABLE cash_entries (
    id serial PRIMARY KEY,
    session_id int NOT NULL REFERENCES cash_sessions(id),
    type text NOT NULL CHECK (type IN ('venda', 'suprimento', 'sangria', 'despesa', 'estorno')),
    method text NOT NULL CHECK (method IN ('pix', 'dinheiro', 'cartao')),
    amount_cents int NOT NULL,
    description text NOT NULL DEFAULT '',
    order_id int REFERENCES orders(id),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX cash_entries_session_idx ON cash_entries (session_id);

  CREATE TABLE rate_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    hits int NOT NULL
  );

  -- Dados iniciais, tirados do panfleto
  INSERT INTO settings (whatsapp, address) VALUES ('84981832604', 'Extremoz, Bairro Vila Maria');
  INSERT INTO delivery_zones (name, fee_cents) VALUES ('Vila Maria', 0);
  INSERT INTO stock_items (name, unit, quantity, min_quantity) VALUES
    ('Frango assado', 'un', 20, 5),
    ('Macaxeira', 'porção', 20, 5),
    ('Farofa', 'porção', 20, 5);
  INSERT INTO products (name, description, price_cents, image, highlight, sort) VALUES
    ('Frango Assado + Macaxeira e Farofa', 'Frango assado acompanhado de macaxeira e farofa.', 3000, '/img/combo.webp', true, 1);
  INSERT INTO product_recipe (product_id, stock_item_id, quantity)
    SELECT 1, id, 1 FROM stock_items;
  `,
  // Senha trocada pelo admin. NULL = continua valendo a variável ADMIN_PASSWORD.
  `
  ALTER TABLE settings
    ADD COLUMN admin_password_hash text,
    ADD COLUMN admin_password_version int NOT NULL DEFAULT 0;
  `,
];
