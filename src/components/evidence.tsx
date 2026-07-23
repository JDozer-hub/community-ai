"use client";

import { useState } from "react";
import type { StoredComment } from "@/lib/schema";
import { formatDate, formatNumber } from "@/lib/utils";
import { CornerDownRight, ThumbsUp } from "lucide-react";

export function EvidenceComment({ comment }: { comment: StoredComment }) {
  return (
    <li className="glass-chip rounded-xl px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
          {comment.isReply && (
            <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{comment.author}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" />
            {formatNumber(comment.likeCount)}
          </span>
          <span>{formatDate(comment.publishedAt)}</span>
        </span>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
        “{comment.text.trim()}”
      </p>
    </li>
  );
}

/**
 * Renders evidence comments. Shows a preview, then reveals every related
 * comment on demand so producers can verify why the AI grouped them.
 */
export function EvidenceList({
  comments,
  preview = 3,
}: {
  comments: StoredComment[];
  preview?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground">No example comments.</p>;
  }

  const visible = expanded ? comments : comments.slice(0, preview);

  return (
    <div className="space-y-2">
      <ul
        className={
          expanded
            ? "scroll-thin max-h-80 space-y-2 overflow-y-auto pr-1"
            : "space-y-2"
        }
      >
        {visible.map((c) => (
          <EvidenceComment key={c.commentId} comment={c} />
        ))}
      </ul>
      {comments.length > preview && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {expanded
            ? "Show less"
            : `Show all ${formatNumber(comments.length)} related comments`}
        </button>
      )}
    </div>
  );
}
