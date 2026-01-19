import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

// JWT Secret - In production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

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

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: 'Token requis' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Token invalide ou expiré' });
        }
        req.user = user;
        next();
    });
};

// Serve Static Assets (Frontend)
app.use(express.static('front'));

// --- Authentication Routes ---

// Register new user
app.post('/api/users/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({ message: 'Nom d\'utilisateur et mot de passe requis' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères' });
        }

        // Check if user exists
        const [existingUsers] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ message: 'Cet utilisateur existe déjà' });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Generate email if not provided
        const userEmail = email || `${username}@example.com`;

        // Insert user
        const [result] = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, userEmail, passwordHash]
        );

        // Generate token
        const token = jwt.sign(
            { id: result.insertId, username },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.status(201).json({
            message: 'Utilisateur créé avec succès',
            user: { id: result.insertId, username, email: userEmail },
            token
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Login user
app.post('/api/users/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({ message: 'Nom d\'utilisateur et mot de passe requis' });
        }

        // Find user
        const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(401).json({ message: 'Identifiants incorrects' });
        }

        const user = users[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Identifiants incorrects' });
        }

        // Generate token
        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            message: 'Connexion réussie',
            user: { id: user.id, username: user.username, email: user.email },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Verify token (for frontend to check if user is still logged in)
app.get('/api/users/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// --- Protected User Routes ---

// Get current user profile
app.get('/api/users/me', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, username, email, created_at FROM users WHERE id = ?',
            [req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Update current user
app.put('/api/users/me', authenticateToken, async (req, res) => {
    try {
        const { email, currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        // Get current user
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }

        const user = users[0];
        let updates = [];
        let params = [];

        // Update email if provided
        if (email) {
            updates.push('email = ?');
            params.push(email);
        }

        // Update password if provided
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ message: 'Mot de passe actuel requis' });
            }

            const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({ message: 'Mot de passe actuel incorrect' });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
            }

            const newHash = await bcrypt.hash(newPassword, 10);
            updates.push('password_hash = ?');
            params.push(newHash);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'Aucune modification fournie' });
        }

        params.push(userId);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        res.json({ message: 'Profil mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Delete current user account
app.delete('/api/users/me', authenticateToken, async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.user.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }
        res.json({ message: 'Compte supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// --- Products Routes (Public read, Protected write) ---

// Get all products (Public)
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Get product by id (Public)
app.get('/api/products/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Produit non trouvé' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Add product (Protected)
app.post('/api/products', authenticateToken, async (req, res) => {
    try {
        const { name, price } = req.body;
        if (!name || price === undefined) {
            return res.status(400).json({ message: 'Nom et prix requis' });
        }
        const [result] = await pool.query('INSERT INTO products (name, price) VALUES (?, ?)', [name, price]);
        res.status(201).json({ id: result.insertId, name, price });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Update product (Protected)
app.put('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const { name, price } = req.body;
        const [result] = await pool.query(
            'UPDATE products SET name = ?, price = ? WHERE id = ?',
            [name, price, req.params.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Produit non trouvé' });
        }
        res.json({ id: req.params.id, name, price });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Delete product (Protected)
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Produit non trouvé' });
        }
        res.json({ message: 'Produit supprimé' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Export for testing
export { app, pool };

// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
    app.listen(3000, () => console.log('Server running on port 3000'));
}
