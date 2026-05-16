export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-text-secondary">
      <div className="text-[13px] font-medium text-text-primary">{title}</div>
      {hint && <div className="max-w-md text-[12px] text-text-secondary">{hint}</div>}
    </div>
  );
}
