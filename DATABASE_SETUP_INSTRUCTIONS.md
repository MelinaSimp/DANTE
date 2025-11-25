# Database Setup Instructions

## Overview
This document provides step-by-step instructions for setting up the Drift Agent Builder database in Supabase.

## Prerequisites
- Access to your Supabase project dashboard
- Admin access to run SQL queries

## Setup Steps

### Step 1: Run Main Database Schema
1. Open your Supabase project dashboard
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy the entire contents of `SETUP_DATABASE.sql`
5. Paste into the SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. Wait for the success message: `Drift Agent Builder database setup completed successfully!`

### Step 2: Set Up Storage Bucket
1. In Supabase dashboard, go to **Storage** (left sidebar)
2. Click **Create Bucket**
3. Configure:
   - **Name**: `agent-files`
   - **Public**: `false` (private bucket)
   - **File size limit**: `50MB` (or your preferred limit)
   - **Allowed MIME types**: Leave empty for all types, or specify: `application/pdf,text/plain,application/json,text/csv,image/*`
4. Click **Create Bucket**

**OR** run the SQL file:
1. In SQL Editor, create a new query
2. Copy contents of `SETUP_STORAGE.sql`
3. Run the query

### Step 3: Verify Setup
Run this query to verify all tables were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'agents', 'scenarios', 'steps', 'step_branches',
  'supporting_docs', 'agent_policies', 'agent_data_sources',
  'agent_personalization', 'agent_advanced_settings',
  'agent_test_results', 'call_sessions'
)
ORDER BY table_name;
```

You should see all 11 tables listed.

## Files to Run

1. **SETUP_DATABASE.sql** - Main database schema (REQUIRED)
2. **SETUP_STORAGE.sql** - Storage bucket setup (REQUIRED for file uploads)

## What Gets Created

### Tables
- `agents` - AI agent definitions
- `scenarios` - Conversation flow scenarios
- `steps` - Individual steps within scenarios
- `step_branches` - Conditional branching logic
- `supporting_docs` - Supporting documents for agents
- `agent_policies` - Policy documents
- `agent_data_sources` - Knowledge base data sources
- `agent_personalization` - Voice and personality settings
- `agent_advanced_settings` - API keys, webhooks, etc.
- `agent_test_results` - Test execution results
- `call_sessions` - Twilio call state management

### Security
- Row Level Security (RLS) enabled on all tables
- Policies ensure users can only access their workspace data
- Storage policies for secure file uploads

### Indexes
- Optimized indexes for common queries
- Foreign key relationships with CASCADE deletes

## Troubleshooting

### Error: "relation already exists"
- Tables may already exist from a previous setup
- The SQL uses `CREATE TABLE IF NOT EXISTS` so it's safe to run again
- If you need to start fresh, drop tables first (be careful!)

### Error: "permission denied"
- Ensure you're using the SQL Editor with proper permissions
- Some operations may require service role key

### Storage bucket errors
- Make sure you have Storage enabled in your Supabase project
- Check that the bucket name `agent-files` doesn't already exist

## Next Steps

After running the SQL files:
1. Test creating an agent in the UI
2. Verify data persists after page refresh
3. Test file uploads (if storage is set up)
4. Check that personalization settings save correctly

## Support

If you encounter issues:
1. Check Supabase logs in the Dashboard
2. Verify RLS policies are active
3. Ensure workspace_id is properly set in user profiles









