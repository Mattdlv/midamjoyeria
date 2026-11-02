import type * as React from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ajustarStock, leerBolsa, leerBolsaServidor, suscribir, vaciar } from '../lib/bolsa';
import { formatoPrecio } from '../lib/catalogo';

type Errores = Record<string, string>;
type Conflicto = { slug: string; nombre: string; disponibles: number };

const ORDEN_CAMPOS = ['nombre', 'whatsapp', 'tipoEntrega', 'direccion', 'localidad', 'cp', 'metodoPago'];

function Campo({ id, etiqueta, error, ayuda, ...resto }: { id: string; etiqueta: string; error?: string; ayuda?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const descripcion = [error && `${id}-error`, ayuda && `${id}-ayuda`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} name={id} aria-invalid={Boolean(error)} aria-describedby={descripcion} {...resto} />
      {ayuda && <p className="campo__ayuda" id={`${id}-ayuda`}>{ayuda}</p>}
      {error && <p className="campo__error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

export default function Checkout() {
  const items = useSyncExternalStore(suscribir, leerBolsa, leerBolsaServidor);
  const [lista, setLista] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [conflictos, setConflictos] = useState<Conflicto[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [tipoEntrega, setTipoEntrega] = useState<'retiro' | 'envio' | ''>('');
  const [metodoPago, setMetodoPago] = useState('');
  const formulario = useRef<HTMLFormElement>(null);
  const aviso = useRef<HTMLDivElement>(null);

  useEffect(() => setLista(true), []);

  // Una reserva ajena puede haber dejado la bolsa desactualizada desde que se armó.
  const slugsBolsa = [...new Set(items.map((i) => i.slug))].join(',');
  useEffect(() => {
    if (!slugsBolsa) return;
    fetch(`/api/stock?slugs=${slugsBolsa}`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, number>>) : null))
      .then((stock: Record<string, number> | null) => {
        if (!stock) return;
        const faltan = leerBolsa()
          .reduce<Conflicto[]>((acc, i) => {
            const pedidas = leerBolsa().filter((x) => x.slug === i.slug).reduce((a, x) => a + x.cantidad, 0);
            if (i.slug in stock && stock[i.slug] < pedidas && !acc.some((c) => c.slug === i.slug)) acc.push({ slug: i.slug, nombre: i.nombre, disponibles: stock[i.slug] });
            return acc;
          }, []);
        setConflictos(faltan);
      })
      .catch(() => {});
  }, [slugsBolsa]);

  const subtotal = items.reduce((a, i) => a + i.precio * i.cantidad, 0);

  const resolverConflictos = () => {
    conflictos.forEach((c) => ajustarStock(c.slug, c.disponibles));
    setConflictos([]);
  };

  const enviar = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setGeneral(null);
    setErrores({});
    const datos = new FormData(ev.currentTarget);
    let origen: string | null = null;
    try {
      origen = sessionStorage.getItem('midam-origen');
    } catch {
      // Sin almacenamiento el pedido sale igual, sin origen.
    }
    try {
      const r = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: datos.get('nombre'),
          whatsapp: datos.get('whatsapp'),
          tipoEntrega,
          direccion: datos.get('direccion'),
          localidad: datos.get('localidad'),
          cp: datos.get('cp'),
          metodoPago,
          nota: datos.get('nota'),
          esRegalo: datos.get('esRegalo') === 'on',
          sitio: datos.get('sitio'),
          origen,
          items: items.map((i) => ({ slug: i.slug, opcion: i.variante, cantidad: i.cantidad })),
        }),
      });
      const cuerpo = (await r.json()) as { token: string; errores?: Errores; conflictos: Conflicto[]; mensaje?: string };
      if (r.status === 201) {
        vaciar();
        window.location.href = `/pedido/${cuerpo.token}/confirmacion`;
        return;
      }
      if (r.status === 422 && cuerpo.errores) {
        setErrores(cuerpo.errores);
        const primero = ORDEN_CAMPOS.find((c) => cuerpo.errores?.[c]);
        if (primero) formulario.current?.querySelector<HTMLElement>(`[name="${primero}"]`)?.focus();
        else setGeneral(cuerpo.errores.items ?? 'Revisá los datos del pedido.');
      } else if (r.status === 409) {
        setConflictos(cuerpo.conflictos);
        aviso.current?.scrollIntoView({ block: 'center' });
      } else {
        setGeneral(cuerpo.mensaje ?? 'No pudimos guardar el pedido. Probá de nuevo.');
      }
    } catch {
      setGeneral('No pudimos conectarnos. Revisá tu conexión y probá de nuevo; tu bolsa sigue guardada.');
    }
    setEnviando(false);
  };

  if (!lista) return <p className="pedido__cargando">Trayendo tu bolsa…</p>;

  if (!items.length) {
    return (
      <div className="vacio">
        <h2>Salir sin accesorios, <em>jamás.</em></h2>
        <p>Tu bolsa está vacía, así que todavía no hay pedido.</p>
        <a className="boton" href="/tienda">Ver el elenco</a>
      </div>
    );
  }

  return (
    <div className="pedido">
      <section className="pedido__resumen" aria-labelledby="titulo-resumen">
        <h2 id="titulo-resumen">Tu bolsa</h2>
        <ul>
          {items.map((i) => (
            <li key={i.clave}>
              <img src={i.foto} alt="" width={64} height={80} />
              <div>
                <p className="pedido__pieza">{i.nombre}</p>
                <p className="pedido__detalle">{i.descripcion}{i.variante && ` · ${i.variante}`}</p>
                <p className="pedido__detalle">Cantidad: {i.cantidad}</p>
              </div>
              <p className="precio">{formatoPrecio(i.precio * i.cantidad)}</p>
            </li>
          ))}
        </ul>
        <dl>
          <div><dt>Subtotal</dt><dd className="precio">{formatoPrecio(subtotal)}</dd></div>
          <div><dt>Envío</dt><dd>{tipoEntrega === 'retiro' ? 'Retiro' : 'A confirmar'}</dd></div>
        </dl>
        <button type="button" className="enlace pedido__editar" onClick={() => window.dispatchEvent(new Event('midam:bolsa'))}>Cambiar piezas</button>
      </section>

      <form className="pedido__formulario" ref={formulario} onSubmit={enviar} noValidate>
        {conflictos.length > 0 && (
          <div className="pedido__aviso" role="alert" ref={aviso}>
            <p><strong>Alguien se te adelantó.</strong></p>
            <ul>
              {conflictos.map((c) => (
                <li key={c.slug}>{c.nombre}: {c.disponibles === 0 ? 'no queda ninguna' : `queda${c.disponibles > 1 ? 'n' : ''} ${c.disponibles}`}.</li>
              ))}
            </ul>
            <button type="button" className="boton boton--borde" onClick={resolverConflictos}>Actualizar mi bolsa</button>
          </div>
        )}

        <fieldset className="pedido__grupo">
          <legend>Tus datos</legend>
          <Campo id="nombre" etiqueta="Nombre" autoComplete="name" required error={errores.nombre} />
          <Campo id="whatsapp" etiqueta="Tu WhatsApp" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="380 400 0000" required error={errores.whatsapp} ayuda="Para escribirte si el mensaje no nos llega." />
        </fieldset>

        <fieldset className="pedido__grupo" aria-describedby={errores.tipoEntrega ? 'entrega-error' : undefined}>
          <legend>¿Cómo lo querés recibir?</legend>
          <div className="opciones">
            <label className="opcion">
              <input type="radio" name="tipoEntrega" value="retiro" checked={tipoEntrega === 'retiro'} onChange={() => setTipoEntrega('retiro')} />
              <span><strong>Retiro</strong><small>Coordinamos el lugar por WhatsApp.</small></span>
            </label>
            <label className="opcion">
              <input type="radio" name="tipoEntrega" value="envio" checked={tipoEntrega === 'envio'} onChange={() => { setTipoEntrega('envio'); if (metodoPago === 'efectivo') setMetodoPago(''); }} />
              <span><strong>Envío a domicilio</strong><small>Te confirmamos el costo por WhatsApp.</small></span>
            </label>
          </div>
          {errores.tipoEntrega && <p className="campo__error" id="entrega-error">{errores.tipoEntrega}</p>}
          {tipoEntrega === 'envio' && (
            <div className="pedido__direccion">
              <Campo id="direccion" etiqueta="Dirección" autoComplete="street-address" required error={errores.direccion} />
              <Campo id="localidad" etiqueta="Localidad" autoComplete="address-level2" required error={errores.localidad} />
              <Campo id="cp" etiqueta="Código postal" inputMode="text" autoComplete="postal-code" required error={errores.cp} />
            </div>
          )}
        </fieldset>

        <fieldset className="pedido__grupo" aria-describedby={errores.metodoPago ? 'pago-error' : undefined}>
          <legend>¿Cómo preferís pagar?</legend>
          <div className="opciones">
            <label className="opcion">
              <input type="radio" name="metodoPago" value="transferencia" checked={metodoPago === 'transferencia'} onChange={() => setMetodoPago('transferencia')} />
              <span><strong>Transferencia</strong></span>
            </label>
            <label className="opcion">
              <input type="radio" name="metodoPago" value="mercado_pago" checked={metodoPago === 'mercado_pago'} onChange={() => setMetodoPago('mercado_pago')} />
              <span><strong>Mercado Pago</strong><small>Te mandamos el link.</small></span>
            </label>
            {tipoEntrega !== 'envio' && (
              <label className="opcion">
                <input type="radio" name="metodoPago" value="efectivo" checked={metodoPago === 'efectivo'} onChange={() => setMetodoPago('efectivo')} />
                <span><strong>Efectivo al retirar</strong></span>
              </label>
            )}
          </div>
          {errores.metodoPago && <p className="campo__error" id="pago-error">{errores.metodoPago}</p>}
          <p className="campo__ayuda">No pagás nada todavía. Lo cerramos por WhatsApp.</p>
        </fieldset>

        <fieldset className="pedido__grupo">
          <legend>¿Algo más?</legend>
          <label className="marca-regalo">
            <input type="checkbox" name="esRegalo" />
            Es para regalar
          </label>
          <div className="campo">
            <label htmlFor="nota">Nota (opcional)</label>
            <textarea id="nota" name="nota" rows={2} maxLength={280} />
          </div>
        </fieldset>

        {/* Trampa para bots: las personas no ven este campo. */}
        <div className="oculto" aria-hidden="true">
          <label>Sitio web<input type="text" name="sitio" tabIndex={-1} autoComplete="off" /></label>
        </div>

        {general && <p className="pedido__error" role="alert">{general}</p>}

        <div className="pedido__cierre">
          <button type="submit" className="boton boton--ancho" disabled={enviando}>
            {enviando ? 'Guardando tu pedido…' : 'Seguir a WhatsApp'}
          </button>
          <p className="campo__ayuda">Guardamos tu pedido, reservamos tus piezas por 24 horas y te llevamos a WhatsApp con el mensaje armado.</p>
        </div>
      </form>
    </div>
  );
}

