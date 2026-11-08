import Image from "next/image";
import Link from "next/link";
import { Bike, Clock, MapPin, MessageCircle } from "lucide-react";
import { getSettings, listProducts, listZones } from "@/lib/catalog";
import { brl, formatPhone, whatsappLink } from "@/lib/format";
import { CartBar, ProductStepper } from "./product-controls";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, products, zones] = await Promise.all([getSettings(), listProducts(), listZones()]);
  const featured = products.find((p) => p.highlight) ?? null;
  const others = products.filter((p) => p !== featured);
  const freeZones = zones.filter((z) => z.feeCents === 0);

  return (
    <>
      <header className="hero">
        <div className="hero-top">
          <Image src="/img/mascote.png" alt="" width={72} height={72} className="hero-mascot" priority />
          <h1 className="brand">
            <span className="brand-a">Frango Assado</span>
            <span className="brand-b">do Pato Roco</span>
          </h1>
        </div>
        <div className="hero-row">
          <p className="slogan">Sabor que dá água na boca!</p>
          <Link href="/meus-pedidos" className="hero-link">
            Meus pedidos
          </Link>
        </div>
      </header>

      {!settings.storeOpen && (
        <div className="closed-banner" role="status">
          <Clock size={20} aria-hidden /> Estamos fechados agora. Você pode ver o cardápio, mas os pedidos voltam quando abrirmos.
        </div>
      )}
      {settings.notice && <div className="notice">{settings.notice}</div>}

      <main className="wrap">
        {featured && (
          <section className="promo" aria-labelledby="promo-nome">
            <div className="promo-photo">
              <Image
                src={featured.image || "/img/combo.webp"}
                alt={featured.name}
                fill
                sizes="(max-width: 760px) 100vw, 560px"
                priority
              />
              <span className="tag-promo">Promoção!</span>
            </div>
            <div className="promo-body">
              <h2 id="promo-nome">{featured.name}</h2>
              {featured.description && <p className="muted">{featured.description}</p>}
              <div className="price-row">
                <span className="price-apenas">Apenas</span>
                <span className="price-big">{brl(featured.priceCents)}</span>
              </div>
              <ProductStepper product={featured} storeOpen={settings.storeOpen} large />
              {featured.available !== null && featured.available > 0 && featured.available <= 5 && (
                <p className="scarce">Restam só {featured.available}. Não deixe para depois!</p>
              )}
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section aria-labelledby="cardapio-t">
            <h2 id="cardapio-t" className="section-title">
              Cardápio
            </h2>
            <ul className="menu">
              {others.map((p) => (
                <li key={p.id} className="menu-item">
                  <div>
                    <h3>{p.name}</h3>
                    {p.description && <p className="muted">{p.description}</p>}
                    <strong className="menu-price">{brl(p.priceCents)}</strong>
                  </div>
                  <ProductStepper product={p} storeOpen={settings.storeOpen} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {products.length === 0 && <p className="empty">O cardápio está sendo preparado. Volte em instantes!</p>}

        <section className="info-grid" aria-label="Entrega e contato">
          <div className="info-card info-red">
            <Bike size={26} aria-hidden />
            <div>
              {freeZones.length > 0 ? (
                <>
                  <strong>Entrega no {freeZones.map((z) => z.name).join(", ")} é grátis!</strong>
                  <span>Também dá para retirar no local.</span>
                </>
              ) : (
                <>
                  <strong>Entrega e retirada</strong>
                  <span>Veja os bairros atendidos ao finalizar.</span>
                </>
              )}
            </div>
          </div>
          <div className="info-card">
            <MapPin size={26} aria-hidden />
            <div>
              <strong>Onde estamos</strong>
              <span>{settings.address}</span>
            </div>
          </div>
          {settings.whatsapp && (
            <a className="info-card info-wa" href={whatsappLink(settings.whatsapp, "Olá! Vim pelo app do Pato Roco.")} target="_blank" rel="noreferrer">
              <MessageCircle size={26} aria-hidden />
              <div>
                <strong>{formatPhone(settings.whatsapp)}</strong>
                <span>Chame no WhatsApp</span>
              </div>
            </a>
          )}
        </section>

        <section className="grill">
          <Image src="/img/churrasqueira.webp" alt="Frangos assando no tambor, com a fumaça subindo" width={800} height={638} sizes="(max-width: 760px) 100vw, 480px" />
          <p>
            Assado no tambor,
            <br />
            <span>do jeito que tem que ser.</span>
          </p>
        </section>
      </main>

      <footer className="foot">Frango Assado do Pato Roco · {settings.address}</footer>
      <CartBar />
    </>
  );
}
