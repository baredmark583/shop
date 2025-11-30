require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { initDatabase, db } = require('./database');
const { bot, createInvoice } = require('./bot');
const { convertToStars, detectPlatform } = require('./utils/currency');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Create uploads directory
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ==================== API Routes ====================

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const products = await db.getAllProducts();
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await db.getProduct(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

// Create product (admin only)
app.post('/api/products', upload.single('image'), async (req, res) => {
    try {
        const { name, description, price_uah } = req.body;
        const image_url = req.file ? `/uploads/${req.file.filename}` : null;

        const product = await db.createProduct(name, description, parseFloat(price_uah), image_url);
        res.json(product);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

// Update product (admin only)
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
    try {
        const { name, description, price_uah } = req.body;
        const existingProduct = await db.getProduct(req.params.id);
        const image_url = req.file ? `/uploads/${req.file.filename}` : existingProduct.image_url;

        const product = await db.updateProduct(req.params.id, name, description, parseFloat(price_uah), image_url);
        res.json(product);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product (admin only)
app.delete('/api/products/:id', async (req, res) => {
    try {
        await db.deleteProduct(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// Get all banners
app.get('/api/banners', async (req, res) => {
    try {
        const banners = await db.getAllBanners();
        res.json(banners);
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({ error: 'Failed to fetch banners' });
    }
});

// Create banner (admin only)
app.post('/api/banners', upload.single('image'), async (req, res) => {
    try {
        const { link_url, sort_order } = req.body;
        const image_url = req.file ? `/uploads/${req.file.filename}` : null;

        if (!image_url) {
            return res.status(400).json({ error: 'Image is required' });
        }

        const banner = await db.createBanner(image_url, link_url, parseInt(sort_order) || 0);
        res.json(banner);
    } catch (error) {
        console.error('Error creating banner:', error);
        res.status(500).json({ error: 'Failed to create banner' });
    }
});

// Update banner (admin only)
app.put('/api/banners/:id', upload.single('image'), async (req, res) => {
    try {
        const { link_url, sort_order } = req.body;
        const existingBanner = await db.getAllBanners().then(b => b.find(x => x.id == req.params.id));
        const image_url = req.file ? `/uploads/${req.file.filename}` : existingBanner?.image_url;

        const banner = await db.updateBanner(req.params.id, image_url, link_url, parseInt(sort_order) || 0);
        res.json(banner);
    } catch (error) {
        console.error('Error updating banner:', error);
        res.status(500).json({ error: 'Failed to update banner' });
    }
});

// Delete banner (admin only)
app.delete('/api/banners/:id', async (req, res) => {
    try {
        await db.deleteBanner(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting banner:', error);
        res.status(500).json({ error: 'Failed to delete banner' });
    }
});

// Get settings
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await db.getSettings();
        res.json(settings || {});
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Update settings (admin only)
app.put('/api/settings', async (req, res) => {
    try {
        const settings = await db.updateSettings(req.body);
        res.json(settings);
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Create order and generate invoice
app.post('/api/orders', async (req, res) => {
    try {
        const { telegram_user_id, items, platform, payment_method, transaction_hash } = req.body;

        // Calculate total
        let total_uah = 0;
        const enrichedItems = [];

        for (const item of items) {
            const product = await db.getProduct(item.product_id);
            if (!product) {
                return res.status(404).json({ error: `Product ${item.product_id} not found` });
            }

            const itemTotal = product.price_uah * item.quantity;
            total_uah += itemTotal;

            enrichedItems.push({
                product_id: product.id,
                name: product.name,
                price: product.price_uah,
                quantity: item.quantity
            });
        }

        const total_stars = convertToStars(total_uah, platform || 'mobile');
        const total_ton = total_uah / 1000; // Approximate rate: 1000 UAH = 1 TON (simplified for demo)

        const orderData = {
            total_uah,
            items: enrichedItems
        };

        // Create order in DB
        const order = await db.createOrder(
            telegram_user_id,
            null, // username
            total_uah,
            total_stars,
            total_ton,
            platform || 'mobile',
            payment_method || 'stars',
            transaction_hash,
            enrichedItems
        );

        // If payment method is 'stars', create invoice
        if (payment_method === 'stars' || !payment_method) {
            await createInvoice(telegram_user_id, orderData, platform || 'mobile');
        }

        res.json({
            success: true,
            order_id: order.id,
            total_uah,
            total_stars,
            total_ton
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Get all orders (admin only)
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await db.getAllOrders();
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Update order with transaction hash (for TON payments)
app.patch('/api/orders/:id', async (req, res) => {
    try {
        const { transaction_hash, status } = req.body;

        await db.updateOrder(req.params.id, transaction_hash, status);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const admin = await db.getAdminByUsername(username);
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const match = await bcrypt.compare(password, admin.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({ success: true, username: admin.username });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ==================== Static Pages ====================

// Serve Telegram Web App
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// ==================== Keep-Alive (Prevent Render sleep) ====================

// Ping self every 30 seconds to keep awake on Render free tier
setInterval(() => {
    const url = process.env.WEBAPP_URL || `http://localhost:${PORT}`;
    fetch(`${url}/api/products`)
        .catch(err => { }); // Ignore errors
}, 30000); // 30 seconds

// ==================== Initialize and Start ====================


async function start() {
    try {
        // Initialize database
        await initDatabase();

        // Create default admin if not exists
        const adminExists = await db.getAdminByUsername(process.env.ADMIN_USERNAME || 'admin');
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
            await db.createAdmin(process.env.ADMIN_USERNAME || 'admin', hashedPassword);
            console.log('✅ Default admin created');
        }

        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📱 Telegram Bot is active`);
            console.log(`🌐 Web App URL: ${process.env.WEBAPP_URL || `http://localhost:${PORT}`}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

start();
