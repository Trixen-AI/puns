import type {ReactNode} from "react";

/** An empty screen is an invitation to act, not an apology. */
export function Empty({title, body, action}: {title: string; body: string; action?: ReactNode}) {
  return (
    <div className="border-t border-rule py-20 text-center">
      <p className="display-3 text-ink">{title}</p>
      <p className="prose-tight mx-auto mt-3 max-w-[42ch]">{body}</p>
      {action && <div className="mt-7 flex justify-center">{action}</div>}
    </div>
  );
}

/** Errors say what happened and what to do, in the interface's voice. */
export function Failed({body, onRetry}: {body: string; onRetry?: () => void}) {
  return (
    <div className="border-t border-rule py-20 text-center">
      <p className="display-3 text-ink">That did not load</p>
      <p className="prose-tight mx-auto mt-3 max-w-[42ch]">{body}</p>
      {onRetry && (
        <div className="mt-7 flex justify-center">
          <button type="button" onClick={onRetry} className="btn btn-quiet">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

/** Skeleton rows that match the shape of what is coming. */
export function Loading({rows = 6}: {rows?: number}) {
  return (
    <div>
      {Array.from({length: rows}, (_, i) => (
        <div key={i} className="row flex items-center gap-4 py-6">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-[2px] bg-paper-block" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded-[2px] bg-paper-block" />
            <div className="h-2.5 w-24 animate-pulse rounded-[2px] bg-paper-block" />
          </div>
          <div className="h-2.5 w-20 animate-pulse rounded-[2px] bg-paper-block" />
        </div>
      ))}
    </div>
  );
}
