"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import type { StoredComment } from "@/lib/schema";
import { MessageSquare, Search, ThumbsUp } from "lucide-react";

type FilterKind = "all" | "top" | "replies";
type SortKind = "likes" | "newest" | "oldest";

const PAGE_SIZE = 50;

export function CommentExplorer({ comments }: { comments: StoredComment[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [sort, setSort] = useState<SortKind>("likes");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = comments.filter((c) => {
      if (filter === "top" && c.isReply) return false;
      if (filter === "replies" && !c.isReply) return false;
      if (q && !c.text.toLowerCase().includes(q) && !c.author.toLowerCase().includes(q))
        return false;
      return true;
    });

    result.sort((a, b) => {
      if (sort === "likes") return b.likeCount - a.likeCount;
      const at = new Date(a.publishedAt).getTime();
      const bt = new Date(b.publishedAt).getTime();
      return sort === "newest" ? bt - at : at - bt;
    });
    return result;
  }, [comments, query, filter, sort]);

  const visible = filtered.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Comment Database
            <Badge variant="muted">{formatNumber(comments.length)}</Badge>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE_SIZE);
                }}
                placeholder="Search comments…"
                className="h-9 w-56 pl-8"
              />
            </div>
            <SegButton
              options={[
                { v: "all", label: "All" },
                { v: "top", label: "Top-level" },
                { v: "replies", label: "Replies" },
              ]}
              value={filter}
              onChange={(v) => {
                setFilter(v as FilterKind);
                setLimit(PAGE_SIZE);
              }}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKind)}
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="likes">Sort: Most liked</option>
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Sort: Oldest</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Showing {formatNumber(Math.min(limit, filtered.length))} of{" "}
          {formatNumber(filtered.length)} matching comments
        </p>
        <div className="scroll-thin max-h-[560px] space-y-2 overflow-y-auto pr-1">
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No comments match your filters.
            </p>
          )}
          {visible.map((c) => (
            <div
              key={c.commentId}
              className={cn(
                "rounded-lg border border-border p-3",
                c.isReply && "ml-5 border-l-2 border-l-muted-foreground/30 bg-muted/30",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {c.author}
                  {c.isReply && (
                    <Badge variant="outline" className="text-[10px]">
                      reply
                    </Badge>
                  )}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ThumbsUp className="h-3 w-3" />
                  {formatNumber(c.likeCount)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                {c.text}
              </p>
            </div>
          ))}
        </div>
        {limit < filtered.length && (
          <button
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
            className="mt-3 w-full rounded-md border border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Load more ({formatNumber(filtered.length - limit)} remaining)
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function SegButton({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex h-9 items-center rounded-md border border-border bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.v
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
