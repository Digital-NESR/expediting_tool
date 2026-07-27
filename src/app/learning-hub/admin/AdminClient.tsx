'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X, Eye, EyeOff, RotateCcw, ExternalLink, Video,
} from 'lucide-react';
import LearningHubSidebar from '../components/LearningHubSidebar';
import LearningHubLogo from '../components/LearningHubLogo';
import LearningHubHero from '../components/LearningHubHero';
import LearningHubHomeButton from '../components/LearningHubHomeButton';
import {
  createCourse, updateCourse, deleteCourse, moveCourse,
  createModule, updateModule, deleteModule, moveModule,
  createLesson, updateLesson, deleteLesson, moveLesson,
  resyncTrackFromSeed,
} from '@/app/actions/learning-hub';
import type {
  LearningHubAdminData, AdminCourseWithModules, AdminModuleWithLessons, LearningLesson, CourseStatus,
} from '@/types/learning-hub';

const BTN = 'inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700';
const BTN_DANGER = 'inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600';

/* ── Lesson row ───────────────────────────────────────────────────────── */

function LessonAdmin({ lesson, moduleId, onChanged }: { lesson: LearningLesson; moduleId: number; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  const [body, setBody] = useState(lesson.body);
  const [videoUrl, setVideoUrl] = useState(lesson.video_url ?? '');
  const [duration, setDuration] = useState(lesson.duration_minutes);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateLesson(lesson.id, { title, body, video_url: videoUrl.trim() || null, duration_minutes: duration });
      setEditing(false);
      onChanged();
    });
  }
  function remove() {
    if (!confirm(`Delete lesson "${lesson.title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteLesson(lesson.id);
      onChanged();
    });
  }
  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      await moveLesson(moduleId, lesson.id, direction);
      onChanged();
    });
  }

  if (editing) {
    return (
      <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Video URL (optional)</label>
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="SharePoint/Stream embed URL, or /learning-hub/… local file"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
          <p className="mt-1 text-xs text-slate-400">Use the SharePoint/Stream &ldquo;Embed&rdquo; link (not the regular share link) so it plays inline.</p>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Lesson body (paragraphs separated by a blank line)"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Duration (min)</label>
          <input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 1)}
            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
          <div className="ml-auto flex gap-2">
            <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={isPending} className="rounded-lg bg-[#307c4c] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#276041] disabled:opacity-60">Save</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
      {lesson.video_url && <Video className="h-3.5 w-3.5 shrink-0 text-[#307c4c]" />}
      <span className="flex-1 truncate text-sm text-slate-700">{lesson.title}</span>
      <span className="shrink-0 text-xs text-slate-400">{lesson.duration_minutes} min</span>
      <button onClick={() => move('up')} className={BTN} title="Move up"><ChevronUp className="h-4 w-4" /></button>
      <button onClick={() => move('down')} className={BTN} title="Move down"><ChevronDown className="h-4 w-4" /></button>
      <button onClick={() => setEditing(true)} className={BTN} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={remove} disabled={isPending} className={BTN_DANGER} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

/* ── New lesson form ──────────────────────────────────────────────────── */

function NewLessonForm({ moduleId, onChanged }: { moduleId: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(10);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    startTransition(async () => {
      await createLesson(moduleId, title.trim(), body.trim() || 'TODO: add lesson content.', duration, videoUrl.trim() || null);
      setTitle(''); setBody(''); setVideoUrl(''); setDuration(10); setOpen(false);
      onChanged();
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-xs font-semibold text-[#307c4c] hover:bg-[#307c4c]/5">
        <Plus className="h-3.5 w-3.5" /> Add lesson
      </button>
    );
  }
  return (
    <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-4">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" autoFocus
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
      <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Video URL (optional — SharePoint/Stream embed link)"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Lesson body (optional — can fill in later)"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-500">Duration (min)</label>
        <input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 1)}
          className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
        <div className="ml-auto flex gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={isPending} className="rounded-lg bg-[#307c4c] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#276041] disabled:opacity-60">Add</button>
        </div>
      </div>
    </div>
  );
}

/* ── Module block ─────────────────────────────────────────────────────── */

function ModuleAdmin({ mod, courseId, onChanged }: { mod: AdminModuleWithLessons; courseId: number; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(mod.title);
  const [resourceLabel, setResourceLabel] = useState(mod.resource_label ?? '');
  const [resourceUrl, setResourceUrl] = useState(mod.resource_url ?? '');
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateModule(mod.id, { title, resource_label: resourceLabel.trim() || null, resource_url: resourceUrl.trim() || null });
      setEditing(false);
      onChanged();
    });
  }
  function cancel() {
    setTitle(mod.title);
    setResourceLabel(mod.resource_label ?? '');
    setResourceUrl(mod.resource_url ?? '');
    setEditing(false);
  }
  function remove() {
    if (!confirm(`Delete module "${mod.title}" and all its lessons?`)) return;
    startTransition(async () => {
      await deleteModule(mod.id);
      onChanged();
    });
  }
  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      await moveModule(courseId, mod.id, direction);
      onChanged();
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5">
        {editing ? (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
            <button onClick={save} disabled={isPending} className={BTN} title="Save"><Check className="h-4 w-4 text-[#307c4c]" /></button>
            <button onClick={cancel} className={BTN} title="Cancel"><X className="h-4 w-4" /></button>
          </>
        ) : (
          <>
            <span className="flex-1 truncate text-sm font-bold text-slate-800">{mod.title}</span>
            <button onClick={() => move('up')} className={BTN} title="Move up"><ChevronUp className="h-4 w-4" /></button>
            <button onClick={() => move('down')} className={BTN} title="Move down"><ChevronDown className="h-4 w-4" /></button>
            <button onClick={() => setEditing(true)} className={BTN} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={remove} disabled={isPending} className={BTN_DANGER} title="Delete module"><Trash2 className="h-3.5 w-3.5" /></button>
          </>
        )}
      </div>
      {editing && (
        <div className="grid grid-cols-1 gap-2 border-t border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Resource label (optional)</label>
            <input value={resourceLabel} onChange={(e) => setResourceLabel(e.target.value)} placeholder="e.g. NESR SAP Training Hub"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Resource URL (optional)</label>
            <input value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
          </div>
          <p className="text-xs text-slate-400 sm:col-span-2">When both are set, this renders as a linked resource box at the top of the module on the course page.</p>
        </div>
      )}
      {!editing && mod.resource_label && mod.resource_url && (
        <a
          href={mod.resource_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 border-t border-slate-100 bg-[#307c4c]/5 px-4 py-2 text-xs font-semibold text-[#307c4c] hover:bg-[#307c4c]/10"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{mod.resource_label}</span>
        </a>
      )}
      <div>
        {mod.lessons.map((l) => <LessonAdmin key={l.id} lesson={l} moduleId={mod.id} onChanged={onChanged} />)}
        <NewLessonForm moduleId={mod.id} onChanged={onChanged} />
      </div>
    </div>
  );
}

/* ── New module form ──────────────────────────────────────────────────── */

function NewModuleForm({ courseId, onChanged }: { courseId: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    startTransition(async () => {
      await createModule(courseId, title.trim());
      setTitle(''); setOpen(false);
      onChanged();
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs font-semibold text-[#307c4c] hover:underline">
        <Plus className="h-3.5 w-3.5" /> Add module
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Module title" autoFocus
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
      <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
      <button onClick={submit} disabled={isPending} className="rounded-lg bg-[#307c4c] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#276041] disabled:opacity-60">Add</button>
    </div>
  );
}

/* ── Course card ───────────────────────────────────────────────────────── */

function CourseAdmin({ course, trackId, onChanged }: { course: AdminCourseWithModules; trackId: number; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? '');
  const [status, setStatus] = useState<CourseStatus>(course.status);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateCourse(course.id, { title, description, status });
      setEditing(false);
      onChanged();
    });
  }
  function togglePublish() {
    const nextStatus: CourseStatus = course.status === 'published' ? 'draft' : 'published';
    startTransition(async () => {
      await updateCourse(course.id, { title: course.title, description: course.description ?? '', status: nextStatus });
      onChanged();
    });
  }
  function remove() {
    if (!confirm(`Delete course "${course.title}" and everything in it? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteCourse(course.id);
      onChanged();
    });
  }
  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      await moveCourse(trackId, course.id, direction);
      onChanged();
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {editing ? (
        <div className="space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Course description"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
          <div className="flex items-center gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as CourseStatus)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={save} disabled={isPending} className="rounded-lg bg-[#307c4c] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#276041] disabled:opacity-60">Save</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-bold text-slate-900">{course.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${course.status === 'published' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                {course.status === 'published' ? 'Published' : 'Draft'}
              </span>
            </div>
            {course.description && <p className="mt-1 text-sm text-slate-500">{course.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => move('up')} className={BTN} title="Move up"><ChevronUp className="h-4 w-4" /></button>
            <button onClick={() => move('down')} className={BTN} title="Move down"><ChevronDown className="h-4 w-4" /></button>
            <button onClick={togglePublish} disabled={isPending} className={BTN} title={course.status === 'published' ? 'Unpublish' : 'Publish'}>
              {course.status === 'published' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => setEditing(true)} className={BTN} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={remove} disabled={isPending} className={BTN_DANGER} title="Delete course"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      <div className="space-y-2 pl-1">
        {course.modules.map((m) => <ModuleAdmin key={m.id} mod={m} courseId={course.id} onChanged={onChanged} />)}
        <NewModuleForm courseId={course.id} onChanged={onChanged} />
      </div>
    </div>
  );
}

/* ── New course form ──────────────────────────────────────────────────── */

function NewCourseForm({ trackId, onChanged }: { trackId: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    startTransition(async () => {
      await createCourse(trackId, title.trim(), description.trim(), 'draft');
      setTitle(''); setDescription(''); setOpen(false);
      onChanged();
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-200 py-4 text-sm font-semibold text-slate-400 transition-colors hover:border-[#307c4c]/40 hover:text-[#307c4c]">
        <Plus className="h-4 w-4" /> New course
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" autoFocus
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Course description"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20" />
      <p className="text-xs text-slate-400">New courses start as a draft — publish once content is ready.</p>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button onClick={submit} disabled={isPending} className="rounded-lg bg-[#307c4c] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#276041] disabled:opacity-60">Create</button>
      </div>
    </div>
  );
}

/* ── Reset track to defaults ──────────────────────────────────────────── */

function ResetTrackButton({ trackKey, trackName, onChanged }: { trackKey: string; trackName: string; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function reset() {
    if (!confirm(
      `Reset "${trackName}" to its built-in default content?\n\n` +
      `This deletes every course, module, and lesson currently under this track (and everyone's ` +
      `progress on them) and replaces it with what's defined in code. This cannot be undone.`,
    )) return;
    setMessage(null);
    startTransition(async () => {
      const result = await resyncTrackFromSeed(trackKey);
      setMessage(result.message);
      onChanged();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={reset}
        disabled={isPending}
        title="Delete this track's content and reload the built-in defaults from code"
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {isPending ? 'Resetting…' : 'Reset to defaults'}
      </button>
      {message && <span className="text-xs text-slate-400">{message}</span>}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function AdminClient({ data }: { data: LearningHubAdminData }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(data.tracks[0]?.key ?? '');
  const router = useRouter();

  function onChanged() {
    router.refresh();
  }

  const selectedTrack = data.tracks.find((t) => t.key === selectedKey) ?? data.tracks[0];

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <LearningHubSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <LearningHubHomeButton />
        <LearningHubLogo size="sm" />
        <span className="text-sm font-semibold text-slate-900">Learning Hub Admin</span>
      </header>
      <main className="mx-auto max-w-[1000px] space-y-6 px-4 py-6 sm:px-6">
        <LearningHubHero title="Content Admin" subtitle="Create, edit, reorder, and publish courses, modules, and lessons for each track." />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {data.tracks.map((t) => (
              <button
                key={t.key}
                onClick={() => setSelectedKey(t.key)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  selectedTrack?.key === t.key ? 'bg-[#307c4c] text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t.name} <span className="ml-1 opacity-70">({t.courses.length})</span>
              </button>
            ))}
          </div>
          {selectedTrack && (
            <ResetTrackButton trackKey={selectedTrack.key} trackName={selectedTrack.name} onChanged={onChanged} />
          )}
        </div>

        {selectedTrack && (
          <div className="space-y-4">
            {selectedTrack.courses.map((c) => (
              <CourseAdmin key={c.id} course={c} trackId={selectedTrack.id} onChanged={onChanged} />
            ))}
            <NewCourseForm trackId={selectedTrack.id} onChanged={onChanged} />
          </div>
        )}
      </main>
    </div>
  );
}
