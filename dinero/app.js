// ============================================
// CONEXIÓN A SUPABASE
// (se llama "db" para no chocar con la variable global "supabase"
// que ya crea la librería cargada desde el CDN)
// ============================================
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let usuarioActual = null;

// Caché de datos — se cargan al iniciar sesión
let configuracionCache = { ingreso_mensual: 0 };
let categoriasGrandesCache = [];   // Obligaciones, Ocio, Ahorro
let subcategoriasCache = [];       // Arriendo, Luz, Netflix, etc.
let metasAhorroCache = [];
let cortesDelMesCache = [];        // cortes de tarjeta del mes actual
let cuentasCache = [];             // Débito, Nequi, Daviplata, Efectivo, etc.
let presupuestoMesCache = null;    // override manual de ocio del mes actual
let ahorrosProgramadosCache = [];  // reglas de ahorro configuradas
let ahorrosEjecucionesCache = [];  // ejecuciones del mes actual
let categoriaMemoriaCache = {};    // { "Comida": "uuid-ocio" } — memoria de categoría grande por nombre

// ============================================
// UTILIDADES
// ============================================
function formatoMoneda(numero) {
  const n = Number(numero) || 0;
  return "$" + n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function mesActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

function mostrarError(elementoId, mensaje) {
  const el = document.getElementById(elementoId);
  el.textContent = mensaje;
}

// ============================================
// AUTENTICACIÓN
// ============================================
const formLogin = document.getElementById("form-login");
const btnLogout = document.getElementById("btn-logout");
const btnMostrarRegistro = document.getElementById("btn-mostrar-registro");

let modoRegistro = false;

btnMostrarRegistro.addEventListener("click", () => {
  modoRegistro = !modoRegistro;
  btnMostrarRegistro.textContent = modoRegistro
    ? "¿Ya tienes cuenta? Entrar"
    : "¿No tienes cuenta? Crear una";
  document.querySelector("#form-login button[type=submit]").textContent =
    modoRegistro ? "Crear cuenta" : "Entrar";
});

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  mostrarError("login-error", "");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (modoRegistro) {
    const { error } = await db.auth.signUp({ email, password });
    if (error) return mostrarError("login-error", error.message);
    mostrarError("login-error", "Cuenta creada. Ya puedes entrar.");
    modoRegistro = false;
    btnMostrarRegistro.click();
  } else {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return mostrarError("login-error", error.message);
  }
});

btnLogout.addEventListener("click", async () => {
  await db.auth.signOut();
});

db.auth.onAuthStateChange((_evento, sesion) => {
  if (sesion) {
    usuarioActual = sesion.user;
    document.getElementById("vista-login").classList.add("oculto");
    document.getElementById("vista-app").classList.remove("oculto");
    cargarTodo();
  } else {
    usuarioActual = null;
    document.getElementById("vista-login").classList.remove("oculto");
    document.getElementById("vista-app").classList.add("oculto");
  }
});

// ============================================
// NAVEGACIÓN ENTRE PESTAÑAS
// ============================================
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("activo"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.add("oculto"));
    tab.classList.add("activo");
    document.getElementById("panel-" + tab.dataset.tab).classList.remove("oculto");
  });
});

// ============================================
// CARGA GENERAL (al iniciar sesión o refrescar)
// ============================================
async function cargarTodo() {
  await Promise.all([
    cargarConfiguracion(),
    cargarCategoriasGrandes(),
    cargarMovimientos(),
    cargarDeudas(),
    cargarGastosFijos(),
    cargarMetasAhorro(),
    cargarCortesDelMes(),
    cargarCuentas(),
    cargarPresupuestoMes(),
    cargarAhorrosProgramados(),
    cargarCategoriaMemoria(),
  ]);
  await Promise.all([cargarSubcategorias(), cargarAhorrosEjecuciones()]);
  renderizarDashboard();
  renderizarPresupuesto();
}

// ============================================
// CONFIGURACIÓN (ingreso mensual)
// ============================================
async function cargarConfiguracion() {
  const { data, error } = await db.from("configuracion").select("*").maybeSingle();
  if (error) { console.error(error); return; }
  configuracionCache = data || { ingreso_mensual: 0 };
}

async function guardarConfiguracion(ingresoMensual) {
  const { data: existente } = await db.from("configuracion").select("id").maybeSingle();
  if (existente) {
    await db.from("configuracion").update({ ingreso_mensual: ingresoMensual }).eq("id", existente.id);
  } else {
    await db.from("configuracion").insert({ ingreso_mensual: ingresoMensual });
  }
}

// ============================================
// CATEGORÍAS GRANDES (Obligaciones, Ocio, Ahorro)
// ============================================
async function cargarCategoriasGrandes() {
  const { data, error } = await db
    .from("categorias_grandes").select("*").order("orden", { ascending: true });
  if (error) { console.error(error); return; }
  categoriasGrandesCache = data || [];
}

async function cargarSubcategorias() {
  if (categoriasGrandesCache.length === 0) { subcategoriasCache = []; return; }
  const { data, error } = await db
    .from("subcategorias").select("*").order("nombre", { ascending: true });
  if (error) { console.error(error); return; }
  subcategoriasCache = data || [];
}

// ============================================
// METAS DE AHORRO
// ============================================
async function cargarMetasAhorro() {
  const { data, error } = await db
    .from("metas_ahorro").select("*").eq("activa", true).order("created_at", { ascending: true });
  if (error) { console.error(error); return; }
  metasAhorroCache = data || [];
}

async function cargarCortesDelMes() {
  const { data, error } = await db
    .from("tarjeta_cortes").select("*").eq("mes", mesActual());
  if (error) { console.error(error); return; }
  cortesDelMesCache = data || [];
}

function corteDelMes(deudaId) {
  return cortesDelMesCache.find((c) => c.deuda_id === deudaId);
}

// ============================================
// CUENTAS (Débito, Nequi, Daviplata, Efectivo)
// ============================================
async function cargarCategoriaMemoria() {
  const { data, error } = await db.from("categoria_memoria").select("*");
  if (error) { console.error(error); return; }
  categoriaMemoriaCache = {};
  (data || []).forEach((r) => {
    categoriaMemoriaCache[r.categoria] = r.categoria_grande_id;
  });
}

async function guardarCategoriaMemoria(categoria, categoriaGrandeId) {
  await db.from("categoria_memoria").upsert(
    { categoria, categoria_grande_id: categoriaGrandeId },
    { onConflict: "user_id,categoria" }
  );
  categoriaMemoriaCache[categoria] = categoriaGrandeId;
}

async function cargarCuentas() {
  const { data, error } = await db
    .from("cuentas").select("*").eq("activa", true).order("orden", { ascending: true });
  if (error) { console.error(error); return; }
  cuentasCache = data || [];
}

function saldoCuenta(cuentaId) {
  // Siempre lee de cuentasCache actualizada (no de copia capturada)
  const cuenta = cuentasCache.find((c) => c.id === cuentaId);
  if (!cuenta) return 0;
  const movs = movimientosCache.filter((m) => m.cuenta_id === cuentaId);
  const delta = movs.reduce((acc, m) => acc + (m.tipo === "ingreso" ? m.monto : -m.monto), 0);
  return cuenta.saldo_inicial + delta;
}

// ============================================
// PRESUPUESTO MENSUAL (override manual de Ocio)
// ============================================
async function cargarPresupuestoMes() {
  const { data, error } = await db
    .from("presupuesto_mes").select("*").eq("mes", mesActual()).maybeSingle();
  if (error) { console.error(error); return; }
  presupuestoMesCache = data || null;
}

function presupuestoOcioActual() {
  // Si hay un override manual para este mes, úsalo
  if (presupuestoMesCache) return presupuestoMesCache.monto_ocio;
  // Si no, calcula desde el porcentaje configurado
  const catOcio = categoriasGrandesCache.find((c) => c.nombre.toLowerCase().includes("ocio"));
  if (!catOcio || !configuracionCache.ingreso_mensual) return 0;
  return configuracionCache.ingreso_mensual * (catOcio.porcentaje / 100);
}

// ============================================
// AHORROS PROGRAMADOS
// ============================================
async function cargarAhorrosProgramados() {
  const { data, error } = await db
    .from("ahorros_programados").select("*").eq("activo", true).order("created_at");
  if (error) { console.error(error); return; }
  ahorrosProgramadosCache = data || [];
}

async function cargarAhorrosEjecuciones() {
  if (ahorrosProgramadosCache.length === 0) { ahorrosEjecucionesCache = []; return; }
  const { data, error } = await db
    .from("ahorros_ejecuciones").select("*").eq("mes", mesActual());
  if (error) { console.error(error); return; }
  ahorrosEjecucionesCache = data || [];
}

function ejecucionAhorro(ahorroId) {
  return ahorrosEjecucionesCache.find((e) => e.ahorro_id === ahorroId);
}

// ============================================
// MOVIMIENTOS
// ============================================
let movimientosCache = [];

async function cargarMovimientos() {
  const { data, error } = await db
    .from("movimientos")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) { console.error(error); return; }
  movimientosCache = data;
  renderizarMovimientos();
}

function renderizarMovimientos() {
  const filtro = document.getElementById("filtro-mes-movimientos").value || mesActual();
  const contenedor = document.getElementById("lista-movimientos");
  const filtrados = movimientosCache.filter((m) => m.fecha.slice(0, 7) === filtro);

  if (filtrados.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No hay movimientos este mes</p>';
    return;
  }

  contenedor.innerHTML = filtrados.map((m) => `
    <div class="fila">
      <div class="fila-info">
        <span class="fila-titulo">${escapeHtml(m.categoria)}</span>
        <span class="fila-detalle">${formatoFecha(m.fecha)} · ${descripcionMetodoPago(m.metodo_pago)}${m.nota ? " · " + escapeHtml(m.nota) : ""}</span>
      </div>
      <span class="fila-monto ${m.tipo === "ingreso" ? "positivo" : "negativo"}">
        ${m.tipo === "ingreso" ? "+" : "-"}${formatoMoneda(m.monto)}
      </span>
      <div class="fila-acciones">
        <button onclick="abrirModalMovimiento('${m.id}')">Editar</button>
        <button onclick="eliminarMovimiento('${m.id}')">Eliminar</button>
      </div>
    </div>
  `).join("");
}

function descripcionMetodoPago(metodoPago) {
  if (!metodoPago || metodoPago === "efectivo") return "Efectivo";
  if (metodoPago === "debito") return "Débito";
  if (metodoPago.startsWith("cuenta:")) {
    const cuentaId = metodoPago.split(":")[1];
    const cuenta = cuentasCache.find((c) => c.id === cuentaId);
    return cuenta ? cuenta.nombre : "Cuenta eliminada";
  }
  if (metodoPago.startsWith("credito:")) {
    const deudaId = metodoPago.split(":")[1];
    const deuda = deudasCache.find((d) => d.id === deudaId);
    return "Crédito: " + (deuda ? deuda.nombre : "tarjeta eliminada");
  }
  return metodoPago;
}

document.getElementById("filtro-mes-movimientos").value = mesActual();
document.getElementById("filtro-mes-movimientos").addEventListener("change", renderizarMovimientos);

function formatoFecha(fechaIso) {
  const [a, m, d] = fechaIso.split("-");
  return `${d}/${m}/${a}`;
}

function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

async function eliminarMovimiento(id) {
  if (!confirm("¿Eliminar este movimiento?")) return;
  const movimiento = movimientosCache.find((m) => m.id === id);
  const { error } = await db.from("movimientos").delete().eq("id", id);
  if (error) return alert("Error: " + error.message);

  if (movimiento && movimiento.metodo_pago && movimiento.metodo_pago.startsWith("credito:")) {
    await ajustarSaldoTarjeta(movimiento.metodo_pago, -movimiento.monto);
    await cargarDeudas();
  }

  await cargarMovimientos();
  renderizarDashboard();
}

document.getElementById("btn-nuevo-movimiento").addEventListener("click", () => abrirModalMovimiento());

function abrirModalMovimiento(id) {
  const movimiento = id ? movimientosCache.find((m) => m.id === id) : null;
  const tipoInicial = movimiento ? movimiento.tipo : "gasto";

  abrirModal(`
    <h3>${movimiento ? "Editar" : "Agregar"} movimiento</h3>
    <div class="toggle-tipo">
      <button type="button" id="toggle-ingreso" class="${tipoInicial === "ingreso" ? "activo-ingreso" : ""}">Ingreso</button>
      <button type="button" id="toggle-gasto" class="${tipoInicial === "gasto" ? "activo-gasto" : ""}">Gasto</button>
    </div>
    <input type="hidden" id="mov-tipo" value="${tipoInicial}">
    <div class="campo">
      <label>Monto</label>
      <input type="number" id="mov-monto" min="0" step="1" value="${movimiento ? movimiento.monto : ""}" placeholder="0">
    </div>
    <div class="campo">
      <label>Categoría</label>
      <input type="text" id="mov-categoria" list="dl-categorias" autocomplete="off"
        placeholder="Ej: Comida, Cine, Arriendo...">
      <datalist id="dl-categorias"></datalist>
    </div>
    <div class="campo" id="campo-cat-grande">
      <label>Tipo de gasto</label>
      <select id="mov-categoria-grande">
        <option value="">-- Elige tipo --</option>
      </select>
    </div>
    <div class="campo oculto" id="campo-meta-ahorro">
      <label>Abonar a meta de ahorro (opcional)</label>
      <select id="mov-meta-ahorro">
        <option value="">Sin meta específica</option>
      </select>
    </div>
    <div class="campo" id="campo-metodo-pago">
      <label>Cuenta</label>
      <select id="mov-metodo-pago"></select>
    </div>
    <div class="campo">
      <label>Fecha</label>
      <input type="date" id="mov-fecha" value="${movimiento ? movimiento.fecha : fechaHoy()}">
    </div>
    <div class="campo">
      <label>Nota (opcional)</label>
      <input type="text" id="mov-nota" value="${movimiento ? escapeHtml(movimiento.nota || "") : ""}" placeholder="Ej: Mercado del mes">
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-movimiento">Guardar</button>
    </div>
  `);

  function actualizarCategorias(tipo) {
    const input = document.getElementById("mov-categoria");
    const datalist = document.getElementById("dl-categorias");

    if (tipo === "ingreso") {
      const opcionesIngreso = ["Salario", "Venta", "Regalo", "Ajuste de saldo", "Otro ingreso"];
      datalist.innerHTML = opcionesIngreso.map((c) => `<option value="${escapeHtml(c)}">`).join("");
    } else {
      // Subcategorías configuradas y categorías grandes como opciones base
      const subcats = subcategoriasCache.map((s) => s.nombre);
      const catGrandes = categoriasGrandesCache.map((cg) => cg.nombre);

      // Historial ordenado por frecuencia de uso
      const frecuencia = {};
      movimientosCache
        .filter((m) => m.tipo === "gasto")
        .forEach((m) => { frecuencia[m.categoria] = (frecuencia[m.categoria] || 0) + 1; });
      const historialOrdenado = Object.entries(frecuencia)
        .sort((a, b) => b[1] - a[1])
        .map(([cat]) => cat)
        .filter((cat) => !subcats.includes(cat) && !catGrandes.includes(cat));

      // Primero las más usadas, luego subcategorías, luego categorías grandes
      const todas = [...new Set([...historialOrdenado, ...subcats, ...catGrandes])];
      datalist.innerHTML = todas.map((c) => `<option value="${escapeHtml(c)}">`).join("");
    }
    if (movimiento && movimiento.categoria) {
      input.value = movimiento.categoria;
    }
  }
  actualizarCategorias(tipoInicial);

  // Poblar select de categoría grande y detectar automáticamente desde memoria
  function poblarCatGrande() {
    const select = document.getElementById("mov-categoria-grande");
    select.innerHTML = `<option value="">-- Elige tipo --</option>` +
      categoriasGrandesCache.map((cg) =>
        `<option value="${cg.id}">${escapeHtml(cg.nombre)}</option>`
      ).join("");
    const catActual = document.getElementById("mov-categoria").value.trim();
    const idGuardado = movimiento?.categoria_grande_id || categoriaMemoriaCache[catActual];
    if (idGuardado) select.value = idGuardado;
    actualizarVisibilidadMeta();
  }
  poblarCatGrande();

  function actualizarVisibilidadCatGrande(tipo) {
    document.getElementById("campo-cat-grande").classList.toggle("oculto", tipo === "ingreso");
    document.getElementById("campo-meta-ahorro").classList.toggle("oculto", tipo === "ingreso");
    if (tipo !== "ingreso") actualizarVisibilidadMeta();
  }
  actualizarVisibilidadCatGrande(tipoInicial);

  function actualizarVisibilidadMeta() {
    const cgId = document.getElementById("mov-categoria-grande").value;
    const catGrande = categoriasGrandesCache.find((c) => c.id === cgId);
    const esAhorro = catGrande?.nombre.toLowerCase().includes("ahorro");
    document.getElementById("campo-meta-ahorro").classList.toggle("oculto", !esAhorro);
    if (esAhorro) {
      const selectMeta = document.getElementById("mov-meta-ahorro");
      selectMeta.innerHTML = `<option value="">Sin meta específica</option>` +
        metasAhorroCache.map((m) =>
          `<option value="${m.id}">${escapeHtml(m.nombre)}</option>`
        ).join("");
      if (movimiento?.meta_id) selectMeta.value = movimiento.meta_id;
    }
  }

  document.getElementById("mov-categoria-grande").addEventListener("change", actualizarVisibilidadMeta);

  // Al escribir una categoría, auto-seleccionar la grande desde memoria
  document.getElementById("mov-categoria").addEventListener("input", () => {
    const val = document.getElementById("mov-categoria").value.trim();
    const idMemoria = categoriaMemoriaCache[val];
    if (idMemoria) {
      document.getElementById("mov-categoria-grande").value = idMemoria;
      actualizarVisibilidadMeta();
    }
  });

  function actualizarMetodosPago() {
    const select = document.getElementById("mov-metodo-pago");
    const tarjetas = deudasCache.filter((d) => d.tipo === "tarjeta_credito");
    const opcionesCuentas = cuentasCache.length > 0
      ? cuentasCache.map((c) => `<option value="cuenta:${c.id}">${escapeHtml(c.nombre)}</option>`)
      : [`<option value="efectivo">Efectivo (sin cuenta configurada)</option>`];
    const opcionesTarjetas = tarjetas.map((t) =>
      `<option value="credito:${t.id}">Crédito: ${escapeHtml(t.nombre)}</option>`
    );
    select.innerHTML = [...opcionesCuentas, ...opcionesTarjetas].join("");
    if (movimiento && movimiento.metodo_pago) {
      const opts = [...select.options].map((o) => o.value);
      if (opts.includes(movimiento.metodo_pago)) select.value = movimiento.metodo_pago;
    }
  }

  function actualizarVisibilidadMetodoPago(tipo) {
    document.getElementById("campo-metodo-pago").classList.toggle("oculto", tipo !== "gasto");
  }
  actualizarMetodosPago();
  actualizarVisibilidadMetodoPago(tipoInicial);

  document.getElementById("toggle-ingreso").addEventListener("click", () => {
    document.getElementById("mov-tipo").value = "ingreso";
    document.getElementById("toggle-ingreso").classList.add("activo-ingreso");
    document.getElementById("toggle-gasto").classList.remove("activo-gasto");
    actualizarCategorias("ingreso");
    actualizarVisibilidadMetodoPago("ingreso");
  });
  document.getElementById("toggle-gasto").addEventListener("click", () => {
    document.getElementById("mov-tipo").value = "gasto";
    document.getElementById("toggle-gasto").classList.add("activo-gasto");
    document.getElementById("toggle-ingreso").classList.remove("activo-ingreso");
    actualizarCategorias("gasto");
    actualizarVisibilidadMetodoPago("gasto");
  });

  document.getElementById("btn-guardar-movimiento").addEventListener("click", async () => {
    const tipo = document.getElementById("mov-tipo").value;
    const metodoPago = document.getElementById("mov-metodo-pago").value;
    const cuentaId = metodoPago.startsWith("cuenta:") ? metodoPago.split(":")[1] : null;
    const categoriaGrandeId = tipo === "gasto"
      ? (document.getElementById("mov-categoria-grande").value || null)
      : null;
    const metaId = tipo === "gasto" && categoriaGrandeId
      ? (document.getElementById("mov-meta-ahorro")?.value || null)
      : null;

    const payload = {
      tipo,
      monto: parseFloat(document.getElementById("mov-monto").value),
      categoria: document.getElementById("mov-categoria").value.trim(),
      fecha: document.getElementById("mov-fecha").value,
      nota: document.getElementById("mov-nota").value.trim() || null,
      metodo_pago: metodoPago,
      cuenta_id: cuentaId,
      categoria_grande_id: categoriaGrandeId,
    };
    if (!payload.monto || payload.monto <= 0) return alert("Ingresa un monto válido");
    if (!payload.categoria) return alert("Ingresa una categoría");

    // Si se edita, revertir efecto sobre tarjeta de crédito anterior
    if (movimiento && movimiento.metodo_pago && movimiento.metodo_pago.startsWith("credito:")) {
      await ajustarSaldoTarjeta(movimiento.metodo_pago, -movimiento.monto);
    }

    let error, data;
    if (movimiento) {
      ({ error } = await db.from("movimientos").update(payload).eq("id", movimiento.id));
    } else {
      ({ error } = await db.from("movimientos").insert(payload));
    }
    if (error) return alert("Error: " + error.message);

    // Si el pago fue con tarjeta de crédito, sube el saldo de la deuda
    if (payload.metodo_pago.startsWith("credito:")) {
      await ajustarSaldoTarjeta(payload.metodo_pago, payload.monto);
    }

    // Guardar en memoria: esta categoría pertenece a esta categoría grande
    if (payload.categoria && categoriaGrandeId) {
      await guardarCategoriaMemoria(payload.categoria, categoriaGrandeId);
    }

    // Si es Ahorro y tiene meta, abonar a esa meta
    if (metaId && tipo === "gasto") {
      const meta = metasAhorroCache.find((m) => m.id === metaId);
      if (meta) {
        await db.from("metas_ahorro")
          .update({ valor_ahorrado: meta.valor_ahorrado + payload.monto })
          .eq("id", metaId);
      }
    }

    cerrarModal();
    await Promise.all([cargarMovimientos(), cargarDeudas(), cargarMetasAhorro(), cargarCuentas()]);
    renderizarDashboard();
    renderizarPresupuesto();
  });
}

// Suma (o resta, si delta es negativo) un monto al saldo de una tarjeta de crédito.
// Lee el saldo actual directo de la base de datos (no de la caché) para evitar
// que dos ajustes seguidos pisen el valor del otro.
// metodoPago viene en formato "credito:<id-de-la-deuda>"
async function ajustarSaldoTarjeta(metodoPago, delta) {
  const deudaId = metodoPago.split(":")[1];
  const { data: deuda, error: errorLectura } = await db
    .from("deudas")
    .select("saldo_tarjeta")
    .eq("id", deudaId)
    .maybeSingle();
  if (errorLectura || !deuda) return; // la tarjeta pudo haber sido eliminada después
  const nuevoSaldo = Math.max(deuda.saldo_tarjeta + delta, 0);
  await db.from("deudas").update({ saldo_tarjeta: nuevoSaldo }).eq("id", deudaId);
}

// ============================================
// DEUDAS
// ============================================
let deudasCache = [];
let deudasPagosDelMesCache = [];

async function cargarDeudas() {
  const { data, error } = await db
    .from("deudas")
    .select("*")
    .eq("activa", true)
    .order("created_at", { ascending: true });
  if (error) { console.error(error); return; }
  deudasCache = data;

  const { data: pagos, error: errorPagos } = await db
    .from("deudas_pagos")
    .select("*")
    .eq("mes", mesActual());
  if (errorPagos) { console.error(errorPagos); return; }
  deudasPagosDelMesCache = pagos;

  renderizarDeudas();
}

function estaDeudaPagadaEsteMes(deudaId) {
  return deudasPagosDelMesCache.some((p) => p.deuda_id === deudaId);
}

function renderizarDeudas() {
  const contenedor = document.getElementById("lista-deudas");
  if (deudasCache.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No tienes deudas registradas</p>';
    return;
  }

  contenedor.innerHTML = deudasCache.map((d) => {
    const pagadoEsteMes = estaDeudaPagadaEsteMes(d.id);
    const badgePago = `<span class="badge ${pagadoEsteMes ? "badge-ok" : "badge-pendiente"}">${pagadoEsteMes ? "Pagado este mes" : "Pendiente este mes"}</span>`;

    if (d.tipo === "tarjeta_credito") {
      const corte = corteDelMes(d.id);
      const hoy = new Date();
      const mesLabel = hoy.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

      // Calcular fecha de corte y límite de pago para este mes
      let fechaCorteStr = d.dia_corte ? `Día ${d.dia_corte} de cada mes` : "Sin configurar";
      let fechaLimiteStr = "Sin configurar";
      let alertaVencimiento = "";

      if (d.dia_limite_pago) {
        // Si el día límite ya pasó este mes, mostramos el del mes siguiente
        const diaLimite = d.dia_limite_pago;
        let fechaLimite = new Date(hoy.getFullYear(), hoy.getMonth(), diaLimite);
        if (fechaLimite < hoy && !corte?.pagado) {
          fechaLimite.setMonth(fechaLimite.getMonth() + 1);
        }
        fechaLimiteStr = fechaLimite.toLocaleDateString("es-CO", { day: "numeric", month: "long" });
        const diasRestantes = Math.ceil((fechaLimite - hoy) / (1000 * 60 * 60 * 24));
        if (!corte?.pagado) {
          if (diasRestantes <= 0) {
            alertaVencimiento = `<p class="alerta-cat barra-excedido-texto">⚠ Fecha límite vencida</p>`;
          } else if (diasRestantes <= 5) {
            alertaVencimiento = `<p class="alerta-cat barra-advertencia-texto">⚠ Vence en ${diasRestantes} día${diasRestantes === 1 ? "" : "s"}</p>`;
          }
        }
      }

      const montoCorte = corte ? corte.monto_corte : 0;
      const badgeCorte = corte?.pagado
        ? `<span class="badge badge-ok">Pagado</span>`
        : montoCorte > 0
          ? `<span class="badge badge-pendiente">Pendiente: ${formatoMoneda(montoCorte)}</span>`
          : `<span class="badge badge-pendiente">Sin monto de corte</span>`;

      return `
        <div class="tarjeta-deuda">
          <div class="tarjeta-deuda-header">
            <span class="tarjeta-deuda-nombre">💳 ${escapeHtml(d.nombre)}</span>
            <div class="fila-acciones">
              <button onclick="abrirModalDeuda('${d.id}')">Editar</button>
              <button onclick="eliminarDeuda('${d.id}')">Eliminar</button>
            </div>
          </div>
          <div class="deuda-datos" style="grid-template-columns: repeat(2,1fr);">
            <div><span>Saldo en tarjeta</span>${formatoMoneda(d.saldo_tarjeta)}</div>
            <div><span>Corte mensual</span>Día ${d.dia_corte || "—"}</div>
            <div><span>Límite de pago</span>${fechaLimiteStr}</div>
            <div><span>Corte ${mesLabel}</span>${badgeCorte}</div>
          </div>
          ${alertaVencimiento}
          <div class="deuda-acciones" style="gap:8px;flex-wrap:wrap;">
            <button class="btn-secundario btn-pequeno" onclick="abrirModalCorte('${d.id}')">
              ${corte ? "✎ Editar corte" : "+ Registrar corte de este mes"}
            </button>
            ${montoCorte > 0 && !corte?.pagado ? `<button class="btn-primario btn-pequeno" onclick="registrarPagoDeuda('${d.id}')">Pagar corte</button>` : ""}
          </div>
        </div>
      `;
    }

    const saldoRestante = Math.max(d.monto_total - d.pagado_acumulado, 0);
    const porcentaje = Math.min((d.pagado_acumulado / d.monto_total) * 100, 100);
    const mesesFaltantes = d.pago_mensual_planeado > 0
      ? Math.ceil(saldoRestante / d.pago_mensual_planeado)
      : 0;
    const fechaEstimada = estimarFechaFin(mesesFaltantes);

    return `
      <div class="tarjeta-deuda">
        <div class="tarjeta-deuda-header">
          <span class="tarjeta-deuda-nombre">${escapeHtml(d.nombre)}</span>
          <div class="fila-acciones">
            <button onclick="abrirModalDeuda('${d.id}')">Editar</button>
            <button onclick="eliminarDeuda('${d.id}')">Eliminar</button>
          </div>
        </div>
        <div class="barra-progreso">
          <div class="barra-progreso-fill" style="width:${porcentaje}%"></div>
        </div>
        <div class="deuda-datos">
          <div><span>Total</span>${formatoMoneda(d.monto_total)}</div>
          <div><span>Pagado</span>${formatoMoneda(d.pagado_acumulado)}</div>
          <div><span>Saldo</span>${formatoMoneda(saldoRestante)}</div>
          <div><span>Pago mensual</span>${formatoMoneda(d.pago_mensual_planeado)}</div>
          <div><span>Termina</span>${saldoRestante <= 0 ? "Pagada" : fechaEstimada}</div>
          <div><span>Este mes</span>${badgePago}</div>
        </div>
        <div class="deuda-acciones">
          <button class="btn-secundario btn-pequeno" onclick="registrarPagoDeuda('${d.id}')">Registrar pago</button>
        </div>
      </div>
    `;
  }).join("");
}

function estimarFechaFin(mesesFaltantes) {
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + mesesFaltantes);
  return fecha.toLocaleDateString("es-CO", { month: "short", year: "numeric" });
}

document.getElementById("btn-nueva-deuda").addEventListener("click", () => abrirModalDeuda());

function abrirModalDeuda(id) {
  const deuda = id ? deudasCache.find((d) => d.id === id) : null;
  const tipoInicial = deuda ? deuda.tipo : "normal";

  abrirModal(`
    <h3>${deuda ? "Editar" : "Agregar"} deuda</h3>
    <div class="campo">
      <label>Tipo</label>
      <div class="toggle-tipo">
        <button type="button" id="deuda-tipo-normal" class="${tipoInicial === "normal" ? "activo-ingreso" : ""}">Deuda normal</button>
        <button type="button" id="deuda-tipo-tarjeta" class="${tipoInicial === "tarjeta_credito" ? "activo-ingreso" : ""}">Tarjeta de crédito</button>
      </div>
    </div>
    <input type="hidden" id="deuda-tipo" value="${tipoInicial}">
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="deuda-nombre" value="${deuda ? escapeHtml(deuda.nombre) : ""}" placeholder="Ej: Préstamo carro / Tarjeta Visa">
    </div>

    <div id="campos-deuda-normal" class="${tipoInicial === "tarjeta_credito" ? "oculto" : ""}">
      <div class="campo">
        <label>Monto total</label>
        <input type="number" id="deuda-monto-total" min="0" value="${deuda && deuda.tipo !== "tarjeta_credito" ? deuda.monto_total : ""}" placeholder="0">
      </div>
      <div class="campo">
        <label>Pagado hasta ahora</label>
        <input type="number" id="deuda-pagado" min="0" value="${deuda && deuda.tipo !== "tarjeta_credito" ? deuda.pagado_acumulado : 0}" placeholder="0">
      </div>
    </div>

    <div id="campos-deuda-tarjeta" class="${tipoInicial === "tarjeta_credito" ? "" : "oculto"}">
      <div class="campo">
        <label>Saldo actual que debes</label>
        <input type="number" id="deuda-saldo-tarjeta" min="0" value="${deuda && deuda.tipo === "tarjeta_credito" ? deuda.saldo_tarjeta : 0}" placeholder="0">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="campo">
          <label>Día de corte</label>
          <input type="number" id="deuda-dia-corte" min="1" max="31"
            value="${deuda && deuda.dia_corte ? deuda.dia_corte : ""}" placeholder="Ej: 15">
        </div>
        <div class="campo">
          <label>Día límite de pago</label>
          <input type="number" id="deuda-dia-limite" min="1" max="31"
            value="${deuda && deuda.dia_limite_pago ? deuda.dia_limite_pago : ""}" placeholder="Ej: 5">
        </div>
      </div>
    </div>

    <div class="campo">
      <label>Pago mensual planeado</label>
      <input type="number" id="deuda-pago-mensual" min="0" value="${deuda ? deuda.pago_mensual_planeado : ""}" placeholder="0">
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-deuda">Guardar</button>
    </div>
  `);

  document.getElementById("deuda-tipo-normal").addEventListener("click", () => {
    document.getElementById("deuda-tipo").value = "normal";
    document.getElementById("deuda-tipo-normal").classList.add("activo-ingreso");
    document.getElementById("deuda-tipo-tarjeta").classList.remove("activo-ingreso");
    document.getElementById("campos-deuda-normal").classList.remove("oculto");
    document.getElementById("campos-deuda-tarjeta").classList.add("oculto");
  });
  document.getElementById("deuda-tipo-tarjeta").addEventListener("click", () => {
    document.getElementById("deuda-tipo").value = "tarjeta_credito";
    document.getElementById("deuda-tipo-tarjeta").classList.add("activo-ingreso");
    document.getElementById("deuda-tipo-normal").classList.remove("activo-ingreso");
    document.getElementById("campos-deuda-tarjeta").classList.remove("oculto");
    document.getElementById("campos-deuda-normal").classList.add("oculto");
  });

  document.getElementById("btn-guardar-deuda").addEventListener("click", async () => {
    const tipo = document.getElementById("deuda-tipo").value;
    const nombre = document.getElementById("deuda-nombre").value.trim();
    const pagoMensual = parseFloat(document.getElementById("deuda-pago-mensual").value);

    if (!nombre || !pagoMensual) return alert("Completa nombre y pago mensual");

    let payload = { nombre, tipo, pago_mensual_planeado: pagoMensual };

    if (tipo === "tarjeta_credito") {
      payload.saldo_tarjeta = parseFloat(document.getElementById("deuda-saldo-tarjeta").value) || 0;
      payload.dia_corte = parseInt(document.getElementById("deuda-dia-corte").value) || null;
      payload.dia_limite_pago = parseInt(document.getElementById("deuda-dia-limite").value) || null;
      payload.monto_total = 0;
      payload.pagado_acumulado = 0;
    } else {
      const montoTotal = parseFloat(document.getElementById("deuda-monto-total").value);
      if (!montoTotal) return alert("Completa el monto total");
      payload.monto_total = montoTotal;
      payload.pagado_acumulado = parseFloat(document.getElementById("deuda-pagado").value) || 0;
      payload.saldo_tarjeta = 0;
    }

    let error;
    if (deuda) {
      ({ error } = await db.from("deudas").update(payload).eq("id", deuda.id));
    } else {
      ({ error } = await db.from("deudas").insert(payload));
    }
    if (error) return alert("Error: " + error.message);
    cerrarModal();
    await cargarDeudas();
    renderizarDashboard();
  });
}

async function eliminarDeuda(id) {
  if (!confirm("¿Eliminar esta deuda?")) return;
  const { error } = await db.from("deudas").delete().eq("id", id);
  if (error) return alert("Error: " + error.message);
  await cargarDeudas();
  renderizarDashboard();
}

// Modal para registrar/editar el monto del corte de este mes en una tarjeta
function abrirModalCorte(deudaId) {
  const deuda = deudasCache.find((d) => d.id === deudaId);
  const corte = corteDelMes(deudaId);
  const mes = mesActual();
  const mesLabel = new Date().toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  // Calcular fecha límite sugerida desde dia_limite_pago
  let fechaLimiteSugerida = "";
  if (deuda.dia_limite_pago) {
    const hoy = new Date();
    let fecha = new Date(hoy.getFullYear(), hoy.getMonth(), deuda.dia_limite_pago);
    if (fecha < hoy) fecha.setMonth(fecha.getMonth() + 1);
    fechaLimiteSugerida = fecha.toISOString().slice(0, 10);
  }

  abrirModal(`
    <h3>Corte de ${escapeHtml(deuda.nombre)}</h3>
    <p class="fila-detalle" style="margin-bottom:14px;">Mes: ${mesLabel}</p>
    <div class="campo">
      <label>Monto a pagar este corte</label>
      <input type="number" id="corte-monto" min="0" value="${corte ? corte.monto_corte : ""}" placeholder="0">
    </div>
    <div class="campo">
      <label>Fecha límite de pago</label>
      <input type="date" id="corte-fecha-limite" value="${corte && corte.fecha_limite ? corte.fecha_limite : fechaLimiteSugerida}">
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-corte">Guardar</button>
    </div>
  `);

  document.getElementById("btn-guardar-corte").addEventListener("click", async () => {
    const monto = parseFloat(document.getElementById("corte-monto").value);
    const fechaLimite = document.getElementById("corte-fecha-limite").value || null;
    if (!monto || monto <= 0) return alert("Ingresa el monto del corte");

    const payload = { deuda_id: deudaId, mes, monto_corte: monto, fecha_limite: fechaLimite };
    const { error } = await db.from("tarjeta_cortes")
      .upsert(payload, { onConflict: "deuda_id,mes" });
    if (error) return alert("Error: " + error.message);

    cerrarModal();
    await Promise.all([cargarCortesDelMes(), cargarDeudas()]);
    renderizarDashboard();
    renderizarPresupuesto();
  });
}

function registrarPagoDeuda(id) {
  const deuda = deudasCache.find((d) => d.id === id);
  const esTarjeta = deuda.tipo === "tarjeta_credito";
  const corte = esTarjeta ? corteDelMes(id) : null;
  const montoSugerido = esTarjeta
    ? (corte ? corte.monto_corte : 0)
    : deuda.pago_mensual_planeado;
  const saldoActual = esTarjeta ? deuda.saldo_tarjeta : (deuda.monto_total - deuda.pagado_acumulado);

  const opcionesCuentas = cuentasCache.length > 0
    ? cuentasCache.map((c) => `<option value="cuenta:${c.id}">${escapeHtml(c.nombre)}</option>`).join("")
    : `<option value="">Sin cuentas configuradas</option>`;
  const opcionesTarjetasPago = deudasCache
    .filter((d) => d.tipo === "tarjeta_credito" && d.id !== id)
    .map((t) => `<option value="credito:${t.id}">Crédito: ${escapeHtml(t.nombre)}</option>`)
    .join("");
  const todasLasOpciones = opcionesCuentas + opcionesTarjetasPago;

  abrirModal(`
    <h3>Pagar ${esTarjeta ? "corte de " : ""}${escapeHtml(deuda.nombre)}</h3>
    <p class="fila-detalle" style="margin-bottom:14px;">
      ${esTarjeta
        ? `Monto del corte: <strong>${formatoMoneda(montoSugerido)}</strong>`
        : `Saldo: ${formatoMoneda(saldoActual)}`}
    </p>
    <div class="campo">
      <label>Monto a pagar</label>
      <input type="number" id="pago-monto" min="0" value="${montoSugerido}" placeholder="0">
    </div>
    <div class="campo">
      <label>Pagar desde</label>
      <select id="pago-cuenta">${todasLasOpciones}</select>
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-confirmar-pago">Confirmar pago</button>
    </div>
  `);

  document.getElementById("btn-confirmar-pago").addEventListener("click", async () => {
    const monto = parseFloat(document.getElementById("pago-monto").value);
    if (!monto || monto <= 0) return alert("Ingresa un monto válido");
    const val = document.getElementById("pago-cuenta").value || "";
    const cuentaId = val.startsWith("cuenta:") ? val.split(":")[1] : null;
    const metodoPago = val || "efectivo";

    // Actualiza el saldo de la deuda según su tipo
    const { error: errorDeuda } = esTarjeta
      ? await db.from("deudas").update({ saldo_tarjeta: Math.max(deuda.saldo_tarjeta - monto, 0) }).eq("id", deuda.id)
      : await db.from("deudas").update({ pagado_acumulado: deuda.pagado_acumulado + monto }).eq("id", deuda.id);
    if (errorDeuda) return alert("Error: " + errorDeuda.message);

    // Crea movimiento de gasto en el historial (resta de la cuenta seleccionada)
    const { data: mov, error: errorMov } = await db.from("movimientos").insert({
      tipo: "gasto",
      monto,
      categoria: "Pago de deuda",
      fecha: fechaHoy(),
      nota: `Pago${esTarjeta ? " corte" : ""}: ${deuda.nombre}`,
      metodo_pago: metodoPago,
      cuenta_id: cuentaId,
    }).select().single();
    if (errorMov) return alert("Error: " + errorMov.message);

    if (esTarjeta) {
      if (corte) {
        await db.from("tarjeta_cortes").update({ pagado: true, movimiento_id: mov.id }).eq("id", corte.id);
      }
    } else {
      await db.from("deudas_pagos").upsert({
        deuda_id: deuda.id,
        mes: mesActual(),
        movimiento_id: mov.id,
      }, { onConflict: "deuda_id,mes" });
    }

    cerrarModal();
    await Promise.all([cargarDeudas(), cargarMovimientos(), cargarCortesDelMes(), cargarCuentas()]);
    renderizarDashboard();
    renderizarPresupuesto();
  });
}

// ============================================
// GASTOS FIJOS
// ============================================
let gastosFijosCache = [];
let pagosDelMesCache = [];

async function cargarGastosFijos() {
  const { data: fijos, error: errorFijos } = await db
    .from("gastos_fijos")
    .select("*")
    .eq("activo", true)
    .order("created_at", { ascending: true });
  if (errorFijos) { console.error(errorFijos); return; }
  gastosFijosCache = fijos;

  const { data: pagos, error: errorPagos } = await db
    .from("gastos_fijos_pagos")
    .select("*")
    .eq("mes", mesActual());
  if (errorPagos) { console.error(errorPagos); return; }
  pagosDelMesCache = pagos;

  renderizarGastosFijos();
}

function estaPagadoEsteMes(gastoFijoId) {
  return pagosDelMesCache.some((p) => p.gasto_fijo_id === gastoFijoId);
}

function renderizarGastosFijos() {
  const contenedor = document.getElementById("lista-gastos-fijos");
  if (gastosFijosCache.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No tienes gastos fijos registrados</p>';
    return;
  }

  contenedor.innerHTML = gastosFijosCache.map((g) => {
    const pagado = estaPagadoEsteMes(g.id);
    return `
      <div class="fila fila-con-badge">
        <input type="checkbox" class="checkbox-pagado" ${pagado ? "checked" : ""}
          onchange="togglePagoGastoFijo('${g.id}', this.checked)">
        <div class="fila-info">
          <span class="fila-titulo">${escapeHtml(g.nombre)}</span>
          <span class="fila-detalle">${escapeHtml(g.categoria)}</span>
        </div>
        <span class="fila-monto">${formatoMoneda(g.monto)}</span>
        <span class="badge ${pagado ? "badge-ok" : "badge-pendiente"}">${pagado ? "Pagado" : "Pendiente"}</span>
        <div class="fila-acciones">
          <button onclick="abrirModalGastoFijo('${g.id}')">Editar</button>
          <button onclick="eliminarGastoFijo('${g.id}')">Eliminar</button>
        </div>
      </div>
    `;
  }).join("");
}

async function togglePagoGastoFijo(gastoFijoId, marcarComoPagado) {
  const gasto = gastosFijosCache.find((g) => g.id === gastoFijoId);
  const mes = mesActual();

  if (marcarComoPagado) {
    // Si hay cuentas configuradas, preguntar desde cuál se paga
    if (cuentasCache.length > 0) {
      abrirModal(`
        <h3>Pagar: ${escapeHtml(gasto.nombre)}</h3>
        <p class="fila-detalle" style="margin-bottom:14px;">${formatoMoneda(gasto.monto)}</p>
        <div class="campo">
          <label>Pagar desde</label>
          <select id="gf-pago-cuenta">
            ${cuentasCache.map((c) => `<option value="cuenta:${c.id}">${escapeHtml(c.nombre)}</option>`).join("")}
            ${deudasCache.filter((d) => d.tipo === "tarjeta_credito").map((t) => `<option value="credito:${t.id}">Crédito: ${escapeHtml(t.nombre)}</option>`).join("")}
          </select>
        </div>
        <div class="modal-acciones">
          <button class="btn-secundario" onclick="cerrarModal(); renderizarGastosFijos();">Cancelar</button>
          <button class="btn-primario" id="btn-confirmar-gf">Confirmar</button>
        </div>
      `);

      document.getElementById("btn-confirmar-gf").addEventListener("click", async () => {
        const val = document.getElementById("gf-pago-cuenta").value;
        const cuentaId = val.startsWith("cuenta:") ? val.split(":")[1] : null;
        const metodoPago = val;
        cerrarModal();
        await _ejecutarPagoGastoFijo(gasto, gastoFijoId, mes, metodoPago, cuentaId);
      });
      return; // espera la confirmación del modal
    }
    // Sin cuentas: paga directamente
    await _ejecutarPagoGastoFijo(gasto, gastoFijoId, mes, "efectivo", null);
  } else {
    // Desmarcar: eliminar el registro de pago y su movimiento asociado
    const pago = pagosDelMesCache.find((p) => p.gasto_fijo_id === gastoFijoId);
    if (pago) {
      if (pago.movimiento_id) {
        await db.from("movimientos").delete().eq("id", pago.movimiento_id);
      }
      await db.from("gastos_fijos_pagos").delete().eq("id", pago.id);
    }
    await Promise.all([cargarGastosFijos(), cargarMovimientos(), cargarCuentas()]);
    renderizarDashboard();
  }
}

async function _ejecutarPagoGastoFijo(gasto, gastoFijoId, mes, metodoPago, cuentaId) {
  const { data: movimiento, error: errorMov } = await db.from("movimientos").insert({
    tipo: "gasto",
    monto: gasto.monto,
    categoria: gasto.categoria,
    fecha: fechaHoy(),
    nota: `Pago: ${gasto.nombre}`,
    metodo_pago: metodoPago,
    cuenta_id: cuentaId,
  }).select().single();
  if (errorMov) return alert("Error: " + errorMov.message);

  const { error: errorPago } = await db.from("gastos_fijos_pagos").insert({
    gasto_fijo_id: gastoFijoId,
    mes,
    movimiento_id: movimiento.id,
  });
  if (errorPago) return alert("Error: " + errorPago.message);

  await Promise.all([cargarGastosFijos(), cargarMovimientos(), cargarCuentas()]);
  renderizarDashboard();
}

document.getElementById("btn-nuevo-gasto-fijo").addEventListener("click", () => abrirModalGastoFijo());

function abrirModalGastoFijo(id) {
  const gasto = id ? gastosFijosCache.find((g) => g.id === id) : null;

  abrirModal(`
    <h3>${gasto ? "Editar" : "Agregar"} gasto fijo</h3>
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="gf-nombre" value="${gasto ? escapeHtml(gasto.nombre) : ""}" placeholder="Ej: Arriendo">
    </div>
    <div class="campo">
      <label>Monto</label>
      <input type="number" id="gf-monto" min="0" value="${gasto ? gasto.monto : ""}" placeholder="0">
    </div>
    <div class="campo">
      <label>Categoría</label>
      <input type="text" id="gf-categoria" list="dl-cat-gf" autocomplete="off"
        placeholder="Ej: Arriendo, Luz, Internet...">
      <datalist id="dl-cat-gf"></datalist>
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-gasto-fijo">Guardar</button>
    </div>
  `);

  // Poblar datalist de categorías de gastos fijos (misma lógica que movimientos)
  const dlGf = document.getElementById("dl-cat-gf");
  const subcats = subcategoriasCache.map((s) => s.nombre);
  const catGrandes = categoriasGrandesCache.map((cg) => cg.nombre);
  const frecGf = {};
  movimientosCache.filter((m) => m.tipo === "gasto")
    .forEach((m) => { frecGf[m.categoria] = (frecGf[m.categoria] || 0) + 1; });
  const histGf = Object.entries(frecGf)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat)
    .filter((cat) => !subcats.includes(cat) && !catGrandes.includes(cat));
  const todasGf = [...new Set([...histGf, ...subcats, ...catGrandes])];
  dlGf.innerHTML = todasGf.map((c) => `<option value="${escapeHtml(c)}">`).join("");
  if (gasto && gasto.categoria) {
    document.getElementById("gf-categoria").value = gasto.categoria;
  }

  document.getElementById("btn-guardar-gasto-fijo").addEventListener("click", async () => {
    const payload = {
      nombre: document.getElementById("gf-nombre").value.trim(),
      monto: parseFloat(document.getElementById("gf-monto").value),
      categoria: document.getElementById("gf-categoria").value,
    };
    if (!payload.nombre || !payload.monto) return alert("Completa nombre y monto");

    let error;
    if (gasto) {
      ({ error } = await db.from("gastos_fijos").update(payload).eq("id", gasto.id));
    } else {
      ({ error } = await db.from("gastos_fijos").insert(payload));
    }
    if (error) return alert("Error: " + error.message);
    cerrarModal();
    await cargarGastosFijos();
    renderizarDashboard();
  });
}

async function eliminarGastoFijo(id) {
  if (!confirm("¿Eliminar este gasto fijo? (no borra los pagos ya registrados)")) return;
  const { error } = await db.from("gastos_fijos").update({ activo: false }).eq("id", id);
  if (error) return alert("Error: " + error.message);
  await cargarGastosFijos();
  renderizarDashboard();
}

// ============================================
// DASHBOARD — cálculos
// ============================================
function renderizarDashboard() {
  const mes = mesActual();

  // Balance actual: suma de saldos de cuentas (si hay), si no suma histórica de movimientos
  const balance = cuentasCache.length > 0
    ? cuentasCache.reduce((acc, c) => acc + saldoCuenta(c.id), 0)
    : movimientosCache.reduce((acc, m) => acc + (m.tipo === "ingreso" ? m.monto : -m.monto), 0);

  // Ingresos y gastos solo del mes actual
  const movimientosDelMes = movimientosCache.filter((m) => m.fecha.slice(0, 7) === mes);
  const ingresosMes = movimientosDelMes
    .filter((m) => m.tipo === "ingreso")
    .reduce((acc, m) => acc + m.monto, 0);
  const gastosMes = movimientosDelMes
    .filter((m) => m.tipo === "gasto")
    .reduce((acc, m) => acc + m.monto, 0);

  // Comprometido este mes
  const gastosFijosPendientes = gastosFijosCache
    .filter((g) => !estaPagadoEsteMes(g.id))
    .reduce((acc, g) => acc + g.monto, 0);
  const deudasPendientesEsteMes = deudasCache
    .filter((d) => !estaDeudaPagadaEsteMes(d.id))
    .reduce((acc, d) => {
      if (d.tipo === "tarjeta_credito") {
        const corte = corteDelMes(d.id);
        return acc + (corte ? corte.monto_corte : 0);
      }
      return acc + d.pago_mensual_planeado;
    }, 0);
  const comprometido = gastosFijosPendientes + deudasPendientesEsteMes;

  // Disponible para gastar = presupuesto de Ocio (manual o calculado) - gastado en Ocio
  const presOcio = presupuestoOcioActual();
  let dineroLibre = 0;
  if (presOcio > 0) {
    const catOcio = categoriasGrandesCache.find((c) => c.nombre.toLowerCase().includes("ocio"));
    const gastadoOcio = catOcio
      ? movimientosDelMes
          .filter((m) => m.tipo === "gasto" &&
            (m.categoria_grande_id === catOcio.id || categoriaMemoriaCache[m.categoria] === catOcio.id))
          .reduce((acc, m) => acc + m.monto, 0)
      : 0;
    dineroLibre = presOcio - gastadoOcio;
  } else {
    dineroLibre = balance - comprometido;
  }

  // Deuda total
  const deudaTotal = deudasCache.reduce((acc, d) => {
    if (d.tipo === "tarjeta_credito") return acc + d.saldo_tarjeta;
    return acc + Math.max(d.monto_total - d.pagado_acumulado, 0);
  }, 0);

  document.getElementById("d-balance").textContent = formatoMoneda(balance);
  document.getElementById("d-comprometido").textContent = formatoMoneda(comprometido);
  document.getElementById("d-libre").textContent = formatoMoneda(dineroLibre);
  // Actualizar sublabel si hay override manual
  const libreLabel = document.getElementById("d-libre-label");
  if (libreLabel) {
    libreLabel.textContent = presupuestoMesCache
      ? "Ocio ajustado este mes"
      : "Presupuesto de Ocio";
  }
  document.getElementById("d-deuda").textContent = formatoMoneda(deudaTotal);
  document.getElementById("d-ingresos").textContent = formatoMoneda(ingresosMes);
  document.getElementById("d-gastos").textContent = formatoMoneda(gastosMes);

  // Tarjetas de cuentas (Nequi, Daviplata, Efectivo, etc.)
  const contenedorCuentas = document.getElementById("d-cuentas");
  if (contenedorCuentas) {
    if (cuentasCache.length === 0) {
      contenedorCuentas.innerHTML = `
        <p class="vacio" style="font-size:13px;">
          No tienes cuentas configuradas.
          <button class="btn-link" style="display:inline;width:auto;" onclick="abrirModalCuenta()">Agregar cuenta</button>
        </p>`;
    } else {
      const iconoTipo = { banco: "🏦", billetera_digital: "📱", efectivo: "💵" };
      contenedorCuentas.innerHTML = cuentasCache.map((c) => {
        const saldo = saldoCuenta(c.id);
        return `
          <div class="tarjeta-cuenta">
            <span class="cuenta-icono">${iconoTipo[c.tipo] || "💰"}</span>
            <span class="cuenta-nombre">${escapeHtml(c.nombre)}</span>
            <span class="cuenta-saldo ${saldo < 0 ? "negativo" : ""}">${formatoMoneda(saldo)}</span>
          </div>
        `;
      }).join("");
    }
  }

  renderizarGraficaCategorias();
  renderizarPresupuesto();

  // Lista de gastos fijos del mes (en el dashboard)
  const contenedorGF = document.getElementById("d-lista-gastos-fijos");
  if (gastosFijosCache.length === 0) {
    contenedorGF.innerHTML = '<p class="vacio">No tienes gastos fijos registrados</p>';
  } else {
    contenedorGF.innerHTML = gastosFijosCache.map((g) => {
      const pagado = estaPagadoEsteMes(g.id);
      return `
        <div class="fila fila-con-badge" style="grid-template-columns:auto 1fr 100px 70px;">
          <input type="checkbox" class="checkbox-pagado" ${pagado ? "checked" : ""}
            onchange="togglePagoGastoFijo('${g.id}', this.checked)">
          <div class="fila-info">
            <span class="fila-titulo">${escapeHtml(g.nombre)}</span>
          </div>
          <span class="fila-monto">${formatoMoneda(g.monto)}</span>
          <span class="badge ${pagado ? "badge-ok" : "badge-pendiente"}">${pagado ? "Pagado" : "Pendiente"}</span>
        </div>
      `;
    }).join("");
  }

  // Últimos 5 movimientos
  const contenedorUM = document.getElementById("d-ultimos-movimientos");
  const ultimos = movimientosCache.slice(0, 5);
  if (ultimos.length === 0) {
    contenedorUM.innerHTML = '<p class="vacio">Aún no hay movimientos</p>';
  } else {
    contenedorUM.innerHTML = ultimos.map((m) => `
      <div class="fila">
        <div class="fila-info">
          <span class="fila-titulo">${escapeHtml(m.categoria)}</span>
          <span class="fila-detalle">${formatoFecha(m.fecha)}</span>
        </div>
        <span class="fila-monto ${m.tipo === "ingreso" ? "positivo" : "negativo"}">
          ${m.tipo === "ingreso" ? "+" : "-"}${formatoMoneda(m.monto)}
        </span>
      </div>
    `).join("");
  }
}

// ============================================
// GRÁFICA: gastos por categoría (pastel, navegable por mes)
// ============================================
let mesGraficaCategorias = new Date(); // mes que se está viendo en la gráfica

const PALETA_CATEGORIAS = [
  "#5b8def", "#f87171", "#fbbf24", "#4ade80", "#a78bfa",
  "#f472b6", "#38bdf8", "#fb923c", "#34d399", "#c084fc",
];

document.getElementById("dg-mes-anterior").addEventListener("click", () => {
  mesGraficaCategorias.setMonth(mesGraficaCategorias.getMonth() - 1);
  renderizarGraficaCategorias();
});
document.getElementById("dg-mes-siguiente").addEventListener("click", () => {
  mesGraficaCategorias.setMonth(mesGraficaCategorias.getMonth() + 1);
  renderizarGraficaCategorias();
});

function clavemMesGrafica() {
  const a = mesGraficaCategorias.getFullYear();
  const m = String(mesGraficaCategorias.getMonth() + 1).padStart(2, "0");
  return `${a}-${m}`;
}

let categoriaExpandidaGrafica = null; // qué categoría está expandida actualmente

function renderizarGraficaCategorias() {
  document.getElementById("dg-mes-titulo").textContent =
    mesGraficaCategorias.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  const claveMes = clavemMesGrafica();
  const gastosDelMes = movimientosCache.filter(
    (m) => m.tipo === "gasto" && m.fecha.slice(0, 7) === claveMes
  );

  const contenedor = document.getElementById("d-grafica-categorias");

  if (gastosDelMes.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No hay gastos registrados este mes</p>';
    categoriaExpandidaGrafica = null;
    return;
  }

  // Agrupar por categoría
  const totalesPorCategoria = {};
  gastosDelMes.forEach((m) => {
    totalesPorCategoria[m.categoria] = (totalesPorCategoria[m.categoria] || 0) + m.monto;
  });

  const categoriasOrdenadas = Object.entries(totalesPorCategoria)
    .sort((a, b) => b[1] - a[1]); // mayor a menor

  const totalGastos = categoriasOrdenadas.reduce((acc, [, monto]) => acc + monto, 0);

  // Si la categoría expandida ya no existe este mes (cambiaste de mes), se cierra
  if (categoriaExpandidaGrafica && !totalesPorCategoria[categoriaExpandidaGrafica]) {
    categoriaExpandidaGrafica = null;
  }

  contenedor.innerHTML = `
    <div class="grafica-categorias-wrap">
      <div class="grafica-pastel">${generarSvgPastel(categoriasOrdenadas, totalGastos)}</div>
      <div class="grafica-leyenda">
        ${categoriasOrdenadas.map(([categoria, monto], i) => `
          <div class="leyenda-item ${categoria === categoriaExpandidaGrafica ? "leyenda-activa" : ""}"
            onclick="toggleCategoriaExpandida('${escapeAtributo(categoria)}')">
            <span class="leyenda-color" style="background:${PALETA_CATEGORIAS[i % PALETA_CATEGORIAS.length]}"></span>
            <span class="leyenda-nombre">${escapeHtml(categoria)}</span>
            <span class="leyenda-monto">${formatoMoneda(monto)}</span>
            <span class="leyenda-porcentaje">${((monto / totalGastos) * 100).toFixed(0)}%</span>
          </div>
        `).join("")}
      </div>
    </div>
    <div id="detalle-categoria-expandida"></div>
  `;

  if (categoriaExpandidaGrafica) {
    renderizarDetalleCategoria(categoriaExpandidaGrafica, gastosDelMes);
  }
}

function escapeAtributo(texto) {
  return texto.replace(/'/g, "\\'");
}

function toggleCategoriaExpandida(categoria) {
  categoriaExpandidaGrafica = categoriaExpandidaGrafica === categoria ? null : categoria;
  renderizarGraficaCategorias();
}

function renderizarDetalleCategoria(categoria, gastosDelMes) {
  const gastosDeEstaCategoria = gastosDelMes
    .filter((m) => m.categoria === categoria)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const totalCategoria = gastosDeEstaCategoria.reduce((acc, m) => acc + m.monto, 0);

  document.getElementById("detalle-categoria-expandida").innerHTML = `
    <div class="detalle-categoria">
      <div class="detalle-categoria-header">
        <span>${escapeHtml(categoria)} · ${gastosDeEstaCategoria.length} ${gastosDeEstaCategoria.length === 1 ? "gasto" : "gastos"}</span>
        <span class="leyenda-monto">${formatoMoneda(totalCategoria)}</span>
      </div>
      ${gastosDeEstaCategoria.map((m) => `
        <div class="fila">
          <div class="fila-info">
            <span class="fila-titulo">${formatoFecha(m.fecha)}</span>
            <span class="fila-detalle">${descripcionMetodoPago(m.metodo_pago)}${m.nota ? " · " + escapeHtml(m.nota) : ""}</span>
          </div>
          <span class="fila-monto negativo">-${formatoMoneda(m.monto)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

// Genera un SVG de gráfica de pastel a partir de pares [categoria, monto]
function generarSvgPastel(categoriasOrdenadas, total) {
  const radio = 70;
  const centro = 75;
  let anguloInicio = -90; // empieza arriba (12 en punto)

  const segmentos = categoriasOrdenadas.map(([categoria, monto], i) => {
    const porcentaje = monto / total;
    const anguloBarrido = porcentaje * 360;
    const anguloFin = anguloInicio + anguloBarrido;

    const x1 = centro + radio * Math.cos((Math.PI / 180) * anguloInicio);
    const y1 = centro + radio * Math.sin((Math.PI / 180) * anguloInicio);
    const x2 = centro + radio * Math.cos((Math.PI / 180) * anguloFin);
    const y2 = centro + radio * Math.sin((Math.PI / 180) * anguloFin);
    const granArco = anguloBarrido > 180 ? 1 : 0;

    // Si es 100% de una sola categoría, dibujamos un círculo completo (un path no puede cerrar 360°)
    const path = porcentaje >= 0.999
      ? `M ${centro - radio} ${centro} A ${radio} ${radio} 0 1 1 ${centro + radio} ${centro} A ${radio} ${radio} 0 1 1 ${centro - radio} ${centro}`
      : `M ${centro} ${centro} L ${x1} ${y1} A ${radio} ${radio} 0 ${granArco} 1 ${x2} ${y2} Z`;

    // Etiqueta de porcentaje sobre el segmento, solo si es lo bastante grande para que se vea legible
    let etiqueta = "";
    if (porcentaje >= 0.08) {
      const anguloMedio = anguloInicio + anguloBarrido / 2;
      const radioEtiqueta = radio * 0.65;
      const xEtiqueta = centro + radioEtiqueta * Math.cos((Math.PI / 180) * anguloMedio);
      const yEtiqueta = centro + radioEtiqueta * Math.sin((Math.PI / 180) * anguloMedio);
      etiqueta = `<text x="${xEtiqueta.toFixed(1)}" y="${yEtiqueta.toFixed(1)}" class="etiqueta-porcentaje-svg" text-anchor="middle" dominant-baseline="middle">${(porcentaje * 100).toFixed(0)}%</text>`;
    }

    anguloInicio = anguloFin;
    const colorRelleno = PALETA_CATEGORIAS[i % PALETA_CATEGORIAS.length];
    return `<path d="${path}" fill="${colorRelleno}" class="segmento-pastel" onclick="toggleCategoriaExpandida('${escapeAtributo(categoria)}')" />${etiqueta}`;
  });

  return `
    <svg width="150" height="150" viewBox="0 0 150 150">
      ${segmentos.join("")}
    </svg>
  `;
}

// ============================================
// AJUSTE DE SALDO REAL
// Permite corregir el balance cuando uno dejó
// de usar la app y quiere volver a cuadrar.
// Crea un movimiento especial de ajuste para
// mantener trazabilidad sin borrar el historial.
// ============================================
function abrirModalAjusteSaldo() {
  const balanceActual = movimientosCache.reduce((acc, m) => {
    return acc + (m.tipo === "ingreso" ? m.monto : -m.monto);
  }, 0);

  abrirModal(`
    <h3>Ajustar saldo real</h3>
    <p class="fila-detalle" style="margin-bottom:16px;">
      Balance calculado actualmente: <strong>${formatoMoneda(balanceActual)}</strong><br>
      Si dejaste de registrar movimientos por un tiempo, escribe cuánto tienes
      realmente en este momento y se creará un ajuste automático.
    </p>
    <div class="campo">
      <label>¿Cuánto tienes realmente ahora?</label>
      <input type="number" id="ajuste-saldo-real" min="0" step="1"
        placeholder="${balanceActual > 0 ? balanceActual.toFixed(0) : "0"}">
    </div>
    <div id="ajuste-preview" style="margin-top:10px; font-size:13px; color:var(--color-texto-suave);"></div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-confirmar-ajuste">Aplicar ajuste</button>
    </div>
  `);

  const inputSaldo = document.getElementById("ajuste-saldo-real");
  const preview = document.getElementById("ajuste-preview");

  inputSaldo.addEventListener("input", () => {
    const saldoReal = parseFloat(inputSaldo.value);
    if (isNaN(saldoReal)) { preview.textContent = ""; return; }
    const diferencia = saldoReal - balanceActual;
    if (Math.abs(diferencia) < 1) {
      preview.textContent = "✓ El saldo ya está correcto, no se necesita ajuste.";
      return;
    }
    if (diferencia > 0) {
      preview.innerHTML = `Se creará un <span style="color:var(--color-positivo)">ingreso de ajuste</span> por ${formatoMoneda(diferencia)}.`;
    } else {
      preview.innerHTML = `Se creará un <span style="color:var(--color-negativo)">gasto de ajuste</span> por ${formatoMoneda(Math.abs(diferencia))}.`;
    }
  });

  document.getElementById("btn-confirmar-ajuste").addEventListener("click", async () => {
    const saldoReal = parseFloat(inputSaldo.value);
    if (isNaN(saldoReal) || saldoReal < 0) return alert("Ingresa un monto válido");
    const diferencia = saldoReal - balanceActual;
    if (Math.abs(diferencia) < 1) { cerrarModal(); return; }

    const payload = {
      tipo: diferencia > 0 ? "ingreso" : "gasto",
      monto: Math.abs(diferencia),
      categoria: "Ajuste de saldo",
      fecha: fechaHoy(),
      nota: `Ajuste manual: saldo real ${formatoMoneda(saldoReal)}`,
      metodo_pago: "efectivo",
    };

    const { error } = await db.from("movimientos").insert(payload);
    if (error) return alert("Error: " + error.message);

    cerrarModal();
    await cargarMovimientos();
    renderizarDashboard();
    alert(`Ajuste aplicado. Nuevo balance: ${formatoMoneda(saldoReal)}`);
  });
}

// ============================================
// PRESUPUESTO — renderizado completo
// ============================================
function renderizarPresupuesto() {
  const ingreso = configuracionCache.ingreso_mensual || 0;
  const mes = mesActual();

  // Calcular gastos del mes actual agrupados por categoría grande (usando el campo directo)
  const gastosDelMes = movimientosCache.filter(
    (m) => m.tipo === "gasto" && m.fecha.slice(0, 7) === mes
  );
  // gastosPorCatGrande: { "uuid-cg": totalMonto }
  const gastosPorCatGrande = {};
  gastosDelMes.forEach((m) => {
    const cgId = m.categoria_grande_id || categoriaMemoriaCache[m.categoria];
    if (cgId) {
      gastosPorCatGrande[cgId] = (gastosPorCatGrande[cgId] || 0) + m.monto;
    }
  });
  // También mantener por nombre de categoría para la gráfica de pastel
  const gastosPorCategoria = {};
  gastosDelMes.forEach((m) => {
    gastosPorCategoria[m.categoria] = (gastosPorCategoria[m.categoria] || 0) + m.monto;
  });

  // Comprometido y disponible — misma lógica que el dashboard
  const gastosFijosPendientes = gastosFijosCache
    .filter((g) => !estaPagadoEsteMes(g.id))
    .reduce((acc, g) => acc + g.monto, 0);
  const deudasPendientes = deudasCache
    .filter((d) => !estaDeudaPagadaEsteMes(d.id))
    .reduce((acc, d) => {
      if (d.tipo === "tarjeta_credito") {
        const corte = corteDelMes(d.id);
        return acc + (corte ? corte.monto_corte : 0);
      }
      return acc + d.pago_mensual_planeado;
    }, 0);
  const comprometido = gastosFijosPendientes + deudasPendientes;

  // Disponible = presupuesto de Ocio − gastado en Ocio este mes
  const catOcio = categoriasGrandesCache.find((c) => c.nombre.toLowerCase().includes("ocio"));
  let disponible = 0;
  if (catOcio && ingreso > 0) {
    const presupuestoOcio = presupuestoMesCache
      ? presupuestoMesCache.monto_ocio
      : ingreso * (catOcio.porcentaje / 100);
    const gastadoOcio = gastosDelMes
      .filter((m) =>
        m.categoria_grande_id === catOcio.id ||
        categoriaMemoriaCache[m.categoria] === catOcio.id
      )
      .reduce((acc, m) => acc + m.monto, 0);
    disponible = presupuestoOcio - gastadoOcio;
  } else {
    disponible = ingreso - comprometido;
  }

  // Tarjetas superiores
  document.getElementById("p-ingreso-mensual").textContent = formatoMoneda(ingreso);
  document.getElementById("p-comprometido").textContent = formatoMoneda(comprometido);
  document.getElementById("p-disponible").textContent = formatoMoneda(disponible);

  // También actualizar el mini-bloque del dashboard
  const dIngreso = document.getElementById("d-ingreso-mensual");
  if (dIngreso) dIngreso.textContent = formatoMoneda(ingreso);

  // ---- CUENTAS (en panel Presupuesto) ----
  const contenedorPCuentas = document.getElementById("p-cuentas");
  if (contenedorPCuentas) {
    const iconoTipo = { banco: "🏦", billetera_digital: "📱", efectivo: "💵" };
    if (cuentasCache.length === 0) {
      contenedorPCuentas.innerHTML = `<p class="vacio">No tienes cuentas creadas aún.</p>`;
    } else {
      contenedorPCuentas.innerHTML = cuentasCache.map((c) => {
        const saldo = saldoCuenta(c.id);
        return `
          <div class="fila">
            <div class="fila-info">
              <span class="fila-titulo">${iconoTipo[c.tipo] || "💰"} ${escapeHtml(c.nombre)}</span>
              <span class="fila-detalle">${c.tipo === "banco" ? "🏦 Banco" : c.tipo === "billetera_digital" ? "📱 Billetera digital" : "💵 Efectivo"}</span>
            </div>
            <span class="fila-monto ${saldo < 0 ? "negativo" : "positivo"}">${formatoMoneda(saldo)}</span>
            <div class="fila-acciones">
              <button onclick="abrirModalCuenta('${c.id}')">Editar</button>
              <button onclick="eliminarCuenta('${c.id}')">Eliminar</button>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // ---- AHORROS PROGRAMADOS ----
  const contenedorAP = document.getElementById("p-ahorros-programados");
  if (contenedorAP) {
    if (ahorrosProgramadosCache.length === 0) {
      contenedorAP.innerHTML = `<p class="vacio">No tienes ahorros programados. Crea uno para separar automáticamente parte de tu ingreso cada mes.</p>`;
    } else {
      contenedorAP.innerHTML = ahorrosProgramadosCache.map((a) => {
        const ejecucion = ejecucionAhorro(a.id);
        const monto = a.porcentaje
          ? (ingreso * a.porcentaje / 100)
          : (a.monto_fijo || 0);
        const cuenta = cuentasCache.find((c) => c.id === a.cuenta_id);
        const meta = metasAhorroCache.find((m) => m.id === a.meta_id);
        return `
          <div class="fila">
            <div class="fila-info">
              <span class="fila-titulo">${escapeHtml(a.nombre)}</span>
              <span class="fila-detalle">
                Día ${a.dia_del_mes} · ${a.porcentaje ? `${a.porcentaje}%` : formatoMoneda(a.monto_fijo)} = ${formatoMoneda(monto)}
                ${cuenta ? ` · desde ${escapeHtml(cuenta.nombre)}` : ""}
                ${meta ? ` → ${escapeHtml(meta.nombre)}` : ""}
              </span>
            </div>
            ${ejecucion
              ? `<span class="badge badge-ok">Ejecutado este mes</span>`
              : `<button class="btn-primario btn-pequeno" onclick="ejecutarAhorro('${a.id}')">Apartar ahora</button>`
            }
            <div class="fila-acciones">
              <button onclick="abrirModalAhorroProgramado('${a.id}')">Editar</button>
              <button onclick="eliminarAhorroProgramado('${a.id}')">Eliminar</button>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // ---- CATEGORÍAS GRANDES con sus subcategorías ----
  const contenedorCats = document.getElementById("p-categorias-grandes");
  if (categoriasGrandesCache.length === 0) {
    contenedorCats.innerHTML = `
      <p class="vacio">No tienes categorías creadas aún.</p>
      <button class="btn-secundario" style="margin-top:8px;" onclick="abrirModalCategoriaGrande()">+ Crear primera categoría</button>
    `;
  } else {
    const totalPorcentajes = categoriasGrandesCache.reduce((acc, cg) => acc + cg.porcentaje, 0);
    const alertaPorcentaje = Math.abs(totalPorcentajes - 100) > 0.5
      ? `<p class="alerta-advertencia" style="margin-bottom:12px;">⚠ Los porcentajes suman ${totalPorcentajes}%. Deben sumar 100%.</p>`
      : "";

    contenedorCats.innerHTML = alertaPorcentaje + categoriasGrandesCache.map((cg) => {
      const presupuesto = ingreso * (cg.porcentaje / 100);
      const subs = subcategoriasCache.filter((s) => s.categoria_grande_id === cg.id);

      // Gastos de este mes que pertenecen a esta categoría grande (por campo directo o memoria)
      const gastado = gastosPorCatGrande[cg.id] || 0;

      const disponibleCat = presupuesto - gastado;
      const porcentajeUsado = presupuesto > 0 ? Math.min((gastado / presupuesto) * 100, 100) : 0;

      // Alerta visual
      let estadoClase = "barra-ok";
      let estadoLabel = "";
      if (presupuesto > 0) {
        if (gastado > presupuesto) { estadoClase = "barra-excedido"; estadoLabel = "⚠ Excedido"; }
        else if (gastado / presupuesto >= 0.8) { estadoClase = "barra-advertencia"; estadoLabel = "⚠ Cerca del límite"; }
      }

      return `
        <div class="bloque-categoria-grande">
          <div class="cat-grande-header">
            <div>
              <span class="cat-grande-nombre">${escapeHtml(cg.nombre)}</span>
              <span class="cat-grande-pct">${cg.porcentaje}% del ingreso</span>
            </div>
            <div class="fila-acciones">
              <button onclick="abrirModalCategoriaGrande('${cg.id}')">Editar</button>
              <button onclick="eliminarCategoriaGrande('${cg.id}')">Eliminar</button>
            </div>
          </div>

          <div class="cat-grande-cifras">
            <div><span>Presupuesto</span>${formatoMoneda(presupuesto)}</div>
            <div><span>Gastado</span>${formatoMoneda(gastado)}</div>
            <div><span>Disponible</span><strong class="${disponibleCat >= 0 ? "positivo" : "negativo"}">${formatoMoneda(disponibleCat)}</strong></div>
          </div>

          <div class="barra-progreso" title="${porcentajeUsado.toFixed(0)}% usado">
            <div class="barra-progreso-fill ${estadoClase}" style="width:${porcentajeUsado}%"></div>
          </div>
          ${estadoLabel ? `<p class="alerta-cat ${estadoClase}-texto">${estadoLabel}</p>` : ""}

          <div class="subcats-lista">
            ${subs.map((s) => `
              <span class="subcat-chip">
                ${escapeHtml(s.nombre)}
                <button onclick="eliminarSubcategoria('${s.id}')" title="Eliminar">×</button>
              </span>
            `).join("")}
            <button class="btn-link" style="font-size:12px;width:auto;display:inline;"
              onclick="abrirModalSubcategoria('${cg.id}')">+ Subcategoría</button>
          </div>
        </div>
      `;
    }).join("");
  }

  // ---- DISTRIBUCIÓN EN EL DASHBOARD ----
  const contenedorDash = document.getElementById("d-distribucion-categorias");
  if (contenedorDash) {
    if (categoriasGrandesCache.length === 0) {
      contenedorDash.innerHTML = '<p class="vacio">Configura tus categorías en la pestaña Presupuesto</p>';
    } else {
      contenedorDash.innerHTML = categoriasGrandesCache.map((cg) => {
        const presupuesto = ingreso * (cg.porcentaje / 100);
        const subs = subcategoriasCache.filter((s) => s.categoria_grande_id === cg.id);
        const gastado = gastosPorCatGrande[cg.id] || 0;
        const pct = presupuesto > 0 ? Math.min((gastado / presupuesto) * 100, 100) : 0;
        let estadoClase = gastado > presupuesto ? "barra-excedido" : pct >= 80 ? "barra-advertencia" : "barra-ok";
        return `
          <div class="fila" style="flex-direction:column;align-items:stretch;gap:4px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span>${escapeHtml(cg.nombre)} <span style="color:var(--color-texto-suave)">(${cg.porcentaje}%)</span></span>
              <span>${formatoMoneda(gastado)} / ${formatoMoneda(presupuesto)}</span>
            </div>
            <div class="barra-progreso" style="height:6px;">
              <div class="barra-progreso-fill ${estadoClase}" style="width:${pct}%"></div>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // ---- METAS DE AHORRO ----
  renderizarMetasAhorro();
}

function renderizarMetasAhorro() {
  // Dashboard: resumen compacto sin botones
  const dash = document.getElementById("d-metas-ahorro");
  if (dash) {
    if (metasAhorroCache.length === 0) {
      dash.innerHTML = '<p class="vacio">No tienes metas creadas</p>';
    } else {
      dash.innerHTML = metasAhorroCache.map((m) => {
        const pct = m.valor_objetivo > 0
          ? Math.min((m.valor_ahorrado / m.valor_objetivo) * 100, 100) : 0;
        return `
          <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
              <span style="font-weight:600;">${escapeHtml(m.nombre)}</span>
              <span>${formatoMoneda(m.valor_ahorrado)} / ${formatoMoneda(m.valor_objetivo)}</span>
            </div>
            <div class="barra-progreso">
              <div class="barra-progreso-fill barra-ok" style="width:${pct}%"></div>
            </div>
            <p style="font-size:11px;color:var(--color-texto-suave);margin-top:2px;">${pct.toFixed(0)}% · Falta ${formatoMoneda(Math.max(m.valor_objetivo - m.valor_ahorrado, 0))}</p>
          </div>`;
      }).join("");
    }
  }

  // Presupuesto: vista completa con editar/eliminar
  const pres = document.getElementById("p-metas-ahorro");
  if (pres) {
    if (metasAhorroCache.length === 0) {
      pres.innerHTML = '<p class="vacio">No tienes metas de ahorro creadas</p>';
    } else {
      pres.innerHTML = metasAhorroCache.map((m) => {
        const pct = m.valor_objetivo > 0
          ? Math.min((m.valor_ahorrado / m.valor_objetivo) * 100, 100) : 0;
        const falta = Math.max(m.valor_objetivo - m.valor_ahorrado, 0);
        const fechaStr = m.fecha_objetivo ? ` · Meta: ${formatoFecha(m.fecha_objetivo)}` : "";
        return `
          <div class="bloque-meta-ahorro">
            <div class="meta-header">
              <span class="meta-nombre">${escapeHtml(m.nombre)}</span>
              <div class="fila-acciones">
                <button onclick="abrirModalMeta('${m.id}')">Editar</button>
                <button onclick="eliminarMeta('${m.id}')">Eliminar</button>
              </div>
            </div>
            <div class="meta-cifras">
              <div><span>Objetivo</span>${formatoMoneda(m.valor_objetivo)}</div>
              <div><span>Ahorrado</span>${formatoMoneda(m.valor_ahorrado)}</div>
              <div><span>Falta</span>${formatoMoneda(falta)}</div>
            </div>
            <div class="barra-progreso">
              <div class="barra-progreso-fill barra-ok" style="width:${pct}%"></div>
            </div>
            <p style="font-size:11px;color:var(--color-texto-suave);margin-top:4px;">${pct.toFixed(0)}% completado${fechaStr}</p>
          </div>`;
      }).join("");
    }
  }
}

// ============================================
// MODALES DE PRESUPUESTO
// ============================================

// --- Modal: Configurar ingreso mensual y porcentajes ---
function abrirModalConfiguracion() {
  const ingreso = configuracionCache.ingreso_mensual || 0;
  abrirModal(`
    <h3>Configurar ingreso y distribución</h3>
    <div class="campo">
      <label>Ingreso mensual base</label>
      <input type="number" id="cfg-ingreso" min="0" value="${ingreso}" placeholder="0">
    </div>
    <div style="margin-top:16px;">
      <p style="font-size:13px;font-weight:600;margin-bottom:10px;">Porcentajes por categoría</p>
      <div id="cfg-porcentajes">
        ${categoriasGrandesCache.map((cg) => `
          <div class="campo" style="margin-bottom:10px;">
            <label>${escapeHtml(cg.nombre)}</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <input type="number" class="cfg-pct-input" data-id="${cg.id}"
                min="0" max="100" value="${cg.porcentaje}" style="width:80px;">
              <span>%</span>
              <span class="cfg-pct-monto" id="pct-monto-${cg.id}" style="color:var(--color-texto-suave);font-size:13px;"></span>
            </div>
          </div>
        `).join("")}
      </div>
      <p id="cfg-suma-aviso" style="font-size:13px;margin-top:8px;"></p>
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-config">Guardar</button>
    </div>
  `);

  function actualizarPreview() {
    const ing = parseFloat(document.getElementById("cfg-ingreso").value) || 0;
    let suma = 0;
    document.querySelectorAll(".cfg-pct-input").forEach((inp) => {
      const pct = parseFloat(inp.value) || 0;
      suma += pct;
      const montoEl = document.getElementById(`pct-monto-${inp.dataset.id}`);
      if (montoEl) montoEl.textContent = `= ${formatoMoneda(ing * pct / 100)}`;
    });
    const aviso = document.getElementById("cfg-suma-aviso");
    if (Math.abs(suma - 100) < 0.5) {
      aviso.textContent = "✓ Los porcentajes suman 100%";
      aviso.style.color = "var(--color-positivo)";
    } else {
      aviso.textContent = `⚠ Los porcentajes suman ${suma}% (deben sumar 100%)`;
      aviso.style.color = "var(--color-advertencia)";
    }
  }
  actualizarPreview();
  document.getElementById("cfg-ingreso").addEventListener("input", actualizarPreview);
  document.querySelectorAll(".cfg-pct-input").forEach((inp) =>
    inp.addEventListener("input", actualizarPreview)
  );

  document.getElementById("btn-guardar-config").addEventListener("click", async () => {
    const ingreso = parseFloat(document.getElementById("cfg-ingreso").value) || 0;
    let suma = 0;
    const updates = [...document.querySelectorAll(".cfg-pct-input")].map((inp) => {
      const pct = parseFloat(inp.value) || 0;
      suma += pct;
      return { id: inp.dataset.id, porcentaje: pct };
    });
    if (categoriasGrandesCache.length > 0 && Math.abs(suma - 100) > 0.5) {
      if (!confirm(`Los porcentajes suman ${suma}%. ¿Guardar de todas formas?`)) return;
    }
    await guardarConfiguracion(ingreso);
    for (const u of updates) {
      await db.from("categorias_grandes").update({ porcentaje: u.porcentaje }).eq("id", u.id);
    }
    cerrarModal();
    await Promise.all([cargarConfiguracion(), cargarCategoriasGrandes()]);
    renderizarDashboard();
    renderizarPresupuesto();
  });
}

// --- Modal: Categoría grande ---
function abrirModalCategoriaGrande(id) {
  const cat = id ? categoriasGrandesCache.find((c) => c.id === id) : null;
  abrirModal(`
    <h3>${cat ? "Editar" : "Nueva"} categoría</h3>
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="cg-nombre" value="${cat ? escapeHtml(cat.nombre) : ""}" placeholder="Ej: Obligaciones">
    </div>
    <div class="campo">
      <label>Porcentaje del ingreso mensual</label>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" id="cg-pct" min="0" max="100" value="${cat ? cat.porcentaje : 0}" style="width:80px;">
        <span>%</span>
      </div>
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-cat">Guardar</button>
    </div>
  `);

  document.getElementById("btn-guardar-cat").addEventListener("click", async () => {
    const nombre = document.getElementById("cg-nombre").value.trim();
    const porcentaje = parseFloat(document.getElementById("cg-pct").value) || 0;
    if (!nombre) return alert("Escribe un nombre");
    const payload = { nombre, porcentaje, orden: cat ? cat.orden : categoriasGrandesCache.length + 1 };
    let error;
    if (cat) {
      ({ error } = await db.from("categorias_grandes").update(payload).eq("id", cat.id));
    } else {
      ({ error } = await db.from("categorias_grandes").insert(payload));
    }
    if (error) return alert("Error: " + error.message);
    cerrarModal();
    await Promise.all([cargarCategoriasGrandes(), cargarSubcategorias()]);
    renderizarPresupuesto();
  });
}

async function eliminarCategoriaGrande(id) {
  if (!confirm("¿Eliminar esta categoría y todas sus subcategorías? Los movimientos registrados no se borran.")) return;
  const { error } = await db.from("categorias_grandes").delete().eq("id", id);
  if (error) return alert("Error: " + error.message);
  await Promise.all([cargarCategoriasGrandes(), cargarSubcategorias()]);
  renderizarPresupuesto();
}

// --- Modal: Subcategoría ---
function abrirModalSubcategoria(categoriaGrandeId) {
  const catGrande = categoriasGrandesCache.find((c) => c.id === categoriaGrandeId);
  abrirModal(`
    <h3>Nueva subcategoría en ${escapeHtml(catGrande ? catGrande.nombre : "")}</h3>
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="sc-nombre" placeholder="Ej: Arriendo, Luz, Netflix...">
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-subcat">Guardar</button>
    </div>
  `);

  document.getElementById("btn-guardar-subcat").addEventListener("click", async () => {
    const nombre = document.getElementById("sc-nombre").value.trim();
    if (!nombre) return alert("Escribe un nombre");
    const { error } = await db.from("subcategorias").insert({ nombre, categoria_grande_id: categoriaGrandeId });
    if (error) return alert("Error: " + error.message);
    cerrarModal();
    await cargarSubcategorias();
    renderizarPresupuesto();
  });
}

async function eliminarSubcategoria(id) {
  if (!confirm("¿Eliminar esta subcategoría?")) return;
  const { error } = await db.from("subcategorias").delete().eq("id", id);
  if (error) return alert("Error: " + error.message);
  await cargarSubcategorias();
  renderizarPresupuesto();
}

// --- Modal: Meta de ahorro ---
function abrirModalMeta(id) {
  const meta = id ? metasAhorroCache.find((m) => m.id === id) : null;
  abrirModal(`
    <h3>${meta ? "Editar" : "Nueva"} meta de ahorro</h3>
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="meta-nombre" value="${meta ? escapeHtml(meta.nombre) : ""}" placeholder="Ej: Fondo de emergencia">
    </div>
    <div class="campo">
      <label>Valor objetivo</label>
      <input type="number" id="meta-objetivo" min="0" value="${meta ? meta.valor_objetivo : ""}" placeholder="0">
    </div>
    <div class="campo">
      <label>Valor ahorrado hasta ahora</label>
      <input type="number" id="meta-ahorrado" min="0" value="${meta ? meta.valor_ahorrado : 0}" placeholder="0">
    </div>
    <div class="campo">
      <label>Fecha objetivo (opcional)</label>
      <input type="date" id="meta-fecha" value="${meta && meta.fecha_objetivo ? meta.fecha_objetivo : ""}">
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-meta">Guardar</button>
    </div>
  `);

  document.getElementById("btn-guardar-meta").addEventListener("click", async () => {
    const payload = {
      nombre: document.getElementById("meta-nombre").value.trim(),
      valor_objetivo: parseFloat(document.getElementById("meta-objetivo").value),
      valor_ahorrado: parseFloat(document.getElementById("meta-ahorrado").value) || 0,
      fecha_objetivo: document.getElementById("meta-fecha").value || null,
    };
    if (!payload.nombre || !payload.valor_objetivo) return alert("Completa nombre y valor objetivo");
    let error;
    if (meta) {
      ({ error } = await db.from("metas_ahorro").update(payload).eq("id", meta.id));
    } else {
      ({ error } = await db.from("metas_ahorro").insert(payload));
    }
    if (error) return alert("Error: " + error.message);
    cerrarModal();
    await cargarMetasAhorro();
    renderizarPresupuesto();
  });
}

async function eliminarMeta(id) {
  if (!confirm("¿Eliminar esta meta de ahorro?")) return;
  const { error } = await db.from("metas_ahorro").update({ activa: false }).eq("id", id);
  if (error) return alert("Error: " + error.message);
  await cargarMetasAhorro();
  renderizarPresupuesto();
}

// ============================================
// CUENTAS — gestión completa
// ============================================
function abrirModalCuenta(id) {
  const cuenta = id ? cuentasCache.find((c) => c.id === id) : null;
  // Para edición: mostrar saldo actual (lo que el usuario ve y quiere corregir)
  // Para nueva cuenta: mostrar 0
  const saldoActual = cuenta ? saldoCuenta(cuenta.id) : 0;
  const delta = cuenta
    ? movimientosCache
        .filter((m) => m.cuenta_id === cuenta.id)
        .reduce((acc, m) => acc + (m.tipo === "ingreso" ? m.monto : -m.monto), 0)
    : 0;

  abrirModal(`
    <h3>${cuenta ? "Editar" : "Nueva"} cuenta</h3>
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="cta-nombre" value="${cuenta ? escapeHtml(cuenta.nombre) : ""}"
        placeholder="Ej: Nequi, Daviplata, Efectivo">
    </div>
    <div class="campo">
      <label>Tipo</label>
      <select id="cta-tipo">
        <option value="banco" ${cuenta?.tipo === "banco" ? "selected" : ""}>🏦 Banco / Débito</option>
        <option value="billetera_digital" ${cuenta?.tipo === "billetera_digital" ? "selected" : ""}>📱 Billetera digital</option>
        <option value="efectivo" ${cuenta?.tipo === "efectivo" ? "selected" : ""}>💵 Efectivo</option>
      </select>
    </div>
    <div class="campo">
      <label>${cuenta ? "Saldo actual real (corrígelo si no cuadra)" : "Saldo inicial"}</label>
      <input type="number" id="cta-saldo" value="${saldoActual}" placeholder="0">
      ${cuenta && delta !== 0 ? `<small style="color:var(--color-texto-suave);font-size:11px;">Movimientos registrados: ${formatoMoneda(delta)}</small>` : ""}
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-cuenta">Guardar</button>
    </div>
  `);

  document.getElementById("btn-guardar-cuenta").addEventListener("click", async () => {
    const saldoDeseado = parseFloat(document.getElementById("cta-saldo").value) || 0;
    // Recalcular saldo_inicial para que saldo_inicial + delta = saldoDeseado
    const nuevoSaldoInicial = saldoDeseado - delta;
    const payload = {
      nombre: document.getElementById("cta-nombre").value.trim(),
      tipo: document.getElementById("cta-tipo").value,
      saldo_inicial: nuevoSaldoInicial,
      orden: cuenta ? cuenta.orden : cuentasCache.length + 1,
    };
    if (!payload.nombre) return alert("Escribe un nombre para la cuenta");
    let error;
    if (cuenta) {
      ({ error } = await db.from("cuentas").update(payload).eq("id", cuenta.id));
    } else {
      ({ error } = await db.from("cuentas").insert(payload));
    }
    if (error) return alert("Error: " + error.message);
    cerrarModal();
    await Promise.all([cargarCuentas(), cargarMovimientos()]);
    renderizarDashboard();
    renderizarPresupuesto();
  });
}

async function eliminarCuenta(id) {
  if (!confirm("¿Eliminar esta cuenta? Los movimientos asociados no se borran.")) return;
  await db.from("cuentas").update({ activa: false }).eq("id", id);
  await Promise.all([cargarCuentas(), cargarMovimientos()]);
  renderizarDashboard();
  renderizarPresupuesto();
}

// ============================================
// PRESUPUESTO DE OCIO — override mensual
// ============================================
async function abrirModalOcioManual() {
  const ingresoPct = presupuestoOcioActual();
  const mesLabel = new Date().toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  abrirModal(`
    <h3>Ajustar presupuesto de Ocio</h3>
    <p class="fila-detalle" style="margin-bottom:14px;">
      Mes: ${mesLabel}<br>
      Presupuesto calculado por porcentaje: <strong>${formatoMoneda(ingresoPct)}</strong><br>
      <small style="color:var(--color-texto-suave);">Este ajuste solo aplica este mes. El próximo mes vuelve al porcentaje normal.</small>
    </p>
    <div class="campo">
      <label>Monto disponible para Ocio este mes</label>
      <input type="number" id="ocio-monto" min="0" value="${presupuestoMesCache ? presupuestoMesCache.monto_ocio : ingresoPct.toFixed(0)}" placeholder="0">
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      ${presupuestoMesCache ? `<button class="btn-secundario" id="btn-reset-ocio">Restablecer automático</button>` : ""}
      <button class="btn-primario" id="btn-guardar-ocio">Guardar</button>
    </div>
  `);

  document.getElementById("btn-guardar-ocio").addEventListener("click", async () => {
    const monto = parseFloat(document.getElementById("ocio-monto").value);
    if (isNaN(monto) || monto < 0) return alert("Ingresa un monto válido");
    const { error } = await db.from("presupuesto_mes").upsert(
      { mes: mesActual(), monto_ocio: monto },
      { onConflict: "user_id,mes" }
    );
    if (error) return alert("Error: " + error.message);
    cerrarModal();
    await cargarPresupuestoMes();
    renderizarDashboard();
    renderizarPresupuesto();
  });

  const btnReset = document.getElementById("btn-reset-ocio");
  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      if (!presupuestoMesCache) { cerrarModal(); return; }
      await db.from("presupuesto_mes").delete().eq("id", presupuestoMesCache.id);
      cerrarModal();
      await cargarPresupuestoMes();
      renderizarDashboard();
      renderizarPresupuesto();
    });
  }
}

// ============================================
// AHORRO PROGRAMADO — gestión completa
// ============================================
function abrirModalAhorroProgramado(id) {
  const ahorro = id ? ahorrosProgramadosCache.find((a) => a.id === id) : null;
  abrirModal(`
    <h3>${ahorro ? "Editar" : "Nuevo"} ahorro programado</h3>
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="ap-nombre" value="${ahorro ? escapeHtml(ahorro.nombre) : "Ahorro mensual"}" placeholder="Ej: Ahorro del día 25">
    </div>
    <div class="campo">
      <label>Cuenta de origen (de dónde sale)</label>
      <select id="ap-cuenta">
        ${cuentasCache.map((c) => `<option value="${c.id}" ${ahorro?.cuenta_id === c.id ? "selected" : ""}>${escapeHtml(c.nombre)}</option>`).join("")}
      </select>
    </div>
    <div class="campo">
      <label>Meta de destino (opcional)</label>
      <select id="ap-meta">
        <option value="">Sin meta específica</option>
        ${metasAhorroCache.map((m) => `<option value="${m.id}" ${ahorro?.meta_id === m.id ? "selected" : ""}>${escapeHtml(m.nombre)}</option>`).join("")}
      </select>
    </div>
    <div class="campo">
      <label>Día del mes para apartar</label>
      <input type="number" id="ap-dia" min="1" max="31" value="${ahorro ? ahorro.dia_del_mes : 25}">
    </div>
    <div class="campo">
      <label>¿Porcentaje del ingreso mensual o monto fijo?</label>
      <div class="toggle-tipo">
        <button type="button" id="ap-tipo-pct" class="${!ahorro || ahorro.porcentaje ? "activo-ingreso" : ""}">Porcentaje</button>
        <button type="button" id="ap-tipo-fijo" class="${ahorro?.monto_fijo ? "activo-ingreso" : ""}">Monto fijo</button>
      </div>
    </div>
    <div id="ap-campo-pct" class="campo ${ahorro?.monto_fijo ? "oculto" : ""}">
      <label>Porcentaje del ingreso</label>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" id="ap-porcentaje" min="0" max="100" value="${ahorro?.porcentaje || 20}" style="width:80px;">
        <span>%</span>
        <span id="ap-pct-preview" style="color:var(--color-texto-suave);font-size:13px;"></span>
      </div>
    </div>
    <div id="ap-campo-fijo" class="campo ${!ahorro?.monto_fijo ? "oculto" : ""}">
      <label>Monto fijo</label>
      <input type="number" id="ap-monto-fijo" min="0" value="${ahorro?.monto_fijo || ""}">
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-ap">Guardar</button>
    </div>
  `);

  // Preview del monto calculado
  function actualizarPreviewPct() {
    const pct = parseFloat(document.getElementById("ap-porcentaje").value) || 0;
    const monto = (configuracionCache.ingreso_mensual || 0) * pct / 100;
    document.getElementById("ap-pct-preview").textContent = `= ${formatoMoneda(monto)}`;
  }
  actualizarPreviewPct();
  document.getElementById("ap-porcentaje").addEventListener("input", actualizarPreviewPct);

  // Toggle porcentaje / fijo
  document.getElementById("ap-tipo-pct").addEventListener("click", () => {
    document.getElementById("ap-tipo-pct").classList.add("activo-ingreso");
    document.getElementById("ap-tipo-fijo").classList.remove("activo-ingreso");
    document.getElementById("ap-campo-pct").classList.remove("oculto");
    document.getElementById("ap-campo-fijo").classList.add("oculto");
  });
  document.getElementById("ap-tipo-fijo").addEventListener("click", () => {
    document.getElementById("ap-tipo-fijo").classList.add("activo-ingreso");
    document.getElementById("ap-tipo-pct").classList.remove("activo-ingreso");
    document.getElementById("ap-campo-fijo").classList.remove("oculto");
    document.getElementById("ap-campo-pct").classList.add("oculto");
  });

  document.getElementById("btn-guardar-ap").addEventListener("click", async () => {
    const usaPct = document.getElementById("ap-tipo-pct").classList.contains("activo-ingreso");
    const payload = {
      nombre: document.getElementById("ap-nombre").value.trim(),
      cuenta_id: document.getElementById("ap-cuenta").value || null,
      meta_id: document.getElementById("ap-meta").value || null,
      dia_del_mes: parseInt(document.getElementById("ap-dia").value) || 25,
      porcentaje: usaPct ? (parseFloat(document.getElementById("ap-porcentaje").value) || null) : null,
      monto_fijo: !usaPct ? (parseFloat(document.getElementById("ap-monto-fijo").value) || null) : null,
    };
    if (!payload.nombre) return alert("Escribe un nombre");
    if (!payload.porcentaje && !payload.monto_fijo) return alert("Define un porcentaje o monto fijo");
    let error;
    if (ahorro) {
      ({ error } = await db.from("ahorros_programados").update(payload).eq("id", ahorro.id));
    } else {
      ({ error } = await db.from("ahorros_programados").insert(payload));
    }
    if (error) return alert("Error: " + error.message);
    cerrarModal();
    await Promise.all([cargarAhorrosProgramados(), cargarAhorrosEjecuciones()]);
    renderizarPresupuesto();
  });
}

async function eliminarAhorroProgramado(id) {
  if (!confirm("¿Eliminar este ahorro programado?")) return;
  await db.from("ahorros_programados").update({ activo: false }).eq("id", id);
  await cargarAhorrosProgramados();
  renderizarPresupuesto();
}

// Ejecutar un ahorro programado manualmente
async function ejecutarAhorro(ahorroId) {
  const ahorro = ahorrosProgramadosCache.find((a) => a.id === ahorroId);
  if (!ahorro) return;
  const monto = ahorro.porcentaje
    ? (configuracionCache.ingreso_mensual || 0) * ahorro.porcentaje / 100
    : ahorro.monto_fijo;
  if (!monto || monto <= 0) return alert("El monto calculado es 0. Revisa la configuración.");

  // Crear movimiento de gasto desde la cuenta origen
  const { data: mov, error: errorMov } = await db.from("movimientos").insert({
    tipo: "gasto",
    monto,
    categoria: "Ahorro",
    fecha: fechaHoy(),
    nota: ahorro.nombre,
    metodo_pago: ahorro.cuenta_id ? `cuenta:${ahorro.cuenta_id}` : "efectivo",
    cuenta_id: ahorro.cuenta_id || null,
  }).select().single();
  if (errorMov) return alert("Error: " + errorMov.message);

  // Si tiene meta, actualizar el valor ahorrado
  if (ahorro.meta_id) {
    const meta = metasAhorroCache.find((m) => m.id === ahorro.meta_id);
    if (meta) {
      await db.from("metas_ahorro")
        .update({ valor_ahorrado: meta.valor_ahorrado + monto })
        .eq("id", meta.id);
    }
  }

  // Registrar la ejecución
  await db.from("ahorros_ejecuciones").upsert(
    { ahorro_id: ahorroId, mes: mesActual(), monto, movimiento_id: mov.id },
    { onConflict: "ahorro_id,mes" }
  );

  await Promise.all([
    cargarMovimientos(), cargarMetasAhorro(),
    cargarAhorrosEjecuciones(), cargarCuentas(),
  ]);
  renderizarDashboard();
  renderizarPresupuesto();
  alert(`Ahorro ejecutado: ${formatoMoneda(monto)} apartados correctamente.`);
}

// ============================================
// EXPORTACIÓN CSV
// ============================================
function exportarCSV() {
  const ahora = new Date().toISOString().slice(0, 10);

  // Hoja 1: Movimientos
  const filasMovimientos = [
    ["Fecha", "Tipo", "Categoría", "Tipo de gasto", "Cuenta", "Método de pago", "Monto", "Nota"],
    ...movimientosCache.map((m) => {
      const catGrande = categoriasGrandesCache.find((c) => c.id === m.categoria_grande_id);
      const cuenta = cuentasCache.find((c) => c.id === m.cuenta_id);
      return [
        m.fecha,
        m.tipo,
        m.categoria,
        catGrande ? catGrande.nombre : "",
        cuenta ? cuenta.nombre : descripcionMetodoPago(m.metodo_pago),
        m.metodo_pago || "",
        m.tipo === "ingreso" ? m.monto : -m.monto,
        m.nota || "",
      ];
    }),
  ];

  // Hoja 2: Cuentas y saldos
  const filasCuentas = [
    ["Cuenta", "Tipo", "Saldo inicial", "Saldo actual"],
    ...cuentasCache.map((c) => [
      c.nombre,
      c.tipo,
      c.saldo_inicial,
      saldoCuenta(c.id),
    ]),
  ];

  // Hoja 3: Deudas
  const filasDeudas = [
    ["Nombre", "Tipo", "Monto total", "Pagado", "Saldo restante", "Pago mensual"],
    ...deudasCache.map((d) => [
      d.nombre,
      d.tipo,
      d.tipo === "tarjeta_credito" ? "" : d.monto_total,
      d.tipo === "tarjeta_credito" ? "" : d.pagado_acumulado,
      d.tipo === "tarjeta_credito" ? d.saldo_tarjeta : Math.max(d.monto_total - d.pagado_acumulado, 0),
      d.pago_mensual_planeado,
    ]),
  ];

  // Hoja 4: Metas de ahorro
  const filasMetas = [
    ["Meta", "Objetivo", "Ahorrado", "Falta", "% completado", "Fecha objetivo"],
    ...metasAhorroCache.map((m) => [
      m.nombre,
      m.valor_objetivo,
      m.valor_ahorrado,
      Math.max(m.valor_objetivo - m.valor_ahorrado, 0),
      m.valor_objetivo > 0 ? ((m.valor_ahorrado / m.valor_objetivo) * 100).toFixed(1) + "%" : "0%",
      m.fecha_objetivo || "",
    ]),
  ];

  // Construir el contenido CSV con separadores de sección
  function filasACSV(filas) {
    return filas.map((fila) =>
      fila.map((celda) => {
        const str = String(celda === null || celda === undefined ? "" : celda);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",")
    ).join("\n");
  }

  const contenido = [
    "=== MOVIMIENTOS ===",
    filasACSV(filasMovimientos),
    "",
    "=== CUENTAS ===",
    filasACSV(filasCuentas),
    "",
    "=== DEUDAS ===",
    filasACSV(filasDeudas),
    "",
    "=== METAS DE AHORRO ===",
    filasACSV(filasMetas),
  ].join("\n");

  const blob = new Blob(["\uFEFF" + contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mi-dinero-${ahora}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// MODAL GENÉRICO
// ============================================
function abrirModal(html) {
  document.getElementById("modal-box").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("oculto");
}

function cerrarModal() {
  document.getElementById("modal-overlay").classList.add("oculto");
}

document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") cerrarModal();
});
