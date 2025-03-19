const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 10000;
const secret = 'your_jwt_secret'; // Replace with a secure secret in production

// Middleware
app.use(express.json());
app.use(express.static('public'));

// SQLite Database Setup
const db = new sqlite3.Database('./pool_service.db', (err) => {
    if (err) console.error('Database connection error:', err);
    else console.log('Connected to SQLite database');
});

// Initialize Database Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        phone TEXT,
        address TEXT,
        pool_size INTEGER,
        additional_info TEXT,
        type TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        reset_token TEXT,
        access_code TEXT,
        lock_combo TEXT,
        dogs TEXT,
        access_side TEXT,
        is_active INTEGER DEFAULT 1  -- 1 for active, 0 for inactive
    )`);

    // Other tables (assignments, service_logs, customer_service_plans, invoices) remain unchanged
    db.run(`CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER,
        user_id INTEGER,
        date_assigned TEXT,
        FOREIGN KEY(employee_id) REFERENCES users(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS service_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        employee_id INTEGER,
        date TEXT,
        before_photo TEXT,
        after_photo TEXT,
        free_chlorine REAL,
        ph REAL,
        total_alkalinity REAL,
        stabilizer REAL,
        calcium_hardness REAL,
        water_temp REAL,
        netted INTEGER,
        brushed INTEGER,
        cleaned_filter INTEGER,
        chemicals_added TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(employee_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS customer_service_plans (
        user_id INTEGER PRIMARY KEY,
        service_frequency TEXT CHECK(service_frequency IN ('weekly', 'bi-weekly', 'monthly')) NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        amount_due REAL NOT NULL,
        amount_paid REAL DEFAULT 0,
        issue_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        last_payment_date TEXT,
        status TEXT CHECK(status IN ('pending', 'paid', 'overdue')) DEFAULT 'pending',
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});


// Insert Admin User (corrected)
db.get(`SELECT * FROM users WHERE email = ?`, ['kameronquick@gmail.com'], async (err, row) => {
    if (err) {
        console.error('Error checking admin user:', err.message);
        return;
    }
    if (!row) {
        const hashedPassword = await bcrypt.hash('Pw10010012', 10);
        db.run(
            `INSERT INTO users (name, email, phone, password, address, pool_size, additional_info, type, is_admin)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ['Admin User', 'kameronquick@gmail.com', '480-584-2843', hashedPassword, '123 Admin St, Phoenix, AZ', 0, 'Admin account', 'user', 1],
            (err) => {
                if (err) console.error('Admin Insert Error:', err.message);
                else console.log('Admin user created: kameronquick@gmail.com / Pw10010012');
            }
        );
    } else {
        console.log('Admin user already exists: kameronquick@gmail.com');
    }
});

// File Upload Setup
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => {
        cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

// Helper Functions
function generateToken(user) {
    return jwt.sign({ id: user.id, email: user.email, type: user.type, is_admin: user.is_admin }, secret, { expiresIn: '1h' });
}



// Helper to generate invoice number
function generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE ?', [`INV-${year}-%`], (err, row) => {
            if (err) return reject(err);
            const count = row.count + 1;
            resolve(`INV-${year}-${String(count).padStart(4, '0')}`);
        });
    });
}

// Helper to calculate billing amount based on frequency
function getBillingAmount(frequency) {
    switch (frequency) {
        case 'weekly': return 125;
        case 'bi-weekly': return 100;
        case 'monthly': return 75;
        default: return 0;
    }
}

// Helper to calculate due date based on frequency
function getDueDate(issueDate, frequency) {
    const due = new Date(issueDate);
    switch (frequency) {
        case 'weekly': due.setDate(due.getDate() + 7); break;
        case 'bi-weekly': due.setDate(due.getDate() + 14); break;
        case 'monthly': due.setMonth(due.getMonth() + 1); break;
    }
    return due.toISOString().split('T')[0];
}

// Endpoint to assign service plan to a customer
app.post('/assign-service-plan', (req, res) => {
    const { user_id, service_frequency } = req.body;
    db.run(
        'INSERT OR REPLACE INTO customer_service_plans (user_id, service_frequency) VALUES (?, ?)',
        [user_id, service_frequency],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// Endpoint to generate invoices (run periodically, e.g., via cron job)
app.post('/generate-invoices', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    try {
        const customers = await new Promise((resolve, reject) => {
            db.all('SELECT u.id, csp.service_frequency FROM users u LEFT JOIN customer_service_plans csp ON u.id = csp.user_id WHERE u.type = "user" AND u.is_admin = 0', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        for (const customer of customers) {
            if (!customer.service_frequency) continue; // Skip if no plan assigned
            const invoiceNumber = await generateInvoiceNumber();
            const amountDue = getBillingAmount(customer.service_frequency);
            const dueDate = getDueDate(today, customer.service_frequency);

            db.run(
                'INSERT INTO invoices (invoice_number, user_id, amount_due, issue_date, due_date) VALUES (?, ?, ?, ?, ?)',
                [invoiceNumber, customer.id, amountDue, today, dueDate],
                (err) => {
                    if (err) console.error(`Error generating invoice for user ${customer.id}:`, err.message);
                }
            );
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to record payment
app.post('/record-payment', (req, res) => {
    const { invoice_id, amount_paid } = req.body;
    const lastPaymentDate = new Date().toISOString().split('T')[0];
    db.run(
        'UPDATE invoices SET amount_paid = amount_paid + ?, last_payment_date = ?, status = CASE WHEN amount_paid + ? >= amount_due THEN "paid" ELSE "pending" END WHERE id = ?',
        [amount_paid, lastPaymentDate, amount_paid, invoice_id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Invoice not found' });
            res.json({ success: true });
        }
    );
});

// Routes

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = generateToken(user);
        res.json({ ...user, token, is_active: user.is_active === 1 });
    });
});

app.post('/create-employee', async (req, res) => {
    const { email, password, name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
        'INSERT INTO users (name, email, password, type) VALUES (?, ?, ?, ?)',
        [name, email, hashedPassword, 'employee'],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.post('/create-customer', async (req, res) => {
    const { name, email, phone, address, pool_size, additional_info, access_code, lock_combo, dogs, access_side, service_frequency } = req.body;
    const reset_token = uuidv4();
    db.run(
        `INSERT INTO users (name, email, phone, address, pool_size, additional_info, type, reset_token, access_code, lock_combo, dogs, access_side, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, email, phone, address, pool_size, additional_info, 'user', reset_token, access_code, lock_combo, dogs, access_side, 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            const userId = this.lastID;
            db.run(
                'INSERT OR REPLACE INTO customer_service_plans (user_id, service_frequency) VALUES (?, ?)',
                [userId, service_frequency],
                (err) => {
                    if (err) console.error(`Error assigning service plan for user ${userId}:`, err.message);
                }
            );
            const link = `http://localhost:${port}/set-password.html?token=${reset_token}`;
            res.json({ success: true, link });
        }
    );
});

app.post('/set-password', async (req, res) => {
    const { token, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
        'UPDATE users SET password = ?, reset_token = NULL WHERE reset_token = ?',
        [hashedPassword, token],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(400).json({ error: 'Invalid or expired token' });
            res.json({ success: true });
        }
    );
});

app.post('/update-customer-notes', (req, res) => {
    const { user_id, additional_info } = req.body;
    db.run(
        'UPDATE users SET additional_info = ? WHERE id = ?',
        [additional_info, user_id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
            res.json({ success: true });
        }
    );
});

app.post('/update-customer-info', (req, res) => {
    const { user_id, phone, access_code, lock_combo, dogs, access_side, additional_info } = req.body;
    db.run(
        `UPDATE users 
         SET phone = ?, access_code = ?, lock_combo = ?, dogs = ?, access_side = ?, additional_info = ? 
         WHERE id = ?`,
        [phone, access_code, lock_combo, dogs, access_side, additional_info, user_id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
            res.json({ success: true });
        }
    );
});

// Analytics endpoint
app.get('/analytics', (req, res) => {
    Promise.all([
        // Total Revenue (sum of amount_paid)
        new Promise((resolve, reject) => {
            db.get('SELECT SUM(amount_paid) as total_revenue FROM invoices', [], (err, row) => {
                if (err) reject(err);
                else resolve(row.total_revenue || 0);
            });
        }),
        // Total Chemicals Used (aggregate from service_logs)
        new Promise((resolve, reject) => {
            db.all('SELECT chemicals_added FROM service_logs WHERE chemicals_added IS NOT NULL', [], (err, rows) => {
                if (err) reject(err);
                else {
                    const chemicalSummary = {};
                    rows.forEach(row => {
                        if (row.chemicals_added) {
                            row.chemicals_added.split('\n').forEach(line => {
                                const match = line.match(/Add ([\d.]+) lbs (\w+)/);
                                if (match) {
                                    const amount = parseFloat(match[1]);
                                    const chemical = match[2];
                                    chemicalSummary[chemical] = (chemicalSummary[chemical] || 0) + amount;
                                }
                            });
                        }
                    });
                    resolve(chemicalSummary);
                }
            });
        }),
        // Total Owed Balances (sum of amount_due - amount_paid where status != 'paid')
        new Promise((resolve, reject) => {
            db.get('SELECT SUM(amount_due - amount_paid) as total_owed FROM invoices WHERE status != "paid"', [], (err, row) => {
                if (err) reject(err);
                else resolve(row.total_owed || 0);
            });
        }),
        // Invoice Details
        new Promise((resolve, reject) => {
            db.all(
                `SELECT i.*, u.name AS customer_name 
                 FROM invoices i 
                 JOIN users u ON i.user_id = u.id 
                 ORDER BY i.issue_date DESC`,
                [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        })
    ])
    .then(([totalRevenue, chemicalsUsed, totalOwed, invoices]) => {
        res.json({
            total_revenue: totalRevenue,
            chemicals_used: chemicalsUsed,
            total_owed: totalOwed,
            invoices: invoices
        });
    })
    .catch(error => res.status(500).json({ error: error.message }));
});


app.get('/customers', (req, res) => {
    db.all(
        `SELECT u.*, a.employee_id AS assigned_employee_id 
         FROM users u 
         LEFT JOIN assignments a ON u.id = a.user_id 
         WHERE u.type = "user" AND u.is_admin = 0`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows.map(row => ({
                ...row,
                is_active: row.is_active === 1 // Convert to boolean
            })));
        }
    );
});

app.get('/employees', (req, res) => {
    db.all('SELECT * FROM users WHERE type = "employee"', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/assign-pool', (req, res) => {
    const { employee_id, user_id } = req.body;
    const date_assigned = new Date().toISOString().split('T')[0];
    db.run(
        'INSERT INTO assignments (employee_id, user_id, date_assigned) VALUES (?, ?, ?)',
        [employee_id, user_id, date_assigned],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.post('/unassign-pool', (req, res) => {
    const { employee_id, user_id } = req.body;
    db.run(
        'DELETE FROM assignments WHERE employee_id = ? AND user_id = ?',
        [employee_id, user_id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Assignment not found' });
            res.json({ success: true });
        }
    );
});

app.get('/today-pools/:employeeId', (req, res) => {
    const { employeeId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    db.all(
        'SELECT u.* FROM users u JOIN assignments a ON u.id = a.user_id WHERE a.employee_id = ? AND a.date_assigned = ?',
        [employeeId, today],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/assigned-customers/:employeeId', (req, res) => {
    const { employeeId } = req.params;
    db.all(
        'SELECT u.* FROM users u JOIN assignments a ON u.id = a.user_id WHERE a.employee_id = ?',
        [employeeId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/service-logs/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(
        'SELECT * FROM service_logs WHERE user_id = ? ORDER BY date DESC',
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/employee-completed-jobs/:employeeId', (req, res) => {
    const { employeeId } = req.params;
    db.all(
        'SELECT sl.*, u.name AS customer_name FROM service_logs sl JOIN users u ON sl.user_id = u.id WHERE sl.employee_id = ? ORDER BY sl.date DESC',
        [employeeId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/completed-jobs', (req, res) => {
    db.all(
        'SELECT sl.*, u1.name AS employee_name, u2.name AS customer_name FROM service_logs sl JOIN users u1 ON sl.employee_id = u1.id JOIN users u2 ON sl.user_id = u2.id ORDER BY sl.date DESC',
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/service-log/:logId', (req, res) => {
    const { logId } = req.params;
    db.get(
        'SELECT sl.*, u.name AS customer_name FROM service_logs sl JOIN users u ON sl.user_id = u.id WHERE sl.id = ?',
        [logId],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Service log not found' });
            res.json(row);
        }
    );
});

app.post('/service-log', upload.fields([{ name: 'before_photo' }, { name: 'after_photo' }]), (req, res) => {
    const {
        user_id, employee_id, free_chlorine, ph, total_alkalinity, stabilizer, calcium_hardness, water_temp,
        netted, brushed, cleaned_filter, chemicals_added
    } = req.body;
    const before_photo = req.files.before_photo ? `/uploads/${req.files.before_photo[0].filename}` : null;
    const after_photo = req.files.after_photo ? `/uploads/${req.files.after_photo[0].filename}` : null;
    const date = new Date().toISOString().split('T')[0];

    db.run(
        `INSERT INTO service_logs (user_id, employee_id, date, before_photo, after_photo, free_chlorine, ph, total_alkalinity, stabilizer, calcium_hardness, water_temp, netted, brushed, cleaned_filter, chemicals_added)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user_id, employee_id, date, before_photo, after_photo, free_chlorine, ph, total_alkalinity, stabilizer, calcium_hardness, water_temp, netted, brushed, cleaned_filter, chemicals_added],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.post('/update-service-log', upload.fields([{ name: 'before_photo' }, { name: 'after_photo' }]), (req, res) => {
    const {
        log_id, free_chlorine, ph, total_alkalinity, stabilizer, calcium_hardness, water_temp,
        netted, brushed, cleaned_filter, chemicals_added
    } = req.body;
    const before_photo = req.files.before_photo ? `/uploads/${req.files.before_photo[0].filename}` : null;
    const after_photo = req.files.after_photo ? `/uploads/${req.files.after_photo[0].filename}` : null;

    let query = 'UPDATE service_logs SET free_chlorine = ?, ph = ?, total_alkalinity = ?, stabilizer = ?, calcium_hardness = ?, water_temp = ?, netted = ?, brushed = ?, cleaned_filter = ?, chemicals_added = ?';
    const params = [free_chlorine, ph, total_alkalinity, stabilizer, calcium_hardness, water_temp, netted, brushed, cleaned_filter, chemicals_added];

    if (before_photo) {
        query += ', before_photo = ?';
        params.push(before_photo);
    }
    if (after_photo) {
        query += ', after_photo = ?';
        params.push(after_photo);
    }
    query += ' WHERE id = ?';
    params.push(log_id);

    db.run(query, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Service log not found' });
        res.json({ success: true });
    });
});

app.post('/process-customer-payment', async (req, res) => {
    const { user_id, amount } = req.body;

    try {
        // Find unpaid invoices for the user, ordered by due date
        const invoices = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM invoices WHERE user_id = ? AND status != "paid" ORDER BY due_date ASC',
                [user_id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        if (invoices.length === 0) {
            return res.status(400).json({ error: 'No outstanding invoices found' });
        }

        let remainingPayment = amount;
        const today = new Date().toISOString().split('T')[0];

        for (const invoice of invoices) {
            if (remainingPayment <= 0) break;

            const amountOwed = invoice.amount_due - invoice.amount_paid;
            const paymentToApply = Math.min(remainingPayment, amountOwed);

            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE invoices 
                     SET amount_paid = amount_paid + ?, 
                         last_payment_date = ?, 
                         status = CASE WHEN amount_paid + ? >= amount_due THEN "paid" ELSE "pending" END 
                     WHERE id = ?`,
                    [paymentToApply, today, paymentToApply, invoice.id],
                    function (err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            remainingPayment -= paymentToApply;
        }

        res.json({ success: true, remaining: remainingPayment });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({ error: 'Failed to process payment' });
    }
});

app.get('/customer-service-logs/:userId', (req, res) => {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = 25; // Max 25 entries per page
    const offset = (page - 1) * limit;

    // Query to get total count for pagination
    db.get('SELECT COUNT(*) as total FROM service_logs WHERE user_id = ?', [userId], (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });

        const totalEntries = countRow.total;
        const totalPages = Math.ceil(totalEntries / limit);

        // Query to get paginated logs with employee name
        db.all(
            `SELECT sl.*, u.name AS employee_name 
             FROM service_logs sl 
             JOIN users u ON sl.employee_id = u.id 
             WHERE sl.user_id = ? 
             ORDER BY sl.date DESC 
             LIMIT ? OFFSET ?`,
            [userId, limit, offset],
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({
                    logs: rows,
                    currentPage: page,
                    totalPages: totalPages,
                    totalEntries: totalEntries
                });
            }
        );
    });
});

app.get('/customer-owed/:userId', (req, res) => {
    const { userId } = req.params;
    db.get(
        'SELECT SUM(amount_due - amount_paid) as total_owed FROM invoices WHERE user_id = ? AND status != "paid"',
        [userId],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ total_owed: row.total_owed || 0 });
        }
    );
});

// Start Server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
