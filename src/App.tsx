import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type TopicStatus = "pending" | "in-progress" | "completed";
type ViewMode = "graph" | "hasse";

type Subject = { id: string; name: string; color: string };
type Topic = {
  id: string;
  subjectId: string;
  name: string;
  status: TopicStatus;
  prerequisites: string[];
  x?: number;
  y?: number;
};
type ScheduleDay = { day: number; topicIds: string[] };

type Store = {
  subjects: Subject[];
  topics: Topic[];
  viewMode: ViewMode;
};

type DragState = { topicId: string } | null;

const SUBJECT_COLORS = ["#8b5cf6", "#06b6d4", "#22c55e", "#f59e0b", "#ec4899"];
const STORAGE_KEY = "studygraph-state";

const seedSubjects: Subject[] = [
  { id: crypto.randomUUID(), name: "Math", color: SUBJECT_COLORS[0] },
  { id: crypto.randomUUID(), name: "OS", color: SUBJECT_COLORS[1] },
];

const seedTopics: Topic[] = [
  { id: crypto.randomUUID(), subjectId: seedSubjects[0].id, name: "Sets", status: "completed", prerequisites: [] },
  { id: crypto.randomUUID(), subjectId: seedSubjects[0].id, name: "Relations", status: "in-progress", prerequisites: [] },
  { id: crypto.randomUUID(), subjectId: seedSubjects[0].id, name: "Posets", status: "pending", prerequisites: [] },
  { id: crypto.randomUUID(), subjectId: seedSubjects[1].id, name: "Processes", status: "completed", prerequisites: [] },
  { id: crypto.randomUUID(), subjectId: seedSubjects[1].id, name: "Scheduling", status: "pending", prerequisites: [] },
];

seedTopics[2].prerequisites = [seedTopics[0].id, seedTopics[1].id];
seedTopics[4].prerequisites = [seedTopics[3].id];

const initialState: Store = { subjects: seedSubjects, topics: seedTopics, viewMode: "graph" };

const statusColor: Record<TopicStatus, string> = {
  pending: "#6b7280",
  "in-progress": "#facc15",
  completed: "#22c55e",
};

function parseStore(): Store {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState;
  try {
    const parsed = JSON.parse(raw) as Store;
    if (!parsed.subjects || !parsed.topics) return initialState;
    return parsed;
  } catch {
    return initialState;
  }
}

function adjacency(topics: Topic[]) {
  const index = new Map(topics.map((t, i) => [t.id, i]));
  const matrix = Array.from({ length: topics.length }, () => Array(topics.length).fill(0));
  topics.forEach((topic, dep) => {
    topic.prerequisites.forEach((preId) => {
      const pre = index.get(preId);
      if (pre !== undefined) matrix[pre][dep] = 1;
    });
  });
  return { matrix, index };
}

function warshall(matrix: number[][]) {
  const n = matrix.length;
  const reach = matrix.map((r) => [...r]);
  for (let i = 0; i < n; i += 1) reach[i][i] = 1;
  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (!reach[i][j]) reach[i][j] = reach[i][k] && reach[k][j] ? 1 : 0;
      }
    }
  }
  return reach;
}

function topologicalSort(topics: Topic[]) {
  const { matrix } = adjacency(topics);
  const n = topics.length;
  const indegree = Array(n).fill(0);
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) if (matrix[i][j]) indegree[j] += 1;
  const queue = indegree.map((v, i) => (v === 0 ? i : -1)).filter((v) => v >= 0);
  const order: number[] = [];
  while (queue.length) {
    const cur = queue.shift() as number;
    order.push(cur);
    for (let j = 0; j < n; j += 1) {
      if (matrix[cur][j]) {
        indegree[j] -= 1;
        if (indegree[j] === 0) queue.push(j);
      }
    }
  }
  return order.length === n ? order : [];
}

function App() {
  const [store, setStore] = useState<Store>(() => parseStore());
  const [newSubject, setNewSubject] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [topicSubject, setTopicSubject] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [days, setDays] = useState(7);
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [mobileLeft, setMobileLeft] = useState(false);
  const [toast, setToast] = useState("");
  const [pomodoroTopicId, setPomodoroTopicId] = useState("");
  const [pomodoroMinutes, setPomodoroMinutes] = useState(25);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [dragging, setDragging] = useState<DragState>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(store)), [store]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!topicSubject && store.subjects[0]) setTopicSubject(store.subjects[0].id);
  }, [store.subjects, topicSubject]);
  useEffect(() => {
    setRemainingSeconds(pomodoroMinutes * 60);
    setIsRunning(false);
  }, [pomodoroMinutes, pomodoroTopicId]);
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((cur) => {
        if (cur <= 1) {
          setIsRunning(false);
          setToast("Pomodoro complete. Take a short break.");
          return 0;
        }
        return cur - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const topicMap = useMemo(() => new Map(store.topics.map((t) => [t.id, t])), [store.topics]);
  const { matrix, index } = useMemo(() => adjacency(store.topics), [store.topics]);
  const closure = useMemo(() => warshall(matrix), [matrix]);

  const hasCycle = useMemo(() => {
    for (let i = 0; i < closure.length; i += 1) if (closure[i][i] && matrix[i][i] !== 0) return true;
    for (let i = 0; i < closure.length; i += 1) {
      for (let j = i + 1; j < closure.length; j += 1) {
        if (closure[i][j] && closure[j][i]) return true;
      }
    }
    return false;
  }, [closure, matrix]);

  const stats = useMemo(() => {
    const T = new Set(store.topics.map((t) => t.id));
    const C = new Set(store.topics.filter((t) => t.status === "completed").map((t) => t.id));
    const L = new Set(
      store.topics
        .filter((t) => t.status !== "completed")
        .filter((t) => t.prerequisites.some((p) => topicMap.get(p)?.status !== "completed"))
        .map((t) => t.id),
    );
    const U = new Set(
      store.topics
        .filter((t) => t.status === "pending")
        .filter((t) => !L.has(t.id))
        .map((t) => t.id),
    );
    return { T, C, L, U, progress: T.size ? (C.size / T.size) * 100 : 0 };
  }, [store.topics, topicMap]);

  const unlocked = (topic: Topic) =>
    topic.status !== "completed" && topic.prerequisites.every((id) => topicMap.get(id)?.status === "completed");

  const selectedInfo = useMemo(() => {
    if (!selectedTopic || !index.has(selectedTopic)) return null;
    const i = index.get(selectedTopic) as number;
    const mustBefore = store.topics.filter((_, j) => closure[j][i] && j !== i).map((t) => t.name);
    const unlockAfter = store.topics.filter((_, j) => closure[i][j] && j !== i).map((t) => t.name);
    return { mustBefore, unlockAfter };
  }, [selectedTopic, index, closure, store.topics]);

  const addSubject = () => {
    if (!newSubject.trim()) return;
    const subject: Subject = {
      id: crypto.randomUUID(),
      name: newSubject.trim(),
      color: SUBJECT_COLORS[store.subjects.length % SUBJECT_COLORS.length],
    };
    setStore((s) => ({ ...s, subjects: [...s.subjects, subject] }));
    setNewSubject("");
  };

  const addTopic = () => {
    if (!newTopic.trim() || !topicSubject) return;
    const t: Topic = {
      id: crypto.randomUUID(),
      subjectId: topicSubject,
      name: newTopic.trim(),
      status: "pending",
      prerequisites: [],
      x: 260 + Math.random() * 380,
      y: 120 + Math.random() * 250,
    };
    setStore((s) => ({ ...s, topics: [...s.topics, t] }));
    setNewTopic("");
  };

  const updateTopic = (topicId: string, patch: Partial<Topic>) =>
    setStore((s) => ({ ...s, topics: s.topics.map((t) => (t.id === topicId ? { ...t, ...patch } : t)) }));

  const deleteSubject = (id: string) =>
    setStore((s) => {
      const remainingTopics = s.topics.filter((t) => t.subjectId !== id);
      const remainingIds = new Set(remainingTopics.map((t) => t.id));
      return {
        ...s,
        subjects: s.subjects.filter((sub) => sub.id !== id),
        topics: remainingTopics.map((t) => ({ ...t, prerequisites: t.prerequisites.filter((p) => remainingIds.has(p)) })),
      };
    });

  const deleteTopic = (id: string) =>
    setStore((s) => ({ ...s, topics: s.topics.filter((t) => t.id !== id).map((t) => ({ ...t, prerequisites: t.prerequisites.filter((p) => p !== id) })) }));

  const generateSchedule = () => {
    const order = topologicalSort(store.topics);
    if (!order.length) return setSchedule([]);
    const chunks: ScheduleDay[] = Array.from({ length: days }, (_, i) => ({ day: i + 1, topicIds: [] }));
    order.forEach((idx, i) => chunks[i % days].topicIds.push(store.topics[idx].id));
    setSchedule(chunks.filter((c) => c.topicIds.length));
  };

  const exportSchedule = async () => {
    const text = schedule
      .map((d) => `Day ${d.day}\n${d.topicIds.map((id) => `- ${topicMap.get(id)?.name ?? "Unknown"}`).join("\n")}`)
      .join("\n\n");
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setToast("Schedule copied to clipboard.");
  };

  const exportPlanJson = async () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      days,
      schedule,
      store,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setToast("Full study plan JSON copied.");
  };

  const importPlanJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as {
          days?: number;
          schedule?: ScheduleDay[];
          store?: Store;
        };
        if (!parsed.store?.subjects || !parsed.store?.topics) {
          setToast("Invalid JSON format.");
          return;
        }
        const topicIds = new Set(parsed.store.topics.map((t) => t.id));
        const cleanTopics = parsed.store.topics.map((t) => ({
          ...t,
          prerequisites: t.prerequisites.filter((pid) => topicIds.has(pid)),
        }));
        setStore({
          subjects: parsed.store.subjects,
          topics: cleanTopics,
          viewMode: parsed.store.viewMode === "hasse" ? "hasse" : "graph",
        });
        setDays(Math.max(1, parsed.days ?? 7));
        setSchedule(Array.isArray(parsed.schedule) ? parsed.schedule : []);
        setToast("Study plan imported successfully.");
      } catch {
        setToast("Could not parse imported JSON.");
      }
    };
    reader.readAsText(file);
  };

  const levels = useMemo(() => {
    const order = topologicalSort(store.topics);
    const map = new Map<string, number>();
    order.forEach((idx) => {
      const t = store.topics[idx];
      const level = t.prerequisites.length ? Math.max(...t.prerequisites.map((p) => map.get(p) ?? 0)) + 1 : 0;
      map.set(t.id, level);
    });
    return map;
  }, [store.topics]);

  const positioned = useMemo(() => {
    if (store.viewMode === "hasse") {
      const levelGroups = new Map<number, Topic[]>();
      store.topics.forEach((t) => {
        const level = levels.get(t.id) ?? 0;
        if (!levelGroups.has(level)) levelGroups.set(level, []);
        levelGroups.get(level)?.push(t);
      });
      const sortedLevels = [...levelGroups.keys()].sort((a, b) => a - b);
      return store.topics.map((t) => {
        const level = levels.get(t.id) ?? 0;
        const row = sortedLevels.indexOf(level);
        const group = levelGroups.get(level) ?? [];
        const col = group.findIndex((x) => x.id === t.id);
        return { ...t, x: ((col + 1) * 880) / (group.length + 1), y: 80 + row * 120 };
      });
    }
    return store.topics.map((t, i) => {
      if (typeof t.x === "number" && typeof t.y === "number") return t;
      const angle = (2 * Math.PI * i) / Math.max(1, store.topics.length);
      return { ...t, x: 440 + 290 * Math.cos(angle), y: 240 + 180 * Math.sin(angle) };
    });
  }, [store.topics, store.viewMode, levels]);

  const formatTime = (seconds: number) => {
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging || store.viewMode !== "graph" || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 900;
    const y = ((event.clientY - rect.top) / rect.height) * 520;
    const boundedX = Math.max(35, Math.min(865, x));
    const boundedY = Math.max(35, Math.min(485, y));
    updateTopic(dragging.topicId, { x: boundedX, y: boundedY });
  };

  const pomodoroProgress = (remainingSeconds / Math.max(60, pomodoroMinutes * 60)) * 100;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1700px] p-4 md:p-6">
        <header className="glass mb-4 flex items-center justify-between p-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-cyan-300">StudyGraph - Smart Study Planner</h1>
            <p className="text-sm text-slate-300">DAG planning powered by Warshall, Topological Sort, and Set Theory.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={exportPlanJson}>Export JSON</button>
            <label className="btn cursor-pointer">
              Import JSON
              <input
                className="hidden"
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importPlanJson(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <button className="btn md:hidden" onClick={() => setMobileLeft((v) => !v)}>
              Menu
            </button>
          </div>
        </header>
        {toast ? <div className="mb-3 rounded-lg border border-emerald-400/30 bg-emerald-500/20 p-2 text-sm text-emerald-200">{toast}</div> : null}

        <div className="mb-4 h-3 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-emerald-400 transition-all duration-700" style={{ width: `${stats.progress}%` }} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[360px_1fr_360px]">
          <aside className={`glass p-4 ${mobileLeft ? "block" : "hidden"} xl:block`}>
            <h2 className="panel-title">Topic Manager</h2>
            <div className="mt-3 space-y-2">
              <input className="input" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Add subject..." />
              <button className="btn w-full" onClick={addSubject}>Add Subject</button>
            </div>

            <div className="mt-4 space-y-2">
              <select className="input" value={topicSubject} onChange={(e) => setTopicSubject(e.target.value)}>
                {store.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className="input" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Add topic..." />
              <button className="btn w-full" onClick={addTopic}>Add Topic</button>
            </div>

            <div className="mt-4 space-y-3 max-h-[55vh] overflow-auto pr-1">
              {store.subjects.map((subject) => (
                <div key={subject.id} className="rounded-xl border border-white/10 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color }} />
                      <span className="font-medium">{subject.name}</span>
                    </div>
                    <button className="text-xs text-rose-300 hover:text-rose-200" onClick={() => deleteSubject(subject.id)}>Delete</button>
                  </div>
                  <div className="space-y-2">
                    {store.topics.filter((t) => t.subjectId === subject.id).map((topic) => (
                      <div key={topic.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{topic.name}</span>
                          <button className="text-xs text-rose-300" onClick={() => deleteTopic(topic.id)}>x</button>
                        </div>
                        <select className="input mt-2 text-xs" value={topic.status} onChange={(e) => updateTopic(topic.id, { status: e.target.value as TopicStatus })}>
                          <option value="pending">Pending</option>
                          <option value="in-progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                        <select
                          className="input mt-2 text-xs"
                          value=""
                          onChange={(e) => {
                            const p = e.target.value;
                            if (!p || topic.prerequisites.includes(p) || p === topic.id) return;
                            updateTopic(topic.id, { prerequisites: [...topic.prerequisites, p] });
                          }}
                        >
                          <option value="">Add prerequisite...</option>
                          {store.topics.filter((t) => t.id !== topic.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {topic.prerequisites.map((pid) => (
                            <button key={pid} className="rounded-full border border-cyan-300/40 px-2 py-0.5 text-[10px] text-cyan-200" onClick={() => updateTopic(topic.id, { prerequisites: topic.prerequisites.filter((x) => x !== pid) })}>
                              {topicMap.get(pid)?.name} x
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className="glass p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="panel-title">Dependency Visualizer</h2>
              <button className="btn" onClick={() => setStore((s) => ({ ...s, viewMode: s.viewMode === "graph" ? "hasse" : "graph" }))}>
                {store.viewMode === "graph" ? "Hasse View" : "Graph View"}
              </button>
            </div>
            {hasCycle && <div className="mb-2 rounded-lg border border-rose-500/40 bg-rose-500/20 p-2 text-sm text-rose-200">Cycle detected in prerequisites. Schedule generation requires a DAG.</div>}
            <div className="relative overflow-auto rounded-xl border border-white/10 bg-slate-900/80">
              <svg
                ref={svgRef}
                viewBox="0 0 900 520"
                className="h-[520px] w-full min-w-[900px]"
                onPointerMove={handlePointerMove}
                onPointerUp={() => setDragging(null)}
                onPointerLeave={() => setDragging(null)}
              >
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L7,3 z" fill="#67e8f9" />
                  </marker>
                </defs>
                {positioned.map((topic) =>
                  topic.prerequisites.map((pid) => {
                    const from = positioned.find((t) => t.id === pid);
                    if (!from || topic.x === undefined || topic.y === undefined || from.x === undefined || from.y === undefined) return null;
                    return <line key={`${pid}-${topic.id}`} x1={from.x} y1={from.y} x2={topic.x} y2={topic.y} stroke="#67e8f9" strokeWidth={1.5} markerEnd="url(#arrow)" opacity={0.8} />;
                  }),
                )}
                {positioned.map((topic) => {
                  const color = unlocked(topic) ? "#38bdf8" : statusColor[topic.status];
                  return (
                    <g key={topic.id}>
                      <circle
                        cx={topic.x}
                        cy={topic.y}
                        r={26}
                        fill={color}
                        className={`transition-all duration-500 ${store.viewMode === "graph" ? "cursor-grab active:cursor-grabbing" : ""}`}
                        onPointerDown={(event) => {
                          if (store.viewMode !== "graph") return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDragging({ topicId: topic.id });
                        }}
                      />
                      <text x={topic.x} y={(topic.y ?? 0) + 43} className="fill-slate-200 text-[11px]" textAnchor="middle">{topic.name}</text>
                      <title>{`${topic.name}\nDirect prerequisites: ${topic.prerequisites.map((p) => topicMap.get(p)?.name).join(", ") || "None"}`}</title>
                    </g>
                  );
                })}
              </svg>
            </div>
            <p className="mt-2 text-xs text-cyan-200/80">{store.viewMode === "graph" ? "Tip: drag nodes to customize graph layout." : "Hasse view auto-layers topics by dependency levels."}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select className="input" value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}>
                <option value="">Select topic for reachability...</option>
                {store.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-2 text-xs">
                <div>Must complete before: {selectedInfo?.mustBefore.join(", ") || "-"}</div>
                <div className="mt-1">Unlocks after done: {selectedInfo?.unlockAfter.join(", ") || "-"}</div>
              </div>
            </div>
          </main>

          <aside className="glass p-4">
            <h2 className="panel-title">Smart Schedule</h2>
            <div className="mt-3 flex gap-2">
              <input className="input" type="number" min={1} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} />
              <button className="btn" onClick={generateSchedule}>Generate</button>
              <button className="btn" onClick={exportSchedule}>Copy</button>
            </div>
            <div className="mt-3 max-h-[64vh] space-y-2 overflow-auto pr-1">
              {schedule.map((day) => (
                <div key={day.day} className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
                  <div className="mb-1 text-sm font-semibold text-violet-200">Day {day.day}</div>
                  <div className="space-y-1 text-sm text-slate-200">
                    {day.topicIds.map((id) => <div key={id}>- {topicMap.get(id)?.name}</div>)}
                  </div>
                </div>
              ))}
              {!schedule.length && <div className="rounded-xl border border-white/10 p-3 text-sm text-slate-300">Generate a plan to view day-wise study cards.</div>}
            </div>
            <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
              <h3 className="text-sm font-semibold text-emerald-200">Pomodoro Session</h3>
              <div className="mt-2 grid grid-cols-[1fr_120px] gap-2">
                <select className="input text-sm" value={pomodoroTopicId} onChange={(e) => setPomodoroTopicId(e.target.value)}>
                  <option value="">Select topic...</option>
                  {store.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input className="input text-sm" type="number" min={5} max={90} value={pomodoroMinutes} onChange={(e) => setPomodoroMinutes(Math.max(5, Math.min(90, Number(e.target.value) || 25)))} />
              </div>
              <div className="mt-3 text-center text-3xl font-bold tracking-widest text-emerald-100">{formatTime(remainingSeconds)}</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-700" style={{ width: `${pomodoroProgress}%` }} />
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn" onClick={() => setIsRunning((v) => !v)} disabled={!pomodoroTopicId || remainingSeconds === 0}>
                  {isRunning ? "Pause" : "Start"}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setIsRunning(false);
                    setRemainingSeconds(pomodoroMinutes * 60);
                  }}
                >
                  Reset
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    if (!pomodoroTopicId) return;
                    updateTopic(pomodoroTopicId, { status: "in-progress" });
                    setToast("Topic marked as In Progress.");
                  }}
                >
                  Focus
                </button>
              </div>
            </div>
          </aside>
        </div>

        <footer className="glass mt-4 grid gap-2 p-4 text-sm md:grid-cols-5">
          <div>|T| = {stats.T.size}</div>
          <div>|C| subset T = {stats.C.size}</div>
          <div>|L| = {stats.L.size}</div>
          <div>|U| = {stats.U.size}</div>
          <div>Progress = {stats.progress.toFixed(1)}%</div>
        </footer>
      </div>
    </div>
  );
}

export default App;
