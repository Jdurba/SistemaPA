// ===================================================================
// PDF PA CORREDERA VIDRIO MONTADA  —  Generador nativo jsPDF
// -------------------------------------------------------------------
// Reemplaza la versión basada en html2canvas (PDFs de 15-56 MB).
// Recorre el DOM de #informe-container y #hoja-pedido-container y
// los dibuja como páginas A4 con texto real, ~1 MB y sin distorsiones.
//
// Método importado de SalidaPDF-Abatible.js, adaptado a la estructura
// más simple de PAMontada (sin .pagina-informe, sin sangrías N3/N3.1,
// sin titulo-elemento ni linea-resumen).
// ===================================================================

(function () {
  'use strict';

  // ── DIMENSIONES Y COLORES ───────────────────────────────────────
  const W = 210;            // A4 ancho mm
  const H = 297;            // A4 alto mm
  const M = 15;             // margen interior 15mm
  const CW = W - 2 * M;     // ancho útil de contenido = 180mm
  const Y_LIMITE = H - M;   // límite vertical para salto de página
  // Sangría sólo de las tablas (CSS pantalla: .tabla-informe { margin-left: 100px })
  // 100px / (820px ancho útil pantalla) × 180mm ≈ 22mm
  const SANGRIA_TABLA = 22;

  const COLOR_AZUL_CORP    = [26, 43, 111];     // #1a2b6f
  const COLOR_GRIS_CLARO   = [232, 232, 232];   // #e8e8e8  (bloque-titulo)
  const COLOR_GRIS_TH      = [229, 231, 235];   // #e5e7eb  (TH tablas)
  const COLOR_GRIS_FRANJA  = [136, 136, 136];   // #888     (franja bloque-titulo)
  const COLOR_GRIS_BORDE   = [153, 153, 153];   // #999
  const COLOR_GRIS_LABEL   = [85, 85, 85];      // #555
  const COLOR_GRIS_LINEA   = [153, 153, 153];   // #999
  const COLOR_TEXTO        = [33, 33, 33];      // #212121

  // ── CACHÉ DE IMÁGENES ───────────────────────────────────────────
  const cacheImagenes = new Map();

  function cargarImagenComoData(url) {
    if (cacheImagenes.has(url)) return cacheImagenes.get(url);
    const esSVG = /\.svg(\?|$)/i.test(url);
    const promesa = esSVG ? cargarSVGComoData(url) : cargarBitmapComoData(url);
    cacheImagenes.set(url, promesa);
    return promesa;
  }

  function cargarBitmapComoData(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight
          });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function cargarSVGComoData(url) {
    try {
      const respuesta = await fetch(url);
      if (!respuesta.ok) return null;
      let svgText = await respuesta.text();

      const m = svgText.match(/viewBox\s*=\s*["']([^"']+)["']/i);
      let vbW = 0, vbH = 0;
      if (m) {
        const partes = m[1].trim().split(/[\s,]+/).map(Number);
        if (partes.length === 4) { vbW = partes[2]; vbH = partes[3]; }
      }
      if (!vbW || !vbH) { vbW = 300; vbH = 100; }

      if (!/<svg[^>]*\swidth\s*=/i.test(svgText)) {
        svgText = svgText.replace(/<svg\b/i, `<svg width="${vbW}" height="${vbH}"`);
      }

      const escala = 3;
      const canvasW = Math.round(vbW * escala);
      const canvasH = Math.round(vbH * escala);

      const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);

      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = canvasW;
          canvas.height = canvasH;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvasW, canvasH);
          URL.revokeObjectURL(blobUrl);
          try {
            resolve({
              dataUrl: canvas.toDataURL('image/png'),
              naturalWidth: vbW,
              naturalHeight: vbH
            });
          } catch { resolve(null); }
        };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
        img.src = blobUrl;
      });
    } catch {
      return null;
    }
  }

  function fitImageInBox(natW, natH, maxW, maxH) {
    const ratio = Math.min(maxW / natW, maxH / natH);
    const w = natW * ratio;
    const h = natH * ratio;
    return { w, h, offsetX: (maxW - w) / 2, offsetY: (maxH - h) / 2 };
  }

  // ── UTILIDADES DOM ──────────────────────────────────────────────
  function visible(el) {
    if (!el) return false;
    return window.getComputedStyle(el).display !== 'none';
  }

  function txt(el) {
    if (!el) return '';
    return (el.textContent || '')
      .trim()
      .replace(/\s+/g, ' ')
      // Helvetica de jsPDF sólo soporta WinAnsi → sustituir caracteres comunes fuera del set
      .replace(/→/g, '»')
      .replace(/←/g, '«')
      .replace(/↑/g, '^')
      .replace(/↓/g, 'v')
      .replace(/⪡/g, '«')
      .replace(/⪢/g, '»');
  }

  function truncarTexto(pdf, texto, anchoMaxMM) {
    if (!texto) return '';
    if (pdf.getTextWidth(texto) <= anchoMaxMM) return texto;
    let t = texto;
    while (t.length > 1 && pdf.getTextWidth(t + '…') > anchoMaxMM) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  // ── PRIMITIVAS DE DIBUJO ────────────────────────────────────────

  // Header: logo + título + Cliente/Nº Pedido/Fecha + Comentarios
  async function dibujarHeader(pdf, contenedor, h1Default) {
    let y = M;

    // Logo + Título
    const logoEl = contenedor.querySelector('.informe-header-logo');
    const logoData = logoEl ? await cargarImagenComoData(logoEl.src) : null;

    const logoH = 13;
    const logoBoxW = 36;
    if (logoData && logoData.naturalWidth > 0) {
      const fit = fitImageInBox(logoData.naturalWidth, logoData.naturalHeight, logoBoxW, logoH);
      pdf.addImage(logoData.dataUrl, 'PNG',
        M + (logoBoxW - fit.w) / 2,
        y + (logoH - fit.h) / 2,
        fit.w, fit.h);
    }

    const h1 = txt(contenedor.querySelector('.informe-header h1')) || h1Default;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...COLOR_AZUL_CORP);
    // Centrar el título en el espacio a la derecha del logo (no en el centro de la página)
    const xLogoFin = M + logoBoxW;
    const gapLogoTitulo = 12;
    const xTituloIni = xLogoFin + gapLogoTitulo;
    const xTituloCentro = xTituloIni + (W - M - xTituloIni) / 2;
    pdf.text(h1.toUpperCase(), xTituloCentro, y + logoH / 2 + 1.5, { align: 'center' });

    y += logoH + 4;

    // Cliente (flex 2) / Nº Pedido (flex 1) / Fecha (flex 1)
    const totalFlex = 4;
    const wCliente = (CW - 12) * (2 / totalFlex);
    const wPedido  = (CW - 12) * (1 / totalFlex);
    const wFecha   = (CW - 12) * (1 / totalFlex);

    const cliente = txt(contenedor.querySelector('[id$="-cliente"]'));
    const pedido  = txt(contenedor.querySelector('[id$="-num-pedido"]'));
    const fecha   = txt(contenedor.querySelector('[id$="-fecha"]'));

    let xCampo = M;
    dibujarCampoFormulario(pdf, xCampo, y, wCliente, 'Cliente:', cliente);
    xCampo += wCliente + 6;
    dibujarCampoFormulario(pdf, xCampo, y, wPedido,  'Nº Pedido:', pedido);
    xCampo += wPedido + 6;
    dibujarCampoFormulario(pdf, xCampo, y, wFecha,   'Fecha:', fecha);

    y += 7;

    // Comentarios — busca tanto inf-comentarios como hp-Comentarios
    const comentarios =
      txt(contenedor.querySelector('[id$="-comentarios"], [id$="-Comentarios"]'));
    const version = txt(contenedor.querySelector('[id$="-version"]')) || '';
    const anchoVer = version ? pdf.getTextWidth(version) + 6 : 0;
    dibujarCampoFormulario(pdf, M, y, CW - anchoVer, 'Comentarios:', comentarios);
    if (version) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(154, 154, 154);
      pdf.text(version, W - M, y + 4, { align: 'right' });
    }
    y += 9;

    // Línea inferior azul (separación con el cuerpo)
    pdf.setDrawColor(...COLOR_AZUL_CORP);
    pdf.setLineWidth(0.4);
    pdf.line(M, y, W - M, y);
    y += 4;

    return y;
  }

  function dibujarCampoFormulario(pdf, x, y, ancho, label, valor) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLOR_GRIS_LABEL);
    pdf.text(label, x, y + 4);

    const anchoLabel = pdf.getTextWidth(label) + 1.5;
    const valorX = x + anchoLabel + 1;
    const valorAncho = ancho - anchoLabel - 2;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLOR_TEXTO);
    if (valor) {
      pdf.text(truncarTexto(pdf, valor, valorAncho), valorX, y + 4);
    }

    pdf.setDrawColor(...COLOR_GRIS_LINEA);
    pdf.setLineWidth(0.2);
    pdf.line(valorX, y + 5, x + ancho, y + 5);
  }

  // bloque-titulo: fondo gris claro + franja izquierda + texto negro
  function dibujarBloqueTitulo(pdf, x, y, ancho, texto) {
    const alto = 6.5;
    const franja = 1;

    pdf.setFillColor(...COLOR_GRIS_FRANJA);
    pdf.rect(x, y, franja, alto, 'F');
    pdf.setFillColor(...COLOR_GRIS_CLARO);
    pdf.rect(x + franja, y, ancho - franja, alto, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...COLOR_TEXTO);
    pdf.text(texto, x + franja + 3, y + alto / 2 + 1.4);

    return y + alto + 3;
  }

  // seccion-titulo: texto plano (Perfiles Acabado: X / Medidas de Cristales - Color: Y)
  function dibujarSeccionTitulo(pdf, x, y, texto) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(60, 60, 60);
    pdf.text(texto, x, y + 3);
    return y + 5;
  }

  // Texto destacado (mensaje-opcion / hp-Titulo) — bold negro 11pt
  function dibujarTextoDestacado(pdf, x, y, texto, ancho) {
    if (!texto) return y;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...COLOR_TEXTO);
    const lineas = pdf.splitTextToSize(texto, ancho);
    lineas.forEach((linea, i) => {
      pdf.text(linea, x, y + 4 + i * 5);
    });
    return y + 4 + lineas.length * 5 + 2;
  }

  // ── DIBUJAR TABLA ───────────────────────────────────────────────
  // 3 pasadas (fondos → bordes → contenidos) por bug jsPDF 2.5.1
  // Altura de fila dinámica, omisión inteligente de columna sin precios
  async function dibujarTabla(pdf, x, y, anchosCol, headerThs, bodyRows, opciones = {}) {
    const {
      omitirColIdx = -1,
      alturaFilaMin = 5.5,
      alturaHeader = 6,
      fontSizeBody = 8,
      fontSizeHeader = 7.5,
      lineHeight = 3.2
    } = opciones;

    // Filtrar columnas si se omite alguna; reparte el ancho omitido en la columna "Valor" (idx 2) si existe
    let cols = anchosCol.map((w, i) => ({ w, idx: i })).filter(c => c.idx !== omitirColIdx);
    if (omitirColIdx >= 0) {
      const wOmitido = anchosCol[omitirColIdx];
      const idxValor = cols.findIndex(c => c.idx === 2);
      if (idxValor >= 0) cols[idxValor].w += wOmitido;
      else cols.forEach(c => c.w += wOmitido / cols.length);
    }
    cols.forEach(c => c.w = Math.round(c.w * 100) / 100);

    // ── HEADER ──
    pdf.setFillColor(...COLOR_GRIS_TH);
    let xCursor = x;
    cols.forEach(c => {
      pdf.rect(xCursor, y, c.w, alturaHeader, 'F');
      xCursor += c.w;
    });
    pdf.setDrawColor(...COLOR_GRIS_BORDE);
    pdf.setLineWidth(0.2);
    xCursor = x;
    cols.forEach(c => {
      pdf.rect(xCursor, y, c.w, alturaHeader, 'D');
      xCursor += c.w;
    });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fontSizeHeader);
    pdf.setTextColor(...COLOR_TEXTO);
    xCursor = x;
    cols.forEach(c => {
      const th = headerThs[c.idx];
      const esColIcono = th && (th.classList.contains('imagen-perfil') || /^[^A-Za-z0-9]+$/.test(txt(th)));
      if (th && !esColIcono) {
        const headTxt = txt(th);
        if (headTxt) {
          pdf.text(truncarTexto(pdf, headTxt, c.w - 2),
            xCursor + c.w / 2, y + alturaHeader / 2 + 1.2, { align: 'center' });
        }
      }
      xCursor += c.w;
    });
    y += alturaHeader;

    // ── BODY ──
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(fontSizeBody);

    for (const fila of bodyRows) {
      if (!visible(fila)) continue;

      const celdas = Array.from(fila.children);
      const tieneImagen = celdas.some(td => td.querySelector('img'));

      // Construir mapa col-idx → { td, anchoEfectivo, primerCol } respetando colspan
      const tdPorCol = {};
      let colPos = 0;
      for (const td of celdas) {
        const span = parseInt(td.getAttribute('colspan') || '1', 10);
        const anchoEfectivo = cols
          .filter(c => c.idx >= colPos && c.idx < colPos + span)
          .reduce((sum, c) => sum + c.w, 0);
        for (let s = 0; s < span; s++) tdPorCol[colPos + s] = { td, anchoEfectivo, primerCol: colPos };
        colPos += span;
      }

      // FASE 1: medir
      const padding = 1.5;
      const contenidoCeldas = cols.map(c => {
        const entry = tdPorCol[c.idx];
        if (!entry) return { tipo: 'vacia' };
        const { td, anchoEfectivo, primerCol } = entry;
        if (c.idx !== primerCol) return { tipo: 'vacia' };
        const img = td.querySelector('img');
        if (img && img.src) return { tipo: 'imagen', src: img.src };
        const texto = txt(td);
        if (!texto) return { tipo: 'vacia' };
        const cls = td.className || '';
        const lineas = pdf.splitTextToSize(texto, anchoEfectivo - padding * 2);
        return { tipo: 'texto', lineas, cls, anchoEfectivo };
      });

      let altoFila = alturaFilaMin;
      if (tieneImagen) altoFila = Math.max(altoFila, 11);
      contenidoCeldas.forEach(cnt => {
        if (cnt.tipo === 'texto') {
          const altoNecesario = cnt.lineas.length * lineHeight + 2;
          if (altoNecesario > altoFila) altoFila = altoNecesario;
        }
      });

      // FASE 2: bordes — fusionar columnas del mismo colspan en un único rect
      pdf.setDrawColor(...COLOR_GRIS_BORDE);
      pdf.setLineWidth(0.2);
      xCursor = x;
      let i2 = 0;
      while (i2 < cols.length) {
        const c = cols[i2];
        const entry = tdPorCol[c.idx];
        // Calcular cuántas cols consecutivas comparten el mismo td (colspan)
        let spanCols = 1;
        if (entry) {
          while (
            i2 + spanCols < cols.length &&
            tdPorCol[cols[i2 + spanCols].idx] &&
            tdPorCol[cols[i2 + spanCols].idx].td === entry.td
          ) spanCols++;
        }
        const anchoRect = cols.slice(i2, i2 + spanCols).reduce((s, cc) => s + cc.w, 0);
        pdf.rect(xCursor, y, anchoRect, altoFila, 'D');
        xCursor += anchoRect;
        i2 += spanCols;
      }

      // FASE 3: contenidos
      pdf.setTextColor(...COLOR_TEXTO);
      xCursor = x;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const cnt = contenidoCeldas[i];

        if (cnt.tipo === 'imagen') {
          const imgData = await cargarImagenComoData(cnt.src);
          if (imgData && imgData.naturalWidth > 0) {
            const cajaW = Math.min(c.w - 1, 9);
            const cajaH = Math.min(altoFila - 1, 9);
            const fit = fitImageInBox(imgData.naturalWidth, imgData.naturalHeight, cajaW, cajaH);
            try {
              pdf.addImage(imgData.dataUrl, 'PNG',
                xCursor + (c.w - fit.w) / 2,
                y + (altoFila - fit.h) / 2,
                fit.w, fit.h);
            } catch (e) { /* imagen rota → ignorar */ }
          }
        } else if (cnt.tipo === 'texto') {
          const aw = cnt.anchoEfectivo || c.w;
          let align = 'center';
          let xText = xCursor + aw / 2;
          if (cnt.cls.includes('texto-izq'))      { align = 'left';  xText = xCursor + padding; }
          else if (cnt.cls.includes('texto-Der')) { align = 'right'; xText = xCursor + aw - padding; }

          const altoTotalTexto = cnt.lineas.length * lineHeight;
          const yPrimeraLinea = y + (altoFila - altoTotalTexto) / 2 + (lineHeight * 0.7);

          for (let li = 0; li < cnt.lineas.length; li++) {
            pdf.text(cnt.lineas[li], xText, yPrimeraLinea + li * lineHeight, { align });
          }
        }
        xCursor += c.w;
      }
      y += altoFila;
    }

    return y + 3;
  }

  // ── ANCHOS DE COLUMNA SEGÚN TIPO DE TABLA ──
  function calcularAnchos(headerThs, anchoTotal, esHojaPedido) {
    const ncol = headerThs.length;

    if (esHojaPedido && ncol === 5) {
      // [Código | Concepto | Valor | Cantidad | Precio €]
      const c1 = 28, c2 = 28, c4 = 18, c5 = 22;
      const c3 = anchoTotal - (c1 + c2 + c4 + c5);
      return [c1, c2, c3, c4, c5];
    }

    const tieneIcono = headerThs[0] && headerThs[0].classList.contains('imagen-perfil');

    if (ncol === 5 && tieneIcono) {
      // Perfiles puerta: [icono | tipo | longitud | cantidad | con retrac inf]
      const c1 = 13, c3 = 24, c4 = 18, c5 = 26;
      const c2 = anchoTotal - c1 - c3 - c4 - c5;
      return [c1, c2, c3, c4, c5];
    }
    if (ncol === 4 && tieneIcono) {
      // [icono | tipo | longitud | cantidad]
      const c1 = 13, c3 = 28, c4 = 22;
      const c2 = anchoTotal - c1 - c3 - c4;
      return [c1, c2, c3, c4];
    }
    if (ncol === 4) {
      // Cristales: [vidrio | alto | ancho | cantidad]
      const c2 = 30, c3 = 30, c4 = 24;
      const c1 = anchoTotal - c2 - c3 - c4;
      return [c1, c2, c3, c4];
    }
    if (ncol === 3) {
      // Embellecedor: [tipo | longitud | cantidad]
      const c2 = 32, c3 = 24;
      const c1 = anchoTotal - c2 - c3;
      return [c1, c2, c3];
    }
    return Array(ncol).fill(anchoTotal / ncol);
  }

  // ── SALTO DE PÁGINA AUTOMÁTICO ──
  // Si y supera el límite, añade página y devuelve y inicial tras cabecera mínima
  async function asegurarEspacio(pdf, y, alturaNecesaria, contextoHeader) {
    if (y + alturaNecesaria <= Y_LIMITE) return y;
    pdf.addPage();
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, W, H, 'F');
    return await dibujarHeader(pdf, contextoHeader.contenedor, contextoHeader.h1Default);
  }

  // ── RENDER DE UN CONTENEDOR (informe o hoja-pedido) ──
  async function dibujarContenedor(pdf, contenedor, h1Default, conPrecios) {
    let y = await dibujarHeader(pdf, contenedor, h1Default);
    const ctxHeader = { contenedor, h1Default };
    const esHojaPedido = contenedor.id === 'hoja-pedido-container';

    // Texto destacado bajo cabecera (mensaje-opcion en informe técnico, hp-Titulo en hoja pedido)
    const destacado =
      txt(contenedor.querySelector('#mensaje-opcion')) ||
      txt(contenedor.querySelector('#hp-Titulo'));
    if (destacado) {
      y = dibujarTextoDestacado(pdf, M, y, destacado, CW);
    }

    // Bloques visibles (.bloque-informe.active)
    const bloques = contenedor.querySelectorAll('.bloque-informe');
    for (const bloque of bloques) {
      if (!visible(bloque)) continue;
      y = await dibujarBloque(pdf, bloque, y, ctxHeader, esHojaPedido, conPrecios);
    }

    return y;
  }

  // Un .bloque-informe (puerta o fijo) — título + secciones + tablas
  async function dibujarBloque(pdf, divBloque, y, ctxHeader, esHojaPedido, conPrecios) {
    // Salto de página si el título no entra
    y = await asegurarEspacio(pdf, y, 12, ctxHeader);

    // Título del bloque y seccion-titulo: SIN sangría (CSS pantalla)
    // Tabla: sangría izquierda y derecha que reproducen la proporción del informe HTML
    // (en pantalla la tabla termina al ~88% del ancho útil → margen derecho efectivo ≈ 22mm)
    const xTabla = M + SANGRIA_TABLA;
    const wTabla = (W - M) - xTabla - 22;

    // Título del bloque
    const titEl = divBloque.querySelector(':scope > .bloque-titulo');
    if (titEl) {
      y = dibujarBloqueTitulo(pdf, M, y, CW, txt(titEl));
    }

    // Recorrer hijos en orden DOM
    const hijos = Array.from(divBloque.children);
    for (const hijo of hijos) {
      if (hijo === titEl) continue;
      if (!visible(hijo)) continue;

      const tag = hijo.tagName;
      const cls = hijo.className || '';

      if (cls.includes('seccion-titulo')) {
        y = await asegurarEspacio(pdf, y, 8, ctxHeader);
        y = dibujarSeccionTitulo(pdf, M, y, txt(hijo));
        continue;
      }

      if (tag === 'TABLE') {
        y = await asegurarEspacio(pdf, y, 18, ctxHeader);
        y = await dibujarTablaInforme(pdf, hijo, xTabla, y, wTabla, esHojaPedido, conPrecios);
        continue;
      }
    }

    return y + 2;
  }

  async function dibujarTablaInforme(pdf, tableEl, x, y, anchoTotal, esHojaPedido, conPrecios) {
    const headerThs = Array.from(tableEl.querySelectorAll('thead th'));
    const bodyRows = Array.from(tableEl.querySelectorAll('tbody tr'));
    if (headerThs.length === 0 || bodyRows.length === 0) return y;

    const anchosCol = calcularAnchos(headerThs, anchoTotal, esHojaPedido);
    // Hoja de pedido sin precios → omitir col idx 4 (Precio €)
    const omitirColIdx = (esHojaPedido && !conPrecios && anchosCol.length === 5) ? 4 : -1;

    return await dibujarTabla(pdf, x, y, anchosCol, headerThs, bodyRows, {
      omitirColIdx,
      alturaFilaMin: esHojaPedido ? 5 : 5.5,
      alturaHeader: 5.5,
      fontSizeBody: esHojaPedido ? 7.5 : 8,
      fontSizeHeader: 7,
      lineHeight: esHojaPedido ? 3 : 3.2
    });
  }

  // ── PUNTO DE ENTRADA ────────────────────────────────────────────
  async function generarPDF(conPrecios = true) {
    const idBoton = conPrecios ? 'btn-descargar-pdf' : 'btn-pdf-sin';
    const boton = document.getElementById(idBoton);
    const textoBoton = conPrecios ? '📄 PDF con precios' : '📄 PDF sin precios';

    try {
      if (boton) {
        boton.disabled = true;
        boton.textContent = '⏳ Generando PDF...';
      }

      const informe = document.getElementById('informe-container');
      const hojaPedido = document.getElementById('hoja-pedido-container');

      const informeVisible = informe && visible(informe);
      const hojaVisible = hojaPedido && visible(hojaPedido);

      if (!informeVisible && !hojaVisible) {
        alert('❌ No hay informe visible para generar PDF');
        return;
      }

      if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('❌ jsPDF no está cargado');
        return;
      }

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, W, H, 'F');

      let primero = true;

      if (informeVisible) {
        console.log('📄 Renderizando informe técnico...');
        await dibujarContenedor(pdf, informe, 'PA Corredera Vidrio · Hoja Fabricación', conPrecios);
        primero = false;
      }

      if (hojaVisible) {
        if (!primero) {
          pdf.addPage();
          pdf.setFillColor(255, 255, 255);
          pdf.rect(0, 0, W, H, 'F');
        }
        console.log('📄 Renderizando hoja de pedido...');
        await dibujarContenedor(pdf, hojaPedido, 'PA Corredera Vidrio · Hoja de Pedido', conPrecios);
      }

      // Nombre archivo
      const cliente =
        txt(informe?.querySelector('#inf-cliente')) ||
        txt(hojaPedido?.querySelector('#hp-cliente')) ||
        'informe';
      const fecha = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
      const sufijo = conPrecios ? 'con-precios' : 'sin-precios';
      const nombre = `PA-Corredera-Vidrio-${cliente}-${sufijo}-${fecha}.pdf`
        .replace(/[\\/:*?"<>|]/g, '-');

      // Descarga directa vía blob (no abre visor)
      const blob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      console.log(`✅ PDF generado: ${nombre}`);
    } catch (err) {
      console.error('❌ ERROR:', err);
      alert(`Error al generar PDF:\n${err.message}\n\nRevisa la consola (F12).`);
    } finally {
      if (boton) {
        boton.disabled = false;
        boton.textContent = textoBoton;
      }
    }
  }

  // Exponer al global y enganchar botones
  window.generarPDF = generarPDF;
  window.generarPDFSinPrecios = () => generarPDF(false);

  document.addEventListener('DOMContentLoaded', () => {
    const btnCon = document.getElementById('btn-descargar-pdf');
    if (btnCon) {
      // cloneNode para eliminar listeners previos (versión antigua)
      const clone = btnCon.cloneNode(true);
      btnCon.parentNode.replaceChild(clone, btnCon);
      clone.addEventListener('click', () => generarPDF(true));
    }
    const btnSin = document.getElementById('btn-pdf-sin');
    if (btnSin) {
      const clone = btnSin.cloneNode(true);
      btnSin.parentNode.replaceChild(clone, btnSin);
      clone.addEventListener('click', () => generarPDF(false));
    }
    console.log('✅ Generador PDF nativo activado (PA Corredera Vidrio)');
  });
})();
