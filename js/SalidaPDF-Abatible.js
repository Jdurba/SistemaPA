// ============================================
// GENERADOR DE PDF - PA VIDRIO MONTADO ABATIBLE
// ============================================

async function generarPDFAbatible(conPrecios = true) {
  const boton = conPrecios
    ? document.getElementById('btn-pdf-con')
    : document.getElementById('btn-pdf-sin');
  if (!boton) return alert('❌ Botón no encontrado');

  try {
    boton.disabled = true;
    boton.textContent = '⏳ Generando PDF...';

    const paginas = Array.from(document.querySelectorAll('.pagina-informe.active'));
    if (paginas.length === 0) {
      alert('❌ No hay páginas de informe visibles para generar PDF');
      return;
    }

    console.log(`📄 Páginas a capturar: ${paginas.length}`);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    for (let i = 0; i < paginas.length; i++) {
      console.log(`📄 Capturando página ${i + 1}/${paginas.length}: ${paginas[i].id}`);
      await capturarInforme(pdf, paginas[i], i === 0, conPrecios);
    }

    const cliente = document.querySelector('.pagina-informe.active [id$="-cliente"]')?.textContent?.trim() || 'informe';
    const fecha = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
    const sufijo = conPrecios ? 'con-precios' : 'sin-precios';

    pdf.save(`PA-Abatible-${cliente}-${sufijo}-${fecha}.pdf`);

  } catch (error) {
    console.error('❌ ERROR:', error);
    alert(`Error al generar PDF:\n${error.message}\n\nRevisa la consola (F12) para más detalles.`);
  } finally {
    boton.disabled = false;
    boton.textContent = conPrecios ? '📄 PDF con precios' : '📄 PDF sin precios';
  }
}

// ============================================
// FUNCIÓN AUXILIAR: Captura una página y la añade al PDF
// ============================================
async function capturarInforme(pdf, contenedor, esPrimero = true, conPrecios = true) {
  if (!contenedor) return;

  await esperarImagenes(contenedor);

  const canvas = await html2canvas(contenedor, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: 794,
    onclone: (clonedDoc) => {
      clonedDoc.body.style.backgroundColor = '#ffffff';
      const contenedorClonado = clonedDoc.getElementById(contenedor.id);
      if (contenedorClonado) {
        contenedorClonado.style.backgroundColor = '#ffffff';
        contenedorClonado.style.setProperty('background-color', '#ffffff', 'important');
      }

      clonedDoc.querySelectorAll('.btn').forEach(btn => btn.style.display = 'none');

      // Sin precios: ocultar solo columna "Precio €"
      if (!conPrecios) {
        clonedDoc.querySelectorAll('.tabla-informe th').forEach(th => {
          if (th.textContent.trim() === 'Precio €') th.style.display = 'none';
        });
        clonedDoc.querySelectorAll('[id*="-precio-"]').forEach(td => {
          td.style.display = 'none';
        });
      }

      clonedDoc.querySelectorAll('.bloque-titulo, .tabla-informe th').forEach(el => {
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

  const pageWidth  = 210;
  const pageHeight = 297;
  const imgData = canvas.toDataURL('image/png');

  let imgWidth  = pageWidth;
  let imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight > pageHeight) {
    imgHeight = pageHeight;
    imgWidth  = (canvas.width * imgHeight) / canvas.height;
  }

  const offsetX = (pageWidth - imgWidth) / 2;

  if (!esPrimero) pdf.addPage();
  pdf.addImage(imgData, 'PNG', offsetX, 0, imgWidth, imgHeight);

  console.log(`✅ Capturada: ${contenedor.id} → ${imgWidth.toFixed(0)}x${imgHeight.toFixed(0)}mm`);
}

// ============================================
// FUNCIÓN AUXILIAR: Esperar imágenes
// ============================================
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
