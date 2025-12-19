require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = 5000;
const SECRET_KEY = process.env.JWT_SECRET || 'secret';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());

// --- DATABASE CONNECTION ---
const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: 'kaleem2004',
    database: 'allergy_guardian',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ---USER LOGS ---
async function logActivity(userId, action, details) {
    try {
        let username = 'Unknown';
        if (userId) {
            const [rows] = await pool.execute('SELECT username FROM users WHERE user_id = ?', [userId]);
            if (rows.length > 0) {
                username = rows[0].username;
            }
        }
        const detailString = typeof details === 'object' ? JSON.stringify(details) : details;
        await pool.execute(
            'INSERT INTO user_logs (user_id, username, action_type, details) VALUES (?, ?, ?, ?)',
            [userId, username, action, detailString]
        );
        console.log(`📝 Logged: ${username} -> ${action}`);
    } catch (err) {
        console.error("❌ Error saving log:", err.message);
    }
}


// AI LOGIC 
async function internalChat(userQuestion, userAllergy, userName) {
    console.log(`👉 AI Chat for ${userName}: ${userQuestion}`);
    
    // 
    const systemPrompt = `
        You are "AllergyGuard", a warm and protective health assistant.
        
        CURRENT USER DETAILS:
        - Name: ${userName}
        - Allergy: ${userAllergy}
        
        YOUR INSTRUCTIONS:
        1. "Who am I?" -> If the user asks this, reply exactly: "You are ${userName}, and you have a ${userAllergy} allergy. I am here to keep you safe! 🛡️"
        2. GREETINGS -> If they say "Hello", greet them by name (${userName}).
        3. SAFETY -> Always check food questions against their ${userAllergy} allergy.
        4. TONE -> Be concise, friendly, and use emojis (🥗, ✅, ⚠️).
        
        User Question: "${userQuestion}"
    `;

    
    const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-pro"];
    let lastError = "";

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(systemPrompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.log(`⚠️ ${modelName} failed.`);
            lastError = error.message;
        }
    }
    
    return `SYSTEM FAILURE: All models failed. Google says: ${lastError}`;
}

// --- JSON WEB TOKEN ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) return res.status(401).json({ detail: "Access Denied: No Token" });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ detail: "Invalid Token" });
        req.user = user; 
        next(); 
    });
}

// ---  ALLERGY CHECK ---
function isSafe(userAllergy, itemAllergens) {
    if (!itemAllergens || itemAllergens === 'None') return true;
    if (itemAllergens.toLowerCase().includes(userAllergy.toLowerCase())) return false;
    return true;
}

// ==========================
//      API ENDPOINTS
// ==========================

// 1. SIGNUP
app.post('/signup', async (req, res) => {
    // We get the basic data
    const { username, password, first_name, last_name, age, allergy } = req.body;
    
    
    const email = req.body.email || null;
    const phone = req.body.phone || null;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.execute(
            'INSERT INTO users (username, password, first_name, last_name, email, phone, age, allergy_trigger) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, first_name, last_name, email, phone, age, allergy]
        );
        
        logActivity(result.insertId, 'SIGNUP', `Age: ${age}, Allergy: ${allergy}`);
        res.json({ message: "User created" });
    } catch (err) {
        console.error("Signup Error:", err.message);
        res.status(400).json({ detail: "Username/Email taken or DB Error" });
    }
});

// --- ADMIN CONFIG ---
const ADMIN_USERNAME = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'KALEEM2004';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'KALEEM2004';

function requireAdminKey(req, res) {
    if (req.headers['x-admin-key'] !== ADMIN_SECRET) {
        res.status(401).json({ detail: 'Admin key invalid' });
        return false;
    }
    return true;
}

function isAdminLogin(username, password) {
    return username === ADMIN_USERNAME && password === ADMIN_PASS;
}

// 2. LOGIN 
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // --- STEP 1: CHECK ADMIN ---
        if (isAdminLogin(username, password)) {
            console.log(" Admin Logged In");
            return res.json({
                user_id: null,
                allergy: null,
                is_admin: true,
                admin_key: ADMIN_SECRET,
                token: 'admin-token-placeholder' 
            });
        }

        //  CHECK DATABASE USER (Hashed) ---
        const [rows] = await pool.execute(
            'SELECT user_id, username, password, allergy_trigger FROM users WHERE username = ?',
            [username]
        );

        if (rows.length === 0) {
            return res.status(401).json({ detail: "Invalid login" });
        }

        const user = rows[0];

        const match = await bcrypt.compare(password, user.password);

        if (match) {
            const token = jwt.sign(
                { id: user.user_id, username: user.username }, 
                SECRET_KEY, 
                { expiresIn: '1h' }
            );

            logActivity(user.user_id, 'LOGIN', 'User logged in successfully');

            res.json({
                user_id: user.user_id,
                allergy: user.allergy_trigger,
                token: token,
                is_admin: false
            });
        } else {
            res.status(401).json({ detail: "Invalid login" });
        }
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ detail: "Server Error" });
    }
});

// 3. STATS
app.get('/stats/summary', async (req, res) => {
    try {
        const [[countResult]] = await pool.execute('SELECT COUNT(*) AS total_users FROM users');
        res.json({
            total_users: countResult.total_users
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ detail: 'Unable to load stats' });
    }
});

// 4. GET PROFILE 
app.get('/user/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT username, first_name, last_name, email, phone, age, allergy_trigger, created_at FROM users WHERE user_id = ?',
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ detail: "User not found" });
        
        const user = rows[0];
        res.json({
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email, 
            phone: user.phone, 
            age: user.age,
            allergy: user.allergy_trigger,
            joined_date: new Date(user.created_at).toISOString().split('T')[0]
        });
    } catch (err) { console.error(err); res.status(500).send(); }
});

// 5. GET RECIPES
app.get('/recipes/:id', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute('SELECT allergy_trigger FROM users WHERE user_id = ?', [req.params.id]);
        if (users.length === 0) return res.status(404).send();
        const userAllergy = users[0].allergy_trigger;

        const [recipes] = await pool.execute('SELECT title, contains_allergens, image_placeholder FROM recipes');
        
        const safeRecipes = recipes
            .filter(r => isSafe(userAllergy, r.contains_allergens))
            .map(r => ({
                title: r.title,
                tags: `Safe (No ${userAllergy})`,
                icon: r.image_placeholder
            }));
            
        res.json(safeRecipes);
    } catch (err) { console.error(err); res.status(500).send(); }
});

// 6. GET PRODUCTS
app.get('/products/:id', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute('SELECT allergy_trigger FROM users WHERE user_id = ?', [req.params.id]);
        if (users.length === 0) return res.status(404).send();
        const userAllergy = users[0].allergy_trigger;

        const [products] = await pool.execute('SELECT name, shop, price, contains_allergens FROM products');
        
        const safeProducts = products
            .filter(p => isSafe(userAllergy, p.contains_allergens))
            .map(p => ({
                name: p.name,
                shop: p.shop,
                price: p.price
            }));
            
        res.json(safeProducts);
    } catch (err) { console.error(err); res.status(500).send(); }
});

// 7. PERSONAL JOURNAL - ADD RECIPE
app.post('/my-recipes/add', authenticateToken, async (req, res) => {
    const { user_id, title, ingredients, instructions } = req.body;
    try {
        await pool.execute(
            'INSERT INTO personal_recipes (user_id, title, ingredients, instructions) VALUES (?, ?, ?, ?)',
            [user_id, title, ingredients, instructions]
        );
        
        logActivity(user_id, 'ADD_RECIPE', `Title: ${title}`);
        res.json({ message: "Saved" });
    } catch (err) {
        console.error(err);
        res.status(500).send();
    }
});

// GET PERSONAL RECIPES
app.get('/my-recipes/:id', authenticateToken, async (req, res) => {
    const [rows] = await pool.execute(
        'SELECT title, ingredients, instructions, created_at FROM personal_recipes WHERE user_id = ? ORDER BY created_at DESC',
        [req.params.id]
    );
    res.json(rows.map(r => ({
        title: r.title,
        ingredients: r.ingredients,
        instructions: r.instructions,
        date: new Date(r.created_at).toISOString().split('T')[0]
    })));
});

// 8. PERSONAL JOURNAL - ADD PRODUCT
app.post('/my-products/add', authenticateToken, async (req, res) => {
    const { user_id, product_name, shop, safety_status, notes } = req.body;
    try {
        await pool.execute(
            'INSERT INTO personal_products (user_id, product_name, shop, safety_status, notes) VALUES (?, ?, ?, ?, ?)',
            [user_id, product_name, shop, safety_status, notes]
        );
        
        logActivity(user_id, 'ADD_PRODUCT', `Product: ${product_name} (${safety_status})`);
        res.json({ message: "Saved" });
    } catch (err) {
        console.error(err);
        res.status(500).send();
    }
});

// GET PERSONAL PRODUCTS
app.get('/my-products/:id', authenticateToken, async (req, res) => {
    const [rows] = await pool.execute(
        'SELECT product_name, shop, safety_status, notes, created_at FROM personal_products WHERE user_id = ? ORDER BY created_at DESC',
        [req.params.id]
    );
    res.json(rows.map(r => ({
        name: r.product_name,
        shop: r.shop,
        status: r.safety_status,
        notes: r.notes,
        date: new Date(r.created_at).toISOString().split('T')[0]
    })));
});

// 9. CONTACT FORM
app.post('/contact', async (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ detail: "Please fill in all fields" });
    }
    try {
        await pool.execute(
            'INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)',
            [name, email, message]
        );
        res.json({ message: "Message received" });
    } catch (err) {
        console.error("Contact Error:", err);
        res.status(500).json({ detail: "Server error. Please try again later." });
    }
});

// 10. AI CHAT 
app.post('/chat', authenticateToken, async (req, res) => {
    try {
        const { user_id, message } = req.body;
        if (!user_id || !message) return res.status(400).json({ detail: "Missing info." });

        const [users] = await pool.execute('SELECT first_name, allergy_trigger FROM users WHERE user_id = ?', [user_id]);
        if (users.length === 0) return res.status(404).json({ detail: "User not found." });

        const user = users[0];
       
        const aiReply = await internalChat(message, user.allergy_trigger, user.first_name);
        res.json({ reply: aiReply });

    } catch (err) {
        console.error("AI Chat Error:", err);
        res.status(500).json({ detail: "Failed to process AI request." });
    }
});
// --- ADMIN ROUTES ---

// GET ALL USERS (Admin Route)
app.get('/admin/users', async (req, res) => {
    if (!requireAdminKey(req, res)) return;
    try {
        const [rows] = await pool.execute(
            'SELECT user_id, username, first_name, last_name, email, phone, age, allergy_trigger, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (err) {
        console.error('Admin list error:', err);
        res.status(500).json({ detail: 'Server error' });
    }
});

app.post('/admin/users', async (req, res) => {
    if (!requireAdminKey(req, res)) return;
    const { username, password, first_name, last_name, age, allergy_trigger } = req.body;
    if (!username || !password || !first_name || !last_name) {
        return res.status(400).json({ detail: 'Missing required fields' });
    }
    try {
        await pool.execute(
            'INSERT INTO users (username, password, first_name, last_name, age, allergy_trigger) VALUES (?, ?, ?, ?, ?, ?)',
            [username, password, first_name, last_name, age ?? null, allergy_trigger ?? null]
        );
        res.json({ message: 'User created' });
    } catch (err) {
        console.error('Admin create error:', err);
        res.status(400).json({ detail: 'Unable to create user' });
    }
});

app.put('/admin/users/:id', async (req, res) => {
    if (!requireAdminKey(req, res)) return;
    const userId = req.params.id;
    const allowedFields = ['username', 'password', 'first_name', 'last_name', 'age', 'allergy_trigger'];
    const updates = [];
    const values = [];

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            updates.push(`${field} = ?`);
            values.push(req.body[field]);
        }
    });

    if (updates.length === 0) {
        return res.status(400).json({ detail: 'No fields to update' });
    }

    try {
        values.push(userId);
        const [result] = await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`, values);
        if (result.affectedRows === 0) {
            return res.status(404).json({ detail: 'User not found' });
        }
        res.json({ message: 'User updated' });
    } catch (err) {
        console.error('Admin update error:', err);
        res.status(400).json({ detail: 'Unable to update user' });
    }
});

app.delete('/admin/users/:id', async (req, res) => {
    if (!requireAdminKey(req, res)) return;
    
    const userId = req.params.id;

    try {
        await pool.execute('DELETE FROM user_logs WHERE user_id = ?', [userId]);
        await pool.execute('DELETE FROM personal_recipes WHERE user_id = ?', [userId]);
        await pool.execute('DELETE FROM personal_products WHERE user_id = ?', [userId]);
        const [result] = await pool.execute('DELETE FROM users WHERE user_id = ?', [userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ detail: 'User not found' });
        }
        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error('Admin delete error:', err);
        res.status(400).json({ detail: 'Unable to delete user. Check server logs.' });
    }
});

// GET MESSAGES (Admin Protected)
app.get('/admin/messages', async (req, res) => {
    if (!requireAdminKey(req, res)) return;
    try {
        const [rows] = await pool.execute('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error('Admin messages error:', err);
        res.status(500).json({ detail: 'Server error' });
    }
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(` http://127.0.0.1:${PORT} is running`); 
});