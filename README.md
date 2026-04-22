# StudyGraph - Smart Study Planner

A visually rich single-page web application for planning study paths with **dependency-aware logic** from Discrete Mathematics.

StudyGraph helps students:
- organize subjects and topics,
- define prerequisite chains across subjects,
- visualize learning dependencies as a directed graph or Hasse-style layered view,
- auto-generate valid day-wise study schedules,
- and track progress with set-theory stats.

---

## Live Concept

This app models learning as a **Directed Acyclic Graph (DAG)**:
- each topic is a node,
- each prerequisite relation is a directed edge,
- and scheduling is generated using topological ordering.

It also includes:
- **Warshall's Algorithm** for transitive closure and reachability,
- **Set Theory** representation for progress and lock/unlock states,
- **Poset / Hasse-style layering** for parallel study visibility.

---

## Features

### 1) Topic Manager
- Add and delete subjects
- Add and delete topics under each subject
- Assign prerequisites from any subject
- Update topic states: `Pending`, `In Progress`, `Completed`
- Remove prerequisite chips quickly

### 2) Dependency Graph Visualizer
- SVG-based directed graph rendering (no external graph library)
- Circular nodes + arrowed edges (`prerequisite -> dependent`)
- Status color coding:
  - Gray: Pending
  - Yellow: In Progress
  - Green: Completed
  - Blue: Unlocked (all prerequisites satisfied)
- Node tooltip with topic details and direct prerequisites
- Smooth transitions and drag-ready interaction

### 3) Warshall Reachability Engine
- Builds adjacency matrix from topic graph
- Runs transitive closure (Warshall)
- Detects cycles and warns users
- Shows:
  - all topics required before selected topic
  - all downstream topics unlocked/impacted by selected topic

### 4) Smart Schedule Generator
- Input number of available study days
- Uses topological sort over DAG
- Distributes valid topic sequence across days
- Outputs day-by-day schedule cards
- Copy schedule to clipboard

### 5) Hasse Diagram Toggle View
- Alternate visualization mode
- Layered top-to-bottom dependency levels
- Clearly shows parallelizable topics at each level

### 6) Set Theory Stats Panel
- `|T|`: total topics
- `|C|`: completed set (`C subset T`)
- `|L|`: locked topics
- `|U|`: unlocked pending topics
- progress percentage: `|C| / |T| * 100`
- animated progress bars

### Bonus Features
- Drag and reposition nodes in graph view
- Topic-linked Pomodoro timer (start/pause/reset/focus)
- Full study plan import/export as JSON
- Local persistence using `localStorage`

---

## Tech Stack

- **React** (functional components + hooks)
- **Vite** (build tooling)
- **Tailwind CSS v4** (plus custom glassmorphism styling)
- **TypeScript**
- **SVG** for custom graph rendering

No backend, no database, no external graph library.

---

## Project Structure

```text
src/
  App.tsx        # Core UI + graph logic + scheduling + pomodoro + import/export
  main.tsx       # React entry point
  style.css      # Tailwind import + custom theme classes
public/
  favicon.svg
```

---

## How It Works (Algorithm Layer)

1. Build directed adjacency matrix from topic prerequisites.
2. Run Warshall transitive closure to compute reachability.
3. Detect cycles to validate DAG assumptions.
4. Perform topological sort for valid prerequisite-respecting order.
5. Distribute sorted topics into study days for generated schedule.
6. Compute live sets `T, C, L, U` for progress analytics.

---

## Getting Started

### Prerequisites
- Node.js 18+ recommended
- npm

### Install and Run

```bash
npm install
npm run dev
```

### Build for Production

```bash
npm run build
npm run preview
```

---

## Demo Flow (Quick)

1. Add subjects and topics in left panel.
2. Assign prerequisite links.
3. Watch center graph update with edges and node colors.
4. Toggle Hasse view for layered dependency levels.
5. Pick a topic to inspect reachability insights.
6. Generate day-wise smart schedule from right panel.
7. Use Pomodoro to focus on a selected topic.
8. Export or import full plan via JSON.

---

## Notes

- All data is stored locally in browser storage.
- Imported JSON is validated and dependency IDs are sanitized.
- The app is optimized for desktop and responsive on mobile with collapsible menu.

---

## Repository

GitHub: [Abhi378-2005/StudyGraph--Smart-Study-Planner](https://github.com/Abhi378-2005/StudyGraph--Smart-Study-Planner)

