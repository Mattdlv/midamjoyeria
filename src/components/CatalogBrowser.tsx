import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import ProductCard from './ProductCard';
import { LINEAS, RANGOS, TONOS, normalizar, textoBusqueda, tieneTono, type Producto } from '../lib/catalogo';

type Estado = { tono: string[]; precio: string[]; talle: string[]; linea: string[]; orden: string; q: string };

const ORDENES = [
  { id: 'elenco', nombre: 'Orden del elenco' },
  { id: 'menor', nombre: 'Menor precio' },
  { id: 'mayor', nombre: 'Mayor precio' },
];

const vacio: Estado = { tono: [], precio: [], talle: [], linea: [], orden: 'elenco', q: '' };

const leerUrl = (): Estado => {
  const u = new URLSearchParams(window.location.search);
  const lista = (k: string) => u.get(k)?.split(',').filter(Boolean) ?? [];
  return { tono: lista('tono'), precio: lista('precio'), talle: lista('talle'), linea: lista('linea'), orden: u.get('orden') ?? 'elenco', q: u.get('q') ?? '' };
};

const escribirUrl = (e: Estado) => {
  const u = new URLSearchParams();
  (['tono', 'precio', 'talle', 'linea'] as const).forEach((k) => e[k].length && u.set(k, e[k].join(',')));
  if (e.orden !== 'elenco') u.set('orden', e.orden);
  if (e.q) u.set('q', e.q);
  const qs = u.toString();
  window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
};

const coincideBusqueda = (p: Producto, q: string) => {
  const texto = textoBusqueda(p);
  return normalizar(q).split(/\s+/).filter(Boolean).every((t) => texto.includes(t));
};

type Clave = 'tono' | 'precio' | 'talle' | 'linea';
type OpcionProps = { e: Estado; alternar: (k: Clave, v: string) => void; k: Clave; v: string; children: React.ReactNode };

function Opcion({ e, alternar, k, v, children }: OpcionProps) {
  return (
    <button type="button" className="pildora" aria-pressed={e[k].includes(v)} onClick={() => alternar(k, v)}>
      {children}
    </button>
  );
}

type Props = { productos: Producto[]; nota?: string; busqueda?: boolean };

export default function CatalogBrowser({ productos, nota, busqueda = false }: Props) {
  const [e, setE] = useState<Estado>(vacio);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => setE(leerUrl()), []);
  useEffect(() => {
    document.body.classList.toggle('sin-scroll', abierto && window.innerWidth < 1024);
    return () => document.body.classList.remove('sin-scroll');
  }, [abierto]);

  const actualizar = (cambio: Partial<Estado>) => {
    const nuevo = { ...e, ...cambio };
    setE(nuevo);
    escribirUrl(nuevo);
  };
  const alternar = (k: 'tono' | 'precio' | 'talle' | 'linea', v: string) =>
    actualizar({ [k]: e[k].includes(v) ? e[k].filter((x) => x !== v) : [...e[k], v] });

  const tonos = TONOS.filter((t) => productos.some((p) => p.tono === t.id));
  const rangos = RANGOS.filter((r) => productos.some((p) => p.precio >= r.min && p.precio <= r.max));
  const lineas = LINEAS.filter((l) => productos.some((p) => p.lineas.includes(l.id)));
  const talles = [...new Set(productos.flatMap((p) => p.talles))].sort((a, b) => a - b);
  const hayRegulables = productos.some((p) => p.regulable);

  const resultado = useMemo(() => {
    const lista = productos.filter((p) => {
      if (e.q && !coincideBusqueda(p, e.q)) return false;
      if (e.tono.length && !e.tono.some((t) => tieneTono(p, t))) return false;
      if (e.linea.length && !e.linea.some((l) => p.lineas.includes(l))) return false;
      if (e.precio.length && !RANGOS.some((r) => e.precio.includes(r.id) && p.precio >= r.min && p.precio <= r.max)) return false;
      if (e.talle.length && !(e.talle.some((t) => p.talles.includes(Number(t))) || (e.talle.includes('regulable') && p.regulable))) return false;
      return true;
    });
    if (e.orden === 'menor') return [...lista].sort((a, b) => a.precio - b.precio);
    if (e.orden === 'mayor') return [...lista].sort((a, b) => b.precio - a.precio);
    return lista;
  }, [productos, e]);

  const activos = e.tono.length + e.precio.length + e.talle.length + e.linea.length;
  const limpiar = () => actualizar({ tono: [], precio: [], talle: [], linea: [] });
  const sinFiltros = activos === 0 && !e.q && e.orden === 'elenco';

  return (
    <div className="explorador">
      <div className="barra-filtros">
        <button type="button" className="pildora" onClick={() => setAbierto(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
          Filtrar{activos > 0 && ` (${activos})`}
        </button>
        {tonos.map((t) => (
          <Opcion e={e} alternar={alternar} key={t.id} k="tono" v={t.id}>
            <span className={`muestra muestra--${t.id}`} />
            {t.nombre}
          </Opcion>
        ))}
        {rangos.map((r) => (
          <Opcion e={e} alternar={alternar} key={r.id} k="precio" v={r.id}>{r.nombre}</Opcion>
        ))}
      </div>

      <div className={`velo velo--filtros ${abierto ? 'velo--abierto' : ''}`} onClick={() => setAbierto(false)} />
      <aside className={`filtros ${abierto ? 'filtros--abierto' : ''}`} aria-label="Filtros">
        <div className="filtros__cabeza">
          <h2>Filtrar</h2>
          <button type="button" className="icono-boton" aria-label="Cerrar filtros" onClick={() => setAbierto(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          {activos > 0 && <button type="button" className="enlace" style={{ textDecoration: 'underline' }} onClick={limpiar}>Limpiar</button>}
        </div>
        <div className="filtros__cuerpo">
          <fieldset className="filtro">
            <legend className="etiqueta">Tono</legend>
            <div className="filtro__opciones">
              {tonos.map((t) => (
                <Opcion e={e} alternar={alternar} key={t.id} k="tono" v={t.id}>
                  <span className={`muestra muestra--${t.id}`} />
                  {t.nombre}
                </Opcion>
              ))}
            </div>
          </fieldset>
          <fieldset className="filtro">
            <legend className="etiqueta">Precio</legend>
            <div className="filtro__opciones">
              {rangos.map((r) => (
                <Opcion e={e} alternar={alternar} key={r.id} k="precio" v={r.id}>{r.nombre}</Opcion>
              ))}
            </div>
          </fieldset>
          {(talles.length > 0 || hayRegulables) && (
            <fieldset className="filtro">
              <legend className="etiqueta">Talle</legend>
              <div className="filtro__opciones">
                {talles.map((t) => (
                  <Opcion e={e} alternar={alternar} key={t} k="talle" v={String(t)}>{t}</Opcion>
                ))}
                {hayRegulables && <Opcion e={e} alternar={alternar} k="talle" v="regulable">Regulable</Opcion>}
              </div>
            </fieldset>
          )}
          {lineas.length > 0 && (
            <fieldset className="filtro">
              <legend className="etiqueta">Línea</legend>
              <div className="filtro__opciones">
                {lineas.map((l) => (
                  <Opcion e={e} alternar={alternar} key={l.id} k="linea" v={l.id}>{l.nombre}</Opcion>
                ))}
              </div>
            </fieldset>
          )}
        </div>
        <div className="filtros__pie">
          <button type="button" className="boton boton--ancho" onClick={() => setAbierto(false)}>
            Ver {resultado.length} {resultado.length === 1 ? 'pieza' : 'piezas'}
          </button>
        </div>
      </aside>

      <div>
        <div className="resumen">
          <p className="resumen__cantidad" aria-live="polite">
            {resultado.length} {resultado.length === 1 ? 'pieza' : 'piezas'}
            {e.q && <> para “{e.q}”</>}
            {activos > 0 && (
              <>
                {' · '}
                <button type="button" style={{ textDecoration: 'underline', minHeight: '1.5rem' }} onClick={limpiar}>limpiar filtros</button>
              </>
            )}
          </p>
          <label className="orden">
            Ordenar
            <select value={e.orden} onChange={(ev) => actualizar({ orden: ev.target.value })}>
              {ORDENES.map((o) => (
                <option key={o.id} value={o.id}>{o.nombre}</option>
              ))}
            </select>
          </label>
        </div>

        {resultado.length === 0 ? (
          <div className="vacio">
            <h3>{busqueda && !activos ? 'Esa no está en el elenco.' : 'Ninguna pasó el casting.'}</h3>
            <p>{busqueda && !activos ? 'Probá con otra palabra, como “flor”, “corazón” o “argollas”.' : 'Sacá algún filtro y volvemos a probar.'}</p>
            {activos > 0 ? (
              <button type="button" className="boton boton--borde" onClick={limpiar}>Limpiar filtros</button>
            ) : (
              <a className="boton boton--borde" href="/tienda">Ver toda la tienda</a>
            )}
          </div>
        ) : (
          <ul className="grilla">
            {resultado.map((p, i) => (
              <React.Fragment key={p.id}>
                <li>
                  <ProductCard producto={p} prioridad={i < 2} ancho="(min-width: 1024px) 24vw, (min-width: 768px) 30vw, 48vw" />
                </li>
                {nota && sinFiltros && i === 4 && (
                  <li className="nota-grilla" aria-hidden="true">
                    <span className="etiqueta">Dijo Midam</span>
                    <p>{nota}</p>
                  </li>
                )}
              </React.Fragment>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

