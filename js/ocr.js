// ============================================================
// LECTOR DE COMPROBANTES (OCR) — corre 100 % en el navegador del administrador.
// La imagen NO se sube ni se guarda: se lee, se extraen los datos y se descarta.
// Motor: Tesseract.js (se descarga la primera vez que se usa, ~5 MB).
// Los datos detectados son una sugerencia: el administrador los revisa antes de guardar.
// ============================================================

const Ocr = {
  _loading: null,

  load() {
    if (window.Tesseract) return Promise.resolve();
    if (!this._loading) {
      this._loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = resolve;
        s.onerror = () => { this._loading = null; reject(new Error('No se pudo cargar el lector de comprobantes (¿hay internet?)')); };
        document.head.appendChild(s);
      });
    }
    return this._loading;
  },

  // Devuelve el texto de la imagen. onProgress(0..1)
  async read(file, onProgress) {
    await this.load();
    const image = await resizeImage(file, 2000, 0.92);
    const worker = await Tesseract.createWorker('spa', 1, {
      logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); }
    });
    try {
      // PSM 4 = "una columna de texto de tamaños variables": el formato típico de un comprobante
      // (el modo por defecto suele saltearse el monto, que viene en letra grande)
      await worker.setParameters({ tessedit_pageseg_mode: '4' });
      const { data } = await worker.recognize(image);
      return data.text || '';
    } finally {
      await worker.terminate();
    }
  },

  // ----------------------------------------------------------
  // Extracción de datos: fecha y hora, nº de comprobante, banco,
  // nombre y cuenta de quien paga, monto.
  // ----------------------------------------------------------
  BANKS: [
    // Argentina
    ['Mercado Pago', /mercado\s*pago/], ['Banco Nación', /banco\s+(de\s+la\s+)?naci[oó]n\b|\bbna\b/], ['Cuenta DNI', /cuenta\s*dni/],
    ['Banco Provincia', /banco\s+provincia|bapro/], ['Galicia', /galicia/], ['Santander', /santander/], ['BBVA', /bbva|franc[eé]s/],
    ['Macro', /\bmacro\b/], ['Brubank', /brubank/], ['Ualá', /ual[aá]/], ['Naranja X', /naranja\s*x/], ['ICBC', /\bicbc\b/],
    ['HSBC', /\bhsbc\b/], ['Credicoop', /credicoop/], ['Banco Patagonia', /patagonia/], ['Supervielle', /supervielle/],
    ['Banco Ciudad', /banco\s+ciudad/], ['Hipotecario', /hipotecario/], ['Comafi', /comafi/], ['Personal Pay', /personal\s*pay/],
    ['Lemon', /\blemon\b/], ['Prex', /\bprex\b/], ['Modo', /\bmodo\b/],
    // Bolivia
    ['Banco Unión', /banco\s+uni[oó]n/], ['BNB', /banco\s+nacional\s+de\s+bolivia|\bbnb\b/], ['Mercantil Santa Cruz', /mercantil/],
    ['BCP', /banco\s+de\s+cr[eé]dito|\bbcp\b/], ['Banco Bisa', /\bbisa\b/], ['Banco Económico', /banco\s+econ[oó]mico/],
    ['Banco Ganadero', /ganadero/], ['Banco FIE', /\bfie\b/], ['BancoSol', /banco\s*sol\b/], ['Banco Fortaleza', /fortaleza/],
    ['Prodem', /prodem/], ['Tigo Money', /tigo\s*money/], ['Banco PyME', /banco\s+pyme/], ['Yape', /\byape\b/]
  ],

  MONTHS: { ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6,
            jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10,
            nov: 11, noviembre: 11, dic: 12, diciembre: 12 },

  parse(text) {
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const lines = text.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const low = lines.map(norm);
    const all = low.join('\n');
    const pad = n => String(n).padStart(2, '0');
    const out = {};

    // Valor de un campo: lo que sigue al ":" o a la palabra clave, o la línea siguiente
    const valueAfter = (i, keyRe) => {
      const m = lines[i].match(/[:\-–]\s*(.+)$/);
      if (m && m[1].trim()) return m[1].trim();
      const rest = lines[i].replace(new RegExp(keyRe.source, 'i'), '').replace(/^[\s:.\-–]+/, '').trim();
      if (rest.length >= 3) return rest;
      return lines[i + 1] || '';
    };
    const findLine = re => low.findIndex(l => re.test(l));

    // Fecha
    let d = null, m;
    if ((m = all.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/))) {
      d = { day: +m[1], month: +m[2], year: +m[3] < 100 ? 2000 + +m[3] : +m[3] };
    } else if ((m = all.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
      d = { year: +m[1], month: +m[2], day: +m[3] };
    } else if ((m = all.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?\s*(?:de\s+|del\s+)?(\d{4})\b/)) && this.MONTHS[m[2]]) {
      d = { day: +m[1], month: this.MONTHS[m[2]], year: +m[3] };
    }
    const t = all.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/);
    if (d && d.month >= 1 && d.month <= 12 && d.day >= 1 && d.day <= 31) {
      let hh = t ? +t[1] : 0;
      const ap = t && t[3] ? t[3][0] : '';
      if (ap === 'p' && hh < 12) hh += 12;
      if (ap === 'a' && hh === 12) hh = 0;
      out.datetime = `${d.year}-${pad(d.month)}-${pad(d.day)}T${pad(hh)}:${t ? t[2] : '00'}`;
    }

    // Nº de comprobante / transacción / operación
    const refKey = /(n[°ºo]\.?|nro\.?|numero|n[uú]mero|codigo|id|cod\.?)?\s*(de\s+)?(transaccion|operacion|comprobante|referencia|control|orden)/;
    const tokenRe = /\b([a-z0-9][a-z0-9\-]{4,})\b/gi;
    for (let i = 0; i < low.length && !out.reference; i++) {
      if (!refKey.test(low[i])) continue;
      const candidates = [valueAfter(i, refKey), lines[i + 1] || ''];
      for (const c of candidates) {
        const tok = [...c.matchAll(tokenRe)].map(x => x[1]).find(x => (x.match(/\d/g) || []).length >= 4 && !/^\d{1,2}[\/\-]/.test(x));
        if (tok) { out.reference = tok.toUpperCase(); break; }
      }
    }
    if (!out.reference) {
      const nums = (all.match(/\b\d{8,24}\b/g) || []).sort((a, b) => b.length - a.length);
      if (nums[0]) out.reference = nums[0];
    }

    // Banco o billetera: el primero que aparece en el texto
    let best = null;
    for (const [name, re] of this.BANKS) {
      const pos = all.search(re);
      if (pos >= 0 && (!best || pos < best.pos)) best = { name, pos };
    }
    if (best) out.bank = best.name;

    // Nombre de quien paga
    const nameKey = /(ordenante|titular(\s+de\s+(la\s+)?cuenta)?(\s+origen)?|remitente|enviado\s+por|pagador|nombre\s+del?\s+(ordenante|titular|remitente|pagador)|de\s*:|desde\s*:|^de$|^desde$|origen\s*:?$)/;
    const ni = findLine(nameKey);
    if (ni >= 0) {
      const v = valueAfter(ni, nameKey).replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.]/g, ' ').replace(/\s+/g, ' ').trim();
      if (v.split(' ').filter(w => w.length > 1).length >= 2) out.payer_name = v.toUpperCase();
    }

    // Cuenta de quien paga (CBU/CVU, nº de cuenta, puede venir enmascarada ****1234)
    const accKey = /(cuenta(\s+de)?(\s+origen)?|cbu|cvu|caja\s+de\s+ahorro|cuenta\s+corriente|nro\.?\s+de\s+cuenta|n[°º]\s+de\s+cuenta)/;
    const accIdx = ni >= 0 ? low.findIndex((l, i) => i >= ni && accKey.test(l)) : -1;
    const ai = accIdx >= 0 ? accIdx : findLine(accKey);
    if (ai >= 0) {
      const src = valueAfter(ai, accKey) + ' ' + (lines[ai + 1] || '');
      const acc = src.match(/[\d*xX•][\d*xX•\s\-]{3,}\d/);
      if (acc && (acc[0].match(/\d/g) || []).length >= 4) out.payer_account = acc[0].replace(/\s+/g, '');
    }

    // Monto
    const amtKey = /(monto|importe|total|valor|transferiste|pagaste|enviaste)/;
    const moneyRe = /(?:\$|bs\.?|ars|bob|usd)?\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i;
    const toNumber = s => {
      s = s.replace(/\s/g, '');
      if (/,\d{1,2}$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
      return Number(s.replace(/,/g, ''));
    };
    for (let i = 0; i < low.length && out.amount == null; i++) {
      if (!amtKey.test(low[i])) continue;
      const mm = (valueAfter(i, amtKey) + ' ' + (lines[i + 1] || '')).match(moneyRe);
      if (mm) out.amount = toNumber(mm[1]);
    }
    if (out.amount == null) {
      const mm = all.match(/(?:\$|bs\.?)\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/);
      if (mm) out.amount = toNumber(mm[1]);
    }
    if (!(out.amount > 0)) delete out.amount;

    return out;
  }
};
