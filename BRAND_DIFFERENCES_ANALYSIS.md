# Brand Differences Analysis - Demo vs Current

## Major Theme Changes Needed

### 1. **Overall Theme Shift**
- **Current**: Dark theme (#242423) throughout
- **Demo**: Light theme for content, dark sidebar only

### 2. **Main Content Background**
- **Current**: `#242423` (dark gray)
- **Demo**: White or very light gray (`#F8F8F8` or `#FFFFFF`)
- **Question**: What exact white/light gray value should we use? `#FFFFFF`, `#F8F8F8`, or `#FAFAFA`?

### 3. **Card Styling**
- **Current**: Dark glass morphism (rgba(0, 0, 0, 0.4) with blur)
- **Demo**: Clean white cards with subtle shadows
- **Question**: What shadow values? Should we use Tailwind's `shadow-sm` or a custom value?

### 4. **Text Colors**
- **Current**: White (#ffffff)
- **Demo**: Dark gray/black on light backgrounds
- **Question**: What exact dark text color? `#1a202c`, `#2d3748`, `#374151`, or `#000000`?

### 5. **Sidebar Background**
- **Current**: Dark (matches main)
- **Demo**: Dark gray/black sidebar (#242423 or similar)
- **Question**: Should sidebar stay `#242423` or a different dark shade?

### 6. **Primary Blue Color**
- **Current**: `#3351ff`
- **Demo**: Appears similar but may be slightly different
- **Question**: Is `#3351ff` correct, or should we use a different blue? (e.g., `#229CF3`, `#0066FF`, or the exact hex from demo)

### 7. **Status Badge Colors**
Need to confirm exact colors for:
- **Green (Success/Active)**: What hex value? (`#10B981`, `#22C55E`, or custom?)
- **Red (Error/Urgent)**: What hex value? (`#EF4444`, `#DC2626`, or custom?)
- **Orange/Yellow (Warning)**: What hex value for "AI missing info"? (`#F59E0B`, `#FB923C`, or custom?)

### 8. **Chat/Message Bubble Colors**
- **Agent Messages**: Light blue/gray background
- **Question**: What exact color for agent message bubbles? (`#E0F2F7`, `#E3F2FD`, or other?)

### 9. **Form Input Backgrounds**
- **Current**: Dark transparent backgrounds
- **Demo**: White/light gray backgrounds
- **Question**: Exact background color for inputs? (`#FFFFFF`, `#F9FAFB`, or `#F3F4F6`?)

### 10. **Secondary Button Style**
- **Current**: Dark with transparency
- **Demo**: Light gray with dark text
- **Question**: What background color for secondary buttons? (`#F3F4F6`, `#E5E7EB`, or other?)

### 11. **Border Colors**
- **Current**: White with low opacity
- **Demo**: Light gray borders
- **Question**: What border color? (`#E5E7EB`, `#D1D5DB`, or `#E4E4E7`?)

### 12. **Header Style**
- **Current**: Dark with glass morphism
- **Demo**: Dark header (seems similar but cleaner)
- **Question**: Should header stay dark or match light theme? (From images, appears dark)

### 13. **Chart Colors**
- **Primary line**: Blue (same as primary?)
- **Fill**: Light blue
- **Comparison line**: Light gray
- **Question**: What exact colors for charts? Primary blue fill color?

### 14. **Workflow Canvas Background**
- **Demo**: Very light gray with dotted grid
- **Question**: Background color and grid pattern? (`#F9FAFB` with subtle dots?)

### 15. **Loading States**
- **Current**: Dark gray (#383939)
- **Demo**: Light gray skeleton
- **Question**: What color for loading skeletons in light theme? (`#E5E7EB`, `#F3F4F6`?)

## Implementation Questions

1. **Should we maintain dark mode as an option** or completely switch to light theme?
2. **Which pages should have the light theme?** (All authenticated pages, or specific ones?)
3. **Should the auth page also be light themed?** (From demo, appears light)
4. **What about the home/welcome page?** Should it match the new light theme?
5. **Do we need to update the logo** for light backgrounds?
6. **Should we keep any dark-themed pages** for specific features (like agent builder)?

## Files That Need Major Updates

1. `app/globals.css` - Complete rewrite of theme
2. `components/HeaderClient.tsx` - Update styling
3. `app/auth/page.tsx` - Convert to light theme
4. `components/ui/card.tsx` - Already has some light styling, needs consistency
5. All page components (calls, contacts, appointments, etc.)
6. Form components and inputs
7. Button components
8. Status badge components


