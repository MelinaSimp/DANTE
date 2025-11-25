# Brand Update Instructions

## Logo
1. Replace `/public/brand/logo-new.png` with your actual logo PNG file
2. The logo should be the minimalist symbol with four rounded chevrons and a four-petal flower center

## Background Image
1. Replace `/public/backgrounds/mountain-landscape.jpg` with your actual mountain landscape image
2. The image should be the Bob Ross-style winter mountain painting

## What's Been Updated

### Color Scheme
- Changed from dark theme (`#0a0a0a`, `#111111`) to natural light theme
- Background: Mountain landscape with white overlay (85% opacity)
- Text: Dark slate (`#1a202c`, `#475569`) instead of white
- Buttons: Slate gray (`#475569` to `#64748b`) instead of bright blue
- Borders: Soft slate (`rgba(148, 163, 184, 0.3)`) instead of white/10

### Components Updated
- ✅ Global CSS (`app/globals.css`)
- ✅ Header (`components/HeaderClient.tsx`)
- ✅ Auth page (`app/auth/page.tsx`)
- ✅ Agent Builder (`app/agents/AgentBuilderClient.tsx`)
- ✅ Logo references updated to `/brand/logo-new.png`

### Still Need Manual Updates
- Upload actual logo PNG to `/public/brand/logo-new.png`
- Upload actual mountain landscape image to `/public/backgrounds/mountain-landscape.jpg`
- Update remaining dark theme components (AgentCanvas, StepEditor, CreateAgentModal, TestResults)

## Next Steps
1. Upload the logo and background images
2. Test the new design
3. Update any remaining dark theme components if needed

