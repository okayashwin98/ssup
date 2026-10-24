// Adapted from Voom (MIT), Copyright (c) 2026 Aritro Paul.
// See ../../../LICENSE and ../../../../../THIRD_PARTY_NOTICES.md.
import {
  Button,
  Card,
  Dropdown,
  Label,
  Link,
  Slider,
  Spinner,
  Tooltip,
  toast,
} from '@heroui/react';
import {
  ArrowsOutIcon,
  ArrowCounterClockwiseIcon,
  ClosedCaptioningIcon,
  PauseIcon,
  PictureInPictureIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  FastForwardIcon,
  RewindIcon,
  ChatCircleIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { Comment, Reaction, ShareData } from '../scripts/api';
import { formatDate, formatTimestamp } from '../scripts/api';

// Shared recordings start at 1.5×; viewers can change it from the speed menu.
const DEFAULT_SPEED = 1.5;

function formatCoverDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.max(1, Math.round(seconds));
  return total < 60 ? `${total}s` : formatTimestamp(total);
}
import { clusterTimeline, type TimelineItem } from '../scripts/shareModel';

interface Props {
  data: ShareData;
  videoRef: RefObject<HTMLVideoElement | null>;
  comments: Comment[];
  reactions: Reaction[];
  time: number;
  duration: number;
  onTime: (time: number) => void;
  onDuration: (duration: number) => void;
  seek: (time: number) => void;
}

export default function SharePlayer({
  data,
  videoRef,
  comments,
  reactions,
  time,
  duration,
  onTime,
  onDuration,
  seek,
}: Props) {
  const shell = useRef<HTMLDivElement>(null);
  // Shape the player like the recording so no letterbox bars appear.
  const [videoRatio, setVideoRatio] = useState(() =>
    data.video.width > 0 && data.video.height > 0 ? data.video.width / data.video.height : null,
  );
  // Controls sit over the video and fade out while playing with the pointer still.
  const [pointerActive, setPointerActive] = useState(false);
  // Off the player nothing is drawn over the video, so screenshots stay clean.
  const [pointerInside, setPointerInside] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const wakeControls = useCallback(() => {
    setPointerInside(true);
    setPointerActive(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setPointerActive(false), 2500);
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);
  const [poster, setPoster] = useState<string>();
  useEffect(() => {
    let active = true;
    setPoster(undefined);
    const image = new Image();
    const url = `/thumb/${data.shareCode}`;
    image.onload = () => { if (active) setPoster(url); };
    // A missing poster must not obscure the video element's decoded first frame.
    image.onerror = () => { if (active) setPoster(undefined); };
    image.src = url;
    return () => { active = false; image.onload = null; image.onerror = null; };
  }, [data.shareCode]);
  const markers = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(500);
  const [playing, setPlaying] = useState(false);
  // The title cover shows until the viewer first presses play.
  const [started, setStarted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  // Subtitles start off; viewers turn them on with the CC button.
  const [captions, setCaptions] = useState(false);
  const [pip, setPip] = useState(false);
  const [error, setError] = useState(false);
  const savedVolume = useRef(1);
  // The speed menu opens outside the player, so it keeps the controls up itself.
  const [menuOpen, setMenuOpen] = useState(false);
  const controlsShown =
    started && (menuOpen || (pointerInside && (!playing || pointerActive)));
  // The seek bar is painted every frame while playing; timeupdate alone only
  // fires a few times a second and makes it tick.
  const seekFill = useRef<HTMLDivElement>(null);
  const paintProgress = useCallback(
    (current: number) => {
      const fill = seekFill.current;
      if (!fill) return;
      const length = videoRef.current?.duration;
      const total = length && Number.isFinite(length) ? length : duration;
      fill.style.width = total ? `${Math.min(100, Math.max(0, (current / total) * 100))}%` : '0%';
    },
    [duration, videoRef],
  );
  useLayoutEffect(() => {
    if (!playing) paintProgress(time);
  }, [playing, time, paintProgress]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) paintProgress(video.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, paintProgress, videoRef]);
  const caption = data.segments.find((s) => time >= s.start_time && time < s.end_time);
  const cta =
    data.video.cta_url && /^https?:\/\//i.test(data.video.cta_url) ? data.video.cta_url : null;

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) video.pause();
    else
      try {
        await video.play();
      } catch {
        toast.danger('Playback could not start. Try again.');
      }
  }, [videoRef]);
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = savedVolume.current || 1;
    } else {
      savedVolume.current = video.volume;
      video.muted = true;
    }
  }, [videoRef]);
  const fullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.current?.requestFullscreen();
    } catch {
      toast.danger('Fullscreen is unavailable in this browser.');
    }
  }, []);
  async function pictureInPicture() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoRef.current?.requestPictureInPicture();
    } catch {
      toast.danger('Picture in picture is unavailable for this recording.');
    }
  }

  useEffect(() => {
    setPip(!!document.pictureInPictureEnabled);
    if (!markers.current) return;
    const observer = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    observer.observe(markers.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        target.closest(
          'input, textarea, select, button, a, [role="slider"], [role="tab"], [role="menuitem"], [contenteditable="true"]',
        )
      )
        return;
      const video = videoRef.current;
      if (!video) return;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          void togglePlay();
          break;
        case 'arrowleft':
          e.preventDefault();
          seek(video.currentTime - 5);
          break;
        case 'arrowright':
          e.preventDefault();
          seek(video.currentTime + 5);
          break;
        case 'm':
          toggleMute();
          break;
        case 'f':
          void fullscreen();
          break;
        case 'c':
          setCaptions((value) => !value);
          break;
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [seek, videoRef, togglePlay, toggleMute, fullscreen]);

  return (
    <div
      className="video-area"
      style={videoRatio ? ({ '--video-ratio': videoRatio } as CSSProperties) : undefined}
    >
    <Card
      ref={shell}
      className={`video-shell${controlsShown ? ' controls-shown' : ''}${started && !controlsShown ? ' controls-hidden' : ''}`}
      onPointerMove={wakeControls}
      onPointerDown={wakeControls}
      onPointerLeave={(event) => {
        // Touch screens fire this after every tap; only a real pointer leaving counts.
        if (event.pointerType === 'touch') return;
        setPointerInside(false);
        setPointerActive(false);
      }}
      onFocus={wakeControls}
    >
      <div className="video-stage">
        <div className="video-frame">
        <video
          ref={videoRef}
          src={`/v/${data.shareCode}`}
          poster={poster}
          preload="metadata"
          playsInline
          onClick={() => void togglePlay()}
          onPlay={() => {
            setPlaying(true);
            setStarted(true);
            setEnded(false);
          }}
          onPause={() => setPlaying(false)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onError={() => {
            setError(true);
            setWaiting(false);
          }}
          onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
          onVolumeChange={(e) => {
            setVolume(e.currentTarget.volume);
            setMuted(e.currentTarget.muted);
          }}
          onRateChange={(e) => setSpeed(e.currentTarget.playbackRate)}
          onEnded={() => {
            setEnded(true);
            setPlaying(false);
          }}
          onSeeking={() => setEnded(false)}
          onLoadedMetadata={(e) => {
            const video = e.currentTarget;
            if (video.videoWidth > 0 && video.videoHeight > 0)
              setVideoRatio(video.videoWidth / video.videoHeight);
            onDuration(Number.isFinite(video.duration) ? video.duration : 0);
            // Loading resets the rate to defaultPlaybackRate, so set both.
            video.defaultPlaybackRate = DEFAULT_SPEED;
            video.playbackRate = DEFAULT_SPEED;
            const start = Number(new URLSearchParams(location.search).get('t'));
            if (Number.isFinite(start) && start > 0 && start < video.duration)
              video.currentTime = start;
            for (const track of Array.from(video.textTracks)) track.mode = 'hidden';
          }}
        >
          {data.segments.length > 0 && (
            <track kind="captions" src={`/vtt/${data.shareCode}`} srcLang="en" label="English" />
          )}
        </video>
        {!started && !error && (
          <button
            type="button"
            className="video-cover"
            aria-label={`Play ${data.video.title}`}
            onClick={() => void togglePlay()}
          >
            <span className="video-cover-play" aria-hidden="true">
              <PlayIcon size={44} weight="fill" />
            </span>
            <span className="video-cover-text">
              <span className="video-cover-title">{data.video.title}</span>
              <span className="video-cover-byline">
                {data.creator?.avatarUrl ? (
                  <img className="video-cover-avatar" src={data.creator.avatarUrl} alt="" />
                ) : data.creator?.name ? (
                  <span className="video-cover-avatar video-cover-initials">
                    {data.creator.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase()}
                  </span>
                ) : null}
                <span className="video-cover-meta">
                  {data.creator?.name && <span className="video-cover-name">{data.creator.name}</span>}
                  <span className="video-cover-details">
                    {[formatCoverDuration(duration || data.video.duration), formatDate(data.video.created_at)]
                      .filter(Boolean)
                      .join(' / ')}
                  </span>
                </span>
              </span>
            </span>
          </button>
        )}
        </div>
        {/* Pausing draws nothing over the video; only the end offers a replay. */}
        {ended && !error && !cta && (
          <div className="video-play-overlay">
            <Button
              isIconOnly
              size="lg"
              aria-label="Replay recording"
              onPress={() => void togglePlay()}
            >
              <ArrowCounterClockwiseIcon size={24} />
            </Button>
          </div>
        )}
        {waiting && playing && (
          <div className="video-play-overlay">
            <Spinner aria-label="Buffering video" />
          </div>
        )}
        {error && (
          <div className="video-end-card">
            <p>We couldn’t load this video.</p>
            <Button
              variant="secondary"
              onPress={() => {
                setError(false);
                videoRef.current?.load();
              }}
            >
              Try again
            </Button>
          </div>
        )}
        {captions && caption && (
          <div className="video-caption">
            <span>
              {caption.speaker && `${caption.speaker}: `}
              {caption.text}
            </span>
          </div>
        )}
        <div className="timestamp-reactions" aria-hidden="true">
          {reactions.filter((reaction) => time >= reaction.timestamp && time < reaction.timestamp + 3).slice(-12).map((reaction, index) => (
            <span className="timestamp-reaction" key={`${reaction.created_at}-${reaction.timestamp}-${index}`} style={{ left: `${15 + (index * 19) % 70}%` }}>{reaction.emoji}</span>
          ))}
        </div>
        {ended && cta && (
          <div className="video-end-card">
            <Link
              className="button button--primary"
              href={cta}
              target="_blank"
              rel="noopener noreferrer"
            >
              {data.video.cta_text || 'Learn more'}
            </Link>
            <Button
              variant="secondary"
              onPress={() => {
                seek(0);
                void togglePlay();
              }}
            >
              <ArrowCounterClockwiseIcon size={16} />
              Replay
            </Button>
          </div>
        )}
      </div>
      <div className="video-toolbar">
        <div ref={markers} className="timeline-markers" aria-label="Comments and reactions on the timeline">
          {clusterTimeline([
            ...comments.map((item): TimelineItem => ({ timestamp: item.timestamp, kind: 'comment', label: `${item.author_name}: ${item.text}` })),
            ...reactions.map((item): TimelineItem => ({ timestamp: item.timestamp, kind: 'reaction', emoji: item.emoji, label: `${item.emoji} reaction` })),
            ...data.chapters.map((item): TimelineItem => ({ timestamp: item.timestamp, kind: 'chapter', label: `Chapter: ${item.title}` })),
          ], duration, trackWidth).map((cluster, index) => (
            <Tooltip key={`timeline-${index}`}>
              <Button size="sm" variant={cluster.members.length > 1 ? 'primary' : 'ghost'} className="timeline-marker"
                style={{ left: `${duration ? Math.max(2, Math.min(98, cluster.time / duration * 100)) : 2}%` }}
                aria-label={`${cluster.members.length > 1 ? `${cluster.members.length} items` : cluster.members[0].label} at ${formatTimestamp(cluster.time)}`}
                onPress={() => seek(cluster.members[0].timestamp)}>
                {cluster.members.length > 1 ? cluster.members.length : cluster.members[0].kind === 'reaction' ? <span aria-hidden="true">{cluster.members[0].emoji}</span> : cluster.members[0].kind === 'comment' ? <ChatCircleIcon size={12} /> : '•'}
              </Button>
              <Tooltip.Content>{cluster.members.map((item) => `${formatTimestamp(item.timestamp)} ${item.label}`).join(' · ')}</Tooltip.Content>
            </Tooltip>
          ))}
        </div>
        <div className="video-progress">
          <div className="seek-track" aria-hidden="true">
            <div ref={seekFill} className="seek-fill" />
          </div>
          <input
            className="video-seek-input"
            type="range"
            aria-label="Seek video"
            aria-valuetext={`${formatTimestamp(time)} of ${formatTimestamp(duration)}`}
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(time, duration || 0)}
            disabled={!duration}
            onChange={(event) => seek(Number(event.currentTarget.value))}
          />
        </div>
        <div className="video-controls">
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={playing ? 'Pause' : 'Play'}
            onPress={() => void togglePlay()}
          >
            {playing ? <PauseIcon size={18} weight="fill" /> : <PlayIcon size={18} weight="fill" />}
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className="skip-control"
            aria-label="Back 5 seconds"
            onPress={() => seek(time - 5)}
          >
            <RewindIcon size={18} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className="skip-control"
            aria-label="Forward 5 seconds"
            onPress={() => seek(time + 5)}
          >
            <FastForwardIcon size={18} />
          </Button>
          {/* The volume bar slides out while the speaker button or bar is hovered. */}
          <div className="volume-group">
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
              onPress={toggleMute}
            >
              {muted || volume === 0 ? <SpeakerSlashIcon size={18} /> : <SpeakerHighIcon size={18} />}
            </Button>
            <Slider
              className="volume-control"
              aria-label="Volume"
              minValue={0}
              maxValue={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(value) => {
                if (videoRef.current) {
                  videoRef.current.volume = Number(value);
                  videoRef.current.muted = Number(value) === 0;
                  if (Number(value)) savedVolume.current = Number(value);
                }
              }}
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
          </div>
          <span className="video-time">
            {formatTimestamp(time)} / {formatTimestamp(duration)}
          </span>
          <span className="control-spacer" />
          {data.segments.length > 0 && (
            <Button
              isIconOnly
              size="sm"
              variant={captions ? 'secondary' : 'ghost'}
              aria-label="Captions"
              aria-pressed={captions}
              onPress={() => setCaptions(!captions)}
            >
              <ClosedCaptioningIcon size={18} />
            </Button>
          )}
          <Dropdown onOpenChange={setMenuOpen}>
            <Button size="sm" variant="ghost" aria-label={`Playback speed: ${speed}×`}>
              {speed}×
            </Button>
            <Dropdown.Popover className="speed-menu">
              <Dropdown.Menu
                aria-label="Playback speed"
                selectionMode="single"
                selectedKeys={new Set([String(speed)])}
                onAction={(key) => {
                  if (videoRef.current) videoRef.current.playbackRate = Number(key);
                }}
              >
                {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                  <Dropdown.Item key={rate} id={String(rate)} textValue={`${rate}×`}>
                    <Label>{rate}×</Label>
                    <Dropdown.ItemIndicator />
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
          {pip && (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className="pip-control"
              aria-label="Picture in picture"
              onPress={() => void pictureInPicture()}
            >
              <PictureInPictureIcon size={18} />
            </Button>
          )}
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Fullscreen"
            onPress={() => void fullscreen()}
          >
            <ArrowsOutIcon size={18} />
          </Button>
        </div>
      </div>
    </Card>
    </div>
  );
}
