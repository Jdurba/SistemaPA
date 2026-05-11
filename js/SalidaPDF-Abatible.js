// ===================================================================
// PDF PA VIDRIO MONTADO ABATIBLE  —  Generador nativo jsPDF
// -------------------------------------------------------------------
// Reemplaza la versión basada en html2canvas. Recorre el DOM de cada
// .pagina-informe.active y la dibuja como página nativa A4 con texto
// real, mil veces más liviana y sin distorsiones.
//
// Estilo fiel al informe en pantalla:
//   - Página: 210×297mm, padding interior 15mm
//   - Header con logo + H1 azul (#1a2b6f) + datos cliente/pedido/fecha
//   - Comentarios + barra "linea-resumen" (#636363, texto blanco)
//   - titulo-elemento con barra negra a la izquierda (5px ≈ 1.3mm)
//   - bloque-titulo gris (#e8e8e8) con franja izq (#888)
//   - seccion-sub-titulo azul claro (#e8eaf6) con franja (#1a2b6f)
//   - Tablas con TH gris (#e5e7eb) y bordes (#999)
//   - Sangrías N3 = 12.7mm, N3.1 = 25.4mm
// ===================================================================

(function () {
  'use strict';

  // ── DIMENSIONES Y COLORES (alineados al CSS del informe) ────────
  const W = 210;            // A4 ancho mm
  const H = 297;            // A4 alto mm
  const M = 15;             // margen interior 15mm (= padding del CSS)
  const CW = W - 2 * M;     // ancho útil de contenido = 180mm

  const SANGRIA_N3   = 12.7;   // 48px ≈ 12.7mm — bloque-fabricacion / bloque-pedido
  const SANGRIA_N31  = 25.4;   // 96px ≈ 25.4mm — sub-bloques P1/P2/MARCO

  const COLOR_AZUL_CORP    = [26, 43, 111];     // #1a2b6f
  const COLOR_AZUL_SUAVE_BG= [232, 234, 246];   // #e8eaf6
  const COLOR_GRIS_OSCURO  = [99, 99, 99];      // #636363  (linea-resumen)
  const COLOR_GRIS_CLARO   = [232, 232, 232];   // #e8e8e8  (bloque-titulo)
  const COLOR_GRIS_TH      = [229, 231, 235];   // #e5e7eb  (TH tablas)
  const COLOR_GRIS_FRANJA  = [136, 136, 136];   // #888     (franja bloque-titulo)
  const COLOR_GRIS_BORDE   = [153, 153, 153];   // #999     (bordes tablas)
  const COLOR_GRIS_LABEL   = [85, 85, 85];      // #555     (labels)
  const COLOR_GRIS_LINEA   = [153, 153, 153];   // #999     (línea bajo span)
  const COLOR_TEXTO        = [33, 33, 33];      // #212121

  // ── CACHÉ DE IMÁGENES (logo + iconos de perfil se repiten mucho) ─
  const cacheImagenes = new Map();

  function cargarImagenComoData(url) {
    if (cacheImagenes.has(url)) return cacheImagenes.get(url);
    const esSVG = /\.svg(\?|$)/i.test(url);
    const promesa = esSVG ? cargarSVGComoData(url) : cargarBitmapComoData(url);
    cacheImagenes.set(url, promesa);
    return promesa;
  }

  // Loader para imágenes bitmap (PNG, JPG, etc.)
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

  // Loader específico para SVG: descarga el texto, extrae viewBox y rasteriza a alta resolución
  // Necesario porque <img>+canvas con SVGs sin width/height da naturalWidth=0 en muchos navegadores
  async function cargarSVGComoData(url) {
    try {
      const respuesta = await fetch(url);
      if (!respuesta.ok) return null;
      let svgText = await respuesta.text();

      // Extraer viewBox para conocer la proporción real
      const m = svgText.match(/viewBox\s*=\s*["']([^"']+)["']/i);
      let vbW = 0, vbH = 0;
      if (m) {
        const partes = m[1].trim().split(/[\s,]+/).map(Number);
        if (partes.length === 4) { vbW = partes[2]; vbH = partes[3]; }
      }
      if (!vbW || !vbH) { vbW = 300; vbH = 100; }

      // Inyectar width/height explícitos al SVG si no los tiene (necesario para canvas)
      if (!/<svg[^>]*\swidth\s*=/i.test(svgText)) {
        svgText = svgText.replace(/<svg\b/i, `<svg width="${vbW}" height="${vbH}"`);
      }

      // Rasterizar a un canvas grande (3× para nitidez)
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
              naturalWidth: vbW,    // proporción del viewBox
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
    return (el.textContent || '').trim().replace(/\s+/g, ' ');
  }

  // Texto truncado al ancho de columna (jsPDF mide en pt; convierte a mm)
  function truncarTexto(pdf, texto, anchoMaxMM) {
    if (!texto) return '';
    const anchoActual = pdf.getTextWidth(texto);
    if (anchoActual <= anchoMaxMM) return texto;
    let t = texto;
    while (t.length > 1 && pdf.getTextWidth(t + '…') > anchoMaxMM) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  // ── PRIMITIVAS DE DIBUJO ────────────────────────────────────────

  // Header de cada página: logo + H1 + datos cliente/pedido/fecha + comentarios + linea-resumen
  async function dibujarHeaderPagina(pdf, divPagina, paginaIdx, totalPaginas) {
    let y = M;

    // ── Logo + Título ──
    const logoEl = divPagina.querySelector('.informe-header-logo');
    const logoData = logoEl ? await cargarImagenComoData(logoEl.src) : null;

    // Logo SVG real: ratio 322.51 × 110.26 ≈ 2.92 : 1
    // Caja: 36 × 13 mm → cabe sin recortes y respeta proporción
    const logoH = 13;
    const logoBoxW = 36;
    if (logoData && logoData.naturalWidth > 0) {
      const fit = fitImageInBox(logoData.naturalWidth, logoData.naturalHeight, logoBoxW, logoH);
      pdf.addImage(logoData.dataUrl, 'PNG',
        M + (logoBoxW - fit.w) / 2,
        y + (logoH - fit.h) / 2,
        fit.w, fit.h);
    }

    const h1 = txt(divPagina.querySelector('.informe-header h1')) || 'PA Vidrio Montado · Abatible';
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...COLOR_AZUL_CORP);
    pdf.text(h1.toUpperCase(), W / 2, y + logoH / 2 + 1.5, { align: 'center' });

    y += logoH + 4;

    // (Sin línea horizontal: el diseño funciona sin ella y libera espacio vertical)

    // ── Cliente / Nº Pedido / Fecha ──
    // En el HTML: flex con flex 2/1/1 → repartimos el ancho proporcionalmente
    const totalFlex = 4;
    const wCliente = (CW - 12) * (2 / totalFlex);   // -12 mm de gaps
    const wPedido  = (CW - 12) * (1 / totalFlex);
    const wFecha   = (CW - 12) * (1 / totalFlex);

    const cliente = txt(divPagina.querySelector('[id$="-cliente"]'));
    const pedido  = txt(divPagina.querySelector('[id$="-pedido"]'));
    const fecha   = txt(divPagina.querySelector('[id$="-fecha"]'));

    let xCampo = M;
    dibujarCampoFormulario(pdf, xCampo, y, wCliente, 'Cliente:', cliente);
    xCampo += wCliente + 6;
    dibujarCampoFormulario(pdf, xCampo, y, wPedido,  'Nº Pedido:', pedido);
    xCampo += wPedido + 6;
    dibujarCampoFormulario(pdf, xCampo, y, wFecha,   'Fecha:', fecha);

    y += 7;

    // ── Comentarios (full width) ──
    const comentarios = txt(divPagina.querySelector('[id$="-comentarios"]'));
    dibujarCampoFormulario(pdf, M, y, CW, 'Comentarios:', comentarios);
    y += 9;

    // ── Línea-resumen (barra gris oscuro, texto blanco) ──
    const resumenConfig = txt(divPagina.querySelector('.linea-resumen .texto-resumen'));
    const medidasHueco  = txt(divPagina.querySelector('.linea-resumen .medidas-hueco'));
    const paginacion    = txt(divPagina.querySelector('.linea-resumen .paginacion'));

    const altoBarra = 7;
    pdf.setFillColor(...COLOR_GRIS_OSCURO);
    pdf.roundedRect(M, y, CW, altoBarra, 1, 1, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);

    // resumen-config centrado, medidas-hueco también centrado pero a la derecha del centro,
    // paginacion al borde derecho
    if (resumenConfig) {
      pdf.text(truncarTexto(pdf, resumenConfig, CW * 0.55), M + CW * 0.30, y + altoBarra / 2 + 1.4, { align: 'center' });
    }
    if (medidasHueco) {
      pdf.text(truncarTexto(pdf, medidasHueco, CW * 0.30), M + CW * 0.72, y + altoBarra / 2 + 1.4, { align: 'center' });
    }
    if (paginacion) {
      pdf.setFontSize(7.5);
      pdf.text(paginacion, W - M - 2, y + altoBarra / 2 + 1.3, { align: 'right' });
    }

    y += altoBarra + 4;

    return y;
  }

  // Campo tipo formulario: "Label:  valor" con línea inferior gris bajo el valor
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

  // Bloque "titulo-elemento": barra negra 5px (1.3mm) izq + nombre + medidas + detalle
  function dibujarTituloElemento(pdf, y, principal, medidas, detalle) {
    const barraW = 1.3;
    const altoBarra = detalle ? 9 : 6;

    pdf.setFillColor(0, 0, 0);
    pdf.rect(M, y, barraW, altoBarra, 'F');

    const xTexto = M + barraW + 4;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...COLOR_TEXTO);
    pdf.text(principal || '', xTexto, y + 4);

    if (medidas) {
      const anchoPrincipal = pdf.getTextWidth(principal || '');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(...COLOR_AZUL_CORP);
      pdf.text(medidas, xTexto + anchoPrincipal + 5, y + 4);
    }

    if (detalle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(detalle, xTexto, y + 8);
    }

    return y + altoBarra + 3;
  }

  // bloque-titulo: fondo gris claro + franja izquierda + texto negro
  function dibujarBloqueTitulo(pdf, x, y, ancho, texto) {
    const alto = 6.5;
    const franja = 1;

    // Franja izquierda
    pdf.setFillColor(...COLOR_GRIS_FRANJA);
    pdf.rect(x, y, franja, alto, 'F');

    // Fondo
    pdf.setFillColor(...COLOR_GRIS_CLARO);
    pdf.rect(x + franja, y, ancho - franja, alto, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...COLOR_TEXTO);
    pdf.text(texto, x + franja + 3, y + alto / 2 + 1.4);

    return y + alto + 3;
  }

  // seccion-sub-titulo: fondo azul muy claro + franja azul corp + texto azul corp
  function dibujarSeccionSubTitulo(pdf, x, y, ancho, texto) {
    const alto = 5.5;
    const franja = 0.9;

    pdf.setFillColor(...COLOR_AZUL_CORP);
    pdf.rect(x, y, franja, alto, 'F');

    pdf.setFillColor(...COLOR_AZUL_SUAVE_BG);
    pdf.rect(x + franja, y, ancho - franja, alto, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLOR_AZUL_CORP);
    pdf.text(texto, x + franja + 3, y + alto / 2 + 1.2);

    return y + alto + 2;
  }

  // seccion-titulo (texto plano "Perfiles Acabado: X" / "Cristales P1 - Color: Y")
  function dibujarSeccionTitulo(pdf, x, y, texto) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(60, 60, 60);
    pdf.text(texto, x, y + 3);
    return y + 5;
  }

  // ── DIBUJAR TABLA ───────────────────────────────────────────────
  // headerThs: array de elementos <th> del thead (no strings)
  // bodyRows : array de <tr> del tbody
  // anchosCol: array de anchos en mm (suma debe ≈ ancho)
  // omitirColIdx: índice de columna a omitir (versión sin precios)
  //
  // IMPORTANTE: dibujamos en pasadas separadas (fondos → bordes → contenidos)
  // porque jsPDF 2.5.1 tiene un bug con rect modo 'FD' tras ciertas operaciones
  // que produce celdas pintadas en negro de forma aleatoria.
  //
  // Las filas tienen ALTURA DINÁMICA: las celdas con texto largo se parten en
  // varias líneas (como en pantalla con word-wrap) y la fila crece para
  // acomodarlas. Los bordes se pintan con esa altura.
  async function dibujarTabla(pdf, x, y, anchosCol, headerThs, bodyRows, opciones = {}) {
    const {
      omitirColIdx = -1,
      alturaFilaMin = 5.5,
      alturaHeader = 6,
      fontSizeBody = 8,
      fontSizeHeader = 7.5,
      lineHeight = 3.2  // altura de línea en mm para texto fontSizeBody
    } = opciones;

    // Filtrar columnas si se omite alguna
    let cols = anchosCol.map((w, i) => ({ w, idx: i })).filter(c => c.idx !== omitirColIdx);
    if (omitirColIdx >= 0) {
      const wOmitido = anchosCol[omitirColIdx];
      const idxDescripcion = cols.findIndex(c => c.idx === 2);
      if (idxDescripcion >= 0) cols[idxDescripcion].w += wOmitido;
      else cols.forEach(c => c.w += wOmitido / cols.length);
    }
    cols.forEach(c => c.w = Math.round(c.w * 100) / 100);

    // ── HEADER ──────────────────────────────────────────────────
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

    // ── BODY ────────────────────────────────────────────────────
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(fontSizeBody);

    for (const fila of bodyRows) {
      if (!visible(fila)) continue;

      const celdas = Array.from(fila.children);
      const tieneImagen = celdas.some(td => td.querySelector('img'));

      // FASE 1: para cada celda, calcular líneas de texto y altura necesaria
      const padding = 1.5;
      const contenidoCeldas = cols.map(c => {
        const td = celdas[c.idx];
        if (!td) return { tipo: 'vacia' };
        const img = td.querySelector('img');
        if (img && img.src) return { tipo: 'imagen', src: img.src };
        const texto = txt(td);
        if (!texto) return { tipo: 'vacia' };
        const cls = td.className || '';
        const lineas = pdf.splitTextToSize(texto, c.w - padding * 2);
        return { tipo: 'texto', lineas, cls };
      });

      // Altura: la mayor entre el contenido y el mínimo
      let altoFila = alturaFilaMin;
      if (tieneImagen) altoFila = Math.max(altoFila, 11);
      contenidoCeldas.forEach(cnt => {
        if (cnt.tipo === 'texto') {
          const altoNecesario = cnt.lineas.length * lineHeight + 2;
          if (altoNecesario > altoFila) altoFila = altoNecesario;
        }
      });

      // FASE 2: pintar bordes con la altura calculada
      pdf.setDrawColor(...COLOR_GRIS_BORDE);
      pdf.setLineWidth(0.2);
      xCursor = x;
      for (const c of cols) {
        pdf.rect(xCursor, y, c.w, altoFila, 'D');
        xCursor += c.w;
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
          let align = 'center';
          let xText = xCursor + c.w / 2;
          if (cnt.cls.includes('texto-izq'))      { align = 'left';  xText = xCursor + padding; }
          else if (cnt.cls.includes('texto-Der')) { align = 'right'; xText = xCursor + c.w - padding; }

          // Centrado vertical: el bloque de N líneas se centra en la celda
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

  // ── DIBUJAR UNA PÁGINA-INFORME COMPLETA ─────────────────────────
  async function dibujarPaginaInforme(pdf, divPagina, paginaIdx, totalPaginas, conPrecios) {
    let y = await dibujarHeaderPagina(pdf, divPagina, paginaIdx, totalPaginas);

    // ── titulo-elemento ──
    const tituloEl = divPagina.querySelector('.titulo-elemento');
    if (tituloEl) {
      const principal = txt(tituloEl.querySelector('.elemento-principal'));
      const medidas   = txt(tituloEl.querySelector('.elemento-medidas'));
      const detalle   = txt(tituloEl.querySelector('.elemento-detalle'));
      y = dibujarTituloElemento(pdf, y, principal, medidas, detalle);
    }

    // ── Bloques de la página: bloque-fabricacion y bloque-pedido ──
    // Recorremos en orden DOM
    const bloques = divPagina.querySelectorAll(':scope > .bloque-fabricacion, :scope > .bloque-pedido');
    for (const bloque of bloques) {
      y = await dibujarBloque(pdf, bloque, y, conPrecios);
    }

    return y;
  }

  // Un bloque-fabricacion o bloque-pedido (con sus tablas dentro)
  async function dibujarBloque(pdf, divBloque, y, conPrecios) {
    const esBloquePedido = divBloque.classList.contains('bloque-pedido');

    // Sangría N3: el bloque está sangrado 12.7mm
    const xBloque = M + SANGRIA_N3;
    const wBloque = CW - SANGRIA_N3;

    // ── Título del bloque (HOJA DE FABRICACIÓN / HOJA DE PEDIDO) ──
    const titEl = divBloque.querySelector(':scope > .bloque-titulo');
    if (titEl) {
      y = dibujarBloqueTitulo(pdf, xBloque, y, wBloque, txt(titEl));
    }

    // ¿Las tablas de este bloque van con sangría doble? Sí si:
    //  - Estamos en pagina-marco (CSS: #pagina-marco .bloque-fabricacion .tabla-informe{margin-left:96px})
    //  - O si dentro del bloque hay un seccion-sub-titulo (PUERTA 1, MARCO) que activa el nivel extra
    const paginaPadre = divBloque.closest('.pagina-informe');
    const esPaginaMarco = paginaPadre && paginaPadre.id === 'pagina-marco';
    const tieneSubTit = !!divBloque.querySelector(':scope > .seccion-sub-titulo');
    const tablasAnidadasPorDefecto = esPaginaMarco || tieneSubTit;

    // ── Recorrer hijos del bloque en orden ──
    const hijos = Array.from(divBloque.children);

    for (const hijo of hijos) {
      if (hijo === titEl) continue;
      if (!visible(hijo)) continue;

      y = await dibujarHijoDeBloque(pdf, hijo, y, esBloquePedido, conPrecios, tablasAnidadasPorDefecto);
    }

    y += 2;
    return y;
  }

  // Procesa un hijo de un bloque (puede ser título de sección, tabla, o un sub-div como puerta1-seccion-p2)
  async function dibujarHijoDeBloque(pdf, el, y, esBloquePedido, conPrecios, anidadoExtra) {
    const tag = el.tagName;
    const cls = el.className || '';

    // Sangría de las tablas respecto al borde izquierdo de la página:
    //   - Tabla normal (fijo): M + 12.7 + 12.7 = 40.4mm
    //   - Tabla anidada (puerta/marco bajo sub-titulo): M + 12.7 + 25.4 = 53.1mm
    const xBloque = M + SANGRIA_N3;
    const wBloque = CW - SANGRIA_N3;
    const sangriaExtra = anidadoExtra ? SANGRIA_N31 : SANGRIA_N3;
    const xTabla = xBloque + sangriaExtra;
    const wTabla = W - M - xTabla;   // ancho hasta el margen derecho

    if (tag === 'TABLE') {
      return await dibujarTablaInforme(pdf, el, xTabla, y, wTabla, esBloquePedido, conPrecios);
    }

    if (cls.includes('seccion-sub-titulo')) {
      return dibujarSeccionSubTitulo(pdf, xBloque + SANGRIA_N3, y, wBloque - SANGRIA_N3, txt(el));
    }

    if (cls.includes('seccion-titulo')) {
      // 'Perfiles Acabado: X' o 'Medidas de Cristales - Color: Y'
      const xSec = anidadoExtra ? xBloque + SANGRIA_N3 : xBloque + 1;
      return dibujarSeccionTitulo(pdf, xSec, y, txt(el));
    }

    // div anidado (p.ej. #puerta1-seccion-p2): recorrer sus hijos con sangría extra
    if (tag === 'DIV') {
      const hijos = Array.from(el.children);
      for (const h of hijos) {
        if (!visible(h)) continue;
        y = await dibujarHijoDeBloque(pdf, h, y, esBloquePedido, conPrecios, true);
      }
      return y;
    }

    return y;
  }

  // Dibuja una <table class="tabla-informe">
  async function dibujarTablaInforme(pdf, tableEl, x, y, anchoTotal, esBloquePedido, conPrecios) {
    const headerThs = Array.from(tableEl.querySelectorAll('thead th'));
    const bodyRows = Array.from(tableEl.querySelectorAll('tbody tr'));
    if (headerThs.length === 0 || bodyRows.length === 0) return y;

    // Calcular anchos de columna
    let anchosCol;
    if (esBloquePedido) {
      // Anchos en mm fijos para que el código no se trunque a 7.5pt:
      //   Código 27mm (entran "PAV.0XXX.L.BMxx" cómodos)
      //   Concepto 22mm
      //   Descripción → resto (~76 mm con wTabla=141.9 anidada)
      //   Cantidad 14mm
      //   Precio 16mm
      const c1 = 27;
      const c2 = 22;
      const c4 = 14;
      const c5 = 16;
      const c3 = anchoTotal - (c1 + c2 + c4 + c5);
      anchosCol = [c1, c2, c3, c4, c5];
    } else {
      const ncol = headerThs.length;
      const tieneColIcono = headerThs[0] && headerThs[0].classList.contains('imagen-perfil');
      if (ncol === 4 && tieneColIcono) {
        // Perfiles: [icono | tipo | longitud | cantidad]
        const c1 = 13;
        const c3 = 28;
        const c4 = 22;
        const c2 = anchoTotal - c1 - c3 - c4;
        anchosCol = [c1, c2, c3, c4];
      } else if (ncol === 3) {
        // Embellecedor: [tipo | longitud | cantidad]
        const c2 = 30;
        const c3 = 22;
        const c1 = anchoTotal - c2 - c3;
        anchosCol = [c1, c2, c3];
      } else if (ncol === 4) {
        // Cristales: [vidrio | alto | ancho | cantidad]
        const c2 = 28;
        const c3 = 28;
        const c4 = 22;
        const c1 = anchoTotal - c2 - c3 - c4;
        anchosCol = [c1, c2, c3, c4];
      } else {
        anchosCol = Array(ncol).fill(anchoTotal / ncol);
      }
    }

    const omitirColIdx = (esBloquePedido && !conPrecios) ? 4 : -1;

    return await dibujarTabla(pdf, x, y, anchosCol, headerThs, bodyRows, {
      omitirColIdx,
      alturaFilaMin: esBloquePedido ? 5 : 5.5,
      alturaHeader: 5.5,
      fontSizeBody: esBloquePedido ? 7.5 : 8,
      fontSizeHeader: 7,
      lineHeight: esBloquePedido ? 3 : 3.2
    });
  }

  // ── PUNTO DE ENTRADA (lo que llaman los botones del HTML) ────────
  async function generarPDFAbatible(conPrecios = true) {
    const boton = conPrecios
      ? document.getElementById('btn-pdf-con')
      : document.getElementById('btn-pdf-sin');
    const textoBoton = conPrecios ? '📄 PDF con precios' : '📄 PDF sin precios';

    try {
      if (boton) {
        boton.disabled = true;
        boton.textContent = '⏳ Generando PDF...';
      }

      const paginas = Array.from(document.querySelectorAll('.pagina-informe.active'));
      if (paginas.length === 0) {
        alert('❌ No hay páginas de informe visibles para generar PDF');
        return;
      }

      console.log(`📄 Páginas a renderizar: ${paginas.length}`);

      if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('❌ jsPDF no está cargado. Revisa que el <script> de jspdf.umd.min.js esté incluido.');
        return;
      }
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });

      for (let i = 0; i < paginas.length; i++) {
        if (i > 0) pdf.addPage();
        // Fondo blanco explícito para evitar que el visor del navegador
        // interprete la transparencia como negro (modo oscuro del visor)
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, W, H, 'F');
        console.log(`  → Página ${i + 1}/${paginas.length}: ${paginas[i].id}`);
        await dibujarPaginaInforme(pdf, paginas[i], i, paginas.length, conPrecios);
      }

      const cliente = txt(paginas[0].querySelector('[id$="-cliente"]')) || 'informe';
      const fecha = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
      const sufijo = conPrecios ? 'con-precios' : 'sin-precios';
      const nombre = `PA-Abatible-${cliente}-${sufijo}-${fecha}.pdf`
        .replace(/[\\/:*?"<>|]/g, '-');

      // Forzar descarga directa sin abrir el visor del navegador
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

  // Exponer al ámbito global (los botones del HTML usan onclick="generarPDFAbatible(...)")
  window.generarPDFAbatible = generarPDFAbatible;
})();
