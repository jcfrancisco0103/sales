require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3020;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple session storage using cookies (works with serverless)
const SESSION_SECRET = process.env.SESSION_SECRET || 'sales-app-secret-key-change-in-production';
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;

app.use(cookieParser(SESSION_SECRET));

// Session middleware - store user data in signed cookie
app.use((req, res, next) => {
  req.session = req.signedCookies.sessionData ? JSON.parse(req.signedCookies.sessionData) : {};
  
  // Helper to save session
  req.saveSession = (data) => {
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      signed: true
    };
    res.cookie('sessionData', JSON.stringify(data), cookieOptions);
    req.session = data;
  };
  
  // Helper to destroy session
  req.destroySession = () => {
    res.clearCookie('sessionData');
    req.session = {};
  };
  
  next();
});

// Database setup
// On Vercel, use /tmp directory which is writable (but not persistent)
// For local development, use ./sales.db
const dbPath = process.env.VERCEL ? '/tmp/sales.db' : './sales.db';

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    console.error('Database path:', dbPath);
  } else {
    console.log('Connected to SQLite database:', dbPath);
    // Enable WAL mode for better concurrency
    db.run('PRAGMA journal_mode = WAL;', (err) => {
      if (err) {
        console.log('Note: WAL mode not available (this is OK)');
      }
    });
    // Initialize asynchronously to avoid blocking
    setImmediate(() => {
      initializeDatabase();
    });
  }
});

// Track initialization state
let dbInitialized = false;
let dbInitializing = false;

function initializeDatabase() {
  if (dbInitialized || dbInitializing) {
    return;
  }
  
  if (!db) {
    console.error('Cannot initialize database: db connection is null');
    dbInitializing = false;
    return;
  }
  
  dbInitializing = true;
  
  console.log('Initializing database...');
  
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
      dbInitializing = false;
      return;
    }
    
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
    )`, (err) => {
      if (err) {
        console.error('Error creating sales table:', err);
        dbInitializing = false;
        return;
      }
      
      // Try to add columns (ignore if they exist)
      db.run(`ALTER TABLE sales ADD COLUMN date_expiry TEXT`, () => {});
      db.run(`ALTER TABLE sales ADD COLUMN duration TEXT`, () => {});
      
      // Mark as initialized immediately - don't wait for system user
      dbInitialized = true;
      dbInitializing = false;
      console.log('Database initialization complete');
      
      // Create system user asynchronously (non-blocking)
      setImmediate(() => {
        db.get('SELECT id FROM users WHERE username = ?', ['system'], (err, user) => {
          if (err) {
            console.error('Error checking for system user:', err);
          } else if (!user) {
            // Create system user with a random password (won't be used for login)
            bcrypt.hash('system-user-' + Date.now(), 10, (err, hash) => {
              if (err) {
                console.error('Error hashing system user password:', err);
              } else {
                db.run('INSERT INTO users (username, password) VALUES (?, ?)', ['system', hash], (err) => {
                  if (err) {
                    console.error('Error creating system user:', err);
                  } else {
                    console.log('System user created for automated orders');
                  }
                });
              }
            });
          }
        });
      });
    });
  });
}

// Ensure database is initialized before handling requests
function ensureDbInitialized(req, res, next) {
  if (dbInitialized) {
    return next();
  }
  
  if (!dbInitializing) {
    // Start initialization if not already started
    initializeDatabase();
  }
  
  // Wait for initialization with shorter timeout
  let attempts = 0;
  const maxAttempts = 10; // 1 second max wait (should be very fast now)
  
  const checkInitialized = () => {
    attempts++;
    if (dbInitialized) {
      return next();
    }
    if (attempts >= maxAttempts) {
      console.error('Database initialization timeout after', attempts * 100, 'ms');
      // Still proceed - let the request handler deal with it
      // This prevents infinite waiting
      return next();
    }
    setTimeout(checkInitialized, 100);
  };
  
  checkInitialized();
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// API Key authentication middleware for automated order creation
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.body.apiKey;
  const expectedApiKey = process.env.SALES_API_KEY;
  
  if (!expectedApiKey) {
    console.error('SALES_API_KEY not configured in environment variables');
    return res.status(500).json({ error: 'API key authentication not configured' });
  }
  
  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

// API Routes

// Register
app.post('/api/register', ensureDbInitialized, async (req, res) => {
  console.log('Register endpoint called');
  const { username, password, repeatPassword } = req.body;
  console.log('Register request body:', { username, hasPassword: !!password, hasRepeatPassword: !!repeatPassword });

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
app.post('/api/login', ensureDbInitialized, (req, res) => {
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
        // Save session data to signed cookie
        req.saveSession({
          userId: user.id,
          username: user.username
        });
        
        console.log('Session saved:', {
          userId: user.id,
          username: user.username
        });
        
        res.json({ success: true, username: user.username });
      } else {
        res.status(401).json({ error: 'Invalid username or password' });
      }
    } catch (error) {
      console.error('Error in login:', error);
      res.status(500).json({ error: 'Error comparing passwords' });
    }
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.destroySession();
  res.json({ success: true });
});

// Check session
app.get('/api/session', (req, res) => {
  const sessionData = req.session || {};
  console.log('Session check:', {
    hasSession: !!req.session,
    sessionData: sessionData,
    userId: sessionData.userId,
    username: sessionData.username,
    cookies: req.signedCookies
  });
  
  if (sessionData.userId) {
    res.json({ authenticated: true, username: sessionData.username });
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
    const ownerSalary = totalAmount * 0.35;
    const developerSalary = totalAmount * 0.35;
    const advertiserSalary = totalAmount * 0.25;

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

// Create sale (automated - for order integration)
app.post('/api/sales/auto', requireApiKey, (req, res) => {
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

  console.log('Received automated sale data:', {
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

  // Get system user ID for automated orders
  db.get('SELECT id FROM users WHERE username = ?', ['system'], (err, systemUser) => {
    if (err) {
      console.error('Error fetching system user:', err);
      return res.status(500).json({ error: 'Error fetching system user: ' + err.message });
    }
    
    if (!systemUser) {
      return res.status(500).json({ error: 'System user not found. Please restart the server to create it.' });
    }
    
    db.run(
      `INSERT INTO sales (date_bought, duration, date_expiry, customer_name, plan, cpu, ram, disk, amount, payment_method, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date_bought, duration || null, date_expiry || null, customer_name, plan, cpu, ram, disk, amount, payment_method, status, systemUser.id],
    function(err) {
      if (err) {
        console.error('Error creating automated sale:', err);
        return res.status(500).json({ error: 'Error creating sale: ' + err.message });
      }
      console.log('Automated sale created successfully:', {
        id: this.lastID,
        date_bought,
        date_expiry,
        duration
      });
      res.json({ success: true, id: this.lastID });
    }
    );
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

// Renew sale
app.post('/api/sales/:id/renew', requireAuth, (req, res) => {
  const { id } = req.params;

  // Get the current sale to find duration and current expiry
  db.get('SELECT duration, date_expiry FROM sales WHERE id = ?', [id], (err, sale) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching sale' });
    }
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (!sale.duration) {
      return res.status(400).json({ error: 'Cannot renew: Duration not set for this sale' });
    }

    // Calculate new expiry date
    let newExpiryDate;
    const today = new Date();
    
    // Use current expiry date if it exists and is in the future, otherwise use today
    let baseDate = today;
    if (sale.date_expiry) {
      const expiryDate = new Date(sale.date_expiry);
      if (expiryDate > today) {
        baseDate = expiryDate;
      }
    }

    const newExpiry = new Date(baseDate);

    // Add duration to the base date
    switch (sale.duration) {
      case '1 month':
        newExpiry.setMonth(newExpiry.getMonth() + 1);
        break;
      case '6 Months':
        newExpiry.setMonth(newExpiry.getMonth() + 6);
        break;
      case '1 Year':
        newExpiry.setFullYear(newExpiry.getFullYear() + 1);
        break;
      default:
        return res.status(400).json({ error: 'Invalid duration' });
    }

    // Format as YYYY-MM-DD
    const year = newExpiry.getFullYear();
    const month = String(newExpiry.getMonth() + 1).padStart(2, '0');
    const day = String(newExpiry.getDate()).padStart(2, '0');
    newExpiryDate = `${year}-${month}-${day}`;

    // Update the sale with new expiry date
    db.run(
      'UPDATE sales SET date_expiry = ? WHERE id = ?',
      [newExpiryDate, id],
      function(updateErr) {
        if (updateErr) {
          console.error('Error renewing sale:', updateErr);
          return res.status(500).json({ error: 'Error renewing sale: ' + updateErr.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Sale not found' });
        }
        console.log('Sale renewed successfully:', {
          id,
          oldExpiry: sale.date_expiry,
          newExpiry: newExpiryDate,
          duration: sale.duration
        });
        res.json({ success: true, newExpiry: newExpiryDate });
      }
    );
  });
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

// Serve sales.html
app.get('/sales.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sales.html'));
});

// Start server (only if not in serverless environment)
if (process.env.VERCEL !== '1') {
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
}

// Export for Vercel serverless
module.exports = app;
