const { Pool } = require('pg');

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Admin users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price_uah DECIMAL(10, 2) NOT NULL,
        image_url VARCHAR(500),
        images TEXT[], -- Multiple images support
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Banners table
    await client.query(`
      CREATE TABLE IF NOT EXISTS banners (
        id SERIAL PRIMARY KEY,
        image_url VARCHAR(500) NOT NULL,
        link_url VARCHAR(500),
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize default settings if not exist
    const settingsExist = await client.query('SELECT * FROM settings WHERE key = $1', ['shop_settings']);
    if (settingsExist.rows.length === 0) {
      const defaultSettings = {
        enable_stars: true,
        enable_ton: false,
        ton_wallet: 'UQARnCdfRw0VcT86ApqHJEdMGzQU3T_MnPbNs71A6nOXcF91'
      };
      await client.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['shop_settings', JSON.stringify(defaultSettings)]);
    }

    // Orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        telegram_user_id BIGINT NOT NULL,
        telegram_username VARCHAR(255),
        total_uah DECIMAL(10, 2) NOT NULL,
        total_stars INTEGER,
        total_ton DECIMAL(10, 4),
        platform VARCHAR(50),
        payment_method VARCHAR(20) DEFAULT 'stars', -- 'stars' or 'ton'
        transaction_hash VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        payment_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Order items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        product_name VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL,
        price_uah DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('COMMIT');
    console.log('✅ Database initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Products CRUD
const db = {
  // Get all products
  async getAllProducts() {
    const result = await pool.query(
      'SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC'
    );
    return result.rows;
  },

  // Get product by ID
  async getProduct(id) {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return result.rows[0];
  },

  // Create product
  async createProduct(name, description, price_uah, image_url) {
    const result = await pool.query(
      'INSERT INTO products (name, description, price_uah, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, price_uah, image_url]
    );
    return result.rows[0];
  },

  // Update product
  async updateProduct(id, name, description, price_uah, image_url) {
    const result = await pool.query(
      'UPDATE products SET name = $1, description = $2, price_uah = $3, image_url = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [name, description, price_uah, image_url, id]
    );
    return result.rows[0];
  },

  // Delete product (soft delete)
  async deleteProduct(id) {
    await pool.query('UPDATE products SET is_active = false WHERE id = $1', [id]);
  },

  // Create order
  async createOrder(telegram_user_id, telegram_username, total_uah, total_stars, total_ton, platform, payment_method, transaction_hash, items) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create order
      const orderResult = await client.query(
        'INSERT INTO orders (telegram_user_id, telegram_username, total_uah, total_stars, total_ton, platform, payment_method, transaction_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [telegram_user_id, telegram_username, total_uah, total_stars, total_ton, platform, payment_method, transaction_hash]
      );
      const order = orderResult.rows[0];

      // Create order items
      for (const item of items) {
        await client.query(
          'INSERT INTO order_items (order_id, product_id, product_name, quantity, price_uah) VALUES ($1, $2, $3, $4, $5)',
          [order.id, item.product_id, item.name, item.quantity, item.price]
        );
      }

      await client.query('COMMIT');
      return order;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Update order status
  async updateOrderStatus(orderId, status, paymentId) {
    await pool.query(
      'UPDATE orders SET status = $1, payment_id = $2 WHERE id = $3',
      [status, paymentId, orderId]
    );
  },

  // Get all orders
  async getAllOrders() {
    const result = await pool.query(
      'SELECT * FROM orders ORDER BY created_at DESC'
    );
    return result.rows;
  },

  // Get order with items
  async getOrderWithItems(orderId) {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);

    if (orderResult.rows.length === 0) return null;

    return {
      ...orderResult.rows[0],
      items: itemsResult.rows
    };
  },

  // Admin user operations
  async getAdminByUsername(username) {
    const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
    return result.rows[0];
  },

  async createAdmin(username, password_hash) {
    const result = await pool.query(
      'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2) RETURNING *',
      [username, password_hash]
    );
    return result.rows[0];
  },

  // Banners CRUD
  async getAllBanners() {
    const result = await pool.query(
      'SELECT * FROM banners WHERE is_active = true ORDER BY sort_order ASC, created_at DESC'
    );
    return result.rows;
  },

  async createBanner(image_url, link_url, sort_order) {
    const result = await pool.query(
      'INSERT INTO banners (image_url, link_url, sort_order) VALUES ($1, $2, $3) RETURNING *',
      [image_url, link_url || null, sort_order || 0]
    );
    return result.rows[0];
  },

  async updateBanner(id, image_url, link_url, sort_order) {
    const result = await pool.query(
      'UPDATE banners SET image_url = $1, link_url = $2, sort_order = $3 WHERE id = $4 RETURNING *',
      [image_url, link_url || null, sort_order || 0, id]
    );
    return result.rows[0];
  },

  async deleteBanner(id) {
    await pool.query('UPDATE banners SET is_active = false WHERE id = $1', [id]);
  },

  // Settings
  async getSettings() {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['shop_settings']);
    return result.rows[0] ? JSON.parse(result.rows[0].value) : null;
  },

  async updateSettings(settings) {
    const result = await pool.query(
      'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2 RETURNING value',
      [JSON.stringify(settings), 'shop_settings']
    );
    return result.rows[0] ? JSON.parse(result.rows[0].value) : null;
  }
};

module.exports = { initDatabase, db, pool };
