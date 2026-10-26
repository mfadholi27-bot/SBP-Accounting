using System.Drawing.Printing;
using System.Globalization;
using System.Text.Json;

namespace SBPAccounting;

public sealed class MainForm : Form
{
    private readonly Color Bg = Color.FromArgb(245,247,250);
    private readonly Color Navy = Color.FromArgb(18,29,48);
    private readonly Color Navy2 = Color.FromArgb(27,43,68);
    private readonly Color Blue = Color.FromArgb(35,103,190);
    private readonly Color TextColor = Color.FromArgb(31,41,55);
    private readonly Color Muted = Color.FromArgb(100,116,139);
    private readonly Color Border = Color.FromArgb(226,232,240);
    private readonly Panel pageHost = new();
    private readonly Label title = new();
    private readonly Label subtitle = new();
    private readonly Label offline = new();
    private readonly Label clock = new();
    private readonly FlowLayoutPanel nav = new();
    private readonly System.Windows.Forms.Timer timer = new();
    private readonly AccountingDb db;
    private Button? active;
    private DataGridView grid = new();
    private DbfTable? nptrans;
    private DbfTable? npsaldo;
    private string selectedNoBukti = "";
    private DateTime reportFrom = new(DateTime.Now.Year, DateTime.Now.Month, 1);
    private DateTime reportTo = DateTime.Now.Date;
    private PrintSettings printSettings;
    private string PrintSettingsPath => Path.Combine(AppContext.BaseDirectory, "Data", "print-settings.json");

    private string DataDir => ResolveLegacyDataDir();
    private string SyncDir => Path.Combine(AppContext.BaseDirectory,"Data","Sync");
    private string SnapshotPath => Path.Combine(SyncDir,"NPTRANS.snapshot.json");
    private string SnapshotBackupDir => Path.Combine(SyncDir,"Backup");

    public MainForm()
    {
        base.Text = "SBP Accounting — PT. Surya Bratasena Plantation";
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1100,700);
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Bg;
        Font = new Font("Segoe UI",10F);
        DoubleBuffered = true;
        db = new AccountingDb(AppContext.BaseDirectory);
        printSettings = LoadPrintSettings();
        BuildShell();
        LoadLegacyData();
        try { if(npsaldo != null) db.ImportAccounts(npsaldo.Rows); } catch { }
        ShowDashboard();
        timer.Interval=1000;
        timer.Tick += (_,_) => clock.Text=DateTime.Now.ToString("dd MMM yyyy  HH:mm:ss",new CultureInfo("id-ID"));
        timer.Start();
    }

    private void BuildShell()
    {
        var sidebar=new Panel { Dock=DockStyle.Left, Width=262, BackColor=Navy, Padding=new Padding(12,14,12,12) };
        var brand=new TableLayoutPanel { Dock=DockStyle.Top, Height=112, ColumnCount=1, RowCount=3, BackColor=Navy, Padding=new Padding(6,2,6,8) };
        brand.RowStyles.Add(new RowStyle(SizeType.Absolute,54)); brand.RowStyles.Add(new RowStyle(SizeType.Absolute,24)); brand.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        CellAdd(brand,BrandLabel("SBP",27,Color.White),0,0); CellAdd(brand,BrandLabel("ACCOUNTING",9,Color.FromArgb(173,190,214)),0,1); CellAdd(brand,BrandLabel("PT. SURYA BRATASENA PLANTATION",7.5F,Color.FromArgb(120,145,178)),0,2);
        sidebar.Controls.Add(brand);
        nav.Dock=DockStyle.Fill; nav.FlowDirection=FlowDirection.TopDown; nav.WrapContents=false; nav.AutoScroll=true; nav.BackColor=Navy; nav.Padding=new Padding(0,4,0,8);
        var footer=new Panel { Dock=DockStyle.Bottom, Height=62, BackColor=Navy, Padding=new Padding(0,8,0,0) };
        var exit=NavButton("Keluar","×"); exit.Width=238; exit.Click+=(_,_)=>{if(MessageBox.Show("Keluar dari SBP Accounting?","Konfirmasi",MessageBoxButtons.YesNo,MessageBoxIcon.Question)==DialogResult.Yes)Close();}; footer.Controls.Add(exit);
        sidebar.Controls.Add(footer); sidebar.Controls.Add(nav);

        AddNav("Dashboard","01",ShowDashboard);
        AddNavSection("JURNAL"); AddNav("Jurnal Baru","J1",ShowJurnal); AddNav("Daftar Jurnal","J2",ShowDaftarJurnal); AddNav("Jurnal Koreksi","J3",ShowJurnalKoreksi); AddNav("Cetak Jurnal","J4",ShowCetakJurnal); AddNav("Input Massal / Import","J5",ShowJurnalMassal); AddNav("Perbaikan Paksa Admin","J6",ShowForceJurnal);
        AddNavSection("BUKU BESAR"); AddNav("Buku Besar","B1",ShowBukuBesar); AddNav("Mutasi Akun","B2",ShowMutasiAkun); AddNav("Sinkronisasi Mutasi","B3",ShowSinkronMutasi);
        AddNavSection("SALDO & AKUN"); AddNav("Master Akun","A1",ShowMasterAkun); AddNav("Saldo Akun","A2",ShowSaldo); AddNav("Sinkronisasi NPSALDO","A5",ShowNpsaldoAdmin); AddNav("Perbaikan Paksa NPSALDO","A6",ShowNpsaldoAdmin); AddNav("Saldo ACC & PROG","A3",ShowSaldoAccProg); AddNav("Data Bulanan ACC & PROG","A4",ShowDataBulanan);
        AddNavSection("LAPORAN"); AddNav("Tanggal Laporan","L1",ShowTanggalLaporan); AddNav("Buku Besar","L2",ShowBukuBesar); AddNav("Neraca Percobaan","L3",ShowNeracaPercobaan); AddNav("Neraca","L4",ShowNeraca); AddNav("Laporan Keuangan","L5",ShowLaporanKeuangan); AddNav("Tanaman Belum Menghasilkan","L6",ShowTbm); AddNav("Tanaman Menghasilkan","L7",ShowTm); AddNav("Neraca per Bukti","L8",ShowNeracaPerBukti);
        AddNavSection("NPTRANS LEGACY"); AddNav("Lihat NPTRANS","N1",ShowNptrans); AddNav("Cari NPTRANS","N2",ShowNptrans); AddNav("Cetak NPTRANS","N3",ShowNptrans); AddNav("Tinjau Perubahan","N4",ReviewNptransChanges); AddNav("Sinkronisasi","N5",SyncNptrans); AddNav("Riwayat Sinkronisasi","N6",ShowSyncHistory);
        AddNavSection("TUTUP BUKU"); AddNav("Tutup Bulan","T1",ShowTutupBulan); AddNav("Tutup Tahun","T2",ShowTutupTahun); AddNav("Riwayat Periode","T3",ShowRiwayatPeriode);
        AddNavSection("PENGATURAN"); AddNav("Backup","P1",ShowBackup); AddNav("Restore","P2",ShowRestore); AddNav("User & Hak Akses","P3",ShowUsers); AddNav("Audit Trail","P4",ShowAudit); AddNav("Pengaturan Database","P5",ShowSettings); AddNav("Reindex Data","P6",ShowReindex); AddNav("Printer","P7",ShowPrinter); AddNav("Informasi Perusahaan","P8",ShowCompanyInfo);

        var right=new TableLayoutPanel { Dock=DockStyle.Fill, BackColor=Bg, ColumnCount=1, RowCount=2 }; right.RowStyles.Add(new RowStyle(SizeType.Absolute,92)); right.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var header=new Panel { Dock=DockStyle.Fill, BackColor=Color.White, Padding=new Padding(24,10,24,8) }; var hl=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=2}; hl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,72));hl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,28));hl.RowStyles.Add(new RowStyle(SizeType.Absolute,38));hl.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        title.Dock=DockStyle.Fill; title.Font=new Font("Segoe UI Semibold",18); title.ForeColor=TextColor; title.TextAlign=ContentAlignment.MiddleLeft; title.Margin=Padding.Empty;
        subtitle.Dock=DockStyle.Fill; subtitle.Font=new Font("Segoe UI",9); subtitle.ForeColor=Muted; subtitle.TextAlign=ContentAlignment.MiddleLeft; subtitle.Margin=Padding.Empty;
        offline.Dock=DockStyle.Fill; offline.Text="●  OFFLINE • DATABASE LOKAL"; offline.Font=new Font("Segoe UI Semibold",9); offline.ForeColor=Color.FromArgb(16,130,80); offline.TextAlign=ContentAlignment.MiddleRight; offline.Margin=Padding.Empty;
        clock.Dock=DockStyle.Fill; clock.Font=new Font("Segoe UI",9); clock.ForeColor=Muted; clock.TextAlign=ContentAlignment.MiddleRight; clock.Margin=Padding.Empty;
        CellAdd(hl,title,0,0);CellAdd(hl,offline,1,0);CellAdd(hl,subtitle,0,1);CellAdd(hl,clock,1,1);header.Controls.Add(hl);
        CellAdd(right,header,0,0); pageHost.Dock=DockStyle.Fill; pageHost.Padding=new Padding(24); pageHost.BackColor=Bg; CellAdd(right,pageHost,0,1);
        Controls.Add(right); Controls.Add(sidebar);
    }

    private static void CellAdd(TableLayoutPanel panel, Control control, int column, int row)
    {
        panel.Controls.Add(control, column, row);
    }

    // Overload for ordinary Panel controls. Some UI containers are Panels,
    // so they cannot use the TableLayoutPanel-specific overload above.
    private static void CellAdd(Panel panel, Control control, int column, int row)
    {
        control.Location = new Point(column, row);
        panel.Controls.Add(control);
    }

    private Label BrandLabel(string text,float size,Color color)=>new(){Text=text,Dock=DockStyle.Fill,AutoSize=false,TextAlign=ContentAlignment.MiddleLeft,ForeColor=color,Font=new Font("Segoe UI Semibold",size),Margin=Padding.Empty};
    private void AddNavSection(string text)=>nav.Controls.Add(new Label{Text=text,Width=238,Height=27,Margin=new Padding(6,12,0,2),Padding=new Padding(8,4,0,0),ForeColor=Color.FromArgb(119,143,175),Font=new Font("Segoe UI Semibold",8),BackColor=Navy,AutoSize=false});
    private Button NavButton(string text,string code)=>new(){Text=$"{code}   {text}",Width=238,Height=43,Margin=new Padding(0,3,0,3),FlatStyle=FlatStyle.Flat,BackColor=Navy,ForeColor=Color.FromArgb(224,232,243),TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",9.5F),Cursor=Cursors.Hand,UseVisualStyleBackColor=false};
    private void AddNav(string text,string code,Action action){var b=NavButton(text,code);b.FlatAppearance.BorderSize=0;b.FlatAppearance.MouseOverBackColor=Navy2;b.Click+=(_,_)=>{SetActive(b);action();};nav.Controls.Add(b);if(text=="Dashboard")SetActive(b);}
    private void SetActive(Button b){if(active!=null)active.BackColor=Navy;active=b;active.BackColor=Color.FromArgb(39,67,104);}
    private string ResolveLegacyDataDir()
    {
        var candidates = new List<string>();
        void Add(string? root)
        {
            if (string.IsNullOrWhiteSpace(root)) return;
            try { candidates.Add(Path.GetFullPath(Path.Combine(root, "Data", "Legacy"))); } catch { }
        }

        // 1) Folder beside the published EXE.
        Add(AppContext.BaseDirectory);
        // 2) Folder beside the current working directory.
        Add(Environment.CurrentDirectory);

        // 3) Walk upward so a Visual Studio build can still read the project's
        //    original Data\Legacy folder instead of a stale copy in bin\Debug.
        try
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            for (int i = 0; i < 6 && dir != null; i++, dir = dir.Parent)
                Add(dir.FullName);
        }
        catch { }

        // 4) Common legacy location used by this SBP Accounting installation.
        Add(@"D:\NPTRANS\sbp_desktop");

        foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (File.Exists(Path.Combine(candidate, "NPSALDO.DBF")) ||
                File.Exists(Path.Combine(candidate, "NPTRANS.DBF")))
                return candidate;
        }

        // Keep a deterministic default even when the files have not been copied yet.
        return candidates.FirstOrDefault() ?? Path.Combine(AppContext.BaseDirectory, "Data", "Legacy");
    }

    private void LoadLegacyData()
    {
        nptrans = null;
        npsaldo = null;
        try
        {
            var p = Path.Combine(DataDir, "NPTRANS.DBF");
            if (File.Exists(p)) nptrans = DbfTable.Load(p);
        }
        catch { nptrans = null; }
        try
        {
            var p = Path.Combine(DataDir, "NPSALDO.DBF");
            if (File.Exists(p)) npsaldo = DbfTable.Load(p);
        }
        catch { npsaldo = null; }
    }
    private void ClearPage(string h,string s){pageHost.Controls.Clear();title.Text=h;subtitle.Text=s;}
    private Panel Surface(){return new Panel{BackColor=Color.White,BorderStyle=BorderStyle.FixedSingle,Dock=DockStyle.Fill,Padding=new Padding(18)};}
    private Button ActionButton(string text,EventHandler handler,bool secondary=false){var b=new Button{Text=text,Width=160,Height=42,FlatStyle=FlatStyle.Flat,BackColor=secondary?Color.White:Blue,ForeColor=secondary?TextColor:Color.White,Font=new Font("Segoe UI Semibold",10),Cursor=Cursors.Hand,UseVisualStyleBackColor=false,Margin=new Padding(0,0,10,0),Padding=new Padding(10,0,10,0)};b.FlatAppearance.BorderColor=secondary?Border:Blue;b.FlatAppearance.BorderSize=1;b.Click+=handler;return b;}
    private DataGridView CreateGrid(){var g=new DataGridView{Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,RowHeadersVisible=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,AutoGenerateColumns=true,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,BackgroundColor=Color.White,BorderStyle=BorderStyle.None,GridColor=Border,CellBorderStyle=DataGridViewCellBorderStyle.SingleHorizontal};g.EnableHeadersVisualStyles=false;g.ColumnHeadersDefaultCellStyle.BackColor=Color.FromArgb(241,245,249);g.ColumnHeadersDefaultCellStyle.ForeColor=TextColor;g.ColumnHeadersDefaultCellStyle.Font=new Font("Segoe UI Semibold",10);g.ColumnHeadersDefaultCellStyle.Alignment=DataGridViewContentAlignment.MiddleLeft;g.ColumnHeadersHeight=40;g.ColumnHeadersHeightSizeMode=DataGridViewColumnHeadersHeightSizeMode.DisableResizing;g.DefaultCellStyle.Font=new Font("Segoe UI",10);g.DefaultCellStyle.SelectionBackColor=Color.FromArgb(220,234,252);g.DefaultCellStyle.SelectionForeColor=TextColor;g.DefaultCellStyle.Padding=new Padding(8,0,8,0);g.AlternatingRowsDefaultCellStyle.BackColor=Color.FromArgb(248,250,252);g.RowTemplate.Height=36;g.AutoSizeRowsMode=DataGridViewAutoSizeRowsMode.None;g.AllowUserToResizeRows=false;return g;}

    private TableLayoutPanel PageRoot(int rows){var p=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=rows,Margin=Padding.Empty,Padding=Padding.Empty};for(int i=0;i<rows;i++)p.RowStyles.Add(new RowStyle(i==rows-1?SizeType.Percent:SizeType.Absolute,i==rows-1?100:82));return p;}
    private FlowLayoutPanel Toolbar(){return new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,AutoScroll=true,Padding=new Padding(0,4,0,8),Margin=Padding.Empty};}
    private DateTimePicker DateInput(DateTime value,int width=150){return new DateTimePicker{Width=width,Height=40,Value=value.Date,Format=DateTimePickerFormat.Custom,CustomFormat="dd/MM/yyyy",Font=new Font("Segoe UI",10)};}
    private DateTimePicker MonthInput(DateTime value,int width=170){return new DateTimePicker{Width=width,Height=40,Value=new DateTime(value.Year,value.Month,1),Format=DateTimePickerFormat.Custom,CustomFormat="MMMM yyyy",Font=new Font("Segoe UI",10)};}

    private void ShowDashboard()
    {
        ClearPage("Dashboard","Ringkasan sistem • data legacy tetap aman dan database modern lokal aktif");
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=4};root.RowStyles.Add(new RowStyle(SizeType.Absolute,86));root.RowStyles.Add(new RowStyle(SizeType.Absolute,120));root.RowStyles.Add(new RowStyle(SizeType.Absolute,90));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var w=new Label{Text="Selamat datang",Dock=DockStyle.Fill,Font=new Font("Segoe UI Semibold",22),ForeColor=TextColor,TextAlign=ContentAlignment.MiddleLeft};CellAdd(root,w,0,0);
        var cards=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4};for(int i=0;i<4;i++)cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25));CellAdd(cards,MetricCard("NPTRANS",nptrans?.Rows.Count.ToString("N0")??"0","baris legacy"),0,0);CellAdd(cards,MetricCard("MASTER AKUN",npsaldo?.Rows.Count.ToString("N0")??"0","dari NPSALDO"),1,0);CellAdd(cards,MetricCard("JURNAL",db.GetJournals().Count.ToString("N0"),"database modern"),2,0);CellAdd(cards,MetricCard("PERIODE","OPEN","siap input"),3,0);CellAdd(root,cards,0,1);
        var sync=Surface();sync.Padding=new Padding(16);sync.Controls.Add(new Label{Text=SnapshotPathExists()?"✓ NPTRANS memiliki snapshot pembanding":"⚠ NPTRANS belum memiliki snapshot pembanding",Dock=DockStyle.Fill,Font=new Font("Segoe UI Semibold",10),ForeColor=SnapshotPathExists()?Color.FromArgb(16,130,80):Color.FromArgb(180,100,30),TextAlign=ContentAlignment.MiddleLeft});CellAdd(root,sync,0,2);
        var info=Surface();info.Padding=new Padding(24);info.Controls.Add(new Label{Text="Fondasi aplikasi: database SQLite lokal, jurnal berimbang, posting ke buku besar, laporan, backup/restore, audit trail, tutup periode, serta sinkronisasi NPTRANS.DBF tanpa menulis file DBF asli.",AutoSize=true,MaximumSize=new Size(1000,100),Font=new Font("Segoe UI",10),ForeColor=TextColor,Location=new Point(24,24)});CellAdd(root,info,0,3);pageHost.Controls.Add(root);
    }
    private Control MetricCard(string h,string value,string sub){var p=new Panel{Dock=DockStyle.Fill,BackColor=Color.White,BorderStyle=BorderStyle.FixedSingle,Margin=new Padding(0,0,10,0),Padding=new Padding(14)};p.Controls.Add(new Label{Text=h,AutoSize=true,ForeColor=Muted,Font=new Font("Segoe UI Semibold",8.5F),Location=new Point(14,10)});p.Controls.Add(new Label{Text=value,AutoSize=true,ForeColor=TextColor,Font=new Font("Segoe UI Semibold",18),Location=new Point(14,30)});p.Controls.Add(new Label{Text=sub,AutoSize=true,ForeColor=Muted,Font=new Font("Segoe UI",8),Location=new Point(14,58)});return p;}
    private bool SnapshotPathExists()=>File.Exists(SnapshotPath);

    private void ShowJurnal(){
        ClearPage("Jurnal Baru","Input transaksi • wajib balance sebelum disimpan");

        // Layout dibuat lebih longgar agar tidak ada label/field yang terpotong.
        var root=new TableLayoutPanel{
            Dock=DockStyle.Fill,
            ColumnCount=1,
            RowCount=3,
            Padding=new Padding(0)
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,108));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,70));

        // ===================== HEADER TRANSAKSI =====================
        var header=Surface();
        header.Padding=new Padding(16,10,16,8);

        var fields=new TableLayoutPanel{
            Dock=DockStyle.Fill,
            ColumnCount=3,
            RowCount=2,
            Padding=new Padding(0)
        };
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,180));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,220));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        fields.RowStyles.Add(new RowStyle(SizeType.Absolute,24));
        fields.RowStyles.Add(new RowStyle(SizeType.Percent,100));

        var date=new DateTimePicker{
            Dock=DockStyle.Fill,
            Format=DateTimePickerFormat.Custom,
            CustomFormat="dd/MM/yyyy",
            Value=DateTime.Now.Date,
            Font=new Font("Segoe UI",10)
        };
        var no=new TextBox{
            Dock=DockStyle.Fill,
            Text=db.NextJournalNo(DateTime.Now),
            Font=new Font("Segoe UI",9.5F),
            MaxLength=40
        };
        var desc=new TextBox{
            Dock=DockStyle.Fill,
            PlaceholderText="Keterangan transaksi",
            Font=new Font("Segoe UI",9.5F),
            MaxLength=250
        };

        CellAdd(fields,new Label{Text="Tanggal",Dock=DockStyle.Fill,ForeColor=Muted,Font=new Font("Segoe UI Semibold",8.5F),TextAlign=ContentAlignment.MiddleLeft},0,0);
        CellAdd(fields,new Label{Text="No. Bukti",Dock=DockStyle.Fill,ForeColor=Muted,Font=new Font("Segoe UI Semibold",8.5F),TextAlign=ContentAlignment.MiddleLeft},1,0);
        CellAdd(fields,new Label{Text="Keterangan",Dock=DockStyle.Fill,ForeColor=Muted,Font=new Font("Segoe UI Semibold",8.5F),TextAlign=ContentAlignment.MiddleLeft},2,0);
        CellAdd(fields,date,0,1);
        CellAdd(fields,no,1,1);
        CellAdd(fields,desc,2,1);
        header.Controls.Add(fields);
        CellAdd(root,header,0,0);

        // ===================== DETAIL JURNAL =====================
        var surface=Surface();
        surface.Padding=new Padding(16,14,16,8);

        var dg=CreateGrid();
        dg.AllowUserToAddRows=true;
        dg.AllowUserToDeleteRows=true;
        dg.ReadOnly=false;
        dg.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill;
        dg.AutoSizeRowsMode=DataGridViewAutoSizeRowsMode.None;
        dg.RowTemplate.Height=31;
        dg.ColumnHeadersHeight=34;
        dg.ColumnHeadersDefaultCellStyle.Alignment=DataGridViewContentAlignment.MiddleCenter;
        dg.DefaultCellStyle.Padding=new Padding(6,0,6,0);
        dg.Columns.Clear();
        dg.Columns.Add("KodeAkun","Kode Akun");
        dg.Columns.Add("NamaAkun","Nama Akun");
        dg.Columns.Add("Debet","Debet");
        dg.Columns.Add("Kredit","Kredit");
        dg.Columns[0].FillWeight=22;
        dg.Columns[1].FillWeight=40;
        dg.Columns[2].FillWeight=19;
        dg.Columns[3].FillWeight=19;
        dg.Columns[0].DefaultCellStyle.Alignment=DataGridViewContentAlignment.MiddleLeft;
        dg.Columns[1].DefaultCellStyle.Alignment=DataGridViewContentAlignment.MiddleLeft;
        dg.Columns[2].DefaultCellStyle.Alignment=DataGridViewContentAlignment.MiddleRight;
        dg.Columns[3].DefaultCellStyle.Alignment=DataGridViewContentAlignment.MiddleRight;

        var totals=new TableLayoutPanel{
            Dock=DockStyle.Bottom,
            Height=48,
            ColumnCount=6,
            RowCount=1,
            BackColor=Color.FromArgb(248,250,252),
            Padding=new Padding(8,5,8,5)
        };
        totals.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        totals.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        totals.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,120));
        totals.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        totals.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,120));
        totals.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        var bal=new Label{
            Text="● BELUM ADA DATA",
            Dock=DockStyle.Fill,
            ForeColor=Muted,
            Font=new Font("Segoe UI Semibold",9),
            TextAlign=ContentAlignment.MiddleLeft,
            AutoEllipsis=true
        };
        var tk=new Label{
            Text="0",
            Dock=DockStyle.Fill,
            ForeColor=TextColor,
            Font=new Font("Segoe UI Semibold",10),
            TextAlign=ContentAlignment.MiddleRight
        };
        var td=new Label{
            Text="0",
            Dock=DockStyle.Fill,
            ForeColor=TextColor,
            Font=new Font("Segoe UI Semibold",10),
            TextAlign=ContentAlignment.MiddleRight
        };
        CellAdd(totals,bal,0,0);
        CellAdd(totals,new Label{Text="Debet",Dock=DockStyle.Fill,AutoSize=true,TextAlign=ContentAlignment.MiddleRight,ForeColor=Muted,Font=new Font("Segoe UI Semibold",8.5F)},1,0);
        CellAdd(totals,td,2,0);
        CellAdd(totals,new Label{Text="Kredit",Dock=DockStyle.Fill,AutoSize=true,TextAlign=ContentAlignment.MiddleRight,ForeColor=Muted,Font=new Font("Segoe UI Semibold",8.5F)},3,0);
        CellAdd(totals,tk,4,0);
        CellAdd(totals,new Label{Text="",Dock=DockStyle.Fill},5,0);

        surface.Controls.Add(dg);
        surface.Controls.Add(totals);
        CellAdd(root,surface,0,1);

        // ===================== TOTAL & VALIDASI =====================
        void Update(){
            decimal d=0,k=0;
            foreach(DataGridViewRow r in dg.Rows){
                if(r.IsNewRow)continue;
                d+=ParseAmount(r.Cells["Debet"].Value);
                k+=ParseAmount(r.Cells["Kredit"].Value);
            }
            td.Text=d.ToString("N0",Id);
            tk.Text=k.ToString("N0",Id);
            bal.Text=d==0&&k==0
                ? "● BELUM ADA DATA"
                : d==k
                    ? "● BALANCE"
                    : $"● SELISIH {Math.Abs(d-k):N0}";
            bal.ForeColor=d==k&&d>0
                ? Color.FromArgb(16,130,80)
                : d==0&&k==0
                    ? Muted
                    : Color.FromArgb(180,70,50);
        }

        dg.CellDoubleClick+=(s,e)=>{
            if(e.RowIndex<0||e.ColumnIndex!=0)return;
            var a=ChooseAccount();
            if(a.HasValue){
                dg.Rows[e.RowIndex].Cells[0].Value=a.Value.Kode;
                dg.Rows[e.RowIndex].Cells[1].Value=a.Value.Nama;
            }
        };
        dg.CellEndEdit+=(s,e)=>{
            if(e.RowIndex<0)return;
            if(e.ColumnIndex==0){
                var a=FindAccount(dg.Rows[e.RowIndex].Cells[0].Value?.ToString()??"");
                if(a!=null)dg.Rows[e.RowIndex].Cells[1].Value=a.GetValueOrDefault("DES");
            }
            Update();
        };
        dg.CellValueChanged+=(s,e)=>Update();

        // Tepat 10 baris input awal. User tetap dapat menambah baris berikutnya.
        for(int i=0;i<10;i++)dg.Rows.Add();

        // ===================== FOOTER =====================
        var footer=Toolbar();
        footer.Padding=new Padding(0,8,0,4);
        footer.Controls.Add(ActionButton("Simpan Draft",(_,_)=>SaveJournalFromGrid(dg,date,no,desc,"DRAFT")));
        footer.Controls.Add(ActionButton("Posting Jurnal",(_,_)=>SaveJournalFromGrid(dg,date,no,desc,"POSTED")));
        footer.Controls.Add(ActionButton("Kosongkan",(_,_)=>{
            dg.Rows.Clear();
            for(int i=0;i<10;i++)dg.Rows.Add();
            Update();
        },true));
        CellAdd(root,footer,0,2);
        pageHost.Controls.Add(root);
        Update();
    }
    private Control Field(string label,Control c){var p=new Panel{Width=c.Width+22,Height=76,Margin=new Padding(0,0,12,0),Padding=Padding.Empty};p.Controls.Add(new Label{Text=label,AutoSize=true,ForeColor=Muted,Font=new Font("Segoe UI Semibold",9),Location=new Point(0,0)});c.Location=new Point(0,27);c.Height=Math.Max(c.Height,40);p.Controls.Add(c);return p;}
    private void SaveJournalFromGrid(DataGridView dg,DateTimePicker date,TextBox no,TextBox desc,string status){try{var lines=new List<JournalLineDto>();foreach(DataGridViewRow r in dg.Rows){if(r.IsNewRow)continue;var code=r.Cells["KodeAkun"].Value?.ToString()?.Trim()??"";var name=r.Cells["NamaAkun"].Value?.ToString()?.Trim()??"";var d=ParseAmount(r.Cells["Debet"].Value);var k=ParseAmount(r.Cells["Kredit"].Value);if(string.IsNullOrWhiteSpace(code)&&d==0&&k==0)continue;if(string.IsNullOrWhiteSpace(code)&&(d!=0||k!=0))throw new InvalidOperationException("Kode akun wajib diisi pada setiap baris yang memiliki nilai.");if(d>0&&k>0)throw new InvalidOperationException("Satu baris tidak boleh berisi Debet dan Kredit sekaligus.");lines.Add(new JournalLineDto(code,name,d,k));}db.SaveJournal(no.Text.Trim(),date.Value.Date,desc.Text.Trim(),status,"admin",lines);var pesan=status=="POSTED"?"Jurnal berhasil disimpan dan diposting.":"Jurnal berhasil disimpan sebagai draft.";MessageBox.Show(pesan+"\n\nForm tetap di Jurnal Baru untuk input transaksi berikutnya.","Jurnal",MessageBoxButtons.OK,MessageBoxIcon.Information);dg.Rows.Clear();for(int i=0;i<10;i++)dg.Rows.Add();desc.Clear();no.Text=db.NextJournalNo(date.Value.Date);dg.CurrentCell=dg.Rows[0].Cells[0];}catch(Exception ex){MessageBox.Show(ex.Message,"Jurnal",MessageBoxButtons.OK,MessageBoxIcon.Warning);}}

    private Dictionary<string,string>? FindAccount(string code)=>npsaldo?.Rows.FirstOrDefault(r=>string.Equals(r.GetValueOrDefault("SANDI")?.Trim(),code.Trim(),StringComparison.OrdinalIgnoreCase));
    private (string Kode,string Nama)? ChooseAccount(){if(npsaldo==null||npsaldo.Rows.Count==0){MessageBox.Show($"NPSALDO.DBF belum ditemukan.\n\nLokasi yang diperiksa:\n{DataDir}\n\nPastikan file NPSALDO.DBF berada di folder Data\\Legacy.","Master Akun",MessageBoxButtons.OK,MessageBoxIcon.Warning);return null;}using var dlg=new Form{Text="Pilih Akun",StartPosition=FormStartPosition.CenterParent,Width=760,Height=560};var p=new Panel{Dock=DockStyle.Fill,Padding=new Padding(12)};var search=new TextBox{Dock=DockStyle.Top,Height=34,PlaceholderText="Cari kode atau nama akun"};var list=CreateGrid();list.Columns.Add("Kode","Kode Akun");list.Columns.Add("Nama","Nama Akun");void Fill(){list.Rows.Clear();var q=search.Text;foreach(var r in npsaldo.Rows){var c=r.GetValueOrDefault("SANDI");var n=r.GetValueOrDefault("DES");if(string.IsNullOrWhiteSpace(q)||c.Contains(q,StringComparison.OrdinalIgnoreCase)||n.Contains(q,StringComparison.OrdinalIgnoreCase))list.Rows.Add(c,n);}}search.TextChanged+=(_,_)=>Fill();Fill();var ok=ActionButton("Pilih",(_,_)=>{if(list.CurrentRow==null)return;dlg.DialogResult=DialogResult.OK;dlg.Close();});ok.Dock=DockStyle.Bottom;p.Controls.Add(list);p.Controls.Add(search);p.Controls.Add(ok);dlg.Controls.Add(p);if(dlg.ShowDialog(this)!=DialogResult.OK||list.CurrentRow==null)return null;return(list.CurrentRow.Cells[0].Value?.ToString()??"",list.CurrentRow.Cells[1].Value?.ToString()??"");}
    private static readonly CultureInfo Id=new("id-ID");
    private static decimal ParseAmount(object? v){var s=v?.ToString()?.Trim()??"";if(string.IsNullOrWhiteSpace(s))return 0;s=s.Replace("Rp","",StringComparison.OrdinalIgnoreCase).Replace(" ","").Replace(".","").Replace(",",".");return decimal.TryParse(s,NumberStyles.Any,CultureInfo.InvariantCulture,out var d)?d:0;}


    private void ShowJurnalMassal()
    {
        ClearPage("Input Massal / Import Jurnal", "Untuk ratusan hingga ribuan baris • paste dari Excel, CSV, atau XLSX • validasi sebelum posting");
        var root = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=1, RowCount=4, Padding=Padding.Empty };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,86));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,54));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,104));

        var info = Surface(); info.Padding=new Padding(14,8,14,8);
        var infol = new Label { Dock=DockStyle.Fill, AutoEllipsis=true, ForeColor=Muted, Font=new Font("Segoe UI",9.5F), Text="Format: Tanggal | No. Bukti | Keterangan | Kode Akun | Debet | Kredit. 500+ baris diperbolehkan. Paste langsung dari Excel dengan Ctrl+V." };
        info.Controls.Add(infol); CellAdd(root,info,0,0);

        var tools=Toolbar();
        var btnPaste=ActionButton("Paste dari Excel",(_,_)=>PasteMassalGrid());
        var btnImport=ActionButton("Import Excel / CSV",(_,_)=>ImportMassalFile(),true);
        var btnTemplate=ActionButton("Template",(_,_)=>SaveMassalTemplate(),true);
        var btnValidate=ActionButton("Validasi",(_,_)=>ValidateMassalGrid(),true);
        var btnClear=ActionButton("Kosongkan",(_,_)=>{massalGrid?.Rows.Clear(); UpdateMassalSummary();},true);
        tools.Controls.Add(btnPaste); tools.Controls.Add(btnImport); tools.Controls.Add(btnTemplate); tools.Controls.Add(btnValidate); tools.Controls.Add(btnClear);
        CellAdd(root,tools,0,1);

        var surface=Surface(); surface.Padding=new Padding(10);
        massalGrid=CreateGrid(); massalGrid.ReadOnly=false; massalGrid.AllowUserToAddRows=true; massalGrid.AllowUserToDeleteRows=true; massalGrid.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.None; massalGrid.RowTemplate.Height=32; massalGrid.ColumnHeadersHeight=40;
        AddMassalColumn("Tanggal","Tanggal",115); AddMassalColumn("NoBukti","No. Bukti",150); AddMassalColumn("Keterangan","Keterangan",300); AddMassalColumn("KodeAkun","Kode Akun",120); AddMassalColumn("NamaAkun","Nama Akun",270); AddMassalColumn("Debet","Debet",150); AddMassalColumn("Kredit","Kredit",150); AddMassalColumn("Status","Status",170);
        massalGrid.CellEndEdit += (_,e)=>{ if(e.RowIndex>=0){ if(e.ColumnIndex==3) FillMassalAccount(e.RowIndex); UpdateMassalSummary(); } };
        massalGrid.CellDoubleClick += (_,e)=>{ if(e.RowIndex>=0 && e.ColumnIndex==3){ var a=ChooseAccount(); if(a.HasValue){massalGrid.Rows[e.RowIndex].Cells[3].Value=a.Value.Kode;massalGrid.Rows[e.RowIndex].Cells[4].Value=a.Value.Nama;UpdateMassalSummary();}}};
        massalGrid.CellFormatting += (_,e)=>{ if(e.RowIndex>=0 && e.ColumnIndex==7){var v=e.Value?.ToString()??"";e.CellStyle.ForeColor=v.StartsWith("✓")?Color.FromArgb(16,130,80):Color.FromArgb(190,70,50);e.CellStyle.Font=new Font("Segoe UI Semibold",9);}};
        surface.Controls.Add(massalGrid); CellAdd(root,surface,0,2);

        var bottom=Surface(); bottom.Padding=new Padding(10,6,10,6); var bl=new TableLayoutPanel{Dock=DockStyle.Top,Height=38,ColumnCount=5}; bl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100)); bl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); bl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150)); bl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); bl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,170));
        massalStatus=new Label{Text="Belum ada data",Dock=DockStyle.Fill,ForeColor=Muted,Font=new Font("Segoe UI Semibold",9),TextAlign=ContentAlignment.MiddleLeft}; massalDebit=new Label{Text="0",Dock=DockStyle.Fill,ForeColor=TextColor,Font=new Font("Segoe UI Semibold",10),TextAlign=ContentAlignment.MiddleRight}; massalCredit=new Label{Text="0",Dock=DockStyle.Fill,ForeColor=TextColor,Font=new Font("Segoe UI Semibold",10),TextAlign=ContentAlignment.MiddleRight};
        CellAdd(bl,massalStatus,0,0); CellAdd(bl,new Label{Text="Debet",AutoSize=true,ForeColor=Muted,TextAlign=ContentAlignment.MiddleRight,Dock=DockStyle.Fill},1,0);CellAdd(bl,massalDebit,2,0);CellAdd(bl,new Label{Text="Kredit",AutoSize=true,ForeColor=Muted,TextAlign=ContentAlignment.MiddleRight,Dock=DockStyle.Fill},3,0);CellAdd(bl,massalCredit,4,0);bottom.Controls.Add(bl);
        CellAdd(bottom,bl,0,0); var massActions=Toolbar(); massActions.Dock=DockStyle.Bottom; massActions.Height=42; massActions.Controls.Add(ActionButton("Simpan Semua sebagai Draft",(_,_)=>SaveMassal(false))); massActions.Controls.Add(ActionButton("Posting Semua",(_,_)=>SaveMassal(true))); bottom.Controls.Add(massActions); CellAdd(root,bottom,0,3); pageHost.Controls.Add(root); UpdateMassalSummary();
    }

    private DataGridView? massalGrid;
    private Label? massalStatus, massalDebit, massalCredit;
    private void AddMassalColumn(string name,string header,int width){var c=new DataGridViewTextBoxColumn{Name=name,HeaderText=header,Width=width,SortMode=DataGridViewColumnSortMode.NotSortable};if(name=="Debet"||name=="Kredit")c.DefaultCellStyle.Alignment=DataGridViewContentAlignment.MiddleRight;if(name=="Status")c.ReadOnly=true;if(name=="NamaAkun")c.ReadOnly=true;massalGrid!.Columns.Add(c);}
    private void FillMassalAccount(int row){if(massalGrid==null)return;var code=massalGrid.Rows[row].Cells[3].Value?.ToString()?.Trim()??"";if(code.Length==0){massalGrid.Rows[row].Cells[4].Value="";return;}var a=FindAccount(code);massalGrid.Rows[row].Cells[4].Value=a?.GetValueOrDefault("DES")??"";}
    private static DateTime? ParseMassalDate(object? v){var s=v?.ToString()?.Trim()??"";if(DateTime.TryParse(s,new CultureInfo("id-ID"),DateTimeStyles.None,out var d))return d.Date;if(DateTime.TryParseExact(s,new[]{"dd/MM/yyyy","d/M/yyyy","yyyy-MM-dd","dd-MM-yyyy","d-M-yyyy"},CultureInfo.InvariantCulture,DateTimeStyles.None,out d))return d.Date;return null;}
    private void UpdateMassalSummary(){if(massalGrid==null)return;decimal d=0,k=0;int data=0,ok=0,err=0;var groups=new Dictionary<string,(decimal d,decimal k,int n,int bad)>();foreach(DataGridViewRow r in massalGrid.Rows){if(r.IsNewRow)continue;var no=r.Cells[1].Value?.ToString()?.Trim()??"";var code=r.Cells[3].Value?.ToString()?.Trim()??"";var de=ParseAmount(r.Cells[5].Value);var kr=ParseAmount(r.Cells[6].Value);if(string.IsNullOrWhiteSpace(no)&&string.IsNullOrWhiteSpace(code)&&de==0&&kr==0)continue;data++;var valid=ParseMassalDate(r.Cells[0].Value).HasValue&&!string.IsNullOrWhiteSpace(no)&&!string.IsNullOrWhiteSpace(code)&&FindAccount(code)!=null&&(de>0 ^ kr>0);if(!valid)err++;else ok++;if(no.Length>0){var x=groups.GetValueOrDefault(no);x.d+=de;x.k+=kr;x.n++;if(!valid)x.bad++;groups[no]=x;}r.Cells[7].Value=valid?"✓ Baris valid":"⚠ Periksa data";}var unbal=groups.Count(x=>x.Value.d!=x.Value.k||x.Value.n==0||x.Value.bad>0);d=groups.Values.Sum(x=>x.d);k=groups.Values.Sum(x=>x.k);if(massalStatus!=null){massalStatus.Text=data==0?"Belum ada data":$"{data:N0} baris • {groups.Count:N0} jurnal • ✓ {ok:N0} valid • ⚠ {err:N0} error • Grup tidak balance: {unbal:N0}";massalStatus.ForeColor=data>0&&err==0&&unbal==0&&d==k?Color.FromArgb(16,130,80):Color.FromArgb(190,90,40);}if(massalDebit!=null)massalDebit.Text=d.ToString("N0",Id);if(massalCredit!=null)massalCredit.Text=k.ToString("N0",Id);}
    private void PasteMassalGrid(){if(massalGrid==null)return;try{if(!Clipboard.ContainsText()){MessageBox.Show("Salin data dari Excel terlebih dahulu.");return;}var text=Clipboard.GetText();ImportMassalTsv(text); }catch(Exception ex){MessageBox.Show(ex.Message,"Paste Excel",MessageBoxButtons.OK,MessageBoxIcon.Warning);}}
    private void ImportMassalTsv(string text){if(massalGrid==null)return;var lines=text.Replace("\r\n","\n").Replace('\r','\n').Split('\n',StringSplitOptions.RemoveEmptyEntries);if(lines.Length==0)return;bool header=lines[0].Contains("Tanggal",StringComparison.OrdinalIgnoreCase)&&lines[0].Contains("No",StringComparison.OrdinalIgnoreCase);int start=header?1:0;foreach(var line in lines.Skip(start)){var cols=line.Split('\t');if(cols.Length<6)continue;var idx=massalGrid.Rows.Add();for(int i=0;i<6;i++)massalGrid.Rows[idx].Cells[i].Value=cols[i].Trim();FillMassalAccount(idx);}UpdateMassalSummary();}
    private void ImportMassalFile(){using var ofd=new OpenFileDialog{Filter="Excel (*.xlsx)|*.xlsx|CSV (*.csv)|*.csv|Text/TSV (*.txt;*.tsv)|*.txt;*.tsv",Title="Import Jurnal Massal",Multiselect=false};if(ofd.ShowDialog(this)!=DialogResult.OK)return;try{var ext=Path.GetExtension(ofd.FileName).ToLowerInvariant();string text;if(ext==".xlsx")text=ReadFirstSheetXlsx(ofd.FileName);else text=File.ReadAllText(ofd.FileName);if(ext==".csv")text=NormalizeCsvToTsv(text);ImportMassalTsv(text);MessageBox.Show("Import selesai. Jalankan Validasi sebelum menyimpan atau posting.","Import Jurnal",MessageBoxButtons.OK,MessageBoxIcon.Information);}catch(Exception ex){MessageBox.Show(ex.Message,"Import Jurnal",MessageBoxButtons.OK,MessageBoxIcon.Error);}}
    private static string NormalizeCsvToTsv(string csv){var rows=csv.Replace("\r\n","\n").Replace('\r','\n').Split('\n',StringSplitOptions.RemoveEmptyEntries);var sb=new System.Text.StringBuilder();foreach(var row in rows){var cells=new List<string>();var cur=new System.Text.StringBuilder();bool quote=false;for(int i=0;i<row.Length;i++){char ch=row[i];if(ch=='"'){if(quote&&i+1<row.Length&&row[i+1]=='"'){cur.Append('"');i++;}else quote=!quote;}else if(ch==','&&!quote){cells.Add(cur.ToString());cur.Clear();}else cur.Append(ch);}cells.Add(cur.ToString());sb.AppendLine(string.Join('\t',cells));}return sb.ToString();}
    private static string ReadFirstSheetXlsx(string path){using var zip=System.IO.Compression.ZipFile.OpenRead(path);var shared=new List<string>();var ss=zip.GetEntry("xl/sharedStrings.xml");if(ss!=null){using var r=new StreamReader(ss.Open());var doc=System.Xml.Linq.XDocument.Load(r);foreach(var si in doc.Descendants().Where(x=>x.Name.LocalName=="si"))shared.Add(string.Concat(si.Descendants().Where(x=>x.Name.LocalName=="t").Select(x=>x.Value)));}var wb=zip.GetEntry("xl/workbook.xml");if(wb==null)throw new InvalidOperationException("File XLSX tidak memiliki workbook.xml.");string sheetPath="xl/worksheets/sheet1.xml";using(var r=new StreamReader(wb.Open())){var doc=System.Xml.Linq.XDocument.Load(r);var first=doc.Descendants().FirstOrDefault(x=>x.Name.LocalName=="sheet");if(first!=null){var rel=first.Attributes().FirstOrDefault(a=>a.Name.LocalName=="id")?.Value;var relDoc=zip.GetEntry("xl/_rels/workbook.xml.rels");if(rel!=null&&relDoc!=null){using var rr=new StreamReader(relDoc.Open());var rd=System.Xml.Linq.XDocument.Load(rr);var target=rd.Descendants().FirstOrDefault(x=>x.Name.LocalName=="Relationship"&&x.Attribute("Id")?.Value==rel)?.Attribute("Target")?.Value;if(!string.IsNullOrWhiteSpace(target))sheetPath="xl/"+target.TrimStart('/');}}}var sh=zip.GetEntry(sheetPath);if(sh==null)throw new InvalidOperationException("Sheet pertama XLSX tidak ditemukan.");using var sr=new StreamReader(sh.Open());var sd=System.Xml.Linq.XDocument.Load(sr);var sb=new System.Text.StringBuilder();foreach(var row in sd.Descendants().Where(x=>x.Name.LocalName=="row")){var cells=new SortedDictionary<int,string>();foreach(var c in row.Elements().Where(x=>x.Name.LocalName=="c")){var refa=c.Attribute("r")?.Value??"A1";int col=0;foreach(char ch in new string(refa.TakeWhile(char.IsLetter).ToArray()))col=col*26+(char.ToUpperInvariant(ch)-'A'+1);string val=c.Descendants().FirstOrDefault(x=>x.Name.LocalName=="v")?.Value??c.Descendants().FirstOrDefault(x=>x.Name.LocalName=="t")?.Value??"";if(c.Attribute("t")?.Value=="s"&&int.TryParse(val,out var si)&&si>=0&&si<shared.Count)val=shared[si];cells[col]=val;}if(cells.Count>0){int max=cells.Keys.Max();for(int i=1;i<=max;i++){if(i>1)sb.Append('\t');sb.Append(cells.GetValueOrDefault(i,""));}sb.AppendLine();}}return sb.ToString();}
    private void ValidateMassalGrid(){if(massalGrid==null)return;UpdateMassalSummary();var errors=new List<string>();var groups=new Dictionary<string,(decimal d,decimal k,int rows)>();int rowNo=0;foreach(DataGridViewRow r in massalGrid.Rows){if(r.IsNewRow)continue;rowNo++;var no=r.Cells[1].Value?.ToString()?.Trim()??"";var code=r.Cells[3].Value?.ToString()?.Trim()??"";var d=ParseAmount(r.Cells[5].Value);var k=ParseAmount(r.Cells[6].Value);var date=ParseMassalDate(r.Cells[0].Value);if(string.IsNullOrWhiteSpace(no))errors.Add($"Baris {rowNo}: No. Bukti wajib.");if(!date.HasValue)errors.Add($"Baris {rowNo}: Tanggal tidak valid.");if(string.IsNullOrWhiteSpace(code)||FindAccount(code)==null)errors.Add($"Baris {rowNo}: Kode akun '{code}' tidak ditemukan.");if(!(d>0 ^ k>0))errors.Add($"Baris {rowNo}: isi Debet atau Kredit, tepat satu.");if(no.Length>0){var x=groups.GetValueOrDefault(no);x.d+=d;x.k+=k;x.rows++;groups[no]=x;}}foreach(var g in groups)if(g.Value.d!=g.Value.k)errors.Add($"No. Bukti {g.Key}: Debet {g.Value.d:N0} tidak sama dengan Kredit {g.Value.k:N0}.");if(errors.Count==0)MessageBox.Show($"VALIDASI BERHASIL\n\n{groups.Count:N0} jurnal dan {massalGrid.Rows.Cast<DataGridViewRow>().Count(r=>!r.IsNewRow):N0} baris siap disimpan sebagai Draft.","Validasi",MessageBoxButtons.OK,MessageBoxIcon.Information);else MessageBox.Show("Ditemukan kesalahan:\n\n"+string.Join("\n",errors.Take(40))+(errors.Count>40?$"\n\n... dan {errors.Count-40} error lainnya":""),"Validasi",MessageBoxButtons.OK,MessageBoxIcon.Warning);}

    private void SaveMassal(bool post)
    {
        if(massalGrid==null)return;
        try
        {
            var rows=new List<MassalInputRow>();
            foreach(DataGridViewRow r in massalGrid.Rows){if(r.IsNewRow)continue;var no=r.Cells[1].Value?.ToString()?.Trim()??"";var ket=r.Cells[2].Value?.ToString()?.Trim()??"";var code=r.Cells[3].Value?.ToString()?.Trim()??"";var name=r.Cells[4].Value?.ToString()?.Trim()??"";var d=ParseAmount(r.Cells[5].Value);var k=ParseAmount(r.Cells[6].Value);if(string.IsNullOrWhiteSpace(no)&&string.IsNullOrWhiteSpace(code)&&d==0&&k==0)continue;var dt=ParseMassalDate(r.Cells[0].Value)??throw new InvalidOperationException("Tanggal tidak valid.");var acct=FindAccount(code);if(acct==null)throw new InvalidOperationException($"Kode akun {code} tidak ditemukan.");rows.Add(new MassalInputRow(dt,no,ket,code,acct.GetValueOrDefault("DES")??name,d,k));}
            if(rows.Count==0)throw new InvalidOperationException("Belum ada data untuk disimpan.");
            var groups=rows.GroupBy(x=>x.NoBukti,StringComparer.OrdinalIgnoreCase).ToList();var bad=groups.Where(g=>g.Any(x=>x.Debit>0&&x.Credit>0)||g.Any(x=>!(x.Debit>0^x.Credit>0))||g.Sum(x=>x.Debit)!=g.Sum(x=>x.Credit)||string.IsNullOrWhiteSpace(g.Key)).ToList();if(bad.Count>0)throw new InvalidOperationException("Masih ada jurnal yang tidak valid atau belum balance. Jalankan Validasi terlebih dahulu.");if(post&&rows.Any(x=>db.IsPeriodClosed(x.Date)))throw new InvalidOperationException("Ada data pada periode yang sudah ditutup.");if(post&&MessageBox.Show($"Anda akan memposting {groups.Count:N0} jurnal ({rows.Count:N0} baris). Lanjutkan?","Konfirmasi Posting Massal",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
            db.SaveBulkJournals(groups.Select(g=>new BulkJournalInput(g.Key,g.First().Date,g.First().Keterangan,g.Select(x=>new JournalLineDto(x.KodeAkun,x.NamaAkun,x.Debit,x.Credit)).ToList(),post)).ToList(),"admin");
            MessageBox.Show($"Berhasil menyimpan {groups.Count:N0} jurnal / {rows.Count:N0} baris sebagai {(post?"POSTED":"DRAFT")}.","Input Massal",MessageBoxButtons.OK,MessageBoxIcon.Information);massalGrid.Rows.Clear();UpdateMassalSummary();
        }catch(Exception ex){MessageBox.Show(ex.Message,"Input Massal",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
    private sealed record MassalInputRow(DateTime Date,string NoBukti,string Keterangan,string KodeAkun,string NamaAkun,decimal Debit,decimal Credit);
    private void SaveMassalTemplate(){using var sfd=new SaveFileDialog{Filter="CSV (*.csv)|*.csv",FileName="Template_Jurnal_Massal.csv"};if(sfd.ShowDialog(this)!=DialogResult.OK)return;File.WriteAllText(sfd.FileName,"Tanggal,NoBukti,Keterangan,KodeAkun,NamaAkun,Debet,Kredit\n29/09/2026,JU-202609-0001,Pembelian,110101,,5000000,0\n29/09/2026,JU-202609-0001,Pembelian,510101,,0,5000000\n",System.Text.Encoding.UTF8);MessageBox.Show("Template berhasil dibuat. Kolom NamaAkun boleh dikosongkan karena aplikasi mengisinya dari master akun.");}
    private void ShowDaftarJurnal(){ClearPage("Daftar Jurnal","Jurnal modern • lihat, edit draft, posting, cetak, atau koreksi");var root=PageRoot(2);var tb=Toolbar();var from=DateInput(reportFrom);var to=DateInput(reportTo);tb.Controls.Add(Field("Dari",from));tb.Controls.Add(Field("Sampai",to));var refresh=ActionButton("Tampilkan",(_,_)=>{reportFrom=from.Value.Date;reportTo=to.Value.Date;LoadJournalList();});tb.Controls.Add(refresh);tb.Controls.Add(ActionButton("Jurnal Baru",(_,_)=>ShowJurnal(),true));CellAdd(root,tb,0,0);var s=Surface();grid=CreateGrid();grid.CellDoubleClick+=(_,e)=>{if(e.RowIndex<0)return;var id=Convert.ToInt64(grid.Rows[e.RowIndex].Cells[0].Value);ShowJournalActions(id);};s.Controls.Add(grid);CellAdd(root,s,0,1);pageHost.Controls.Add(root);LoadJournalList();}
    private void LoadJournalList(){var list=db.GetJournals(reportFrom,reportTo);grid.DataSource=list.Select(x=>new{x.Id,No=x.No,Tanggal=x.Date.ToString("dd/MM/yyyy"),Keterangan=x.Description,Status=x.Status,Dibuat=x.CreatedBy,Posting=x.PostedBy}).ToList();if(grid.Columns.Contains("Id"))grid.Columns["Id"].Visible=false;}
    private void ShowJournalActions(long id){
        var j=db.GetJournals().FirstOrDefault(x=>x.Id==id); if(j==null)return;
        var lines=db.GetLines(id);
        using var dlg=new Form{Text=$"Jurnal {j.No}",StartPosition=FormStartPosition.CenterParent,Width=980,Height=680};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=3,Padding=new Padding(12)};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,90)); root.RowStyles.Add(new RowStyle(SizeType.Percent,100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        CellAdd(root,new Label{Text=$"{j.No}\n{j.Date:dd/MM/yyyy}  •  {j.Description}\nStatus: {j.Status}",Dock=DockStyle.Fill,Font=new Font("Segoe UI Semibold",11),ForeColor=TextColor},0,0);
        var g=CreateGrid();g.DataSource=lines.Select(x=>new{Akun=x.AccountCode,Nama=x.AccountName,Debet=x.Debit.ToString("N0",Id),Kredit=x.Credit.ToString("N0",Id)}).ToList();CellAdd(root,g,0,1);
        var f=Toolbar();
        if(j.Status=="DRAFT") f.Controls.Add(ActionButton("Edit",(_,_)=>{dlg.Close();EditDraftJournal(j);}));
        if(j.Status=="DRAFT") f.Controls.Add(ActionButton("Posting",(_,_)=>{try{db.PostJournal(id);dlg.Close();ShowDaftarJurnal();}catch(Exception ex){MessageBox.Show(ex.Message);}}));
        if(j.Status=="POSTED"){
            f.Controls.Add(ActionButton("🔧 Perbaikan Paksa",(_,_)=>{dlg.Close();ForceEditPostedJournal(j); }));
            f.Controls.Add(ActionButton("VOID Paksa",(_,_)=>{dlg.Close();ForceVoidJournalUi(j); },true));
            f.Controls.Add(ActionButton("Hapus Paksa",(_,_)=>{dlg.Close();ForceDeleteJournalUi(j); },true));
        }
        f.Controls.Add(ActionButton("Cetak",(_,_)=>PrintJournal(id),true)); CellAdd(root,f,0,2); dlg.Controls.Add(root); dlg.ShowDialog(this);
    }

    private void ShowForceJurnal(){
        ClearPage("Perbaikan Paksa Jurnal","ADMIN • hanya untuk jurnal POSTED • setiap perubahan wajib memiliki alasan dan masuk Audit Trail");
        var root=PageRoot(2); var tb=Toolbar();
        tb.Controls.Add(ActionButton("Refresh",(_,_)=>LoadForceJournalGrid()));
        tb.Controls.Add(ActionButton("Buka Jurnal",(_,_)=>{if(grid.CurrentRow==null)return;var id=Convert.ToInt64(grid.CurrentRow.Cells[0].Value);ShowJournalActions(id);},true));
        CellAdd(root,tb,0,0); var s=Surface(); grid=CreateGrid(); grid.CellDoubleClick+=(_,e)=>{if(e.RowIndex<0)return;var id=Convert.ToInt64(grid.Rows[e.RowIndex].Cells[0].Value);ShowJournalActions(id);}; s.Controls.Add(grid); CellAdd(root,s,0,1); pageHost.Controls.Add(root); LoadForceJournalGrid();
    }
    private void LoadForceJournalGrid(){
        if(grid==null)return; var list=db.GetJournals().Where(x=>x.Status=="POSTED").ToList(); grid.DataSource=list.Select(x=>new{x.Id,No=x.No,Tanggal=x.Date.ToString("dd/MM/yyyy"),Keterangan=x.Description,Status=x.Status,Posting=x.PostedBy}).ToList(); if(grid.Columns.Contains("Id"))grid.Columns["Id"].Visible=false;
    }

    private void ForceEditPostedJournal(JournalDto j){
        var lines=db.GetLines(j.Id);
        using var dlg=new Form{Text=$"PERBAIKAN PAKSA • {j.No}",StartPosition=FormStartPosition.CenterParent,Width=1050,Height=720};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=3,Padding=new Padding(14)}; root.RowStyles.Add(new RowStyle(SizeType.Absolute,92)); root.RowStyles.Add(new RowStyle(SizeType.Percent,100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,120));
        var header=Surface(); var h=Toolbar(); var date=DateInput(j.Date,150); var no=new TextBox{Width=180,Text=j.No}; var desc=new TextBox{Width=430,Text=j.Description}; h.Controls.Add(Field("Tanggal",date));h.Controls.Add(Field("No. Bukti",no));h.Controls.Add(Field("Keterangan",desc));header.Controls.Add(h);CellAdd(root,header,0,0);
        var body=Surface(); var dg=CreateGrid();dg.ReadOnly=false;dg.AllowUserToAddRows=true;dg.Columns.Add("KodeAkun","Kode Akun");dg.Columns.Add("NamaAkun","Nama Akun");dg.Columns.Add("Debet","Debet");dg.Columns.Add("Kredit","Kredit");foreach(var l in lines)dg.Rows.Add(l.AccountCode,l.AccountName,l.Debit,l.Credit);dg.Rows.Add();body.Controls.Add(dg);CellAdd(root,body,0,1);
        var bottom=Toolbar(); var reason=new TextBox{Width=520,PlaceholderText="Wajib: alasan perbaikan paksa"}; bottom.Controls.Add(Field("Alasan Perbaikan",reason)); bottom.Controls.Add(ActionButton("Simpan Perbaikan Paksa",(_,_)=>{
            try{
                if(string.IsNullOrWhiteSpace(reason.Text)){MessageBox.Show("Alasan perbaikan wajib diisi.");return;}
                var list=new List<JournalLineDto>(); foreach(DataGridViewRow r in dg.Rows){if(r.IsNewRow)continue;var code=r.Cells[0].Value?.ToString()?.Trim()??"";var name=r.Cells[1].Value?.ToString()?.Trim()??"";var d=ParseAmount(r.Cells[2].Value);var k=ParseAmount(r.Cells[3].Value);if(string.IsNullOrWhiteSpace(code)&&d==0&&k==0)continue;list.Add(new JournalLineDto(code,name,d,k));}
                BackupDatabaseForAdmin(); db.ForceUpdatePostedJournal(j.Id,no.Text.Trim(),date.Value.Date,desc.Text.Trim(),list,reason.Text.Trim()); dlg.Close(); MessageBox.Show("Jurnal POSTED berhasil diperbaiki secara paksa. Buku Besar akan membaca versi terbaru.","Perbaikan Paksa",MessageBoxButtons.OK,MessageBoxIcon.Information); ShowDaftarJurnal();
            }catch(Exception ex){MessageBox.Show(ex.Message,"Perbaikan Paksa",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
        })); bottom.Controls.Add(ActionButton("Batal",(_,_)=>dlg.Close(),true));CellAdd(root,bottom,0,2);dlg.Controls.Add(root);dlg.ShowDialog(this);
    }

    private void ForceVoidJournalUi(JournalDto j){
        var reason=PromptReason("VOID Paksa",$"Jurnal {j.No} akan menjadi VOID dan tidak lagi masuk Buku Besar. Alasan wajib:"); if(string.IsNullOrWhiteSpace(reason))return;
        try{BackupDatabaseForAdmin();db.ForceVoidJournal(j.Id,reason);MessageBox.Show("Jurnal berhasil di-VOID.","Admin",MessageBoxButtons.OK,MessageBoxIcon.Information);ShowDaftarJurnal();}catch(Exception ex){MessageBox.Show(ex.Message,"VOID Paksa",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
    private void ForceDeleteJournalUi(JournalDto j){
        var reason=PromptReason("Hapus Paksa",$"PERINGATAN: jurnal {j.No} akan dihapus permanen dari database modern. NPTRANS/DBF asli tidak disentuh. Alasan wajib:"); if(string.IsNullOrWhiteSpace(reason))return;
        if(MessageBox.Show($"Yakin menghapus permanen jurnal {j.No}?\n\nBackup otomatis akan dibuat terlebih dahulu.","Konfirmasi Hapus Paksa",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
        try{BackupDatabaseForAdmin();db.ForceDeleteJournal(j.Id,reason);MessageBox.Show("Jurnal berhasil dihapus paksa. Jejak tindakan tetap tersimpan di Audit Trail.","Admin",MessageBoxButtons.OK,MessageBoxIcon.Information);ShowDaftarJurnal();}catch(Exception ex){MessageBox.Show(ex.Message,"Hapus Paksa",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
    private string PromptReason(string title,string message){
        using var dlg=new Form{Text=title,StartPosition=FormStartPosition.CenterParent,Width=620,Height=250};var p=new Panel{Dock=DockStyle.Fill,Padding=new Padding(18)};p.Controls.Add(new Label{Text=message,AutoSize=false,Height=65,Dock=DockStyle.Top,Font=new Font("Segoe UI Semibold",10),ForeColor=TextColor});var box=new TextBox{Dock=DockStyle.Top,Height=70,Multiline=true};p.Controls.Add(box);var buttons=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=48,FlowDirection=FlowDirection.RightToLeft};var ok=ActionButton("Lanjut",(_,_)=>{if(string.IsNullOrWhiteSpace(box.Text)){MessageBox.Show("Alasan wajib diisi.");return;}dlg.DialogResult=DialogResult.OK;dlg.Close();});buttons.Controls.Add(ok);buttons.Controls.Add(ActionButton("Batal",(_,_)=>{dlg.DialogResult=DialogResult.Cancel;dlg.Close();},true));p.Controls.Add(buttons);dlg.Controls.Add(p);return dlg.ShowDialog(this)==DialogResult.OK?box.Text.Trim():"";
    }


    private void EditDraftJournal(JournalDto j)
    {
        var lines=db.GetLines(j.Id);
        ClearPage("Edit Jurnal",$"Draft {j.No} • perubahan dapat disimpan selama periode belum ditutup");
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=3};root.RowStyles.Add(new RowStyle(SizeType.Absolute,84));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,62));
        var header=Surface();var h=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false};var date=DateInput(j.Date,160);var no=new TextBox{Width=150,Text=j.No};var desc=new TextBox{Width=360,Text=j.Description};h.Controls.Add(Field("Tanggal",date));h.Controls.Add(Field("No. Bukti",no));h.Controls.Add(Field("Keterangan",desc));header.Controls.Add(h);CellAdd(root,header,0,0);
        var surface=Surface();var dg=CreateGrid();dg.AllowUserToAddRows=true;dg.ReadOnly=false;dg.Columns.Add("KodeAkun","Kode Akun");dg.Columns.Add("NamaAkun","Nama Akun");dg.Columns.Add("Debet","Debet");dg.Columns.Add("Kredit","Kredit");foreach(var l in lines)dg.Rows.Add(l.AccountCode,l.AccountName,l.Debit,l.Credit);dg.Rows.Add();surface.Controls.Add(dg);CellAdd(root,surface,0,1);
        var f=Toolbar();f.Controls.Add(ActionButton("Simpan Perubahan",(_,_)=>{try{var list=new List<JournalLineDto>();foreach(DataGridViewRow r in dg.Rows){if(r.IsNewRow)continue;var code=r.Cells[0].Value?.ToString()?.Trim()??"";var name=r.Cells[1].Value?.ToString()?.Trim()??"";var d=ParseAmount(r.Cells[2].Value);var k=ParseAmount(r.Cells[3].Value);if(string.IsNullOrWhiteSpace(code)&&d==0&&k==0)continue;if(d>0&&k>0)throw new InvalidOperationException("Satu baris tidak boleh berisi Debet dan Kredit sekaligus.");list.Add(new JournalLineDto(code,name,d,k));}db.SaveJournal(no.Text.Trim(),date.Value.Date,desc.Text.Trim(),"DRAFT","admin",list,j.Id);MessageBox.Show("Draft berhasil diperbarui.");ShowDaftarJurnal();}catch(Exception ex){MessageBox.Show(ex.Message,"Edit Jurnal",MessageBoxButtons.OK,MessageBoxIcon.Warning);}}));f.Controls.Add(ActionButton("Batal",(_,_)=>ShowDaftarJurnal(),true));CellAdd(root,f,0,2);pageHost.Controls.Add(root);
    }

    private void ShowJurnalKoreksi(){ClearPage("Jurnal Koreksi","Buat transaksi koreksi untuk jurnal yang sudah diposting");var root=PageRoot(2);var tb=Toolbar();var search=new TextBox{Width=300,Height=40,PlaceholderText="Nomor bukti jurnal",Font=new Font("Segoe UI",10)};tb.Controls.Add(search);tb.Controls.Add(ActionButton("Cari",(_,_)=>{var j=db.GetJournals().FirstOrDefault(x=>x.No.Equals(search.Text.Trim(),StringComparison.OrdinalIgnoreCase));if(j==null){MessageBox.Show("Jurnal tidak ditemukan.");return;}CreateCorrection(j); }));CellAdd(root,tb,0,0);var s=Surface();s.Controls.Add(new Label{Text="Jurnal yang sudah diposting tidak diubah langsung setelah periode ditutup. Gunakan jurnal koreksi agar jejak transaksi tetap terlihat.",AutoSize=true,MaximumSize=new Size(900,80),ForeColor=TextColor,Location=new Point(18,20)});CellAdd(root,s,0,1);pageHost.Controls.Add(root);}
    private void CreateCorrection(JournalDto original){var lines=db.GetLines(original.Id);using var dlg=new Form{Text="Jurnal Koreksi",StartPosition=FormStartPosition.CenterParent,Width=800,Height=520};var p=new Panel{Dock=DockStyle.Fill,Padding=new Padding(18)};var info=new Label{Text=$"Jurnal asal: {original.No}\nTanggal: {original.Date:dd/MM/yyyy}\nKeterangan: {original.Description}",AutoSize=true,Location=new Point(18,18),Font=new Font("Segoe UI Semibold",10)};p.Controls.Add(info);var reason=new TextBox{Width=600,PlaceholderText="Alasan koreksi",Location=new Point(18,92)};p.Controls.Add(reason);var save=ActionButton("Buat Koreksi",(_,_)=>{if(string.IsNullOrWhiteSpace(reason.Text)){MessageBox.Show("Isi alasan koreksi.");return;}var rev=lines.Select(x=>new JournalLineDto(x.AccountCode,x.AccountName,x.Credit,x.Debit)).ToList();try{db.SaveJournal(db.NextJournalNo(original.Date),DateTime.Now.Date,$"Koreksi {original.No}: {reason.Text.Trim()}","POSTED","admin",rev,correctionOf:original.Id);dlg.Close();MessageBox.Show("Jurnal koreksi berhasil dibuat dan diposting.");}catch(Exception ex){MessageBox.Show(ex.Message);}});save.Location=new Point(18,135);p.Controls.Add(save);dlg.Controls.Add(p);dlg.ShowDialog(this);}
    private void ShowCetakJurnal(){ClearPage("Cetak Jurnal","Preview dan cetak jurnal modern berdasarkan periode");var root=PageRoot(2);var tb=Toolbar();var from=DateInput(reportFrom);var to=DateInput(reportTo);tb.Controls.Add(Field("Dari",from));tb.Controls.Add(Field("Sampai",to));tb.Controls.Add(ActionButton("Tampilkan",(_,_)=>{var rows=db.GetJournals(from.Value.Date,to.Value.Date);grid.DataSource=rows.Select(x=>new{No=x.No,Tanggal=x.Date.ToString("dd/MM/yyyy"),Keterangan=x.Description,Status=x.Status}).ToList();}));tb.Controls.Add(ActionButton("Cetak",(_,_)=>PrintGrid("Jurnal"),true));tb.Controls.Add(ActionButton("Pengaturan Cetak",(_,_)=>ShowPrinter(),true));CellAdd(root,tb,0,0);var s=Surface();grid=CreateGrid();s.Controls.Add(grid);CellAdd(root,s,0,1);pageHost.Controls.Add(root);}
    // ===================== SISTEM CETAK PROFESIONAL =====================
    private void ShowBukuBesar(){ClearPage("Buku Besar","Mutasi dari jurnal yang sudah diposting");var root=PageRoot(2);var tb=Toolbar();var akun=new TextBox{Width=140,PlaceholderText="Kode akun (kosong=semua)"};var from=new DateTimePicker{Width=115,Value=reportFrom};var to=new DateTimePicker{Width=115,Value=reportTo};tb.Controls.Add(Field("Akun",akun));tb.Controls.Add(Field("Dari",from));tb.Controls.Add(Field("Sampai",to));tb.Controls.Add(ActionButton("Tampilkan",(_,_)=>LoadLedger(akun.Text,from.Value.Date,to.Value.Date)));tb.Controls.Add(ActionButton("Cetak",(_,_)=>PrintGrid("Buku Besar"),true));CellAdd(root,tb,0,0);var s=Surface();grid=CreateGrid();s.Controls.Add(grid);CellAdd(root,s,0,1);pageHost.Controls.Add(root);LoadLedger("",from.Value.Date,to.Value.Date);}
    private void LoadLedger(string akun,DateTime from,DateTime to){grid.DataSource=db.GetLedger(akun,from,to).Select(x=>new{Tanggal=x.Date.ToString("dd/MM/yyyy"),NoBukti=x.No,Akun=x.AccountCode,Nama=x.AccountName,Keterangan=x.Description,Debet=x.Debit.ToString("N0",Id),Kredit=x.Credit.ToString("N0",Id),Saldo=x.Running.ToString("N0",Id)}).ToList();}
    private void ShowMutasiAkun(){ShowBukuBesar();}
    private void ShowSinkronMutasi(){ClearPage("Sinkronisasi Mutasi","Pemeriksaan dasar konsistensi jurnal dan buku besar");var s=Surface();var l=new Label{Text="Mutasi buku besar dihitung langsung dari jurnal POSTED. Tidak ada proses input ulang. Jika total debit/kredit berbeda, periksa jurnal pada Daftar Jurnal.",AutoSize=true,MaximumSize=new Size(1000,100),Font=new Font("Segoe UI",10),ForeColor=TextColor,Location=new Point(20,20)};s.Controls.Add(l);pageHost.Controls.Add(s);}

    private void ShowMasterAkun(){ClearPage("Master Akun","Master akun modern • sumber awal diambil dari NPSALDO.DBF");var root=PageRoot(2);var tb=Toolbar();tb.Controls.Add(ActionButton("Muat Ulang Legacy",(_,_)=>{LoadLegacyData();if(npsaldo!=null)db.ImportAccounts(npsaldo.Rows);LoadAccountsGrid();}));tb.Controls.Add(ActionButton("Sinkronisasi NPSALDO",(_,_)=>ShowNpsaldoAdmin(),false));tb.Controls.Add(ActionButton("Cetak",(_,_)=>PrintGrid("Master Akun"),true));CellAdd(root,tb,0,0);var s=Surface();grid=CreateGrid();s.Controls.Add(grid);CellAdd(root,s,0,1);pageHost.Controls.Add(root);LoadAccountsGrid();}

    private void ShowNpsaldoAdmin(){
        ClearPage("Sinkronisasi & Perbaikan NPSALDO","ADMIN • DBF sumber tetap read-only • perubahan diterapkan ke database modern");
        var root=PageRoot(2); var tb=Toolbar();
        tb.Controls.Add(ActionButton("Pilih NPSALDO.DBF",(_,_)=>SyncNpsaldoFromFile()));
        tb.Controls.Add(ActionButton("Edit Paksa",(_,_)=>EditSelectedAccount(),true));
        tb.Controls.Add(ActionButton("Hapus Paksa",(_,_)=>DeleteSelectedAccount(),true));
        tb.Controls.Add(ActionButton("Refresh",(_,_)=>LoadNpsaldoAdminGrid(),true));
        CellAdd(root,tb,0,0); var s=Surface(); grid=CreateGrid(); grid.CellDoubleClick+=(_,e)=>{if(e.RowIndex>=0)EditSelectedAccount();}; s.Controls.Add(grid); CellAdd(root,s,0,1); pageHost.Controls.Add(root); LoadNpsaldoAdminGrid();
    }
    private void LoadNpsaldoAdminGrid(){var list=db.GetAccounts();grid.DataSource=list.Select(x=>new{Kode=x.Code,Nama=x.Name,Debet=x.OpeningDebit.ToString("N0",Id),Kredit=x.OpeningCredit.ToString("N0",Id),Status=x.IsActive?"AKTIF":"NONAKTIF",Update=x.UpdatedAt}).ToList();}
    private string SelectedAccountCode(){if(grid?.CurrentRow==null)return "";return grid.CurrentRow.Cells.Cast<DataGridViewCell>().FirstOrDefault(c=>grid.Columns[c.ColumnIndex].HeaderText.Equals("Kode",StringComparison.OrdinalIgnoreCase))?.Value?.ToString()?.Trim()??"";}

    private void EditSelectedAccount(){
        var code=SelectedAccountCode(); if(string.IsNullOrWhiteSpace(code)){MessageBox.Show("Pilih akun terlebih dahulu.");return;} var a=db.GetAccounts().FirstOrDefault(x=>x.Code.Equals(code,StringComparison.OrdinalIgnoreCase)); if(a==null)return;
        using var dlg=new Form{Text=$"Perbaikan Paksa NPSALDO • {a.Code}",StartPosition=FormStartPosition.CenterParent,Width=620,Height=430};var p=new Panel{Dock=DockStyle.Fill,Padding=new Padding(20)};
        var table=new TableLayoutPanel{Dock=DockStyle.Top,ColumnCount=2,RowCount=5,Height=230};table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var name=new TextBox{Text=a.Name};var debit=new TextBox{Text=a.OpeningDebit.ToString("0.##",CultureInfo.InvariantCulture)};var credit=new TextBox{Text=a.OpeningCredit.ToString("0.##",CultureInfo.InvariantCulture)};var reason=new TextBox{Multiline=true,Height=70,PlaceholderText="Wajib isi alasan perbaikan"};
        CellAdd(table,new Label{Text="Kode Akun",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,0);CellAdd(table,new Label{Text=a.Code,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},1,0);CellAdd(table,new Label{Text="Nama",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,1);CellAdd(table,name,1,1);CellAdd(table,new Label{Text="Debet",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,2);CellAdd(table,debit,1,2);CellAdd(table,new Label{Text="Kredit",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,3);CellAdd(table,credit,1,3);CellAdd(table,new Label{Text="Alasan",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,4);CellAdd(table,reason,1,4);p.Controls.Add(table);
        var btn=Toolbar();btn.Dock=DockStyle.Bottom;btn.Controls.Add(ActionButton("Simpan Perbaikan",(_,_)=>{try{var d=ParseAmount(debit.Text);var k=ParseAmount(credit.Text);if(string.IsNullOrWhiteSpace(reason.Text)){MessageBox.Show("Alasan wajib diisi.");return;}BackupDatabaseForAdmin();db.ForceUpdateAccount(a.Code,name.Text.Trim(),d,k,reason.Text.Trim());dlg.Close();LoadNpsaldoAdminGrid();MessageBox.Show("NPSALDO berhasil diperbaiki.","Admin",MessageBoxButtons.OK,MessageBoxIcon.Information);}catch(Exception ex){MessageBox.Show(ex.Message,"Perbaikan NPSALDO",MessageBoxButtons.OK,MessageBoxIcon.Warning);}}));btn.Controls.Add(ActionButton("Batal",(_,_)=>dlg.Close(),true));p.Controls.Add(btn);dlg.Controls.Add(p);dlg.ShowDialog(this);
    }
    private void DeleteSelectedAccount(){
        var code=SelectedAccountCode();if(string.IsNullOrWhiteSpace(code)){MessageBox.Show("Pilih akun terlebih dahulu.");return;}var reason=PromptReason("Hapus Paksa NPSALDO",$"Akun {code} akan dihapus dari database modern. File NPSALDO.DBF asli tidak diubah. Alasan wajib:");if(string.IsNullOrWhiteSpace(reason))return;if(MessageBox.Show($"Hapus akun {code} secara permanen dari database modern?","Konfirmasi",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;try{BackupDatabaseForAdmin();db.ForceDeleteAccount(code,reason);LoadNpsaldoAdminGrid();MessageBox.Show("Akun berhasil dihapus.","Admin",MessageBoxButtons.OK,MessageBoxIcon.Information);}catch(Exception ex){MessageBox.Show(ex.Message,"Hapus NPSALDO",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
    private void SyncNpsaldoFromFile(){
        using var ofd=new OpenFileDialog{Title="Pilih NPSALDO.DBF dari komputer/flashdisk lain",Filter="NPSALDO DBF|NPSALDO.DBF|DBF files|*.DBF|Semua file|*.*",CheckFileExists=true};if(ofd.ShowDialog(this)!=DialogResult.OK)return;
        try{
            var t=DbfTable.Load(ofd.FileName);var rows=t.Rows.Where(r=>!string.IsNullOrWhiteSpace(r.GetValueOrDefault("SANDI"))).ToList();if(rows.Count==0){MessageBox.Show("NPSALDO tidak memiliki data akun yang dapat dibaca.");return;}
            var current=db.GetAccounts().ToDictionary(x=>x.Code,StringComparer.OrdinalIgnoreCase);var preview=rows.Select(r=>{var code=r.GetValueOrDefault("SANDI")?.Trim()??"";var name=r.GetValueOrDefault("DES")?.Trim()??code;var d=r.GetValueOrDefault("MUTASIDB")??"0";var k=r.GetValueOrDefault("MUTASIKR")??"0";if(!current.TryGetValue(code,out var a))return $"BARU     | {code} | {name}";var changed=!a.Name.Equals(name,StringComparison.OrdinalIgnoreCase)||a.OpeningDebit!=ParseAmount(d)||a.OpeningCredit!=ParseAmount(k);return changed?$"DIUBAH   | {code} | {a.Name} → {name}":$"TETAP    | {code} | {name}";}).ToList();
            var newCount=preview.Count(x=>x.StartsWith("BARU"));var chCount=preview.Count(x=>x.StartsWith("DIUBAH"));var unchanged=preview.Count-newCount-chCount;var missing=current.Keys.Count(k=>!rows.Any(r=>string.Equals(r.GetValueOrDefault("SANDI")?.Trim(),k,StringComparison.OrdinalIgnoreCase)));
            using var dlg=new Form{Text="Preview Sinkronisasi NPSALDO",StartPosition=FormStartPosition.CenterParent,Width=1050,Height=700};var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=3,Padding=new Padding(12)};root.RowStyles.Add(new RowStyle(SizeType.Absolute,70));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,60));CellAdd(root,new Label{Text=$"Sumber: {ofd.FileName}\nBaru: {newCount:N0} • Diubah: {chCount:N0} • Tetap: {unchanged:N0} • Tidak ada lagi di sumber: {missing:N0}",Dock=DockStyle.Fill,Font=new Font("Segoe UI Semibold",10),ForeColor=TextColor},0,0);var pg=CreateGrid();pg.DataSource=preview.Select(x=>new{Perubahan=x}).ToList();CellAdd(root,pg,0,1);var ft=Toolbar();ft.Controls.Add(ActionButton("Terapkan Sinkronisasi",(_,_)=>{try{BackupDatabaseForAdmin();db.SyncAccountsFromLegacy(rows);dlg.DialogResult=DialogResult.OK;dlg.Close();}catch(Exception ex){MessageBox.Show(ex.Message);}}));ft.Controls.Add(ActionButton("Batal",(_,_)=>dlg.Close(),true));CellAdd(root,ft,0,2);dlg.Controls.Add(root);if(dlg.ShowDialog(this)==DialogResult.OK){LoadNpsaldoAdminGrid();MessageBox.Show($"Sinkronisasi selesai. {rows.Count:N0} akun diproses.\n\nNPSALDO.DBF asli tidak diubah.","NPSALDO",MessageBoxButtons.OK,MessageBoxIcon.Information);}}
        catch(Exception ex){MessageBox.Show(ex.Message,"Sinkronisasi NPSALDO",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
    private void BackupDatabaseForAdmin(){try{var dir=Path.Combine(AppContext.BaseDirectory,"Data","App","AdminBackup");Directory.CreateDirectory(dir);db.BackupTo(Path.Combine(dir,$"SBPAccounting.before_admin.{DateTime.Now:yyyyMMdd_HHmmss}.db"));}catch(Exception ex){throw new InvalidOperationException("Backup otomatis sebelum perubahan admin gagal: "+ex.Message);}}
    private void LoadAccountsGrid(){if(npsaldo==null){grid.DataSource=null;return;}grid.DataSource=npsaldo.Rows.Select(r=>new{Kode=r.GetValueOrDefault("SANDI"),Nama=r.GetValueOrDefault("DES"),Debet=r.GetValueOrDefault("MUTASIDB"),Kredit=r.GetValueOrDefault("MUTASIKR")}).ToList();}
    private void ShowSaldo(){ShowMasterAkun();}
    private void ShowSaldoAccProg(){ShowLegacyGeneric("Saldo ACC & PROG",npsaldo);}
    private void ShowDataBulanan(){ShowLegacyGeneric("Data Bulanan ACC & PROG",npsaldo);}
    private void ShowLegacyGeneric(string h,DbfTable? t){ClearPage(h,"Data legacy • baca saja agar file DBF asli tetap aman");var s=Surface();grid=CreateGrid();s.Controls.Add(grid);pageHost.Controls.Add(s);if(t!=null)grid.DataSource=t.Rows.ToList();}

    private void ShowTanggalLaporan(){ClearPage("Tanggal Laporan","Periode ini dipakai sebagai default laporan");var s=Surface();var from=new DateTimePicker{Value=reportFrom,Format=DateTimePickerFormat.Short,Location=new Point(24,55),Width=130};var to=new DateTimePicker{Value=reportTo,Format=DateTimePickerFormat.Short,Location=new Point(190,55),Width=130};s.Controls.Add(new Label{Text="Dari",AutoSize=true,Location=new Point(24,30)});s.Controls.Add(new Label{Text="Sampai",AutoSize=true,Location=new Point(190,30)});s.Controls.Add(from);s.Controls.Add(to);var save=ActionButton("Simpan Periode",(_,_)=>{reportFrom=from.Value.Date;reportTo=to.Value.Date;MessageBox.Show($"Periode laporan: {reportFrom:dd/MM/yyyy} s.d. {reportTo:dd/MM/yyyy}");});save.Location=new Point(340,52);s.Controls.Add(save);pageHost.Controls.Add(s);}
    private void ShowNeracaPercobaan(){ClearPage("Neraca Percobaan","Total debit dan kredit jurnal POSTED");var root=PageRoot(2);var tb=Toolbar();tb.Controls.Add(ActionButton("Tampilkan",(_,_)=>LoadTrial()));tb.Controls.Add(ActionButton("Cetak",(_,_)=>PrintGrid("Neraca Percobaan"),true));CellAdd(root,tb,0,0);var s=Surface();grid=CreateGrid();s.Controls.Add(grid);CellAdd(root,s,0,1);pageHost.Controls.Add(root);LoadTrial();}
    private void LoadTrial(){var rows=db.GetTrialBalance(reportFrom,reportTo);grid.DataSource=rows.Select(x=>new{Akun=x.AccountCode,Nama=x.AccountName,Debet=x.Debit.ToString("N0",Id),Kredit=x.Credit.ToString("N0",Id)}).ToList();}
    private void ShowNeraca(){ShowNeracaPercobaan();}
    private void ShowLaporanKeuangan(){ClearPage("Laporan Keuangan","Ringkasan laporan berdasarkan jurnal POSTED");var root=PageRoot(2);var s=Surface();var rows=db.GetTrialBalance(reportFrom,reportTo);var debit=rows.Sum(x=>x.Debit);var credit=rows.Sum(x=>x.Credit);s.Controls.Add(new Label{Text=$"PERIODE\n{reportFrom:dd MMM yyyy} s.d. {reportTo:dd MMM yyyy}\n\nTOTAL DEBET : Rp {debit:N0}\nTOTAL KREDIT: Rp {credit:N0}\n\nCatatan: klasifikasi Neraca/Laba Rugi harus dipetakan pada Master Akun sebelum laporan final perusahaan digunakan.",AutoSize=true,Font=new Font("Segoe UI",11),ForeColor=TextColor,Location=new Point(24,24)});CellAdd(root,s,0,0);var d=Surface();d.Controls.Add(new Label{Text="Gunakan Neraca Percobaan sebagai pemeriksaan keseimbangan sebelum laporan keuangan final dicetak.",AutoSize=true,ForeColor=Muted,Location=new Point(24,24)});CellAdd(root,d,0,1);pageHost.Controls.Add(root);}
    private void ShowTbm(){ShowLegacyGeneric("Tanaman Belum Menghasilkan",nptrans);}
    private void ShowTm(){ShowLegacyGeneric("Tanaman Menghasilkan",nptrans);}
    private void ShowNeracaPerBukti(){ShowNptrans();}

    private void ShowNptrans(){ClearPage("NPTRANS Legacy","NPTRANS.DBF • baca saja • perubahan eksternal dapat dideteksi dan disinkronkan");var root=PageRoot(2);var tb=Toolbar();var search=new TextBox{Width=260,PlaceholderText="Cari no bukti / sandi / keterangan"};tb.Controls.Add(search);tb.Controls.Add(ActionButton("Cari",(_,_)=>FillNptrans(search.Text)));tb.Controls.Add(ActionButton("Snapshot",(_,_)=>CreateSnapshot(),true));tb.Controls.Add(ActionButton("Tinjau",(_,_)=>ReviewNptransChanges(),true));tb.Controls.Add(ActionButton("Sinkronkan",(_,_)=>SyncNptrans(),false));tb.Controls.Add(ActionButton("Cetak",(_,_)=>PrintSelectedNptrans(),true));CellAdd(root,tb,0,0);var s=Surface();grid=CreateGrid();grid.CellClick+=(_,e)=>{if(e.RowIndex>=0)selectedNoBukti=grid.Rows[e.RowIndex].Cells.Cast<DataGridViewCell>().FirstOrDefault(c=>grid.Columns[c.ColumnIndex].HeaderText.Equals("NoBukti",StringComparison.OrdinalIgnoreCase))?.Value?.ToString()??"";};s.Controls.Add(grid);CellAdd(root,s,0,1);pageHost.Controls.Add(root);FillNptrans("");}
    private void FillNptrans(string q){if(nptrans==null){grid.DataSource=null;return;}var rows=nptrans.Rows.Where(r=>string.IsNullOrWhiteSpace(q)||r.Values.Any(v=>v.Contains(q,StringComparison.OrdinalIgnoreCase))).Select(r=>new{Sandi=r.GetValueOrDefault("SANDI"),Tanggal=r.GetValueOrDefault("TANGGAL"),NoBukti=r.GetValueOrDefault("NOBUKTI"),NoUrut=r.GetValueOrDefault("NOURUT"),Keterangan=r.GetValueOrDefault("KET"),Jumlah=r.GetValueOrDefault("JUMLAH")}).ToList();grid.DataSource=rows;}

    private sealed class Snapshot{public string CreatedAt{get;set;}="";public string DbfPath{get;set;}="";public List<Dictionary<string,string>> Rows{get;set;}=new();}
    private sealed class Change{public string Type{get;set;}="";public string Key{get;set;}="";public Dictionary<string,string> Before{get;set;}=new();public Dictionary<string,string> After{get;set;}=new();}
    private List<Dictionary<string,string>> CurrentRows()=>nptrans?.Rows.Select(r=>new Dictionary<string,string>(r,StringComparer.OrdinalIgnoreCase)).ToList()??new();
    private string RowKey(Dictionary<string,string> r,int occurrence){return $"{r.GetValueOrDefault("NOBUKTI")}|{r.GetValueOrDefault("NOURUT")}|{r.GetValueOrDefault("SANDI")}|{occurrence}";}
    private Dictionary<string,Dictionary<string,string>> KeyRows(IEnumerable<Dictionary<string,string>> rows){var result=new Dictionary<string,Dictionary<string,string>>();var counts=new Dictionary<string,int>();foreach(var r in rows){var baseKey=$"{r.GetValueOrDefault("NOBUKTI")}|{r.GetValueOrDefault("NOURUT")}|{r.GetValueOrDefault("SANDI")}";counts[baseKey]=counts.GetValueOrDefault(baseKey)+1;result[RowKey(r,counts[baseKey])]=r;}return result;}
    private Snapshot? LoadSnapshot(){try{if(!File.Exists(SnapshotPath))return null;return JsonSerializer.Deserialize<Snapshot>(File.ReadAllText(SnapshotPath));}catch{return null;}}
    private void SaveSnapshot(List<Dictionary<string,string>> rows){Directory.CreateDirectory(SyncDir);File.WriteAllText(SnapshotPath,JsonSerializer.Serialize(new Snapshot{CreatedAt=DateTime.Now.ToString("s"),DbfPath=Path.Combine(DataDir,"NPTRANS.DBF"),Rows=rows},new JsonSerializerOptions{WriteIndented=true}));}
    private void CreateSnapshot(){if(nptrans==null){MessageBox.Show("NPTRANS.DBF tidak ditemukan.");return;}Directory.CreateDirectory(SnapshotBackupDir);if(File.Exists(SnapshotPath)){File.Copy(SnapshotPath,Path.Combine(SnapshotBackupDir,$"NPTRANS.snapshot.{DateTime.Now:yyyyMMdd_HHmmss}.json"),true);}SaveSnapshot(CurrentRows());MessageBox.Show($"Snapshot dibuat untuk {nptrans.Rows.Count:N0} baris NPTRANS.");ShowDashboard();}
    private List<Change> GetChanges(){var old=LoadSnapshot();if(old==null)return new();var a=KeyRows(old.Rows);var b=KeyRows(CurrentRows());var list=new List<Change>();foreach(var k in b.Keys){if(!a.ContainsKey(k))list.Add(new Change{Type="BARU",Key=k,After=b[k]});else if(!RowsEqual(a[k],b[k]))list.Add(new Change{Type="DIUBAH",Key=k,Before=a[k],After=b[k]});}foreach(var k in a.Keys)if(!b.ContainsKey(k))list.Add(new Change{Type="TERHAPUS",Key=k,Before=a[k]});return list;}
    private static bool RowsEqual(Dictionary<string,string>a,Dictionary<string,string>b){if(a.Count!=b.Count)return false;foreach(var kv in a)if(!string.Equals(kv.Value,b.GetValueOrDefault(kv.Key),StringComparison.Ordinal))return false;return true;}
    private void ReviewNptransChanges(){if(nptrans==null){MessageBox.Show("NPTRANS.DBF tidak ditemukan.");return;}var old=LoadSnapshot();if(old==null){if(MessageBox.Show("Belum ada snapshot. Buat snapshot awal sekarang?","NPTRANS",MessageBoxButtons.YesNo)==DialogResult.Yes)CreateSnapshot();return;}var changes=GetChanges();if(changes.Count==0){MessageBox.Show("Tidak ada perubahan NPTRANS sejak snapshot terakhir.");return;}ShowChangeDialog(changes,false);}
    private void SyncNptrans(){if(nptrans==null){MessageBox.Show("NPTRANS.DBF tidak ditemukan.");return;}if(LoadSnapshot()==null){if(MessageBox.Show("Belum ada snapshot. Buat snapshot awal sekarang?","NPTRANS",MessageBoxButtons.YesNo)==DialogResult.Yes)CreateSnapshot();return;}var changes=GetChanges();if(changes.Count==0){MessageBox.Show("NPTRANS sudah sinkron.");return;}if(ShowChangeDialog(changes,true)==DialogResult.OK){var added=changes.Count(x=>x.Type=="BARU");var changed=changes.Count(x=>x.Type=="DIUBAH");var deleted=changes.Count(x=>x.Type=="TERHAPUS");Directory.CreateDirectory(SnapshotBackupDir);File.Copy(SnapshotPath,Path.Combine(SnapshotBackupDir,$"NPTRANS.before_sync.{DateTime.Now:yyyyMMdd_HHmmss}.json"),true);SaveSnapshot(CurrentRows());db.AddSyncHistory("admin",added,changed,deleted,nptrans.Rows.Count,SnapshotPath);db.Audit("SYNC","NPTRANS",null,$"BARU={added}; DIUBAH={changed}; TERHAPUS={deleted}");MessageBox.Show($"Sinkronisasi selesai.\n\nBaru: {added}\nDiubah: {changed}\nTerhapus: {deleted}\n\nNPTRANS.DBF asli tidak diubah.");ShowDashboard();}}
    private DialogResult ShowChangeDialog(List<Change> changes,bool sync){using var dlg=new Form{Text=sync?"Konfirmasi Sinkronisasi NPTRANS":"Tinjau Perubahan NPTRANS",StartPosition=FormStartPosition.CenterParent,Width=1000,Height=620,MinimizeBox=false,MaximizeBox=true};var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=3,Padding=new Padding(12)};root.RowStyles.Add(new RowStyle(SizeType.Absolute,60));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,50));CellAdd(root,new Label{Text=$"{changes.Count:N0} perubahan • BARU {changes.Count(x=>x.Type=="BARU")} • DIUBAH {changes.Count(x=>x.Type=="DIUBAH")} • TERHAPUS {changes.Count(x=>x.Type=="TERHAPUS")}\n{(sync?"Jika diterima, snapshot aplikasi akan mengikuti isi NPTRANS.DBF terbaru. File DBF asli tidak ditulis.":"Periksa perubahan sebelum melakukan sinkronisasi.")}",Dock=DockStyle.Fill,Font=new Font("Segoe UI Semibold",9.5F),ForeColor=TextColor},0,0);var g=CreateGrid();g.Columns.Add("Jenis","Jenis");g.Columns.Add("NoBukti","No. Bukti");g.Columns.Add("Sandi","Sandi");g.Columns.Add("Before","Sebelum");g.Columns.Add("After","Sesudah");foreach(var c in changes){var before=c.Before.GetValueOrDefault("JUMLAH");var after=c.After.GetValueOrDefault("JUMLAH");g.Rows.Add(c.Type,c.After.GetValueOrDefault("NOBUKTI",c.Before.GetValueOrDefault("NOBUKTI")),c.After.GetValueOrDefault("SANDI",c.Before.GetValueOrDefault("SANDI")),before,after);}CellAdd(root,g,0,1);var f=Toolbar();f.Controls.Add(ActionButton("Tutup",(_,_)=>dlg.DialogResult=DialogResult.Cancel,true));if(sync)f.Controls.Add(ActionButton("Terima & Sinkronkan",(_,_)=>dlg.DialogResult=DialogResult.OK));CellAdd(root,f,0,2);dlg.Controls.Add(root);return dlg.ShowDialog(this);}
    private void ShowSyncHistory(){ClearPage("Riwayat Sinkronisasi","Riwayat penerimaan perubahan NPTRANS dari luar aplikasi");var s=Surface();grid=CreateGrid();grid.DataSource=db.GetSyncHistory().Select(x=>new{Waktu=x.Time,Baru=x.Added,Diubah=x.Changed,Terhapus=x.Deleted,Total=x.Total}).ToList();s.Controls.Add(grid);pageHost.Controls.Add(s);}

    private void ShowTutupBulan(){ShowClosePeriod(false);}
    private void ShowTutupTahun(){ShowClosePeriod(true);}
    private void ShowClosePeriod(bool year){ClearPage(year?"Tutup Tahun":"Tutup Bulan",year?"Proses periode akhir tahun":"Kunci periode bulanan setelah pemeriksaan jurnal dan laporan");var s=Surface();var date=new DateTimePicker{Value=DateTime.Now,Format=DateTimePickerFormat.Custom,CustomFormat=year?"MMMM yyyy":"MMMM yyyy",Width=160,Location=new Point(24,60)};s.Controls.Add(new Label{Text="Periode",AutoSize=true,Location=new Point(24,35)});s.Controls.Add(date);var close=ActionButton(year?"Tutup Tahun":"Tutup Bulan",(_,_)=>{try{if(year){for(int m=1;m<=12;m++)db.ClosePeriod(new DateTime(date.Value.Year,m,1));}else db.ClosePeriod(date.Value);MessageBox.Show("Periode berhasil ditutup.");}catch(Exception ex){MessageBox.Show(ex.Message,"Tutup Buku",MessageBoxButtons.OK,MessageBoxIcon.Warning);}});close.Location=new Point(205,57);s.Controls.Add(close);pageHost.Controls.Add(s);}
    private void ShowRiwayatPeriode(){ClearPage("Riwayat Periode","Status periode disimpan di database lokal");var s=Surface();grid=CreateGrid();var rows=Enumerable.Range(DateTime.Now.Year-1,3).SelectMany(y=>Enumerable.Range(1,12).Select(m=>new{Periode=$"{y}-{m:00}",Status=db.IsPeriodClosed(new DateTime(y,m,1))?"DITUTUP":"TERBUKA"})).ToList();grid.DataSource=rows;s.Controls.Add(grid);pageHost.Controls.Add(s);}

    private void ShowBackup(){ClearPage("Backup","Backup database modern dan snapshot NPTRANS");var s=Surface();var b=ActionButton("Backup Sekarang",(_,_)=>{try{var dir=Path.Combine(AppContext.BaseDirectory,"Data","Backup");Directory.CreateDirectory(dir);var dest=Path.Combine(dir,$"SBPAccounting_{DateTime.Now:yyyyMMdd_HHmmss}.db");db.BackupTo(dest);if(File.Exists(SnapshotPath))File.Copy(SnapshotPath,Path.Combine(dir,$"NPTRANS_snapshot_{DateTime.Now:yyyyMMdd_HHmmss}.json"),true);db.Audit("BACKUP","DATABASE",null,dest);MessageBox.Show("Backup berhasil:\n"+dest);}catch(Exception ex){MessageBox.Show(ex.Message);}});b.Location=new Point(24,24);s.Controls.Add(b);pageHost.Controls.Add(s);}
    private void ShowRestore(){ClearPage("Restore","Pulihkan database modern dari backup .db");var s=Surface();var b=ActionButton("Pilih Backup",(_,_)=>{using var of=new OpenFileDialog{Filter="Database SBP (*.db)|*.db|Semua file|*.*",InitialDirectory=Path.Combine(AppContext.BaseDirectory,"Data","Backup")};if(of.ShowDialog()!=DialogResult.OK)return;if(MessageBox.Show("Restore akan mengganti database aktif. Lanjutkan?","Konfirmasi",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;try{db.RestoreFrom(of.FileName);MessageBox.Show("Restore selesai. Tutup dan buka kembali aplikasi.");}catch(Exception ex){MessageBox.Show(ex.Message);}});b.Location=new Point(24,24);s.Controls.Add(b);pageHost.Controls.Add(s);}
    private void ShowUsers(){ClearPage("User & Hak Akses","Daftar pengguna lokal • struktur siap untuk pembatasan role");var s=Surface();grid=CreateGrid();grid.DataSource=new[]{new{Username="admin",Nama="Administrator",Role="ADMIN",Status="AKTIF"}};s.Controls.Add(grid);pageHost.Controls.Add(s);}
    private void ShowAudit(){ClearPage("Audit Trail","Jejak aktivitas aplikasi");var s=Surface();grid=CreateGrid();grid.DataSource=db.GetAudit().Select(x=>new{Waktu=x.Time,User=x.User,Aksi=x.Action,Objek=x.Entity,ID=x.EntityId,Detail=x.Details}).ToList();s.Controls.Add(grid);pageHost.Controls.Add(s);}
    private void ShowSettings(){ClearPage("Pengaturan Database","Konfigurasi lokal dan informasi teknis");var s=Surface();s.Controls.Add(new Label{Text=$"Mode: OFFLINE\nDatabase: {db.Path}\nLegacy: {DataDir}\nNPTRANS asli: baca saja\nDatabase modern: SQLite + WAL\n\nAplikasi tidak memerlukan internet untuk transaksi dan laporan.",AutoSize=true,Font=new Font("Segoe UI",10),ForeColor=TextColor,Location=new Point(24,24)});pageHost.Controls.Add(s);}
    private void ShowReindex(){ClearPage("Reindex Data","Perawatan indeks legacy • tidak mengubah isi DBF");var s=Surface();var b=ActionButton("Periksa File Legacy",(_,_)=>{LoadLegacyData();MessageBox.Show($"NPTRANS: {nptrans?.Rows.Count:N0} baris\nNPSALDO: {npsaldo?.Rows.Count:N0} baris\n\nReader berhasil membaca file yang tersedia.");});b.Location=new Point(24,24);s.Controls.Add(b);pageHost.Controls.Add(s);}

    private void ShowPrinter()
    {
        using var dlg = new Form
        {
            Text = "Pengaturan Cetak",
            StartPosition = FormStartPosition.CenterParent,
            Width = 760,
            Height = 690,
            MinimumSize = new Size(700, 620),
            FormBorderStyle = FormBorderStyle.Sizable,
            BackColor = Bg
        };

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 9,
            Padding = new Padding(20),
            BackColor = Bg
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        for (int i = 0; i < 8; i++) root.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var orientation = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 250 };
        orientation.Items.AddRange(new object[] { "Portrait / Tegak", "Landscape / Mendatar" });
        orientation.SelectedIndex = printSettings.Landscape ? 1 : 0;

        var paper = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 250 };
        paper.Items.AddRange(new object[] { "A4", "F4 / Folio", "Letter" });
        paper.SelectedItem = printSettings.PaperName;
        if (paper.SelectedIndex < 0) paper.SelectedIndex = 0;

        var printer = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 250 };
        foreach (string name in PrinterSettings.InstalledPrinters) printer.Items.Add(name);
        if (!string.IsNullOrWhiteSpace(printSettings.PrinterName) && printer.Items.Contains(printSettings.PrinterName)) printer.SelectedItem = printSettings.PrinterName;
        else if (printer.Items.Count > 0) printer.SelectedIndex = 0;

        var top = NumericMm(printSettings.TopMm);
        var bottom = NumericMm(printSettings.BottomMm);
        var left = NumericMm(printSettings.LeftMm);
        var right = NumericMm(printSettings.RightMm);

        var autoLandscape = new CheckBox { Text = "Orientasi otomatis berdasarkan jumlah kolom", AutoSize = true, Checked = printSettings.AutoLandscape };
        var fit = new CheckBox { Text = "Sesuaikan tabel dengan lebar halaman", AutoSize = true, Checked = printSettings.FitToWidth };
        var wrap = new CheckBox { Text = "Bungkus teks panjang agar mudah dibaca", AutoSize = true, Checked = printSettings.WrapText };
        var repeat = new CheckBox { Text = "Ulangi header tabel di setiap halaman", AutoSize = true, Checked = printSettings.RepeatHeader };
        var showHeader = new CheckBox { Text = "Tampilkan kop perusahaan", AutoSize = true, Checked = printSettings.ShowHeader };
        var showFooter = new CheckBox { Text = "Tampilkan nomor halaman & waktu cetak", AutoSize = true, Checked = printSettings.ShowFooter };
        var preview = new CheckBox { Text = "Tampilkan preview sebelum mencetak", AutoSize = true, Checked = printSettings.PreviewBeforePrint };

        CellAdd(root,SettingsField("Orientasi", orientation),0,0);
        CellAdd(root,SettingsField("Ukuran kertas", paper),1,0);
        CellAdd(root,SettingsField("Printer", printer),0,1);
        CellAdd(root,SettingsField("Margin Atas (mm)", top),1,1);
        CellAdd(root,SettingsField("Margin Bawah (mm)", bottom),0,2);
        CellAdd(root,SettingsField("Margin Kiri (mm)", left),1,2);
        CellAdd(root,SettingsField("Margin Kanan (mm)", right),0,3);

        var checks = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(4) };
        checks.Controls.Add(autoLandscape); checks.Controls.Add(fit); checks.Controls.Add(wrap); checks.Controls.Add(repeat); checks.Controls.Add(showHeader); checks.Controls.Add(showFooter); checks.Controls.Add(preview);
        CellAdd(root,checks,0,4); root.SetColumnSpan(checks, 2);

        var note = new Label
        {
            Text = "Tips: untuk laporan dengan banyak kolom, gunakan Landscape. Kolom tidak digabungkan; teks panjang akan turun ke baris berikutnya agar tetap mudah dibaca.",
            Dock = DockStyle.Fill, AutoSize = false, ForeColor = Muted, Font = new Font("Segoe UI", 9.5F), Padding = new Padding(4, 8, 4, 4)
        };
        CellAdd(root,note,0,5); root.SetColumnSpan(note, 2);

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false, Padding = new Padding(0, 8, 0, 0) };
        buttons.Controls.Add(ActionButton("Simpan Pengaturan", (_, _) =>
        {
            printSettings.Landscape = orientation.SelectedIndex == 1;
            printSettings.PaperName = paper.SelectedItem?.ToString() ?? "A4";
            printSettings.PrinterName = printer.SelectedItem?.ToString() ?? "";
            printSettings.TopMm = top.Value; printSettings.BottomMm = bottom.Value; printSettings.LeftMm = left.Value; printSettings.RightMm = right.Value;
            printSettings.AutoLandscape = autoLandscape.Checked;
            printSettings.FitToWidth = fit.Checked;
            printSettings.WrapText = wrap.Checked;
            printSettings.RepeatHeader = repeat.Checked;
            printSettings.ShowHeader = showHeader.Checked;
            printSettings.ShowFooter = showFooter.Checked;
            printSettings.PreviewBeforePrint = preview.Checked;
            SavePrintSettings(printSettings);
            MessageBox.Show("Pengaturan cetak berhasil disimpan.", "Printer", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }, true));
        buttons.Controls.Add(ActionButton("Tes Cetak", (_, _) => PrintTestPage()));
        buttons.Controls.Add(ActionButton("Tutup", (_, _) => dlg.Close(), true));
        CellAdd(root,buttons,0,6); root.SetColumnSpan(buttons, 2);
        dlg.Controls.Add(root);
        dlg.ShowDialog(this);
    }

    private Control SettingsField(string label, Control control)
    {
        var p = new Panel { Dock = DockStyle.Fill, Padding = new Padding(4, 2, 10, 2) };
        p.Controls.Add(new Label { Text = label, Dock = DockStyle.Top, Height = 22, ForeColor = Muted, Font = new Font("Segoe UI Semibold", 9) });
        control.Dock = DockStyle.Bottom; control.Height = 34; p.Controls.Add(control);
        return p;
    }

    private NumericUpDown NumericMm(decimal value)
    {
        return new NumericUpDown { Minimum = 0, Maximum = 50, DecimalPlaces = 1, Increment = 0.5M, Value = Clamp(value, 0, 50), Width = 250 };
    }

    private void PrintJournal(long id)
    {
        var j = db.GetJournals().FirstOrDefault(x => x.Id == id); if (j == null) return;
        var lines = db.GetLines(id);
        var rows = lines.Select(x => new PrintRow(new[] { x.AccountCode, x.AccountName, x.Debit.ToString("N0", Id), x.Credit.ToString("N0", Id) })).ToList();
        var totalDebit = lines.Sum(x => x.Debit);
        var totalCredit = lines.Sum(x => x.Credit);
        rows.Add(new PrintRow(new[] { "", "TOTAL", totalDebit.ToString("N0", Id), totalCredit.ToString("N0", Id) }));
        PrintTable("JURNAL", j.No, j.Date, j.Description, new[] { "Kode Akun", "Nama Akun", "Debet", "Kredit" }, rows);
    }

    private void PrintSelectedNptrans()
    {
        if (nptrans == null || string.IsNullOrWhiteSpace(selectedNoBukti)) { MessageBox.Show("Pilih transaksi NPTRANS terlebih dahulu."); return; }
        var rows = nptrans.Rows.Where(r => r.GetValueOrDefault("NOBUKTI") == selectedNoBukti).ToList();
        var printRows = rows.Select(r => new PrintRow(new[] { r.GetValueOrDefault("SANDI"), r.GetValueOrDefault("TANGGAL"), r.GetValueOrDefault("NOURUT"), r.GetValueOrDefault("KET"), r.GetValueOrDefault("JUMLAH") })).ToList();
        PrintTable("NPTRANS — DATA LEGACY", selectedNoBukti, DateTime.Now, "Data legacy • baca saja", new[] { "Sandi", "Tanggal", "No Urut", "Keterangan", "Jumlah" }, printRows);
    }

    private void PrintGrid(string heading)
    {
        if (grid.Rows.Count == 0) { MessageBox.Show("Tidak ada data untuk dicetak.", heading); return; }
        var cols = grid.Columns.Cast<DataGridViewColumn>().Where(c => c.Visible).Select(c => c.HeaderText).ToArray();
        var rows = grid.Rows.Cast<DataGridViewRow>().Where(r => !r.IsNewRow).Select(r => new PrintRow(r.Cells.Cast<DataGridViewCell>().Where(c => c.OwningColumn.Visible).Select(c => c.Value?.ToString() ?? "").ToArray())).ToList();
        PrintTable(heading, "", DateTime.Now, $"Periode laporan: {reportFrom:dd/MM/yyyy} s/d {reportTo:dd/MM/yyyy}", cols, rows);
    }

    private void PrintTestPage()
    {
        var rows = new List<PrintRow>
        {
            new(new[] { "110101", "Kas dan Bank", "5.000.000", "" }),
            new(new[] { "510101", "Biaya Operasional / Keterangan yang cukup panjang untuk menguji pembungkusan teks pada hasil cetak", "", "5.000.000" }),
            new(new[] { "", "TOTAL", "5.000.000", "5.000.000" })
        };
        PrintTable("TES PENGATURAN CETAK", "TEST-001", DateTime.Now, "Contoh cetak dengan kolom terpisah dan teks panjang dibungkus.", new[] { "Kode Akun", "Nama Akun / Keterangan", "Debet", "Kredit" }, rows);
    }

    private void PrintTable(string heading, string documentNo, DateTime date, string description, string[] headers, List<PrintRow> rows)
    {
        using var doc = new PrintDocument();
        var effectiveLandscape = printSettings.AutoLandscape ? headers.Length >= 5 : printSettings.Landscape;
        ApplyPrintSettings(doc, effectiveLandscape);
        int rowIndex = 0;
        int pageNumber = 0;
        bool firstPage = true;

        doc.PrintPage += (_, e) =>
        {
            pageNumber++;
            var g = e.Graphics;
            var bounds = e.MarginBounds;
            float y = bounds.Top;
            using var titleFont = new Font("Segoe UI Semibold", effectiveLandscape ? 14 : 13, FontStyle.Bold);
            using var headFont = new Font("Segoe UI Semibold", headers.Length >= 8 ? 7.5F : 8.5F, FontStyle.Bold);
            using var bodyFont = new Font("Segoe UI", headers.Length >= 8 ? 7.2F : 8.2F);
            using var smallFont = new Font("Segoe UI", 7.5F);
            using var linePen = new Pen(Color.FromArgb(180, 190, 202), 1);
            using var headerBrush = new SolidBrush(Color.FromArgb(232, 238, 246));
            using var altBrush = new SolidBrush(Color.FromArgb(248, 250, 252));
            using var textBrush = new SolidBrush(Color.FromArgb(25, 35, 50));

            if (printSettings.ShowHeader || firstPage)
            {
                g.DrawString("PT. SURYA BRATASENA PLANTATION", titleFont, textBrush, bounds.Left, y); y += 24;
                g.DrawString(heading, headFont, textBrush, bounds.Left, y); y += 17;
                if (!string.IsNullOrWhiteSpace(documentNo)) { g.DrawString($"No. Bukti: {documentNo}    Tanggal: {date:dd/MM/yyyy}", smallFont, textBrush, bounds.Left, y); y += 15; }
                if (!string.IsNullOrWhiteSpace(description)) { g.DrawString(description, smallFont, Brushes.DimGray, new RectangleF(bounds.Left, y, bounds.Width, 30)); y += 20; }
                g.DrawLine(linePen, bounds.Left, y, bounds.Right, y); y += 7;
            }

            var widths = CalculateColumnWidths(g, headers, rows, bounds.Width, bodyFont);
            float x = bounds.Left;
            float headerH = 30;
            for (int i = 0; i < headers.Length; i++)
            {
                g.FillRectangle(headerBrush, x, y, widths[i], headerH);
                g.DrawRectangle(linePen, x, y, widths[i], headerH);
                DrawCellText(g, headers[i], headFont, textBrush, x + 6, y + 5, widths[i] - 12, true, CellAlignment(headers[i]));
                x += widths[i];
            }
            y += headerH;

            while (rowIndex < rows.Count)
            {
                var values = rows[rowIndex].Values;
                float rowH = CalculateRowHeight(g, values, headers, widths, bodyFont);
                if (y + rowH > bounds.Bottom - (printSettings.ShowFooter ? 24 : 4))
                {
                    e.HasMorePages = true;
                    break;
                }

                x = bounds.Left;
                if (rowIndex % 2 == 1) g.FillRectangle(altBrush, bounds.Left, y, widths.Sum(), rowH);
                for (int i = 0; i < headers.Length; i++)
                {
                    string val = i < values.Length ? values[i] : "";
                    g.DrawRectangle(linePen, x, y, widths[i], rowH);
                    DrawCellText(g, val, bodyFont, textBrush, x + 6, y + 5, widths[i] - 12, false, CellAlignment(headers[i]), rowH - 8);
                    x += widths[i];
                }
                y += rowH;
                rowIndex++;
            }

            if (rowIndex >= rows.Count) e.HasMorePages = false;
            if (printSettings.ShowFooter)
                g.DrawString($"Halaman {pageNumber} • Dicetak {DateTime.Now:dd/MM/yyyy HH:mm}", smallFont, Brushes.DimGray, bounds.Left, bounds.Bottom + 6);
            firstPage = false;
        };

        ShowPrintPreview(doc);
    }

    private float CalculateRowHeight(Graphics g, string[] values, string[] headers, float[] widths, Font font)
    {
        if (!printSettings.WrapText) return 25;
        float max = 25;
        for (int i = 0; i < headers.Length; i++)
        {
            var text = i < values.Length ? values[i] ?? "" : "";
            var area = new SizeF(Math.Max(20, widths[i] - 12), 200);
            var measured = g.MeasureString(text, font, area, new StringFormat { FormatFlags = StringFormatFlags.NoClip });
            max = Math.Max(max, Math.Min(58, measured.Height + 10));
        }
        return max;
    }

    private float[] CalculateColumnWidths(Graphics g, string[] headers, List<PrintRow> rows, int totalWidth, Font font)
    {
        var widths = new float[headers.Length];
        for (int i = 0; i < headers.Length; i++)
        {
            string h = headers[i].Trim().ToLowerInvariant();
            float preferred = h switch
            {
                var x when x.Contains("keterangan") => 230,
                var x when x.Contains("nama akun") => 220,
                var x when x.Contains("deskripsi") => 220,
                var x when x.Contains("no. bukti") || x == "no" => 115,
                var x when x.Contains("tanggal") => 88,
                var x when x.Contains("debet") || x.Contains("kredit") || x.Contains("jumlah") => 110,
                var x when x.Contains("status") => 80,
                var x when x.Contains("dibuat") || x.Contains("posting") => 95,
                var x when x.Contains("kode") || x.Contains("sandi") || x.Contains("no urut") => 90,
                _ => 110
            };
            float maxContent = g.MeasureString(headers[i], font).Width + 20;
            foreach (var r in rows.Take(100)) if (i < r.Values.Length)
                maxContent = Math.Max(maxContent, Math.Min(260, g.MeasureString(r.Values[i] ?? "", font).Width + 20));
            widths[i] = Math.Max(preferred, Math.Min(280, maxContent));
        }
        float sum = widths.Sum();
        if (sum > totalWidth)
        {
            float scale = totalWidth / Math.Max(sum, 1);
            for (int i = 0; i < widths.Length; i++) widths[i] = Math.Max(45, widths[i] * scale);
        }
        else if (printSettings.FitToWidth)
        {
            float extra = (totalWidth - sum) / Math.Max(1, widths.Length);
            for (int i = 0; i < widths.Length; i++) widths[i] += extra;
        }
        return widths;
    }


    private static StringAlignment CellAlignment(string header)
    {
        var h = header.ToLowerInvariant();
        if (h.Contains("debet") || h.Contains("kredit") || h.Contains("jumlah") || h.Contains("nominal")) return StringAlignment.Far;
        if (h.Contains("tanggal")) return StringAlignment.Center;
        return StringAlignment.Near;
    }

    private void DrawCellText(Graphics g, string text, Font font, Brush brush, float x, float y, float width, bool bold, StringAlignment alignment, float height = 22)
    {
        using var sf = new StringFormat
        {
            Alignment = alignment,
            LineAlignment = StringAlignment.Near,
            Trimming = printSettings.WrapText ? StringTrimming.Word : StringTrimming.EllipsisCharacter,
            FormatFlags = printSettings.WrapText ? StringFormatFlags.NoClip : StringFormatFlags.NoWrap
        };
        g.DrawString(text ?? "", font, brush, new RectangleF(x, y, Math.Max(8, width), Math.Max(12, height)), sf);
    }

    private void ApplyPrintSettings(PrintDocument doc, bool landscape)
    {
        doc.DocumentName = "SBP Accounting";
        doc.DefaultPageSettings.Landscape = landscape;
        doc.DefaultPageSettings.Margins = new Margins(MmToHundredthsInch(printSettings.LeftMm), MmToHundredthsInch(printSettings.RightMm), MmToHundredthsInch(printSettings.TopMm), MmToHundredthsInch(printSettings.BottomMm));
        doc.DefaultPageSettings.PaperSize = PaperSizeFromName(printSettings.PaperName);
        if (!string.IsNullOrWhiteSpace(printSettings.PrinterName)) try { doc.PrinterSettings.PrinterName = printSettings.PrinterName; } catch { }
    }

    private static int MmToHundredthsInch(decimal mm) => (int)Math.Round((double)mm / 25.4 * 100.0);
    private static PaperSize PaperSizeFromName(string name) => name switch
    {
        "F4 / Folio" => new PaperSize("F4", 827, 1276),
        "Letter" => new PaperSize("Letter", 850, 1100),
        _ => new PaperSize("A4", 827, 1169)
    };

    private void ShowCompanyInfo()
    {
        ClearPage("Informasi Perusahaan", "Identitas perusahaan yang digunakan pada tampilan dan laporan");
        var s = Surface();
        s.Controls.Add(new Label
        {
            Text = "PT. SURYA BRATASENA PLANTATION\nAplikasi: SBP Accounting\nMode: Windows Desktop • Offline\n\nData legacy NPTRANS/NPSALDO dipertahankan dan dibaca tanpa mengubah file DBF.",
            AutoSize = true,
            Font = new Font("Segoe UI", 11),
            ForeColor = TextColor,
            Location = new Point(24, 24)
        });
        pageHost.Controls.Add(s);
    }

    private void ShowPrintPreview(PrintDocument doc)
    {
        using var dlg = new PrintPreviewDialog { Document = doc, Width = 1320, Height = 900, StartPosition = FormStartPosition.CenterParent };
        dlg.PrintPreviewControl.Zoom = 1.0;
        dlg.ShowDialog(this);
    }

    private PrintSettings LoadPrintSettings()
    {
        try { if (File.Exists(PrintSettingsPath)) return JsonSerializer.Deserialize<PrintSettings>(File.ReadAllText(PrintSettingsPath)) ?? new PrintSettings(); } catch { }
        return new PrintSettings();
    }
    private void SavePrintSettings(PrintSettings settings)
    {
        try { Directory.CreateDirectory(Path.GetDirectoryName(PrintSettingsPath)!); File.WriteAllText(PrintSettingsPath, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true })); } catch { }
    }
    private static decimal Clamp(decimal value, decimal min, decimal max) => Math.Min(max, Math.Max(min, value));

    private sealed class PrintRow
    {
        public string[] Values { get; }
        public PrintRow(string[] values) => Values = values;
    }

    private sealed class PrintSettings
    {
        public bool Landscape { get; set; } = false;
        public bool AutoLandscape { get; set; } = true;
        public string PaperName { get; set; } = "A4";
        public string PrinterName { get; set; } = "";
        public decimal TopMm { get; set; } = 12;
        public decimal BottomMm { get; set; } = 12;
        public decimal LeftMm { get; set; } = 12;
        public decimal RightMm { get; set; } = 12;
        public bool ShowHeader { get; set; } = true;
        public bool ShowFooter { get; set; } = true;
        public bool FitToWidth { get; set; } = true;
        public bool WrapText { get; set; } = true;
        public bool RepeatHeader { get; set; } = true;
        public bool PreviewBeforePrint { get; set; } = true;
    }

    private static string Shorten(string s,int n)=>s.Length<=n?s:s[..n];
    protected override void OnFormClosed(FormClosedEventArgs e){timer.Stop();base.OnFormClosed(e);}
}
