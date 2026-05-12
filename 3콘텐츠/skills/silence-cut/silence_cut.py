"""
무음 구간 자동 컷편집 스크립트
Usage: python silence_cut.py <input_file> [--threshold -40dB] [--min-silence 0.4] [--keep 0.25]
"""
import subprocess
import re
import sys
import os
import argparse


def get_duration(filepath):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filepath],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())


def detect_silence(filepath, threshold, min_duration):
    result = subprocess.run(
        ["ffmpeg", "-i", filepath, "-af", f"silencedetect=noise={threshold}:d={min_duration}", "-f", "null", "-"],
        capture_output=True, text=True
    )
    stderr = result.stderr
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', stderr)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', stderr)]

    silences = list(zip(starts[:len(ends)], ends))
    if len(starts) > len(ends):
        silences.append((starts[-1], get_duration(filepath)))

    return silences


def build_segments(silences, duration, keep_silence):
    segments = []
    prev_end = 0.0
    half = keep_silence / 2

    for s_start, s_end in silences:
        silence_dur = s_end - s_start

        if s_start > prev_end:
            segments.append((prev_end, s_start))

        if silence_dur > keep_silence:
            segments.append((s_start, s_start + half))
            segments.append((s_end - half, s_end))
        else:
            segments.append((s_start, s_end))

        prev_end = s_end

    if prev_end < duration:
        segments.append((prev_end, duration))

    # Merge adjacent
    merged = [segments[0]]
    for seg in segments[1:]:
        if seg[0] <= merged[-1][1] + 0.01:
            merged[-1] = (merged[-1][0], max(merged[-1][1], seg[1]))
        else:
            merged.append(seg)

    # Remove tiny segments
    return [s for s in merged if s[1] - s[0] >= 0.05]


def encode(input_file, output_file, segments):
    filter_parts = []
    concat_inputs = []
    for i, (start, end) in enumerate(segments):
        filter_parts.append(f"[0:v]trim=start={start:.6f}:end={end:.6f},setpts=PTS-STARTPTS[v{i}];")
        filter_parts.append(f"[0:a]atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS[a{i}];")
        concat_inputs.append(f"[v{i}][a{i}]")

    concat_str = "".join(concat_inputs)
    filter_parts.append(f"{concat_str}concat=n={len(segments)}:v=1:a=1[outv][outa]")
    filter_complex = "\n".join(filter_parts)

    import tempfile
    filter_path = os.path.join(tempfile.gettempdir(), "silence_cut_filter.txt")
    with open(filter_path, "w") as f:
        f.write(filter_complex)

    # Try NVENC, fallback to CPU
    encoders = [
        ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "20"],
        ["-c:v", "libx264", "-preset", "fast", "-crf", "18"],
    ]

    for enc_args in encoders:
        cmd = [
            "ffmpeg", "-y", "-i", input_file,
            "-filter_complex_script", filter_path,
            "-map", "[outv]", "-map", "[outa]",
            *enc_args,
            "-c:a", "aac", "-b:a", "192k",
            output_file,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return True
        if "nvenc" in enc_args[1]:
            print("NVENC unavailable, falling back to CPU...")

    print(f"Encoding failed: {result.stderr[-500:]}")
    return False


def main():
    parser = argparse.ArgumentParser(description="Auto silence cut")
    parser.add_argument("input", help="Input video/audio file path")
    parser.add_argument("--threshold", default="-40dB", help="Noise threshold (default: -40dB)")
    parser.add_argument("--min-silence", type=float, default=0.4, help="Min silence duration to process (default: 0.4)")
    parser.add_argument("--keep", type=float, default=0.25, help="Keep this much silence (default: 0.25)")
    parser.add_argument("--output", default=None, help="Output file path (default: <input>_final.mp4)")
    args = parser.parse_args()

    input_file = args.input
    if not os.path.exists(input_file):
        print(f"File not found: {input_file}")
        sys.exit(1)

    base, ext = os.path.splitext(input_file)
    output_file = args.output or f"{base}_final{ext}"

    print(f"Input: {input_file}")
    duration = get_duration(input_file)
    print(f"Duration: {duration:.2f}s")
    print(f"Settings: threshold={args.threshold}, min_silence={args.min_silence}s, keep={args.keep}s")

    silences = detect_silence(input_file, args.threshold, args.min_silence)
    print(f"\nSilence periods: {len(silences)}")
    for i, (s, e) in enumerate(silences):
        print(f"  [{i+1}] {s:.2f}s ~ {e:.2f}s ({e-s:.2f}s)")

    segments = build_segments(silences, duration, args.keep)
    total_kept = sum(e - s for s, e in segments)
    removed = duration - total_kept
    print(f"\n{duration:.1f}s -> {total_kept:.1f}s (removed {removed:.1f}s)")

    print("\nEncoding...")
    if encode(input_file, output_file, segments):
        out_dur = get_duration(output_file)
        print(f"Done! Output: {out_dur:.1f}s")
        print(f"Saved: {output_file}")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
