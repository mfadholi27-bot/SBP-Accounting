using Microsoft.Data.Sqlite;
using System.Globalization;

namespace SBPAccounting;

public sealed class AccountingDb
{
    private readonly string _path;
    public string Path => _path;

    public AccountingDb(string baseDir)
    {
        var dir = System.IO.Path.Combine(baseDir, "Data", "App");
        Directory.CreateDirectory(dir);
        _path = System.IO.Path.Combine(dir, "SBPAccounting.db");
        Initialize();
    }

    private SqliteConnection Open()
    {
        var c = new SqliteConnection($"Data Source={_path};Cache=Shared;Mode=ReadWriteCreate");
        c.Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;";
        cmd.ExecuteNonQuery();
        return c;
    }

    private void Initialize()
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = @"
CREATE TABLE IF NOT EXISTS AppInfo(Key TEXT PRIMARY KEY, Value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS Users(Id INTEGER PRIMARY KEY AUTOINCREMENT, Username TEXT NOT NULL UNIQUE, DisplayName TEXT NOT NULL, Role TEXT NOT NULL, PasswordHash TEXT NOT NULL, IsActive INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS Accounts(Code TEXT PRIMARY KEY, Name TEXT NOT NULL, AccountType TEXT NOT NULL DEFAULT 'LAINNYA', OpeningDebit NUMERIC NOT NULL DEFAULT 0, OpeningCredit NUMERIC NOT NULL DEFAULT 0, IsActive INTEGER NOT NULL DEFAULT 1, UpdatedAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS Periods(PeriodKey TEXT PRIMARY KEY, IsClosed INTEGER NOT NULL DEFAULT 0, ClosedAt TEXT, ClosedBy TEXT);
CREATE TABLE IF NOT EXISTS Journals(Id INTEGER PRIMARY KEY AUTOINCREMENT, JournalNo TEXT NOT NULL UNIQUE, JournalDate TEXT NOT NULL, Description TEXT NOT NULL, Status TEXT NOT NULL DEFAULT 'DRAFT', CorrectionOfId INTEGER, CreatedAt TEXT NOT NULL, CreatedBy TEXT NOT NULL, UpdatedAt TEXT, PostedAt TEXT, PostedBy TEXT, FOREIGN KEY(CorrectionOfId) REFERENCES Journals(Id));
CREATE TABLE IF NOT EXISTS JournalLines(Id INTEGER PRIMARY KEY AUTOINCREMENT, JournalId INTEGER NOT NULL, LineNo INTEGER NOT NULL, AccountCode TEXT NOT NULL, AccountName TEXT NOT NULL, Debit NUMERIC NOT NULL DEFAULT 0, Credit NUMERIC NOT NULL DEFAULT 0, FOREIGN KEY(JournalId) REFERENCES Journals(Id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS AuditLogs(Id INTEGER PRIMARY KEY AUTOINCREMENT, EventTime TEXT NOT NULL, Username TEXT NOT NULL, Action TEXT NOT NULL, Entity TEXT NOT NULL, EntityId TEXT, Details TEXT);
CREATE TABLE IF NOT EXISTS NptransSyncHistory(Id INTEGER PRIMARY KEY AUTOINCREMENT, SyncTime TEXT NOT NULL, Username TEXT NOT NULL, AddedCount INTEGER NOT NULL, ChangedCount INTEGER NOT NULL, DeletedCount INTEGER NOT NULL, TotalCount INTEGER NOT NULL, SnapshotPath TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS IX_Journals_Date ON Journals(JournalDate);
CREATE INDEX IF NOT EXISTS IX_JournalLines_Account ON JournalLines(AccountCode);
CREATE INDEX IF NOT EXISTS IX_AuditLogs_Time ON AuditLogs(EventTime);
";
        cmd.ExecuteNonQuery();
        Execute(c, "INSERT OR IGNORE INTO Users(Username,DisplayName,Role,PasswordHash) VALUES('admin','Administrator','ADMIN','OFFLINE')");
        Execute(c, "INSERT OR IGNORE INTO AppInfo(Key,Value) VALUES('CompanyName','PT. Surya Bratasena Plantation')");
        Execute(c, "INSERT OR IGNORE INTO AppInfo(Key,Value) VALUES('CurrentUser','admin')");
    }

    private static void Execute(SqliteConnection c, string sql)
    {
        using var cmd = c.CreateCommand(); cmd.CommandText = sql; cmd.ExecuteNonQuery();
    }

    public void Audit(string action, string entity, string? entityId, string details, string user = "admin")
    {
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "INSERT INTO AuditLogs(EventTime,Username,Action,Entity,EntityId,Details) VALUES($t,$u,$a,$e,$i,$d)";
        cmd.Parameters.AddWithValue("$t", DateTime.Now.ToString("s")); cmd.Parameters.AddWithValue("$u", user); cmd.Parameters.AddWithValue("$a", action); cmd.Parameters.AddWithValue("$e", entity); cmd.Parameters.AddWithValue("$i", (object?)entityId ?? DBNull.Value); cmd.Parameters.AddWithValue("$d", details); cmd.ExecuteNonQuery();
    }

    public void ImportAccounts(IEnumerable<Dictionary<string,string>> rows)
    {
        using var c = Open(); using var tx = c.BeginTransaction();
        foreach (var r in rows)
        {
            var code = r.GetValueOrDefault("SANDI")?.Trim() ?? "";
            if (string.IsNullOrWhiteSpace(code)) continue;
            var name = r.GetValueOrDefault("DES")?.Trim() ?? code;
            var db = ToDecimal(r.GetValueOrDefault("MUTASIDB"));
            var kr = ToDecimal(r.GetValueOrDefault("MUTASIKR"));
            using var cmd = c.CreateCommand();
            cmd.CommandText = @"INSERT INTO Accounts(Code,Name,OpeningDebit,OpeningCredit,UpdatedAt) VALUES($c,$n,$db,$kr,$t)
ON CONFLICT(Code) DO UPDATE SET Name=excluded.Name, UpdatedAt=excluded.UpdatedAt";
            cmd.Parameters.AddWithValue("$c", code); cmd.Parameters.AddWithValue("$n", name); cmd.Parameters.AddWithValue("$db", db); cmd.Parameters.AddWithValue("$kr", kr); cmd.Parameters.AddWithValue("$t", DateTime.Now.ToString("s")); cmd.ExecuteNonQuery();
        }
        tx.Commit();
    }

    private static decimal ToDecimal(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return 0;
        s = s.Replace("Rp", "", StringComparison.OrdinalIgnoreCase).Trim().Replace(".", "").Replace(",", ".");
        return decimal.TryParse(s, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : 0;
    }

    public string NextJournalNo(DateTime date)
    {
        var prefix = $"JU-{date:yyyyMM}-";
        using var c = Open(); using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT JournalNo FROM Journals WHERE JournalNo LIKE $p || '%' ORDER BY JournalNo DESC LIMIT 1"; cmd.Parameters.AddWithValue("$p", prefix);
        var last = cmd.ExecuteScalar()?.ToString();
        var n = 0; if (!string.IsNullOrWhiteSpace(last)) int.TryParse(last[(last.LastIndexOf('-') + 1)..], out n);
        return prefix + (n + 1).ToString("D4");
    }

    public long SaveJournal(string no, DateTime date, string desc, string status, string user, IEnumerable<JournalLineDto> lines, long? id = null, long? correctionOf = null)
    {
        var list = lines.Where(x => !string.IsNullOrWhiteSpace(x.AccountCode) && (x.Debit != 0 || x.Credit != 0)).ToList();
        var debit = list.Sum(x => x.Debit); var credit = list.Sum(x => x.Credit);
        if (list.Count == 0 || debit <= 0 || debit != credit) throw new InvalidOperationException("Jurnal harus memiliki detail dan total debet sama dengan total kredit.");
        using var c = Open(); using var tx = c.BeginTransaction();
        var now = DateTime.Now.ToString("s"); long journalId;
        if (id.HasValue)
        {
            if (IsPeriodClosed(c, date)) throw new InvalidOperationException("Periode jurnal sudah ditutup.");
            using var u = c.CreateCommand(); u.CommandText = "UPDATE Journals SET JournalNo=$n,JournalDate=$d,Description=$x,Status=$s,UpdatedAt=$t WHERE Id=$id"; Add(u, "$n", no); Add(u, "$d", date.ToString("yyyy-MM-dd")); Add(u, "$x", desc); Add(u, "$s", status); Add(u, "$t", now); Add(u, "$id", id.Value); u.ExecuteNonQuery();
            journalId = id.Value; using var del = c.CreateCommand(); del.CommandText = "DELETE FROM JournalLines WHERE JournalId=$id"; Add(del, "$id", journalId); del.ExecuteNonQuery();
        }
        else
        {
            using var ins = c.CreateCommand(); ins.CommandText = "INSERT INTO Journals(JournalNo,JournalDate,Description,Status,CorrectionOfId,CreatedAt,CreatedBy,PostedAt,PostedBy) VALUES($n,$d,$x,$s,$co,$t,$u,$pt,$pu); SELECT last_insert_rowid();";
            Add(ins, "$n", no); Add(ins, "$d", date.ToString("yyyy-MM-dd")); Add(ins, "$x", desc); Add(ins, "$s", status); Add(ins, "$co", correctionOf.HasValue ? correctionOf.Value : DBNull.Value); Add(ins, "$t", now); Add(ins, "$u", user); Add(ins, "$pt", status == "POSTED" ? now : DBNull.Value); Add(ins, "$pu", status == "POSTED" ? user : DBNull.Value); journalId = (long)(ins.ExecuteScalar() ?? 0L);
        }
        int lineNo = 1; foreach (var l in list)
        {
            using var li = c.CreateCommand(); li.CommandText = "INSERT INTO JournalLines(JournalId,LineNo,AccountCode,AccountName,Debit,Credit) VALUES($j,$n,$c,$a,$d,$k)"; Add(li,"$j",journalId); Add(li,"$n",lineNo++); Add(li,"$c",l.AccountCode); Add(li,"$a",l.AccountName); Add(li,"$d",l.Debit); Add(li,"$k",l.Credit); li.ExecuteNonQuery();
        }
        tx.Commit(); Audit(id.HasValue ? "EDIT" : "CREATE", "JOURNAL", journalId.ToString(), $"{no} | {status} | {desc}", user); return journalId;
    }


    public void SaveBulkJournals(List<BulkJournalInput> journals, string user="admin")
    {
        if(journals == null || journals.Count == 0) throw new InvalidOperationException("Tidak ada jurnal untuk disimpan.");
        using var c=Open(); using var tx=c.BeginTransaction();
        foreach(var j in journals)
        {
            if(string.IsNullOrWhiteSpace(j.NoBukti)) throw new InvalidOperationException("No. Bukti wajib diisi.");
            if(string.IsNullOrWhiteSpace(j.Keterangan)) throw new InvalidOperationException($"Keterangan untuk {j.NoBukti} wajib diisi.");
            var lines=j.Lines.Where(x=>!string.IsNullOrWhiteSpace(x.AccountCode) && (x.Debit!=0 || x.Credit!=0)).ToList();
            if(lines.Count==0) throw new InvalidOperationException($"{j.NoBukti} tidak memiliki detail.");
            if(lines.Any(x=>x.Debit<0||x.Credit<0|| (x.Debit>0&&x.Credit>0))) throw new InvalidOperationException($"{j.NoBukti} memiliki nilai debit/kredit tidak valid.");
            if(lines.Sum(x=>x.Debit)!=lines.Sum(x=>x.Credit)) throw new InvalidOperationException($"{j.NoBukti} belum balance.");
            if(IsPeriodClosed(c,j.Date)) throw new InvalidOperationException($"Periode {j.Date:MM/yyyy} sudah ditutup.");
            using(var dup=c.CreateCommand()){dup.CommandText="SELECT COUNT(*) FROM Journals WHERE JournalNo=$n";Add(dup,"$n",j.NoBukti);if(Convert.ToInt32(dup.ExecuteScalar())>0)throw new InvalidOperationException($"No. Bukti {j.NoBukti} sudah ada.");}
            var now=DateTime.Now.ToString("s");
            using var ins=c.CreateCommand();ins.CommandText="INSERT INTO Journals(JournalNo,JournalDate,Description,Status,CorrectionOfId,CreatedAt,CreatedBy,PostedAt,PostedBy) VALUES($n,$d,$x,$s,NULL,$t,$u,$pt,$pu); SELECT last_insert_rowid();";Add(ins,"$n",j.NoBukti);Add(ins,"$d",j.Date.ToString("yyyy-MM-dd"));Add(ins,"$x",j.Keterangan);Add(ins,"$s",j.Post?"POSTED":"DRAFT");Add(ins,"$t",now);Add(ins,"$u",user);Add(ins,"$pt",j.Post?now:DBNull.Value);Add(ins,"$pu",j.Post?user:DBNull.Value);var id=(long)(ins.ExecuteScalar()??0L);int line=1;foreach(var l in lines){using var li=c.CreateCommand();li.CommandText="INSERT INTO JournalLines(JournalId,LineNo,AccountCode,AccountName,Debit,Credit) VALUES($j,$n,$c,$a,$d,$k)";Add(li,"$j",id);Add(li,"$n",line++);Add(li,"$c",l.AccountCode);Add(li,"$a",l.AccountName);Add(li,"$d",l.Debit);Add(li,"$k",l.Credit);li.ExecuteNonQuery();}
            AuditTx(c,j.Post?"POST_MASSAL":"CREATE_MASSAL","JOURNAL",id.ToString(),$"{j.NoBukti} | {j.StatusLabel}",user);
        }
        tx.Commit();
    }
    private void AuditTx(SqliteConnection c,string action,string entity,string entityId,string details,string user)
    {using var cmd=c.CreateCommand();cmd.CommandText="INSERT INTO AuditLogs(EventTime,Username,Action,Entity,EntityId,Details) VALUES($t,$u,$a,$e,$i,$d)";Add(cmd,"$t",DateTime.Now.ToString("s"));Add(cmd,"$u",user);Add(cmd,"$a",action);Add(cmd,"$e",entity);Add(cmd,"$i",entityId);Add(cmd,"$d",details);cmd.ExecuteNonQuery();}

    public List<JournalDto> GetJournals(DateTime? from=null, DateTime? to=null)
    {
        using var c=Open(); using var cmd=c.CreateCommand(); cmd.CommandText=@"SELECT Id,JournalNo,JournalDate,Description,Status,CreatedBy,PostedBy FROM Journals WHERE ($f IS NULL OR JournalDate >= $f) AND ($t IS NULL OR JournalDate <= $t) ORDER BY JournalDate DESC, Id DESC"; Add(cmd,"$f",from?.ToString("yyyy-MM-dd") ?? (object)DBNull.Value); Add(cmd,"$t",to?.ToString("yyyy-MM-dd") ?? (object)DBNull.Value); using var rd=cmd.ExecuteReader(); var list=new List<JournalDto>(); while(rd.Read()) list.Add(new JournalDto(rd.GetInt64(0),rd.GetString(1),DateTime.Parse(rd.GetString(2)),rd.GetString(3),rd.GetString(4),rd.GetString(5),rd.IsDBNull(6)?"":rd.GetString(6))); return list;
    }

    public List<JournalLineDto> GetLines(long journalId)
    {
        using var c=Open(); using var cmd=c.CreateCommand(); cmd.CommandText="SELECT AccountCode,AccountName,Debit,Credit FROM JournalLines WHERE JournalId=$j ORDER BY LineNo"; Add(cmd,"$j",journalId); using var rd=cmd.ExecuteReader(); var list=new List<JournalLineDto>(); while(rd.Read()) list.Add(new JournalLineDto(rd.GetString(0),rd.GetString(1),rd.GetDecimal(2),rd.GetDecimal(3))); return list;
    }

    public void PostJournal(long id, string user="admin")
    {
        using var c=Open(); using var cmd=c.CreateCommand(); cmd.CommandText="SELECT JournalDate,Status,JournalNo FROM Journals WHERE Id=$i"; Add(cmd,"$i",id); using var rd=cmd.ExecuteReader(); if(!rd.Read()) throw new InvalidOperationException("Jurnal tidak ditemukan."); var date=DateTime.Parse(rd.GetString(0)); var status=rd.GetString(1); var no=rd.GetString(2); rd.Close(); if(IsPeriodClosed(c,date)) throw new InvalidOperationException("Periode sudah ditutup."); if(status=="POSTED") return; using var u=c.CreateCommand(); u.CommandText="UPDATE Journals SET Status='POSTED',PostedAt=$t,PostedBy=$u,UpdatedAt=$t WHERE Id=$i"; Add(u,"$t",DateTime.Now.ToString("s")); Add(u,"$u",user); Add(u,"$i",id); u.ExecuteNonQuery(); Audit("POST","JOURNAL",id.ToString(),no,user);
    }

    public bool IsPeriodClosed(DateTime date)
    {
        using var c=Open(); return IsPeriodClosed(c,date);
    }
    private static bool IsPeriodClosed(SqliteConnection c, DateTime date)
    {
        using var cmd=c.CreateCommand(); cmd.CommandText="SELECT IsClosed FROM Periods WHERE PeriodKey=$p"; Add(cmd,"$p",date.ToString("yyyy-MM")); var v=cmd.ExecuteScalar(); return v != null && Convert.ToInt32(v) == 1;
    }

    public void ClosePeriod(DateTime date, string user="admin")
    {
        using var c=Open(); var key=date.ToString("yyyy-MM"); using var chk=c.CreateCommand(); chk.CommandText="SELECT COUNT(*) FROM Journals WHERE JournalDate LIKE $p || '%' AND Status!='POSTED'"; Add(chk,"$p",key); if(Convert.ToInt32(chk.ExecuteScalar())>0) throw new InvalidOperationException("Masih ada jurnal yang belum diposting pada periode ini."); using var cmd=c.CreateCommand(); cmd.CommandText="INSERT INTO Periods(PeriodKey,IsClosed,ClosedAt,ClosedBy) VALUES($p,1,$t,$u) ON CONFLICT(PeriodKey) DO UPDATE SET IsClosed=1,ClosedAt=$t,ClosedBy=$u"; Add(cmd,"$p",key); Add(cmd,"$t",DateTime.Now.ToString("s")); Add(cmd,"$u",user); cmd.ExecuteNonQuery(); Audit("CLOSE","PERIOD",key,"Periode ditutup",user);
    }

    public List<LedgerRowDto> GetLedger(string? account, DateTime from, DateTime to)
    {
        using var c=Open(); using var cmd=c.CreateCommand(); cmd.CommandText=@"SELECT j.JournalDate,j.JournalNo,jl.AccountCode,jl.AccountName,j.Description,jl.Debit,jl.Credit,j.Status FROM JournalLines jl JOIN Journals j ON j.Id=jl.JournalId WHERE j.Status='POSTED' AND j.JournalDate BETWEEN $f AND $t AND ($a='' OR jl.AccountCode=$a) ORDER BY j.JournalDate,j.Id,jl.LineNo"; Add(cmd,"$f",from.ToString("yyyy-MM-dd")); Add(cmd,"$t",to.ToString("yyyy-MM-dd")); Add(cmd,"$a",account?.Trim() ?? ""); using var rd=cmd.ExecuteReader(); var list=new List<LedgerRowDto>(); decimal running=0; while(rd.Read()){var d=rd.GetDecimal(5);var k=rd.GetDecimal(6);running += d-k;list.Add(new LedgerRowDto(DateTime.Parse(rd.GetString(0)),rd.GetString(1),rd.GetString(2),rd.GetString(3),rd.GetString(4),d,k,running));} return list;
    }

    public List<TrialRowDto> GetTrialBalance(DateTime from, DateTime to)
    {
        using var c=Open(); using var cmd=c.CreateCommand(); cmd.CommandText=@"SELECT jl.AccountCode,MAX(jl.AccountName),SUM(jl.Debit),SUM(jl.Credit) FROM JournalLines jl JOIN Journals j ON j.Id=jl.JournalId WHERE j.Status='POSTED' AND j.JournalDate BETWEEN $f AND $t GROUP BY jl.AccountCode ORDER BY jl.AccountCode"; Add(cmd,"$f",from.ToString("yyyy-MM-dd")); Add(cmd,"$t",to.ToString("yyyy-MM-dd")); using var rd=cmd.ExecuteReader(); var list=new List<TrialRowDto>(); while(rd.Read()) list.Add(new TrialRowDto(rd.GetString(0),rd.IsDBNull(1)?"":rd.GetString(1),rd.GetDecimal(2),rd.GetDecimal(3))); return list;
    }

    public List<AuditDto> GetAudit(int limit=300)
    { using var c=Open(); using var cmd=c.CreateCommand(); cmd.CommandText="SELECT EventTime,Username,Action,Entity,EntityId,Details FROM AuditLogs ORDER BY Id DESC LIMIT $n"; Add(cmd,"$n",limit); using var rd=cmd.ExecuteReader(); var l=new List<AuditDto>(); while(rd.Read()) l.Add(new AuditDto(rd.GetString(0),rd.GetString(1),rd.GetString(2),rd.GetString(3),rd.IsDBNull(4)?"":rd.GetString(4),rd.IsDBNull(5)?"":rd.GetString(5))); return l; }

    public void AddSyncHistory(string user,int added,int changed,int deleted,int total,string snapshotPath)
    { using var c=Open(); using var cmd=c.CreateCommand(); cmd.CommandText="INSERT INTO NptransSyncHistory(SyncTime,Username,AddedCount,ChangedCount,DeletedCount,TotalCount,SnapshotPath) VALUES($t,$u,$a,$c,$d,$n,$p)"; Add(cmd,"$t",DateTime.Now.ToString("s"));Add(cmd,"$u",user);Add(cmd,"$a",added);Add(cmd,"$c",changed);Add(cmd,"$d",deleted);Add(cmd,"$n",total);Add(cmd,"$p",snapshotPath);cmd.ExecuteNonQuery(); }

    public List<(string Time,int Added,int Changed,int Deleted,int Total)> GetSyncHistory()
    { using var c=Open(); using var cmd=c.CreateCommand(); cmd.CommandText="SELECT SyncTime,AddedCount,ChangedCount,DeletedCount,TotalCount FROM NptransSyncHistory ORDER BY Id DESC"; using var rd=cmd.ExecuteReader(); var l=new List<(string,int,int,int,int)>(); while(rd.Read()) l.Add((rd.GetString(0),rd.GetInt32(1),rd.GetInt32(2),rd.GetInt32(3),rd.GetInt32(4))); return l; }

    public void BackupTo(string destination)
    { Directory.CreateDirectory(System.IO.Path.GetDirectoryName(destination)!); File.Copy(_path,destination,true); }
    public void RestoreFrom(string source)
    { if(!File.Exists(source)) throw new FileNotFoundException("Backup database tidak ditemukan.",source); File.Copy(source,_path,true); }

    public List<AccountDto> GetAccounts()
    {
        using var c = Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT Code,Name,AccountType,OpeningDebit,OpeningCredit,IsActive,UpdatedAt FROM Accounts ORDER BY Code";
        using var rd = cmd.ExecuteReader();
        var list = new List<AccountDto>();
        while (rd.Read())
            list.Add(new AccountDto(rd.GetString(0), rd.GetString(1), rd.GetString(2), rd.GetDecimal(3), rd.GetDecimal(4), rd.GetInt32(5) == 1, rd.GetString(6)));
        return list;
    }

    public void SyncAccountsFromLegacy(IEnumerable<Dictionary<string,string>> rows, string user = "admin")
    {
        var list = rows.Where(r => !string.IsNullOrWhiteSpace(r.GetValueOrDefault("SANDI"))).ToList();
        using var c = Open();
        using var tx = c.BeginTransaction();
        foreach (var r in list)
        {
            var code = r.GetValueOrDefault("SANDI")?.Trim() ?? "";
            if (code.Length == 0) continue;
            var name = r.GetValueOrDefault("DES")?.Trim() ?? code;
            var debit = ToDecimal(r.GetValueOrDefault("MUTASIDB"));
            var credit = ToDecimal(r.GetValueOrDefault("MUTASIKR"));
            using var cmd = c.CreateCommand();
            cmd.CommandText = @"INSERT INTO Accounts(Code,Name,OpeningDebit,OpeningCredit,UpdatedAt,IsActive)
VALUES($c,$n,$db,$cr,$t,1)
ON CONFLICT(Code) DO UPDATE SET Name=excluded.Name,OpeningDebit=excluded.OpeningDebit,OpeningCredit=excluded.OpeningCredit,IsActive=1,UpdatedAt=excluded.UpdatedAt";
            Add(cmd,"$c",code); Add(cmd,"$n",name); Add(cmd,"$db",debit); Add(cmd,"$cr",credit); Add(cmd,"$t",DateTime.Now.ToString("s")); cmd.ExecuteNonQuery();
        }
        tx.Commit();
        Audit("SYNC_FORCE", "NPSALDO", null, $"Sinkronisasi {list.Count:N0} akun dari DBF", user);
    }

    public void ForceUpdateAccount(string code, string name, decimal debit, decimal credit, string reason, string user = "admin")
    {
        if (string.IsNullOrWhiteSpace(code)) throw new InvalidOperationException("Kode akun wajib diisi.");
        if (string.IsNullOrWhiteSpace(reason)) throw new InvalidOperationException("Alasan perbaikan wajib diisi.");
        using var c = Open(); using var tx = c.BeginTransaction();
        using var old = c.CreateCommand(); old.CommandText = "SELECT Name,OpeningDebit,OpeningCredit,IsActive FROM Accounts WHERE Code=$c"; Add(old,"$c",code.Trim());
        using var rd = old.ExecuteReader();
        if (!rd.Read()) { rd.Close(); throw new InvalidOperationException("Kode akun tidak ditemukan di database modern."); }
        var before = $"Nama={rd.GetString(0)}; Debet={rd.GetDecimal(1).ToString(CultureInfo.InvariantCulture)}; Kredit={rd.GetDecimal(2).ToString(CultureInfo.InvariantCulture)}; Aktif={rd.GetInt32(3)}";
        rd.Close();
        using var cmd = c.CreateCommand(); cmd.CommandText = "UPDATE Accounts SET Name=$n,OpeningDebit=$db,OpeningCredit=$cr,IsActive=1,UpdatedAt=$t WHERE Code=$c"; Add(cmd,"$n",name.Trim()); Add(cmd,"$db",debit); Add(cmd,"$cr",credit); Add(cmd,"$t",DateTime.Now.ToString("s")); Add(cmd,"$c",code.Trim()); cmd.ExecuteNonQuery();
        AuditTx(c,"FORCE_EDIT","NPSALDO",code.Trim(),$"SEBELUM: {before} | SESUDAH: Nama={name.Trim()}; Debet={debit.ToString(CultureInfo.InvariantCulture)}; Kredit={credit.ToString(CultureInfo.InvariantCulture)} | ALASAN: {reason.Trim()}",user);
        tx.Commit();
    }

    public void ForceDeleteAccount(string code, string reason, string user = "admin")
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new InvalidOperationException("Alasan penghapusan wajib diisi.");
        using var c = Open(); using var tx = c.BeginTransaction();
        using var chk = c.CreateCommand(); chk.CommandText = "SELECT Name,OpeningDebit,OpeningCredit FROM Accounts WHERE Code=$c"; Add(chk,"$c",code.Trim());
        using var rd = chk.ExecuteReader(); if(!rd.Read()) throw new InvalidOperationException("Kode akun tidak ditemukan."); var before=$"Nama={rd.GetString(0)}; Debet={rd.GetDecimal(1)}; Kredit={rd.GetDecimal(2)}"; rd.Close();
        using var used = c.CreateCommand(); used.CommandText = "SELECT COUNT(*) FROM JournalLines WHERE AccountCode=$c"; Add(used,"$c",code.Trim());
        if(Convert.ToInt32(used.ExecuteScalar())>0) throw new InvalidOperationException("Akun sudah dipakai jurnal. Demi menjaga histori, akun tidak boleh dihapus permanen. Gunakan nonaktif/perbaikan paksa.");
        using var del = c.CreateCommand(); del.CommandText = "DELETE FROM Accounts WHERE Code=$c"; Add(del,"$c",code.Trim()); del.ExecuteNonQuery();
        AuditTx(c,"FORCE_DELETE","NPSALDO",code.Trim(),$"SEBELUM: {before} | ALASAN: {reason.Trim()}",user); tx.Commit();
    }

    public void ForceUpdatePostedJournal(long id, string no, DateTime date, string desc, IEnumerable<JournalLineDto> lines, string reason, string user = "admin")
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new InvalidOperationException("Alasan perbaikan wajib diisi.");
        var list=lines.Where(x=>!string.IsNullOrWhiteSpace(x.AccountCode) && (x.Debit!=0 || x.Credit!=0)).ToList();
        if(list.Count==0 || list.Sum(x=>x.Debit)<=0 || list.Sum(x=>x.Debit)!=list.Sum(x=>x.Credit)) throw new InvalidOperationException("Jurnal harus balance.");
        if(list.Any(x=>x.Debit<0 || x.Credit<0 || (x.Debit>0 && x.Credit>0))) throw new InvalidOperationException("Setiap baris hanya boleh memiliki Debet atau Kredit.");
        var oldLines=GetLines(id);
        using var c=Open(); using var tx=c.BeginTransaction();
        using var old=c.CreateCommand(); old.CommandText="SELECT JournalNo,JournalDate,Description,Status FROM Journals WHERE Id=$i"; Add(old,"$i",id); using var rd=old.ExecuteReader(); if(!rd.Read()) throw new InvalidOperationException("Jurnal tidak ditemukan."); var oldNo=rd.GetString(0); var oldDate=rd.GetString(1); var oldDesc=rd.GetString(2); var oldStatus=rd.GetString(3); rd.Close(); if(!oldStatus.Equals("POSTED",StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Jurnal bukan POSTED.");
        var before=$"No={oldNo}; Tanggal={oldDate}; Keterangan={oldDesc}; Detail={string.Join(" | ",oldLines.Select(x=>$"{x.AccountCode}:{x.Debit}/{x.Credit}"))}";
        using var u=c.CreateCommand(); u.CommandText="UPDATE Journals SET JournalNo=$n,JournalDate=$d,Description=$x,Status='POSTED',UpdatedAt=$t,PostedAt=COALESCE(PostedAt,$t),PostedBy=COALESCE(PostedBy,$u) WHERE Id=$i"; Add(u,"$n",no.Trim()); Add(u,"$d",date.ToString("yyyy-MM-dd")); Add(u,"$x",desc.Trim()); Add(u,"$t",DateTime.Now.ToString("s")); Add(u,"$u",user); Add(u,"$i",id); u.ExecuteNonQuery();
        using var del=c.CreateCommand(); del.CommandText="DELETE FROM JournalLines WHERE JournalId=$i"; Add(del,"$i",id); del.ExecuteNonQuery(); int n=1; foreach(var l in list){using var li=c.CreateCommand();li.CommandText="INSERT INTO JournalLines(JournalId,LineNo,AccountCode,AccountName,Debit,Credit) VALUES($j,$n,$c,$a,$d,$k)";Add(li,"$j",id);Add(li,"$n",n++);Add(li,"$c",l.AccountCode.Trim());Add(li,"$a",l.AccountName.Trim());Add(li,"$d",l.Debit);Add(li,"$k",l.Credit);li.ExecuteNonQuery();}
        var after=$"No={no.Trim()}; Tanggal={date:yyyy-MM-dd}; Keterangan={desc.Trim()}; Detail={string.Join(" | ",list.Select(x=>$"{x.AccountCode}:{x.Debit}/{x.Credit}"))}";
        AuditTx(c,"FORCE_EDIT","JOURNAL",id.ToString(),$"SEBELUM: {before} | SESUDAH: {after} | ALASAN: {reason.Trim()}",user); tx.Commit();
    }

    public void ForceVoidJournal(long id, string reason, string user = "admin")
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new InvalidOperationException("Alasan VOID wajib diisi.");
        using var c=Open(); using var tx=c.BeginTransaction(); using var q=c.CreateCommand(); q.CommandText="SELECT JournalNo,Status FROM Journals WHERE Id=$i"; Add(q,"$i",id); using var rd=q.ExecuteReader(); if(!rd.Read()) throw new InvalidOperationException("Jurnal tidak ditemukan."); var no=rd.GetString(0); var status=rd.GetString(1); rd.Close(); if(status!="POSTED") throw new InvalidOperationException("Hanya jurnal POSTED yang dapat di-VOID."); using var u=c.CreateCommand();u.CommandText="UPDATE Journals SET Status='VOID',UpdatedAt=$t WHERE Id=$i";Add(u,"$t",DateTime.Now.ToString("s"));Add(u,"$i",id);u.ExecuteNonQuery();AuditTx(c,"FORCE_VOID","JOURNAL",id.ToString(),$"No={no} | SEBELUM=POSTED | SESUDAH=VOID | ALASAN: {reason.Trim()}",user);tx.Commit();
    }

    public void ForceDeleteJournal(long id, string reason, string user = "admin")
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new InvalidOperationException("Alasan penghapusan wajib diisi.");
        var lines=GetLines(id);
        using var c=Open(); using var tx=c.BeginTransaction(); using var q=c.CreateCommand();q.CommandText="SELECT JournalNo,JournalDate,Description,Status FROM Journals WHERE Id=$i";Add(q,"$i",id);using var rd=q.ExecuteReader();if(!rd.Read())throw new InvalidOperationException("Jurnal tidak ditemukan.");var no=rd.GetString(0);var date=rd.GetString(1);var desc=rd.GetString(2);var status=rd.GetString(3);rd.Close();var before=$"No={no}; Tanggal={date}; Status={status}; Keterangan={desc}; Detail={string.Join(" | ",lines.Select(x=>$"{x.AccountCode}:{x.Debit}/{x.Credit}"))}";using var dl=c.CreateCommand();dl.CommandText="DELETE FROM JournalLines WHERE JournalId=$i";Add(dl,"$i",id);dl.ExecuteNonQuery();using var dj=c.CreateCommand();dj.CommandText="DELETE FROM Journals WHERE Id=$i";Add(dj,"$i",id);dj.ExecuteNonQuery();AuditTx(c,"FORCE_DELETE","JOURNAL",id.ToString(),$"{before} | ALASAN: {reason.Trim()}",user);tx.Commit();
    }

    private static void Add(SqliteCommand cmd,string name,object value){cmd.Parameters.AddWithValue(name,value ?? DBNull.Value);}
}

public sealed record BulkJournalInput(string NoBukti, DateTime Date, string Keterangan, List<JournalLineDto> Lines, bool Post)
{ public string StatusLabel => Post ? "POSTED" : "DRAFT"; }

public sealed record JournalLineDto(string AccountCode,string AccountName,decimal Debit,decimal Credit);
public sealed record JournalDto(long Id,string No,DateTime Date,string Description,string Status,string CreatedBy,string PostedBy);
public sealed record AccountDto(string Code,string Name,string AccountType,decimal OpeningDebit,decimal OpeningCredit,bool IsActive,string UpdatedAt);
public sealed record LedgerRowDto(DateTime Date,string No,string AccountCode,string AccountName,string Description,decimal Debit,decimal Credit,decimal Running);
public sealed record TrialRowDto(string AccountCode,string AccountName,decimal Debit,decimal Credit);
public sealed record AuditDto(string Time,string User,string Action,string Entity,string EntityId,string Details);
