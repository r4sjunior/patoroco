process.env.PGLITE_DIR = "memory://";
process.env.ADMIN_PASSWORD = "senha-de-teste";
process.env.AUTH_SECRET = "segredo-de-teste";

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { addManualEntry, closeCash, getOpenSession, listClosedSessions, listEntries, openCash, summarize } from "../lib/cash";
import { listProducts, rateLimit, saveProduct, saveZone, listZones, setStoreOpen } from "../lib/catalog";
import { query } from "../lib/db";
import { localDay, parseMoney, parseQty, UserError } from "../lib/format";
import { advanceOrder, cancelOrder, counterSale, getOrderByToken, placeOnlineOrder, type OnlineOrderInput } from "../lib/orders";
import { salesReport } from "../lib/reports";
import { changeAdminPassword, checkAdminPassword, passwordVersion } from "../lib/password";
import { createSessionToken, passwordMatches, readSessionToken, verifySessionToken } from "../lib/session";
import { listStock, moveStock } from "../lib/stock";

const pedido = (extra: Partial<OnlineOrderInput> = {}): OnlineOrderInput => ({
  name: "Cliente Teste",
  phone: "(84) 99999-1111",
  fulfillment: "entrega",
  zoneId: 1,
  address: "Rua das Flores, 10",
  reference: "",
  payment: "pix",
  changeForCents: null,
  notes: "",
  items: [{ productId: 1, quantity: 1 }],
  ...extra,
});

async function saldoFrango() {
  return (await listStock()).find((s) => s.name === "Frango assado")!.quantity;
}

before(async () => {
  await listProducts(); // aplica as migrações
});

test("dados do panfleto entram na carga inicial", async () => {
  const [combo] = await listProducts();
  assert.equal(combo.priceCents, 3000);
  assert.equal(combo.available, 20);
  const [zona] = await listZones();
  assert.equal(zona.name, "Vila Maria");
  assert.equal(zona.feeCents, 0);
});

test("preço vem do banco e a entrega no Vila Maria é grátis", async () => {
  const { token } = await placeOnlineOrder({ ...pedido({ items: [{ productId: 1, quantity: 2 }] }), totalCents: 1, priceCents: 1 });
  const o = (await getOrderByToken(token))!;
  assert.equal(o.totalCents, 6000);
  assert.equal(o.deliveryFeeCents, 0);
  assert.equal(o.customerPhone, "84999991111");
  await cancelOrder(o.id, "limpeza");
});

test("taxa do bairro é somada no servidor", async () => {
  await saveZone({ name: "Centro", feeCents: 500, active: true });
  const centro = (await listZones()).find((z) => z.name === "Centro")!;
  const { token } = await placeOnlineOrder(pedido({ zoneId: centro.id }));
  const o = (await getOrderByToken(token))!;
  assert.equal(o.totalCents, 3500);
  await cancelOrder(o.id, "limpeza");
});

test("recusa dados inválidos, troco menor que o total e loja fechada", async () => {
  await assert.rejects(placeOnlineOrder(pedido({ phone: "123" })), UserError);
  await assert.rejects(placeOnlineOrder(pedido({ address: "" })), UserError);
  await assert.rejects(placeOnlineOrder(pedido({ zoneId: null })), UserError);
  await assert.rejects(placeOnlineOrder(pedido({ items: [] })), UserError);
  await assert.rejects(placeOnlineOrder(pedido({ items: [{ productId: 999, quantity: 1 }] })), UserError);
  await assert.rejects(placeOnlineOrder(pedido({ payment: "dinheiro", changeForCents: 2000 })), UserError);
  await setStoreOpen(false);
  await assert.rejects(placeOnlineOrder(pedido()), /fechada/);
  await setStoreOpen(true);
});

test("pedido baixa o estoque e o cancelamento devolve", async () => {
  const antes = await saldoFrango();
  const { id } = await placeOnlineOrder(pedido({ items: [{ productId: 1, quantity: 3 }] }));
  assert.equal(await saldoFrango(), antes - 3);
  await cancelOrder(id, "cliente desistiu");
  assert.equal(await saldoFrango(), antes);
  await assert.rejects(cancelOrder(id, "de novo"), /já foi cancelado/);
  assert.equal(await saldoFrango(), antes, "cancelar duas vezes não pode devolver duas vezes");
});

test("pedidos simultâneos nunca vendem além do estoque", async () => {
  const frango = (await listStock()).find((s) => s.name === "Frango assado")!;
  await moveStock(frango.id, "ajuste", 3, "teste");
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => placeOnlineOrder(pedido())));
  const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ id: number }>[];
  assert.equal(ok.length, 3);
  assert.equal(await saldoFrango(), 0);
  assert.equal((await listProducts())[0].available, 0);
  for (const r of ok) await cancelOrder(r.value.id, "limpeza");
  assert.equal(await saldoFrango(), 3);
  await moveStock(frango.id, "ajuste", 20, "teste");
});

test("cancelamento devolve o que foi baixado mesmo se a receita mudou depois", async () => {
  const [combo] = await listProducts();
  const antes = await saldoFrango();
  const { id } = await placeOnlineOrder(pedido());
  await saveProduct({ ...combo, recipe: combo.recipe.map((r) => ({ ...r, quantity: 2 })) });
  await cancelOrder(id, "limpeza");
  assert.equal(await saldoFrango(), antes);
  await saveProduct(combo);
});

test("não dá para concluir pedido com caixa fechado nem pular etapa", async () => {
  const { id } = await placeOnlineOrder(pedido());
  await assert.rejects(advanceOrder(id, "preparando"), /já foi atualizado/);
  await advanceOrder(id, "novo");
  await advanceOrder(id, "preparando");
  await assert.rejects(advanceOrder(id, "pronto"), /caixa está fechado/);
  await cancelOrder(id, "limpeza");
});

test("fluxo completo do caixa: abertura, vendas, sangria, estorno e fechamento", async () => {
  await openCash(5000);
  await assert.rejects(openCash(100), /já está aberto/);

  // Pedido online pago em dinheiro (cliente tinha escolhido Pix na hora de pedir)
  const { id, token } = await placeOnlineOrder(pedido());
  await advanceOrder(id, "novo");
  await advanceOrder(id, "preparando");
  await advanceOrder(id, "pronto", "dinheiro");
  assert.equal((await getOrderByToken(token))!.status, "concluido");
  await assert.rejects(advanceOrder(id, "concluido"), /já foi encerrado/);
  await assert.rejects(advanceOrder(id, "pronto"), /já foi atualizado/);

  // Balcão no cartão, com desconto: não entra na gaveta
  const estoqueAntes = await saldoFrango();
  await counterSale({ lines: [{ productId: 1, quantity: 1 }], payment: "cartao", discountCents: 500, customerName: "" });
  assert.equal(await saldoFrango(), estoqueAntes - 1);
  // Balcão em dinheiro que depois é estornado
  const balcao = await counterSale({ lines: [{ productId: 1, quantity: 1 }], payment: "dinheiro", discountCents: 0, customerName: "" });
  await cancelOrder(balcao.id, "erro de lançamento");
  assert.equal(await saldoFrango(), estoqueAntes - 1);

  await addManualEntry("sangria", 1000, "banco");
  await addManualEntry("despesa", 700, "carvão");
  await addManualEntry("suprimento", 200, "troco");

  const session = (await getOpenSession())!;
  const s = summarize(session.openingCents, await listEntries(session.id));
  assert.equal(s.salesCash, 6000);
  assert.equal(s.salesCard, 2500);
  assert.equal(s.refunds, -3000);
  assert.equal(s.salesTotal, 5500);
  // 50 abertura + 30 + 30 - 30 estorno - 10 sangria - 7 despesa + 2 suprimento = 65
  assert.equal(s.expectedDrawer, 6500);

  // Relatório de hoje ignora o pedido cancelado
  const dia = localDay();
  const r = await salesReport(dia, dia);
  assert.equal(r.orders, 2);
  assert.equal(r.totalCents, 5500);
  assert.equal(r.units, 2);
  assert.equal(r.daily.length, 1);
  assert.equal(r.daily[0].day, dia);

  await closeCash(6400, "faltou 1 real");
  assert.equal(await getOpenSession(), null);
  const [fechado] = await listClosedSessions();
  assert.equal(fechado.expectedCents, 6500);
  assert.equal(fechado.countedCents, 6400);
  await assert.rejects(counterSale({ lines: [{ productId: 1, quantity: 1 }], payment: "pix", discountCents: 0, customerName: "" }), /caixa está fechado/);
});

test("saída manual não deixa o estoque negativo", async () => {
  const frango = (await listStock()).find((s) => s.name === "Frango assado")!;
  await assert.rejects(moveStock(frango.id, "saida", 99999, ""), /maior que o saldo/);
  await moveStock(frango.id, "entrada", 0.5, "meio");
  assert.equal(await saldoFrango(), frango.quantity + 0.5);
  await moveStock(frango.id, "saida", 0.5, "volta");
});

test("limite de tentativas", async () => {
  for (let i = 0; i < 3; i++) assert.equal(await rateLimit("t", 3, 60), true);
  assert.equal(await rateLimit("t", 3, 60), false);
  await query(`UPDATE rate_limits SET window_start = now() - interval '2 minutes' WHERE key = 't'`);
  assert.equal(await rateLimit("t", 3, 60), true);
});

test("sessão do admin: assinatura, validade e troca de senha", () => {
  assert.equal(passwordMatches("senha-de-teste"), true);
  assert.equal(passwordMatches("errada"), false);
  const token = createSessionToken();
  assert.equal(verifySessionToken(token), true);
  assert.equal(verifySessionToken(undefined), false);
  assert.equal(verifySessionToken("9999999999.falsa"), false);
  assert.equal(verifySessionToken(token, Date.now() + 15 * 86_400_000), false);
  process.env.ADMIN_PASSWORD = "outra";
  assert.equal(verifySessionToken(token), false);
  process.env.ADMIN_PASSWORD = "senha-de-teste";
});

test("troca de senha do admin", async () => {
  const antiga = "senha-de-teste";
  const nova = "senha-nova-123";
  assert.equal(await passwordVersion(), 0);
  const sessaoAntiga = readSessionToken(createSessionToken(0));
  assert.equal(sessaoAntiga?.version, 0);

  await assert.rejects(changeAdminPassword("errada", nova, nova), /atual está incorreta/);
  await assert.rejects(changeAdminPassword(antiga, "curta", "curta"), /pelo menos 8/);
  await assert.rejects(changeAdminPassword(antiga, nova, "diferente"), /confirmação/);
  await assert.rejects(changeAdminPassword(antiga, antiga, antiga), /diferente da atual/);
  assert.equal(await passwordVersion(), 0, "tentativas recusadas não mudam nada");
  assert.equal(await checkAdminPassword(antiga), true);

  const versao = await changeAdminPassword(antiga, nova, nova);
  assert.equal(versao, 1);
  assert.equal(await checkAdminPassword(nova), true);
  assert.equal(await checkAdminPassword(antiga), false, "a senha antiga da variável deixa de valer");
  assert.notEqual(sessaoAntiga?.version, await passwordVersion(), "sessão antiga fica inválida");
  assert.equal(readSessionToken(createSessionToken(versao))?.version, versao);

  const [{ hash }] = await query<{ hash: string }>(`SELECT admin_password_hash AS hash FROM settings`);
  assert.ok(hash.startsWith("scrypt$") && !hash.includes(nova), "guarda só o hash");

  // Recuperação documentada no README: limpar o hash volta para a variável
  await query(`UPDATE settings SET admin_password_hash = NULL`);
  assert.equal(await checkAdminPassword(antiga), true);
});

test("conversão de valores digitados", () => {
  assert.equal(parseMoney("30"), 3000);
  assert.equal(parseMoney("30,5"), 3050);
  assert.equal(parseMoney("1.234,50"), 123450);
  assert.equal(parseMoney("R$ 12,99"), 1299);
  assert.throws(() => parseMoney("abc"), UserError);
  assert.throws(() => parseMoney("-5"), UserError);
  assert.equal(parseQty("0,5"), 0.5);
  assert.throws(() => parseQty("-1"), UserError);
});
