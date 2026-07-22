"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EvidenceList } from "@/components/evidence";
import type { ThemeGroup } from "@/lib/schema";
import { formatNumber } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

export function ThemeSectionCard({
  title,
  icon: Icon,
  items,
  accent = "muted",
  emptyLabel = "Nothing notable detected.",
}: {
  title: string;
  icon: LucideIcon;
  items: ThemeGroup[];
  accent?: "muted" | "success" | "warning" | "destructive";
  emptyLabel?: string;
}) {
  const totalMentions = items.reduce((s, i) => s + i.mentionCount, 0);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            {title}
          </CardTitle>
          <Badge variant={accent}>{formatNumber(totalMentions)} mentions</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {items.map((item, idx) => (
              <AccordionItem key={`${item.theme}-${idx}`} value={`${idx}`}>
                <AccordionTrigger className="py-3">
                  <span className="flex w-full items-center justify-between gap-3 pr-2">
                    <span className="truncate text-left font-medium">{item.theme}</span>
                    <Badge variant="muted" className="shrink-0">
                      {formatNumber(item.mentionCount)}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <EvidenceList comments={item.comments} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
