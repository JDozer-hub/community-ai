import { NextRequest } from "next/server";
import { exportAs, type ExportFormat, type ExportPayload } from "@/lib/exporters";

export const runtime = "nodejs";

const FORMATS: ExportFormat[] = ["html", "markdown", "txt", "json", "csv", "sheets"];

export async function POST(req: NextRequest) {
  let body: { format?: string; payload?: ExportPayload };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const format = body.format as ExportFormat;
  if (!format || !FORMATS.includes(format)) {
    return Response.json(
      { error: `Invalid format. Use one of: ${FORMATS.join(", ")}.` },
      { status: 400 },
    );
  }
  if (!body.payload?.video || !body.payload?.report) {
    return Response.json({ error: "Missing report payload." }, { status: 400 });
  }

  const { content, mime, filename } = exportAs(format, {
    ...body.payload,
    comments: body.payload.comments ?? [],
  });

  return new Response(content, {
    headers: {
      "Content-Type": `${mime}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
