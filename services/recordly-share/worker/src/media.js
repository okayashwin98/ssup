// Adapted from Voom (MIT), Copyright (c) 2026 Aritro Paul.
// See ../../LICENSE and ../../../../THIRD_PARTY_NOTICES.md for attribution.

import { verifyPasswordAuth } from './auth.js';
import { getCreatorProfile } from "./profile.js";
import { jsonResponse } from './http.js';
import { finiteNonnegative } from './video.js';

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(isoString) {
  const d = new Date(isoString + 'Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatVTTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ms = Math.floor((s % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function titleVersion(title) {
  let hash = 0;
  for (const char of String(title)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash.toString(36);
}

export function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// --- Video Streaming ---

export async function handleVideoStream(request, env, shareCode) {
  const video = await env.DB.prepare(
    "SELECT * FROM videos WHERE share_code = ? AND upload_completed = 1 AND datetime(expires_at) > datetime('now')"
  )
    .bind(shareCode)
    .first();

  if (!video) return new Response('Not found', { status: 404 });

  // Password protection check for video stream
  if (video.password_hash) {
    const authed = await verifyPasswordAuth(request, env, shareCode, video);
    if (!authed) return new Response('Unauthorized', { status: 401 });
  }

  const key = `videos/${shareCode}.mp4`;
  const rangeHeader = request.headers.get('Range');

  let object;
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (match && (match[1] || match[2])) {
      const suffix = !match[1]; // "bytes=-N" — last N bytes
      let r2Range;
      if (suffix) {
        r2Range = { suffix: parseInt(match[2], 10) };
      } else {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : undefined;
        r2Range = { offset: start, length: end !== undefined ? end - start + 1 : undefined };
      }

      try {
        object = await env.VIDEOS_BUCKET.get(key, { range: r2Range });
      } catch (_e) {
        // R2 throws on an unsatisfiable range (e.g. offset past end of object).
        return new Response('Range not satisfiable', { status: 416 });
      }

      if (!object) return new Response('Not found', { status: 404 });

      const totalSize = object.size; // R2Object.size is the full stored object size
      const start = suffix ? Math.max(0, totalSize - r2Range.suffix) : r2Range.offset;
      const actualEnd = !suffix && r2Range.length !== undefined ? Math.min(totalSize - 1, start + r2Range.length - 1) : totalSize - 1;

      return new Response(object.body, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${actualEnd}/${totalSize}`,
          'Content-Length': String(actualEnd - start + 1),
          'Accept-Ranges': 'bytes',
          'Cache-Control': video.password_hash ? 'private, no-store' : 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        },
      });
    }
  }

  object = await env.VIDEOS_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(object.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': video.password_hash ? 'private, no-store' : 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    },
  });
}

// --- VTT Captions ---

export async function handleVTT(request, env, shareCode) {
  const video = await env.DB.prepare(
    "SELECT * FROM videos WHERE share_code = ? AND upload_completed = 1 AND datetime(expires_at) > datetime('now')"
  ).bind(shareCode).first();

  if (!video) return new Response('Not found', { status: 404 });

  // Password protection check
  if (video.password_hash) {
    const authed = await verifyPasswordAuth(request, env, shareCode, video);
    if (!authed) return new Response('Unauthorized', { status: 401 });
  }

  const segments = await env.DB.prepare(
    'SELECT start_time, end_time, text, speaker FROM transcript_segments WHERE video_id = ? ORDER BY start_time'
  ).bind(video.id).all();

  let vtt = 'WEBVTT\n\n';
  (segments.results || []).forEach((seg, i) => {
    const start = formatVTTTime(seg.start_time);
    const end = formatVTTTime(seg.end_time);
    const speaker = seg.speaker ? `<v ${seg.speaker}>` : '';
    vtt += `${i + 1}\n${start} --> ${end}\n${speaker}${seg.text}\n\n`;
  });

  return new Response(vtt, {
    headers: {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': video.password_hash ? 'private, no-store' : 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// --- Share Data (JSON endpoint for SPA) ---

export async function handleShareData(request, env, shareCode) {
  const video = await env.DB.prepare(
    "SELECT * FROM videos WHERE share_code = ? AND upload_completed = 1"
  ).bind(shareCode).first();

  if (!video) return jsonResponse({ expired: true }, 404);

  const isExpired = new Date(video.expires_at + 'Z') < new Date();
  if (isExpired) return jsonResponse({ expired: true }, 404);

  if (video.password_hash) {
    const authed = await verifyPasswordAuth(request, env, shareCode, video);
    if (!authed) {
      return jsonResponse({ password_protected: true, title: video.title }, 401);
    }
  }

  // View-count bump and the reads are independent — run them together.
  const [, segments, chapters, creator] = await Promise.all([
    env.DB.prepare('UPDATE videos SET view_count = view_count + 1 WHERE id = ?').bind(video.id).run(),
    env.DB.prepare(
      'SELECT start_time, end_time, text, speaker FROM transcript_segments WHERE video_id = ? ORDER BY start_time'
    ).bind(video.id).all(),
    env.DB.prepare(
      'SELECT timestamp, title FROM chapters WHERE video_id = ? ORDER BY timestamp'
    ).bind(video.id).all(),
    getCreatorProfile(env),
  ]);

  return jsonResponse({
    video: {
      title: video.title,
      duration: video.duration,
      width: video.width,
      height: video.height,
      summary: video.summary,
      has_webcam: video.has_webcam,
      cta_url: video.cta_url,
      cta_text: video.cta_text,
      created_at: video.created_at,
      view_count: (video.view_count || 0) + 1,
      is_meeting: video.is_meeting,
    },
    segments: (segments.results || []),
    chapters: (chapters.results || []),
    shareCode,
    creator,
  });
}

// --- OG Page (minimal HTML with meta tags) ---

async function loadOGVideo(env, shareCode) {
  const video = await env.DB.prepare(
    "SELECT * FROM videos WHERE share_code = ? AND upload_completed = 1"
  ).bind(shareCode).first();
  if (!video) return null;
  if (new Date(video.expires_at + 'Z') < new Date()) return null;
  return video;
}

// The <title> and preview tags for a share link. Password-protected videos
// never leak their title, summary or thumbnail.
function ogHead(video, baseUrl, shareCode) {
  if (video.password_hash) {
    return {
      title: 'Protected video — SuperShare',
      tags: `<meta property="og:title" content="Protected video">
<meta property="og:type" content="video.other">
<meta property="og:url" content="${baseUrl}/s/${shareCode}">
<meta property="og:site_name" content="SuperShare">
<meta property="og:description" content="This recording is password protected.">`,
    };
  }

  const desc = video.summary ? escapeHTML(video.summary) : `${formatTimestamp(video.duration)} screen recording`;
  // Changes with the title, so apps that cache previews fetch the renamed one.
  const ogVersion = titleVersion(video.title);
  return {
    title: `${escapeHTML(video.title)} — SuperShare`,
    tags: `<meta property="og:title" content="${escapeHTML(video.title)}">
<meta property="og:type" content="video.other">
<meta property="og:url" content="${baseUrl}/s/${shareCode}">
<meta property="og:video" content="${baseUrl}/embed/${shareCode}">
<meta property="og:video:secure_url" content="${baseUrl}/embed/${shareCode}">
<meta property="og:video:type" content="text/html">
<meta property="og:video:width" content="${finiteNonnegative(video.width)}">
<meta property="og:video:height" content="${finiteNonnegative(video.height)}">
<meta property="og:image" content="${baseUrl}/og/${shareCode}?v=${ogVersion}">
<meta property="og:image:secure_url" content="${baseUrl}/og/${shareCode}?v=${ogVersion}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="SuperShare">
<meta property="og:description" content="${desc}">
<meta name="description" content="${desc}">
<meta name="twitter:card" content="player">
<meta name="twitter:title" content="${escapeHTML(video.title)}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${baseUrl}/og/${shareCode}?v=${ogVersion}">
<meta name="twitter:player" content="${baseUrl}/embed/${shareCode}">
<meta name="twitter:player:width" content="${finiteNonnegative(video.width)}">
<meta name="twitter:player:height" content="${finiteNonnegative(video.height)}">`,
  };
}

export async function handleOGPage(request, env, shareCode) {
  const video = await loadOGVideo(env, shareCode);
  if (!video) return new Response('Not found', { status: 404 });

  const head = ogHead(video, new URL(request.url).origin, shareCode);
  const body = video.password_hash ? 'This recording is password protected.' : escapeHTML(video.title);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${head.title}</title>
${head.tags}
</head>
<body>
<p>${body}</p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

// Link previews in apps that don't announce themselves as bots (Notion,
// Linear, Messages and others) read the page people open, so it carries the
// same title and preview tags.
export async function withOGHead(request, env, shareCode, page) {
  const video = await loadOGVideo(env, shareCode);
  if (!video || !(page.headers.get('Content-Type') || '').includes('text/html')) return page;

  const head = ogHead(video, new URL(request.url).origin, shareCode);
  // biome-ignore lint/correctness/noUndeclaredVariables: HTMLRewriter is a Workers runtime global.
  return new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(head.title, { html: true }) })
    .on('head', { element: (el) => el.append(head.tags, { html: true }) })
    .transform(page);
}

// --- OG Image ---

export async function handleOGImage(env, shareCode) {
  const video = await env.DB.prepare(
    "SELECT * FROM videos WHERE share_code = ? AND upload_completed = 1 AND datetime(expires_at) > datetime('now')"
  )
    .bind(shareCode)
    .first();

  if (!video) return new Response('Not found', { status: 404 });

  // Serve uploaded thumbnail if available \u2014 but never for password-protected
  // videos, whose poster frame may itself be sensitive.
  if (!video.password_hash) {
    // The composed link preview first, then the plain poster frame.
    const thumb =
      (await env.VIDEOS_BUCKET.get(`social/${shareCode}.jpg`)) ||
      (await env.VIDEOS_BUCKET.get(`thumbnails/${shareCode}.jpg`));
    if (thumb) {
      return new Response(thumb.body, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
  }

  // Fallback SVG
  const locked = !!video.password_hash;
  const duration = formatDuration(video.duration);
  const date = formatDate(video.created_at);
  const rawTitle = locked ? 'Protected video' : video.title;
  const title = rawTitle.length > 60 ? rawTitle.substring(0, 57) + '...' : rawTitle;
  const res = !locked && video.width > 0 ? `${finiteNonnegative(video.width)}\u00d7${finiteNonnegative(video.height)}` : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#000"/>
  <rect x="100" y="140" width="1000" height="350" rx="16" fill="#111" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <circle cx="600" cy="290" r="40" fill="rgba(255,255,255,0.06)"/>
  <polygon points="590,270 590,310 620,290" fill="rgba(255,255,255,0.3)"/>
  <text x="600" y="400" text-anchor="middle" fill="#e5e5e5" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="22" font-weight="500">${escapeHTML(title)}</text>
  <text x="600" y="440" text-anchor="middle" fill="#888" font-family="monospace" font-size="13" letter-spacing="1">${duration}  \u00b7  ${date}${res ? '  \u00b7  ' + res : ''}</text>
  <text x="600" y="570" text-anchor="middle" fill="#2563eb" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="14" font-weight="600" letter-spacing="2">RECORDLY</text>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
