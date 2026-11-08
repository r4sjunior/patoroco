# Frango Assado do Pato Roco

App de pedidos, vendas, estoque e caixa. São dois sistemas separados no mesmo projeto:

| | Endereço | Quem usa | Acesso |
|---|---|---|---|
| **Loja** | `/` | Cliente | Livre, sem cadastro |
| **Gestão** | `/admin` | Administração | Senha (`ADMIN_PASSWORD`) |

A loja não tem nenhum link para a gestão. Cada um tem seu visual, seu ícone e pode ser instalado no celular como um app próprio.

## Rodar no computador

```bash
npm install
cp .env.example .env.local   # preencha ADMIN_PASSWORD e AUTH_SECRET
npm run dev
```

Sem `DATABASE_URL`, o app cria sozinho um banco local em `.data/`. Para recomeçar do zero, apague essa pasta.

## Publicar na Vercel

1. Suba o repositório no GitHub e importe na Vercel.
2. Conecte um banco Neon ao projeto (aba Storage). Ele cria a `DATABASE_URL`.
3. Crie as variáveis `ADMIN_PASSWORD` e `AUTH_SECRET` (instruções em `.env.example`).
4. Faça o deploy. As tabelas e os dados iniciais são criados no primeiro acesso.

## Como funciona

- **Pedido do cliente:** escolhe, informa os dados e acompanha o status em um link próprio. O estoque é reservado ao enviar.
- **Pedidos (admin):** Novo → Em preparo → Pronto/Na rua → Concluído. A tela toca um alerta quando chega pedido novo, com a aba aberta.
- **Balcão:** venda direta, entra na hora no caixa e baixa o estoque.
- **Estoque:** cada produto diz o que consome (1 combo = 1 frango + 1 macaxeira + 1 farofa). A loja mostra "Esgotado" sozinha.
- **Caixa:** abertura, vendas, despesas, sangrias e fechamento comparando o esperado com o contado. Só dinheiro conta para a gaveta. Pix e cartão aparecem à parte.
- **Vendas:** faturamento por período, produto, forma de pagamento e canal, com exportação para planilha.

A venda só entra no caixa quando o pedido é concluído, por isso concluir exige caixa aberto. Cancelar devolve o estoque e, se já tinha sido recebido, lança o estorno.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe em modo de desenvolvimento |
| `npm test` | Testa as regras de pedido, estoque, caixa e sessão |
| `npm run typecheck` | Confere os tipos |
| `npm run build` | Gera a versão de produção |
| `npm run brand` | Refaz as imagens a partir do panfleto |

## Onde mexer

- `lib/`: regras de negócio e banco. Sem dependência de tela.
- `lib/schema.ts`: tabelas e dados iniciais. Para mudar o banco, acrescente uma nova migração no fim da lista.
- `app/(loja)/`: sistema do cliente.
- `app/admin/`: sistema do admin.
