const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3020;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: 'sales-app-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Database setup
const db = new sqlite3.Database('./sales.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Sales table
  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_bought TEXT NOT NULL,
    date_expiry TEXT,
    duration TEXT,
    customer_name TEXT NOT NULL,
    plan TEXT NOT NULL,
    cpu TEXT NOT NULL,
    ram TEXT NOT NULL,
    disk TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Paid', 'Pending')),
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  // Add new columns to existing table if they don't exist (ignore errors if columns already exist)
  db.run(`ALTER TABLE sales ADD COLUMN date_expiry TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('Note: date_expiry column may already exist');
    }
  });
  db.run(`ALTER TABLE sales ADD COLUMN duration TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('Note: duration column may already exist');
    }
  });
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// API Routes

// Register
app.post('/api/register', async (req, res) => {
  const { username, password, repeatPassword } = req.body;

  if (!username || !password || !repeatPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (password !== repeatPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ error: 'Username already exists' });
          }
          return res.status(500).json({ error: 'Error creating user' });
        }
        res.json({ success: true, message: 'User created successfully' });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Error hashing password' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    try {
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ success: true, username: user.username });
      } else {
        res.status(401).json({ error: 'Invalid username or password' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Error comparing passwords' });
    }
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check session
app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    res.json({ authenticated: true, username: req.session.username });
  } else {
    res.json({ authenticated: false });
  }
});

// Get all sales
app.get('/api/sales', requireAuth, (req, res) => {
  const { month, year } = req.query;
  
  let query = `
    SELECT s.*, u.username as created_by_username 
    FROM sales s 
    JOIN users u ON s.created_by = u.id
  `;
  const params = [];

  if (month && year) {
    query += ' WHERE strftime("%m", date_bought) = ? AND strftime("%Y", date_bought) = ?';
    params.push(month.padStart(2, '0'), year);
  }

  query += ' ORDER BY date_bought DESC, created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching sales:', err);
      return res.status(500).json({ error: 'Error fetching sales' });
    }
    // Log first row to debug
    if (rows.length > 0) {
      console.log('Sample sale data returned:', {
        id: rows[0].id,
        date_bought: rows[0].date_bought,
        date_expiry: rows[0].date_expiry,
        duration: rows[0].duration
      });
    }
    res.json(rows);
  });
});

// Get sales statistics
app.get('/api/statistics', requireAuth, (req, res) => {
  const { month, year } = req.query;
  
  let whereClause = '';
  const params = [];

  if (month && year) {
    whereClause = ' WHERE strftime("%m", date_bought) = ? AND strftime("%Y", date_bought) = ?';
    params.push(month.padStart(2, '0'), year);
  }

  const query = `
    SELECT 
      COUNT(*) as total_sales,
      SUM(amount) as total_amount,
      SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END) as paid_amount,
      SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END) as pending_amount,
      COUNT(CASE WHEN status = 'Paid' THEN 1 END) as paid_sales
    FROM sales
    ${whereClause}
  `;

  db.get(query, params, (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching statistics' });
    }

    const totalAmount = row.total_amount || 0;
    const ownerSalary = totalAmount * 0.30;
    const developerSalary = totalAmount * 0.30;
    const advertiserSalary = totalAmount * 0.20;

    res.json({
      totalSales: row.total_sales || 0,
      totalAmount: totalAmount,
      paidAmount: row.paid_amount || 0,
      pendingAmount: row.pending_amount || 0,
      paidSales: row.paid_sales || 0,
      salaries: {
        owner: ownerSalary,
        developer: developerSalary,
        advertiser: advertiserSalary
      }
    });
  });
});

// Create sale
app.post('/api/sales', requireAuth, (req, res) => {
  const {
    date_bought,
    duration,
    date_expiry,
    customer_name,
    plan,
    cpu,
    ram,
    disk,
    amount,
    payment_method,
    status
  } = req.body;

  console.log('Received sale data:', {
    date_bought,
    duration,
    date_expiry,
    customer_name,
    plan
  });

  if (!date_bought || !customer_name || !plan || !cpu || !ram || !disk || !amount || !payment_method || !status) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (status !== 'Paid' && status !== 'Pending') {
    return res.status(400).json({ error: 'Status must be Paid or Pending' });
  }

  db.run(
    `INSERT INTO sales (date_bought, duration, date_expiry, customer_name, plan, cpu, ram, disk, amount, payment_method, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [date_bought, duration || null, date_expiry || null, customer_name, plan, cpu, ram, disk, amount, payment_method, status, req.session.userId],
    function(err) {
      if (err) {
        console.error('Error creating sale:', err);
        return res.status(500).json({ error: 'Error creating sale: ' + err.message });
      }
      console.log('Sale created successfully:', {
        id: this.lastID,
        date_bought,
        date_expiry,
        duration
      });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Update sale
app.put('/api/sales/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const {
    date_bought,
    duration,
    date_expiry,
    customer_name,
    plan,
    cpu,
    ram,
    disk,
    amount,
    payment_method,
    status
  } = req.body;

  console.log('Updating sale:', {
    id,
    date_bought,
    duration,
    date_expiry,
    customer_name
  });

  if (!date_bought || !customer_name || !plan || !cpu || !ram || !disk || !amount || !payment_method || !status) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  db.run(
    `UPDATE sales SET date_bought = ?, duration = ?, date_expiry = ?, customer_name = ?, plan = ?, cpu = ?, ram = ?, disk = ?, 
     amount = ?, payment_method = ?, status = ? WHERE id = ?`,
    [date_bought, duration || null, date_expiry || null, customer_name, plan, cpu, ram, disk, amount, payment_method, status, id],
    function(err) {
      if (err) {
        console.error('Error updating sale:', err);
        return res.status(500).json({ error: 'Error updating sale: ' + err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Sale not found' });
      }
      console.log('Sale updated successfully:', {
        id,
        date_expiry,
        changes: this.changes
      });
      res.json({ success: true });
    }
  );
});

// Delete sale
app.delete('/api/sales/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM sales WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error deleting sale' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    res.json({ success: true });
  });
});

// Get available months/years for filtering
app.get('/api/sales/months', requireAuth, (req, res) => {
  db.all(
    `SELECT DISTINCT 
      strftime("%Y", date_bought) as year,
      strftime("%m", date_bought) as month,
      strftime("%Y-%m", date_bought) as year_month
    FROM sales 
    ORDER BY year DESC, month DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching months' });
      }
      res.json(rows);
    }
  );
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});
