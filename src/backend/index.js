import express from 'express';
import { join } from 'path';
import mysql from 'mysql2/promise';

const app = express();
app.use(express.json());

// Database connection
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql_db',
    user: process.env.DB_USER || 'app_user',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'app_database',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 1. Serve Static Assets (Frontend)
// 'front' is the folder where your index.html and scripts live
app.use(express.static('front')); 

// 2. Your API Routes (Backend)

// --- Users CRUD ---
// Get users
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login with user
app.post('/api/users/login', async (req, res) => {
    try {
        const { username } = req.body;
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
        res.json({ user: rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new user if doesn't exist
app.post('/api/users/register', async (req, res) => {
    try {
        const { username } = req.body;
        const [rows_check] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows_check.length > 0) return res.status(409).json({ message: 'User already exists' });

        // Generate a dummy email since it is required by the DB schema but not provided by the form
        const email = `${username}@example.com`;
        const [result] = await pool.query('INSERT INTO users (username, email) VALUES (?, ?)', [username, email]);
        
        res.status(201).json({ user: { id: result.insertId, username, email } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get user by id
app.get('/api/users/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Insert user with emails
app.post('/api/users', async (req, res) => {
    try {
        const { username, email } = req.body;
        const [result] = await pool.query('INSERT INTO users (username, email) VALUES (?, ?)', [username, email]);
        res.status(201).json({ id: result.insertId, username, email });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Modify user
app.put('/api/users/:id', async (req, res) => {
    try {
        const { username, email } = req.body;
        const [result] = await pool.query('UPDATE users SET username = ?, email = ? WHERE id = ?', [username, email, req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ id: req.params.id, username, email });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete user
app.delete('/api/users/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Products CRUD ---
// Get products
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get product by id
app.get('/api/products/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add product
app.post('/api/products', async (req, res) => {
    try {
        const { name, price } = req.body;
        const [result] = await pool.query('INSERT INTO products (name, price) VALUES (?, ?)', [name, price]);
        res.status(201).json({ id: result.insertId, name, price });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Modify product
app.put('/api/products/:id', async (req, res) => {
    try {
        const { name, price } = req.body;
        const [result] = await pool.query('UPDATE products SET name = ?, price = ? WHERE id = ?', [name, price, req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
        res.json({ id: req.params.id, name, price });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Orders CRUD ---
// Get all orders for a user
app.get('/api/orders/user/:userId', async (req, res) => {
    try {
        const [orders] = await pool.query(`
            SELECT o.*, 
                   GROUP_CONCAT(CONCAT(p.name, ' x', oi.quantity) SEPARATOR ', ') as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.user_id = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `, [req.params.userId]);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get order by id with details
app.get('/api/orders/:id', async (req, res) => {
    try {
        const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
        if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });
        
        const [items] = await pool.query(`
            SELECT oi.*, p.name as product_name 
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `, [req.params.id]);
        
        res.json({ ...orders[0], items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new order
app.post('/api/orders', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { user_id, items } = req.body; // items: [{product_id, quantity, price}]
        
        // Calculate total
        const total_amount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        // Insert order
        const [orderResult] = await connection.query(
            'INSERT INTO orders (user_id, total_amount) VALUES (?, ?)',
            [user_id, total_amount]
        );
        
        const orderId = orderResult.insertId;
        
        // Insert order items
        for (const item of items) {
            await connection.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [orderId, item.product_id, item.quantity, item.price]
            );
        }
        
        await connection.commit();
        res.status(201).json({ id: orderId, user_id, total_amount, items });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// --- Payments CRUD ---
// Get payment for an order
app.get('/api/payments/order/:orderId', async (req, res) => {
    try {
        const [payments] = await pool.query('SELECT * FROM payments WHERE order_id = ?', [req.params.orderId]);
        if (payments.length === 0) return res.status(404).json({ error: 'Payment not found' });
        res.json(payments[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create payment
app.post('/api/payments', async (req, res) => {
    try {
        const { 
            order_id, 
            payment_method, 
            card_holder_name, 
            card_number, 
            amount 
        } = req.body;
        
        // Store only last 4 digits for security
        const card_number_last4 = card_number ? card_number.slice(-4) : null;
        
        // Generate a mock transaction ID
        const transaction_id = 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
        
        const [result] = await pool.query(
            `INSERT INTO payments (order_id, payment_method, card_holder_name, card_number_last4, amount, status, transaction_id) 
             VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
            [order_id, payment_method, card_holder_name, card_number_last4, amount, transaction_id]
        );
        
        // Update order status
        await pool.query('UPDATE orders SET status = ? WHERE id = ?', ['processing', order_id]);
        
        res.status(201).json({ 
            id: result.insertId, 
            order_id, 
            payment_method, 
            amount, 
            status: 'completed',
            transaction_id 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Delivery Options CRUD ---
// Get delivery option for an order
app.get('/api/delivery/order/:orderId', async (req, res) => {
    try {
        const [delivery] = await pool.query('SELECT * FROM delivery_options WHERE order_id = ?', [req.params.orderId]);
        if (delivery.length === 0) return res.status(404).json({ error: 'Delivery option not found' });
        res.json(delivery[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create delivery option
app.post('/api/delivery', async (req, res) => {
    try {
        const { 
            order_id, 
            delivery_method, 
            delivery_address, 
            delivery_city, 
            delivery_postal_code, 
            delivery_country = 'France',
            delivery_phone,
            delivery_date,
            delivery_time_slot,
            delivery_instructions,
            delivery_cost 
        } = req.body;
        
        // Generate tracking number
        const tracking_number = 'TRACK' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
        
        const [result] = await pool.query(
            `INSERT INTO delivery_options 
             (order_id, delivery_method, delivery_address, delivery_city, delivery_postal_code, 
              delivery_country, delivery_phone, delivery_date, delivery_time_slot, 
              delivery_instructions, tracking_number, delivery_cost) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [order_id, delivery_method, delivery_address, delivery_city, delivery_postal_code,
             delivery_country, delivery_phone, delivery_date, delivery_time_slot,
             delivery_instructions, tracking_number, delivery_cost]
        );
        
        res.status(201).json({ 
            id: result.insertId, 
            order_id, 
            delivery_method,
            tracking_number,
            delivery_date,
            delivery_time_slot
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update delivery status
app.put('/api/delivery/:id', async (req, res) => {
    try {
        const { delivery_date, delivery_time_slot, tracking_number } = req.body;
        const [result] = await pool.query(
            'UPDATE delivery_options SET delivery_date = ?, delivery_time_slot = ?, tracking_number = ? WHERE id = ?',
            [delivery_date, delivery_time_slot, tracking_number, req.params.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Delivery option not found' });
        res.json({ id: req.params.id, delivery_date, delivery_time_slot, tracking_number });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));