# AstryxNodes Sales Management System

A modern sales tracking application with authentication, built with Node.js and Express.

## Features

- User authentication (registration and login)
- Sales management with CRUD operations
- Monthly sales filtering
- Automatic expiry date calculation
- Plan-based auto-fill for server specifications
- Renewal functionality for subscriptions
- Salary distribution calculations
- VPS expenses tracking
- Nebula-themed modern UI
- Mobile-responsive design

## Local Development

```bash
npm install
npm start
```

The server will run on port 3020 (or the port specified in the PORT environment variable).

## Vercel Deployment

### Important Notes:

⚠️ **SQLite Database Limitation**: SQLite uses file-based storage which may not persist properly on Vercel's serverless environment. Consider using:
- Vercel Postgres (recommended)
- MongoDB Atlas
- Supabase
- PlanetScale

### Deployment Steps:

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. For production deployment:
```bash
vercel --prod
```

### Environment Variables:

Set these in Vercel dashboard:
- `NODE_ENV=production`
- `SESSION_SECRET` (change from default)

### Database Migration:

If using SQLite on Vercel, the database file will be recreated on each deployment. Consider migrating to a cloud database for production use.

## Project Structure

```
sales/
├── server.js          # Main server file
├── public/            # Frontend files
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── sales.db          # SQLite database (not in git)
├── package.json
└── vercel.json       # Vercel configuration
```

## Default Port

- Local: 3020
- Vercel: Uses Vercel's provided PORT
