using TeslaCam.Services;

namespace TeslaCam.Tests;

public class TelemetryTests
{
    // An SEI NAL unit the way the car writes one: header, payload type and size, 0x42 padding, 0x69, the protobuf, a stop bit.
    private static byte[] Nal(byte[] protobuf, int padding = 3) =>
        [0x06, 0x05, (byte)(padding + 1 + protobuf.Length), .. Enumerable.Repeat((byte)0x42, padding), 0x69, .. protobuf, 0x80];

    private static byte[] Float(int field, float value) => [(byte)((field << 3) | 5), .. BitConverter.GetBytes(value)];
    private static byte[] Double(int field, double value) => [(byte)((field << 3) | 1), .. BitConverter.GetBytes(value)];
    private static byte[] Varint(int field, byte value) => [(byte)(field << 3), value];

    [Fact]
    public void Reads_speed_gear_and_position()
    {
        var frame = Sei.Parse(Nal([.. Varint(2, 1), .. Float(4, 27.5f), .. Varint(9, 1), .. Varint(10, 2), .. Double(11, 51.5072), .. Double(12, -0.1276)]));

        Assert.NotNull(frame);
        Assert.Equal(1, frame.Value.Gear);
        Assert.Equal(27.5f, frame.Value.SpeedMps);
        Assert.True(frame.Value.Brake);
        Assert.Equal(2, frame.Value.Autopilot);
        Assert.Equal(51.5072, frame.Value.Lat);
        Assert.Equal(-0.1276, frame.Value.Lon);
    }

    [Fact]
    public void Missing_fields_mean_park_and_off()
    {
        var frame = Sei.Parse(Nal(Float(4, 0f)));

        Assert.NotNull(frame);
        Assert.Equal(0, frame.Value.Gear);
        Assert.False(frame.Value.Brake);
        Assert.False(frame.Value.BlinkerLeft);
    }

    [Fact]
    public void Ignores_sei_without_teslas_marker()
    {
        Assert.Null(Sei.Parse([0x06, 0x05, 0x04, 0x11, 0x22, 0x33, 0x44, 0x80]));
        // 0x42 padding but no 0x69 after it.
        Assert.Null(Sei.Parse([0x06, 0x05, 0x04, 0x42, 0x42, 0x42, 0x42, 0x80]));
    }

    [Fact]
    public void Accepts_a_single_padding_byte()
    {
        // Tesla's own reader needs at least one 0x42, not four.
        Assert.NotNull(Sei.Parse(Nal(Float(4, 3f), padding: 1)));
    }

    [Fact]
    public void Removes_emulation_prevention_bytes()
    {
        // 0.0 as a double is eight zero bytes; the encoder puts a 03 after every second zero that a zero follows.
        var escaped = new byte[] { 0x59, 0x00, 0x00, 0x03, 0x00, 0x00, 0x03, 0x00, 0x00, 0x03, 0x00, 0x00 };
        var frame = Sei.Parse(Nal([.. Varint(2, 1), .. escaped, .. Float(4, 5f)]));

        Assert.NotNull(frame);
        Assert.Equal(0.0, frame.Value.Lat);
        Assert.Equal(5f, frame.Value.SpeedMps);
    }
}
