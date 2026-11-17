using System.Buffers.Binary;
using System.Text.Json;
using TeslaCam.Data;

namespace TeslaCam.Services;

/// <summary>
/// One video frame's telemetry, as Tesla embeds it in the H.264 stream of every camera since firmware 2025.44.25:
/// an SEI unit holding a <c>SeiMetadata</c> protobuf (https://github.com/teslamotors/dashcam, dashcam.proto).
/// Proto3 leaves out fields at their default, so a missing gear means Park and a missing flag means off.
/// </summary>
public record struct SeiFrame(
    int Gear, float SpeedMps, float Accelerator, float SteeringDeg, bool BlinkerLeft, bool BlinkerRight, bool Brake,
    int Autopilot, double Lat, double Lon, double Heading, double AccelX, double AccelY);

/// <summary>Reads the telemetry out of a Tesla clip without decoding any video.</summary>
public static class Sei
{
    /// <summary>
    /// Every video frame in order, with its telemetry or null. Only SEI units are read; picture data is skipped
    /// with a seek, so a minute of footage costs a few hundred kilobytes of reads.
    /// </summary>
    public static List<SeiFrame?> Read(string path)
    {
        using var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16);
        var frames = new List<SeiFrame?>();
        if (FindMdat(file) is not (long start, long end)) return frames;

        Span<byte> header = stackalloc byte[5];
        SeiFrame? pending = null;
        var pos = start;
        while (pos + 5 <= end)
        {
            file.Position = pos;
            if (file.Read(header) < 5) break;
            var size = BinaryPrimitives.ReadUInt32BigEndian(header);
            pos += 4;
            if (size == 0 || pos + size > end) break; // not a length-prefixed stream we understand
            var type = header[4] & 0x1F;
            if (type == 6)
            {
                var nal = new byte[size];
                file.Position = pos;
                file.ReadExactly(nal);
                pending = Parse(nal) ?? pending;
            }
            else if (type is 1 or 5)
            {
                frames.Add(pending);
                pending = null;
            }
            pos += size;
        }
        return frames;
    }

    /// <summary>Tesla's payload: from byte 3 of the NAL unit, one or more 0x42, then 0x69, then the protobuf (minus the trailing stop bit).</summary>
    public static SeiFrame? Parse(ReadOnlySpan<byte> nal)
    {
        var i = 3;
        while (i < nal.Length && nal[i] == 0x42) i++;
        if (i == 3 || i + 1 >= nal.Length || nal[i] != 0x69) return null;
        return Decode(Unescape(nal[(i + 1)..^1]));
    }

    /// <summary>Removes H.264 emulation prevention bytes (00 00 03 → 00 00).</summary>
    static byte[] Unescape(ReadOnlySpan<byte> data)
    {
        var output = new byte[data.Length];
        int n = 0, zeros = 0;
        foreach (var b in data)
        {
            if (zeros >= 2 && b == 3)
            {
                zeros = 0;
                continue;
            }
            zeros = b == 0 ? zeros + 1 : 0;
            output[n++] = b;
        }
        return output[..n];
    }

    static SeiFrame? Decode(ReadOnlySpan<byte> p)
    {
        var f = new SeiFrame();
        var i = 0;
        try
        {
            while (i < p.Length)
            {
                var key = Varint(p, ref i);
                var field = (int)(key >> 3);
                switch ((int)(key & 7))
                {
                    case 0:
                        var v = Varint(p, ref i);
                        switch (field)
                        {
                            case 2: f.Gear = (int)v; break;
                            case 7: f.BlinkerLeft = v != 0; break;
                            case 8: f.BlinkerRight = v != 0; break;
                            case 9: f.Brake = v != 0; break;
                            case 10: f.Autopilot = (int)v; break;
                        }
                        break;
                    case 1:
                        var d = BinaryPrimitives.ReadDoubleLittleEndian(p.Slice(i, 8));
                        i += 8;
                        switch (field)
                        {
                            case 11: f.Lat = d; break;
                            case 12: f.Lon = d; break;
                            case 13: f.Heading = d; break;
                            case 14: f.AccelX = d; break;
                            case 15: f.AccelY = d; break;
                        }
                        break;
                    case 5:
                        var s = BinaryPrimitives.ReadSingleLittleEndian(p.Slice(i, 4));
                        i += 4;
                        switch (field)
                        {
                            case 4: f.SpeedMps = s; break;
                            case 5: f.Accelerator = s; break;
                            case 6: f.SteeringDeg = s; break;
                        }
                        break;
                    case 2:
                        i += (int)Varint(p, ref i);
                        break;
                    default:
                        return null;
                }
            }
        }
        catch (ArgumentOutOfRangeException)
        {
            return null; // truncated payload
        }
        return f;
    }

    static ulong Varint(ReadOnlySpan<byte> p, ref int i)
    {
        ulong value = 0;
        for (var shift = 0; shift < 64; shift += 7)
        {
            var b = p[i++];
            value |= (ulong)(b & 0x7F) << shift;
            if (b < 0x80) return value;
        }
        throw new ArgumentOutOfRangeException(nameof(p));
    }

    /// <summary>The payload of the top-level mdat box, wherever it sits in the file.</summary>
    static (long Start, long End)? FindMdat(FileStream file)
    {
        Span<byte> header = stackalloc byte[16];
        long pos = 0;
        while (pos + 8 <= file.Length)
        {
            file.Position = pos;
            if (file.Read(header) < 8) return null;
            long size = BinaryPrimitives.ReadUInt32BigEndian(header);
            var headerSize = 8;
            if (size == 1)
            {
                size = (long)BinaryPrimitives.ReadUInt64BigEndian(header[8..]);
                headerSize = 16;
            }
            else if (size == 0)
            {
                size = file.Length - pos;
            }
            if (size < headerSize) return null;
            if (header[4..8].SequenceEqual("mdat"u8)) return (pos + headerSize, Math.Min(file.Length, pos + size));
            pos += size;
        }
        return null;
    }
}

/// <summary>
/// An event's telemetry on the event timeline, sampled about ten times a second and stored column by column.
/// Times are seconds from the start of the event, matching the player's position.
/// </summary>
public record TelemetryTrack(
    int Version, string Signature, double Hz,
    double[] T, float[] SpeedMps, int[] Gear, float[] SteeringDeg, float[] Accelerator, bool[] Brake,
    int[] Autopilot, bool[] BlinkerLeft, bool[] BlinkerRight, double?[] Lat, double?[] Lon, double[] Heading,
    double[] AccelX, double[] AccelY)
{
    public int Count => T.Length;
}

/// <summary>Builds an event's telemetry track from its clips once, then serves it from the event cache.</summary>
public class TelemetryService(AppPaths paths, ILogger<TelemetryService> log)
{
    // Raise when the track format or sampling changes, so cached tracks are rebuilt.
    const int Version = 1;
    const double TargetHz = 10;

    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    readonly SemaphoreSlim _gate = new(1);

    string CachePath(int eventId) => Path.Combine(paths.EventCache(eventId), "telemetry.json");

    /// <summary>The track, building it on first use. <see cref="Event.Segments"/> and their files must be loaded.</summary>
    public async Task<TelemetryTrack> GetAsync(Event ev, CancellationToken ct = default)
    {
        var path = CachePath(ev.Id);
        if (await LoadAsync(path, ev, ct) is { } cached) return cached;

        await _gate.WaitAsync(ct);
        try
        {
            if (await LoadAsync(path, ev, ct) is { } again) return again;
            var track = await Task.Run(() => Build(ev), ct);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var tmp = path + ".tmp";
            await using (var stream = File.Create(tmp)) await JsonSerializer.SerializeAsync(stream, track, Json, ct);
            File.Move(tmp, path, true);
            return track;
        }
        finally
        {
            _gate.Release();
        }
    }

    static async Task<TelemetryTrack?> LoadAsync(string path, Event ev, CancellationToken ct)
    {
        if (!File.Exists(path)) return null;
        try
        {
            await using var stream = File.OpenRead(path);
            var track = await JsonSerializer.DeserializeAsync<TelemetryTrack>(stream, Json, ct);
            return track is { Version: Version } && track.Signature == ev.Signature ? track : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    TelemetryTrack Build(Event ev)
    {
        var t = new List<double>();
        var frames = new List<SeiFrame>();
        double offset = 0;
        foreach (var segment in ev.Segments.OrderBy(s => s.Index))
        {
            // Every camera carries the same telemetry; the front one is always recorded while driving.
            var file = segment.Files.OrderBy(f => f.Camera == "front" ? 0 : 1).ThenBy(f => Cameras.Order(f.Camera)).FirstOrDefault();
            var clip = file == null ? null : paths.ClipPath(ev, file);
            if (clip != null && File.Exists(clip) && segment.DurationSec > 0)
            {
                try
                {
                    var read = Sei.Read(clip);
                    if (read.Count > 0)
                    {
                        var perFrame = segment.DurationSec / read.Count;
                        var every = Math.Max(1, (int)Math.Round(1 / perFrame / TargetHz));
                        for (var i = 0; i < read.Count; i += every)
                        {
                            if (read[i] is not { } frame) continue;
                            t.Add(Math.Round(offset + i * perFrame, 2));
                            frames.Add(frame);
                        }
                    }
                }
                catch (IOException e)
                {
                    log.LogWarning("Telemetry: could not read {File}: {Message}", clip, e.Message);
                }
            }
            offset += segment.DurationSec;
        }

        static bool HasFix(SeiFrame f) => f.Lat is not 0 and >= -90 and <= 90 && f.Lon is not 0 and >= -180 and <= 180;
        return new TelemetryTrack(
            Version, ev.Signature, TargetHz, [.. t],
            [.. frames.Select(f => MathF.Round(f.SpeedMps, 2))],
            [.. frames.Select(f => f.Gear)],
            [.. frames.Select(f => MathF.Round(f.SteeringDeg, 1))],
            [.. frames.Select(f => MathF.Round(f.Accelerator, 1))],
            [.. frames.Select(f => f.Brake)],
            [.. frames.Select(f => f.Autopilot)],
            [.. frames.Select(f => f.BlinkerLeft)],
            [.. frames.Select(f => f.BlinkerRight)],
            [.. frames.Select(f => HasFix(f) ? Math.Round(f.Lat, 6) : (double?)null)],
            [.. frames.Select(f => HasFix(f) ? Math.Round(f.Lon, 6) : (double?)null)],
            [.. frames.Select(f => Math.Round(f.Heading, 1))],
            [.. frames.Select(f => Math.Round(f.AccelX, 2))],
            [.. frames.Select(f => Math.Round(f.AccelY, 2))]);
    }
}
