# Final Color Specification - Ready for Implementation

## ✅ Complete Color Palette

### Backgrounds
- **Main content background**: `#ffffff`
- **Sidebar background**: `#ffffff`
- **Sidebar separator**: `#151515` (1px solid line)

### Primary Colors
- **Primary blue (darker)**: `#3166bf` - for lines, text, active states, input borders, buttons
- **Light blue (lighter)**: `#aeb8c9` - for backgrounds/fills, chart fills
- **Light blue accent**: `#afedff` - for agent message bubbles, special accents

### Text Colors
- **Dark text**: `#151515` - primary text on white backgrounds
- **Success text (green)**: `#e8f6f3` - for success badges/text

### Status Colors
- **Red**: `#f0494a` - errors, urgent tags
- **Yellow warning**: `#fbbf24` - "AI needs your help"
- **Orange warning**: `#f49d0d` - "AI missing info"
- **Success green background**: `#70d4b4` - active tab backgrounds

### Input Fields
- **Background**: `#ffffff`
- **Border**: `#3166bf` (darker blue)
- **Placeholder text**: Use gray from existing palette (default: `#9ca3af` or similar)
- **Icon background**: Use light gray from existing palette (default: `#f3f4f6` or similar)
- **Icon arrow**: Use medium gray from existing palette (default: `#6b7280` or similar)

### Chart Colors
- **Light background/fill**: `#aeb8c9` (lighter blue)
- **Lines/text**: `#3166bf` (darker blue)

### Additional Colors (Using Reasonable Defaults)
- **Borders**: `#e5e7eb` (light gray)
- **Secondary button background**: `#f3f4f6` (light gray)
- **Card shadows**: `rgba(0, 0, 0, 0.05)` to `rgba(0, 0, 0, 0.1)` (subtle)
- **Loading skeleton**: `#f3f4f6` (light gray)
- **Hover states**: Slight darkening of base colors
- **Error message background**: `#fef2f2` (light red)
- **Success message background**: `#f0fdf4` (light green)
- **Warning message background**: `#fffbeb` (light yellow)

## ✅ Implementation Scope

- **All authenticated pages**: Light theme
- **Auth page**: Light theme
- **Home/welcome page**: Light theme
- **Dark mode**: No toggle - light theme only for MVP

## 📋 Files to Update

### Global Styles
1. `app/globals.css` - Complete rewrite
2. `app/layout.tsx` - Background colors
3. `tailwind.config.ts` - Color palette

### Components
1. `components/HeaderClient.tsx`
2. `components/ui/card.tsx`
3. `components/ui/button.tsx`
4. All form/input components
5. Status badge components
6. Sidebar/navigation components

### Pages
1. `app/auth/page.tsx`
2. `app/home/page.tsx`
3. All authenticated pages

## 🎨 CSS Variables to Define

```css
:root {
  /* Backgrounds */
  --bg-white: #ffffff;
  --bg-sidebar: #ffffff;
  --border-separator: #151515;

  /* Primary Colors */
  --blue-primary: #3166bf;
  --blue-light: #aeb8c9;
  --blue-accent: #afedff;

  /* Text */
  --text-dark: #151515;
  --text-success: #e8f6f3;

  /* Status */
  --red: #f0494a;
  --yellow-warning: #fbbf24;
  --orange-warning: #f49d0d;
  --green-active: #70d4b4;

  /* Grays (defaults) */
  --gray-border: #e5e7eb;
  --gray-light: #f3f4f6;
  --gray-medium: #9ca3af;
  --gray-text: #6b7280;
}
```

## ✅ STATUS: READY TO IMPLEMENT

All colors confirmed. Ready to start implementation.

