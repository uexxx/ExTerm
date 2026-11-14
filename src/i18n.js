/* ExTerm v15.2 i18n engine: first-launch language gate, live DOM translation (data-i18n / data-i18n-ph / data-i18n-title
   + t(key)), RTL mirroring for Arabic, Hebrew, Persian and Urdu, and a 🌐 header pill to switch any time.
   32 named languages translate every key; any other ISO-639-1 locale is selectable and falls back to English text.
   shortcut: the dictionary covers the app shell (nav, header, gate, workstation); deeper panels stay English until their
   strings are moved to keys. Pure parts (tr, norm, search) are unit-tested in Node. Strict CSP: no inline handlers. */
const I18N = (() => {
  const I = {};
  I.KEYS = ['nav.markets', 'nav.heat', 'nav.bots', 'nav.port', 'nav.social', 'nav.workspace', 'nav.journal', 'nav.challenge', 'nav.ai', 'nav.lab', 'nav.set', 'hdr.equity', 'gate.title', 'gate.sub', 'gate.search', 'gate.go', 'gate.more', 'ws.title', 'ws.hud', 'lang.label'];
  // code, native name, English name, flag, translations (same order as KEYS, '|'-separated)
  const RAW = [
    ['en', 'English', 'English', '🇬🇧', 'Markets|Heat Map|Bots & Backtest|Portfolio|Social|Workspace|Journal|Challenges|AI Copilot|Lab|Settings|Paper equity|Choose your language|You can change it any time with the 🌐 button.|Search languages…|Continue|More languages (English interface)|Workstation|Clean mode|Language'],
    ['es', 'Español', 'Spanish', '🇪🇸', 'Mercados|Mapa de calor|Bots y backtest|Cartera|Social|Espacio de trabajo|Diario|Desafíos|Copiloto IA|Laboratorio|Ajustes|Capital simulado|Elige tu idioma|Puedes cambiarlo en cualquier momento con el botón 🌐.|Buscar idiomas…|Continuar|Más idiomas (interfaz en inglés)|Estación de trabajo|Modo limpio|Idioma'],
    ['zh-CN', '中文 (简体)', 'Chinese (Simplified)', '🇨🇳', '市场|热力图|机器人与回测|投资组合|社交|工作区|交易日志|挑战|AI 助手|实验室|设置|模拟资产|选择您的语言|您可以随时通过 🌐 按钮更改。|搜索语言…|继续|更多语言（英文界面）|工作站|简洁模式|语言'],
    ['zh-TW', '中文 (繁體)', 'Chinese (Traditional)', '🇹🇼', '市場|熱力圖|機器人與回測|投資組合|社群|工作區|交易日誌|挑戰|AI 助理|實驗室|設定|模擬資產|選擇您的語言|您可以隨時透過 🌐 按鈕變更。|搜尋語言…|繼續|更多語言（英文介面）|工作站|簡潔模式|語言'],
    ['ja', '日本語', 'Japanese', '🇯🇵', 'マーケット|ヒートマップ|ボットとバックテスト|ポートフォリオ|ソーシャル|ワークスペース|ジャーナル|チャレンジ|AI コパイロット|ラボ|設定|ペーパー資産|言語を選択|🌐 ボタンでいつでも変更できます。|言語を検索…|続ける|その他の言語（英語表示）|ワークステーション|クリーンモード|言語'],
    ['ko', '한국어', 'Korean', '🇰🇷', '마켓|히트맵|봇 & 백테스트|포트폴리오|소셜|워크스페이스|매매일지|챌린지|AI 코파일럿|랩|설정|모의 자산|언어를 선택하세요|🌐 버튼으로 언제든지 변경할 수 있습니다.|언어 검색…|계속|더 많은 언어 (영어 인터페이스)|워크스테이션|클린 모드|언어'],
    ['hi', 'हिन्दी', 'Hindi', '🇮🇳', 'बाज़ार|हीट मैप|बॉट और बैकटेस्ट|पोर्टफोलियो|सोशल|वर्कस्पेस|जर्नल|चुनौतियाँ|AI कोपायलट|लैब|सेटिंग्स|पेपर इक्विटी|अपनी भाषा चुनें|आप इसे 🌐 बटन से कभी भी बदल सकते हैं।|भाषाएँ खोजें…|जारी रखें|अधिक भाषाएँ (अंग्रेज़ी इंटरफ़ेस)|वर्कस्टेशन|क्लीन मोड|भाषा'],
    ['ar', 'العربية', 'Arabic', '🇸🇦', 'الأسواق|خريطة حرارية|الروبوتات والاختبار الرجعي|المحفظة|اجتماعي|مساحة العمل|السجل|التحديات|مساعد الذكاء الاصطناعي|المختبر|الإعدادات|رصيد تجريبي|اختر لغتك|يمكنك تغييرها في أي وقت عبر زر 🌐.|ابحث عن لغة…|متابعة|لغات أخرى (واجهة إنجليزية)|محطة العمل|الوضع النظيف|اللغة'],
    ['pt', 'Português', 'Portuguese', '🇧🇷', 'Mercados|Mapa de calor|Bots e backtest|Carteira|Social|Área de trabalho|Diário|Desafios|Copiloto IA|Laboratório|Configurações|Patrimônio simulado|Escolha seu idioma|Você pode mudar a qualquer momento no botão 🌐.|Pesquisar idiomas…|Continuar|Mais idiomas (interface em inglês)|Estação de trabalho|Modo limpo|Idioma'],
    ['fr', 'Français', 'French', '🇫🇷', 'Marchés|Carte thermique|Bots et backtest|Portefeuille|Social|Espace de travail|Journal|Défis|Copilote IA|Labo|Paramètres|Capital fictif|Choisissez votre langue|Vous pouvez la changer à tout moment avec le bouton 🌐.|Rechercher une langue…|Continuer|Plus de langues (interface en anglais)|Station de travail|Mode épuré|Langue'],
    ['de', 'Deutsch', 'German', '🇩🇪', 'Märkte|Heatmap|Bots & Backtest|Portfolio|Social|Arbeitsbereich|Journal|Challenges|KI-Copilot|Labor|Einstellungen|Papierkapital|Sprache wählen|Du kannst sie jederzeit über die 🌐-Taste ändern.|Sprachen suchen…|Weiter|Weitere Sprachen (englische Oberfläche)|Workstation|Clean-Modus|Sprache'],
    ['ru', 'Русский', 'Russian', '🇷🇺', 'Рынки|Тепловая карта|Боты и бэктест|Портфель|Соцсети|Рабочая область|Журнал|Испытания|ИИ-помощник|Лаборатория|Настройки|Демо-капитал|Выберите язык|Его можно сменить в любой момент кнопкой 🌐.|Поиск языка…|Продолжить|Другие языки (интерфейс на английском)|Рабочая станция|Чистый режим|Язык'],
    ['it', 'Italiano', 'Italian', '🇮🇹', 'Mercati|Mappa di calore|Bot e backtest|Portafoglio|Social|Area di lavoro|Diario|Sfide|Copilota IA|Laboratorio|Impostazioni|Capitale simulato|Scegli la tua lingua|Puoi cambiarla in qualsiasi momento con il pulsante 🌐.|Cerca lingue…|Continua|Altre lingue (interfaccia in inglese)|Postazione|Modalità pulita|Lingua'],
    ['tr', 'Türkçe', 'Turkish', '🇹🇷', 'Piyasalar|Isı haritası|Botlar ve geriye dönük test|Portföy|Sosyal|Çalışma alanı|Günlük|Meydan okumalar|Yapay zekâ yardımcısı|Laboratuvar|Ayarlar|Sanal sermaye|Dilinizi seçin|🌐 düğmesiyle istediğiniz zaman değiştirebilirsiniz.|Dil ara…|Devam|Diğer diller (İngilizce arayüz)|İş istasyonu|Sade mod|Dil'],
    ['vi', 'Tiếng Việt', 'Vietnamese', '🇻🇳', 'Thị trường|Bản đồ nhiệt|Bot & kiểm thử|Danh mục|Mạng xã hội|Không gian làm việc|Nhật ký|Thử thách|Trợ lý AI|Phòng thí nghiệm|Cài đặt|Vốn giấy|Chọn ngôn ngữ của bạn|Bạn có thể đổi bất cứ lúc nào bằng nút 🌐.|Tìm ngôn ngữ…|Tiếp tục|Ngôn ngữ khác (giao diện tiếng Anh)|Trạm làm việc|Chế độ gọn|Ngôn ngữ'],
    ['th', 'ไทย', 'Thai', '🇹🇭', 'ตลาด|แผนที่ความร้อน|บอทและแบ็กเทสต์|พอร์ตโฟลิโอ|โซเชียล|พื้นที่ทำงาน|บันทึกการเทรด|ความท้าทาย|ผู้ช่วย AI|แล็บ|การตั้งค่า|ทุนจำลอง|เลือกภาษาของคุณ|เปลี่ยนได้ทุกเมื่อด้วยปุ่ม 🌐|ค้นหาภาษา…|ดำเนินการต่อ|ภาษาอื่น ๆ (อินเทอร์เฟซภาษาอังกฤษ)|เวิร์กสเตชัน|โหมดสะอาดตา|ภาษา'],
    ['id', 'Bahasa Indonesia', 'Indonesian', '🇮🇩', 'Pasar|Peta panas|Bot & backtest|Portofolio|Sosial|Ruang kerja|Jurnal|Tantangan|Kopilot AI|Lab|Pengaturan|Ekuitas simulasi|Pilih bahasa Anda|Anda dapat mengubahnya kapan saja dengan tombol 🌐.|Cari bahasa…|Lanjutkan|Bahasa lain (antarmuka Inggris)|Stasiun kerja|Mode bersih|Bahasa'],
    ['ms', 'Bahasa Melayu', 'Malay', '🇲🇾', 'Pasaran|Peta haba|Bot & ujian balik|Portfolio|Sosial|Ruang kerja|Jurnal|Cabaran|Kopilot AI|Makmal|Tetapan|Ekuiti simulasi|Pilih bahasa anda|Anda boleh menukarnya bila-bila masa dengan butang 🌐.|Cari bahasa…|Teruskan|Lebih banyak bahasa (antara muka Inggeris)|Stesen kerja|Mod bersih|Bahasa'],
    ['pl', 'Polski', 'Polish', '🇵🇱', 'Rynki|Mapa cieplna|Boty i backtest|Portfel|Społeczność|Obszar roboczy|Dziennik|Wyzwania|Asystent AI|Laboratorium|Ustawienia|Kapitał wirtualny|Wybierz język|Możesz go zmienić w każdej chwili przyciskiem 🌐.|Szukaj języka…|Dalej|Więcej języków (interfejs angielski)|Stacja robocza|Tryb czysty|Język'],
    ['nl', 'Nederlands', 'Dutch', '🇳🇱', 'Markten|Heatmap|Bots & backtest|Portefeuille|Sociaal|Werkruimte|Dagboek|Uitdagingen|AI-copiloot|Lab|Instellingen|Papierkapitaal|Kies je taal|Je kunt dit altijd wijzigen met de 🌐-knop.|Talen zoeken…|Doorgaan|Meer talen (Engelse interface)|Werkstation|Schone modus|Taal'],
    ['sv', 'Svenska', 'Swedish', '🇸🇪', 'Marknader|Värmekarta|Botar & backtest|Portfölj|Socialt|Arbetsyta|Dagbok|Utmaningar|AI-copilot|Labb|Inställningar|Papperskapital|Välj ditt språk|Du kan ändra det när som helst med 🌐-knappen.|Sök språk…|Fortsätt|Fler språk (engelskt gränssnitt)|Arbetsstation|Rent läge|Språk'],
    ['uk', 'Українська', 'Ukrainian', '🇺🇦', 'Ринки|Теплова карта|Боти та бектест|Портфель|Соцмережі|Робоча область|Журнал|Виклики|ШІ-помічник|Лабораторія|Налаштування|Демо-капітал|Оберіть мову|Її можна змінити будь-коли кнопкою 🌐.|Пошук мови…|Продовжити|Інші мови (англійський інтерфейс)|Робоча станція|Чистий режим|Мова'],
    ['bn', 'বাংলা', 'Bengali', '🇧🇩', 'বাজার|হিট ম্যাপ|বট ও ব্যাকটেস্ট|পোর্টফোলিও|সোশ্যাল|ওয়ার্কস্পেস|জার্নাল|চ্যালেঞ্জ|AI কোপাইলট|ল্যাব|সেটিংস|পেপার ইকুইটি|আপনার ভাষা বেছে নিন|🌐 বোতাম দিয়ে যেকোনো সময় পরিবর্তন করতে পারবেন।|ভাষা খুঁজুন…|চালিয়ে যান|আরও ভাষা (ইংরেজি ইন্টারফেস)|ওয়ার্কস্টেশন|ক্লিন মোড|ভাষা'],
    ['ur', 'اردو', 'Urdu', '🇵🇰', 'مارکیٹس|ہیٹ میپ|بوٹس اور بیک ٹیسٹ|پورٹ فولیو|سوشل|ورک اسپیس|جرنل|چیلنجز|AI معاون|لیب|ترتیبات|فرضی سرمایہ|اپنی زبان منتخب کریں|آپ اسے کسی بھی وقت 🌐 بٹن سے بدل سکتے ہیں۔|زبانیں تلاش کریں…|جاری رکھیں|مزید زبانیں (انگریزی انٹرفیس)|ورک اسٹیشن|صاف موڈ|زبان'],
    ['fa', 'فارسی', 'Persian', '🇮🇷', 'بازارها|نقشه حرارتی|ربات‌ها و بک‌تست|سبد دارایی|اجتماعی|فضای کار|ژورنال|چالش‌ها|دستیار هوش مصنوعی|آزمایشگاه|تنظیمات|سرمایه آزمایشی|زبان خود را انتخاب کنید|می‌توانید هر زمان با دکمه 🌐 آن را تغییر دهید.|جستجوی زبان…|ادامه|زبان‌های بیشتر (رابط انگلیسی)|ایستگاه کاری|حالت تمیز|زبان'],
    ['he', 'עברית', 'Hebrew', '🇮🇱', 'שווקים|מפת חום|בוטים ובקטסט|תיק השקעות|חברתי|סביבת עבודה|יומן|אתגרים|עוזר AI|מעבדה|הגדרות|הון וירטואלי|בחרו שפה|אפשר לשנות בכל עת בכפתור 🌐.|חיפוש שפה…|המשך|שפות נוספות (ממשק באנגלית)|תחנת עבודה|מצב נקי|שפה'],
    ['el', 'Ελληνικά', 'Greek', '🇬🇷', 'Αγορές|Θερμικός χάρτης|Bots & backtest|Χαρτοφυλάκιο|Κοινωνικά|Χώρος εργασίας|Ημερολόγιο|Προκλήσεις|Βοηθός AI|Εργαστήριο|Ρυθμίσεις|Εικονικό κεφάλαιο|Επιλέξτε γλώσσα|Μπορείτε να την αλλάξετε οποτεδήποτε με το κουμπί 🌐.|Αναζήτηση γλώσσας…|Συνέχεια|Περισσότερες γλώσσες (αγγλική διεπαφή)|Σταθμός εργασίας|Καθαρή λειτουργία|Γλώσσα'],
    ['cs', 'Čeština', 'Czech', '🇨🇿', 'Trhy|Teplotní mapa|Boti a backtest|Portfolio|Sociální|Pracovní plocha|Deník|Výzvy|AI kopilot|Laboratoř|Nastavení|Fiktivní kapitál|Vyberte jazyk|Můžete jej kdykoli změnit tlačítkem 🌐.|Hledat jazyk…|Pokračovat|Další jazyky (anglické rozhraní)|Pracovní stanice|Čistý režim|Jazyk'],
    ['ro', 'Română', 'Romanian', '🇷🇴', 'Piețe|Hartă termică|Boți și backtest|Portofoliu|Social|Spațiu de lucru|Jurnal|Provocări|Copilot AI|Laborator|Setări|Capital simulat|Alegeți limba|O puteți schimba oricând cu butonul 🌐.|Căutați limba…|Continuă|Mai multe limbi (interfață în engleză)|Stație de lucru|Mod curat|Limbă'],
    ['hu', 'Magyar', 'Hungarian', '🇭🇺', 'Piacok|Hőtérkép|Botok és visszatesztelés|Portfólió|Közösség|Munkaterület|Napló|Kihívások|AI segéd|Labor|Beállítások|Papírtőke|Válassz nyelvet|Bármikor módosíthatod a 🌐 gombbal.|Nyelv keresése…|Tovább|További nyelvek (angol felület)|Munkaállomás|Tiszta mód|Nyelv'],
    ['fil', 'Filipino / Tagalog', 'Filipino', '🇵🇭', 'Mga Merkado|Heat Map|Mga Bot at Backtest|Portfolio|Social|Workspace|Journal|Mga Hamon|AI Copilot|Lab|Mga Setting|Paper equity|Piliin ang iyong wika|Mapapalitan mo ito anumang oras gamit ang 🌐 na button.|Maghanap ng wika…|Magpatuloy|Iba pang wika (Ingles na interface)|Workstation|Malinis na mode|Wika'],
    ['sw', 'Kiswahili', 'Swahili', '🇰🇪', 'Masoko|Ramani ya joto|Boti na majaribio|Jalada|Kijamii|Eneo la kazi|Shajara|Changamoto|Msaidizi wa AI|Maabara|Mipangilio|Mtaji wa majaribio|Chagua lugha yako|Unaweza kuibadilisha wakati wowote kwa kitufe cha 🌐.|Tafuta lugha…|Endelea|Lugha zaidi (kiolesura cha Kiingereza)|Kituo cha kazi|Hali safi|Lugha'],
  ];
  I.RTL = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug', 'dv', 'ku']);
  I.LANGS = RAW.map(([code, native, english, flag]) => ({ code, native, english, flag, rtl: I.RTL.has(code.split('-')[0]) }));
  I.DICT = Object.fromEntries(RAW.map(([code, , , , s]) => [code, Object.fromEntries(s.split('|').map((v, k) => [I.KEYS[k], v]))]));
  // every ISO-639-1 code: selectable, English text, native name from Intl.DisplayNames where the runtime has it
  I.ISO = 'aa ab ae af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'.split(' ');
  const NAMED = new Map(I.LANGS.map((l) => [l.code, l]));
  const dn = (loc, code) => { try { return new Intl.DisplayNames([loc], { type: 'language' }).of(code) || code; } catch (e) { return code; } };
  let extra = null;
  I.extra = () => extra || (extra = I.ISO.filter((c) => !NAMED.has(c) && c !== 'zh' && c !== 'tl').map((c) => ({ code: c, native: dn(c, c), english: dn('en', c), flag: '🌐', rtl: I.RTL.has(c), fallback: true })));
  I.isRtl = (code) => I.RTL.has(String(code || '').split('-')[0]);
  I.norm = (code) => {
    const s = String(code || ''); if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(s)) return null;
    const [b, r = ''] = s.split('-'), base = b.toLowerCase(), R = r.toUpperCase();
    if (base === 'zh') return ['TW', 'HK', 'MO', 'HANT'].includes(R) ? 'zh-TW' : 'zh-CN';
    if (base === 'tl') return 'fil';
    if (NAMED.has(base)) return base; return I.ISO.includes(base) ? base : null;
  };
  I.tr = (lang, key) => { const d = I.DICT[lang]; return (d && d[key]) || I.DICT.en[key] || key; };
  const lev = (a, b) => { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; };
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  /* fuzzy search: exact code, then prefix, then substring, then ≤ 2 typos against a name prefix */
  I.search = (q, withExtra = true) => {
    const all = withExtra ? I.LANGS.concat(I.extra()) : I.LANGS, s = fold(q).trim(); if (!s) return I.LANGS.slice();
    const out = [];
    all.forEach((l, idx) => {
      const names = [fold(l.native), fold(l.english), l.code.toLowerCase()]; let sc = null;
      if (l.code.toLowerCase() === s) sc = 0; else if (names.some((n) => n.startsWith(s) || n.split(/[\s()/]+/).some((w) => w && w.startsWith(s)))) sc = 1; else if (names.some((n) => n.includes(s))) sc = 2;
      else if (s.length >= 4) { const d = Math.min(...names.slice(0, 2).map((n) => Math.min(lev(s, n.slice(0, s.length)), lev(s, n)))); if (d <= 2) sc = 3 + d; }
      if (sc != null) out.push({ l, sc, idx });
    });
    return out.sort((a, b) => a.sc - b.sc || a.idx - b.idx).map((x) => x.l);
  };

  /* ══ browser: current language, live DOM translation, gate modal, header pill ══ */
  I.cur = () => { const c = typeof ST !== 'undefined' && ST && ST.settings ? I.norm(ST.settings.lang) : null; return c || 'en'; };
  I.t = (key) => I.tr(I.cur(), key);
  I.label = (code) => (NAMED.get(code) || I.extra().find((x) => x.code === code) || { native: code }).native;
  I.apply = () => {
    if (typeof document === 'undefined') return; const c = I.cur(), h = document.documentElement;
    h.lang = c; h.dir = I.isRtl(c) ? 'rtl' : 'ltr'; document.body.classList.toggle('rtl', I.isRtl(c));
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = I.t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-ph]')) el.setAttribute('placeholder', I.t(el.dataset.i18nPh));
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.setAttribute('title', I.t(el.dataset.i18nTitle));
    const p = document.getElementById('btnLang'); if (p) { p.textContent = '🌐 ' + (c === 'zh-TW' ? 'ZH-TW' : c.split('-')[0].toUpperCase()); p.setAttribute('aria-label', I.t('lang.label') + ': ' + I.label(c)); }
  };
  I.set = (code) => {
    const c = I.norm(code); if (!c || typeof ST === 'undefined') return false;
    ST.settings.lang = c; saveState(); I.apply(); return true;
  };
  const guess = () => { for (const l of (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || []) { const c = I.norm(l); if (c) return c; } return 'en'; };
  const card = (l, on) => `<button type="button" class="lg-card${on ? ' on' : ''}${l.fallback ? ' fb' : ''}" data-lang="${esc(l.code)}" role="option" aria-selected="${on}" lang="${esc(l.code)}" dir="${l.rtl ? 'rtl' : 'ltr'}"><span class="lg-flag" aria-hidden="true">${esc(l.flag)}</span><b>${esc(l.native)}</b><span class="note">${esc(l.english)}</span></button>`;
  /* first: shown on a first launch (no language saved yet): Esc / Continue picks the highlighted language */
  I.gate = (first = false) => {
    const old = document.getElementById('langGate'); if (old) old.remove();
    let pick = first ? guess() : I.cur(); const tx = (k) => I.tr(pick, k);
    const ov = document.createElement('div'); ov.id = 'langGate'; ov.className = 'lg-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'lgTitle');
    ov.innerHTML = `<div class="lg-card-wrap"><div class="lg-head"><span class="lg-mark" aria-hidden="true">${typeof V151 !== 'undefined' ? V151.markSvg(40, 'lg') : ''}</span><div><h2 id="lgTitle"></h2><div class="note" id="lgSub"></div></div></div>
      <input class="in lg-q" id="lgQ" type="search" autocomplete="off" spellcheck="false"><div class="lg-grid" id="lgGrid" role="listbox" aria-label="Languages"></div>
      <div class="row lg-foot"><span class="note" id="lgMore"></span><span class="sp"></span><button type="button" class="btn pri" id="lgGo"></button></div></div>`;
    document.body.appendChild(ov);
    const q = ov.querySelector('#lgQ'), grid = ov.querySelector('#lgGrid');
    const paint = () => {
      ov.querySelector('#lgTitle').textContent = tx('gate.title'); ov.querySelector('#lgSub').textContent = tx('gate.sub'); q.placeholder = tx('gate.search'); q.setAttribute('aria-label', tx('gate.search'));
      ov.querySelector('#lgGo').textContent = tx('gate.go'); ov.querySelector('#lgMore').textContent = q.value.trim() ? '' : tx('gate.more') + ': ' + I.extra().length + '+';
      const list = q.value.trim() ? I.search(q.value).slice(0, 60) : I.LANGS; grid.innerHTML = list.map((l) => card(l, l.code === pick)).join('') || '<div class="note">–</div>';
      ov.dir = I.isRtl(pick) ? 'rtl' : 'ltr';
    };
    const done = (code) => { I.set(code || pick); ov.remove(); document.removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(first ? pick : I.cur()); } else if (e.key === 'Enter' && document.activeElement === q) { const f = grid.querySelector('[data-lang]'); if (f) done(f.dataset.lang); } };
    grid.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (!b) return; if (pick === b.dataset.lang) return done(pick); pick = b.dataset.lang; paint(); });
    grid.addEventListener('dblclick', (e) => { const b = e.target.closest('[data-lang]'); if (b) done(b.dataset.lang); });
    ov.querySelector('#lgGo').addEventListener('click', () => done(pick));
    q.addEventListener('input', paint); document.addEventListener('keydown', key, true);
    paint(); setTimeout(() => q.focus(), 30); return ov;
  };
  I.start = () => {
    const p = document.getElementById('btnLang'); if (p) p.addEventListener('click', () => I.gate(false));
    let force = false; try { force = localStorage.getItem('nt.forceGate') === '1'; } catch (e) { /* storage blocked */ }
    I.apply();
    if (!I.norm(ST.settings.lang) && (!navigator.webdriver || force)) I.gate(true); // tests opt in; real first launches always see it
  };
  return I;
})();
if (typeof module === 'object' && module.exports) module.exports = I18N;
else if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof loadState === 'function') { // ST is loaded at the top of boot(): show the gate right after that, before the network part of boot
  const _ls = loadState; loadState = function () { const r = _ls.apply(this, arguments); if (!I18N.started) { I18N.started = true; setTimeout(() => { try { I18N.start(); } catch (e) { console.warn('i18n', e); } }, 0); } return r; };
}
