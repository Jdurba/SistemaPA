// ============================================
// GENERADOR DE PDF CON 2 INFORMES
// ============================================

// ── Espera a que el navegador termine de pintar el DOM ──
// Problema raíz: html2canvas se lanzaba antes del repaint
// y capturaba los contenedores vacíos (página en blanco).
// Solución: esperar 2 frames de animación + 150ms de margen.
function esperarRepaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 150);
      });
    });
  });
}

// ── Función principal ──────────────────────────────────
async function generarPDFCompleto() {
  const boton = document.getElementById('btn-descargar-pdf');
  if (!boton) return alert('❌ Botón no encontrado');

  try {
    boton.disabled = true;
    boton.textContent = '⏳ Generando PDF...';

    const informe1 = document.getElementById('informe-container');
    const informe2 = document.getElementById('hoja-pedido-container');

    if ((!informe1 || informe1.style.display === 'none') &&
        (!informe2 || informe2.style.display === 'none')) {
      alert('❌ No hay informe visible para generar PDF');
      return;
    }

    // ── Esperar repaint antes de capturar ──────────────
    await esperarRepaint();

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    if (informe1 && informe1.style.display !== 'none') {
      console.log('1️⃣ Capturando Informe 1...');
      await capturarInforme(pdf, informe1, true);
    }

    if (informe2 && informe2.style.display !== 'none') {
      console.log('2️⃣ Capturando Informe 2...');
      await capturarInforme(pdf, informe2, false);
    }

    // Nombre del archivo
    const cliente = informe1?.querySelector('#inf-cliente')?.textContent?.trim() ||
                    informe2?.querySelector('#hp-cliente')?.textContent?.trim() || 'informe';
    const pedido  = informe1?.querySelector('#inf-pedido')?.textContent?.trim()  ||
                    informe2?.querySelector('#hp-pedido')?.textContent?.trim()   || '';
    const fecha   = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
    const nombre  = pedido
      ? `PA-Vidrio-${pedido}-${cliente}-${fecha}.pdf`
      : `PA-Vidrio-${cliente}-${fecha}.pdf`;

    // Descarga directa con nombre correcto
    pdf.save(nombre);

  } catch (error) {
    console.error('❌ ERROR COMPLETO:', error);
    alert(`Error al generar PDF:\n${error.message}\n\nRevisa la consola (F12) para más detalles.`);
  } finally {
    boton.disabled = false;
    boton.textContent = '📄 Generar PDF';
  }
}

// ── Captura un informe y lo añade al PDF ──────────────
async function capturarInforme(pdf, contenedor, esPrimero = true) {
  if (!contenedor || contenedor.style.display === 'none') return;

  console.log(`📄 Capturando ${contenedor.id}...`);

  await esperarImagenes(contenedor);

  const canvas = await html2canvas(contenedor, {
    scale: 1.5,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,

    onclone: (clonedDoc) => {
      clonedDoc.body.style.backgroundColor = '#ffffff';
      const contenedorClonado = clonedDoc.getElementById(contenedor.id);
      if (contenedorClonado) {
        contenedorClonado.style.backgroundColor = '#ffffff';
        contenedorClonado.style.setProperty('background-color', '#ffffff', 'important');
      }

      clonedDoc.querySelectorAll('.btn').forEach(btn => {
        btn.style.display = 'none';
      });

      const elementosCorrectos = clonedDoc.querySelectorAll('.bloque-titulo, .tabla-informe th');
      elementosCorrectos.forEach(el => {
        const estilo = window.getComputedStyle(el);
        if (estilo.backgroundColor && estilo.backgroundColor !== 'transparent') {
          el.style.backgroundColor = '#bbb';
        }
      });

      clonedDoc.querySelectorAll('*').forEach(el => {
        const estilo = window.getComputedStyle(el);
        if (!el.classList.contains('bloque-titulo') &&
            !el.closest('th') &&
            el.tagName !== 'TH' &&
            el.tagName !== 'BODY' &&
            el.id !== contenedor.id) {
          if (estilo.backgroundColor.includes('rgba') ||
              estilo.backgroundColor.includes('rgb(242') ||
              estilo.backgroundColor.includes('rgb(245')) {
            el.style.backgroundColor = 'transparent';
          }
        }
      });
    }
  });

  const imgData = canvas.toDataURL('image/png');
  const imgWidth = 210;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (!esPrimero) pdf.addPage();

  pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

  console.log(`✅ Informe capturado: ${imgWidth}x${imgHeight.toFixed(0)}mm`);
}

// ── Esperar a que carguen las imágenes del contenedor ─
function esperarImagenes(container) {
  return new Promise((resolve) => {
    const images = container.querySelectorAll('img');
    if (images.length === 0) return resolve();

    let loaded = 0;
    images.forEach(img => {
      if (img.complete && img.naturalHeight > 0) {
        loaded++;
        if (loaded === images.length) resolve();
      } else {
        img.onload = img.onerror = () => {
          loaded++;
          if (loaded === images.length) resolve();
        };
      }
    });
  });
}

// ── Enlazar botón (una sola vez, sin doble listener) ──
// cloneNode elimina todos los listeners previos que pudiera
// tener el botón antes de añadir el nuestro.
document.addEventListener('DOMContentLoaded', () => {
  const boton = document.getElementById('btn-descargar-pdf');
  if (boton) {
    const clone = boton.cloneNode(true);
    boton.parentNode.replaceChild(clone, boton);
    clone.addEventListener('click', generarPDFCompleto);
    console.log('✅ Generador de PDF activado');
  } else {
    console.error('❌ No se encontró el botón #btn-descargar-pdf');
  }
});
