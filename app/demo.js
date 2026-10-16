// Produtos de mentira, só para testar a máquina antes de ter a chave da Shopee.
function produtos(palavra) {
  const base = [
    ['Cortina de LED Cascata 3m Luz Quente', 49.9, 0.1, 12000, 4.8, 35],
    ['Kit 30 Bolas de Natal Vermelho e Dourado', 39.9, 0.08, 8500, 4.7, 20],
    ['Guirlanda de Natal Porta 40cm', 59.9, 0.12, 3100, 4.6, 15],
    ['Pisca-Pisca 100 LEDs Fio Fada', 19.9, 0.07, 25000, 4.9, 40],
    ['Toalha de Mesa Natalina Bordada', 69.9, 0.09, 900, 4.5, 10],
    ['Árvore de Natal 1,50m Pinheiro Cheio', 189.9, 0.06, 2200, 4.4, 25],
  ];
  return base.map(([nome, preco, com, vendas, estrelas, desc], i) => ({
    itemId: `TESTE-${i}`,
    productName: `${nome} (TESTE)`,
    commissionRate: String(com),
    commission: (preco * com).toFixed(2),
    price: String(preco),
    priceMin: String(preco),
    sales: vendas,
    ratingStar: String(estrelas),
    priceDiscountRate: desc,
    imageUrl: '',
    shopName: 'Loja Teste',
    productLink: 'https://shopee.com.br/produto-teste',
    offerLink: 'https://s.shopee.com.br/TESTE',
  }));
}

module.exports = { produtos };
