# Shreejal — Task Management Mobile APK

## Overview
This is the Android mobile app for Shreejal CRM Task Management.
- **Same backend** as the desktop CRM (https://shreejal.onrender.com)
- **Same database** — real-time sync between mobile and desktop
- **Same login credentials** — no separate accounts needed
- Desktop CRM is **100% untouched and unaffected**

---

## Quick Start (Preview on Phone — Instant, No Build Needed)

### Step 1: Install Expo Go on your Android phone
Download "Expo Go" from the Google Play Store.

### Step 2: Install dependencies
```bash
cd mobile
npm install
```

### Step 3: Start the development server
```bash
npm start
```

### Step 4: Scan the QR code
Open Expo Go on your phone and scan the QR code shown in the terminal.
The app will load instantly on your phone — showing live task data!

---

## Build Signed APK (For Distribution)

### Prerequisites
1. Create a free account at https://expo.dev
2. Install EAS CLI: `npm install -g eas-cli`
3. Login: `eas login`

### Build APK
```bash
cd mobile
eas build -p android --profile preview
```
This runs in the cloud (~15-20 minutes). You get a download link for the `.apk` file.
Install it on any Android phone directly (no Play Store needed).

### Build AAB (for Play Store)
```bash
eas build -p android --profile production
```

---

## Screens

| Screen | Description |
|---|---|
| Login | Same CRM credentials. JWT stored securely. |
| Dashboard | Tabs: Overdue / Today / 7 Days / Future — with counts |
| Task Detail | Full info + update history + quick notes |
| Create Task | Full form — group, assignee, priority, date/time |
| Extend Task | Quick buttons (+1d, +3d, +7d) or custom date |

---

## API Endpoints Used

All from the **same existing backend**:

| Action | Endpoint |
|---|---|
| Login | `POST /api/v1/auth/login` |
| Get Tasks | `GET /api/v1/tasks` |
| Get Task | `GET /api/v1/tasks/:id` |
| Create Task | `POST /api/v1/tasks` |
| Add Update | `POST /api/v1/tasks/:id/updates` |
| Extend Task | `POST /api/v1/tasks/:id/extend` |
| Close Task | `POST /api/v1/tasks/:id/close` |
| Get Groups | `GET /api/v1/task-groups/my` |
| Get Users | `GET /api/v1/users` |

---

## Safety Confirmation

✅ Desktop CRM (`src/`, `backend/`) — **UNTOUCHED**
✅ Database — **SHARED** (same data, real-time sync)
✅ Routes — **UNCHANGED** (no new routes added)
✅ Existing task logic — **UNCHANGED**
✅ Only change to existing code: one CORS entry in `backend/src/app.js`

---

## Future Expansion
The architecture supports adding more modules later:
- Add screen → Add to `AppNavigator.js`
- Add API calls → Add to `src/api/`
- Each module stays isolated

---

## Keystore (APK Signing)
When you run `eas build` for the first time, EAS automatically:
1. Generates a keystore for you
2. Stores it securely on Expo's servers
3. Gives you credentials to download it

**Important**: Download and save the keystore after first build. You need it for future Play Store updates.
Download: `eas credentials`

---

## Support
- Backend API: https://shreejal.onrender.com
- Expo Docs: https://docs.expo.dev
- EAS Build: https://docs.expo.dev/build/introduction
