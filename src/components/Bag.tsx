import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cambiarCantidad, leerBolsa, leerBolsaServidor, quitar, suscribir } from '../lib/bolsa';
import { formatoPrecio } from '../lib/catalogo';

export default function Bag() {
  const items = useSyncExternalStore(suscribir, leerBolsa, leerBolsaServidor);
  const [abierta, setAbierta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const temporizador = useRef<number>(undefined);
  const cerrar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const abrir = () => setAbierta(true);
    const avisar = (e: Event) => {
      setAviso((e as CustomEvent<string>).detail);
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => setAviso(null), 3500);
    };
    window.addEventListener('midam:bolsa', abrir);
    window.addEventListener('midam:aviso', avisar);
    return () => {
      window.removeEventListener('midam:bolsa', abrir);
      window.removeEventListener('midam:aviso', avisar);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('sin-scroll', abierta);
    if (!abierta) return;
    cerrar.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierta]);

  const subtotal = items.reduce((a, i) => a + i.precio * i.cantidad, 0);
  const unidades = items.reduce((a, i) => a + i.cantidad, 0);

  return (
    <>
      <div className={`velo ${abierta ? 'velo--abierto' : ''}`} onClick={() => setAbierta(false)} />
      <aside className={`bolsa ${abierta ? 'bolsa--abierta' : ''}`} role="dialog" aria-modal="true" aria-label="Tu bolsa">
        <div className="bolsa__cabeza">
          <h2>Tu bolsa{unidades > 0 && ` (${unidades})`}</h2>
          <button ref={cerrar} type="button" className="icono-boton" aria-label="Cerrar bolsa" onClick={() => setAbierta(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {items.length === 0 ? (
          <div className="bolsa__lista">
            <div className="bolsa__vacia">
              <h3>Salir sin accesorios, <em>jamás.</em></h3>
              <p>Tu bolsa todavía está vacía.</p>
              <a className="boton" href="/tienda">Ver el elenco</a>
            </div>
          </div>
        ) : (
          <>
            <ul className="bolsa__lista">
              {items.map((i) => {
                const enOtras = items.filter((x) => x.slug === i.slug && x.clave !== i.clave).reduce((a, x) => a + x.cantidad, 0);
                const tope = i.cantidad + enOtras >= i.stock;
                return (
                  <li key={i.clave} className="bolsa__item">
                    <img src={i.foto} alt="" width={80} height={100} loading="lazy" />
                    <div>
                      <a className="bolsa__nombre" href={`/productos/${i.slug}`}>{i.nombre}</a>
                      <p className="bolsa__detalle">{i.descripcion}{i.variante && ` · ${i.variante}`}</p>
                      <p className="precio">{formatoPrecio(i.precio * i.cantidad)}</p>
                      <div className="bolsa__fila">
                        <div className="cantidad">
                          <button type="button" aria-label={`Sacar una unidad de ${i.nombre}`} onClick={() => cambiarCantidad(i.clave, -1)}>−</button>
                          <span aria-live="polite">{i.cantidad}</span>
                          <button type="button" aria-label={`Agregar una unidad de ${i.nombre}`} disabled={tope} onClick={() => cambiarCantidad(i.clave, 1)}>+</button>
                        </div>
                        <button type="button" className="bolsa__quitar" onClick={() => quitar(i.clave)}>Quitar</button>
                      </div>
                      {tope && <p className="bolsa__tope">{i.stock === 1 ? 'Es la única que queda.' : 'No quedan más.'}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="bolsa__pie">
              <p className="bolsa__total"><span>Subtotal</span><span>{formatoPrecio(subtotal)}</span></p>
              <p className="bolsa__nota">El envío y el pago se confirman por WhatsApp.</p>
              <a className="boton boton--ancho" href="/pedido">Seguir con mi pedido</a>
            </div>
          </>
        )}
      </aside>

      <div className={`aviso ${aviso && !abierta ? 'aviso--visible' : ''}`} role="status">
        {aviso}
        {aviso && <button type="button" onClick={() => { setAviso(null); setAbierta(true); }}>Ver bolsa</button>}
      </div>
    </>
  );
}
