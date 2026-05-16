export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-slate-400">
      <div className="text-sm font-medium text-slate-300">{title}</div>
      {hint && <div className="max-w-md text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
