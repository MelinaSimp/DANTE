# Troubleshooting: Can't Delete Steps

## 🔍 Common Issues and Solutions

### Issue 1: Delete Button Not Visible

**Check:**
- Look for a **trash icon** (🗑️) in the top-right corner of each step card
- It should be red/pink colored
- It's next to the checkmark/warning icon

**Solution:**
- Make sure you're hovering over or clicking on the step card
- The delete button should be visible in the header of each step

### Issue 2: Click Not Working

**Possible Causes:**
- Button might be behind another element (z-index issue)
- JavaScript error preventing click
- Browser extension blocking clicks

**Solutions:**
1. **Try right-clicking** on the trash icon and select "Inspect Element" to see if it's clickable
2. **Check browser console** (F12) for any JavaScript errors
3. **Try a different browser** to rule out extension issues
4. **Try clicking directly on the icon** (not the button area around it)

### Issue 3: Confirmation Modal Not Showing

**Check:**
- When you click delete, a confirmation modal should appear
- It should say "Delete Step" and ask for confirmation

**If modal doesn't show:**
- Check browser console for errors
- Try refreshing the page
- Make sure JavaScript is enabled

### Issue 4: Step Deletes But Comes Back

**This means:**
- The API call might be failing
- The UI updates but the database doesn't

**Solution:**
- Check browser console (F12) → Network tab
- Look for the DELETE request to `/api/steps/[stepId]`
- Check if it returns an error (status 400, 401, 500, etc.)

### Issue 5: Permission/Authorization Error

**Error message might say:**
- "Unauthorized"
- "Step not found"
- "Forbidden"

**Solution:**
- Make sure you're logged in
- Make sure you own the agent/workspace
- Try logging out and back in

---

## 🛠️ Manual Fix: Delete via API

If the UI isn't working, you can delete steps manually:

1. **Find the Step ID:**
   - Open browser console (F12)
   - Go to Network tab
   - Click on a step in the UI
   - Look for API calls - the step ID will be in the URL

2. **Delete via API:**
   - Open browser console
   - Run this (replace `STEP_ID` with actual step ID):
   ```javascript
   fetch('/api/steps/STEP_ID', { method: 'DELETE' })
     .then(r => r.json())
     .then(console.log)
   ```

---

## ✅ Quick Checklist

- [ ] Can you see the trash icon (🗑️) on each step?
- [ ] Does clicking it show a confirmation modal?
- [ ] Does clicking "Delete" in the modal remove the step?
- [ ] Check browser console (F12) for errors
- [ ] Check Network tab for failed API calls
- [ ] Try refreshing the page
- [ ] Try a different browser

---

## 🐛 If Still Not Working

1. **Check Browser Console:**
   - Press F12
   - Go to "Console" tab
   - Look for red error messages
   - Share the error message

2. **Check Network Requests:**
   - Press F12
   - Go to "Network" tab
   - Click delete button
   - Look for DELETE request to `/api/steps/...`
   - Check if it's successful (green) or failed (red)
   - Share the error if it failed

3. **Try These Steps:**
   - Refresh the page
   - Clear browser cache
   - Try incognito/private mode
   - Try a different browser
   - Log out and log back in

---

## 📝 What Should Happen

**Normal Flow:**
1. You see a step card with a trash icon (🗑️) in the top-right
2. You click the trash icon
3. A confirmation modal appears: "Are you sure you want to delete this step?"
4. You click "Delete" in the modal
5. The step disappears from the canvas
6. The step is removed from the database

If any of these steps fail, that's where the problem is!

