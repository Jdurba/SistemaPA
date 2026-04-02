// calcular.js
// Devuelve una Promise con el presupuesto completo
// Entrada: {tipo, color, vidrio, altura, ancho, modeloEmb, bastidor}
// Salida:  {puerta:{codigo,denominacion,precio,obsPuerta}, emb:{...}, bast:{...}, total}

const URL_CODIGO_PRECIO = 'https://raw.githubusercontent.com/Jdurba/ImagenesPA/main/Archivos/CodigoPrecio.csv';
const URL_ARTICULOS     = 'https://raw.githubusercontent.com/Jdurba/ImagenesPA/main/Archivos/ArticulosPAmont.csv';
const URL_ELEMENTOS     = 'https://raw.githubusercontent.com/Jdurba/ImagenesPA/main/Archivos/ElementosPrecio.csv';

let tablas = {}; // privado dentro del módulo

function csvToObj(text, delim = ';') {
  const lines = text.trim().split(/\r?\n/);
  const heads = lines[0].split(delim);
  return lines.slice(1).map(l => {
    const vals = l.split(delim);
    const obj = {};
    heads.forEach((h, i) => obj[h.trim()] = vals[i]?.trim());
    return obj;
  });
}

// Cargamos UNA vez las tres tablas
export async function cargarTablas() {
  const [cp, art, el] = await Promise.all([
    fetch(URL_CODIGO_PRECIO).then(r => r.text()).then(csvToObj),
    fetch(URL_ARTICULOS).then(r => r.text()).then(csvToObj),
    fetch(URL_ELEMENTOS).then(r => r.text()).then(csvToObj)
  ]);
  tablas.codPrecio = cp;
  tablas.articulos = art;
  tablas.elementos = el;
  return true; // fin carga
}

// ----------------------------------------------------------
// Función pública: devuelve el presupuesto completo  / Se usa para Puerta y para Fijo con el nombre Puerta
// ----------------------------------------------------------
export function calcularPresupuesto(data) {
  
  // data = {tipo, color, vidrio, altura, ancho, modeloEmb, bastidor}

  // 1. Ajustar medidas
  const {altoTabla, anchoTabla} = ajustarMedidas(data.tipo, data.altura, data.ancho);

  // 2. Puerta   (Vale para fijo también)
  const puerta = buscarPuerta(data.tipo, data.color, data.vidrio, altoTabla, anchoTabla);

  if (data.altura > 2700) {
  puerta.precio = parseFloat((puerta.precio * 1.20).toFixed(3));
  } 

  // 3. Embellecedor
  const codEmb = `PAV.${data.modeloEmb}01.${data.color}`;
  //console.log ('Embellecedor:', codEmb);
  const emb    = buscarDenominacionYPrecio(codEmb);

  // 4. Bastidor
  const codBast = `PAV.${data.bastidor}.${data.color}`;
  const bast    = buscarDenominacionYPrecio(codBast);

  return {
    puerta: {...puerta, obs: `Medidas reales: Alto ${data.altura} mm, Ancho ${data.ancho} mm`},
    emb,
    bast
   
  };
}

// ----------------------------------------------------------
// Auxiliares (igual que tenías, copiados tal cual)
// ----------------------------------------------------------
function ajustarMedidas(tipo, altoIn, anchoIn) {
  const altoTabla = altoIn <= 2500 ? 2500 : 2700;
  const ESCALAS_ANCHO = {
    '01': [600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500],
    '02': [500, 1000, 1500],
    '05': [600, 700, 800, 900, 1000, 1100],
    '06': [600, 700, 800, 900, 1000, 1100],
    '07': [600, 700, 800, 900, 1000]
  };
  const escala = ESCALAS_ANCHO[tipo];
  for (const v of escala) if (v >= anchoIn) return { altoTabla, anchoTabla: v };
  return { altoTabla, anchoTabla: escala[escala.length - 1] };
}

function buscarDenominacionYPrecio(codigo) {
  console.log ('Embellecedor al entrar:', codigo);
  const rowP = tablas.codPrecio.find(r => r.Codigo === codigo);
  const precio = rowP ? parseFloat(rowP.Precio.replace(',', '.')) : 0;
  const rowA = tablas.articulos.find(r => r.CODIGO === codigo);
  const denom = rowA ? rowA.DENOMINACION : codigo;
  return { codigo, denominacion: denom, precio };
}

function buscarPuerta(tipo, color, vidrio, altoTabla, anchoTabla) {
  const codigo = `PAV.${tipo}${vidrio}.${color}`;
  const rowArt = tablas.articulos.find(r => r.CODIGO === codigo);
  const denom = rowArt ? rowArt.DENOMINACION : codigo;

  const COL_VIDRIOS = {
    '01': 'TRANSPARENTE',
    '02': 'MATE',
    '03': 'BRONCE',
    '04': 'GRIS',
    '05': 'GRIS OSCURO',
    '00': 'ESPECIAL'
  };
  const nomCol = COL_VIDRIOS[vidrio];

  const rowEl = tablas.elementos.find(
    r =>
      r.TIPO === tipo &&
      r.ALTOTABLA == altoTabla &&
      r.COLOR === color &&
      r.ANCHOTABLA == anchoTabla
  );
  const precStr = rowEl?.[nomCol] || '0';
  const precio = parseFloat(precStr.replace(',', '.'));
  return { codigo, denominacion: denom, precio };
}