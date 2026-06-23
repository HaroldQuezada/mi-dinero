// ============================================
// CONEXIÓN A SUPABASE
// (se llama "db" para no chocar con la variable global "supabase"
// que ya crea la librería cargada desde el CDN)
// ============================================
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let usuarioActual = null;
let categoriasIngreso = ["Salario", "Venta", "Regalo", "Otro ingreso"];
let categoriasGasto = ["Comida", "Transporte", "Salud", "Ocio", "Hogar", "Otro gasto"];

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
    cargarMovimientos(),
    cargarDeudas(),
    cargarGastosFijos(),
  ]);
  renderizarDashboard();
}

// ============================================
// MOVIMIENTOS
// ============================================
let movimientosCache = [];

async function cargarMovimientos() {
  const { data, error } = await supabase
    .from("movimientos")
    .select("*")
    .order("fecha", { ascending: false });
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
        <span class="fila-detalle">${formatoFecha(m.fecha)}${m.nota ? " · " + escapeHtml(m.nota) : ""}</span>
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
  const { error } = await db.from("movimientos").delete().eq("id", id);
  if (error) return alert("Error: " + error.message);
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
      <select id="mov-categoria"></select>
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
    const select = document.getElementById("mov-categoria");
    const lista = tipo === "ingreso" ? categoriasIngreso : categoriasGasto;
    select.innerHTML = lista.map((c) => `<option value="${c}">${c}</option>`).join("");
    if (movimiento && lista.includes(movimiento.categoria)) {
      select.value = movimiento.categoria;
    }
  }
  actualizarCategorias(tipoInicial);

  document.getElementById("toggle-ingreso").addEventListener("click", () => {
    document.getElementById("mov-tipo").value = "ingreso";
    document.getElementById("toggle-ingreso").classList.add("activo-ingreso");
    document.getElementById("toggle-gasto").classList.remove("activo-gasto");
    actualizarCategorias("ingreso");
  });
  document.getElementById("toggle-gasto").addEventListener("click", () => {
    document.getElementById("mov-tipo").value = "gasto";
    document.getElementById("toggle-gasto").classList.add("activo-gasto");
    document.getElementById("toggle-ingreso").classList.remove("activo-ingreso");
    actualizarCategorias("gasto");
  });

  document.getElementById("btn-guardar-movimiento").addEventListener("click", async () => {
    const payload = {
      tipo: document.getElementById("mov-tipo").value,
      monto: parseFloat(document.getElementById("mov-monto").value),
      categoria: document.getElementById("mov-categoria").value,
      fecha: document.getElementById("mov-fecha").value,
      nota: document.getElementById("mov-nota").value.trim() || null,
    };
    if (!payload.monto || payload.monto <= 0) return alert("Ingresa un monto válido");

    let error;
    if (movimiento) {
      ({ error } = await db.from("movimientos").update(payload).eq("id", movimiento.id));
    } else {
      ({ error } = await db.from("movimientos").insert(payload));
    }
    if (error) return alert("Error: " + error.message);
    cerrarModal();
    await cargarMovimientos();
    renderizarDashboard();
  });
}

// ============================================
// DEUDAS
// ============================================
let deudasCache = [];

async function cargarDeudas() {
  const { data, error } = await supabase
    .from("deudas")
    .select("*")
    .eq("activa", true)
    .order("created_at", { ascending: true });
  if (error) { console.error(error); return; }
  deudasCache = data;
  renderizarDeudas();
}

function renderizarDeudas() {
  const contenedor = document.getElementById("lista-deudas");
  if (deudasCache.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No tienes deudas registradas</p>';
    return;
  }

  contenedor.innerHTML = deudasCache.map((d) => {
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
          <div><span>Avance</span>${porcentaje.toFixed(0)}%</div>
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

  abrirModal(`
    <h3>${deuda ? "Editar" : "Agregar"} deuda</h3>
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="deuda-nombre" value="${deuda ? escapeHtml(deuda.nombre) : ""}" placeholder="Ej: Tarjeta de crédito">
    </div>
    <div class="campo">
      <label>Monto total</label>
      <input type="number" id="deuda-monto-total" min="0" value="${deuda ? deuda.monto_total : ""}" placeholder="0">
    </div>
    <div class="campo">
      <label>Pago mensual planeado</label>
      <input type="number" id="deuda-pago-mensual" min="0" value="${deuda ? deuda.pago_mensual_planeado : ""}" placeholder="0">
    </div>
    <div class="campo">
      <label>Pagado hasta ahora</label>
      <input type="number" id="deuda-pagado" min="0" value="${deuda ? deuda.pagado_acumulado : 0}" placeholder="0">
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-deuda">Guardar</button>
    </div>
  `);

  document.getElementById("btn-guardar-deuda").addEventListener("click", async () => {
    const payload = {
      nombre: document.getElementById("deuda-nombre").value.trim(),
      monto_total: parseFloat(document.getElementById("deuda-monto-total").value),
      pago_mensual_planeado: parseFloat(document.getElementById("deuda-pago-mensual").value),
      pagado_acumulado: parseFloat(document.getElementById("deuda-pagado").value) || 0,
    };
    if (!payload.nombre || !payload.monto_total || !payload.pago_mensual_planeado) {
      return alert("Completa nombre, monto total y pago mensual");
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

function registrarPagoDeuda(id) {
  const deuda = deudasCache.find((d) => d.id === id);
  abrirModal(`
    <h3>Registrar pago — ${escapeHtml(deuda.nombre)}</h3>
    <p class="fila-detalle" style="margin-bottom:14px;">Saldo restante: ${formatoMoneda(deuda.monto_total - deuda.pagado_acumulado)}</p>
    <div class="campo">
      <label>Monto a abonar</label>
      <input type="number" id="pago-monto" min="0" value="${deuda.pago_mensual_planeado}">
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-confirmar-pago">Confirmar pago</button>
    </div>
  `);

  document.getElementById("btn-confirmar-pago").addEventListener("click", async () => {
    const monto = parseFloat(document.getElementById("pago-monto").value);
    if (!monto || monto <= 0) return alert("Ingresa un monto válido");

    const nuevoPagado = deuda.pagado_acumulado + monto;

    const { error: errorDeuda } = await supabase
      .from("deudas")
      .update({ pagado_acumulado: nuevoPagado })
      .eq("id", deuda.id);
    if (errorDeuda) return alert("Error: " + errorDeuda.message);

    // También se registra como movimiento (gasto) en el historial
    await db.from("movimientos").insert({
      tipo: "gasto",
      monto,
      categoria: "Pago de deuda",
      fecha: fechaHoy(),
      nota: `Pago: ${deuda.nombre}`,
    });

    cerrarModal();
    await Promise.all([cargarDeudas(), cargarMovimientos()]);
    renderizarDashboard();
  });
}

// ============================================
// GASTOS FIJOS
// ============================================
let gastosFijosCache = [];
let pagosDelMesCache = [];

async function cargarGastosFijos() {
  const { data: fijos, error: errorFijos } = await supabase
    .from("gastos_fijos")
    .select("*")
    .eq("activo", true)
    .order("created_at", { ascending: true });
  if (errorFijos) { console.error(errorFijos); return; }
  gastosFijosCache = fijos;

  const { data: pagos, error: errorPagos } = await supabase
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
      <div class="fila">
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
    // Crear el movimiento de gasto automáticamente
    const { data: movimiento, error: errorMov } = await supabase
      .from("movimientos")
      .insert({
        tipo: "gasto",
        monto: gasto.monto,
        categoria: gasto.categoria,
        fecha: fechaHoy(),
        nota: `Pago automático: ${gasto.nombre}`,
      })
      .select()
      .single();
    if (errorMov) return alert("Error: " + errorMov.message);

    const { error: errorPago } = await db.from("gastos_fijos_pagos").insert({
      gasto_fijo_id: gastoFijoId,
      mes,
      movimiento_id: movimiento.id,
    });
    if (errorPago) return alert("Error: " + errorPago.message);
  } else {
    // Desmarcar: eliminar el registro de pago y su movimiento asociado
    const pago = pagosDelMesCache.find((p) => p.gasto_fijo_id === gastoFijoId);
    if (pago) {
      if (pago.movimiento_id) {
        await db.from("movimientos").delete().eq("id", pago.movimiento_id);
      }
      await db.from("gastos_fijos_pagos").delete().eq("id", pago.id);
    }
  }

  await Promise.all([cargarGastosFijos(), cargarMovimientos()]);
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
      <select id="gf-categoria"></select>
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-gasto-fijo">Guardar</button>
    </div>
  `);

  const select = document.getElementById("gf-categoria");
  select.innerHTML = categoriasGasto.map((c) => `<option value="${c}">${c}</option>`).join("");
  if (gasto) select.value = gasto.categoria;

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

  // Balance actual: todo el historial
  const balance = movimientosCache.reduce((acc, m) => {
    return acc + (m.tipo === "ingreso" ? m.monto : -m.monto);
  }, 0);

  // Ingresos y gastos solo del mes actual
  const movimientosDelMes = movimientosCache.filter((m) => m.fecha.slice(0, 7) === mes);
  const ingresosMes = movimientosDelMes
    .filter((m) => m.tipo === "ingreso")
    .reduce((acc, m) => acc + m.monto, 0);
  const gastosMes = movimientosDelMes
    .filter((m) => m.tipo === "gasto")
    .reduce((acc, m) => acc + m.monto, 0);

  // Comprometido este mes: gastos fijos pendientes (no pagados)
  const gastosFijosPendientes = gastosFijosCache
    .filter((g) => !estaPagadoEsteMes(g.id))
    .reduce((acc, g) => acc + g.monto, 0);

  const comprometido = gastosFijosPendientes;
  const dineroLibre = balance - comprometido;

  // Deuda total pendiente (todas las deudas activas)
  const deudaTotal = deudasCache.reduce((acc, d) => {
    return acc + Math.max(d.monto_total - d.pagado_acumulado, 0);
  }, 0);

  document.getElementById("d-balance").textContent = formatoMoneda(balance);
  document.getElementById("d-comprometido").textContent = formatoMoneda(comprometido);
  document.getElementById("d-libre").textContent = formatoMoneda(dineroLibre);
  document.getElementById("d-deuda").textContent = formatoMoneda(deudaTotal);
  document.getElementById("d-ingresos").textContent = formatoMoneda(ingresosMes);
  document.getElementById("d-gastos").textContent = formatoMoneda(gastosMes);

  // Lista de gastos fijos del mes (en el dashboard)
  const contenedorGF = document.getElementById("d-lista-gastos-fijos");
  if (gastosFijosCache.length === 0) {
    contenedorGF.innerHTML = '<p class="vacio">No tienes gastos fijos registrados</p>';
  } else {
    contenedorGF.innerHTML = gastosFijosCache.map((g) => {
      const pagado = estaPagadoEsteMes(g.id);
      return `
        <div class="fila">
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
