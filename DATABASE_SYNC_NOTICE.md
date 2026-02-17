# ⚠️ Important: Database Synchronization Notice

## The Problem

The `sales.db` file is **NOT** synced between devices because it's in `.gitignore`. This is intentional to prevent database conflicts, but it means:

- **Each device has its own separate database**
- When you pull code on a new device, you get a **new empty database**
- Sales data from one device won't appear on another device

## Solutions

### Option 1: Manual Database Copy (Quick Fix)
If you need to sync data between devices:

1. **On the device with data:**
   - Copy the `sales.db` file
   - Transfer it to the other device (USB, email, cloud storage, etc.)
   - Replace the `sales.db` file on the new device

2. **⚠️ Warning:** Only do this when the app is stopped on both devices to avoid corruption

### Option 2: Use a Cloud Database (Recommended for Production)
For production use, consider migrating to:
- **Vercel Postgres** (if using Vercel)
- **MongoDB Atlas**
- **Supabase**
- **PlanetScale**
- **Railway Postgres**

These provide:
- ✅ Automatic synchronization
- ✅ Multi-device access
- ✅ Better reliability
- ✅ Backup and recovery

### Option 3: Export/Import Feature (Future Enhancement)
A feature could be added to export sales data as JSON and import it on another device.

## Current Status

- ✅ Code is synced via Git
- ❌ Database is **NOT** synced (by design)
- ✅ Each device maintains its own database

## If You See Wrong Statistics

If statistics show incorrect numbers:
1. Check the browser console for errors
2. Refresh the page
3. Check if there are orphaned records (sales without valid user references)
4. The statistics should now correctly show 0 when the database is empty
