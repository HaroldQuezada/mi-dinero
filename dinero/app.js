'use strict';

// =============================================
// CONEXIÓN SUPABASE
// =============================================
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =============================================
// ESTADO GLOBAL
// =============================================
let cuentas     = [];
let movimientos = [];
let deudas      = [];
let metas       = [];
let config      = { ingreso_mensual: 0, categorias: [] };
let cortes      = [];
let memoriaCateg = {};

const PALETA = ['#7fff00','#a8ff3e','#f5a623','#f56565','#a78bfa','#38bdf8','#fb923c','#c084fc','#34d399','#fbbf24'];
const ICONOS_TIPO = { banco: '🏦', billetera_digital: '📱', efectivo: '💵' };

// =============================================
// UTILIDADES
// =============================================
const $ = (id) => document.getElementById(id);
const fmt = (n) => '$' + (Number(n)||0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
const mesISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const hoyISO = () => new Date().toISOString().slice(0,10);
const esc = (s) => { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; };

function fmtFecha(iso) {
  if (!iso) return '';
  const [a,m,d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function fmtMes(iso) {
  if (!iso) return '';
  const [a,m] = iso.split('-');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${meses[+m-1]} ${a}`;
}

function abrirModal(html) {
  $('modal-box').innerHTML = html;
  $('modal-overlay').classList.remove('oculto');
}

function cerrarModal() { $('modal-overlay').classList.add('oculto'); }

$('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') cerrarModal();
});

// =============================================
// AUTH
// =============================================
let modoReg = false;
$('btn-toggle-registro').addEventListener('click', () => {
  modoReg = !modoReg;
  $('btn-toggle-registro').textContent = modoReg ? '¿Ya tienes cuenta? Entrar' : '¿No tienes cuenta? Crear una';
  $('form-login').querySelector('button').textContent = modoReg ? 'Crear cuenta' : 'Entrar';
});

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('login-email').value.trim();
  const pass  = $('login-password').value;
  $('login-error').textContent = '';
  if (modoReg) {
    const { error } = await db.auth.signUp({ email, password: pass });
    if (error) return ($('login-error').textContent = error.message);
    $('login-error').textContent = 'Cuenta creada. Ya puedes entrar.';
    modoReg = false; $('btn-toggle-registro').click();
  } else {
    const { error } = await db.auth.signInWithPassword({ email, password: pass });
    if (error) $('login-error').textContent = error.message;
  }
});

$('btn-logout').addEventListener('click', () => db.auth.signOut());

$('btn-reset').addEventListener('click', () => {
  const balanceActual = balanceTotal();
  const opCuentas = cuentas.length > 0
    ? cuentas.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')
    : '<option value="">Sin cuenta (balance general)</option>';

  abrirModal(`
    <h3>Ajustar balance actual</h3>
    <p style="color:#7b82a0;font-size:13px;margin-bottom:16px">
      Balance calculado: <strong style="color:#e8eaf0">${fmt(balanceActual)}</strong><br>
      Escribe cuánto tienes realmente hoy y se crea un ajuste automático.
    </p>
    <div class="campo">
      <label>¿Cuánto tienes realmente ahora?</label>
      <input type="number" id="rst-saldo" min="0" placeholder="0">
    </div>
    ${cuentas.length > 0 ? `
    <div class="campo">
      <label>¿En qué cuenta reflejar el ajuste?</label>
      <select id="rst-cuenta">${opCuentas}</select>
    </div>` : ''}
    <div id="rst-preview" style="font-size:13px;color:#7b82a0;margin-top:-6px;margin-bottom:14px;"></div>
    <div class="modal-acciones">
      <button class="btn-outline" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" id="btn-rst-ok">Aplicar ajuste</button>
    </div>
  `);

  $('rst-saldo').addEventListener('input', () => {
    const real = parseFloat($('rst-saldo').value);
    if (isNaN(real)) { $('rst-preview').textContent = ''; return; }
    const diff = real - balanceActual;
    if (Math.abs(diff) < 1) { $('rst-preview').textContent = '✓ Ya está correcto.'; return; }
    $('rst-preview').textContent = diff > 0
      ? `→ Se registra un ingreso de ajuste por ${fmt(diff)}`
      : `→ Se registra un gasto de ajuste por ${fmt(Math.abs(diff))}`;
  });

  $('btn-rst-ok').addEventListener('click', async () => {
    const real = parseFloat($('rst-saldo').value);
    if (isNaN(real) || real < 0) return alert('Ingresa un valor válido');
    const diff = real - balanceActual;
    if (Math.abs(diff) < 1) { cerrarModal(); return; }

    const cuentaId = $('rst-cuenta')?.value || null;
    const { error } = await db.from('movimientos').insert({
      tipo: diff > 0 ? 'ingreso' : 'gasto',
      monto: Math.abs(diff),
      categoria: 'Ajuste de balance',
      cuenta_id: cuentaId,
      fecha: hoyISO(),
      nota: `Ajuste manual — balance real: ${fmt(real)}`,
    });
    if (error) return alert('Error: ' + error.message);
    cerrarModal();
    await cargarMovimientos();
    renderTodo();
  });
});

db.auth.onAuthStateChange((_, sesion) => {
  if (sesion) {
    $('vista-login').classList.add('oculto');
    $('vista-app').classList.remove('oculto');
    iniciar();
  } else {
    $('vista-login').classList.remove('oculto');
    $('vista-app').classList.add('oculto');
  }
});

// =============================================
// NAVEGACIÓN
// =============================================
function irTab(tab) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
  document.querySelectorAll('.panel').forEach(p => p.classList.add('oculto'));
  document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('activo');
  $(`panel-${tab}`).classList.remove('oculto');
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => irTab(btn.dataset.tab));
});

// =============================================
// CARGA INICIAL
// =============================================
async function iniciar() {
  await Promise.all([
    cargarCuentas(), cargarMovimientos(), cargarDeudas(),
    cargarMetas(), cargarConfig(), cargarCortes(), cargarMemoria()
  ]);
  renderTodo();
}

function renderTodo() {
  renderDashboard();
  renderMovimientos();
  renderCuentas();
  renderDeudas();
  renderMetas();
  renderPresupuesto();
}

// =============================================
// CARGAS
// =============================================
async function cargarCuentas() {
  const { data } = await db.from('cuentas').select('*').eq('activa', true).order('orden');
  cuentas = data || [];
}

async function cargarMovimientos() {
  const { data } = await db.from('movimientos').select('*')
    .order('fecha', { ascending: false }).order('created_at', { ascending: false });
  movimientos = data || [];
}

async function cargarDeudas() {
  const { data } = await db.from('deudas').select('*').eq('activa', true).order('created_at');
  deudas = data || [];
}

async function cargarMetas() {
  const { data } = await db.from('metas_ahorro').select('*').eq('activa', true).order('created_at');
  metas = data || [];
}

async function cargarConfig() {
  const { data } = await db.from('configuracion').select('*').maybeSingle();
  if (data) config = { ...config, ...data };
}

async function cargarCortes() {
  const { data } = await db.from('tarjeta_cortes').select('*').eq('mes', mesISO());
  cortes = data || [];
}

async function cargarMemoria() {
  const { data } = await db.from('categoria_memoria').select('*');
  memoriaCateg = {};
  (data||[]).forEach(r => { memoriaCateg[r.categoria] = r.categoria_grande_id; });
}

// =============================================
// CALCULOS CLAVE
// =============================================
function saldoCuenta(cuentaId) {
  const c = cuentas.find(x => x.id === cuentaId);
  if (!c) return 0;
  const delta = movimientos
    .filter(m => m.cuenta_id === cuentaId)
    .reduce((acc, m) => acc + (m.tipo === 'ingreso' ? m.monto : -m.monto), 0);
  return c.saldo_inicial + delta;
}

function balanceTotal() {
  if (cuentas.length > 0) return cuentas.reduce((acc, c) => acc + saldoCuenta(c.id), 0);
  return movimientos.reduce((acc, m) => acc + (m.tipo === 'ingreso' ? m.monto : -m.monto), 0);
}

function gastosMes(mes = mesISO()) {
  return movimientos.filter(m => m.tipo === 'gasto' && m.fecha?.slice(0,7) === mes)
    .reduce((acc, m) => acc + m.monto, 0);
}

function ingresosMes(mes = mesISO()) {
  return movimientos.filter(m => m.tipo === 'ingreso' && m.fecha?.slice(0,7) === mes)
    .reduce((acc, m) => acc + m.monto, 0);
}

function deudaPendienteMes() {
  return deudas.filter(d => !cortes.some(c => c.deuda_id === d.id && c.pagado))
    .reduce((acc, d) => {
      const corte = cortes.find(c => c.deuda_id === d.id);
      return acc + (corte ? corte.monto_corte : d.pago_mensual_planeado || 0);
    }, 0);
}

function disponible() {
  return balanceTotal() - deudaPendienteMes();
}

function nombreCuenta(cuentaId) {
  if (!cuentaId) return 'Sin cuenta';
  const id = cuentaId.replace('tarjeta:', '');
  const c = cuentas.find(x => x.id === id);
  if (c) return c.nombre;
  const d = deudas.find(x => x.id === id);
  if (d) return '💳 ' + d.nombre;
  return 'Sin cuenta';
}

function saldoTarjetaDebito(deudaId) {
  const id = deudaId?.replace('tarjeta:', '');
  return movimientos
    .filter(m => m.cuenta_id === id)
    .reduce((acc, m) => acc + (m.tipo === 'ingreso' ? m.monto : -m.monto), 0);
}

// =============================================
// DASHBOARD
// =============================================
let mesDona = mesISO();

function renderDashboard() {
  const now = new Date();
  $('dash-fecha').textContent = now.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' });

  $('kpi-balance').textContent = fmt(balanceTotal());
  $('kpi-disponible').textContent = fmt(disponible());
  const gm = gastosMes(); const im = ingresosMes();
  $('kpi-gastos').textContent = fmt(gm);
  $('kpi-ingresos').textContent = fmt(im);

  renderDona();
  renderLineaBalance();
  renderDashCuentas();
  renderDashAhorros();
  renderDashMovimientos();
}

// --- DONA ---
function renderDona() {
  $('dona-mes').textContent = fmtMes(mesDona);
  const gastosDelMes = movimientos.filter(m => m.tipo === 'gasto' && m.fecha?.slice(0,7) === mesDona);
  const total = gastosDelMes.reduce((acc,m) => acc + m.monto, 0);

  const grupos = {};
  gastosDelMes.forEach(m => { grupos[m.categoria] = (grupos[m.categoria]||0) + m.monto; });
  const cats = Object.entries(grupos).sort((a,b) => b[1]-a[1]);

  const svg = $('dona-svg');
  const centro = $('dona-centro');
  const leyenda = $('dona-leyenda');

  if (cats.length === 0) {
    svg.innerHTML = `<circle cx="80" cy="80" r="56" fill="none" stroke="#2a2f45" stroke-width="20"/>`;
    centro.innerHTML = `<div style="font-size:12px;color:#7b82a0">Sin gastos</div>`;
    leyenda.innerHTML = '';
    return;
  }

  const R = 56; const cx = 80; const cy = 80; const grosor = 20;
  let angulo = -Math.PI / 2;
  let segmentos = '';

  cats.forEach(([cat, monto], i) => {
    const pct = monto / total;
    const barr = pct * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angulo);
    const y1 = cy + R * Math.sin(angulo);
    const x2 = cx + R * Math.cos(angulo + barr);
    const y2 = cy + R * Math.sin(angulo + barr);
    const gran = barr > Math.PI ? 1 : 0;
    const color = PALETA[i % PALETA.length];
    if (pct >= 0.999) {
      segmentos += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${color}" stroke-width="${grosor}"/>`;
    } else {
      segmentos += `<path d="M${cx},${cy} L${x1},${y1} A${R},${R},0,${gran},1,${x2},${y2} Z" fill="${color}" opacity="0.85" style="cursor:pointer" data-cat="${esc(cat)}"/>`;
    }
    angulo += barr;
  });

  svg.innerHTML = segmentos + `<circle cx="${cx}" cy="${cy}" r="${R-grosor/2}" fill="#181c27"/>`;
  centro.innerHTML = `<div style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:700">${fmt(total)}</div><div style="font-size:11px;color:#7b82a0">gastos</div>`;

  leyenda.innerHTML = cats.slice(0,6).map(([cat, monto], i) => `
    <div class="leyenda-fila">
      <span class="leyenda-punto" style="background:${PALETA[i%PALETA.length]}"></span>
      <span class="leyenda-nombre">${esc(cat)}</span>
      <span class="leyenda-monto">${fmt(monto)}</span>
      <span class="leyenda-pct">${((monto/total)*100).toFixed(0)}%</span>
    </div>`).join('');
}

$('dona-prev').addEventListener('click', () => {
  const [a,m] = mesDona.split('-').map(Number);
  const d = new Date(a, m-2);
  mesDona = mesISO(d); renderDona();
});
$('dona-next').addEventListener('click', () => {
  const [a,m] = mesDona.split('-').map(Number);
  const d = new Date(a, m);
  mesDona = mesISO(d); renderDona();
});

// --- LÍNEA DE BALANCE ---
function renderLineaBalance() {
  const svg = $('grafica-linea');
  const labelsEl = $('grafica-linea-labels');
  const meses = [];
  const hoy = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i);
    meses.push(mesISO(d));
  }

  const valores = meses.map(mes => {
    const hasta = mes <= mesISO() ? mes : null;
    if (!hasta) return null;
    const movsHasta = movimientos.filter(m => m.fecha?.slice(0,7) <= mes);
    if (cuentas.length === 0) return movsHasta.reduce((acc,m) => acc + (m.tipo==='ingreso' ? m.monto : -m.monto), 0);
    return cuentas.reduce((acc, c) => {
      const delta = movsHasta.filter(m => m.cuenta_id === c.id)
        .reduce((s,m) => s + (m.tipo==='ingreso' ? m.monto : -m.monto), 0);
      return acc + c.saldo_inicial + delta;
    }, 0);
  }).filter(v => v !== null);

  if (valores.length < 2) { svg.innerHTML = ''; labelsEl.innerHTML = ''; return; }

  const W = 320; const H = 140; const pad = 20;
  const min = Math.min(...valores); const max = Math.max(...valores);
  const rng = max - min || 1;

  const pts = valores.map((v, i) => {
    const x = pad + (i / (valores.length-1)) * (W - pad*2);
    const y = H - pad - ((v - min) / rng) * (H - pad*2);
    return { x, y, v };
  });

  const line = pts.map((p,i) => (i===0?`M${p.x},${p.y}`:`L${p.x},${p.y}`)).join(' ');
  const area = `${line} L${pts[pts.length-1].x},${H-pad} L${pts[0].x},${H-pad} Z`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7fff00" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#7fff00" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#grad)"/>
    <path d="${line}" fill="none" stroke="#7fff00" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#7fff00"/>`).join('')}
  `;

  labelsEl.innerHTML = meses.slice(0, valores.length).map(m => `<span>${fmtMes(m)}</span>`).join('');
}

// --- DASH CUENTAS ---
function renderDashCuentas() {
  const el = $('dash-cuentas');
  const todas = [
    ...cuentas.map(c => ({ icono: ICONOS_TIPO[c.tipo]||'💰', nombre: c.nombre, tipo: c.tipo.replace('_',' '), saldo: saldoCuenta(c.id) })),
    ...deudas.filter(d => d.tipo === 'tarjeta_credito').map(d => ({ icono: '💳', nombre: d.nombre, tipo: 'Tarjeta (débito)', saldo: saldoTarjetaDebito(d.id) }))
  ];
  if (todas.length === 0) {
    el.innerHTML = `<p class="vacio">Sin cuentas. <button class="btn-sm" onclick="irTab('cuentas')">Agregar</button></p>`;
    return;
  }
  el.innerHTML = todas.map(c => `
    <div class="cuenta-fila">
      <div class="cuenta-info">
        <span class="cuenta-icono">${c.icono}</span>
        <div>
          <div class="cuenta-nombre">${esc(c.nombre)}</div>
          <div class="cuenta-tipo">${c.tipo}</div>
        </div>
      </div>
      <span class="cuenta-saldo ${c.saldo<0?'negativo':''}">${fmt(c.saldo)}</span>
    </div>`).join('');
}

// --- DASH AHORROS ---
function renderDashAhorros() {
  const el = $('dash-ahorros');
  if (metas.length === 0) {
    el.innerHTML = `<p class="vacio">Sin metas. <button class="btn-sm" onclick="irTab('ahorros')">Crear</button></p>`;
    return;
  }
  el.innerHTML = metas.map(m => {
    const pct = m.valor_objetivo > 0 ? Math.min((m.valor_ahorrado/m.valor_objetivo)*100,100) : 0;
    return `
      <div class="meta-fila">
        <div>
          <div class="meta-fila-nombre">${esc(m.nombre)}</div>
          <div class="barra" style="margin:6px 0 4px"><div class="barra-fill barra-ok" style="width:${pct}%"></div></div>
          <div class="meta-fila-prog">${fmt(m.valor_ahorrado)} / ${fmt(m.valor_objetivo)}</div>
        </div>
        <span style="font-family:'Space Grotesk';font-size:18px;font-weight:700;color:#7fff00">${pct.toFixed(0)}%</span>
      </div>`;
  }).join('');
}

// --- DASH ÚLTIMOS MOVS ---
function renderDashMovimientos() {
  const el = $('dash-movimientos');
  const ultimos = movimientos.slice(0, 8);
  if (ultimos.length === 0) { el.innerHTML = '<p class="vacio">Sin movimientos aún.</p>'; return; }
  el.innerHTML = ultimos.map(m => filaMovimiento(m)).join('');
}

// =============================================
// MOVIMIENTOS
// =============================================
function filaMovimiento(m) {
  const cuenta = m.cuenta_id ? (cuentas.find(c=>c.id===m.cuenta_id)?.nombre||'?') : 'Sin cuenta';
  return `
    <div class="mov-fila">
      <span class="mov-tipo-dot ${m.tipo}">${m.tipo==='ingreso'?'↑':'↓'}</span>
      <div class="mov-info">
        <div class="mov-categoria">${esc(m.categoria)}</div>
        <div class="mov-detalle">${fmtFecha(m.fecha)}${m.nota?' · '+esc(m.nota):''}</div>
      </div>
      <span class="mov-cuenta-tag">${esc(cuenta)}</span>
      <span class="mov-monto ${m.tipo==='ingreso'?'positivo':'negativo'}">${m.tipo==='ingreso'?'+':'-'}${fmt(m.monto)}</span>
      <div class="mov-acciones">
        <button onclick="editarMovimiento('${m.id}')">Editar</button>
        <button class="btn-danger" onclick="eliminarMovimiento('${m.id}')">×</button>
      </div>
    </div>`;
}

function renderMovimientos() {
  const mes = $('filtro-mes').value || mesISO();
  const cuentaFiltro = $('filtro-cuenta').value;
  const tipoFiltro = $('filtro-tipo').value;

  // Llenar selector de cuentas
  $('filtro-cuenta').innerHTML = `<option value="">Todas</option>` +
    cuentas.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  if (cuentaFiltro) $('filtro-cuenta').value = cuentaFiltro;

  const filtrados = movimientos.filter(m => {
    if (m.fecha?.slice(0,7) !== mes) return false;
    if (cuentaFiltro && m.cuenta_id !== cuentaFiltro) return false;
    if (tipoFiltro && m.tipo !== tipoFiltro) return false;
    return true;
  });

  const el = $('lista-movimientos');
  el.innerHTML = filtrados.length === 0
    ? '<p class="vacio">No hay movimientos para este filtro.</p>'
    : filtrados.map(filaMovimiento).join('');
}

// Filtros
$('filtro-mes').value = mesISO();
['filtro-mes','filtro-cuenta','filtro-tipo'].forEach(id => $(`${id}`).addEventListener('change', renderMovimientos));

// Modal nuevo movimiento
$('btn-nuevo-mov').addEventListener('click', () => abrirModalMovimiento());

function abrirModalMovimiento(id) {
  const mov = id ? movimientos.find(m => m.id === id) : null;
  const tipoIni = mov?.tipo || 'gasto';

  // Historial de categorías ordenado por frecuencia
  const freq = {};
  movimientos.filter(m => m.tipo === tipoIni).forEach(m => { freq[m.categoria] = (freq[m.categoria]||0)+1; });
  const sugeridas = Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([c])=>c);

  const opCuentas = [
    ...cuentas.map(c => `<option value="${c.id}" ${mov?.cuenta_id===c.id?'selected':''}>${esc(c.nombre)}</option>`),
    ...deudas.filter(d => d.tipo === 'tarjeta_credito').map(d => `<option value="tarjeta:${d.id}" ${mov?.cuenta_id===d.id||mov?.cuenta_id===('tarjeta:'+d.id)?'selected':''}>💳 ${esc(d.nombre)}</option>`)
  ].join('');

  abrirModal(`
    <h3>${mov ? 'Editar' : 'Nuevo'} movimiento</h3>
    <div class="toggle-tipo">
      <button type="button" id="tog-ing" class="${tipoIni==='ingreso'?'activo-ingreso':''}">↑ Ingreso</button>
      <button type="button" id="tog-gas" class="${tipoIni==='gasto'?'activo-gasto':''}">↓ Gasto</button>
    </div>
    <input type="hidden" id="m-tipo" value="${tipoIni}">
    <div class="campo">
      <label>Monto</label>
      <input type="number" id="m-monto" min="0" value="${mov?.monto||''}" placeholder="0">
    </div>
    <div class="campo">
      <label>Categoría</label>
      <input type="text" id="m-categoria" list="m-cats-dl" autocomplete="off"
        value="${mov?.categoria||''}" placeholder="Comida, Transporte, Salario...">
      <datalist id="m-cats-dl">${sugeridas.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
    </div>
    <div class="campo">
      <label>Cuenta</label>
      <select id="m-cuenta">${opCuentas}</select>
    </div>
    <div class="campo">
      <label>Fecha</label>
      <input type="date" id="m-fecha" value="${mov?.fecha||hoyISO()}">
    </div>
    <div class="campo">
      <label>Nota (opcional)</label>
      <input type="text" id="m-nota" value="${mov?.nota||''}" placeholder="Ej: Mercado del mes">
    </div>
    <div class="modal-acciones">
      <button class="btn-outline" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" id="btn-gm">Guardar</button>
    </div>
  `);

  function actToggle(tipo) {
    $('m-tipo').value = tipo;
    $('tog-ing').className = tipo==='ingreso'?'activo-ingreso':'';
    $('tog-gas').className = tipo==='gasto'?'activo-gasto':'';
    // actualizar sugerencias
    const f2 = {};
    movimientos.filter(m=>m.tipo===tipo).forEach(m=>{f2[m.categoria]=(f2[m.categoria]||0)+1;});
    const s2 = Object.entries(f2).sort((a,b)=>b[1]-a[1]).map(([c])=>c);
    $('m-cats-dl').innerHTML = s2.map(c=>`<option value="${esc(c)}">`).join('');
  }

  $('tog-ing').addEventListener('click', () => actToggle('ingreso'));
  $('tog-gas').addEventListener('click', () => actToggle('gasto'));

  $('btn-gm').addEventListener('click', async () => {
    const payload = {
      tipo: $('m-tipo').value,
      monto: parseFloat($('m-monto').value),
      categoria: $('m-categoria').value.trim(),
      cuenta_id: $('m-cuenta').value?.replace('tarjeta:', '') || null,
      fecha: $('m-fecha').value,
      nota: $('m-nota').value.trim() || null,
    };
    if (!payload.monto || payload.monto <= 0) return alert('Ingresa un monto válido');
    if (!payload.categoria) return alert('Ingresa una categoría');

    let error;
    if (mov) {
      ({ error } = await db.from('movimientos').update(payload).eq('id', mov.id));
    } else {
      ({ error } = await db.from('movimientos').insert(payload));
    }
    if (error) return alert('Error: ' + error.message);

    // Guardar memoria de categoría si hay config de categorías
    if (payload.categoria && config.categorias?.length) {
      // se guarda en memoria para autocompletar — no bloqueamos si falla
      db.from('categoria_memoria').upsert(
        { categoria: payload.categoria },
        { onConflict: 'user_id,categoria' }
      ).then(() => {});
    }

    cerrarModal();
    await cargarMovimientos();
    renderTodo();
  });
}

async function editarMovimiento(id) { abrirModalMovimiento(id); }

async function eliminarMovimiento(id) {
  if (!confirm('¿Eliminar este movimiento?')) return;
  await db.from('movimientos').delete().eq('id', id);
  await cargarMovimientos();
  renderTodo();
}

// =============================================
// CUENTAS
// =============================================
function renderCuentas() {
  const el = $('grid-cuentas');
  const tarjetasDebito = deudas.filter(d => d.tipo === 'tarjeta_credito');

  if (cuentas.length === 0 && tarjetasDebito.length === 0) {
    el.innerHTML = `<div class="vacio" style="grid-column:1/-1">Sin cuentas. Agrega una para empezar.</div>`;
    return;
  }

  const cardsCuentas = cuentas.map(c => {
    const saldo = saldoCuenta(c.id);
    return `
      <div class="cuenta-card">
        <div class="cuenta-card-top">
          <span class="cuenta-card-icono">${ICONOS_TIPO[c.tipo]||'💰'}</span>
          <div class="fila-acciones-sm">
            <button class="btn-ghost" onclick="abrirModalCuenta('${c.id}')">Editar</button>
            <button class="btn-danger" onclick="eliminarCuenta('${c.id}')">×</button>
          </div>
        </div>
        <div class="cuenta-card-nombre">${esc(c.nombre)}</div>
        <div class="cuenta-card-tipo">${c.tipo.replace('_',' ')}</div>
        <div class="cuenta-card-saldo ${saldo<0?'negativo':''}">${fmt(saldo)}</div>
        <div class="barra"><div class="barra-fill barra-ok" style="width:100%"></div></div>
      </div>`;
  });

  const cardsTarjetas = tarjetasDebito.map(d => {
    const saldo = saldoTarjetaDebito(d.id);
    return `
      <div class="cuenta-card" style="border-color:rgba(108,138,255,0.3)">
        <div class="cuenta-card-top">
          <span class="cuenta-card-icono">💳</span>
          <div class="fila-acciones-sm">
            <button class="btn-ghost" onclick="irTab('deudas')">Ver deuda</button>
          </div>
        </div>
        <div class="cuenta-card-nombre">${esc(d.nombre)}</div>
        <div class="cuenta-card-tipo">Tarjeta de crédito (débito)</div>
        <div class="cuenta-card-saldo ${saldo<0?'negativo':''}">${fmt(saldo)}</div>
        <div class="barra"><div class="barra-fill" style="width:100%;background:#7fff00;opacity:0.5"></div></div>
      </div>`;
  });

  el.innerHTML = [...cardsCuentas, ...cardsTarjetas].join('');
}

function abrirModalCuenta(id) {
  const c = id ? cuentas.find(x=>x.id===id) : null;
  const saldoActual = c ? saldoCuenta(c.id) : 0;
  const delta = c ? movimientos.filter(m=>m.cuenta_id===c.id)
    .reduce((acc,m)=>acc+(m.tipo==='ingreso'?m.monto:-m.monto),0) : 0;

  abrirModal(`
    <h3>${c?'Editar':'Nueva'} cuenta</h3>
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="cta-nom" value="${c?esc(c.nombre):''}" placeholder="Ej: Nequi, LuloBank, Efectivo">
    </div>
    <div class="campo">
      <label>Tipo</label>
      <select id="cta-tipo">
        <option value="banco" ${c?.tipo==='banco'?'selected':''}>🏦 Banco / Débito</option>
        <option value="billetera_digital" ${c?.tipo==='billetera_digital'?'selected':''}>📱 Billetera digital</option>
        <option value="efectivo" ${c?.tipo==='efectivo'?'selected':''}>💵 Efectivo</option>
      </select>
    </div>
    <div class="campo">
      <label>${c?'Saldo actual real':'Saldo inicial'}</label>
      <input type="number" id="cta-saldo" value="${saldoActual}" placeholder="0">
      ${c&&delta!==0?`<small style="color:#7b82a0;font-size:11px;margin-top:4px;display:block">Movimientos registrados: ${fmt(delta)}</small>`:''}
    </div>
    <div class="modal-acciones">
      <button class="btn-outline" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" id="btn-gcta">Guardar</button>
    </div>
  `);

  $('btn-gcta').addEventListener('click', async () => {
    const saldoDeseado = parseFloat($('cta-saldo').value) || 0;
    const payload = {
      nombre: $('cta-nom').value.trim(),
      tipo: $('cta-tipo').value,
      saldo_inicial: saldoDeseado - delta,
      orden: c ? c.orden : cuentas.length + 1,
    };
    if (!payload.nombre) return alert('Escribe un nombre');
    let error;
    if (c) {
      ({ error } = await db.from('cuentas').update(payload).eq('id', c.id));
    } else {
      ({ error } = await db.from('cuentas').insert(payload));
    }
    if (error) return alert('Error: ' + error.message);
    cerrarModal();
    await Promise.all([cargarCuentas(), cargarMovimientos()]);
    renderTodo();
  });
}

async function eliminarCuenta(id) {
  if (!confirm('¿Eliminar esta cuenta?')) return;
  await db.from('cuentas').update({ activa: false }).eq('id', id);
  await cargarCuentas();
  renderTodo();
}

// =============================================
// DEUDAS
// =============================================
function renderDeudas() {
  const el = $('lista-deudas');
  if (deudas.length === 0) {
    el.innerHTML = '<p class="vacio">Sin deudas registradas.</p>'; return;
  }

  const prestamos = deudas.filter(d => d.tipo !== 'tarjeta_credito');
  const tarjetas  = deudas.filter(d => d.tipo === 'tarjeta_credito');

  const htmlPrestamos = prestamos.length === 0 ? '' : `
    <h4 style="color:#7b82a0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">📋 Préstamos</h4>
    ${prestamos.map(d => {
      const saldo = Math.max((d.monto_total||0) - (d.pagado_acumulado||0), 0);
      const pct = d.monto_total > 0 ? Math.min((d.pagado_acumulado/d.monto_total)*100,100) : 0;
      const cuota = d.pago_mensual_planeado || 0;
      const meses = cuota > 0 ? Math.ceil(saldo/cuota) : '?';
      return `
        <div class="deuda-card" style="margin-bottom:12px">
          <div class="deuda-header">
            <div class="deuda-nombre">${esc(d.nombre)}</div>
            <div style="display:flex;gap:8px;">
              <button class="btn-ghost" onclick="abrirModalDeuda('${d.id}')">Editar</button>
              <button class="btn-danger" onclick="eliminarDeuda('${d.id}')">×</button>
            </div>
          </div>
          <div class="deuda-datos">
            <div class="deuda-dato"><span>Total deuda</span><strong>${fmt(d.monto_total)}</strong></div>
            <div class="deuda-dato"><span>Pagado</span><strong class="positivo">${fmt(d.pagado_acumulado)}</strong></div>
            <div class="deuda-dato"><span>Saldo restante</span><strong class="negativo">${fmt(saldo)}</strong></div>
            <div class="deuda-dato"><span>Cuota mensual</span><strong>${fmt(cuota)}</strong></div>
            <div class="deuda-dato"><span>Meses restantes</span><strong>${meses}</strong></div>
            <div class="deuda-dato"><span>Avance</span><strong>${pct.toFixed(0)}%</strong></div>
          </div>
          <div class="barra">
            <div class="barra-fill barra-ok" style="width:${pct}%"></div>
          </div>
          <div class="deuda-footer">
            <span></span>
            <button class="btn-pagar" onclick="pagarDeuda('${d.id}')">💳 Registrar pago</button>
          </div>
        </div>`;
    }).join('')}`;

  const htmlTarjetas = tarjetas.length === 0 ? '' : `
    <h4 style="color:#7b82a0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin:16px 0 10px;">💳 Tarjetas de crédito</h4>
    ${tarjetas.map(d => {
      const corte = cortes.find(c => c.deuda_id === d.id);
      const pagadoMes = corte?.pagado || false;
      const montoCuota = corte?.monto_corte || 0;
      const gastadoTarjeta = saldoTarjetaDebito(d.id);
      const cupoUsado = Math.abs(Math.min(gastadoTarjeta, 0));
      const cupoTotal = d.cupo || 0;
      const cupoDisp = cupoTotal > 0 ? cupoTotal - cupoUsado : null;
      const pctCupo = cupoTotal > 0 ? Math.min((cupoUsado/cupoTotal)*100,100) : 0;

      let alerta = ''; let alertaClass = '';
      if (corte?.fecha_limite && !pagadoMes) {
        const dias = Math.ceil((new Date(corte.fecha_limite) - new Date())/(1000*60*60*24));
        if (dias <= 0) { alerta = '⚠ Fecha límite vencida'; alertaClass = 'vencida'; }
        else if (dias <= 5) { alerta = `⏰ Vence en ${dias} días`; alertaClass = 'vence-pronto'; }
      }

      return `
        <div class="deuda-card" style="margin-bottom:12px;border-color:rgba(108,138,255,0.25)">
          <div class="deuda-header">
            <div>
              <div class="deuda-nombre">💳 ${esc(d.nombre)}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span class="badge ${pagadoMes?'badge-ok':'badge-pend'}">${pagadoMes?'Pagado este mes':'Pendiente'}</span>
              <button class="btn-ghost" onclick="abrirModalDeuda('${d.id}')">Editar</button>
              <button class="btn-danger" onclick="eliminarDeuda('${d.id}')">×</button>
            </div>
          </div>
          <div class="deuda-datos">
            ${cupoTotal > 0 ? `<div class="deuda-dato"><span>Cupo total</span><strong>${fmt(cupoTotal)}</strong></div>` : ''}
            ${cupoDisp !== null ? `<div class="deuda-dato"><span>Cupo disponible</span><strong class="${cupoDisp<0?'negativo':'positivo'}">${fmt(cupoDisp)}</strong></div>` : ''}
            ${d.dia_corte ? `<div class="deuda-dato"><span>Día de corte</span><strong>Día ${d.dia_corte}</strong></div>` : ''}
            ${montoCuota > 0 ? `<div class="deuda-dato"><span>Cuota este mes</span><strong>${fmt(montoCuota)}</strong></div>` : ''}
            ${d.dia_limite_pago ? `<div class="deuda-dato"><span>Límite de pago</span><strong>Día ${d.dia_limite_pago}</strong></div>` : ''}
          </div>
          ${cupoTotal > 0 ? `<div class="barra"><div class="barra-fill ${pctCupo>=90?'barra-over':pctCupo>=70?'barra-warn':'barra-ok'}" style="width:${pctCupo}%"></div></div>` : ''}
          <div class="deuda-footer">
            <span class="deuda-alerta ${alertaClass}">${alerta}</span>
            <div class="deuda-acciones">
              <button class="btn-outline btn-sm" onclick="abrirModalCorte('${d.id}')">Registrar corte</button>
              ${montoCuota>0&&!pagadoMes?`<button class="btn-pagar" onclick="pagarDeuda('${d.id}')">💳 Pagar corte</button>`:''}
            </div>
          </div>
        </div>`;
    }).join('')}`;

  el.innerHTML = htmlPrestamos + htmlTarjetas;
}

function abrirModalDeuda(id) {
  const d = id ? deudas.find(x=>x.id===id) : null;
  const tipoIni = d?.tipo || 'prestamo';

  abrirModal(`
    <h3>${d?'Editar':'Nueva'} deuda</h3>
    <div class="toggle-tipo" style="margin-bottom:16px;">
      <button type="button" id="deu-tog-p" class="${tipoIni==='prestamo'?'activo-ingreso':''}">📋 Préstamo</button>
      <button type="button" id="deu-tog-t" class="${tipoIni==='tarjeta_credito'?'activo-gasto':''}">💳 Tarjeta crédito</button>
    </div>
    <input type="hidden" id="deu-tipo" value="${tipoIni}">
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="deu-nom" value="${d?esc(d.nombre):''}" placeholder="Ej: Préstamo banco / Visa Platino">
    </div>

    <div id="deu-campos-prestamo" class="${tipoIni==='tarjeta_credito'?'oculto':''}">
      <div class="campo">
        <label>Monto total</label>
        <input type="number" id="deu-total" min="0" value="${d?.monto_total||''}" placeholder="0">
      </div>
      <div class="campo">
        <label>Pagado hasta ahora</label>
        <input type="number" id="deu-pagado" min="0" value="${d?.pagado_acumulado||0}" placeholder="0">
      </div>
      <div class="campo">
        <label>Cuota mensual</label>
        <input type="number" id="deu-cuota" min="0" value="${d?.pago_mensual_planeado||''}" placeholder="0">
      </div>
    </div>

    <div id="deu-campos-tarjeta" class="${tipoIni==='prestamo'?'oculto':''}">
      <div class="campo">
        <label>Cupo total de la tarjeta</label>
        <input type="number" id="deu-cupo" min="0" value="${d?.cupo||''}" placeholder="0">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="campo">
          <label>Día de corte</label>
          <input type="number" id="deu-corte" min="1" max="31" value="${d?.dia_corte||''}" placeholder="15">
        </div>
        <div class="campo">
          <label>Día límite pago</label>
          <input type="number" id="deu-limite" min="1" max="31" value="${d?.dia_limite_pago||''}" placeholder="5">
        </div>
      </div>
    </div>

    <div class="modal-acciones">
      <button class="btn-outline" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" id="btn-gdeu">Guardar</button>
    </div>
  `);

  $('deu-tog-p').addEventListener('click', () => {
    $('deu-tipo').value = 'prestamo';
    $('deu-tog-p').className = 'activo-ingreso';
    $('deu-tog-t').className = '';
    $('deu-campos-prestamo').classList.remove('oculto');
    $('deu-campos-tarjeta').classList.add('oculto');
  });
  $('deu-tog-t').addEventListener('click', () => {
    $('deu-tipo').value = 'tarjeta_credito';
    $('deu-tog-t').className = 'activo-gasto';
    $('deu-tog-p').className = '';
    $('deu-campos-tarjeta').classList.remove('oculto');
    $('deu-campos-prestamo').classList.add('oculto');
  });

  $('btn-gdeu').addEventListener('click', async () => {
    const tipo = $('deu-tipo').value;
    const payload = {
      nombre: $('deu-nom').value.trim(),
      tipo,
      monto_total: tipo === 'prestamo' ? (parseFloat($('deu-total').value) || 0) : 0,
      pagado_acumulado: tipo === 'prestamo' ? (parseFloat($('deu-pagado').value) || 0) : 0,
      pago_mensual_planeado: tipo === 'prestamo' ? (parseFloat($('deu-cuota').value) || 0) : 0,
      cupo: tipo === 'tarjeta_credito' ? (parseFloat($('deu-cupo').value) || 0) : null,
      dia_corte: tipo === 'tarjeta_credito' ? (parseInt($('deu-corte').value) || null) : null,
      dia_limite_pago: tipo === 'tarjeta_credito' ? (parseInt($('deu-limite').value) || null) : null,
    };
    if (!payload.nombre) return alert('Escribe un nombre');
    let error;
    if (d) {
      ({ error } = await db.from('deudas').update(payload).eq('id', d.id));
    } else {
      ({ error } = await db.from('deudas').insert(payload));
    }
    if (error) return alert('Error: ' + error.message);
    cerrarModal();
    await Promise.all([cargarDeudas(), cargarCortes()]);
    renderTodo();
  });
}

function abrirModalCorte(deudaId) {
  const d = deudas.find(x=>x.id===deudaId);
  const corteExist = cortes.find(c=>c.deuda_id===deudaId);
  const mes = mesISO();
  let fechaLimSug = '';
  if (d?.dia_limite_pago) {
    const hoy = new Date();
    let fl = new Date(hoy.getFullYear(), hoy.getMonth(), d.dia_limite_pago);
    if (fl < hoy) fl.setMonth(fl.getMonth()+1);
    fechaLimSug = fl.toISOString().slice(0,10);
  }

  abrirModal(`
    <h3>Corte de ${esc(d?.nombre||'')} — ${fmtMes(mes)}</h3>
    <div class="campo">
      <label>Monto a pagar este corte</label>
      <input type="number" id="crt-monto" value="${corteExist?.monto_corte||d?.pago_mensual_planeado||''}" placeholder="0">
    </div>
    <div class="campo">
      <label>Fecha límite de pago</label>
      <input type="date" id="crt-fecha" value="${corteExist?.fecha_limite||fechaLimSug}">
    </div>
    <div class="modal-acciones">
      <button class="btn-outline" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" id="btn-gcrt">Guardar corte</button>
    </div>
  `);

  $('btn-gcrt').addEventListener('click', async () => {
    const monto = parseFloat($('crt-monto').value);
    if (!monto || monto <= 0) return alert('Ingresa el monto');
    const { error } = await db.from('tarjeta_cortes').upsert(
      { deuda_id: deudaId, mes, monto_corte: monto, fecha_limite: $('crt-fecha').value || null },
      { onConflict: 'deuda_id,mes' }
    );
    if (error) return alert('Error: ' + error.message);
    cerrarModal();
    await cargarCortes();
    renderDeudas();
    renderDashboard();
  });
}

function pagarDeuda(deudaId) {
  const d = deudas.find(x=>x.id===deudaId);
  const corte = cortes.find(c=>c.deuda_id===deudaId);
  const monto = corte?.monto_corte || d?.pago_mensual_planeado || 0;
  const opCuentas = cuentas.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join('');

  abrirModal(`
    <h3>Pagar — ${esc(d?.nombre||'')}</h3>
    <p style="color:#7b82a0;font-size:13px;margin-bottom:16px">Cuota del mes: ${fmt(monto)}</p>
    <div class="campo">
      <label>Monto</label>
      <input type="number" id="pag-monto" value="${monto}" min="0">
    </div>
    <div class="campo">
      <label>Pagar desde</label>
      <select id="pag-cuenta">${opCuentas}</select>
    </div>
    <div class="modal-acciones">
      <button class="btn-outline" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" id="btn-gpag">Confirmar pago</button>
    </div>
  `);

  $('btn-gpag').addEventListener('click', async () => {
    const mnt = parseFloat($('pag-monto').value);
    if (!mnt || mnt <= 0) return alert('Monto inválido');
    const cuentaId = $('pag-cuenta').value;

    // Crear movimiento de gasto
    const { error: eM } = await db.from('movimientos').insert({
      tipo: 'gasto', monto: mnt, categoria: 'Pago de deuda',
      cuenta_id: cuentaId, fecha: hoyISO(), nota: `Pago: ${d.nombre}`,
    });
    if (eM) return alert('Error: ' + eM.message);

    // Actualizar pagado_acumulado
    await db.from('deudas').update({ pagado_acumulado: (d.pagado_acumulado||0) + mnt }).eq('id', d.id);

    // Marcar corte como pagado
    if (corte) await db.from('tarjeta_cortes').update({ pagado: true }).eq('id', corte.id);
    else await db.from('tarjeta_cortes').insert({
      deuda_id: deudaId, mes: mesISO(), monto_corte: mnt, pagado: true
    });

    cerrarModal();
    await Promise.all([cargarDeudas(), cargarMovimientos(), cargarCortes()]);
    renderTodo();
  });
}

async function eliminarDeuda(id) {
  if (!confirm('¿Eliminar esta deuda?')) return;
  await db.from('deudas').update({ activa: false }).eq('id', id);
  await cargarDeudas();
  renderTodo();
}

// =============================================
// METAS DE AHORRO
// =============================================
function renderMetas() {
  const el = $('lista-metas');
  if (metas.length === 0) {
    el.innerHTML = '<p class="vacio" style="grid-column:1/-1">Sin metas de ahorro. Crea una para empezar.</p>'; return;
  }
  el.innerHTML = metas.map(m => {
    const pct = m.valor_objetivo > 0 ? Math.min((m.valor_ahorrado/m.valor_objetivo)*100,100) : 0;
    const falta = Math.max(m.valor_objetivo - m.valor_ahorrado, 0);
    return `
      <div class="meta-card">
        <div class="meta-header">
          <div class="meta-nombre">${esc(m.nombre)}</div>
          <div class="meta-pct">${pct.toFixed(0)}%</div>
        </div>
        <div class="barra" style="margin-bottom:14px">
          <div class="barra-fill barra-ok" style="width:${pct}%"></div>
        </div>
        <div class="meta-datos">
          <div class="meta-dato"><span>Objetivo</span><strong>${fmt(m.valor_objetivo)}</strong></div>
          <div class="meta-dato"><span>Ahorrado</span><strong>${fmt(m.valor_ahorrado)}</strong></div>
          <div class="meta-dato"><span>Falta</span><strong>${fmt(falta)}</strong></div>
        </div>
        <div class="meta-footer">
          <span class="meta-fecha">${m.fecha_objetivo?'Meta: '+fmtFecha(m.fecha_objetivo):''}</span>
          <div class="meta-acciones">
            <button class="btn-sm" onclick="abonarMeta('${m.id}')">+ Abonar</button>
            <button class="btn-ghost" onclick="abrirModalMeta('${m.id}')">Editar</button>
            <button class="btn-danger" onclick="eliminarMeta('${m.id}')">×</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function abrirModalMeta(id) {
  const m = id ? metas.find(x=>x.id===id) : null;
  abrirModal(`
    <h3>${m?'Editar':'Nueva'} meta</h3>
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="met-nom" value="${m?esc(m.nombre):''}" placeholder="Ej: Moto, Vacaciones, Fondo">
    </div>
    <div class="campo">
      <label>Valor objetivo</label>
      <input type="number" id="met-obj" min="0" value="${m?.valor_objetivo||''}" placeholder="0">
    </div>
    <div class="campo">
      <label>Ya ahorrado</label>
      <input type="number" id="met-aho" min="0" value="${m?.valor_ahorrado||0}" placeholder="0">
    </div>
    <div class="campo">
      <label>Fecha objetivo (opcional)</label>
      <input type="date" id="met-fecha" value="${m?.fecha_objetivo||''}">
    </div>
    <div class="modal-acciones">
      <button class="btn-outline" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" id="btn-gmet">Guardar</button>
    </div>
  `);

  $('btn-gmet').addEventListener('click', async () => {
    const payload = {
      nombre: $('met-nom').value.trim(),
      valor_objetivo: parseFloat($('met-obj').value) || 0,
      valor_ahorrado: parseFloat($('met-aho').value) || 0,
      fecha_objetivo: $('met-fecha').value || null,
    };
    if (!payload.nombre || !payload.valor_objetivo) return alert('Completa nombre y objetivo');
    let error;
    if (m) { ({ error } = await db.from('metas_ahorro').update(payload).eq('id', m.id)); }
    else { ({ error } = await db.from('metas_ahorro').insert(payload)); }
    if (error) return alert('Error: ' + error.message);
    cerrarModal();
    await cargarMetas();
    renderTodo();
  });
}

function abonarMeta(metaId) {
  const m = metas.find(x=>x.id===metaId);
  const opCuentas = cuentas.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join('');

  abrirModal(`
    <h3>Abonar a "${esc(m?.nombre||'')}"</h3>
    <p style="color:#7b82a0;font-size:13px;margin-bottom:16px">
      Ahorrado: ${fmt(m?.valor_ahorrado)} / ${fmt(m?.valor_objetivo)}
    </p>
    <div class="campo">
      <label>Monto a apartar</label>
      <input type="number" id="abo-monto" min="0" placeholder="0">
    </div>
    <div class="campo">
      <label>Desde cuenta</label>
      <select id="abo-cuenta">${opCuentas}</select>
    </div>
    <div class="modal-acciones">
      <button class="btn-outline" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" id="btn-gabo">Abonar</button>
    </div>
  `);

  $('btn-gabo').addEventListener('click', async () => {
    const mnt = parseFloat($('abo-monto').value);
    if (!mnt || mnt <= 0) return alert('Monto inválido');
    const cuentaId = $('abo-cuenta').value;

    await db.from('movimientos').insert({
      tipo: 'gasto', monto: mnt, categoria: 'Ahorro',
      cuenta_id: cuentaId, fecha: hoyISO(), nota: m.nombre,
    });
    await db.from('metas_ahorro').update({ valor_ahorrado: (m.valor_ahorrado||0)+mnt }).eq('id', metaId);

    cerrarModal();
    await Promise.all([cargarMetas(), cargarMovimientos()]);
    renderTodo();
  });
}

async function eliminarMeta(id) {
  if (!confirm('¿Eliminar esta meta?')) return;
  await db.from('metas_ahorro').update({ activa: false }).eq('id', id);
  await cargarMetas();
  renderTodo();
}

// =============================================
// PRESUPUESTO
// =============================================
function renderPresupuesto() {
  const ingreso = config.ingreso_mensual || 0;
  const mes = mesISO();
  const gastado = gastosMes(mes);
  const disp = ingreso - gastado;

  $('p-ingreso').textContent = fmt(ingreso);
  $('p-gastado').textContent = fmt(gastado);
  $('p-disponible').textContent = fmt(disp);
  $('p-disponible').className = 'kpi-value ' + (disp < 0 ? 'negativo' : '');

  // Distribución por categoría
  const cats = config.categorias || [];
  const gastosMes_ = movimientos.filter(m => m.tipo==='gasto' && m.fecha?.slice(0,7)===mes);

  const el = $('presupuesto-categorias');
  if (cats.length === 0) {
    el.innerHTML = `<p class="vacio">Configura tu ingreso y categorías para ver la distribución. <button class="btn-sm" onclick="abrirModalConfig()">Configurar</button></p>`;
    return;
  }

  el.innerHTML = cats.map((cat, i) => {
    const presupCat = ingreso * (cat.porcentaje / 100);
    const gastadoCat = gastosMes_
      .filter(m => (m.categoria_grande||m.categoria) === cat.nombre)
      .reduce((acc,m) => acc+m.monto, 0);
    const dispCat = presupCat - gastadoCat;
    const pct = presupCat > 0 ? Math.min((gastadoCat/presupCat)*100,100) : 0;
    const estado = gastadoCat > presupCat ? 'barra-over' : pct >= 80 ? 'barra-warn' : 'barra-ok';

    return `
      <div class="presu-cat">
        <div class="presu-cat-header">
          <span class="presu-cat-nombre" style="display:flex;align-items:center;gap:8px;">
            <span style="width:10px;height:10px;border-radius:3px;background:${PALETA[i%PALETA.length]};display:inline-block"></span>
            ${esc(cat.nombre)}
          </span>
          <span class="presu-cat-pct">${cat.porcentaje}% del ingreso</span>
        </div>
        <div class="barra">
          <div class="barra-fill ${estado}" style="width:${pct}%"></div>
        </div>
        <div class="presu-cat-cifras">
          <div class="presu-cifra"><span>Presupuesto</span><strong>${fmt(presupCat)}</strong></div>
          <div class="presu-cifra"><span>Gastado</span><strong class="${gastadoCat>presupCat?'negativo':''}">${fmt(gastadoCat)}</strong></div>
          <div class="presu-cifra"><span>Disponible</span><strong class="${dispCat<0?'negativo':'positivo'}">${fmt(dispCat)}</strong></div>
        </div>
      </div>`;
  }).join('');
}

function abrirModalConfig() {
  const cats = config.categorias || [];
  const total = cats.reduce((acc,c) => acc+c.porcentaje, 0);

  abrirModal(`
    <h3>Configurar presupuesto</h3>
    <div class="campo">
      <label>Ingreso mensual</label>
      <input type="number" id="cfg-ingreso" value="${config.ingreso_mensual||0}" placeholder="0">
    </div>
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <label style="font-size:12px;font-weight:600;color:#7b82a0;text-transform:uppercase;letter-spacing:0.04em">Categorías</label>
        <button class="btn-sm" id="btn-add-cat">+ Agregar</button>
      </div>
      <div id="cfg-cats">
        ${cats.map((c,i) => `
          <div style="display:grid;grid-template-columns:1fr 80px 28px;gap:8px;margin-bottom:8px;" data-i="${i}">
            <input type="text" class="cfg-cat-nom" value="${esc(c.nombre)}" placeholder="Ej: Obligaciones"
              style="background:#1e2335;border:1px solid #2a2f45;border-radius:8px;padding:8px 10px;color:#e8eaf0;font-size:13px;">
            <div style="display:flex;align-items:center;gap:4px;">
              <input type="number" class="cfg-cat-pct" value="${c.porcentaje}" min="0" max="100"
                style="background:#1e2335;border:1px solid #2a2f45;border-radius:8px;padding:8px;color:#e8eaf0;font-size:13px;width:100%;">
              <span style="color:#7b82a0;font-size:12px">%</span>
            </div>
            <button class="btn-danger cfg-rm" style="padding:4px;">×</button>
          </div>`).join('')}
      </div>
      <div id="cfg-suma" style="font-size:12px;margin-top:8px;color:${Math.abs(total-100)<=0.5?'#3ecf8e':'#f5a623'}">
        Suma: ${total}% ${Math.abs(total-100)<=0.5?'✓':'(debe ser 100%)'}
      </div>
    </div>
    <div class="modal-acciones">
      <button class="btn-outline" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" id="btn-gcfg">Guardar</button>
    </div>
  `);

  function actualizarSuma() {
    const pcts = [...document.querySelectorAll('.cfg-cat-pct')].map(i=>parseFloat(i.value)||0);
    const s = pcts.reduce((a,b)=>a+b,0);
    $('cfg-suma').textContent = `Suma: ${s}% ${Math.abs(s-100)<=0.5?'✓':'(debe ser 100%)'}`;
    $('cfg-suma').style.color = Math.abs(s-100)<=0.5?'#3ecf8e':'#f5a623';
  }

  $('btn-add-cat').addEventListener('click', () => {
    const div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:1fr 80px 28px;gap:8px;margin-bottom:8px;';
    div.innerHTML = `
      <input type="text" class="cfg-cat-nom" placeholder="Nombre"
        style="background:#1e2335;border:1px solid #2a2f45;border-radius:8px;padding:8px 10px;color:#e8eaf0;font-size:13px;">
      <div style="display:flex;align-items:center;gap:4px;">
        <input type="number" class="cfg-cat-pct" value="0" min="0" max="100"
          style="background:#1e2335;border:1px solid #2a2f45;border-radius:8px;padding:8px;color:#e8eaf0;font-size:13px;width:100%;">
        <span style="color:#7b82a0;font-size:12px">%</span>
      </div>
      <button class="btn-danger cfg-rm" style="padding:4px;">×</button>`;
    $('cfg-cats').appendChild(div);
    div.querySelector('.cfg-cat-pct').addEventListener('input', actualizarSuma);
    div.querySelector('.cfg-rm').addEventListener('click', () => { div.remove(); actualizarSuma(); });
  });

  document.querySelectorAll('.cfg-cat-pct').forEach(i => i.addEventListener('input', actualizarSuma));
  document.querySelectorAll('.cfg-rm').forEach(btn => btn.addEventListener('click', (e) => {
    e.target.closest('[style]').remove(); actualizarSuma();
  }));

  $('btn-gcfg').addEventListener('click', async () => {
    const ingreso = parseFloat($('cfg-ingreso').value) || 0;
    const noms = [...document.querySelectorAll('.cfg-cat-nom')].map(i=>i.value.trim());
    const pcts = [...document.querySelectorAll('.cfg-cat-pct')].map(i=>parseFloat(i.value)||0);
    const nuevasCats = noms.map((n,i) => ({ nombre: n, porcentaje: pcts[i] })).filter(c=>c.nombre);
    const suma = pcts.reduce((a,b)=>a+b,0);
    if (nuevasCats.length > 0 && Math.abs(suma-100) > 0.5) {
      if (!confirm(`Los porcentajes suman ${suma}%. ¿Guardar de todas formas?`)) return;
    }

    const payload = { ingreso_mensual: ingreso, categorias: nuevasCats };
    if (config.id) {
      await db.from('configuracion').update(payload).eq('id', config.id);
    } else {
      await db.from('configuracion').insert(payload);
    }
    cerrarModal();
    await cargarConfig();
    renderPresupuesto();
    renderDashboard();
  });
}

// =============================================
// EXPORTAR CSV
// =============================================
function exportarCSV() {
  const filas = [
    ['Fecha','Tipo','Categoría','Cuenta','Monto','Nota'],
    ...movimientos.map(m => [
      m.fecha, m.tipo, m.categoria,
      nombreCuenta(m.cuenta_id),
      m.tipo === 'ingreso' ? m.monto : -m.monto,
      m.nota||''
    ])
  ];
  const csv = filas.map(f => f.map(c => {
    const s = String(c??'');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mi-dinero-${hoyISO()}.csv`;
  a.click();
}
