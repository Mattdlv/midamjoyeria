import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { agregar, leerBolsa, leerBolsaServidor, suscribir } from '../lib/bolsa';
import { formatoPrecio, notaStock, type Producto } from '../lib/catalogo';

export default function AddToBag({ producto: p }: { producto: Producto }) {
  const items = useSyncExternalStore(suscribir, leerBolsa, leerBolsaServidor);
  const opciones = p.variantes?.opciones ?? [];
  const [elegida, setElegida] = useState<string | null>(opciones.length === 1 ? opciones[0].nombre : null);
  const [falta, setFalta] = useState(false);
  const [barra, setBarra] = useState(false);
  const zona = useRef<HTMLDivElement>(null);

  const [stock, setStock] = useState(p.stock);
  const enBolsa = items.filter((i) => i.slug === p.slug).reduce((a, i) => a + i.cantidad, 0);
  const agotada = enBolsa >= stock;

  // La página es estática: el stock real se consulta al abrirla. Si falla, queda el de la generación.
  useEffect(() => {
    fetch(`/api/stock?slugs=${p.slug}`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, number>>) : null))
      .then((d: Record<string, number> | null) => {
        if (!d || !(p.slug in d)) return;
        setStock(d[p.slug]);
        const nota = document.querySelector('[data-queda]');
        if (nota) nota.textContent = d[p.slug] === 0 ? 'Sin stock' : (notaStock(d[p.slug]) ?? '');
      })
      .catch(() => {});
  }, [p.slug]);

  useEffect(() => {
    if (!zona.current) return;
    const obs = new IntersectionObserver(([e]) => setBarra(!e.isIntersecting));
    obs.observe(zona.current);
    return () => obs.disconnect();
  }, []);

  const elegir = (nombre: string, foto: number | null) => {
    setElegida(nombre);
    setFalta(false);
    if (foto !== null) window.dispatchEvent(new CustomEvent('midam:foto', { detail: foto }));
  };

  const sumar = () => {
    if (opciones.length && !elegida) {
      setFalta(true);
      zona.current?.scrollIntoView({ block: 'center' });
      return;
    }
    const foto = opciones.find((o) => o.nombre === elegida)?.foto ?? 0;
    const ok = agregar({ slug: p.slug, nombre: p.nombre, descripcion: p.descripcion, variante: elegida, precio: p.precio, foto: p.fotos[foto].s, stock });
    if (ok) window.dispatchEvent(new CustomEvent('midam:aviso', { detail: `${p.nombre} ya está en tu bolsa` }));
  };

  const textoBoton = stock === 0 ? 'Sin stock' : agotada ? (stock === 1 ? 'Ya la tenés en tu bolsa' : 'Ya tenés todas en tu bolsa') : 'Sumar a la bolsa';

  return (
    <>
      <div className="comprar" ref={zona}>
        {opciones.length > 0 && (
          <fieldset className="filtro">
            <legend className="etiqueta">
              {p.variantes!.etiqueta}
              {elegida && <span className="comprar__elegida">{elegida}</span>}
            </legend>
            <div className="filtro__opciones">
              {opciones.map((o) => (
                <button key={o.nombre} type="button" className="pildora" aria-pressed={elegida === o.nombre} onClick={() => elegir(o.nombre, o.foto)}>
                  {o.nombre}
                </button>
              ))}
            </div>
            {falta && <p className="comprar__falta" role="alert">Elegí {p.variantes!.etiqueta.toLowerCase()} para seguir.</p>}
          </fieldset>
        )}
        <button type="button" className="boton boton--ancho" disabled={agotada} onClick={sumar}>{textoBoton}</button>
      </div>

      <div className={`barra-compra ${barra ? 'barra-compra--visible' : ''}`} aria-hidden={!barra}>
        <div>
          <span className="barra-compra__nombre">{p.nombre}</span>
          <span className="precio">{formatoPrecio(p.precio)}</span>
        </div>
        <button type="button" className="boton" disabled={agotada} tabIndex={barra ? 0 : -1} onClick={sumar}>{stock === 0 ? 'Sin stock' : agotada ? 'En tu bolsa' : 'Sumar'}</button>
      </div>
    </>
  );
}
