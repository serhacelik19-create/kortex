# Kortex Educational Platform

> **Status: Active Development** — Features are continuously being updated and improved.

Kortex is a full-stack education management and YKS preparation platform built for institutions, teachers, students, and parents. It covers the end-to-end workflow of Turkish educational institutions: class management, attendance tracking, student progress monitoring, AI-powered tutoring, parent communication, and institutional analytics.

This repository is a sanitized public version of the project. The application structure, UI code, backend routes, data models, and mobile app flow are fully visible for review, while production secrets and private infrastructure have been removed.

---

## Features

### 📱 Student Mobile App (Flutter)

**AI-Powered Learning**
- **AI Tutor & Chat:** Students photograph questions, on-device OCR extracts the text, and Gemini generates step-by-step solutions with LaTeX math rendering.
- **Smart Quiz Engine:** AI-generated quizzes adapted to the student's current curriculum and weak topics.
- **Explanation Screen:** Detailed breakdowns of solutions with math formatting support.

**Study Tools**
- **Topic Map:** Visual curriculum map showing progress across YKS subjects and sub-topics.
- **Curriculum Tracker:** Full YKS müfredat coverage with completion tracking per subject.
- **Study Timer:** Pomodoro-style session timer with study data logging.
- **Library:** Saved questions, study notes, and reference materials.
- **Daily Quests & Achievements:** Gamified study goals to maintain student engagement.

**Guidance & Communication**
- **Guidance Screen:** Access to institutional guidance counselor resources and appointment scheduling.
- **Parent Notification View:** Students can see what progress reports their parents receive.
- **Onboarding Flow:** First-time setup with class selection, subject preferences, and study goal configuration.

---

### 🖥️ Institution Management Panel (React)

**Class & Student Management**
- **Class List & Detail:** Create classes, assign teachers, view class-level analytics.
- **Student List & Detail:** Individual student profiles with performance history, attendance records, and AI usage stats.
- **Student Accounts:** Bulk account creation and credential management for institutions.

**Academic Operations**
- **Attendance System:** Daily attendance tracking with teacher-scoped permissions — teachers can only mark attendance for their assigned classes.
- **Exam Center:** Create, assign, and grade exams with per-student result tracking.
- **Content Assignment Center:** Assign homework, PDFs, and study materials to specific classes or individual students.
- **Class Progress:** Aggregated class-level performance dashboards with subject breakdowns.

**Institutional Tools**
- **Guidance Center:** Counselor tools for student follow-up, appointment management, and intervention tracking.
- **Parent CRM:** Manage parent contacts, automate weekly WhatsApp progress reports, trigger push notifications, and activate parent accounts via deep links (`yks://parent-activate`).
- **Accounting Module:** Tuition tracking, payment status, and financial reporting per student.
- **Dashboard:** Institution-wide KPIs — active students, attendance rates, AI usage metrics, exam averages.
- **Settings:** Institution configuration, teacher role management, and system preferences.

---

### ⚙️ Backend (Node.js + Express)

- **18 Route Modules:** Auth, students, classes, attendance, exams, AI chat, smart quiz, guidance, parent, accounting, dashboard, reports, assigned content, study data, appointments, institution, admin, users.
- **AI Service (v3):** Evolved through 3 iterations — current version handles multi-turn chat, OCR input, curriculum-aware responses, and usage tracking.
- **Parent Push Service:** Firebase Admin SDK integration for automated push notifications to parent devices.
- **Scoped Permissions:** Middleware-level security ensuring teachers access only their assigned class data across all endpoints.
- **Curriculum Seeder:** Pre-loaded YKS curriculum data covering all subjects and sub-topics.

---

## Tech Stack

| Component | Technologies |
|-----------|-------------|
| Backend | Node.js, Express, Prisma ORM, PostgreSQL, JWT auth, Firebase Admin SDK |
| Management Panel | React 19, Vite, TypeScript, Tailwind CSS, Recharts, Framer Motion |
| Mobile App | Flutter, on-device OCR (platform Vision API), safe_device (jailbreak detection), app_links (deep linking) |

---

## Setup

### Backend
```bash
cd backend
cp .env.example .env
docker-compose up -d          # Start PostgreSQL (or configure local DB in .env)
npm install
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

### Panel
```bash
cd panel
npm install
npm run dev
```

### Mobile App
```bash
cd mobile-app
flutter pub get
flutter run -d chrome          # Or your preferred emulator/device
```

---

## Development Approach

This project was developed using AI-assisted engineering workflows with human-in-the-loop verification. The developer's role focused on system architecture, data modeling, and quality assurance — leveraging static analysis (`flutter analyze`, `npm run build`, `node --check`) and interactive debugging to validate all generated code.

---

## Purpose

This repository demonstrates architecture, product thinking, UI implementation, backend organization, and mobile development across a real education technology project — without exposing private customer data or production infrastructure.

---

## License

MIT
