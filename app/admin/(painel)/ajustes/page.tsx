import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { getSettings, listZones } from "@/lib/catalog";
import { saveSettingsAction, saveZoneAction, setStoreOpenAction } from "../../actions";

export const metadata: Metadata = { title: "Ajustes" };

const toInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export default async function AjustesPage() {
  const [settings, zones] = await Promise.all([getSettings(), listZones(true)]);
  return (
    <>
      <div className="page-head">
        <h1>Ajustes</h1>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Loja {settings.storeOpen ? "aberta" : "fechada"}</h2>
            <p className="muted">{settings.storeOpen ? "Clientes podem fazer pedidos agora." : "O cardápio aparece, mas ninguém consegue pedir."}</p>
          </div>
          <ActionForm action={setStoreOpenAction}>
            <input type="hidden" name="open" value={settings.storeOpen ? "0" : "1"} />
            <button className={settings.storeOpen ? "btn" : "btn btn-ok"}>{settings.storeOpen ? "Fechar a loja" : "Abrir a loja"}</button>
          </ActionForm>
        </div>
      </section>

      <section className="card">
        <h2>Dados da loja</h2>
        <ActionForm action={saveSettingsAction} className="grid-form">
          <label className="field">
            WhatsApp (com DDD)
            <input name="whatsapp" defaultValue={settings.whatsapp} inputMode="tel" required />
          </label>
          <label className="field">
            Chave Pix
            <input name="pixKey" defaultValue={settings.pixKey} placeholder="Aparece para quem escolher Pix" maxLength={120} />
          </label>
          <label className="field field-wide">
            Endereço de retirada
            <input name="address" defaultValue={settings.address} required maxLength={160} />
          </label>
          <label className="field field-wide">
            Aviso no topo da loja
            <input name="notice" defaultValue={settings.notice} placeholder="Ex.: Hoje só até as 14h" maxLength={160} />
          </label>
          <button className="btn btn-primary">Salvar</button>
        </ActionForm>
      </section>

      <section className="card">
        <h2>Bairros de entrega</h2>
        <p className="muted">O cliente só consegue pedir entrega nos bairros ativos desta lista. Taxa zero aparece como entrega grátis.</p>
        <div className="zones">
          {zones.map((z) => (
            <ActionForm key={z.id} action={saveZoneAction} className="row-form">
              <input type="hidden" name="id" value={z.id} />
              <input name="name" defaultValue={z.name} required aria-label="Nome do bairro" />
              <input name="fee" defaultValue={toInput(z.feeCents)} inputMode="decimal" aria-label={`Taxa de ${z.name}`} className="input-qty" />
              <label className="check">
                <input type="checkbox" name="active" defaultChecked={z.active} /> Ativo
              </label>
              <button className="btn">Salvar</button>
            </ActionForm>
          ))}
          <ActionForm action={saveZoneAction} className="row-form" resetOnSuccess>
            <input name="name" required placeholder="Novo bairro" aria-label="Nome do novo bairro" />
            <input name="fee" inputMode="decimal" placeholder="Taxa" aria-label="Taxa de entrega do novo bairro" className="input-qty" />
            <button className="btn btn-primary">Adicionar</button>
          </ActionForm>
        </div>
      </section>
    </>
  );
}
