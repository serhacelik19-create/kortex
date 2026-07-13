# Kortex Educational Platform

> [!NOTE]
> **Status: Active Development** — This project is currently in active development. Features are continuously being updated, refactored, and improved.

Kortex is a comprehensive, full-stack education management and YKS preparation platform designed for institutions, teachers, students, and parents. The project is specifically tailored around the Turkish education system, including YKS-focused study flows, institutional workflows, parent communication, attendance tracking, and student progress monitoring.

This repository is a sanitized public demo of the project. It keeps the real application structure, UI code, backend routes, data models, and mobile app flow visible for portfolio review, while removing private infrastructure, production secrets, and external service credentials.

### Key Features & Architecture

* **Multi-Role System:** Dedicated views and permission layers for institution admins, teachers, students, and parents.
* **Smart Cached AI Solver:** A Gemini-powered AI tutor that solves student questions. It integrates a 4-layer caching system (traditional text hash, image pHash, semantic summary hash, and vector embedding similarity) to minimize LLM token costs.
* **Scoped Teacher Permissions:** Advanced security filters ensuring teachers can only access data (students, attendance, reports) for their assigned classes.
* **Parent CRM & Deep Linking:** Automated weekly progress reporting to parents via WhatsApp and push notifications, with secure parent login activated through deep links (`yks://parent-activate`).
* **Integrity Monitor:** An in-app PDF homework viewer that logs background switch activities to prevent cheating during assignments.

### Repository Structure

```text
backend/     Node.js, Express, Prisma, PostgreSQL backend
panel/       React, Vite institution management panel
mobile-app/  Flutter student mobile application
```

### Tech Stack

* **Management Panels (panel & admin):** React 19, Vite, TypeScript, Tailwind CSS, Recharts, Framer Motion. State is managed natively via React Context and state hooks.
* **Mobile App (mobile-app):** Flutter (Dart), on-device OCR via native platform channels (Vision API), safe_device for Jailbreak/Root detection, and app_links for deep linking.
* **Backend:** Node.js, Express, Prisma ORM, PostgreSQL database, JWT authentication, Firebase Admin SDK for notifications.

### Local Setup

Install and configure dependencies for each component:

1. Backend Setup:
```bash
cd backend
# 1. Create environment file from the template
cp .env.example .env

# 2. Start PostgreSQL container via Docker (or configure a local database inside .env)
docker-compose up -d

# 3. Install dependencies
npm install

# 4. Generate Prisma client & initialize database with mock/seed data
npx prisma generate
npx prisma db push
npx prisma db seed

# 5. Run the development server
npm run dev
```

2. Panel Setup:
```bash
cd panel
npm install
npm run dev
```

3. Mobile App Setup:
```bash
cd mobile-app
flutter pub get
# Run on your preferred emulator, simulator, or browser
flutter run -d chrome
```

### AI-Agent Orchestrated Development (Case Study)

The defining aspect of this project is **how it was delivered**. The codebase was developed and refactored by working entirely as a human-in-the-loop orchestrator directing autonomous AI agents.

#### 1. The AI-Orchestrator Paradigm
Instead of focusing on boilerplate syntax, the developer's role centered on **first-principles system engineering**:
* **System Architecture:** Designing how the Flutter client interacts with the Express REST API, how Prisma handles relations in PostgreSQL, and how user roles map across the database.
* **Agent Direction:** Translating logical flows into structured prompts for code agents to generate UI components, handle state syncs, and wire up backend routes.
* **Safe Public Mocking:** Isolating production boundaries. We refactored external API routes (like Gemini Vision and Firebase Notifications) into clean, local mock handlers so the app runs out-of-the-box.
* **Refactoring & Cleanups via Multi-Agent Systems:** When removing legacy modules (like the local Python math service), multiple specialized agents were spawned. One agent refactored the backend code to safely bypass the service, while a separate **Code Integrity Auditor** agent audited the changes, successfully catching a logic bug regarding Gemini's JSON response configuration and resolving it before deployment.

#### 2. The Verification Loop (Human-in-the-Loop)
A strict feedback loop was established to guarantee code quality:
* **Static Analysis & Compilers:** Used `flutter analyze` to catch Dart type errors, `npm run build` to verify React/TS bundling, and `node --check` to catch JavaScript syntax errors on the backend.
* **Interactive Debugging:** Parsed compilation stacks and runtime error logs, feeding the stack traces back to the agent with logical constraints to debug the issues systematically.

### Purpose

The goal of this repository is to demonstrate architecture, product thinking, UI implementation, backend organization, and mobile app development across a real education technology project without exposing private customer data or production infrastructure.
