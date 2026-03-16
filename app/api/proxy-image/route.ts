import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = [
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  "video.googleusercontent.com",
  "video-downloads.googleusercontent.com",
  "cvws.icloud-content.com",
  "icloud-content.com",
];

function isAllowedHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOSTS.some(
      (h) => hostname === h || hostname.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url || !isAllowedHost(url)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const headers: HeadersInit = {};
  
  // Forward Range header for video seeking
  const rangeHeader = req.headers.get("Range");
  if (rangeHeader) {
    headers["Range"] = rangeHeader;
  }

  const upstream = await fetch(url, { headers });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status}` },
      { status: upstream.status }
    );
  }

  if (!upstream.body) {
    return NextResponse.json(
      { error: "No response body" },
      { status: 502 }
    );
  }

  const responseHeaders: HeadersInit = {
    "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
    "Cache-Control": "no-store",
  };

  // Forward content length
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) {
    responseHeaders["Content-Length"] = contentLength;
  }

  // Forward range response headers for video seeking
  const contentRange = upstream.headers.get("Content-Range");
  if (contentRange) {
    responseHeaders["Content-Range"] = contentRange;
  }

  const acceptRanges = upstream.headers.get("Accept-Ranges");
  if (acceptRanges) {
    responseHeaders["Accept-Ranges"] = acceptRanges;
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
