// ============================================
// CONEXIÓN A SUPABASE
// (se llama "db" para no chocar con la variable global "supabase"
// que ya crea la librería cargada desde el CDN)
// ============================================
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DIAS_SEMANA = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
const DIAS_SEMANA_LABEL = { dom: "Dom", lun: "Lun", mar: "Mar", mie: "Mié", jue: "Jue", vie: "Vie", sab: "Sáb" };

let usuarioActual = null;
let categoriasHabito = ["Salud", "Estudio", "Trabajo", "Personal", "Hogar", "Otro"];

// ============================================
// UTILIDADES DE FECHA
// ============================================
function fechaHoyIso() {
  return new Date().toISOString().slice(0, 10);
}

function diaSemanaIso(fechaIso) {
  // 0=domingo ... 6=sábado, usando la fecha como local (evita desfase UTC)
  const [a, m, d] = fechaIso.split("-").map(Number);
  return new Date(a, m - 1, d).getDay();
}

function formatoFechaLarga(fechaIso) {
  const [a, m, d] = fechaIso.split("-").map(Number);
  const fecha = new Date(a, m - 1, d);
  return fecha.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

// ============================================
// REGLA DE FRECUENCIA: ¿el hábito aplica en esta fecha?
// ============================================
function habitoAplicaEnFecha(habito, fechaIso) {
  if (habito.frecuencia === "diario") return true;
  // frecuencia personalizada: string tipo "lun,mie,vie"
  const diasActivos = habito.frecuencia.split(",").map((d) => d.trim());
  const diaHoy = DIAS_SEMANA[diaSemanaIso(fechaIso)];
  return diasActivos.includes(diaHoy);
}

// ============================================
// AUTENTICACIÓN (mismo patrón que el módulo Dinero)
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
  document.getElementById("login-error").textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (modoRegistro) {
    const { error } = await db.auth.signUp({ email, password });
    if (error) return (document.getElementById("login-error").textContent = error.message);
    document.getElementById("login-error").textContent = "Cuenta creada. Ya puedes entrar.";
    modoRegistro = false;
    btnMostrarRegistro.click();
  } else {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return (document.getElementById("login-error").textContent = error.message);
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
    if (tab.dataset.tab === "calendario") renderizarCalendario();
  });
});

// ============================================
// CARGA GENERAL
// ============================================
let habitosCache = [];
let registrosCache = []; // todos los registros del usuario

async function cargarTodo() {
  await Promise.all([cargarHabitos(), cargarRegistros()]);
  renderizarHoy();
  poblarSelectorCalendario();
}

async function cargarHabitos() {
  const { data, error } = await db
    .from("habitos")
    .select("*")
    .eq("activo", true)
    .order("created_at", { ascending: true });
  if (error) { console.error(error); return; }
  habitosCache = data;
  renderizarListaHabitos();
}

async function cargarRegistros() {
  const { data, error } = await db
    .from("habitos_registros")
    .select("*");
  if (error) { console.error(error); return; }
  registrosCache = data;
}

function registroDe(habitoId, fechaIso) {
  return registrosCache.find((r) => r.habito_id === habitoId && r.fecha === fechaIso);
}

// ============================================
// CÁLCULO DE RACHA (por hábito individual)
// Cuenta hacia atrás desde hoy: días "completado" consecutivos.
// Un día "saltado" o sin marcar ROMPE la racha.
// Solo se evalúan los días en que el hábito aplicaba (según frecuencia).
// ============================================
function calcularRachaActual(habito) {
  let racha = 0;
  let fecha = new Date();
  // Si hoy aún no se marca nada, no rompemos la racha por "hoy" todavía:
  // empezamos a contar desde hoy hacia atrás, pero si hoy está vacío, lo saltamos sin romper.
  for (let i = 0; i < 3650; i++) {
    const fechaIso = fecha.toISOString().slice(0, 10);
    const esHoy = fechaIso === fechaHoyIso();
    if (habitoAplicaEnFecha(habito, fechaIso)) {
      const reg = registroDe(habito.id, fechaIso);
      if (reg && reg.estado === "completado") {
        racha++;
      } else if (esHoy && !reg) {
        // hoy todavía no se marcó: no cuenta a favor ni rompe, seguimos al día anterior
      } else {
        break;
      }
    }
    fecha.setDate(fecha.getDate() - 1);
  }
  return racha;
}

function calcularRachaMasLarga(habito) {
  // Recorre todos los registros completados de este hábito, ordenados, y busca la racha más larga
  const fechasCompletadas = registrosCache
    .filter((r) => r.habito_id === habito.id && r.estado === "completado")
    .map((r) => r.fecha)
    .sort();

  if (fechasCompletadas.length === 0) return 0;

  let maxRacha = 1;
  let rachaActual = 1;

  for (let i = 1; i < fechasCompletadas.length; i++) {
    const fechasEntreMedio = diasEsperadosEntre(habito, fechasCompletadas[i - 1], fechasCompletadas[i]);
    if (fechasEntreMedio === 1) {
      rachaActual++;
      maxRacha = Math.max(maxRacha, rachaActual);
    } else {
      rachaActual = 1;
    }
  }
  return maxRacha;
}

// Cuenta cuántas "ocurrencias esperadas" del hábito hay entre dos fechas (exclusivo-inclusivo)
function diasEsperadosEntre(habito, fechaIsoA, fechaIsoB) {
  const [a1, m1, d1] = fechaIsoA.split("-").map(Number);
  const [a2, m2, d2] = fechaIsoB.split("-").map(Number);
  let cursor = new Date(a1, m1 - 1, d1);
  const fin = new Date(a2, m2 - 1, d2);
  let conteo = 0;
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= fin) {
    const iso = cursor.toISOString().slice(0, 10);
    if (habitoAplicaEnFecha(habito, iso)) conteo++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return conteo;
}

// ============================================
// PANTALLA "HOY"
// ============================================
function renderizarHoy() {
  const hoy = fechaHoyIso();
  document.getElementById("fecha-hoy").textContent = formatoFechaLarga(hoy);

  const habitosDeHoy = habitosCache.filter((h) => habitoAplicaEnFecha(h, hoy));
  const completados = habitosDeHoy.filter((h) => {
    const r = registroDe(h.id, hoy);
    return r && r.estado === "completado";
  }).length;

  document.getElementById("resumen-hoy").textContent =
    `${completados} de ${habitosDeHoy.length} completados`;

  const contenedor = document.getElementById("lista-hoy");
  if (habitosDeHoy.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No tienes hábitos programados para hoy</p>';
    return;
  }

  contenedor.innerHTML = habitosDeHoy.map((h) => {
    const reg = registroDe(h.id, hoy);
    const estado = reg ? reg.estado : "pendiente";
    const racha = calcularRachaActual(h);

    return `
      <div class="tarjeta-habito-hoy ${estado === "completado" ? "es-completado" : ""} ${estado === "saltado" ? "es-saltado" : ""}">
        <div class="habito-info">
          <span class="habito-nombre">${escapeHtml(h.nombre)}</span>
          <span class="habito-meta">
            ${h.hora_objetivo ? "🕒 " + h.hora_objetivo.slice(0, 5) : escapeHtml(h.categoria)}
            ${racha > 0 ? `<span class="racha-pill">🔥 ${racha} días</span>` : ""}
          </span>
        </div>
        <div class="acciones-hoy">
          <button class="btn-icono ${estado === "completado" ? "activo-completado" : ""}"
            onclick="marcarHabito('${h.id}', 'completado')" title="Completado">✅</button>
          <button class="btn-icono ${estado === "saltado" ? "activo-saltado" : ""}"
            onclick="marcarHabito('${h.id}', 'saltado')" title="Saltado a propósito">⏭️</button>
        </div>
      </div>
    `;
  }).join("");
}

async function marcarHabito(habitoId, nuevoEstado) {
  const hoy = fechaHoyIso();
  const existente = registroDe(habitoId, hoy);

  // Si se le da clic al mismo estado que ya tenía, se desmarca (vuelve a pendiente)
  if (existente && existente.estado === nuevoEstado) {
    await db.from("habitos_registros").delete().eq("id", existente.id);
  } else if (existente) {
    await db.from("habitos_registros").update({ estado: nuevoEstado }).eq("id", existente.id);
  } else {
    await db.from("habitos_registros").insert({ habito_id: habitoId, fecha: hoy, estado: nuevoEstado });
  }

  await cargarRegistros();
  renderizarHoy();
}

// ============================================
// GESTIÓN DE HÁBITOS
// ============================================
function renderizarListaHabitos() {
  const contenedor = document.getElementById("lista-habitos");
  if (habitosCache.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No tienes hábitos creados aún</p>';
    return;
  }

  contenedor.innerHTML = habitosCache.map((h) => `
    <div class="fila">
      <div class="fila-info">
        <span class="fila-titulo">${escapeHtml(h.nombre)}</span>
        <span class="fila-detalle">${escapeHtml(h.categoria)} · ${descripcionFrecuencia(h.frecuencia)}</span>
      </div>
      <span class="badge badge-${h.prioridad}">${h.prioridad}</span>
      <div class="fila-acciones">
        <button onclick="abrirModalHabito('${h.id}')">Editar</button>
        <button onclick="eliminarHabito('${h.id}')">Eliminar</button>
      </div>
    </div>
  `).join("");
}

function descripcionFrecuencia(frecuencia) {
  if (frecuencia === "diario") return "Todos los días";
  return frecuencia.split(",").map((d) => DIAS_SEMANA_LABEL[d.trim()]).join(", ");
}

document.getElementById("btn-nuevo-habito").addEventListener("click", () => abrirModalHabito());

function abrirModalHabito(id) {
  const habito = id ? habitosCache.find((h) => h.id === id) : null;
  const esDiario = !habito || habito.frecuencia === "diario";
  const diasActivos = habito && habito.frecuencia !== "diario"
    ? habito.frecuencia.split(",").map((d) => d.trim())
    : [];

  abrirModal(`
    <h3>${habito ? "Editar" : "Agregar"} hábito</h3>
    <div class="campo">
      <label>Nombre</label>
      <input type="text" id="h-nombre" value="${habito ? escapeHtml(habito.nombre) : ""}" placeholder="Ej: Leer, Gym, Agua">
    </div>
    <div class="campo">
      <label>Categoría</label>
      <select id="h-categoria"></select>
    </div>
    <div class="campo">
      <label>Frecuencia</label>
      <div class="toggle-tipo" style="margin-bottom:10px;">
        <button type="button" id="h-freq-diario" class="${esDiario ? "activo-ingreso" : ""}">Diario</button>
        <button type="button" id="h-freq-personalizada" class="${!esDiario ? "activo-ingreso" : ""}">Días específicos</button>
      </div>
      <div id="h-dias-selector" class="dias-semana-selector ${esDiario ? "oculto" : ""}">
        ${DIAS_SEMANA.map((d) => `<button type="button" class="dia-toggle ${diasActivos.includes(d) ? "activo" : ""}" data-dia="${d}">${DIAS_SEMANA_LABEL[d]}</button>`).join("")}
      </div>
    </div>
    <div class="campo">
      <label>Hora objetivo (opcional)</label>
      <input type="time" id="h-hora" value="${habito && habito.hora_objetivo ? habito.hora_objetivo.slice(0, 5) : ""}">
    </div>
    <div class="campo">
      <label>Prioridad</label>
      <select id="h-prioridad">
        <option value="alta">Alta</option>
        <option value="media">Media</option>
        <option value="baja">Baja</option>
      </select>
    </div>
    <div class="modal-acciones">
      <button class="btn-secundario" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primario" id="btn-guardar-habito">Guardar</button>
    </div>
  `);

  const selectCat = document.getElementById("h-categoria");
  selectCat.innerHTML = categoriasHabito.map((c) => `<option value="${c}">${c}</option>`).join("");
  if (habito) selectCat.value = habito.categoria;

  document.getElementById("h-prioridad").value = habito ? habito.prioridad : "media";

  let frecuenciaEsDiaria = esDiario;
  document.getElementById("h-freq-diario").addEventListener("click", () => {
    frecuenciaEsDiaria = true;
    document.getElementById("h-freq-diario").classList.add("activo-ingreso");
    document.getElementById("h-freq-personalizada").classList.remove("activo-ingreso");
    document.getElementById("h-dias-selector").classList.add("oculto");
  });
  document.getElementById("h-freq-personalizada").addEventListener("click", () => {
    frecuenciaEsDiaria = false;
    document.getElementById("h-freq-personalizada").classList.add("activo-ingreso");
    document.getElementById("h-freq-diario").classList.remove("activo-ingreso");
    document.getElementById("h-dias-selector").classList.remove("oculto");
  });

  document.querySelectorAll(".dia-toggle").forEach((boton) => {
    boton.addEventListener("click", () => boton.classList.toggle("activo"));
  });

  document.getElementById("btn-guardar-habito").addEventListener("click", async () => {
    const nombre = document.getElementById("h-nombre").value.trim();
    if (!nombre) return alert("Ingresa un nombre para el hábito");

    let frecuencia = "diario";
    if (!frecuenciaEsDiaria) {
      const diasElegidos = [...document.querySelectorAll(".dia-toggle.activo")].map((b) => b.dataset.dia);
      if (diasElegidos.length === 0) return alert("Elige al menos un día");
      frecuencia = diasElegidos.join(",");
    }

    const payload = {
      nombre,
      categoria: document.getElementById("h-categoria").value,
      frecuencia,
      hora_objetivo: document.getElementById("h-hora").value || null,
      prioridad: document.getElementById("h-prioridad").value,
    };

    let error;
    if (habito) {
      ({ error } = await db.from("habitos").update(payload).eq("id", habito.id));
    } else {
      ({ error } = await db.from("habitos").insert(payload));
    }
    if (error) return alert("Error: " + error.message);
    cerrarModal();
    await cargarHabitos();
    renderizarHoy();
    poblarSelectorCalendario();
  });
}

async function eliminarHabito(id) {
  if (!confirm("¿Eliminar este hábito? Se mantiene tu historial de cumplimiento.")) return;
  const { error } = await db.from("habitos").update({ activo: false }).eq("id", id);
  if (error) return alert("Error: " + error.message);
  await cargarHabitos();
  renderizarHoy();
  poblarSelectorCalendario();
}

// ============================================
// CALENDARIO
// ============================================
let mesCalendarioActual = new Date(); // mes que se está viendo
let habitoSeleccionadoCalendario = null;

function poblarSelectorCalendario() {
  const select = document.getElementById("selector-habito-calendario");
  if (habitosCache.length === 0) {
    select.innerHTML = '<option value="">Sin hábitos</option>';
    habitoSeleccionadoCalendario = null;
    return;
  }
  select.innerHTML = habitosCache.map((h) => `<option value="${h.id}">${escapeHtml(h.nombre)}</option>`).join("");
  if (!habitoSeleccionadoCalendario || !habitosCache.some((h) => h.id === habitoSeleccionadoCalendario)) {
    habitoSeleccionadoCalendario = habitosCache[0].id;
  }
  select.value = habitoSeleccionadoCalendario;
}

document.getElementById("selector-habito-calendario").addEventListener("change", (e) => {
  habitoSeleccionadoCalendario = e.target.value;
  renderizarCalendario();
});

document.getElementById("cal-mes-anterior").addEventListener("click", () => {
  mesCalendarioActual.setMonth(mesCalendarioActual.getMonth() - 1);
  renderizarCalendario();
});
document.getElementById("cal-mes-siguiente").addEventListener("click", () => {
  mesCalendarioActual.setMonth(mesCalendarioActual.getMonth() + 1);
  renderizarCalendario();
});

function renderizarCalendario() {
  if (!habitoSeleccionadoCalendario) {
    document.getElementById("calendario-grid").innerHTML = '<p class="vacio">Crea un hábito primero</p>';
    return;
  }
  const habito = habitosCache.find((h) => h.id === habitoSeleccionadoCalendario);
  if (!habito) return;

  document.getElementById("cal-racha-actual").textContent = calcularRachaActual(habito);
  document.getElementById("cal-racha-larga").textContent = calcularRachaMasLarga(habito);

  document.getElementById("cal-mes-titulo").textContent =
    mesCalendarioActual.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  const anio = mesCalendarioActual.getFullYear();
  const mes = mesCalendarioActual.getMonth();
  const primerDiaSemana = new Date(anio, mes, 1).getDay();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();

  let celdas = [];
  for (let i = 0; i < primerDiaSemana; i++) celdas.push('<div class="dia-celda dia-vacia"></div>');

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fechaIso = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const reg = registroDe(habito.id, fechaIso);
    let clase = "";
    if (reg && reg.estado === "completado") clase = "dia-completado";
    else if (reg && reg.estado === "saltado") clase = "dia-saltado";
    celdas.push(`<div class="dia-celda ${clase}">${dia}</div>`);
  }

  document.getElementById("calendario-grid").innerHTML = celdas.join("");
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
