
# 📋 Implementation Checklist

## 1. Backend Foundation (Convex)
- [x] **Update User Mutation** (`convex/users.ts`)
    - [x] Update `store` mutation to initialize new fields (`reputation`, `appsCount`, `isGroupMember`, `createdAt`).
- [x] **App Logic** (`convex/apps.ts`)
    - [x] Create `createApp` mutation (validate limit of 3 apps).
    - [x] Create `getMarketplaceApps` query (filter by status 'recruiting').
    - [x] Create `getMyApps` query.

## 2. Frontend Components
- [x] **Input Components**: Used existing `Input`, `Textarea` from UI library.
- [x] **Image Upload**: Placeholder text input used for now (TODO: Real Image Picker).

## 3. "Add App" Screen (`app/add-app.tsx`)
- [x] **Layout**: Full-screen layout with cards.
- [x] **Form Fields**:
    - [x] App Name
    - [x] Package Name
    - [x] Play Store Link
    - [x] App Icon (URL Input)
    - [x] Required Testers (Numeric Input)
    - [x] Instructions (Text Area)
    - [x] Quick Suggestions Chips
- [x] **Logic**: Calls `createApp` mutation on submit.

## 4. Marketplace Screen (`app/(tabs)/marketplace.tsx`)
- [x] **Layout**:
    - [x] Filter Tabs (Recruiting / In Progress).
    - [x] Search Bar.
- [x] **App Grid/List**:
    - [x] Fetches data from `getMarketplaceApps`.
    - [x] Renders `AppCard` component for each item.
- [x] **AppCard Component**:
    - [x] Displays Icon, Title, "Need X Testers".
    - [x] "Swape Request" Button.

## 5. Navigation Integration
- [x] Add `app/add-app.tsx` (Auto-detected by Expo Router).
- [x] Added FAB in `marketplace.tsx` to trigger Add App.

## Next Steps
- [ ] Implement "Tests" Tab (My Apps vs I'm Testing).
- [ ] Implement `api.matches` logic (request swap, accept, etc.).
- [ ] Implement "Swape Request" Modal.
