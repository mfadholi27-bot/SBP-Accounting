using System.Globalization;
using System.Text;

namespace SBPAccounting;

public sealed record DbfField(string Name, char Type, int Length, int Decimals);

public sealed class DbfTable
{
    public List<DbfField> Fields { get; } = new();
    public List<Dictionary<string,string>> Rows { get; } = new();

    public static DbfTable Load(string path)
    {
        using var fs = File.OpenRead(path);
        using var br = new BinaryReader(fs, Encoding.ASCII, leaveOpen:false);
        fs.Position = 8;
        int headerLength = br.ReadUInt16();
        int recordLength = br.ReadUInt16();
        fs.Position = 32;
        var table = new DbfTable();
        while (fs.Position < headerLength - 1)
        {
            var block = br.ReadBytes(32);
            if (block.Length < 32 || block[0] == 0x0D) break;
            string name = Encoding.ASCII.GetString(block, 0, 11).TrimEnd('\0', ' ');
            char type = (char)block[11];
            int len = block[16];
            int dec = block[17];
            table.Fields.Add(new DbfField(name, type, len, dec));
        }
        fs.Position = headerLength;
        long count = (fs.Length - headerLength) / recordLength;
        Encoding enc = Encoding.GetEncoding(437);
        for (long i = 0; i < count; i++)
        {
            byte deleted = br.ReadByte();
            byte[] data = br.ReadBytes(recordLength - 1);
            if (data.Length != recordLength - 1) break;
            if (deleted == 0x2A) continue;
            var row = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
            int offset = 0;
            foreach (var f in table.Fields)
            {
                string raw = enc.GetString(data, offset, Math.Min(f.Length, data.Length - offset));
                offset += f.Length;
                raw = raw.TrimEnd('\0', ' ').Trim();
                if (f.Type == 'D' && raw.Length == 8 && DateTime.TryParseExact(raw, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))
                    raw = dt.ToString("yyyy-MM-dd");
                else if (f.Type == 'N' && decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var dec))
                    raw = dec.ToString("N" + f.Decimals, new CultureInfo("id-ID"));
                row[f.Name] = raw;
            }
            table.Rows.Add(row);
        }
        return table;
    }
}
