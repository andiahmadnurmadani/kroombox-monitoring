"use client";

/** Edit / delete buttons in a card's top-right corner: always visible on touch
 * screens, revealed on hover (or keyboard focus) on larger ones. */
export default function CardActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="absolute right-3 top-3 flex gap-1 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
      <button
        onClick={onEdit}
        className="rounded bg-neutral-900/80 p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        title="Edit"
        aria-label="Edit"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
      <button
        onClick={onDelete}
        className="rounded bg-neutral-900/80 p-1.5 text-neutral-400 hover:bg-red-900/60 hover:text-red-200"
        title="Hapus"
        aria-label="Hapus"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      </button>
    </div>
  );
}
