# Media Streams Error Handling Plan

## 🔍 Complete Error Analysis

### 1. **Vercel/Next.js Deployment Errors**

#### Error: 404 - Route Not Found
**Current Status:** ✅ Happening now
**Causes:**
- Route file not deployed yet
- Build cache issues
- File path incorrect
- Next.js routing configuration issue

**Fix Plan:**
1. ✅ Verify file exists at `app/api/twilio/media-stream/route.ts`
2. ✅ Ensure both GET and POST exports exist
3. ✅ Force redeploy in Vercel (clear build cache)
4. ✅ Verify deployment logs show route is included
5. Add health check endpoint to verify deployment

#### Error: 500 - Server Error
**Potential Causes:**
- Unhandled exceptions
- Database connection failures
- Missing environment variables
- Timeout errors

**Fix Plan:**
1. ✅ Add comprehensive try-catch blocks
2. ✅ Always return valid TwiML (status 200) even on errors
3. ✅ Log all errors with context
4. ✅ Add timeout handling
5. ✅ Validate environment variables at startup

#### Error: Timeout (maxDuration exceeded)
**Potential Causes:**
- Database queries taking too long
- External API calls timing out
- Complex agent execution

**Fix Plan:**
1. ✅ Set `maxDuration: 10` (already done)
2. Add database query timeouts
3. Add fallback responses for slow operations
4. Optimize database queries (already using parallel queries)

---

### 2. **Twilio Webhook Errors**

#### Error: 11200 - HTTP Retrieval Failure
**Current Status:** ✅ Happening now
**Causes:**
- Endpoint returns 404 (route not deployed)
- Endpoint returns 500 (server error)
- Network connectivity issues
- SSL certificate problems
- Vercel firewall blocking requests

**Fix Plan:**
1. ✅ Fix 404 by ensuring route is deployed
2. ✅ Always return status 200 with valid TwiML
3. Add retry logic for transient failures
4. Verify SSL certificate is valid
5. Check Vercel firewall settings
6. Add request validation before processing

#### Error: 15003 - Call Progress Warning
**Causes:**
- Invalid TwiML format
- Missing required TwiML elements
- Malformed XML
- Invalid WebSocket URL format

**Fix Plan:**
1. ✅ Validate TwiML XML structure
2. ✅ Escape special characters in URLs
3. ✅ Validate WebSocket URL format (must start with `wss://`)
4. ✅ Test TwiML with Twilio validator
5. Add XML validation before returning

#### Error: Invalid WebSocket URL
**Causes:**
- Railway URL not accessible
- URL format incorrect
- Missing protocol (`wss://`)
- URL contains invalid characters

**Fix Plan:**
1. ✅ Validate Railway URL format
2. ✅ Ensure URL starts with `wss://`
3. ✅ URL encode query parameters
4. Add Railway health check before using URL
5. Add fallback to regular Twilio flow if Railway unavailable

---

### 3. **Railway WebSocket Server Errors**

#### Error: Server Not Running
**Causes:**
- Railway deployment failed
- Server crashed
- Port not accessible
- Environment variables missing

**Fix Plan:**
1. ✅ Add health check endpoint (`/health`)
2. Verify Railway deployment status
3. Check Railway logs for errors
4. Add automatic restart on crash
5. Monitor Railway service status

#### Error: WebSocket Connection Failed
**Causes:**
- Railway server down
- Network connectivity issues
- Firewall blocking WebSocket connections
- SSL certificate issues

**Fix Plan:**
1. Add connection retry logic
2. Fallback to regular Twilio flow if WebSocket fails
3. Add connection timeout handling
4. Log all connection attempts
5. Monitor connection success rate

#### Error: Missing Environment Variables
**Causes:**
- `NEXTJS_API_URL` not set
- `ELEVENLABS_API_KEY` not set
- `PORT` not set (uses default)

**Fix Plan:**
1. ✅ Validate environment variables at startup
2. Log warnings for missing variables
3. Use sensible defaults where possible
4. Document required variables

---

### 4. **Database Errors**

#### Error: Supabase Connection Failure
**Causes:**
- Supabase service down
- Network issues
- Invalid credentials
- Rate limiting

**Fix Plan:**
1. ✅ Add error handling for all database queries
2. ✅ Return user-friendly error messages
3. Add retry logic with exponential backoff
4. Log database errors with context
5. Add connection pooling

#### Error: Agent Not Found
**Causes:**
- Phone number mismatch
- Agent not deployed
- Agent deleted
- Workspace mismatch

**Fix Plan:**
1. ✅ Try multiple phone number formats (already done)
2. ✅ Return clear error message
3. Log all attempted formats for debugging
4. Add agent validation before deployment

#### Error: Conversation Creation Failed
**Causes:**
- Database constraint violations
- Missing required fields
- Foreign key constraints

**Fix Plan:**
1. ✅ Validate all required fields before insert
2. ✅ Handle create errors gracefully
3. Add transaction rollback on failure
4. Log detailed error information

---

### 5. **External API Errors**

#### Error: ElevenLabs API Failure
**Causes:**
- Invalid API key
- Rate limiting
- Service unavailable
- Network issues

**Fix Plan:**
1. ✅ Validate API key exists
2. Add retry logic for transient failures
3. Fallback to Twilio TTS if ElevenLabs fails
4. Log API errors with status codes
5. Monitor API usage and limits

#### Error: Next.js API Endpoint Failures
**Causes:**
- `/api/twilio/media-stream-process` returns error
- `/api/twilio/media-stream-execute` returns error
- Endpoints not deployed
- Timeout errors

**Fix Plan:**
1. ✅ Add error handling in Railway server
2. Add retry logic for failed requests
3. Log all API call failures
4. Add fallback behavior
5. Verify endpoints are deployed

---

### 6. **Media Streams Specific Errors**

#### Error: Audio Processing Failure
**Causes:**
- Audio encoding/decoding errors
- Buffer overflow
- Invalid audio format
- STT service unavailable

**Fix Plan:**
1. Add audio format validation
2. Add buffer size limits
3. Handle encoding errors gracefully
4. Add fallback to Twilio transcription

#### Error: Stream Connection Timeout
**Causes:**
- Railway server slow to respond
- Network latency
- Server overloaded

**Fix Plan:**
1. Add connection timeout (30 seconds)
2. Fallback to regular Twilio flow
3. Monitor connection times
4. Optimize Railway server performance

---

## 🛠️ Implementation Plan

### Phase 1: Critical Fixes (Immediate)

1. **Fix 404 Error**
   - ✅ Verify route file exists and is correct
   - ✅ Force redeploy in Vercel
   - ✅ Verify deployment includes route

2. **Add Comprehensive Error Handling**
   - ✅ Add try-catch to all async operations
   - ✅ Always return valid TwiML (status 200)
   - ✅ Add detailed error logging

3. **Validate Environment Variables**
   - ✅ Check Railway URL is set
   - ✅ Validate URL format
   - ✅ Add fallback values

### Phase 2: Resilience Improvements

1. **Add Fallback Mechanisms**
   - Fallback to regular Twilio flow if Media Streams fails
   - Fallback to Twilio TTS if ElevenLabs fails
   - Retry logic for transient failures

2. **Add Health Checks**
   - Railway health check endpoint
   - Verify Railway is accessible before using
   - Monitor service status

3. **Improve Logging**
   - Log all errors with full context
   - Add request/response logging
   - Track error rates

### Phase 3: Monitoring & Alerts

1. **Add Error Tracking**
   - Track error types and frequencies
   - Alert on high error rates
   - Monitor service health

2. **Performance Monitoring**
   - Track response times
   - Monitor WebSocket connection success rate
   - Track API call latencies

---

## 📋 Error Response Strategy

### Always Return Valid TwiML
Even on errors, always return status 200 with valid TwiML:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>
```

### Error Logging Format
```javascript
{
  timestamp: ISO string,
  errorType: string,
  source: string,
  callSid: string,
  error: Error object,
  context: { ... }
}
```

### Fallback Chain
1. Try Media Streams with Railway
2. If Railway fails → Fallback to regular Twilio flow
3. If ElevenLabs fails → Use Twilio TTS
4. If all fails → Return error TwiML

---

## ✅ Verification Checklist

- [x] Route file exists and is correct
- [x] GET and POST handlers exported
- [x] Error handling in place
- [x] Always returns valid TwiML
- [ ] Railway health check implemented
- [ ] Fallback mechanisms added
- [ ] Environment variables validated
- [ ] Comprehensive logging added
- [ ] Error monitoring set up

---

## 🚀 Next Steps

1. **Immediate:** Redeploy in Vercel to fix 404
2. **Short-term:** Add Railway health check
3. **Medium-term:** Implement fallback mechanisms
4. **Long-term:** Add monitoring and alerts
