"use client";

export interface CompressVideoOptions {
  /** Maximum video duration in seconds to attempt client-side transcode (default: 60s). */
  maxDurationSec?: number;
  /** Target video bitrate in bps (default: 1_800_000 -> 1.8 Mbps). */
  targetBitrate?: number;
  /** Max longest dimension (default: 1280). */
  maxDimension?: number;
  /** Callback for progress percentage and status text. */
  onProgress?: (percent: number, statusText: string) => void;
}

const VIDEO_EXT_REGEX = /\.(mp4|webm|mov|3gp|m4v|avi|mkv)$/i;

/** Returns true if the file or filename represents a video. */
export function isVideoFile(file: Blob, explicitName?: string): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = explicitName || (file instanceof File ? file.name : "") || "";
  if (mime.startsWith("video/")) return true;
  if (VIDEO_EXT_REGEX.test(name)) return true;
  return false;
}

/** Formats byte sizes into human readable strings (e.g. 1.2 MB). */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Automatically optimizes and compresses video files on the client device
 * prior to uploading.
 *
 * Guarantees:
 * - Always non-blocking safe: never throws and falls back cleanly to the original file.
 * - Skips already well-compressed / short clips (<= 6 MB).
 * - Caps execution time with a strict timeout guard.
 * - Rejects any output that is larger than the original input.
 */
export async function compressVideoFile(
  input: File,
  options: CompressVideoOptions = {}
): Promise<File> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return input;
  }

  if (!isVideoFile(input, input.name)) {
    return input;
  }

  // Already small video clip (< 6 MB), uploading directly is faster than re-encoding
  if (input.size <= 6 * 1024 * 1024) {
    return input;
  }

  // MediaRecorder support check
  if (typeof window.MediaRecorder === "undefined") {
    return input;
  }

  const maxDurationSec = options.maxDurationSec ?? 60;
  const targetBitrate = options.targetBitrate ?? 1_800_000; // 1.8 Mbps

  // Determine browser-supported recorder mime types in order of preference
  const candidateMimes = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
  ];

  let selectedMime: string | null = null;
  for (const m of candidateMimes) {
    try {
      if (MediaRecorder.isTypeSupported(m)) {
        selectedMime = m;
        break;
      }
    } catch {}
  }

  if (!selectedMime) {
    return input;
  }

  const objectUrl = URL.createObjectURL(input);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  try {
    // Wait for video metadata to load
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to load video metadata"));
      };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onError);
      // Fallback timeout for metadata loading
      setTimeout(() => reject(new Error("Metadata timeout")), 6000);
    });

    const duration = video.duration;
    // If video is longer than maxDurationSec, skip client-side re-encoding to prevent user wait
    if (!Number.isFinite(duration) || duration <= 0 || duration > maxDurationSec) {
      return input;
    }

    // Check for captureStream support
    const stream = (video as any).captureStream
      ? (video as any).captureStream()
      : (video as any).mozCaptureStream
      ? (video as any).mozCaptureStream()
      : null;

    if (!stream) {
      return input;
    }

    options.onProgress?.(10, "Optimizing video...");

    const recorder = new MediaRecorder(stream, {
      mimeType: selectedMime,
      videoBitsPerSecond: targetBitrate,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    const completionPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const fullBlob = new Blob(chunks, { type: selectedMime! });
        resolve(fullBlob);
      };
      recorder.onerror = () => reject(new Error("MediaRecorder error"));
    });

    // Timeupdate tracking for progress bar
    video.ontimeupdate = () => {
      if (duration > 0) {
        const pct = Math.min(95, Math.round(10 + (video.currentTime / duration) * 85));
        options.onProgress?.(pct, `Compressing video (${pct}%)...`);
      }
    };

    recorder.start(250);
    try {
      await video.play();
    } catch {
      recorder.stop();
      return input;
    }

    // Safety timeout: duration + 10s max
    const maxWaitMs = Math.ceil((duration + 10) * 1000);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Video compression timeout")), maxWaitMs)
    );

    const endedPromise = new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });

    // Wait for playback to finish or timeout
    await Promise.race([endedPromise, timeoutPromise]);
    recorder.stop();

    const compressedBlob = await Promise.race([completionPromise, timeoutPromise]);
    options.onProgress?.(100, "Done!");

    // Only use compressed if it actually reduced file size
    if (compressedBlob && compressedBlob.size > 0 && compressedBlob.size < input.size * 0.95) {
      const ext = selectedMime.includes("mp4") ? ".mp4" : ".webm";
      const baseName = input.name.replace(/\.[^/.]+$/, "");
      const newName = `${baseName}_optimized${ext}`;
      return new File([compressedBlob], newName, {
        type: selectedMime,
        lastModified: Date.now(),
      });
    }

    return input;
  } catch (err) {
    // If anything fails during transcode, safely return original file without blocking upload
    return input;
  } finally {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch {}
    URL.revokeObjectURL(objectUrl);
  }
}
