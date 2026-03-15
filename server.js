require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

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

// Session middleware - store user data in signed cookie (works with Vercel serverless)
app.use((req, res, next) => {
  try {
    // Parse session from signed cookie
    if (req.signedCookies && req.signedCookies.sessionData) {
      try {
        req.session = JSON.parse(req.signedCookies.sessionData);
      } catch (parseError) {
        console.error('Error parsing session cookie:', parseError);
        req.session = {};
      }
    } else {
      req.session = {};
    }
  } catch (error) {
    console.error('Error reading session:', error);
    req.session = {};
  }
  
  // Helper to save session
  req.saveSession = (data) => {
    try {
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        signed: true
      };
      res.cookie('sessionData', JSON.stringify(data), cookieOptions);
      req.session = data;
    } catch (error) {
      console.error('Error saving session:', error);
    }
  };
  
  // Helper to destroy session
  req.destroySession = () => {
    try {
      res.clearCookie('sessionData', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax'
      });
      req.session = {};
    } catch (error) {
      console.error('Error destroying session:', error);
    }
  };
  
  next();
});

// Database setup — local file next to server (use DATABASE_PATH env to override)
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'sales.db');

let db = null;

function isCorruptError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';
  return code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB' || msg.includes('malformed') || msg.includes('corrupt');
}

function tryRemoveCorruptDb() {
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('Removed corrupt database file, will create fresh one:', dbPath);
    }
    // Also remove WAL and SHM if present
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  } catch (e) {
    console.error('Could not remove corrupt database file:', e.message);
  }
}

function openDatabase(retried) {
  const conn = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      if (isCorruptError(err) && !retried) {
        console.warn('Database corrupt on open:', err.message);
        conn.close(() => {
          tryRemoveCorruptDb();
          openDatabase(true);
        });
        return;
      }
      console.error('Error opening database:', err.message);
      console.error('Database path:', dbPath);
      return;
    }
    // Reduce risk of corruption: full sync, busy timeout
    conn.run('PRAGMA synchronous = FULL;', () => {});
    conn.run('PRAGMA busy_timeout = 5000;', () => {});
    conn.run('PRAGMA journal_mode = WAL;', (walErr) => {
      if (walErr) console.log('Note: WAL mode not available (this is OK)');
    });
    // Check integrity; if corrupt, close and recreate
    conn.get('PRAGMA integrity_check;', (intErr, row) => {
      if (intErr || (row && row.integrity_check !== 'ok')) {
        const reason = intErr ? intErr.message : (row ? row.integrity_check : 'unknown');
        if (!retried) {
          console.warn('Database integrity check failed:', reason);
          conn.close(() => {
            tryRemoveCorruptDb();
            openDatabase(true);
          });
          return;
        }
      }
      db = conn;
      console.log('Connected to SQLite database:', dbPath);
      setImmediate(() => initializeDatabase());
    });
  });
}

openDatabase(false);

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
      promo TEXT,
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
      
      // Add promo column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE sales ADD COLUMN promo TEXT`, (alterErr) => {
        // Ignore error if column already exists
        if (alterErr && !alterErr.message.includes('duplicate column name')) {
          console.log('Note: promo column may already exist or could not be added:', alterErr.message);
        }
      });
      
      // Try to add columns (ignore if they exist)
      db.run(`ALTER TABLE sales ADD COLUMN date_expiry TEXT`, () => {});
      db.run(`ALTER TABLE sales ADD COLUMN duration TEXT`, () => {});
      db.run(`ALTER TABLE sales ADD COLUMN no_renew INTEGER DEFAULT 0`, () => {});
      
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

// Get all sales (ensureDbInitialized so db is ready; LEFT JOIN so all rows show even if user missing)
app.get('/api/sales', ensureDbInitialized, requireAuth, (req, res) => {
  if (!db) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  const { month, year } = req.query;
  
  let query = `
    SELECT s.*, COALESCE(u.username, 'Unknown') as created_by_username 
    FROM sales s 
    LEFT JOIN users u ON s.created_by = u.id
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
    
    if (rows.length > 0) {
      console.log(`Fetched ${rows.length} sales records`);
    }
    
    res.json(rows || []);
  });
});

// Diagnostic endpoint to check database state
app.get('/api/diagnostic', requireAuth, (req, res) => {
  // Check total sales count
  db.get('SELECT COUNT(*) as count FROM sales', [], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Error checking database' });
    }
    
    // Check sales with valid user references
    db.get(`
      SELECT COUNT(*) as count 
      FROM sales s 
      JOIN users u ON s.created_by = u.id
    `, [], (err, validRow) => {
      if (err) {
        return res.status(500).json({ error: 'Error checking valid sales' });
      }
      
      res.json({
        totalSalesInDatabase: row.count || 0,
        validSalesWithUsers: validRow.count || 0,
        orphanedSales: (row.count || 0) - (validRow.count || 0)
      });
    });
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
      console.error('Error fetching statistics:', err);
      return res.status(500).json({ error: 'Error fetching statistics' });
    }

    // Ensure we have valid row data, default to 0 if null
    const totalSales = row && row.total_sales ? parseInt(row.total_sales) : 0;
    const totalAmount = row && row.total_amount ? parseFloat(row.total_amount) : 0;
    const paidAmount = row && row.paid_amount ? parseFloat(row.paid_amount) : 0;
    const pendingAmount = row && row.pending_amount ? parseFloat(row.pending_amount) : 0;
    const paidSales = row && row.paid_sales ? parseInt(row.paid_sales) : 0;

    // Fixed monthly salaries (not percentage-based)
    const ownerSalary = 1200;
    const developerSalary = 1200;
    const staffSalary = 700;

    res.json({
      totalSales: totalSales,
      totalAmount: totalAmount,
      paidAmount: paidAmount,
      pendingAmount: pendingAmount,
      paidSales: paidSales,
      salaries: {
        owner: ownerSalary,
        developer: developerSalary,
        staff: staffSalary
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
    promo,
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
      `INSERT INTO sales (date_bought, duration, date_expiry, customer_name, plan, cpu, ram, disk, amount, promo, payment_method, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date_bought, duration || null, date_expiry || null, customer_name, plan, cpu, ram, disk, amount, promo || null, payment_method, status, systemUser.id],
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
    promo,
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
    `INSERT INTO sales (date_bought, duration, date_expiry, customer_name, plan, cpu, ram, disk, amount, promo, payment_method, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [date_bought, duration || null, date_expiry || null, customer_name, plan, cpu, ram, disk, amount, promo || null, payment_method, status, req.session.userId],
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
    promo,
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
     amount = ?, promo = ?, payment_method = ?, status = ? WHERE id = ?`,
    [date_bought, duration || null, date_expiry || null, customer_name, plan, cpu, ram, disk, amount, promo || null, payment_method, status, id],
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

// Renew sale (body: { duration?: string, amount?: number } - duration required from form or existing sale)
app.post('/api/sales/:id/renew', requireAuth, (req, res) => {
  const { id } = req.params;
  const { duration: bodyDuration, amount: bodyAmount } = req.body || {};

  // Get the current sale to find duration and current expiry
  db.get('SELECT duration, date_expiry, amount FROM sales WHERE id = ?', [id], (err, sale) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching sale' });
    }
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const duration = (bodyDuration && bodyDuration.trim()) || sale.duration;
    if (!duration) {
      return res.status(400).json({ error: 'Cannot renew: Duration is required (select in form or set on sale)' });
    }

    // Calculate new expiry date
    let newExpiryDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use current expiry date if it exists and is in the future, otherwise use today
    let baseDate = today;
    if (sale.date_expiry) {
      const expiryDate = new Date(sale.date_expiry);
      expiryDate.setHours(0, 0, 0, 0);
      if (expiryDate >= today) {
        baseDate = expiryDate;
      }
    }

    const newExpiry = new Date(baseDate);

    // Add duration to the base date
    switch (duration) {
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

    const updateAmount = bodyAmount != null && bodyAmount !== '' && !isNaN(Number(bodyAmount));
    const newAmount = updateAmount ? Number(bodyAmount) : sale.amount;

    const updateSql = updateAmount
      ? 'UPDATE sales SET date_expiry = ?, duration = ?, amount = ? WHERE id = ?'
      : 'UPDATE sales SET date_expiry = ?, duration = ? WHERE id = ?';
    const updateParams = updateAmount
      ? [newExpiryDate, duration, newAmount, id]
      : [newExpiryDate, duration, id];

    db.run(updateSql, updateParams, function(updateErr) {
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
        duration
      });
      res.json({ success: true, newExpiry: newExpiryDate });
    });
  });
});

// Mark sale as "No Renew" (customer won't renew; hide from Expirations tab)
app.post('/api/sales/:id/no-renew', ensureDbInitialized, requireAuth, (req, res) => {
  if (!db) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  const id = req.params.id;

  function doUpdate() {
    db.run('UPDATE sales SET no_renew = 1 WHERE id = ?', [id], function(err) {
      if (err) {
        if (err.message && err.message.includes('no such column: no_renew')) {
          return db.run('ALTER TABLE sales ADD COLUMN no_renew INTEGER DEFAULT 0', (alterErr) => {
            if (alterErr) {
              console.error('Error adding no_renew column:', alterErr);
              return res.status(500).json({ error: 'Error updating sale' });
            }
            doUpdate();
          });
        }
        console.error('Error in no-renew:', err);
        return res.status(500).json({ error: 'Error updating sale' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Sale not found' });
      }
      res.json({ success: true });
    });
  }

  doUpdate();
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

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv' // .csv
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.'));
    }
  }
});

// Export sales to Excel
app.get('/api/sales/export', requireAuth, (req, res) => {
  console.log('Export endpoint called');
  try {
    const query = `
      SELECT 
        s.id,
        s.date_bought as "Date Bought",
        s.date_expiry as "Date Expiry",
        s.duration as "Duration",
        s.customer_name as "Customer Name",
        s.plan as "Plan",
        s.cpu as "CPU",
        s.ram as "RAM",
        s.disk as "DISK",
        s.amount as "Amount",
        s.promo as "Promo",
        s.payment_method as "Payment Method",
        s.status as "Status",
        u.username as "Created By",
        s.created_at as "Created At"
      FROM sales s 
      JOIN users u ON s.created_by = u.id
      ORDER BY s.date_bought DESC, s.created_at DESC
    `;

    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('Error exporting sales:', err);
        res.status(500).json({ error: 'Error exporting sales: ' + err.message });
        return;
      }

      try {
        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows || []);

        // Set column widths
        const colWidths = [
          { wch: 10 }, // ID
          { wch: 15 }, // Date Bought
          { wch: 15 }, // Date Expiry
          { wch: 12 }, // Duration
          { wch: 20 }, // Customer Name
          { wch: 20 }, // Plan
          { wch: 12 }, // CPU
          { wch: 10 }, // RAM
          { wch: 10 }, // DISK
          { wch: 12 }, // Amount
          { wch: 10 }, // Promo
          { wch: 15 }, // Payment Method
          { wch: 10 }, // Status
          { wch: 15 }, // Created By
          { wch: 20 }  // Created At
        ];
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, 'Sales');

        // Generate buffer
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Set headers for download
        const filename = `sales_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
      } catch (xlsxError) {
        console.error('Error creating Excel file:', xlsxError);
        res.status(500).json({ error: 'Error creating Excel file: ' + xlsxError.message });
      }
    });
  } catch (error) {
    console.error('Error in export endpoint:', error);
    res.status(500).json({ error: 'Error exporting sales: ' + error.message });
  }
});

// Import sales from Excel
app.post('/api/sales/import', ensureDbInitialized, requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Parse the Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    // Get current user ID
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    let processedCount = 0;
    const totalRows = data.length;

    // Process each row with promises
    const insertPromises = data.map((row, index) => {
      return new Promise((resolve) => {
        try {
          // Map Excel columns to database fields
          const saleData = {
            date_bought: row['Date Bought'] || row['date_bought'] || row['Date Bought'] || '',
            date_expiry: row['Date Expiry'] || row['date_expiry'] || row['Date Expiry'] || null,
            duration: row['Duration'] || row['duration'] || null,
            customer_name: row['Customer Name'] || row['customer_name'] || row['Customer Name'] || '',
            plan: row['Plan'] || row['plan'] || '',
            cpu: row['CPU'] || row['cpu'] || '',
            ram: row['RAM'] || row['ram'] || '',
            disk: row['DISK'] || row['disk'] || '',
            amount: parseFloat(row['Amount'] || row['amount'] || row['Amount'] || 0),
            promo: row['Promo'] || row['promo'] || row['Promo'] || null,
            payment_method: row['Payment Method'] || row['payment_method'] || row['Payment Method'] || '',
            status: row['Status'] || row['status'] || row['Status'] || 'Pending',
            created_by: userId
          };

          // Validate required fields
          if (!saleData.date_bought || !saleData.customer_name || !saleData.plan || 
              !saleData.cpu || !saleData.ram || !saleData.disk || !saleData.amount || 
              !saleData.payment_method || !saleData.status) {
            throw new Error('Missing required fields');
          }

          // Validate status
          if (saleData.status !== 'Paid' && saleData.status !== 'Pending') {
            saleData.status = 'Pending';
          }

          // Insert into database
          db.run(
            `INSERT INTO sales (date_bought, duration, date_expiry, customer_name, plan, cpu, ram, disk, amount, promo, payment_method, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              saleData.date_bought,
              saleData.duration || null,
              saleData.date_expiry || null,
              saleData.customer_name,
              saleData.plan,
              saleData.cpu,
              saleData.ram,
              saleData.disk,
              saleData.amount,
              saleData.promo || null,
              saleData.payment_method,
              saleData.status,
              saleData.created_by
            ],
            function(err) {
              if (err) {
                errorCount++;
                errors.push(`Row ${index + 2}: ${err.message}`);
              } else {
                successCount++;
              }
              processedCount++;
              resolve();
            }
          );
        } catch (error) {
          errorCount++;
          errors.push(`Row ${index + 2}: ${error.message}`);
          processedCount++;
          resolve();
        }
      });
    });

    // Wait for all inserts to complete
    Promise.all(insertPromises).then(() => {
      res.json({
        success: true,
        message: `Import completed: ${successCount} successful, ${errorCount} errors`,
        successCount,
        errorCount,
        errors: errors.slice(0, 10) // Limit to first 10 errors
      });
    });
  } catch (error) {
    console.error('Error importing sales:', error);
    res.status(500).json({ error: 'Error processing file: ' + error.message });
  }
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
